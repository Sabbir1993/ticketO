const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Platform- and event-level promo codes and their redemptions.
class CreatePromoTables {
    async up() {
        await create('promos', [
            col.id,
            'code VARCHAR(40) NOT NULL',
            "type ENUM('flat','pct') NOT NULL",
            'value DECIMAL(10,2) NOT NULL',
            col.money('max_discount', true),
            col.money('min_order'),
            'description VARCHAR(255) NULL',
            col.fk('category_id', true) + " COMMENT 'NULL = all categories'",
            col.fk('event_id', true) + " COMMENT 'set for event-level codes'",
            col.fk('merchant_id', true),
            'starts_at DATETIME(3) NULL', 'ends_at DATETIME(3) NULL',
            'usage_limit INT NULL',
            'per_customer_limit INT NULL',
            'used_count INT NOT NULL DEFAULT 0',
            col.active,
            col.by('created_by'),
            col.timestamps, col.softDeletes,
            unique('uq_promos_code_event', 'code', 'event_id'),
            index('ix_promos_code', 'code', 'is_active'),
            fk('category_id', 'categories', 'SET NULL'),
            fk('event_id', 'events', 'CASCADE'),
            fk('merchant_id', 'merchants', 'CASCADE'),
        ]);

        await create('promo_redemptions', [
            col.id,
            col.fk('promo_id'),
            col.fk('order_id'),
            col.fk('user_id', true),
            'phone VARCHAR(20) NULL',
            col.money('discount'),
            'created_at DATETIME(3) NOT NULL',
            unique('uq_promo_redemptions_order', 'order_id'),
            index('ix_promo_redemptions_user', 'promo_id', 'user_id'),
            fk('promo_id', 'promos', 'CASCADE'),
        ]);
    }

    async down() {
        await drop('promo_redemptions', 'promos');
    }
}

module.exports = CreatePromoTables;
