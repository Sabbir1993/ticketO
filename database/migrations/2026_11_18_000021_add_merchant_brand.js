const { DB } = use('App/Support/Migration');

// Merchant public page + theme: tagline, about text, two brand colours and a banner image.
// (logo_media_id already exists.) Brand images are the only public media; everything else stays private.
class AddMerchantBrand {
    async up() {
        await DB.statement('ALTER TABLE merchants ADD COLUMN tagline VARCHAR(160) NULL AFTER website');
        await DB.statement('ALTER TABLE merchants ADD COLUMN about VARCHAR(1200) NULL AFTER tagline');
        await DB.statement('ALTER TABLE merchants ADD COLUMN brand_primary CHAR(7) NULL AFTER about');
        await DB.statement('ALTER TABLE merchants ADD COLUMN brand_accent CHAR(7) NULL AFTER brand_primary');
        await DB.statement('ALTER TABLE merchants ADD COLUMN banner_media_id BIGINT UNSIGNED NULL AFTER logo_media_id');
    }

    async down() {
        for (const c of ['banner_media_id', 'brand_accent', 'brand_primary', 'about', 'tagline']) await DB.statement(`ALTER TABLE merchants DROP COLUMN ${c}`);
    }
}

module.exports = AddMerchantBrand;
