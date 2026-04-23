// Conversion funnel stage configuration (order matters)
const FUNNEL_STAGES = [
    { key: 'click', label: 'Clicks', cssClass: 's-click', matchType: 'click' },
    { key: 'ViewContent', label: 'View Content', cssClass: 's-viewcontent', matchType: 'vt' },
    { key: 'AddtoCart', label: 'Add to Cart', cssClass: 's-addtocart', matchType: 'vt' },
    { key: 'InitiateCheckout', label: 'Initiate Checkout', cssClass: 's-initiatecheckout', matchType: 'vt' },
    { key: 'Purchase', label: 'Purchase', cssClass: 's-purchase', matchType: 'vt' },
    { key: 'Subscription', label: 'Subscription', cssClass: 's-subscription', matchType: 'vt' },
    { key: 'Recurring', label: 'Recurring', cssClass: 's-recurring', matchType: 'vt' },
];

// Per-tab filter field definitions (key matches record/journey property)
const STOP_DIMENSIONS = [
    { key: 'src',  label: 'Source',      field: 'src' },
    { key: 'cmp',  label: 'Ad Campaign',     field: 'cmp' },
    { key: 'rcmp', label: 'Ref. Campaign',   field: 'rcmp' },
    { key: 'adg',  label: 'Ad Group',    field: r => r.adg || r.s1 || '' },
    { key: 's4',   label: 'Creative',    field: 's4' },
    { key: 'plc',  label: 'Placement',   field: r => r.plc || r.s2 || '' },
    { key: 'co',   label: 'Country',     field: 'co' },
    { key: 'ci',   label: 'City',        field: 'ci' },
    { key: 'dev',  label: 'Device',      field: 'dev' },
    { key: 'br',   label: 'Browser',     field: 'br' },
    { key: 'os',   label: 'OS',          field: 'os' },
    { key: 'vt',   label: 'Conv. Type',  field: 'vt' },
    { key: 's1',   label: 'Sub1',        field: 's1' },
    { key: 's2',   label: 'Sub2',        field: 's2' },
    { key: 's3',   label: 'Sub3',        field: 's3' },
    { key: 's5',   label: 'Sub5',        field: 's5' },
    { key: 's6',   label: 'Sub6',        field: 's6' },
];
function getStopValue(record, dim) {
    if (typeof dim.field === 'function') return dim.field(record) || '';
    return record[dim.field] || '';
}

const TAB_FILTER_FIELDS = {
    route: [
        { key: 'src', label: 'Source', type: 'select', level: 'journey' },
        { key: 'firstSource', label: 'First Source', type: 'select', level: 'journey' },
        { key: 'subsequentSource', label: 'Subsequent Source', type: 'select', level: 'journey' },
        { key: 'cmp', label: 'Ad Campaign', type: 'select', level: 'journey' },
        { key: 'co', label: 'State', type: 'select', level: 'record' },
        { key: 'hasOrder', label: 'Has Orders', type: 'bool', level: 'journey' },
        { key: 'hasConv', label: 'Has Actions', type: 'bool', level: 'journey' },
        { key: 'custName', label: 'Customer Name', type: 'text', level: 'journey' },
        { key: 'custEmail', label: 'Customer Email', type: 'text', level: 'journey' },
    ],
    orders: [
        { key: 'st', label: 'Status', type: 'select', level: 'record' },
        { key: 'app', label: 'App', type: 'select', level: 'record' },
        { key: 'rcmp', label: 'Ref. Campaign', type: 'select', level: 'record' },
        { key: 'nm', label: 'Customer Name', type: 'text', level: 'record' },
        { key: 'em', label: 'Customer Email', type: 'text', level: 'record' },
        { key: 'pr', label: 'Order Value', type: 'number', level: 'record' },
    ],
    customers: [
        { key: 'nm', label: 'Name', type: 'text', level: 'record' },
        { key: 'em', label: 'Email', type: 'text', level: 'record' },
        { key: 'orderCount', label: 'Order Count', type: 'number', level: 'record' },
        { key: 'revenue', label: 'Revenue', type: 'number', level: 'record' },
    ],
    attribution: [],
};

// Operators available for each field type
const FILTER_OPERATORS = {
    select: [
        { key: 'eq', label: 'is' },
        { key: 'neq', label: 'is not' },
    ],
    text: [
        { key: 'contains', label: 'contains' },
        { key: 'eq', label: 'equals' },
        { key: 'neq', label: 'does not equal' },
        { key: 'starts', label: 'starts with' },
    ],
    bool: [
        { key: 'eq', label: 'is' },
    ],
    number: [
        { key: 'gt', label: 'greater than' },
        { key: 'lt', label: 'less than' },
        { key: 'between', label: 'between' },
        { key: 'eq', label: 'equals' },
    ],
};

