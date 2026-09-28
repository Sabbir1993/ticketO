// Reference data — every value the prototype hardcoded, now CMS-editable.
// No credentials here: gateway / SMS secrets are entered in the CMS and stored encrypted.

// [group, key, value, type, label, isPublic, help]
const settings = [
    ['platform', 'name', 'Ticketo', 'string', 'Platform name', 1],
    ['platform', 'currency', 'BDT', 'string', 'Currency', 1],
    ['platform', 'convenience_fee_pct', 3.5, 'number', 'Convenience fee %', 1, 'Charged on the post-discount ticket value'],
    ['platform', 'vat_on_fee_pct', 15, 'number', 'VAT on fee %', 1, 'Match the current NBR rate'],
    ['platform', 'default_commission_pct', 8, 'number', 'Default merchant commission %', 1],
    ['platform', 'hold_minutes', 8, 'number', 'Seat hold (minutes)', 1],
    ['platform', 'payment_hold_minutes', 15, 'number', 'Extra hold while on the gateway page (minutes)', 0],
    ['platform', 'max_tickets_per_order', 10, 'number', 'Max tickets per order', 1],
    ['platform', 'allow_guest_checkout', true, 'boolean', 'Allow guest checkout', 1],
    ['platform', 'merchant_auto_approve', false, 'boolean', 'Auto-approve new merchants (skip KYC review)', 1],
    ['platform', 'event_requires_approval', false, 'boolean', 'Review events before they go live', 1],
    ['platform', 'allow_merchant_direct_pg', true, 'boolean', 'Merchants may connect their own gateway', 1],
    ['platform', 'cms_mfa_required', true, 'boolean', 'Require authenticator (TOTP) for CMS users', 0],

    ['branding', 'name', 'Ticketo', 'string', 'Brand name', 1],
    ['branding', 'tagline', 'Powered by SSL Wireless', 'string', 'Tagline', 1],
    ['branding', 'title_suffix', 'Movies, Cricket, Concerts & Events', 'string', 'Browser title suffix', 1],
    ['branding', 'primary', '#2D499A', 'color', 'Primary colour', 1],
    ['branding', 'accent', '#EE3240', 'color', 'Accent colour', 1],
    ['branding', 'dark', '#0F172A', 'color', 'Dark colour', 1],
    ['branding', 'radius', 12, 'number', 'Corner radius (px)', 1],
    ['branding', 'font', 'Inter', 'string', 'Font family', 1],
    ['branding', 'logo_media_id', null, 'number', 'Logo image', 1],
    ['branding', 'footer_text', 'Tickets are sold on behalf of the listed organisers.', 'text', 'Footer disclaimer', 1],

    ['ui', 'carousel_interval_ms', 5500, 'number', 'Banner rotation (ms)', 1],
    ['ui', 'header_category_limit', 8, 'number', 'Categories shown in the header', 1],
    ['ui', 'phone_regex', '^01[3-9]\\d{8}$', 'string', 'Mobile number pattern (local part)', 1],
    ['ui', 'phone_prefix', '+880', 'string', 'Mobile prefix shown in forms', 1],
    ['ui', 'default_city', 'dhaka', 'string', 'Default city slug', 1],

    ['pos', 'quick_tender_amounts', [500, 1000, 2000, 5000], 'json', 'Cash quick-tender buttons', 1],

    ['security', 'otp_ttl_minutes', 5, 'number', 'OTP validity (minutes)', 0],
    ['security', 'otp_max_attempts', 5, 'number', 'OTP attempts per code', 0],
    ['security', 'login_max_failures', 5, 'number', 'Failed logins before temporary lock', 0],
    ['security', 'login_lock_minutes', 15, 'number', 'Lock duration (minutes)', 0],
    ['security', 'request_log_retention_days', 180, 'number', 'Keep request logs (days)', 0],
    ['security', 'security_event_retention_days', 365, 'number', 'Keep security events (days)', 0],
];

