const { DB } = use('App/Support/Migration');

// Embed return target, widened in 000017 (JSON of the link, see OrderService.embedBase).
class AddOrderEmbedReturn {
    async up() {
        await DB.statement('ALTER TABLE orders ADD COLUMN embed_return VARCHAR(255) NULL AFTER channel');
    }

    async down() {
        await DB.statement('ALTER TABLE orders DROP COLUMN embed_return');
    }
}

module.exports = AddOrderEmbedReturn;
