const Seeder = use('laranode/Database/Seeder');
const Geometry = use('App/Support/Geometry');
const LayoutService = use('App/Services/LayoutService');
const LayoutTemplate = use('App/Models/LayoutTemplate');

// Sample seat plans from the prototype (cricket oval, football, halls, cinema, open grounds,
// arena, GA lists), published as v1 with is_sample=1. Existing templates are left untouched.
class LayoutSeeder extends Seeder {
    async run() {
        const { seedTemplates } = await Geometry.load();
        let created = 0;
        for (const t of seedTemplates()) {
            if (await LayoutTemplate.withTrashed().where('slug', t.id).exists()) continue;
            const id = await LayoutService.create({ name: t.name, viewType: t.viewType, spec: t.spec, isSample: true, publish: true, notes: 'Sample layout' });
            await LayoutTemplate.where('id', id).update({ slug: t.id }); // keep prototype ids (tpl-cricket-oval …) as slugs
            created++;
        }
        console.log(`  sample layouts: ${created} created`);
    }
}

module.exports = LayoutSeeder;
