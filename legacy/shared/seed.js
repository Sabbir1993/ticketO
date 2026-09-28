// Seed data for a fresh database. Dates are relative to the moment of seeding
// (run `npm run seed` to refresh). Recurring movie shows are generated on the fly.
import { seedTemplates } from './templates.js';

const DAY = 86400000;
const at = (base, offsetDays, hh, mm = 0) => { const d = new Date(base); d.setHours(0, 0, 0, 0); d.setTime(d.getTime() + offsetDays * DAY); d.setHours(hh, mm, 0, 0); return d.toISOString(); };

export const DEFAULT_CONFIG = {
  platform: {
    name: 'Ticketo', currency: 'BDT', convenienceFeePct: 3.5, vatOnFeePct: 15, defaultCommissionPct: 8, holdMinutes: 8,
    maxTicketsPerOrder: 10, allowGuestCheckout: true,
    merchantAutoApprove: false, // true → new merchants can sell immediately (no KYC review)
    eventRequiresApproval: false, // true → merchant "Publish" sends the event to admin review first
    allowMerchantDirectPG: true, // merchants may connect their own gateway account (money settles to them directly)
  },
  categories: [
    { id: 'movies', name: 'Movies', icon: 'Film', viewType: 'cinema', templateId: 'tpl-cinema-std', subCategories: [] },
    { id: 'sports', name: 'Sports', icon: 'Trophy', viewType: 'ga-list', templateId: 'tpl-ga-run', subCategories: [
      { id: 'cricket', name: 'Cricket', viewType: 'stadium-cricket', templateId: 'tpl-cricket-oval' },
      { id: 'football', name: 'Football', viewType: 'stadium-football', templateId: 'tpl-football-rect' },
      { id: 'running', name: 'Running / marathon', viewType: 'ga-list', templateId: 'tpl-ga-run' },
      { id: 'combat', name: 'Boxing / MMA / Kabaddi', viewType: 'open-field', templateId: 'tpl-arena-round' },
    ] },
    { id: 'concerts', name: 'Concerts', icon: 'Music', viewType: 'open-field', templateId: 'tpl-open-concert', subCategories: [
      { id: 'open-air', name: 'Open air', viewType: 'open-field', templateId: 'tpl-open-concert' },
      { id: 'indoor', name: 'Indoor (hall)', viewType: 'hall', templateId: 'tpl-hall-national' },
    ] },
    { id: 'theater', name: 'Theater', icon: 'Theater', viewType: 'hall', templateId: 'tpl-hall-national', subCategories: [] },
    { id: 'comedy', name: 'Comedy', icon: 'Laugh', viewType: 'ga-list', templateId: 'tpl-ga-comedy', subCategories: [] },
    { id: 'seminars', name: 'Seminars', icon: 'Presentation', viewType: 'ga-list', templateId: 'tpl-ga-conference', subCategories: [] },
    { id: 'workshops', name: 'Workshops', icon: 'Wrench', viewType: 'ga-list', templateId: 'tpl-ga-conference', subCategories: [] },
    { id: 'fairs', name: 'Fairs', icon: 'Tent', viewType: 'open-field', templateId: 'tpl-open-fair', subCategories: [] },
    { id: 'webinars', name: 'Webinars', icon: 'Laptop', viewType: 'ga-list', templateId: 'tpl-ga-webinar', subCategories: [] },
  ],
  payment: {
    // Customer-facing methods. `gateway` picks the adapter; `multiCardName` pre-selects the channel on the SSLCOMMERZ page.
    methods: [
      { id: 'sslcommerz', name: 'SSLCOMMERZ', sub: 'Cards, mobile & internet banking', icon: 'ShieldCheck', color: '#1e5aa8', enabled: true, gateway: 'sslcommerz', multiCardName: '' },
      { id: 'bkash', name: 'bKash', sub: 'Pay with your bKash account', icon: 'Smartphone', color: '#e2136e', enabled: true, gateway: 'sslcommerz', multiCardName: 'bkash' },
      { id: 'nagad', name: 'Nagad', sub: 'Pay with your Nagad account', icon: 'Smartphone', color: '#f6921e', enabled: true, gateway: 'sslcommerz', multiCardName: 'nagad' },
      { id: 'card', name: 'Credit / Debit Card', sub: 'Visa, Mastercard, Amex', icon: 'CreditCard', color: '#333545', enabled: true, gateway: 'sslcommerz', multiCardName: 'visacard,mastercard,amexcard' },
      { id: 'netbank', name: 'Internet Banking', sub: 'All major BD banks', icon: 'Landmark', color: '#2a9d8f', enabled: true, gateway: 'sslcommerz', multiCardName: 'internetbank' },
    ],
    gateways: {
      sslcommerz: { enabled: true, sandbox: true, storeId: 'testbox', storePassword: 'qwerty' },
      bkash: { enabled: false, sandbox: true, appKey: '', appSecret: '', username: '', password: '' },
      simulator: { enabled: true }, // used when a real gateway is unreachable (offline demo)
    },
  },
  promos: [
    { code: 'WELCOME100', type: 'flat', value: 100, minOrder: 500, desc: '৳100 off your first booking', scope: 'all', active: true, used: 0, limit: 5000 },
    { code: 'MONSOON20', type: 'pct', value: 20, max: 1000, minOrder: 1000, desc: '20% off concerts', scope: 'concerts', active: true, used: 0, limit: 1000 },
    { code: 'MATCHDAY10', type: 'pct', value: 10, max: 300, minOrder: 500, desc: '10% off sports tickets', scope: 'sports', active: true, used: 0, limit: 2000 },
  ],
  // White-label theme — SSL Wireless palette by default. Editable in Admin → Branding.
  branding: { name: 'Ticketo', tagline: 'Powered by SSL Wireless', primary: '#2D499A', accent: '#EE3240', dark: '#0F172A', radius: 12, font: 'Inter' },
  // Home page is a list of sections — reorder / add / remove from Admin → Home page.
  home: [
    { id: 'h1', type: 'banners' },
    { id: 'h2', type: 'row', title: 'Recommended Movies', categories: ['movies'], sort: 'score' },
    { id: 'h3', type: 'row', title: 'Cricket & Football', categories: ['sports'], sort: 'date' },
    { id: 'h4', type: 'cta', title: 'Organising an event? Sell on Ticketo.', sub: 'Self-onboard as a merchant, connect your own SSLCOMMERZ / bKash account, design your own venue layout and publish.', cta: 'Get started', href: '/merchant/register' },
    { id: 'h5', type: 'categories', title: 'The Best of Live Events' },
    { id: 'h6', type: 'row', title: 'Concerts & Festivals', categories: ['concerts', 'fairs'], sort: 'date' },
    { id: 'h7', type: 'row', title: 'Theater, Comedy & Talks', categories: ['theater', 'comedy', 'seminars', 'workshops', 'webinars'], sort: 'date' },
  ],
  banners: [
    { id: 'b1', title: 'Dhaka T20 League — The Final', sub: 'Pick your block in the oval · Under lights', cta: 'Choose seats', href: '/events/dhaka-t20-league-final', palette: ['#1E3A8A', '#3B82F6'] },
    { id: 'b2', title: 'Monsoon Beats Live 2026', sub: 'Fan pit · VIP deck · 7 bands at Purbachal', cta: 'Book now', href: '/events/monsoon-beats-live-2026', palette: ['#9F1239', '#EE3240'] },
    { id: 'b3', title: 'Sell tickets for your event', sub: 'Sign up as a merchant, connect your gateway and publish in minutes', cta: 'Become a merchant', href: '/merchant/register', palette: ['#0F172A', '#2D499A'] },
  ],
};

