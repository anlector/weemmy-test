# Handoff: WEEM Customer Journey Dashboard

## Overview

An analytics dashboard for **WEEM** that visualizes customer journeys stitched together from **RedTrack** tracking data. It helps a marketing operator answer questions like:

- Which ad sources and campaigns lead to actual purchases (not just clicks)?
- What does the full multi-touchpoint path look like for a given customer before their first order?
- How many fingerprints (anonymous identities) collapse into one known customer, and what's their total revenue?
- Where do people drop off in the conversion funnel?

The product centers on the concept of a **Journey Path** — an ordered sequence of touchpoints (Clicks, Actions/conversion events, Orders, Subscriptions) tied to a single RedTrack fingerprint, optionally linked to a known customer.

## About the Design Files

The files in `design_reference/` are a **prototype built in HTML/CSS/vanilla JS**. They exist to show intended look, layout, interactions, and data shape — **not to be shipped directly**. The task is to **re-implement these designs in a real codebase**, picking an appropriate framework (React, Vue, etc.) and applying that stack's established patterns (component boundaries, state management, styling system, routing, testing, etc.).

If you start from scratch, React + Vite + TypeScript is a reasonable default for this kind of data-dense internal tool. Tailwind or CSS variables with utility classes both work fine — the current design leans on CSS custom properties, which translates cleanly either way.

## Fidelity

**High-fidelity.** The prototype specifies final colors, typography, spacing, interaction affordances, and light/dark themes. Implementers should aim for pixel parity with the reference, not approximations.

## Tech stack of the reference

- Plain HTML (`index.html`-style entry point)
- Vanilla JS (`app.js` renders everything via template literals and re-renders on state change)
- CSS custom properties for theming (`styles.css`) — a single `[data-theme="dark"]` selector swaps tokens
- A custom date-range picker (`datepicker.js` + `datepicker.css`)
- Synthetic demo data (`data.js`) — this is the data model you'd swap for a real API

The reference is deliberately simple; don't take its rendering strategy (full-body `innerHTML` replacement) as a pattern to copy.

## Screens / Views

There's one main screen with four **tabs** and a **slide-in detail panel** on the right. The detail panel is a right-anchored drawer with a semi-transparent backdrop, 560px wide (see `styles.css` for exact measurements).

### 1. Header (persistent across all tabs)

- Teal (`#007892`) full-width bar, 60px tall
- **Brand block**: "W" logo mark (26px rounded white square with teal W) + wordmark "WEEM" and subtitle "Customer Journey"
- **Date range picker**: merged pill button (default) OR split From/To inputs (tweak). Clicking opens a two-month calendar popover with preset shortcuts (Today, Last 7 days, Last 30 days, This month, etc.)
- **Search input**: single-line, placeholder "email, IP, fingerprint, order ID…"
- **Theme toggle**: sun/moon icon, toggles `data-theme` on `<html>`
- **User chip**: initials avatar + first name

### 2. Tabs strip

Four tabs with counts:

- **Path Stops** — sequential journey analysis by first touchpoint source/campaign
- **Journey Paths** — list of every fingerprint's full journey, horizontally scrolling touchpoint cards
- **Orders** — flat table of all orders
- **Customers** — customers with rolled-up fingerprint count, order count, revenue

On the right of the tab strip: **"▸ Show Conversion Funnel"** button that expands a funnel chart above the content.

### 3. Filter Bar

Persistent under the tabs. One or more filter rows, each `WHERE/AND <field> <op> <value>`. Fields: First Source, Subsequent Source, Ad Campaign, Ref. Campaign, Device, State, Has Order. Operators: is / is not / contains.

- Custom-styled dropdowns (not native `<select>`) — see `enhanceSelects()` in `app.js`. Each opens a popover with colored dots for source options (Facebook blue, Google green, Tiktok black, etc.)
- **Apply filters** button (teal, primary) — turns "pending" state when a filter changes
- **Clear**, **+ Add filter**, and a hint: "AND logic. Apply to update the list."

