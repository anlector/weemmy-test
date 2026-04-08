---
name: customer-journey-v2
description: >
  Use this skill whenever the user is working on the Weemco Customer Journey dashboard — building features, investigating attribution issues, analyzing journeys, designing data models, or making architecture decisions. Trigger on phrases like "customer journey", "journey dashboard", "journey path", "fingerprint", "Weem Fingerprint", "attribution", "RedTrack", "touchpoints", or any reference to tracking how customers interact with Weemco before purchasing. Also trigger when the user shares data or asks Claude to help investigate a specific user's journey. This is a full project companion skill — use it for building, tracking progress, analyzing data, and making decisions.
---

# Customer Journey Dashboard — Project Companion

You are a knowledgeable collaborator on Weemco's Customer Journey dashboard project. You understand the vision, the data model, the tech stack, and the current state of the build. Use this context to give informed, consistent help across all sessions.

---

## Project Vision

The Customer Journey dashboard exists to visualize the complete history of every person's interactions with Weemco — not just paying customers, but anyone who touched the funnel, including prospects whose journey ended without a purchase.

The core goal: understand how people arrive, what they do, and why some convert while others don't — by seeing the full raw path, not summaries.

**This is NOT a reporting or analytics tool.** It is an investigation tool — a map. As Mendel put it: "We're not building summaries. We're building a map. We need to build the route the customer took, how they got there." It should let the team drill into individual journeys, spot attribution failures, and connect data points that the tracking system (RedTrack) has fragmented.

---

## Key Concepts & Data Model

### Journey (full)
The complete history of a person's interactions with Weemco across ALL their RedTrack fingerprints — every click, conversion, order, and touchpoint, from first contact to last. One person = one full journey (eventually).

### Journey Path
A sequence of touchpoints under **one specific RedTrack fingerprint**. One person can have multiple journey paths because:
- They used different devices or browsers
- RedTrack automatically expires and reissues fingerprints after a period of time
- Any tracking discontinuity creates a new fingerprint

**Relationship:** Full Journey = one or more Journey Paths, stitched together via the Weem Fingerprint.

### RedTrack Fingerprint
RedTrack's identifier for a user session/device. The root cause of fragmentation — the same physical person may have 2, 5, or more RedTrack fingerprints, making their journey appear "unattributed" or broken.

### Weem Fingerprint
A new unified identifier being built by Weemco to connect all of a person's RedTrack fingerprints, Shopify orders, and other records into a single identity.
- **How it's built:** Andrii manually tags example records in Airtable (e.g. "Example 1" = Karen Chamberlain's records). These manual examples become the blueprint Slava uses to build the automated assignment logic across the full database.
- **Matching signals:** IP address, device fingerprint, email, zip code/address

### Touchpoint
A single recorded interaction — a click, a conversion event (add to cart, checkout, subscription, etc.), or an order. Each touchpoint belongs to one Journey Path (one RedTrack fingerprint).

### Touchpoint types
- **Click** — ad click tracked by RedTrack
- **Conversion** — any conversion event: Add to Cart, Checkout, Initial, Shipping, Subscription (= purchase)
- **Order** — Shopify order data

### Data Record Schema (as implemented in the HTML dashboard)

All records live in a single flat array (`RAW`), differentiated by the `t` (type) field. The `fp` (RedTrack fingerprint) field is the spine that links clicks, conversions, and orders into journey paths.

**Common fields (all record types):**
- `t` — type: `"c"` (click), `"v"` (conversion), `"o"` (order)
- `fp` — RedTrack fingerprint (the key linking field)
- `dt` — datetime
- `co` — country
- `ci` — city

**Order records (`t: "o"`):**
- `oid` — Shopify order ID
- `pr` — price / order value
- `st` — status (e.g. "FULFILLED")
- `cid` — Shopify customer ID
- `nm` — customer name
- `em` — customer email
- `fsrc` / `fmed` — first source / first medium
- `lsrc` / `lmed` — last source / last medium
- `rcmp` — referring campaign (e.g. "FB Traffic to Shopify", "PMAX campaign to WEEM Branded")
- `app` — originating app (e.g. "Recharge Subscriptions", "Shop")
- `addr` — address
- `zip` — zip code
- `cur` — currency (e.g. "USD")

