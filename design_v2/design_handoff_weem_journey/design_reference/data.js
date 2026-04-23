/* Sample data for WEEM Customer Journey Dashboard — designed for visual variety */

const SOURCES = ['Facebook', 'Google', 'Tiktok', 'Organic', 'Direct', 'Email', 'Bing'];
const US_STATES = ['CA','TX','NY','FL','IL','OH','WA','GA','NC','AZ','MA','CO','MI','VA','PA'];
const CITIES = {
  CA: 'Los Angeles', TX: 'Austin', NY: 'Brooklyn', FL: 'Miami', IL: 'Chicago',
  OH: 'Columbus', WA: 'Seattle', GA: 'Atlanta', NC: 'Charlotte', AZ: 'Phoenix',
  MA: 'Boston', CO: 'Denver', MI: 'Detroit', VA: 'Richmond', PA: 'Philadelphia',
};
const DEVICES = ['Mobile', 'Desktop', 'Tablet'];
const BROWSERS = ['Safari', 'Chrome', 'Firefox', 'Edge', 'Samsung Internet'];
const OSES = ['iOS', 'Android', 'macOS', 'Windows'];

const CAMPAIGNS = [
  'FB | HSN | LAL5 | Broad',
  'FB | ACV | Retargeting | DHB',
  'G | Search | Weem Brand',
  'G | PMAX | Weem Health',
  'TT | Spark | UGC Vol.3',
  'FB | Trio | Creators',
  'G | Shopping | Top ASINs',
  'FB | Immunity | LAL2',
];

const REF_CAMPAIGNS = [
  'FB Traffic to Shopify',
  'PMAX campaign to WEEM Branded',
  'Email - Subscriber reactivation',
  'Organic Referral',
];

const CREATIVES = [
  'hsn_ugc_sarah_01_v3',
  'acv_testimonial_karen_02',
  'trio_bundle_explainer_v2',
  'immunity_lifestyle_beach_01',
  'hsn_before_after_split_v4',
  'dhb_product_hero_v1',
];

const AD_GROUPS = ['HSN Broad', 'ACV Retarget', 'Immunity Prospect', 'Trio Bundle', 'Brand Search'];
const PLACEMENTS = ['FB Feed', 'FB Reels', 'IG Feed', 'IG Stories', 'Audience Network', 'YouTube', 'Google Search'];

// Conversion types
const CONV_TYPES = ['ViewContent', 'AddtoCart', 'InitiateCheckout', 'Purchase', 'Shipping', 'Recurring', 'LPCustomClicks'];

const FIRST_NAMES = ['Karen','Jessica','Maria','Ashley','Linda','Nicole','Stephanie','Rachel','Danielle','Amber','Priya','Erin','Monica','Tanya','Diana','Hannah','Olivia','Megan','Brittany','Sofia'];
const LAST_NAMES = ['Chamberlain','Rodriguez','Nguyen','Thompson','Patel','Johnson','Kim','Martinez','Davis','Williams','Brown','Miller','Wilson','Taylor','Anderson','Lee','Walker','Hall','Young','Scott'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function fp() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); }
function orderId() { return '#WEEM-' + randInt(100000, 999999); }
function email(n) { return n.toLowerCase().replace(' ','.') + '@' + rand(['gmail.com','yahoo.com','outlook.com','icloud.com']); }

function fmtDate(d) {
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mn = String(d.getMinutes()).padStart(2,'0');
  return `${mm}/${dd}/${yy} ${hh}:${mn}`;
}

// ======== Carefully crafted journey paths for visual demo ========
// Mix of single-click journeys, long multi-touchpoint journeys, pre/post purchase, etc.

function craftJourney({ source, campaign, adGroup, creative, placement, state, tps, firstName, lastName, customerId, daysAgo, durationDays }) {
  const city = CITIES[state];
  const device = rand(DEVICES);
  const browser = rand(BROWSERS);
  const os = device === 'Mobile' ? (Math.random() > 0.5 ? 'iOS' : 'Android') : rand(['macOS','Windows']);
  const fpid = fp();
  const name = firstName + ' ' + lastName;
  const em = email(firstName + lastName);
  const ip = `${randInt(60,240)}.${randInt(10,255)}.${randInt(10,255)}.${randInt(10,255)}`;
  const start = new Date(Date.now() - daysAgo * 86400000);

  const rows = [];
  let curTime = start.getTime();
  const span = durationDays * 86400000;
  const step = span / Math.max(1, tps.length - 1);

  tps.forEach((t, i) => {
    const dt = new Date(curTime + i * step + randInt(-3600000, 3600000));
    const base = {
      fp: fpid, dt, co: state, ci: city,
    };
    if (t.type === 'c') {
      rows.push({ ...base, t: 'c', src: t.src || source, cmp: t.cmp || campaign,
        adgrp: t.adgrp || adGroup, s4: t.creative || creative,
        placement: t.placement || placement, dev: device, br: browser, os, ip });
    } else if (t.type === 'v') {
      rows.push({ ...base, t: 'v', vt: t.vt, src: (t.src || source).toLowerCase(),
        cmp: t.cmp || campaign, pay: t.pay || 0, dev: device, br: browser, os });
    } else if (t.type === 'o') {
      rows.push({ ...base, t: 'o', oid: orderId(), pr: t.pr, st: 'FULFILLED',
        cid: customerId, nm: name, em, rcmp: rand(REF_CAMPAIGNS),
        app: t.app || 'Online Store', cur: 'USD' });
    }
  });

  return { fp: fpid, rows, custName: name, custEmail: em, cid: customerId,
    source, campaign, state, city };
}

