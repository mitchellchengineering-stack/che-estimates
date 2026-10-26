/* Tracker, follow-ups, dashboard, map */
(() => {
  const e = App.esc, S = () => App.store.s(), st = App.store, A = App.actions;

  App.Track = {
    sentDate(est) { return est.sentDate || (est.sentAt ? App.iso(new Date(est.sentAt)) : null); },
    fu(est) {
      const sd = this.sentDate(est); const f = est.followups || {};
      if (!sd) return null;
      return { fu1: f.fu1, fu2: f.fu2, fu1Due: App.addDays(sd, 7), fu2Due: App.addDays(sd, 14), paused: f.paused, expiry: f.expiry };
    },
    fuText(est) {
      const f = this.fu(est); if (!f) return '';
      const one = (k, label, due) => { const x = f[k]; if (x && x.status) return `${label} ${x.status === 'sent' ? 'sent' : x.status === 'queued' ? 'waiting for approval' : x.status === 'replied' ? 'not needed (client replied)' : 'skipped'}${x.at ? ' ' + App.fmtShort(App.iso(new Date(x.at))) : ''}`; return est.status === 'sent' && !f.paused ? `${label} due ${App.fmtShort(due)}` : ''; };
      return [one('fu1', 'FU1', f.fu1Due), one('fu2', 'FU2', f.fu2Due)].filter(Boolean).join(', ') + (f.paused ? ' (paused)' : '');
    },
    /* Follow-ups the current user should look at now */
    due() {
      const me = st.me().email; const today = App.today(); const out = [];
      st.live().filter(x => x.status === 'sent' && !x.practice && !x.archived && (st.mode === 'local' || x.sentBy === me)).forEach(est => {
        const f = this.fu(est); if (!f || f.paused) return;
        const done = k => f[k] && f[k].status && f[k].status !== 'queued';
        if (!done('fu1') && today >= f.fu1Due) out.push({ est, kind: 'fu1', queued: f.fu1 && f.fu1.status === 'queued', due: f.fu1Due });
        else if (done('fu1') && !done('fu2') && today >= f.fu2Due) out.push({ est, kind: 'fu2', queued: f.fu2 && f.fu2.status === 'queued', due: f.fu2Due });
        if (!f.expiry && est.expiry && App.daysBetween(today, est.expiry) <= 3 && App.daysBetween(today, est.expiry) >= 0) out.push({ est, kind: 'expiry', due: est.expiry });
      });
      st.live().filter(x => x.job && x.job.stage === 'complete' && !x.job.reviewDone && !x.practice && (st.mode === 'local' || x.createdBy === me)).forEach(est => {
        const doneAt = (x => x && x.at)(est.job.stageLog.slice().reverse().find(l => l.stage === 'complete'));
        if (doneAt && App.daysBetween(App.iso(new Date(doneAt)), today) >= (S().production.reviewDelayDays || 10)) out.push({ est, kind: 'review', due: App.addDays(App.iso(new Date(doneAt)), S().production.reviewDelayDays || 10) });
      });
      return out;
    },
    estValue(x) { return st.totals(x).sub; },
    years() { const ys = new Set(st.live().filter(x => !x.practice).map(x => x.yy)); ys.add(st.yy()); return [...ys].sort().reverse(); }
  };
  const KIND_LABEL = { fu1: 'First follow-up', fu2: 'Second follow-up', expiry: 'Expiry reminder', review: 'Review request' };

  /* ---------- Tracker ---------- */
  App.views.tracker = () => {
    const q = App.state.trk = App.state.trk || { year: st.yy(), search: '', status: '', type: '', who: '', archived: false, practice: false };
    let rows = st.live().filter(x => !x.parentId || true);
    if (!q.search) rows = rows.filter(x => q.year === 'all' || x.yy === q.year || (x.practice && q.practice));
    if (!q.archived) rows = rows.filter(x => !x.archived);
    if (!q.practice) rows = rows.filter(x => !x.practice);
    if (q.status) rows = rows.filter(x => x.status === q.status);
    if (q.type) rows = rows.filter(x => x.type === q.type);
    if (q.who) rows = rows.filter(x => x.createdBy === q.who);
    if (q.search) { const s = q.search.toLowerCase(); rows = rows.filter(x => [x.number, x.client.name, x.client.company, x.client.email, x.heading, x.siteAddress].join(' ').toLowerCase().includes(s)); }
    rows.sort((a, b) => (b.number > a.number ? 1 : -1) || b.createdAt - a.createdAt);
    const real = rows.filter(x => !x.practice);
    const quoted = real.filter(x => x.status !== 'draft' && x.status !== 'cancelled');
    const won = real.filter(x => x.status === 'accepted');
    const decided = real.filter(x => ['accepted', 'rejected', 'expired'].includes(x.status));
    const sum = a => a.reduce((t, x) => t + App.Track.estValue(x), 0);
    const users = S().users;
    return `<div class="page-head"><div><h1>Estimate tracker</h1><p class="sub">Every estimate, who it was for, and where it's at.</p></div>
      <div class="head-actions"><button class="btn" data-act="exportCsv">Export to Excel (CSV)</button><a class="btn primary" href="#/">Create estimate</a></div></div>
    <div class="year-tabs">${App.Track.years().map(y => `<button class="${q.year === y ? 'on' : ''}" data-act="trkYear" data-y="${y}">20${y}</button>`).join('')}<button class="${q.year === 'all' ? 'on' : ''}" data-act="trkYear" data-y="all">All years</button></div>
    <div class="stat-strip">
      <div><span>Estimates sent</span><b>${quoted.length}</b></div>
      <div><span>Value quoted</span><b>${App.money(sum(quoted), 0)}</b></div>
      <div><span>Accepted</span><b>${App.money(sum(won), 0)}</b></div>
      <div><span>Win rate</span><b>${decided.length ? App.pct(won.length / decided.length) : '-'}</b></div>
    </div>
    <div class="filters">
      <input type="search" id="trk-search" placeholder="Search by number, client, email or address" value="${e(q.search)}" data-act-input="trkSearch">
      <select data-act-change="trkFilter" data-k="status"><option value="">Any status</option>${App.opts(App.STATUSES, q.status)}</select>
      <select data-act-change="trkFilter" data-k="type"><option value="">Both types</option>${App.opts([{ value: 'general', label: 'General' }, { value: 'ft', label: 'Full F&T' }], q.type)}</select>
      <select data-act-change="trkFilter" data-k="who"><option value="">Everyone</option>${users.map(u => App.opt(u.email, u.name, q.who)).join('')}</select>
      <label class="check small"><input type="checkbox" data-act-change="trkToggle" data-k="archived" ${q.archived ? 'checked' : ''}> Archived</label>
      <label class="check small"><input type="checkbox" data-act-change="trkToggle" data-k="practice" ${q.practice ? 'checked' : ''}> Practice</label>
    </div>
    ${rows.length ? `<div class="table-wrap"><table class="tracker">
      <thead><tr><th>Estimate</th><th>Client</th><th>Email</th><th>Description</th><th class="r">Price (excl GST)</th><th>Status</th><th>Follow-ups</th><th></th></tr></thead>
      <tbody>${rows.map(x => `<tr class="${x.archived ? 'muted' : ''}">
        <td><b>${e(st.displayNumber(x))}</b><div class="tags"><span class="tag">${x.type === 'ft' ? 'F&amp;T' : 'General'}</span>${x.practice ? '<span class="tag practice">Practice</span>' : ''}${App.Est.ratesChanged(x) ? '<span class="tag warn" title="Rates changed since this was priced">Rates changed</span>' : ''}${x.openedAt ? '<span class="tag ok" title="Email opened">Opened</span>' : ''}</div></td>
        <td>${e(x.client.company || x.client.name) || '<i class="hint">No client yet</i>'}${x.client.company && x.client.name ? `<div class="hint">${e(x.client.name)}</div>` : ''}</td>
        <td>${x.client.email ? `<a href="mailto:${e(x.client.email)}">${e(x.client.email)}</a>` : ''}</td>
        <td>${e(x.heading)}<div class="hint">${e(x.siteAddress)}</div></td>
        <td class="r">${App.money(App.Track.estValue(x))}</td>
        <td><select class="status-sel ${x.status}" data-act-change="trkStatus" data-id="${x.id}">${App.opts(App.STATUSES, x.status)}</select>${x.lostReason && x.status === 'rejected' ? `<div class="hint">${e(x.lostReason)}</div>` : ''}${x.job ? `<div class="hint">${e(App.stageLabel(x.job.stage))}</div>` : ''}</td>
        <td class="small">${App.Track.fuText(x)}</td>
        <td><a class="btn small" href="#/${x.job ? 'job' : 'e'}/${x.id}">Open ${x.job ? 'job' : 'estimate'}</a></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><h2>${q.search ? 'Nothing matches that search' : 'No estimates here yet'}</h2><p>${q.search ? 'Try a different number or name, or switch to All years.' : 'Create your first estimate from the home screen.'}</p></div>`}`;
  };
  A.trkYear = el => { App.state.trk.year = el.dataset.y; App.refresh(); };
  A.trkSearch = App.debounce(el => { App.state.trk.search = el.value; App.refresh(); const i = document.getElementById('trk-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250);
  A.trkFilter = el => { App.state.trk[el.dataset.k] = el.value; App.refresh(); };
  A.trkToggle = el => { App.state.trk[el.dataset.k] = el.checked; App.refresh(); };
  A.trkStatus = async el => {
    const est = st.get(el.dataset.id); const v = el.value; App.cur = est;
    if (v === 'accepted') { el.value = est.status; return A.estAccept(); }
    if (v === 'rejected') { el.value = est.status; return A.estReject(); }
    if (v === 'sent' && est.status === 'draft') { est.status = 'sent'; est.sentAt = Date.now(); est.sentDate = App.today(); est.sentBy = st.me().email; }
    else est.status = v;
    st.log(est, `Status changed to ${v}`); st.touch(est); st.save(); App.refresh();
  };
  A.exportCsv = () => {
    const rows = [['Estimate', 'Type', 'Date', 'Expiry', 'Client', 'Company', 'Email', 'Phone', 'Heading', 'Site address', 'Price excl GST', 'Status', 'Lost reason', 'Lead source', 'Prepared by', 'Production stage']];
    st.live().filter(x => !x.practice).forEach(x => rows.push([st.displayNumber(x), x.type === 'ft' ? 'Full F&T' : 'General', x.date, x.expiry, x.client.name, x.client.company, x.client.email, x.client.phone, x.heading, x.siteAddress, App.round(App.Track.estValue(x), 2), x.status, x.lostReason || '', x.leadSource || '', x.preparedBy, x.job ? App.stageLabel(x.job.stage) : '']));
    App.download(`CH Engineering estimates ${App.today()}.csv`, rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n'), 'text/csv');
  };

  /* ---------- Follow-ups ---------- */
  App.views.followups = () => {
    const due = App.Track.due(); const me = st.me();
    const history = st.live().filter(x => x.followups && ['fu1', 'fu2', 'expiry'].some(k => x.followups[k] && x.followups[k].status === 'sent')).sort((a, b) => b.updatedAt - a.updatedAt);
    const meUser = S().users.find(u => u.email === me.email);
    return `<div class="page-head"><div><h1>Follow-ups</h1><p class="sub">Follow-ups go out one and two weeks after an estimate is sent, from whoever sent it. After the second one, the estimate is left alone.</p></div></div>
    ${meUser ? `<section class="card"><h3>My follow-up setting</h3>
      <div class="seg wide">${[['auto', 'Send them automatically, then tell me'], ['ask', 'Ask me before sending']].map(([v, l]) => `<label><input type="radio" name="fumode" value="${v}" data-act-change="fuMode" ${meUser.followupMode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <p class="hint">Automatic sending is done each morning by the Google helper script (see the setup guide). Anything due shows below too, so you can send it early.</p></section>` : ''}
    <section class="card"><h3>Ready to go</h3>
      ${due.length ? `<table class="wtable"><thead><tr><th>Estimate</th><th>Client</th><th>What</th><th>Due</th><th></th></tr></thead><tbody>
      ${due.map((d, i) => `<tr><td><a href="#/e/${d.est.id}">${e(st.displayNumber(d.est))}</a></td><td>${e(d.est.client.company || d.est.client.name)}</td><td>${KIND_LABEL[d.kind]}${d.queued ? ' <span class="tag">Waiting for approval</span>' : ''}</td><td>${App.fmtShort(d.due)}</td>
        <td class="row-btns"><button class="btn small primary" data-act="fuSend" data-id="${d.est.id}" data-k="${d.kind}">Review and send</button><button class="btn small ghost" data-act="fuSkip" data-id="${d.est.id}" data-k="${d.kind}">Skip</button></td></tr>`).join('')}</tbody></table>`
        : '<p class="hint">Nothing waiting right now.</p>'}
    </section>
    <section class="card"><h3>Estimates that have had a follow-up</h3>
      ${history.length ? `<table class="wtable"><thead><tr><th>Estimate</th><th>Client</th><th>Follow-ups</th><th>Status</th></tr></thead><tbody>
      ${history.map(x => `<tr><td><a href="#/e/${x.id}">${e(st.displayNumber(x))}</a></td><td>${e(x.client.company || x.client.name)}</td><td>${App.Track.fuText(x)}${x.followups.expiry && x.followups.expiry.status === 'sent' ? ', expiry reminder sent' : ''}</td><td><span class="pill ${x.status}">${x.status}</span></td></tr>`).join('')}</tbody></table>` : '<p class="hint">None yet.</p>'}
    </section>`;
  };
  A.fuMode = el => { const u = S().users.find(x => x.email === st.me().email); if (u) { u.followupMode = el.value; S().updatedAt = Date.now(); st.save(); App.toast('Saved'); } };
  A.fuSend = el => {
    const est = st.get(el.dataset.id); const k = el.dataset.k;
    const t = App.mail.tpl(k, est);
    App.mail.compose({ title: `${KIND_LABEL[k]}: ${st.displayNumber(est)}`, est, kind: k, to: est.client.email, subject: t.subject, body: t.body,
      onSent: () => {
        if (k === 'review') est.job.reviewDone = { status: 'sent', at: Date.now() };
        else { est.followups = est.followups || {}; est.followups[k] = { status: 'sent', at: Date.now(), by: st.me().email, source: 'app' }; }
        st.log(est, `${KIND_LABEL[k]} sent`); st.touch(est); st.save(); App.refresh();
      } });
  };
  A.fuSkip = el => {
    const est = st.get(el.dataset.id); const k = el.dataset.k;
    if (k === 'review') est.job.reviewDone = { status: 'skipped', at: Date.now() };
    else { est.followups = est.followups || {}; est.followups[k] = { status: 'skipped', at: Date.now(), by: st.me().email }; }
    st.log(est, `${KIND_LABEL[k]} skipped`); st.touch(est); st.save(); App.refresh();
  };

  /* ---------- Dashboard ---------- */
  App.views.dashboard = () => {
    const y = App.state.dashYear = App.state.dashYear || st.yy();
    const all = st.live().filter(x => !x.practice && x.yy === y && x.status !== 'cancelled');
    const sent = all.filter(x => x.status !== 'draft'); const won = all.filter(x => x.status === 'accepted');
    const decided = all.filter(x => ['accepted', 'rejected', 'expired'].includes(x.status));
    const sum = a => a.reduce((t, x) => t + App.Track.estValue(x), 0);
    const months = Array.from({ length: 12 }, (_, i) => i);
    const byMonth = months.map(m => { const pre = `20${y}-${String(m + 1).padStart(2, '0')}`; return { m, q: sum(sent.filter(x => x.date.startsWith(pre))), w: sum(won.filter(x => (x.acceptedAt || x.date).startsWith(pre))) }; });
    const max = Math.max(1, ...byMonth.map(b => b.q));
    const target = App.num(S().production.monthlyTarget); const thisMonth = App.today().slice(0, 7);
    const monthWon = sum(st.live().filter(x => !x.practice && x.status === 'accepted' && (x.acceptedAt || '').startsWith(thisMonth)));
    const count = (arr, f) => { const o = {}; arr.forEach(x => { const k = f(x) || 'Not recorded'; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const costed = st.live().filter(x => x.job && x.job.backcost && x.job.backcost.done);
    const bars = (pairs) => { const mx = Math.max(1, ...pairs.map(p => p[1])); return pairs.map(([k, v]) => `<div class="hbar"><span>${e(k)}</span><div><i style="width:${(v / mx) * 100}%"></i></div><b>${v}</b></div>`).join('') || '<p class="hint">No data yet.</p>'; };
    return `<div class="page-head"><div><h1>Dashboard</h1><p class="sub">How estimating is tracking for 20${y}.</p></div>
      <div class="head-actions"><select data-act-change="dashYear">${App.Track.years().map(v => App.opt(v, '20' + v, y)).join('')}</select></div></div>
    <div class="stat-strip">
      <div><span>Estimates sent</span><b>${sent.length}</b></div><div><span>Value quoted</span><b>${App.money(sum(sent), 0)}</b></div>
      <div><span>Accepted</span><b>${App.money(sum(won), 0)}</b></div><div><span>Win rate</span><b>${decided.length ? App.pct(won.length / decided.length) : '-'}</b></div>
    </div>
    ${target ? `<section class="card"><h3>This month's target</h3><div class="target-bar"><i style="width:${Math.min(100, monthWon / target * 100)}%"></i></div><p><b>${App.money(monthWon, 0)}</b> accepted of ${App.money(target, 0)}</p></section>` : `<p class="hint">Set a monthly sales target in Settings to see a progress bar here.</p>`}
    <section class="card"><h3>Quoted and accepted by month</h3>
      <div class="months">${byMonth.map(b => `<div class="mcol" title="Quoted ${App.money(b.q, 0)}, accepted ${App.money(b.w, 0)}"><div class="mbars"><i class="q" style="height:${b.q / max * 100}%"></i><i class="w" style="height:${b.w / max * 100}%"></i></div><span>${new Date(2000, b.m, 1).toLocaleString('en-NZ', { month: 'short' })}</span></div>`).join('')}</div>
      <p class="legend"><i class="q"></i> Quoted <i class="w"></i> Accepted</p></section>
    <div class="grid2">
      <section class="card"><h3>General vs Full F&amp;T</h3>${bars([['General', all.filter(x => x.type !== 'ft').length], ['Full F&T', all.filter(x => x.type === 'ft').length]])}</section>
      <section class="card"><h3>Who's quoting</h3>${bars(count(sent, x => (S().users.find(u => u.email === x.createdBy) || {}).name))}</section>
      <section class="card"><h3>Why we missed out</h3>${bars(count(all.filter(x => x.status === 'rejected'), x => x.lostReason))}</section>
      <section class="card"><h3>Where the work comes from</h3>${bars(count(sent, x => x.leadSource))}</section>
    </div>
    <section class="card"><h3>Back-costed jobs</h3>${costed.length ? `<table class="wtable"><thead><tr><th>Job</th><th>Client</th><th class="r">Sold for</th><th class="r">Actual cost</th><th class="r">Profit</th><th class="r">Margin</th></tr></thead><tbody>
      ${costed.map(x => { const b = App.Jobs.backTotals(x); return `<tr><td><a href="#/job/${x.id}/backcost">${e(st.displayNumber(x))}</a></td><td>${e(x.client.company || x.client.name)}</td><td class="r">${App.money(b.sold)}</td><td class="r">${App.money(b.actual)}</td><td class="r ${b.profit < 0 ? 'neg' : ''}">${App.money(b.profit)}</td><td class="r">${App.pct(b.margin)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="hint">Finish back-costing a job to see what you really made.</p>'}</section>`;
  };
  A.dashYear = el => { App.state.dashYear = el.value; App.refresh(); };

  /* ---------- Map ---------- */
  App.views.map = () => `<div class="page-head"><div><h1>Map of jobs</h1><p class="sub">Every estimate with a site address, coloured by status.</p></div></div>
    <div class="legend map-legend">${['sent', 'accepted', 'rejected', 'expired', 'draft'].map(s => `<span><i class="dot ${s}"></i>${s[0].toUpperCase() + s.slice(1)}</span>`).join('')}</div>
    <div id="map" class="map"></div><p class="hint" id="map-status"></p>`;
  App.views.map.mount = async () => {
    App.loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
    await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
    const map = L.map('map').setView([-37.787, 175.279], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const colours = { draft: '#8b9399', sent: '#2f6fb0', accepted: '#2e8540', rejected: '#c0392b', expired: '#b7791f', cancelled: '#8b9399' };
    const ests = st.live().filter(x => x.siteAddress && !x.practice && !x.archived);
    const add = x => L.circleMarker([x.geo.lat, x.geo.lon], { radius: 8, color: '#fff', weight: 2, fillColor: colours[x.status], fillOpacity: 0.95 }).addTo(map)
      .bindPopup(`<b>${e(st.displayNumber(x))}</b><br>${e(x.client.company || x.client.name)}<br>${e(x.heading)}<br>${App.money(App.Track.estValue(x))}<br><a href="#/${x.job ? 'job' : 'e'}/${x.id}">Open</a>`);
    ests.filter(x => x.geo && x.geo.lat && x.geo.q === x.siteAddress).forEach(add);
    const todo = ests.filter(x => !x.geo || x.geo.q !== x.siteAddress);
    const status = document.getElementById('map-status');
    for (let i = 0; i < todo.length; i++) {
      const x = todo[i]; if (!document.getElementById('map')) return;
      if (status) status.textContent = `Finding addresses: ${i + 1} of ${todo.length}`;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nz&q=${encodeURIComponent(x.siteAddress)}`).then(r => r.json());
        if (r[0]) { x.geo = { lat: +r[0].lat, lon: +r[0].lon, q: x.siteAddress }; add(x); st.save(); }
        else x.geo = { q: x.siteAddress, none: true };
      } catch (er) {}
      await new Promise(r => setTimeout(r, 1100));
    }
    if (status) status.textContent = '';
  };
})();
