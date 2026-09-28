const { create, drop, fk, unique, index, col } = use('App/Support/Migration');

// CMS-managed content: navigation, versioned legal pages, FAQs, content blocks, banners, home layout.
class CreateContentTables {
    async up() {
        await create('nav_items', [
            col.id,
            col.fk('parent_id', true),
            "location VARCHAR(40) NOT NULL COMMENT 'header_top, drawer_customer, drawer_staff, footer_icons, footer_legal, cms_sidebar ...'",
            'label VARCHAR(120) NOT NULL',
            'icon VARCHAR(60) NULL',
            'href VARCHAR(255) NOT NULL',
            "audience ENUM('all','guest','customer','staff') NOT NULL DEFAULT 'all'",
            "permission VARCHAR(100) NULL COMMENT 'hide unless the viewer holds this permission'",
            col.bool('open_new_tab'),
            col.sort, col.active,
            col.timestamps,
            index('ix_nav_items_location', 'location', 'is_active', 'sort_order'),
            fk('parent_id', 'nav_items', 'CASCADE'),
        ]);

        await create('cms_pages', [
            col.id,
            'slug VARCHAR(80) NOT NULL',
            'title VARCHAR(190) NOT NULL',
            "kind ENUM('page','legal','agreement') NOT NULL DEFAULT 'page'",
            col.fk('current_version_id', true),
            col.active,
            col.timestamps, col.softDeletes,
            unique('uq_cms_pages_slug', 'slug'),
        ]);

        await create('cms_page_versions', [
            col.id,
            col.fk('page_id'),
            'version INT NOT NULL',
            'title VARCHAR(190) NOT NULL',
            'body MEDIUMTEXT NOT NULL',
            'effective_at DATETIME(3) NULL',
            'published_at DATETIME(3) NULL',
            col.by('published_by'),
            col.by('created_by'),
            'created_at DATETIME(3) NULL',
            unique('uq_cms_page_versions', 'page_id', 'version'),
            fk('page_id', 'cms_pages', 'CASCADE'),
        ]);

        await create('faqs', [
            col.id,
            "category VARCHAR(60) NOT NULL DEFAULT 'general'",
            'question VARCHAR(255) NOT NULL',
            'answer TEXT NOT NULL',
            col.sort, col.active,
            col.timestamps, col.softDeletes,
        ]);

        await create('content_blocks', [
            col.id,
            'block_key VARCHAR(80) NOT NULL',
            'title VARCHAR(190) NULL',
            'body TEXT NULL',
            'cta_label VARCHAR(80) NULL',
            'cta_href VARCHAR(255) NULL',
            'icon VARCHAR(60) NULL',
            'data JSON NULL',
            col.active,
            col.timestamps,
            unique('uq_content_blocks_key', 'block_key'),
        ]);

        await create('banners', [
            col.id,
            'title VARCHAR(190) NOT NULL',
            'subtitle VARCHAR(255) NULL',
            'badge VARCHAR(40) NULL',
            'cta_label VARCHAR(80) NULL',
            'href VARCHAR(255) NULL',
            'palette JSON NULL',
            col.fk('image_media_id', true),
            col.fk('city_id', true),
            'starts_at DATETIME(3) NULL', 'ends_at DATETIME(3) NULL',
            col.sort, col.active,
            col.timestamps, col.softDeletes,
            index('ix_banners_active', 'is_active', 'sort_order'),
        ]);

        await create('home_sections', [
            col.id,
            "type ENUM('banners','row','categories','cta') NOT NULL",
            'title VARCHAR(190) NULL',
            "config JSON NULL COMMENT 'row: categories[], sort, limit, tag; cta: sub, cta, href, icon'",
            col.bool('is_hidden'),
            col.sort,
            col.timestamps,
        ]);
    }

    async down() {
        await drop('home_sections', 'banners', 'content_blocks', 'faqs', 'cms_page_versions', 'cms_pages', 'nav_items');
    }
}

module.exports = CreateContentTables;