**Click records (`t: "c"`):**
- `src` — traffic source
- `cmp` — campaign
- `dev` — device
- `br` — browser
- `os` — operating system
- `s1`, `s2`, `s3` — sub-parameters (tracking sub-IDs)
- `s4` — creative name (labeled "Creative" in the UI)
- `s5`, `s6` — additional sub-parameters

**Conversion records (`t: "v"`):**
- `vt` — conversion type (e.g. "InitiateCheckout", "ViewContent", "AddtoCart", "Purchase", "Subscription", "Recurring", "Upsell", "Shipping", "LPCustomClicks", "conversion")
- `src` — source
- `cmp` — campaign
- `pay` — payout value
- `dev` — device
- `br` — browser
- `os` — operating system

### Data Flow (current — CSV-based, being replaced)
1. Data is loaded from CSV via PapaParse, with IndexedDB caching. The CSV is a "wide format" file with 192 semicolon-delimited columns containing Shopify order, RedTrack conversion, and click data.
2. The `Dashboard` class processes records on load: filters by type, groups by fingerprint into journey paths, aggregates by customer ID
3. Pagination, sorting, and filtering all happen client-side (all data is in memory)

### Data Flow (planned — GraphQL API)
The CSV-based approach is being replaced with live GraphQL API calls to `api-aggregator.weem.com/graphql`. The key architectural decision (agreed March 30, 2026 call between Andrii and Slava): **there is no single universal query.** Each dashboard tab has its own endpoint, with server-side pagination, sorting, and filtering.

**Five GraphQL endpoints (defined in requirements doc v1, March 2026):**

1. **getFingerprints** — Primary query for Journey Paths tab. Returns paginated list of fingerprints, each with ALL its touchpoints nested (full raw data, not summaries). The frontend renders touchpoint cards and calculates aggregations (counts, revenue, dates, customer info) from this nested data. Clicking a Journey Path row reads from the already-loaded data — no second API call needed.

2. **getFingerprintTouchpoints** — Returns all touchpoints for one fingerprint. Used ONLY for cross-tab drill-downs (e.g., user is on Orders tab, clicks a fingerprint link to see the journey). NOT used on the Journey Paths tab itself (that data comes from getFingerprints).

3. **getShopifyOrders** — Paginated list of orders for the Orders tab. Includes nested customer data. Also usable from the Customers tab context via a customerId filter.

4. **getShopifyCustomers** — Paginated list of customers for the Customers tab. Already exists in the API but needs sorting and additional filter support added by Slava.

5. **getCustomerTouchpoints** — All touchpoints across ALL fingerprints for one customer. Used when clicking a customer name from any tab — opens side panel showing the complete customer journey spanning multiple fingerprints.

**Supporting query:** `getRedtrackCampaigns` — already exists, returns list of campaign IDs/titles for filter dropdowns.

**Authentication:** `login` mutation returns `accessToken`, passed as `Authorization: Bearer <token>` header. Token stored in memory only (not localStorage). Dashboard shows a login form on load.

**Full requirements document:** `Customer_Journey_Dashboard_API_Requirements_v1.docx` — contains complete query signatures, response types, filter schemas, sorting options, and implementation priority for all five endpoints. This document is the spec for Slava.

---

## Dashboard UI Requirements

### Tab Structure (3 tabs)
1. **Journey Paths** (default/primary tab) — fingerprints with horizontal touchpoint cards
2. **Orders** — Shopify orders list
3. **Customers** — Shopify customers list

The old "Journeys" tab has been removed — it was redundant with Journey Paths. `switchTab()` index map: `{route:0, orders:1, customers:2}`.

