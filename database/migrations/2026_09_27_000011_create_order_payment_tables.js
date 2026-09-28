const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// Holds, orders, payments (+ redacted gateway events), tickets, scans, refunds, transfers,
// settlement ledger. Ticket QR codes are HMAC-derived and never stored.
class CreateOrderPaymentTables {
    async up() {
        await create('seat_holds', [
            col.id, col.uuid,
            col.fk('show_id'),
            col.fk('event_id'),
            col.fk('user_id', true),
            "owner_hash CHAR(64) NOT NULL COMMENT 'hash of the browser hold token (guest ownership)'",
            "status ENUM('active','converted','released','expired') NOT NULL DEFAULT 'active'",
            col.money('subtotal'),
            'expires_at DATETIME(3) NOT NULL',
            col.ip('ip'),
            'created_at DATETIME(3) NOT NULL',
            'updated_at DATETIME(3) NULL',
            unique('uq_seat_holds_uuid', 'uuid'),
            index('ix_seat_holds_expiry', 'status', 'expires_at'),
            index('ix_seat_holds_show', 'show_id', 'status'),
            fk('show_id', 'event_shows', 'CASCADE'),
            fk('event_id', 'events', 'CASCADE'),
        ]);

        await create('seat_hold_items', [
            col.id,
            col.fk('hold_id'),
            col.fk('show_seat_id', true),
            col.fk('show_zone_id', true),
            'block_key VARCHAR(40) NOT NULL',
            'block_name VARCHAR(120) NOT NULL',
            'seat_code VARCHAR(20) NULL',
            'tier_key VARCHAR(40) NOT NULL',
            'tier_name VARCHAR(120) NOT NULL',
            'qty INT NOT NULL DEFAULT 1',
            col.money('price'),
            index('ix_hold_items_hold', 'hold_id'),
            index('ix_hold_items_zone', 'show_zone_id'),
            fk('hold_id', 'seat_holds', 'CASCADE'),
        ]);

        await create('orders', [
            col.id, col.uuid,
            "booking_ref VARCHAR(20) NOT NULL COMMENT 'human reference, not a credential'",
            col.fk('hold_id', true),
            col.fk('user_id', true),
            col.fk('merchant_id'),
            col.fk('event_id'),
            col.fk('show_id'),
            col.fk('venue_id'),
            "channel ENUM('web','pos') NOT NULL DEFAULT 'web'",
            "status ENUM('pending_payment','paid','failed','expired','refund_requested','refunded','cancelled') NOT NULL DEFAULT 'pending_payment'",
            'contact_name VARCHAR(150) NOT NULL',
            'contact_phone VARCHAR(20) NULL',
            'contact_email VARCHAR(190) NULL',
            col.money('subtotal'), col.money('discount'), col.money('fee'), col.money('fee_ex_vat'), col.money('vat'), col.money('total'),
            'commission_pct DECIMAL(5,2) NOT NULL DEFAULT 0',
            col.money('commission'), col.money('merchant_net'),
            col.fk('promo_id', true),
            'promo_code VARCHAR(40) NULL',
            "pg_mode ENUM('platform','direct') NULL",
            "guest_access_hash CHAR(64) NULL COMMENT 'hash of the guest booking-link token'",
            col.by('operator_id') + " COMMENT 'POS operator'",
            "pos_method VARCHAR(40) NULL",
            col.money('pos_tendered', true),
            col.ip('created_ip'),
            'paid_at DATETIME(3) NULL',
            col.timestamps,
            unique('uq_orders_uuid', 'uuid'),
            unique('uq_orders_booking_ref', 'booking_ref'),
            index('ix_orders_user', 'user_id', 'status'),
            index('ix_orders_merchant', 'merchant_id', 'status', 'created_at'),
            index('ix_orders_show', 'show_id', 'status'),
            index('ix_orders_phone', 'contact_phone'),
            fk('merchant_id', 'merchants'),
            fk('event_id', 'events'),
            fk('show_id', 'event_shows'),
            fk('user_id', 'users', 'SET NULL'),
        ]);

        await create('order_items', [
            col.id,
            col.fk('order_id'),
            "type ENUM('seat','zone') NOT NULL",
            col.fk('show_seat_id', true), col.fk('show_zone_id', true),
            'block_key VARCHAR(40) NOT NULL',
            'block_name VARCHAR(120) NOT NULL',
            'seat_code VARCHAR(20) NULL',
            'tier_key VARCHAR(40) NOT NULL',
            'tier_name VARCHAR(120) NOT NULL',
            'qty INT NOT NULL DEFAULT 1',
            col.money('price'),
            index('ix_order_items_order', 'order_id'),
            fk('order_id', 'orders', 'CASCADE'),
        ]);

        await create('payments', [
            col.id,
            col.fk('order_id'),
            'attempt INT NOT NULL',
            'method_code VARCHAR(40) NOT NULL',
            "gateway ENUM('sslcommerz','bkash','simulator','pos','free') NOT NULL",
            "pg_mode ENUM('platform','direct') NOT NULL DEFAULT 'platform'",
            'tran_id VARCHAR(60) NOT NULL',
            "status ENUM('initiated','redirected','success','failed','cancelled','refunded') NOT NULL DEFAULT 'initiated'",
            col.money('amount'),
            "currency CHAR(3) NOT NULL DEFAULT 'BDT'",
            "gateway_payment_id VARCHAR(120) NULL COMMENT 'bKash paymentID'",
            'val_id VARCHAR(120) NULL',
            'bank_tran_id VARCHAR(120) NULL',
            "card_brand VARCHAR(60) NULL COMMENT 'brand only, never PAN'",
            'risk_level VARCHAR(10) NULL',
            'error VARCHAR(255) NULL',
            'started_at DATETIME(3) NOT NULL',
            'completed_at DATETIME(3) NULL',
            unique('uq_payments_tran', 'tran_id'),
            index('ix_payments_order', 'order_id', 'attempt'),
            index('ix_payments_status', 'status', 'started_at'),
            fk('order_id', 'orders', 'CASCADE'),
        ]);

        await create('payment_events', [
            col.id,
            col.fk('payment_id', true),
            col.fk('order_id', true),
            "source ENUM('init','redirect','ipn','validate','execute','refund','reconcile','simulator') NOT NULL",
            "payload JSON NULL COMMENT 'redacted'",
            'result VARCHAR(60) NULL',
            col.ip('ip'),
            'request_id CHAR(26) NULL',
            'received_at DATETIME(3) NOT NULL',
            index('ix_payment_events_order', 'order_id', 'received_at'),
        ]);

        await create('tickets', [
            col.id, col.uuid,
            col.fk('order_id'),
            col.fk('order_item_id'),
            col.fk('show_seat_id', true),
            'label VARCHAR(190) NOT NULL',
            'tier_key VARCHAR(40) NOT NULL',
            'tier_name VARCHAR(120) NOT NULL',
            "version INT NOT NULL DEFAULT 1 COMMENT 'bumped on transfer; QR = HMAC(uuid.version)'",
            "status ENUM('valid','void') NOT NULL DEFAULT 'valid'",
            'scanned_at DATETIME(3) NULL',
            col.fk('gate_id', true),
            col.by('scanned_by'),
            'created_at DATETIME(3) NOT NULL',
            unique('uq_tickets_uuid', 'uuid'),
            index('ix_tickets_order', 'order_id'),
            fk('order_id', 'orders', 'CASCADE'),
            fk('order_item_id', 'order_items', 'CASCADE'),
        ]);

        await create('ticket_scans', [
            col.id,
            col.fk('ticket_id', true),
            col.fk('event_id', true),
            col.fk('merchant_id', true),
            "code_fingerprint CHAR(64) NOT NULL COMMENT 'sha256 of the scanned text'",
            col.fk('gate_id', true),
            'gate_name VARCHAR(80) NULL',
            "result ENUM('valid','duplicate','void','wrong_event','invalid') NOT NULL",
            col.by('user_id'),
            'device_hash CHAR(64) NULL',
            col.ip('ip'),
            'request_id CHAR(26) NULL',
            'scanned_at DATETIME(3) NOT NULL',
            index('ix_ticket_scans_event', 'event_id', 'scanned_at'),
            index('ix_ticket_scans_merchant', 'merchant_id', 'scanned_at'),
        ]);

        await create('refunds', [
            col.id,
            col.fk('order_id'),
            "kind ENUM('cancellation','refund') NOT NULL",
            col.money('amount'), col.money('fee'),
            'reason_code VARCHAR(60) NULL',
            'reason_text VARCHAR(255) NULL',
            "status ENUM('requested','approved','rejected','failed') NOT NULL DEFAULT 'requested'",
            col.by('requested_by'),
            col.by('reviewed_by'),
            'review_note VARCHAR(255) NULL',
            'gateway_ref VARCHAR(120) NULL',
            'requested_at DATETIME(3) NOT NULL',
            'processed_at DATETIME(3) NULL',
            index('ix_refunds_status', 'status', 'requested_at'),
            fk('order_id', 'orders', 'CASCADE'),
        ]);

        await create('order_transfers', [
            col.id,
            col.fk('order_id'),
            'from_name VARCHAR(150) NULL', 'from_phone VARCHAR(20) NULL',
            'to_name VARCHAR(150) NOT NULL', 'to_phone VARCHAR(20) NOT NULL',
            col.by('transferred_by'),
            'transferred_at DATETIME(3) NOT NULL',
            fk('order_id', 'orders', 'CASCADE'),
        ]);

        await create('settlement_ledger', [
            col.id,
            col.fk('merchant_id'),
            col.fk('order_id', true),
            "entry_type ENUM('gross','commission','fee','refund','payout','adjustment') NOT NULL",
            "direction ENUM('payable_to_merchant','receivable_from_merchant') NOT NULL",
            col.money('amount'),
            "pg_mode ENUM('platform','direct') NOT NULL",
            'note VARCHAR(255) NULL',
            'created_at DATETIME(3) NOT NULL',
            index('ix_settlement_ledger_merchant', 'merchant_id', 'created_at'),
            fk('merchant_id', 'merchants'),
        ]);
    }

    async down() {
        await drop('settlement_ledger', 'order_transfers', 'refunds', 'ticket_scans', 'tickets', 'payment_events', 'payments', 'order_items', 'orders', 'seat_hold_items', 'seat_holds');
    }
}

module.exports = CreateOrderPaymentTables;
