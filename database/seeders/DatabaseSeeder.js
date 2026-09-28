const Seeder = use('laranode/Database/Seeder');

// node artisan db:seed
// Reference data, RBAC, sample seat plans and catalogue are idempotent and safe in production.
// Demo data (venues, merchants, events, shows) is seeded only outside production.
// No user passwords are seeded — create the first admin with: node artisan ticketo:user:create
class DatabaseSeeder extends Seeder {
    async run() {
        await this.call([
            require('./ReferenceSeeder'),
            require('./RbacSeeder'),
            require('./LayoutSeeder'),
            require('./CatalogSeeder'),
        ]);
        if (env('APP_ENV') !== 'production') await this.call([require('./DemoSeeder'), require('./DemoEventSeeder')]);
        await use('App/Services/AuditService').flush();
        await use('laranode/Support/Facades/DB').disconnect();
    }
}

module.exports = DatabaseSeeder;
