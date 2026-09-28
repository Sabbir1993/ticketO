const Seeder = use('laranode/Database/Seeder');
const DB = use('laranode/Support/Facades/DB');
const Permission = use('App/Models/Permission');
const Role = use('App/Models/Role');
const { permissions, roles } = require('./data/permissions');

// Idempotent: safe to re-run in production after adding permissions.
// System roles are re-synced to their canonical permission sets.
class RbacSeeder extends Seeder {
    async run() {
        const now = new Date();
        await DB.table('permissions').upsert(permissions.map((p) => ({ ...p, created_at: now, updated_at: now })), ['slug'],
            ['scope', 'group_name', 'name', 'description', 'sort_order', 'updated_at']);
        const permIds = Object.fromEntries((await Permission.select('id', 'slug').get()).map((r) => [r.slug, r.id]));

        for (const r of roles) {
            let role = await Role.withTrashed().where('scope', r.scope).where('slug', r.slug).whereNull('merchant_id').first();
            if (!role) role = await Role.create({ scope: r.scope, slug: r.slug, name: r.name, description: r.description, is_system: 1, merchant_id: null });
            else await Role.withTrashed().where('id', role.id).update({ name: r.name, description: r.description, is_system: 1, deleted_at: null, updated_at: now });
            await role.permissions().sync(r.permissions.map((slug) => permIds[slug]).filter(Boolean));
        }
        console.log(`  permissions: ${permissions.length}, roles: ${roles.length}`);
    }
}

module.exports = RbacSeeder;
