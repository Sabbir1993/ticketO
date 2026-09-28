const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Customer features that used to live in localStorage: city, wishlist, waitlist,
// loyalty points (server-authoritative ledger), check-ins, referrals, reviews.
class CreateEngagementTables {
    async up() {
        await create('user_preferences', [
            col.fk('user_id'),
            col.fk('city_id', true),
            "prefs JSON NULL COMMENT 'non-sensitive UI preferences'",
            'updated_at DATETIME(3) NULL',
            'PRIMARY KEY (user_id)',
            fk('user_id', 'users', 'CASCADE'),
            fk('city_id', 'cities', 'SET NULL'),
        ]);

        await create('wishlists', [
            col.fk('user_id'), col.fk('event_id'),
            'created_at DATETIME(3) NOT NULL',
            'PRIMARY KEY (user_id, event_id)',
            fk('user_id', 'users', 'CASCADE'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('waitlists', [
            col.id,
            col.fk('event_id'),
            col.fk('show_id', true),
            col.fk('user_id', true),
            'phone VARCHAR(20) NOT NULL',
            'created_at DATETIME(3) NOT NULL',
            'notified_at DATETIME(3) NULL',
            unique('uq_waitlists', 'event_id', 'show_id', 'phone'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('loyalty_tiers', [
            col.id,
            'code VARCHAR(40) NOT NULL',
            'name VARCHAR(80) NOT NULL',
            'min_points INT NOT NULL',
            'multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00',
            'color VARCHAR(9) NULL',
            'perks JSON NULL',
            col.sort, col.active,
            col.timestamps,
            unique('uq_loyalty_tiers_code', 'code'),
        ]);

        await create('loyalty_rules', [
            col.id,
            "event VARCHAR(40) NOT NULL COMMENT 'order_paid, checkin, referral'",
            'points INT NOT NULL DEFAULT 0',
            "per_amount DECIMAL(10,2) NULL COMMENT 'order_paid: points per this many taka'",
            'daily_cap INT NULL',
            col.active,
            col.timestamps,
            unique('uq_loyalty_rules_event', 'event'),
        ]);

        await create('loyalty_ledger', [
            col.id,
            col.fk('user_id'),
            'delta INT NOT NULL',
            "reason ENUM('order_paid','checkin','referral','redeem','adjustment','refund') NOT NULL",
            "ref VARCHAR(60) NULL COMMENT 'order uuid / checkin date'",
            col.by('created_by'),
            'created_at DATETIME(3) NOT NULL',
            unique('uq_loyalty_ledger_ref', 'user_id', 'reason', 'ref'),
            index('ix_loyalty_ledger_user', 'user_id', 'created_at'),
            fk('user_id', 'users', 'CASCADE'),
        ]);

        await create('checkins', [
            col.fk('user_id'),
            'day DATE NOT NULL',
            'PRIMARY KEY (user_id, day)',
            fk('user_id', 'users', 'CASCADE'),
        ]);

        await create('referral_codes', [
            col.id,
            col.fk('user_id'),
            'code VARCHAR(20) NOT NULL',
            'created_at DATETIME(3) NOT NULL',
            unique('uq_referral_codes_code', 'code'),
            unique('uq_referral_codes_user', 'user_id'),
            fk('user_id', 'users', 'CASCADE'),
        ]);

        await create('referrals', [
            col.id,
            col.fk('referrer_id'),
            col.fk('referee_id'),
            'rewarded_at DATETIME(3) NULL',
            'created_at DATETIME(3) NOT NULL',
            unique('uq_referrals_referee', 'referee_id'),
            fk('referrer_id', 'users', 'CASCADE'),
            fk('referee_id', 'users', 'CASCADE'),
        ]);

        await create('event_reviews', [
            col.id,
            col.fk('event_id'),
            col.fk('user_id'),
            'rating TINYINT NOT NULL',
            'body TEXT NULL',
            "status ENUM('pending','published','hidden') NOT NULL DEFAULT 'pending'",
            col.by('moderated_by'),
            col.timestamps,
            unique('uq_event_reviews', 'event_id', 'user_id'),
            fk('event_id', 'events', 'CASCADE'),
            fk('user_id', 'users', 'CASCADE'),
        ]);
    }

    async down() {
        await drop('event_reviews', 'referrals', 'referral_codes', 'checkins', 'loyalty_ledger', 'loyalty_rules', 'loyalty_tiers', 'waitlists', 'wishlists', 'user_preferences');
    }
}

module.exports = CreateEngagementTables;
