// CMS → Staff users and Roles & permissions.
//   · Users are invited, never given a password by an admin: the invite creates the account without a
//     password and returns a one-time set-password link (72 h). Only its keyed hash is stored
//     (password_resets.token_hash); the raw link is shown once to the inviting admin.
//   · Roles are sets of permissions (RbacService). Nobody can grant a role or permission they do not hold;
//     at least one active Super Admin always remains; every change is audited and signs the user out
//     where their access shrank.
const bcrypt = require('bcryptjs');
const DB = use('laranode/Support/Facades/DB');
const Db = use('App/Support/Db');
const User = use('App/Models/User');
const Role = use('App/Models/Role');
const UserRole = use('App/Models/UserRole');
const MfaFactor = use('App/Models/MfaFactor');
const PasswordReset = use('App/Models/PasswordReset');
const Hasher = use('App/Security/Hasher');
const IpResolver = use('App/Security/IpResolver');
const RbacService = use('App/Services/RbacService');
const SessionService = use('App/Services/SessionService');
const AuditService = use('App/Services/AuditService');
const SecurityEventService = use('App/Services/SecurityEventService');
const Access = use('App/Support/Access');
const { uuid } = use('App/Support/Ids');
const { bad, forbid, missing } = use('App/Support/HttpError');

const LINK_HOURS = 72;
const STATUSES = ['active', 'suspended'];
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const ids = (v) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];

async function cmsUser(id) {
    return await User.select('id', 'uuid', 'name', 'email', 'status', 'mfa_enabled', 'password_hash').where('uuid', String(id || '')).where('type', 'cms').first() || missing('User not found');
}

async function superAdminRoleId() { return (await Role.select('id').where('scope', 'cms').where('slug', 'super-admin').whereNull('merchant_id').first())?.id || null; }

async function activeSuperAdmins(exceptUserId = null) {
    const rid = await superAdminRoleId();
    if (!rid) return 0;
    const q = DB.table('user_roles as ur').join('users as u', 'u.id', '=', 'ur.user_id').where('ur.role_id', rid).where('u.status', 'active').whereNull('u.deleted_at');
    if (exceptUserId) q.where('u.id', '!=', exceptUserId);
    return Number(await q.count());
}

/** Roles may only be granted by someone who holds every permission in them (or a Super Admin). */
async function assertCanGrant(ctx, roleIds) {
    if (ctx.isSuperAdmin || !roleIds.length) return;
    const rows = await DB.table('role_permissions as rp').join('permissions as p', 'p.id', '=', 'rp.permission_id').select('p.slug').whereIn('rp.role_id', roleIds).get();
    const missingPerms = [...new Set(rows.map((r) => r.slug))].filter((p) => !ctx.permissions.has(p));
    if (missingPerms.length) forbid(`You cannot grant a role with permissions you do not hold: ${missingPerms.slice(0, 5).join(', ')}`, 'escalation');
}

/** New one-time set-password link; earlier unused links for this user stop working. */
async function issueLink(ctx, userId) {
    const token = Hasher.token(32);
    const now = new Date();
    await PasswordReset.where('user_id', userId).whereNull('used_at').update({ used_at: now });
    await PasswordReset.create({ user_id: userId, token_hash: Hasher.hash(token, 'password_setup'), ip: ctx.ip ? IpResolver.toBinary(ctx.ip) : null, created_at: now, expires_at: new Date(now.getTime() + LINK_HOURS * 3600000) });
    return { setupUrl: `${config('ticketo').publicUrl}/partner/set-password?token=${encodeURIComponent(token)}`, expiresAt: new Date(now.getTime() + LINK_HOURS * 3600000).toISOString() };
}