const viewTypes = [
    ['stadium-cricket', 'Cricket stadium (oval)', 'map', 'Trophy', 'Oval ground with pavilion, club house and gallery stands around the pitch.', 'Cricket stadium · pick your block'],
    ['stadium-football', 'Football stadium (rectangular)', 'map', 'Trophy', 'Rectangular pitch with four stands and corner blocks.', 'Football stadium · pick your stand'],
    ['hall', 'Hall / auditorium', 'rows', 'Theater', 'Stage in front, rows of numbered seats, optional balcony.', 'Hall · numbered seats'],
    ['cinema', 'Cinema', 'rows', 'Film', 'Screen at the bottom, recliner / premium / regular rows.', 'Cinema · numbered seats'],
    ['open-field', 'Open field / ground', 'map', 'Tent', 'Stage and standing zones (fan pit, VIP deck, general) on an open ground.', 'Open ground · pick your zone'],
    ['ga-list', 'General admission list', 'list', 'Users', 'Ticket categories with quantities — seminars, webinars, runs.', 'General admission'],
];

// lookup_group → [code, label, meta?]
const lookups = {
    languages: [['bangla', 'Bangla'], ['english', 'English'], ['hindi', 'Hindi'], ['bangla-english', 'Bangla / English'], ['multi', 'Multilingual']],
    certificates: [['all-ages', 'All ages'], ['u', 'U'], ['ua', 'U/A'], ['12', '12+'], ['16', '16+'], ['18', '18+'], ['a', 'A (adults)']],
    genres: [['action', 'Action'], ['drama', 'Drama'], ['comedy', 'Comedy'], ['thriller', 'Thriller'], ['romance', 'Romance'], ['family', 'Family'], ['animation', 'Animation'], ['horror', 'Horror'], ['sci-fi', 'Sci-Fi'], ['documentary', 'Documentary'], ['cricket', 'Cricket'], ['football', 'Football'], ['rock', 'Rock'], ['folk', 'Folk'], ['classical', 'Classical'], ['stand-up', 'Stand-up'], ['tech', 'Technology'], ['business', 'Business']],
    formats: [['2d', '2D'], ['3d', '3D'], ['imax', 'IMAX'], ['4dx', '4DX'], ['live', 'Live'], ['online', 'Online']],
    tags: [['new', 'New'], ['trending', 'Trending'], ['featured', 'Featured'], ['early-bird', 'Early bird'], ['family', 'Family friendly']],
    business_types: [['event-organiser', 'Event organiser'], ['concert-promoter', 'Concert promoter'], ['sports-club', 'Sports club / association'], ['cinema-theatre', 'Cinema / theatre'], ['venue-owner', 'Venue owner'], ['corporate', 'Corporate / conference'], ['education', 'Educational institute'], ['ngo', 'NGO / non-profit']],
    refund_reasons: [['change-of-plans', 'Change of plans'], ['wrong-show', 'Booked wrong show'], ['rescheduled', 'Event rescheduled'], ['other', 'Other']],
    poster_palettes: [['sapphire', 'Sapphire', ['#1E3A8A', '#2D499A']], ['ruby', 'Ruby', ['#9F1239', '#EE3240']], ['violet', 'Violet pop', ['#7b2cbf', '#ff006e']], ['teal', 'Teal', ['#006d77', '#83c5be']], ['ocean', 'Ocean', ['#023e8a', '#90e0ef']], ['ember', 'Ember', ['#9d0208', '#ffba08']], ['forest', 'Forest gold', ['#1b4332', '#d4a017']], ['night', 'Night', ['#240046', '#7b2cbf']], ['flag', 'Flag', ['#e63946', '#1d3557']], ['leaf', 'Leaf', ['#004b23', '#95d5b2']]],
    price_buckets: [['free', 'Free', { min: 0, max: 0 }], ['0-500', '৳0 – 500', { min: 0, max: 500 }], ['501-2000', '৳501 – 2,000', { min: 501, max: 2000 }], ['2001+', 'Above ৳2,000', { min: 2001, max: null }]],
    date_presets: [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'This Weekend'], ['week', 'Next 7 days']],
    sort_options: [['popular', 'Popularity'], ['date', 'Date'], ['price', 'Price: low to high'], ['rating', 'Rating']],
    pos_methods: [['cash', 'Cash', { icon: 'Banknote' }], ['card', 'Card terminal', { icon: 'CreditCard' }], ['bkash', 'bKash QR', { icon: 'Smartphone' }], ['nagad', 'Nagad QR', { icon: 'Smartphone' }]],
    settlement_types: [['bank', 'Bank account'], ['mfs', 'Mobile wallet (MFS)']],
    venue_types: [['cinema', 'Cinema'], ['stadium', 'Stadium'], ['hall', 'Hall / auditorium'], ['arena', 'Indoor arena'], ['open-field', 'Open ground'], ['online', 'Online']],
    facilities: [['parking', 'Parking'], ['food-court', 'Food court'], ['wheelchair', 'Wheelchair access'], ['first-aid', 'First aid'], ['food-stalls', 'Food stalls'], ['ac', 'Air conditioned'], ['wifi', 'Wi-Fi'], ['lunch', 'Lunch']],
    cast_roles: [['actor', 'Actor'], ['director', 'Director'], ['artist', 'Artist'], ['team', 'Team'], ['speaker', 'Speaker'], ['host', 'Host']],
};