### 4. Journey Paths tab (the most complex view)

Each row is a horizontal strip:
- **Left panel (168px wide)**: row number `#001`, touchpoint count chip `12 tp`, fingerprint ID chip (teal, clickable), date range, revenue, customer name + email (or "prospect · unattributed"), time-to-first-purchase badge `⏱ 3d to 1st purchase`
- **Right track**: horizontally scrolling row of **touchpoint cards**, one per event

**Touchpoint card types (colored borders + subtle gradient background):**
- `click` — blue border, light blue gradient
- `action` — orange border, warm gradient (ViewContent, AddtoCart, InitiateCheckout, etc.)
- `purchase` — green border, pale green gradient
- `subscription` — purple border, pale purple gradient
- `.first` — gold box-shadow ring around the 1st purchase
- `.pre` — muted background shade for pre-purchase cards
- `.muted` — 45% opacity for subscription recurring/shipping auto-events

**Click behavior (IMPORTANT — was revised):**
- Clicking the **left panel** (any no-cards area) OR the **fingerprint ID chip** → opens the **Journey Path detail**
- Clicking a **touchpoint card** → opens the **Touchpoint detail** (not the journey)
- Clicking the **customer name** link → opens the **Customer detail**

### 5. Path Stops tab

Grouped aggregation table, pivoted by first-touch source or campaign (mode toggle top-right).

- Rows: one per source (Facebook, Google, Organic, etc.) with journey count, horizontal bar graph, percentage
- **Stop 2 / Stop 3** columns are configurable — click the column header to open a popover that lets you pick a dimension (Source, Conv. Type, Purchase, Subscription) and value. The configured filter applies to all rows.
- Each row is expandable (caret on left) to reveal a sub-table of matching fingerprints with per-fp details

### 6. Orders tab

Flat table, one row per order. Columns: Date, Order ID, Customer, Source, Ref. Campaign, App, State, Value, Status, Fingerprint. Clicking the row opens the journey detail for that order's fingerprint.

### 7. Customers tab

One row per customer with rolled-up KPIs. Columns: Customer (avatar + name), Email, Customer ID, Fingerprints, Orders, Revenue, First Seen, Last Seen. Clicking a row opens the Customer detail.

### 8. Conversion Funnel (collapsible)

Horizontal stage-by-stage funnel: Clicks → ViewContent → AddtoCart → InitCheckout → Purchase → Subscription. Each stage shows count and a bar proportional to the max. Between stages: a chevron and drop-off percentage `-47%`.

### 9. Journey Path detail (drawer)

- **Head**: title "Journey Path" + fingerprint ID + source · city, state. Stat chips: Touchpoints, Clicks, Actions, Orders, Revenue
- **Customer card** (if linked): avatar, name, email, customer ID, time-to-first + revenue KPI boxes
- **All Touchpoints table**: chronological, with Type badge, Conv. Type, Date, Source, Ad Campaign, Creative, Device, State, IP, Order, Value, Payout, Status. Pre-purchase rows get a subtle blue tint; the 1st-purchase row gets a gold highlight.

### 10. Customer detail (drawer)

Same drawer structure. Sections in this order:

1. **Customer card** — avatar, name, email, customer ID, KPI boxes (fingerprints, orders, revenue)
2. **RedTrack Fingerprints** — all fingerprints linked to this customer, one row each with source, clicks/actions/orders/revenue/first-seen/last-seen
3. **Orders** — flat list of every order across all their fingerprints (added in revision)
4. **Full Journey · All Actions** — merged chronological list across all fingerprints with a "Fingerprint" column so you can tell which identity each event belongs to

### 11. Touchpoint detail (drawer)

- **Head**: kind label (Click / Action / Purchase / Subscription) + touchpoint index `#N` + link back to journey fingerprint. Stat chips: index of total, phase (Pre-purchase / 1st purchase / Post-purchase), value (if any)
- **Key-value grid**: two-column grid of every field recorded for that touchpoint (type, date, source, campaign, creative, placement, device, browser, OS, state, city, IP, order ID, value, payout, status, conv. type)
- **Related links**: "↗ Open full journey path" and "↗ Open customer"

