// ---------------------------------------------------------------------------
// Venue view types & layout templates.
// A template is pure JSON (stored in the DB, editable from Admin → Configuration),
// so new stadiums / halls / grounds can be added without a code change.
//
// Geometry lives in a 1000-wide SVG space. Block shapes:
//   { type: 'rect', x, y, w, h }
//   { type: 'arc',  cx, cy, rx1, ry1, rx2, ry2, a0, a1 }   (elliptical ring segment, degrees, 0° = east, clockwise)
// Selling units:
//   block.sell = 'seated' → rows × seatsPerRow seat map inside the block
//   block.sell = 'ga'     → standing / free seating with a capacity (quantity picker)
//   block.sell = 'none'   → shown but not sold (media box, players' area …)
// ---------------------------------------------------------------------------

export const VIEW_TYPES = [
  { id: 'stadium-cricket', name: 'Cricket stadium (oval)', kind: 'map', icon: 'Trophy', description: 'Oval ground with pavilion, club house and gallery stands around the pitch.' },
  { id: 'stadium-football', name: 'Football stadium (rectangular)', kind: 'map', icon: 'Trophy', description: 'Rectangular pitch with four stands and corner blocks.' },
  { id: 'hall', name: 'Hall / auditorium', kind: 'rows', icon: 'Theater', description: 'Stage in front, rows of numbered seats, optional balcony.' },
  { id: 'cinema', name: 'Cinema', kind: 'rows', icon: 'Film', description: 'Screen at the bottom, recliner / premium / regular rows.' },
  { id: 'open-field', name: 'Open field / ground', kind: 'map', icon: 'Tent', description: 'Stage and standing zones (fan pit, VIP deck, general) on an open ground.' },
  { id: 'ga-list', name: 'General admission list', kind: 'list', icon: 'Users', description: 'Ticket categories with quantities — seminars, webinars, runs.' },
];

import { rowLabels } from './geometry.mjs';
export { rowLabels };

// ---------- Cricket: oval with two rings ----------
function cricketOval() {
  const cx = 500, cy = 380;
  const lower = [
    ['VIP', 'VIP Pavilion', 'vip', 'seated', 6, 20],
    ['C1', 'Club House East', 'club', 'seated', 10, 24],
    ['G1', 'Grand Stand 1', 'grand', 'seated', 14, 28],
    ['G2', 'Grand Stand 2', 'grand', 'seated', 14, 28],
    ['E1', 'East Stand', 'general', 'seated', 16, 30],
    ['S1', 'South Gallery 1', 'gallery', 'ga', 0, 0, 1800],
    ['S2', 'South Gallery 2', 'gallery', 'ga', 0, 0, 1800],
    ['W1', 'West Stand', 'general', 'seated', 16, 30],
    ['G3', 'Grand Stand 3', 'grand', 'seated', 14, 28],
    ['G4', 'Grand Stand 4', 'grand', 'seated', 14, 28],
    ['C2', 'Club House West', 'club', 'seated', 10, 24],
    ['MB', 'Media & Players', 'none', 'none', 0, 0],
  ];
  const blocks = lower.map(([id, name, tier, sell, rows, seatsPerRow, capacity], i) => ({
    id, name, tier, sell, rows, seatsPerRow, capacity: capacity || rows * seatsPerRow, level: 'Lower tier',
    shape: { type: 'arc', cx, cy, rx1: 300, ry1: 232, rx2: 378, ry2: 292, a0: -105 + i * 30 + 1, a1: -105 + i * 30 + 29 },
  }));
  const upper = ['North', 'North-East', 'South-East', 'South', 'South-West', 'North-West'];
  upper.forEach((n, i) => blocks.push({
    id: `U${i + 1}`, name: `Upper ${n}`, tier: i === 3 ? 'gallery' : 'upper', sell: i === 3 ? 'ga' : 'seated', rows: i === 3 ? 0 : 12, seatsPerRow: i === 3 ? 0 : 36,
    capacity: i === 3 ? 2500 : 12 * 36, level: 'Upper tier',
    shape: { type: 'arc', cx, cy, rx1: 388, ry1: 300, rx2: 460, ry2: 356, a0: -120 + i * 60 + 1.5, a1: -120 + i * 60 + 58.5 },
  }));
  return {
    id: 'tpl-cricket-oval', name: 'Cricket Oval — 2 tier (18 blocks)', viewType: 'stadium-cricket',
    spec: {
      viewBox: [1000, 760], field: { type: 'oval', cx, cy, rx: 270, ry: 208, label: 'Ground' }, pitch: { w: 26, h: 110 },
      tiers: [
        { id: 'vip', name: 'VIP Pavilion', color: '#7c3aed' }, { id: 'club', name: 'Club House', color: '#0ea5e9' },
        { id: 'grand', name: 'Grand Stand', color: '#10b981' }, { id: 'general', name: 'General Stand', color: '#f59e0b' },
        { id: 'upper', name: 'Upper Tier', color: '#64748b' }, { id: 'gallery', name: 'Gallery (free seating)', color: '#ef4444' },
      ],
      blocks,
      gates: [{ label: 'Gate 1', x: 500, y: 748 }, { label: 'Gate 2', x: 20, y: 380 }, { label: 'Gate 3', x: 980, y: 380 }, { label: 'VIP Gate', x: 500, y: 12 }],
    },
  };
}

