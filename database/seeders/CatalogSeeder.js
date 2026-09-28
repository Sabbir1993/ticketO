const Seeder = use('laranode/Database/Seeder');
const ViewType = use('App/Models/ViewType');
const LayoutTemplate = use('App/Models/LayoutTemplate');
const Category = use('App/Models/Category');
const Promo = use('App/Models/Promo');
const R = require('./data/reference');

const idsBySlug = async (Model) => Object.fromEntries((await Model.select('id', 'slug').get()).map((r) => [r.slug, r.id]));

// Categories (→ view type + default sample layout) and platform promo codes.
class CatalogSeeder extends Seeder {
    async run() {
        const vt = await idsBySlug(ViewType);
        const tpl = await idsBySlug(LayoutTemplate.withTrashed());
        const cat = await idsBySlug(Category.withTrashed());

        for (const [i, [slug, name, icon, color, viewType, template, peopleLabel, parent]] of R.categories.entries()) {
            if (cat[slug]) continue;
            cat[slug] = (await Category.create({
                parent_id: parent ? cat[parent] : null, slug, name, icon, color, view_type_id: vt[viewType], default_template_id: tpl[template] || null,
                people_label: peopleLabel, sort_order: i,
            })).id;
        }
        for (const [code, type, value, max_discount, min_order, description, scope, usage_limit, per_customer_limit] of R.promos) {
            if (await Promo.withTrashed().where('code', code).whereNull('event_id').exists()) continue;
            await Promo.create({ code, type, value, max_discount, min_order, description, category_id: scope ? cat[scope] : null, usage_limit, per_customer_limit });
        }
    }
}

module.exports = CatalogSeeder;
