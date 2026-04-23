(function(){
/* WEEM Customer Journey Dashboard — interactive prototype */

const JOURNEYS = window.DATA.JOURNEYS;
const fmtDate = window.DATA.fmtDate;

// ---- State ----
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showFunnel": false,
  "showLogo": true,
  "density": "comfortable",
  "primaryColor": "#007892",
  "datePickerStyle": "pill"
}/*EDITMODE-END*/;

let state = {
  tab: localStorage.getItem('weem.tab') || 'paths',
  theme: localStorage.getItem('weem.theme') || 'light',
  sort: 'lastDate',
  detail: null, // { type:'journey', fp } | { type:'customer', cid } | ...
  stop1: 'source',
  stop2: null,
  stop3: null,
  expandedStops: new Set(),
  filters: [
    { field: 'firstSource', op: 'eq', value: 'Any' },
  ],
  funnelOpen: TWEAK_DEFAULTS.showFunnel,
  tweaksOpen: false,
  tweaks: { ...TWEAK_DEFAULTS },
  dateFrom: '04/01/2026',
  dateTo: '04/21/2026',
};

// ---- Helpers ----
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function sourceClass(src) {
  if (!src) return 'unknown';
  const s = src.toLowerCase();
  if (s.includes('face')) return 'facebook';
  if (s.includes('goog')) return 'google';
  if (s.includes('tik')) return 'tiktok';
  if (s.includes('organic')) return 'organic';
  if (s.includes('direct')) return 'direct';
  if (s.includes('mail')) return 'email';
  if (s.includes('bing')) return 'bing';
  return 'unknown';
}

function moneyFmt(n) {
  if (!n) return '$0';
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isSubscription(r) { return r.t === 'o' && r.app === 'Recharge Subscriptions'; }
function isSubscriptionAction(r) { return r.t === 'v' && (r.vt === 'Recurring' || r.vt === 'Shipping'); }

function classifyTouchpoint(r, firstOrderTs) {
  if (!firstOrderTs) return 'post';
  const ts = r.dt.getTime();
  if (r.t === 'o' && ts === firstOrderTs) return 'first';
  if (ts < firstOrderTs) return 'pre';
  return 'post';
}

// ---- Render root ----
function renderApp() {
  document.body.innerHTML = `
    <div class="app">
      ${renderHeader()}
      ${renderTabs()}
      ${renderFilterBar()}
      ${state.funnelOpen ? renderFunnel() : ''}
      <div class="dash" id="dash">
        ${renderDashContent()}
      </div>
    </div>
    <div id="backdrop" class="${state.detail ? 'open' : ''}"></div>
    <div id="detail-container" class="${state.detail ? 'open' : ''}">
      ${state.detail ? renderDetail() : ''}
    </div>
    ${renderTweaks()}
    <div id="stop-popup-portal"></div>
  `;
  bind();
}

function renderHeader() {
  return `
  <header class="mgmt">
    <div class="brand">
      <div class="brand-logo">W</div>
      <div>WEEM <span class="brand-sub">Customer Journey</span></div>
    </div>
    <div class="mgmt-fields">
      ${renderDateRangeTrigger()}
      <div class="mgmt-field" style="flex:1;">
        <label>Search</label>
        <input class="mgmt-input search" placeholder="email, IP, fingerprint, order ID…" />
      </div>
    </div>
    <div class="mgmt-actions">
      <button class="theme-toggle" data-action="toggle-theme" title="Toggle dark mode" aria-label="Toggle dark mode">
        <svg class="theme-icon theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
        <svg class="theme-icon theme-icon-dark" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
        </svg>
      </button>
      <div class="user-chip">
        <div class="avatar">AN</div>
        Andrii
      </div>
    </div>
  </header>`;
}

// ================= Date Range Picker integration =================
function renderDateRangeTrigger() {
  const style = state.tweaks.datePickerStyle || 'pill';
  const from = state.dateFrom;
  const to = state.dateTo;
  const icon = `<svg class="dr-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5 L13.5 6.5 M5 2 L5 5 M11 2 L11 5"/></svg>`;
  const caret = `<svg class="dr-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  if (style === 'split') {
    return `
      <div class="mgmt-field">
        <label>From</label>
        <button type="button" class="dr-split-input" id="dr-trigger-from" data-dr-side="from">
          ${icon}
          <span>${esc(from)}</span>
          ${caret}
        </button>
      </div>
      <div class="mgmt-field">
        <label>To</label>
        <button type="button" class="dr-split-input" id="dr-trigger-to" data-dr-side="to">
          ${icon}
          <span>${esc(to)}</span>
          ${caret}
        </button>
      </div>`;
  }

  // Default: pill
  return `
    <div class="mgmt-field">
      <label>Date range</label>
      <button type="button" class="dr-pill" id="dr-trigger-pill">
        ${icon}
        <span>${esc(from)}</span>
        <span class="dr-sep">→</span>
        <span>${esc(to)}</span>
        ${caret}
      </button>
    </div>`;
}

function bindDateRangeTrigger() {
  if (!window.WeemDatePicker) return;
  const pill = document.getElementById('dr-trigger-pill');
  const fromBtn = document.getElementById('dr-trigger-from');
  const toBtn = document.getElementById('dr-trigger-to');

  const openFor = (anchor, focus) => {
    const fromD = window.WeemDatePicker.parse(state.dateFrom) || new Date();
    const toD   = window.WeemDatePicker.parse(state.dateTo) || fromD;
    const toggleOpen = (on) => {
      if (pill) pill.classList.toggle('open', on);
      if (fromBtn) fromBtn.classList.toggle('active', on && focus === 'from');
      if (toBtn)   toBtn.classList.toggle('active', on && focus === 'to');
    };
    toggleOpen(true);
    window.WeemDatePicker.open({
      anchor,
      extraAnchors: [pill, fromBtn, toBtn].filter(Boolean),
      from: fromD,
      to: toD,
      focus,
      today: new Date(2026, 3, 21), // lock "today" to match the demo data window
      onApply: (f, t) => {
        state.dateFrom = window.WeemDatePicker.format(f);
        state.dateTo = window.WeemDatePicker.format(t);
        const btn = document.querySelector('[data-action="apply-filters"]');
        if (btn) btn.classList.add('pending');
        renderApp();
      },
      onClose: () => toggleOpen(false),
    });
  };

  if (pill) pill.addEventListener('click', () => openFor(pill, 'from'));
  if (fromBtn) fromBtn.addEventListener('click', () => openFor(fromBtn, 'from'));
  if (toBtn)   toBtn.addEventListener('click',   () => openFor(toBtn, 'to'));
}

function renderTabs() {
  const counts = {
    paths: JOURNEYS.length,
    orders: JOURNEYS.reduce((s,j) => s + j.orders, 0),
    customers: new Set(JOURNEYS.filter(j => j.cid).map(j => j.cid)).size,
    stops: JOURNEYS.length,
  };
  const tab = (id, label, count) => `
    <button class="tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">
      ${label} <span class="count">${count.toLocaleString()}</span>
    </button>`;
  return `
  <div class="tabs-wrap">
    ${tab('stops', 'Path Stops', counts.stops)}
    ${tab('paths', 'Journey Paths', counts.paths)}
    ${tab('orders', 'Orders', counts.orders)}
    ${tab('customers', 'Customers', counts.customers)}
    <div class="tabs-right">
      <button class="btn btn-ghost" data-action="toggle-funnel">
        ${state.funnelOpen ? '▾ Hide' : '▸ Show'} Conversion Funnel
      </button>
    </div>
  </div>`;
}

function renderFilterBar() {
  const FIELDS = [
    ['firstSource','First Source'],
    ['subsequentSource','Subsequent Source'],
    ['cmp','Ad Campaign'],
    ['rcmp','Ref. Campaign'],
    ['dev','Device'],
    ['co','State'],
    ['hasOrder','Has Order'],
  ];
  const rows = state.filters.map((f, i) => `
    <div class="filter-row">
      <span class="logic ${i===0?'first':''}">${i===0?'WHERE':'AND'}</span>
      <select class="filter-select" data-filter-field="${i}">
        ${FIELDS.map(([k,l]) => `<option value="${k}" ${f.field===k?'selected':''}>${l}</option>`).join('')}
      </select>
      <select class="filter-select" data-filter-op="${i}">
        <option ${f.op==='eq'?'selected':''}>is</option>
        <option ${f.op==='neq'?'selected':''}>is not</option>
        <option ${f.op==='contains'?'selected':''}>contains</option>
      </select>
      <select class="filter-select" data-filter-value="${i}">
        ${['Any','Facebook','Google','Tiktok','Organic','Direct','Email','Bing']
          .map(v => `<option ${f.value===v?'selected':''}>${v}</option>`).join('')}
      </select>
      <button class="filter-remove" data-filter-remove="${i}" title="Remove">×</button>
    </div>
  `).join('');

  return `
  <div class="filter-bar">
    ${rows}
    <div class="filter-actions-row">
      <button class="btn btn-primary btn-apply" data-action="apply-filters">Apply filters</button>
      <button class="btn btn-ghost" data-action="clear-filters">Clear</button>
      <button class="btn btn-ghost dashed" data-action="add-filter">+ Add filter</button>
      <span class="filter-hint">AND logic. Apply to update the list.</span>
    </div>
  </div>`;
}

function renderFunnel() {
  // compute stages from current data
  const all = JOURNEYS.flatMap(j => j.rows);
  const stages = [
    ['Clicks', all.filter(r => r.t==='c').length, 'click'],
    ['ViewContent', all.filter(r => r.t==='v' && r.vt==='ViewContent').length, 'action'],
    ['AddtoCart', all.filter(r => r.t==='v' && r.vt==='AddtoCart').length, 'action'],
    ['InitCheckout', all.filter(r => r.t==='v' && r.vt==='InitiateCheckout').length, 'action'],
    ['Purchase', all.filter(r => r.t==='o' && r.app !== 'Recharge Subscriptions').length, 'purchase'],
    ['Subscription', all.filter(r => r.t==='o' && r.app === 'Recharge Subscriptions').length, 'subscription'],
  ].filter(s => s[1] > 0);

  const max = Math.max(...stages.map(s => s[1]));
  const first = stages[0][1];
  const last = stages[stages.length - 1][1];

  let html = '<div class="funnel-stages">';
  stages.forEach((s, i) => {
    const w = Math.round((s[1] / max) * 100);
    html += `<div class="funnel-stage">
      <div class="label">${s[0]}</div>
      <div class="num">${s[1].toLocaleString()}</div>
      <div class="bar" style="width:${w}%"></div>
    </div>`;
    if (i < stages.length - 1) {
      const pct = stages[i+1][1] / s[1];
      const drop = Math.round((1 - pct) * 100);
      html += `<div class="funnel-arrow">
        <div class="chev">›</div>
        <div class="pct">-${drop}%</div>
      </div>`;
    }
  });
  html += '</div>';

  const overall = ((last/first)*100).toFixed(1);
  return `
    <div class="funnel">
      <div class="funnel-head">
        <div class="funnel-title">Conversion funnel</div>
        <div class="funnel-summary">Clicks → Subscription: <b>${overall}%</b> overall conversion</div>
      </div>
      ${html}
    </div>
  `;
}

// ================= Tab content =================
function renderDashContent() {
  if (state.tab === 'paths') return renderPaths();
  if (state.tab === 'stops') return renderStops();
  if (state.tab === 'orders') return renderOrders();
  if (state.tab === 'customers') return renderCustomers();
  return '';
}

// ---- Journey Paths tab ----
function renderPaths() {
  const sorted = [...JOURNEYS].sort((a,b) => {
    if (state.sort === 'lastDate') return b.lastDate - a.lastDate;
    if (state.sort === 'firstDate') return b.firstDate - a.firstDate;
    if (state.sort === 'count') return b.count - a.count;
    if (state.sort === 'revenue') return b.revenue - a.revenue;
    return 0;
  });

  return `
    <div class="sort-bar">
      <span class="results"><b>${sorted.length}</b> journey paths · showing page 1 of 1</span>
      <span class="sep"></span>
      <span>Sort by:</span>
      <select class="filter-select" id="sort-select">
        <option value="lastDate" ${state.sort==='lastDate'?'selected':''}>Last seen (newest)</option>
        <option value="firstDate" ${state.sort==='firstDate'?'selected':''}>First seen (newest)</option>
        <option value="count" ${state.sort==='count'?'selected':''}>Touchpoint count</option>
        <option value="revenue" ${state.sort==='revenue'?'selected':''}>Revenue</option>
      </select>
    </div>
    <div class="jp-list">
      ${sorted.map((j, i) => renderJourneyRow(j, i+1)).join('')}
    </div>
  `;
}

function renderJourneyRow(j, n) {
  const fmtShort = d => {
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mn = String(d.getMinutes()).padStart(2,'0');
    return `${mm}/${dd} ${hh}:${mn}`;
  };
  const cards = [];
  let dividerPlaced = false;
  j.rows.forEach((r, idx) => {
    const cls = classifyTouchpoint(r, j.firstOrderTs);
    if (cls === 'first' && !dividerPlaced) {
      dividerPlaced = true;
    }
    cards.push(renderTouchpointCard(r, cls, j.firstOrderTs, j.fp, idx));
  });

  const hasCust = !!j.cid;

  return `
    <div class="jp-row" data-fp="${j.fp}">
      <div class="jp-left" data-jp-left="${j.fp}">
        <div class="jp-idx">
          <span class="jp-num">#${String(n).padStart(3,'0')}</span>
          <span class="jp-count">${j.count} tp</span>
        </div>
        <div class="jp-fp-id" title="Click to open journey path details">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 2.5c0-.8.9-1.5 3-1.5s3 .7 3 1.5M3 5c0-.8 1.6-2 5-2s5 1.2 5 2c0 1.2-.8 2.2-2 2.8M5 7c0-.6.8-1 3-1s3 .4 3 1c0 1.5-1 3-3 4.5M8 14.5c0-1 .5-2 1-3"/></svg>
          <span class="mono">${esc(j.fp)}</span>
        </div>
        <div class="jp-range" title="${fmtDate(j.firstDate)} → ${fmtDate(j.lastDate)}">
          ${fmtShort(j.firstDate)}<br>→ ${fmtShort(j.lastDate)}
        </div>
        ${j.revenue > 0 ? `<div class="jp-rev">${moneyFmt(j.revenue)}</div>` : '<div class="dim" style="font-size:11px;margin-top:4px;">no revenue</div>'}
        ${hasCust ? `
          <div class="jp-cust">
            <div class="jp-cust-name" data-cust="${j.cid}">${esc(j.custName)}</div>
            <div class="jp-cust-email">${esc(j.custEmail)}</div>
          </div>
        ` : '<div class="jp-cust"><div class="dim" style="font-size:11px;">prospect · unattributed</div></div>'}
        ${j.ttfp ? `<div class="jp-time-badge">⏱ ${j.ttfp} to 1st purchase</div>` : ''}
      </div>
      <div class="tp-track">${cards.join('')}</div>
    </div>
  `;
}

function renderTouchpointCard(r, cls, firstOrderTs, fp, idx) {
  const time = fmtDate(r.dt).split(' ')[1] + ' · ' + fmtDate(r.dt).slice(0, 5);
  const muted = isSubscriptionAction(r);
  const classes = ['tp-card'];
  if (r.t === 'c') classes.push('click');
  else if (r.t === 'v') classes.push('action');
  else if (r.t === 'o') classes.push(isSubscription(r) ? 'subscription' : 'purchase');
  if (cls === 'first') classes.push('first');
  if (cls === 'pre') classes.push('pre');
  if (muted) classes.push('muted');

  let badge, rows;
  if (r.t === 'c') {
    badge = 'click';
    rows = `
      <div class="tp-row-data"><span class="k">Src</span><span class="v"><span class="src-dot ${sourceClass(r.src)}"></span> ${esc(r.src)}</span></div>
      <div class="tp-row-data"><span class="k">Cmp</span><span class="v" title="${esc(r.cmp)}">${esc(r.cmp)}</span></div>
      <div class="tp-row-data"><span class="k">Creat.</span><span class="v mono" title="${esc(r.s4)}">${esc(r.s4)}</span></div>
      <div class="tp-row-data"><span class="k">Place</span><span class="v">${esc(r.placement)}</span></div>
    `;
  } else if (r.t === 'v') {
    badge = 'action';
    rows = `
      <div class="tp-row-data"><span class="k">Type</span><span class="v" style="color:var(--orange);font-weight:700;">${esc(r.vt)}</span></div>
      <div class="tp-row-data"><span class="k">Src</span><span class="v"><span class="src-dot ${sourceClass(r.src)}"></span> ${esc(r.src)}</span></div>
      <div class="tp-row-data"><span class="k">Cmp</span><span class="v" title="${esc(r.cmp)}">${esc(r.cmp)}</span></div>
      ${r.pay > 0 ? `<div class="tp-row-data"><span class="k">Payout</span><span class="v price">${moneyFmt(r.pay)}</span></div>` : ''}
    `;
  } else {
    const sub = isSubscription(r);
    badge = sub ? 'subscription' : 'purchase';
    rows = `
      <div class="tp-row-data"><span class="k">Order</span><span class="v link mono">${esc(r.oid)}</span></div>
      <div class="tp-row-data"><span class="k">Value</span><span class="v price">${moneyFmt(r.pr)}</span></div>
      <div class="tp-row-data"><span class="k">Status</span><span class="v"><span class="status">${esc(r.st)}</span></span></div>
      <div class="tp-row-data"><span class="k">Ref.</span><span class="v" title="${esc(r.rcmp)}">${esc(r.rcmp)}</span></div>
    `;
  }

  return `
    <div class="${classes.join(' ')}" data-tp-fp="${esc(fp)}" data-tp-idx="${idx}" title="Click to open touchpoint details">
      <div class="tp-head">
        <span class="badge ${badge}">${badge === 'subscription' ? 'SUB' : badge.toUpperCase()}</span>
        ${cls === 'first' ? '<span class="badge first">★ 1st</span>' : ''}
        <span class="tp-time">${esc(fmtDate(r.dt))}</span>
      </div>
      ${rows}
    </div>
  `;
}

// ---- Path Stops tab ----
function renderStops() {
  const mode = state.stop1;
  const groups = {};
  JOURNEYS.forEach(j => {
    const key = mode === 'source' ? j.source : (j.campaign || '—');
    if (!groups[key]) groups[key] = { name: key, count: 0, stop2: 0, stop3: 0, fps: [] };
    groups[key].count++;
    groups[key].fps.push(j);
    // pretend stop2/stop3 filters apply — use journeys with orders
    if (j.orders > 0) groups[key].stop2++;
    if (j.orders > 1) groups[key].stop3++;
  });

  const rows = Object.values(groups).sort((a,b) => b.count - a.count);
  const max = Math.max(...rows.map(r => r.count));
  const totalJourneys = JOURNEYS.length;

  const renderStopHeader = (n, cfg) => {
    const cls = `stop-col stop${n}` + (cfg ? '' : ' empty');
    if (!cfg) return `<th class="${cls}" data-stop-header="${n}">+ Stop ${n}</th>`;
    return `<th class="${cls}" data-stop-header="${n}">Stop ${n}: ${esc(cfg.label)}</th>`;
  };

  return `
    <div class="attr-header">
      <div>
        <div class="attr-title">Path Stops — Sequential Journey Analysis</div>
        <div class="attr-sub">Group journeys by their first touchpoint, then filter by subsequent stops. Click a row to see matching fingerprints.</div>
      </div>
      <div class="mode-toggle">
        <button class="btn-attr ${mode==='source'?'active':''}" data-stop1-mode="source">By Source</button>
        <button class="btn-attr ${mode==='campaign'?'active':''}" data-stop1-mode="campaign">By Campaign</button>
      </div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th style="width:40px;"></th>
          <th class="sortable sorted">Stop 1: ${mode === 'source' ? 'Source' : 'Campaign'} <span class="sort-indicator">▼</span></th>
          <th class="sortable" style="width:220px;">Journeys</th>
          ${renderStopHeader(2, state.stop2 ? { label: 'Purchase' } : null)}
          ${renderStopHeader(3, state.stop3 ? { label: 'Subscription' } : null)}
          <th style="width:110px;">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => renderStopRow(r, max, totalJourneys)).join('')}
      </tbody>
    </table>
  `;
}

function renderStopRow(r, max, total) {
  const expanded = state.expandedStops.has(r.name);
  const pct = ((r.count/total)*100).toFixed(1);
  const pct2 = r.count ? ((r.stop2/r.count)*100).toFixed(0) : 0;
  const pct3 = r.count ? ((r.stop3/r.count)*100).toFixed(0) : 0;
  const revenue = r.fps.reduce((s,j) => s + j.revenue, 0);

  const stop2Html = state.stop2 ? `
    <td><div class="stop-cell s2">
      <div class="bar-track"><div class="bar-fill" style="width:${pct2}%"></div></div>
      <span class="n">${r.stop2}</span><span class="pct">${pct2}%</span>
    </div></td>
  ` : '<td><span class="stop-dash">—</span></td>';

  const stop3Html = state.stop3 ? `
    <td><div class="stop-cell s3">
      <div class="bar-track"><div class="bar-fill" style="width:${pct3}%"></div></div>
      <span class="n">${r.stop3}</span><span class="pct">${pct3}%</span>
    </div></td>
  ` : '<td><span class="stop-dash">—</span></td>';

  const main = `
    <tr class="${expanded?'expanded':''}" data-stop-row="${esc(r.name)}">
      <td><span class="expand-caret">▶</span></td>
      <td><span class="src-chip"><span class="src-dot ${sourceClass(r.name)}"></span><b>${esc(r.name)}</b></span></td>
      <td><div class="stop-cell">
        <div class="bar-track"><div class="bar-fill" style="width:${(r.count/max)*100}%"></div></div>
        <span class="n">${r.count}</span><span class="pct">${pct}%</span>
      </div></td>
      ${stop2Html}
      ${stop3Html}
      <td class="mono" style="color:var(--green);font-weight:700;">${moneyFmt(revenue)}</td>
    </tr>
  `;

  if (!expanded) return main;
  return main + `
    <tr class="expand-row"><td colspan="6"><div class="expand-inner">
      <div class="expand-heading">Matching fingerprints · <b>${r.fps.length}</b></div>
      <table class="tp-table">
        <thead><tr>
          <th>#</th><th>Fingerprint</th><th>Customer</th><th>Source</th>
          <th>Touchpoints</th><th>Revenue</th><th>First Seen</th><th>Last Seen</th>
        </tr></thead>
        <tbody>
          ${r.fps.map((j, i) => `
            <tr data-fp="${j.fp}">
              <td class="dim">${i+1}</td>
              <td><a class="xlink mono">${esc(j.fp)}</a></td>
              <td>${j.cid ? `<a class="xlink" data-cust="${j.cid}">${esc(j.custName)}</a>` : '<span class="dim">— prospect</span>'}</td>
              <td><span class="src-chip"><span class="src-dot ${sourceClass(j.source)}"></span>${esc(j.source)}</span></td>
              <td>${j.count}</td>
              <td class="mono" style="color:${j.revenue?'var(--green)':'var(--ink-4)'};font-weight:${j.revenue?700:400}">${j.revenue?moneyFmt(j.revenue):'—'}</td>
              <td class="mono dim">${esc(fmtDate(j.firstDate))}</td>
              <td class="mono dim">${esc(fmtDate(j.lastDate))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div></td></tr>
  `;
}

// ---- Orders tab ----
function renderOrders() {
  const orders = [];
  JOURNEYS.forEach(j => j.rows.filter(r => r.t === 'o').forEach(r => orders.push({ ...r, j })));
  orders.sort((a,b) => b.dt - a.dt);

  return `
    <div class="sort-bar">
      <span class="results"><b>${orders.length}</b> orders</span>
      <span class="sep"></span>
      <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox"> <span>Hide subscriptions</span>
      </label>
    </div>
    <table class="tbl">
      <thead><tr>
        <th class="sortable sorted">Date ▼</th>
        <th>Order ID</th>
        <th>Customer</th>
        <th>Source</th>
        <th>Ref. Campaign</th>
        <th>App</th>
        <th>State</th>
        <th class="sortable">Value</th>
        <th>Status</th>
        <th>Fingerprint</th>
      </tr></thead>
      <tbody>
        ${orders.map(r => `
          <tr data-order="${esc(r.oid)}">
            <td class="mono dim">${esc(fmtDate(r.dt))}</td>
            <td><a class="xlink mono">${esc(r.oid)}</a></td>
            <td><a class="xlink" data-cust="${r.cid}">${esc(r.nm)}</a></td>
            <td><span class="src-chip"><span class="src-dot ${sourceClass(r.j.source)}"></span>${esc(r.j.source)}</span></td>
            <td>${esc(r.rcmp)}</td>
            <td>${isSubscription(r) ? '<span class="badge subscription">SUBSCRIPTION</span>' : esc(r.app)}</td>
            <td>${esc(r.co)}</td>
            <td class="mono" style="color:var(--green);font-weight:700;">${moneyFmt(r.pr)}</td>
            <td><span class="badge purchase">${esc(r.st)}</span></td>
            <td><a class="xlink mono" data-fp="${r.fp}">${esc(r.fp).slice(0,10)}…</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---- Customers tab ----
function renderCustomers() {
  const byCid = {};
  JOURNEYS.filter(j => j.cid).forEach(j => {
    if (!byCid[j.cid]) byCid[j.cid] = {
      cid: j.cid, nm: j.custName, em: j.custEmail,
      fps: [], orders: 0, revenue: 0, firstDate: j.firstDate, lastDate: j.lastDate
    };
    const c = byCid[j.cid];
    c.fps.push(j.fp); c.orders += j.orders; c.revenue += j.revenue;
    if (j.firstDate < c.firstDate) c.firstDate = j.firstDate;
    if (j.lastDate > c.lastDate) c.lastDate = j.lastDate;
  });
  const custs = Object.values(byCid).sort((a,b) => b.revenue - a.revenue);

  return `
    <div class="sort-bar">
      <span class="results"><b>${custs.length}</b> customers</span>
    </div>
    <table class="tbl">
      <thead><tr>
        <th>Customer</th><th>Email</th><th>Customer ID</th>
        <th>Fingerprints</th><th>Orders</th><th class="sortable sorted">Revenue ▼</th>
        <th>First Seen</th><th>Last Seen</th>
      </tr></thead>
      <tbody>
        ${custs.map(c => `
          <tr data-cust="${c.cid}">
            <td><span class="cust-avatar" style="display:inline-grid;width:24px;height:24px;font-size:10px;vertical-align:middle;margin-right:8px;">${c.nm.split(' ').map(p => p[0]).join('')}</span><a class="xlink">${esc(c.nm)}</a></td>
            <td class="dim">${esc(c.em)}</td>
            <td class="mono dim">${esc(c.cid)}</td>
            <td>${c.fps.length}</td>
            <td>${c.orders}</td>
            <td class="mono" style="color:var(--green);font-weight:700;">${moneyFmt(c.revenue)}</td>
            <td class="mono dim">${esc(fmtDate(c.firstDate))}</td>
            <td class="mono dim">${esc(fmtDate(c.lastDate))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ================= Detail panel =================
function renderDetail() {
  if (!state.detail) return '';
  if (state.detail.type === 'journey') return renderJourneyDetail(state.detail.fp);
  if (state.detail.type === 'customer') return renderCustomerDetail(state.detail.cid);
  if (state.detail.type === 'touchpoint') return renderTouchpointDetail(state.detail.fp, state.detail.idx);
  return '';
}

function renderTouchpointDetail(fp, idx) {
  const j = JOURNEYS.find(x => x.fp === fp);
  if (!j) return '';
  const r = j.rows[idx];
  if (!r) return '';
  const cls = classifyTouchpoint(r, j.firstOrderTs);
  let kind = 'Touchpoint';
  let kindBadge = '';
  if (r.t === 'c') { kind = 'Click'; kindBadge = '<span class="badge click">CLICK</span>'; }
  else if (r.t === 'v') { kind = 'Action'; kindBadge = '<span class="badge action">ACTION</span>'; }
  else if (r.t === 'o') {
    if (isSubscription(r)) { kind = 'Subscription'; kindBadge = '<span class="badge subscription">SUB</span>'; }
    else { kind = 'Purchase'; kindBadge = '<span class="badge purchase">PURCHASE</span>'; }
  }

  const fieldRow = (label, value, mono = false) => value == null || value === '' ? '' : `
    <div class="kv-row"><div class="kv-k">${esc(label)}</div><div class="kv-v ${mono?'mono':''}">${value}</div></div>`;

  const details = [];
  details.push(fieldRow('Type', kindBadge));
  details.push(fieldRow('Date', esc(fmtDate(r.dt)), true));
  if (r.vt) details.push(fieldRow('Conv. Type', `<b style="color:var(--orange)">${esc(r.vt)}</b>`));
  if (r.oid) details.push(fieldRow('Order ID', `<a class="xlink mono">${esc(r.oid)}</a>`));
  if (r.pr) details.push(fieldRow('Value', `<span style="color:var(--green);font-weight:700;">${moneyFmt(r.pr)}</span>`, true));
  if (r.pay) details.push(fieldRow('Payout', `<span style="color:var(--orange)">${moneyFmt(r.pay)}</span>`, true));
  if (r.st) details.push(fieldRow('Status', `<span class="badge purchase">${esc(r.st)}</span>`));
  if (r.app) details.push(fieldRow('App', esc(r.app)));
  if (r.src) details.push(fieldRow('Source', `<span class="src-chip"><span class="src-dot ${sourceClass(r.src)}"></span>${esc(r.src)}</span>`));
  if (r.cmp) details.push(fieldRow('Ad Campaign', esc(r.cmp)));
  if (r.rcmp) details.push(fieldRow('Ref. Campaign', esc(r.rcmp)));
  if (r.adgrp) details.push(fieldRow('Ad Group', esc(r.adgrp)));
  if (r.s4) details.push(fieldRow('Creative', esc(r.s4), true));
  if (r.placement) details.push(fieldRow('Placement', esc(r.placement)));
  if (r.dev) details.push(fieldRow('Device', esc(r.dev)));
  if (r.br) details.push(fieldRow('Browser', esc(r.br)));
  if (r.os) details.push(fieldRow('OS', esc(r.os)));
  if (r.co) details.push(fieldRow('State', esc(r.co)));
  if (r.ci) details.push(fieldRow('City', esc(r.ci)));
  if (r.ip) details.push(fieldRow('IP', esc(r.ip), true));

  return `
    <div class="panel-head">
      <button class="icon-btn" data-action="close-detail">×</button>
      <div class="panel-title">
        ${kind} · Touchpoint <span class="dim">#${idx + 1}</span>
        <span class="panel-subtitle">in journey <a class="xlink mono" data-fp="${esc(j.fp)}">${esc(j.fp)}</a></span>
      </div>
      <div class="panel-meta">
        <div class="stat"><b>${idx + 1}</b><span>of ${j.count}</span></div>
        <div class="stat"><b>${cls === 'pre' ? 'Pre-purchase' : cls === 'first' ? '1st purchase' : 'Post-purchase'}</b><span>Phase</span></div>
        ${r.pr ? `<div class="stat"><b style="color:var(--green)">${moneyFmt(r.pr)}</b><span>Value</span></div>` : ''}
      </div>
    </div>
    <div class="panel-body">
      <div class="section-head">
        <h3>${kind} details</h3>
        <span class="muted">All recorded fields for this touchpoint</span>
      </div>
      <div class="kv-grid">
        ${details.join('')}
      </div>
      <div class="section-head" style="margin-top:20px;">
        <h3>Related</h3>
        <span class="muted">Jump to context</span>
      </div>
      <div class="related-links">
        <a class="xlink" data-fp="${esc(j.fp)}">↗ Open full journey path (${j.count} touchpoints)</a>
        ${j.cid ? `<a class="xlink" data-cust="${esc(j.cid)}">↗ Open customer · ${esc(j.custName)}</a>` : ''}
      </div>
    </div>
  `;
}

function renderJourneyDetail(fpid) {
  const j = JOURNEYS.find(x => x.fp === fpid);
  if (!j) return '';
  return `
    <div class="panel-head">
      <button class="icon-btn" data-action="close-detail">×</button>
      <div class="panel-title">
        Journey Path
        <span class="pid">${esc(j.fp)}</span>
        <span class="panel-subtitle">${esc(j.source)} · ${esc(j.city)}, ${esc(j.state)}</span>
      </div>
      <div class="panel-meta">
        <div class="stat"><b>${j.count}</b><span>Touchpoints</span></div>
        <div class="stat"><b>${j.clicks}</b><span>Clicks</span></div>
        <div class="stat"><b>${j.convs}</b><span>Actions</span></div>
        <div class="stat"><b>${j.orders}</b><span>Orders</span></div>
        ${j.revenue > 0 ? `<div class="stat"><b style="color:var(--green)">${moneyFmt(j.revenue)}</b><span>Revenue</span></div>` : ''}
      </div>
    </div>
    <div class="panel-body">
      ${j.cid ? `
        <div class="cust-card">
          <div class="cust-avatar">${j.custName.split(' ').map(p => p[0]).join('')}</div>
          <div class="cust-info">
            <div class="name"><a class="xlink" data-cust="${j.cid}">${esc(j.custName)}</a></div>
            <div class="email">${esc(j.custEmail)}</div>
            <div class="cid">Customer ID · ${esc(j.cid)}</div>
          </div>
          <div class="cust-kpis">
            ${j.ttfp ? `<div class="kpi-box"><div class="v teal">${j.ttfp}</div><div class="l">Time to 1st</div></div>` : ''}
            <div class="kpi-box"><div class="v green">${moneyFmt(j.revenue)}</div><div class="l">Revenue</div></div>
          </div>
        </div>
      ` : ''}
      <div>
        <div class="section-head">
          <h3>All Touchpoints</h3>
          <span class="muted">Chronological · ${j.count} records</span>
        </div>
        ${renderTouchpointTable(j.rows, j.firstOrderTs)}
      </div>
    </div>
  `;
}

function renderCustomerDetail(cid) {
  const custJourneys = JOURNEYS.filter(j => j.cid === cid);
  if (custJourneys.length === 0) return '';
  const c = custJourneys[0];
  const totalRev = custJourneys.reduce((s,j) => s + j.revenue, 0);
  const totalOrders = custJourneys.reduce((s,j) => s + j.orders, 0);
  const allRows = custJourneys.flatMap(j => j.rows.map(r => ({...r, _fp: j.fp}))).sort((a,b) => a.dt - b.dt);
  const firstOrderTs = allRows.find(r => r.t === 'o')?.dt.getTime() || null;

  return `
    <div class="panel-head">
      <button class="icon-btn" data-action="close-detail">×</button>
      <div class="panel-title">
        Customer
        <span class="pid">${esc(cid)}</span>
      </div>
      <div class="panel-meta">
        <div class="stat"><b>${custJourneys.length}</b><span>Fingerprints</span></div>
        <div class="stat"><b>${totalOrders}</b><span>Orders</span></div>
        <div class="stat"><b style="color:var(--green)">${moneyFmt(totalRev)}</b><span>Total Revenue</span></div>
      </div>
    </div>
    <div class="panel-body">
      <div class="cust-card">
        <div class="cust-avatar">${c.custName.split(' ').map(p => p[0]).join('')}</div>
        <div class="cust-info">
          <div class="name">${esc(c.custName)}</div>
          <div class="email">${esc(c.custEmail)}</div>
          <div class="cid">Customer ID · ${esc(cid)}</div>
        </div>
        <div class="cust-kpis">
          <div class="kpi-box"><div class="v teal">${custJourneys.length}</div><div class="l">Fingerprints</div></div>
          <div class="kpi-box"><div class="v">${totalOrders}</div><div class="l">Orders</div></div>
          <div class="kpi-box"><div class="v green">${moneyFmt(totalRev)}</div><div class="l">Revenue</div></div>
        </div>
      </div>
      <div>
        <div class="section-head">
          <h3>RedTrack Fingerprints</h3>
          <span class="muted">${custJourneys.length} linked identities</span>
        </div>
        <table class="tp-table">
          <thead><tr>
            <th>#</th><th>Fingerprint</th><th>Source</th><th>Clicks</th><th>Actions</th>
            <th>Orders</th><th>Revenue</th><th>First Seen</th><th>Last Seen</th><th>Touchpoints</th>
          </tr></thead>
          <tbody>
            ${custJourneys.map((j, i) => `
              <tr data-fp="${j.fp}">
                <td class="dim">${i+1}</td>
                <td><a class="xlink mono">${esc(j.fp)}</a></td>
                <td><span class="src-chip"><span class="src-dot ${sourceClass(j.source)}"></span>${esc(j.source)}</span></td>
                <td>${j.clicks}</td>
                <td>${j.convs}</td>
                <td>${j.orders}</td>
                <td class="mono" style="color:${j.revenue?'var(--green)':'var(--ink-4)'};font-weight:${j.revenue?700:400}">${j.revenue?moneyFmt(j.revenue):'—'}</td>
                <td class="mono dim">${esc(fmtDate(j.firstDate))}</td>
                <td class="mono dim">${esc(fmtDate(j.lastDate))}</td>
                <td>${j.count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div>
        <div class="section-head">
          <h3>Orders</h3>
          <span class="muted">${(() => { const o = allRows.filter(r => r.t === 'o'); return `${o.length} order${o.length===1?'':'s'} · ${moneyFmt(o.reduce((s,r)=>s+r.pr,0))}`; })()}</span>
        </div>
        ${renderCustomerOrdersTable(allRows.filter(r => r.t === 'o'))}
      </div>
      <div>
        <div class="section-head">
          <h3>Full Journey · All Actions</h3>
          <span class="muted">Chronological across all fingerprints</span>
        </div>
        ${renderTouchpointTable(allRows, firstOrderTs, true)}
      </div>
    </div>
  `;
}

function renderCustomerOrdersTable(orders) {
  if (orders.length === 0) {
    return `<div class="empty-state">No orders yet for this customer.</div>`;
  }
  // sort newest first
  const sorted = [...orders].sort((a,b) => b.dt - a.dt);
  return `
    <table class="tp-table">
      <thead><tr>
        <th>#</th>
        <th>Order ID</th>
        <th>Date</th>
        <th>App</th>
        <th>Ref. Campaign</th>
        <th>State</th>
        <th>Value</th>
        <th>Status</th>
        <th>Fingerprint</th>
      </tr></thead>
      <tbody>
        ${sorted.map((r, i) => `
          <tr data-order="${esc(r.oid)}">
            <td class="dim">${i+1}</td>
            <td><a class="xlink mono">${esc(r.oid)}</a></td>
            <td class="mono dim">${esc(fmtDate(r.dt))}</td>
            <td>${isSubscription(r) ? '<span class="badge subscription">SUBSCRIPTION</span>' : esc(r.app || '—')}</td>
            <td>${esc(r.rcmp || '—')}</td>
            <td>${esc(r.co || '—')}</td>
            <td class="mono" style="color:var(--green);font-weight:700;">${moneyFmt(r.pr)}</td>
            <td><span class="badge purchase">${esc(r.st || 'FULFILLED')}</span></td>
            <td><a class="xlink mono" data-fp="${esc(r._fp || '')}">${esc((r._fp||'').slice(0,10))}…</a></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderTouchpointTable(rows, firstOrderTs, withFp = false) {
  const typeLabel = (r) => {
    if (r.t === 'c') return '<span class="badge click">CLICK</span>';
    if (r.t === 'v') return '<span class="badge action">ACTION</span>';
    return isSubscription(r) ? '<span class="badge subscription">SUB</span>' : '<span class="badge purchase">PURCHASE</span>';
  };
  return `
    <table class="tp-table">
      <thead><tr>
        <th>#</th>
        <th>Type</th>
        <th>Conv. Type</th>
        <th>Date</th>
        ${withFp ? '<th>Fingerprint</th>' : ''}
        <th>Source</th>
        <th>Ad Campaign</th>
        <th>Creative</th>
        <th>Device</th>
        <th>State</th>
        <th>IP</th>
        <th>Order</th>
        <th>Value</th>
        <th>Payout</th>
        <th>Status</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const cls = classifyTouchpoint(r, firstOrderTs);
          const muted = isSubscriptionAction(r);
          return `
          <tr class="${cls === 'pre' ? 'pre' : ''} ${cls === 'first' ? 'first' : ''} ${muted ? 'muted' : ''}">
            <td class="dim">${i+1}</td>
            <td>${typeLabel(r)}</td>
            <td>${r.vt ? `<b style="color:var(--orange)">${esc(r.vt)}</b>` : '<span class="dim">—</span>'}</td>
            <td class="mono dim">${esc(fmtDate(r.dt))}</td>
            ${withFp ? `<td class="mono dim" title="${esc(r._fp)}">${esc((r._fp||'').slice(0,8))}…</td>` : ''}
            <td>${r.src ? `<span class="src-chip"><span class="src-dot ${sourceClass(r.src)}"></span>${esc(r.src)}</span>` : '<span class="dim">—</span>'}</td>
            <td>${esc(r.cmp || '—')}</td>
            <td class="mono dim">${esc(r.s4 || '—')}</td>
            <td>${esc(r.dev || '—')}</td>
            <td>${esc(r.co || '—')}</td>
            <td class="mono dim">${esc(r.ip || '—')}</td>
            <td>${r.oid ? `<a class="xlink mono">${esc(r.oid)}</a>` : '<span class="dim">—</span>'}</td>
            <td class="mono" style="color:${r.pr?'var(--green)':'inherit'};font-weight:${r.pr?700:400}">${r.pr ? moneyFmt(r.pr) : '<span class="dim">—</span>'}</td>
            <td class="mono" style="color:${r.pay?'var(--orange)':'inherit'}">${r.pay ? moneyFmt(r.pay) : '<span class="dim">—</span>'}</td>
            <td>${r.st ? `<span class="badge purchase">${esc(r.st)}</span>` : '<span class="dim">—</span>'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ================= Tweaks =================
function renderTweaks() {
  return `
    <div id="tweaks" class="${state.tweaksOpen?'open':''}">
      <h4>Tweaks</h4>
      <div class="tweak">
        <label>Density</label>
        <select id="tw-density">
          <option value="comfortable" ${state.tweaks.density==='comfortable'?'selected':''}>Comfortable</option>
          <option value="compact" ${state.tweaks.density==='compact'?'selected':''}>Compact</option>
        </select>
      </div>
      <div class="tweak">
        <label>Primary color</label>
        <input type="color" id="tw-color" value="${state.tweaks.primaryColor}" />
      </div>
      <div class="tweak">
        <label>Show funnel by default</label>
        <label class="switch"><input type="checkbox" id="tw-funnel" ${state.tweaks.showFunnel?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="tweak">
        <label>Show WEEM logo mark</label>
        <label class="switch"><input type="checkbox" id="tw-logo" ${state.tweaks.showLogo?'checked':''}/><span class="slider"></span></label>
      </div>
      <div class="tweak">
        <label>Date picker style</label>
        <select id="tw-date-style">
          <option value="pill" ${state.tweaks.datePickerStyle==='pill'?'selected':''}>Merged pill</option>
          <option value="split" ${state.tweaks.datePickerStyle==='split'?'selected':''}>Split From / To</option>
        </select>
      </div>
    </div>
  `;
}

function applyTweaks() {
  document.documentElement.style.setProperty('--teal', state.tweaks.primaryColor);
  const rgb = hexToRgb(state.tweaks.primaryColor);
  if (rgb) {
    const [r,g,b] = rgb;
    document.documentElement.style.setProperty('--teal-08', `rgba(${r},${g},${b},0.08)`);
    document.documentElement.style.setProperty('--teal-12', `rgba(${r},${g},${b},0.12)`);
    document.documentElement.style.setProperty('--teal-18', `rgba(${r},${g},${b},0.18)`);
    document.documentElement.style.setProperty('--teal-35', `rgba(${r},${g},${b},0.35)`);
  }
  // density
  document.body.style.setProperty('font-size', state.tweaks.density === 'compact' ? '12px' : '13px');
}

function hexToRgb(h) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return m ? [parseInt(m[1],16), parseInt(m[2],16), parseInt(m[3],16)] : null;
}

// ================= Bindings =================
function bind() {
  // Tabs
  $$('[data-tab]').forEach(el => el.addEventListener('click', () => {
    state.tab = el.dataset.tab;
    localStorage.setItem('weem.tab', state.tab);
    renderApp();
  }));

  // Actions
  $$('[data-action]').forEach(el => el.addEventListener('click', () => {
    const a = el.dataset.action;
    if (a === 'toggle-funnel') { state.funnelOpen = !state.funnelOpen; renderApp(); }
    else if (a === 'close-detail') { state.detail = null; renderApp(); }
    else if (a === 'add-filter') {
      state.filters.push({ field: 'firstSource', op: 'eq', value: 'Any' });
      renderApp();
    }
    else if (a === 'apply-filters') {
      const btn = el;
      btn.textContent = 'Applied ✓';
      btn.classList.remove('pending');
      setTimeout(() => { btn.textContent = 'Apply filters'; }, 1200);
    }
    else if (a === 'clear-filters') {
      state.filters = [{ field: 'firstSource', op: 'eq', value: 'Any' }];
      renderApp();
    }
    else if (a === 'toggle-theme') {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('weem.theme', state.theme);
      applyTheme();
    }
  }));

  // Filters
  $$('[data-filter-remove]').forEach(el => el.addEventListener('click', () => {
    state.filters.splice(+el.dataset.filterRemove, 1);
    if (state.filters.length === 0) state.filters.push({ field: 'firstSource', op: 'eq', value: 'Any' });
    renderApp();
  }));

  // Sort select
  const sortSel = $('#sort-select');
  if (sortSel) sortSel.addEventListener('change', e => { state.sort = e.target.value; renderApp(); });

  // Journey row click — only the left panel / fingerprint area opens journey detail
  $$('[data-jp-left]').forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('[data-cust]')) return;
    state.detail = { type: 'journey', fp: el.dataset.jpLeft };
    renderApp();
  }));

  // Touchpoint card click — opens a touchpoint detail (not the journey)
  $$('[data-tp-fp]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    if (e.target.closest('[data-cust]')) return;
    state.detail = { type: 'touchpoint', fp: el.dataset.tpFp, idx: +el.dataset.tpIdx };
    renderApp();
  }));

  // Customer link click (anywhere)
  $$('[data-cust]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    state.detail = { type: 'customer', cid: el.dataset.cust };
    renderApp();
  }));

  // Orders rows
  $$('[data-order]').forEach(el => el.addEventListener('click', e => {
    const fpEl = el.querySelector('[data-fp]');
    if (fpEl) { state.detail = { type: 'journey', fp: fpEl.dataset.fp }; renderApp(); }
  }));

  // Stop1 mode toggle
  $$('[data-stop1-mode]').forEach(el => el.addEventListener('click', () => {
    state.stop1 = el.dataset.stop1Mode;
    state.expandedStops.clear();
    renderApp();
  }));

  // Stop row expand
  $$('[data-stop-row]').forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('[data-fp]') || e.target.closest('[data-cust]')) return;
    const n = el.dataset.stopRow;
    if (state.expandedStops.has(n)) state.expandedStops.delete(n);
    else state.expandedStops.add(n);
    renderApp();
  }));

  // Stop header popup (configure)
  $$('[data-stop-header]').forEach(el => el.addEventListener('click', () => {
    const n = +el.dataset.stopHeader;
    const portal = $('#stop-popup-portal');
    const rect = el.getBoundingClientRect();
    portal.innerHTML = `
      <div class="stop-popup stop${n}" style="top:${rect.bottom+window.scrollY+6}px;left:${rect.left+window.scrollX}px;">
        <div class="pop-head">Configure Stop ${n}</div>
        <div class="pop-field"><label>Dimension</label>
          <select><option>Source</option><option>Ad Campaign</option><option>Conv. Type</option><option selected>Purchase</option><option>Subscription</option></select></div>
        <div class="pop-field"><label>Value</label>
          <select><option>any</option><option>Purchase</option><option>Subscription</option></select></div>
        <div class="pop-actions">
          <button class="btn btn-ghost" data-pop-clear>Clear</button>
          <button class="btn btn-primary" style="background:var(--teal);color:#fff;" data-pop-apply="${n}">Apply</button>
        </div>
      </div>
    `;
    portal.querySelector('[data-pop-apply]').addEventListener('click', () => {
      if (n === 2) state.stop2 = { label: 'Purchase' };
      if (n === 3) state.stop3 = { label: 'Subscription' };
      portal.innerHTML = '';
      renderApp();
    });
    portal.querySelector('[data-pop-clear]').addEventListener('click', () => {
      if (n === 2) state.stop2 = null;
      if (n === 3) state.stop3 = null;
      portal.innerHTML = '';
      renderApp();
    });
    // Close on outside click
    setTimeout(() => {
      const onDoc = (ev) => {
        if (!ev.target.closest('.stop-popup')) { portal.innerHTML = ''; document.removeEventListener('click', onDoc); }
      };
      document.addEventListener('click', onDoc);
    }, 0);
  }));

  // Fingerprint click in expand row
  $$('[data-stop-row] + .expand-row [data-fp], .expand-row [data-fp]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    state.detail = { type: 'journey', fp: el.dataset.fp };
    renderApp();
  }));
  // generic FP links (orders, related-links, etc.) — skip TRs and the .jp-row wrapper
  // .jp-row and .tp-card (via [data-tp-fp]) have their own handlers above.
  $$('[data-fp]').forEach(el => {
    if (el.tagName === 'TR') return;
    if (el.classList.contains('jp-row')) return;
    el.addEventListener('click', e => {
      e.stopPropagation();
      state.detail = { type: 'journey', fp: el.dataset.fp };
      renderApp();
    });
  });

  // Backdrop close
  const bd = $('#backdrop');
  if (bd) bd.addEventListener('click', () => { state.detail = null; renderApp(); });

  // Mark filters pending on change
  $$('.filter-select, .mgmt-input').forEach(el => el.addEventListener('change', () => {
    const btn = document.querySelector('[data-action="apply-filters"]');
    if (btn) btn.classList.add('pending');
  }));

  // Tweaks
  const twColor = $('#tw-color');
  if (twColor) twColor.addEventListener('input', e => {
    state.tweaks.primaryColor = e.target.value;
    applyTweaks();
    persistTweak('primaryColor', e.target.value);
  });
  const twDensity = $('#tw-density');
  if (twDensity) twDensity.addEventListener('change', e => {
    state.tweaks.density = e.target.value;
    applyTweaks();
    persistTweak('density', e.target.value);
  });
  const twFunnel = $('#tw-funnel');
  if (twFunnel) twFunnel.addEventListener('change', e => {
    state.tweaks.showFunnel = e.target.checked;
    state.funnelOpen = e.target.checked;
    persistTweak('showFunnel', e.target.checked);
    renderApp();
  });
  const twLogo = $('#tw-logo');
  if (twLogo) twLogo.addEventListener('change', e => {
    state.tweaks.showLogo = e.target.checked;
    persistTweak('showLogo', e.target.checked);
  });

  enhanceSelects();
  bindDateRangeTrigger();
  // Add a "tweak" listener for date picker style (only when tweaks open)
  const twDateStyle = document.getElementById('tw-date-style');
  if (twDateStyle) twDateStyle.addEventListener('change', e => {
    state.tweaks.datePickerStyle = e.target.value;
    persistTweak('datePickerStyle', e.target.value);
    renderApp();
  });
  applyTweaks();
}

// ================= Custom dropdown enhancer =================
// Replaces every native <select> with a styled button + popover that mirrors
// the <select>'s value back and dispatches 'change', so existing handlers keep working.
const CC_SOURCE_COLORS = {
  Facebook: '#3c6ec9', Google: '#15aa6a', Tiktok: '#222', Organic: '#7a8e2a',
  Direct: '#a15fd6', Email: '#e07a2a', Bing: '#d0a30c', Any: 'transparent',
};
function enhanceSelects() {
  // Dismiss any lingering popover from the previous render.
  ccClose();
  document.querySelectorAll('select').forEach(sel => {
    if (sel.dataset.ccEnhanced === '1') return;
    sel.dataset.ccEnhanced = '1';
    // Wrap the native select
    const parent = sel.parentNode;
    const wrap = document.createElement('span');
    wrap.className = 'cc-wrap';
    parent.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    sel.classList.add('cc-native');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cc-trigger';
    // Carry over meaningful classes
    if (sel.classList.contains('filter-select')) trigger.classList.add('cc-filter');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="cc-label"></span><svg class="cc-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    wrap.appendChild(trigger);

    const syncLabel = () => {
      const opt = sel.options[sel.selectedIndex];
      trigger.querySelector('.cc-label').textContent = opt ? opt.textContent : '';
    };
    syncLabel();
    sel._ccSync = syncLabel;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (trigger.getAttribute('aria-expanded') === 'true') { ccClose(); return; }
      ccOpen(sel, trigger);
    });
    // Keyboard
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); ccOpen(sel, trigger);
      }
    });
  });
}

let _ccOpen = null;
function ccOpen(sel, trigger) {
  ccClose();
  const pop = document.createElement('div');
  pop.className = 'cc-popover';
  const isSource = /source|value/i.test(sel.getAttribute('data-filter-value') || '') ||
                   Array.from(sel.options).some(o => CC_SOURCE_COLORS[o.value || o.textContent] !== undefined && ['Facebook','Google','Tiktok'].includes(o.textContent));
  const opts = Array.from(sel.options).map((o, i) => {
    const txt = o.textContent;
    const val = o.value || txt;
    const selected = o.selected;
    let dot = '';
    if (isSource && CC_SOURCE_COLORS[txt]) {
      dot = `<span class="cc-dot" style="background:${CC_SOURCE_COLORS[txt]}"></span>`;
    }
    return `<div class="cc-option${selected ? ' cc-selected' : ''}" data-idx="${i}" role="option">${dot}${esc(txt)}</div>`;
  }).join('');
  pop.innerHTML = opts;
  document.body.appendChild(pop);

  // Position
  const r = trigger.getBoundingClientRect();
  const minW = Math.max(r.width, 160);
  pop.style.setProperty('--cc-min-width', minW + 'px');
  pop.style.left = r.left + 'px';
  pop.style.top = (r.bottom + 4) + 'px';
  pop.classList.add('open');
  // If would overflow right or bottom, flip after layout
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

function persistTweak(key, value) {
  window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*');
}

// ================= Edit mode bridge =================
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;
  if (e.data.type === '__activate_edit_mode') {
    state.tweaksOpen = true;
    const t = document.getElementById('tweaks');
    if (t) t.classList.add('open');
  } else if (e.data.type === '__deactivate_edit_mode') {
    state.tweaksOpen = false;
    const t = document.getElementById('tweaks');
    if (t) t.classList.remove('open');
  }
});

// Announce tweaks availability
setTimeout(() => window.parent.postMessage({ type: '__edit_mode_available' }, '*'), 100);

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme === 'dark' ? 'dark' : 'light');
}

// ================= Boot =================
applyTheme();
renderApp();

})();