### Primary View: Journey Paths
**Each row** = one RedTrack fingerprint (journey path). **Each column** = one sequential touchpoint, left to right, chronological. Raw individual events, not summaries.

The left column (160px) shows: row number, touchpoint count, date range (first to last), total revenue (green), customer name/email (clickable links). The main area shows touchpoint cards (min-width 210px, max-width 260px) with type-specific content:
- **Click cards:** source, campaign, ad group, creative (s4), placement
- **Conversion cards:** type (important!), source, campaign, payout
- **Order cards:** order ID (clickable link), value, status, campaign, customer name

Sort bar with dropdown: lastDate, firstDate, count, revenue, custName.

### Side Panel (Detail View)
Opens on row click. Width: 75vw (85vw tablet, 100% mobile). Shows touchpoints in a **table format** (`tp-table` class) with columns: #, Type, Conv. Type, Date, Source, Campaign, Ad Group, Creative, Sub5, Sub6, Device, Browser, OS, Country, City, IP, Order, Customer, Payout, Value, Status. All touchpoint types (CLICK, CONV, ORDER) are mixed together chronologically. Type-specific columns show data only for relevant types (e.g., Order columns are empty for click rows). Clicking any row opens the full touchpoint detail (`showTouchpoint()`). Rows highlight on hover (`background:#f0f4ff`).

**Customer detail panel** (`showCustomer()`) shows: Profile card, Order summary cards, then an "All Actions" tp-table with every touchpoint across all the customer's journey paths, sorted chronologically. Blue separator rows visually distinguish different fingerprints. An extra "Fingerprint" column links back to each journey path.

Field configurator with localStorage persistence allows users to show/hide columns, grouped by: Core, Attribution, Device, Location, Customer, Conversion, Order, Raw prefixed groups.

**Auto-fit columns:** The `autoFitColumns()` function measures natural content widths by temporarily removing `max-width:0` from td cells, switching to `table-layout:auto`, measuring via `getBoundingClientRect()` (clamped 50–400px), then applying `table-layout:fixed` with those widths. Called via `makeContainerResizable()` and `makePanelResizable()`, wrapped in double `requestAnimationFrame` to ensure the browser has painted innerHTML before measuring. Columns are also manually resizable via drag handles (`makeResizable()`).

### Side Panel Drill-Down Logic (important!)
- **From Journey Paths tab:** Click a row → side panel reads from already-loaded nested touchpoint data from getFingerprints (NO API call)
- **From Orders tab:** Click a fingerprint link → calls `getFingerprintTouchpoints` → shows journey in side panel
- **From Customers tab:** Click a customer name → calls `getCustomerTouchpoints` → shows all touchpoints across all their fingerprints in side panel
- **From any tab:** Clicking a customer or order link opens data in the SAME side panel — NO tab switching

### Filter Architecture (two levels)
**Level 1 — Global Date Range (top bar):** Applies to all tabs. Default: last 7 days. Persists when switching tabs. Passed as `dateRange` parameter to every query. An "Apply" button triggers the query.

**Level 2 — Per-Tab Filters (below tab bar):** AirTable-style filter builder. User picks a field from that tab's entity, picks an operator (equals, contains, greater than, between, etc.), enters a value. Multiple filter rows can be stacked with AND logic (MVP). Different available fields per tab. Filters reset when switching tabs.

**MVP filter fields per tab:**
- Journey Paths: source, campaign, country, customerEmail, hasOrders
- Orders: status, customerEmail, customerName, campaign, minPrice/maxPrice
- Customers: name, email, hasOrders

All filtering is server-side — the frontend sends filter parameters to the API.

### Sorting
**Server-side** for paginated tab lists (the frontend only has 20 records per page, so sorting must happen before pagination on the backend).
**Frontend-side** only for side panel detail views (where all touchpoints for one entity are loaded).

Sort options per tab:
- Journey Paths: lastDate (default DESC), firstDate, touchpointCount, revenue, customerName
- Orders: createdAt (default DESC), price, status, customerName
- Customers: createdAt (default DESC), name, orderCount, totalRevenue

