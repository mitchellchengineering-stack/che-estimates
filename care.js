/* Looking after the app: a Back button, a "new version" banner, restoring from a backup,
   archiving finished years, and "Report a problem". */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const K = App.Care = {};

  /* ---------- Dismiss: an x on suggestions and warnings, remembered for each person ---------- */
  const mine = () => { const d = S().dismissed = S().dismissed || {}; const k = (st.me().email || 'me').toLowerCase(); return (d[k] = d[k] || {}); };
  App.Dismiss = {
    is: key => !!(st.data && mine()[key]),
    x: (keys, label = 'Dismiss') => `<button class="dismiss-x" data-act="dismiss" data-k="${App.esc([].concat(keys).join('|'))}" aria-label="${App.esc(label)}" title="${App.esc(label)}">✕</button>`
  };
  A.dismiss = el => { el.dataset.k.split('|').forEach(k => { if (k) mine()[k] = Date.now(); }); S().updatedAt = Date.now(); st.touch(S()); st.save(); App.refresh(); };

  /* ---------- Back button ---------- */
  K.steps = 0;
  window.addEventListener('hashchange', () => { if (K.goingBack) { K.goingBack = false; K.steps = Math.max(0, K.steps - 1); } else K.steps++; });
  /* where Back goes when there's no history yet (e.g. you opened a link straight to a job) */
  K.parent = () => {
    const h = location.hash.replace(/^#\/?/, ''); const p = h.split('/');
    const map = { e: 'tracker', job: 'production', new: 'tracker' };
    if (p[0] === 'battens' && p[1]) return p[1] === 'e' ? 'battens/estimates' : p[1] === 'job' ? 'battens/jobs' : p[1] === 'mf' ? 'battens/machine' : p[1] === 'client' ? 'battens/clients' : 'battens';
    if (p[0] === 'sales' && p[1] === 'c') return 'sales';
    if (p.length > 1 && ['clients', 'detailing', 'safety', 'maintenance', 'settings'].includes(p[0])) return p[0];
    if (map[p[0]]) return map[p[0]];
    return '';
  };
  K.canBack = () => !!location.hash.replace(/^#\/?/, '');
  A.goBack = () => {
    if (K.steps > 0) { K.goingBack = true; history.back(); return; }
    location.hash = '#/' + K.parent();
  };

  /* ---------- "A new version is ready" ---------- */
  K.version = window.APP_VERSION || '';
  K.checkVersion = async () => {
    if (!K.version || K.newVersion) return;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = String((await r.json()).version || '');
      if (v && v !== K.version) { K.newVersion = v; K.banner(); }
    } catch (er) { /* offline */ }
  };
  K.banner = () => {
    if (document.getElementById('ver-banner')) return;
    const d = document.createElement('div'); d.id = 'ver-banner'; d.setAttribute('role', 'status');
    d.innerHTML = `<span><b>A new version of the app is ready.</b> Refresh to get it (anything you've typed is already saved).</span><button class="btn small primary" data-act="verRefresh">Refresh</button>`;
    document.body.appendChild(d);
  };
  /* loading with ?v= makes the browser fetch the new files, instead of using old ones it kept */
  A.verRefresh = () => { const v = K.newVersion || Date.now(); location.replace(`${location.pathname}?v=${encodeURIComponent(v)}${location.hash}`); };
  setTimeout(K.checkVersion, 15000); setInterval(K.checkVersion, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) K.checkVersion(); });

  /* ---------- Report a problem ---------- */
  K.errors = [];
  const keep = (msg, extra) => { K.errors.push({ at: new Date().toISOString(), page: location.hash, msg: String(msg).slice(0, 500), extra: extra ? String(extra).slice(0, 1500) : '' }); if (K.errors.length > 30) K.errors.shift(); };
  window.addEventListener('error', ev => keep(ev.message, ev.error && ev.error.stack));
  window.addEventListener('unhandledrejection', ev => keep(ev.reason && ev.reason.message || ev.reason, ev.reason && ev.reason.stack));
  const origToast = App.toast; App.toast = (msg, kind, ms) => { if (kind === 'err') keep('Message shown: ' + msg); return origToast(msg, kind, ms); };
  A.reportProblem = () => {
    const m = App.modal('Report a problem', `<p>Tell us what you were doing and what went wrong. The app adds the technical details for you.</p>
      ${App.field('What happened?', '<textarea id="rp-what" rows="5" placeholder="e.g. I clicked Download PDF on the Sales page and nothing happened"></textarea>')}
      <p class="hint">${K.errors.length ? `${K.errors.length} recent error${K.errors.length === 1 ? '' : 's'} will be included.` : 'No errors recorded this session.'} Saved in Google Drive in Problem reports.</p>`,
      { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="rp-send">Save the report</button>' });
    m.querySelector('#rp-send').onclick = async ev => {
      ev.target.disabled = true;
      const rep = { when: new Date().toISOString(), who: st.me().name + ' <' + st.me().email + '>', version: K.version, page: location.hash, what: m.querySelector('#rp-what').value.trim(), browser: navigator.userAgent, screen: `${innerWidth}x${innerHeight}`, mode: st.mode, errors: K.errors };
      const name = `Problem ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')} ${st.me().name || ''}.json`;
      try {
        if (st.mode !== 'drive') throw new Error('not connected');
        const fo = await App.G.folder('Problem reports', st.rootId);
        await App.G.upload({ name, parent: fo, blob: new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' }), mime: 'application/json' });
        App.closeModal(); App.toast('Saved in Google Drive, Problem reports. Send it to whoever looks after the app.');
      } catch (er) { App.download(name, new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' })); App.closeModal(); App.toast('Downloaded the report. Send it to whoever looks after the app.'); }
    };
  };

  /* ---------- Restore from a backup ---------- */
  K.restoreCard = () => `<section class="card"><h3>Restore from a backup</h3><p class="hint">If something gets messed up, put the app back to how it was on a backup day. A copy of how things are right now is saved first, so you can undo a restore.</p><button class="btn" data-act="restoreOpen" ${st.mode === 'drive' ? '' : 'disabled'}>Choose a backup</button></section>`;
  A.restoreOpen = async () => {
    try {
      const folder = await App.G.folder('Backups', st.rootId);
      const q = `'${folder}' in parents and trashed = false and name contains 'che-app-data' and mimeType = 'application/json'`;
      const r = await App.G.api(`${App.G.D}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime,size)&orderBy=createdTime desc&pageSize=60&supportsAllDrives=true&includeItemsFromAllDrives=true`);
      const files = r.files || [];
      const m = App.modal('Restore from a backup', files.length ? `<p class="hint">Pick the day to go back to.</p><div class="restore-list">${files.map(f => `<button class="btn" data-id="${e(f.id)}" data-name="${e(f.name)}"><b>${e(f.name.replace('che-app-data ', '').replace('.json', ''))}</b><span class="hint">${App.fmtStamp(Date.parse(f.createdTime))}${f.size ? ', ' + Math.round(f.size / 1024) + ' KB' : ''}</span></button>`).join('')}</div>` : '<p>No backups found yet. Use Back up now first.</p>', {});
      m.querySelectorAll('[data-id]').forEach(b => b.onclick = () => K.restore(b.dataset.id, b.dataset.name));
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
  K.restore = async (fileId, name) => {
    App.closeModal();
    const day = name.replace('che-app-data ', '').replace('.json', '');
    const ok = await new Promise(res => {
      const m = App.modal(`Go back to ${day}?`, `<p>Everything in the app goes back to how it was on <b>${e(day)}</b>: estimates, jobs, clients, settings, safety, maintenance and the rest. Anything added since then is taken out (it's kept in the copy saved first, so this can be undone).</p><p>Coils, fasteners and sales aren't affected, they live in their own sheets.</p>${App.field('Type RESTORE to go ahead', '<input id="rs-c" autocomplete="off">')}`,
        { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn danger" id="rs-ok">Restore</button>' });
      m.querySelector('#rs-ok').onclick = () => { if (m.querySelector('#rs-c').value.trim().toUpperCase() !== 'RESTORE') return App.toast('Type RESTORE to go ahead', 'err'); App.closeModal(); res(true); };
      m.addEventListener('close', () => res(false));
    });
    if (!ok) return;
    try {
      App.toast('Saving a copy of how things are now…');
      const folder = await App.G.folder('Backups', st.rootId);
      await App.G.upload({ name: `che-app-data before restore ${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.json`, parent: folder, blob: new Blob([JSON.stringify(st.data)], { type: 'application/json' }), mime: 'application/json' });
      const old = st.normalise(JSON.parse(await App.G.getText(fileId)));
      const now = Date.now(); const me = st.me().email;
      /* records restored win over newer copies on other computers; anything added since is soft-deleted */
      Object.keys(old).forEach(k => { if (Array.isArray(old[k])) { const ids = new Set(old[k].map(x => x && x.id)); old[k].forEach(x => { if (x && typeof x === 'object') { x.updatedAt = now; x.updatedBy = me; } }); (st.data[k] || []).forEach(x => { if (x && x.id && !ids.has(x.id)) old[k].push(Object.assign({}, x, { deleted: true, deletedAt: now, deletedBy: st.me().name + ' (restore)', updatedAt: now, updatedBy: me })); }); } });
      old.settings.updatedAt = now; old.counters = Object.assign({}, old.counters || {}, st.data.counters || {});
      Object.keys(st.data.counters || {}).forEach(k => { old.counters[k] = Math.max(App.num(old.counters[k]), App.num(st.data.counters[k])); });
      st.data = old; await st.persist(true);
      App.toast(`Restored to ${day}`); App.refresh();
    } catch (er) { App.toast('Restore didn\'t work: ' + er.message, 'err', 8000); }
  };

  /* ---------- Archive finished years ---------- */
  /* Old years move into their own file (che-archive-2025.json) so the app stays quick. Open jobs stay put. */
  K.archivable = () => {
    const yy = App.today().slice(2, 4); const done = x => !x.job || x.job.stage === 'complete' || x.job.stage === 'installed';
    const ests = st.data.estimates.filter(x => !x.archivedTo && x.yy && x.yy < yy && !x.practice && done(x));
    const bats = (st.data.battens || []).filter(x => !x.archivedTo && x.yy && x.yy < yy && done(x));
    const years = [...new Set(ests.map(x => x.yy).concat(bats.map(x => x.yy)))].sort();
    return { ests, bats, years };
  };
  K.archiveCard = () => {
    const a = K.archivable(); const done = S().archives || [];
    return `<section class="card"><h3>Archive finished years</h3><p class="hint">Moves estimates and batten estimates from past years into their own file in Google Drive, so the app stays quick. Jobs still on the go stay where they are, and numbers are never reused. Archived years can still be opened from here.</p>
      ${a.years.length ? `<p>Ready to archive: <b>${a.years.map(y => '20' + y).join(', ')}</b> (${a.ests.length} estimates, ${a.bats.length} batten estimates).</p><button class="btn" data-act="archiveRun" ${st.mode === 'drive' ? '' : 'disabled'}>Archive them</button>` : '<p class="hint">Nothing to archive yet. Past years show here from January.</p>'}
      ${done.length ? `<div style="margin-top:12px">${done.map(d => `<div class="kvr2"><span><b>20${e(d.yy)}</b> <span class="hint">${d.n} items, archived ${App.fmtShort(App.iso(new Date(d.at)))}</span></span><button class="btn small" data-act="archiveOpen" data-yy="${e(d.yy)}">Open</button></div>`).join('')}</div>` : ''}</section>`;
  };
  A.archiveRun = async () => {
    const a = K.archivable(); if (!a.years.length) return;
    if (!(await App.confirm(`Archive ${a.years.map(y => '20' + y).join(', ')}?`, 'They move into their own file in Google Drive and come off the main lists. You can still open them from Settings, Google and data.', 'Archive'))) return;
    try {
      S().archives = S().archives || [];
      for (const yy of a.years) {
        const ests = a.ests.filter(x => x.yy === yy), bats = a.bats.filter(x => x.yy === yy);
        const name = `che-archive-20${yy}.json`; let prev = { estimates: [], battens: [] };
        const ex = await App.G.find(name, st.rootId); if (ex) { try { prev = JSON.parse(await App.G.getText(ex.id)); } catch (er) {} }
        const merge = (arr, add) => { const m2 = new Map((arr || []).map(x => [x.id, x])); add.forEach(x => m2.set(x.id, App.clone(x))); return [...m2.values()]; };
        const file = { year: '20' + yy, archivedAt: Date.now(), estimates: merge(prev.estimates, ests), battens: merge(prev.battens, bats) };
        await App.G.uploadOrReplace({ name, parent: st.rootId, blob: new Blob([JSON.stringify(file)], { type: 'application/json' }), mime: 'application/json' });
        /* leave a small stub so other computers don't add them back */
        const stub = x => { Object.keys(x).forEach(k => { if (!['id', 'number', 'yy', 'seq', 'parentId'].includes(k)) delete x[k]; }); Object.assign(x, { deleted: true, archivedTo: '20' + yy }); st.touch(x); };
        ests.forEach(stub); bats.forEach(stub);
        const rec = S().archives.find(d => d.yy === yy); const n = file.estimates.length + file.battens.length;
        if (rec) Object.assign(rec, { n, at: Date.now() }); else S().archives.push({ yy, n, at: Date.now() });
      }
      S().updatedAt = Date.now(); st.touch(S()); st.save(); App.toast('Archived'); App.refresh();
    } catch (er) { App.toast('Archiving didn\'t work: ' + er.message, 'err', 8000); }
  };
  A.archiveOpen = async el => {
    const yy = el.dataset.yy;
    try {
      const f = await App.G.find(`che-archive-20${yy}.json`, st.rootId); if (!f) throw new Error('Archive file not found');
      const d = JSON.parse(await App.G.getText(f.id)); K.archive = d;
      const rows = (d.estimates || []).concat(d.battens || []).sort((a, b) => String(a.number).localeCompare(String(b.number)));
      App.modal(`Archive 20${yy}`, `<input type="search" id="ar-q" placeholder="Search number or client" style="margin-bottom:10px"><div class="table-scroll" style="max-height:60vh"><table class="wtable"><thead><tr><th>Number</th><th>Client</th><th>Job</th><th>Status</th><th></th></tr></thead><tbody id="ar-rows">${rows.map(x => `<tr data-s="${e([x.number, x.client && (x.client.company || x.client.name), x.heading, x.address].join(' ').toLowerCase())}"><td><b>${e(x.number)}</b></td><td>${e(x.client ? x.client.company || x.client.name : '')}</td><td>${e(x.heading || x.address || '')}</td><td>${e(x.status || '')}</td><td class="r"><button class="btn small" data-act="archivePdf" data-id="${e(x.id)}">PDF</button></td></tr>`).join('')}</tbody></table></div>`, { wide: true });
      const q = document.getElementById('ar-q'); q.oninput = () => document.querySelectorAll('#ar-rows tr').forEach(r => { r.hidden = !r.dataset.s.includes(q.value.toLowerCase()); });
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
  A.archivePdf = async el => {
    const d = K.archive; const x = (d.estimates || []).find(z => z.id === el.dataset.id); const bx = (d.battens || []).find(z => z.id === el.dataset.id);
    try { App.closeModal(); if (x) App.Docs.preview(x.number, await App.Docs.estimate(x), { pdfName: x.number + '.pdf' }); else if (bx && App.Battens) App.Docs.preview(bx.number, App.Battens.spec(bx), { pdfName: bx.number + '.pdf' }); } catch (er) { App.toast(er.message, 'err'); }
  };
})();
