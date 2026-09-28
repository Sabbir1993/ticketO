// Raw-SQL migration helpers. The framework Blueprint lacks composite indexes, VARBINARY, CHAR,
// DATETIME(3) and table options, so Ticketo migrations declare tables in plain MySQL DDL.
const DB = use('laranode/Support/Facades/DB');

const OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

// Common column snippets
const col = {
    id: 'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY',
    uuid: 'uuid CHAR(36) NOT NULL',
    timestamps: ['created_at DATETIME(3) NULL', 'updated_at DATETIME(3) NULL'],
    softDeletes: 'deleted_at DATETIME(3) NULL',
    fk: (name, nullable = false) => `${name} BIGINT UNSIGNED ${nullable ? 'NULL' : 'NOT NULL'}`,
    money: (name, nullable = false) => `${name} DECIMAL(12,2) ${nullable ? 'NULL' : 'NOT NULL DEFAULT 0.00'}`,
    bool: (name, def = 0) => `${name} TINYINT(1) NOT NULL DEFAULT ${def ? 1 : 0}`,
    ip: (name) => `${name} VARBINARY(16) NULL`,
    sort: 'sort_order INT NOT NULL DEFAULT 0',
    active: 'is_active TINYINT(1) NOT NULL DEFAULT 1',
    by: (name) => `${name} BIGINT UNSIGNED NULL`,
};

/**
 * @param {string} table
 * @param {Array<string|string[]>} defs column / index / constraint definitions (arrays are flattened)
 * @param {string} [extra] trailing table options such as PARTITION BY
 */
async function create(table, defs, extra = '') {
    const body = defs.flat().filter(Boolean).map((d) => (typeof d === 'function' ? d(table) : d)).join(',\n  ');
    await DB.statement(`CREATE TABLE IF NOT EXISTS \`${table}\` (\n  ${body}\n) ${OPTIONS} ${extra}`.trim());
}

async function drop(...tables) {
    await DB.statement('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of tables) await DB.statement(`DROP TABLE IF EXISTS \`${t}\``);
    await DB.statement('SET FOREIGN_KEY_CHECKS = 1');
}

// Deterministic constraint names: fk_<table>_<column> (MySQL limit 64 chars)
const fk = (column, refTable, onDelete = 'RESTRICT', refColumn = 'id') => (table) =>
    `CONSTRAINT \`${`fk_${table}_${column}`.slice(0, 64)}\` FOREIGN KEY (${column}) REFERENCES \`${refTable}\` (${refColumn}) ON DELETE ${onDelete}`;
const unique = (name, ...cols) => `UNIQUE KEY ${name} (${cols.join(', ')})`;
const index = (name, ...cols) => `KEY ${name} (${cols.join(', ')})`;

/** Try a statement that may need extra privileges (triggers); warn instead of failing. */
async function optional(sql, warning) {
    try { await DB.statement(sql); } catch (e) { console.warn(`\x1b[33m[migration] ${warning}: ${String(e.message).split('\n')[0]}\x1b[0m`); }
}

module.exports = { create, drop, fk, unique, index, optional, col, DB };