export const CITIES = [
  { id: 'dhaka', name: 'Dhaka' }, { id: 'chattogram', name: 'Chattogram' }, { id: 'sylhet', name: 'Sylhet' },
  { id: 'khulna', name: 'Khulna' }, { id: 'rajshahi', name: 'Rajshahi' }, { id: 'coxsbazar', name: "Cox's Bazar" }, { id: 'online', name: 'Online' },
];

const VENUES = [
  { id: 'v-cmx-bash', name: 'Rupali Cinemas: Bashundhara City', city: 'dhaka', address: 'Level 8, Bashundhara City, Panthapath, Dhaka', type: 'cinema', facilities: ['Parking', 'Food court', 'Wheelchair'], templateIds: ['tpl-cinema-std'] },
  { id: 'v-cmx-mirpur', name: 'Rupali Cinemas: Mirpur 10', city: 'dhaka', address: 'Mirpur 10 Circle, Dhaka', type: 'cinema', facilities: ['Food court'], templateIds: ['tpl-cinema-std'] },
  { id: 'v-cmx-gec', name: 'Rupali Cinemas: GEC Circle', city: 'chattogram', address: 'GEC Circle, Chattogram', type: 'cinema', facilities: ['Parking'], templateIds: ['tpl-cinema-std'] },
  { id: 'v-stadium', name: 'National Cricket Stadium, Mirpur', city: 'dhaka', address: 'Mirpur 2, Dhaka', type: 'stadium', facilities: ['Parking', 'First aid'], templateIds: ['tpl-cricket-oval'] },
  { id: 'v-football', name: 'Kamalapur Football Stadium', city: 'dhaka', address: 'Kamalapur, Dhaka', type: 'stadium', facilities: ['Parking', 'First aid'], templateIds: ['tpl-football-rect'] },
  { id: 'v-ctg-stadium', name: 'Zahur Ahmed Chowdhury Stadium', city: 'chattogram', address: 'Sagorika, Chattogram', type: 'stadium', facilities: ['Parking'], templateIds: ['tpl-cricket-oval', 'tpl-football-rect'] },
  { id: 'v-arena', name: 'Purbachal Open Ground', city: 'dhaka', address: 'Purbachal, Dhaka', type: 'open-field', facilities: ['Parking', 'Food stalls', 'First aid'], templateIds: ['tpl-open-concert', 'tpl-open-fair'] },
  { id: 'v-indoor', name: 'Dhaka Indoor Arena', city: 'dhaka', address: 'Mirpur 1, Dhaka', type: 'arena', facilities: ['Parking', 'AC', 'Food court'], templateIds: ['tpl-arena-round', 'tpl-open-concert'] },
  { id: 'v-hall', name: 'National Theatre Hall', city: 'dhaka', address: 'Segunbagicha, Dhaka', type: 'hall', facilities: ['Wheelchair'], templateIds: ['tpl-hall-national'] },
  { id: 'v-conv', name: 'Bay Convention Centre', city: 'dhaka', address: 'Agargaon, Dhaka', type: 'hall', facilities: ['Parking', 'Wi-Fi', 'Lunch'], templateIds: ['tpl-ga-conference', 'tpl-ga-comedy', 'tpl-hall-small'] },
  { id: 'v-beach', name: 'Laboni Beach Point', city: 'coxsbazar', address: "Laboni Point, Cox's Bazar", type: 'open-field', facilities: ['Food stalls'], templateIds: ['tpl-open-concert'] },
  { id: 'v-khulna', name: 'Khulna Circuit House Ground', city: 'khulna', address: 'Circuit House Road, Khulna', type: 'open-field', facilities: [], templateIds: ['tpl-open-fair'] },
  { id: 'v-online', name: 'Online (link after booking)', city: 'online', address: 'Link shared by SMS & email', type: 'online', facilities: [], templateIds: ['tpl-ga-webinar', 'tpl-ga-conference'] },
];