const banks = [
    ['Sonali Bank PLC', 'Sonali'], ['Janata Bank PLC', 'Janata'], ['Agrani Bank PLC', 'Agrani'], ['Rupali Bank PLC', 'Rupali'],
    ['BRAC Bank PLC', 'BRAC'], ['Dutch-Bangla Bank PLC', 'DBBL'], ['Eastern Bank PLC', 'EBL'], ['The City Bank PLC', 'City'],
    ['Islami Bank Bangladesh PLC', 'IBBL'], ['Prime Bank PLC', 'Prime'], ['Mutual Trust Bank PLC', 'MTB'], ['Standard Chartered Bank', 'SCB'],
    ['bKash', 'bKash', 'mfs'], ['Nagad', 'Nagad', 'mfs'], ['Rocket (DBBL)', 'Rocket', 'mfs'], ['Upay', 'Upay', 'mfs'],
];

const kycDocs = [
    ['trade-licence', 'Trade licence', 1], ['owner-nid', 'Owner NID / passport', 1], ['tin', 'TIN certificate', 0], ['bank-proof', 'Bank cheque leaf / statement', 0],
    ['additional', 'Additional document', 0],
];

const cities = [
    ['dhaka', 'Dhaka', 1, 1, 0], ['chattogram', 'Chattogram', 1, 0, 0], ['sylhet', 'Sylhet', 1, 0, 0], ['khulna', 'Khulna', 1, 0, 0],
    ['rajshahi', 'Rajshahi', 1, 0, 0], ['coxsbazar', "Cox's Bazar", 1, 0, 0], ['online', 'Online', 0, 0, 1],
];

