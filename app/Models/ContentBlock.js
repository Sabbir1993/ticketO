const Model = use('laranode/Database/Loquent/Model');

class ContentBlock extends Model {
    static table = 'content_blocks';
    static fillable = ['block_key', 'title', 'body', 'cta_label', 'cta_href', 'icon', 'data', 'is_active'];
    static casts = { data: 'json', is_active: 'boolean' };
}

module.exports = ContentBlock;
