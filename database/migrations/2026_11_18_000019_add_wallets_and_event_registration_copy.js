const { DB } = use('App/Support/Migration');

// 1) payment_methods.method_group (wallet | card | bank | other) so checkout can group the list.
// 2) Rocket / Upay / Easy wallet rows. They are inserted DISABLED: SSLCOMMERZ's channel identifier (multi_card_name)
//    and the store's channel activation must be confirmed first. Enable them in Admin → Payments.
// 3) "Sell tickets" → "Event Registration" for the CMS-managed copy (nav, content block, banner, home CTA).
class AddWalletsAndEventRegistrationCopy {
    async up() {
        await DB.statement("ALTER TABLE payment_methods ADD COLUMN method_group VARCHAR(12) NOT NULL DEFAULT 'other' AFTER color");
        const groups = { bkash: 'wallet', nagad: 'wallet', card: 'card', netbank: 'bank' };
        for (const [code, g] of Object.entries(groups)) await DB.statement("UPDATE payment_methods SET method_group = ? WHERE code = ? AND channel = 'online'", [g, code]);

        const now = new Date();
        const rows = [
            ['rocket', 'Rocket', 'Pay with your Rocket account', 'Smartphone', '#8c3494', 'wallet', null],
            ['upay', 'Upay', 'Pay with your Upay account', 'Smartphone', '#ffcb05', 'wallet', 'upay'],
            ['easy', 'Easy Wallet', 'Pay with your Easy wallet', 'Smartphone', '#00a859', 'wallet', null],
        ];
        for (const [code, name, subtitle, icon, color, group, mcn] of rows) {
            await DB.statement(
                "INSERT IGNORE INTO payment_methods (code, name, subtitle, icon, color, method_group, gateway, multi_card_name, channel, sort_order, is_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'sslcommerz', ?, 'online', 0, 0, ?, ?)",
                [code, name, subtitle, icon, color, group, mcn, now, now],
            );
        }
        const order = ['sslcommerz', 'bkash', 'nagad', 'rocket', 'upay', 'easy', 'card', 'netbank'];
        for (const [i, code] of order.entries()) await DB.statement("UPDATE payment_methods SET sort_order = ? WHERE code = ? AND channel = 'online'", [i, code]);

        // Copy only — the UI link and route (/merchant/register) are unchanged.
        await DB.statement("UPDATE nav_items SET label = 'Event Registration', icon = 'CalendarPlus' WHERE href = '/merchant/register' AND label IN ('Sell tickets', 'Become a merchant')");
        await DB.statement("UPDATE content_blocks SET title = 'Register your event on Ticketo', cta_label = 'Event Registration' WHERE block_key = 'footer_merchant_cta' AND title = 'Sell your event on Ticketo'").catch(() => {});
        await DB.statement("UPDATE banners SET title = 'Register your event', cta_label = 'Event Registration' WHERE title = 'Sell tickets for your event'").catch(() => {});
        await DB.statement("UPDATE home_sections SET title = 'Organising an event? Register it on Ticketo.' WHERE type = 'cta' AND title = 'Organising an event? Sell on Ticketo.'").catch(() => {});
    }

    async down() {
        await DB.statement("DELETE FROM payment_methods WHERE code IN ('rocket','upay','easy') AND channel = 'online'");
        await DB.statement('ALTER TABLE payment_methods DROP COLUMN method_group');
    }
}

module.exports = AddWalletsAndEventRegistrationCopy;