### Pagination
Server-side with `limit`/`offset`. Default 20 items per page. `hasMore` boolean always returned for Next/Previous buttons. `total` count is expensive for large date ranges:
- Up to 7 days: return exact total (acceptable query time ~5 seconds)
- 8-14 days: attempt, return null if timeout exceeded
- 15+ days: return null; frontend shows "1000+ results" or similar
Counting unique fingerprints across the full DB takes ~2 hours — this is the known bottleneck.

### Search & Investigation
Users must be able to search across: email, IP address (across both click IP and conversion IP fields), RedTrack fingerprint ID, Weem Fingerprint ID, zip code/address. Search is implemented as filter fields on the backend. This is critical for manually linking fingerprints — the core investigation workflow.

### Fingerprint Linking
When viewing a journey path, there should be a way to see if this fingerprint is connected to others (same person, different fingerprint) and navigate between them.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend / Dashboard | HTML + vanilla JS (single-file app, transitioning to multi-file) |
| API | GraphQL at `api-aggregator.weem.com/graphql` |
| Previous frontend (legacy) | Bubble (no-code) — Andrii's primary background |
| Database | PostgreSQL on DigitalOcean (3 separate DBs: Shopify in Sasha's DB, RedTrack in Slava's DB, Facebook separate) |
| Search engine | ElasticSearch (Slava's, for fast aggregations — not production-ready yet) |
| Attribution / tracking | RedTrack |
| Orders | Shopify |
| Fingerprint examples / tagging | Airtable |
| Backend / data pipeline | Built by Slava |
| Dev environment | Cursor + Anthropic API key (Sonnet/Opus) + Live Server extension |
| Version control | GitHub (`anlector/weemmy-test` repo, connected to Cursor) |
| Deployment (current) | GitHub Pages (`anlector.github.io/weemmy-test`) |
| Deployment (planned) | Behind Bubble app auth or private domain |

### Dev Environment Details
- **Cursor** is configured on Andrii's machine with Weem's Anthropic API key for Claude Sonnet/Opus
- **Live Server** VS Code extension provides real-time browser preview on save
- Andrii's workflow: describe changes in plain English via Cursor Agent mode, review diffs, accept
- GitHub repo set up and connected to Cursor for cross-device sync
- Andrii comes from a Bubble/no-code background, so AI-assisted editing (describe changes in natural language) is the primary workflow
- **Cowork (Claude desktop)** is used for architecture planning, writing Cursor prompts, analyzing data, and creating requirements documents

### Database Architecture (important context)
- Shopify data lives in Sasha's database — Slava treats it as a black box (can read, won't modify)
- RedTrack clicks and conversions live in Slava's database
- Facebook data is in a separate database
- `api-aggregator.weem.com` is the GraphQL layer that joins data across all three databases
- The search engine (ElasticSearch) can do aggregations in <1 second (e.g., counted 5.2M conversions in 400ms) but has sync reliability issues — not production-ready

### Data Volumes (as of March 2026)
- ~96,000 clicks/day
- ~39,000 conversions/day
- ~5.2 million total conversions
- ~735,000 total Shopify customers
- Approaching 100 million total records across all tables
- Counting unique fingerprints: ~2 hours (the major bottleneck)

---

## Team

- **Andrii** — builds the dashboard (HTML/JS via Cursor + Claude), writes GraphQL queries, designs architecture. Primary background is Bubble/no-code. Primary user of this skill.
- **Mendel** — CEO; defines product vision and priorities. Wants AirTable-style filtering and full data visibility.
- **Slava** — backend engineer; builds GraphQL API endpoints, manages databases, search engine, and Weem Fingerprint automation
- **Sasha** — manages Shopify database and integrations
- **Prasad** — media buyer; also uses the MediaBuying dashboard

---

## Current State (as of April 2026)

### What exists — the HTML Dashboard (`customer_journey_dashboard.html`)
A functional single-file HTML dashboard built with Claude, now hosted on GitHub Pages.

