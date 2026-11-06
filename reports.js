/* PDF reports: every page gets a "Download PDF" button. Each PDF uses the same branded pages as the estimates
   (logo, yellow bar, watermark, footer). */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const D = () => App.Docs;
  const money = (v, d = 0) => App.money(v, d);
  const fmt = n => Math.round(App.num(n)).toLocaleString('en-NZ');
  const R = App.Reports = {
    /* ---------- building blocks ---------- */
    stats(items) { return `<div class="stats" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">${items.map(([l, v, s], i) => `<div class="stat ${i === 0 ? 'dark' : ''}"><p class="l">${e(l)}</p><p class="v">${e(v)}</p>${s ? `<p class="l">${e(s)}</p>` : ''}</div>`).join('')}</div>`; },
    table(head, rows, right = []) {
      if (!rows.length) return '<p class="hint">Nothing to show.</p>';
      return `<table class="dt"><thead><tr>${head.map((h, i) => `<th class="${right.includes(i) ? 'r' : ''}">${e(h)}</th>`).join('')}</tr></thead><tbody data-items>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${right.includes(i) ? 'r' : ''}">${i === 0 ? `<b>${c}</b>` : c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    },
    section(title, inner) { return D().blk(`${D().h2(title)}${inner}`); },
    note(text) { return D().blk(`<div class="note"><p>${text}</p></div>`); },
    spec(kicker, title, meta, flow) {
      const by = st.me().name || '';
      return { head: D().fullHead(kicker, title, meta.concat([['Printed', App.fmtStamp(Date.now())], ['By', by]])), run: D().runHead(title, kicker), foot: D().footFull(), flow, bottom: '', after: [], number: title };
    },
    show(title, spec, fileName) { D().preview(title, spec, { pdfName: (fileName || title).replace(/[\\/:*?"<>|]+/g, '-') + '.pdf' }); },
    inRange(d, r) { if (!d) return false; const x = String(d).slice(0, 10); return x >= r.from && x <= r.to; },
    /* ---------- period picker ---------- */
    pick(title, cb, opts = {}) {
      const t = App.today(); const ws = App.weekStart(t); const ms = t.slice(0, 8) + '01';
      const lm = App.addMonths(ms, -1); const lmEnd = App.addDays(ms, -1); const ys = t.slice(0, 4) + '-01-01';
      const P = { week: [ws, App.addDays(ws, 6), 'This week'], month: [ms, App.addDays(App.addMonths(ms, 1), -1), App.fmtDate(t, { month: 'long', year: 'numeric' })], last: [lm, lmEnd, App.fmtDate(lm, { month: 'long', year: 'numeric' })], year: [ys, t.slice(0, 4) + '-12-31', t.slice(0, 4)], all: ['2000-01-01', '2999-12-31', 'Everything'] };
      if (opts.noPeriod) return cb({ from: '2000-01-01', to: '2999-12-31', label: 'Now' });
      const m = App.modal(`Download PDF: ${title}`, `<div class="fld"><span>Which period?</span><div class="seg wrap">${Object.entries(P).map(([k, v], i) => `<label><input type="radio" name="rp" value="${k}" ${k === (opts.def || 'month') ? 'checked' : ''}><span>${e(v[2])}</span></label>`).join('')}<label><input type="radio" name="rp" value="custom"><span>Pick dates</span></label></div></div>
        <div class="grid2" id="rp-c" hidden>${App.field('From', `<input type="date" id="rp-f" value="${ms}">`)}${App.field('To', `<input type="date" id="rp-t" value="${t}">`)}</div>`,
        { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="rp-ok">Make the PDF</button>' });
      m.querySelectorAll('input[name="rp"]').forEach(r => r.onchange = () => { m.querySelector('#rp-c').hidden = r.value !== 'custom' || !r.checked; });
      m.querySelector('#rp-ok').onclick = () => {
        const k = m.querySelector('input[name="rp"]:checked').value;
        const r = k === 'custom' ? { from: m.querySelector('#rp-f').value, to: m.querySelector('#rp-t').value, label: `${App.fmtShort(m.querySelector('#rp-f').value)} to ${App.fmtShort(m.querySelector('#rp-t').value)}` } : { from: P[k][0], to: P[k][1], label: P[k][2] };
        App.closeModal(); setTimeout(() => cb(r), 50);
      };
    },
    /* which report each page offers */
    PAGES: {
      tracker: ['Estimate tracker', 'tracker'], followups: ['Follow-ups', 'followups', { noPeriod: true }], sales: ['Sales', 'sales'], production: ['Production', 'production', { noPeriod: true }],
      detailing: ['Detailing', 'detailing', { def: 'all' }], calendar: ['Calendar', 'calendar', { def: 'month' }], coils: ['Coils', 'coils'], fasteners: ['Fasteners', 'fasteners'],
      safety: ['Health and safety', 'safety', { def: 'year' }], maintenance: ['Maintenance', 'maintenance', { def: 'year' }], pricing: ['Pricing', 'pricing', { noPeriod: true }], dashboard: ['Dashboard', 'dashboard', { def: 'month' }], '': ['Dashboard', 'dashboard', { def: 'month' }]
    },
    addButton() {
      const r = App.route();
      if (r.name === 'job' && r.a) return R.addRecordButton(r);
      if (r.name === 'sales' && r.a === 'c') return R.addRecordButton(r);
      if (r.a && !['coils', 'safety', 'maintenance'].includes(r.name)) return;
      const p = R.PAGES[r.name]; if (!p) return;
      const head = document.querySelector('#main .page-head'); if (!head || head.querySelector('[data-act="reportPdf"]')) return;
      let acts = head.querySelector('.head-actions'); if (!acts) { acts = document.createElement('div'); acts.className = 'head-actions'; head.appendChild(acts); }
      acts.insertAdjacentHTML('afterbegin', `<button class="btn" data-act="reportPdf" data-k="${p[1]}">Download PDF</button>`);
    },
    addRecordButton(r) {
      const head = document.querySelector('#main .page-head'); if (!head || head.querySelector('[data-act="reportPdf"]')) return;
      let acts = head.querySelector('.head-actions'); if (!acts) { acts = document.createElement('div'); acts.className = 'head-actions'; head.appendChild(acts); }
      const k = r.name === 'job' ? 'job' : 'contact';
      acts.insertAdjacentHTML('afterbegin', `<button class="btn" data-act="reportPdf" data-k="${k}" data-id="${e(r.name === 'job' ? r.a : r.b)}">${k === 'job' ? 'Job summary PDF' : 'Download PDF'}</button>`);
    },
    build: {}
  };
  A.reportPdf = el => {
    const k = el.dataset.k; const id = el.dataset.id;
    if (k === 'job') return R.build.job(id);
    if (k === 'contact') return R.build.contact(id);
    const p = Object.values(R.PAGES).find(x => x[1] === k) || [k, k];
    R.pick(p[0], range => { try { R.build[k](range); } catch (er) { console.error(er); App.toast('Couldn\'t make that PDF: ' + er.message, 'err', 6000); } }, p[2] || {});
  };

  /* ---------- the summaries ---------- */
  const real = () => st.live().filter(x => !x.practice && x.status !== 'cancelled');
  const who = x => x.client.company || x.client.name || '';
  R.build.tracker = r => {
    const list = real().filter(x => R.inRange(x.date || x.createdDate || App.iso(new Date(x.createdAt || Date.now())), r)).sort((a, b) => String(a.number).localeCompare(String(b.number)));
    const sum = l => l.reduce((t, x) => t + st.totals(x).sub, 0);
    const sent = list.filter(x => x.sentDate), won = list.filter(x => x.status === 'accepted'), lost = list.filter(x => x.status === 'rejected');
    const flow = [D().blk(R.stats([['Estimates', String(list.length), money(sum(list))], ['Sent', String(sent.length), money(sum(sent))], ['Won', String(won.length), money(sum(won))], ['Win rate', won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) + '%' : '-', `${lost.length} lost`]]))];
    flow.push(R.section('Estimates', R.table(['Number', 'Client', 'Job', 'Type', 'Status', 'Value'], list.map(x => [e(st.displayNumber(x)), e(who(x)), e(x.heading || ''), x.type === 'ft' ? 'F&amp;T' : 'General', e(App.statusLabel ? App.statusLabel(x.status) : x.status), money(st.totals(x).sub)]), [5])));
    R.show('Estimate tracker', R.spec('Estimate tracker summary', r.label, [], flow), `Estimate tracker ${r.label}`);
  };
  R.build.followups = () => {
    const w = real().filter(x => x.status === 'sent' && !x.archived); const due = App.Track ? App.Track.due() : [];
    const flow = [D().blk(R.stats([['Waiting on a reply', money(w.reduce((t, x) => t + st.totals(x).sub, 0)), `${w.length} estimates`], ['Follow-ups ready', String(due.length), ''], ['Opened', `${w.filter(x => x.openedAt).length} of ${w.length}`, '']]))];
    flow.push(R.section('Waiting on a reply', R.table(['Estimate', 'Client', 'Sent', 'Days waiting', 'Opened', 'Value'], w.map(x => [e(st.displayNumber(x)), e(who(x)), x.sentDate ? App.fmtShort(x.sentDate) : '', x.sentDate ? String(App.daysBetween(x.sentDate, App.today())) : '', x.openedAt ? 'Yes' : 'No', money(st.totals(x).sub)]), [3, 5])));
    if (due.length) flow.push(R.section('Ready to send', R.table(['Estimate', 'Client', 'Email'], due.map(d => [e(st.displayNumber(d.est)), e(who(d.est)), e(d.kind)]))));
    R.show('Follow-ups', R.spec('Follow-ups summary', 'Follow-ups', [], flow), `Follow-ups ${App.today()}`);
  };
  R.build.sales = r => {
    const SL = App.Sales; if (!SL || !SL.S.loadedAt) return App.toast('Open the Sales tab first so the contacts load', 'err');
    const sm = SL.summary(); const cs = SL.S.contacts.filter(c => !c.archived);
    const due = sm.overdue.concat(sm.today).concat(cs.filter(c => SL.fu(c).state === 'week'));
    const newR = cs.filter(c => R.inRange(c.createdAt, r));
    const flow = [D().blk(R.stats([['Contacts', String(cs.length), `${newR.length} new in ${r.label}`], ['Follow-ups due', String(sm.overdue.length + sm.today.length), `${sm.overdue.length} overdue`], ['Hot leads', String(sm.hot.length), ''], ['Quotes out', money(sm.quoteVal), `${sm.quotes.length} contacts`]]))];
    flow.push(R.section('Follow-ups due', R.table(['Company', 'Contact', 'Due', 'Type', 'By'], due.map(c => { const f = SL.fu(c); const p = SL.primary(c); return [e(c.company || p.name || ''), e(p.name || ''), e(f.label), e(f.kind), e(c.owner || '')]; }))));
    const stages = ['Lead', 'Quote sent', 'Won', 'Lost'];
    flow.push(R.section('Pipeline by stage', R.table(['Stage', 'Contacts', 'Value'], stages.map(s2 => { const l = cs.filter(c => (c.stage || 'Lead') === s2); return [s2, String(l.length), l.reduce((t, c) => t + App.num(c.quoteAmount), 0) ? money(l.reduce((t, c) => t + App.num(c.quoteAmount), 0)) : '-']; }), [1, 2])));
    if (newR.length) flow.push(R.section(`New contacts, ${r.label}`, R.table(['Company', 'Contact', 'Source', 'Interested in', 'By'], newR.map(c => [e(c.company || ''), e(SL.primary(c).name || ''), e(c.source || ''), e(Object.keys(c.products || {}).filter(k => c.products[k]).join(', ')), e(c.owner || '')]))));
    const sent = SL.sentList ? SL.sentList().filter(x => x.at && R.inRange(App.iso(new Date(x.at)), r)) : [];
    if (sent.length) flow.push(R.section(`Emails, ${r.label}`, R.table(['Sent', 'To', 'Email', 'Opened'], sent.map(x => [App.fmtShort(App.iso(new Date(x.at))), e(x.company || ''), e(x.subject || ''), !x.tracked ? 'Not tracked' : x.openedAt ? 'Yes' : 'No']))));
    R.show('Sales', R.spec('Sales summary', 'Sales', [['Period', r.label]], flow), `Sales ${r.label}`);
  };
  R.build.production = () => {
    const jobs = App.Jobs.list();
    const flow = [D().blk(R.stats(App.STAGES.slice(0, 6).map(s2 => [s2.label, String(jobs.filter(j => j.job.stage === s2.value).length), ''])))];
    flow.push(R.section('Jobs', R.table(['Job', 'Client', 'Stage', 'Manufacture', 'Next delivery', 'Value'], jobs.filter(j => j.job.stage !== 'complete').map(j => { const nd = App.Jobs.nextDelivery(j); return [e(st.displayNumber(j)), e(who(j)), e(App.stageLabel(j.job.stage)), j.job.manufactureDate ? App.fmtShort(j.job.manufactureDate) : '', nd ? `${nd.n} of ${j.job.loads.length}, ${App.fmtShort(nd.date)}` : '', money(st.totals(j).sub)]; }), [5])));
    const steel = App.Jobs.steelNeeded ? App.Jobs.steelNeeded() : [];
    if (steel.length) flow.push(R.section('Steel needed, next 2 weeks', R.table(['Section', 'Gauge', 'Metres', 'For'], steel.map(x => [e(x.size), e(x.gauge) + ' BMT', fmt(x.lm) + ' LM', e(x.jobs.join(', '))]), [2])));
    R.show('Production', R.spec('Production summary', 'Production', [['As at', App.fmtLong(App.today())]], flow), `Production ${App.today()}`);
  };
  R.build.detailing = r => {
    const DL = App.Detailing; const list = DL ? DL.list().filter(x => R.inRange(App.iso(new Date(x.createdAt)), r)) : [];
    const flow = [R.section('Detailing', R.table(['Description', 'Job', 'Files', 'Uploaded'], list.map(x => { const est = DL.est(x); return [e(x.desc), est ? e(st.displayNumber(est) + ' ' + who(est)) : 'Not linked', e(x.files.map(f => f.label).join(', ')), App.fmtShort(App.iso(new Date(x.createdAt)))]; })))];
    R.show('Detailing', R.spec('Detailing summary', 'Detailing', [['Period', r.label]], flow), `Detailing ${r.label}`);
  };
  R.build.calendar = r => {
    const ev = (App.Jobs.events ? App.Jobs.events() : []).filter(x => R.inRange(x.date, r)).sort((a, b) => a.date.localeCompare(b.date));
    const flow = [R.section('What\'s on', R.table(['Date', 'What', 'Details'], ev.map(x => [App.fmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'short' }), e(x.text), e(x.title || '')])))];
    R.show('Calendar', R.spec('Calendar', r.label, [], flow), `Calendar ${r.label}`);
  };
  R.build.coils = r => {
    const C = App.Coil; if (!C || !C.S.loadedAt) return App.toast('Open the Coils tab first so the coils load', 'err');
    const sm = C.summary(); const used = C.S.coils.filter(c => c.status === 'Used' && c.scannedOutAt && R.inRange(c.scannedOutAt, r));
    const flow = [D().blk(R.stats([['In stock', `${sm.ins.length} coils`, C.kg(sm.ins.reduce((t, c) => t + c.weight, 0))], [`Used, ${r.label}`, `${used.length} coils`, C.kg(used.reduce((t, c) => t + c.weight, 0))], ['Waiting for labels', String(sm.unlabelled.length), '']]))];
    flow.push(R.section('In stock by size', R.table(['Size', 'Coils', 'Weight'], Object.values(sm.ins.reduce((o, c) => { const k = `${c.width} × ${C.bmt(c.thickness)}`; o[k] = o[k] || [k, 0, 0]; o[k][1]++; o[k][2] += c.weight; return o; }, {})).map(([k, n, w]) => [k, String(n), C.kg(w)]), [1, 2])));
    flow.push(R.section(`Used, ${r.label}`, R.table(['Coil', 'Size', 'Scanned out', 'Jobs', 'Weight'], used.map(c => [e(c.coilId), `${c.width} × ${C.bmt(c.thickness)}`, App.fmtShort(App.iso(new Date(c.scannedOutAt))), e((c.jobs || []).join(', ')), C.kg(c.weight)]), [4])));
    R.show('Coils', R.spec('Coils summary', 'Coils', [['Period', r.label]], flow), `Coils ${r.label}`);
  };
  R.build.fasteners = r => {
    const F = App.Fast; if (!F || !F.S.loadedAt) return App.toast('Open the Fasteners tab first so the stock loads', 'err');
    const low = F.low(); const used = {}; F.S.log.filter(l => l.action === 'Sign out' && R.inRange(l.time, r)).forEach(l => used[l.item] = (used[l.item] || 0) + l.qty);
    const flow = [D().blk(R.stats([['Items', String(F.S.items.length), ''], ['Below minimum', String(low.length), ''], [`Signed out, ${r.label}`, String(Object.values(used).reduce((a, b) => a + b, 0)), 'items']]))];
    if (low.length) flow.push(R.section('Reorder these', R.table(['Item', 'In stock', 'Minimum'], low.map(i => [e(i.name), String(i.qty), String(i.min)]), [1, 2])));
    flow.push(R.section('Stock', R.table(['Item', 'In stock', 'Minimum', `Used, ${r.label}`], F.S.items.map(i => [e(i.name), String(i.qty), String(i.min), String(used[i.name] || 0)]), [1, 2, 3])));
    R.show('Fasteners', R.spec('Fasteners summary', 'Fasteners', [['Period', r.label]], flow), `Fasteners ${r.label}`);
  };
  R.build.pricing = () => {
    const list = App.Pricing ? Object.values(App.Pricing.list()) : [];
    const flow = [R.section('Price per lineal metre', R.table(['Section', 'Gauge', 'Machine', 'Cost / LM', 'Sell / LM', 'Profit / LM'], list.map(p => { const [s2, g] = p.key.split('|'); return [e(s2), g + ' BMT', e(p.machine), money(p.cost, 2), money(p.sell, 2), money(p.profit, 2)]; }), [3, 4, 5]))];
    flow.push(R.section('Machines', R.table(['Machine', 'Coil width', 'Steel $/t', 'Overheads', 'Output', 'Margin'], (S().machines || []).map(m => [e(m.name), m.coilWidth + ' mm', money(m.pricePerTonne), `${money(m.overhead)} / ${m.period || 'week'}`, `${fmt(m.output)} LM / ${m.period || 'week'}`, `${m.marginPct}% ${m.marginType === 'markup' ? 'markup' : 'margin'}`]))));
    R.show('Pricing', R.spec('Pricing', 'Price list', [], flow), `Pricing ${App.today()}`);
  };
  R.build.dashboard = r => {
    const list = real(); const inR = x => R.inRange(x.sentDate, r); const sum = l => l.reduce((t, x) => t + st.totals(x).sub, 0);
    const sent = list.filter(inR), won = list.filter(x => R.inRange(x.acceptedAt, r)), lost = list.filter(x => x.status === 'rejected' && inR(x));
    const byClient = {}; won.forEach(x => byClient[who(x)] = (byClient[who(x)] || 0) + st.totals(x).sub);
    const bySrc = {}; sent.forEach(x => { const k = x.leadSource || 'Not recorded'; bySrc[k] = bySrc[k] || [0, 0]; bySrc[k][0]++; if (x.status === 'accepted') bySrc[k][1]++; });
    const margins = won.map(x => App.Pricing ? App.Pricing.profit(x).margin : 0).filter(m => m);
    const flow = [D().blk(R.stats([['Quoted', money(sum(sent)), `${sent.length} estimates`], ['Won', money(sum(won)), `${won.length} jobs`], ['Win rate', won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) + '%' : '-', ''], ['Average margin', margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length * 100) + '%' : '-', 'on jobs won']]))];
    flow.push(R.section('Top clients', R.table(['Client', 'Won'], Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, v]) => [e(c), money(v)]), [1])));
    flow.push(R.section('Where the work came from', R.table(['Source', 'Estimates', 'Won'], Object.entries(bySrc).sort((a, b) => b[1][0] - a[1][0]).map(([k, v]) => [e(k), String(v[0]), String(v[1])]), [1, 2])));
    R.show('Dashboard', R.spec('Monthly report', r.label, [], flow), `Report ${r.label}`);
  };
  R.build.job = id => {
    const est = st.get(id); if (!est || !est.job) return;
    const t = st.totals(est); const j = est.job; const pf = App.Pricing ? App.Pricing.profit(est) : null;
    const flow = [D().blk(R.stats([['Job value', money(t.sub), est.type === 'ft' ? 'Frame and truss' : 'General'], ['Stage', App.stageLabel(j.stage), ''], ['Deposit', j.deposit.notRequired ? 'Not required' : j.deposit.received ? 'Paid' : 'Not paid', est.clientPo ? 'PO ' + est.clientPo : ''], ['Margin', pf ? Math.round(pf.margin * 100) + '%' : '-', pf ? money(pf.profit) + ' profit' : '']]))];
    flow.push(R.section('Client and site', R.table(['Client', 'Contact', 'Site'], [[e(est.client.company || est.client.name), e([est.client.name, est.client.phone, est.client.email].filter(Boolean).join(', ')), e(est.siteAddress || '')]])));
    if ((j.loads || []).length) flow.push(R.section('Deliveries', R.table(['Load', 'Date', 'Status'], j.loads.map(l => [`${l.n} of ${j.loads.length}`, l.date ? App.fmtShort(l.date) : 'Not booked', l.delivered ? 'Delivered' : 'To come']))));
    if (App.Coil && App.Coil.S.loadedAt) { const cs = App.Coil.forJob(est.number); if (cs.length) flow.push(R.section('Coils used', R.table(['Coil', 'Size', 'Weight'], cs.map(c => [e(c.coilId), `${c.width} × ${App.Coil.bmt(c.thickness)}`, App.Coil.kg(c.weight)])))); }
    flow.push(R.section('History', R.table(['When', 'What'], (est.activity || []).slice(-25).reverse().map(a => [App.fmtStamp(a.at), e(a.text)]))));
    R.show(`${st.displayNumber(est)} job summary`, R.spec('Job summary', st.displayNumber(est), [['Client', who(est)]], flow));
  };
  R.build.contact = id => {
    const SL = App.Sales; const c = SL && SL.get(id); if (!c) return;
    const p = SL.primary(c); const acts = SL.S.activity.filter(a => a.contactId === c.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const flow = [D().blk(R.stats([['Status', c.status || '-', c.temperature || ''], ['Stage', c.stage || 'Lead', c.quoteAmount ? money(App.num(c.quoteAmount)) : ''], ['Next follow-up', SL.fu(c).label, SL.fu(c).kind], ['Contacted by', c.owner || '-', '']]))];
    flow.push(R.section('People', R.table(['Name', 'Role', 'Phone', 'Email'], (c.people || []).map(x => [e(x.name || ''), e(x.role || ''), e(x.phone || ''), e(x.email || '')]))));
    if (c.notes) flow.push(R.note(e(c.notes)));
    flow.push(R.section('Activity', R.table(['When', 'Type', 'Outcome', 'Note', 'By'], acts.map(a => [App.fmtStamp(a.at), e(a.type), e(a.outcome || ''), e(a.note || ''), e(a.user || '')]))));
    R.show(c.company || p.name, R.spec('Sales contact', c.company || p.name || 'Contact', [['Region', c.region || '']], flow));
  };
})();
