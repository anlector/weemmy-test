/* WEEM Date Range Picker
   Exposes: window.WeemDatePicker = {
     open(opts), close(),
     parse(mmddyyyy), format(date),
     getPreset(key, today), presets: [...],
   }
*/
(function(){
  const PRESETS = [
    { key: 'today',       label: 'Today' },
    { key: 'yesterday',   label: 'Yesterday' },
    { key: 'last7',       label: 'Last 7 days' },
    { key: 'last14',      label: 'Last 14 days' },
    { key: 'last30',      label: 'Last 30 days' },
    { key: 'thisWeek',    label: 'This week' },
    { key: 'thisMonth',   label: 'This month' },
    { key: 'custom',      label: 'Custom' },
  ];

  function pad(n){ return (n<10?'0':'')+n; }
  function format(d){
    if(!d) return '';
    return pad(d.getMonth()+1)+'/'+pad(d.getDate())+'/'+d.getFullYear();
  }
  function parse(s){
    if(!s) return null;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
    if(!m) return null;
    const d = new Date(+m[3], +m[1]-1, +m[2]);
    return isNaN(d) ? null : d;
  }
  function startOfDay(d){ const n = new Date(d); n.setHours(0,0,0,0); return n; }
  function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function addMonths(d, n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function sameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function sameYM(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth(); }
  function getPreset(key, today){
    const t = startOfDay(today || new Date());
    switch(key){
      case 'today':     return { from: t, to: t };
      case 'yesterday': { const y = addDays(t,-1); return { from: y, to: y }; }
      case 'last7':     return { from: addDays(t,-6), to: t };
      case 'last14':    return { from: addDays(t,-13), to: t };
      case 'last30':    return { from: addDays(t,-29), to: t };
      case 'thisWeek': {
        // Monday start
        const day = t.getDay(); // 0=Sun..6=Sat
        const delta = (day === 0 ? -6 : 1 - day);
        const mon = addDays(t, delta);
        return { from: mon, to: t };
      }
      case 'thisMonth': return { from: startOfMonth(t), to: t };
      default: return null;
    }
  }
  function detectPreset(from, to, today){
    const t = startOfDay(today || new Date());
    for (const p of PRESETS){
      if (p.key === 'custom') continue;
      const r = getPreset(p.key, t);
      if (r && sameDay(r.from, from) && sameDay(r.to, to)) return p.key;
    }
    return 'custom';
  }

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const WEEKDAYS_MON = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let active = null;

  function close(){
    if (!active) return;
    const { pop, onDoc, onKey, onScroll } = active;
    document.removeEventListener('mousedown', onDoc, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', onScroll, true);
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    if (active.onClose) active.onClose();
    active = null;
  }

  /**
   * open({
   *   anchor: HTMLElement,
   *   alignTo: 'anchor' | {left,top,right,bottom}, // optional
   *   from: Date, to: Date,
   *   focus: 'from' | 'to', // which side the user clicked
   *   today: Date,
   *   onChange: (from, to) => void,   // live, as user picks
   *   onApply: (from, to) => void,
   *   onCancel: () => void,
   *   onClose: () => void,
   * })
   */
  function open(opts){
    close();
    const pop = document.createElement('div');
    pop.className = 'dr-pop';
    document.body.appendChild(pop);

    const today = startOfDay(opts.today || new Date());
    let from = opts.from ? startOfDay(opts.from) : today;
    let to   = opts.to ? startOfDay(opts.to) : from;
    if (to < from) { const x = from; from = to; to = x; }
    let focus = opts.focus || 'from'; // next click sets this side
    // View anchors for two calendars
    let leftView  = startOfMonth(from);
    let rightView = startOfMonth(to);
    if (sameYM(leftView, rightView)) rightView = addMonths(leftView, 1);

    let hoverDate = null;

    function handleDayClick(d){
      if (focus === 'from') {
        from = d;
        // if new from > current to, set to = from
        if (to < from) to = from;
        focus = 'to';
      } else {
        if (d < from) {
          // reset anchor to the clicked day
          from = d;
          to = d;
          focus = 'to';
        } else {
          to = d;
          focus = 'from';
        }
      }
      hoverDate = null;
      if (opts.onChange) opts.onChange(from, to);
      render();
    }

    function applyPreset(key){
      if (key === 'custom') { focus = 'from'; render(); return; }
      const r = getPreset(key, today);
      if (!r) return;
      from = r.from; to = r.to; focus = 'from';
      leftView  = startOfMonth(from);
      rightView = startOfMonth(to);
      if (sameYM(leftView, rightView)) rightView = addMonths(leftView, 1);
      if (opts.onChange) opts.onChange(from, to);
      render();
    }

    function buildCalendar(viewDate, onNavPrev, onNavNext, canPrev, canNext){
      const y = viewDate.getFullYear();
      const m = viewDate.getMonth();
      const first = new Date(y, m, 1);
      // Monday-based offset: getDay 0=Sun..6=Sat -> Mon offset = (day+6)%7
      const offset = (first.getDay() + 6) % 7;
      const lastDay = new Date(y, m+1, 0).getDate();
      const prevLastDay = new Date(y, m, 0).getDate();
      const cells = [];
      // leading days from prev month
      for (let i = offset - 1; i >= 0; i--) {
        cells.push({ date: new Date(y, m-1, prevLastDay - i), out: true });
      }
      // current month
      for (let d = 1; d <= lastDay; d++) {
        cells.push({ date: new Date(y, m, d), out: false });
      }
      // trailing to fill 6 rows = 42 cells
      while (cells.length < 42) {
        const last = cells[cells.length-1].date;
        cells.push({ date: addDays(last, 1), out: true });
      }

      const weekdayRow = WEEKDAYS_MON.map(w => `<div class="dr-weekday">${w}</div>`).join('');

      const effectiveTo = hoverDate && focus === 'to' && hoverDate >= from ? hoverDate : to;
      const effectiveFrom = hoverDate && focus === 'from' && hoverDate <= to ? hoverDate : from;

      const dayCells = cells.map(c => {
        const cls = ['dr-day'];
        if (c.out) cls.push('dr-day-out');
        if (!c.out) {
          if (sameDay(c.date, today)) cls.push('dr-day-today');
          const inRange = c.date >= effectiveFrom && c.date <= effectiveTo;
          const isStart = sameDay(c.date, effectiveFrom);
          const isEnd = sameDay(c.date, effectiveTo);
          if (inRange && !isStart && !isEnd) cls.push('dr-in-range');
          if (isStart && isEnd) cls.push('dr-single');
          else {
            if (isStart) cls.push('dr-range-start');
            if (isEnd) cls.push('dr-range-end');
          }
        }
        const iso = c.date.getFullYear()+'-'+pad(c.date.getMonth()+1)+'-'+pad(c.date.getDate());
        return `<button type="button" class="${cls.join(' ')}" data-day="${iso}" ${c.out?'tabindex="-1"':''}><span class="dr-day-num">${c.date.getDate()}</span></button>`;
      }).join('');

      return `
        <div class="dr-cal">
          <div class="dr-cal-head">
            <button type="button" class="dr-cal-nav" data-nav="prev" ${canPrev?'':'disabled'} aria-label="Previous month">
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 2 L3 5 L6.5 8"/></svg>
            </button>
            <div class="dr-cal-title">${MONTH_NAMES[m]} ${y}</div>
            <button type="button" class="dr-cal-nav" data-nav="next" ${canNext?'':'disabled'} aria-label="Next month">
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 2 L7 5 L3.5 8"/></svg>
            </button>
          </div>
          <div class="dr-weekdays">${weekdayRow}</div>
          <div class="dr-days">${dayCells}</div>
        </div>
      `;
    }

    function render(){
      const currentPreset = detectPreset(from, to, today);
      const presetsHtml = PRESETS.map(p =>
        `<button type="button" class="dr-preset ${p.key === currentPreset ? 'active' : ''}" data-preset="${p.key}">${p.label}</button>`
      ).join('');

      // Make sure rightView is after leftView
      if (!(rightView > leftView)) rightView = addMonths(leftView, 1);

      const leftCal = buildCalendar(
        leftView,
        () => { leftView = addMonths(leftView, -1); render(); },
        () => {
          leftView = addMonths(leftView, 1);
          if (sameYM(leftView, rightView)) rightView = addMonths(leftView, 1);
          render();
        },
        true, true
      );
      const rightCal = buildCalendar(
        rightView,
        () => {
          rightView = addMonths(rightView, -1);
          if (sameYM(leftView, rightView)) leftView = addMonths(rightView, -1);
          render();
        },
        () => { rightView = addMonths(rightView, 1); render(); },
        true, true
      );

      pop.innerHTML = `
        <div class="dr-presets">
          <div class="dr-presets-label">Quick ranges</div>
          ${presetsHtml}
        </div>
        <div class="dr-cals">
          <div class="dr-cals-top">
            <div data-cal="left">${leftCal}</div>
            <div data-cal="right">${rightCal}</div>
          </div>
          <div class="dr-footer">
            <div class="dr-field ${focus==='from'?'active':''}">
              <label>From</label>
              <div class="dr-field-val">${format(from)}</div>
            </div>
            <div class="dr-arrow">→</div>
            <div class="dr-field ${focus==='to'?'active':''}">
              <label>To</label>
              <div class="dr-field-val">${format(to)}</div>
            </div>
            <div class="dr-actions">
              <button type="button" class="dr-btn" data-dr-cancel>Cancel</button>
              <button type="button" class="dr-btn dr-btn-primary" data-dr-apply>Apply</button>
            </div>
          </div>
        </div>
      `;
      pop.classList.add('open');

      // Attach handlers
      pop.querySelectorAll('.dr-preset').forEach(el => {
        el.addEventListener('click', () => applyPreset(el.dataset.preset));
      });
      pop.querySelectorAll('.dr-day[data-day]').forEach(el => {
        if (el.classList.contains('dr-day-out')) return;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const [y, mo, d] = el.dataset.day.split('-').map(Number);
          handleDayClick(new Date(y, mo-1, d));
        });
        el.addEventListener('mouseenter', () => {
          const [y, mo, d] = el.dataset.day.split('-').map(Number);
          const next = new Date(y, mo-1, d);
          if (hoverDate && sameDay(hoverDate, next)) return;
          hoverDate = next;
          updateRangeHighlight();
        });
        el.addEventListener('mouseleave', () => {
          if (hoverDate === null) return;
          hoverDate = null;
          updateRangeHighlight();
        });
      });
      // Nav
      const [leftWrap, rightWrap] = [pop.querySelector('[data-cal="left"]'), pop.querySelector('[data-cal="right"]')];
      leftWrap.querySelector('[data-nav="prev"]').addEventListener('click', () => { leftView = addMonths(leftView, -1); render(); });
      leftWrap.querySelector('[data-nav="next"]').addEventListener('click', () => {
        leftView = addMonths(leftView, 1);
        if (!(rightView > leftView)) rightView = addMonths(leftView, 1);
        render();
      });
      rightWrap.querySelector('[data-nav="prev"]').addEventListener('click', () => {
        rightView = addMonths(rightView, -1);
        if (!(rightView > leftView)) leftView = addMonths(rightView, -1);
        render();
      });
      rightWrap.querySelector('[data-nav="next"]').addEventListener('click', () => { rightView = addMonths(rightView, 1); render(); });

      // Apply/Cancel
      pop.querySelector('[data-dr-apply]').addEventListener('click', () => {
        if (opts.onApply) opts.onApply(from, to);
        close();
      });
      pop.querySelector('[data-dr-cancel]').addEventListener('click', () => {
        if (opts.onCancel) opts.onCancel();
        close();
      });

      position();
    }

    // Toggle range-highlight classes on the existing day buttons.
    // IMPORTANT: do NOT rebuild `.dr-days` innerHTML here. Hovering fires
    // `mouseenter` repeatedly, and if we tore down + recreated the buttons on
    // every hover, any in-flight `mousedown` would lose its target before
    // `mouseup` fires, so the browser never dispatches a `click` — the bug
    // where day selection silently did nothing while hover feedback worked.
    function updateRangeHighlight(){
      const effectiveTo   = hoverDate && focus === 'to'   && hoverDate >= from ? hoverDate : to;
      const effectiveFrom = hoverDate && focus === 'from' && hoverDate <= to   ? hoverDate : from;

      pop.querySelectorAll('.dr-day[data-day]').forEach(el => {
        const [y, mo, d] = el.dataset.day.split('-').map(Number);
        const cd = new Date(y, mo-1, d);
        el.classList.remove('dr-in-range', 'dr-range-start', 'dr-range-end', 'dr-single');
        if (el.classList.contains('dr-day-out')) return;

        const inRange = cd >= effectiveFrom && cd <= effectiveTo;
        const isStart = sameDay(cd, effectiveFrom);
        const isEnd   = sameDay(cd, effectiveTo);
        if (isStart && isEnd) {
          el.classList.add('dr-single');
        } else {
          if (inRange && !isStart && !isEnd) el.classList.add('dr-in-range');
          if (isStart) el.classList.add('dr-range-start');
          if (isEnd)   el.classList.add('dr-range-end');
        }
      });
    }

    function position(){
      const anchor = opts.anchor;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      pop.style.visibility = 'hidden';
      pop.style.left = '0px';
      pop.style.top = '0px';
      requestAnimationFrame(() => {
        const pr = pop.getBoundingClientRect();
        let left = r.left;
        let top = r.bottom + 6;
        if (left + pr.width > window.innerWidth - 8) {
          left = Math.max(8, window.innerWidth - pr.width - 8);
        }
        if (top + pr.height > window.innerHeight - 8) {
          top = Math.max(8, r.top - pr.height - 6);
        }
        pop.style.left = left + 'px';
        pop.style.top = top + 'px';
        pop.style.visibility = '';
      });
    }

    render();

    // Outside click, esc, scroll, resize
    const onDoc = (e) => {
      if (pop.contains(e.target)) return;
      if (opts.anchor && opts.anchor.contains(e.target)) return;
      if (opts.extraAnchors) {
        for (const a of opts.extraAnchors) if (a.contains(e.target)) return;
      }
      close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { if (opts.onCancel) opts.onCancel(); close(); }
    };
    const onScroll = (e) => { if (pop.contains(e.target)) return; close(); };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);

    active = { pop, onDoc, onKey, onScroll, onClose: opts.onClose };
  }

  window.WeemDatePicker = { open, close, format, parse, getPreset, presets: PRESETS };
})();