**Three tabs:**
1. **Journey Paths** (default) — horizontal layout with touchpoint cards per fingerprint row. Left column shows row number, touchpoint count, date range, revenue, customer name/email. Main area shows type-coded cards (blue=click, orange=conversion, green=order) with creative names (s4/s5/s6).
2. **Orders** — sortable table of Shopify orders with auto-fit columns
3. **Customers** — customers aggregated by customer ID with auto-fit columns

**Detail panel (slide-over from right, 75vw):**
- Opens on row click from Journey Paths, or via fingerprint/customer/order links from any tab
- Table format (`tp-table`) with all touchpoint types mixed chronologically
- Columns: #, Type, Conv. Type, Date, Source, Campaign, Ad Group, Creative, Sub5, Sub6, Device, Browser, OS, Country, City, IP, Order, Customer, Payout, Value, Status
- Clickable rows open full touchpoint detail (`showTouchpoint()`)
- Hover highlighting on rows
- Auto-fit columns on render (no button needed)
- Field configurator for column visibility (localStorage persistence)
- Customer detail view shows "All Actions" table across all fingerprints with blue separator rows
- Cross-linking: fingerprints link to journey path table, orders/customers link to their detail views

**Filters (current CSV-based implementation):**
- Date range filter (Stage 1 — filters individual records)
- Search filter (Stage 1 — filters individual records)
- "First Source" and "Subsequent Source" multi-select dropdowns (Stage 2 — filters journey paths AFTER `buildJourneys()`, preserving complete touchpoint data within rows)
- Campaign and Country single-select dropdowns (Stage 2)
- Case-insensitive deduplication in all filter dropdowns

**Two-stage filter architecture (important):** Stage 1 filters individual records (date range + search only). Stage 2 filters journey paths after `buildJourneys()` (source, campaign, country). This separation is critical — filtering at Stage 1 would strip touchpoints from journey rows, breaking the visualization.

**Data loading (current):** CSV via PapaParse with IndexedDB caching. CSV URL passed via query string parameter.

**Key methods in Dashboard class:** `renderRoute()` (Journey Paths view), `renderOrders()`, `renderCustomers()`, `showJourneyPathsTable(fp)` (table in side panel), `showCustomer(cid)` (all-actions table), `showTouchpoint(fp, index)` (single touchpoint detail), `showOrder(oid)`, `navigateToFingerprint(fp)`, `navigateToOrder(oid)`, `navigateToCustomer(cid)`, `parseDate()`, `compareDates()`, `autoFitColumns()` (standalone function)

**Built with:** vanilla JS (no framework), CSS custom properties. Single `Dashboard` class.

**GitHub:** `anlector/weemmy-test` repo, deployed to GitHub Pages

### Critical code pattern — `this.` vs `D.`
Inside Dashboard class methods, always use `this.methodName()`. Never use `D.methodName()` inside class methods because `window.D` is not assigned until after the constructor completes. `D.` is ONLY safe inside HTML onclick strings (e.g. `onclick="D.showJourney('${fp}')"`). This has caused multiple bugs and must be included as a warning in every Cursor prompt.

### Known issues
- Filters only work for journeys, not cascaded to orders/customers
- "Unattributed" traffic is common due to RedTrack fingerprint fragmentation
- Currently CSV-based — needs migration to live GraphQL API
- File is too large (4.6MB with data) for GitHub web viewer
- Cross-source journeys are rare in the data (only 77 out of 10,082) because one RedTrack fingerprint = one click session = typically one source

### Weem Fingerprint status
- Concept defined and agreed upon
- First manual example: Karen Chamberlain (27 orders, multiple fingerprints linked by IP)
- Andrii to tag her records in Airtable as "Example 1"
- Slava to build automated logic from these examples — not started yet
- Estimated effort for automated fingerprint assignment: 2+ weeks, plus ongoing maintenance if logic changes

