const Command = use('laranode/Console/Command');

// node artisan ticketo:demo:merchant-users [--reset]
// NON-PRODUCTION ONLY. Creates test staff logins for every demo merchant (Owner, Box Office, Gate Staff),
// with random passwords stored ONLY as bcrypt hashes. The generated passwords are printed once, to an
// interactive terminal — never written to a file, the DB or logs. Lost them? Run again with --reset
// (issues new passwords and signs those accounts out everywhere).
const STAFF = [
    ['owner', 'Owner', 'owner'],
    ['box-office', 'Box Office', 'boxoffice'],
    ['gate-staff', 'Gate Staff', 'gate'],
];

class DemoMerchantUsersCommand extends Command {
    constructor(app) {
        super();
        this.app = app;
        this.signature = 'ticketo:demo:merchant-users {--reset}';
        this.description = 'Create test logins for demo merchants (non-production; prints passwords once)';
    }

    async handle(args, options) {
        const User = use('App/Models/User');
        const Role = use('App/Models/Role');
        const UserRole = use('App/Models/UserRole');
        const Merchant = use('App/Models/Merchant');
        const bcrypt = require('bcryptjs');
        const crypto = require('crypto');
        const { uuid } = use('App/Support/Ids');
        const AuditService = use('App/Services/AuditService');
        const SessionService = use('App/Services/SessionService');
        try {
            if (env('APP_ENV') === 'production') return this.error('Refusing to create demo accounts in production');
            const tty = !!process.stdout.isTTY;
            const reset = !!options.reset;
            const roles = Object.fromEntries((await Role.select('id', 'slug').where('scope', 'merchant').whereNull('merchant_id').get()).map((r) => [r.slug, r.id]));
            const merchants = await Merchant.select('id', 'name', 'slug').where('status', 'active').orderBy('id').get();
            if (!merchants.length) return this.error('No demo merchants — run node artisan db:seed first');

            const now = new Date();
            const rows = [];
            for (const m of merchants) {
                const domain = `${m.slug.replace(/[^a-z0-9-]/g, '').slice(0, 40)}.ticketo.test`; // .test = reserved, never a real mailbox
                for (const [roleSlug, label, local] of STAFF) {
                    if (!roles[roleSlug]) return this.error(`Merchant role "${roleSlug}" missing — run node artisan db:seed`);
                    const email = `${local}@${domain}`;
                    const existing = await User.withTrashed().select('id').where('type', 'merchant_staff').where('email', email).first();
                    if (existing && !reset) { rows.push([m.name, label, email, '(unchanged — use --reset)']); continue; }
                    const password = crypto.randomBytes(12).toString('base64url'); // 16 chars, ~96 bits
                    const hash = await bcrypt.hash(password, 12);
                    let userId = existing?.id;
                    if (existing) {
                        await User.withTrashed().where('id', userId).update({ password_hash: hash, failed_logins: 0, locked_until: null, status: 'active', deleted_at: null, updated_at: now });
                        await SessionService.revokeAll(userId, 'password_reset');
                    } else {
                        userId = (await User.create({
                            uuid: uuid(), type: 'merchant_staff', name: `${m.name.split(' ')[0]} ${label}`, email, password_hash: hash,
                            status: 'active', merchant_id: m.id, email_verified_at: now,
                        })).id;
                        await UserRole.create({ user_id: userId, role_id: roles[roleSlug], merchant_id: m.id, granted_by: null, granted_at: now });
                    }
                    await AuditService.record({ actorType: 'system', actorLabel: 'artisan' }, existing ? 'DEMO_USER_PASSWORD_RESET' : 'DEMO_USER_CREATED',
                        { type: 'user', id: userId, label: email }, { meta: { role: roleSlug, via: 'cli' }, merchantId: m.id });
                    // Plain text exists only in this process's memory and, if interactive, on screen.
                    rows.push([m.name, label, email, tty ? password : '(hidden: not a terminal — rerun with --reset in a terminal)']);
                }
            }
            await AuditService.flush();

            const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length), 8));
            this.info(`\nDemo merchant logins (sign in at /partner/login). ${tty ? 'Passwords are shown ONCE — they are stored only as hashes.' : ''}\n`);
            for (const r of rows) console.log(`  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`);
            console.log('');
        } catch (e) {
            this.error(use('App/Security/Redactor').errorMessage(e.message));
        } finally {
            await use('laranode/Support/Facades/DB').disconnect();
            process.exit(0);
        }
    }
}

module.exports = DemoMerchantUsersCommand;