// [slug, name, icon, color, viewType, template, peopleLabel, parent?]
const categories = [
    ['movies', 'Movies', 'Film', '#2D499A', 'cinema', 'tpl-cinema-std', 'Cast & Crew'],
    ['sports', 'Sports', 'Trophy', '#EE3240', 'ga-list', 'tpl-ga-run', 'Teams'],
    ['cricket', 'Cricket', 'Trophy', '#1E3A8A', 'stadium-cricket', 'tpl-cricket-oval', 'Teams', 'sports'],
    ['football', 'Football', 'Trophy', '#0F766E', 'stadium-football', 'tpl-football-rect', 'Teams', 'sports'],
    ['running', 'Running / marathon', 'Footprints', '#B45309', 'ga-list', 'tpl-ga-run', 'Organisers', 'sports'],
    ['combat', 'Boxing / MMA / Kabaddi', 'Swords', '#BE123C', 'open-field', 'tpl-arena-round', 'Fighters', 'sports'],
    ['concerts', 'Concerts', 'Music', '#1E3A8A', 'open-field', 'tpl-open-concert', 'Artists'],
    ['open-air', 'Open air', 'Music', '#7C3AED', 'open-field', 'tpl-open-concert', 'Artists', 'concerts'],
    ['indoor', 'Indoor (hall)', 'Music', '#0369A1', 'hall', 'tpl-hall-national', 'Artists', 'concerts'],
    ['theater', 'Theater', 'Theater', '#0F766E', 'hall', 'tpl-hall-national', 'Cast & Crew'],
    ['comedy', 'Comedy', 'Laugh', '#B45309', 'ga-list', 'tpl-ga-comedy', 'Artists'],
    ['seminars', 'Seminars', 'Presentation', '#7C3AED', 'ga-list', 'tpl-ga-conference', 'Speakers'],
    ['workshops', 'Workshops', 'Wrench', '#0369A1', 'ga-list', 'tpl-ga-conference', 'Speakers'],
    ['fairs', 'Fairs', 'Tent', '#BE123C', 'open-field', 'tpl-open-fair', 'Exhibitors'],
    ['webinars', 'Webinars', 'Laptop', '#0F172A', 'ga-list', 'tpl-ga-webinar', 'Speakers'],
];

const paymentMethods = [
    ['sslcommerz', 'SSLCOMMERZ', 'Cards, mobile & internet banking', 'ShieldCheck', '#1e5aa8', 'sslcommerz', ''],
    ['bkash', 'bKash', 'Pay with your bKash account', 'Smartphone', '#e2136e', 'sslcommerz', 'bkash'],
    ['nagad', 'Nagad', 'Pay with your Nagad account', 'Smartphone', '#f6921e', 'sslcommerz', 'nagad'],
    ['card', 'Credit / Debit Card', 'Visa, Mastercard, Amex', 'CreditCard', '#333545', 'sslcommerz', 'visacard,mastercard,amexcard'],
    ['netbank', 'Internet Banking', 'All major BD banks', 'Landmark', '#2a9d8f', 'sslcommerz', 'internetbank'],
];

// [location, label, icon, href, audience, permission]
const nav = [
    ['header_top', 'Sell tickets', 'Store', '/merchant/register', 'all'],
    ['header_top', 'Offers', 'Percent', '/offers', 'all'],
    ['header_top', 'Rewards', 'Award', '/profile?tab=rewards', 'all'],
    ['drawer_customer', 'Your Orders', 'Ticket', '/profile?tab=bookings', 'all'],
    ['drawer_customer', 'Wishlist', 'Heart', '/profile?tab=wishlist', 'all'],
    ['drawer_customer', 'Rewards & Badges', 'Award', '/profile?tab=rewards', 'all'],
    ['drawer_customer', 'Offers', 'Percent', '/offers', 'all'],
    ['drawer_customer', 'Help & Support', 'LifeBuoy', '/help', 'all'],
    ['drawer_staff', 'Merchant portal', 'Store', '/merchant', 'staff'],
    ['drawer_staff', 'Become a merchant', 'Store', '/merchant/register', 'guest'],
    ['drawer_staff', 'POS box office', 'LayoutGrid', '/pos', 'staff', 'pos.sell'],
    ['drawer_staff', 'Gate scanner', 'ScanLine', '/gate', 'staff', 'gate.scan'],
    ['drawer_staff', 'Admin console', 'ShieldCheck', '/admin', 'staff', 'cms.dashboard.view'],
    ['drawer_staff', 'Partner / admin login', 'LogIn', '/partner/login', 'guest'],
    ['footer_icons', '24/7 Customer Care', 'LifeBuoy', '/help', 'all'],
    ['footer_icons', 'Your bookings', 'Ticket', '/profile?tab=bookings', 'all'],
    ['footer_icons', 'Merchant portal', 'Store', '/merchant', 'all'],
    ['footer_icons', 'Box office (POS)', 'LayoutGrid', '/pos', 'all'],
    ['footer_icons', 'Gate scanner', 'ScanLine', '/gate', 'all'],
    ['footer_icons', 'Offers', 'Gift', '/offers', 'all'],
    ['footer_legal', 'Terms', null, '/page/terms', 'all'],
    ['footer_legal', 'Privacy', null, '/page/privacy', 'all'],
    ['footer_legal', 'Refund policy', null, '/page/refund-policy', 'all'],
];

