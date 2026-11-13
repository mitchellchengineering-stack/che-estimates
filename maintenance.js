/* Maintenance: machines and vehicles, with reminders by days, hours, kilometres or metres run.
   Metres run on each roll-former come from the jobs made on it (their steel lines). */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const col = k => (st.data[k] = st.data[k] || []);
  const live = k => col(k).filter(x => !x.deleted);
  const save = x => { x.updatedAt = Date.now(); st.touch(x); st.save(); };
  const add = (k, x) => { x.id = x.id || App.uid(); x.createdAt = x.createdAt || Date.now(); col(k).push(x); save(x); return x; };
  const fmt = n => Math.round(App.num(n)).toLocaleString('en-NZ');
  const fdate = d => d ? App.fmtShort(String(d).slice(0, 10)) : '';
  const UNITS = { days: 'days', hours: 'hours', km: 'km', lm: 'LM run' };
  const task = (name, every, unit) => ({ id: App.uid(), name, every, unit, last: null });
  const SEED = () => {
    const ms = (S().machines || []);
    const m = (id, name, pm, tasks) => ({ id: 'as-' + id, kind: 'machine', name, unit: 'hours', meter: '', pricingMachine: pm, tasks });
    const roll = (id, name, pm) => m(id, name, pm, [task('Grease bearings and chain', 7, 'days'), task('Check punch and shear tooling', 50000, 'lm'), task('Full service', 500, 'hours')]);
    const out = ms.filter(x => (x.sections || []).some(s2 => /x41/.test(s2))).map(x => roll(x.id, x.name.replace('C-section', 'roll-former'), x.id));
    const th = ms.find(x => (x.sections || []).some(s2 => /Top hat/.test(s2)));
    if (th) out.push(m(th.id, 'Top hat machine', th.id, [task('Grease bearings', 7, 'days'), task('Blade sharpen', 30, 'days')]));
    out.push(m('comp', 'Air compressor', '', [task('Drain the tank', 7, 'days'), task('Service', 365, 'days')]));
    const v = (id, name, unit, tasks) => ({ id: 'as-' + id, kind: 'vehicle', name, unit, meter: '', tasks });
    out.push(v('truck', 'Truck', 'km', [task('Certificate of fitness (COF)', 182, 'days'), task('Road user charges', 5000, 'km'), task('Service', 15000, 'km')]));
    out.push(v('hiab', 'HIAB crane', '', [task('Annual inspection, certified', 365, 'days')]));
    out.push(v('forklift', 'Forklift', 'hours', [task('Service', 500, 'hours'), task('Certificate of fitness', 365, 'days')]));
    out.push(v('ute', 'Ute', 'km', [task('WOF', 365, 'days'), task('Registration', 365, 'days'), task('Service', 15000, 'km')]));
    return out;
  };
  const seed = () => { if (!st.data || S().maintSeeded) return; SEED().forEach(a => { if (!col('assets').some(x => x.id === a.id)) col('assets').push(Object.assign(a, { createdAt: Date.now(), updatedAt: Date.now() })); }); S().maintSeeded = true; S().updatedAt = Date.now(); st.touch(S()); st.save(); };

  const M = App.Maint = {
    lmRun(a) {
      if (!a.pricingMachine || !App.Pricing) return 0;
      const pm = (S().machines || []).find(x => x.id === a.pricingMachine); if (!pm) return 0;
      const keys = new Set(pm.products || []); const made = ['manufacturing', 'yard', 'delivery', 'delivered', 'complete'];
      return App.Jobs.list().filter(j => made.includes(j.job.stage)).reduce((t, j) => t + (j.workings.steel || []).filter(r => keys.has(`${r.size}|${r.gauge}`)).reduce((s2, r) => s2 + App.num(r.lm), 0), 0) + App.num(a.lmStart);
    },
    current(a, unit) { return unit === 'lm' ? M.lmRun(a) : App.num(a.meter); },
    due(a, t) {
      if (t.unit === 'days') {
        if (!t.last) return { state: 'soon', label: 'Not recorded yet', sort: 0 };
        const next = App.addDays(t.last.date, App.num(t.every)); const d = App.daysBetween(App.today(), next);
        return { state: d < 0 ? 'over' : d <= 7 ? 'soon' : 'ok', label: d < 0 ? `Overdue ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'Due today' : d <= 7 ? `Due ${App.fmtDate(next, { weekday: 'short', day: 'numeric', month: 'short' })}` : `Due ${App.fmtShort(next)}`, sort: d };
      }
      const cur = M.current(a, t.unit); const u = t.unit === 'lm' ? 'LM' : t.unit;
      if (!t.last) return { state: 'soon', label: cur ? 'Not recorded yet' : `Add the ${t.unit === 'lm' ? 'metres' : u} first`, sort: 0 };
      const left = App.num(t.last.value) + App.num(t.every) - cur;
      return { state: left < 0 ? 'over' : left <= App.num(t.every) * 0.1 ? 'soon' : 'ok', label: left < 0 ? `Overdue by ${fmt(-left)} ${u}` : `In about ${fmt(left)} ${u}`, sort: left / Math.max(1, App.num(t.every)) * 30 };
    },
    worst(a) { const ds = a.tasks.map(t => M.due(a, t)); const open = M.faults(a).length; if (ds.some(d => d.state === 'over')) return 'over'; if (open || ds.some(d => d.state === 'soon')) return 'soon'; return 'ok'; },
    faults(a) { return live('servicelog').filter(l => l.assetId === a.id && l.kind === 'fault' && l.status !== 'closed'); },
    needs() {
      if (!st.data) return []; const out = [];
      live('assets').forEach(a => { a.tasks.forEach(t => { const d = M.due(a, t); if (d.state === 'over') out.push({ lvl: 'red', t: `${a.name}: ${t.name}`, s: d.label, b: 'Maintenance', href: `#/maintenance/${a.kind === 'vehicle' ? 'vehicles' : 'machines'}` }); }); M.faults(a).forEach(f => out.push({ lvl: 'amber', t: `${a.name}: fault open`, s: f.notes || '', b: 'Open', href: `#/maintenance/${a.kind === 'vehicle' ? 'vehicles' : 'machines'}` })); });
      return out;
    }
  };

  /* ---------- page ---------- */
  App.views.maintenance = (tab = 'machines') => {
    seed(); tab = tab || 'machines';
    const assets = live('assets'); const logs = live('servicelog');
    const yr = App.today().slice(0, 4);
    const dueWeek = assets.reduce((t, a) => t + a.tasks.filter(x => M.due(a, x).state !== 'ok').length, 0);
    const over = assets.reduce((t, a) => t + a.tasks.filter(x => M.due(a, x).state === 'over').length, 0);
    const spent = logs.filter(l => String(l.date).startsWith(yr)).reduce((t, l) => t + App.num(l.cost), 0);
    const head = `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Keeping the machines and vehicles running</p><h1>Maintenance</h1></div><div class="head-actions"><button class="btn primary" data-act="assetEdit" data-kind="${tab === 'vehicles' ? 'vehicle' : 'machine'}">+ Add a ${tab === 'vehicles' ? 'vehicle' : 'machine'}</button></div></div>
      <nav class="tabs">${[['machines', 'Machines'], ['vehicles', 'Vehicles'], ['log', 'Service log']].map(([k, l]) => `<a href="#/maintenance/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div class="statcards"><div class="statcard dark"><p class="l">Due or overdue</p><p class="v">${dueWeek}</p><p class="s">${over} overdue</p></div><div class="statcard"><p class="l">Faults open</p><p class="v">${assets.reduce((t, a) => t + M.faults(a).length, 0)}</p><p class="s">&#160;</p></div><div class="statcard"><p class="l">Spent this year</p><p class="v">${App.money(spent, 0)}</p><p class="s">servicing and repairs</p></div><div class="statcard"><p class="l">Machines and vehicles</p><p class="v">${assets.length}</p><p class="s">&#160;</p></div></div>`;
    if (tab === 'log') return head + M.logView();
    const list = assets.filter(a => a.kind === (tab === 'vehicles' ? 'vehicle' : 'machine')).sort((a, b) => ['over', 'soon', 'ok'].indexOf(M.worst(a)) - ['over', 'soon', 'ok'].indexOf(M.worst(b)));
    return head + `${tab === 'machines' ? '<p class="hint">Metres run on each roll-former come from the jobs made on it, so tooling reminders work themselves out.</p>' : ''}
      <div class="asset-grid">${list.map(M.card).join('') || '<div class="empty"><h2>Nothing here yet</h2></div>'}</div>`;
  };
  M.card = a => {
    const w = M.worst(a); const lm = a.pricingMachine ? M.lmRun(a) : 0; const faults = M.faults(a);
    const meter = [a.unit ? (App.num(a.meter) ? `${fmt(a.meter)} ${a.unit}` : `${a.unit} not entered`) : '', lm ? `${fmt(lm)} LM run` : ''].filter(Boolean).join(', ');
    return `<article class="card asset ${w}"><div class="row" style="justify-content:space-between;align-items:flex-start"><span><b class="an">${e(a.name)}</b><span class="hint" style="display:block">${e(meter)}${a.reg ? ' · ' + e(a.reg) : ''}</span></span><span class="tag ${w === 'over' ? 'bad' : w === 'soon' ? 'warn' : 'ok'}">${w === 'over' ? 'Overdue' : w === 'soon' ? 'Due soon' : 'All up to date'}</span></div>
      <div class="atasks">${a.tasks.map(t => { const d = M.due(a, t); return `<div class="atask"><span>${e(t.name)}<span class="hint"> · every ${fmt(t.every)} ${UNITS[t.unit]}</span></span><b class="${d.state === 'over' ? 'neg' : ''}">${e(d.label)}</b></div>`; }).join('')}
      ${faults.map(f => `<div class="atask fault"><span><b>Fault:</b> ${e(f.notes || '')} <span class="hint">${fdate(f.date)}, ${e(f.by || '')}</span></span><button class="btn small" data-act="faultFix" data-id="${f.id}">Fixed</button></div>`).join('')}</div>
      <div class="row-btns"><button class="btn small primary" data-act="serviceLog" data-id="${a.id}">Log a service</button><button class="btn small" data-act="faultNew" data-id="${a.id}">Report a fault</button>${a.unit ? `<button class="btn small" data-act="meterSet" data-id="${a.id}">Update ${a.unit}</button>` : ''}<button class="btn small ghost" data-act="assetEdit" data-id="${a.id}">Edit</button><button class="btn small ghost" data-act="assetPdf" data-id="${a.id}">PDF</button></div></article>`;
  };
  M.logView = () => {
    const logs = live('servicelog').sort((a, b) => String(b.date).localeCompare(String(a.date))); const names = Object.fromEntries(live('assets').map(a => [a.id, a.name]));
    return `<section class="card"><h3>Service log</h3><div class="table-scroll"><table class="wtable"><thead><tr><th>Date</th><th>Machine or vehicle</th><th>What was done</th><th>By</th><th class="r">Cost</th><th></th></tr></thead><tbody>
      ${logs.map(l => `<tr><td><b>${fdate(l.date)}</b></td><td>${e(names[l.assetId] || '')}</td><td class="small">${l.kind === 'fault' ? `<span class="tag ${l.status === 'closed' ? 'ok' : 'warn'}">Fault${l.status === 'closed' ? ', fixed' : ''}</span> ` : ''}${e([(l.tasks || []).join(', '), l.notes, l.fix].filter(Boolean).join('. '))}</td><td>${e(l.by || '')}</td><td class="r">${App.num(l.cost) ? App.money(l.cost, 0) : '-'}</td><td class="r"><button class="icon-btn" data-act="logDel" data-id="${l.id}" aria-label="Delete this entry">✕</button></td></tr>`).join('') || '<tr><td colspan="5" class="hint">Nothing logged yet.</td></tr>'}</tbody></table></div></section>`;
  };
  const asset = id => col('assets').find(x => x.id === id);
  A.serviceLog = el => {
    const a = asset(el.dataset.id);
    const m = App.modal(`Log a service: ${a.name}`, `<div class="grid3">${App.field('Date', `<input type="date" id="sl-d" value="${App.today()}">`)}${App.field('Done by', `<input id="sl-b" value="${e(st.me().name)}">`)}${App.field('Cost (excl GST)', '<input id="sl-c" inputmode="decimal" placeholder="0">')}</div>
      <div class="fld"><span>What was done</span>${a.tasks.map(t => `<label class="check"><input type="checkbox" value="${t.id}"> ${e(t.name)}</label>`).join('')}</div>
      ${a.unit ? App.field(`${a.unit[0].toUpperCase() + a.unit.slice(1)} reading now`, `<input id="sl-m" inputmode="decimal" value="${e(a.meter || '')}">`) : ''}
      ${App.field('Notes', '<textarea id="sl-n" rows="2" placeholder="e.g. Replaced shear blade"></textarea>')}`,
      { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="sl-ok">Save</button>' });
    m.querySelector('#sl-ok').onclick = () => {
      const done = [...m.querySelectorAll('.check input:checked')].map(c => c.value); const notes = m.querySelector('#sl-n').value.trim();
      if (!done.length && !notes) return App.toast('Tick what was done, or add a note', 'err');
      const date = m.querySelector('#sl-d').value; if (a.unit && m.querySelector('#sl-m').value) { a.meter = App.num(m.querySelector('#sl-m').value); a.meterAt = date; }
      a.tasks.forEach(t => { if (done.includes(t.id)) t.last = { date, value: t.unit === 'days' ? '' : M.current(a, t.unit) }; });
      save(a); add('servicelog', { assetId: a.id, kind: 'service', date, by: m.querySelector('#sl-b').value.trim(), tasks: a.tasks.filter(t => done.includes(t.id)).map(t => t.name), cost: App.num(m.querySelector('#sl-c').value), notes });
      App.closeModal(); App.toast('Logged'); App.refresh();
    };
  };
  A.faultNew = el => {
    const a = asset(el.dataset.id);
    const m = App.modal(`Report a fault: ${a.name}`, `${App.field('What\'s wrong', '<textarea id="fl-n" rows="3"></textarea>')}<div class="grid2">${App.field('Date', `<input type="date" id="fl-d" value="${App.today()}">`)}${App.field('Reported by', `<input id="fl-b" value="${e(st.me().name)}">`)}</div>`,
      { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="fl-ok">Report it</button>' });
    m.querySelector('#fl-ok').onclick = () => { const n = m.querySelector('#fl-n').value.trim(); if (!n) return; add('servicelog', { assetId: a.id, kind: 'fault', status: 'open', date: m.querySelector('#fl-d').value, by: m.querySelector('#fl-b').value.trim(), notes: n }); App.closeModal(); App.refresh(); };
  };
  A.faultFix = el => {
    const f = col('servicelog').find(x => x.id === el.dataset.id);
    const m = App.modal('Fault fixed', `${App.field('What was done', '<textarea id="ff-n" rows="2"></textarea>')}<div class="grid2">${App.field('Fixed by', `<input id="ff-b" value="${e(st.me().name)}">`)}${App.field('Cost (excl GST)', '<input id="ff-c" inputmode="decimal">')}</div>`,
      { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="ff-ok">Save</button>' });
    m.querySelector('#ff-ok').onclick = () => { Object.assign(f, { status: 'closed', fix: m.querySelector('#ff-n').value.trim(), fixedBy: m.querySelector('#ff-b').value.trim(), fixedAt: App.today(), cost: App.num(m.querySelector('#ff-c').value) }); save(f); App.closeModal(); App.refresh(); };
  };
  A.logDel = async el => { const l = col('servicelog').find(x => x.id === el.dataset.id); if (!(await App.confirm('Delete this entry from the service log?', '', 'Delete'))) return; l.deleted = true; save(l); App.refresh(); };
  A.meterSet = async el => { const a = asset(el.dataset.id); const v = await App.prompt(`${a.name}: ${a.unit} reading now`, a.meter || ''); if (v === null || v === undefined || v === '') return; a.meter = App.num(v); a.meterAt = App.today(); save(a); App.refresh(); };
  A.assetEdit = el => {
    const a = el.dataset.id ? asset(el.dataset.id) : { kind: el.dataset.kind || 'machine', unit: el.dataset.kind === 'vehicle' ? 'km' : 'hours', tasks: [] };
    let tasks = App.clone(a.tasks || []);
    const pms = (S().machines || []);
    const trow = (t, k) => `<div class="row tr" data-k="${k}" style="flex-wrap:wrap;margin-bottom:6px"><input class="t-n" value="${e(t.name)}" placeholder="Task, e.g. Service" style="flex:2 1 200px"><span class="hint">every</span><input class="t-e" inputmode="decimal" value="${e(t.every)}" style="width:100px"><select class="t-u" style="width:auto">${Object.entries(UNITS).map(([v, l]) => App.opt(v, l, t.unit)).join('')}</select><button class="icon-btn t-x" type="button" aria-label="Remove">✕</button></div>`;
    const m = App.modal(a.id ? `Edit ${a.name}` : `Add a ${a.kind}`, `<div class="grid2">${App.field('Name', `<input id="as-n" value="${e(a.name || '')}">`)}${App.field(a.kind === 'vehicle' ? 'Rego' : 'Notes', `<input id="as-r" value="${e(a.reg || '')}">`)}</div>
      <div class="grid2">${App.field('Measured in', `<select id="as-u">${App.opts([{ value: '', label: 'Nothing (dates only)' }, { value: 'hours', label: 'Hours' }, { value: 'km', label: 'Kilometres' }], a.unit || '')}</select>`)}${a.kind === 'machine' ? App.field('Metres run come from', `<select id="as-pm"><option value="">Not a roll-former</option>${pms.map(p => App.opt(p.id, p.name, a.pricingMachine || '')).join('')}</select>`) : ''}</div>
      ${a.kind === 'machine' ? App.field('Metres run before you started using the app (optional)', `<input id="as-lm" inputmode="decimal" value="${e(a.lmStart || '')}">`) : ''}
      <div class="fld"><span>Reminders</span><div id="as-t">${tasks.map(trow).join('')}</div><button class="btn small dashed" id="as-add" type="button">+ Add a reminder</button></div>`,
      { wide: true, actions: `${a.id ? '<button class="btn ghost danger" id="as-del">Remove</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="as-ok">Save</button>` });
    const read = () => { tasks = [...m.querySelectorAll('.tr')].map(r => { const o = tasks[+r.dataset.k] || {}; return Object.assign({}, o, { id: o.id || App.uid(), name: r.querySelector('.t-n').value.trim(), every: App.num(r.querySelector('.t-e').value), unit: r.querySelector('.t-u').value }); }); };
    const draw = () => { m.querySelector('#as-t').innerHTML = tasks.map(trow).join(''); m.querySelectorAll('.t-x').forEach(x => x.onclick = () => { read(); tasks.splice(+x.closest('.tr').dataset.k, 1); draw(); }); };
    draw(); m.querySelector('#as-add').onclick = () => { read(); tasks.push({ name: '', every: 30, unit: 'days', last: null }); draw(); };
    m.querySelector('#as-ok').onclick = () => {
      read(); const n = m.querySelector('#as-n').value.trim(); if (!n) return App.toast('Add a name', 'err');
      Object.assign(a, { name: n, reg: m.querySelector('#as-r').value.trim(), unit: m.querySelector('#as-u').value, tasks: tasks.filter(t => t.name && t.every) });
      if (a.kind === 'machine') { a.pricingMachine = m.querySelector('#as-pm').value; a.lmStart = App.num(m.querySelector('#as-lm').value); }
      a.id ? save(a) : add('assets', a); App.closeModal(); App.refresh();
    };
    if (a.id) m.querySelector('#as-del').onclick = async () => { if (!(await App.confirm(`Remove ${a.name}?`, 'Its service history stays in the log.', 'Remove'))) return; a.deleted = true; save(a); App.refresh(); };
  };
  A.assetPdf = el => {
    const a = asset(el.dataset.id); const R = App.Reports, D = App.Docs;
    const logs = live('servicelog').filter(l => l.assetId === a.id).sort((x, y) => String(y.date).localeCompare(String(x.date)));
    const flow = [D.blk(R.stats([['Status', M.worst(a) === 'over' ? 'Overdue' : M.worst(a) === 'soon' ? 'Due soon' : 'Up to date', ''], [a.unit ? a.unit[0].toUpperCase() + a.unit.slice(1) : 'Measured by', a.unit ? fmt(a.meter) : 'dates', a.meterAt ? 'at ' + fdate(a.meterAt) : ''], ['Metres run', a.pricingMachine ? fmt(M.lmRun(a)) + ' LM' : '-', ''], ['Spent', App.money(logs.reduce((t, l) => t + App.num(l.cost), 0), 0), 'all time']])),
      R.section('Reminders', R.table(['Task', 'Every', 'Last done', 'Next'], a.tasks.map(t => [e(t.name), `${fmt(t.every)} ${UNITS[t.unit]}`, t.last ? fdate(t.last.date) : '-', e(M.due(a, t).label)]))),
      R.section('Service history', R.table(['Date', 'What was done', 'By', 'Cost'], logs.map(l => [fdate(l.date), e([l.kind === 'fault' ? 'Fault: ' + (l.notes || '') : (l.tasks || []).join(', '), l.kind === 'fault' ? l.fix : l.notes].filter(Boolean).join('. ')), e(l.by || ''), App.num(l.cost) ? App.money(l.cost, 0) : '-']), [3]))];
    R.show(`${a.name} service history`, R.spec('Service history', a.name, [['Rego', a.reg || '']], flow, 'workshop'));
  };
  App.Reports && (App.Reports.build.maintenance = r => {
    const R = App.Reports, D = App.Docs; const assets = live('assets'); const names = Object.fromEntries(assets.map(a => [a.id, a.name]));
    const logs = live('servicelog').filter(l => R.inRange(l.date, r)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const flow = [R.multi() ? D.blk(R.stats([['Overdue', String(assets.reduce((t, a) => t + a.tasks.filter(x => M.due(a, x).state === 'over').length, 0)), ''], ['Faults open', String(assets.reduce((t, a) => t + M.faults(a).length, 0)), ''], [`Spent, ${r.label}`, App.money(logs.reduce((t, l) => t + App.num(l.cost), 0), 0), '']])) : ''];
    const rows = kind => assets.filter(a => a.kind === kind).flatMap(a => a.tasks.map((t, k) => [k === 0 ? e(a.name) + (a.reg ? `<br><span class="hint">${e(a.reg)}</span>` : '') : '', e(t.name), `${fmt(t.every)} ${UNITS[t.unit]}`, t.last ? fdate(t.last.date) : '-', e(M.due(a, t).label)]));
    if (R.has('machines')) flow.push(R.section('Machines', R.table(['Machine', 'Task', 'Every', 'Last done', 'Next'], rows('machine'))));
    if (R.has('vehicles')) flow.push(R.section('Vehicles', R.table(['Vehicle', 'Task', 'Every', 'Last done', 'Next'], rows('vehicle'))));
    if (R.has('log')) flow.push(R.section(`Service log, ${r.label}`, R.table(['Date', 'Machine or vehicle', 'What was done', 'Cost'], logs.map(l => [fdate(l.date), e(names[l.assetId] || ''), e([l.kind === 'fault' ? 'Fault: ' + (l.notes || '') : (l.tasks || []).join(', '), l.kind === 'fault' ? l.fix : l.notes].filter(Boolean).join('. ')), App.num(l.cost) ? App.money(l.cost, 0) : '-']), [3])));
    const t = R.titled('Maintenance', 'maintenance');
    R.show(t, R.spec('Maintenance summary', t, [['Period', r.label]], flow, 'workshop'), `${t} ${r.label}`);
  });
})();
