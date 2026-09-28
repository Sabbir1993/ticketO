const Model = use('laranode/Database/Loquent/Model');
const SoftDeletes = use('laranode/Database/Loquent/SoftDeletes');

class Faq extends SoftDeletes(Model) {
    static table = 'faqs';
    static fillable = ['category', 'question', 'answer', 'sort_order', 'is_active'];
    static casts = { is_active: 'boolean' };
}

module.exports = Faq;
