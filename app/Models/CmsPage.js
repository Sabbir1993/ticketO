const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class CmsPage extends SoftDeletes(Model) {
    static table = 'cms_pages';
    static fillable = ['slug', 'title', 'kind', 'current_version_id', 'is_active'];
    static casts = { is_active: 'boolean' };

    versions() { return this.hasMany(use('App/Models/CmsPageVersion'), 'page_id'); }
}

module.exports = CmsPage;
