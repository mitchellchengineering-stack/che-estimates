/* Jobs, production board, calendar */
(() => {
  const e = App.esc, S = () => App.store.s(), st = App.store, A = App.actions;
  const STAGE_IDX = v => App.STAGES.findIndex(s => s.value === v);

  App.Jobs = {
    list() { return st.live().filter(x => x.job && !x.archived && !x.practice); },
    frames(est) { return (est.job && est.job.frames) || []; },
    loadsDone(est) { const l = est.job.loads || []; return { done: l.filter(x => x.delivered).length, total: l.length }; },
    checkDone(est) { const f = this.frames(est); const t = est.job.checklist.ticks || {}; return { done: f.filter(x => t[x.id]).length, total: f.length }; },
    nextDelivery(est) { return (est.job.loads || []).filter(l => l.date && !l.delivered).sort((a, b) => a.date < b.date ? -1 : 1)[0]; },
    backTotals(est) {
      const b = est.job.backcost || { lines: [] };
      const estCost = b.lines.reduce((t, l) => t + App.num(l.est), 0);
      const actual = b.lines.reduce((t, l) => t + (l.actual === '' || l.actual == null ? App.num(l.est) : App.num(l.actual)), 0);
      const vars = st.live().filter(v => v.parentId === est.id && v.status === 'accepted').reduce((t, v) => t + st.totals(v).sub, 0);
      const sold = st.totals(est).sub + vars;
      return { estCost, actual, sold, profit: sold - actual, margin: sold ? (sold - actual) / sold : 0, vars };
    },
    setStage(est, stage) {
      if (est.job.stage === stage) return;
      est.job.stage = stage; est.job.stageLog.push({ stage, at: Date.now(), by: st.me().name });
      st.log(est, `Moved to "${App.stageLabel(stage)}"`); st.touch(est); st.save();
    },
    async busyOk(est, date) {
      const cap = App.num(S().production.capacityPerWeek); if (!cap || !date) return true;
      const wk = App.weekStart(date);
      const others = this.list().filter(x => x.id !== est.id && x.job.manufactureDate && App.weekStart(x.job.manufactureDate) === wk);
      if (others.length < cap) return true;
      return App.confirm('That week is already full', `The week of ${App.fmtLong(wk)} already has ${others.length} job${others.length === 1 ? '' : 's'} scheduled for manufacture (${others.map(x => x.number).join(', ')}). Your limit is ${cap} a week. Schedule it anyway?`, 'Schedule anyway');
    },
    async syncCal(est) {
      if (st.mode !== 'drive' || !S().google.calendarSync || !est.job) return;
      const cal = S().google.calendarId || 'primary'; const j = est.job; j.cal = j.cal || {};
      const who = est.client.company || est.client.name;
      try {
        if (j.manufactureDate) j.cal.mfg = await App.G.upsertEvent(cal, j.cal.mfg, { summary: `Manufacture ${est.number}, ${who}`, date: j.manufactureDate, description: `${est.heading}\n${est.siteAddress}`, colorId: '6' });
        else if (j.cal.mfg) { await App.G.deleteEvent(cal, j.cal.mfg); j.cal.mfg = null; }
        for (const l of j.loads || []) {
          if (l.date) l.calId = await App.G.upsertEvent(cal, l.calId, { summary: `Delivery ${l.n}/${j.loads.length} ${est.number}, ${who}`, date: l.date, description: `${est.siteAddress}\n${est.heading}`, colorId: l.delivered ? '10' : '9' });
          else if (l.calId) { await App.G.deleteEvent(cal, l.calId); l.calId = null; }
        }
        st.touch(est); st.save();
      } catch (er) { App.toast('Calendar sync: ' + er.message, 'err', 5000); }
    },
    async syncEvent(ev) {
      if (st.mode !== 'drive' || !S().google.calendarSync) return;
      const cal = S().google.calendarId || 'primary';
      try {
        if (ev.deleted) { if (ev.calId) await App.G.deleteEvent(cal, ev.calId); return; }
        ev.calId = await App.G.upsertEvent(cal, ev.calId, { summary: ev.title, date: ev.date, description: ev.notes || '' }); st.touch(ev); st.save();
      } catch (er) { App.toast('Calendar sync: ' + er.message, 'err', 5000); }
    },
    suggestLoads(frames, n) {
      /* Keep each type together where possible: GF walls, joists, FF walls, trusses, roof panels, other */
      const order = f => f.category === 'Walls' ? (f.level === 'First floor' ? 2 : 0) : f.category === 'Joists' ? 1 : f.category === 'Trusses' ? 3 : f.category === 'Roof panels' ? 4 : 5;
      const wt = f => (f.weight || (f.length || 1)) * f.qty;
      const keys = [...new Set(frames.map(order))].sort((a, b) => a - b);
      let parts = keys.map(k => frames.filter(f => order(f) === k));
      const w = arr => arr.reduce((t, f) => t + wt(f), 0);
      if (parts.length > n) {
        /* contiguous grouping that keeps the heaviest load as light as possible */
        let best = null;
        const tryCuts = (start, left, acc) => {
          if (left === 1) { const all = acc.concat([parts.slice(start).flat()]); const mx = Math.max(...all.map(w)); if (!best || mx < best.mx) best = { mx, all }; return; }
          for (let i = start + 1; i <= parts.length - left + 1; i++) tryCuts(i, left - 1, acc.concat([parts.slice(start, i).flat()]));
        };
        tryCuts(0, n, []); parts = best.all;
      }
      while (parts.length < n) {
        /* split the heaviest load in two, keeping frame order */
        let hi = 0; parts.forEach((p, i) => { if (w(p) > w(parts[hi])) hi = i; });
        const p = parts[hi]; if (p.length < 2) break;
        const half = w(p) / 2; let acc = 0, cut = 1;
        for (let i = 0; i < p.length; i++) { acc += wt(p[i]); if (acc >= half) { cut = Math.max(1, Math.min(p.length - 1, i + 1)); break; } }
        parts.splice(hi, 1, p.slice(0, cut), p.slice(cut));
      }
      return parts.map((p, i) => ({ id: App.uid(), n: i + 1, date: '', frameIds: p.map(f => f.id), delivered: false }));
    },
    loadKg(est, l) { return this.frames(est).filter(f => l.frameIds.includes(f.id)).reduce((t, f) => t + (f.weight || 0) * f.qty, 0); }
  };

  /* ---------- Production dashboard ---------- */
  App.Jobs.daysIn = j => { const l = j.job.stageLog[j.job.stageLog.length - 1]; return l ? Math.max(0, App.daysBetween(App.iso(new Date(l.at)), App.today())) : 0; };
  App.Jobs.value = j => st.totals(j).sub;
  App.Jobs.mfgSpan = j => {
    const s = j.job.manufactureDate; if (!s) return null;
    const firstDel = (j.job.loads || []).map(l => l.date).filter(Boolean).sort()[0];
    let end = s; for (let i = 1; i < 5; i++) { const d = App.addDays(end, 1); if (firstDel && d >= firstDel) break; if ([0, 6].includes(App.parseDate(d).getDay())) break; end = d; if (!firstDel && i >= 2) break; }
    return [s, j.job.manufactureEnd || end];
  };
  App.Jobs.attention = () => {
    const out = []; const today = App.today(); const soon = App.addDays(today, 3);
    App.Jobs.list().forEach(j => {
      const i = STAGE_IDX(j.job.stage); const d = App.Jobs.daysIn(j); const n = j.number;
      if (!j.job.deposit.received && i >= 2 && i <= 4) out.push({ lvl: 'red', j, t: `${n} has no deposit yet`, s: j.job.manufactureDate ? `Booked to start manufacture ${App.fmtDate(j.job.manufactureDate, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'In production', b: 'Open job', href: `#/job/${j.id}` });
      const limit = { accepted: 5, detailing: 7, yard: 7 }[j.job.stage];
      if (limit && d > limit) out.push({ lvl: 'amber', j, t: `${n} has been ${App.stageLabel(j.job.stage).toLowerCase()} for ${d} days`, s: 'Longer than usual. Worth a look?', b: 'Open job', href: `#/job/${j.id}` });
      (j.job.loads || []).filter(l => l.date && !l.delivered && l.date >= today && l.date <= soon).forEach(l => {
        const ids = l.frameIds || []; const ticks = j.job.checklist.ticks || {}; const left = ids.filter(id => !ticks[id]).length;
        if (left) out.push({ lvl: 'amber', j, t: `${n} delivery ${l.n} is ${App.fmtDate(l.date, { weekday: 'long' })}`, s: `${left} frame type${left === 1 ? '' : 's'} on that load not ticked off yet`, b: 'Checklist', href: `#/job/${j.id}/checklist` });
      });
      if (!j.job.frames.length && i >= 2 && i <= 3) out.push({ lvl: 'blue', j, t: `${n} has no frame list`, s: 'Upload the PDF detailing to make the checklist', b: 'Upload', href: `#/job/${j.id}/deliveries` });
    });
    return out;
  };
  App.Jobs.steelNeeded = () => {
    const today = App.today(); const end = App.addDays(today, 14); const tot = {};
    App.Jobs.list().filter(j => ['accepted', 'detailing', 'scheduled', 'manufacturing'].includes(j.job.stage) && (!j.job.manufactureDate || j.job.manufactureDate <= end)).forEach(j => {
      (j.workings.steel || []).forEach(r => { const k = `${r.size}|${r.gauge}`; tot[k] = tot[k] || { size: r.size, gauge: r.gauge, lm: 0, jobs: [] }; tot[k].lm += App.num(r.lm); if (!tot[k].jobs.includes(j.number)) tot[k].jobs.push(j.number); });
    });
    return Object.values(tot).filter(x => x.lm > 0).sort((a, b) => (a.size + a.gauge).localeCompare(b.size + b.gauge));
  };
  App.Jobs.timelineDays = start => { const out = []; let d = App.weekStart(start); while (out.length < 10) { if (![0, 6].includes(App.parseDate(d).getDay())) out.push(d); d = App.addDays(d, 1); } return out; };
  App.Jobs.timelineRows = days => {
    const first = days[0], last = days[days.length - 1];
    return App.Jobs.list().filter(j => j.job.stage !== 'complete').map(j => {
      const bars = []; const dels = [];
      const span = App.Jobs.mfgSpan(j);
      if (span && span[1] >= first && span[0] <= last) bars.push({ a: span[0] < first ? first : span[0], z: span[1] > last ? last : span[1], cls: 'mfg', t: 'Manufacture' });
      if (j.job.stage === 'detailing') { const l = j.job.stageLog.filter(x => x.stage === 'detailing').pop(); const a = l ? App.iso(new Date(l.at)) : first; const z = j.job.manufactureDate ? App.addDays(j.job.manufactureDate, -1) : last; if (z >= first) bars.push({ a: a < first ? first : a, z: z > last ? last : z, cls: 'det', t: 'Detailing' }); }
      (j.job.loads || []).forEach(l => { if (l.date && l.date >= first && l.date <= last) dels.push({ d: l.date, t: 'D' + l.n, done: l.delivered }); });
      return { j, bars, dels };
    }).filter(r => r.bars.length || r.dels.length);
  };
  App.Jobs.timelineHtml = (days, rows, forPrint) => {
    const today = App.today(); const col = d => days.indexOf(d) + 1;
    return `<div class="tl" style="grid-template-columns:${forPrint ? '170px' : '200px'} repeat(${days.length},minmax(0,1fr))"><span></span>${days.map(d => `<span class="tl-h ${d === today ? 'today' : ''}">${App.fmtDate(d, { weekday: 'short', day: 'numeric' })}</span>`).join('')}
      ${rows.map(r => `<span class="tl-job">${forPrint ? `<b>${e(r.j.number)}</b>` : `<a href="#/job/${r.j.id}"><b>${e(r.j.number)}</b></a>`}<span>${e(r.j.client.company || r.j.client.name)}</span></span>
        <div class="tl-row" style="grid-column:2 / span ${days.length};grid-template-columns:repeat(${days.length},minmax(0,1fr))">${days.map((d, i) => `<span class="tl-c ${d === today ? 'today' : ''}" style="grid-column:${i + 1}"></span>`).join('')}
        ${r.bars.map(b => `<span class="tl-bar ${b.cls}" style="grid-column:${col(b.a)} / ${col(b.z) + 1}">${b.t}</span>`).join('')}
        ${r.dels.map(x => `<span class="tl-del ${x.done ? 'done' : ''}" style="grid-column:${col(x.d)}">${x.t}</span>`).join('')}</div>`).join('') || `<p class="hint" style="grid-column:1 / -1;padding:14px 0">Nothing booked in these two weeks.</p>`}</div>`;
  };
  App.Jobs.boardHtml = (forPrint) => {
    const jobs = App.Jobs.list();
    return `<div class="board ${forPrint ? 'print' : ''}">${App.STAGES.map(s => {
      const col = jobs.filter(j => j.job.stage === s.value);
      return `<div class="col" data-drop-stage="${s.value}"><h3>${s.label} <span>${col.length}</span></h3>${col.map(j => App.Jobs.card(j, forPrint)).join('') || '<p class="col-empty">Nothing here</p>'}</div>`;
    }).join('')}</div>`;
  };
  App.Jobs.card = (j, forPrint) => {
    const ld = App.Jobs.loadsDone(j); const ck = App.Jobs.checkDone(j); const nd = App.Jobs.nextDelivery(j); const i = STAGE_IDX(j.job.stage);
    const d = App.Jobs.daysIn(j); const warn = App.Jobs.attention().some(a => a.j === j && a.lvl !== 'blue');
    const tag = (t, c = '') => `<span class="tag ${c}">${t}</span>`;
    const tags = [];
    if (i <= 4) tags.push(j.job.deposit.received ? tag('Deposit paid', 'ok') : tag('No deposit', 'bad'));
    if (j.job.manufactureDate && i <= 3) tags.push(tag('Make ' + App.fmtDate(j.job.manufactureDate, { weekday: 'short', day: 'numeric', month: 'short' }), 'dark'));
    if (nd) tags.push(tag(`Delivery ${nd.n}/${j.job.loads.length} ${App.fmtDate(nd.date, { weekday: 'short', day: 'numeric', month: 'short' })}`, 'blue'));
    if (ld.total > 1 && ld.done) tags.push(tag(`Delivered ${ld.done} of ${ld.total}`, 'ok'));
    if (j.job.stage === 'delivered' && !(j.job.backcost && j.job.backcost.done)) tags.push(tag('Back-cost it', 'yel'));
    const body = `<span class="jc-top"><b>${e(st.displayNumber(j))}</b><span class="${warn ? 'neg' : 'hint'}">${d} day${d === 1 ? '' : 's'}</span></span><span>${e(j.client.company || j.client.name)}</span><span class="hint">${App.money(App.Jobs.value(j), 0)}, ${j.type === 'ft' ? 'F&amp;T' : 'General'}</span>
      ${j.job.stage === 'manufacturing' && ck.total ? `<div class="bar dark"><i style="width:${ck.done / ck.total * 100}%"></i></div><span class="small-b">${ck.done} of ${ck.total} frames</span>` : ''}<span class="tags">${tags.join('')}</span>`;
    if (forPrint) return `<div class="job-card">${body}</div>`;
    return `<a class="job-card ${warn ? 'warn' : ''}" href="#/job/${j.id}" draggable="true" data-drag-job="${j.id}">${body}
      <span class="card-move"><button data-act="stageStep" data-id="${j.id}" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Move back">‹</button><button data-act="stageStep" data-id="${j.id}" data-d="1" ${i >= App.STAGES.length - 1 ? 'disabled' : ''} aria-label="Move forward">›</button></span></a>`;
  };
  App.views.production = () => {
    const v = App.state.prodView = App.state.prodView || 'overview';
    const jobs = App.Jobs.list(); const today = App.today(); const wk = App.weekStart(today); const wkEnd = App.addDays(wk, 6);
    const live = jobs.filter(j => !['delivered', 'complete'].includes(j.job.stage));
    const thisWeek = live.filter(j => j.job.stage === 'manufacturing' || (j.job.manufactureDate && j.job.manufactureDate >= wk && j.job.manufactureDate <= wkEnd));
    const pieces = thisWeek.reduce((t, j) => t + j.job.frames.reduce((a, f) => a + f.qty, 0), 0);
    const lm = thisWeek.reduce((t, j) => t + (j.workings.steel || []).reduce((a, r) => a + App.num(r.lm), 0), 0);
    const kgOf = (j, ids) => j.job.frames.filter(f => !ids || ids.includes(f.id)).reduce((a, f) => a + (f.weight || 0) * f.qty, 0);
    const floor = jobs.filter(j => j.job.stage === 'manufacturing').reduce((t, j) => t + kgOf(j), 0);
    const dels = []; jobs.forEach(j => (j.job.loads || []).forEach(l => { if (l.date && !l.delivered && l.date >= today && l.date <= App.addDays(today, 6)) dels.push({ j, l, kg: kgOf(j, l.frameIds) }); }));
    dels.sort((a, b) => a.l.date < b.l.date ? -1 : 1);
    const yard = jobs.filter(j => j.job.stage === 'yard');
    const done = jobs.filter(j => j.job.stageLog.some(l => l.stage === 'delivered')).map(j => App.daysBetween(j.job.acceptedAt || App.iso(new Date(j.job.stageLog[0].at)), App.iso(new Date(j.job.stageLog.find(l => l.stage === 'delivered').at))));
    const cap = App.num(S().production.capacityPerWeek);
    const weeks = [0, 1, 2, 3].map(k => { const s = App.addDays(wk, 7 * k); const n = jobs.filter(j => j.job.manufactureDate && App.weekStart(j.job.manufactureDate) === s).length; return { s, n }; });
    const maxN = Math.max(cap || 1, ...weeks.map(w => w.n), 1);
    const att = App.Jobs.attention();
    if (App.Coil && App.Coil.ready() && App.Coil.S.loadedAt) App.Coil.summary().low.forEach(x => att.push({ lvl: 'amber', t: `${App.Coil.bmt(x.t)} BMT coils running low`, s: `${x.n} coil${x.n === 1 ? '' : 's'} left in stock`, b: 'Coils', href: '#/coils' }));
    const steel = App.Jobs.steelNeeded();
    const days = App.Jobs.timelineDays(today);
    const views = `<div class="seg">${[['overview', 'Overview'], ['board', 'Board only'], ['timeline', 'Timeline only']].map(([k, l]) => `<label><input type="radio" name="pv" value="${k}" data-act-change="prodView" ${v === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
    const head = `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Week of ${App.fmtDate(wk, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Production</h1></div>
      <div class="head-actions">${views}<details class="menu"><summary class="btn primary">Print or PDF</summary><div class="menu-pop"><button data-act="prodPrint" data-k="plan">This week's plan (timeline and board)</button><button data-act="prodPrint" data-k="timeline">Timeline only</button><button data-act="prodPrint" data-k="board">Job board only</button></div></details></div></div>`;
    const timeline = `<section class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">This week and next</h3><div class="legend" style="margin:0"><span><i style="background:#c4cacf"></i>Detailing</span><span><i style="background:#e8890c"></i>Manufacture</span><span><i style="background:var(--blue);border-radius:6px"></i>Delivery</span></div></div><div class="table-scroll" style="margin-top:12px">${App.Jobs.timelineHtml(days, App.Jobs.timelineRows(days))}</div></section>`;
    const board = `<section><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Job board</h3><span class="hint">Drag a card to move it along. A red outline means it needs a look.</span></div>${App.Jobs.boardHtml()}</section>`;
    if (v === 'board') return head + board;
    if (v === 'timeline') return head + timeline;
    return head + `
    <div class="statcards six">
      <div class="statcard dark"><p class="l">In production</p><p class="v">${live.length} job${live.length === 1 ? '' : 's'}</p><p class="s">${App.money(live.reduce((t, j) => t + App.Jobs.value(j), 0), 0)} of work</p></div>
      <div class="statcard"><p class="l">To make this week</p><p class="v">${pieces} frames</p><p class="s">${Math.round(lm).toLocaleString('en-NZ')} LM of steel</p></div>
      <div class="statcard"><p class="l">Steel on the floor</p><p class="v">${(floor / 1000).toFixed(1)} t</p><p class="s">across ${jobs.filter(j => j.job.stage === 'manufacturing').length} job(s)</p></div>
      <div class="statcard"><p class="l">Deliveries this week</p><p class="v">${dels.length}</p><p class="s">${(dels.reduce((t, x) => t + x.kg, 0) / 1000).toFixed(1)} t</p></div>
      <div class="statcard"><p class="l">In the yard</p><p class="v">${yard.length} job${yard.length === 1 ? '' : 's'}</p><p class="s">${Math.round(yard.reduce((t, j) => t + kgOf(j), 0)).toLocaleString('en-NZ')} kg waiting</p></div>
      <div class="statcard"><p class="l">Accepted to delivered</p><p class="v">${done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) + ' days' : '-'}</p><p class="s">average</p></div>
    </div>
    <div class="grid2" style="gap:16px">
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Factory load, next 4 weeks</h3><span class="hint">${cap ? `Your limit: ${cap} jobs a week` : '<a href="#/settings/production">Set your weekly limit</a>'}</span></div>
        <div class="loadbars">${weeks.map(w => { const full = cap && w.n >= cap; return `<div class="lb"><b>${w.n}${cap ? ' of ' + cap : ''}</b><div class="lb-track"><i class="${full ? 'full' : ''}" style="height:${w.n / maxN * 100}%"></i></div><span>Week of ${App.fmtShort(w.s)}</span>${full ? '<span class="tag bad">Full</span>' : cap ? `<span class="hint">${cap - w.n} free</span>` : ''}</div>`; }).join('')}</div></section>
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Needs attention</h3>${att.length ? `<span class="tag bad">${att.length}</span>` : ''}</div>
        ${att.length ? att.slice(0, 7).map(a => `<div class="alert"><span class="dotbar ${a.lvl}"></span><span class="txt"><b>${e(a.t)}</b><span>${e(a.s)}</span></span><a class="btn small" href="${a.href}">${a.b}</a></div>`).join('') : '<p class="hint">All good. Nothing needs a look.</p>'}</section>
    </div>
    ${timeline}${board}
    <div class="grid2" style="gap:16px;margin-top:16px">
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Steel needed, next 2 weeks</h3><span class="hint">From each job's workings</span></div>
        ${steel.length ? `<table class="wtable"><thead><tr><th>Section</th><th>Gauge</th><th class="r">Metres</th><th>For</th></tr></thead><tbody>${steel.map(x => `<tr><td><b>${e(x.size)}</b></td><td>${e(x.gauge)} BMT</td><td class="r"><b>${Math.round(x.lm).toLocaleString('en-NZ')} LM</b></td><td class="hint">${e(x.jobs.join(', '))}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No steel lines in the workings of upcoming jobs.</p>'}</section>
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Delivery run</h3><span class="hint">${App.num(S().delivery.truckMaxKg) ? `Truck limit ${App.num(S().delivery.truckMaxKg).toLocaleString('en-NZ')} kg` : 'Next 7 days'}</span></div>
        ${dels.length ? dels.map((x, i) => { const dt = App.parseDate(x.l.date); return `<a class="snap-item" href="#/job/${x.j.id}/deliveries"><span class="date-chip ${i === 0 ? 'dark' : ''}">${dt.toLocaleDateString('en-NZ', { weekday: 'short' })}<b>${dt.getDate()}</b></span><span class="txt"><span><b>${e(x.j.number)}</b> delivery ${x.l.n} of ${x.j.job.loads.length}</span><span class="hint">${e(x.j.siteAddress)}${x.kg ? ', ' + Math.round(x.kg).toLocaleString('en-NZ') + ' kg' : ''}</span></span>${x.l.docketAt ? '<span class="tag ok">Docket printed</span>' : '<span class="tag yel">Print docket</span>'}</a>`; }).join('') : '<p class="hint">No deliveries in the next 7 days.</p>'}</section>
    </div>`;
  };
  App.views.production.mount = () => {
    document.querySelectorAll('[data-drag-job]').forEach(c => c.ondragstart = ev => { ev.dataTransfer.setData('text/job', c.dataset.dragJob); c.classList.add('dragging'); });
    document.querySelectorAll('[data-drop-stage]').forEach(col => {
      col.ondragover = ev => { ev.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = ev => { ev.preventDefault(); const id = ev.dataTransfer.getData('text/job'); const est = st.get(id); if (est) { App.Jobs.setStage(est, col.dataset.dropStage); App.refresh(); } };
    });
    if (App.Coil && App.Coil.ready() && !App.Coil.S.loadedAt) App.Coil.load().then(ch => { if (ch && App.route().name === 'production') App.refresh(); }).catch(() => {});
  };
  A.prodView = el => { App.state.prodView = el.value; App.refresh(); };
  A.stageStep = (el, ev) => { ev.preventDefault(); ev.stopPropagation(); const est = st.get(el.dataset.id); const i = STAGE_IDX(est.job.stage) + (+el.dataset.d); if (App.STAGES[i]) { App.Jobs.setStage(est, App.STAGES[i].value); App.refresh(); } };
  App.Jobs.planSpec = k => {
    const days = App.Jobs.timelineDays(App.today());
    const wk = App.weekStart(App.today());
    const flow = [];
    if (k !== 'board') flow.push(App.Docs.blk(`${App.Docs.h2('This week and next')}<div class="pr-tl">${App.Jobs.timelineHtml(days, App.Jobs.timelineRows(days), true)}</div>`));
    if (k !== 'timeline') flow.push(`<section class="blk" ${k === 'plan' ? 'style="break-before:page"' : ''}>${App.Docs.h2('Job board')}<div class="pr-board">${App.Jobs.boardHtml(true)}</div></section>`);
    const title = k === 'board' ? 'Job board' : k === 'timeline' ? 'Production timeline' : 'Production plan';
    return { landscape: true, head: App.Docs.fullHead('', title, [], App.Docs.darkChip('Week of ' + App.fmtDate(wk, { day: 'numeric', month: 'long', year: 'numeric' }))), run: App.Docs.runHead(title, 'Week of ' + App.fmtDate(wk, { day: 'numeric', month: 'long' })), foot: App.Docs.footSimple(`Printed ${App.fmtStamp(Date.now())}`), flow, bottom: '', after: [], number: title };
  };
  A.prodPrint = el => {
    const k = el.dataset.k; const sp = k === 'plan' ? [App.Jobs.planSpec('timeline'), App.Jobs.planSpec('board')] : App.Jobs.planSpec(k);
    App.Docs.preview(k === 'board' ? 'Job board' : k === 'timeline' ? 'Production timeline' : 'This week\'s plan', sp, { pdfName: `Production ${k} ${App.today()}.pdf` });
  };

  /* ---------- Calendar ---------- */
  App.Jobs.EVTYPES = [['mfg', 'Manufacture'], ['del', 'Delivery'], ['coil', 'Coils arriving'], ['po', 'Purchase order due'], ['fu', 'Follow-up due'], ['exp', 'Estimate expires'], ['ev', 'Other']];
  App.Jobs.events = () => {
    const out = [];
    App.Jobs.list().forEach(j => {
      const who = j.client.company || j.client.name;
      if (j.job.manufactureDate) out.push({ type: 'mfg', date: j.job.manufactureDate, cls: 'mfg', text: `${j.number} make`, title: `Manufacture ${j.number}, ${who}`, drag: `mfg:${j.id}`, href: `#/job/${j.id}` });
      (j.job.loads || []).forEach(l => l.date && out.push({ type: 'del', date: l.date, cls: l.delivered ? 'done' : 'del', text: `${j.number} delivery ${l.n}/${j.job.loads.length}`, title: `Delivery ${l.n} of ${j.job.loads.length}, ${who}, ${j.siteAddress}`, drag: `load:${j.id}:${l.id}`, href: `#/job/${j.id}/deliveries` }));
      (j.job.pos || []).forEach(p => p.requiredBy && !p.received && out.push({ type: 'po', date: p.requiredBy, cls: 'po', text: `${p.number} due`, title: `${p.supplier}: ${p.number}`, href: `#/job/${j.id}/pos` }));
    });
    st.live().filter(x => x.status === 'sent' && !x.practice && !x.archived).forEach(x => {
      const f = App.Track.fu(x);
      if (f && !f.paused) { if (!(f.fu1 && f.fu1.status && f.fu1.status !== 'queued')) out.push({ type: 'fu', date: f.fu1Due, cls: 'fu', text: `FU1 ${x.number}`, title: `First follow-up for ${x.client.company || x.client.name}`, href: '#/followups' }); else if (!(f.fu2 && f.fu2.status && f.fu2.status !== 'queued')) out.push({ type: 'fu', date: f.fu2Due, cls: 'fu', text: `FU2 ${x.number}`, title: `Second follow-up for ${x.client.company || x.client.name}`, href: '#/followups' }); }
      if (x.expiry) out.push({ type: 'exp', date: x.expiry, cls: 'exp', text: `${x.number} expires`, title: `Estimate ${x.number} expires`, href: `#/e/${x.id}` });
    });
    st.data.events.filter(x => !x.deleted).forEach(ev => out.push({ type: ev.type || 'ev', date: ev.date, cls: ev.type === 'coil' ? 'coil' : ev.type === 'po' ? 'po' : 'ev', text: ev.title, title: ev.notes || ev.title, drag: `ev:${ev.id}`, evId: ev.id }));
    const f = App.state.calFilters || {};
    return out.filter(x => f[x.type] !== false);
  };
  App.views.calendar = () => {
    const c = App.state.cal = App.state.cal || { view: 'month', anchor: App.today() };
    const evs = App.Jobs.events(); const byDate = {}; evs.forEach(x => (byDate[x.date] = byDate[x.date] || []).push(x));
    const chip = x => `<${x.href ? `a href="${x.href}"` : `button data-act="evEdit" data-id="${x.evId}"`} class="chip-ev ${x.cls}" ${x.drag ? `draggable="true" data-drag-ev="${x.drag}"` : ''} title="${e(x.title)}">${e(x.text)}</${x.href ? 'a' : 'button'}>`;
    const today = App.today(); const cap = App.num(S().production.capacityPerWeek);
    const loadChip = wkStart => { const n = App.Jobs.list().filter(j => j.job.manufactureDate && App.weekStart(j.job.manufactureDate) === wkStart).length; if (!cap) return n ? `<span class="tag">${n} job${n === 1 ? '' : 's'}</span>` : '<span class="hint">-</span>'; return n >= cap ? '<span class="tag bad">Full</span>' : n ? `<span class="tag yel">${n} of ${cap}</span>` : '<span class="tag ok">Free</span>'; };
    let body = '';
    if (c.view === 'month') {
      const first = App.parseDate(c.anchor.slice(0, 8) + '01'); const start = App.weekStart(App.iso(first)); const month = c.anchor.slice(0, 7);
      body = `<div class="cal-grid wk"><div class="cal-dow"><span>Factory</span>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal-days">
        ${Array.from({ length: 6 }, (_, w) => { const ws = App.addDays(start, w * 7); return `<div class="cal-load">${loadChip(ws)}</div>` + Array.from({ length: 7 }, (_, i) => { const d = App.addDays(ws, i); return `<div class="cal-day ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''}" data-drop-date="${d}" data-act="dayClick" data-d="${d}"><span class="dn">${+d.slice(8)}</span>${(byDate[d] || []).map(chip).join('')}</div>`; }).join(''); }).join('')}</div></div>`;
    } else {
      const start = App.weekStart(c.anchor);
      body = `<p style="margin:0 0 10px">Factory this week: ${loadChip(start)}</p><div class="cal-week">${Array.from({ length: 7 }, (_, i) => { const d = App.addDays(start, i); return `<div class="wk-day ${d === today ? 'today' : ''}" data-drop-date="${d}"><h4>${App.fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}</h4>${(byDate[d] || []).map(chip).join('') || '<p class="hint">Nothing booked</p>'}<button class="btn small ghost" data-act="dayClick" data-d="${d}">Add</button></div>`; }).join('')}</div>`;
    }
    const label = c.view === 'month' ? App.fmtDate(c.anchor, { month: 'long', year: 'numeric' }) : `Week of ${App.fmtLong(App.weekStart(c.anchor))}`;
    const f = App.state.calFilters || {};
    const todays = (byDate[today] || []);
    return `<div class="page-head"><div><h1>Calendar</h1><p class="sub">Manufacture, deliveries, coils, purchase orders, follow-ups and anything you add. Drag something to move it.</p></div>
      <div class="head-actions"><button class="btn primary" data-act="evNew">+ Add to calendar</button></div></div>
    <div class="cal-bar"><button class="btn small" data-act="calNav" data-d="-1" aria-label="Previous">‹</button><button class="btn small" data-act="calNav" data-d="0">Today</button><button class="btn small" data-act="calNav" data-d="1" aria-label="Next">›</button>
      <h2>${label}</h2><div class="seg"><label><input type="radio" name="calv" value="month" data-act-change="calView" ${c.view === 'month' ? 'checked' : ''}><span>Month</span></label><label><input type="radio" name="calv" value="week" data-act-change="calView" ${c.view === 'week' ? 'checked' : ''}><span>Week</span></label></div></div>
    <div class="legend">${App.Jobs.EVTYPES.map(([k, l]) => `<span><i class="dot ${k}"></i>${l}</span>`).join('')}</div>
    <div class="cal-cols"><div class="cal-main">${body}</div>
      <aside class="card cal-side"><h3>Today, ${App.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
        ${todays.length ? todays.map(x => `<div class="actrow"><span><b>${e(x.text)}</b><span class="hint">${e(x.title)}</span></span></div>`).join('') : '<p class="hint">Nothing on today.</p>'}
        <h4>Show on the calendar</h4>${App.Jobs.EVTYPES.map(([k, l]) => `<label class="check"><input type="checkbox" data-act-change="calFilter" data-k="${k}" ${f[k] === false ? '' : 'checked'}> ${l}</label>`).join('')}</aside></div>`;
  };
  App.views.calendar.mount = () => {
    document.querySelectorAll('[data-drag-ev]').forEach(c => c.ondragstart = ev => { ev.stopPropagation(); ev.dataTransfer.setData('text/ev', c.dataset.dragEv); });
    document.querySelectorAll('[data-drop-date]').forEach(cell => {
      cell.ondragover = ev => { ev.preventDefault(); cell.classList.add('over'); };
      cell.ondragleave = () => cell.classList.remove('over');
      cell.ondrop = async ev => {
        ev.preventDefault(); cell.classList.remove('over');
        const raw = ev.dataTransfer.getData('text/ev'); if (!raw) return;
        const [kind, id, lid] = raw.split(':'); const d = cell.dataset.dropDate;
        if (kind === 'ev') { const x = st.data.events.find(z => z.id === id); x.date = d; st.touch(x); st.save(); App.Jobs.syncEvent(x); }
        else {
          const est = st.get(id);
          if (kind === 'mfg') { if (!(await App.Jobs.busyOk(est, d))) return; est.job.manufactureDate = d; st.log(est, `Manufacture moved to ${App.fmtDate(d)}`); }
          if (kind === 'load') { const l = est.job.loads.find(z => z.id === lid); l.date = d; st.log(est, `Delivery ${l.n} moved to ${App.fmtDate(d)}`); }
          st.touch(est); st.save(); App.Jobs.syncCal(est);
        }
        App.refresh();
      };
    });
  };
  A.calFilter = el => { App.state.calFilters = App.state.calFilters || {}; App.state.calFilters[el.dataset.k] = el.checked; App.refresh(); };
  A.calNav = el => { const c = App.state.cal; const d = +el.dataset.d; c.anchor = d === 0 ? App.today() : c.view === 'month' ? App.addMonths(c.anchor.slice(0, 8) + '01', d) : App.addDays(c.anchor, 7 * d); App.refresh(); };
  A.calView = el => { App.state.cal.view = el.value; App.refresh(); };
  const evModal = (ev) => {
    const isNew = !ev.id;
    const m = App.modal(isNew ? 'Add to calendar' : 'Edit', `${App.field('What', `<input id="ev-t" value="${e(ev.title || '')}" placeholder="e.g. Steel & Tube coils arriving, site visit">`)}
      <div class="grid2">${App.field('Date', `<input type="date" id="ev-d" value="${e(ev.date || App.today())}">`)}${App.field('Type', `<select id="ev-type">${App.opts([{ value: 'ev', label: 'Other' }, { value: 'coil', label: 'Coils arriving' }, { value: 'po', label: 'Purchase order due' }], ev.type || 'ev')}</select>`)}</div>
      ${App.field('Notes', `<textarea id="ev-n" rows="3">${e(ev.notes || '')}</textarea>`)}`,
      { actions: `${isNew ? '' : '<button class="btn ghost danger" id="ev-del">Delete</button>'}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="ev-ok">Save</button>` });
    m.querySelector('#ev-ok').onclick = () => {
      const t = m.querySelector('#ev-t').value.trim(); if (!t) return App.toast('Add what it is', 'err');
      Object.assign(ev, { title: t, date: m.querySelector('#ev-d').value, notes: m.querySelector('#ev-n').value, type: m.querySelector('#ev-type').value });
      if (isNew) { ev.id = App.uid(); st.data.events.push(ev); }
      st.touch(ev); st.save(); App.Jobs.syncEvent(ev); App.closeModal(); App.refresh();
    };
    if (!isNew) m.querySelector('#ev-del').onclick = () => { ev.deleted = true; st.touch(ev); st.save(); App.Jobs.syncEvent(ev); App.closeModal(); App.refresh(); };
  };
  A.evNew = () => evModal({});
  A.dayClick = (el, ev) => { if (ev.target.closest('.chip-ev')) return; evModal({ date: el.dataset.d }); };
  A.evEdit = (el, ev) => { ev.stopPropagation(); evModal(st.data.events.find(x => x.id === el.dataset.id)); };

  /* ---------- Job page ---------- */
  App.views.job = (id, tab = 'overview') => {
    const est = st.get(id);
    if (!est || !est.job) return `<div class="empty"><h2>That job doesn't exist yet</h2><p>Jobs appear once an estimate is accepted.</p><a class="btn" href="#/production">Production board</a></div>`;
    App.cur = est;
    const tabs = [['overview', 'Overview'], ['estimate', 'Estimate'], ['workings', 'Workings'], ['files', 'Plans and files'], ['deliveries', 'Frames and deliveries'], ['coils', 'Coils'], ['checklist', 'Factory checklist'], ['backcost', 'Back-costing'], ['pos', 'Purchase orders']];
    const body = { overview: App.Jobs.overview, estimate: x => `<div class="row-btns" style="margin:0 0 14px"><a class="btn" href="#/e/${x.id}/preview">Open estimate</a></div><div class="doc-preview" id="job-doc"></div>`, workings: x => `<div class="row-btns" style="margin:0 0 14px"><a class="btn" href="#/e/${x.id}/workings">Open workings</a></div><div class="doc-preview" id="job-doc"></div>`, files: App.Jobs.filesTab, deliveries: App.Jobs.delTab, checklist: App.Jobs.checkTab, backcost: App.Jobs.backTab, pos: App.Jobs.poTab, coils: x => App.Coil.jobTab(x) }[tab] || App.Jobs.overview;
    return `<div class="page-head"><div><div class="crumbs"><a href="#/production">Production</a></div>
      <h1>${e(st.displayNumber(est))} <span class="pill stage">${e(App.stageLabel(est.job.stage))}</span></h1>
      <p class="sub">${e(est.client.company || est.client.name)}, ${e(est.heading)}${est.siteAddress ? ', ' + e(est.siteAddress) : ''}</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<a href="#/job/${est.id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="tab-body">${body(est)}</div>`;
  };
  App.views.job.mount = (id, tab) => { const est = st.get(id); if (!est) return; if (tab === 'files') App.Jobs.loadFiles(est); if (tab === 'estimate') App.Docs.ensureImage(est).then(() => App.Docs.fill(document.getElementById('job-doc'), App.Docs.estimate(est))); if (tab === 'workings') App.Docs.fill(document.getElementById('job-doc'), App.Docs.workings(est)); if (tab === 'coils') { if (!App.Coil.S.token) App.Coil.mountLogin(); else if (!App.Coil.S.loadedAt) App.Coil.load().then(() => App.refresh()).catch(er => App.toast(er.message, 'err')); } };

  App.Jobs.overview = est => {
    const j = est.job; const i = STAGE_IDX(j.stage); const ld = App.Jobs.loadsDone(est); const ck = App.Jobs.checkDone(est);
    const vars = st.live().filter(v => v.parentId === est.id);
    const t = st.totals(est);
    return `<section class="card"><h3>Where it's at</h3>
      <ol class="stepper">${App.STAGES.map((s, k) => `<li class="${k < i ? 'past' : k === i ? 'now' : ''}"><button data-act="jobStage" data-s="${s.value}"><span class="n">${k + 1}</span>${s.label}</button></li>`).join('')}</ol>
      <ul class="activity small">${j.stageLog.slice().reverse().map(l => `<li><time>${App.fmtStamp(l.at)}</time> ${e(App.stageLabel(l.stage))} <span class="hint">${e(l.by)}</span></li>`).join('')}</ul></section>
    <div class="grid2">
    <section class="card"><h3>Dates</h3>
      ${App.field('Manufacture date', `<input type="date" value="${e(j.manufactureDate)}" data-act-change="jobMfg">`)}
      <p>${(j.loads || []).length ? j.loads.map(l => `Delivery ${l.n} of ${j.loads.length}: ${l.date ? App.fmtLong(l.date) : 'not booked'}${l.delivered ? ' (delivered)' : ''}`).join('<br>') : 'Deliveries not planned yet.'}</p>
      <a class="btn small" href="#/job/${est.id}/deliveries">Plan deliveries</a>
      <label class="check"><input type="checkbox" data-bind="job.notifyClient" ${j.notifyClient ? 'checked' : ''}> Email the client when a delivery is booked</label>
    </section>
    <section class="card"><h3>Money</h3>
      <div class="kv-list"><div><span>Total (excl GST)</span><b>${App.money(t.sub)}</b></div><div><span>${S().estimate.depositPct}% deposit</span><b>${App.money(t.deposit)}</b></div></div>
      <label class="check"><input type="checkbox" data-bind="job.deposit.invoiced" ${j.deposit.invoiced ? 'checked' : ''}> Deposit invoiced</label>
      <label class="check"><input type="checkbox" data-bind="job.deposit.received" ${j.deposit.received ? 'checked' : ''}> Deposit received</label>
      ${!j.deposit.received && STAGE_IDX(j.stage) >= 3 ? '<div class="banner warn">This job is in manufacture but the deposit isn\'t marked as received.</div>' : ''}
    </section>
    <section class="card"><h3>Progress</h3>
      <div class="kv-list"><div><span>Factory checklist</span><b>${ck.total ? `${ck.done} of ${ck.total} frames` : 'No frames yet'}</b></div><div><span>Deliveries</span><b>${ld.total ? `${ld.done} of ${ld.total} delivered` : 'Not planned'}</b></div></div>
    </section>
    <section class="card"><h3>Variations</h3>
      ${vars.length ? `<ul class="activity">${vars.map(v => `<li><a href="#/e/${v.id}">${e(v.number)}</a> ${e(v.heading)}, ${App.money(st.totals(v).sub)} <span class="pill ${v.status}">${v.status}</span></li>`).join('')}</ul>` : '<p class="hint">No variations.</p>'}
      <button class="btn small" data-act="jobVariation">Create a variation</button>
    </section></div>
    <section class="card"><h3>Job notes</h3><textarea data-bind="job.notes" rows="4">${e(j.notes || '')}</textarea></section>`;
  };
  A.jobStage = el => { App.Jobs.setStage(App.cur, el.dataset.s); App.refresh(); };
  A.jobMfg = async el => {
    const est = App.cur; const d = el.value;
    if (d && !(await App.Jobs.busyOk(est, d))) { el.value = est.job.manufactureDate || ''; return; }
    est.job.manufactureDate = d; if (d && STAGE_IDX(est.job.stage) < 2) App.Jobs.setStage(est, 'scheduled');
    st.log(est, d ? `Manufacture booked for ${App.fmtDate(d)}` : 'Manufacture date cleared'); st.touch(est); st.save(); App.Jobs.syncCal(est); App.refresh();
  };
  A.jobVariation = () => {
    const p = App.cur; const n = st.live().filter(v => v.parentId === p.id).length + 1;
    const v = st.newEstimate(p.type, p.practice, { number: `${p.number}-V${n}`, parentId: p.id, yy: p.yy });
    v.client = App.clone(p.client); v.siteAddress = p.siteAddress; v.heading = `Variation ${n}: ${p.heading}`; v.sections = App.clone(p.sections);
    st.log(v, `Variation of ${st.displayNumber(p)}`); st.log(p, `Variation ${v.number} created`); st.touch(v); st.touch(p); st.save();
    location.hash = `#/e/${v.id}`;
  };

  /* Files */
  App.Jobs.filesTab = est => `<section class="card"><h3>Plans, detailing and photos</h3>
    ${st.mode === 'drive' ? `<label class="drop">Upload files (PDF plans, FRAMECAD .rfy files, photos)<input type="file" multiple data-act-change="jobUpload" hidden></label>
      <label class="drop small">Take a photo<input type="file" accept="image/*" capture="environment" data-act-change="jobUpload" hidden></label>
      <p class="hint">Files are saved in the job's Google Drive folder. FRAMECAD .rfy files are stored with the job so you can download them anytime; the app can't open them.</p>
      <div id="job-files"><p class="hint">Loading files…</p></div>`
    : `<p>Connect Google Drive to store files with the job.</p><label class="drop">Read frames from a FRAMECAD PDF<input type="file" accept="application/pdf" data-act-change="jobReadFrames" hidden></label>`}</section>`;
  App.Jobs.loadFiles = async est => {
    const box = document.getElementById('job-files'); if (!box) return;
    try {
      const root = await st.jobFolder(est); const subs = await App.G.list(root);
      const rows = [];
      for (const f of subs) {
        if (f.mimeType === App.G.FOLDER) (await App.G.list(f.id)).forEach(x => rows.push(Object.assign(x, { folder: f.name })));
        else rows.push(Object.assign(f, { folder: '' }));
      }
      box.innerHTML = rows.length ? `<table class="wtable"><thead><tr><th>File</th><th>Folder</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map(f => `<tr><td><a href="${e(f.webViewLink)}" target="_blank" rel="noopener">${e(f.name)}</a></td><td>${e(f.folder)}</td><td>${App.fmtStamp(f.modifiedTime)}</td>
        <td>${/\.pdf$/i.test(f.name) && f.folder === 'Plans and detailing' ? `<button class="btn small" data-act="jobFramesFromDrive" data-fid="${f.id}" data-name="${e(f.name)}">Read frames</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No files yet.</p>';
    } catch (er) { box.innerHTML = `<p class="err">${e(er.message)}</p>`; }
  };
  A.jobUpload = async el => {
    const est = App.cur; const files = [...el.files]; if (!files.length) return;
    App.toast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
    try {
      for (const f of files) {
        const sub = /^image\//.test(f.type) ? 'Photos' : /\.(pdf|rfy|dwg|dxf)$/i.test(f.name) ? 'Plans and detailing' : 'Other';
        const folder = await st.subFolder(est, sub);
        await App.G.upload({ name: f.name, parent: folder, blob: f, mime: f.type || 'application/octet-stream' });
      }
      st.log(est, `Uploaded ${files.map(f => f.name).join(', ')}`); st.touch(est); st.save();
      App.toast('Uploaded'); App.Jobs.loadFiles(est);
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
  const applyFrames = async (est, buffer, name) => {
    const fc = await App.FC.parse(buffer, name);
    if (!fc.frames.length) throw new Error('No frames found in that PDF.');
    if (est.job.frames.length && !(await App.confirm('Replace the frame list?', `This job already has ${est.job.frames.length} frame types. Replace them with the ${fc.frames.length} from ${name}? Any delivery split and checklist ticks will be reset.`, 'Replace'))) return;
    est.job.frames = fc.frames; est.job.loads = []; est.job.checklist.ticks = {}; est.job.framesFrom = name;
    st.log(est, `Frames read from ${name}: ${App.FC.summaryText(fc)}`); st.touch(est); st.save();
    App.toast(`Read ${App.FC.summaryText(fc)}`); const h = `#/job/${est.id}/deliveries`; if (location.hash === h) App.refresh(); else location.hash = h;
  };
  A.jobFramesFromDrive = async el => { try { App.toast('Reading the drawings…'); const b = await App.G.getBlob(el.dataset.fid); await applyFrames(App.cur, await b.arrayBuffer(), el.dataset.name); } catch (er) { App.toast(er.message, 'err', 6000); } };
  A.jobReadFrames = async el => { const f = el.files[0]; if (!f) return; try { await applyFrames(App.cur, await App.readFile(f, 'buffer'), f.name); if (st.mode === 'drive') { const folder = await st.subFolder(App.cur, 'Plans and detailing'); await App.G.uploadOrReplace({ name: f.name, parent: folder, blob: f, mime: 'application/pdf' }); } } catch (er) { App.toast(er.message, 'err', 6000); } };
  A.jobFramesFromWorkings = () => { const est = App.cur; est.job.frames = App.clone(est.workings.framecad.frames); est.job.framesFrom = est.workings.framecad.fileName; st.touch(est); st.save(); App.refresh(); };

  /* Frames and deliveries */
  App.Jobs.delTab = est => {
    const j = est.job; const frames = j.frames || []; const maxKg = App.num(S().delivery.truckMaxKg);
    if (!frames.length) return `<section class="card"><h3>Frames</h3><p>No frames on this job yet. Read them from the FRAMECAD PDF detailing.</p>
      <div class="row-btns"><label class="btn primary">Upload PDF detailing<input type="file" accept="application/pdf" data-act-change="jobReadFrames" hidden></label>
      ${est.workings.framecad ? `<button class="btn" data-act="jobFramesFromWorkings">Use the frames from my workings (${e(est.workings.framecad.fileName)})</button>` : ''}</div></section>
      <section class="card"><h3>Deliveries</h3><p class="hint">You can still book a delivery date without a frame list.</p>${App.Jobs.loadsHtml(est, maxKg)}</section>`;
    const counts = {}; frames.forEach(f => counts[f.category] = (counts[f.category] || 0) + f.qty);
    return `<section class="card"><h3>Frames</h3>
      <p>${App.FC.CATS.filter(c => counts[c]).map(c => `<b>${counts[c]}</b> ${c.toLowerCase()}`).join(', ')}${j.framesFrom ? ` <span class="hint">from ${e(j.framesFrom)}</span>` : ''}</p>
      <details><summary>See and edit every frame (${frames.length})</summary>
      <table class="wtable"><thead><tr><th>Frame</th><th>Group</th><th>Type</th><th class="r">Qty</th><th class="r">Length</th><th class="r">Weight</th><th>Delivery</th></tr></thead><tbody>
      ${frames.map((f, i) => `<tr><td><input data-bind="job.frames.${i}.name" value="${e(f.name)}"></td><td>${e([f.level, f.group].filter(Boolean).join(', '))}</td>
        <td><select data-bind="job.frames.${i}.category">${App.opts(App.FC.CATS, f.category)}</select></td><td><input class="num" data-bind="job.frames.${i}.qty" data-type="num" value="${f.qty}"></td>
        <td class="r">${f.length != null ? f.length + ' m' : '-'}</td><td class="r">${f.weight != null ? f.weight + ' kg' : '-'}</td>
        <td>${j.loads.length ? `<select data-act-change="frameLoad" data-fid="${f.id}">${j.loads.map(l => App.opt(l.id, `Delivery ${l.n}`, (j.loads.find(x => x.frameIds.includes(f.id)) || {}).id)).join('')}</select>` : ''}</td></tr>`).join('')}</tbody></table></details>
      <div class="row-btns"><label class="btn small ghost">Replace from a new PDF<input type="file" accept="application/pdf" data-act-change="jobReadFrames" hidden></label></div>
    </section>
    <section class="card"><h3>Deliveries</h3>
      <div class="row"><label class="fld inline"><span>How many loads?</span><input type="number" min="1" max="12" id="load-n" value="${j.loads.length || (est.type === 'ft' ? 2 : 1)}"></label><button class="btn" data-act="loadsSuggest">Suggest a split</button></div>
      ${maxKg ? `<p class="hint">Truck and trailer limit: ${maxKg.toLocaleString('en-NZ')} kg per load.</p>` : '<p class="hint">Set your truck and trailer limit in Settings to get a warning when a load is too heavy.</p>'}
      ${App.Jobs.loadsHtml(est, maxKg)}
    </section>`;
  };
  App.Jobs.loadsHtml = (est, maxKg) => {
    const j = est.job;
    if (!j.loads.length) return `<button class="btn small" data-act="loadAdd">Add a delivery</button>`;
    return `<div class="loads">${j.loads.map((l, i) => {
      const fr = j.frames.filter(f => l.frameIds.includes(f.id)); const kg = App.Jobs.loadKg(est, l); const counts = {};
      fr.forEach(f => counts[f.category] = (counts[f.category] || 0) + f.qty);
      return `<div class="load ${l.delivered ? 'done' : ''}"><h4>Delivery ${l.n} of ${j.loads.length}</h4>
        ${App.field('Date', `<input type="date" value="${e(l.date)}" data-act-change="loadDate" data-i="${i}">`)}
        <p>${App.FC.CATS.filter(c => counts[c]).map(c => `${counts[c]} ${c.toLowerCase()}`).join(', ') || 'No frames assigned'}${kg ? `, ${Math.round(kg).toLocaleString('en-NZ')} kg` : ''}</p>
        ${maxKg && kg > maxKg ? `<div class="banner warn">Over the ${maxKg.toLocaleString('en-NZ')} kg limit. Move some frames to another load.</div>` : ''}
        <label class="check"><input type="checkbox" data-act-change="loadDelivered" data-i="${i}" ${l.delivered ? 'checked' : ''}> Delivered</label>
        <div class="row-btns">
          <button class="btn small" data-act="docket" data-i="${i}" data-c="both">Print docket (both copies)</button>
          <button class="btn small ghost" data-act="docket" data-i="${i}" data-c="ours">Our copy</button>
          <button class="btn small ghost" data-act="docket" data-i="${i}" data-c="customer">Customer copy</button>
          ${j.notifyClient && l.date && est.client.email ? `<button class="btn small ghost" data-act="loadEmail" data-i="${i}">${l.notified ? 'Email date again' : 'Email client the date'}</button>` : ''}
          ${j.loads.length > 1 ? `<button class="btn small ghost danger" data-act="loadDel" data-i="${i}">Remove</button>` : ''}
        </div></div>`;
    }).join('')}</div><button class="btn small ghost" data-act="loadAdd">Add a delivery</button>`;
  };
  const jsave = () => { st.touch(App.cur); st.save(); App.refresh(); };
  A.loadsSuggest = async () => {
    const est = App.cur; const n = Math.max(1, Math.min(12, parseInt(document.getElementById('load-n').value, 10) || 1));
    if (est.job.loads.some(l => l.date) && !(await App.confirm('Replace the delivery split?', 'This re-splits all frames. Dates you\'ve booked are kept in order.', 'Re-split'))) return;
    const old = est.job.loads; est.job.loads = App.Jobs.suggestLoads(est.job.frames, n);
    est.job.loads.forEach((l, i) => { if (old[i]) { l.date = old[i].date; l.calId = old[i].calId; l.delivered = old[i].delivered; } });
    old.slice(n).forEach(l => l.calId && App.G.deleteEvent(S().google.calendarId || 'primary', l.calId));
    st.log(est, `Split into ${n} deliveries`); jsave(); App.Jobs.syncCal(est);
  };
  A.loadAdd = () => { const j = App.cur.job; j.loads.push({ id: App.uid(), n: j.loads.length + 1, date: '', frameIds: j.loads.length ? [] : j.frames.map(f => f.id), delivered: false }); jsave(); };
  A.loadDel = async el => {
    const j = App.cur.job; const i = +el.dataset.i; const l = j.loads[i];
    if (!(await App.confirm('Remove this delivery?', 'Its frames move to the delivery before it.', 'Remove'))) return;
    const to = j.loads[i - 1] || j.loads[i + 1]; to.frameIds = to.frameIds.concat(l.frameIds);
    if (l.calId) App.G.deleteEvent(S().google.calendarId || 'primary', l.calId);
    j.loads.splice(i, 1); j.loads.forEach((x, k) => x.n = k + 1); jsave(); App.Jobs.syncCal(App.cur);
  };
  A.frameLoad = el => { const j = App.cur.job; j.loads.forEach(l => l.frameIds = l.frameIds.filter(id => id !== el.dataset.fid)); j.loads.find(l => l.id === el.value).frameIds.push(el.dataset.fid); jsave(); };
  A.loadDate = el => {
    const est = App.cur; const l = est.job.loads[+el.dataset.i]; l.date = el.value;
    if (l.date && STAGE_IDX(est.job.stage) < 5 && STAGE_IDX(est.job.stage) >= 4) App.Jobs.setStage(est, 'delivery');
    st.log(est, `Delivery ${l.n} ${l.date ? 'booked for ' + App.fmtDate(l.date) : 'date cleared'}`); jsave(); App.Jobs.syncCal(est);
  };
  A.loadDelivered = el => {
    const est = App.cur; const l = est.job.loads[+el.dataset.i]; l.delivered = el.checked; l.deliveredAt = el.checked ? Date.now() : null;
    st.log(est, `Delivery ${l.n} ${el.checked ? 'delivered' : 'marked not delivered'}`);
    if (est.job.loads.every(x => x.delivered) && STAGE_IDX(est.job.stage) < STAGE_IDX('delivered')) App.Jobs.setStage(est, 'delivered');
    jsave(); App.Jobs.syncCal(est);
  };
  A.docket = el => {
    const est = App.cur; const l = est.job.loads[+el.dataset.i]; const c = el.dataset.c;
    const html = c === 'both' ? [App.Docs.docket(est, l, 'ours'), App.Docs.docket(est, l, 'customer')] : App.Docs.docket(est, l, c);
    l.docketAt = Date.now(); st.touch(est); st.save();
    App.Docs.preview(`Delivery ${l.n} docket`, html, { pdfName: `${est.number} Delivery ${l.n} docket.pdf`,
      onDrive: st.mode === 'drive' ? async () => { const f = await st.subFolder(est, 'Dockets and checklists'); await App.G.uploadOrReplace({ name: `${est.number} Delivery ${l.n} docket.pdf`, parent: f, blob: await App.Docs.toPdf(html), mime: 'application/pdf' }); } : null });
  };
  A.loadEmail = el => {
    const est = App.cur; const l = est.job.loads[+el.dataset.i];
    const t = App.mail.tpl('delivery', est, { delivery_date: App.fmtDate(l.date, { weekday: 'long', day: 'numeric', month: 'long' }), load: `delivery ${l.n} of ${est.job.loads.length}` });
    App.mail.compose({ title: `Delivery ${l.n}: email the client`, est, kind: 'delivery', to: est.client.email, subject: t.subject, body: t.body, onSent: () => { l.notified = Date.now(); st.log(est, `Client emailed delivery ${l.n} date`); jsave(); } });
  };

  /* Factory checklist */
  App.Jobs.checkTab = est => {
    const j = est.job; const frames = j.frames || []; const ck = App.Jobs.checkDone(est); const ticks = j.checklist.ticks || {};
    if (!frames.length) return `<section class="card"><h3>Factory checklist</h3><p>Read the frames from the PDF detailing first.</p><a class="btn" href="#/job/${est.id}/deliveries">Go to frames and deliveries</a></section>`;
    const groups = j.loads.length > 1 ? j.loads.map(l => ({ t: `Delivery ${l.n}`, f: frames.filter(f => l.frameIds.includes(f.id)) })) : App.FC.CATS.map(c => ({ t: c, f: frames.filter(f => f.category === c) })).filter(g => g.f.length);
    return `<section class="card"><div class="check-head"><div><h3>Factory checklist</h3><p class="hint">Tap a frame when it's done. This works on a tablet in the factory too.</p></div>
      <div class="row-btns"><button class="btn primary" data-act="checkPrint">Print checklist</button></div></div>
      <div class="target-bar"><i style="width:${ck.total ? ck.done / ck.total * 100 : 0}%"></i></div><p><b>${ck.done} of ${ck.total}</b> frames done</p>
      ${groups.map(g => `<h4>${e(g.t)}</h4><div class="tick-grid">${g.f.map(f => `<button class="tick ${ticks[f.id] ? 'on' : ''}" data-act="tickFrame" data-fid="${f.id}" aria-pressed="${!!ticks[f.id]}"><b>${e(f.name)}</b>${f.qty > 1 ? `<span>x${f.qty}</span>` : ''}</button>`).join('')}</div>`).join('')}
      <div class="grid2 signoff-in">${App.field('Foreman sign-off', `<input data-bind="job.checklist.foreman" value="${e(j.checklist.foreman || '')}">`)}${App.field('Date', `<input type="date" data-bind="job.checklist.date" value="${e(j.checklist.date || '')}">`)}</div>
    </section>`;
  };
  A.tickFrame = el => {
    const est = App.cur; const t = est.job.checklist.ticks = est.job.checklist.ticks || {}; t[el.dataset.fid] = !t[el.dataset.fid];
    if (STAGE_IDX(est.job.stage) < 3 && t[el.dataset.fid]) App.Jobs.setStage(est, 'manufacturing');
    const ck = App.Jobs.checkDone(est); if (ck.total && ck.done === ck.total && STAGE_IDX(est.job.stage) < 4) { App.Jobs.setStage(est, 'yard'); App.toast('All frames done. Moved to "In yard".'); }
    jsave();
  };
  A.checkPrint = () => { const est = App.cur; const html = App.Docs.checklist(est); App.Docs.preview('Factory checklist', html, { pdfName: `${est.number} Factory checklist.pdf`, onDrive: st.mode === 'drive' ? async () => { const f = await st.subFolder(est, 'Dockets and checklists'); await App.G.uploadOrReplace({ name: `${est.number} Factory checklist.pdf`, parent: f, blob: await App.Docs.toPdf(html), mime: 'application/pdf' }); } : null }); };

  /* Back-costing */
  App.Jobs.backTab = est => {
    const b = est.job.backcost;
    if (!b) return `<section class="card"><h3>Back-costing</h3><p>Compare what the job actually cost against your workings and see what you really made.</p><button class="btn primary" data-act="backStart">Start back-costing</button></section>`;
    const t = App.Jobs.backTotals(est);
    return `<section class="card"><h3>Back-costing</h3>
      <table class="wtable"><thead><tr><th>Item</th><th class="r">Estimated cost</th><th class="r">Actual cost</th><th class="r">Difference</th><th></th></tr></thead><tbody>
      ${b.lines.map((l, i) => { const d = (l.actual === '' || l.actual == null) ? null : App.num(l.actual) - App.num(l.est); return `<tr><td><input data-bind="job.backcost.lines.${i}.desc" value="${e(l.desc)}"></td>
        <td><input class="num" data-bind="job.backcost.lines.${i}.est" data-type="num" value="${e(l.est)}" data-rerender-blur="1"></td>
        <td><input class="num" data-bind="job.backcost.lines.${i}.actual" data-type="num" value="${e(l.actual ?? '')}" placeholder="Actual" data-rerender-blur="1"></td>
        <td class="r ${d > 0 ? 'neg' : d < 0 ? 'pos' : ''}">${d == null ? '' : (d > 0 ? '+' : '') + App.money(d)}</td><td><button class="icon-btn" data-act="backDel" data-i="${i}" aria-label="Remove">✕</button></td></tr>`; }).join('')}
      </tbody></table><button class="btn small ghost" data-act="backAdd">Add a cost</button>
      <div class="stat-strip">
        <div><span>Sold for (excl GST)${t.vars ? ', incl variations' : ''}</span><b>${App.money(t.sold)}</b></div>
        <div><span>Estimated cost</span><b>${App.money(t.estCost)}</b></div>
        <div><span>Actual cost</span><b>${App.money(t.actual)}</b></div>
        <div class="${t.profit < 0 ? 'bad' : ''}"><span>Profit</span><b>${App.money(t.profit)} (${App.pct(t.margin)})</b></div>
      </div>
      <p class="hint">Blank actual costs are counted at the estimated cost.</p>
      <label class="check"><input type="checkbox" data-bind="job.backcost.done" data-rerender="1" ${b.done ? 'checked' : ''}> Back-costing finished (shows on the dashboard)</label>
    </section>`;
  };
  A.backStart = () => {
    const est = App.cur; const w = est.workings; const lines = [];
    w.steel.forEach(r => lines.push({ id: App.uid(), desc: `${r.size} ${r.gauge} BMT steel (${App.num(r.lm)} LM)`, est: App.round(st.steelCost(r), 2), actual: '' }));
    w.lines.filter(l => l.bucket !== 'option').forEach(l => lines.push({ id: App.uid(), desc: l.desc || 'Item', est: App.round(st.lineCost(l), 2), actual: '' }));
    if (!lines.length) lines.push({ id: App.uid(), desc: 'Steel', est: '', actual: '' }, { id: App.uid(), desc: 'Labour', est: '', actual: '' });
    est.job.backcost = { lines, done: false, startedAt: Date.now() }; st.log(est, 'Back-costing started'); jsave();
  };
  A.backAdd = () => { App.cur.job.backcost.lines.push({ id: App.uid(), desc: '', est: 0, actual: '' }); jsave(); };
  A.backDel = el => { App.cur.job.backcost.lines.splice(+el.dataset.i, 1); jsave(); };

  /* Purchase orders */
  App.Jobs.poTab = est => {
    const pos = est.job.pos || [];
    return `<section class="card"><h3>Purchase orders</h3>
      ${pos.length ? `<table class="wtable"><thead><tr><th>PO</th><th>Supplier</th><th>Date</th><th class="r">Total</th><th></th></tr></thead><tbody>${pos.map((p, i) => `<tr><td>${e(p.number)}</td><td>${e(p.supplier)}</td><td>${App.fmtDate(p.date)}</td><td class="r">${App.money(p.lines.reduce((t, l) => t + App.num(l.qty) * App.num(l.cost), 0))}</td>
        <td class="row-btns"><button class="btn small" data-act="poView" data-i="${i}">View</button>${st.mode === 'drive' ? `<button class="btn small ghost" data-act="poEmail" data-i="${i}">Email supplier</button>` : ''}
          <label class="check small"><input type="checkbox" data-act-change="poFlag" data-i="${i}" data-k="confirmed" ${p.confirmed ? 'checked' : ''}> Confirmed</label><label class="check small"><input type="checkbox" data-act-change="poFlag" data-i="${i}" data-k="received" ${p.received ? 'checked' : ''}> Received</label></td></tr>`).join('')}</tbody></table>` : '<p class="hint">No purchase orders yet.</p>'}
      <button class="btn primary" data-act="poNew">Create purchase order</button></section>`;
  };
  A.poFlag = el => { const p = App.cur.job.pos[+el.dataset.i]; p[el.dataset.k] = el.checked; st.log(App.cur, `${p.number} marked ${el.checked ? '' : 'not '}${el.dataset.k}`); st.touch(App.cur); st.save(); };
  A.poNew = () => {
    const est = App.cur; const lines = est.workings.lines.filter(l => l.bucket !== 'option' && l.kind !== 'labour' && l.kind !== 'delivery');
    const suppliers = [...new Set(lines.map(l => l.supplier).filter(Boolean))];
    const m = App.modal('Create purchase order', `
      ${App.field('Supplier', `<input id="po-sup" list="po-sups" value="${e(suppliers[0] || '')}"><datalist id="po-sups">${[...new Set(S().pricing.items.map(i => i.supplier).filter(Boolean))].map(s => `<option value="${e(s)}">`).join('')}</datalist>`)}
      ${App.field('Supplier email', `<input id="po-email" type="email" value="${e((lines.find(l => l.supplier === suppliers[0]) || {}).supplierEmail || '')}">`)}
      ${App.field('Required by', '<input type="date" id="po-req">')}
      <h4>Items from my workings</h4>
      ${lines.length ? `<div class="checks">${lines.map((l, i) => `<label class="check"><input type="checkbox" class="po-l" value="${i}" ${l.supplier === suppliers[0] || !suppliers.length ? 'checked' : ''}> ${e(l.desc)} (${e(l.qty)} ${e(l.unit || '')} at ${App.money(l.cost)})</label>`).join('')}</div>` : '<p class="hint">No items in the workings. You can add lines after creating it.</p>'}
      ${App.field('Notes', '<textarea id="po-notes" rows="2"></textarea>')}`,
      { wide: true, actions: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="po-ok">Create</button>` });
    m.querySelector('#po-ok').onclick = () => {
      const pos = est.job.pos = est.job.pos || [];
      const po = { id: App.uid(), number: `${est.number}-PO${pos.length + 1}`, date: App.today(), supplier: m.querySelector('#po-sup').value, supplierEmail: m.querySelector('#po-email').value, requiredBy: m.querySelector('#po-req').value, notes: m.querySelector('#po-notes').value, deliverTo: '',
        lines: [...m.querySelectorAll('.po-l:checked')].map(c => { const l = lines[+c.value]; return { desc: l.desc, qty: l.qty, unit: l.unit, cost: l.cost }; }) };
      if (!po.lines.length) po.lines.push({ desc: '', qty: 1, unit: 'ea', cost: 0 });
      pos.push(po); st.log(est, `Purchase order ${po.number} created for ${po.supplier}`); App.closeModal(); jsave();
    };
  };
  A.poView = el => {
    const est = App.cur; const po = est.job.pos[+el.dataset.i]; const html = App.Docs.po(est, po);
    App.Docs.preview(po.number, html, { pdfName: `${po.number}.pdf`, onDrive: st.mode === 'drive' ? async () => { const f = await st.subFolder(est, 'Purchase orders'); await App.G.uploadOrReplace({ name: `${po.number}.pdf`, parent: f, blob: await App.Docs.toPdf(html), mime: 'application/pdf' }); } : null });
  };
  A.poEmail = async el => {
    const est = App.cur; const po = est.job.pos[+el.dataset.i];
    const blob = await App.Docs.toPdf(App.Docs.po(est, po));
    const t = App.mail.tpl('po', est, { po_number: po.number });
    App.mail.compose({ title: `Email ${po.number}`, est, kind: 'po', to: po.supplierEmail, subject: t.subject, body: t.body, extra: [{ name: `${po.number}.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) }], onSent: () => { po.sentAt = Date.now(); st.log(est, `${po.number} emailed to ${po.supplier}`); jsave(); } });
  };
})();