### 12. Tweaks panel (dev-only affordance — may be omitted in production)

Floating right-bottom panel with: density (comfortable/compact), primary color picker, "show funnel by default" toggle, "show WEEM logo mark" toggle, date picker style (merged pill / split From-To). **Do not ship this**; it's a prototyping convenience.

## Data Model

The reference uses these shapes (see `data.js`):

```ts
type TouchpointType = 'c' | 'v' | 'o'; // click / view (action) / order

interface BaseRow {
  fp: string;            // RedTrack fingerprint ID (16-char alphanumeric)
  dt: Date;
  co: string;            // US state code
  ci: string;            // city
}

interface ClickRow extends BaseRow {
  t: 'c';
  src: string;           // 'Facebook' | 'Google' | 'Tiktok' | 'Organic' | 'Direct' | 'Email' | 'Bing'
  cmp: string;           // ad campaign name
  adgrp: string;
  s4: string;            // creative id
  placement: string;
  dev: string;           // 'Mobile' | 'Desktop' | 'Tablet'
  br: string;            // browser
  os: string;
  ip: string;
}

interface ActionRow extends BaseRow {
  t: 'v';
  vt: 'ViewContent' | 'AddtoCart' | 'InitiateCheckout' | 'Purchase' | 'Shipping' | 'Recurring' | 'LPCustomClicks';
  src: string;
  cmp: string;
  pay: number;           // affiliate payout
  dev: string;
  br: string;
  os: string;
}

interface OrderRow extends BaseRow {
  t: 'o';
  oid: string;           // '#WEEM-123456'
  pr: number;            // price
  st: 'FULFILLED' | ...;
  cid: string;           // customer ID
  nm: string;            // customer name
  em: string;            // customer email
  rcmp: string;          // referral campaign
  app: 'Online Store' | 'Recharge Subscriptions';
  cur: 'USD';
}

interface Journey {
  fp: string;            // fingerprint
  rows: Row[];           // chronological
  custName?: string;
  custEmail?: string;
  cid?: string;
  source: string;
  campaign: string;
  state: string;
  city: string;
  // derived:
  count: number;
  clicks: number;
  convs: number;
  orders: number;
  revenue: number;
  firstDate: Date;
  lastDate: Date;
  firstOrderTs: number | null;
  ttfp: string | null;   // '<1m' | '12m' | '3h' | '5d'
  hasOrder: boolean;
  hasConv: boolean;
}
```

A **Customer** is just the collapsed view over journeys sharing the same `cid`. A **subscription** is an order where `app === 'Recharge Subscriptions'`.

## Design Tokens

All tokens are defined in `:root` and overridden under `[data-theme="dark"]` in `styles.css`. Implementers should centralize these as a theme object.

### Brand

| Token | Light | Dark |
| --- | --- | --- |
| `--teal` | `#007892` | `#18a0bd` |
| `--teal-600` | `#006578` | `#14879f` |
| `--teal-700` | `#005e6f` | `#0f6f85` |
| `--teal-08` | `rgba(0,120,146,0.08)` | `rgba(24,160,189,0.10)` |
| `--teal-12` | `rgba(0,120,146,0.12)` | `rgba(24,160,189,0.16)` |
| `--teal-18` | `rgba(0,120,146,0.18)` | `rgba(24,160,189,0.22)` |
| `--teal-35` | `rgba(0,120,146,0.35)` | `rgba(24,160,189,0.38)` |

### Surfaces

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | `#eef1f3` | `#0c1216` |
| `--surface` | `#f8faf9` | `#141b21` |
| `--surface-2` | `#f1f4f4` | `#0f161b` |
| `--border` | `#dde3e5` | `#23303a` |
| `--border-strong` | `#c8d0d3` | `#334450` |
| `--divider` | `#e4e9eb` | `#1c262f` |

### Text (ink)