// ═══════════════════════════════════════════
// IndexedDB key-value cache for parsed CSV data
// Avoids re-parsing large CSVs on every page load
// ═══════════════════════════════════════════
(function () {
  const DB_NAME = 'cj_dashboard_cache';
  const STORE = 'kv';
  const VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(cacheKey) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.get(cacheKey);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function set(cacheKey, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(value, cacheKey);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  window.idbCache = { get, set };
})();

// ═══════════════════════════════════════════
// CSV Loader & Row Normalizer
// Fetches CSV, detects format (wide/native/JSON), normalizes every row
// into a unified {t, fp, dt, ...} record shape. Handles 192-column
// wide CSVs, native short-key rows, and raw JSON event columns.
// ═══════════════════════════════════════════
(function () {
  // Lowercase + trim helper
  function lc(v) {
    return String(v ?? '').trim().toLowerCase();
  }

  // Returns the first non-empty value from a list of possible column names
  function getFirst(obj, keys) {
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return undefined;
  }

  // Safe number parse — returns undefined instead of NaN
  function parseMaybeNumber(v) {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    if (!s) return undefined;
    const n = Number(s);
    if (!Number.isFinite(n)) return undefined;
    return n;
  }

  // Canonicalizes source names: prefers the Title-cased form to avoid
  // duplicate dropdown entries like "Facebook" / "facebook"
  const _srcCanon = {};
  function canonicalizeSource(src) {
    if (!src) return src;
    const key = src.toLowerCase();
    const existing = _srcCanon[key];
    // Prefer a form whose first char is uppercase (proper noun / brand)
    const isTitle = src.charAt(0) !== src.charAt(0).toLowerCase();
    if (!existing || isTitle) _srcCanon[key] = src;
    return _srcCanon[key];
  }

  // Appends 'Z' to bare datetime strings (no timezone) so JS parses them as UTC
  function normalizeTimestamp(ts) {
    if (!ts || typeof ts !== 'string') return ts;
    if (/[+-]\d{2}:\d{2}$/.test(ts) || ts.endsWith('Z')) return ts;
    return ts.trim().replace(' ', 'T') + 'Z';
  }

  // Maps raw type strings ("click", "order", "conversion", etc.) → "c" / "v" / "o"
  function normalizeType(typeRaw) {
    const type = lc(typeRaw);
    if (!type) return undefined;
    if (['c', 'click', 'clicks'].includes(type) || type.includes('click')) return 'c';
    if (['v', 'conversion', 'conversions', 'recurring'].includes(type) || type.includes('conversion') || type.includes('recurr')) return 'v';
    if (['o', 'order', 'orders', 'fulfillment', 'fulfilled', 'shipping', 'paid'].includes(type) || type.includes('order') || type.includes('ship') || type.includes('fulfill')) return 'o';
    return undefined;
  }

  // Extracts fingerprint (fp) + datetime (dt) from any row format — the two required fields
  function fmtRecordBase(row) {
    const fp = getFirst(row, ['fp', 'fingerprint', 'rt_fingerprint', 'click_fingerprint']);
    const dt = getFirst(row, ['dt', 'timestamp', 'track_time', 'created_at', 'createdAt', 'click_date', 'conv_time', 'event_time', 'date']);
    if (!fp || !dt) return null;
    return { t: undefined, fp: String(fp), dt: String(dt) };
  }

  // Normalizes a row that already uses short field names (t, fp, dt, src, cmp, etc.)
  function normalizeFromNativeRow(row) {
    const base = fmtRecordBase(row);
    if (!base) return null;
    const tRaw = getFirst(row, ['t', 'type', 'event_type', 'event']);
    base.t = normalizeType(tRaw) || getFirst(row, ['t']);
    base.src = canonicalizeSource(getFirst(row, ['src', 'source', 'rt_source', 'lastVisitSource', 'rt_rt_source']));
    base.cmp = getFirst(row, ['cmp', 'campaign', 'rt_campaign', 'lastVisitCampaign', 'rt_campaignName']);
    base.vt = getFirst(row, ['vt', 'conversion_type', 'conversionType', 'type_label']);
    base.pay = parseMaybeNumber(getFirst(row, ['pay', 'payout', 'payout_default', 'pub_revenue', 'pub_revenue_default']));
    base.oid = getFirst(row, ['oid', 'orderId', 'order_id', 'shopify_order_id', 'shopify_order_orderId', 'order']);
    base.pr = parseMaybeNumber(getFirst(row, ['pr', 'price', 'payout', 'payout_default', 'payout_network', 'shopify_order_price']));
    base.st = (getFirst(row, ['st', 'status', 'order_status', 'financial_status']) || '').toUpperCase() || undefined;
    base.cid = getFirst(row, ['cid', 'customerId', 'customer_id', 'shopify_order_customerId', 'user_id']);
    base.nm = getFirst(row, ['nm', 'name', 'customer_name', 'customer']);
    base.em = getFirst(row, ['em', 'email', 'customer_email']);
    base.co = getFirst(row, ['co', 'country']);
    base.ci = getFirst(row, ['ci', 'city']);
    base.dev = getFirst(row, ['dev', 'device', 'device_fullname', 'device_full', 'deviceType']);
    base.br = getFirst(row, ['br', 'browser']);
    base.os = getFirst(row, ['os', 'os_fullname', 'os_name']);
    base.s1 = getFirst(row, ['s1', 'sub1', 'rt_sub1', 'sub_1']);
    base.s2 = getFirst(row, ['s2', 'sub2', 'rt_sub2', 'sub_2']);
    base.s3 = getFirst(row, ['s3', 'sub3', 'rt_sub3', 'sub_3']);
    base.s4 = getFirst(row, ['s4', 'sub4', 'rt_sub4', 'sub_4']);
    base.s5 = getFirst(row, ['s5', 'sub5', 'rt_sub5', 'sub_5']);
    base.s6 = getFirst(row, ['s6', 'sub6', 'rt_sub6', 'sub_6']);
    base.rcmp = getFirst(row, ['rcmp', 'order_campaign', 'orderCampaign', 'campaign', 'rt_campaign']);
    base.fsrc = getFirst(row, ['fsrc', 'first_source', 'firstSource', 'rt_source', 'source']);
    base.lsrc = getFirst(row, ['lsrc', 'last_source', 'lastSource', 'lastVisitSource']);
    base.app = getFirst(row, ['app', 'application', 'app_name', 'appName']);
    base.cur = getFirst(row, ['cur', 'currency', 'order_currency']);
    if (base.pr !== undefined && base.pr !== null) base.pr = Number(base.pr);
    if (base.pay !== undefined && base.pay !== null) base.pay = Number(base.pay);
    if (base.t === 'o') base.dt = normalizeTimestamp(base.dt);
    return base.t ? base : null;
  }

  // Normalizes a raw JSON event object (from a raw_data column) into c/v/o record
  function normalizeFromJsonEvent(j) {
    if (!j) return null;
    const fp = j.fp ?? j.fingerprint ?? j.rt_fingerprint ?? j.click_fingerprint;
    let dt = j.dt ?? j.track_time ?? j.created_at ?? j.createdAt ?? j.conv_time ?? j.click_date ?? j.date;
    if (dt && String(dt).startsWith('0001-')) dt = j.track_time ?? j.click_track_time ?? null;
    if (!fp || !dt) return null;
    const type = j.t ?? j.type ?? j.event_type ?? j.event ?? '';
    const t = (typeof type === 'string' && normalizeType(type)) || normalizeType(String(type));
    if (!t) return null;
    if (t === 'c') {
      return { t:'c', fp:String(fp), dt:String(dt),
        src:canonicalizeSource(j.src??j.rt_source??j.source??j.lastVisitSource),
        cmp:j.cmp??j.rt_campaign??j.campaign??j.lastVisitCampaign,
        dev:j.dev??j.device_fullname??j.device??j.device_type,
        br:j.br??j.browser, os:j.os??j.os_fullname,
        co:j.co??j.country, ci:j.ci??j.city,
        s1:j.s1??j.sub1??j.rt_sub1??j.sub_1,
        s2:j.s2??j.sub2??j.rt_sub2??j.sub_2,
        s3:j.s3??j.sub3??j.rt_sub3??j.sub_3,
        s4:j.s4??j.sub4??j.rt_sub4??j.sub_4,
        s5:j.s5??j.sub5??j.rt_sub5??j.sub_5,
        s6:j.s6??j.sub6??j.rt_sub6??j.sub_6 };
    }
    if (t === 'v') {
      return { t:'v', fp:String(fp), dt:String(dt),
        vt:j.vt??j.type??j.conversion_type??j.conversionType??j.default_type??'',
        pay:parseMaybeNumber(j.pay??j.payout??j.payout_default??j.pub_revenue??j.payout_network),
        src:canonicalizeSource(j.src??j.rt_source??j.source??j.lastVisitSource),
        cmp:j.cmp??j.rt_campaign??j.campaign??j.lastVisitCampaign,
        dev:j.dev??j.device_fullname??j.device??j.device_type,
        br:j.br??j.browser, os:j.os??j.os_fullname,
        co:j.co??j.country, ci:j.ci??j.city,
        s4:j.s4??j.sub4??j.rt_sub4??j.sub_4,
        s5:j.s5??j.sub5??j.rt_sub5??j.sub_5,
        s6:j.s6??j.sub6??j.rt_sub6??j.sub_6 };
    }
    return { t:'o', fp:String(fp), dt:normalizeTimestamp(String(dt)),
      oid:j.oid??j.orderId??j.order_id??j.shopify_order_id??j.shopify_order_orderId??j.order,
      pr:parseMaybeNumber(j.pr??j.price??j.payout_default??j.payout??j.payout_network??j.total_price),
      st:((j.st??j.status??j.order_status??j.financial_status)||'').toUpperCase()||undefined,
      cid:j.cid??j.customerId??j.customer_id??j.user_id,
      nm:j.nm??j.customer_name??j.name??j.customer,
      em:j.em??j.customer_email??j.email,
      rcmp:j.rcmp??j.cmp??j.rt_campaign??j.campaign,
      fsrc:j.fsrc??j.src??j.rt_source??j.source,
      lsrc:j.lsrc??j.lastVisitSource, app:j.app??j.application??j.appName,
      cur:j.cur??j.currency, co:j.co??j.country, ci:j.ci??j.city,
      dev:j.dev??j.device_fullname??j.device??j.device_type,
      br:j.br??j.browser, os:j.os??j.os_fullname,
      s4:j.s4??j.sub4??j.rt_sub4??j.sub_4,
      s5:j.s5??j.sub5??j.rt_sub5??j.sub_5,
      s6:j.s6??j.sub6??j.rt_sub6??j.sub_6 };
  }

  // Main entry point: detects row format and routes to the right normalizer.
  // Wide CSV (192 cols) → splits into up to 3 records (order + click + conversion).
  // JSON raw_data column → parses and normalizes. Native short keys → direct normalize.
  function normalizeRow(row) {
    if (!row) return null;
    const hasWideSignals =
      row.click_fingerprint !== undefined ||
      row.conversion_fingerprint !== undefined ||
      row.shopify_order_rt_fingerprint !== undefined ||
      row.shopify_order_orderid !== undefined ||
      row.shopify_order_order_id !== undefined;

    if (hasWideSignals) {
      const out = [];
      const copyPrefixedNonEmpty = (target, prefix) => {
        for (const [k, v] of Object.entries(row)) {
          if (!k || !k.startsWith(prefix)) continue;
          if (v === undefined || v === null) continue;
          const s = String(v).trim();
          if (!s || s === 'null' || s === 'undefined' || s === 'NaN') continue;
          target[k] = v;
        }
      };

      const orderOid = getFirst(row, ['shopify_order_orderid', 'shopify_order_order_id']);
      const orderFp = getFirst(row, ['shopify_order_rt_fingerprint', 'shopify_order_fp', 'shopify_order_fingerprint']);
      const orderDt = getFirst(row, ['shopify_order_createdat', 'shopify_order_processedat']);
      if (orderOid && orderFp && orderDt) {
        const orderRec = {
          t:'o', fp:String(orderFp), dt:normalizeTimestamp(String(orderDt)), oid:String(orderOid),
          pr:parseMaybeNumber(getFirst(row, ['shopify_order_price', 'shopify_order_pr'])),
          st:(getFirst(row, ['shopify_order_status','shopify_order_st','shopify_order_financial_status'])||'').toUpperCase()||undefined,
          cid:getFirst(row, ['shopify_order_customerid','shopify_order_customer_id']),
          nm:getFirst(row, ['shopify_order_customer_name','shopify_order_customer']),
          em:getFirst(row, ['shopify_order_customer_email','shopify_order_customer_email_address','shopify_order_email']),
          rcmp:getFirst(row, ['shopify_order_rt_campaignname','shopify_order_rt_campaign','shopify_order_lastvisitcampaign']),
          fsrc:getFirst(row, ['shopify_order_firstvisitsource','shopify_order_first_visit_source','shopify_order_firstvisit_source']),
          lsrc:getFirst(row, ['shopify_order_lastvisitsource','shopify_order_last_visit_source','shopify_order_lastvisit_source']),
          app:getFirst(row, ['shopify_order_appname','shopify_order_app','shopify_order_application']),
          cur:getFirst(row, ['shopify_order_raw_data_currency','shopify_order_currency']),
          ci:getFirst(row, ['shopify_order_city','shopify_order_address_city']),
          co:getFirst(row, ['conversion_country','click_country','shopify_order_country']),
          s1:getFirst(row, ['shopify_order_rt_sub1']), s2:getFirst(row, ['shopify_order_rt_sub2']), s3:getFirst(row, ['shopify_order_rt_sub3']),
          ip:getFirst(row, ['shopify_order_raw_data_browser_ip','shopify_order_raw_data_client_details.browser_ip']),
          ua:getFirst(row, ['shopify_order_raw_data_client_details.user_agent','shopify_order_raw_data_client_details.useragent']),
          isp:getFirst(row, ['shopify_order_raw_data_client_details.isp','shopify_order_raw_data_isp']),
          dev:getFirst(row, ['shopify_order_raw_data_device_fullname','shopify_order_raw_data_device_full','shopify_order_device_fullname','shopify_order_device_full','shopify_order_device']),
          br:getFirst(row, ['shopify_order_raw_data_browser_fullname','shopify_order_raw_data_browser','shopify_order_browser_fullname','shopify_order_browser']),
          os:getFirst(row, ['shopify_order_raw_data_os_fullname','shopify_order_raw_data_os','shopify_order_os_fullname','shopify_order_os']),
          addr:getFirst(row, ['shopify_order_address','shopify_order_raw_data_billing_address.address1','shopify_order_raw_data_shipping_address.address1']),
          zip:getFirst(row, ['shopify_order_zip','shopify_order_raw_data_billing_address.zip','shopify_order_raw_data_shipping_address.zip']),
        };
        copyPrefixedNonEmpty(orderRec, 'shopify_order_');
        out.push(orderRec);
      }

      const clickFp = getFirst(row, ['click_fingerprint','click_fingerprint_hash']);
      let clickDt = getFirst(row, ['click_track_time','click_created_at','click_date']);
      if (clickDt && String(clickDt).startsWith('0001-')) clickDt = null;
      if (clickFp && clickDt) {
        const clickRec = {
          t:'c', fp:String(clickFp), dt:String(clickDt),
          src:canonicalizeSource(getFirst(row, ['click_source'])), cmp:getFirst(row, ['click_campaign','click_campaign_id']),
          dev:getFirst(row, ['click_device_fullname','click_device_full','click_device']),
          br:getFirst(row, ['click_browser']), os:getFirst(row, ['click_os']),
          co:getFirst(row, ['click_country']), ci:getFirst(row, ['click_city']),
          s1:getFirst(row, ['click_sub1']), s2:getFirst(row, ['click_sub2']), s3:getFirst(row, ['click_sub3']),
          s4:getFirst(row, ['click_sub4']), s5:getFirst(row, ['click_sub5']), s6:getFirst(row, ['click_sub6']),
          nm:getFirst(row, ['shopify_order_customer_name']),
          em:getFirst(row, ['shopify_order_customer_email']),
          cid:getFirst(row, ['shopify_order_customerid']),
          ip:getFirst(row, ['click_ip','click_ip_address','click_ipaddress']),
          ua:getFirst(row, ['click_user_agent','click_ua']),
          isp:getFirst(row, ['click_isp']),
          addr:getFirst(row, ['shopify_order_address','shopify_order_raw_data_billing_address.address1','shopify_order_raw_data_shipping_address.address1']),
          zip:getFirst(row, ['shopify_order_zip','shopify_order_raw_data_billing_address.zip','shopify_order_raw_data_shipping_address.zip']),
          cur:getFirst(row, ['shopify_order_raw_data_currency','shopify_order_currency']),
        };
        copyPrefixedNonEmpty(clickRec, 'click_');
        out.push(clickRec);
      }

      const convFp = getFirst(row, ['conversion_fingerprint']);
      const convDt = getFirst(row, ['conversion_conv_time','conversion_created_at','conversion_track_time']);
      if (convFp && convDt) {
        const convRec = {
          t:'v', fp:String(convFp), dt:String(convDt),
          vt:getFirst(row, ['conversion_type','conversion_event','conversion_default_type']),
          pay:parseMaybeNumber(getFirst(row, ['conversion_payout_default','conversion_payout'])),
          src:canonicalizeSource(getFirst(row, ['conversion_rt_source','conversion_source'])),
          cmp:getFirst(row, ['conversion_rt_campaign','conversion_campaign']),
          dev:getFirst(row, ['conversion_device_fullname','conversion_device']),
          br:getFirst(row, ['conversion_browser']), os:getFirst(row, ['conversion_os']),
          co:getFirst(row, ['conversion_country']), ci:getFirst(row, ['conversion_city']),
          s1:getFirst(row, ['conversion_sub1','conversion_p_sub1']),
          s2:getFirst(row, ['conversion_sub2','conversion_p_sub2']),
          s3:getFirst(row, ['conversion_sub3','conversion_p_sub3']),
          s4:getFirst(row, ['conversion_sub4','conversion_p_sub4']),
          s5:getFirst(row, ['conversion_sub5','conversion_p_sub5']),
          s6:getFirst(row, ['conversion_sub6','conversion_p_sub6']),
          nm:getFirst(row, ['shopify_order_customer_name']),
          em:getFirst(row, ['shopify_order_customer_email']),
          cid:getFirst(row, ['shopify_order_customerid']),
          ip:getFirst(row, ['conversion_ip','conversion_ip_address','conversion_ipaddress']),
          ua:getFirst(row, ['conversion_user_agent','conversion_ua']),
          isp:getFirst(row, ['conversion_isp']),
          addr:getFirst(row, ['shopify_order_address','shopify_order_raw_data_billing_address.address1','shopify_order_raw_data_shipping_address.address1']),
          zip:getFirst(row, ['shopify_order_zip','shopify_order_raw_data_billing_address.zip','shopify_order_raw_data_shipping_address.zip']),
          cur:getFirst(row, ['shopify_order_raw_data_currency','shopify_order_currency']),
        };
        copyPrefixedNonEmpty(convRec, 'conversion_');
        out.push(convRec);
      }
      return out.length ? out : null;
    }

    const rawJson = row.raw_data ?? row.rawdata ?? row.raw_data_json ?? row.rawjson ?? row.raw;
    if (rawJson !== undefined && rawJson !== null && String(rawJson).trim() !== '') {
      try {
        const j = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
        return normalizeFromJsonEvent(j);
      } catch { /* fall through */ }
    }

    const hasNativeKeys =
      Object.prototype.hasOwnProperty.call(row, 't') ||
      Object.prototype.hasOwnProperty.call(row, 'fp') ||
      Object.prototype.hasOwnProperty.call(row, 'dt') ||
      Object.prototype.hasOwnProperty.call(row, 'fingerprint');
    if (hasNativeKeys) return normalizeFromNativeRow(row);

    const base = fmtRecordBase(row);
    if (!base) return null;
    const tRaw = getFirst(row, ['t', 'type', 'event_type', 'event']);
    base.t = normalizeType(tRaw);
    base.src = canonicalizeSource(getFirst(row, ['src', 'source', 'rt_source']));
    base.cmp = getFirst(row, ['cmp', 'campaign', 'rt_campaign']);
    base.oid = getFirst(row, ['oid', 'orderId', 'order_id', 'order']);
    base.pr = parseMaybeNumber(getFirst(row, ['pr', 'price', 'payout', 'payout_default']));
    base.st = (getFirst(row, ['st', 'status', 'order_status', 'financial_status']) || '').toUpperCase() || undefined;
    base.cid = getFirst(row, ['cid', 'customerId', 'customer_id', 'user_id']);
    base.nm = getFirst(row, ['nm', 'name', 'customer_name']);
    base.em = getFirst(row, ['em', 'email', 'customer_email']);
    base.co = getFirst(row, ['co', 'country']);
    base.ci = getFirst(row, ['ci', 'city']);
    base.vt = getFirst(row, ['vt', 'conversion_type', 'conversionType']);
    base.pay = parseMaybeNumber(getFirst(row, ['pay', 'payout', 'payout_default']));
    base.dev = getFirst(row, ['dev', 'device_fullname', 'device', 'device_type']);
    base.br = getFirst(row, ['br', 'browser']);
    base.os = getFirst(row, ['os', 'os_fullname', 'os_name']);
    base.s4 = getFirst(row, ['s4', 'sub4', 'rt_sub4']);
    base.s5 = getFirst(row, ['s5', 'sub5', 'rt_sub5']);
    base.s6 = getFirst(row, ['s6', 'sub6', 'rt_sub6']);
    if (!base.t) return null;
    if (base.t === 'o') base.dt = normalizeTimestamp(base.dt);
    return base;
  }

  // Fetches CSV from URL, auto-detects delimiter (comma vs semicolon),
  // normalizes all rows, caches result in IndexedDB for next load
  async function loadRecordsFromCsv(csvUrl, options = {}) {
    if (!csvUrl) throw new Error('Missing csvUrl');
    if (!window.Papa) throw new Error('PapaParse is not loaded');
    if (!window.idbCache) throw new Error('idbCache is not loaded');
    const CACHE_VERSION = 5; // bump to invalidate stale cached records
    const cacheKey = `csv:v${CACHE_VERSION}:${csvUrl}`;
    const cached = await window.idbCache.get(cacheKey);
    if (cached && Array.isArray(cached) && cached.length) return cached;
    const res = await fetch(csvUrl, { method: 'GET' });
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status} ${res.statusText}`);
    const text = await res.text();
    const firstLine = String(text).split(/\r?\n/)[0] || '';
    const delimiter = firstLine.includes(';') && (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ',';
    const parsed = window.Papa.parse(text, {
      header: true, delimiter, skipEmptyLines: true, dynamicTyping: false,
      transformHeader: (h) => String(h ?? '').trim().toLowerCase(),
    });
    if (parsed.errors && parsed.errors.length) console.warn('CSV parse errors:', parsed.errors.slice(0, 3));
    const rows = parsed.data || [];
    const records = [];
    for (const r of rows) {
      const rec = normalizeRow(r);
      if (!rec) continue;
      if (Array.isArray(rec)) records.push(...rec);
      else records.push(rec);
    }
    await window.idbCache.set(cacheKey, records);
    return records;
  }

  window.loadRecordsFromCsv = loadRecordsFromCsv;
  window.normalizeRow = normalizeRow;
})();


// ═══════════════════════════════════════════
// Dashboard — the main app class
// Takes an array of normalized records, groups them into journey paths
// and customers, renders three tabs (Journey Paths, Orders, Customers),
// and handles the detail side panel for drill-downs.
// ═══════════════════════════════════════════
class Dashboard {
    // Human-readable labels for all known record fields
    static LABEL_MAP = {
        t:'Type', fp:'Fingerprint', dt:'Date',
        src:'Source', cmp:'Ad Campaign', rcmp:'Ref. Campaign',
        fsrc:'First Source', fmed:'First Medium', lsrc:'Last Source', lmed:'Last Medium',
        s1:'Sub1', s2:'Sub2', s3:'Sub3', s4:'Creative', s5:'Sub5', s6:'Sub6', adg:'Ad Group', plc:'Placement',
        dev:'Device', br:'Browser', os:'OS', ua:'User Agent',
        co:'State', ci:'City', ip:'IP Address', isp:'ISP', addr:'Address', zip:'Zip Code',
        nm:'Customer Name', em:'Email', cid:'Customer ID',
        vt:'Conversion Type', pay:'Payout',
        oid:'Order ID', pr:'Price', st:'Status', cur:'Currency', app:'App',
    };

    // Groups for the field configurator, ordered by display priority.
    // 'prefix' groups are built dynamically from raw CSV columns at render time.
    static FIELD_GROUPS = [
        { label:'Core',        keys:['dt','t','fp'] },
        { label:'Attribution', keys:['src','cmp','rcmp','fsrc','fmed','lsrc','lmed','s1','s2','s3','s4','s5','s6','adg','plc'] },
        { label:'Device',      keys:['dev','os','br','ua'] },
        { label:'Location',    keys:['co','ci','ip','isp','addr','zip'] },
        { label:'Customer',    keys:['nm','em','cid'] },
        { label:'Action',  keys:['vt','pay'] },
        { label:'Order',       keys:['oid','pr','st','cur','app'] },
        // Raw CSV column groups — populated dynamically via prefix matching
        { label:'Raw — Click',       prefix:'click_' },
        { label:'Raw — Conversion',  prefix:'conversion_' },
        { label:'Raw — Order',       prefix:'shopify_order_' },
    ];

    constructor(data) {
        this.raw = data;
        this.filtered = data;
        this.clicks = data.filter(r=>r.t==='c');
        this.convs = data.filter(r=>r.t==='v');
        this.orders = data.filter(r=>r.t==='o');
        this.activeTab = 'attribution';
        this.pages = {orders:0, customers:0, route:0};
        this.pageSize = 20;
        this.sortState = {};
        this._stops = {
            stop1: { dimKey: 'src' },
            stop2: { dimKey: null, value: null },
            stop3: { dimKey: null, value: null },
        };
        this._stopsSort = { col: 'count', asc: false };
        this._expandedStopRows = new Set();
        this._stopFpsPages = {};
        this._stopFpsPageSize = 20;
        this._activeStopPopup = null;
        this._tabFilters = {};
        this._currentTab = 'attribution';
        this.filteredJourneys = null;
        this.filteredOrders = null;
        this.filteredCustomers = null;
        this._panelStates = {
            route:       { history: [], current: null, scrollTop: 0 },
            orders:      { history: [], current: null, scrollTop: 0 },
            customers:   { history: [], current: null, scrollTop: 0 },
            attribution: { history: [], current: null, scrollTop: 0 },
        };
        this._skipPanelPush = false;
        this._hideSubscriptions = false;
        // Load saved field visibility config from localStorage
        // tpHiddenFields: Set of field keys the user has chosen to hide
        try {
            const saved = localStorage.getItem('tpHiddenFields');
            this.tpHiddenFields = saved ? new Set(JSON.parse(saved)) : new Set();
        } catch(e) {
            this.tpHiddenFields = new Set();
        }
        this.init();
        document.addEventListener('click', (e) => {
            if (this._activeStopPopup && !e.target.closest('.stop-popup') && !e.target.closest('.stop-header-btn') && !e.target.closest('#stop-popup-portal') && !e.target.closest('.stop-col')) {
                this._activeStopPopup = null;
                if (this._currentTab === 'attribution') this.renderAttribution();
            }
        });
    }

    // Persists the hidden-fields set to localStorage
    saveTpFieldConfig() {
        try { localStorage.setItem('tpHiddenFields', JSON.stringify([...this.tpHiddenFields])); } catch(e) {}
    }

    isFieldVisible(key) {
        return !this.tpHiddenFields.has(key);
    }

    isSubscription(r) {
        return r.t === 'o' && r.app && r.app.toLowerCase().includes('recharge');
    }

    isSubscriptionAction(r) {
        if (r.t !== 'v' || !r.vt) return false;
        const vt = r.vt.toLowerCase();
        return vt === 'recurring' || vt === 'shipping';
    }

    classifyTouchpoint(r, firstOrderTs) {
        if (firstOrderTs == null) return 'pre';
        const rTime = this.parseDate(r.dt);
        if (!rTime) return 'pre';
        const rTs = rTime.getTime();
        if (r.t === 'o' && Math.abs(rTs - firstOrderTs) < 1000) return 'first';
        if (rTs < firstOrderTs) return 'pre';
        return 'post';
    }

    toggleSubscriptions() {
        this._hideSubscriptions = !this._hideSubscriptions;
        const cb = document.getElementById('hide-subs-toggle');
        if (cb) cb.checked = this._hideSubscriptions;
        this.applyFilters();
    }

    _panelState() {
        const tab = this._currentTab || 'route';
        return this._panelStates[tab];
    }

    // Pick the current scroll container — v2 uses `.panel-body`, legacy uses `.detail-content`,
    // and if neither exists we fall back to the outer `#detail-container`.
    _panelScroller() {
        const container = document.getElementById('detail-container');
        if (!container) return null;
        return container.querySelector('.panel-body') || container.querySelector('.detail-content') || container;
    }

    _pushPanelState(method, args) {
        const el = this._panelScroller();
        this._panelState().history.push({
            method,
            args,
            scrollTop: el ? el.scrollTop : 0
        });
    }

    _trackPanelView(method, args) {
        const state = this._panelState();
        if (state.current && state.current.method === method && JSON.stringify(state.current.args) === JSON.stringify(args)) {
            return;
        }
        if (!this._skipPanelPush && state.current) {
            this._pushPanelState(state.current.method, state.current.args);
        }
        state.current = { method, args };
    }

    _panelHeaderHtml() {
        const history = this._panelState().history;
        const backBtn = history.length > 0
            ? '<button class="detail-back" onclick="D.panelGoBack()">← Back</button>'
            : '<span></span>';
        return `<div class="detail-header">${backBtn}<button class="detail-close" onclick="D.closeDetail()">×</button></div>`;
    }

    _openDetailContainer(html) {
        this._updateDrawerTop();
        const container = document.getElementById('detail-container');
        container.innerHTML = `${this._panelHeaderHtml()}<div class="detail-content">${html}</div>`;
        container.classList.add('open');
        const bd = document.getElementById('backdrop');
        if (bd) bd.classList.add('open');
        document.body.classList.add('no-scroll');
        // Detail drawer is now a bottom slide-up overlay — keep tab content in place underneath.
    }

    // v2 panel controls: close on the left, then a back arrow when history exists.
    // Returned as raw HTML so view methods can inline it into their panel-head.
    _panelControlsV2() {
        const history = this._panelState().history;
        const close = `<button class="icon-btn" onclick="D.closeDetail()" title="Close" aria-label="Close">×</button>`;
        const back = history.length > 0
            ? `<button class="icon-btn" onclick="D.panelGoBack()" title="Back" aria-label="Back" style="margin-left:4px;">←</button>`
            : '';
        return close + back;
    }

    // v2 open: emits `.panel-head` + `.panel-body` directly (no legacy wrappers).
    // `head` and `body` are HTML strings; use `_panelControlsV2()` to get close/back buttons.
    _openPanel({ head, body }) {
        this._updateDrawerTop();
        const container = document.getElementById('detail-container');
        if (!container) return;
        container.innerHTML = `<div class="panel-head">${head}</div><div class="panel-body">${body}</div>`;
        container.classList.add('open');
        const bd = document.getElementById('backdrop');
        if (bd) bd.classList.add('open');
        document.body.classList.add('no-scroll');
    }

    _hideActiveTabBody() {
        document.querySelectorAll('.tab-body').forEach(tb => tb.style.display = 'none');
        const tabFilters = document.getElementById('tab-filters');
        if (tabFilters) tabFilters.style.display = 'none';
    }

    _showActiveTabBody() {
        const activeTab = this._currentTab || 'route';
        document.querySelectorAll('.tab-body').forEach(tb => {
            tb.style.display = tb.id === 'tab-' + activeTab ? '' : 'none';
        });
        document.querySelectorAll('.tab-body').forEach(tb => {
            tb.classList.toggle('active', tb.id === 'tab-' + activeTab);
        });
        const tabFilters = document.getElementById('tab-filters');
        if (tabFilters) tabFilters.style.display = '';
    }

    panelGoBack() {
        const state = this._panelState();
        if (!state.history.length) return;
        const prev = state.history.pop();
        this._skipPanelPush = true;
        state.current = { method: prev.method, args: prev.args };
        this[prev.method](...prev.args);
        this._skipPanelPush = false;
        requestAnimationFrame(() => {
            const el = this._panelScroller();
            if (el) el.scrollTop = prev.scrollTop;
        });
    }

    // Collect every unique field key that exists anywhere in the dataset
    getAllRecordKeys() {
        if(this._allRecordKeys) return this._allRecordKeys;
        const keys = new Set();
        this.raw.forEach(r => Object.keys(r).forEach(k => keys.add(k)));
        this._allRecordKeys = [...keys].sort();
        return this._allRecordKeys;
    }

    init() {
        this.applyTheme();
        this.bindThemeToggle();
        this.initDateRange();
        this.renderDateRangeTrigger();
        this.bindDateRangeTrigger();
        this.bindBackdrop();
        this.bindDrawerTopTracker();
        this.renderTabFilters();
        this.applyFilters();
    }

    // ========== Drawer top-edge tracking ==========
    // The bottom detail drawer opens from the bottom of the viewport up to
    // the bottom edge of `.tabs-wrap` (header + tabs row). We expose that
    // pixel offset to CSS via `--drawer-top` so #detail-container and
    // #backdrop can anchor themselves below the tabs. Recomputed on resize,
    // theme change, and whenever the tabs row's own box changes (fonts,
    // responsive breakpoints, etc.).
    _updateDrawerTop() {
        const tabs = document.querySelector('.tabs-wrap');
        if (!tabs) return;
        const rect = tabs.getBoundingClientRect();
        // rect.bottom is relative to the viewport, which is what `position:
        // fixed; top: …` uses — exactly the anchor we want.
        const px = Math.max(0, Math.round(rect.bottom));
        document.documentElement.style.setProperty('--drawer-top', `${px}px`);
    }

    bindDrawerTopTracker() {
        if (this._drawerTopBound) return;
        this._drawerTopBound = true;
        this._updateDrawerTop();
        // Initial paint hasn't necessarily finished on first call during
        // init(); queue a second measurement after the browser has laid out
        // the tabs row with its final font metrics.
        requestAnimationFrame(() => this._updateDrawerTop());

        window.addEventListener('resize', () => this._updateDrawerTop());

        const tabs = document.querySelector('.tabs-wrap');
        if (tabs && typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(() => this._updateDrawerTop());
            ro.observe(tabs);
            // Also watch the header — its height can change when the date
            // picker expands below the field on narrow viewports.
            const header = document.querySelector('header.mgmt');
            if (header) ro.observe(header);
        }
    }

    // ========== Theme (Phase 5) ==========
    applyTheme() {
        const saved = localStorage.getItem('weem.theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
    }

    bindThemeToggle() {
        const btn = document.querySelector('[data-action="toggle-theme"]');
        if (!btn || btn._bound) return;
        btn._bound = true;
        btn.addEventListener('click', () => {
            const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const next = cur === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('weem.theme', next);
        });
    }

    // ========== Date range trigger (Phase 4) ==========
    // Seed #f-from / #f-to with an initial window (full data range) so the pill
    // has something to show on first render and the existing D.filter() pipeline works.
    initDateRange() {
        const fromInput = document.getElementById('f-from');
        const toInput = document.getElementById('f-to');
        if (!fromInput || !toInput) return;

        // If the user already picked a range in a previous session, use it.
        const savedFrom = localStorage.getItem('weem.dateFrom');
        const savedTo = localStorage.getItem('weem.dateTo');
        if (savedFrom) fromInput.value = savedFrom;
        if (savedTo) toInput.value = savedTo;

        // Otherwise infer a sensible default from the dataset itself.
        if (!fromInput.value || !toInput.value) {
            const dates = (this.raw || []).map(r => this.parseDate(r.dt)).filter(Boolean);
            if (dates.length) {
                dates.sort((a, b) => a - b);
                const toISO = d => {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${dd}`;
                };
                if (!fromInput.value) fromInput.value = toISO(dates[0]);
                if (!toInput.value) toInput.value = toISO(dates[dates.length - 1]);
            }
        }
    }

    formatDateShort(d) {
        if (!d) return '—';
        const dt = d instanceof Date ? d : this.parseDate(d);
        if (!dt || isNaN(dt)) return String(d || '—');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        const yy = dt.getFullYear();
        return `${mm}/${dd}/${yy}`;
    }

    renderDateRangeTrigger() {
        const slot = document.getElementById('dr-trigger-slot');
        if (!slot) return;
        const fromRaw = (document.getElementById('f-from') || {}).value || '';
        const toRaw = (document.getElementById('f-to') || {}).value || '';
        const fromLabel = fromRaw ? this.formatDateShort(fromRaw) : 'Select…';
        const toLabel = toRaw ? this.formatDateShort(toRaw) : 'Select…';

        const icon = `<svg class="dr-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5 L13.5 6.5 M5 2 L5 5 M11 2 L11 5"/></svg>`;
        const caret = `<svg class="dr-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

        slot.innerHTML = `
            <label>Date range</label>
            <button type="button" class="dr-pill" id="dr-trigger-pill">
                ${icon}
                <span>${fromLabel}</span>
                <span class="dr-sep">→</span>
                <span>${toLabel}</span>
                ${caret}
            </button>`;
    }

    bindDateRangeTrigger() {
        const pill = document.getElementById('dr-trigger-pill');
        if (!pill || pill._bound) return;
        pill._bound = true;

        pill.addEventListener('click', () => {
            if (!window.WeemDatePicker) return;
            const fromInput = document.getElementById('f-from');
            const toInput = document.getElementById('f-to');

            const fromD = fromInput && fromInput.value ? this.parseDate(fromInput.value) : null;
            const toD = toInput && toInput.value ? this.parseDate(toInput.value) : null;

            pill.classList.add('open');
            window.WeemDatePicker.open({
                anchor: pill,
                from: fromD || new Date(),
                to: toD || fromD || new Date(),
                focus: 'from',
                onApply: (f, t) => {
                    const toISO = d => {
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const dd = String(d.getDate()).padStart(2, '0');
                        return `${y}-${m}-${dd}`;
                    };
                    if (fromInput) fromInput.value = toISO(f);
                    if (toInput) toInput.value = toISO(t);
                    localStorage.setItem('weem.dateFrom', fromInput.value);
                    localStorage.setItem('weem.dateTo', toInput.value);
                    this.renderDateRangeTrigger();
                    this.bindDateRangeTrigger();
                    this.markFiltersPending();
                    this.applyFilters();
                },
                onClose: () => pill.classList.remove('open'),
            });
        });
    }

    // ========== Backdrop click-to-close (Phase 11 wiring) ==========
    bindBackdrop() {
        const bd = document.getElementById('backdrop');
        if (!bd || bd._bound) return;
        bd._bound = true;
        bd.addEventListener('click', () => this.closeDetail());
    }

    // Resets all filter inputs (global + per-tab) to default and auto-applies
    clearFilters() {
        document.getElementById('f-from').value='';
        document.getElementById('f-to').value='';
        document.getElementById('f-search').value='';
        Object.keys(this._tabFilters).forEach(tab => { this._tabFilters[tab] = []; });
        this.renderTabFilters();
        this.applyFilters();
    }


    // Highlights the Apply button to indicate staged changes waiting
    markFiltersPending() {
        const btn = document.getElementById('btn-apply-filters');
        if (btn) btn.classList.add('is-pending');
    }

    // Single entry point: runs global filter + per-tab filters + render
    applyFilters() {
        this.filter(true);
        this.applyTabFilters();
        this.renderTab();
        const btn = document.getElementById('btn-apply-filters');
        if (btn) btn.classList.remove('is-pending');
    }

    // Global filter: filters individual records by date range and search text,
    // then rebuilds journeys and customers. skipRender=true when called from applyFilters().
    filter(skipRender) {
        const from = document.getElementById('f-from').value;
        const to = document.getElementById('f-to').value;
        const search = document.getElementById('f-search').value.toLowerCase();

        this.filtered = this.raw.filter(r => {
            if(from && r.dt && r.dt < from) return false;
            if(to && r.dt && r.dt > to + 'T23:59:59') return false;
            if(search) {
                const hay = [r.nm,r.em,r.fp,r.oid,r.src,r.cmp,r.co,r.ci].filter(Boolean).join(' ').toLowerCase();
                if(!hay.includes(search)) return false;
            }
            return true;
        });

        this.fClicks = this.filtered.filter(r=>r.t==='c');
        this.fConvs = this.filtered.filter(r=>r.t==='v');
        this.fOrders = this.filtered.filter(r=>r.t==='o');
        if (this._hideSubscriptions) {
            this.fOrders = this.fOrders.filter(r => !this.isSubscription(r));
        }
        this.pages = {orders:0, customers:0, route:0};

        this.buildJourneys();
        this.buildCustomers();

        this.filteredJourneys = null;
        this.filteredOrders = null;
        this.filteredCustomers = null;

        this.renderKPIs();
        this.renderFunnel();
        if (!skipRender) this.renderTab();
    }

    // Groups filtered records by fingerprint into journey path objects
    buildJourneys() {
        const map = new Map();
        this.filtered.forEach(r => {
            if(!r.fp) return;
            if(!map.has(r.fp)) map.set(r.fp, []);
            map.get(r.fp).push(r);
        });
        this.journeys = [];
        map.forEach((rows, fp) => {
            const clicks = rows.filter(r=>r.t==='c');
            const convs = rows.filter(r=>r.t==='v');
            const orders = rows.filter(r=>r.t==='o');
            const dates = rows.map(r=>r.dt).filter(Boolean).sort((a,b)=>this.compareDates(a, b));
            const custOrder = orders.find(o=>o.nm||o.em);
            const revenue = orders.reduce((s,o)=>s+(parseFloat(o.pr)||0),0);
            const sorted = [...rows].sort((a, b) => (a.dt || '').localeCompare(b.dt || ''));
            const orderDates = orders.map(o => ({ dt: o.dt, parsed: this.parseDate(o.dt) })).filter(o => o.parsed).sort((a, b) => a.parsed - b.parsed);
            const firstOrderTs = orderDates.length > 0 ? orderDates[0].parsed.getTime() : null;
            this.journeys.push({
                fp, rows, clicks, convs, orders,
                count: rows.length,
                firstDate: dates[0]||'',
                lastDate: dates[dates.length-1]||'',
                src: (clicks[0]||convs[0]||{}).src||'',
                cmp: (clicks[0]||convs[0]||{}).cmp||'',
                dev: (clicks[0]||{}).dev||'',
                hasOrder: orders.length>0,
                hasConv: convs.length>0,
                hasClick: clicks.length>0,
                custName: (custOrder||{}).nm||'',
                custEmail: (custOrder||{}).em||'',
                custId: (custOrder||{}).cid||'',
                revenue,
                firstOrderTs,
                firstSource: (sorted[0]||{}).src||'',
                subsequentSources: [...new Set(sorted.slice(1).map(r => r.src).filter(Boolean))]
            });
        });
        this.journeys.sort((a,b) => this.compareDates(b.lastDate, a.lastDate));
    }

    // Aggregates orders by customer ID → {name, email, order count, revenue, fingerprints}
    buildCustomers() {
        const map = new Map();
        this.fOrders.forEach(o => {
            if(!o.cid) return;
            if(!map.has(o.cid)) map.set(o.cid, {cid:o.cid, nm:o.nm, em:o.em, orders:[], fps:new Set()});
            const c = map.get(o.cid);
            c.orders.push(o);
            if(o.fp) c.fps.add(o.fp);
        });
        this.customers = [];
        map.forEach(c => {
            // Collect all touchpoints across all fingerprints
            let touchpoints = 0;
            c.fps.forEach(fp => {
                this.filtered.forEach(r => { if(r.fp===fp) touchpoints++; });
            });
            const rev = c.orders.reduce((s,o)=>s+(o.pr||0),0);
            const dates = c.orders.map(o=>o.dt).filter(Boolean).sort((a,b)=>this.compareDates(a, b));
            const allOrderDates = c.orders.map(o => this.parseDate(o.dt)).filter(Boolean).sort((a, b) => a - b);
            const firstOrderTs = allOrderDates.length > 0 ? allOrderDates[0].getTime() : null;
            this.customers.push({
                cid:c.cid, nm:c.nm||'Unknown', em:c.em||'',
                orderCount: c.orders.length,
                fpCount: c.fps.size,
                touchpoints,
                revenue: rev,
                firstSeen: dates[0]||'',
                lastSeen: dates[dates.length-1]||'',
                firstOrderTs,
                fps: [...c.fps],
                orders: c.orders
            });
        });
        this.customers.sort((a,b) => b.revenue - a.revenue);
    }

    // Renders the conversion funnel bar from filtered data
    renderFunnel() {
        const panel = document.getElementById('funnel-panel');
        if (panel && panel.style.display === 'none') return;
        const bar = document.getElementById('funnel-bar');
        const summary = document.getElementById('funnel-summary');
        if (!bar || !summary) return;

        const counts = {};
        counts['click'] = this.filtered.filter(r => r.t === 'c').length;
        this.filtered.forEach(r => {
            if (r.t === 'v' && r.vt) {
                counts[r.vt] = (counts[r.vt] || 0) + 1;
            }
        });
        if (!counts['Purchase']) {
            counts['Purchase'] = this.filtered.filter(r => r.t === 'o').length;
        }

        const activeStages = FUNNEL_STAGES.filter(s => (counts[s.key] || 0) > 0);
        if (activeStages.length === 0) {
            bar.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px;">No funnel data for current filters</div>';
            summary.textContent = '';
            return;
        }

        const maxCount = Math.max(...activeStages.map(s => counts[s.key] || 0));
        const firstCount = counts[activeStages[0].key] || 0;
        const lastCount = counts[activeStages[activeStages.length - 1].key] || 0;
        const overallRate = firstCount > 0 ? ((lastCount / firstCount) * 100).toFixed(1) : 0;

        summary.textContent = `${activeStages[0].label} → ${activeStages[activeStages.length - 1].label}: ${overallRate}% overall conversion`;

        let html = '';
        activeStages.forEach((stage, i) => {
            const count = counts[stage.key] || 0;

            html += `<div class="funnel-stage ${stage.cssClass}" style="flex:1 1 0;min-width:0;border-radius:${i === 0 ? '8px 0 0 8px' : i === activeStages.length - 1 ? '0 8px 8px 0' : '0'};">
                <div class="funnel-stage-label">${stage.label}</div>
                <div class="funnel-stage-count">${count.toLocaleString()}</div>
            </div>`;

            if (i < activeStages.length - 1) {
                const nextCount = counts[activeStages[i + 1].key] || 0;
                const rate = count > 0 ? ((nextCount / count) * 100).toFixed(0) : 0;
                html += `<div class="funnel-arrow">
                    <div>→</div>
                    <div class="funnel-arrow-rate">${rate}%</div>
                </div>`;
            }
        });

        bar.innerHTML = html;

        requestAnimationFrame(() => {
            const barEl = document.getElementById('funnel-bar');
            if (!barEl) return;
            const stageEls = barEl.querySelectorAll('.funnel-stage');
            const arrowEls = barEl.querySelectorAll('.funnel-arrow');
            if (!stageEls.length) return;
            const barWidth = barEl.getBoundingClientRect().width;
            let totalArrowWidth = 0;
            arrowEls.forEach(a => totalArrowWidth += a.getBoundingClientRect().width);
            const available = barWidth - totalArrowWidth - 2;
            const stageWidth = Math.floor(available / stageEls.length);
            stageEls.forEach(s => {
                s.style.flex = 'none';
                s.style.width = stageWidth + 'px';
            });
        });
    }

    // Shows/hides the funnel panel via the filter bar button
    toggleFunnelPanel() {
        const panel = document.getElementById('funnel-panel');
        const btn = document.getElementById('funnel-toggle-btn');
        if (!panel || !btn) return;
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? '' : 'none';
        btn.textContent = isHidden ? 'Hide Conversion Funnel' : 'Show Conversion Funnel';
        if (isHidden) this.renderFunnel();
    }

    // Updates tab count badges
    renderKPIs() {
        document.getElementById('tc-attribution').textContent = '('+this.journeys.length+')';
        document.getElementById('tc-orders').textContent = '('+this.fOrders.length+')';
        document.getElementById('tc-customers').textContent = '('+this.customers.length+')';
        document.getElementById('tc-route').textContent = '('+this.journeys.length+')';
    }

    // --- TABS ---
    switchTab(tab) {
        const prevTab = this._currentTab || 'route';
        const container = document.getElementById('detail-container');
        const panelIsOpen = container && container.classList.contains('open');

        if (panelIsOpen) {
            const scroller = this._panelScroller();
            this._panelStates[prevTab].scrollTop = scroller ? scroller.scrollTop : 0;
        }

        this.activeTab = tab;
        this._currentTab = tab;

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const activeBtn = document.querySelector('.tab[data-tab="' + tab + '"]');
        if (activeBtn) activeBtn.classList.add('active');

        // Ensure tab bodies are in the right state before rendering
        if (container) {
            container.classList.remove('open');
            container.innerHTML = '';
        }
        const bd = document.getElementById('backdrop');
        if (bd) bd.classList.remove('open');
        document.body.classList.remove('no-scroll');
        this._showActiveTabBody();

        this.renderTabFilters();
        this.renderTab();

        // Restore per-tab panel state if this tab had one open
        const newState = this._panelStates[tab];
        if (newState && newState.current) {
            this._skipPanelPush = true;
            this[newState.current.method](...newState.current.args);
            this._skipPanelPush = false;
            requestAnimationFrame(() => {
                const el = this._panelScroller();
                if (el) el.scrollTop = newState.scrollTop || 0;
            });
        }
    }

    renderTab() {
        if(this.activeTab==='orders') this.renderOrders();
        else if(this.activeTab==='route') this.renderRoute();
        else if(this.activeTab==='attribution') this.renderAttribution();
        else this.renderCustomers();
        // After the active tab renders any native <select>s, restyle them.
        this.enhanceSelects();
    }

    // Renders the Orders tab: sortable table with order ID, date, value, status, customer, fingerprint
    renderOrders() {
        let data = [...(this.filteredOrders || this.fOrders)];
        const s = this.sortState.orders;
        if (s) data.sort((a, b) => {
            const av = a[s.f] || '', bv = b[s.f] || '';
            const c = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return s.d === 'asc' ? c : -c;
        });
        const start = this.pages.orders * this.pageSize;
        const page = data.slice(start, start + this.pageSize);
        const total = data.length;
        const esc = this._escHtml.bind(this);

        const cols = [
            { f: 'dt',   l: 'Date' },
            { f: 'oid',  l: 'Order ID' },
            { f: 'nm',   l: 'Customer' },
            { f: 'fsrc', l: 'Source' },
            { f: 'rcmp', l: 'Ref. Campaign' },
            { f: 'app',  l: 'App' },
            { f: 'co',   l: 'State' },
            { f: 'pr',   l: 'Value' },
            { f: 'st',   l: 'Status' },
            { f: 'fp',   l: 'Fingerprint' },
        ];

        let html = `<div class="sort-bar">
            <span class="results"><b>${total}</b> order${total === 1 ? '' : 's'}</span>
        </div>
        <table class="tbl"><thead><tr>`;
        cols.forEach(c => {
            const sorted = s && s.f === c.f;
            const cls = 'sortable' + (sorted ? (s.d === 'asc' ? ' sorted sort-asc' : ' sorted sort-desc') : '');
            html += `<th class="${cls}" onclick="D.sortCol('orders','${c.f}')">${esc(c.l)}</th>`;
        });
        html += `</tr></thead><tbody>`;

        page.forEach(r => {
            const isSub = this.isSubscription(r);
            const rowClass = isSub ? 'subscription-row' : '';

            const src = r.fsrc || r.src || '';
            const srcCell = src
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(src)}"></span>${esc(src)}</span>`
                : '<span class="dim">—</span>';

            const appCell = isSub
                ? '<span class="badge subscription">SUB</span>'
                : (r.app ? esc(r.app) : '<span class="dim">—</span>');

            let stBadge = '<span class="dim">—</span>';
            if (r.st) {
                const up = String(r.st).toUpperCase();
                const variant = up === 'FULFILLED' ? 'purchase' : up === 'PENDING' ? 'action' : 'subscription';
                stBadge = `<span class="badge ${variant}">${esc(r.st)}</span>`;
            }

            const custName = r.nm || '';
            let custCell;
            if (custName) {
                const nameHtml = r.cid
                    ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToCustomer('${esc(r.cid)}')">${esc(custName)}</a>`
                    : esc(custName);
                const emailHtml = r.em ? `<br><small class="dim">${esc(r.em)}</small>` : '';
                custCell = nameHtml + emailHtml;
            } else if (r.em) {
                custCell = `<small class="dim">${esc(r.em)}</small>`;
            } else {
                custCell = '<span class="dim">—</span>';
            }

            const fpCell = r.fp
                ? `<a class="xlink mono" onclick="event.stopPropagation();D.navigateToFingerprint('${esc(r.fp)}')" title="${esc(r.fp)}">${esc(r.fp)}</a>`
                : '<span class="dim">—</span>';

            const oidCell = r.oid
                ? `<a class="xlink mono" onclick="event.stopPropagation();D.showOrder('${esc(r.oid)}')">${esc(r.oid)}</a>`
                : '<span class="dim">—</span>';

            html += `<tr class="${rowClass}" onclick="D.showOrder('${esc(r.oid || '')}')" style="cursor:pointer;">
                <td class="mono dim">${esc(this.fmtDate(r.dt))}</td>
                <td>${oidCell}</td>
                <td>${custCell}</td>
                <td>${srcCell}</td>
                <td>${r.rcmp ? esc(r.rcmp) : '<span class="dim">—</span>'}</td>
                <td>${appCell}</td>
                <td>${r.co ? esc(r.co) : '<span class="dim">—</span>'}</td>
                <td class="mono" style="color:var(--green);font-weight:700;">$${(r.pr || 0).toFixed(2)}</td>
                <td>${stBadge}</td>
                <td>${fpCell}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('orders-table').innerHTML = html;
        makeContainerResizable('orders-table');
        this.renderPager('orders', total);
    }

    // Side panel: shows order details + customer info + journey timeline for that fingerprint
    showOrder(oid) {
        const order = this.fOrders.find(o => o.oid === oid);
        if (!order) return;
        this._trackPanelView('showOrder', [oid]);
        const esc = this._escHtml.bind(this);

        // Journey touchpoints for this order's fingerprint (for timeline)
        const touchpoints = order.fp ? this.raw.filter(r => r.fp === order.fp) : [];
        touchpoints.sort((a, b) => this.compareDates(a.dt, b.dt));
        const orderJourney = order.fp ? this.journeys.find(j => j.fp === order.fp) : null;

        const isSub = this.isSubscription(order);
        const kind = isSub ? 'Subscription' : 'Order';
        const stUp = order.st ? String(order.st).toUpperCase() : '';
        const stVariant = stUp === 'FULFILLED' ? 'purchase' : stUp === 'PENDING' ? 'action' : 'subscription';

        // ─── panel-head ─────────────────────────────────────────────────
        const head = `
            ${this._panelControlsV2()}
            <div class="panel-title">
                ${esc(kind)}
                <span class="pid">#${esc(order.oid || '')}</span>
                ${isSub ? '<span class="badge subscription">SUB</span>' : ''}
            </div>
            <div class="panel-meta">
                ${order.pr != null && order.pr !== '' ? `<div class="stat"><b style="color:var(--green)">$${Number(order.pr).toFixed(2)}</b><span>Value</span></div>` : ''}
                ${order.st ? `<div class="stat"><b><span class="badge ${stVariant}" style="font-size:10px;padding:2px 6px;">${esc(order.st)}</span></b><span>Status</span></div>` : ''}
                ${order.dt ? `<div class="stat"><b>${esc(this.fmtDate(order.dt))}</b><span>Date</span></div>` : ''}
                ${order.app ? `<div class="stat"><b>${esc(order.app)}</b><span>App</span></div>` : ''}
                ${order.nm ? `<div class="stat"><b>${esc(order.nm)}</b><span>Customer</span></div>` : ''}
            </div>`;

        // ─── kv-grid rows ───────────────────────────────────────────────
        const isNonEmpty = (v) => {
            if (v === undefined || v === null) return false;
            if (typeof v === 'string') return v.trim() !== '';
            return true;
        };
        const kvRow = (label, valueHtml, isMono) =>
            `<div class="kv-row"><div class="kv-k">${esc(label)}</div><div class="kv-v${isMono ? ' mono' : ''}">${valueHtml}</div></div>`;

        const srcChip = (v) => `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(v)}"></span>${esc(v)}</span>`;

        let rows = '';
        if (isNonEmpty(order.dt)) rows += kvRow('Date', esc(this.fmtDate(order.dt)), true);
        if (isNonEmpty(order.pr)) rows += kvRow('Value', `<span style="color:var(--green);font-weight:700;">$${Number(order.pr).toFixed(2)}</span>`, true);
        if (isNonEmpty(order.st)) rows += kvRow('Status', `<span class="badge ${stVariant}">${esc(order.st)}</span>`, false);
        if (isNonEmpty(order.app)) rows += kvRow('App', isSub ? `${esc(order.app)} <span class="badge subscription">SUB</span>` : esc(order.app), false);
        if (isNonEmpty(order.cur)) rows += kvRow('Currency', esc(order.cur), true);
        // Attribution / campaign
        if (isNonEmpty(order.rcmp)) rows += kvRow('Ref. Campaign', esc(order.rcmp), false);
        if (isNonEmpty(order.fsrc)) rows += kvRow('First Source', srcChip(order.fsrc), false);
        if (isNonEmpty(order.lsrc)) rows += kvRow('Last Source', srcChip(order.lsrc), false);
        // Geo
        if (isNonEmpty(order.ci)) rows += kvRow('City', esc(order.ci), false);
        if (isNonEmpty(order.co)) rows += kvRow('State', esc(order.co), false);
        // Identities
        if (isNonEmpty(order.nm)) {
            const nameHtml = order.cid
                ? `<a class="xlink" onclick="D.navigateToCustomer('${esc(order.cid)}')">${esc(order.nm)}</a>`
                : esc(order.nm);
            rows += kvRow('Customer Name', nameHtml, false);
        }
        if (isNonEmpty(order.em)) {
            const emHtml = order.cid
                ? `<a class="xlink" onclick="D.navigateToCustomer('${esc(order.cid)}')">${esc(order.em)}</a>`
                : esc(order.em);
            rows += kvRow('Email', emHtml, false);
        }
        if (isNonEmpty(order.cid)) rows += kvRow('Customer ID', `<a class="xlink mono" onclick="D.navigateToCustomer('${esc(order.cid)}')">${esc(order.cid)}</a>`, true);
        if (isNonEmpty(order.fp)) rows += kvRow('Fingerprint', `<a class="xlink mono" onclick="D.showJourneyPathsTable('${esc(order.fp)}')" title="${esc(order.fp)}">${esc(order.fp)}</a>`, true);

        // ─── related-links ──────────────────────────────────────────────
        const relatedLinks = [];
        if (order.cid) {
            const custLabel = order.nm || order.em || order.cid;
            relatedLinks.push(`<a class="xlink" onclick="D.navigateToCustomer('${esc(order.cid)}')">↗ Open customer · ${esc(custLabel)}</a>`);
        }
        if (order.fp) {
            relatedLinks.push(`<a class="xlink" onclick="D.showJourneyPathsTable('${esc(order.fp)}')">↗ Open journey path${orderJourney ? ` (${orderJourney.count} touchpoints)` : ''}</a>`);
            relatedLinks.push(`<a class="xlink" onclick="D.navigateToFingerprint('${esc(order.fp)}')">↗ Show fingerprint in Journey Paths</a>`);
        }

        // ─── panel-body ─────────────────────────────────────────────────
        let body = `
            <div class="section-head">
                <h3>${esc(kind)} details</h3>
                <span class="muted">All recorded fields for this order</span>
            </div>
            <div class="kv-grid">${rows}</div>`;

        if (relatedLinks.length) {
            body += `
            <div class="section-head" style="margin-top:4px;">
                <h3>Related</h3>
                <span class="muted">Jump to context</span>
            </div>
            <div class="related-links">${relatedLinks.join('')}</div>`;
        }

        if (touchpoints.length) {
            body += `
            <div>
                <div class="section-head">
                    <h3>Journey Path</h3>
                    <span class="muted">${touchpoints.length} touchpoint${touchpoints.length === 1 ? '' : 's'} for this fingerprint</span>
                </div>
                ${this.renderTouchpointTable(order.fp, touchpoints, orderJourney ? orderJourney.firstOrderTs : null)}
            </div>`;
        }

        this._openPanel({ head, body });
        makePanelResizable();
    }

    // Renders the Customers tab: sortable table with name, order count, journeys, revenue
    renderCustomers() {
        let data = [...(this.filteredCustomers || this.customers)];
        const s = this.sortState.customers;
        if (s) data.sort((a, b) => {
            const av = a[s.f] || '', bv = b[s.f] || '';
            const c = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return s.d === 'asc' ? c : -c;
        });
        const start = this.pages.customers * this.pageSize;
        const page = data.slice(start, start + this.pageSize);
        const total = data.length;
        const esc = this._escHtml.bind(this);

        const cols = [
            { f: 'nm',          l: 'Customer',     sortable: true  },
            { f: 'em',          l: 'Email',        sortable: false },
            { f: 'cid',         l: 'Customer ID',  sortable: false },
            { f: 'fpCount',     l: 'Fingerprints', sortable: true  },
            { f: 'orderCount',  l: 'Orders',       sortable: true  },
            { f: 'touchpoints', l: 'Touchpoints',  sortable: true  },
            { f: 'revenue',     l: 'Revenue',      sortable: true  },
            { f: 'firstSeen',   l: 'First Seen',   sortable: true  },
            { f: 'lastSeen',    l: 'Last Seen',    sortable: true  },
        ];

        let html = `<div class="sort-bar">
            <span class="results"><b>${total}</b> customer${total === 1 ? '' : 's'}</span>
        </div>
        <table class="tbl"><thead><tr>`;
        cols.forEach(c => {
            if (!c.sortable) {
                html += `<th>${esc(c.l)}</th>`;
                return;
            }
            const sorted = s && s.f === c.f;
            const cls = 'sortable' + (sorted ? (s.d === 'asc' ? ' sorted sort-asc' : ' sorted sort-desc') : '');
            html += `<th class="${cls}" onclick="D.sortCol('customers','${c.f}')">${esc(c.l)}</th>`;
        });
        html += `</tr></thead><tbody>`;

        page.forEach(c => {
            const name = c.nm || c.em || '—';
            const initials = String(name)
                .split(/\s+/)
                .map(p => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase() || '?';
            const nameCell = `
                <span class="cust-avatar" style="display:inline-grid;width:24px;height:24px;font-size:10px;vertical-align:middle;margin-right:8px;">${esc(initials)}</span>
                <a class="xlink" onclick="event.stopPropagation();D.showCustomer('${esc(c.cid)}')">${esc(name)}</a>`;

            html += `<tr onclick="D.showCustomer('${esc(c.cid)}')" style="cursor:pointer;">
                <td>${nameCell}</td>
                <td class="dim">${c.em ? esc(c.em) : '<span class="dim">—</span>'}</td>
                <td class="mono dim">${c.cid ? esc(c.cid) : '<span class="dim">—</span>'}</td>
                <td>${c.fpCount || 0}</td>
                <td>${c.orderCount || 0}</td>
                <td>${c.touchpoints || 0}</td>
                <td class="mono" style="color:var(--green);font-weight:700;">$${(c.revenue || 0).toFixed(2)}</td>
                <td class="mono dim">${esc(this.fmtDate(c.firstSeen))}</td>
                <td class="mono dim">${esc(this.fmtDate(c.lastSeen))}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
        document.getElementById('customers-table').innerHTML = html;
        makeContainerResizable('customers-table');
        this.renderPager('customers', total);
    }

    // Renders the Journey Paths tab: each row = one fingerprint with horizontal touchpoint cards
    renderRoute() {
        let data = [...(this.filteredJourneys || this.journeys)];
        const rs = this.routeSort || { field: 'lastDate', dir: 'desc' };
        data.sort((a, b) => {
            const av = a[rs.field] ?? '';
            const bv = b[rs.field] ?? '';
            const c = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return rs.dir === 'asc' ? c : -c;
        });
        const start = this.pages.route * this.pageSize;
        const page = data.slice(start, start + this.pageSize);
        const esc = this._escHtml.bind(this);

        const sortSel = rs.field;
        const sortDir = rs.dir;

        // v2 sort-bar
        let html = `<div class="sort-bar">
            <span class="results"><b>${data.length}</b> journey path${data.length === 1 ? '' : 's'}</span>
            <span class="sep"></span>
            <span>Sort by:</span>
            <select class="filter-select" id="route-sort-field" onchange="D.setRouteSort(this.value)">
                <option value="lastDate" ${sortSel==='lastDate'?'selected':''}>Last seen</option>
                <option value="firstDate" ${sortSel==='firstDate'?'selected':''}>First seen</option>
                <option value="count" ${sortSel==='count'?'selected':''}>Touchpoint count</option>
                <option value="revenue" ${sortSel==='revenue'?'selected':''}>Revenue</option>
                <option value="custName" ${sortSel==='custName'?'selected':''}>Customer name</option>
            </select>
            <button class="icon-btn" onclick="D.toggleRouteSortDir()" title="Toggle sort direction" aria-label="Toggle sort direction">${sortDir==='desc'?'↓':'↑'}</button>
        </div>
        <div class="jp-list">`;

        page.forEach((j, idx) => {
            const rowNum = start + idx + 1;
            const touchpoints = [...j.rows].sort((a, b) => this.compareDates(a.dt, b.dt));
            const visible = touchpoints.slice(0, 20);
            const more = touchpoints.length - visible.length;

            // Time-to-first-purchase badge
            let ttfpHtml = '';
            if (j.firstOrderTs && j.firstDate) {
                const firstTpTime = this.parseDate(j.firstDate);
                if (firstTpTime) {
                    const diffMs = j.firstOrderTs - firstTpTime.getTime();
                    if (diffMs >= 0) {
                        const label = this._formatDurationShort(diffMs);
                        if (label) ttfpHtml = `<div class="jp-time-badge">⏱ ${esc(label)} to 1st purchase</div>`;
                    }
                }
            }

            // Customer block (prospect fallback when no customer)
            const hasCust = !!(j.custName || j.custEmail || j.custId);
            let custHtml;
            if (hasCust) {
                const nameText = j.custName || j.custEmail || '';
                const nameAttrs = j.custId
                    ? ` onclick="event.stopPropagation();D.navigateToCustomer('${j.custId}')"`
                    : '';
                custHtml = `<div class="jp-cust">
                    <div class="jp-cust-name"${nameAttrs}>${esc(nameText)}</div>
                    ${j.custEmail && j.custEmail !== nameText ? `<div class="jp-cust-email">${esc(j.custEmail)}</div>` : ''}
                </div>`;
            } else {
                custHtml = `<div class="jp-cust"><div class="dim" style="font-size:11px;">prospect · unattributed</div></div>`;
            }

            const fpSvg = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 2.5c0-.8.9-1.5 3-1.5s3 .7 3 1.5M3 5c0-.8 1.6-2 5-2s5 1.2 5 2c0 1.2-.8 2.2-2 2.8M5 7c0-.6.8-1 3-1s3 .4 3 1c0 1.5-1 3-3 4.5M8 14.5c0-1 .5-2 1-3"/></svg>`;

            const leftHtml = `<div class="jp-left" onclick="D.showJourneyPathsTable('${j.fp}')">
                <div class="jp-idx">
                    <span class="jp-num">#${String(rowNum).padStart(3,'0')}</span>
                    <span class="jp-count">${j.count} tp</span>
                </div>
                <div class="jp-fp-id" title="Click to open journey path details">
                    ${fpSvg}
                    <span class="mono">${esc(j.fp)}</span>
                </div>
                <div class="jp-range" title="${esc(this.fmtDate(j.firstDate))} → ${esc(this.fmtDate(j.lastDate))}">
                    ${esc(this.fmtShortDate(j.firstDate))}<br>→ ${esc(this.fmtShortDate(j.lastDate))}
                </div>
                ${j.revenue > 0
                    ? `<div class="jp-rev">$${j.revenue.toFixed(2)}</div>`
                    : '<div class="dim" style="font-size:11px;margin-top:4px;">no revenue</div>'}
                ${custHtml}
                ${ttfpHtml}
            </div>`;

            // Card track — insert .tp-divider before the first post-purchase card
            let cardsHtml = '';
            let dividerPlaced = false;
            visible.forEach((r, tpIndex) => {
                const phase = this.classifyTouchpoint(r, j.firstOrderTs);
                if (!dividerPlaced && (phase === 'first' || phase === 'post')) {
                    cardsHtml += `<div class="tp-divider"></div>`;
                    dividerPlaced = true;
                }
                cardsHtml += this._renderTpCard(r, phase, j.fp, tpIndex);
            });
            if (more > 0) {
                cardsHtml += `<div class="tp-card tp-card-more" onclick="event.stopPropagation();D.expandRouteRow('${j.fp}')" title="Show remaining touchpoints" style="min-width:110px;max-width:130px;display:flex;align-items:center;justify-content:center;color:var(--ink-3);font-weight:700;font-size:12px;background:var(--surface-2);border-style:dashed;">+${more} more</div>`;
            }

            html += `<div class="jp-row" data-fp="${esc(j.fp)}">
                ${leftHtml}
                <div class="tp-track">${cardsHtml}</div>
            </div>`;
        });

        html += `</div>`;
        if (!page.length) html = '<div style="padding:16px 20px; color:var(--ink-3);">No journeys match current filters.</div>';
        document.getElementById('route-table').innerHTML = html;
        this.renderPager('route', data.length);
    }

    // Shared tp-card renderer used by renderRoute() and expandRouteRow()
    _renderTpCard(r, phase, fp, tpIndex) {
        const esc = this._escHtml.bind(this);
        const isSub = this.isSubscription(r);
        const muted = this.isSubscriptionAction(r);

        const classes = ['tp-card'];
        if (r.t === 'c')      classes.push('click');
        else if (r.t === 'v') classes.push('action');
        else                  classes.push(isSub ? 'subscription' : 'purchase');
        if (phase === 'first') classes.push('first');
        if (phase === 'pre')   classes.push('pre');
        if (muted)             classes.push('muted');

        let badge;
        if (r.t === 'c')      badge = '<span class="badge click">CLICK</span>';
        else if (r.t === 'v') badge = '<span class="badge action">ACTION</span>';
        else                  badge = isSub
            ? '<span class="badge subscription">SUB</span>'
            : '<span class="badge purchase">PURCHASE</span>';
        const firstBadge = (r.t === 'o' && phase === 'first')
            ? '<span class="badge first">★ 1st</span>'
            : '';

        const srcRow = (v) => v
            ? `<div class="tp-row-data"><span class="k">Src</span><span class="v" title="${esc(v)}"><span class="src-dot ${this.canonicalizeSource(v)}"></span> ${esc(v)}</span></div>`
            : '';

        let rows = '';
        if (r.t === 'c') {
            rows += srcRow(r.src);
            if (r.cmp)             rows += `<div class="tp-row-data"><span class="k">Cmp</span><span class="v" title="${esc(r.cmp)}">${esc(r.cmp)}</span></div>`;
            if (r.s4)              rows += `<div class="tp-row-data"><span class="k">Creat.</span><span class="v mono" title="${esc(r.s4)}">${esc(r.s4)}</span></div>`;
            const plc = r.plc || r.s2;
            if (plc)               rows += `<div class="tp-row-data"><span class="k">Place</span><span class="v" title="${esc(plc)}">${esc(plc)}</span></div>`;
        } else if (r.t === 'v') {
            if (r.vt)              rows += `<div class="tp-row-data"><span class="k">Type</span><span class="v" style="color:var(--orange);font-weight:700;">${esc(r.vt)}</span></div>`;
            rows += srcRow(r.src);
            if (r.cmp)             rows += `<div class="tp-row-data"><span class="k">Cmp</span><span class="v" title="${esc(r.cmp)}">${esc(r.cmp)}</span></div>`;
            if (r.pay != null && r.pay !== '') {
                rows += `<div class="tp-row-data"><span class="k">Payout</span><span class="v price">$${Number(r.pay).toFixed(2)}</span></div>`;
            }
        } else {
            if (r.oid) {
                rows += `<div class="tp-row-data"><span class="k">Order</span><span class="v link mono" onclick="event.stopPropagation();D.navigateToOrder('${r.oid}')">#${esc(r.oid)}</span></div>`;
            }
            if (r.pr != null && r.pr !== '') {
                rows += `<div class="tp-row-data"><span class="k">Value</span><span class="v price">$${Number(r.pr).toFixed(2)}</span></div>`;
            }
            if (r.st) {
                rows += `<div class="tp-row-data"><span class="k">Status</span><span class="v"><span class="status">${esc(r.st)}</span></span></div>`;
            }
            if (r.rcmp) {
                rows += `<div class="tp-row-data"><span class="k">Ref.</span><span class="v" title="${esc(r.rcmp)}">${esc(r.rcmp)}</span></div>`;
            }
        }

        return `<div class="${classes.join(' ')}" data-tp-fp="${esc(fp)}" data-tp-idx="${tpIndex}" onclick="event.stopPropagation();D.showTouchpoint('${fp}',${tpIndex})" title="Click to open touchpoint details">
            <div class="tp-head">
                ${badge}
                ${firstBadge}
                <span class="tp-time">${esc(this.fmtDate(r.dt))}</span>
            </div>
            ${rows}
        </div>`;
    }

    // Expands all hidden touchpoints for a journey row when "+N more" is clicked
    expandRouteRow(fp) {
        const journey = this.journeys.find(j => j.fp === fp);
        if (!journey) return;

        const touchpoints = [...journey.rows].sort((a, b) => this.compareDates(a.dt, b.dt));
        const hidden = touchpoints.slice(20);
        if (!hidden.length) return;

        // Locate the tp-track and "+N more" element for this fingerprint
        const row = document.querySelector(`.jp-row[data-fp="${CSS.escape(fp)}"]`);
        if (!row) return;
        const track = row.querySelector('.tp-track');
        const moreEl = track ? track.querySelector('.tp-card-more') : null;
        if (!track || !moreEl) return;

        // Divider may already have been placed among the first 20 cards
        const visible = touchpoints.slice(0, 20);
        let dividerPlaced = visible.some(r => {
            const ph = this.classifyTouchpoint(r, journey.firstOrderTs);
            return ph === 'first' || ph === 'post';
        });

        let newHtml = '';
        hidden.forEach((r, i) => {
            const tpIndex = 20 + i;
            const phase = this.classifyTouchpoint(r, journey.firstOrderTs);
            if (!dividerPlaced && (phase === 'first' || phase === 'post')) {
                newHtml += `<div class="tp-divider"></div>`;
                dividerPlaced = true;
            }
            newHtml += this._renderTpCard(r, phase, fp, tpIndex);
        });

        moreEl.insertAdjacentHTML('beforebegin', newHtml);
        moreEl.remove();
    }

    // Changes the sort field for Journey Paths (lastDate, count, revenue, etc.)
    setRouteSort(field) {
        this.routeSort = { field, dir: (this.routeSort||{}).dir || 'desc' };
        this.pages.route = 0;
        this.renderRoute();
    }

    // Flips ascending/descending for Journey Paths sort
    toggleRouteSortDir() {
        const rs = this.routeSort || { field:'lastDate', dir:'desc' };
        rs.dir = rs.dir === 'desc' ? 'asc' : 'desc';
        this.routeSort = rs;
        this.pages.route = 0;
        this.renderRoute();
    }

    // Side panel: full touchpoint table for one fingerprint (all clicks, conversions, orders)
    showJourneyPathsTable(fp) {
        const journey = this.journeys.find(j => j.fp === fp);
        if (!journey) return;
        this._trackPanelView('showJourneyPathsTable', [fp]);
        const touchpoints = [...journey.rows].sort((a, b) => this.compareDates(a.dt, b.dt));
        const esc = this._escHtml.bind(this);

        // Subtitle: prefer "Source · City, State", fall back to whatever we have.
        const first = touchpoints[0] || {};
        const subtitleBits = [];
        if (journey.src) subtitleBits.push(esc(journey.src));
        const loc = [first.ci, first.co].filter(Boolean).join(', ');
        if (loc) subtitleBits.push(esc(loc));
        const subtitle = subtitleBits.join(' · ');

        const clickCt = (journey.clicks || []).length;
        const convCt  = (journey.convs  || []).length;
        const orderCt = (journey.orders || []).length;

        // Time to first: from the journey's first touch to its first order.
        const firstTs = this.parseDate(journey.firstDate);
        const ttfp = (firstTs && journey.firstOrderTs && journey.firstOrderTs > firstTs.getTime())
            ? this._formatDurationShort(journey.firstOrderTs - firstTs.getTime())
            : null;

        // ─── panel-head ─────────────────────────────────────────────────
        const head = `
            ${this._panelControlsV2()}
            <div class="panel-title">
                Journey Path
                <span class="pid">${esc(fp)}</span>
                ${subtitle ? `<span class="panel-subtitle">${subtitle}</span>` : ''}
            </div>
            <div class="panel-meta">
                <div class="stat"><b>${journey.count}</b><span>Touchpoints</span></div>
                <div class="stat"><b>${clickCt}</b><span>Clicks</span></div>
                <div class="stat"><b>${convCt}</b><span>Actions</span></div>
                <div class="stat"><b>${orderCt}</b><span>Orders</span></div>
                ${journey.revenue > 0 ? `<div class="stat"><b style="color:var(--green)">$${journey.revenue.toFixed(2)}</b><span>Revenue</span></div>` : ''}
            </div>`;

        // ─── panel-body ─────────────────────────────────────────────────
        let body = '';
        if (journey.custId || journey.custName || journey.custEmail) {
            const custName = journey.custName || journey.custEmail || '—';
            const initials = String(custName)
                .split(/\s+/)
                .map(p => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase() || '?';
            const nameCell = journey.custId
                ? `<a class="xlink" onclick="D.navigateToCustomer('${journey.custId}')">${esc(custName)}</a>`
                : esc(custName);

            body += `
                <div class="cust-card">
                    <div class="cust-avatar">${esc(initials)}</div>
                    <div class="cust-info">
                        <div class="name">${nameCell}</div>
                        ${journey.custEmail ? `<div class="email">${esc(journey.custEmail)}</div>` : ''}
                        ${journey.custId    ? `<div class="cid">Customer ID · ${esc(journey.custId)}</div>` : ''}
                    </div>
                    <div class="cust-kpis">
                        ${ttfp ? `<div class="kpi-box"><div class="v teal">${esc(ttfp)}</div><div class="l">Time to 1st</div></div>` : ''}
                        ${journey.revenue > 0 ? `<div class="kpi-box"><div class="v green">$${journey.revenue.toFixed(2)}</div><div class="l">Revenue</div></div>` : ''}
                        <div class="kpi-box"><div class="v">${journey.count}</div><div class="l">Touchpoints</div></div>
                    </div>
                </div>`;
        }

        body += `
            <div>
                <div class="section-head">
                    <h3>All Touchpoints</h3>
                    <span class="muted">Chronological · ${journey.count} records${journey.firstDate && journey.lastDate ? ` · ${esc(this.fmtDate(journey.firstDate))} → ${esc(this.fmtDate(journey.lastDate))}` : ''}</span>
                </div>
                ${this.renderTouchpointTable(fp, touchpoints, journey.firstOrderTs)}
            </div>`;

        this._openPanel({ head, body });
        makePanelResizable();
    }

    // Compact human-readable duration ("2d 4h", "3h 12m", "45m", "30s")
    _formatDurationShort(ms) {
        if (!ms || ms < 0) return '';
        const s = Math.round(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.round(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        const mm = m % 60;
        if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
        const d = Math.floor(h / 24);
        const hh = h % 24;
        return hh ? `${d}d ${hh}h` : `${d}d`;
    }

    // Side panel: shows all non-empty fields for one specific touchpoint
    showTouchpoint(fp, index) {
        const journey = this.journeys.find(j => j.fp === fp);
        if (!journey) return;
        const touchpoints = [...journey.rows].sort((a, b) => this.compareDates(a.dt, b.dt));
        const r = touchpoints[index];
        if (!r) return;
        this._trackPanelView('showTouchpoint', [fp, index]);

        const esc = this._escHtml.bind(this);
        const isSub = this.isSubscription(r);
        const phase = this.classifyTouchpoint(r, journey.firstOrderTs);

        // Semantic kind + badge for title / type kv-row
        let kind, kindBadge;
        if (r.t === 'c')      { kind = 'Click';        kindBadge = '<span class="badge click">CLICK</span>'; }
        else if (r.t === 'v') { kind = 'Action';       kindBadge = '<span class="badge action">ACTION</span>'; }
        else if (isSub)       { kind = 'Subscription'; kindBadge = '<span class="badge subscription">SUB</span>'; }
        else                  { kind = 'Purchase';     kindBadge = '<span class="badge purchase">PURCHASE</span>'; }

        const phaseLabel = phase === 'first' ? '1st purchase'
            : phase === 'pre'  ? 'Pre-purchase'
            : phase === 'post' ? 'Post-purchase'
            : 'Touchpoint';

        const isNonEmpty = (v) => {
            if (v === undefined || v === null) return false;
            if (Array.isArray(v)) return v.length > 0 && !(v.length === 1 && String(v[0]) === '[]');
            if (typeof v === 'string') { const s = v.trim(); return !!s && s !== '[]'; }
            if (typeof v === 'number') return true;
            if (typeof v === 'object') return Object.keys(v).length > 0;
            return String(v).trim() !== '' && String(v).trim() !== '[]';
        };

        // Per-field value formatters (xlinks, chips, money styling, etc.)
        const fmtField = (k, v) => {
            if (typeof v === 'object') v = JSON.stringify(v);
            const str = String(v);
            switch (k) {
                case 'fp':  return `<a class="xlink mono" onclick="D.navigateToFingerprint('${esc(str)}')">${esc(str)}</a>`;
                case 'oid': return `<a class="xlink mono" onclick="D.navigateToOrder('${esc(str)}')">#${esc(str)}</a>`;
                case 'nm':  return r.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${esc(r.cid)}')">${esc(str)}</a>` : esc(str);
                case 'em':  return r.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${esc(r.cid)}')">${esc(str)}</a>` : esc(str);
                case 'cid': return `<a class="xlink mono" onclick="D.navigateToCustomer('${esc(str)}')">${esc(str)}</a>`;
                case 'src': return `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(str)}"></span>${esc(str)}</span>`;
                case 'vt':  return `<b style="color:var(--orange)">${esc(str)}</b>`;
                case 'pr':  return `<span style="color:var(--green);font-weight:700;">$${Number(str).toFixed(2)}</span>`;
                case 'pay': return `<span style="color:var(--orange);font-weight:600;">$${Number(str).toFixed(2)}</span>`;
                case 'st':  return `<span class="badge purchase">${esc(str)}</span>`;
                default:    return esc(str);
            }
        };

        // Which kv-row cells should render with mono font (IDs, dates, IPs, creatives)
        const monoKeys = new Set(['fp', 'oid', 'cid', 'dt', 'ip', 'ua', 'addr', 'zip', 's4', 'pr', 'pay']);

        // Prioritized field order for the kv-grid — then any remaining keys in insertion order.
        const priority = [
            'vt', 'oid', 'pr', 'pay', 'st', 'app',
            'src', 'cmp', 'rcmp', 'fsrc', 'fmed', 'lsrc', 'lmed',
            'adg', 's1', 's2', 's3', 's4', 's5', 's6', 'plc',
            'dev', 'br', 'os', 'ua',
            'co', 'ci', 'ip', 'isp', 'addr', 'zip',
            'nm', 'em', 'cid', 'fp',
            'cur',
        ];
        const seen = new Set(['t', 'dt']); // `t` is the type discriminator, `dt` is the top-of-grid Date row
        const ordered = [];
        priority.forEach(k => {
            if (seen.has(k)) return;
            if (!(k in r)) return;
            seen.add(k);
            ordered.push(k);
        });
        Object.keys(r).forEach(k => { if (!seen.has(k)) { seen.add(k); ordered.push(k); } });

        // Build kv-grid rows: always lead with Type + Date, then the rest (filtered by visibility + non-empty).
        const kvRow = (label, valueHtml, isMono) => `<div class="kv-row"><div class="kv-k">${esc(label)}</div><div class="kv-v${isMono ? ' mono' : ''}">${valueHtml}</div></div>`;

        let rows = '';
        rows += kvRow('Type', kindBadge, false);
        rows += kvRow('Date', esc(this.fmtDate(r.dt)), true);

        let renderedCount = 0;
        ordered.forEach(k => {
            const v = r[k];
            if (!isNonEmpty(v)) return;
            if (!this.isFieldVisible(k)) return;
            let label = Dashboard.LABEL_MAP[k];
            if (!label) {
                if (k.startsWith('conversion_')) label = k.slice(11);
                else if (k.startsWith('click_')) label = k.slice(6);
                else label = k;
            }
            rows += kvRow(label, fmtField(k, v), monoKeys.has(k));
            renderedCount++;
        });

        // Hidden-field summary for the configurator button
        const hiddenInRecord = [...this.tpHiddenFields].filter(k => r[k] !== undefined);
        const hiddenBadge = hiddenInRecord.length > 0
            ? `<span style="background:var(--gold-bg);color:var(--gold-ink);border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin-left:6px;">${hiddenInRecord.length} hidden</span>`
            : '';

        // ─── panel-head ─────────────────────────────────────────────────
        const positionLabel = `#${index + 1}`;
        const fpInlineLink = `<a class="xlink mono" onclick="D.showJourneyPathsTable('${esc(fp)}')">${esc(fp)}</a>`;
        const head = `
            ${this._panelControlsV2()}
            <div class="panel-title">
                ${esc(kind)} <span class="dim">· Touchpoint ${esc(positionLabel)}</span>
                <span class="panel-subtitle">in journey ${fpInlineLink}</span>
            </div>
            <div class="panel-meta">
                <div class="stat"><b>${index + 1}</b><span>of ${journey.count}</span></div>
                <div class="stat"><b>${esc(phaseLabel)}</b><span>Phase</span></div>
                ${(r.pr != null && r.pr !== '') ? `<div class="stat"><b style="color:var(--green)">$${Number(r.pr).toFixed(2)}</b><span>Value</span></div>` : ''}
                ${(r.pay != null && r.pay !== '' && r.t === 'v') ? `<div class="stat"><b style="color:var(--orange)">$${Number(r.pay).toFixed(2)}</b><span>Payout</span></div>` : ''}
            </div>`;

        // ─── panel-body ─────────────────────────────────────────────────
        const relatedLinks = [];
        relatedLinks.push(`<a class="xlink" onclick="D.showJourneyPathsTable('${esc(fp)}')">↗ Open full journey path (${journey.count} touchpoints)</a>`);
        if (journey.custId) {
            const custLabel = journey.custName || journey.custEmail || journey.custId;
            relatedLinks.push(`<a class="xlink" onclick="D.navigateToCustomer('${esc(journey.custId)}')">↗ Open customer · ${esc(custLabel)}</a>`);
        }
        if (r.t === 'o' && r.oid) {
            relatedLinks.push(`<a class="xlink" onclick="D.navigateToOrder('${esc(r.oid)}')">↗ Open order #${esc(r.oid)}</a>`);
        }

        const body = `
            <div class="section-head">
                <h3>${esc(kind)} details</h3>
                <span class="muted">${renderedCount === 0 ? 'All fields are hidden — open the configurator below' : `${renderedCount} field${renderedCount === 1 ? '' : 's'} shown${hiddenInRecord.length ? ` · ${hiddenInRecord.length} hidden` : ''}`}</span>
            </div>
            <div class="kv-grid">${rows}</div>
            <div class="section-head" style="margin-top:4px;">
                <h3>Related</h3>
                <span class="muted">Jump to context</span>
            </div>
            <div class="related-links">${relatedLinks.join('')}</div>
            <button onclick="D.showTpFieldConfigurator('${esc(fp)}',${index})" class="btn" style="margin-top:4px;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;">
                ⚙ Configure visible fields${hiddenBadge}
            </button>`;

        this._openPanel({ head, body });
        makePanelResizable();
    }

    // Side panel: checkbox grid to show/hide touchpoint fields (saved to localStorage)
    showTpFieldConfigurator(fp, index) {
        const journey = this.journeys.find(j=>j.fp===fp);
        if(!journey) return;
        const touchpoints = [...journey.rows].sort((a,b)=>this.compareDates(a.dt, b.dt));
        const r = touchpoints[index];
        if(!r) return;

        const isNonEmpty = (v) => {
            if(v === undefined || v === null) return false;
            if(Array.isArray(v)) return v.length > 0 && !(v.length === 1 && String(v[0]) === '[]');
            if(typeof v === 'string') { const s = v.trim(); return !!s && s !== '[]'; }
            if(typeof v === 'number') return true;
            if(typeof v === 'object') return Object.keys(v).length > 0;
            return false;
        };

        // Keys present in THIS touchpoint (have a value)
        const presentInRecord = new Set(Object.keys(r).filter(k => isNonEmpty(r[k])));
        // ALL keys across the entire dataset
        const allKeys = new Set(this.getAllRecordKeys());

        const stripFieldPrefix = (name) => {
            if (name.startsWith('shopify_order_')) return name.slice(14);
            if (name.startsWith('conversion_')) return name.slice(11);
            if (name.startsWith('click_')) return name.slice(6);
            return name;
        };

        const mkItem = (k, inRecord, isRawGroup) => {
            const label = isRawGroup ? stripFieldPrefix(k) : (Dashboard.LABEL_MAP[k] || k);
            const checked = this.isFieldVisible(k) ? 'checked' : '';
            const dimStyle = inRecord ? '' : 'opacity:0.45;';
            const tooltipParts = [k];
            if (!inRecord) tooltipParts.push('No value in this touchpoint');
            const title = `title="${tooltipParts.join(' — ')}"`;
            return `<div class="tp-cfg-item" style="${dimStyle}" ${title}>
                <input type="checkbox" id="tpcfg_${CSS.escape(k)}" ${checked} onchange="D.toggleTpField('${k}','${fp}',${index})">
                <label for="tpcfg_${CSS.escape(k)}">${label}</label>
            </div>`;
        };

        // Build groups: named groups use their key lists against ALL dataset keys
        const assignedKeys = new Set();
        const groups = [];

        Dashboard.FIELD_GROUPS.forEach(g => {
            let keys;
            if(g.prefix) {
                // Dynamic: all dataset keys that start with this prefix
                keys = [...allKeys].filter(k => k.startsWith(g.prefix)).sort();
            } else {
                // Static list — show all defined keys even if not in this record,
                // as long as they exist somewhere in the dataset
                keys = g.keys.filter(k => allKeys.has(k));
            }
            keys.forEach(k => assignedKeys.add(k));
            if(keys.length) groups.push({ label: g.label, keys, isRaw: !!g.prefix });
        });

        // Anything left that didn't match any group
        const otherKeys = [...allKeys].filter(k => !assignedKeys.has(k)).sort();
        if(otherKeys.length) groups.push({ label: 'Other', keys: otherKeys, isRaw: false });

        let groupsHtml = '';
        groups.forEach(g => {
            const itemsHtml = g.keys.map(k => mkItem(k, presentInRecord.has(k), g.isRaw)).join('');
            groupsHtml += `<div class="tp-cfg-group">
                <div class="tp-cfg-group-title">${g.label} <span style="font-weight:400;opacity:0.6;">(${g.keys.length})</span></div>
                ${itemsHtml}
            </div>`;
        });

        const hiddenCount = this.tpHiddenFields.size;
        const totalFields = allKeys.size;
        const inThisRecord = presentInRecord.size;

        let html = `
        <button class="tp-cfg-back" onclick="D.showTouchpoint('${fp}',${index})">← Back to Touchpoint</button>
        <div class="tp-cfg-header">
            <h3>Configure visible fields</h3>
            <div class="tp-cfg-actions">
                <button onclick="D.tpFieldShowAll('${fp}',${index})">Show all</button>
                <button onclick="D.tpFieldHideAll('${fp}',${index})">Hide all</button>
            </div>
        </div>
        <p class="tp-cfg-hint">
            <strong>${totalFields}</strong> fields available across the dataset &mdash; <strong>${inThisRecord}</strong> have values in this touchpoint (dimmed = not in this record, but available in others).
            ${hiddenCount > 0 ? `<strong style="color:var(--orange);">${hiddenCount} field${hiddenCount>1?'s':''} currently hidden.</strong>` : 'All fields visible.'}
            Choices are saved and apply to all touchpoints.
        </p>
        <div class="tp-cfg-grid">${groupsHtml}</div>`;

        this._openDetailContainer(html);
    }

    // Toggles one field's visibility and re-renders the configurator
    toggleTpField(key, fp, index) {
        if(this.tpHiddenFields.has(key)) {
            this.tpHiddenFields.delete(key);
        } else {
            this.tpHiddenFields.add(key);
        }
        this.saveTpFieldConfig();
        // Re-render the configurator in place so counts stay live
        this.showTpFieldConfigurator(fp, index);
    }

    // Makes all fields visible
    tpFieldShowAll(fp, index) {
        this.tpHiddenFields.clear();
        this.saveTpFieldConfig();
        this.showTpFieldConfigurator(fp, index);
    }

    // Hides all fields except Date and Type
    tpFieldHideAll(fp, index) {
        // Hide every field in the full dataset except the two anchors
        this.getAllRecordKeys().forEach(k => {
            if(k !== 'dt' && k !== 't') this.tpHiddenFields.add(k);
        });
        this.saveTpFieldConfig();
        this.showTpFieldConfigurator(fp, index);
    }

    // Renders <tbody> rows for the customer orders table (used by showCustomer + date sort toggle)
    _renderCustomerOrdersBody(orders, sortDir) {
        const esc = this._escHtml.bind(this);
        const sorted = [...orders].sort((a, b) => {
            const da = this.parseDate(a.dt);
            const db = this.parseDate(b.dt);
            if (da && db) return sortDir === 'asc' ? da - db : db - da;
            if (da) return -1;
            if (db) return 1;
            return 0;
        });
        let html = '';
        sorted.forEach((o, i) => {
            const isSub = this.isSubscription(o);
            const subTag = isSub ? ' <span class="badge subscription">SUB</span>' : '';
            const oidLink = o.oid
                ? `<a class="xlink mono" onclick="event.stopPropagation();D.navigateToOrder('${esc(o.oid)}')">#${esc(o.oid)}</a>`
                : '<span class="dim">—</span>';

            let stBadge = '<span class="dim">—</span>';
            if (o.st) {
                const up = String(o.st).toUpperCase();
                const variant = up === 'FULFILLED' ? 'purchase' : up === 'PENDING' ? 'action' : 'subscription';
                stBadge = `<span class="badge ${variant}">${esc(o.st)}</span>`;
            }

            const src = o.fsrc || o.src || '';
            const srcChip = src
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(src)}"></span>${esc(src)}</span>`
                : '<span class="dim">—</span>';
            const lsrcChip = o.lsrc
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(o.lsrc)}"></span>${esc(o.lsrc)}</span>`
                : '<span class="dim">—</span>';

            const dimOr = (v) => v ? esc(v) : '<span class="dim">—</span>';

            html += `<tr class="${isSub ? 'subscription-row' : ''}" style="cursor:pointer;" onclick="D.showOrder('${esc(o.oid || '')}')">
                <td class="dim">${i + 1}</td>
                <td>${oidLink}${subTag}</td>
                <td class="mono dim" style="white-space:nowrap;">${esc(this.fmtDate(o.dt))}</td>
                <td class="mono" style="color:var(--green);font-weight:700;">$${(o.pr || 0).toFixed(2)}</td>
                <td>${stBadge}</td>
                <td>${dimOr(o.rcmp)}</td>
                <td>${srcChip}</td>
                <td>${lsrcChip}</td>
                <td>${dimOr(o.app)}</td>
                <td>${dimOr(o.ci)}</td>
                <td>${dimOr(o.co)}</td>
                <td class="mono dim">${dimOr(o.cur)}</td>
            </tr>`;
        });
        return html;
    }

    // Renders <tbody> rows for the customer touchpoints table (used by showCustomer + date sort toggle)
    _renderCustomerTouchpointsBody(allTouchpoints, sortDir, firstOrderTs) {
        const esc = this._escHtml.bind(this);
        const sorted = [...allTouchpoints].sort((a, b) => {
            const da = this.parseDate(a.dt);
            const db = this.parseDate(b.dt);
            if (da && db) return sortDir === 'asc' ? da - db : db - da;
            if (da) return -1;
            if (db) return 1;
            return 0;
        });
        const fpCounters = {};
        sorted.forEach(r => {
            if (!(r._fp in fpCounters)) fpCounters[r._fp] = 0;
            r._fpIdx = fpCounters[r._fp]++;
        });
        const dimOr = (v) => v ? esc(v) : '<span class="dim">—</span>';
        const monoDim = (v) => v ? `<span class="mono dim">${esc(v)}</span>` : '<span class="dim">—</span>';

        let html = '';
        sorted.forEach((r, i) => {
            const phase = this.classifyTouchpoint(r, firstOrderTs);
            const isSub = this.isSubscription(r);
            const isSubAct = this.isSubscriptionAction(r);

            const rowClasses = [
                r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order',
                isSub ? 'subscription-row' : '',
                phase === 'first' ? 'first first-purchase-row' : '',
                phase === 'pre'   ? 'pre pre-purchase-row' : '',
                isSubAct ? 'muted sub-action-row' : '',
            ].filter(Boolean).join(' ');

            let typeBadge;
            if (r.t === 'c')      typeBadge = '<span class="badge click">CLICK</span>';
            else if (r.t === 'v') typeBadge = '<span class="badge action">ACTION</span>';
            else                  typeBadge = isSub
                ? '<span class="badge subscription">SUB</span>'
                : '<span class="badge purchase">PURCHASE</span>';
            const firstBadge = (r.t === 'o' && phase === 'first')
                ? ' <span class="first-purchase-badge">★ 1st</span>'
                : '';

            const vtCell = r.vt
                ? `<b style="color:var(--orange)">${esc(r.vt)}</b>`
                : '<span class="dim">—</span>';

            const source = r.src || r.fsrc || '';
            const srcCell = source
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(source)}"></span>${esc(source)}</span>`
                : '<span class="dim">—</span>';

            const adGroup = r.adg || r.s1 || '';
            const ip = r.click_ip || r.conversion_ip || r.order_ip || r.ip || '';

            const payout = (r.t === 'v' && r.pay != null && r.pay !== '')
                ? `<span class="mono" style="color:var(--orange);font-weight:600;">$${Number(r.pay).toFixed(2)}</span>`
                : '<span class="dim">—</span>';
            const value = (r.t === 'o' && r.pr != null && r.pr !== '')
                ? `<span class="mono" style="color:var(--green);font-weight:700;">$${Number(r.pr).toFixed(2)}</span>`
                : '<span class="dim">—</span>';

            let stBadge;
            if (r.t !== 'o' || !r.st) {
                stBadge = '<span class="dim">—</span>';
            } else {
                const up = String(r.st).toUpperCase();
                const variant = up === 'FULFILLED' ? 'purchase' : up === 'PENDING' ? 'action' : 'subscription';
                stBadge = `<span class="badge ${variant}">${esc(r.st)}</span>`;
            }

            const oidLink = r.oid
                ? `<a class="xlink mono" onclick="event.stopPropagation();D.navigateToOrder('${esc(r.oid)}')">#${esc(r.oid)}</a>`
                : '<span class="dim">—</span>';
            const fpLink = r._fp
                ? `<a class="xlink mono" onclick="event.stopPropagation();D.showJourneyPathsTable('${esc(r._fp)}')" title="${esc(r._fp)}">${esc(r._fp)}</a>`
                : '<span class="dim">—</span>';
            const custLink = r.nm
                ? esc(r.nm)
                : '<span class="dim">—</span>';

            html += `<tr class="${rowClasses}" style="cursor:pointer;" onclick="D.showTouchpoint('${esc(r._fp || '')}',${r._fpIdx})">
                <td class="dim">${i + 1}</td>
                <td>${typeBadge}${firstBadge}</td>
                <td>${vtCell}</td>
                <td class="mono dim" style="white-space:nowrap;">${esc(this.fmtDate(r.dt))}</td>
                <td>${fpLink}</td>
                <td>${srcCell}</td>
                <td>${dimOr(r.cmp)}</td>
                <td>${dimOr(r.rcmp)}</td>
                <td>${dimOr(adGroup)}</td>
                <td>${monoDim(r.s4)}</td>
                <td>${dimOr(r.dev)}</td>
                <td>${dimOr(r.br)}</td>
                <td>${dimOr(r.os)}</td>
                <td>${dimOr(r.co)}</td>
                <td>${dimOr(r.ci)}</td>
                <td>${monoDim(ip)}</td>
                <td>${oidLink}</td>
                <td>${custLink}</td>
                <td>${payout}</td>
                <td>${value}</td>
                <td>${stBadge}</td>
            </tr>`;
        });
        return html;
    }

    // Side panel: customer profile + orders table + all touchpoints across all fingerprints
    showCustomer(cid) {
        const cust = this.customers.find(c => c.cid === cid);
        if (!cust) return;
        this._trackPanelView('showCustomer', [cid]);
        const esc = this._escHtml.bind(this);

        const name = cust.nm || cust.em || '—';
        const initials = String(name)
            .split(/\s+/)
            .map(p => p[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase() || '?';

        // ─── panel-head ─────────────────────────────────────────────────
        const head = `
            ${this._panelControlsV2()}
            <div class="panel-title">
                Customer
                <span class="pid">${esc(cust.cid)}</span>
                ${cust.em ? `<span class="panel-subtitle">${esc(cust.em)}</span>` : ''}
            </div>
            <div class="panel-meta">
                <div class="stat"><b>${cust.fpCount || 0}</b><span>Fingerprints</span></div>
                <div class="stat"><b>${cust.orderCount || 0}</b><span>Orders</span></div>
                <div class="stat"><b>${cust.touchpoints || 0}</b><span>Touchpoints</span></div>
                ${cust.revenue > 0 ? `<div class="stat"><b style="color:var(--green)">$${cust.revenue.toFixed(2)}</b><span>Revenue</span></div>` : ''}
            </div>`;

        // ─── panel-body ─────────────────────────────────────────────────
        let body = `
            <div class="cust-card">
                <div class="cust-avatar">${esc(initials)}</div>
                <div class="cust-info">
                    <div class="name">${esc(name)}</div>
                    ${cust.em ? `<div class="email">${esc(cust.em)}</div>` : ''}
                    <div class="cid">Customer ID · ${esc(cust.cid)}</div>
                </div>
                <div class="cust-kpis">
                    <div class="kpi-box"><div class="v teal">${cust.fpCount || 0}</div><div class="l">Fingerprints</div></div>
                    <div class="kpi-box"><div class="v">${cust.orderCount || 0}</div><div class="l">Orders</div></div>
                    ${cust.revenue > 0 ? `<div class="kpi-box"><div class="v green">$${cust.revenue.toFixed(2)}</div><div class="l">Revenue</div></div>` : ''}
                </div>
            </div>`;

        // ─── Fingerprints section ──────────────────────────────────────
        const fps = cust.fps || [];
        const fmtFpDate = (d) => {
            if (!d) return '<span class="dim">—</span>';
            const dt = this.parseDate(d);
            return dt
                ? `<span class="mono dim">${esc(dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }))}</span>`
                : `<span class="mono dim">${esc(String(d))}</span>`;
        };

        let fpRows = '';
        fps.forEach((fp, i) => {
            const j = this.journeys.find(jj => jj.fp === fp);
            const fpLink = `<a class="xlink mono" onclick="event.stopPropagation();D.showJourneyPathsTable('${esc(fp)}')" title="${esc(fp)}">${esc(fp)}</a>`;
            if (j) {
                const src = j.src || '';
                const srcChip = src
                    ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(src)}"></span>${esc(src)}</span>`
                    : '<span class="dim">—</span>';
                const rev = j.revenue
                    ? `<span class="mono" style="color:var(--green);font-weight:700;">$${j.revenue.toFixed(2)}</span>`
                    : '<span class="dim">—</span>';
                fpRows += `<tr style="cursor:pointer;" onclick="D.showJourneyPathsTable('${esc(fp)}')">
                    <td class="dim">${i + 1}</td>
                    <td>${fpLink}</td>
                    <td>${srcChip}</td>
                    <td>${j.clicks.length}</td>
                    <td>${j.convs.length}</td>
                    <td>${j.orders.length}</td>
                    <td>${rev}</td>
                    <td>${fmtFpDate(j.firstDate)}</td>
                    <td>${fmtFpDate(j.lastDate)}</td>
                    <td>${j.count}</td>
                </tr>`;
            } else {
                fpRows += `<tr>
                    <td class="dim">${i + 1}</td>
                    <td>${fpLink}</td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                    <td><span class="dim">—</span></td>
                </tr>`;
            }
        });

        body += `
            <div>
                <div class="section-head">
                    <h3>RedTrack Fingerprints</h3>
                    <span class="muted">${fps.length} linked identit${fps.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <div style="overflow-x:auto;">
                    <table class="tp-table">
                        <thead><tr>
                            <th>#</th><th>Fingerprint</th><th>Source</th>
                            <th>Clicks</th><th>Actions</th><th>Orders</th>
                            <th>Revenue</th><th>First Seen</th><th>Last Seen</th><th>Touchpoints</th>
                        </tr></thead>
                        <tbody>${fpRows}</tbody>
                    </table>
                </div>
            </div>`;

        // ─── Orders section ────────────────────────────────────────────
        body += `
            <div>
                <div class="section-head">
                    <h3>Orders</h3>
                    <span class="muted">${cust.orders.length} order${cust.orders.length === 1 ? '' : 's'}</span>
                </div>
                <div style="overflow-x:auto;">
                    <table class="tp-table">
                        <thead><tr>
                            <th>#</th><th>Order ID</th>
                            <th class="sortable sorted sort-asc" id="cust-orders-date-th" style="cursor:pointer;">Date</th>
                            <th>Value</th><th>Status</th>
                            <th>Ref. Campaign</th><th>First Source</th><th>Last Source</th>
                            <th>App</th><th>City</th><th>State</th><th>Currency</th>
                        </tr></thead>
                        <tbody>${this._renderCustomerOrdersBody(cust.orders, 'asc')}</tbody>
                    </table>
                </div>
            </div>`;

        // ─── Full journey section ──────────────────────────────────────
        const allTp = [];
        cust.fps.forEach(fp => {
            const tp = this.raw.filter(r => r.fp === fp);
            tp.forEach(r => allTp.push({ ...r, _fp: fp }));
        });

        body += `
            <div>
                <div class="section-head">
                    <h3>Full Journey — All Touchpoints</h3>
                    <span class="muted">${allTp.length} record${allTp.length === 1 ? '' : 's'} across ${fps.length} fingerprint${fps.length === 1 ? '' : 's'}</span>
                </div>
                <div style="overflow-x:auto;">
                    <table class="tp-table">
                        <thead><tr>
                            <th>#</th><th>Type</th><th>Conv. Type</th>
                            <th class="sortable sorted sort-asc" id="cust-tp-date-th" style="cursor:pointer;">Date</th>
                            <th>Fingerprint</th><th>Source</th><th>Ad Campaign</th><th>Ref. Campaign</th>
                            <th>Ad Group</th><th>Creative</th>
                            <th>Device</th><th>Browser</th><th>OS</th>
                            <th>State</th><th>City</th><th>IP</th>
                            <th>Order</th><th>Customer</th>
                            <th>Payout</th><th>Value</th><th>Status</th>
                        </tr></thead>
                        <tbody>${this._renderCustomerTouchpointsBody(allTp, 'asc', cust.firstOrderTs)}</tbody>
                    </table>
                </div>
            </div>`;

        this._openPanel({ head, body });
        makePanelResizable();

        // Rebind date sort toggles for the two inner tables
        const ordersDateTh = document.getElementById('cust-orders-date-th');
        const ordersTbody = ordersDateTh ? ordersDateTh.closest('table').querySelector('tbody') : null;
        let ordersSortDir = 'asc';
        if (ordersDateTh && ordersTbody) {
            ordersDateTh.addEventListener('click', () => {
                ordersSortDir = ordersSortDir === 'asc' ? 'desc' : 'asc';
                ordersDateTh.className = 'sortable sorted ' + (ordersSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
                ordersTbody.innerHTML = this._renderCustomerOrdersBody(cust.orders, ordersSortDir);
            });
        }

        const tpDateTh = document.getElementById('cust-tp-date-th');
        const tpTbody = tpDateTh ? tpDateTh.closest('table').querySelector('tbody') : null;
        let tpSortDir = 'asc';
        if (tpDateTh && tpTbody) {
            tpDateTh.addEventListener('click', () => {
                tpSortDir = tpSortDir === 'asc' ? 'desc' : 'asc';
                tpDateTh.className = 'sortable sorted ' + (tpSortDir === 'asc' ? 'sort-asc' : 'sort-desc');
                tpTbody.innerHTML = this._renderCustomerTouchpointsBody(allTp, tpSortDir, cust.firstOrderTs);
            });
        }
    }

    // --- PER-TAB FILTER SYSTEM ---

    // Adds a new empty filter row for the current tab and marks pending
    addTabFilter() {
        const tab = this._currentTab;
        const fields = TAB_FILTER_FIELDS[tab];
        if (!fields || !fields.length) return;
        if (!this._tabFilters[tab]) this._tabFilters[tab] = [];
        this._tabFilters[tab].push({ field: fields[0].key, operator: FILTER_OPERATORS[fields[0].type][0].key, value: '' });
        this.renderTabFilters();
        this.markFiltersPending();
    }

    // Rebuilds the filter rows UI for the current tab using v2 .filter-row markup.
    renderTabFilters() {
        const container = document.getElementById('tab-filters-rows');
        if (!container) return;
        const tab = this._currentTab;
        const fields = TAB_FILTER_FIELDS[tab];
        const filters = this._tabFilters[tab] || [];
        const addBtn = document.querySelector('.btn-add-filter');

        if (!fields || !fields.length) {
            container.innerHTML = '';
            if (addBtn) addBtn.style.display = 'none';
            return;
        }
        if (addBtn) addBtn.style.display = '';

        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        let html = '';
        filters.forEach((f, i) => {
            const fieldDef = fields.find(fd => fd.key === f.field) || fields[0];
            const operators = FILTER_OPERATORS[fieldDef.type] || [];

            html += `<div class="filter-row">`;
            html += `<span class="logic ${i === 0 ? 'first' : ''}">${i === 0 ? 'WHERE' : 'AND'}</span>`;

            html += `<select class="filter-select" onchange="D.updateTabFilter(${i},'field',this.value)">`;
            fields.forEach(fd => {
                html += `<option value="${esc(fd.key)}"${fd.key === f.field ? ' selected' : ''}>${esc(fd.label)}</option>`;
            });
            html += `</select>`;

            html += `<select class="filter-select" onchange="D.updateTabFilter(${i},'operator',this.value)">`;
            operators.forEach(op => {
                html += `<option value="${esc(op.key)}"${op.key === f.operator ? ' selected' : ''}>${esc(op.label)}</option>`;
            });
            html += `</select>`;

            if (fieldDef.type === 'select') {
                const uniqueVals = this._getUniqueFilterValues(tab, fieldDef);
                html += `<select class="filter-select" onchange="D.updateTabFilter(${i},'value',this.value)">`;
                html += `<option value="">— select —</option>`;
                uniqueVals.forEach(v => {
                    html += `<option value="${esc(v)}"${v === f.value ? ' selected' : ''}>${esc(v)}</option>`;
                });
                html += `</select>`;
            } else if (fieldDef.type === 'bool') {
                html += `<select class="filter-select" onchange="D.updateTabFilter(${i},'value',this.value)">`;
                html += `<option value="">— select —</option>`;
                html += `<option value="yes"${f.value === 'yes' ? ' selected' : ''}>Yes</option>`;
                html += `<option value="no"${f.value === 'no' ? ' selected' : ''}>No</option>`;
                html += `</select>`;
            } else if (fieldDef.type === 'number' && f.operator === 'between') {
                const parts = (f.value || '').split(',');
                html += `<input type="number" class="mgmt-input" style="max-width:110px;height:32px;" placeholder="min" value="${esc(parts[0] || '')}" onchange="D.updateTabFilterRange(${i},0,this.value)">`;
                html += `<span style="color:var(--ink-3);font-size:12px;">and</span>`;
                html += `<input type="number" class="mgmt-input" style="max-width:110px;height:32px;" placeholder="max" value="${esc(parts[1] || '')}" onchange="D.updateTabFilterRange(${i},1,this.value)">`;
            } else if (fieldDef.type === 'number') {
                html += `<input type="number" class="mgmt-input" style="max-width:140px;height:32px;" placeholder="value" value="${esc(f.value || '')}" onchange="D.updateTabFilter(${i},'value',this.value)">`;
            } else {
                html += `<input type="text" class="mgmt-input" style="min-width:180px;height:32px;" placeholder="type to filter…" value="${esc(f.value || '')}" oninput="D.updateTabFilter(${i},'value',this.value)">`;
            }

            html += `<button class="filter-remove" onclick="D.removeTabFilter(${i})" title="Remove filter">×</button>`;
            html += `</div>`;
        });

        if (tab === 'orders') {
            html += `<div class="filter-row" style="gap:6px;">
                <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);cursor:pointer;">
                    <input type="checkbox" onchange="D.toggleSubscriptions()" id="hide-subs-toggle"${this._hideSubscriptions ? ' checked' : ''}>
                    Hide subscriptions
                </label>
            </div>`;
        }

        container.innerHTML = html;
        this.enhanceSelects();
    }

    // Collects unique values from current data for a select-type filter dropdown
    _getUniqueFilterValues(tab, fieldDef) {
        const values = new Set();
        if (tab === 'route' && fieldDef.key === 'firstSource') {
            (this.journeys || []).forEach(j => { if (j.firstSource) values.add(j.firstSource); });
            return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
        }
        if (tab === 'route' && fieldDef.key === 'subsequentSource') {
            (this.journeys || []).forEach(j => { (j.subsequentSources || []).forEach(s => values.add(s)); });
            return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
        }
        if (tab === 'route') {
            if (fieldDef.level === 'journey') {
                (this.journeys || []).forEach(j => { if (j[fieldDef.key]) values.add(j[fieldDef.key]); });
            } else {
                this.filtered.forEach(r => { if (r[fieldDef.key]) values.add(r[fieldDef.key]); });
            }
        } else if (tab === 'orders') {
            this.filtered.filter(r => r.t === 'o').forEach(r => { if (r[fieldDef.key]) values.add(r[fieldDef.key]); });
        } else if (tab === 'customers') {
            (this.customers || []).forEach(c => { if (c[fieldDef.key]) values.add(c[fieldDef.key]); });
        }
        return Array.from(values).sort((a, b) => String(a).localeCompare(String(b)));
    }

    // Updates a property on an existing filter row and marks pending
    updateTabFilter(index, prop, value) {
        const tab = this._currentTab;
        const filters = this._tabFilters[tab];
        if (!filters || !filters[index]) return;

        if (prop === 'field') {
            const fields = TAB_FILTER_FIELDS[tab];
            const newFieldDef = fields.find(fd => fd.key === value) || fields[0];
            const newOps = FILTER_OPERATORS[newFieldDef.type] || [];
            filters[index].field = value;
            filters[index].operator = newOps[0] ? newOps[0].key : 'eq';
            filters[index].value = '';
            this.renderTabFilters();
            this.markFiltersPending();
            return;
        }

        filters[index][prop] = value;
        if (prop === 'operator') {
            this.renderTabFilters();
        }
        this.markFiltersPending();
    }

    // Updates one part of a "between" range filter value and marks pending
    updateTabFilterRange(index, part, value) {
        const tab = this._currentTab;
        const filters = this._tabFilters[tab];
        if (!filters || !filters[index]) return;
        const parts = (filters[index].value || ',').split(',');
        parts[part] = value;
        filters[index].value = parts.join(',');
        this.markFiltersPending();
    }

    // Removes a filter row; auto-applies when all filters gone, otherwise marks pending
    removeTabFilter(index) {
        const tab = this._currentTab;
        if (!this._tabFilters[tab]) return;
        this._tabFilters[tab].splice(index, 1);
        this.renderTabFilters();
        if (this._tabFilters[tab].length === 0) {
            this.applyFilters();
        } else {
            this.markFiltersPending();
        }
    }

    // Applies current tab's filters to the appropriate data source and re-renders
    applyTabFilters() {
        const tab = this._currentTab;
        const filters = (this._tabFilters[tab] || []).filter(f => f.value !== '');

        if (tab === 'route') {
            if (!filters.length) { this.filteredJourneys = null; }
            else {
                this.filteredJourneys = (this.journeys || []).filter(j => {
                    return filters.every(f => this._matchFilter(j, f, 'route'));
                });
            }
            this.pages.route = 0;
            this.renderRoute();
        } else if (tab === 'orders') {
            if (!filters.length) { this.filteredOrders = null; }
            else {
                this.filteredOrders = this.fOrders.filter(r => {
                    return filters.every(f => this._matchFilter(r, f, 'orders'));
                });
            }
            this.pages.orders = 0;
            this.renderOrders();
        } else if (tab === 'customers') {
            if (!filters.length) { this.filteredCustomers = null; }
            else {
                this.filteredCustomers = (this.customers || []).filter(c => {
                    return filters.every(f => this._matchFilter(c, f, 'customers'));
                });
            }
            this.pages.customers = 0;
            this.renderCustomers();
        }

        this._updateTabCount();
    }

    // Tests whether a single item matches a single filter rule
    _matchFilter(item, filter, tab) {
        const fields = TAB_FILTER_FIELDS[tab];
        const fieldDef = fields.find(fd => fd.key === filter.field);
        if (!fieldDef) return true;

        if (filter.field === 'subsequentSource') {
            const sources = item.subsequentSources || [];
            const val = filter.value;
            if (filter.operator === 'eq') return sources.some(s => s === val);
            if (filter.operator === 'neq') return !sources.some(s => s === val);
            return true;
        }

        let itemVal;
        if (fieldDef.type === 'bool') {
            itemVal = item[filter.field] ? 'yes' : 'no';
        } else if (fieldDef.type === 'number') {
            itemVal = parseFloat(item[filter.field]) || 0;
        } else {
            itemVal = String(item[filter.field] || '');
        }

        const fv = filter.value;
        const op = filter.operator;

        switch (op) {
            case 'eq': return fieldDef.type === 'number' ? itemVal === parseFloat(fv) : itemVal.toLowerCase() === fv.toLowerCase();
            case 'neq': return fieldDef.type === 'number' ? itemVal !== parseFloat(fv) : itemVal.toLowerCase() !== fv.toLowerCase();
            case 'contains': return itemVal.toLowerCase().includes(fv.toLowerCase());
            case 'starts': return itemVal.toLowerCase().startsWith(fv.toLowerCase());
            case 'gt': return itemVal > parseFloat(fv);
            case 'lt': return itemVal < parseFloat(fv);
            case 'between': {
                const parts = fv.split(',');
                const min = parseFloat(parts[0]) || -Infinity;
                const max = parseFloat(parts[1]) || Infinity;
                return itemVal >= min && itemVal <= max;
            }
            default: return true;
        }
    }

    // Updates tab count badges to reflect per-tab filtered counts
    _updateTabCount() {
        const routeData = this.filteredJourneys || this.journeys || [];
        const ordersData = this.filteredOrders || this.fOrders || [];
        const custData = this.filteredCustomers || this.customers || [];
        // Path Stops shares the journey scope with Journey Paths — both views
        // operate on the same per-fingerprint grouping, just presented
        // differently, so they track the same count.
        document.getElementById('tc-attribution').textContent = '(' + routeData.length + ')';
        document.getElementById('tc-route').textContent = '(' + routeData.length + ')';
        document.getElementById('tc-orders').textContent = '(' + ordersData.length + ')';
        document.getElementById('tc-customers').textContent = '(' + custData.length + ')';
    }

    // Switches attribution view between source and campaign
    _computeStopsData() {
        const stop1Dim = STOP_DIMENSIONS.find(d => d.key === this._stops.stop1.dimKey) || STOP_DIMENSIONS[0];
        const stop2Dim = this._stops.stop2.dimKey ? STOP_DIMENSIONS.find(d => d.key === this._stops.stop2.dimKey) : null;
        const stop3Dim = this._stops.stop3.dimKey ? STOP_DIMENSIONS.find(d => d.key === this._stops.stop3.dimKey) : null;

        const fpMap = {};
        this.filtered.forEach(r => {
            if (!r.fp) return;
            if (!fpMap[r.fp]) fpMap[r.fp] = [];
            fpMap[r.fp].push(r);
        });

        const result = {};
        Object.entries(fpMap).forEach(([fp, records]) => {
            const sorted = [...records].sort((a, b) => {
                const da = this.parseDate(a.dt), db = this.parseDate(b.dt);
                return (da || 0) - (db || 0);
            });
            const firstClick = sorted.find(r => r.t === 'c');
            if (!firstClick) return;
            const stop1Val = getStopValue(firstClick, stop1Dim);
            if (!stop1Val) return;
            if (!result[stop1Val]) result[stop1Val] = {
                count: 0, stop2Count: 0, stop3Count: 0,
                fps: [], stop2Fps: [], stop3Fps: [],
            };
            result[stop1Val].count++;
            result[stop1Val].fps.push(fp);

            if (stop2Dim && this._stops.stop2.value) {
                const firstClickIdx = sorted.indexOf(firstClick);
                const stop2Match = sorted.find((r, i) => i > firstClickIdx && getStopValue(r, stop2Dim) === this._stops.stop2.value);
                if (stop2Match) {
                    result[stop1Val].stop2Count++;
                    result[stop1Val].stop2Fps.push(fp);
                    if (stop3Dim && this._stops.stop3.value) {
                        const stop2Idx = sorted.indexOf(stop2Match);
                        const stop3Match = sorted.find((r, i) => i > stop2Idx && getStopValue(r, stop3Dim) === this._stops.stop3.value);
                        if (stop3Match) {
                            result[stop1Val].stop3Count++;
                            result[stop1Val].stop3Fps.push(fp);
                        }
                    }
                }
            }
        });
        return result;
    }

    _getStopDimValues(dimKey) {
        const dim = STOP_DIMENSIONS.find(d => d.key === dimKey);
        if (!dim) return [];
        const vals = new Set();
        this.filtered.forEach(r => {
            const v = getStopValue(r, dim);
            if (v) vals.add(v);
        });
        return [...vals].sort();
    }

    _setStop1Mode(mode) {
        this._stops.stop1.dimKey = mode === 'campaign' ? 'cmp' : 'src';
        this._expandedStopRows.clear();
        this._stopFpsPages = {};
        this.renderAttribution();
    }

    _toggleStopPopup(stopNum, event) {
        if (event) event.stopPropagation();
        if (this._activeStopPopup === stopNum) {
            this._activeStopPopup = null;
        } else {
            this._activeStopPopup = stopNum;
        }
        this.renderAttribution();
    }

    setStopDim(stopNum, dimKey) {
        const stop = this._stops['stop' + stopNum];
        stop.dimKey = dimKey || null;
        stop.value = null;
        if (stopNum === 2 && !dimKey) {
            this._stops.stop3.dimKey = null;
            this._stops.stop3.value = null;
        }
        this._expandedStopRows.clear();
        this._stopFpsPages = {};
        this.renderAttribution();
    }

    setStopValue(stopNum, value) {
        this._stops['stop' + stopNum].value = value || null;
        this._expandedStopRows.clear();
        this._stopFpsPages = {};
        this.renderAttribution();
    }

    sortStops(col) {
        this._stopsSort.asc = this._stopsSort.col === col ? !this._stopsSort.asc : false;
        this._stopsSort.col = col;
        this.renderAttribution();
    }

    toggleStopRow(name) {
        if (this._expandedStopRows.has(name)) {
            this._expandedStopRows.delete(name);
            delete this._stopFpsPages[name];
        } else {
            this._expandedStopRows.add(name);
        }
        this.renderAttribution();
    }

    setStopFpsPage(name, dir) {
        const current = this._stopFpsPages[name] || 0;
        this._stopFpsPages[name] = Math.max(0, current + dir);
        this.renderAttribution();
    }

    _renderStopPopup(stopNum) {
        // Popup is only used for Stop 2 and Stop 3 (Stop 1 is driven by the Source/Campaign toggle)
        const stop = this._stops['stop' + stopNum];
        const currentDimKey = stop.dimKey;
        const currentValue = stop.value;
        const borderColor = stopNum === 2 ? 'var(--orange)' : 'var(--green)';

        let html = '<div class="stop-popup stop' + stopNum + '" onclick="event.stopPropagation()" style="position:static;border-top:3px solid ' + borderColor + ';min-width:240px;padding:14px 16px;">';
        html += '<div class="stop-popup-title">Configure Stop ' + stopNum + '</div>';
        html += '<label class="stop-popup-label">Dimension</label>';
        html += '<select class="stop-popup-select" onchange="D.setStopDim(' + stopNum + ', this.value);D._activeStopPopup=' + stopNum + ';">';
        html += '<option value="">— Not set —</option>';
        STOP_DIMENSIONS.forEach(d => {
            html += '<option value="' + d.key + '"' + (d.key === currentDimKey ? ' selected' : '') + '>' + d.label + '</option>';
        });
        html += '</select>';

        if (currentDimKey) {
            const vals = this._getStopDimValues(currentDimKey);
            html += '<label class="stop-popup-label" style="margin-top:8px;">Value</label>';
            html += '<select class="stop-popup-select" onchange="D.setStopValue(' + stopNum + ', this.value);D._activeStopPopup=' + stopNum + ';">';
            html += '<option value="">— Select value —</option>';
            vals.forEach(v => {
                const esc = String(v).replace(/"/g, '&quot;');
                html += '<option value="' + esc + '"' + (v === currentValue ? ' selected' : '') + '>' + v + '</option>';
            });
            html += '</select>';
            html += '<button class="stop-popup-clear" onclick="D.setStopDim(' + stopNum + ', null);D._activeStopPopup=null;">Clear Stop ' + stopNum + '</button>';
        }

        html += '</div>';
        return html;
    }

    _renderStopFingerprints(fps, rowName) {
        if (!fps || !fps.length) {
            return '<div class="expand-empty" style="padding:16px;color:var(--ink-3);font-size:12.5px;">No matching journeys</div>';
        }
        const total = fps.length;
        const pageSize = this._stopFpsPageSize;
        const totalPages = Math.ceil(total / pageSize);
        const page = Math.min(this._stopFpsPages[rowName] || 0, Math.max(0, totalPages - 1));
        this._stopFpsPages[rowName] = page;
        const pageStart = page * pageSize;
        const pageEnd = Math.min(pageStart + pageSize, total);
        const pageFps = fps.slice(pageStart, pageEnd);
        const esc = this._escHtml.bind(this);

        let html = `<div class="expand-heading">Matching fingerprints · <b>${total}</b></div>`;
        html += '<div style="overflow-x:auto;"><table class="tp-table"><thead><tr>';
        html += '<th style="width:40px;">#</th>';
        html += '<th>Fingerprint</th>';
        html += '<th>Customer</th>';
        html += '<th>Source</th>';
        html += '<th>Ad Campaign</th>';
        html += '<th style="text-align:center;">Touchpoints</th>';
        html += '<th style="text-align:center;">Clicks</th>';
        html += '<th style="text-align:center;">Actions</th>';
        html += '<th style="text-align:center;">Orders</th>';
        html += '<th>Revenue</th>';
        html += '<th>First Seen</th>';
        html += '<th>Last Seen</th>';
        html += '</tr></thead><tbody>';
        pageFps.forEach((fp, i) => {
            const journey = this.journeys.find(j => j.fp === fp);
            if (!journey) return;
            const custLabel = journey.custName || journey.custEmail || '— prospect';
            const custLink = journey.custId
                ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToCustomer('${journey.custId}')">${esc(custLabel)}</a>`
                : `<span class="dim">${esc(custLabel)}</span>`;
            const fpShort = fp.length > 16 ? fp.substring(0, 14) + '…' : fp;
            const rev = journey.revenue
                ? `<span class="mono" style="color:var(--green);font-weight:700;">$${journey.revenue.toFixed(2)}</span>`
                : '<span class="dim">—</span>';
            const src = journey.src
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(journey.src)}"></span>${esc(journey.src)}</span>`
                : '<span class="dim">—</span>';
            const cmp = esc(journey.cmp || '—');
            html += `<tr onclick="event.stopPropagation();D.showJourneyPathsTable('${fp}')">`;
            html += `<td class="dim">${pageStart + i + 1}</td>`;
            html += `<td><a class="xlink mono" style="font-size:11px;">${esc(fpShort)}</a></td>`;
            html += `<td>${custLink}</td>`;
            html += `<td>${src}</td>`;
            html += `<td>${cmp}</td>`;
            html += `<td style="text-align:center;">${journey.count}</td>`;
            html += `<td style="text-align:center;">${(journey.clicks || []).length}</td>`;
            html += `<td style="text-align:center;">${(journey.convs || []).length}</td>`;
            html += `<td style="text-align:center;">${(journey.orders || []).length}</td>`;
            html += `<td>${rev}</td>`;
            html += `<td class="mono dim" style="white-space:nowrap;">${esc(this.fmtDate(journey.firstDate) || '—')}</td>`;
            html += `<td class="mono dim" style="white-space:nowrap;">${esc(this.fmtDate(journey.lastDate) || '—')}</td>`;
            html += '</tr>';
        });
        html += '</tbody></table></div>';

        if (totalPages > 1) {
            const escapedName = rowName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += '<div class="pager">';
            html += `<span>Showing ${pageStart + 1}–${pageEnd} of ${total}</span>`;
            html += '<div>';
            html += `<button onclick="event.stopPropagation();D.setStopFpsPage('${escapedName}', -1)"${page === 0 ? ' disabled' : ''}>← Prev</button>`;
            html += `<button onclick="event.stopPropagation();D.setStopFpsPage('${escapedName}', 1)" style="margin-left:6px;"${page >= totalPages - 1 ? ' disabled' : ''}>Next →</button>`;
            html += '</div>';
            html += '</div>';
        }

        return html;
    }

    // Maps a raw source string to one of the canonical keys used by `.src-dot.<key>`.
    // Falls back to 'unknown' rather than the raw slug so unrecognized channels don't
    // accidentally get an un-styled dot.
    canonicalizeSource(src) {
        if (!src) return 'unknown';
        const s = String(src).toLowerCase().trim();

        if (/\bfacebook\b|^fb\b|\bmeta ads\b/.test(s)) return 'facebook';
        if (/\bgoogle\b|\bgads\b|\badwords\b|\bpmax\b/.test(s)) return 'google';
        if (/\btik.?tok\b/.test(s)) return 'tiktok';
        if (/\bbing\b|\bmicrosoft ads\b/.test(s)) return 'bing';

        if (/klaviyo|mailchimp|sendgrid|newsletter|abandoned cart|welcome series|\(sb\)|\bemail\b/.test(s)) return 'email';
        if (/\bsms\b|pushowl|push notification/.test(s)) return 'sms';

        if (/organic|\bseo\b/.test(s)) return 'organic';
        if (/^direct$|shop.?app|judge.?me|klarna|shopify/.test(s)) return 'direct';
        if (/referral|referrer/.test(s)) return 'referral';
        if (/\bsocial\b/.test(s)) return 'social';
        if (/unattributed/.test(s)) return 'unknown';

        return 'unknown';
    }

    _escHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    renderAttribution() {
        const container = document.getElementById('tab-attribution');
        if (!container) return;

        const stop1Dim = STOP_DIMENSIONS.find(d => d.key === this._stops.stop1.dimKey) || STOP_DIMENSIONS[0];
        const stop2Dim = this._stops.stop2.dimKey ? STOP_DIMENSIONS.find(d => d.key === this._stops.stop2.dimKey) : null;
        const stop3Dim = this._stops.stop3.dimKey ? STOP_DIMENSIONS.find(d => d.key === this._stops.stop3.dimKey) : null;
        const stop2Active = !!(this._stops.stop2.dimKey && this._stops.stop2.value);
        const stop3Active = !!(this._stops.stop3.dimKey && this._stops.stop3.value);

        const data = this._computeStopsData();
        const sortCol = this._stopsSort.col;
        const sortAsc = this._stopsSort.asc;
        const esc = this._escHtml.bind(this);

        let rows = Object.entries(data);
        rows.sort((a, b) => {
            if (sortCol === 'name') {
                const va = a[0].toLowerCase(), vb = b[0].toLowerCase();
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            const va = a[1][sortCol] || 0, vb = b[1][sortCol] || 0;
            return sortAsc ? va - vb : vb - va;
        });

        const totalJourneys = rows.reduce((s, [, d]) => s + d.count, 0);
        const stop1Mode = this._stops.stop1.dimKey === 'cmp' ? 'campaign' : 'source';
        const maxCount = rows.length ? Math.max(...rows.map(([, d]) => d.count), 1) : 1;

        // Pre-compute per-row revenue once so we can also sort on it.
        const revByName = {};
        rows.forEach(([name, d]) => {
            revByName[name] = (d.fps || []).reduce((s, fp) => {
                const j = this.journeys.find(jj => jj.fp === fp);
                return s + (j && j.revenue ? j.revenue : 0);
            }, 0);
        });
        if (sortCol === 'revenue') {
            rows.sort((a, b) => sortAsc ? revByName[a[0]] - revByName[b[0]] : revByName[b[0]] - revByName[a[0]]);
        }

        const sortIndicator = col =>
            sortCol === col ? `<span class="sort-indicator">${sortAsc ? '▲' : '▼'}</span>` : '';
        const sortHeader = (col, label, extraAttrs = '') =>
            `<th class="sortable${sortCol === col ? ' sorted' : ''}" ${extraAttrs} onclick="D.sortStops('${col}')">${label} ${sortIndicator(col)}</th>`;

        // Stop 2 / Stop 3 header — the whole cell is clickable and opens the popup.
        const stopHeader = (num, dim, value) => {
            const isConfigured = !!dim;
            const isActive = isConfigured && !!value;
            const clsList = ['stop-col', 'stop' + num];
            if (!isConfigured) clsList.push('empty');
            let inner;
            if (isActive) {
                inner = `<span class="stop-header-dim">Stop ${num}: ${esc(dim.label)}</span><span class="stop-header-value" title="${esc(value)}">${esc(value)}</span>`;
            } else if (isConfigured) {
                inner = `<span class="stop-header-dim">Stop ${num}: ${esc(dim.label)}</span><span class="stop-header-placeholder">— select value —</span>`;
            } else {
                inner = `<span class="stop-header-placeholder">+ Stop ${num}</span>`;
            }
            return `<th class="${clsList.join(' ')}" data-stop="${num}" data-stop-header="${num}" onclick="D._toggleStopPopup(${num}, event)"><span class="stop-header-btn">${inner}</span></th>`;
        };

        // ─── HEADER ───────────────────────────────────────────────────────────
        let html = `
            <div class="attr-header">
                <div>
                    <div class="attr-title">Path Stops — Sequential Journey Analysis</div>
                    <div class="attr-sub">Group journeys by their first touchpoint, then filter by subsequent stops. Click a row to see matching fingerprints.</div>
                </div>
                <div class="attr-meta">
                    <div class="mode-toggle">
                        <button type="button" class="btn-attr ${stop1Mode === 'source' ? 'active' : ''}" onclick="D._setStop1Mode('source')">By Source</button>
                        <button type="button" class="btn-attr ${stop1Mode === 'campaign' ? 'active' : ''}" onclick="D._setStop1Mode('campaign')">By Campaign</button>
                    </div>
                    <span class="attr-summary">${totalJourneys.toLocaleString()} journeys across <b>${rows.length}</b> ${esc(stop1Dim.label.toLowerCase())}${rows.length === 1 ? '' : 's'}</span>
                </div>
            </div>`;

        // ─── TABLE ────────────────────────────────────────────────────────────
        html += `<table class="tbl" id="stops-table">
            <thead><tr>
                <th style="width:40px;"></th>
                ${sortHeader('name', `Stop 1: ${esc(stop1Dim.label)}`)}
                ${sortHeader('count', 'Journeys', 'style="width:240px;"')}
                ${stopHeader(2, stop2Dim, stop2Active ? this._stops.stop2.value : null)}
                ${stopHeader(3, stop3Dim, stop3Active ? this._stops.stop3.value : null)}
                ${sortHeader('revenue', 'Revenue', 'style="width:120px;"')}
            </tr></thead>
            <tbody>`;

        rows.forEach(([name, d]) => {
            const isExpanded = this._expandedStopRows.has(name);
            const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const pct = totalJourneys > 0 ? ((d.count / totalJourneys) * 100).toFixed(1) : '0';
            const pct2 = d.count > 0 ? ((d.stop2Count / d.count) * 100).toFixed(0) : 0;
            const pct3 = d.count > 0 ? ((d.stop3Count / d.count) * 100).toFixed(0) : 0;
            const rev = revByName[name];
            const revHtml = rev > 0
                ? `<span class="mono" style="color:var(--green);font-weight:700;">$${rev.toFixed(2)}</span>`
                : '<span class="dim">—</span>';

            // Stop 1 — source/campaign chip with a colored dot when in source mode.
            const chipCell = stop1Mode === 'source'
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(name)}"></span><b>${esc(name)}</b></span>`
                : `<b>${esc(name)}</b>`;

            const stop2Cell = stop2Active
                ? `<td><div class="stop-cell s2"><div class="bar-track"><div class="bar-fill" style="width:${pct2}%"></div></div><span class="n">${d.stop2Count}</span><span class="pct">${pct2}%</span></div></td>`
                : `<td><span class="stop-dash dim">—</span></td>`;
            const stop3Cell = stop3Active
                ? `<td><div class="stop-cell s3"><div class="bar-track"><div class="bar-fill" style="width:${pct3}%"></div></div><span class="n">${d.stop3Count}</span><span class="pct">${pct3}%</span></div></td>`
                : `<td><span class="stop-dash dim">—</span></td>`;

            html += `<tr class="stops-row${isExpanded ? ' expanded' : ''}" data-stop-row="${esc(name)}" onclick="D.toggleStopRow('${escapedName}')">
                <td><span class="expand-caret">▶</span></td>
                <td>${chipCell}</td>
                <td><div class="stop-cell"><div class="bar-track"><div class="bar-fill" style="width:${(d.count / maxCount) * 100}%"></div></div><span class="n">${d.count}</span><span class="pct">${pct}%</span></div></td>
                ${stop2Cell}
                ${stop3Cell}
                <td>${revHtml}</td>
            </tr>`;

            if (isExpanded) {
                const activeFps = stop3Active ? d.stop3Fps : stop2Active ? d.stop2Fps : d.fps;
                html += `<tr class="expand-row"><td colspan="6"><div class="expand-inner">${this._renderStopFingerprints(activeFps, name)}</div></td></tr>`;
            }
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Auto-fit / resize the main table and any expanded fingerprint sub-tables.
        const table = document.getElementById('stops-table');
        if (table) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    autoFitColumns(table);
                    makeResizable(table);
                    addColumnHighlight(table);
                    container.querySelectorAll('.expand-row table.tp-table').forEach(t => {
                        autoFitColumns(t);
                        makeResizable(t);
                        addColumnHighlight(t);
                    });
                });
            });
        }

        // Stop 2 / Stop 3 popup — rendered into the body-level portal with fixed positioning.
        this._renderActiveStopPopup();
    }

    // Places the active stop popup below its header cell using viewport-absolute (fixed) coords.
    _renderActiveStopPopup() {
        const portalEl = document.getElementById('stop-popup-portal');
        if (!portalEl) return;
        if (!this._activeStopPopup || this._activeStopPopup === 1) {
            portalEl.innerHTML = '';
            portalEl.style.display = 'none';
            return;
        }
        const headerCell = document.querySelector('.stop-col[data-stop="' + this._activeStopPopup + '"]');
        if (!headerCell) { portalEl.innerHTML = ''; portalEl.style.display = 'none'; return; }

        const rect = headerCell.getBoundingClientRect();
        portalEl.innerHTML = this._renderStopPopup(this._activeStopPopup);
        portalEl.style.display = '';
        portalEl.style.position = 'fixed';
        portalEl.style.left = rect.left + 'px';
        portalEl.style.top = (rect.bottom + 4) + 'px';
        portalEl.style.zIndex = '200';
    }

    // Compact touchpoint table shared by order detail and journey path panels
    renderTouchpointTable(fp, touchpoints, firstOrderTs) {
        if (firstOrderTs === undefined) {
            const journey = this.journeys.find(j => j.fp === fp);
            firstOrderTs = journey ? journey.firstOrderTs : null;
        }
        const esc = this._escHtml.bind(this);
        const dimOr = (v) => v ? esc(v) : '<span class="dim">—</span>';
        const monoDim = (v) => v ? `<span class="mono dim">${esc(v)}</span>` : '<span class="dim">—</span>';

        let html = `<div style="overflow-x:auto;">
            <table class="tp-table">
                <thead><tr>
                    <th>#</th><th>Type</th><th>Conv. Type</th><th>Date</th>
                    <th>Source</th><th>Ad Campaign</th><th>Ref. Campaign</th>
                    <th>Ad Group</th><th>Creative</th><th>Sub5</th><th>Sub6</th>
                    <th>Device</th><th>Browser</th><th>OS</th>
                    <th>State</th><th>City</th><th>IP</th>
                    <th>Order</th><th>Customer</th>
                    <th>Payout</th><th>Value</th><th>Status</th>
                </tr></thead><tbody>`;

        touchpoints.forEach((r, i) => {
            const phase = this.classifyTouchpoint(r, firstOrderTs);
            const isSub = this.isSubscription(r);
            const isSubAct = this.isSubscriptionAction(r);

            // v2 row modifiers: .pre (before first purchase), .first (the first-purchase row),
            // .muted (recurring/shipping sub-actions). We also keep the legacy row classes
            // so the shim CSS still styles any non-re-skinned tables uniformly.
            const rowClasses = [
                r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order',
                isSub ? 'subscription-row' : '',
                phase === 'first' ? 'first first-purchase-row' : '',
                phase === 'pre'   ? 'pre pre-purchase-row' : '',
                isSubAct ? 'muted sub-action-row' : '',
            ].filter(Boolean).join(' ');

            let typeBadge;
            if (r.t === 'c')      typeBadge = '<span class="badge click">CLICK</span>';
            else if (r.t === 'v') typeBadge = '<span class="badge action">ACTION</span>';
            else                  typeBadge = isSub
                ? '<span class="badge subscription">SUB</span>'
                : '<span class="badge purchase">PURCHASE</span>';
            const firstBadge = (r.t === 'o' && phase === 'first')
                ? ' <span class="first-purchase-badge">★ 1st</span>'
                : '';

            const vtCell = r.vt
                ? `<b style="color:var(--orange)">${esc(r.vt)}</b>`
                : '<span class="dim">—</span>';

            const source = r.src || r.fsrc || '';
            const srcCell = source
                ? `<span class="src-chip"><span class="src-dot ${this.canonicalizeSource(source)}"></span>${esc(source)}</span>`
                : '<span class="dim">—</span>';

            const adGroup = r.adg || r.s1 || '';
            const ip = r.click_ip || r.conversion_ip || r.order_ip || r.ip || '';

            const payout = (r.t === 'v' && r.pay != null && r.pay !== '')
                ? `<span class="mono" style="color:var(--orange);font-weight:600;">$${Number(r.pay).toFixed(2)}</span>`
                : '<span class="dim">—</span>';
            const value = (r.t === 'o' && r.pr != null && r.pr !== '')
                ? `<span class="mono" style="color:var(--green);font-weight:700;">$${Number(r.pr).toFixed(2)}</span>`
                : '<span class="dim">—</span>';

            let stBadge;
            if (r.t !== 'o' || !r.st) {
                stBadge = '<span class="dim">—</span>';
            } else {
                const s = String(r.st).toUpperCase();
                const variant = s === 'FULFILLED' ? 'purchase'
                             : s === 'PENDING'    ? 'action'
                             : 'subscription';
                stBadge = `<span class="badge ${variant}">${esc(r.st)}</span>`;
            }

            const oidLink = r.oid
                ? `<a class="xlink mono" onclick="event.stopPropagation();D.navigateToOrder('${r.oid}')">#${esc(r.oid)}</a>`
                : '<span class="dim">—</span>';
            const custLink = r.nm
                ? (r.cid
                    ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToCustomer('${r.cid}')">${esc(r.nm)}</a>`
                    : esc(r.nm))
                : '<span class="dim">—</span>';

            html += `<tr class="${rowClasses}" style="cursor:pointer;" onclick="D.showTouchpoint('${fp}',${i})">
                <td class="dim">${i + 1}</td>
                <td>${typeBadge}${firstBadge}</td>
                <td>${vtCell}</td>
                <td class="mono dim" style="white-space:nowrap;">${esc(this.fmtDate(r.dt))}</td>
                <td>${srcCell}</td>
                <td>${dimOr(r.cmp)}</td>
                <td>${dimOr(r.rcmp)}</td>
                <td>${dimOr(adGroup)}</td>
                <td>${monoDim(r.s4)}</td>
                <td>${monoDim(r.s5)}</td>
                <td>${monoDim(r.s6)}</td>
                <td>${dimOr(r.dev)}</td>
                <td>${dimOr(r.br)}</td>
                <td>${dimOr(r.os)}</td>
                <td>${dimOr(r.co)}</td>
                <td>${dimOr(r.ci)}</td>
                <td>${monoDim(ip)}</td>
                <td>${oidLink}</td>
                <td>${custLink}</td>
                <td>${payout}</td>
                <td>${value}</td>
                <td>${stBadge}</td>
            </tr>`;
        });

        html += `</tbody></table></div>`;
        return html;
    }

    // Returns one <dt>/<dd> pair for detail card grids (skips empty values)
    dlRow(label,val) { return val?`<dt>${label}</dt><dd>${val}</dd>`:''; }

    // Robust date parser: handles Unix timestamps, ISO, DD/MM/YYYY, MM/DD/YYYY
    parseDate(d) {
        if(!d) return null;
        // Unix timestamp (numeric string)
        if(/^\d{10,13}$/.test(String(d).trim())) {
            const ts = Number(d);
            const dt = new Date(ts < 1e12 ? ts * 1000 : ts);
            if(!isNaN(dt) && dt.getFullYear() >= 2000) return dt;
        }
        // Try native parsing first
        let dt = new Date(d);
        if(!isNaN(dt) && dt.getFullYear() >= 2000) return dt;
        const s = String(d).trim();
        // MM/DD/YYYY HH:MM or MM/DD/YYYY
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{2}):(\d{2}))?/);
        if(m) {
            dt = new Date(+m[3], +m[1]-1, +m[2], +(m[4]||0), +(m[5]||0));
            if(!isNaN(dt) && dt.getFullYear() >= 2000) return dt;
        }
        // YYYY-MM-DD HH:MM:SS or YYYY-MM-DDTHH:MM:SS
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if(m) {
            dt = new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
            if(!isNaN(dt) && dt.getFullYear() >= 2000) return dt;
        }
        return null;
    }

    // Compares two date strings for sorting (uses parseDate internally)
    compareDates(a, b) {
        const da = this.parseDate(a);
        const db = this.parseDate(b);
        if(da && db) return da - db;
        if(da) return -1;
        if(db) return 1;
        return String(a||'').localeCompare(String(b||''));
    }

    // Formats date as "MM/DD/YYYY HH:MM"
    fmtDate(d) {
        if(!d) return '';
        const dt = this.parseDate(d);
        if(!dt) return String(d);
        const dd = String(dt.getDate()).padStart(2,'0');
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const yy = dt.getFullYear();
        const hh = String(dt.getHours()).padStart(2,'0');
        const mi = String(dt.getMinutes()).padStart(2,'0');
        return `${mm}/${dd}/${yy} ${hh}:${mi}`;
    }

    // Short date for the Journey Paths first column.
    fmtShortDate(d) {
        if(!d) return '';
        const dt = this.parseDate(d);
        if(!dt) return String(d);
        return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
    }

    // Toggles sort direction on a table column header click
    sortCol(tab, field) {
        const cur = this.sortState[tab];
        if(cur && cur.f===field) {
            this.sortState[tab] = {f:field, d:cur.d==='desc'?'asc':'desc'};
        } else {
            this.sortState[tab] = {f:field, d:'desc'};
        }
        this.renderTab();
    }

    // Renders Prev/Next pagination controls with "Showing X–Y of Z"
    renderPager(tab, total) {
        const el = document.getElementById(tab+'-pager');
        const page = this.pages[tab];
        const totalPages = Math.ceil(total/this.pageSize);
        const start = page*this.pageSize+1;
        const end = Math.min((page+1)*this.pageSize, total);
        el.innerHTML = `
            <span>Showing ${total?start:0}–${end} of ${total}</span>
            <div>
                <button onclick="D.goPage('${tab}',-1)" ${page===0?'disabled':''}>← Prev</button>
                <button onclick="D.goPage('${tab}',1)" ${page>=totalPages-1?'disabled':''}>Next →</button>
            </div>`;
    }

    // Moves to next (+1) or previous (-1) page
    goPage(tab, dir) {
        this.pages[tab] += dir;
        this.renderTab();
    }

    // Cross-link: navigates within the panel to a fingerprint's journey detail
    navigateToFingerprint(fp) {
        this.showJourneyPathsTable(fp);
    }

    // Cross-link: navigates within the panel to an order detail
    navigateToOrder(oid) {
        this.showOrder(oid);
    }

    // Cross-link: navigates within the panel to a customer detail
    navigateToCustomer(cid) {
        this.showCustomer(cid);
    }

    // Closes the detail panel and restores the active tab body
    closeDetail() {
        const container = document.getElementById('detail-container');
        if (container) {
            container.classList.remove('open');
            container.addEventListener('transitionend', function handler() {
                if (!container.classList.contains('open')) container.innerHTML = '';
                container.removeEventListener('transitionend', handler);
            });
        }
        const bd = document.getElementById('backdrop');
        if (bd) bd.classList.remove('open');
        document.body.classList.remove('no-scroll');
        const tab = this._currentTab || 'route';
        this._panelStates[tab] = { history: [], current: null, scrollTop: 0 };
    }
}


// Measures natural column widths (clamped 50–400px), then applies fixed-width layout
function autoFitColumns(tableEl) {
    if(!tableEl || !tableEl.querySelector('thead')) return;
    const ths = Array.from(tableEl.querySelectorAll(':scope > thead > tr > th'));
    if(!ths.length) return;
    const colCount = ths.length;
    const directRows = Array.from(tableEl.querySelectorAll(':scope > tbody > tr'));
    const regularCells = [];
    directRows.forEach(row => {
        const tds = Array.from(row.querySelectorAll(':scope > td'));
        if (tds.length === colCount) regularCells.push(...tds);
    });
    if(!regularCells.length) return;

    regularCells.forEach(td => td.style.maxWidth = 'none');

    tableEl.style.tableLayout = 'auto';
    tableEl.style.width = 'auto';
    ths.forEach(th => th.style.width = '');

    void tableEl.offsetHeight;
    const naturalWidths = ths.map(th => {
        return Math.min(Math.max(Math.ceil(th.getBoundingClientRect().width) + 4, 50), 400);
    });

    const totalWidth = naturalWidths.reduce((s, w) => s + w, 0);
    const containerWidth = tableEl.parentElement ? tableEl.parentElement.clientWidth : totalWidth;
    tableEl.style.tableLayout = 'fixed';
    tableEl.style.width = Math.max(totalWidth, containerWidth) + 'px';
    ths.forEach((th, i) => th.style.width = naturalWidths[i] + 'px');

    regularCells.forEach((td, i) => {
        const colIndex = i % colCount;
        td.style.maxWidth = naturalWidths[colIndex] + 'px';
    });
}

// Highlights all cells in a column when hovering its header
function addColumnHighlight(tableEl) {
    if (!tableEl || !tableEl.querySelector('thead')) return;
    const ths = Array.from(tableEl.querySelectorAll(':scope > thead > tr > th'));

    ths.forEach((th, colIndex) => {
        th.addEventListener('mouseenter', () => {
            tableEl.querySelectorAll(':scope > tbody > tr').forEach(row => {
                const td = row.children[colIndex];
                if (td && !td.hasAttribute('colspan')) td.classList.add('col-highlight');
            });
        });
        th.addEventListener('mouseleave', () => {
            tableEl.querySelectorAll(':scope > tbody > tr').forEach(row => {
                const td = row.children[colIndex];
                if (td && !td.hasAttribute('colspan')) td.classList.remove('col-highlight');
            });
        });
    });
}

// Updates max-width on all tbody cells in a given column to match the header width
function syncColumnMaxWidth(tableEl, colIndex, width) {
    const rows = tableEl.querySelectorAll(':scope > tbody > tr');
    rows.forEach(row => {
        const td = row.children[colIndex];
        if (td && !td.hasAttribute('colspan')) td.style.maxWidth = width + 'px';
    });
}

// Adds drag handles to table column headers for manual resize (+ double-click to auto-fit)
function makeResizable(tableEl) {
    if(!tableEl) return;
    tableEl.querySelectorAll(':scope > thead .col-rz').forEach(h => h.remove());

    const ths = Array.from(tableEl.querySelectorAll(':scope > thead > tr > th'));

    ths.forEach(th => {
        const handle = document.createElement('div');
        handle.className = 'col-rz';
        th.appendChild(handle);

        // Always block click from reaching th's onclick sort handler,
        // regardless of whether the mouse actually moved.
        handle.addEventListener('click', e => e.stopPropagation());

        handle.addEventListener('dblclick', e => {
            e.preventDefault();
            e.stopPropagation();
            const colIndex = ths.indexOf(th);
            const savedLayout = tableEl.style.tableLayout;
            const savedWidth = tableEl.style.width;
            tableEl.style.tableLayout = 'auto';
            tableEl.style.width = 'auto';
            const savedThs = ths.map(t => t.style.width);
            ths.forEach(t => t.style.width = '');
            const naturalW = Math.min(Math.max(Math.ceil(th.getBoundingClientRect().width) + 4, 60), 400);
            tableEl.style.tableLayout = savedLayout || '';
            tableEl.style.width = savedWidth || '';
            ths.forEach((t, i) => t.style.width = savedThs[i] || '');
            if(tableEl.style.tableLayout !== 'fixed') {
                const snapWidths = ths.map(t => t.getBoundingClientRect().width);
                tableEl.style.width = tableEl.getBoundingClientRect().width + 'px';
                tableEl.style.tableLayout = 'fixed';
                ths.forEach((t, i) => t.style.width = snapWidths[i] + 'px');
            }
            th.style.width = naturalW + 'px';
            syncColumnMaxWidth(tableEl, colIndex, naturalW);
        });

        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();

            // 1. Snapshot rendered widths BEFORE touching layout
            const snapWidths = ths.map(t => t.getBoundingClientRect().width);

            // 2. Pin the table to its current pixel width so columns
            //    don't redistribute when we switch to fixed layout
            tableEl.style.width = tableEl.getBoundingClientRect().width + 'px';

            // 3. Switch to fixed layout
            tableEl.style.tableLayout = 'fixed';

            // 4. Apply snapshotted widths to every header cell
            ths.forEach((t, i) => { t.style.width = snapWidths[i] + 'px'; });

            // 5. Read start geometry AFTER fixed layout is applied
            const startX = e.clientX;
            const startW = th.getBoundingClientRect().width;

            const colIndex = ths.indexOf(th);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = ev => {
                const newW = Math.max(40, startW + ev.clientX - startX);
                th.style.width = newW + 'px';
                syncColumnMaxWidth(tableEl, colIndex, newW);
            };
            const onUp = () => {
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

// Auto-fits columns + adds resize handles to all tables inside a tab container
function makeContainerResizable(containerId) {
    const el = document.getElementById(containerId);
    if(!el) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.querySelectorAll('table.tbl').forEach(t => {
                autoFitColumns(t);
                makeResizable(t);
                addColumnHighlight(t);
            });
        });
    });
}

// Auto-fits columns + adds resize handles to all tables inside the detail panel.
// Supports both the legacy `.detail-content` wrapper and the v2 `.panel-body` layout.
function makePanelResizable() {
    const container = document.getElementById('detail-container');
    const el = container ? (container.querySelector('.panel-body') || container.querySelector('.detail-content')) : null;
    if(!el) return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.querySelectorAll('table.tp-table, table.tbl').forEach(t => {
                autoFitColumns(t);
                makeResizable(t);
                addColumnHighlight(t);
            });
        });
    });
}

