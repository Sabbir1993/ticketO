const Seeder = use('laranode/Database/Seeder');
const DB = use('laranode/Support/Facades/DB');
const City = use('App/Models/City');
const LayoutTemplate = use('App/Models/LayoutTemplate');
const Venue = use('App/Models/Venue');
const VenueGate = use('App/Models/VenueGate');
const Merchant = use('App/Models/Merchant');
const { uuid, slugify } = use('App/Support/Ids');

// Demo data for local / staging only (never runs when APP_ENV=production).
// Merchants are created WITHOUT users or passwords and WITHOUT gateway credentials.
const VENUES = [
    ['Rupali Cinemas: Bashundhara City', 'dhaka', 'Level 8, Bashundhara City, Panthapath, Dhaka', 'cinema', ['parking', 'food-court', 'wheelchair'], ['tpl-cinema-std'], ['Main entrance']],
    ['Rupali Cinemas: Mirpur 10', 'dhaka', 'Mirpur 10 Circle, Dhaka', 'cinema', ['food-court'], ['tpl-cinema-std'], ['Main entrance']],
    ['Rupali Cinemas: GEC Circle', 'chattogram', 'GEC Circle, Chattogram', 'cinema', ['parking'], ['tpl-cinema-std'], ['Main entrance']],
    ['National Cricket Stadium, Mirpur', 'dhaka', 'Mirpur 2, Dhaka', 'stadium', ['parking', 'first-aid'], ['tpl-cricket-oval'], ['Gate 1', 'Gate 2', 'Gate 3', 'VIP Gate']],
    ['Kamalapur Football Stadium', 'dhaka', 'Kamalapur, Dhaka', 'stadium', ['parking', 'first-aid'], ['tpl-football-rect'], ['North Gate', 'South Gate', 'VIP Gate']],
    ['Zahur Ahmed Chowdhury Stadium', 'chattogram', 'Sagorika, Chattogram', 'stadium', ['parking'], ['tpl-cricket-oval', 'tpl-football-rect'], ['Gate 1', 'Gate 2']],
    ['Purbachal Open Ground', 'dhaka', 'Purbachal, Dhaka', 'open-field', ['parking', 'food-stalls', 'first-aid'], ['tpl-open-concert', 'tpl-open-fair'], ['Gate A', 'Gate B', 'VIP Gate']],
    ['Dhaka Indoor Arena', 'dhaka', 'Mirpur 1, Dhaka', 'arena', ['parking', 'ac', 'food-court'], ['tpl-arena-round', 'tpl-open-concert'], ['North Gate', 'South Gate']],
    ['National Theatre Hall', 'dhaka', 'Segunbagicha, Dhaka', 'hall', ['wheelchair'], ['tpl-hall-national'], ['Main entrance']],
    ['Bay Convention Centre', 'dhaka', 'Agargaon, Dhaka', 'hall', ['parking', 'wifi', 'lunch'], ['tpl-ga-conference', 'tpl-ga-comedy', 'tpl-hall-small'], ['Registration desk']],
    ["Laboni Beach Point", 'coxsbazar', "Laboni Point, Cox's Bazar", 'open-field', ['food-stalls'], ['tpl-open-concert'], ['Beach gate']],
    ['Khulna Circuit House Ground', 'khulna', 'Circuit House Road, Khulna', 'open-field', [], ['tpl-open-fair'], ['Main gate']],
    ['Online (link after booking)', 'online', 'Link shared by SMS & email', 'online', [], ['tpl-ga-webinar', 'tpl-ga-conference'], []],
];

const MERCHANTS = [
    ['Rupali Cinemas', 'cinema-theatre', 8],
    ['Pulse Live Entertainment', 'concert-promoter', 10],
    ['Dhaka Sports Club Ltd', 'sports-club', 7],
    ['Mancha Theatre Collective', 'cinema-theatre', 6],
    ['Horizon Events Ltd', 'corporate', 9],
];

class DemoSeeder extends Seeder {
    async run() {
        const now = new Date();
        const city = Object.fromEntries((await City.select('id', 'slug').get()).map((r) => [r.slug, r.id]));
        const tpl = Object.fromEntries((await LayoutTemplate.withTrashed().select('id', 'slug').get()).map((r) => [r.slug, r.id]));

        for (const [name, c, address, type, facilities, templates, gates] of VENUES) {
            const slug = slugify(name);
            if (await Venue.withTrashed().where('slug', slug).exists()) continue;
            const { id } = await Venue.create({ uuid: uuid(), slug, name, city_id: city[c], address, type });
            if (facilities.length) await DB.table('venue_facilities').insert(facilities.map((code) => ({ venue_id: id, code })));
            const tplIds = templates.filter((t) => tpl[t]).map((t) => ({ venue_id: id, template_id: tpl[t] }));
            if (tplIds.length) await DB.table('venue_templates').insert(tplIds);
            for (const [i, g] of gates.entries()) await VenueGate.create({ venue_id: id, name: g, sort_order: i });
        }

        for (const [name, businessType, commission] of MERCHANTS) {
            const slug = slugify(name);
            if (await Merchant.withTrashed().where('slug', slug).exists()) continue;
            await Merchant.create({
                uuid: uuid(), name, slug, business_type: businessType, status: 'active', commission_pct: commission, legal_name: name,
                trade_license: `DEMO-${slug.slice(0, 10).toUpperCase()}`, pg_mode: 'platform', kyc_status: 'verified', kyc_reviewed_at: now,
            });
        }
        console.log(`  demo venues: ${VENUES.length}, merchants: ${MERCHANTS.length}`);
    }
}

module.exports = DemoSeeder;