// ---------- Football: rectangular stands ----------
function footballRect() {
  const b = [];
  const add = (id, name, tier, sell, x, y, w, h, rows = 12, seats = 30, capacity) =>
    b.push({ id, name, tier, sell, rows: sell === 'seated' ? rows : 0, seatsPerRow: sell === 'seated' ? seats : 0, capacity: capacity || rows * seats, shape: { type: 'rect', x, y, w, h } });
  // Main (west) stand — VIP centre
  add('W1', 'Main Stand North', 'premium', 'seated', 110, 176, 120, 110, 12, 26);
  add('W2', 'Main Stand VIP', 'vip', 'seated', 110, 292, 120, 116, 8, 20);
  add('W3', 'Main Stand South', 'premium', 'seated', 110, 414, 120, 110, 12, 26);
  // East stand — supporters (standing)
  add('E1', 'East Terrace North', 'terrace', 'ga', 770, 176, 120, 170, 0, 0, 2200);
  add('E2', 'East Terrace South', 'terrace', 'ga', 770, 354, 120, 170, 0, 0, 2200);
  // North & south stands behind goals
  ['N1', 'N2', 'N3', 'N4'].forEach((id, i) => add(id, `North Stand ${i + 1}`, i === 1 || i === 2 ? 'standard' : 'economy', 'seated', 250 + i * 127, 56, 120, 100, 14, 32));
  ['S1', 'S2', 'S3', 'S4'].forEach((id, i) => add(id, `South Stand ${i + 1}`, i === 1 || i === 2 ? 'standard' : 'economy', 'seated', 250 + i * 127, 544, 120, 100, 14, 32));
  // Corners — family / away fans
  add('NW', 'Family Corner', 'family', 'seated', 110, 56, 120, 100, 10, 20);
  add('NE', 'Away Fans NE', 'away', 'ga', 770, 56, 120, 100, 0, 0, 900);
  add('SW', 'Corner SW', 'economy', 'seated', 110, 544, 120, 100, 10, 20);
  add('SE', 'Away Fans SE', 'away', 'ga', 770, 544, 120, 100, 0, 0, 900);
  return {
    id: 'tpl-football-rect', name: 'Football Stadium — 4 stands + corners', viewType: 'stadium-football',
    spec: {
      viewBox: [1000, 700], field: { type: 'pitch', x: 250, y: 176, w: 500, h: 348, label: 'Pitch' },
      tiers: [
        { id: 'vip', name: 'VIP Box', color: '#7c3aed' }, { id: 'premium', name: 'Main Stand', color: '#0ea5e9' },
        { id: 'standard', name: 'Behind Goal (centre)', color: '#10b981' }, { id: 'economy', name: 'Economy', color: '#f59e0b' },
        { id: 'family', name: 'Family Corner', color: '#ec4899' }, { id: 'terrace', name: 'Supporters Terrace', color: '#ef4444' },
        { id: 'away', name: 'Away Fans', color: '#64748b' },
      ],
      blocks: b,
      gates: [{ label: 'Gate A', x: 170, y: 20 }, { label: 'Gate B', x: 830, y: 20 }, { label: 'Gate C', x: 170, y: 684 }, { label: 'Gate D', x: 830, y: 684 }],
    },
  };
}