const _DATA_JOURNEYS = [];

// Journey 1 — Karen's multi-touchpoint conversion (longest, most interesting)
_DATA_JOURNEYS.push(craftJourney({
  source: 'Facebook', campaign: 'FB | HSN | LAL5 | Broad', adGroup: 'HSN Broad',
  creative: 'hsn_ugc_sarah_01_v3', placement: 'FB Reels',
  state: 'CA', firstName: 'Karen', lastName: 'Chamberlain',
  customerId: '6812340011', daysAgo: 28, durationDays: 9,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent', pay: 0 },
    { type: 'v', vt: 'AddtoCart', pay: 0 },
    { type: 'c', creative: 'hsn_before_after_split_v4', placement: 'IG Feed' },
    { type: 'v', vt: 'InitiateCheckout', pay: 0 },
    { type: 'v', vt: 'Purchase', pay: 49.95 },
    { type: 'o', pr: 49.95 },
    { type: 'o', pr: 29.95, app: 'Recharge Subscriptions' },
  ]
}));

// Journey 2 — Single Facebook click (most common — 69%)
_DATA_JOURNEYS.push(craftJourney({
  source: 'Facebook', campaign: 'FB | ACV | Retargeting | DHB', adGroup: 'ACV Retarget',
  creative: 'acv_testimonial_karen_02', placement: 'FB Feed',
  state: 'TX', firstName: 'Jessica', lastName: 'Rodriguez',
  customerId: '', daysAgo: 2, durationDays: 0.01,
  tps: [{ type: 'c' }]
}));

// Journey 3 — Google Brand quick convert
_DATA_JOURNEYS.push(craftJourney({
  source: 'Google', campaign: 'G | Search | Weem Brand', adGroup: 'Brand Search',
  creative: '—', placement: 'Google Search',
  state: 'NY', firstName: 'Olivia', lastName: 'Kim',
  customerId: '6812340022', daysAgo: 5, durationDays: 0.04,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent', pay: 0 },
    { type: 'v', vt: 'Purchase', pay: 74.90 },
    { type: 'o', pr: 74.90 },
  ]
}));

// Journey 4 — TikTok with bounce (click + ViewContent only)
_DATA_JOURNEYS.push(craftJourney({
  source: 'Tiktok', campaign: 'TT | Spark | UGC Vol.3', adGroup: 'Immunity Prospect',
  creative: 'immunity_lifestyle_beach_01', placement: 'TT For You',
  state: 'FL', firstName: 'Amber', lastName: 'Thompson',
  customerId: '', daysAgo: 7, durationDays: 0.02,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent' },
  ]
}));

// Journey 5 — Longtime subscriber with many recurring orders
_DATA_JOURNEYS.push(craftJourney({
  source: 'Email', campaign: 'Email - Subscriber reactivation', adGroup: '—',
  creative: '—', placement: 'Email',
  state: 'WA', firstName: 'Monica', lastName: 'Patel',
  customerId: '6804120088', daysAgo: 34, durationDays: 30,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'Purchase', pay: 39.95 },
    { type: 'o', pr: 39.95 },
    { type: 'v', vt: 'Recurring' },
    { type: 'o', pr: 39.95, app: 'Recharge Subscriptions' },
    { type: 'v', vt: 'Shipping' },
    { type: 'o', pr: 39.95, app: 'Recharge Subscriptions' },
  ]
}));

// Journey 6 — Cart abandon (Facebook to AddToCart, no purchase)
_DATA_JOURNEYS.push(craftJourney({
  source: 'Facebook', campaign: 'FB | Trio | Creators', adGroup: 'Trio Bundle',
  creative: 'trio_bundle_explainer_v2', placement: 'IG Stories',
  state: 'IL', firstName: 'Rachel', lastName: 'Johnson',
  customerId: '', daysAgo: 3, durationDays: 0.5,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent' },
    { type: 'v', vt: 'AddtoCart' },
    { type: 'v', vt: 'InitiateCheckout' },
  ]
}));

// Journey 7 — Direct purchase (loyalty)
_DATA_JOURNEYS.push(craftJourney({
  source: 'Direct', campaign: '—', adGroup: '—',
  creative: '—', placement: '—',
  state: 'CO', firstName: 'Stephanie', lastName: 'Miller',
  customerId: '6791230045', daysAgo: 11, durationDays: 0.1,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent' },
    { type: 'v', vt: 'Purchase', pay: 89.95 },
    { type: 'o', pr: 89.95 },
  ]
}));