// ═══════════════════════════════════════════
// Custom dropdown system (cc-wrap / cc-popover) — Phase 13
// Enhances every native <select> with a styled trigger + popover,
// while keeping the underlying <select> authoritative (so existing
// onchange handlers fire normally).
// ═══════════════════════════════════════════
const CC_SOURCE_COLORS = {
    Facebook: '#3c6ec9',
    Google:   '#15aa6a',
    Tiktok:   '#222',
    Organic:  '#7a8e2a',
    Direct:   '#a15fd6',
    Email:    '#e07a2a',
    Bing:     '#d0a30c',
    Any:      'transparent',
};

let _ccOpen = null;

function enhanceSelects(root) {
    ccClose();
    const scope = root || document;
    scope.querySelectorAll('select').forEach(sel => {
        if (sel.dataset.ccEnhanced === '1') return;
        sel.dataset.ccEnhanced = '1';

        const parent = sel.parentNode;
        const wrap = document.createElement('span');
        wrap.className = 'cc-wrap';
        parent.insertBefore(wrap, sel);
        wrap.appendChild(sel);
        sel.classList.add('cc-native');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'cc-trigger';
        if (sel.classList.contains('filter-select')) trigger.classList.add('cc-filter');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = `<span class="cc-label"></span><svg class="cc-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        wrap.appendChild(trigger);

        const syncLabel = () => {
            const opt = sel.options[sel.selectedIndex];
            const label = trigger.querySelector('.cc-label');
            if (label) label.textContent = opt ? opt.textContent : '';
        };
        syncLabel();
        sel._ccSync = syncLabel;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (trigger.getAttribute('aria-expanded') === 'true') { ccClose(); return; }
            ccOpen(sel, trigger);
        });
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                ccOpen(sel, trigger);
            }
        });
    });
}

function ccOpen(sel, trigger) {
    ccClose();
    const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const pop = document.createElement('div');
    pop.className = 'cc-popover';

    // Heuristic: if any option text matches a known source name, treat this as a source select.
    const isSource = Array.from(sel.options).some(o => CC_SOURCE_COLORS[o.textContent] !== undefined && ['Facebook','Google','Tiktok','Bing','Email','Organic','Direct'].includes(o.textContent));

    const opts = Array.from(sel.options).map((o, i) => {
        const txt = o.textContent;
        const selected = o.selected;
        let dot = '';
        if (isSource && CC_SOURCE_COLORS[txt]) {
            dot = `<span class="cc-dot" style="background:${CC_SOURCE_COLORS[txt]}"></span>`;
        }
        return `<div class="cc-option${selected ? ' cc-selected' : ''}" data-idx="${i}" role="option">${dot}${escHtml(txt)}</div>`;
    }).join('');
    pop.innerHTML = opts;
    document.body.appendChild(pop);

    const r = trigger.getBoundingClientRect();
    const minW = Math.max(r.width, 160);
    pop.style.setProperty('--cc-min-width', minW + 'px');
    pop.style.left = r.left + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    pop.classList.add('open');
    requestAnimationFrame(() => {
        const pr = pop.getBoundingClientRect();
        if (pr.right > window.innerWidth - 8) {
            pop.style.left = Math.max(8, window.innerWidth - pr.width - 8) + 'px';
        }
        if (pr.bottom > window.innerHeight - 8) {
            pop.style.top = (r.top - pr.height - 4) + 'px';
        }
    });

    trigger.setAttribute('aria-expanded', 'true');

    let focusIdx = Math.max(0, sel.selectedIndex);
    const updateFocus = () => {
        pop.querySelectorAll('.cc-option').forEach((el, i) => {
            el.classList.toggle('cc-focused', i === focusIdx);
        });
    };
    updateFocus();

    const commit = (idx) => {
        sel.selectedIndex = idx;
        if (sel._ccSync) sel._ccSync();
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        ccClose();
    };

    pop.addEventListener('click', (e) => {
        const opt = e.target.closest('.cc-option');
        if (!opt) return;
        commit(parseInt(opt.dataset.idx, 10));
    });
    pop.addEventListener('mousemove', (e) => {
        const opt = e.target.closest('.cc-option');
        if (!opt) return;
        focusIdx = parseInt(opt.dataset.idx, 10);
        updateFocus();
    });

    const onKey = (e) => {
        if (e.key === 'Escape') { ccClose(); trigger.focus(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(sel.options.length - 1, focusIdx + 1); updateFocus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(0, focusIdx - 1); updateFocus(); }
        else if (e.key === 'Enter') { e.preventDefault(); commit(focusIdx); }
    };
    const onDoc = (e) => {
        if (!pop.contains(e.target) && e.target !== trigger) ccClose();
    };
    const onScroll = (e) => {
        if (pop.contains(e.target)) return;
        ccClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc, true);
    window.addEventListener('resize', ccClose);
    window.addEventListener('scroll', onScroll, true);

    _ccOpen = { pop, trigger, onKey, onDoc, onScroll };
}

function ccClose() {
    if (!_ccOpen) return;
    const { pop, trigger, onKey, onDoc, onScroll } = _ccOpen;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('mousedown', onDoc, true);
    window.removeEventListener('resize', ccClose);
    window.removeEventListener('scroll', onScroll, true);
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    _ccOpen = null;
}

// Expose on Dashboard for `this.enhanceSelects()` convenience
if (typeof Dashboard !== 'undefined') {
    Dashboard.prototype.enhanceSelects = function () { enhanceSelects(); };
}

// ═══════════════════════════════════════════
// Bootstrap: loads CSV data and creates the Dashboard
// ═══════════════════════════════════════════
// No-op stub so inline onclick="D.filter()" etc. don't throw before Dashboard is created
window.D = {
    filter: () => {},
    clearFilters: () => {},
    markFiltersPending: () => {},
    applyFilters: () => {},
    switchTab: () => {},
    sortCol: () => {},
    showOrder: () => {},
    showCustomer: () => {},
    closeDetail: () => {},
    goPage: () => {},
    showJourneyPathsTable: () => {},
    showTouchpoint: () => {},
    showTpFieldConfigurator: () => {},
    toggleTpField: () => {},
    tpFieldShowAll: () => {},
    tpFieldHideAll: () => {},
    setRouteSort: () => {},
    toggleRouteSortDir: () => {},
    navigateToFingerprint: () => {},
    expandRouteRow: () => {},
    navigateToOrder: () => {},
    navigateToCustomer: () => {},
    panelGoBack: () => {},
    addTabFilter: () => {},
    updateTabFilter: () => {},
    updateTabFilterRange: () => {},
    removeTabFilter: () => {},
    _renderCustomerOrdersBody: () => '',
    _renderCustomerTouchpointsBody: () => '',
    toggleFunnelPanel: () => {},
    renderFunnel: () => {},
    renderAttribution: () => {},
    setStopDim: () => {},
    setStopValue: () => {},
    sortStops: () => {},
    toggleStopRow: () => {},
    setStopFpsPage: () => {},
    _setStop1Mode: () => {},
    _toggleStopPopup: () => {},
    _activeStopPopup: null,
};

// Main init: tries to load CSV from ?csvUrl= param (or default file), falls back to file upload
(async () => {
    const status = document.getElementById('data-status');

    function showUploadFallback(reason) {
        if (!status) return;
        status.style.display = 'block';
        status.className = 'data-status data-status-error';
        status.innerHTML = `
            <strong>Could not load CSV from URL.</strong><br>
            <span style="font-weight:400">${reason}</span><br>
            <label class="csv-upload-label">
                Upload CSV from your computer
                <input type="file" accept=".csv,text/csv" id="csv-file-input">
            </label>
        `;
        document.getElementById('csv-file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            status.className = 'data-status';
            status.textContent = `Reading ${file.name}…`;
            try {
                const text = await file.text();
                const firstLine = text.split(/\r?\n/)[0] || '';
                const delim = firstLine.includes(';') && (firstLine.match(/;/g)||[]).length > (firstLine.match(/,/g)||[]).length ? ';' : ',';
                const parsed = window.Papa.parse(text, {
                    header: true, delimiter: delim, skipEmptyLines: true, dynamicTyping: false,
                    transformHeader: h => String(h ?? '').trim().toLowerCase()
                });
                const records = [];
                for (const r of (parsed.data || [])) {
                    const rec = window.normalizeRow ? window.normalizeRow(r) : r;
                    if (!rec) continue;
                    if (Array.isArray(rec)) records.push(...rec); else records.push(rec);
                }
                window.D = new Dashboard(records);
                status.style.display = 'none';
            } catch (err) {
                status.textContent = `Failed to read file: ${err.message}`;
            }
        });
    }

    const csvUrl =
        new URLSearchParams(window.location.search).get('csvUrl') ||
        './all_data_by_columns%203%20to%20bubble.csv';
    const isLocal = window.location.protocol === 'file:';
    try {
        if(status) { status.style.display = 'block'; status.textContent = 'Loading CSV data...'; }
        const records = await window.loadRecordsFromCsv(csvUrl);
        window.D = new Dashboard(records);
        if(status) status.style.display = 'none';
    } catch (e) {
        console.error(e);
        window.D = new Dashboard([]);
        const localMsg = isLocal
            ? `You're opening this file locally (<code>file://</code>), which blocks cross-origin CSV downloads. Deploy to GitHub Pages or use the upload button below.`
            : `The file at <code style="word-break:break-all">${csvUrl}</code> could not be fetched. Check the browser console for details.`;
        showUploadFallback(localMsg + ` You can also upload the CSV directly from your computer.`);
    }
})();
