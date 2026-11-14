/* Battens: 30 mm top hat ceiling battens, supply and install.
   Its own estimates (CHIB numbers), jobs, measure sheets, plans, coils and machine files (CSV for the machine). */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const fmt = n => Math.round(App.num(n)).toLocaleString('en-NZ');
  const col = () => (st.data.battens = st.data.battens || []);
  const live = () => col().filter(x => !x.deleted);
  const STAGES = [['accepted', 'Accepted'], ['booked', 'Measure booked'], ['measured', 'Measured'], ['file', 'Machine file made'], ['made', 'Made'], ['installed', 'Installed'], ['complete', 'Completed']];
  const STATUS = { draft: ['Draft', ''], sent: ['Sent', 'blue'], accepted: ['Accepted', 'ok'], rejected: ['Lost', 'bad'], cancelled: ['Cancelled', ''] };
  const cfg = () => S().battens;
  const B = App.Battens = {
    list: live,
    get: id => col().find(x => x.id === id),
    jobs: () => live().filter(x => x.status === 'accepted'),
    name: x => [x.lot, x.address].filter(Boolean).join(', ') || x.number,
    who: x => x.client.company || x.client.name || '',
    /* numbers: CHIB26058 and on, separate from the main estimates */
    nextNumber() {
      const c = cfg(); const yy = App.today().slice(2, 4); const key = 'chib' + yy;
      const used = col().filter(x => x.yy === yy).map(x => x.seq || 0);
      const seq = Math.max(App.num((c.startSeq || {})[yy]) || 1, (st.data.counters[key] || 0) + 1, used.length ? Math.max(...used) + 1 : 0);
      return { yy, seq, key, number: `${c.prefix || 'CHIB'}${yy}${String(seq).padStart(3, '0')}` };
    },
    create(preset = {}) {
      const n = B.nextNumber(); st.data.counters[n.key] = n.seq;
      const x = Object.assign({ id: App.uid(), number: n.number, yy: n.yy, seq: n.seq, date: App.today(), expiry: App.addDays(App.today(), App.num(cfg().validDays) || 30), status: 'draft', createdAt: Date.now(), createdBy: st.me().name,
        client: { name: '', company: '', email: '', phone: '' }, clientId: '', lot: '', address: '', houseArea: '', stud: '2.4', centres: 600, install: true, acoustic: false, raking: false, flashings: false, perimeter: true, delivery: true, price: '', priceManual: false, notes: '', activity: [] }, preset);
      col().push(x); st.touch(x); st.save(); return x;
    },
    log(x, t) { x.activity = x.activity || []; x.activity.push({ at: Date.now(), by: st.me().name, text: t }); },
    save(x) { x.updatedAt = Date.now(); st.touch(x); st.save(); },
    /* price from the rates in Settings, unless you've typed your own */
    calc(x) {
      const r = cfg().rates || {}; const a = App.num(x.houseArea); const lines = [];
      if (a) lines.push([`Battens, ${fmt(a)} m² at ${x.centres} crs${x.install ? '' : ' (supply only)'}`, a * App.num(x.centres === 400 ? r.r400 : r.r600) * (x.install ? 1 : (App.num(r.supplyOnlyPct) || 100) / 100)]);
      if (x.acoustic && a) lines.push(['Acoustic clips', a * App.num(r.acousticPerM2)]);
      if (x.raking && x.flashings) lines.push(['Raked ceiling flashings', App.num(r.flashings)]);
      if (x.raking) lines.push(['Raking ceilings', App.num(r.raking)]);
      const calc = lines.filter(l => l[1]).reduce((t, l) => t + l[1], 0);
      const total = x.priceManual ? App.num(x.price) : calc;
      return { lines: lines.filter(l => l[1]), calc, total, gst: total * 0.15, incl: total * 1.15 };
    },
    /* rough materials so you know there's coil and clips */
    materials(x) {
      const a = App.num(x.houseArea); const lm = a ? a / (App.num(x.centres) / 1000) * 1.05 : 0;
      return { lm, kg: lm * App.num(cfg().kgPerM || 0.59), clips: Math.ceil(lm / 1.2) };
    },
    included(x) {
      const c = cfg(); const ctr = `${x.centres}mm`;
      const out = (c.lines || []).map(l => l.replace(/\{centres\}/g, ctr)).filter(l => {
        if (!x.perimeter && /perimeter/i.test(l)) return false;
        if (!x.delivery && /deliver/i.test(l)) return false;
        if (!x.install && /install/i.test(l)) return false;
        return true;
      });
      if (x.acoustic) out.splice(2, 0, c.acousticLine || 'Acoustic clips to suit');
      if (x.raking && x.flashings) out.push(c.flashingLine || 'Custom angle flashings for raked ceiling');
      return out;
    },
    /* ---------- coils and clips from the other apps ---------- */
    coilStock(spec) {
      const C = App.Coil; if (!C || !C.S.loadedAt) return null;
      const [w, t] = String(spec).split('|').map(Number);
      const list = C.inStock().filter(c => Number(c.width) === w && Math.abs(Number(c.thickness) - t) < 0.001);
      return { list, n: list.length, kg: list.reduce((s2, c) => s2 + c.weight, 0) };
    },
    clip(name) { const F = App.Fast; if (!F || !F.S.loadedAt) return null; const n = String(name || '').toLowerCase(); return F.S.items.find(i => i.name.toLowerCase() === n) || F.S.items.find(i => i.name.toLowerCase().includes(n)) || null; },
    needs() {
      return B.jobs().filter(x => x.job && x.job.stage === 'accepted').map(x => ({ lvl: 'amber', t: `${x.number}: book the batten measure`, s: B.name(x), b: 'Open', href: `#/battens/job/${x.id}` }))
        .concat(B.jobs().filter(x => x.job && x.job.stage === 'measured').map(x => ({ lvl: 'blue', t: `${x.number}: make the machine file`, s: B.name(x), b: 'Open', href: `#/battens/mf/${x.id}` })))
        .concat(B.jobs().filter(x => x.job && x.job.stage === 'complete' && !x.job.invoiceSentAt).map(x => ({ lvl: 'amber', t: `${x.number}: send the invoice to CH Accounts`, s: B.name(x), b: 'Open', href: `#/battens/job/${x.id}` })));
    }
  };

  /* ---------- page ---------- */
  const TABS = [['', 'Overview'], ['estimates', 'Estimates'], ['jobs', 'Jobs'], ['clients', 'Clients'], ['machine', 'Machine files']];
  const head = (tab, extra = '') => `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Ceiling battens: supply and install</p><h1>Battens</h1></div><div class="head-actions">${extra}<button class="btn primary" data-act="batNew">+ New batten estimate</button></div></div>
    <nav class="tabs">${TABS.map(([k, l]) => `<a href="#/battens${k ? '/' + k : ''}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
  App.views.battens = (a, b) => {
    if (a === 'e' && b) return B.editView(b);
    if (a === 'job' && b) return B.jobView(b);
    if (a === 'mf' && b) return B.mfView(b);
    if (a === 'estimates') return head('estimates') + B.trackerView();
    if (a === 'jobs') return head('jobs') + B.jobsView();
    if (a === 'machine') return head('machine') + B.machineList();
    if (a === 'clients') return head('clients', '<button class="btn" data-act="bcEdit">+ Add a batten client</button>') + B.clientsView();
    if (a === 'client' && b) return B.clientView(b);
    return head('') + B.overview();
  };
  App.views.battens.mount = () => {
    if (App.Coil && App.Coil.ready() && !App.Coil.S.loadedAt && !App.Coil.S.loading) App.Coil.load().then(() => App.route().name === 'battens' && App.refresh()).catch(() => {});
    if (App.Fast && App.Fast.ready() && !App.Fast.S.loadedAt && !App.Fast.S.loading) App.Fast.load().then(() => App.route().name === 'battens' && App.refresh()).catch(() => {});
  };
  const tag = s2 => `<span class="tag ${STATUS[s2][1]}">${STATUS[s2][0]}</span>`;
  const stageTag = x => { const s2 = STAGES.find(z => z[0] === (x.job || {}).stage) || STAGES[0]; return `<span class="tag ${['installed', 'complete'].includes(s2[0]) ? 'ok' : s2[0] === 'accepted' ? 'warn' : 'blue'}">${s2[1]}</span>${x.job && x.job.stage === 'complete' ? (x.job.invoiceSentAt ? ' <span class="tag ok">Invoice sent</span>' : ' <span class="tag warn">Not invoiced</span>') : ''}`; };

  B.overview = () => {
    const c = cfg(); const bat = B.coilStock(c.coils.batten), pur = B.coilStock(c.coils.purlin);
    const bc = B.clip(c.clips.batten), ac = B.clip(c.clips.acoustic);
    const kgm = App.num(c.kgPerM || 0.59);
    const kpi = (l, v, s2, dark) => `<div class="statcard ${dark ? 'dark' : ''}"><p class="l">${l}</p><p class="v">${v}</p><p class="s">${s2}</p></div>`;
    const kgFor = spec => kgm * Number(String(spec).split('|')[1] || 0.55) / 0.55;
    const coilK = (lbl, x, dark, spec) => kpi(lbl, x ? `${x.n} coil${x.n === 1 ? '' : 's'}` : '-', x ? `${fmt(x.kg)} kg, about ${fmt(x.kg / kgFor(spec))} LM` : (App.Coil && App.Coil.ready() ? 'Loading…' : 'Sign in on the Coils page'), dark);
    const clipK = (lbl, i) => kpi(lbl, i ? fmt(i.qty) : '-', i ? `in stock, minimum ${fmt(i.min)}${i.qty <= i.min ? ' <span class="tag warn">Low</span>' : ''}` : (App.Fast && App.Fast.ready() ? `No "${e(lbl)}" item found in Fasteners` : 'Fasteners not connected'));
    const ests = live(); const month = App.today().slice(0, 7);
    const out = ests.filter(x => x.status === 'sent'); const won = ests.filter(x => x.status === 'accepted' && String(x.acceptedAt || '').startsWith(month));
    const jobs = B.jobs().filter(x => x.job.stage !== 'complete');
    const coilRows = (bat ? bat.list : []).concat(pur ? pur.list : []);
    return `<div class="statcards" style="grid-template-columns:repeat(4,minmax(0,1fr))">${coilK('Batten coils, ' + c.coils.batten.split('|')[1] + ' BMT', bat, true, c.coils.batten)}${coilK('Purlin coils, ' + c.coils.purlin.split('|')[1] + ' BMT', pur, false, c.coils.purlin)}${clipK(c.clips.batten, bc)}${clipK(c.clips.acoustic, ac)}</div>
      <div class="statcards" style="grid-template-columns:repeat(4,minmax(0,1fr))">${kpi('Estimates out', out.length, App.money(out.reduce((t, x) => t + B.calc(x).total, 0), 0) + ' waiting')}${kpi('Won this month', won.length, App.money(won.reduce((t, x) => t + B.calc(x).total, 0), 0))}${kpi('To measure', B.jobs().filter(x => ['accepted', 'booked'].includes(x.job.stage)).length, 'book or do the measure')}${kpi('Machine files to make', B.jobs().filter(x => x.job.stage === 'measured').length, 'measured, ready for the CSV')}</div>
      <div class="hub2"><section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Jobs on the go</h3><a class="btn small" href="#/battens/jobs">All jobs</a></div>
        ${jobs.length ? `<table class="wtable" style="margin-top:8px"><tbody>${jobs.map(x => `<tr><td><a href="#/battens/job/${x.id}"><b>${e(x.number)}</b></a></td><td>${e(B.who(x))}<div class="hint">${e(B.name(x))}</div></td><td>${stageTag(x)}</td><td class="r">${x.job.stage === 'measured' ? `<a class="btn small primary" href="#/battens/mf/${x.id}">Make machine file</a>` : ['accepted', 'booked'].includes(x.job.stage) ? `<button class="btn small" data-act="batMeasurePdf" data-id="${x.id}">Measure sheet</button>` : `<a class="btn small" href="#/battens/job/${x.id}">Open</a>`}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No batten jobs on the go.</p>'}</section>
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Batten and purlin coils</h3><a class="btn small" href="#/coils">Open Coils</a></div>
        ${coilRows.length ? `<table class="wtable" style="margin-top:8px"><thead><tr><th>Coil</th><th>Size</th><th class="r">Weight</th><th class="r">About</th></tr></thead><tbody>${coilRows.map(k => `<tr><td><b>${e(k.coilId)}</b>${(k.jobs || []).length ? `<div class="hint">${e(k.jobs.join(', '))}</div>` : ''}</td><td>${k.width} × ${App.Coil.bmt(k.thickness)}</td><td class="r">${App.Coil.kg(k.weight)}</td><td class="r">${fmt(k.weight / (kgm * Number(k.thickness) / 0.55))} LM</td></tr>`).join('')}</tbody></table>` : `<p class="hint">${App.Coil && App.Coil.S.loadedAt ? 'No batten or purlin coils in stock.' : 'Coils show here once the coil app is connected.'}</p>`}</section></div>`;
  };

  B.trackerView = () => {
    const q = App.state.batQ || { s: '', status: '' }; App.state.batQ = q;
    let list = live().sort((a, b) => String(b.number).localeCompare(String(a.number)));
    if (q.status) list = list.filter(x => x.status === q.status);
    if (q.s) { const s2 = q.s.toLowerCase(); list = list.filter(x => [x.number, B.who(x), x.client.name, x.lot, x.address].join(' ').toLowerCase().includes(s2)); }
    return `<div class="toolbar"><input type="search" id="bat-q" placeholder="Search by number, client or lot" value="${e(q.s)}" data-act-input="batSearch"><select data-act-change="batStatus"><option value="">Any status</option>${Object.entries(STATUS).map(([k, v]) => App.opt(k, v[0], q.status)).join('')}</select></div>
      ${list.length ? `<div class="table-wrap"><table class="tracker"><thead><tr><th>Number</th><th>Client</th><th>Lot and address</th><th>Job</th><th class="r">Price (excl GST)</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr><td><b>${e(x.number)}</b></td><td>${e(B.who(x))}</td><td>${e(B.name(x))}</td><td class="small">${x.houseArea ? fmt(x.houseArea) + ' m², ' : ''}${x.centres} crs${x.raking ? ', raking' : ''}${x.acoustic ? ', acoustic' : ''}</td><td class="r">${App.money(B.calc(x).total)}</td><td>${tag(x.status)}</td><td class="r"><a class="btn small" href="#/battens/${x.status === 'accepted' ? 'job' : 'e'}/${x.id}">Open</a></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h2>No batten estimates yet</h2><button class="btn primary" data-act="batNew">+ New batten estimate</button></div>'}
      <p class="hint">Batten estimates have their own numbers (${e(cfg().prefix || 'CHIB')}…), separate from the main tracker.</p>`;
  };
  A.batSearch = App.debounce(el => { App.state.batQ.s = el.value; App.refresh(); const i = document.getElementById('bat-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  A.batStatus = el => { App.state.batQ.status = el.value; App.refresh(); };
  A.batNew = () => { const x = B.create(); location.hash = `#/battens/e/${x.id}`; };

  /* ---------- estimate editor ---------- */
  B.editView = id => {
    const x = B.get(id); if (!x || x.deleted) return '<div class="empty"><h2>Batten estimate not found</h2><a class="btn" href="#/battens/estimates">Back</a></div>';
    App.state.batCur = x; const p = B.calc(x); const m = B.materials(x); const locked = x.status === 'accepted';
    const f = (l, k, attrs = '') => App.field(l, `<input data-bk="${k}" value="${e(x[k] ?? '')}" ${attrs} data-act-change="batSet">`);
    const fc = (l, k, attrs = '') => App.field(l, `<input data-bk="client.${k}" value="${e(x.client[k] || '')}" ${attrs} data-act-change="batSet">`);
    const tick = (k, l, sub) => `<label class="bat-tick ${x[k] ? 'on' : ''}"><input type="checkbox" data-bk="${k}" ${x[k] ? 'checked' : ''} data-act-change="batSet"><span><b>${l}</b>${sub ? `<em>${sub}</em>` : ''}</span></label>`;
    const bcl = B.clients(); const other = App.Clients ? App.Clients.list().filter(c => !c.batten) : [];
    return `<div class="page-head"><div><p class="crumbs"><a href="#/battens/estimates">Battens</a></p><h1>${e(x.number)} ${tag(x.status)}</h1><p class="sub">${e([B.who(x), B.name(x)].filter(Boolean).join(', ') || 'New batten estimate')}</p></div>
      <div class="head-actions"><button class="btn" data-act="batPdf">Preview</button>${x.status === 'accepted' ? `<a class="btn dark" href="#/battens/job/${x.id}">Open job</a>` : `<button class="btn primary" data-act="batEmail">Email estimate</button>`}
      <details class="menu"><summary class="btn" aria-label="More actions">More</summary><div class="menu-pop">${x.status !== 'sent' && x.status !== 'accepted' ? '<button data-act="batMark" data-s="sent">Mark as sent</button>' : ''}${x.status !== 'accepted' ? '<button data-act="batMark" data-s="accepted">Mark accepted</button>' : ''}${['draft', 'sent'].includes(x.status) ? '<button data-act="batMark" data-s="rejected">Mark lost</button>' : ''}<button data-act="batDup">Duplicate</button><button data-act="batDel" class="danger-text">Delete</button></div></details></div></div>
    <fieldset class="bat-edit" ${locked ? 'disabled' : ''}><div class="bat-cols"><div class="bat-main">
      <section class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Client and site</h3>${!x.clientId && (x.client.company || x.client.name) && !locked ? '<button class="btn small ghost" type="button" data-act="bcFromEst">Save as a batten client</button>' : ''}</div>
        ${bcl.length || other.length ? App.field('Client', `<select data-act-change="batClient"><option value="">One-off client (type below)</option>${bcl.length ? `<optgroup label="Batten clients">${bcl.map(c => App.opt(c.id, B.cLabel(c), x.clientId)).join('')}</optgroup>` : ''}${other.length ? `<optgroup label="Other regular clients">${other.map(c => App.opt(c.id, B.cLabel(c), x.clientId)).join('')}</optgroup>` : ''}</select>`) : ''}
        <div class="grid2">${fc('Company', 'company')}${fc('Contact name', 'name')}${fc('Email', 'email', 'type="email"')}${fc('Phone', 'phone', 'type="tel"')}${f('Lot number', 'lot', 'placeholder="e.g. Lot 35"')}${f('Address', 'address')}</div></section>
      <section class="card"><h3>The house</h3><div class="grid2">${f('House area (m²)', 'houseArea', 'inputmode="decimal"')}${App.field('Stud height', `<select data-bk="stud" data-act-change="batSet">${['2.4', '2.55', '2.7', '3.0', 'Other'].map(v => App.opt(v, v === 'Other' ? 'Other' : v + ' m', x.stud)).join('')}</select>`)}</div></section>
      <section class="card"><h3>What we're doing</h3><div class="fld"><span>Batten centres</span><div class="seg">${[600, 400].map(v => `<label><input type="radio" name="bc" value="${v}" data-bk="centres" data-act-change="batSet" ${x.centres === v ? 'checked' : ''}><span>${v} mm centres</span></label>`).join('')}</div></div>
        <div class="bat-ticks">${tick('install', 'Supply and install', 'Untick for supply only')}${tick('acoustic', 'Acoustic clips', 'Rarely used')}${tick('raking', 'Raking ceilings', 'Some ceilings are raked')}${x.raking ? tick('flashings', 'Custom angle flashings for the raked ceiling', 'We make and supply them') : ''}${tick('perimeter', 'Perimeter channel')}${tick('delivery', 'Delivery to site')}</div></section>
      <section class="card"><h3>Notes on the estimate</h3><textarea data-bk="notes" rows="3" data-act-change="batSet" placeholder="Optional">${e(x.notes || '')}</textarea></section>
    </div><aside class="bat-side">
      <section class="bat-price"><p class="k">${e(x.number)}</p><p class="l">Total excl GST</p><p class="v">${App.money(p.total)}</p>
        ${p.lines.map(l => `<div class="r"><span>${e(l[0])}</span><b>${App.money(l[1])}</b></div>`).join('')}<div class="r"><span>GST 15%</span><b>${App.money(p.gst)}</b></div><div class="r"><span>Total incl GST</span><b>${App.money(p.incl)}</b></div>
        <label class="check" style="margin-top:10px;color:#fff"><input type="checkbox" data-bk="priceManual" ${x.priceManual ? 'checked' : ''} data-act-change="batSet"> Type my own price</label>
        ${x.priceManual ? `<input data-bk="price" inputmode="decimal" value="${e(x.price)}" data-act-change="batSet" placeholder="Price excl GST" style="margin-top:6px">` : `<p class="hint" style="color:#8a939b;margin:6px 0 0">${p.calc ? 'From the rates in Settings, Battens.' : 'Set your batten rates in Settings, Battens, or type your own price.'}</p>`}</section>
      <section class="card"><h3>Materials (for us)</h3><div class="kvr2"><span>Batten</span><b>about ${fmt(m.lm)} LM</b></div><div class="kvr2"><span>${e(cfg().coils.batten.split('|')[1])} coil</span><b>about ${fmt(m.kg)} kg</b></div><div class="kvr2"><span>Clips</span><b>about ${fmt(m.clips)}</b></div><p class="hint">Rough, so you know there's coil and clips on hand.</p></section>
    </aside></div></fieldset>${locked ? '<p class="hint">This estimate is accepted. Open the job to measure, attach plans and make the machine file.</p>' : ''}`;
  };
  const cur = () => App.state.batCur;
  A.batSet = el => {
    const x = cur(); const k = el.dataset.bk; let v = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'centres') v = Number(v);
    if (k.startsWith('client.')) x.client[k.slice(7)] = v; else x[k] = v;
    if (k === 'raking' && !v) x.flashings = false;
    if (k === 'raking' && v) x.flashings = true;
    B.save(x); App.refresh();
  };
  A.batClient = el => { const x = cur(); const c = (st.data.customers || []).find(z => z.id === el.value); if (!c) { x.clientId = ''; B.save(x); return; } x.clientId = c.id; Object.assign(x.client, { name: c.name || '', company: c.company || '', email: c.email || '', phone: c.phone || '' }); B.save(x); App.refresh(); };
  A.batMark = async el => {
    const x = cur(); const s2 = el.dataset.s;
    if (s2 === 'accepted') { x.acceptedAt = App.today(); x.job = x.job || { stage: 'accepted', plans: [], machine: { rows: [], frameset: x.address || B.name(x) }, rooms: 30 }; }
    if (s2 === 'sent' && !x.sentDate) x.sentDate = App.today();
    x.status = s2; B.log(x, `Marked ${STATUS[s2][0].toLowerCase()}`); B.save(x);
    if (s2 === 'accepted') { location.hash = `#/battens/job/${x.id}`; App.toast(`${x.number} accepted. It's now a batten job.`); } else App.refresh();
  };
  A.batDup = () => { const o = cur(); const x = B.create(Object.assign(App.clone(o), { id: undefined, number: undefined, status: 'draft', job: undefined, activity: [], sentDate: '', acceptedAt: '' })); location.hash = `#/battens/e/${x.id}`; };
  A.batDel = async () => {
    const x = cur(); if (!(await App.confirm(`Delete ${x.number}?`, `It's removed from Battens, and the number won't be used again. You can restore it from Settings, Google and data, for 60 days.`, 'Delete'))) return;
    if (x.job && x.job.installDate) { x.job.installDate = ''; B.syncInstall(x); }
    x.deleted = true; x.deletedAt = Date.now(); x.deletedBy = st.me().name; B.save(x); location.hash = '#/battens/estimates';
  };

  /* ---------- Batten clients: their own list, e.g. timber-frame builders who only buy battens ---------- */
  B.clients = () => (st.data.customers || []).filter(c => c.batten && !c.deleted).sort((a, b) => B.cLabel(a).localeCompare(B.cLabel(b)));
  B.cLabel = c => c.company || c.name || 'Client';
  B.cEsts = c => { const n = s2 => String(s2 || '').trim().toLowerCase(); return live().filter(x => x.clientId === c.id || (!x.clientId && ((c.company && n(x.client.company) === n(c.company)) || (c.email && n(x.client.email) === n(c.email))))).sort((a, b) => String(b.number).localeCompare(String(a.number))); };
  B.cStats = c => { const es = B.cEsts(c); const won = es.filter(x => x.status === 'accepted'); const lost = es.filter(x => x.status === 'rejected');
    return { es, won, wonV: won.reduce((t, x) => t + B.calc(x).total, 0), quoted: es.filter(x => x.status !== 'draft').reduce((t, x) => t + B.calc(x).total, 0), m2: won.reduce((t, x) => t + App.num(x.houseArea), 0), rate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null }; };
  B.clientsView = () => {
    const list = B.clients();
    return list.length ? `<div class="cl-grid">${list.map(c => { const s2 = B.cStats(c); return `<a class="card cl-card" href="#/battens/client/${c.id}"><div class="row" style="justify-content:space-between;align-items:flex-start"><span><b class="cn">${e(B.cLabel(c))}</b><span class="hint" style="display:block">${e([c.company ? c.name : '', c.phone].filter(Boolean).join(', '))}</span></span>${c.type ? `<span class="tag blue">${e(c.type)}</span>` : ''}</div>
        <div class="cl-stats"><span><em>Jobs</em><b>${s2.won.length}</b></span><span><em>Won</em><b>${App.money(s2.wonV, 0)}</b></span><span><em>Battened</em><b>${s2.m2 ? fmt(s2.m2) + ' m²' : '-'}</b></span></div></a>`; }).join('')}</div>`
      : '<div class="empty"><h2>No batten clients yet</h2><p>Add the builders you do battens for, like timber-frame builders. They\'re kept separate from your steel clients, and show first when you start a batten estimate.</p><button class="btn primary" data-act="bcEdit">+ Add a batten client</button></div>';
  };
  B.clientView = id => {
    const c = (st.data.customers || []).find(z => z.id === id); if (!c) return '<div class="empty"><h2>Client not found</h2><a class="btn" href="#/battens/clients">Back</a></div>';
    const s2 = B.cStats(c); const det = (k, v) => v ? `<div class="kvr2"><span class="hint">${k}</span><b>${e(v)}</b></div>` : '';
    return `<div class="page-head"><div><p class="crumbs"><a href="#/battens/clients">Batten clients</a></p><h1>${e(B.cLabel(c))}</h1><p class="sub">${e(c.type || 'Batten client')}</p></div><div class="head-actions"><button class="btn primary" data-act="bcNewEst" data-id="${c.id}">+ New batten estimate for them</button></div></div>
      <div class="statcards" style="grid-template-columns:repeat(4,minmax(0,1fr))"><div class="statcard dark"><p class="l">Won</p><p class="v">${App.money(s2.wonV, 0)}</p><p class="s">${s2.won.length} job${s2.won.length === 1 ? '' : 's'}</p></div><div class="statcard"><p class="l">Quoted</p><p class="v">${App.money(s2.quoted, 0)}</p><p class="s">${s2.es.length} estimates</p></div><div class="statcard"><p class="l">Win rate</p><p class="v">${s2.rate == null ? '-' : s2.rate + '%'}</p><p class="s">&#160;</p></div><div class="statcard"><p class="l">Battened</p><p class="v">${s2.m2 ? fmt(s2.m2) + ' m²' : '-'}</p><p class="s">house area on jobs won</p></div></div>
      <div class="cl-cols"><section class="card" style="margin:0"><h3>Estimates and jobs</h3>${s2.es.length ? `<table class="wtable"><tbody>${s2.es.map(x => `<tr><td><a href="#/battens/${x.status === 'accepted' ? 'job' : 'e'}/${x.id}"><b>${e(x.number)}</b></a></td><td>${e(B.name(x))}</td><td class="r">${App.money(B.calc(x).total, 0)}</td><td>${x.status === 'accepted' && x.job ? stageTag(x) : tag(x.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No batten estimates for them yet.</p>'}</section>
      <aside><section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Details</h3><button class="btn small" data-act="bcEdit" data-id="${c.id}">Edit</button></div>${det('Main contact', c.name)}${det('Phone', c.phone)}${det('Email', c.email)}${det('Accounts email', c.accountsEmail)}${det('Address', c.address)}${c.notes ? `<p class="hint" style="margin-top:8px">${e(c.notes)}</p>` : ''}
        <p class="hint" style="margin-top:10px">${c.regular ? 'Also in your main Clients list.' : 'Battens only: not in your main Clients list.'}</p></section></aside></div>`;
  };
  A.bcEdit = (el, ev, preset) => {
    const c = (el && el.dataset && el.dataset.id ? (st.data.customers || []).find(z => z.id === el.dataset.id) : null) || Object.assign({}, preset || {});
    const isNew = !c.id; const f = (l, k, t = 'text') => App.field(l, `<input id="bc-${k}" type="${t}" value="${e(c[k] || '')}">`);
    const m = App.modal(isNew ? 'Add a batten client' : `Edit ${B.cLabel(c)}`, `<div class="grid2">${f('Company', 'company')}${f('Main contact', 'name')}${f('Email', 'email', 'email')}${f('Phone', 'phone', 'tel')}${f('Accounts email (optional)', 'accountsEmail', 'email')}${f('Type, e.g. Timber-frame builder', 'type')}</div>${f('Address', 'address')}${App.field('Notes', `<textarea id="bc-notes" rows="3">${e(c.notes || '')}</textarea>`)}
      <label class="check"><input type="checkbox" id="bc-reg" ${c.regular ? 'checked' : ''}> Also show them in the main Clients list (if they buy steel framing too)</label>`,
      { wide: true, actions: `${!isNew ? '<button class="btn ghost danger" id="bc-x">Remove from batten clients</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="bc-ok">Save</button>` });
    m.querySelector('#bc-ok').onclick = () => {
      const v = k => m.querySelector('#bc-' + k).value.trim(); if (!v('company') && !v('name')) return App.toast('Add a company or a name', 'err');
      ['company', 'name', 'email', 'phone', 'accountsEmail', 'type', 'address', 'notes'].forEach(k => c[k] = v(k)); c.batten = true; c.regular = m.querySelector('#bc-reg').checked;
      if (isNew) { c.id = App.uid(); c.createdAt = Date.now(); st.data.customers = st.data.customers || []; st.data.customers.push(c); }
      st.touch(c); st.save(); App.closeModal();
      if (preset && preset.onSave) preset.onSave(c); else if (isNew) location.hash = `#/battens/client/${c.id}`;
      App.refresh();
    };
    if (!isNew) m.querySelector('#bc-x').onclick = () => { c.batten = false; st.touch(c); st.save(); App.closeModal(); location.hash = '#/battens/clients'; };
  };
  A.bcFromEst = () => { const x = cur(); A.bcEdit(null, null, { company: x.client.company, name: x.client.name, email: x.client.email, phone: x.client.phone, onSave: c => { x.clientId = c.id; B.save(x); App.toast(`${B.cLabel(c)} saved as a batten client`); } }); };
  A.bcNewEst = el => { const c = (st.data.customers || []).find(z => z.id === el.dataset.id); const x = B.create({ clientId: c.id, client: { name: c.name || '', company: c.company || '', email: c.email || '', phone: c.phone || '' } }); location.hash = `#/battens/e/${x.id}`; };

  /* ---------- the estimate PDF ---------- */
  B.spec = x => {
    const D = App.Docs; const p = B.calc(x); const c = cfg();
    const meta = [['Date', App.fmtLong(x.date)], ['Valid until', App.fmtLong(x.expiry)], ['Prepared by', x.createdBy || st.me().name]];
    const card = (l, v, sub) => `<div class="card"><p class="l">${e(l)}</p><p class="v">${e(v || '-')}</p>${sub ? `<p class="s">${e(sub)}</p>` : ''}</div>`;
    const stats = [['House area', x.houseArea ? fmt(x.houseArea) + ' m²' : ''], ['Stud height', x.stud && x.stud !== 'Other' ? x.stud + ' m' : ''], ['Batten centres', x.centres + ' mm'], [x.install ? 'Supply and install' : 'Supply only', c.profileLabel || '30 mm top hat, 0.55 BMT']].filter(s2 => s2[1]);
    const flow = [
      D.blk(`<div class="cards3">${card('Client', B.who(x), x.client.company && x.client.name ? x.client.name : '')}${card('Lot', x.lot)}${card('Site', x.address)}</div>`),
      D.blk(`${D.h2('The job')}<div class="stats" style="grid-template-columns:repeat(${stats.length - 1},minmax(0,1fr)) 1.6fr">${stats.map((s2, i) => `<div class="stat${i === stats.length - 1 ? ' prof' : ''}"><p class="l">${e(s2[0])}</p><p class="v">${e(s2[1])}</p></div>`).join('')}</div>`),
      D.blk(`${D.h2('What\'s included')}<div class="inclist" data-items>${B.included(x).map(t => `<div class="inc">${e(t)}</div>`).join('')}</div>`)
    ];
    const notes = x.notes ? `<div class="note"><p class="t">Notes</p><p>${App.textToHtml(x.notes)}</p></div>` : '';
    const price = `<div class="price"><p class="lbl">Total excl GST</p><p class="big">${App.money(p.total)}</p><div class="gstl"><span>GST 15%</span><b>${App.money(p.gst)}</b></div><div class="gstl"><span>Total incl GST</span><b>${App.money(p.incl)}</b></div></div>`;
    const bottom = `<div class="bottom"><div class="left">${notes}<p class="nl">${e(S().estimate.notListed)}</p></div>${price}</div>`;
    const tcs = (c.tcs || []).filter(t => t.t || t.d);
    const after = tcs.length ? [`<section class="blk tcs"><h1 class="h1" data-title="Terms and conditions">Terms and conditions</h1><ol data-items>${tcs.map(t => `<li>${t.t ? `<b>${e(t.t)}.</b> ` : ''}${e(t.d || '')}</li>`).join('')}</ol></section>`] : [];
    return { batten: true, head: D.fullHead('Ceiling batten estimate', x.number, meta), run: D.runHead(x.number, B.name(x)), foot: D.footFull(true, true), flow, bottom, after, number: x.number };
  };
  A.batPdf = () => { const x = cur(); App.Docs.preview(`${x.number} batten estimate`, B.spec(x), { pdfName: `${x.number} - ${B.name(x)} Ceiling Battens.pdf` }); };
  A.batEmail = async () => {
    const x = cur(); if (!x.client.email) return App.toast('Add the client\'s email first', 'err');
    App.toast('Making the PDF…');
    let extra = []; try { const blob = await App.Docs.toPdf(B.spec(x)); extra = [{ name: `${x.number} - ${B.name(x)} Ceiling Battens.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) }]; } catch (er) { return App.toast('Couldn\'t make the PDF: ' + er.message, 'err'); }
    const first = (x.client.name || '').split(' ')[0] || 'there';
    App.mail.compose({ title: `Email ${x.number}`, to: x.client.email, subject: `Estimate ${x.number}: ceiling battens, ${B.name(x)}`, extra,
      body: `Hi ${first},\n\nPlease find attached our estimate ${x.number} to supply and install ceiling battens at ${B.name(x)}.\n\nThe pricing is held until ${App.fmtLong(x.expiry)}. Let me know if you have any questions, or if you'd like to go ahead.\n\nCheers,`,
      onSent: () => { if (x.status === 'draft') { x.status = 'sent'; x.sentDate = App.today(); } B.log(x, 'Emailed to ' + x.client.email); B.save(x); App.refresh(); } });
  };

  /* ---------- jobs ---------- */
  B.jobsView = () => {
    const done = B.jobs().filter(x => x.job.stage === 'complete').sort((a, b) => (b.job.completedAt || 0) - (a.job.completedAt || 0));
    const list = B.jobs().filter(x => x.job.stage !== 'complete').sort((a, b) => STAGES.findIndex(s2 => s2[0] === a.job.stage) - STAGES.findIndex(s2 => s2[0] === b.job.stage));
    return B.jobsTable(list, 'No batten jobs on the go.') + `<h3 style="margin:22px 0 10px">Completed jobs</h3>` + (done.length ? `<div class="table-wrap"><table class="tracker"><thead><tr><th>Job</th><th>Client</th><th>Lot and address</th><th>Completed</th><th>Invoice</th><th></th></tr></thead><tbody>
      ${done.map(x => `<tr><td><b>${e(x.number)}</b></td><td>${e(B.who(x))}</td><td>${e(B.name(x))}</td><td class="small">${x.job.completedAt ? App.fmtShort(App.iso(new Date(x.job.completedAt))) : ''}</td><td>${x.job.invoiceSentAt ? `<span class="tag ok">Sent ${App.fmtShort(App.iso(new Date(x.job.invoiceSentAt)))}</span>` : `<button class="btn small primary" data-act="batInvoice" data-id="${x.id}">Send invoice to CH Accounts</button>`}</td><td class="r"><a class="btn small" href="#/battens/job/${x.id}">Open</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Completed jobs go here, with everything about the job.</p>');
  };
  B.jobsTable = (list, empty) => {
    return list.length ? `<div class="table-wrap"><table class="tracker"><thead><tr><th>Job</th><th>Client</th><th>Lot and address</th><th>Stage</th><th>Install</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr><td><b>${e(x.number)}</b></td><td>${e(B.who(x))}</td><td>${e(B.name(x))}</td><td>${stageTag(x)}</td><td class="small">${x.job.installDate ? App.fmtShort(x.job.installDate) : '-'}</td><td class="r"><a class="btn small" href="#/battens/job/${x.id}">Open</a></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><h2>${empty}</h2><p>Jobs appear when a batten estimate is accepted.</p></div>`;
  };
  B.jobView = id => {
    const x = B.get(id); if (!x || !x.job || x.deleted) return '<div class="empty"><h2>Job not found</h2><a class="btn" href="#/battens/jobs">Back</a></div>';
    App.state.batCur = x; const j = x.job; const si = STAGES.findIndex(s2 => s2[0] === j.stage);
    const coils = App.Coil && App.Coil.S.loadedAt ? App.Coil.forJob(x.number) : null;
    const mf = j.machine || {}; const filled = (mf.rows || []).filter(r => App.num(r.qty) && App.num(r.len));
    const ex = (j.extras || []).filter(z => z.desc || App.num(z.amount));
    const doneCard = j.stage === 'complete' ? `<section class="card bat-done"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><span><b>Job completed</b> ${j.completedAt ? App.fmtStamp(j.completedAt) : ''}${j.completedBy ? ', ' + e(j.completedBy) : ''}<span class="hint" style="display:block">${j.summaryLink ? `<a href="${e(j.summaryLink)}" target="_blank" rel="noopener">Job summary</a> saved in Battens / Completed jobs and the client's folder.` : 'Filed under Completed jobs and the client\'s jobs.'}</span></span>
        ${j.invoiceSentAt ? `<span class="tag ok">Invoice sent ${App.fmtStamp(j.invoiceSentAt)}</span><button class="btn small ghost" data-act="batInvoice" data-id="${x.id}">Send again</button>` : `<button class="btn primary" data-act="batInvoice" data-id="${x.id}">Send invoice to CH Accounts</button>`}</div>
        ${ex.length ? `<div style="margin-top:10px">${ex.map(z => `<div class="kvr2"><span>Extra: ${e(z.desc)}</span><b>${App.money(z.amount)}</b></div>`).join('')}</div>` : ''}</section>`
      : `<section class="card bat-done"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><span><b>Finished on site?</b><span class="hint" style="display:block">Marking it complete files the job under Completed jobs and the client's jobs, saves a job summary to Google Drive, then you can send it to CH Accounts to invoice.</span></span><button class="btn dark" data-act="batComplete">Job complete</button></div></section>`;
    return `<div class="page-head"><div><p class="crumbs"><a href="#/battens/jobs">Battens</a></p><h1>${e(x.number)}</h1><p class="sub">${e([B.who(x), B.name(x)].filter(Boolean).join(', '))}</p></div>
      <div class="head-actions"><a class="btn" href="#/battens/e/${x.id}">Estimate</a><details class="menu"><summary class="btn" aria-label="More actions">More</summary><div class="menu-pop"><button data-act="batDel" class="danger-text">Delete this job</button></div></details></div></div>
      <div class="bat-steps">${STAGES.map(([k, l], i) => `<button class="${i < si ? 'done' : i === si ? 'now' : ''}" data-act="batStage" data-s="${k}">${i < si ? '✓ ' : ''}${l}</button>`).join('')}</div>
      ${doneCard}<div class="bat-cols"><div class="bat-main">
        <section class="card"><h3>Measure</h3><div class="grid3">${App.field('Measured by', `<input data-jk="measuredBy" value="${e(j.measuredBy || '')}" data-act-change="batJobSet">`)}${App.field('Measure date', `<input type="date" data-jk="measureDate" value="${e(j.measureDate || '')}" data-act-change="batJobSet">`)}${App.field('Rooms (lines on the sheet)', `<input data-jk="rooms" inputmode="numeric" value="${e(j.rooms || 30)}" data-act-change="batJobSet">`)}</div>
          <div class="row-btns"><button class="btn primary" data-act="batMeasurePdf" data-id="${x.id}">Print measure sheet</button></div></section>
        <section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Plans</h3><label class="btn small">+ Attach plans<input type="file" accept="application/pdf,image/*" multiple hidden data-act-change="batPlans"></label></div>
          ${(j.plans || []).length ? j.plans.map((p, i) => `<div class="du-row" style="margin-top:8px"><b class="pdf">PDF</b><span>${e(p.name)}<span class="hint" style="display:block">Added ${App.fmtShort(App.iso(new Date(p.at)))}${p.by ? ' by ' + e(p.by) : ''}</span></span>${p.link ? `<a class="btn small" href="${e(p.link)}" target="_blank" rel="noopener">Open</a>` : ''}<button class="icon-btn" data-act="batPlanDel" data-i="${i}" aria-label="Remove">✕</button></div>`).join('') : '<p class="hint">No plans attached yet. They\'re saved in Google Drive under this job, so the boys know where to find them.</p>'}</section>
        <section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Machine file</h3>${filled.length ? `<span class="tag ok">${filled.length} rooms filled in</span>` : ''}</div><p>Type in what the boys measured, room by room, and download the CSV for the machine.</p><a class="btn primary" href="#/battens/mf/${x.id}">Open machine file</a>${mf.madeAt ? `<span class="hint" style="margin-left:10px">Last made ${App.fmtStamp(mf.madeAt)}</span>` : ''}</section>
        <section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Coils on this job</h3>${App.Coil && App.Coil.ready() ? '<button class="btn small" data-act="batCoilAdd">+ Assign a coil</button>' : ''}</div>
          ${!App.Coil || !App.Coil.ready() ? '<p class="hint">Sign in on the Coils page to assign coils.</p>' : !coils ? '<p class="hint">Loading coils…</p>' : coils.length ? `<table class="wtable"><tbody>${coils.map(c => `<tr><td><b>${e(c.coilId)}</b></td><td>${c.width} × ${App.Coil.bmt(c.thickness)}</td><td class="r">${App.Coil.kg(c.weight)}</td><td>${e(c.status)}</td><td class="r"><button class="icon-btn" data-act="coilUnassign" data-key="${e(c.key)}" data-job="${e(x.number)}" aria-label="Take off the job">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="hint">No coils assigned yet.</p>'}</section>
      </div><aside class="bat-side"><section class="card"><h3>Details</h3>${[['Client', B.who(x)], ['Contact', [x.client.name, x.client.phone].filter(Boolean).join(', ')], ['Lot', x.lot], ['Address', x.address], ['House area', x.houseArea ? fmt(x.houseArea) + ' m²' : ''], ['Batten centres', x.centres + ' mm'], ['Raking ceilings', x.raking ? (x.flashings ? 'Yes, with custom angle flashings' : 'Yes') : 'No'], ['Acoustic clips', x.acoustic ? 'Yes' : 'No'], ['Stud height', x.stud ? x.stud + ' m' : ''], ['Price', App.money(B.calc(x).total) + ' excl GST']].filter(r => r[1]).map(r => `<div class="kvr2"><span class="hint">${r[0]}</span><b>${e(r[1])}</b></div>`).join('')}</section>
        <section class="card"><h3>Install</h3>${App.field('Install date', `<input type="date" data-jk="installDate" value="${e(j.installDate || '')}" data-act-change="batJobSet">`)}<p class="hint">Shows on the Calendar.</p></section></aside></div>`;
  };
  A.batStage = el => { const x = cur(); x.job.stage = el.dataset.s; B.log(x, 'Stage: ' + STAGES.find(s2 => s2[0] === el.dataset.s)[1]); B.save(x); App.refresh(); };
  A.batJobSet = el => {
    const x = cur(); const k = el.dataset.jk; x.job[k] = el.value;
    if (k === 'measureDate' && el.value && x.job.stage === 'accepted') x.job.stage = 'booked';
    if (k === 'installDate') B.syncInstall(x);
    B.save(x); App.refresh();
  };
  /* install date goes on the Calendar as an event */
  B.syncInstall = x => {
    st.data.events = st.data.events || [];
    let ev = st.data.events.find(v => v.battenId === x.id);
    if (!x.job.installDate) { if (ev) { ev.deleted = true; st.touch(ev); App.Jobs && App.Jobs.syncEvent && App.Jobs.syncEvent(ev); } return; }
    if (!ev) { ev = { id: App.uid(), battenId: x.id, createdAt: Date.now() }; st.data.events.push(ev); }
    Object.assign(ev, { title: `Batten install ${x.number}, ${B.name(x)}`, date: x.job.installDate, notes: `${B.who(x)}${x.houseArea ? ', ' + fmt(x.houseArea) + ' m²' : ''}`, deleted: false });
    st.touch(ev); if (App.Jobs && App.Jobs.syncEvent) App.Jobs.syncEvent(ev);
  };
  /* ---------- Job complete: file it, and save a summary of the whole job ---------- */
  B.summarySpec = x => {
    const R = App.Reports, D = App.Docs; const j = x.job; const p = B.calc(x); const t = B.mfTotals(x); const ex = (j.extras || []).filter(z => z.desc || App.num(z.amount));
    const coils = App.Coil && App.Coil.S.loadedAt ? App.Coil.forJob(x.number) : [];
    const flow = [D.blk(R.stats([['Price excl GST', App.money(p.total), ''], ['Extras', ex.length ? App.money(ex.reduce((s2, z) => s2 + App.num(z.amount), 0)) : '-', ''], ['Battens made', t.n ? fmt(t.n) : '-', t.lm ? t.lm.toFixed(1) + ' LM' : ''], ['Completed', j.completedAt ? App.fmtShort(App.iso(new Date(j.completedAt))) : '-', j.completedBy || '']])),
      R.section('The job', R.table(['', ''], [['Client', e(B.who(x))], ['Contact', e([x.client.name, x.client.phone, x.client.email].filter(Boolean).join(', '))], ['Lot', e(x.lot || '')], ['Address', e(x.address || '')], ['House area', x.houseArea ? fmt(x.houseArea) + ' m²' : ''], ['Batten centres', x.centres + ' mm'], ['Raking ceilings', x.raking ? (x.flashings ? 'Yes, with custom angle flashings' : 'Yes') : 'No'], ['Acoustic clips', x.acoustic ? 'Yes' : 'No'], ['Stud height', x.stud ? x.stud + ' m' : ''], ['Estimate', `${e(x.number)}, accepted ${x.acceptedAt ? App.fmtShort(x.acceptedAt) : ''}`]])),
      R.section('Dates', R.table(['', ''], [['Measured', [j.measureDate ? App.fmtShort(j.measureDate) : '', j.measuredBy || ''].filter(Boolean).join(', ') || '-'], ['Machine file', j.machine && j.machine.madeAt ? App.fmtStamp(j.machine.madeAt) : '-'], ['Installed', j.installDate ? App.fmtShort(j.installDate) : '-']]))];
    if (ex.length) flow.push(R.section('Extras charged', R.table(['Extra', 'Amount'], ex.map(z => [e(z.desc), App.money(z.amount)]), [1])));
    if (coils.length) flow.push(R.section('Coils used', R.table(['Coil', 'Size', 'Weight'], coils.map(c => [e(c.coilId), `${c.width} × ${App.Coil.bmt(c.thickness)}`, App.Coil.kg(c.weight)]))));
    if ((j.plans || []).length) flow.push(R.section('Plans', R.table(['File', 'Added'], j.plans.map(pl => [e(pl.name), App.fmtShort(App.iso(new Date(pl.at)))]))));
    const rows = ((j.machine || {}).rows || []).map((r, i) => [String(i + 1), String(r.qty || ''), String(r.len || '')]).filter(r => r[1]);
    if (rows.length) flow.push(R.section('Machine file', R.table(['Room', 'Qty', 'Length (mm)'], rows, [1, 2])));
    return R.spec('Batten job summary', `${x.number}`, [['Site', B.name(x)], ['Client', B.who(x)]], flow);
  };
  B.fileJob = async x => {
    if (st.mode !== 'drive') return;
    const name = `${x.number} ${B.name(x)}`.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
    const blob = await App.Docs.toPdf(B.summarySpec(x)); const pdf = `${name} job summary.pdf`;
    const root = await App.G.folder('Battens', st.rootId);
    const done = await App.G.folder(name, await App.G.folder('Completed jobs', root));
    const cl = await App.G.folder(name, await App.G.folder(B.who(x).replace(/[\\/:*?"<>|]+/g, '-') || 'No client', await App.G.folder('Clients', root)));
    const up = await App.G.uploadOrReplace({ name: pdf, parent: done, blob, mime: 'application/pdf' });
    await App.G.uploadOrReplace({ name: pdf, parent: cl, blob, mime: 'application/pdf' });
    if (x.job.machine && B.mfTotals(x).n) { const csv = new Blob([B.csv(x)], { type: 'text/csv' }); for (const f of [done, cl]) await App.G.uploadOrReplace({ name: B.mfName(x) + '.csv', parent: f, blob: csv, mime: 'text/csv' }); }
    x.job.summaryLink = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`; x.job.summaryFolder = done;
  };
  A.batComplete = async () => {
    const x = cur();
    if (!(await App.confirm(`Mark ${x.number} as complete?`, 'It moves to Completed jobs and the client\'s jobs, and a summary of the whole job is saved to Google Drive (Battens / Completed jobs, and Battens / Clients / ' + (B.who(x) || 'the client') + '). Then you can send it to CH Accounts.', 'Job complete'))) return;
    x.job.stage = 'complete'; x.job.completedAt = Date.now(); x.job.completedBy = st.me().name; if (!x.job.installDate) x.job.installDate = App.today();
    B.log(x, 'Job completed'); B.save(x); App.refresh();
    try { App.toast('Saving the job summary to Google Drive…'); await B.fileJob(x); B.save(x); App.refresh(); App.toast('Job filed. Next: send the invoice to CH Accounts.'); }
    catch (er) { App.toast('Marked complete, but saving to Drive didn\'t work: ' + er.message, 'err', 7000); }
  };

  /* ---------- Send invoice to CH Accounts: check first, then a draft to review ---------- */
  A.batInvoice = el => {
    const x = B.get(el.dataset.id) || cur(); App.state.batCur = x; const inv = cfg().invoice || {};
    if (!inv.to && !S().emails.accountsEmail) return App.toast('Add who invoices go to in Settings, Battens, Batten invoices', 'err', 6000);
    const p = B.calc(x); const extras = App.clone(x.job.extras || []);
    const exRow = (z, i) => `<div class="row ex-row" data-i="${i}" style="margin-bottom:6px"><input class="ex-d" value="${e(z.desc || '')}" placeholder="What was the extra?" style="flex:2"><input class="ex-a" value="${e(z.amount || '')}" inputmode="decimal" placeholder="$ excl GST" style="flex:1"><button class="icon-btn ex-x" type="button" aria-label="Remove">✕</button></div>`;
    const m = App.modal(`Before you send ${x.number} to CH Accounts`, `<p class="hint">Tick each one to check it. Nothing is sent from here: the next step is a draft email for you to review.</p>
      <div class="inv-checks">
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Is the price correct?</b><span class="row" style="margin-top:6px"><input id="inv-price" value="${e(App.round(p.total, 2))}" inputmode="decimal" style="max-width:180px"> <span class="hint">excl GST</span></span></span></label>
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Were there any extras during the job to charge for?</b><span class="hint" style="display:block">Add them below, or leave it empty if there weren't any.</span><span id="inv-ex" style="display:block;margin-top:6px">${extras.map(exRow).join('')}</span><button class="btn small" type="button" id="inv-ex-add">+ Add an extra</button></span></label>
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Are the lot number and address right?</b><span class="grid2" style="margin-top:6px">${App.field('Lot', `<input id="inv-lot" value="${e(x.lot || '')}">`)}${App.field('Address', `<input id="inv-addr" value="${e(x.address || '')}">`)}</span></span></label>
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Is the company name right?</b><span style="display:block;margin-top:6px"><input id="inv-co" value="${e(x.client.company || x.client.name || '')}"></span></span></label>
      </div>`, { wide: true, actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="inv-ok" disabled>Draft the email</button>' });
    const ok = m.querySelector('#inv-ok'); const checks = [...m.querySelectorAll('.ic')];
    checks.forEach(c => c.onchange = () => { c.closest('.inv-check').classList.toggle('on', c.checked); ok.disabled = !checks.every(z => z.checked); });
    const bindEx = () => m.querySelectorAll('.ex-x').forEach(b2 => b2.onclick = ev => { ev.preventDefault(); b2.closest('.ex-row').remove(); });
    m.querySelector('#inv-ex-add').onclick = ev => { ev.preventDefault(); m.querySelector('#inv-ex').insertAdjacentHTML('beforeend', exRow({}, Date.now())); bindEx(); };
    bindEx();
    ok.onclick = () => {
      x.job.extras = [...m.querySelectorAll('.ex-row')].map(r => ({ desc: r.querySelector('.ex-d').value.trim(), amount: App.num(r.querySelector('.ex-a').value) })).filter(z => z.desc || z.amount);
      const price = App.num(m.querySelector('#inv-price').value);
      if (Math.abs(price - B.calc(x).total) > 0.004) { x.priceManual = true; x.price = price; }
      x.lot = m.querySelector('#inv-lot').value.trim(); x.address = m.querySelector('#inv-addr').value.trim();
      const co = m.querySelector('#inv-co').value.trim(); if (x.client.company || !x.client.name) x.client.company = co; else x.client.name = co;
      B.save(x); App.closeModal(); B.invoiceEmail(x);
    };
  };
  B.invoiceEmail = x => {
    const inv = cfg().invoice || {}; const p = B.calc(x); const ex = (x.job.extras || []);
    const exTot = ex.reduce((s2, z) => s2 + App.num(z.amount), 0);
    const v = { number: x.number, lot: x.lot || '', address: x.address || '', company: B.who(x), name: (inv.name || '').split(' ')[0] || 'there',
      price: App.money(p.total), extras: ex.length ? ex.map(z => `${z.desc}: ${App.money(z.amount)}`).join('\n') : 'None', total: App.money(p.total + exTot) };
    const fill = s2 => String(s2 || '').replace(/\{(\w+)\}/g, (mm, k) => v[k] !== undefined ? v[k] : mm);
    App.mail.compose({ title: `Send ${x.number} to CH Accounts`, to: inv.to || S().emails.accountsEmail, cc: inv.cc || '', subject: fill(inv.subject), body: fill(inv.body), kind: 'accounts',
      onSent: () => { x.job.invoiceSentAt = Date.now(); x.job.invoiceSentBy = st.me().name; B.log(x, 'Sent to CH Accounts to invoice'); B.save(x); App.refresh(); App.toast('Sent to CH Accounts'); } });
  };
  B.folder = async (x, sub) => {
    let p = await App.G.folder('Battens', st.rootId);
    p = await App.G.folder(`${x.number} ${x.address || x.lot || ''}`.trim().replace(/[\\/:*?"<>|]+/g, '-'), p);
    return sub ? App.G.folder(sub, p) : p;
  };
  A.batPlans = async el => {
    const x = cur(); const files = [...el.files]; if (!files.length) return;
    if (st.mode !== 'drive') return App.toast('Connect Google to attach plans', 'err');
    try {
      const fo = await B.folder(x, 'Plans');
      for (const f of files) { App.toast(`Saving ${f.name}…`); const up = await App.G.uploadOrReplace({ name: f.name, parent: fo, blob: f, mime: f.type || 'application/pdf' }); x.job.plans = (x.job.plans || []).filter(p => p.name !== f.name).concat([{ name: f.name, id: up.id, link: up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`, at: Date.now(), by: st.me().name }]); }
      B.save(x); App.refresh(); App.toast('Plans saved to Google Drive');
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
  A.batPlanDel = el => { const x = cur(); x.job.plans.splice(+el.dataset.i, 1); B.save(x); App.refresh(); };
  /* assign a batten or purlin coil to this job (same as the Coils page) */
  A.batCoilAdd = () => {
    const x = cur(); const C = App.Coil; const c = cfg();
    const pick = [c.coils.batten, c.coils.purlin].map(sp => B.coilStock(sp)).filter(Boolean).flatMap(s2 => s2.list).filter(k => !(k.jobs || []).includes(x.number));
    const m = App.modal(`Assign a coil to ${x.number}`, pick.length ? `<p class="hint">Batten and purlin coils in stock.</p>${pick.map(k => `<button class="btn" style="width:100%;justify-content:space-between;margin-bottom:6px" data-key="${e(k.key)}"><b>${e(k.coilId)}</b><span>${k.width} × ${C.bmt(k.thickness)}, ${C.kg(k.weight)}</span></button>`).join('')}<p class="hint">For any other coil, use Coils, or scan it.</p>` : '<p>No batten or purlin coils in stock to assign.</p>', {});
    m.querySelectorAll('[data-key]').forEach(b => b.onclick = async () => { try { const jobs = await C.api('assignJob', { key: b.dataset.key, job: x.number }); C.upsert({ key: b.dataset.key, jobs }); App.closeModal(); App.toast('Coil assigned'); App.refresh(); } catch (er) { App.toast(er.message, 'err'); } });
  };

  /* ---------- measure sheet PDF (to print) ---------- */
  B.measureSpec = x => {
    const D = App.Docs; const j = x.job || {}; const n = Math.max(1, Math.min(200, App.num(j.rooms) || 30));
    const box = (l, v) => `<div class="mbox"><p class="l">${e(l)}</p><p class="v">${e(v || '')}</p></div>`;
    const flow = [D.blk(`<div class="mgrid">${box('Client', B.who(x))}${box('Lot and address', B.name(x))}${box('Measured by', j.measuredBy)}${box('Date', j.measureDate ? App.fmtLong(j.measureDate) : '')}${box('House area', (x.houseArea ? fmt(x.houseArea) + ' m², ' : '') + `battens at ${x.centres} crs`)}${box('Raking ceilings', x.raking ? (x.flashings ? 'Yes, custom angle flashings' : 'Yes') : 'No')}</div>`),
      D.blk(`<table class="mtable"><thead><tr><th>Room</th><th>Qty</th><th>Length (mm)</th></tr></thead><tbody data-items>${Array.from({ length: n }, (_, i) => `<tr><td>${i + 1}</td><td></td><td></td></tr>`).join('')}</tbody></table>`)];
    if ((j.plans || []).length) flow.unshift(D.blk(`<p class="mplans">Plans: Google Drive, Battens / ${e(x.number)} / Plans</p>`));
    return { theme: 'cover', measure: true, head: D.fullHead('Measure sheet', x.number, [['Printed', App.fmtStamp(Date.now())]]), run: D.runHead(x.number, 'Measure sheet, continued'), foot: D.footFull(false), flow, bottom: '', after: [], number: x.number };
  };
  A.batMeasurePdf = el => { const x = B.get(el.dataset.id) || cur(); App.Docs.preview(`${x.number} measure sheet`, B.measureSpec(x), { pdfName: `${x.number} Measure sheet.pdf` }); };

  /* ---------- machine files (the CSV your machine reads) ---------- */
  B.machineList = () => {
    const list = B.jobs().filter(x => x.job.machine && (x.job.machine.rows || []).some(r => App.num(r.qty))).sort((a, b) => (b.job.machine.madeAt || 0) - (a.job.machine.madeAt || 0));
    const todo = B.jobs().filter(x => ['measured', 'booked', 'accepted'].includes(x.job.stage) && !list.includes(x));
    return `${todo.length ? `<section class="card"><h3>Ready for a machine file</h3>${todo.map(x => `<div class="kvr2"><span><b>${e(x.number)}</b> ${e(B.name(x))}</span><a class="btn small ${x.job.stage === 'measured' ? 'primary' : ''}" href="#/battens/mf/${x.id}">Make the file</a></div>`).join('')}</section>` : ''}
      <section class="card"><h3>All machine files</h3>${list.length ? `<table class="wtable"><thead><tr><th>File</th><th>Job</th><th>Battens</th><th>Made</th><th></th></tr></thead><tbody>${list.map(x => { const t = B.mfTotals(x); return `<tr><td><b>${e(B.mfName(x))}.csv</b></td><td>${e(x.number)}, ${e(B.who(x))}</td><td>${fmt(t.n)} · ${t.lm.toFixed(1)} LM</td><td class="small">${x.job.machine.madeAt ? App.fmtStamp(x.job.machine.madeAt) + (x.job.machine.madeBy ? ', ' + e(x.job.machine.madeBy) : '') : 'Not downloaded yet'}</td><td class="r nowrap"><a class="btn small" href="#/battens/mf/${x.id}">Open</a><button class="btn small" data-act="batCsv" data-id="${x.id}">Download</button></td></tr>`; }).join('')}</tbody></table>` : '<p class="hint">No machine files yet.</p>'}</section>
      <p class="hint">Files save to Google Drive in Battens / Machine files, and in each job's own folder.</p>`;
  };
  B.mfName = x => String((x.job.machine && x.job.machine.frameset) || x.address || B.name(x)).trim().replace(/[\\/:*?"<>|]+/g, '-');
  B.mfTotals = x => { const rows = ((x.job.machine || {}).rows || []); let n = 0, lm = 0; rows.forEach(r => { const q = App.num(r.qty), l = App.num(r.len); if (q && l) { n += q; lm += q * l / 1000; } }); return { n, lm, kg: lm * App.num(cfg().kgPerM || 0.59) }; };
  /* exactly the same layout as your machine's files: three header lines, then one COMPONENT line per room, Windows line endings */
  B.csv = x => {
    const m = x.job.machine; const lines = ['UNIT,MILLIMETRE,,,', 'PROFILE,DEFAULT_PROFILE,Standard Profile,,', `FRAMESET,${B.mfName(x)} ,,,`];
    (m.rows || []).forEach((r, i) => { const q = Math.round(App.num(r.qty)), l = Math.round(App.num(r.len)); if (q && l) lines.push(`COMPONENT,${i + 1},LABEL_INV,${q},${l}`); });
    return lines.join('\r\n');
  };
  B.mfView = id => {
    const x = B.get(id); if (!x || !x.job) return '<div class="empty"><h2>Job not found</h2></div>';
    App.state.batCur = x; const m = x.job.machine = x.job.machine || { rows: [], frameset: x.address || B.name(x) };
    const n = Math.max(App.num(x.job.rooms) || 30, (m.rows || []).length);
    while (m.rows.length < n) m.rows.push({ qty: '', len: '' });
    const t = B.mfTotals(x);
    return `<div class="page-head"><div><p class="crumbs"><a href="#/battens/machine">Machine files</a></p><h1>${e(x.number)} machine file</h1><p class="sub">${e([B.who(x), B.name(x)].filter(Boolean).join(', '))}</p></div><div class="head-actions"><a class="btn" href="#/battens/job/${x.id}">Open job</a></div></div>
      <div class="bat-cols"><div class="bat-main"><section class="card">
        <div class="grid3">${App.field('Frameset name (goes in the file)', `<input id="mf-fs" value="${e(m.frameset || '')}" data-act-change="batMfName">`)}${App.field('Rooms', `<input id="mf-n" inputmode="numeric" value="${e(n)}" data-act-change="batMfRooms">`)}<div class="fld"><span>&#160;</span><button class="btn" data-act="batMfPaste">Paste from Excel</button></div></div>
        <p class="hint">One line per room, already numbered. <b>Enter goes down</b> the column, so you can type all the quantities, then all the lengths (at the bottom of Qty, Enter jumps to the top of Length). Tab goes across. Leave a room blank if it has nothing.</p>
        <table class="mf-grid"><thead><tr><th>Room</th><th>Qty</th><th>Length (mm)</th></tr></thead><tbody>${m.rows.map((r, i) => `<tr><td>${i + 1}</td><td><input data-r="${i}" data-c="qty" inputmode="numeric" value="${e(r.qty)}"></td><td><input data-r="${i}" data-c="len" inputmode="numeric" value="${e(r.len)}"></td></tr>`).join('')}</tbody></table>
        <div class="row" style="justify-content:space-between;margin-top:14px;flex-wrap:wrap"><span id="mf-tot"><b>${fmt(t.n)} battens</b>, ${t.lm.toFixed(1)} LM, about ${fmt(t.kg)} kg of coil</span><span class="row"><button class="btn" data-act="batMfCheck">Check it</button><button class="btn primary" data-act="batCsv" data-id="${x.id}">Download CSV</button></span></div></section></div>
      <aside class="bat-side"><section class="card"><h3>The CSV it makes</h3><pre class="csv-pre" id="mf-pre">${e(B.csv(x).split('\r\n').slice(0, 10).join('\n'))}${(m.rows || []).filter(r => App.num(r.qty) && App.num(r.len)).length > 7 ? '\n…' : ''}</pre><p class="hint">Same layout as your machine's files.</p></section>
        <section class="card"><h3>Saved to Google Drive</h3><p class="small">Battens / Machine files / <b>${e(B.mfName(x))}.csv</b><br>Battens / ${e(x.number)} ${e(x.address || '')} / <b>${e(B.mfName(x))}.csv</b></p></section></aside></div>`;
  };
  App.views.battens.mount = ((orig) => (a, b) => {
    orig(a, b);
    if (a !== 'mf') return;
    const x = cur(); const grid = document.querySelector('.mf-grid'); if (!grid) return;
    const inputs = () => [...grid.querySelectorAll('input')];
    const totals = () => { const t = B.mfTotals(x); const el = document.getElementById('mf-tot'); if (el) el.innerHTML = `<b>${fmt(t.n)} battens</b>, ${t.lm.toFixed(1)} LM, about ${fmt(t.kg)} kg of coil`; const pre = document.getElementById('mf-pre'); if (pre) pre.textContent = B.csv(x).split('\r\n').slice(0, 10).join('\n'); };
    grid.addEventListener('input', ev => { const i = ev.target; if (!i.dataset.r) return; x.job.machine.rows[+i.dataset.r][i.dataset.c] = i.value.replace(/[^\d.]/g, ''); totals(); });
    grid.addEventListener('change', () => { B.save(x); });
    /* Enter (and the down arrow) go down the same column, so you can do all the quantities, then all the lengths. Tab still goes across. */
    grid.addEventListener('keydown', ev => {
      const t = ev.target; if (!t.dataset || t.dataset.r === undefined) return;
      const go = d => { const n = grid.querySelector(`input[data-r="${+t.dataset.r + d}"][data-c="${t.dataset.c}"]`); if (n) { ev.preventDefault(); n.focus(); n.select(); } else if (d > 0 && ev.key === 'Enter') { ev.preventDefault(); const other = grid.querySelector(`input[data-r="0"][data-c="${t.dataset.c === 'qty' ? 'len' : 'qty'}"]`); if (other) { other.focus(); other.select(); } } };
      if (ev.key === 'Enter' && !ev.shiftKey) go(1); else if (ev.key === 'Enter' && ev.shiftKey) go(-1); else if (ev.key === 'ArrowDown') go(1); else if (ev.key === 'ArrowUp') go(-1);
    });
    grid.addEventListener('paste', ev => {
      const txt = (ev.clipboardData || window.clipboardData).getData('text'); if (!/[\t\n]/.test(txt)) return;
      ev.preventDefault(); B.pasteRows(x, txt, +ev.target.dataset.r || 0); B.save(x); App.refresh();
    });
  })(App.views.battens.mount);
  /* paste from Excel: Qty and Length columns, or Room, Qty and Length */
  B.pasteRows = (x, txt, start = 0) => {
    const rows = txt.trim().split(/\r?\n/).map(l => l.split(/\t|,/).map(c => c.trim()).filter((c, i, a2) => c !== '' || i < a2.length));
    rows.forEach((r, k) => {
      const nums = r.map(c => App.num(c)); let qty, len, room;
      if (r.length >= 3) { room = nums[0]; qty = nums[1]; len = nums[2]; } else { qty = nums[0]; len = nums[1]; }
      const idx = room ? room - 1 : start + k; const m = x.job.machine;
      while (m.rows.length <= idx) m.rows.push({ qty: '', len: '' });
      m.rows[idx] = { qty: qty || '', len: len || '' };
    });
    x.job.rooms = Math.max(App.num(x.job.rooms), x.job.machine.rows.length);
  };
  A.batMfPaste = async () => {
    const x = cur();
    const m = App.modal('Paste from Excel', `<p class="hint">Copy the Qty and Length columns from Excel (or Room, Qty and Length) and paste them here.</p><textarea id="mf-paste" rows="10" placeholder="9	4000&#10;9	4250"></textarea>`, { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="mf-p-ok">Fill it in</button>' });
    m.querySelector('#mf-p-ok').onclick = () => { B.pasteRows(x, m.querySelector('#mf-paste').value, 0); B.save(x); App.closeModal(); App.refresh(); };
  };
  A.batMfName = el => { const x = cur(); x.job.machine.frameset = el.value.trim(); B.save(x); App.refresh(); };
  A.batMfRooms = el => { const x = cur(); const n = Math.max(1, Math.min(300, App.num(el.value))); x.job.rooms = n; x.job.machine.rows = x.job.machine.rows.slice(0, Math.max(n, x.job.machine.rows.filter(r => App.num(r.qty) || App.num(r.len)).length ? x.job.machine.rows.reduce((mx, r, i) => App.num(r.qty) || App.num(r.len) ? i + 1 : mx, 0) : 0)); B.save(x); App.refresh(); };
  B.check = x => {
    const issues = [];
    (x.job.machine.rows || []).forEach((r, i) => {
      const q = App.num(r.qty), l = App.num(r.len);
      if ((q && !l) || (!q && l)) issues.push(`Room ${i + 1}: needs both a qty and a length`);
      if (l && (l < 100 || l > 13000)) issues.push(`Room ${i + 1}: length ${l} mm looks wrong`);
      if (q > 200) issues.push(`Room ${i + 1}: qty ${q} looks high`);
      if (String(r.qty).includes('.')) issues.push(`Room ${i + 1}: qty should be a whole number`);
    });
    if (!B.mfTotals(x).n) issues.push('Nothing filled in yet');
    return issues;
  };
  A.batMfCheck = () => { const iss = B.check(cur()); if (!iss.length) App.toast('All good: every room has a qty and a length'); else App.modal('Check these', `<ul>${iss.map(i => `<li>${e(i)}</li>`).join('')}</ul>`, {}); };
  A.batCsv = async el => {
    const x = B.get(el.dataset.id) || cur(); const iss = B.check(x).filter(i => !/looks/.test(i));
    if (iss.length) { App.modal('Fix these first', `<ul>${iss.map(i => `<li>${e(i)}</li>`).join('')}</ul>`, {}); return; }
    const name = B.mfName(x) + '.csv'; const blob = new Blob([B.csv(x)], { type: 'text/csv' });
    App.download(name, blob, 'text/csv');
    x.job.machine.madeAt = Date.now(); x.job.machine.madeBy = st.me().name;
    if (['accepted', 'booked', 'measured'].includes(x.job.stage)) x.job.stage = 'file';
    B.log(x, `Machine file made: ${name}`); B.save(x); App.refresh();
    if (st.mode === 'drive') {
      try {
        const all = await App.G.folder('Machine files', await App.G.folder('Battens', st.rootId));
        await App.G.uploadOrReplace({ name, parent: all, blob, mime: 'text/csv' });
        await App.G.uploadOrReplace({ name, parent: await B.folder(x), blob, mime: 'text/csv' });
        App.toast('Downloaded, and saved to Google Drive');
      } catch (er) { App.toast('Downloaded, but saving to Drive didn\'t work: ' + er.message, 'err', 6000); }
    }
  };

  /* ---------- PDF summary of the Battens tab ---------- */
  if (App.Reports) {
    App.Reports.PAGES.battens = ['Battens', 'battens', { def: 'year' }];
    App.Reports.SECTIONS.battens = [['estimates', 'Estimates'], ['jobs', 'Jobs']];
    App.Reports.build.battens = r => {
      const R = App.Reports, D = App.Docs; const list = live().filter(x => R.inRange(x.date, r));
      const flow = [R.multi() ? D.blk(R.stats([['Estimates', String(list.length), App.money(list.reduce((t, x) => t + B.calc(x).total, 0), 0)], ['Won', String(list.filter(x => x.status === 'accepted').length), ''], ['Jobs on the go', String(B.jobs().filter(x => x.job.stage !== 'complete').length), '']])) : ''];
      if (R.has('estimates')) flow.push(R.section('Estimates', R.table(['Number', 'Client', 'Lot and address', 'Price', 'Status'], list.map(x => [e(x.number), e(B.who(x)), e(B.name(x)), App.money(B.calc(x).total, 0), STATUS[x.status][0]]), [3])));
      if (R.has('jobs')) flow.push(R.section('Jobs', R.table(['Job', 'Client', 'Lot and address', 'Stage', 'Install'], B.jobs().map(x => [e(x.number), e(B.who(x)), e(B.name(x)), (STAGES.find(s2 => s2[0] === x.job.stage) || [, ''])[1], x.job.installDate ? App.fmtShort(x.job.installDate) : '-']))));
      const t = R.titled('Battens', 'battens');
      R.show(t, R.spec('Battens summary', t, [['Period', r.label]], flow), `${t} ${r.label}`);
    };
  }
})();
