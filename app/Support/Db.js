// Transaction helpers on top of LaraNode's own mechanism. `DB.transaction()` binds the transaction
// connection to the current HttpContext and every Loquent model / DB.table() query inside picks
// it up automatically. These helpers only add what the facade lacks:
//   • transaction()  — also works outside HTTP (seeders, commands, jobs), where there is no context
//   • independent()  — its own connection + transaction, commits even if the caller rolls back
//   • outside()      — run on the pool, ignoring the caller's transaction (audit / security logs)
//
// Row locks: the query builder has no lockForUpdate(), so a critical section starts with a
// conditional update() on the row (e.g. Order.where('id', id).update({ updated_at })). InnoDB holds
// that exclusive row lock until commit, which serialises concurrent writers exactly like FOR UPDATE.
//
// Query-builder rules (vendor behaviour): never pass a possibly-null value to where() — use
// whereNull(); never call whereIn() with an empty list; JSON columns written through the builder
// need toJson() (models with a `json` cast do it themselves); update()/delete() always need a where.
const DB = use('laranode/Support/Facades/DB');
const HttpContext = use('laranode/Foundation/Http/HttpContext');

const manager = () => DB.getFacadeRoot();

/** The pooled connector (never a transaction). */
function pool() {
    const mgr = manager();
    const name = mgr.getDefaultConnection();
    if (!mgr.connections[name]) mgr.connections[name] = mgr.makeConnection(name);
    return mgr.connections[name];
}

/** DB.transaction that also propagates to models outside an HTTP request. */
function transaction(fn) {
    return HttpContext.get() ? DB.transaction(fn) : HttpContext.run({}, () => DB.transaction(fn));
}

/** Separate connection + transaction; models inside use it. Commits independently of the caller. */
async function independent(fn) {
    const name = manager().getDefaultConnection();
    const t = await pool().beginTransaction();
    try {
        const out = await HttpContext.run({ ...(HttpContext.get() || {}), transactions: { [name]: t } }, () => fn());
        await t.commit();
        return out;
    } catch (e) { await t.rollBack(); throw e; }
}

/** Run fn on the pool, outside any active transaction. */
function outside(fn) {
    return HttpContext.run({ ...(HttpContext.get() || {}), transactions: {} }, fn);
}

/** Safe integer for limits / pagination input. */
const int = (v, def = 0, max = 10000) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : def; };

/** JSON column → object (mysql2 usually decodes already). */
const json = (v, def = null) => { if (v === null || v === undefined) return def; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return def; } } return v; };

/** Value for a JSON column written through the query builder (models with a json cast do it themselves). */
const toJson = (v) => (v === null || v === undefined ? null : JSON.stringify(v));

/** LIKE %term% with the user's wildcards escaped. */
const like = (term) => `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** DB.table(table).insert() in chunks (large seat maps); returns rows inserted. */
async function insertMany(table, rows, size = 500) {
    let n = 0;
    for (let i = 0; i < rows.length; i += size) n += (await DB.table(table).insert(rows.slice(i, i + size))).changes || 0;
    return n;
}

module.exports = { DB, transaction, independent, outside, pool, int, json, toJson, like, insertMany };