const StaffAdminService = {
    async users() {
        const rows = await DB.table('users as u')
            .select('u.id', 'u.uuid', 'u.name', 'u.email', 'u.status', 'u.mfa_enabled', 'u.last_login_at', 'u.created_at')
            .selectRaw('u.password_hash IS NOT NULL as has_password')
            .where('u.type', 'cms').whereNull('u.deleted_at').orderBy('u.name').get();
        const list = rows.map((r) => r.id);
        const [roles, factors] = list.length ? await Promise.all([
            DB.table('user_roles as ur').join('roles as r', 'r.id', '=', 'ur.role_id').select('ur.user_id', 'r.id', 'r.name', 'r.slug').whereIn('ur.user_id', list).whereNull('r.deleted_at').get(),
            DB.table('mfa_factors').select('user_id').whereIn('user_id', list).whereNotNull('confirmed_at').get(),
        ]) : [[], []];
        const mfa = new Set(factors.map((f) => f.user_id));
        return rows.map((u) => ({
            id: u.uuid, name: u.name, email: u.email, status: u.status, lastLoginAt: u.last_login_at, createdAt: u.created_at,
            invited: !Number(u.has_password), mfa: mfa.has(u.id),
            roles: roles.filter((r) => r.user_id === u.id).map((r) => ({ id: r.id, name: r.name, slug: r.slug })),
        }));
    },

    async invite(ctx, { name, email, roleIds } = {}) {
        Access.need(ctx, 'users.manage');
        const n = str(name, 150); const mail = str(email, 190).toLowerCase(); const roles = ids(roleIds);
        if (n.length < 2) bad('Name is required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) bad('A valid email is required');
        if (!roles.length) bad('Choose at least one role');
        if (await User.withTrashed().where('type', 'cms').where('email', mail).exists()) bad('A staff user with this email already exists');
        await assertCanGrant(ctx, roles);
        const out = await Db.transaction(async () => {
            const u = await User.create({ uuid: uuid(), type: 'cms', name: n, email: mail, password_hash: null, status: 'active' });
            const granted = await RbacService.setUserRoles(ctx, u.id, roles, { scope: 'cms' });
            return { u, granted, link: await issueLink(ctx, u.id) };
        });
        await AuditService.record(ctx, 'CMS_USER_INVITED', { type: 'user', id: out.u.id, label: mail }, { after: { name: n, email: mail, roles: out.granted } });
        return { user: (await StaffAdminService.users()).find((x) => x.id === out.u.uuid), ...out.link };
    },

    async update(ctx, id, { name, status, roleIds } = {}) {
        Access.need(ctx, 'users.manage');
        const u = await cmsUser(id);
        const self = Number(u.id) === Number(ctx.user.id);
        const before = (await StaffAdminService.users()).find((x) => x.id === u.uuid);
        const patch = {};
        if (name !== undefined) { patch.name = str(name, 150); if (patch.name.length < 2) bad('Name is required'); }
        if (status !== undefined && status !== u.status) {
            if (!STATUSES.includes(status)) bad('Unknown status');
            if (self) bad('You cannot change your own status');
            const rid = await superAdminRoleId();
            if (status !== 'active' && rid && await UserRole.where('user_id', u.id).where('role_id', rid).exists() && !(await activeSuperAdmins(u.id))) bad('At least one active Super Admin must remain');
            patch.status = status;
        }
        let granted = null;
        await Db.transaction(async () => {
            if (Object.keys(patch).length) await User.where('id', u.id).update({ ...patch, updated_at: new Date() });
            if (roleIds !== undefined) {
                const roles = ids(roleIds);
                if (!roles.length) bad('A staff user needs at least one role — suspend the account instead');
                await assertCanGrant(ctx, roles.filter((r) => !before.roles.some((x) => x.id === r))); // only newly added roles
                granted = await RbacService.setUserRoles(ctx, u.id, roles, { scope: 'cms' });
            }
        });
        const removedRole = granted && before.roles.some((r) => !granted.includes(r.slug));
        if (patch.status && patch.status !== 'active') await SessionService.revokeAll(u.id, 'suspended');
        else if (removedRole && !self) await SessionService.revokeAll(u.id, 'roles_reduced'); // access shrank: sign in again
        RbacService.invalidate(u.id);
        await AuditService.record(ctx, 'CMS_USER_UPDATED', { type: 'user', id: u.id, label: u.email }, {
            before: { name: before.name, status: before.status, roles: before.roles.map((r) => r.slug) },
            after: { name: patch.name ?? before.name, status: patch.status ?? before.status, roles: granted ?? before.roles.map((r) => r.slug) },
        });
        return (await StaffAdminService.users()).find((x) => x.id === u.uuid);
    },

    /** New set-password link (the old password stops working), optionally a fresh authenticator enrolment. */
    async resetAccess(ctx, id, { resetMfa = false } = {}) {
        Access.need(ctx, 'users.manage');
        const u = await cmsUser(id);
        if (Number(u.id) === Number(ctx.user.id)) bad('Use your own account settings to change your password');
        const rid = await superAdminRoleId();
        if (!ctx.isSuperAdmin && rid && await UserRole.where('user_id', u.id).where('role_id', rid).exists()) forbid('Only a Super Admin can reset a Super Admin', 'escalation');
        const link = await Db.transaction(async () => {
            await User.where('id', u.id).update({ password_hash: null, failed_logins: 0, locked_until: null, ...(resetMfa ? { mfa_enabled: 0 } : {}), updated_at: new Date() });
            if (resetMfa) await MfaFactor.where('user_id', u.id).delete();
            return issueLink(ctx, u.id);
        });
        await SessionService.revokeAll(u.id, 'access_reset');
        SecurityEventService.record(ctx, 'secret_rotated', { userId: u.id, details: { scope: 'staff_access', resetMfa: !!resetMfa } });
        await AuditService.record(ctx, 'CMS_USER_ACCESS_RESET', { type: 'user', id: u.id, label: u.email }, { meta: { resetMfa: !!resetMfa } });
        return link;
    },

    // ------------------------------------------------------------------ roles
    async roles() {
        const list = await RbacService.listRoles('cms');
        return list.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, system: r.is_system, users: r.users, permissions: r.permissions }));
    },

    async role(id) {
        const r = await RbacService.roleWithPermissions(Number(id));
        if (r.scope !== 'cms' || r.merchant_id) missing('Role not found');
        return { id: r.id, slug: r.slug, name: r.name, description: r.description, system: r.is_system, locked: r.slug === 'super-admin', permissions: r.permissions };
    },

    async catalogue() {
        const rows = await RbacService.permissionCatalogue('cms');
        const groups = [];
        for (const p of rows) {
            let g = groups.find((x) => x.name === p.group_name);
            if (!g) groups.push(g = { name: p.group_name, permissions: [] });
            g.permissions.push({ slug: p.slug, name: p.name, description: p.description });
        }
        return groups;
    },

    async saveRole(ctx, { id, name, description, permissions } = {}) {
        Access.need(ctx, 'roles.manage');
        const r = await RbacService.saveRole(ctx, { id: id ? Number(id) : null, scope: 'cms', name: str(name, 100), description: str(description, 255) || null, permissions: Array.isArray(permissions) ? permissions.map(String) : [] });
        // Users whose role lost permissions are signed out so the smaller set applies at once.
        const lost = r.before ? r.before.permissions.filter((p) => !r.after.permissions.includes(p)) : [];
        if (lost.length) for (const ur of await UserRole.select('user_id').where('role_id', r.roleId).get()) if (Number(ur.user_id) !== Number(ctx.user.id)) await SessionService.revokeAll(ur.user_id, 'role_changed');
        await AuditService.record(ctx, id ? 'ROLE_UPDATED' : 'ROLE_CREATED', { type: 'role', id: r.roleId, label: r.after.name }, {
            before: r.before ? { name: r.before.name, permissions: r.before.permissions } : null, after: r.after,
        });
        return StaffAdminService.role(r.roleId);
    },

    async deleteRole(ctx, id) {
        Access.need(ctx, 'roles.manage');
        const r = await StaffAdminService.role(id);
        await RbacService.deleteRole(Number(id), null);
        await AuditService.record(ctx, 'ROLE_DELETED', { type: 'role', id: r.id, label: r.name }, { before: { name: r.name, permissions: r.permissions } });
        return { ok: true };
    },

    // ------------------------------------------------------------------ public: set password from the link
    async setPassword(ctx, { token, password } = {}) {
        const t = String(token || '');
        const pw = String(password || '');
        if (!t || t.length > 200) bad('This link is not valid. Ask your administrator for a new one.', 'link_invalid');
        const row = await PasswordReset.where('token_hash', Hasher.hash(t, 'password_setup')).whereNull('used_at').first();
        if (!row || new Date(row.expires_at) <= new Date()) {
            SecurityEventService.record(ctx, 'password_link_invalid', { details: { reason: row ? 'expired' : 'unknown' } });
            bad('This link has expired or was already used. Ask your administrator for a new one.', 'link_invalid');
        }
        const u = await User.select('id', 'email', 'status', 'type').where('id', row.user_id).first();
        if (!u || u.status !== 'active') bad('This account is not active. Contact your administrator.', 'account_inactive');
        if (pw.length < 12 || pw.length > 200) bad('Password must be at least 12 characters');
        const local = String(u.email || '').split('@')[0].toLowerCase();
        if (local.length >= 4 && pw.toLowerCase().includes(local)) bad('Password must not contain your email name');
        if (new Set(pw).size < 6) bad('Password is too simple — use a longer mix of words, numbers or symbols');
        await Db.transaction(async () => {
            // Conditional claim: two tabs submitting the same link → only one wins.
            const claimed = await PasswordReset.where('id', row.id).whereNull('used_at').update({ used_at: new Date() });
            if (!claimed) bad('This link was already used.', 'link_invalid');
            await User.where('id', u.id).update({ password_hash: await bcrypt.hash(pw, 12), failed_logins: 0, locked_until: null, updated_at: new Date() });
        });
        await SessionService.revokeAll(u.id, 'password_set');
        await AuditService.record({ ...ctx, user: { id: u.id, type: u.type, email: u.email } }, 'PASSWORD_SET', { type: 'user', id: u.id, label: u.email }, {});
        return { ok: true, email: u.email };
    },
};

module.exports = StaffAdminService;