| Token | Light | Dark |
| --- | --- | --- |
| `--ink` | `#13212d` | `#e6edf3` |
| `--ink-2` | `#475662` | `#b6c2cd` |
| `--ink-3` | `#7b8691` | `#8795a2` |
| `--ink-4` | `#a6afb7` | `#5d6975` |

### Semantic

| Purpose | Light FG | Light BG | Dark FG | Dark BG |
| --- | --- | --- | --- | --- |
| Info (click) | `#2d6cdf` | `#e8f0fb` | `#6aa4ff` | `rgba(106,164,255,0.08)` |
| Warning (action) | `#d97706` | `#fbf1e3` | `#f0a24a` | `rgba(240,162,74,0.08)` |
| Success (purchase) | `#059669` | `#e5f4ec` | `#4ecb8c` | `rgba(78,203,140,0.10)` |
| Special (subscription) | `#7c3aed` | `#efecfa` | `#a78bfa` | `rgba(167,139,250,0.10)` |
| First-purchase (gold) | `#d99023` / bg `#f7ecd0` / ink `#7d4b0c` | — | `#f5b83a` / `rgba(245,184,58,0.14)` / `#f5b83a` | — |

### Card border colors (kept per user preference)

- `.tp-card.click` border `#cfe2ff`
- `.tp-card.action` border `#fde6c6`
- `.tp-card.purchase` border `#bfe7d1`
- `.tp-card.subscription` border `#ddd3f7`

### Typography