const MERCHANTS = [
  ['m-rupali', 'Rupali Cinemas', 'Cinema chain', 'rupali@ticketo.demo', 8, 'platform'],
  ['m-pulse', 'Pulse Live Entertainment', 'Concert promoter', 'pulse@ticketo.demo', 10, 'direct'],
  ['m-dsc', 'Dhaka Sports Club Ltd', 'Sports', 'sports@ticketo.demo', 7, 'platform'],
  ['m-mancha', 'Mancha Theatre Collective', 'Theater company', 'mancha@ticketo.demo', 6, 'platform'],
  ['m-horizon', 'Horizon Events Ltd', 'Corporate & conferences', 'horizon@ticketo.demo', 9, 'platform'],
];

const policy = { refundable: true, cancellable: true, transferable: true, refundWindowHrs: 24, cancellationFeePct: 10 };

function events(now) {
  const T = (tpl) => seedTemplates().find((t) => t.id === tpl).spec.tiers;
  const tiers = (tpl, prices, extra = {}) => T(tpl).filter((t) => prices[t.id] !== undefined).map((t) => ({ ...t, price: prices[t.id], ...(extra[t.id] || {}) }));
  const eb = (price, days) => ({ earlyBird: { price, until: at(now, days, 23, 59) } });
  const base = { score: 0, votes: 0, tags: [], cast: [], sponsors: [], policy, bookingLimit: 8, status: 'published', demoFill: 0.35, promos: [] };
  const movie = (o) => ({ ...base, category: 'movies', subCategory: null, viewType: 'cinema', templateId: 'tpl-cinema-std', merchantId: 'm-rupali', bookingLimit: 10,
    tiers: tiers('tpl-cinema-std', { recliner: 950, premium: 600, regular: 400 }), ...o });
  return [
    movie({ id: 'e1', slug: 'nodir-opare', title: 'Nodir Opare', genres: ['Drama', 'Romance'], language: 'Bangla', format: ['2D'], duration: '2h 24m', certificate: 'U/A', score: 92, votes: 18400, releaseDate: at(now, -12, 0), palette: ['#0f3b5f', '#e76f51'], tags: ['trending'],
      description: 'Two strangers on a river ferry from Barishal discover their lives are bound by a promise made thirty years ago. A sweeping, heartfelt story of love, loss and homecoming.',
      cast: [{ name: 'Arif Hasan', role: 'Rafiq' }, { name: 'Nusrat Jahan', role: 'Tara' }, { name: 'Kamal Uddin', role: 'Boatman' }, { name: 'Sadia Rahman', role: 'Director' }],
      venueIds: ['v-cmx-bash', 'v-cmx-mirpur', 'v-cmx-gec'], schedule: { type: 'recurring', times: ['10:30', '13:45', '16:50', '20:00'], days: 7 } }),
    movie({ id: 'e2', slug: 'operation-sundarban-2', title: 'Operation Sundarban 2', genres: ['Action', 'Thriller'], language: 'Bangla', format: ['2D', 'IMAX'], duration: '2h 38m', certificate: 'A', score: 88, votes: 32150, releaseDate: at(now, -5, 0), palette: ['#1b4332', '#d4a017'], tags: ['trending', 'new'],
      description: 'An elite unit goes deep into the mangrove forest to stop a smuggling syndicate — but the jungle has its own rules.',
      cast: [{ name: 'Tanvir Ahmed', role: 'Maj. Asif' }, { name: 'Farzana Akter', role: 'Nila' }], venueIds: ['v-cmx-bash', 'v-cmx-mirpur', 'v-cmx-gec'], schedule: { type: 'recurring', times: ['11:00', '14:30', '18:00', '21:30'], days: 7 } }),
    movie({ id: 'e3', slug: 'megher-rong', title: 'Megher Rong', genres: ['Family', 'Comedy'], language: 'Bangla', format: ['2D'], duration: '2h 05m', certificate: 'U', score: 81, votes: 6400, releaseDate: at(now, -20, 0), palette: ['#5a189a', '#48cae4'],
      description: 'A chaotic joint family in Old Dhaka tries to pull off the perfect wedding during the monsoon.', cast: [{ name: 'Motin Ali', role: 'Baba' }, { name: 'Tania Khan', role: 'Mitu' }], venueIds: ['v-cmx-bash'], schedule: { type: 'recurring', times: ['12:15', '15:30', '19:10'], days: 7 } }),
    movie({ id: 'e4', slug: 'the-last-monsoon', title: 'The Last Monsoon', genres: ['Sci-Fi', 'Adventure'], language: 'English', format: ['2D', '3D'], duration: '2h 45m', certificate: 'U/A', score: 90, votes: 54000, releaseDate: at(now, -8, 0), palette: ['#03045e', '#00b4d8'], tags: ['trending'],
      description: 'In 2089 the monsoon has stopped. A climate pilot flies into the last storm on Earth to bring the rain back.', cast: [{ name: 'Ava Lindqvist', role: 'Capt. Mara' }], venueIds: ['v-cmx-bash', 'v-cmx-mirpur', 'v-cmx-gec'], schedule: { type: 'recurring', times: ['10:00', '13:30', '17:00', '20:30'], days: 7 } }),

    { ...base, id: 'e10', slug: 'dhaka-t20-league-final', title: 'Dhaka T20 League — Final', category: 'sports', subCategory: 'cricket', viewType: 'stadium-cricket', templateId: 'tpl-cricket-oval', merchantId: 'm-dsc',
      genres: ['Cricket', 'T20'], language: '—', duration: '4 hours', certificate: 'All ages', score: 97, votes: 22100, palette: ['#006d77', '#83c5be'], tags: ['trending'], bookingLimit: 6,
      description: 'Dhaka Dynamos vs Chattogram Kings — the title decider under lights. Pick your block around the oval.',
      cast: [{ name: 'Dhaka Dynamos', role: 'Team' }, { name: 'Chattogram Kings', role: 'Team' }], sponsors: ['Orbit Electronics'], venueIds: ['v-stadium'],
      shows: [{ id: 'e10-s1', date: at(now, 3, 18, 30), label: 'Final' }], demoFill: 0.45,
      tiers: tiers('tpl-cricket-oval', { vip: 3500, club: 1800, grand: 800, general: 500, upper: 400, gallery: 200 }), policy: { ...policy, refundable: false, cancellable: false } },
    { ...base, id: 'e11', slug: 'bangladesh-football-cup-semi', title: 'Bangladesh Football Cup — Semi-final', category: 'sports', subCategory: 'football', viewType: 'stadium-football', templateId: 'tpl-football-rect', merchantId: 'm-dsc',
      genres: ['Football'], language: '—', duration: '2 hours', certificate: 'All ages', score: 91, votes: 4300, palette: ['#004b23', '#95d5b2'], tags: [], bookingLimit: 6,
      description: 'Dhanmondi Blues vs Motijheel Whites — the oldest rivalry in Bangladeshi football.', cast: [{ name: 'Dhanmondi Blues', role: 'Team' }, { name: 'Motijheel Whites', role: 'Team' }],
      venueIds: ['v-football'], shows: [{ id: 'e11-s1', date: at(now, 10, 16), label: 'Semi-final 1' }], demoFill: 0.3,
      tiers: tiers('tpl-football-rect', { vip: 2500, premium: 1200, standard: 600, economy: 350, family: 500, terrace: 250, away: 300 }) },
    { ...base, id: 'e12', slug: 'dhaka-city-marathon-2026', title: 'Dhaka City Marathon 2026', category: 'sports', subCategory: 'running', viewType: 'ga-list', templateId: 'tpl-ga-run', merchantId: 'm-dsc',
      genres: ['Running'], language: '—', duration: 'Full day', certificate: '16+', score: 93, votes: 2100, palette: ['#e63946', '#1d3557'], tags: ['early-bird'], bookingLimit: 4,
      description: 'Run through Hatirjheel and Manik Mia Avenue. Bib, T-shirt, medal and timing chip included.', venueIds: ['v-stadium'], shows: [{ id: 'e12-s1', date: at(now, 30, 5, 30), label: 'Race day' }],
      tiers: tiers('tpl-ga-run', { full: 3000, half: 2000, fun: 800 }, { full: eb(2500, 12) }), demoFill: 0.4, policy: { ...policy, refundable: false } },

    { ...base, id: 'e19', slug: 'fight-night-dhaka', title: 'Fight Night Dhaka — Title Bout', category: 'sports', subCategory: 'combat', viewType: 'open-field', templateId: 'tpl-arena-round', merchantId: 'm-dsc',
      genres: ['Boxing'], language: '—', duration: '4 hours', certificate: '16+', score: 92, votes: 1900, palette: ['#0F172A', '#EE3240'], tags: ['new'], bookingLimit: 6,
      description: 'Eight bouts, one championship belt. Ringside, floor standing and two bowls around the ring — pick your exact seat.',
      cast: [{ name: 'Rakib "Storm" Hasan', role: 'Champion' }, { name: 'Tanvir Iqbal', role: 'Challenger' }], venueIds: ['v-indoor'],
      shows: [{ id: 'e19-s1', date: at(now, 12, 19), label: 'Main card' }], demoFill: 0.35,
      tiers: tiers('tpl-arena-round', { ringside: 6000, floor: 1500, lower: 2000, upper: 800 }) },
    { ...base, id: 'e7', slug: 'monsoon-beats-live-2026', title: 'Monsoon Beats Live 2026', category: 'concerts', subCategory: 'open-air', viewType: 'open-field', templateId: 'tpl-open-concert', merchantId: 'm-pulse',
      genres: ['Rock', 'Pop'], language: 'Bangla', duration: '6 hours', certificate: '12+', score: 94, votes: 3100, palette: ['#7b2cbf', '#ff006e'], tags: ['trending', 'early-bird'],
      description: "Seven of Bangladesh's biggest bands, one massive stage. Fan pit, VIP decks and a sky lounge. Gates open at 3 PM.",
      cast: [{ name: 'The Riverside Band', role: 'Headliner' }, { name: 'Shohor', role: 'Rock' }, { name: 'Kaktaal', role: 'Indie' }], sponsors: ['Nova Telecom', 'FreshSip'],
      venueIds: ['v-arena'], shows: [{ id: 'e7-s1', date: at(now, 17, 15), label: 'Day 1' }, { id: 'e7-s2', date: at(now, 18, 15), label: 'Day 2' }], demoFill: 0.55,
      tiers: tiers('tpl-open-concert', { fanpit: 3500, vip: 8000, ga: 1500, lounge: 15000 }, { fanpit: eb(2800, 5), ga: eb(1200, 5) }), policy: { ...policy, refundable: false, cancellable: false } },
    { ...base, id: 'e9', slug: 'beach-sunset-sessions', title: 'Beach Sunset Sessions', category: 'concerts', subCategory: 'open-air', viewType: 'open-field', templateId: 'tpl-open-concert', merchantId: 'm-pulse',
      genres: ['EDM', 'Acoustic'], language: 'Mixed', duration: '5 hours', certificate: '18+', score: 89, votes: 870, palette: ['#f77f00', '#003049'], tags: ['early-bird'],
      description: "Acoustic sets at sunset, DJs till midnight — right on the world's longest sea beach.", venueIds: ['v-beach'], shows: [{ id: 'e9-s1', date: at(now, 24, 16), label: 'Saturday' }],
      tiers: tiers('tpl-open-concert', { fanpit: 2500, vip: 6000, ga: 1800 }), blockOverrides: { SL: { enabled: false } }, demoFill: 0.3 },
    { ...base, id: 'e8', slug: 'sufi-night-dhaka', title: 'Sufi Night: Qawwali Under the Stars', category: 'concerts', subCategory: 'indoor', viewType: 'hall', templateId: 'tpl-hall-national', merchantId: 'm-pulse',
      genres: ['Sufi', 'Folk'], language: 'Urdu / Bangla', duration: '3 hours', certificate: 'All ages', score: 96, votes: 1250, palette: ['#3c096c', '#ffba08'],
      description: 'An evening of soulful qawwali and baul music with guest folk artists.', venueIds: ['v-hall'], shows: [{ id: 'e8-s1', date: at(now, 6, 19, 30), label: 'Evening show' }],
      tiers: tiers('tpl-hall-national', { vip: 2500, gold: 1500, silver: 800, balcony: 600 }) },

    { ...base, id: 'e13', slug: 'raktakarabi', title: 'Raktakarabi (Red Oleanders)', category: 'theater', subCategory: null, viewType: 'hall', templateId: 'tpl-hall-national', merchantId: 'm-mancha',
      genres: ['Classic', 'Drama'], language: 'Bangla', duration: '2h 15m', certificate: 'All ages', score: 95, votes: 1800, palette: ['#9d0208', '#ffba08'],
      description: "Tagore's timeless allegory of greed and freedom, reimagined with live music and shadow-play.", venueIds: ['v-hall'],
      shows: [{ id: 'e13-s1', date: at(now, 2, 19), label: 'Evening' }, { id: 'e13-s2', date: at(now, 4, 15), label: 'Matinee' }, { id: 'e13-s3', date: at(now, 4, 19), label: 'Evening' }],
      tiers: tiers('tpl-hall-national', { vip: 2000, gold: 1200, silver: 700, balcony: 500 }) },
    { ...base, id: 'e14', slug: 'stand-up-night-dhaka', title: 'Stand-up Night Dhaka', category: 'comedy', subCategory: null, viewType: 'ga-list', templateId: 'tpl-ga-comedy', merchantId: 'm-horizon',
      genres: ['Stand-up'], language: 'Bangla / English', duration: '1h 45m', certificate: '16+', score: 87, votes: 640, palette: ['#ffbe0b', '#3a0ca3'], tags: ['new'],
      description: 'Five comics, one mic, zero chill. Traffic jams, in-laws and startup life — nothing is safe.', venueIds: ['v-conv'], shows: [{ id: 'e14-s1', date: at(now, 8, 20), label: 'Friday' }],
      tiers: tiers('tpl-ga-comedy', { front: 1500, general: 900 }), demoFill: 0.8 },
    { ...base, id: 'e15', slug: 'bangladesh-fintech-summit-2026', title: 'Bangladesh Fintech Summit 2026', category: 'seminars', subCategory: null, viewType: 'ga-list', templateId: 'tpl-ga-conference', merchantId: 'm-horizon',
      genres: ['Fintech', 'Business'], language: 'English', duration: '2 days', certificate: 'Professionals', score: 90, votes: 520, palette: ['#023e8a', '#90e0ef'], tags: ['early-bird'],
      description: 'Regulators, banks, MFS leaders and founders on the future of digital payments in Bangladesh.', sponsors: ['PayFast', 'Meridian Bank'], venueIds: ['v-conv'],
      shows: [{ id: 'e15-s1', date: at(now, 14, 9), label: 'Day 1' }, { id: 'e15-s2', date: at(now, 15, 9), label: 'Day 2' }],
      tiers: tiers('tpl-ga-conference', { delegate: 5000, student: 1000, vip: 15000 }, { delegate: eb(3500, 4) }), demoFill: 0.4 },
    { ...base, id: 'e17', slug: 'khulna-book-food-fair', title: 'Khulna Book & Food Fair', category: 'fairs', subCategory: null, viewType: 'open-field', templateId: 'tpl-open-fair', merchantId: 'm-horizon',
      genres: ['Books', 'Food'], language: 'Bangla', duration: '5 days', certificate: 'All ages', score: 88, votes: 3400, palette: ['#606c38', '#dda15e'],
      description: '120 publishers, 60 food stalls, author signings and a kids zone.', venueIds: ['v-khulna'], shows: [0, 1, 2, 3, 4].map((i) => ({ id: `e17-s${i + 1}`, date: at(now, 5 + i, 11), label: `Day ${i + 1}` })),
      tiers: tiers('tpl-open-fair', { entry: 50, family: 150, kids: 100 }), demoFill: 0.2, policy: { ...policy, refundable: false } },
    { ...base, id: 'e18', slug: 'ai-for-smes-webinar', title: 'AI for SMEs — Live Webinar', category: 'webinars', subCategory: null, viewType: 'ga-list', templateId: 'tpl-ga-webinar', merchantId: 'm-horizon',
      genres: ['Tech', 'Business'], language: 'Bangla', duration: '90 min', certificate: 'All', score: 86, votes: 330, palette: ['#240046', '#7b2cbf'], tags: ['new'],
      description: 'Practical ways small businesses can use AI for sales, support and accounting. Live Q&A.', cast: [{ name: 'Dr. Farhan Kabir', role: 'Speaker' }], venueIds: ['v-online'],
      shows: [{ id: 'e18-s1', date: at(now, 1, 20), label: 'Live' }], tiers: tiers('tpl-ga-webinar', { free: 0, pro: 300 }), demoFill: 0.4, bookingLimit: 1 },
  ].map((e) => ({ ...e, createdAt: at(now, -30, 10), publishedAt: at(now, -25, 10) }));
}

