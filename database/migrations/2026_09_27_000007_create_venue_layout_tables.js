const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Venues and the dynamic seat-plan library. A layout template has immutable published
// versions; each version stores the designer spec JSON (same format as the prototype).
class CreateVenueLayoutTables {
    async up() {
        await create('venues', [
            col.id, col.uuid,
            'slug VARCHAR(120) NOT NULL',
            'name VARCHAR(190) NOT NULL',
            col.fk('city_id'),
            'address VARCHAR(255) NULL',
            "type VARCHAR(40) NOT NULL DEFAULT 'hall' COMMENT 'lookup venue_types'",
            col.fk('image_media_id', true),
            'latitude DECIMAL(10,7) NULL', 'longitude DECIMAL(10,7) NULL',
            col.fk('merchant_id', true) + " COMMENT 'NULL = platform venue'",
            col.active,
            col.timestamps, col.softDeletes,
            unique('uq_venues_slug', 'slug'),
            unique('uq_venues_uuid', 'uuid'),
            fk('city_id', 'cities'),
        ]);

        await create('venue_facilities', [
            col.id,
            col.fk('venue_id'),
            "code VARCHAR(60) NOT NULL COMMENT 'lookup facilities'",
            unique('uq_venue_facilities', 'venue_id', 'code'),
            fk('venue_id', 'venues', 'CASCADE'),
        ]);

        await create('venue_gates', [
            col.id,
            col.fk('venue_id'),
            'name VARCHAR(80) NOT NULL',
            "allowed_tier_keys JSON NULL COMMENT 'NULL = all tiers'",
            col.sort, col.active,
            col.timestamps,
            unique('uq_venue_gates', 'venue_id', 'name'),
            fk('venue_id', 'venues', 'CASCADE'),
        ]);

        await create('layout_templates', [
            col.id, col.uuid,
            'slug VARCHAR(120) NOT NULL',
            'name VARCHAR(190) NOT NULL',
            col.fk('view_type_id'),
            col.fk('venue_id', true),
            col.fk('owner_merchant_id', true) + " COMMENT 'NULL = platform layout'",
            "status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft'",
            col.fk('current_version_id', true),
            "draft_spec JSON NULL COMMENT 'autosaved work in progress'",
            col.bool('is_sample'),
            col.by('created_by'), col.by('updated_by'),
            col.timestamps, col.softDeletes,
            unique('uq_layout_templates_slug', 'slug'),
            unique('uq_layout_templates_uuid', 'uuid'),
            index('ix_layout_templates_owner', 'owner_merchant_id', 'status'),
            fk('view_type_id', 'view_types'),
            fk('venue_id', 'venues', 'SET NULL'),
        ]);

        await create('layout_versions', [
            col.id,
            col.fk('template_id'),
            'version INT NOT NULL',
            'spec JSON NOT NULL',
            'seat_count INT NOT NULL DEFAULT 0',
            'ga_capacity INT NOT NULL DEFAULT 0',
            'block_count INT NOT NULL DEFAULT 0',
            'checksum CHAR(64) NOT NULL',
            'notes VARCHAR(255) NULL',
            col.by('created_by'),
            'created_at DATETIME(3) NOT NULL',
            'published_at DATETIME(3) NULL',
            unique('uq_layout_versions', 'template_id', 'version'),
            fk('template_id', 'layout_templates', 'CASCADE'),
        ]);

        await create('layout_seat_attributes', [
            col.id,
            col.fk('version_id'),
            'block_key VARCHAR(40) NOT NULL',
            'seat_code VARCHAR(20) NOT NULL',
            "attr ENUM('accessible','companion','restricted_view','house_hold','kill') NOT NULL",
            'note VARCHAR(190) NULL',
            unique('uq_layout_seat_attr', 'version_id', 'block_key', 'seat_code', 'attr'),
            fk('version_id', 'layout_versions', 'CASCADE'),
        ]);

        await create('venue_templates', [
            col.fk('venue_id'), col.fk('template_id'),
            'PRIMARY KEY (venue_id, template_id)',
            fk('venue_id', 'venues', 'CASCADE'),
            fk('template_id', 'layout_templates', 'CASCADE'),
        ]);

        await create('categories', [
            col.id,
            col.fk('parent_id', true),
            'slug VARCHAR(60) NOT NULL',
            'name VARCHAR(120) NOT NULL',
            'icon VARCHAR(60) NULL',
            'color VARCHAR(9) NULL',
            col.fk('image_media_id', true),
            col.fk('view_type_id'),
            col.fk('default_template_id', true),
            "people_label VARCHAR(80) NULL COMMENT 'Cast & Crew / Teams / Artists & Speakers'",
            col.sort, col.active,
            col.timestamps, col.softDeletes,
            unique('uq_categories_slug', 'slug'),
            fk('parent_id', 'categories', 'CASCADE'),
            fk('view_type_id', 'view_types'),
            fk('default_template_id', 'layout_templates', 'SET NULL'),
        ]);
    }

    async down() {
        await drop('categories', 'venue_templates', 'layout_seat_attributes', 'layout_versions', 'layout_templates', 'venue_gates', 'venue_facilities', 'venues');
    }
}

module.exports = CreateVenueLayoutTables;
