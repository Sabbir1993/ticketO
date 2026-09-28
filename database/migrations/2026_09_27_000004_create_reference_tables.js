const { create, drop, unique, index, col } = use('App/Support/Migration');

// Settings, UI strings, lookup lists, banks, KYC document types, view types, cities, media.
// Everything the UI used to hardcode now lives here and is CMS-editable.
class CreateReferenceTables {
    async up() {
        await create('settings', [
            col.id,
            'setting_group VARCHAR(60) NOT NULL',
            'setting_key VARCHAR(100) NOT NULL',
            'value JSON NULL',
            "value_type ENUM('string','number','boolean','json','color','text') NOT NULL DEFAULT 'string'",
            'label VARCHAR(150) NULL',
            'help VARCHAR(255) NULL',
            col.bool('is_public'),
            col.by('updated_by'),
            col.timestamps,
            unique('uq_settings_key', 'setting_group', 'setting_key'),
        ]);

        await create('ui_strings', [
            col.id,
            'string_key VARCHAR(150) NOT NULL',
            "locale VARCHAR(8) NOT NULL DEFAULT 'en'",
            'value TEXT NOT NULL',
            'context VARCHAR(150) NULL',
            col.by('updated_by'),
            col.timestamps,
            unique('uq_ui_strings', 'string_key', 'locale'),
        ]);

        await create('lookups', [
            col.id,
            'lookup_group VARCHAR(60) NOT NULL',
            'code VARCHAR(80) NOT NULL',
            'label VARCHAR(150) NOT NULL',
            'meta JSON NULL',
            col.sort, col.active,
            col.timestamps, col.softDeletes,
            unique('uq_lookups', 'lookup_group', 'code'),
            index('ix_lookups_group', 'lookup_group', 'is_active', 'sort_order'),
        ]);

        await create('banks', [
            col.id,
            'name VARCHAR(150) NOT NULL',
            'short_name VARCHAR(40) NULL',
            "kind ENUM('bank','mfs') NOT NULL DEFAULT 'bank'",
            'routing_prefix VARCHAR(20) NULL',
            'swift VARCHAR(20) NULL',
            col.sort, col.active,
            col.timestamps,
            unique('uq_banks_name', 'name'),
        ]);

        await create('kyc_document_types', [
            col.id,
            'code VARCHAR(60) NOT NULL',
            'name VARCHAR(150) NOT NULL',
            'description VARCHAR(255) NULL',
            col.bool('is_required'),
            'accepted_mime JSON NOT NULL',
            'max_bytes INT NOT NULL DEFAULT 5242880',
            col.sort, col.active,
            col.timestamps,
            unique('uq_kyc_doc_types_code', 'code'),
        ]);

        await create('view_types', [
            col.id,
            'slug VARCHAR(40) NOT NULL',
            'name VARCHAR(120) NOT NULL',
            "kind ENUM('map','rows','list') NOT NULL",
            'icon VARCHAR(60) NULL',
            'description VARCHAR(255) NULL',
            'customer_label VARCHAR(150) NULL',
            col.sort, col.active,
            col.timestamps,
            unique('uq_view_types_slug', 'slug'),
        ]);

        await create('media', [
            col.id, col.uuid,
            "disk VARCHAR(30) NOT NULL DEFAULT 'local'",
            'path VARCHAR(500) NOT NULL',
            "visibility ENUM('public','private') NOT NULL DEFAULT 'public'",
            'original_name VARCHAR(255) NULL',
            'mime VARCHAR(100) NOT NULL',
            'bytes INT UNSIGNED NOT NULL',
            'width INT NULL', 'height INT NULL',
            'alt VARCHAR(255) NULL',
            'checksum CHAR(64) NOT NULL',
            "purpose VARCHAR(40) NOT NULL DEFAULT 'general'",
            col.by('uploaded_by'),
            col.fk('merchant_id', true),
            col.timestamps, col.softDeletes,
            unique('uq_media_uuid', 'uuid'),
            index('ix_media_purpose', 'purpose', 'visibility'),
        ]);

        await create('cities', [
            col.id,
            'slug VARCHAR(60) NOT NULL',
            'name VARCHAR(120) NOT NULL',
            'icon VARCHAR(60) NULL',
            col.fk('image_media_id', true),
            col.bool('is_popular'), col.bool('is_default'), col.bool('is_online'),
            col.sort, col.active,
            col.timestamps,
            unique('uq_cities_slug', 'slug'),
        ]);
    }

    async down() {
        await drop('cities', 'media', 'view_types', 'kyc_document_types', 'banks', 'lookups', 'ui_strings', 'settings');
    }
}

module.exports = CreateReferenceTables;
