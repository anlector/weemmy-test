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
const TAB_FILTER_FIELDS = {
    route: [
        { key: 'src', label: 'Source', type: 'select', level: 'journey' },
        { key: 'firstSource', label: 'First Source', type: 'select', level: 'journey' },
        { key: 'subsequentSource', label: 'Subsequent Source', type: 'select', level: 'journey' },
        { key: 'cmp', label: 'Campaign', type: 'select', level: 'journey' },
        { key: 'co', label: 'Country', type: 'select', level: 'record' },
        { key: 'hasOrder', label: 'Has Orders', type: 'bool', level: 'journey' },
        { key: 'hasConv', label: 'Has Conversions', type: 'bool', level: 'journey' },
        { key: 'custName', label: 'Customer Name', type: 'text', level: 'journey' },
        { key: 'custEmail', label: 'Customer Email', type: 'text', level: 'journey' },
    ],
    orders: [
        { key: 'st', label: 'Status', type: 'select', level: 'record' },
        { key: 'app', label: 'App', type: 'select', level: 'record' },
        { key: 'rcmp', label: 'Campaign', type: 'select', level: 'record' },
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
    base.src = getFirst(row, ['src', 'source', 'rt_source', 'lastVisitSource', 'rt_rt_source']);
    base.cmp = getFirst(row, ['cmp', 'campaign', 'rt_campaign', 'lastVisitCampaign', 'rt_campaignName']);
    base.vt = getFirst(row, ['vt', 'conversion_type', 'conversionType', 'type_label']);
    base.pay = parseMaybeNumber(getFirst(row, ['pay', 'payout', 'payout_default', 'pub_revenue', 'pub_revenue_default']));
    base.oid = getFirst(row, ['oid', 'orderId', 'order_id', 'shopify_order_id', 'shopify_order_orderId', 'order']);
    base.pr = parseMaybeNumber(getFirst(row, ['pr', 'price', 'payout', 'payout_default', 'payout_network', 'shopify_order_price']));
    base.st = getFirst(row, ['st', 'status', 'order_status', 'financial_status']);
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
    return base.t ? base : null;
  }

  // Normalizes a raw JSON event object (from a raw_data column) into c/v/o record
  function normalizeFromJsonEvent(j) {
    if (!j) return null;
    const fp = j.fp ?? j.fingerprint ?? j.rt_fingerprint ?? j.click_fingerprint;
    const dt = j.dt ?? j.track_time ?? j.created_at ?? j.createdAt ?? j.conv_time ?? j.click_date ?? j.date;
    if (!fp || !dt) return null;
    const type = j.t ?? j.type ?? j.event_type ?? j.event ?? '';
    const t = (typeof type === 'string' && normalizeType(type)) || normalizeType(String(type));
    if (!t) return null;
    if (t === 'c') {
      return { t:'c', fp:String(fp), dt:String(dt),
        src:j.src??j.rt_source??j.source??j.lastVisitSource,
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
        src:j.src??j.rt_source??j.source??j.lastVisitSource,
        cmp:j.cmp??j.rt_campaign??j.campaign??j.lastVisitCampaign,
        dev:j.dev??j.device_fullname??j.device??j.device_type,
        br:j.br??j.browser, os:j.os??j.os_fullname,
        co:j.co??j.country, ci:j.ci??j.city,
        s4:j.s4??j.sub4??j.rt_sub4??j.sub_4,
        s5:j.s5??j.sub5??j.rt_sub5??j.sub_5,
        s6:j.s6??j.sub6??j.rt_sub6??j.sub_6 };
    }
    return { t:'o', fp:String(fp), dt:String(dt),
      oid:j.oid??j.orderId??j.order_id??j.shopify_order_id??j.shopify_order_orderId??j.order,
      pr:parseMaybeNumber(j.pr??j.price??j.payout_default??j.payout??j.payout_network??j.total_price),
      st:j.st??j.status??j.order_status??j.financial_status,
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
          t:'o', fp:String(orderFp), dt:String(orderDt), oid:String(orderOid),
          pr:parseMaybeNumber(getFirst(row, ['shopify_order_price', 'shopify_order_pr'])),
          st:getFirst(row, ['shopify_order_status','shopify_order_st','shopify_order_financial_status']),
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
      const clickDt = getFirst(row, ['click_created_at','click_date','click_track_time']);
      if (clickFp && clickDt) {
        const clickRec = {
          t:'c', fp:String(clickFp), dt:String(clickDt),
          src:getFirst(row, ['click_source']), cmp:getFirst(row, ['click_campaign','click_campaign_id']),
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
          src:getFirst(row, ['conversion_rt_source','conversion_source']),
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
    base.src = getFirst(row, ['src', 'source', 'rt_source']);
    base.cmp = getFirst(row, ['cmp', 'campaign', 'rt_campaign']);
    base.oid = getFirst(row, ['oid', 'orderId', 'order_id', 'order']);
    base.pr = parseMaybeNumber(getFirst(row, ['pr', 'price', 'payout', 'payout_default']));
    base.st = getFirst(row, ['st', 'status', 'order_status', 'financial_status']);
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
    return base;
  }

  // Fetches CSV from URL, auto-detects delimiter (comma vs semicolon),
  // normalizes all rows, caches result in IndexedDB for next load
  async function loadRecordsFromCsv(csvUrl, options = {}) {
    if (!csvUrl) throw new Error('Missing csvUrl');
    if (!window.Papa) throw new Error('PapaParse is not loaded');
    if (!window.idbCache) throw new Error('idbCache is not loaded');
    const cacheKey = `csv:${csvUrl}`;
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
        src:'Source', cmp:'Campaign', rcmp:'Referring Campaign',
        fsrc:'First Source', fmed:'First Medium', lsrc:'Last Source', lmed:'Last Medium',
        s1:'Sub1', s2:'Sub2', s3:'Sub3', s4:'Creative', s5:'Sub5', s6:'Sub6', adg:'Ad Group', plc:'Placement',
        dev:'Device', br:'Browser', os:'OS', ua:'User Agent',
        co:'Country', ci:'City', ip:'IP Address', isp:'ISP', addr:'Address', zip:'Zip Code',
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
        { label:'Conversion',  keys:['vt','pay'] },
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
        this.activeTab = 'route';
        this.pages = {orders:0, customers:0, route:0};
        this.pageSize = 20;
        this.sortState = {};
        this._attrView = 'source';
        this._attrSortCol = 'ft';
        this._attrSortAsc = false;
        this._tabFilters = {};
        this._currentTab = 'route';
        this.filteredJourneys = null;
        this.filteredOrders = null;
        this.filteredCustomers = null;
        // Load saved field visibility config from localStorage
        // tpHiddenFields: Set of field keys the user has chosen to hide
        try {
            const saved = localStorage.getItem('tpHiddenFields');
            this.tpHiddenFields = saved ? new Set(JSON.parse(saved)) : new Set();
        } catch(e) {
            this.tpHiddenFields = new Set();
        }
        this.init();
    }

    // Persists the hidden-fields set to localStorage
    saveTpFieldConfig() {
        try { localStorage.setItem('tpHiddenFields', JSON.stringify([...this.tpHiddenFields])); } catch(e) {}
    }

    isFieldVisible(key) {
        return !this.tpHiddenFields.has(key);
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
        this.renderTabFilters();
        this.applyFilters();
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
            this.customers.push({
                cid:c.cid, nm:c.nm||'Unknown', em:c.em||'',
                orderCount: c.orders.length,
                fpCount: c.fps.size,
                touchpoints,
                revenue: rev,
                firstSeen: dates[0]||'',
                lastSeen: dates[dates.length-1]||'',
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

    // Updates the 5 KPI cards and tab counts
    renderKPIs() {
        const fps = new Set();
        this.filtered.forEach(r => { if(r.fp) fps.add(r.fp); });
        const custs = new Set();
        this.fOrders.forEach(o => { if(o.cid) custs.add(o.cid); });
        document.getElementById('kpi-journeys').textContent = fps.size.toLocaleString();
        document.getElementById('kpi-customers').textContent = custs.size.toLocaleString();
        document.getElementById('kpi-orders').textContent = this.fOrders.length.toLocaleString();
        document.getElementById('kpi-conversions').textContent = this.fConvs.length.toLocaleString();
        document.getElementById('kpi-clicks').textContent = this.fClicks.length.toLocaleString();
        document.getElementById('tc-orders').textContent = '('+this.fOrders.length+')';
        document.getElementById('tc-customers').textContent = '('+this.customers.length+')';
        document.getElementById('tc-route').textContent = '('+this.journeys.length+')';
        const attrSrcs = new Set();
        this.filtered.forEach(r => { if(r.t==='c' && r.src) attrSrcs.add(r.src); });
        const tcAttr = document.getElementById('tc-attribution');
        if(tcAttr) tcAttr.textContent = '('+attrSrcs.size+')';
    }

    // --- TABS ---
    switchTab(tab) {
        this.activeTab = tab;
        this._currentTab = tab;
        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
        document.querySelectorAll('.tab-body').forEach(t=>t.classList.remove('active'));
        document.querySelector(`.tab-body#tab-${tab}`).classList.add('active');
        const tabs = document.querySelectorAll('.tab');
        const idx = {route:0,orders:1,customers:2,attribution:3}[tab];
        tabs[idx].classList.add('active');
        this.renderTabFilters();
        this.renderTab();
    }

    renderTab() {
        if(this.activeTab==='orders') this.renderOrders();
        else if(this.activeTab==='route') this.renderRoute();
        else if(this.activeTab==='attribution') this.renderAttribution();
        else this.renderCustomers();
    }

    // Renders the Orders tab: sortable table with order ID, date, value, status, customer, fingerprint
    renderOrders() {
        let data = [...(this.filteredOrders || this.fOrders)];
        const s = this.sortState.orders;
        if(s) data.sort((a,b) => { const av=a[s.f]||'',bv=b[s.f]||''; const c=typeof av==='number'?av-bv:String(av).localeCompare(String(bv)); return s.d==='asc'?c:-c; });
        const start = this.pages.orders * this.pageSize;
        const page = data.slice(start, start+this.pageSize);
        const total = data.length;

        let html = '<table class="tbl"><thead><tr>';
        const cols = [
            {f:'oid',l:'Order ID'},{f:'dt',l:'Date'},{f:'pr',l:'Value'},{f:'st',l:'Status'},
            {f:'nm',l:'Customer'},{f:'fp',l:'Fingerprint'},{f:'rcmp',l:'Campaign'},{f:'fsrc',l:'First Source'}
        ];
        cols.forEach(c => {
            const cls = s&&s.f===c.f ? (s.d==='asc'?'sort-asc':'sort-desc') : '';
            html += `<th class="${cls}" onclick="D.sortCol('orders','${c.f}')">${c.l}</th>`;
        });
        html += '</tr></thead><tbody>';
        page.forEach(r => {
            const stBadge = r.st==='FULFILLED'?'badge-green':r.st==='PENDING'?'badge-orange':'badge-grey';
            const custCell = r.cid
                ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToCustomer('${r.cid}')">${r.nm||''}</a>${r.em?'<br><small style="color:var(--text-dim)">'+r.em+'</small>':''}`
                : `${r.nm||''}${r.em?'<br><small style="color:var(--text-dim)">'+r.em+'</small>':''}`;
            const fpCell = r.fp ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToFingerprint('${r.fp}')" style="font-size:12px;">${r.fp.substring(0,12)}...</a>` : '';
            html += `<tr onclick="D.showOrder('${r.oid}')">
                <td>${r.oid||''}</td>
                <td>${this.fmtDate(r.dt)}</td>
                <td><strong>$${(r.pr||0).toFixed(2)}</strong></td>
                <td><span class="badge ${stBadge}">${r.st||'N/A'}</span></td>
                <td>${custCell}</td>
                <td>${fpCell}</td>
                <td>${r.rcmp||''}</td>
                <td>${r.fsrc||''}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('orders-table').innerHTML = html;
        makeContainerResizable('orders-table');
        this.renderPager('orders', total);
    }

    // Side panel: shows order details + customer info + journey timeline for that fingerprint
    showOrder(oid) {
        const order = this.fOrders.find(o=>o.oid===oid);
        if(!order) return;
        // Get journey for this order
        const touchpoints = order.fp ? this.raw.filter(r=>r.fp===order.fp) : [];
        touchpoints.sort((a,b)=>this.compareDates(a.dt, b.dt));

        let html = `<div class="detail-title">Order #${order.oid}</div>`;
        html += '<div class="cust-card"><h4>Order Details</h4><dl class="cust-grid">';
        html += this.dlRow('Value','$'+(order.pr||0).toFixed(2));
        html += this.dlRow('Status',order.st);
        html += this.dlRow('Date',this.fmtDate(order.dt));
        html += this.dlRow('App',order.app);
        html += this.dlRow('Campaign',order.rcmp);
        html += this.dlRow('City',order.ci);
        html += this.dlRow('Country',order.co);
        html += this.dlRow('Currency',order.cur);
        if(order.fp) html += this.dlRow('Fingerprint',`<a class="xlink" onclick="D.navigateToFingerprint('${order.fp}')">${order.fp}</a>`);
        html += '</dl></div>';
        html += '<div class="cust-card"><h4>Customer</h4><dl class="cust-grid">';
        const custNameLink = order.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${order.cid}')">${order.nm||''}</a>` : (order.nm||'');
        const custEmailLink = order.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${order.cid}')">${order.em||''}</a>` : (order.em||'');
        html += this.dlRow('Name', custNameLink);
        html += this.dlRow('Email', custEmailLink);
        html += this.dlRow('Customer ID', order.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${order.cid}')">${order.cid}</a>` : '');
        html += this.dlRow('First Source',order.fsrc);
        html += this.dlRow('Last Source',order.lsrc);
        html += '</dl></div>';
        // Journey timeline
        if(touchpoints.length) {
            html += `<div class="detail-sub">Journey Path (${touchpoints.length} touchpoints)</div>`;
            html += this.renderTouchpointTable(order.fp, touchpoints);
        }
        document.getElementById('detail-content').innerHTML = html;
        makePanelResizable();
        document.getElementById('overlay').classList.add('open');
    }

    // Renders the Customers tab: sortable table with name, order count, journeys, revenue
    renderCustomers() {
        let data = [...(this.filteredCustomers || this.customers)];
        const s = this.sortState.customers;
        if(s) data.sort((a,b) => { const av=a[s.f]||'',bv=b[s.f]||''; const c=typeof av==='number'?av-bv:String(av).localeCompare(String(bv)); return s.d==='asc'?c:-c; });
        const start = this.pages.customers * this.pageSize;
        const page = data.slice(start, start+this.pageSize);

        let html = '<table class="tbl"><thead><tr>';
        const cols = [
            {f:'nm',l:'Customer'},{f:'orderCount',l:'Orders'},{f:'fpCount',l:'Journeys'},
            {f:'touchpoints',l:'Touchpoints'},{f:'revenue',l:'Revenue'},{f:'firstSeen',l:'First Seen'},{f:'lastSeen',l:'Last Seen'}
        ];
        cols.forEach(c => {
            const cls = s&&s.f===c.f ? (s.d==='asc'?'sort-asc':'sort-desc') : '';
            html += `<th class="${cls}" onclick="D.sortCol('customers','${c.f}')">${c.l}</th>`;
        });
        html += '</tr></thead><tbody>';
        page.forEach(c => {
            html += `<tr onclick="D.showCustomer('${c.cid}')">
                <td>${c.nm}${c.em?'<br><small style="color:var(--text-dim)">'+c.em+'</small>':''}</td>
                <td><strong>${c.orderCount}</strong></td>
                <td>${c.fpCount}</td>
                <td>${c.touchpoints}</td>
                <td><strong>$${c.revenue.toFixed(2)}</strong></td>
                <td>${this.fmtDate(c.firstSeen)}</td>
                <td>${this.fmtDate(c.lastSeen)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        document.getElementById('customers-table').innerHTML = html;
        makeContainerResizable('customers-table');
        this.renderPager('customers', data.length);
    }

    // Renders the Journey Paths tab: each row = one fingerprint with horizontal touchpoint cards
    renderRoute() {
        let data = [...(this.filteredJourneys || this.journeys)];
        const rs = this.routeSort || { field: 'lastDate', dir: 'desc' };
        data.sort((a,b) => {
            const av = a[rs.field] ?? '';
            const bv = b[rs.field] ?? '';
            const c = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
            return rs.dir === 'asc' ? c : -c;
        });
        const start = this.pages.route * this.pageSize;
        const page = data.slice(start, start + this.pageSize);

        const tr = (s, n) => { if(!s) return ''; const v=String(s); return v.length<=n?v:v.slice(0,n-1)+'…'; };
        const kv = (label, val) => val ? `<div class="route-cell-kv"><span class="kv-label">${label}</span><span class="kv-val">${val}</span></div>` : '';

        const sortSel = rs.field;
        const sortDir = rs.dir;

        let html = `<div class="route-sort-bar">
            <label>Sort by</label>
            <select id="route-sort-field" onchange="D.setRouteSort(this.value)">
                <option value="lastDate" ${sortSel==='lastDate'?'selected':''}>Latest activity</option>
                <option value="firstDate" ${sortSel==='firstDate'?'selected':''}>First activity</option>
                <option value="count" ${sortSel==='count'?'selected':''}>Touchpoint count</option>
                <option value="revenue" ${sortSel==='revenue'?'selected':''}>Revenue</option>
                <option value="custName" ${sortSel==='custName'?'selected':''}>Customer name</option>
            </select>
            <button onclick="D.toggleRouteSortDir()">${sortDir==='desc'?'↓ Desc':'↑ Asc'}</button>
        </div>`;

        page.forEach((j, idx) => {
            const touchpoints = [...j.rows].sort((a,b)=>this.compareDates(a.dt, b.dt));
            const visible = touchpoints.slice(0, 20);
            const more = touchpoints.length - visible.length;

            const rowNum = start + idx + 1;
            const dateRange = `${this.fmtShortDate(j.firstDate)} → ${this.fmtShortDate(j.lastDate)}`;

            let custHtml = '';
            if(j.custName || j.custEmail) {
                const custLabel = j.custName || j.custEmail;
                const custClick = j.custId
                    ? `event.stopPropagation();D.navigateToCustomer('${j.custId}')`
                    : '';
                custHtml = `<div class="route-customer"><a onclick="${custClick}" title="${j.custEmail||''}">${tr(custLabel,22)}</a></div>`;
                if(j.custEmail && j.custName) {
                    custHtml += `<div class="route-meta" style="margin-top:1px;">${tr(j.custEmail,24)}</div>`;
                }
            }

            html += `<div class="route-row">
                <div class="route-fp" onclick="D.showJourneyPathsTable('${j.fp}')">
                    <div style="font-weight:800; font-size:14px;">#${rowNum}</div>
                    <div class="route-meta">${j.count} touchpoints</div>
                    <div class="route-meta">${dateRange}</div>
                    ${j.revenue ? `<div class="route-meta" style="font-weight:700;color:var(--green);">$${j.revenue.toFixed(2)}</div>` : ''}
                    ${custHtml}
                </div>
                <div class="route-cells">`;

            visible.forEach((r, tpIndex) => {
                const type = r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order';
                const typeLabel = r.t === 'c' ? 'CLICK' : r.t === 'v' ? 'CONVERSION' : 'ORDER';

                let cardBody = '';
                if(r.t === 'c') {
                    cardBody += kv('Source', r.src);
                    cardBody += kv('Campaign', tr(r.cmp,28));
                    cardBody += kv('Ad Group', tr(r.adg||r.s1,24));
                    cardBody += kv('Placement', tr(r.plc||r.s2,24));
                    cardBody += kv('Creative', tr(r.s4,24));
                } else if(r.t === 'v') {
                    cardBody += kv('Type', r.vt);
                    cardBody += kv('Source', r.src);
                    cardBody += kv('Campaign', tr(r.cmp,28));
                    const payout = (r.pay!=null && r.pay!=='') ? `$${Number(r.pay).toFixed(2)}` : '';
                    cardBody += kv('Payout', payout);
                    cardBody += kv('Creative', tr(r.s4,24));
                } else {
                    const stBadge = r.st==='FULFILLED'?'badge-green':r.st==='PENDING'?'badge-orange':'badge-grey';
                    const value = (r.pr!=null && r.pr!=='') ? `$${Number(r.pr).toFixed(2)}` : '';
                    const oidLink = r.oid ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToOrder('${r.oid}')">#${r.oid}</a>` : '';
                    cardBody += `<div class="route-cell-kv">${oidLink}</div>`;
                    cardBody += kv('Value', value);
                    cardBody += `<div class="route-cell-kv"><span class="badge ${stBadge}">${r.st||'N/A'}</span></div>`;
                    cardBody += kv('Campaign', tr(r.rcmp||r.cmp,28));
                    if(r.nm) {
                        const custClick = r.cid ? `event.stopPropagation();D.navigateToCustomer('${r.cid}')` : '';
                        cardBody += `<div class="route-cell-kv"><span class="kv-label">Customer</span><a class="xlink" onclick="${custClick}">${tr(r.nm,20)}</a></div>`;
                    }
                }

                const devParts = [r.dev, r.os].filter(Boolean);
                const locParts = [r.ci, r.co].filter(Boolean);
                let contextChips = '';
                if(devParts.length || locParts.length || r.br) {
                    contextChips = '<div class="route-cell-context">';
                    if(devParts.length) contextChips += `<span>${devParts.join(' · ')}</span>`;
                    if(r.br) contextChips += `<span>${r.br}</span>`;
                    if(locParts.length) contextChips += `<span>${locParts.join(', ')}</span>`;
                    contextChips += '</div>';
                }

                const onclick = `event.stopPropagation();D.showTouchpoint('${j.fp}',${tpIndex})`;
                html += `<div class="route-cell ${type}" onclick="${onclick}">
                    <div class="route-cell-type ${type}">${typeLabel}</div>
                    ${cardBody}
                    ${contextChips}
                    <div class="route-cell-date">${this.fmtDate(r.dt)}</div>
                </div>`;
            });

            if(more > 0) {
                html += `<div class="route-cell route-cell-more" onclick="event.stopPropagation();D.expandRouteRow('${j.fp}')">+${more} more</div>`;
            }

            html += `</div></div>`;
        });

        if(!page.length) html = '<div style="padding:16px 20px; color:var(--text-dim);">No journeys match current filters.</div>';
        document.getElementById('route-table').innerHTML = html;
        this.renderPager('route', data.length);
    }

    // Expands all hidden touchpoints for a journey row when "+N more" is clicked
    expandRouteRow(fp) {
        const journey = this.journeys.find(j => j.fp === fp);
        if (!journey) return;

        const touchpoints = [...journey.rows].sort((a, b) => this.compareDates(a.dt, b.dt));
        const hidden = touchpoints.slice(20);
        if (!hidden.length) return;

        // Locate the "+N more" element inside the correct row
        let targetCells = null;
        let moreEl = null;
        const rows = document.querySelectorAll('.route-row');
        for (const row of rows) {
            const fpEl = row.querySelector('.route-fp');
            if (fpEl && fpEl.getAttribute('onclick') && fpEl.getAttribute('onclick').includes(fp)) {
                targetCells = row.querySelector('.route-cells');
                moreEl = targetCells ? targetCells.querySelector('.route-cell-more') : null;
                break;
            }
        }
        if (!targetCells || !moreEl) return;

        const tr = (s, n) => { if (!s) return ''; return s.length > n ? s.substring(0, n) + '…' : s; };
        const kv = (label, val) => val ? `<div class="route-cell-kv"><span class="kv-label">${label}</span> ${val}</div>` : '';

        let newHtml = '';
        hidden.forEach((r, i) => {
            const tpIndex = 20 + i;
            const type = r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order';
            const typeLabel = r.t === 'c' ? 'CLICK' : r.t === 'v' ? 'CONVERSION' : 'ORDER';

            let cardBody = '';
            if (r.t === 'c') {
                cardBody += kv('Source', r.src);
                cardBody += kv('Campaign', tr(r.cmp, 28));
                cardBody += kv('Ad Group', tr(r.adg || r.s1, 24));
                cardBody += kv('Placement', tr(r.plc || r.s2, 24));
                cardBody += kv('Creative', tr(r.s4, 24));
            } else if (r.t === 'v') {
                cardBody += kv('Type', r.vt);
                cardBody += kv('Source', r.src);
                cardBody += kv('Campaign', tr(r.cmp, 28));
                const payout = (r.pay != null && r.pay !== '') ? `$${Number(r.pay).toFixed(2)}` : '';
                cardBody += kv('Payout', payout);
                cardBody += kv('Creative', tr(r.s4, 24));
            } else {
                const stBadge = r.st === 'FULFILLED' ? 'badge-green' : r.st === 'PENDING' ? 'badge-orange' : 'badge-grey';
                const value = (r.pr != null && r.pr !== '') ? `$${Number(r.pr).toFixed(2)}` : '';
                const oidLink = r.oid ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToOrder('${r.oid}')">#${r.oid}</a>` : '';
                cardBody += `<div class="route-cell-kv">${oidLink}</div>`;
                cardBody += kv('Value', value);
                cardBody += `<div class="route-cell-kv"><span class="badge ${stBadge}">${r.st || 'N/A'}</span></div>`;
                cardBody += kv('Campaign', tr(r.rcmp || r.cmp, 28));
                if (r.nm) {
                    const custClick = r.cid ? `event.stopPropagation();D.navigateToCustomer('${r.cid}')` : '';
                    cardBody += `<div class="route-cell-kv"><span class="kv-label">Customer</span><a class="xlink" onclick="${custClick}">${tr(r.nm, 20)}</a></div>`;
                }
            }

            const devParts = [r.dev, r.os].filter(Boolean);
            const locParts = [r.ci, r.co].filter(Boolean);
            let contextChips = '';
            if (devParts.length || locParts.length || r.br) {
                contextChips = '<div class="route-cell-context">';
                if (devParts.length) contextChips += `<span>${devParts.join(' · ')}</span>`;
                if (r.br) contextChips += `<span>${r.br}</span>`;
                if (locParts.length) contextChips += `<span>${locParts.join(', ')}</span>`;
                contextChips += '</div>';
            }

            const onclick = `event.stopPropagation();D.showTouchpoint('${fp}',${tpIndex})`;
            newHtml += `<div class="route-cell ${type}" onclick="${onclick}">
                <div class="route-cell-type ${type}">${typeLabel}</div>
                ${cardBody}
                ${contextChips}
                <div class="route-cell-date">${this.fmtDate(r.dt)}</div>
            </div>`;
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
        const journey = this.journeys.find(j=>j.fp===fp);
        if(!journey) return;
        const touchpoints = [...journey.rows].sort((a,b)=>this.compareDates(a.dt, b.dt));

        let html = `<div class="detail-title">Journey Path</div>`;
        html += `<div style="color:var(--text-dim); font-size:12px; margin-bottom:4px;">Fingerprint: <a class="xlink" onclick="D.navigateToFingerprint('${fp}')" style="font-size:12px;">${fp}</a></div>`;
        if(journey.custName || journey.custEmail) {
            const custClick = journey.custId ? `D.navigateToCustomer('${journey.custId}')` : '';
            html += `<div style="font-size:12px; margin-bottom:4px;">Customer: <a class="xlink" onclick="${custClick}">${journey.custName||journey.custEmail}</a></div>`;
        }
        html += `<div style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">${journey.count} touchpoints &middot; ${this.fmtDate(journey.firstDate)} → ${this.fmtDate(journey.lastDate)}${journey.revenue ? ' &middot; Revenue: <strong>$'+journey.revenue.toFixed(2)+'</strong>' : ''}</div>`;
        html += this.renderTouchpointTable(fp, touchpoints);
        document.getElementById('detail-content').innerHTML = html;
        makePanelResizable();
        document.getElementById('overlay').classList.add('open');
    }

    // Side panel: shows all non-empty fields for one specific touchpoint
    showTouchpoint(fp, index) {
        const journey = this.journeys.find(j=>j.fp===fp);
        if(!journey) return;
        const touchpoints = [...journey.rows].sort((a,b)=>this.compareDates(a.dt, b.dt));
        const r = touchpoints[index];
        if(!r) return;

        const type = r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order';
        const typeBadgeClass = type === 'click' ? 'badge-blue' : type === 'conv' ? 'badge-orange' : 'badge-green';
        const typeLabel = type === 'click' ? 'CLICK' : type === 'conv' ? 'CONVERSION' : 'ORDER';

        const isNonEmpty = (v) => {
            if(v === undefined || v === null) return false;
            if(Array.isArray(v)) return v.length > 0 && !(v.length === 1 && String(v[0]) === '[]');
            if(typeof v === 'string') { const s = v.trim(); return !!s && s !== '[]'; }
            if(typeof v === 'number') return true;
            if(typeof v === 'object') return Object.keys(v).length > 0;
            return String(v).trim() !== '' && String(v).trim() !== '[]';
        };

        const xlinkFields = {
            fp: (v) => `<a class="xlink" onclick="D.navigateToFingerprint('${v}')">${v}</a>`,
            oid: (v) => `<a class="xlink" onclick="D.navigateToOrder('${v}')">#${v}</a>`,
            nm: (v) => r.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${r.cid}')">${v}</a>` : v,
            em: (v) => r.cid ? `<a class="xlink" onclick="D.navigateToCustomer('${r.cid}')">${v}</a>` : v,
            cid: (v) => `<a class="xlink" onclick="D.navigateToCustomer('${v}')">${v}</a>`,
        };

        let dlHtml = '';
        Object.keys(r).forEach(k => {
            const v = r[k];
            if(!isNonEmpty(v)) return;
            if(!this.isFieldVisible(k)) return;
            let disp = v;
            if(typeof v === 'object') disp = JSON.stringify(v);
            if(xlinkFields[k]) disp = xlinkFields[k](v);
            const label = Dashboard.LABEL_MAP[k] || k;
            dlHtml += `<dt>${label}</dt><dd>${disp}</dd>`;
        });

        if(!dlHtml) dlHtml = '<dt style="color:var(--text-dim)">All fields hidden</dt><dd><a class="xlink" onclick="D.showTpFieldConfigurator(\'${fp}\',${index})">Configure fields →</a></dd>';

        const hiddenCount = [...this.tpHiddenFields].filter(k => r[k] !== undefined).length;
        const hiddenBadge = hiddenCount > 0
            ? `<span style="background:#fef3c7;color:#92400e;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;margin-left:6px;">${hiddenCount} hidden</span>`
            : '';

        let html = `<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;">
            <span class="badge ${typeBadgeClass}">${typeLabel}</span>
            <span style="color:var(--text-dim);font-weight:700;">${this.fmtDate(r.dt)}</span>
        </div>`;
        html += `<div class="cust-card"><h4>Touchpoint data</h4><dl class="cust-grid">${dlHtml}</dl></div>`;
        html += `<button onclick="D.showTpFieldConfigurator('${fp}',${index})" style="margin-top:14px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border:1px dashed #c7d2fe;border-radius:8px;background:#eef2ff;color:#4338ca;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
            ⚙ Configure visible fields${hiddenBadge}
        </button>`;

        document.getElementById('detail-content').innerHTML = html;
        makePanelResizable();
        document.getElementById('overlay').classList.add('open');
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

        const mkItem = (k, inRecord) => {
            const label = Dashboard.LABEL_MAP[k] || k;
            const checked = this.isFieldVisible(k) ? 'checked' : '';
            const dimStyle = inRecord ? '' : 'opacity:0.45;';
            const title = inRecord ? '' : `title="No value in this touchpoint"`;
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
            if(keys.length) groups.push({ label: g.label, keys });
        });

        // Anything left that didn't match any group
        const otherKeys = [...allKeys].filter(k => !assignedKeys.has(k)).sort();
        if(otherKeys.length) groups.push({ label: 'Other', keys: otherKeys });

        let groupsHtml = '';
        groups.forEach(g => {
            const itemsHtml = g.keys.map(k => mkItem(k, presentInRecord.has(k))).join('');
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

        document.getElementById('detail-content').innerHTML = html;
        document.getElementById('overlay').classList.add('open');
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
            const stBadge = o.st === 'FULFILLED' ? 'badge-green' : o.st === 'PENDING' ? 'badge-orange' : 'badge-grey';
            const oidLink = `<a class="xlink" onclick="event.stopPropagation();D.navigateToOrder('${o.oid}')">#${o.oid}</a>`;
            html += `<tr style="cursor:pointer;" onclick="D.showOrder('${o.oid}')">
                <td>${i + 1}</td>
                <td>${oidLink}</td>
                <td style="white-space:nowrap;">${this.fmtDate(o.dt)}</td>
                <td><strong>$${(o.pr || 0).toFixed(2)}</strong></td>
                <td><span class="badge ${stBadge}">${o.st || 'N/A'}</span></td>
                <td>${o.rcmp || ''}</td>
                <td>${o.fsrc || ''}</td>
                <td>${o.lsrc || ''}</td>
                <td>${o.app || ''}</td>
                <td>${o.ci || ''}</td>
                <td>${o.co || ''}</td>
                <td>${o.cur || ''}</td>
            </tr>`;
        });
        return html;
    }

    // Renders <tbody> rows for the customer touchpoints table (used by showCustomer + date sort toggle)
    _renderCustomerTouchpointsBody(allTouchpoints, sortDir) {
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
        let html = '';
        sorted.forEach((r, i) => {
            const type = r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order';
            const typeBadge = r.t === 'c' ? '<span class="badge badge-blue">CLICK</span>'
                : r.t === 'v' ? '<span class="badge badge-orange">CONV</span>'
                : '<span class="badge badge-green">ORDER</span>';
            const ip = r.click_ip || r.conversion_ip || r.order_ip || r.ip || '';
            const payout = r.t === 'v' && r.pay != null && r.pay !== '' ? `$${Number(r.pay).toFixed(2)}` : '';
            const value = r.t === 'o' && r.pr != null && r.pr !== '' ? `$${Number(r.pr).toFixed(2)}` : '';
            const stBadge = r.t === 'o' ? (() => { const b = r.st === 'FULFILLED' ? 'badge-green' : r.st === 'PENDING' ? 'badge-orange' : 'badge-grey'; return `<span class="badge ${b}">${r.st || 'N/A'}</span>`; })() : '';
            const source = r.src || r.fsrc || '';
            const campaign = r.t === 'o' ? (r.rcmp || r.cmp || '') : (r.cmp || '');
            const adGroup = r.adg || r.s1 || '';
            const oidLink = r.oid ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToOrder('${r.oid}')">#${r.oid}</a>` : '';
            const fpLink = r._fp ? `<a class="xlink" onclick="event.stopPropagation();D.showJourneyPathsTable('${r._fp}')" style="font-size:11px;">${r._fp.substring(0, 10)}…</a>` : '';
            html += `<tr class="${type}" style="cursor:pointer;" onclick="D.showTouchpoint('${r._fp}',${r._fpIdx})">
                <td>${i + 1}</td><td>${typeBadge}</td><td>${r.vt || ''}</td><td style="white-space:nowrap;">${this.fmtDate(r.dt)}</td>
                <td>${fpLink}</td>
                <td>${source}</td><td>${campaign}</td><td>${adGroup}</td>
                <td>${r.s4 || ''}</td>
                <td>${r.dev || ''}</td><td>${r.br || ''}</td><td>${r.os || ''}</td>
                <td>${r.co || ''}</td><td>${r.ci || ''}</td><td>${ip}</td>
                <td>${oidLink}</td><td>${r.nm || ''}</td>
                <td>${payout}</td><td>${value}</td><td>${stBadge}</td>
            </tr>`;
        });
        return html;
    }

    // Side panel: customer profile + orders table + all touchpoints across all fingerprints
    showCustomer(cid) {
        const cust = this.customers.find(c=>c.cid===cid);
        if(!cust) return;

        let html = `<div class="detail-title">${cust.nm}</div>`;
        // Profile
        html += '<div class="cust-card"><h4>Profile</h4><dl class="cust-grid">';
        html += this.dlRow('Email',cust.em);
        html += this.dlRow('Customer ID',cust.cid);
        html += this.dlRow('Total Orders',cust.orderCount);
        html += this.dlRow('Total Revenue','$'+cust.revenue.toFixed(2));
        html += this.dlRow('Journey Paths',cust.fpCount);
        html += this.dlRow('Total Touchpoints',cust.touchpoints);
        html += this.dlRow('First Seen',this.fmtDate(cust.firstSeen));
        html += this.dlRow('Last Seen',this.fmtDate(cust.lastSeen));
        html += '</dl></div>';

        // Orders table
        html += `<div class="detail-sub">Orders (${cust.orders.length})</div>`;
        html += `<div style="overflow-x:auto;">
            <table class="tp-table">
                <thead>
                    <tr>
                        <th>#</th><th>Order ID</th><th style="cursor:pointer;" id="cust-orders-date-th" class="sort-asc">Date ↑</th><th>Value</th><th>Status</th>
                        <th>Campaign</th><th>First Source</th><th>Last Source</th>
                        <th>App</th><th>City</th><th>Country</th><th>Currency</th>
                    </tr>
                </thead>
                <tbody>`;
        html += this._renderCustomerOrdersBody(cust.orders, 'asc');
        html += `</tbody></table></div>`;

        html += '<div class="detail-sub">Full Journey — All Touchpoints</div>';

        const allTp = [];
        cust.fps.forEach(fp => {
            const tp = this.raw.filter(r => r.fp === fp);
            tp.forEach(r => allTp.push({ ...r, _fp: fp }));
        });

        html += `<div style="overflow-x:auto;">
            <table class="tp-table">
                <thead>
                    <tr>
                        <th>#</th><th>Type</th><th>Conv. Type</th><th style="cursor:pointer;" id="cust-tp-date-th" class="sort-asc">Date ↑</th><th>Fingerprint</th><th>Source</th><th>Campaign</th>
                        <th>Ad Group</th><th>Creative</th><th>Device</th><th>Browser</th><th>OS</th>
                        <th>Country</th><th>City</th><th>IP</th>
                        <th>Order</th><th>Customer</th><th>Payout</th><th>Value</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>`;
        html += this._renderCustomerTouchpointsBody(allTp, 'asc');
        html += '</tbody></table></div>';

        document.getElementById('detail-content').innerHTML = html;
        makePanelResizable();
        document.getElementById('overlay').classList.add('open');

        // Orders date sort toggle
        const ordersDateTh = document.getElementById('cust-orders-date-th');
        const ordersTbody = ordersDateTh ? ordersDateTh.closest('table').querySelector('tbody') : null;
        let ordersSortDir = 'asc';
        if (ordersDateTh && ordersTbody) {
            ordersDateTh.addEventListener('click', () => {
                ordersSortDir = ordersSortDir === 'asc' ? 'desc' : 'asc';
                ordersDateTh.textContent = ordersSortDir === 'asc' ? 'Date ↑' : 'Date ↓';
                ordersDateTh.className = ordersSortDir === 'asc' ? 'sort-asc' : 'sort-desc';
                ordersTbody.innerHTML = this._renderCustomerOrdersBody(cust.orders, ordersSortDir);
            });
        }

        // Touchpoints date sort toggle
        const tpDateTh = document.getElementById('cust-tp-date-th');
        const tpTbody = tpDateTh ? tpDateTh.closest('table').querySelector('tbody') : null;
        let tpSortDir = 'asc';
        if (tpDateTh && tpTbody) {
            tpDateTh.addEventListener('click', () => {
                tpSortDir = tpSortDir === 'asc' ? 'desc' : 'asc';
                tpDateTh.textContent = tpSortDir === 'asc' ? 'Date ↑' : 'Date ↓';
                tpDateTh.className = tpSortDir === 'asc' ? 'sort-asc' : 'sort-desc';
                tpTbody.innerHTML = this._renderCustomerTouchpointsBody(allTp, tpSortDir);
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

    // Rebuilds the filter rows UI for the current tab
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

        let html = '';
        filters.forEach((f, i) => {
            const fieldDef = fields.find(fd => fd.key === f.field) || fields[0];
            const operators = FILTER_OPERATORS[fieldDef.type] || [];

            html += '<div class="tab-filter-row">';
            html += '<select class="tf-field" onchange="D.updateTabFilter(' + i + ',\'field\',this.value)">';
            fields.forEach(fd => {
                html += '<option value="' + fd.key + '"' + (fd.key === f.field ? ' selected' : '') + '>' + fd.label + '</option>';
            });
            html += '</select>';

            html += '<select class="tf-operator" onchange="D.updateTabFilter(' + i + ',\'operator\',this.value)">';
            operators.forEach(op => {
                html += '<option value="' + op.key + '"' + (op.key === f.operator ? ' selected' : '') + '>' + op.label + '</option>';
            });
            html += '</select>';

            if (fieldDef.type === 'select') {
                const uniqueVals = this._getUniqueFilterValues(tab, fieldDef);
                html += '<select class="tf-value" onchange="D.updateTabFilter(' + i + ',\'value\',this.value)">';
                html += '<option value="">— select —</option>';
                uniqueVals.forEach(v => {
                    const escaped = String(v).replace(/"/g, '&quot;');
                    html += '<option value="' + escaped + '"' + (v === f.value ? ' selected' : '') + '>' + v + '</option>';
                });
                html += '</select>';
            } else if (fieldDef.type === 'bool') {
                html += '<select class="tf-value" onchange="D.updateTabFilter(' + i + ',\'value\',this.value)">';
                html += '<option value="">— select —</option>';
                html += '<option value="yes"' + (f.value === 'yes' ? ' selected' : '') + '>Yes</option>';
                html += '<option value="no"' + (f.value === 'no' ? ' selected' : '') + '>No</option>';
                html += '</select>';
            } else if (fieldDef.type === 'number' && f.operator === 'between') {
                const parts = (f.value || '').split(',');
                html += '<input type="number" class="tf-value" placeholder="min" value="' + (parts[0] || '') + '" onchange="D.updateTabFilterRange(' + i + ',0,this.value)">';
                html += '<span style="color:var(--text-dim);font-size:12px;">and</span>';
                html += '<input type="number" class="tf-value" placeholder="max" value="' + (parts[1] || '') + '" onchange="D.updateTabFilterRange(' + i + ',1,this.value)">';
            } else if (fieldDef.type === 'number') {
                html += '<input type="number" class="tf-value" placeholder="value" value="' + (f.value || '') + '" onchange="D.updateTabFilter(' + i + ',\'value\',this.value)">';
            } else {
                html += '<input type="text" class="tf-value" placeholder="type to filter..." value="' + (f.value || '').replace(/"/g, '&quot;') + '" oninput="D.updateTabFilter(' + i + ',\'value\',this.value)">';
            }

            html += '<button class="btn-remove-filter" onclick="D.removeTabFilter(' + i + ')" title="Remove filter">×</button>';
            html += '</div>';
        });

        container.innerHTML = html;
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
        document.getElementById('tc-route').textContent = '(' + routeData.length + ')';
        document.getElementById('tc-orders').textContent = '(' + ordersData.length + ')';
        document.getElementById('tc-customers').textContent = '(' + custData.length + ')';
    }

    // Switches attribution view between source and campaign
    setAttrView(view) {
        this._attrView = view;
        document.getElementById('btn-attr-source').classList.toggle('active', view === 'source');
        document.getElementById('btn-attr-campaign').classList.toggle('active', view === 'campaign');
        this.renderAttribution();
    }

    // Sorts the attribution table by the given column
    sortAttrTable(col) {
        this._attrSortAsc = this._attrSortCol === col ? !this._attrSortAsc : false;
        this._attrSortCol = col;
        this.renderAttribution();
    }

    // First-touch / last-touch / linear attribution analysis table
    renderAttribution() {
        const thead = document.getElementById('attr-thead');
        const tbody = document.getElementById('attr-tbody');
        const summary = document.getElementById('attr-summary');
        if (!thead || !tbody) return;

        const field = this._attrView === 'source' ? 'src' : 'cmp';
        const label = this._attrView === 'source' ? 'Source' : 'Campaign';

        const fpMap = {};
        this.filtered.forEach(r => {
            if (!r.fp) return;
            if (!fpMap[r.fp]) fpMap[r.fp] = [];
            fpMap[r.fp].push(r);
        });

        const attrData = {};
        let totalConverting = 0;

        Object.values(fpMap).forEach(records => {
            const orders = records.filter(r => r.t === 'o');
            if (!orders.length) return;
            const clicks = records.filter(r => r.t === 'c').sort((a, b) => new Date(a.dt) - new Date(b.dt));
            if (!clicks.length) return;
            totalConverting++;

            const totalRev = orders.reduce((s, o) => s + (parseFloat(o.pr) || 0), 0);
            const firstKey = clicks[0][field] || 'Unknown';
            const lastKey = clicks[clicks.length - 1][field] || 'Unknown';

            const uniqueKeys = [...new Set(clicks.map(c => c[field] || 'Unknown'))];
            const linearShare = 1 / uniqueKeys.length;
            const linearRevShare = totalRev / uniqueKeys.length;

            [firstKey, lastKey, ...uniqueKeys].forEach(k => {
                if (!attrData[k]) attrData[k] = { ft: 0, lt: 0, linear: 0, revFt: 0, revLt: 0, revLn: 0 };
            });

            attrData[firstKey].ft += 1;
            attrData[firstKey].revFt += totalRev;
            attrData[lastKey].lt += 1;
            attrData[lastKey].revLt += totalRev;
            uniqueKeys.forEach(k => {
                attrData[k].linear += linearShare;
                attrData[k].revLn += linearRevShare;
            });
        });

        const sortCol = this._attrSortCol || 'ft';
        const sortAsc = this._attrSortAsc || false;
        const sorted = Object.entries(attrData).sort((a, b) => {
            let va, vb;
            if (sortCol === 'name') { va = a[0].toLowerCase(); vb = b[0].toLowerCase(); return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va); }
            va = a[1][sortCol] || 0; vb = b[1][sortCol] || 0;
            return sortAsc ? va - vb : vb - va;
        });
        const maxFt = sorted.length ? Math.max(...sorted.map(([, v]) => v.ft)) : 1;
        const maxLt = sorted.length ? Math.max(...sorted.map(([, v]) => v.lt)) : 1;
        const maxLn = sorted.length ? Math.max(...sorted.map(([, v]) => v.linear)) : 1;

        const arrow = col => {
            if (sortCol !== col) return '';
            return sortAsc ? ' ↑' : ' ↓';
        };
        thead.innerHTML = '<tr>' +
            '<th onclick="D.sortAttrTable(\'name\')">' + label + arrow('name') + '</th>' +
            '<th onclick="D.sortAttrTable(\'ft\')">First Touch' + arrow('ft') + '</th>' +
            '<th onclick="D.sortAttrTable(\'lt\')">Last Touch' + arrow('lt') + '</th>' +
            '<th onclick="D.sortAttrTable(\'linear\')">Linear' + arrow('linear') + '</th>' +
            '<th onclick="D.sortAttrTable(\'revFt\')">Rev (FT)' + arrow('revFt') + '</th>' +
            '<th onclick="D.sortAttrTable(\'revLt\')">Rev (LT)' + arrow('revLt') + '</th>' +
            '<th onclick="D.sortAttrTable(\'revLn\')">Rev (Linear)' + arrow('revLn') + '</th>' +
            '</tr>';

        const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0);
        const fmtRev = n => '$' + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toFixed(0));
        const barHtml = (val, max, cls) => {
            const pxWidth = max > 0 ? Math.round((val / max) * 80) : 0;
            return '<div class="attr-bar ' + cls + '" style="width:' + Math.max(pxWidth, 2) + 'px"></div>';
        };

        let html = '';
        sorted.forEach(([name, d]) => {
            html += '<tr>' +
                '<td class="attr-name-cell" title="' + name + '">' + name + '</td>' +
                '<td>' + barHtml(d.ft, maxFt, 'attr-bar-ft') + ' ' + fmt(d.ft) + '</td>' +
                '<td>' + barHtml(d.lt, maxLt, 'attr-bar-lt') + ' ' + fmt(d.lt) + '</td>' +
                '<td>' + barHtml(d.linear, maxLn, 'attr-bar-ln') + ' ' + d.linear.toFixed(1) + '</td>' +
                '<td>' + fmtRev(d.revFt) + '</td>' +
                '<td>' + fmtRev(d.revLt) + '</td>' +
                '<td>' + fmtRev(d.revLn) + '</td>' +
                '</tr>';
        });
        tbody.innerHTML = html;

        const tcEl = document.getElementById('tc-attribution');
        if (tcEl) tcEl.textContent = ' (' + sorted.length + ')';
        if (summary) {
            summary.textContent = totalConverting + ' converting journeys analyzed across ' + sorted.length + ' ' + label.toLowerCase() + 's';
        }

        const table = document.getElementById('attr-table');
        if (table) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    autoFitColumns(table);
                    makeResizable(table);
                    addColumnHighlight(table);
                });
            });
        }
    }

    // Compact touchpoint table shared by order detail and journey path panels
    renderTouchpointTable(fp, touchpoints) {
        let html = `<div style="overflow-x:auto;">
            <table class="tp-table">
                <thead><tr>
                    <th>#</th><th>Type</th><th>Conv. Type</th><th>Date</th><th>Source</th><th>Campaign</th>
                    <th>Ad Group</th><th>Creative</th><th>Sub5</th><th>Sub6</th><th>Device</th><th>Browser</th><th>OS</th>
                    <th>Country</th><th>City</th><th>IP</th>
                    <th>Order</th><th>Customer</th><th>Payout</th><th>Value</th><th>Status</th>
                </tr></thead><tbody>`;

        touchpoints.forEach((r, i) => {
            const type = r.t === 'c' ? 'click' : r.t === 'v' ? 'conv' : 'order';
            const typeBadge = r.t === 'c' ? '<span class="badge badge-blue">CLICK</span>'
                : r.t === 'v' ? '<span class="badge badge-orange">CONV</span>'
                : '<span class="badge badge-green">ORDER</span>';
            const ip = r.click_ip || r.conversion_ip || r.order_ip || r.ip || '';
            const payout = r.t === 'v' && r.pay != null && r.pay !== '' ? `$${Number(r.pay).toFixed(2)}` : '';
            const value = r.t === 'o' && r.pr != null && r.pr !== '' ? `$${Number(r.pr).toFixed(2)}` : '';
            const stBadge = r.t === 'o' ? (() => { const b = r.st === 'FULFILLED' ? 'badge-green' : r.st === 'PENDING' ? 'badge-orange' : 'badge-grey'; return `<span class="badge ${b}">${r.st || 'N/A'}</span>`; })() : '';
            const source = r.src || r.fsrc || '';
            const campaign = r.t === 'o' ? (r.rcmp || r.cmp || '') : (r.cmp || '');
            const adGroup = r.adg || r.s1 || '';
            const oidLink = r.oid ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToOrder('${r.oid}')">#${r.oid}</a>` : '';
            const custLink = r.nm ? (r.cid ? `<a class="xlink" onclick="event.stopPropagation();D.navigateToCustomer('${r.cid}')">${r.nm}</a>` : r.nm) : '';

            html += `<tr class="${type}" style="cursor:pointer;" onclick="D.showTouchpoint('${fp}',${i})">
                <td>${i + 1}</td><td>${typeBadge}</td><td>${r.vt || ''}</td><td style="white-space:nowrap;">${this.fmtDate(r.dt)}</td>
                <td>${source}</td><td>${campaign}</td><td>${adGroup}</td>
                <td>${r.s4 || ''}</td><td>${r.s5 || ''}</td><td>${r.s6 || ''}</td>
                <td>${r.dev || ''}</td><td>${r.br || ''}</td><td>${r.os || ''}</td>
                <td>${r.co || ''}</td><td>${r.ci || ''}</td><td>${ip}</td>
                <td>${oidLink}</td><td>${custLink}</td>
                <td>${payout}</td><td>${value}</td><td>${stBadge}</td>
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
        // DD/MM/YYYY HH:MM or DD/MM/YYYY
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{2}):(\d{2}))?/);
        if(m) {
            dt = new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0));
            if(!isNaN(dt) && dt.getFullYear() >= 2000) return dt;
        }
        // YYYY-MM-DD HH:MM:SS or YYYY-MM-DDTHH:MM:SS
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if(m) {
            dt = new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0), +(m[6]||0));
            if(!isNaN(dt) && dt.getFullYear() >= 2000) return dt;
        }
        // MM/DD/YYYY HH:MM
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T ](\d{2}):(\d{2}))?/);
        if(m) {
            dt = new Date(+m[3], +m[1]-1, +m[2], +(m[4]||0), +(m[5]||0));
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

    // Formats date as "DD/MM/YYYY HH:MM"
    fmtDate(d) {
        if(!d) return '';
        const dt = this.parseDate(d);
        if(!dt) return String(d);
        const dd = String(dt.getDate()).padStart(2,'0');
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const yy = dt.getFullYear();
        const hh = String(dt.getHours()).padStart(2,'0');
        const mi = String(dt.getMinutes()).padStart(2,'0');
        return `${dd}/${mm}/${yy} ${hh}:${mi}`;
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

    // Cross-link: closes current panel, opens journey path table for a fingerprint
    navigateToFingerprint(fp) {
        this.closeDetail();
        this.showJourneyPathsTable(fp);
    }

    // Cross-link: closes current panel, switches to Orders tab, opens order detail
    navigateToOrder(oid) {
        this.closeDetail();
        this.switchTab('orders');
        setTimeout(() => {
            const order = this.fOrders.find(o=>String(o.oid)===String(oid));
            if(order) this.showOrder(oid);
        }, 100);
    }

    // Cross-link: closes current panel, switches to Customers tab, opens customer detail
    navigateToCustomer(cid) {
        this.closeDetail();
        this.switchTab('customers');
        setTimeout(() => {
            const cust = this.customers.find(c=>c.cid===cid);
            if(cust) this.showCustomer(cid);
        }, 100);
    }

    // Closes the side panel overlay
    closeDetail() {
        document.getElementById('overlay').classList.remove('open');
    }
}


// Measures natural column widths (clamped 50–400px), then applies fixed-width layout
function autoFitColumns(tableEl) {
    if(!tableEl || !tableEl.querySelector('thead')) return;
    const ths = Array.from(tableEl.querySelectorAll('thead th'));
    if(!ths.length) return;
    const allTds = Array.from(tableEl.querySelectorAll('tbody td'));
    if(!allTds.length) return;

    allTds.forEach(td => td.style.maxWidth = 'none');

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

    allTds.forEach((td, i) => {
        const colIndex = i % ths.length;
        td.style.maxWidth = naturalWidths[colIndex] + 'px';
    });
}

// Highlights all cells in a column when hovering its header
function addColumnHighlight(tableEl) {
    if (!tableEl || !tableEl.querySelector('thead')) return;
    const ths = Array.from(tableEl.querySelectorAll('thead th'));

    ths.forEach((th, colIndex) => {
        th.addEventListener('mouseenter', () => {
            const rows = tableEl.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const td = row.children[colIndex];
                if (td) td.classList.add('col-highlight');
            });
        });
        th.addEventListener('mouseleave', () => {
            const rows = tableEl.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const td = row.children[colIndex];
                if (td) td.classList.remove('col-highlight');
            });
        });
    });
}

// Adds drag handles to table column headers for manual resize (+ double-click to auto-fit)
function makeResizable(tableEl) {
    if(!tableEl) return;
    tableEl.querySelectorAll('.col-rz').forEach(h => h.remove());

    const ths = Array.from(tableEl.querySelectorAll('thead th'));

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

            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const onMove = ev => {
                th.style.width = Math.max(40, startW + ev.clientX - startX) + 'px';
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

// Auto-fits columns + adds resize handles to all tables inside the detail side panel
function makePanelResizable() {
    const el = document.getElementById('detail-content');
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
    addTabFilter: () => {},
    updateTabFilter: () => {},
    updateTabFilterRange: () => {},
    removeTabFilter: () => {},
    _renderCustomerOrdersBody: () => '',
    _renderCustomerTouchpointsBody: () => '',
    toggleFunnelPanel: () => {},
    renderFunnel: () => {},
    setAttrView: () => {},
    renderAttribution: () => {},
    sortAttrTable: () => {},
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
