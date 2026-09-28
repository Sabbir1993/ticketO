const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Users (customers, merchant staff, CMS staff), roles, permissions and grants.
class CreateIdentityRbacTables {
    async up() {
        await create('users', [
            col.id, col.uuid,
            "type ENUM('customer','merchant_staff','cms') NOT NULL",
            'name VARCHAR(150) NOT NULL',
            'email VARCHAR(190) NULL',
            'phone VARCHAR(20) NULL',
            "password_hash VARCHAR(100) NULL COMMENT 'bcrypt; NULL for OTP-only customers'",
            "status ENUM('active','pending','suspended','blocked') NOT NULL DEFAULT 'active'",
            'status_reason VARCHAR(255) NULL',
            col.bool('mfa_enabled'),
            col.fk('merchant_id', true),
            'email_verified_at DATETIME(3) NULL',
            'phone_verified_at DATETIME(3) NULL',
            'last_login_at DATETIME(3) NULL',
            col.ip('last_login_ip'),
            'failed_logins INT NOT NULL DEFAULT 0',
            'locked_until DATETIME(3) NULL',
            col.timestamps, col.softDeletes,
            unique('uq_users_uuid', 'uuid'),
            unique('uq_users_type_email', 'type', 'email'),
            unique('uq_users_type_phone', 'type', 'phone'),
            index('ix_users_merchant', 'merchant_id'),
            index('ix_users_status', 'status'),
        ]);

        await create('permissions', [
            col.id,
            'slug VARCHAR(100) NOT NULL',
            "scope ENUM('cms','merchant') NOT NULL",
            'group_name VARCHAR(60) NOT NULL',
            'name VARCHAR(120) NOT NULL',
            'description VARCHAR(255) NULL',
            col.sort,
            col.timestamps,
            unique('uq_permissions_slug', 'slug'),
        ]);

        await create('roles', [
            col.id,
            "scope ENUM('cms','merchant') NOT NULL",
            'slug VARCHAR(80) NOT NULL',
            'name VARCHAR(120) NOT NULL',
            'description VARCHAR(255) NULL',
            col.bool('is_system'),
            col.fk('merchant_id', true) + " COMMENT 'NULL = platform role template'",
            col.by('created_by'),
            col.timestamps, col.softDeletes,
            unique('uq_roles_scope_slug_merchant', 'scope', 'slug', 'merchant_id'),
        ]);

        await create('role_permissions', [
            col.fk('role_id'), col.fk('permission_id'),
            'PRIMARY KEY (role_id, permission_id)',
            fk('role_id', 'roles', 'CASCADE'),
            fk('permission_id', 'permissions', 'CASCADE'),
        ]);

        await create('user_roles', [
            col.id,
            col.fk('user_id'), col.fk('role_id'),
            col.fk('merchant_id', true) + " COMMENT 'set for merchant-scoped grants'",
            col.by('granted_by'),
            'granted_at DATETIME(3) NOT NULL',
            'expires_at DATETIME(3) NULL',
            unique('uq_user_roles', 'user_id', 'role_id', 'merchant_id'),
            fk('user_id', 'users', 'CASCADE'),
            fk('role_id', 'roles', 'CASCADE'),
        ]);
    }

    async down() {
        await drop('user_roles', 'role_permissions', 'roles', 'permissions', 'users');
    }
}

module.exports = CreateIdentityRbacTables;
