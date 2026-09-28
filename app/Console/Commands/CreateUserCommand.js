const Command = use('laranode/Console/Command');

// node artisan ticketo:user:create --email=admin@example.com --name="Admin" --role=super-admin
// Prompts for the password on the terminal (hidden). Passwords are never accepted as CLI
// arguments (they would land in shell history) and are stored only as a bcrypt hash.
class CreateUserCommand extends Command {
    constructor(app) {
        super();
        this.app = app;
        this.signature = 'ticketo:user:create {--email} {--name} {--role}';
        this.description = 'Create a CMS user (prompts for password)';
    }

    prompt(question, hidden = false) {
        return new Promise((resolve) => {
            const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout, terminal: true });
            if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write('*'); };
            rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
        });
    }

    async handle(args, options) {
        const User = use('App/Models/User');
        const Role = use('App/Models/Role');
        const UserRole = use('App/Models/UserRole');
        const bcrypt = require('bcryptjs');
        const { uuid } = use('App/Support/Ids');
        const AuditService = use('App/Services/AuditService');
        try {
            const email = String(options.email || await this.prompt('Email: ')).trim().toLowerCase();
            if (!/\S+@\S+\.\S+/.test(email)) return this.error('A valid email is required');
            const name = String(options.name || await this.prompt('Full name: ')).trim() || 'Administrator';
            const roleSlug = String(options.role || 'super-admin');
            const role = await Role.where('scope', 'cms').where('slug', roleSlug).whereNull('merchant_id').first();
            if (!role) return this.error(`CMS role "${roleSlug}" not found — run node artisan db:seed first`);
            if (await User.withTrashed().where('type', 'cms').where('email', email).exists()) return this.error('A CMS user with this email already exists');

            if (!process.stdin.isTTY) return this.error('Run this command in an interactive terminal (password is prompted, never passed as an argument)');
            const pw = await this.prompt('Password (min 12 chars): ', true);
            const pw2 = await this.prompt('Confirm password: ', true);
            if (pw.length < 12) return this.error('Password must be at least 12 characters');
            if (pw !== pw2) return this.error('Passwords do not match');

            const user = await User.create({ uuid: uuid(), type: 'cms', name, email, password_hash: await bcrypt.hash(pw, 12), status: 'active' });
            const id = user.id;
            await UserRole.create({ user_id: id, role_id: role.id, merchant_id: null, granted_by: null, granted_at: new Date() });
            await AuditService.record({ actorType: 'system', actorLabel: 'artisan' }, 'CMS_USER_CREATED', { type: 'user', id, label: email }, { meta: { role: roleSlug, via: 'cli' } });
            await AuditService.flush();
            this.info(`Created CMS user ${email} with role ${roleSlug}. Set up the authenticator app on first sign-in.`);
        } catch (e) {
            this.error(use('App/Security/Redactor').errorMessage(e.message));
        } finally {
            await use('laranode/Support/Facades/DB').disconnect();
            process.exit(0);
        }
    }
}

module.exports = CreateUserCommand;