// ---------- Hall / auditorium (rows) ----------
function hall(id, name, { balcony = true } = {}) {
  return {
    id, name, viewType: 'hall',
    spec: {
      stage: 'top', stageLabel: 'STAGE', aisles: [5, 15],
      tiers: [{ id: 'vip', name: 'VIP', color: '#7c3aed' }, { id: 'gold', name: 'Gold', color: '#f59e0b' }, { id: 'silver', name: 'Silver', color: '#10b981' }, { id: 'balcony', name: 'Balcony', color: '#0ea5e9' }],
      blocks: [
        { id: 'GV', name: 'VIP', tier: 'vip', sell: 'seated', level: 'Ground floor', rowLabels: rowLabels(2), seatsPerRow: 20 },
        { id: 'GG', name: 'Gold', tier: 'gold', sell: 'seated', level: 'Ground floor', rowLabels: rowLabels(5, 2), seatsPerRow: 20 },
        { id: 'GS', name: 'Silver', tier: 'silver', sell: 'seated', level: 'Ground floor', rowLabels: rowLabels(4, 7), seatsPerRow: 20 },
        ...(balcony ? [{ id: 'BL', name: 'Balcony', tier: 'balcony', sell: 'seated', level: 'Balcony', rowLabels: ['BA', 'BB', 'BC', 'BD'], seatsPerRow: 22 }] : []),
      ].map((x) => ({ ...x, rows: x.rowLabels.length, capacity: x.rowLabels.length * x.seatsPerRow })),
    },
  };
}

function cinema() {
  return {
    id: 'tpl-cinema-std', name: 'Cinema — 11 rows (recliner / premium / regular)', viewType: 'cinema',
    spec: {
      stage: 'bottom', stageLabel: 'All eyes this way please!', aisles: [4, 14],
      tiers: [{ id: 'recliner', name: 'Royal Recliner', color: '#7c3aed' }, { id: 'premium', name: 'Premium', color: '#0ea5e9' }, { id: 'regular', name: 'Regular', color: '#10b981' }],
      blocks: [
        { id: 'RR', name: 'Royal Recliner', tier: 'recliner', sell: 'seated', rowLabels: rowLabels(2), seatsPerRow: 18 },
        { id: 'PR', name: 'Premium', tier: 'premium', sell: 'seated', rowLabels: rowLabels(4, 2), seatsPerRow: 18 },
        { id: 'RG', name: 'Regular', tier: 'regular', sell: 'seated', rowLabels: rowLabels(5, 6), seatsPerRow: 18 },
      ].map((x) => ({ ...x, rows: x.rowLabels.length, capacity: x.rowLabels.length * x.seatsPerRow })),
    },
  };
}

