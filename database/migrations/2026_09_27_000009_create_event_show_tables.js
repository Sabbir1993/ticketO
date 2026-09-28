const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Events, their pricing tiers and layout snapshot, shows, and the per-show seat inventory.
//
// Seat concurrency: a seat is held with a conditional UPDATE on show_seats
//   (status='available' OR (status='held' AND hold_expires_at < now)).
// A short affected-row count means someone else got it → 409 seat_taken.
// GA zones are locked with SELECT … FOR UPDATE on show_zones.
class CreateEventShowTables {
    async up() {
        await create('events', [
            col.id, col.uuid,
            col.fk('merchant_id'),
            'slug VARCHAR(140) NOT NULL',
            'title VARCHAR(190) NOT NULL',
            col.fk('category_id'),
            col.fk('subcategory_id', true),
            col.fk('view_type_id'),
            col.fk('template_id', true) + " COMMENT 'layout template the event started from'",
            "language_code VARCHAR(40) NULL COMMENT 'lookup languages'",
            "certificate_code VARCHAR(40) NULL COMMENT 'lookup certificates'",
            'duration VARCHAR(60) NULL',
            'description TEXT NULL',
            'palette JSON NULL',
            col.fk('poster_media_id', true), col.fk('backdrop_media_id', true),
            'trailer_url VARCHAR(255) NULL',
            'booking_limit INT NOT NULL DEFAULT 8',
            'sale_start DATETIME(3) NULL', 'sale_end DATETIME(3) NULL',
            'release_date DATETIME(3) NULL',
            "status ENUM('draft','pending_review','published','paused','rejected','cancelled') NOT NULL DEFAULT 'draft'",
            'review_note VARCHAR(255) NULL',
            'published_at DATETIME(3) NULL',
            col.bool('is_refundable', 1), col.bool('is_cancellable', 1), col.bool('is_transferable', 1),
            'refund_window_hrs INT NOT NULL DEFAULT 24',
            'cancellation_fee_pct DECIMAL(5,2) NOT NULL DEFAULT 10.00',
            'rating_avg DECIMAL(3,1) NOT NULL DEFAULT 0.0',
            'votes_count INT NOT NULL DEFAULT 0',
            'interested_count INT NOT NULL DEFAULT 0',
            "schedule_type ENUM('fixed','recurring') NOT NULL DEFAULT 'fixed'",
            "schedule JSON NULL COMMENT 'recurring: { times[], days, formats[] }'",
            col.by('created_by'), col.by('updated_by'),
            col.timestamps, col.softDeletes,
            unique('uq_events_uuid', 'uuid'),
            unique('uq_events_slug', 'slug'),
            index('ix_events_listing', 'status', 'category_id', 'published_at'),
            index('ix_events_merchant', 'merchant_id', 'status'),
            fk('merchant_id', 'merchants'),
            fk('category_id', 'categories'),
            fk('subcategory_id', 'categories', 'SET NULL'),
            fk('view_type_id', 'view_types'),
            fk('template_id', 'layout_templates', 'SET NULL'),
        ]);

        await create('event_venues', [
            col.fk('event_id'), col.fk('venue_id'), col.sort,
            'PRIMARY KEY (event_id, venue_id)',
            fk('event_id', 'events', 'CASCADE'),
            fk('venue_id', 'venues'),
        ]);

        await create('event_taxonomies', [
            col.fk('event_id'),
            "taxonomy ENUM('genre','format','tag') NOT NULL",
            'code VARCHAR(80) NOT NULL',
            'PRIMARY KEY (event_id, taxonomy, code)',
            index('ix_event_taxonomies_code', 'taxonomy', 'code'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('event_people', [
            col.id,
            col.fk('event_id'),
            "kind ENUM('cast','sponsor') NOT NULL",
            'name VARCHAR(150) NOT NULL',
            'role VARCHAR(120) NULL',
            col.fk('media_id', true),
            'url VARCHAR(255) NULL',
            col.sort,
            index('ix_event_people', 'event_id', 'kind', 'sort_order'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('event_tiers', [
            col.id,
            col.fk('event_id'),
            "tier_key VARCHAR(40) NOT NULL COMMENT 'matches spec.tiers[].id'",
            'name VARCHAR(120) NOT NULL',
            'color VARCHAR(9) NOT NULL',
            col.money('price'),
            'per_order_limit INT NULL',
            col.money('early_bird_price', true),
            'early_bird_until DATETIME(3) NULL',
            col.sort,
            unique('uq_event_tiers', 'event_id', 'tier_key'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('event_block_overrides', [
            col.fk('event_id'),
            'block_key VARCHAR(40) NOT NULL',
            col.bool('is_enabled', 1),
            'capacity INT NULL',
            'PRIMARY KEY (event_id, block_key)',
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('event_layouts', [
            col.id,
            col.fk('event_id'),
            col.fk('source_version_id', true),
            "spec JSON NOT NULL COMMENT 'snapshot; the prototype customSpec'",
            'checksum CHAR(64) NOT NULL',
            col.bool('is_custom'),
            "locked_at DATETIME(3) NULL COMMENT 'set when the first seat is held/sold'",
            col.by('updated_by'),
            col.timestamps,
            unique('uq_event_layouts_event', 'event_id'),
            fk('event_id', 'events', 'CASCADE'),
            fk('source_version_id', 'layout_versions', 'SET NULL'),
        ]);

        await create('event_layout_seat_attributes', [
            col.id,
            col.fk('event_id'),
            'block_key VARCHAR(40) NOT NULL',
            'seat_code VARCHAR(20) NOT NULL',
            "attr ENUM('accessible','companion','restricted_view','house_hold','kill') NOT NULL",
            'note VARCHAR(190) NULL',
            unique('uq_event_seat_attr', 'event_id', 'block_key', 'seat_code', 'attr'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('event_shows', [
            col.id, col.uuid,
            col.fk('event_id'),
            col.fk('venue_id'),
            'starts_at DATETIME(3) NOT NULL',
            'ends_at DATETIME(3) NULL',
            'label VARCHAR(80) NULL',
            'format_code VARCHAR(40) NULL',
            "status ENUM('scheduled','cancelled','completed') NOT NULL DEFAULT 'scheduled'",
            "source ENUM('manual','recurring') NOT NULL DEFAULT 'manual'",
            'layout_checksum CHAR(64) NULL',
            'seat_map_generated_at DATETIME(3) NULL',
            'seat_count INT NOT NULL DEFAULT 0',
            'ga_capacity INT NOT NULL DEFAULT 0',
            col.timestamps,
            unique('uq_event_shows_uuid', 'uuid'),
            unique('uq_event_shows_slot', 'event_id', 'venue_id', 'starts_at'),
            index('ix_event_shows_upcoming', 'status', 'starts_at'),
            fk('event_id', 'events', 'CASCADE'),
            fk('venue_id', 'venues'),
        ]);

        await create('show_seats', [
            col.id,
            col.fk('show_id'),
            'block_key VARCHAR(40) NOT NULL',
            'row_label VARCHAR(8) NOT NULL',
            'seat_no INT NOT NULL',
            'seat_code VARCHAR(20) NOT NULL',
            'tier_key VARCHAR(40) NOT NULL',
            'x DECIMAL(9,2) NULL', 'y DECIMAL(9,2) NULL',
            "status ENUM('available','held','sold','blocked','killed') NOT NULL DEFAULT 'available'",
            "attrs SET('accessible','companion','restricted_view') NULL",
            col.fk('hold_id', true),
            'hold_expires_at DATETIME(3) NULL',
            col.fk('order_id', true),
            col.money('price_override', true),
            'blocked_reason VARCHAR(120) NULL',
            col.by('blocked_by'),
            'updated_at DATETIME(3) NULL',
            unique('uq_show_seats', 'show_id', 'block_key', 'seat_code'),
            index('ix_show_seats_status', 'show_id', 'status'),
            index('ix_show_seats_hold', 'hold_id'),
            index('ix_show_seats_order', 'order_id'),
            fk('show_id', 'event_shows', 'CASCADE'),
        ]);

        await create('show_zones', [
            col.id,
            col.fk('show_id'),
            'block_key VARCHAR(40) NOT NULL',
            'tier_key VARCHAR(40) NOT NULL',
            'capacity INT NOT NULL',
            'sold INT NOT NULL DEFAULT 0',
            'blocked INT NOT NULL DEFAULT 0',
            col.money('price_override', true),
            'updated_at DATETIME(3) NULL',
            unique('uq_show_zones', 'show_id', 'block_key'),
            fk('show_id', 'event_shows', 'CASCADE'),
        ]);
    }

    async down() {
        await drop('show_zones', 'show_seats', 'event_shows', 'event_layout_seat_attributes', 'event_layouts', 'event_block_overrides', 'event_tiers', 'event_people', 'event_taxonomies', 'event_venues', 'events');
    }
}

module.exports = CreateEventShowTables;