const pages = [
    ['terms', 'Terms of use', 'legal', '<p>Tickets are sold on behalf of organisers (merchants). The organiser is responsible for the event; entry is subject to a valid QR scan.</p>'],
    ['privacy', 'Privacy policy', 'legal', '<p>Card and wallet data are handled by PCI-DSS compliant gateways and never stored by Ticketo. We keep your name, mobile number and email to deliver tickets and support your bookings.</p>'],
    ['refund-policy', 'Refund policy', 'legal', '<p>Refund eligibility, window and fees are set per event and shown before payment. Approved refunds go back to the original payment method.</p>'],
    ['merchant-agreement', 'Merchant agreement', 'agreement', '<p>By submitting this application you confirm the business details and documents are accurate and agree to the Ticketo merchant terms, commission and settlement schedule.</p>'],
];

const faqs = [
    ['How do I get my ticket?', 'After payment you get an M-ticket with a QR code on screen, by email and SMS, and as a PDF from Your Orders.'],
    ['Money was deducted but no ticket?', 'Payments are validated with the gateway server-to-server. If validation is still pending, it completes automatically within minutes; failed payments are reversed by the gateway.'],
    ['Can I choose my block in a stadium?', 'Yes — cricket and football events show the full stadium map. Tap a stand to see its seats or passes.'],
    ['Can I cancel or get a refund?', 'It depends on the organiser’s policy shown on the event page. Go to Your Orders → Cancel / refund.'],
    ['I organise events — how do I sell?', 'Sign up as a merchant, submit KYC, connect your own SSLCOMMERZ/bKash account (or let Ticketo collect), set up your venue layout and publish.'],
];

const contentBlocks = [
    ['footer_merchant_cta', 'Sell your event on Ticketo', 'Sign up as a merchant, connect your payment gateway and publish.', 'Become a merchant', '/merchant/register', 'Megaphone'],
    ['register_how_it_works', 'How it works', null, null, null, 'ListChecks', { steps: ['Create your account and business profile', 'Upload KYC documents', 'Add your settlement account', 'Choose platform collection or connect your own gateway', 'Design your venue and publish events'] }],
    ['checkout_consent', 'Terms consent', 'I agree to the Terms of use, Refund policy and the organiser’s event policy.', null, '/page/terms', null],
    ['login_intro', 'Sign in', 'Sign in for rewards & faster checkout', null, null, 'Smartphone'],
];

const banners = [
    ['Dhaka T20 League — The Final', 'Pick your block in the oval · Under lights', 'Featured', 'Choose seats', '/events/dhaka-t20-league-final', ['#1E3A8A', '#3B82F6']],
    ['Monsoon Beats Live 2026', 'Fan pit · VIP deck · 7 bands at Purbachal', 'Featured', 'Book now', '/events/monsoon-beats-live-2026', ['#9F1239', '#EE3240']],
    ['Sell tickets for your event', 'Sign up as a merchant, connect your gateway and publish in minutes', null, 'Become a merchant', '/merchant/register', ['#0F172A', '#2D499A']],
];