### Key insight from Karen Chamberlain investigation
Searching by click IP successfully linked an "unattributed" click to an attributed purchase — proving that IP-based matching can stitch fragmented fingerprints. RedTrack had assigned two separate fingerprints to the same user, causing one to appear "unattributed." The UTM parameter "daily health benefits" (DHB) was a clue that the traffic originated from a known Weemco source.

---

## GraphQL API Migration Plan

### Implementation Phases (agreed March 30 call)

**Phase 1: getFingerprints + getFingerprintTouchpoints** (highest effort)
The core of the dashboard. Fingerprint as primary entity requires new indexing on Slava's side. This is the most important and hardest endpoint to build. Must return full nested touchpoint data per fingerprint.

**Phase 2: getShopifyOrders** (medium effort)
New endpoint, but straightforward — Shopify orders are already well-structured in the DB.

**Phase 3: getShopifyCustomers enhancements** (low effort)
Endpoint exists. Add sortBy/sortOrder parameters and new filter fields.

**Phase 4: getCustomerTouchpoints** (medium effort)
Requires resolving customer → all fingerprints → all touchpoints. Reuses logic from Phase 1.

After each phase, the corresponding dashboard tab can be tested with live data before moving to the next.

### Requirements Document
Full API specification: `Customer_Journey_Dashboard_API_Requirements_v1.docx` — contains complete query signatures, response types, filter input schemas, sorting enums, pagination strategy, total count strategy, and open questions for Slava.

---

## Build Priorities (updated April 2026)

1. **GraphQL API endpoints** — Slava builds the 5 endpoints per requirements doc ← CURRENT PRIORITY
2. **Dashboard API integration** — Replace CSV loading with GraphQL calls, add login form, per-tab queries
3. **Server-side filters** — Implement two-level filter architecture (global date range + per-tab AirTable-style)
4. **Server-side sorting** — Add sort parameters to paginated queries
5. ~~Remove old Journeys tab~~ — DONE (April 2026)
6. **Universal search** — email, IP, fingerprint ID, zip (implemented as backend filters)
7. **Fingerprint linking UI** — connect and navigate between related fingerprints
8. **Deploy behind auth** — Move off GitHub Pages to private domain behind Bubble app auth
9. **Weem Fingerprint automation** (Slava's work, based on Airtable examples)

### Recently completed (April 2026 sprint)
- Date parsing fix — handles Unix timestamps, ISO, DD/MM/YYYY formats
- Creative names (s4/s5/s6) added to touchpoint cards and tables
- First Source / Subsequent Source multi-select filters with two-stage filtering
- Auto-fit columns on all tables (with double-rAF timing fix)
- Customer all-actions table view replacing old timeline
- Conv. Type column in all tp-tables
- Hover highlighting on table rows
- Removed redundant Journeys tab

**Important:** Do not connect live GraphQL API until the dashboard is deployed behind authentication — the data contains real customer PII (names, emails, order IDs).

---

## How to help

When the user brings a question or task, use this context to:
- **Building features:** Understand what they're trying to build and why. Suggest approaches that fit the HTML/JS + GraphQL stack (Andrii edits via Cursor + Claude AI assist). The Journey Paths view with live API data is the current north star.
- **Writing Cursor prompts:** Andrii often asks for detailed prompts to paste into Cursor Agent mode. These should be specific, include file references, and describe exactly what code to write/change.
- **API integration:** When working on connecting GraphQL endpoints, reference the requirements doc and the endpoint signatures defined there. Ensure the frontend data model stays compatible.
- **Data investigation:** When the user shares data or a specific user's journey, help spot patterns, attribution gaps, or fingerprint fragmentation. Think about what signals (IP, device, email) could link records.
- **Architecture decisions:** Help think through data model choices, especially around the Weem Fingerprint logic and API design. Reference the decisions from the March 30 call with Slava.
- **Progress tracking:** If the user asks what's next or what's been decided, summarize the current state and priorities from this document.

Always keep the core goal in mind: **see the full raw path of every person, connect fragmented fingerprints, and understand why attribution fails.**
