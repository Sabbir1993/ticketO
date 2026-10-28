const { DB } = use('App/Support/Migration');

// Embed return target is now JSON {s, id, o}: the link's scope, id and allowed sites (see OrderService.embedBase).
class WidenOrderEmbedReturn {
    async up() {
        await DB.statement('ALTER TABLE orders MODIFY embed_return VARCHAR(1024) NULL');
    }

    async down() {
        await DB.statement('ALTER TABLE orders MODIFY embed_return VARCHAR(255) NULL');
    }
}

module.exports = WidenOrderEmbedReturn;