// Journey 8 — PMAX with upsell
_DATA_JOURNEYS.push(craftJourney({
  source: 'Google', campaign: 'G | PMAX | Weem Health', adGroup: '—',
  creative: '—', placement: 'YouTube',
  state: 'GA', firstName: 'Brittany', lastName: 'Hall',
  customerId: '6821340099', daysAgo: 9, durationDays: 0.2,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent' },
    { type: 'v', vt: 'AddtoCart' },
    { type: 'v', vt: 'Purchase', pay: 54.95 },
    { type: 'o', pr: 54.95 },
    { type: 'v', vt: 'LPCustomClicks' },
    { type: 'v', vt: 'Purchase', pay: 19.95 },
    { type: 'o', pr: 19.95 },
  ]
}));

// Journey 9 — Organic (SEO) to subscription
_DATA_JOURNEYS.push(craftJourney({
  source: 'Organic', campaign: '—', adGroup: '—',
  creative: '—', placement: 'Google Search',
  state: 'MA', firstName: 'Priya', lastName: 'Walker',
  customerId: '6832450110', daysAgo: 14, durationDays: 12,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent' },
    { type: 'v', vt: 'AddtoCart' },
    { type: 'v', vt: 'Purchase', pay: 34.95 },
    { type: 'o', pr: 34.95 },
    { type: 'v', vt: 'Recurring' },
    { type: 'o', pr: 34.95, app: 'Recharge Subscriptions' },
  ]
}));

// Journey 10 — Bing single click (rare source)
_DATA_JOURNEYS.push(craftJourney({
  source: 'Bing', campaign: 'Bing | Search | Weem Gummies', adGroup: 'Brand Bing',
  creative: '—', placement: 'Bing Search',
  state: 'OH', firstName: 'Diana', lastName: 'Young',
  customerId: '', daysAgo: 1, durationDays: 0.01,
  tps: [{ type: 'c' }]
}));

// Journey 11 — FB HSN single click
_DATA_JOURNEYS.push(craftJourney({
  source: 'Facebook', campaign: 'FB | HSN | LAL5 | Broad', adGroup: 'HSN Broad',
  creative: 'hsn_ugc_sarah_01_v3', placement: 'FB Feed',
  state: 'AZ', firstName: 'Nicole', lastName: 'Scott',
  customerId: '', daysAgo: 4, durationDays: 0.01,
  tps: [{ type: 'c' }]
}));

// Journey 12 — FB Immunity successful conversion
_DATA_JOURNEYS.push(craftJourney({
  source: 'Facebook', campaign: 'FB | Immunity | LAL2', adGroup: 'Immunity Prospect',
  creative: 'immunity_lifestyle_beach_01', placement: 'FB Reels',
  state: 'NC', firstName: 'Hannah', lastName: 'Lee',
  customerId: '6848560122', daysAgo: 6, durationDays: 0.3,
  tps: [
    { type: 'c' },
    { type: 'v', vt: 'ViewContent' },
    { type: 'v', vt: 'AddtoCart' },
    { type: 'v', vt: 'InitiateCheckout' },
    { type: 'v', vt: 'Purchase', pay: 29.95 },
    { type: 'o', pr: 29.95 },
  ]
}));

// Build journey objects with computed properties
function buildJourneys() {
  return _DATA_JOURNEYS.map((j, idx) => {
    const clicks = j.rows.filter(r => r.t === 'c').length;
    const convs = j.rows.filter(r => r.t === 'v').length;
    const orders = j.rows.filter(r => r.t === 'o').length;
    const revenue = j.rows.filter(r => r.t === 'o').reduce((s,r) => s + r.pr, 0);
    const firstDate = j.rows[0].dt;
    const lastDate = j.rows[j.rows.length - 1].dt;
    const firstOrder = j.rows.find(r => r.t === 'o');
    const firstOrderTs = firstOrder ? firstOrder.dt.getTime() : null;

    // time to first purchase
    let ttfp = null;
    if (firstOrderTs) {
      const ms = firstOrderTs - firstDate.getTime();
      if (ms < 60000) ttfp = '<1m';
      else if (ms < 3600000) ttfp = Math.round(ms/60000) + 'm';
      else if (ms < 86400000) ttfp = Math.round(ms/3600000) + 'h';
      else ttfp = Math.round(ms/86400000) + 'd';
    }

    return { ...j, idx, clicks, convs, orders, revenue, firstDate, lastDate,
      firstOrderTs, ttfp,
      count: j.rows.length,
      hasOrder: orders > 0, hasConv: convs > 0,
    };
  });
}

window.DATA = { JOURNEYS: buildJourneys(), SOURCES, CAMPAIGNS, CONV_TYPES, fmtDate };
