const Model = use('laranode/Database/Loquent/Model');

class CmsPageVersion extends Model {
    static table = 'cms_page_versions';
    static timestamps = false;
    static fillable = ['page_id', 'version', 'title', 'body', 'effective_at', 'published_at', 'published_by', 'created_by', 'created_at'];
}

module.exports = CmsPageVersion;
