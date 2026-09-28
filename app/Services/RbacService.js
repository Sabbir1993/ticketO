// Role-based access control. A user holds roles; a role holds permissions.
// CMS users get platform (scope=cms) roles; merchant staff get merchant roles scoped to their merchant.
const Db = use('App/Support/Db');
const DB = use('laranode/Support/Facades/DB');
const Role = use('App/Models/Role');
const Permission = use('App/Models/Permission');
const UserRole = use('App/Models/UserRole');
const { bad, forbid, missing } = use('App/Support/HttpError');

const TTL_MS = 30000;
const cache = new Map(); // userId → { at, roles, permissions:Set }

const RbacService = {
    invalidate(userId = null) { if (userId) cache.delete(Number(userId)); else cache.clear(); },

    /** @returns {Promise<{ roles: string[], permissions: Set<string> }>} */
    async forUser(user) {
        if (!user || user.type === 'customer') return { roles: [], permissions: new Set() };
        const hit = cache.get(user.id);
        if (hit && Date.now() - hit.at < TTL_MS) return hit;
        const now = new Date();
        const q = DB.table('user_roles as ur')
            .join('roles as r', 'r.id', '=', 'ur.role_id')
            .leftJoin('role_permissions as rp', 'rp.role_id', '=', 'r.id')
            .leftJoin('permissions as p', 'p.id', '=', 'rp.permission_id')
            .select('r.slug as role', 'p.slug as permission')
            .where('ur.user_id', user.id).whereNull('r.deleted_at')
            .whereRaw('(ur.expires_at IS NULL OR ur.expires_at > ?)', [now]);
        // CMS roles are platform-wide; merchant roles only count for the user's own merchant.
        if (user.type === 'cms') q.where('r.scope', 'cms');
        else q.where('r.scope', 'merchant').where('ur.merchant_id', user.merchant_id || 0);
        const rows = await q.get();
        const out = { at: Date.now(), roles: [...new Set(rows.map((r) => r.role))], permissions: new Set(rows.map((r) => r.permission).filter(Boolean)) };
        cache.set(user.id, out);
        return out;
    },

    can(ctx, permission) { return !!ctx?.permissions?.has(permission); },

    // ------------------------------------------------------------------ management (CMS)
    async listRoles(scope = 'cms', merchantId = null) {
        const q = Role.select('id', 'scope', 'slug', 'name', 'description', 'is_system', 'merchant_id').where('scope', scope);
        if (merchantId) q.where('merchant_id', merchantId); else q.whereNull('merchant_id');
        const roles = await q.orderBy('is_system', 'desc').orderBy('name').get();
        if (!roles.length) return [];
        const ids = roles.map((r) => r.id);
        const count = async (table) => new Map((await DB.table(table).select('role_id').selectRaw('COUNT(*) as n').whereIn('role_id', ids).groupBy('role_id').get())
            .map((r) => [r.role_id, Number(r.n)]));
        const [users, perms] = await Promise.all([count('user_roles'), count('role_permissions')]);
        return roles.map((r) => ({ ...r.toArray(), is_system: !!r.is_system, users: users.get(r.id) || 0, permissions: perms.get(r.id) || 0 }));
    },

    async permissionCatalogue(scope = 'cms') {
        return Permission.select('id', 'slug', 'group_name', 'name', 'description').where('scope', scope)
            .orderBy('group_name').orderBy('sort_order').orderBy('slug').get();
    },

    async roleWithPermissions(roleId) {
        const role = await Role.with('permissions').where('id', roleId).first() || missing('Role not found');
        return { ...role.toArray(), is_system: !!role.is_system, permissions: role.permissions.map((p) => p.slug) };
    },

    /** Create or update a role and replace its permission set. Guards against escalation. */
    async saveRole(ctx, { id, scope = 'cms', slug, name, description, permissions = [] }, merchantId = null) {
        if (!name || String(name).trim().length < 3) bad('Role name must be at least 3 characters');
        const catalogue = await RbacService.permissionCatalogue(scope);
        const valid = new Set(catalogue.map((p) => p.slug));
        const wanted = [...new Set(permissions)].filter((p) => valid.has(p));
        // You cannot grant what you do not hold (prevents privilege escalation).
        const notHeld = wanted.filter((p) => !ctx.permissions.has(p) && !ctx.isSuperAdmin);
        if (notHeld.length) forbid(`You cannot grant permissions you do not hold: ${notHeld.slice(0, 5).join(', ')}`, 'escalation');

        return Db.transaction(async () => {
            let roleId = id;
            const before = id ? await RbacService.roleWithPermissions(id) : null;
            if (before?.is_system && before.slug === 'super-admin') bad('The Super Admin role cannot be edited');
            if (id) {
                if ((before.merchant_id || null) !== (merchantId || null)) forbid();
                await Role.where('id', id).update({ name: String(name).trim(), description: description || null, updated_at: new Date() });
            } else {
                const s = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
                const dup = Role.where('scope', scope).where('slug', s);
                if (merchantId) dup.where('merchant_id', merchantId); else dup.whereNull('merchant_id');
                if (await dup.exists()) bad('A role with this name already exists');
                roleId = (await Role.create({ scope, slug: s, name: String(name).trim(), description: description || null, is_system: 0, merchant_id: merchantId, created_by: ctx.user?.id || null })).id;
            }
            const role = await Role.find(roleId);
            await role.permissions().sync(catalogue.filter((p) => wanted.includes(p.slug)).map((p) => p.id));
            RbacService.invalidate();
            return { roleId, before, after: { name, description, permissions: wanted } };
        });
    },

    async deleteRole(roleId, merchantId = null) {
        const role = await RbacService.roleWithPermissions(roleId);
        if (role.is_system) bad('System roles cannot be deleted');
        if ((role.merchant_id || null) !== (merchantId || null)) forbid();
        if (await UserRole.where('role_id', roleId).exists()) bad('Remove this role from all users before deleting it');
        await (await Role.find(roleId)).delete(); // soft delete
        RbacService.invalidate();
        return role;
    },

    /** Replace a user's roles. Prevents removing the last Super Admin or your own role management. */
    async setUserRoles(ctx, userId, roleIds, { scope = 'cms', merchantId = null } = {}) {
        const roles = roleIds.length ? await Role.select('id', 'slug', 'merchant_id').whereIn('id', roleIds).where('scope', scope).get() : [];
        if (roles.length !== new Set(roleIds).size) bad('Unknown role');
        if (roles.some((r) => (r.merchant_id || null) !== null && r.merchant_id !== merchantId)) forbid();
        const superAdmin = await Role.select('id').where('scope', 'cms').where('slug', 'super-admin').first();
        if (superAdmin && scope === 'cms') {
            const granting = roles.some((r) => r.id === superAdmin.id);
            if (granting && !ctx.isSuperAdmin) forbid('Only a Super Admin can grant Super Admin', 'escalation');
            const had = await UserRole.where('user_id', userId).where('role_id', superAdmin.id).exists();
            if (had && !granting) {
                const others = await DB.table('user_roles as ur').join('users as u', 'u.id', '=', 'ur.user_id')
                    .where('ur.role_id', superAdmin.id).where('ur.user_id', '!=', userId).where('u.status', 'active').whereNull('u.deleted_at').count();
                if (!Number(others)) bad('At least one active Super Admin must remain');
            }
        }
        if (Number(userId) === Number(ctx.user?.id) && scope === 'cms' && !ctx.isSuperAdmin) forbid('You cannot change your own roles');

        await Db.transaction(async () => {
            const current = UserRole.where('user_id', userId);
            if (merchantId) current.where('merchant_id', merchantId); else current.whereNull('merchant_id');
            await current.delete();
            for (const r of roles) await UserRole.create({ user_id: userId, role_id: r.id, merchant_id: merchantId, granted_by: ctx.user?.id || null, granted_at: new Date() });
        });
        RbacService.invalidate(userId);
        return roles.map((r) => r.slug);
    },
};

module.exports = RbacService;