// ---------- Open field (zones) ----------
function openConcert() {
  return {
    id: 'tpl-open-concert', name: 'Open Ground — Concert (stage + 4 zones)', viewType: 'open-field',
    spec: {
      viewBox: [1000, 700],
      tiers: [{ id: 'fanpit', name: 'Fan Pit', color: '#ef4444' }, { id: 'vip', name: 'VIP Deck', color: '#7c3aed' }, { id: 'ga', name: 'General Admission', color: '#10b981' }, { id: 'lounge', name: 'Sky Lounge', color: '#f59e0b' }],
      blocks: [
        { id: 'FP', name: 'Fan Pit', tier: 'fanpit', sell: 'ga', capacity: 1200, shape: { type: 'rect', x: 320, y: 140, w: 360, h: 170 } },
        { id: 'VL', name: 'VIP Deck Left', tier: 'vip', sell: 'ga', capacity: 250, shape: { type: 'rect', x: 120, y: 140, w: 180, h: 170 } },
        { id: 'VR', name: 'VIP Deck Right', tier: 'vip', sell: 'ga', capacity: 250, shape: { type: 'rect', x: 700, y: 140, w: 180, h: 170 } },
        { id: 'GA', name: 'General Admission', tier: 'ga', sell: 'ga', capacity: 6000, shape: { type: 'rect', x: 120, y: 326, w: 760, h: 214 } },
        { id: 'SL', name: 'Sky Lounge', tier: 'lounge', sell: 'ga', capacity: 120, shape: { type: 'rect', x: 400, y: 560, w: 200, h: 60 } },
      ],
      features: [
        { label: 'MAIN STAGE', kind: 'stage', x: 300, y: 30, w: 400, h: 90 },
        
        { label: 'Food court', kind: 'food', x: 900, y: 140, w: 80, h: 400 },
        { label: 'Merch', kind: 'food', x: 20, y: 140, w: 80, h: 150 },
        { label: 'Toilets', kind: 'wc', x: 20, y: 310, w: 80, h: 100 },
        { label: 'Medical', kind: 'medical', x: 20, y: 430, w: 80, h: 110 },
        { label: 'ENTRY', kind: 'gate', x: 120, y: 640, w: 200, h: 44 },
        { label: 'VIP ENTRY', kind: 'gate', x: 680, y: 640, w: 200, h: 44 },
      ],
    },
  };
}

function openFair() {
  return {
    id: 'tpl-open-fair', name: 'Open Ground — Fair / expo', viewType: 'open-field',
    spec: {
      viewBox: [1000, 700],
      tiers: [{ id: 'entry', name: 'General Entry', color: '#10b981' }, { id: 'family', name: 'Family Pass', color: '#0ea5e9' }, { id: 'kids', name: 'Kids Zone', color: '#ec4899' }],
      blocks: [
        { id: 'MG', name: 'Main Ground', tier: 'entry', sell: 'ga', capacity: 20000, shape: { type: 'rect', x: 80, y: 90, w: 600, h: 480 } },
        { id: 'FM', name: 'Family Enclosure', tier: 'family', sell: 'ga', capacity: 3000, shape: { type: 'rect', x: 700, y: 90, w: 220, h: 230 } },
        { id: 'KZ', name: 'Kids Zone', tier: 'kids', sell: 'ga', capacity: 800, shape: { type: 'rect', x: 700, y: 340, w: 220, h: 230 } },
      ],
      features: [
        { label: 'Book stalls', kind: 'food', x: 110, y: 120, w: 250, h: 100 },
        { label: 'Food stalls', kind: 'food', x: 400, y: 120, w: 250, h: 100 },
        { label: 'Author stage', kind: 'stage', x: 250, y: 440, w: 260, h: 90 },
        { label: 'ENTRY', kind: 'gate', x: 380, y: 610, w: 240, h: 50 },
      ],
    },
  };
}

function gaList(id, name, zones) {
  return { id, name, viewType: 'ga-list', spec: { tiers: zones.map(([zid, zname, color]) => ({ id: zid, name: zname, color })), blocks: zones.map(([zid, zname, , capacity]) => ({ id: zid.toUpperCase(), name: zname, tier: zid, sell: 'ga', capacity })) } };
}

