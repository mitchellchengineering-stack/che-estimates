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

  /* ---------- Production board ---------- */
  App.views.production = () => {
    const jobs = App.Jobs.list();
    return `<div class="page-head"><div><h1>Production</h1><p class="sub">Drag a job to the next column as it moves along, or open it to update.</p></div><div class="head-actions"><a class="btn" href="#/calendar">Calendar</a></div></div>
    <div class="board">${App.STAGES.map(s => {
      const col = jobs.filter(j => j.job.stage === s.value);
      return `<div class="col" data-drop-stage="${s.value}"><h3>${s.label} <span>${col.length}</span></h3>
        ${col.map(j => App.Jobs.card(j)).join('') || '<p class="col-empty">Nothing here</p>'}</div>`;
    }).join('')}</div>`;
  };
  App.Jobs.card = j => {
    const ld = App.Jobs.loadsDone(j); const ck = App.Jobs.checkDone(j); const nd = App.Jobs.nextDelivery(j); const i = STAGE_IDX(j.job.stage);
    return `<a class="job-card" href="#/job/${j.id}" draggable="true" data-drag-job="${j.id}">
      <b>${e(st.displayNumber(j))}</b><span>${e(j.client.company || j.client.name)}</span><span class="hint">${e(j.heading)}</span>
      ${j.job.manufactureDate && i <= 3 ? `<span class="tag">Make ${App.fmtShort(j.job.manufactureDate)}</span>` : ''}
      ${j.job.stage === 'manufacturing' && ck.total ? `<span class="tag">${ck.done} of ${ck.total} frames done</span>` : ''}
      ${nd ? `<span class="tag">Delivery ${nd.n}/${j.job.loads.length} ${App.fmtShort(nd.date)}</span>` : ''}
      ${ld.total > 1 && ld.done ? `<span class="tag ok">Delivered ${ld.done} of ${ld.total}</span>` : ''}
      <span class="card-move"><button data-act="stageStep" data-id="${j.id}" data-d="-1" ${i <= 0 ? 'disabled' : ''} aria-label="Move back">‹</button><button data-act="stageStep" data-id="${j.id}" data-d="1" ${i >= App.STAGES.length - 1 ? 'disabled' : ''} aria-label="Move forward">›</button></span>
    </a>`;
  };
  App.views.production.mount = () => {
    document.querySelectorAll('[data-drag-job]').forEach(c => c.ondragstart = ev => { ev.dataTransfer.setData('text/job', c.dataset.dragJob); c.classList.add('dragging'); });
    document.querySelectorAll('[data-drop-stage]').forEach(col => {
      col.ondragover = ev => { ev.preventDefault(); col.classList.add('over'); };
      col.ondragleave = () => col.classList.remove('over');
      col.ondrop = ev => { ev.preventDefault(); const id = ev.dataTransfer.getData('text/job'); const est = st.get(id); if (est) { App.Jobs.setStage(est, col.dataset.dropStage); App.refresh(); } };
    });
  };
  A.stageStep = (el, ev) => { ev.preventDefault(); ev.stopPropagation(); const est = st.get(el.dataset.id); const i = STAGE_IDX(est.job.stage) + (+el.dataset.d); if (App.STAGES[i]) { App.Jobs.setStage(est, App.STAGES[i].value); App.refresh(); } };

  /* ---------- Calendar ---------- */
  App.Jobs.events = () => {
    const out = [];
    App.Jobs.list().forEach(j => {
      const who = j.client.company || j.client.name;
      if (j.job.manufactureDate) out.push({ date: j.job.manufactureDate, cls: 'mfg', text: `${j.number} make`, title: `Manufacture ${j.number}, ${who}`, drag: `mfg:${j.id}`, href: `#/job/${j.id}` });
      (j.job.loads || []).forEach(l => l.date && out.push({ date: l.date, cls: l.delivered ? 'done' : 'del', text: `${j.number} delivery ${l.n}/${j.job.loads.length}`, title: `Delivery ${l.n} of ${j.job.loads.length}, ${who}, ${j.siteAddress}`, drag: `load:${j.id}:${l.id}`, href: `#/job/${j.id}/deliveries` }));
    });
    st.data.events.filter(x => !x.deleted).forEach(ev => out.push({ date: ev.date, cls: 'ev', text: ev.title, title: ev.notes || ev.title, drag: `ev:${ev.id}`, evId: ev.id }));
    return out;
  };
  App.views.calendar = () => {
    const c = App.state.cal = App.state.cal || { view: 'month', anchor: App.today() };
    const evs = App.Jobs.events(); const byDate = {}; evs.forEach(x => (byDate[x.date] = byDate[x.date] || []).push(x));
    const chip = x => `<${x.href ? `a href="${x.href}"` : `button data-act="evEdit" data-id="${x.evId}"`} class="chip-ev ${x.cls}" draggable="true" data-drag-ev="${x.drag}" title="${e(x.title)}">${e(x.text)}</${x.href ? 'a' : 'button'}>`;
    let body = '';
    const today = App.today();
    if (c.view === 'month') {
      const first = App.parseDate(c.anchor.slice(0, 8) + '01'); const start = App.weekStart(App.iso(first));
      const month = c.anchor.slice(0, 7);
      body = `<div class="cal-grid"><div class="cal-dow">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal-days">
        ${Array.from({ length: 42 }, (_, i) => { const d = App.addDays(start, i); return `<div class="cal-day ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''}" data-drop-date="${d}" data-act="dayClick" data-d="${d}"><span class="dn">${+d.slice(8)}</span>${(byDate[d] || []).map(chip).join('')}</div>`; }).join('')}</div></div>`;
    } else {
      const start = App.weekStart(c.anchor);
      body = `<div class="cal-week">${Array.from({ length: 7 }, (_, i) => { const d = App.addDays(start, i); return `<div class="wk-day ${d === today ? 'today' : ''}" data-drop-date="${d}"><h4>${App.fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}</h4>${(byDate[d] || []).map(chip).join('') || '<p class="hint">Nothing booked</p>'}<button class="btn small ghost" data-act="dayClick" data-d="${d}">Add</button></div>`; }).join('')}</div>`;
    }
    const label = c.view === 'month' ? App.fmtDate(c.anchor, { month: 'long', year: 'numeric' }) : `Week of ${App.fmtLong(App.weekStart(c.anchor))}`;
    return `<div class="page-head"><div><h1>Calendar</h1><p class="sub">Manufacture dates, deliveries and anything else you add. Drag something to move it.</p></div>
      <div class="head-actions"><button class="btn" data-act="evNew">Add to calendar</button></div></div>
    <div class="cal-bar"><button class="btn small" data-act="calNav" data-d="-1" aria-label="Previous">‹</button><button class="btn small" data-act="calNav" data-d="0">Today</button><button class="btn small" data-act="calNav" data-d="1" aria-label="Next">›</button>
      <h2>${label}</h2><div class="seg"><label><input type="radio" name="calv" value="month" data-act-change="calView" ${c.view === 'month' ? 'checked' : ''}><span>Month</span></label><label><input type="radio" name="calv" value="week" data-act-change="calView" ${c.view === 'week' ? 'checked' : ''}><span>Week</span></label></div></div>
    <div class="legend"><span><i class="dot mfg"></i>Manufacture</span><span><i class="dot del"></i>Delivery</span><span><i class="dot done"></i>Delivered</span><span><i class="dot ev"></i>Other</span></div>
    ${body}`;
  };
  App.views.calendar.mount = () => {
    document.querySelectorAll('[data-drag-ev]').forEach(c => c.ondragstart = ev => { ev.stopPropagation(); ev.dataTransfer.setData('text/ev', c.dataset.dragEv); });
    document.querySelectorAll('[data-drop-date]').forEach(cell => {
      cell.ondragover = ev => { ev.preventDefault(); cell.classList.add('over'); };
      cell.ondragleave = () => cell.classList.remove('over');
      cell.ondrop = async ev => {
        ev.preventDefault(); cell.classList.remove('over');
        const [kind, id, lid] = ev.dataTransfer.getData('text/ev').split(':'); const d = cell.dataset.dropDate;
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
  A.calNav = el => { const c = App.state.cal; const d = +el.dataset.d; c.anchor = d === 0 ? App.today() : c.view === 'month' ? App.addMonths(c.anchor.slice(0, 8) + '01', d) : App.addDays(c.anchor, 7 * d); App.refresh(); };
  A.calView = el => { App.state.cal.view = el.value; App.refresh(); };
  const evModal = (ev) => {
    const isNew = !ev.id;
    const m = App.modal(isNew ? 'Add to calendar' : 'Edit', `${App.field('What', `<input id="ev-t" value="${e(ev.title || '')}" placeholder="e.g. Site visit, steel order due">`)}${App.field('Date', `<input type="date" id="ev-d" value="${e(ev.date || App.today())}">`)}${App.field('Notes', `<textarea id="ev-n" rows="3">${e(ev.notes || '')}</textarea>`)}`,
      { actions: `${isNew ? '' : '<button class="btn ghost danger" id="ev-del">Delete</button>'}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="ev-ok">Save</button>` });
    m.querySelector('#ev-ok').onclick = () => {
      const t = m.querySelector('#ev-t').value.trim(); if (!t) return App.toast('Add what it is', 'err');
      Object.assign(ev, { title: t, date: m.querySelector('#ev-d').value, notes: m.querySelector('#ev-n').value });
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
    const tabs = [['overview', 'Overview'], ['estimate', 'Estimate'], ['workings', 'Workings'], ['files', 'Plans and files'], ['deliveries', 'Frames and deliveries'], ['checklist', 'Factory checklist'], ['backcost', 'Back-costing'], ['pos', 'Purchase orders']];
    const body = { overview: App.Jobs.overview, estimate: x => `<div class="row-btns" style="margin:0 0 14px"><a class="btn" href="#/e/${x.id}/preview">Open estimate</a></div><div class="doc-preview" id="job-doc"></div>`, workings: x => `<div class="row-btns" style="margin:0 0 14px"><a class="btn" href="#/e/${x.id}/workings">Open workings</a></div><div class="doc-preview" id="job-doc"></div>`, files: App.Jobs.filesTab, deliveries: App.Jobs.delTab, checklist: App.Jobs.checkTab, backcost: App.Jobs.backTab, pos: App.Jobs.poTab }[tab] || App.Jobs.overview;
    return `<div class="page-head"><div><div class="crumbs"><a href="#/production">Production</a></div>
      <h1>${e(st.displayNumber(est))} <span class="pill stage">${e(App.stageLabel(est.job.stage))}</span></h1>
      <p class="sub">${e(est.client.company || est.client.name)}, ${e(est.heading)}${est.siteAddress ? ', ' + e(est.siteAddress) : ''}</p></div></div>
      <div class="tabs">${tabs.map(([k, l]) => `<a href="#/job/${est.id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="tab-body">${body(est)}</div>`;
  };
  App.views.job.mount = (id, tab) => { const est = st.get(id); if (!est) return; if (tab === 'files') App.Jobs.loadFiles(est); if (tab === 'estimate') App.Docs.ensureImage(est).then(() => App.Docs.fill(document.getElementById('job-doc'), App.Docs.estimate(est))); if (tab === 'workings') App.Docs.fill(document.getElementById('job-doc'), App.Docs.workings(est)); };

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
        <td class="row-btns"><button class="btn small" data-act="poView" data-i="${i}">View</button>${st.mode === 'drive' ? `<button class="btn small ghost" data-act="poEmail" data-i="${i}">Email supplier</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No purchase orders yet.</p>'}
      <button class="btn primary" data-act="poNew">Create purchase order</button></section>`;
  };
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
