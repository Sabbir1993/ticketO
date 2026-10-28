const { DB } = use('App/Support/Migration');

// Marks sessions issued to the Flutter app so MobileGuard can re-check access on every request.
class AddAuthSessionClient {
    async up() {
        await DB.statement("ALTER TABLE auth_sessions ADD COLUMN client VARCHAR(16) NOT NULL DEFAULT 'web' AFTER guard");
    }

    async down() {
        await DB.statement('ALTER TABLE auth_sessions DROP COLUMN client');
    }
}

module.exports = AddAuthSessionClient;