// ---------- Arena in the round (boxing, concerts in the round, kabaddi) ----------
function arenaRound() {
  const cx = 500, cy = 380; const blocks = [];
  const tiers = [['ringside', 'Ringside', '#b91c1c'], ['floor', 'Floor', '#2d499a'], ['lower', 'Lower Bowl', '#0ea5e9'], ['upper', 'Upper Bowl', '#64748b']];
  // ringside + floor as rects around the ring
  [[380, 250, 240, 40, 'N'], [380, 470, 240, 40, 'S'], [330, 290, 40, 180, 'W'], [630, 290, 40, 180, 'E']].forEach(([x, y, w, h, side]) =>
    blocks.push({ id: `R${side}`, name: `Ringside ${side}`, tier: 'ringside', sell: 'seated', rows: 2, seatsPerRow: w > h ? 12 : 9, shape: { type: 'rect', x, y, w, h, front: 'auto' } }));
  for (let i = 0; i < 8; i++) blocks.push({ id: `L${i + 1}`, name: `Lower ${i + 1}`, tier: 'lower', sell: 'seated', rows: 10, seatsPerRow: 22, level: 'Lower bowl', shape: { type: 'arc', cx, cy, rx1: 250, ry1: 200, rx2: 330, ry2: 262, a0: i * 45 + 2, a1: i * 45 + 43 } });
  for (let i = 0; i < 6; i++) blocks.push({ id: `U${i + 1}`, name: `Upper ${i + 1}`, tier: 'upper', sell: i % 3 === 1 ? 'ga' : 'seated', rows: i % 3 === 1 ? 0 : 8, seatsPerRow: i % 3 === 1 ? 0 : 34, capacity: i % 3 === 1 ? 900 : undefined, level: 'Upper bowl', shape: { type: 'arc', cx, cy, rx1: 342, ry1: 272, rx2: 420, ry2: 334, a0: i * 60 + 3, a1: i * 60 + 57 } });
  blocks.push({ id: 'FL', name: 'Floor Standing', tier: 'floor', sell: 'ga', capacity: 400, shape: { type: 'polygon', points: [[230, 330], [320, 290], [320, 470], [230, 430]] } });
  return {
    id: 'tpl-arena-round', name: 'Arena in the round — ring + 2 bowls', viewType: 'open-field',
    spec: { viewBox: [1000, 760], background: 'plain', field: { type: 'ring', cx, cy, size: 150, label: 'Ring' }, tiers: tiers.map(([id, name, color]) => ({ id, name, color })), blocks: blocks.map((b) => ({ ...b, capacity: b.capacity })), gates: [{ label: 'North Gate', x: 500, y: 20 }, { label: 'South Gate', x: 500, y: 748 }] },
  };
}

export function seedTemplates() {
  return [
    cricketOval(),
    footballRect(),
    hall('tpl-hall-national', 'National Theatre Hall — ground + balcony'),
    hall('tpl-hall-small', 'Small auditorium — single floor', { balcony: false }),
    cinema(),
    openConcert(),
    openFair(),
    arenaRound(),
    gaList('tpl-ga-conference', 'Conference passes', [['delegate', 'Delegate', '#0ea5e9', 400], ['student', 'Student Pass', '#10b981', 100], ['vip', 'VIP / Speaker lounge', '#7c3aed', 40]]),
    gaList('tpl-ga-run', 'Run / marathon categories', [['full', 'Full Marathon (42K)', '#ef4444', 1500], ['half', 'Half Marathon (21K)', '#f59e0b', 3000], ['fun', 'Fun Run (5K)', '#10b981', 5000]]),
    gaList('tpl-ga-webinar', 'Webinar registration', [['free', 'Free Registration', '#10b981', 1000], ['pro', 'Pro (recording + slides)', '#7c3aed', 500]]),
    gaList('tpl-ga-comedy', 'Comedy club (free seating)', [['front', 'Front Rows', '#ef4444', 60], ['general', 'General', '#10b981', 240]]),
  ];
}

// Geometry & seat helpers live in geometry.js (re-exported for existing imports)
export { arcPath, shapeCenter, shapePath, shapePoints, shapeBBox, blockRows, blockCapacity, blockSeatIds, seatsInRow, seatExists, seatPositions } from './geometry.mjs';