const homeSections = [
    ['banners', null, {}],
    ['row', 'Recommended Movies', { categories: ['movies'], sort: 'score', cityName: true }],
    ['row', 'Cricket & Football', { categories: ['sports'], sort: 'date' }],
    ['cta', 'Organising an event? Sell on Ticketo.', { sub: 'Self-onboard as a merchant, connect your own SSLCOMMERZ / bKash account, design your own venue layout and publish.', cta: 'Get started', href: '/merchant/register', icon: 'Store' }],
    ['categories', 'The Best of Live Events', {}],
    ['row', 'Concerts & Festivals', { categories: ['concerts', 'fairs'], sort: 'date' }],
    ['row', 'Theater, Comedy & Talks', { categories: ['theater', 'comedy', 'seminars', 'workshops', 'webinars'], sort: 'date' }],
];

const promos = [
    ['WELCOME100', 'flat', 100, null, 500, '৳100 off your first booking', null, 5000, 1],
    ['MONSOON20', 'pct', 20, 1000, 1000, '20% off concerts', 'concerts', 1000, null],
    ['MATCHDAY10', 'pct', 10, 300, 500, '10% off sports tickets', 'sports', 2000, null],
];

const loyaltyTiers = [
    ['silver', 'Silver', 0, 1, '#94A3B8', ['1 point per ৳100', 'Birthday bonus 100 pts']],
    ['gold', 'Gold', 1500, 1.5, '#D4A017', ['1.5x points', 'Early access to presales', 'Free cancellation once a month']],
    ['platinum', 'Platinum', 5000, 2, '#475569', ['2x points', 'Priority entry lanes', 'Exclusive member events']],
];
const loyaltyRules = [['order_paid', 1, 100, null], ['checkin', 10, null, 10], ['referral', 200, null, null]];

// Auto-block rules: [name, event, subject, threshold, windowSec, durationSec, scope]
const blockRules = [
    ['OTP brute force (phone)', 'otp_failed', 'phone', 5, 600, 3600, 'login'],
    ['OTP brute force (IP)', 'otp_failed', 'ip', 20, 600, 3600, 'login'],
    ['Password guessing (IP)', 'login_failed', 'ip', 10, 600, 3600, 'login'],
    ['Password guessing (account)', 'login_failed', 'email', 8, 900, 1800, 'login'],
    ['Rate-limit abuse (IP)', 'rate_limited', 'ip', 30, 600, 1800, 'all'],
    ['CSRF probing (IP)', 'csrf_failed', 'ip', 20, 600, 3600, 'all'],
    ['Ticket scan guessing (device)', 'invalid_ticket_scan', 'device', 40, 600, 1800, 'all'],
];

const uiStrings = [
    ['search.placeholder', 'Search for movies, events, plays, sports and activities'],
    ['login.heading', 'Sign in with your mobile'],
    ['login.otp_heading', 'Enter the code we sent'],
    ['login.guest_skip', 'Continue as guest'],
    ['login.partner_link', 'Merchant or admin? Sign in here'],
    ['offers.heading', 'Offers & promo codes'],
    ['offers.subtitle', 'Apply these at checkout'],
    ['notfound.heading', 'Page not found'],
    ['notfound.body', 'The page you are looking for does not exist or has moved.'],
    ['footer.explore', 'Explore'],
    ['footer.accept', 'We accept'],
    ['city.popular', 'Popular Cities'],
    ['city.detect', 'Detect my location'],
    ['carousel.badge', 'Featured'],
    ['status.pending_payment', 'Awaiting payment'], ['status.paid', 'Confirmed'], ['status.refund_requested', 'Refund requested'],
    ['status.refunded', 'Refunded'], ['status.expired', 'Expired'], ['status.failed', 'Failed'], ['status.draft', 'Draft'],
    ['status.published', 'Live'], ['status.pending_review', 'In review'], ['status.rejected', 'Rejected'], ['status.paused', 'Paused'],
    ['status.cancelled', 'Cancelled'], ['status.pending', 'KYC review'], ['status.active', 'Active'], ['status.suspended', 'Suspended'],
];

module.exports = { settings, viewTypes, lookups, banks, kycDocs, cities, categories, paymentMethods, nav, pages, faqs, contentBlocks, banners, homeSections, promos, loyaltyTiers, loyaltyRules, blockRules, uiStrings };