// deps.hash(password) → string
export function buildSeed(deps, now = Date.now()) {
  const merchants = MERCHANTS.map(([id, name, type, email, commission, pgMode]) => ({
    id, name, type, status: 'active', commissionPct: commission, createdAt: at(now, -60, 10),
    owner: { name: `${name.split(' ')[0]} Admin`, email, phone: `+88017110000${MERCHANTS.findIndex((m) => m[0] === id) + 10}` },
    business: { legalName: `${name}`, tradeLicense: `TRAD/DNCC/${100000 + id.length * 713}`, tin: `${123456789000 + id.length}`, address: 'Dhaka, Bangladesh', website: '' },
    kyc: { status: 'verified', docs: [{ name: 'trade-license.pdf', type: 'Trade licence' }, { name: 'nid-owner.jpg', type: 'Owner NID' }], reviewedAt: at(now, -58, 12) },
    settlement: { type: 'bank', bankName: 'Meridian Bank', accountName: name, accountNo: '••••4821', routing: '175260000', cycle: 'weekly' },
    pg: pgMode === 'direct'
      ? { mode: 'direct', sslcommerz: { storeId: 'testbox', storePassword: deps.encrypt('qwerty'), sandbox: true, verifiedAt: at(now, -50, 12) } }
      : { mode: 'platform' },
  }));
  const users = [
    { id: 'u-admin', role: 'admin', name: 'Platform Admin', email: 'admin@ticketo.com.bd', password: deps.hash('admin123') },
    ...merchants.map((m) => ({ id: `u-${m.id}`, role: 'merchant', merchantId: m.id, name: m.owner.name, email: m.owner.email, phone: m.owner.phone, password: deps.hash('merchant123') })),
  ];
  return {
    version: 2, seededAt: new Date(now).toISOString(),
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)), cities: CITIES, templates: seedTemplates(), venues: VENUES,
    merchants, users, tokens: {}, otps: {}, events: events(now), holds: [], orders: [], scans: [], audit: [], tickets: [],
  };
}