- Sans: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` with feature settings `'cv02','cv03','cv04','cv11','tnum'`
- Mono: `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace`
- Base size: `13px` (comfortable density) / `12px` (compact)
- Line-height: `1.45`

### Shadows

Light:
- `--shadow-sm`: `0 1px 2px rgba(19,33,45,0.04), 0 1px 3px rgba(19,33,45,0.05)`
- `--shadow-md`: `0 2px 6px rgba(19,33,45,0.05), 0 8px 24px rgba(19,33,45,0.07)`
- `--shadow-lg`: `0 10px 40px rgba(19,33,45,0.10), 0 30px 80px rgba(19,33,45,0.13)`

Dark (deeper):
- `--shadow-sm`: `0 1px 2px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)`
- `--shadow-md`: `0 4px 10px rgba(0,0,0,0.4), 0 12px 28px rgba(0,0,0,0.35)`
- `--shadow-lg`: `0 12px 44px rgba(0,0,0,0.5), 0 32px 84px rgba(0,0,0,0.45)`

### Spacing

Not formalized in the prototype — `padding` and `gap` values range `2px, 4px, 6px, 8px, 10px, 12px, 14px, 16px, 20px, 24px, 40px`. A 4px-base scale (`0, 4, 8, 12, 16, 20, 24, 32, 40`) reproduces everything cleanly.

### Radii

- Small chips/badges: `4px`
- Cards and inputs: `6px`
- Larger cards / panels: `8px`
- Touchpoint cards: `8px`
- Detail drawer: `0` (full-height from top)

## Interactions & Behavior

- **Drawer open/close**: slides in from right with backdrop fade (200ms). Clicking backdrop or the `×` button closes it.
- **Tab switch**: instant, persisted in `localStorage` (`weem.tab`)
- **Theme toggle**: instant, persisted in `localStorage` (`weem.theme`)
- **Filter change**: marks Apply button "pending" (different visual state) until clicked; clicking swaps button to "Applied ✓" for 1.2s
- **Stop row expand**: toggles a sub-row beneath the main row showing matching fingerprints
- **Stop column configure**: popover anchored to column header with Dimension + Value selects and Clear/Apply actions
- **Journey row click distinction**: see section 4 above — card click vs. left-panel click routes to different detail views
- **Custom dropdowns**: native `<select>`s are enhanced into button + popover. Native select still backs the value and `change` events, so form libraries work transparently. Source options get colored dots per brand.
- **Date picker**: two-month calendar with hover-range preview, preset shortcuts, and clamped "today" marker. See `datepicker.js`.

### Keyboard

- Custom dropdowns: ArrowUp/Down to move focus, Enter to commit, Escape to close
- Drawer: Escape should close (not implemented in reference — implement in your port)

## State Management

The reference uses a single `state` object (see top of `app.js`). The shape maps cleanly to React reducer / Zustand / Pinia:

```ts
interface AppState {
  tab: 'stops' | 'paths' | 'orders' | 'customers';
  theme: 'light' | 'dark';
  sort: 'lastDate' | 'firstDate' | 'count' | 'revenue';
  detail:
    | { type: 'journey'; fp: string }
    | { type: 'customer'; cid: string }
    | { type: 'touchpoint'; fp: string; idx: number }
    | null;
  stop1: 'source' | 'campaign';
  stop2: { label: string } | null;
  stop3: { label: string } | null;
  expandedStops: Set<string>;
  filters: Array<{ field: string; op: 'eq' | 'neq' | 'contains'; value: string }>;
  funnelOpen: boolean;
  tweaksOpen: boolean;
  dateFrom: string; // 'MM/DD/YYYY'
  dateTo: string;
}
```

Persist `tab` and `theme` to localStorage. Everything else is session state.

## Data Fetching

The reference uses static synthetic data. In a real implementation:

- `GET /journeys?from=&to=&filters=` returns an array of `Journey`
- `GET /customers/:cid` returns customer + all their journeys
- `GET /orders?from=&to=` for the Orders tab

Fingerprint ↔ customer linking is done server-side (RedTrack's job).

## Assets

No external images or icons. All iconography is inline SVG (header icons, calendar, caret, sort indicators, etc.). Fonts are loaded from Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

## Files in this handoff

```
design_handoff_weem_journey/
├── README.md                              ← you are here
├── design_reference/
│   ├── WEEM Customer Journey Dashboard.html
│   ├── app.js          ← all rendering + state + event handlers
│   ├── data.js         ← synthetic journey data + fmtDate helper
│   ├── datepicker.js   ← custom date-range picker
│   ├── datepicker.css
│   └── styles.css      ← all tokens + component styles, light + dark
└── screenshots/
    ├── 01-journey-paths.png         ← Journey Paths tab (default view)
    ├── 02-path-stops.png            ← Path Stops tab with expand
    ├── 03-orders.png                ← Orders tab
    ├── 04-customers.png             ← Customers tab
    ├── 05-customer-detail.png       ← Customer drawer (fingerprints + orders + full journey)
    ├── 06-journey-detail.png        ← Journey Path drawer (all touchpoints table)
    ├── 07-touchpoint-detail.png     ← Touchpoint drawer (kv-grid + related links)
    ├── 08-funnel.png                ← Funnel expanded above Journey Paths
    ├── 09-dark-mode-paths.png       ← Dark theme, Journey Paths
    └── 10-dark-mode-customer-detail.png  ← Dark theme, Customer drawer
```

## Implementation notes / gotchas

1. **The reference re-renders the entire `<body>` on every state change.** Do not copy this. Use your framework's diffing. The event handlers are re-bound from scratch each render in the reference (`bind()`), which is only survivable because the app is small.
2. **Scroll positions** inside `.tp-track` (horizontal touchpoint scroll) will reset on full re-render. Preserve them with refs in your port.
3. **The Tweaks panel talks to a parent window via `postMessage`** — that's specific to the prototyping environment. Remove it in production.
4. **`data.js` uses `Math.random()` for IP addresses, creative IDs, etc.** Real data will have stable values; nothing in the UI depends on randomness.
5. **Hardcoded dark-theme overrides exist for a few spots** (e.g. `.tp-table tbody tr.pre:hover td`). If you change the light palette, check for `[data-theme="dark"]` overrides in `styles.css` and keep them in sync.
6. **The custom dropdown wrapper** (`enhanceSelects`) relies on DOM mutation of native `<select>`. In a component framework, build this as a first-class `<Select>` component instead — no need to wrap a native element.
7. **Drawer width is fixed 560px**; on narrow viewports it should go full-width. The reference does not implement responsive drawer behavior — add it.
