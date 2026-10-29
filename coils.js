/* Coils: the coil tracker, rebuilt inside the estimates app.
   Talks to the same Google Apps Script and "Coil Register" sheet, so all data, PINs and QR labels carry over. */
(() => {
  const e = App.esc, A = App.actions, st = App.store;
  const QR_PREFIX = 'CHE|';
  const normKey = k => String(k || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const normId = s => String(s || '').replace(/\s+/g, '').toUpperCase();
  const bmt = t => Number(t).toFixed(2);
  const kg = n => Math.round(Number(n) || 0).toLocaleString('en-NZ') + ' kg';
  const saved = JSON.parse(localStorage.getItem('che-coil') || 'null') || {};

  const C = App.Coil = {
    S: { token: saved.token || '', user: saved.user || null, coils: [], suppliers: [], activeJobs: [], month: '', loadedAt: 0, loading: null,
      tab: 'stock', filter: 'stock', search: '', cell: null, sel: null, months: null, report: null, reportMonth: null, crew: null, synced: '' },
    cfg() { return st.s().coils || {}; },
    ready() { return !!(this.cfg().apiUrl && this.S.token); },
    isAdmin() { return this.S.user && this.S.user.role === 'Admin'; },
    bmt, kg, normKey,

    async api(action, data = {}) {
      let out;
      try {
        const res = await fetch(this.cfg().apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, token: this.S.token }, data)) });
        out = await res.json();
      } catch (er) { throw new Error('Can\'t reach the coil tracker. Check your connection and try again.'); }
      if (!out.ok) {
        if (out.code === 'signed_out') this.signOut(true);
        if (out.error && /Unknown action/.test(out.error)) throw new Error('The coil tracker script needs updating. Paste the new Code-coils.gs into its Apps Script (see the README).');
        throw new Error(out.error || 'Something went wrong.');
      }
      return out.data;
    },
    saveAuth() { localStorage.setItem('che-coil', JSON.stringify({ token: this.S.token, user: this.S.user })); },
    signOut(quiet) { this.S.token = ''; this.S.user = null; this.S.coils = []; localStorage.removeItem('che-coil'); if (!quiet) App.toast('Signed out of the coil tracker'); App.refresh && App.refresh(); },

    async load(force) {
      if (!this.ready()) return false;
      if (!force && this.S.loadedAt && Date.now() - this.S.loadedAt < 60000) return false;
      if (this.S.loading) return this.S.loading;
      this.S.loading = (async () => {
        try {
          const d = await this.api('allCoils');
          Object.assign(this.S, { user: d.user, coils: d.coils, suppliers: d.suppliers, activeJobs: d.activeJobs || [], month: d.month, loadedAt: Date.now() });
          this.saveAuth(); this.syncActiveJobs();
          return true;
        } finally { this.S.loading = null; }
      })();
      return this.S.loading;
    },
    /* Tell the coil tracker which jobs are in production, so the crew can pick one when scanning out */
    syncActiveJobs() {
      if (!this.isAdmin() || !App.Jobs) return;
      const jobs = App.Jobs.list().filter(j => !['delivered', 'complete'].includes(j.job.stage)).map(j => ({ job: j.number, client: j.client.company || j.client.name }));
      const sig = JSON.stringify(jobs);
      if (sig === this.S.synced) return;
      this.S.synced = sig;
      this.api('setActiveJobs', { jobs }).catch(() => { this.S.synced = ''; });
    },
    upsert(c) { const i = this.S.coils.findIndex(x => x.key === c.key); if (i >= 0) this.S.coils[i] = Object.assign(this.S.coils[i], c); else this.S.coils.push(c); },
    findLocal(raw) {
      const t = String(raw).trim();
      if (t.toUpperCase().indexOf(QR_PREFIX) === 0) { const key = normKey(t.slice(QR_PREFIX.length)); return this.S.coils.filter(c => c.key === key); }
      return this.S.coils.filter(c => normId(c.coilId) === normId(t));
    },
    forJob(number) { const n = String(number || '').toUpperCase(); return this.S.coils.filter(c => (c.jobs || []).includes(n)); },
    inStock() { return this.S.coils.filter(c => c.status === 'In stock'); },
    usedThisMonth() { const m = this.S.month; return this.S.coils.filter(c => c.status === 'Used' && c.scannedOutAt && (c.countsIn || c.scannedOutAt.slice(0, 7)) === m); },
    summary() {
      const ins = this.inStock(); const cfg = this.cfg();
      const thick = [...new Set((cfg.thicknesses || []).concat(ins.map(c => c.thickness)))].sort((a, b) => a - b);
      const byT = thick.map(t => { const l = ins.filter(c => Number(c.thickness) === Number(t)); return { t, n: l.length, kg: l.reduce((s, c) => s + c.weight, 0) }; });
      const active = App.Jobs ? App.Jobs.list().filter(j => !['delivered', 'complete'].includes(j.job.stage)).map(j => j.number) : [];
      const onJobs = this.S.coils.filter(c => (c.jobs || []).some(j => active.includes(j)));
      return { ins, byT, used: this.usedThisMonth(), unlabelled: ins.filter(c => !c.labelsPrinted), onJobs, jobsWith: new Set(onJobs.flatMap(c => c.jobs.filter(j => active.includes(j)))).size, low: byT.filter(x => x.n <= (cfg.lowPerGauge ?? 1) && this.S.coils.some(c => Number(c.thickness) === Number(x.t))) };
    },

    /* ---------- scripts ---------- */
    async libs() {
      await App.loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js');
      await App.loadScript('https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js');
    },
    async camera(elId, onText) {
      await this.libs().catch(() => {});
      const el = document.getElementById(elId);
      if (typeof Html5Qrcode === 'undefined') { if (el) el.innerHTML = '<p class="hint pad">The camera scanner didn\'t load. Type the coil ID instead.</p>'; return null; }
      const cam = new Html5Qrcode(elId, { verbose: false }); let busy = false;
      try {
        await cam.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.72); return { width: s, height: s }; } },
          text => { if (busy) return; busy = true; try { cam.pause(true); } catch (er) {} onText(text); }, () => {});
      } catch (er) { if (el) el.innerHTML = '<p class="hint pad">The camera isn\'t available. Check camera permission for this site, or type the coil ID below.</p>'; return null; }
      return { resume() { busy = false; try { cam.resume(); } catch (er) {} }, async stop() { try { if (cam.isScanning) await cam.stop(); cam.clear(); } catch (er) {} } };
    },

    /* ---------- labels (Brother QL-800, DK-11209 62 x 29 mm), same as the coil tracker ---------- */
    labelHtml(coils) {
      const one = c => {
        const qr = qrcode(0, 'M'); qr.addData(QR_PREFIX + c.key); qr.make();
        const svg = qr.createSvgTag({ cellSize: 2, margin: 4, scalable: true });
        const len = c.coilId.length; const idSize = len <= 8 ? 17 : len <= 10 ? 14.5 : len <= 13 ? 12 : 9.5;
        return `<div class="label"><div class="qr">${svg}</div><div class="txt"><div class="id" style="font-size:${idSize}pt">${e(c.coilId)}</div><div class="spec">${e(c.grade)} &nbsp;${c.width} × ${bmt(c.thickness)} BMT</div><div class="kg">${kg(c.weight)}</div><div class="sup">${e(c.supplier)}${c.consignment ? ' (consignment)' : ''}</div></div></div>`;
      };
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Coil labels</title>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet">
        <style>@page { size: 62mm 29mm; margin: 0; } html, body { margin: 0; padding: 0; }
        .label { width: 62mm; height: 29mm; box-sizing: border-box; padding: 1mm 1.5mm 1mm 0.5mm; display: flex; align-items: center; gap: 1.2mm; overflow: hidden; page-break-after: always; break-after: page; font-family: 'Barlow Condensed', 'Arial Narrow', Arial, sans-serif; color: #000; }
        .label:last-child { page-break-after: auto; break-after: auto; } .qr { width: 27mm; height: 27mm; flex: none; } .qr svg { width: 100%; height: 100%; display: block; }
        .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; line-height: 1.08; } .id { font-weight: 700; white-space: nowrap; overflow: hidden; letter-spacing: .01em; }
        .spec, .kg { font-weight: 700; font-size: 10.5pt; white-space: nowrap; } .sup { font-weight: 600; font-size: 8pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }</style></head>
        <body>${coils.map(one).join('')}<script>window.addEventListener('load', function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.focus(); window.print(); }, 150); }); });<\/script></body></html>`;
    },
    async printLabels(coils) {
      if (!coils.length) return;
      await this.libs().catch(() => {});
      if (typeof qrcode === 'undefined') return App.toast('The label maker didn\'t load. Refresh and try again.', 'err');
      const old = document.getElementById('print-frame'); if (old) old.remove();
      const f = document.createElement('iframe'); f.id = 'print-frame'; f.title = 'Label print';
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:62mm;height:29mm;border:0;opacity:0;pointer-events:none;';
      document.body.appendChild(f); f.contentDocument.open(); f.contentDocument.write(this.labelHtml(coils)); f.contentDocument.close();
      try { const upd = await this.api('markPrinted', { keys: coils.map(c => c.key) }); upd.forEach(c => this.upsert(c)); App.refresh(); } catch (er) {}
    }
  };

  /* ---------- sign in to the coil tracker (name + PIN, same as the crew use) ---------- */
  C.signInCard = (msg = '') => `<section class="card coil-login"><h3>Sign in to the coil tracker</h3>
    <p class="hint">Use the same name and PIN as the coil tracker app. You only need to do this once on each device.</p>
    ${msg ? `<div class="banner warn">${e(msg)}</div>` : ''}
    <div class="grid2">${App.field('Your name', `<select id="coil-name"><option value="">Loading names…</option></select>`)}${App.field('PIN', '<input id="coil-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6">')}</div>
    <button class="btn primary" data-act="coilLogin">Sign in</button></section>`;
  C.mountLogin = async () => {
    const sel = document.getElementById('coil-name'); if (!sel) return;
    try { const names = await C.api('crewNames'); sel.innerHTML = '<option value="">Choose your name…</option>' + names.map(n => App.opt(n, n)).join(''); }
    catch (er) { sel.innerHTML = '<option value="">Couldn\'t load names</option>'; App.toast(er.message, 'err'); }
  };
  A.coilLogin = async el => {
    const name = document.getElementById('coil-name').value; const pin = document.getElementById('coil-pin').value;
    if (!name || !pin) return App.toast('Choose your name and enter your PIN', 'err');
    el.disabled = true;
    try { const r = await C.api('login', { name, pin }); C.S.token = r.token; C.S.user = r.user; C.saveAuth(); await C.load(true); App.toast('Signed in to the coil tracker'); App.refresh(); }
    catch (er) { App.toast(er.message, 'err', 6000); el.disabled = false; }
  };
  A.coilSignOut = () => C.signOut();

  /* ---------- Coils page ---------- */
  App.views.coils = (tab) => {
    const S = C.S; S.tab = tab || S.tab || 'stock';
    if (!C.cfg().apiUrl) return `<div class="page-head"><div><h1>Coils</h1></div></div><div class="empty"><h2>The coil tracker isn't connected</h2><p>Add its web app link in Settings, Coils and fasteners.</p><a class="btn" href="#/settings/stock">Open Settings</a></div>`;
    if (!S.token) return `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Same coils, QR labels and Coil Register sheet as before</p><h1>Coils</h1></div></div>${C.signInCard()}`;
    const admin = C.isAdmin();
    const tabs = admin ? [['stock', 'Stock'], ['monthly', 'Monthly usage'], ['crew', 'Crew'], ['suppliers', 'Suppliers']] : [['stock', 'Stock']];
    const sm = C.summary();
    const head = `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Signed in as ${e(S.user.name)} (${e(S.user.role)}) <button class="btn small ghost" data-act="coilSignOut">Sign out</button></p><h1>Coils</h1></div>
      <div class="head-actions"><button class="btn" data-act="coilRefresh">Refresh</button>${admin && sm.unlabelled.length ? `<button class="btn" data-act="coilPrintAll">Print labels (${sm.unlabelled.length})</button>` : ''}<button class="btn dark" data-act="coilScan" data-mode="out">Scan out coil</button>${admin ? '<button class="btn primary" data-act="coilForm">+ Sign in coil</button>' : ''}</div></div>
      <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/coils/${k}" class="${S.tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
    if (!S.loadedAt) return head + '<p class="hint pad">Loading coils…</p>';
    if (S.tab === 'monthly') return head + C.monthlyView();
    if (S.tab === 'crew') return head + C.crewView();
    if (S.tab === 'suppliers') return head + C.suppliersView();
    return head + C.stockView(sm);
  };
  App.views.coils.mount = async (tab) => {
    if (!C.S.token) return C.mountLogin();
    const need = !C.S.loadedAt;
    try { const changed = await C.load(); if (need || changed) { if (App.route().name === 'coils') App.refresh(); return; } } catch (er) { App.toast(er.message, 'err', 6000); }
    if (C.S.tab === 'monthly' && (!C.S.months || !C.S.report)) C.loadMonthly();
    if (C.S.tab === 'crew' && !C.S.crew) { try { C.S.crew = await C.api('listCrew'); App.refresh(); } catch (er) { App.toast(er.message, 'err'); } }
  };
  A.coilRefresh = async () => { try { await C.load(true); C.S.months = null; C.S.report = null; C.S.crew = null; App.refresh(); App.toast('Coils updated'); } catch (er) { App.toast(er.message, 'err'); } };

  C.stockView = sm => {
    const S = C.S; const cfg = C.cfg(); const admin = C.isAdmin();
    const ins = sm.ins; const used = sm.used;
    const widths = [...new Set((cfg.widths || []).concat(ins.map(c => c.width)))].sort((a, b) => a - b);
    const thicks = [...new Set((cfg.thicknesses || []).concat(ins.map(c => c.thickness)))].sort((a, b) => a - b);
    let grid = `<div class="coil-grid" style="grid-template-columns:72px repeat(${thicks.length},minmax(0,1fr))"><span></span>${thicks.map(t => `<span class="gh">${bmt(t)} <small>BMT</small></span>`).join('')}`;
    widths.forEach(w => {
      grid += `<span class="gr">${w}<small>mm</small></span>`;
      thicks.forEach(t => {
        const list = ins.filter(c => c.width === w && Number(c.thickness) === Number(t));
        const on = S.cell && S.cell.w === w && Number(S.cell.t) === Number(t);
        grid += `<button class="gc ${list.length ? '' : 'zero'} ${on ? 'on' : ''}" data-act="coilCell" data-w="${w}" data-t="${t}" aria-pressed="${on}" aria-label="${w} mm by ${bmt(t)} BMT: ${list.length} coils"><b>${list.length}</b><span>${list.length ? kg(list.reduce((s, c) => s + c.weight, 0)) : 'none'}</span></button>`;
      });
    });
    grid += '</div>';
    let list = S.filter === 'used' ? used : S.filter === 'label' ? sm.unlabelled : S.filter === 'all' ? S.coils : ins;
    if (S.cell) list = list.filter(c => c.width === S.cell.w && Number(c.thickness) === Number(S.cell.t));
    const q = S.search.trim().toLowerCase();
    if (q) list = list.filter(c => [c.coilId, c.supplier, c.width + '', bmt(c.thickness), c.grade, c.notes, c.scannedOutBy, (c.jobs || []).join(' ')].join(' ').toLowerCase().includes(q));
    list = list.slice().sort((a, b) => S.filter === 'used' ? (b.scannedOutAt || '').localeCompare(a.scannedOutAt || '') : (b.signedInAt || '').localeCompare(a.signedInAt || ''));
    const sel = S.sel && S.coils.find(c => c.key === S.sel);
    const consIn = ins.filter(c => c.consignment);
    return `<div class="statcards">
      <div class="statcard dark"><p class="l">In stock</p><p class="v">${ins.length} coil${ins.length === 1 ? '' : 's'}</p><p class="s">${kg(ins.reduce((s, c) => s + c.weight, 0))}</p></div>
      <div class="statcard"><p class="l">Used this month</p><p class="v">${used.length} coil${used.length === 1 ? '' : 's'}</p><p class="s">${kg(used.reduce((s, c) => s + c.weight, 0))}</p></div>
      <div class="statcard"><p class="l">Waiting for labels</p><p class="v">${sm.unlabelled.length}</p><p class="s">Print before they go on the rack</p></div>
      <div class="statcard"><p class="l">Consignment stock</p><p class="v">${consIn.length} coil${consIn.length === 1 ? '' : 's'}</p><p class="s">${kg(consIn.reduce((s, c) => s + c.weight, 0))}</p></div>
    </div>
    <div class="ed-cols">
      <section class="card ed-main" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">In stock by size</h3>${S.cell ? `<button class="btn small" data-act="coilCell" data-clear="1">Show all sizes</button>` : '<span class="hint">Tap a size to filter</span>'}</div><div style="margin-top:12px">${grid}</div></section>
      <aside class="card ed-side coil-detail" style="margin:0">${sel ? C.detail(sel) : '<h3>Pick a coil</h3><p class="hint">Click a coil in the list to see its details, which jobs it\'s on, and print or scan it.</p>'}</aside>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><h3 style="margin:0">Coils</h3>
        <div class="seg">${[['stock', 'In stock'], ['used', 'Used this month'], ['label', 'Needs label'], ['all', 'All']].map(([k, l]) => `<label><input type="radio" name="cf" value="${k}" data-act-change="coilFilter" ${S.filter === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
      <input type="search" id="coil-q" style="margin:12px 0" placeholder="Search coil ID, supplier, size or job" value="${e(S.search)}" data-act-input="coilSearch">
      ${list.length ? `<div class="table-scroll"><table class="wtable coil-table"><thead><tr><th>Coil ID</th><th>Size</th><th class="r">Weight</th><th>Supplier</th><th>${S.filter === 'used' ? 'Scanned out' : 'Signed in'}</th><th>Jobs</th><th>Status</th></tr></thead><tbody>
      ${list.map(c => `<tr class="${S.sel === c.key ? 'sel' : ''}" data-act="coilSel" data-key="${e(c.key)}" tabindex="0">
        <td><b>${e(c.coilId)}</b></td><td>${c.width} × ${bmt(c.thickness)}</td><td class="r">${kg(c.weight)}</td><td>${e(c.supplier)}${c.consignment ? ' <span class="tag">Consignment</span>' : ''}</td>
        <td>${c.status === 'Used' ? `${App.fmtShort(App.iso(new Date(c.scannedOutAt)))}<div class="hint">${e(c.scannedOutBy)}</div>` : `${App.fmtShort(App.iso(new Date(c.signedInAt)))}<div class="hint">${e(c.signedInBy)}</div>`}</td>
        <td><div class="tags">${(c.jobs || []).map(j => `<span class="tag job">${e(j)}</span>`).join('') || '<span class="hint">Not on a job</span>'}</div></td>
        <td>${c.status === 'Used' ? '<span class="pill">Used</span>' : '<span class="pill accepted">In stock</span>'}${!c.labelsPrinted && c.status !== 'Used' ? ' <span class="tag warn">No label</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty" style="padding:30px"><b>${S.search || S.cell ? 'No coils match' : S.filter === 'used' ? 'Nothing scanned out yet this month' : S.filter === 'label' ? 'Every coil has a label' : 'The shed is empty'}</b></div>`}
    </section>`;
  };
  C.detail = c => {
    const admin = C.isAdmin(); const used = c.status === 'Used';
    const jobLink = j => { const est = st.live().find(x => x.number.toUpperCase() === j); return est ? `<a href="#/job/${est.id}/coils">${e(j)}</a> <span class="hint">${e(est.client.company || est.client.name)}</span>` : e(j); };
    return `<p class="hint" style="margin:0">Selected coil</p><h2 style="margin:2px 0 10px;word-break:break-word">${e(c.coilId)}</h2>
      <p style="margin:0 0 4px"><b>${e(c.grade)}, ${c.width} × ${bmt(c.thickness)} BMT</b>, ${kg(c.weight)}</p>
      <p class="hint" style="margin:0 0 12px">${e(c.supplier)}${c.consignment ? ', consignment' : ''}. ${used ? `Scanned out ${App.fmtStamp(c.scannedOutAt)} by ${e(c.scannedOutBy)}.` : `Signed in ${App.fmtStamp(c.signedInAt)} by ${e(c.signedInBy)}.`} ${c.labelsPrinted ? 'Label printed.' : 'No label yet.'}</p>
      ${c.notes ? `<p class="hint">${e(c.notes)}</p>` : ''}
      <h4 style="margin-top:6px">Used on jobs</h4>
      <div class="coil-jobs">${(c.jobs || []).map(j => `<div class="cj"><span>${jobLink(j)}</span>${admin ? `<button class="icon-btn" data-act="coilUnassign" data-key="${e(c.key)}" data-job="${e(j)}" aria-label="Take off ${e(j)}">✕</button>` : ''}</div>`).join('') || '<p class="hint">Not on a job yet.</p>'}</div>
      <div class="row-btns"><button class="btn primary" data-act="coilAssign" data-key="${e(c.key)}">+ Assign to a job</button>
        ${!used ? `<button class="btn" data-act="coilOutOne" data-key="${e(c.key)}">Scan out</button>` : ''}
        ${admin && !used ? `<button class="btn" data-act="coilPrint" data-key="${e(c.key)}">${c.labelsPrinted ? 'Reprint label' : 'Print label'}</button>` : ''}
        ${admin && used ? `<button class="btn" data-act="coilReturn" data-key="${e(c.key)}">Return to stock</button>` : ''}
        ${admin ? `<button class="btn ghost" data-act="coilForm" data-key="${e(c.key)}">Edit</button>` : ''}</div>`;
  };
  A.coilFilter = el => { C.S.filter = el.value; App.refresh(); };
  A.coilSearch = App.debounce(el => { C.S.search = el.value; App.refresh(); const i = document.getElementById('coil-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  A.coilCell = el => { if (el.dataset.clear) C.S.cell = null; else { const w = +el.dataset.w, t = +el.dataset.t; C.S.cell = C.S.cell && C.S.cell.w === w && C.S.cell.t === t ? null : { w, t }; } App.refresh(); };
  A.coilSel = el => { C.S.sel = el.dataset.key; App.refresh(); };
  A.coilPrint = el => C.printLabels([C.S.coils.find(c => c.key === el.dataset.key)]);
  A.coilPrintAll = () => C.printLabels(C.summary().unlabelled);
  A.coilReturn = async el => {
    const c = C.S.coils.find(x => x.key === el.dataset.key);
    if (!(await App.confirm(`Return coil ${c.coilId} to stock?`, 'Use this if it was scanned out by mistake. It goes back on the stock list and comes off this month\'s usage.', 'Return to stock'))) return;
    try { C.upsert(await C.api('returnToStock', { key: c.key })); App.toast(`Coil ${c.coilId} returned to stock`); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
  };
  A.coilUnassign = async el => {
    const { key, job } = el.dataset;
    if (!(await App.confirm('Take this coil off the job?', `Coil ${C.S.coils.find(c => c.key === key).coilId} will no longer show on ${job}.`, 'Take it off'))) return;
    try { const jobs = await C.api('unassignJob', { key, job }); C.upsert({ key, jobs }); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
  };

  /* Assign a coil to a job (pick from jobs) */
  A.coilAssign = el => {
    const c = C.S.coils.find(x => x.key === el.dataset.key);
    const active = App.Jobs.list().filter(j => !['complete'].includes(j.job.stage));
    const others = st.live().filter(x => !x.practice && !x.archived && !x.job && x.status !== 'cancelled').slice(-40).reverse();
    const m = App.modal(`Assign ${c.coilId} to a job`, `
      <p class="hint">Pick a job. A coil can be on as many jobs as you need.</p>
      <div class="job-pick">${active.map(j => `<button class="chip ${(c.jobs || []).includes(j.number.toUpperCase()) ? 'on' : ''}" data-j="${e(j.number)}">${e(j.number)} <span class="hint">${e(j.client.company || j.client.name)}</span></button>`).join('') || '<p class="hint">No jobs in production.</p>'}</div>
      ${App.field('Or type a job number', `<input id="aj-other" list="aj-list" placeholder="e.g. CHE26117"><datalist id="aj-list">${others.map(x => `<option value="${e(x.number)}">${e(x.client.company || x.client.name)}</option>`).join('')}</datalist>`)}`,
      { actions: '<button class="btn ghost" data-act="closeModal">Close</button><button class="btn primary" id="aj-ok">Assign</button>' });
    const go = async job => {
      try { const jobs = await C.api('assignJob', { key: c.key, job }); C.upsert({ key: c.key, jobs }); App.toast(`${c.coilId} added to ${job.toUpperCase()}`); App.closeModal(); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
    };
    m.querySelectorAll('[data-j]').forEach(b => b.onclick = () => go(b.dataset.j));
    m.querySelector('#aj-ok').onclick = () => { const v = m.querySelector('#aj-other').value.trim(); if (v) go(v); else App.toast('Pick or type a job', 'err'); };
  };

  /* ---------- Scan (out, or onto a job) ---------- */
  A.coilScan = el => C.openScan(el.dataset.mode || 'out', el.dataset.job);
  A.coilOutOne = el => { const c = C.S.coils.find(x => x.key === el.dataset.key); C.openScan('out', null, c); };
  C.openScan = async (mode, job, preset) => {
    const m = App.modal(mode === 'assign' ? `Add a coil to ${job}` : 'Scan out coil', `
      ${preset ? '' : `<div id="reader" class="reader"></div>
      <label class="fld"><span>Camera not working? Type the coil ID</span><div class="row"><input id="manual-id" autocapitalize="characters" spellcheck="false" placeholder="Coil ID"><button class="btn primary" id="manual-go">Find</button></div></label>`}
      <div id="scan-result" aria-live="polite"></div>`, { wide: false });
    let cam = null;
    const box = () => m.querySelector('#scan-result');
    const again = () => { box().innerHTML = ''; const i = m.querySelector('#manual-id'); if (i) i.value = ''; if (cam) cam.resume(); };
    const warn = html => { box().innerHTML = `<div class="banner warn">${html}</div><button class="btn primary" id="sc-again">Try again</button>`; m.querySelector('#sc-again').onclick = again; };
    const confirmOut = c => {
      const jobs = App.Jobs.list().filter(j => !['delivered', 'complete'].includes(j.job.stage));
      box().innerHTML = `<div class="scan-card"><p class="ok">Found</p><h2>${e(c.coilId)}</h2><p>${c.width} mm × ${bmt(c.thickness)} BMT, ${kg(c.weight)}. ${e(c.supplier)}${c.consignment ? ', consignment' : ''}.</p>
        ${mode === 'assign' ? '' : `<p><b>Which job is it for?</b> <span class="hint">(optional)</span></p><div class="job-pick">${jobs.map(j => `<label class="chip"><input type="radio" name="sj" value="${e(j.number)}">${e(j.number)}</label>`).join('')}<label class="chip"><input type="radio" name="sj" value="" checked>Not sure</label></div>`}
        <div class="row-btns">${preset ? '' : '<button class="btn" id="sc-other">Scan a different coil</button>'}<button class="btn primary" id="sc-do">${mode === 'assign' ? `Add to ${e(job)}` : 'Scan out coil'}</button></div></div>`;
      m.querySelectorAll('.job-pick input').forEach(r => r.onchange = () => m.querySelectorAll('.job-pick .chip').forEach(ch => ch.classList.toggle('on', ch.querySelector('input').checked)));
      if (m.querySelector('#sc-other')) m.querySelector('#sc-other').onclick = again;
      m.querySelector('#sc-do').onclick = async ev => {
        const b = ev.target; b.disabled = true;
        try {
          if (mode === 'assign') { const jobs = await C.api('assignJob', { key: c.key, job }); C.upsert({ key: c.key, jobs }); }
          else { const pick = (m.querySelector('.job-pick input:checked') || {}).value || ''; const upd = await C.api('scanOut', { key: c.key, job: pick }); C.upsert(upd); }
          if (navigator.vibrate) navigator.vibrate(60);
          box().innerHTML = `<div class="scan-card done"><p class="ok">${mode === 'assign' ? 'Added to ' + e(job) : 'Scanned out'}</p><h2>${e(c.coilId)}</h2><div class="row-btns"><button class="btn" data-act="closeModal">Done</button>${preset ? '' : '<button class="btn primary" id="sc-next">Scan another</button>'}</div></div>`;
          if (m.querySelector('#sc-next')) m.querySelector('#sc-next').onclick = again;
          App.refresh();
        } catch (er) { App.toast(er.message, 'err', 6000); b.disabled = false; }
      };
    };
    const lookup = async raw => {
      box().innerHTML = '<p class="hint">Looking up coil…</p>';
      let matches = C.findLocal(raw);
      if (!matches.length) { try { matches = (await C.api('findCoil', { query: raw })).matches; matches.forEach(x => C.upsert(x)); } catch (er) { return warn(e(er.message)); } }
      const shown = raw.indexOf(QR_PREFIX) === 0 ? raw.split('|').pop() : raw;
      if (!matches.length) return warn(`No coil with ID "${e(shown)}" is in the system. Check the number, or sign it in first.`);
      const live = mode === 'assign' ? matches : matches.filter(c => c.status === 'In stock');
      if (!live.length) { const c = matches[0]; return warn(`Coil <b>${e(c.coilId)}</b> was already scanned out by <b>${e(c.scannedOutBy)}</b> on ${App.fmtStamp(c.scannedOutAt)}.`); }
      if (live.length > 1) {
        box().innerHTML = `<p>More than one coil has this ID. Which one is it?</p>${live.map(c => `<button class="btn" style="width:100%;margin-bottom:6px" data-pick="${e(c.key)}">${e(c.supplier)}: ${c.width} mm × ${bmt(c.thickness)} BMT, ${kg(c.weight)}</button>`).join('')}`;
        box().querySelectorAll('[data-pick]').forEach(b => b.onclick = () => confirmOut(live.find(c => c.key === b.dataset.pick)));
        return;
      }
      confirmOut(live[0]);
    };
    if (preset) return confirmOut(preset);
    m.querySelector('#manual-go').onclick = () => { const v = m.querySelector('#manual-id').value.trim(); if (v) lookup(v); };
    m.querySelector('#manual-id').onkeydown = ev => { if (ev.key === 'Enter') { const v = ev.target.value.trim(); if (v) lookup(v); } };
    cam = await C.camera('reader', text => lookup(text));
    const obs = new MutationObserver(() => { if (!document.body.contains(m)) { if (cam) cam.stop(); obs.disconnect(); } });
    obs.observe(document.getElementById('modal-root'), { childList: true });
  };

  /* ---------- Sign in / edit a coil (admin) ---------- */
  A.coilForm = el => {
    const editing = el.dataset.key ? C.S.coils.find(x => x.key === el.dataset.key) : null;
    const cfg = C.cfg(); const sups = C.S.suppliers;
    const c = editing || { supplier: (sups[0] || {}).name || '', consignment: (sups[0] || {}).consignment || false, grade: cfg.defaultGrade || 'G550', width: '', thickness: '', weight: '', coilId: '', notes: '' };
    const chips = (name, vals, cur, unit, fmt) => vals.map(v => `<label class="chip ${Number(cur) === Number(v) ? 'on' : ''}"><input type="radio" name="${name}" value="${v}" ${Number(cur) === Number(v) ? 'checked' : ''}>${fmt ? fmt(v) : v}<small>&#160;${unit}</small></label>`).join('');
    const m = App.modal(editing ? `Edit coil ${c.coilId}` : 'Sign in coil', `
      <div class="grid2">${App.field('Supplier', `<select id="f-sup">${sups.map(s => App.opt(s.name, s.name, c.supplier)).join('')}<option value="__new">Add a new supplier…</option></select>`)}
      <div class="fld"><span>&#160;</span><label class="check"><input type="checkbox" id="f-cons" ${c.consignment ? 'checked' : ''}> Consignment stock</label></div></div>
      <div id="new-sup" hidden class="card soft">${App.field('New supplier name', '<input id="ns-name">')}<label class="check"><input type="checkbox" id="ns-cons"> Their steel is on consignment</label><button class="btn dark small" id="ns-add">Add supplier</button></div>
      ${App.field('Supplier coil ID', `<div class="row"><input id="f-id" value="${e(c.coilId)}" autocapitalize="characters" spellcheck="false" style="font-size:1.2rem;font-weight:800"><button class="btn" id="f-scan">Scan tag</button></div>`)}
      <div id="f-reader" class="reader" hidden></div>
      <div class="fld"><span>Width (mm)</span><div class="gauges">${chips('w', cfg.widths || [], c.width, 'mm')}</div></div>
      <div class="fld"><span>Thickness (BMT)</span><div class="gauges">${chips('t', cfg.thicknesses || [], c.thickness, 'BMT', bmt)}</div></div>
      <div class="grid3">${App.field('Weight (kg)', `<input id="f-kg" inputmode="decimal" value="${e(c.weight)}">`)}${App.field('Grade', `<input id="f-grade" value="${e(c.grade)}">`)}${App.field('Notes', `<input id="f-notes" value="${e(c.notes)}">`)}</div>`,
      { wide: true, actions: `${editing && C.isAdmin() ? '<button class="btn ghost danger" id="f-del">Delete coil</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="f-save">${editing ? 'Save changes' : 'Sign in coil'}</button>` });
    m.querySelectorAll('.gauges input').forEach(r => r.onchange = () => m.querySelectorAll(`input[name="${r.name}"]`).forEach(x => x.closest('.chip').classList.toggle('on', x.checked)));
    const supSel = m.querySelector('#f-sup');
    supSel.onchange = () => { const nw = supSel.value === '__new'; m.querySelector('#new-sup').hidden = !nw; if (!nw) { const s = sups.find(x => x.name === supSel.value); if (s) m.querySelector('#f-cons').checked = s.consignment; } };
    m.querySelector('#ns-add').onclick = async () => {
      const name = m.querySelector('#ns-name').value.trim(); if (!name) return;
      try { C.S.suppliers = await C.api('addSupplier', { name, consignment: m.querySelector('#ns-cons').checked }); supSel.innerHTML = C.S.suppliers.map(s => App.opt(s.name, s.name, name)).join('') + '<option value="__new">Add a new supplier…</option>'; m.querySelector('#new-sup').hidden = true; m.querySelector('#f-cons').checked = m.querySelector('#ns-cons').checked; }
      catch (er) { App.toast(er.message, 'err'); }
    };
    let cam = null;
    m.querySelector('#f-scan').onclick = async () => {
      const r = m.querySelector('#f-reader'); r.hidden = false;
      cam = await C.camera('f-reader', text => { m.querySelector('#f-id').value = text.indexOf(QR_PREFIX) === 0 ? text.split('|').pop() : text.trim(); if (cam) cam.stop(); r.hidden = true; });
    };
    if (m.querySelector('#f-del')) m.querySelector('#f-del').onclick = async () => {
      if (!(await App.confirm(`Delete coil ${c.coilId}?`, 'This removes it from the Coil Register completely. Only do this if it was signed in by mistake.', 'Delete'))) return;
      try { await C.api('deleteCoil', { key: c.key }); C.S.coils = C.S.coils.filter(x => x.key !== c.key); C.S.sel = null; App.closeModal(); App.refresh(); App.toast('Coil deleted'); } catch (er) { App.toast(er.message, 'err'); }
    };
    m.querySelector('#f-save').onclick = async ev => {
      const w = (m.querySelector('input[name="w"]:checked') || {}).value; const t = (m.querySelector('input[name="t"]:checked') || {}).value;
      const data = { supplier: supSel.value, consignment: m.querySelector('#f-cons').checked, coilId: m.querySelector('#f-id').value.trim(), width: w, thickness: t, weight: m.querySelector('#f-kg').value, grade: m.querySelector('#f-grade').value, notes: m.querySelector('#f-notes').value };
      if (data.supplier === '__new' || !data.coilId || !w || !t || !data.weight) return App.toast('Fill in the supplier, coil ID, width, thickness and weight', 'err');
      ev.target.disabled = true;
      try {
        const res = editing ? await C.api('updateCoil', Object.assign({ key: c.key }, data)) : await C.api('signIn', data);
        if (editing && res.key !== c.key) C.S.coils = C.S.coils.filter(x => x.key !== c.key);
        C.upsert(res); C.S.sel = res.key; if (cam) cam.stop(); App.closeModal(); App.refresh();
        if (!editing && await App.confirm('Coil signed in', `Print the label for ${res.coilId} now?`, 'Print label')) C.printLabels([res]);
      } catch (er) { App.toast(er.message, 'err', 6000); ev.target.disabled = false; }
    };
  };

  /* ---------- Monthly usage ---------- */
  C.loadMonthly = async () => {
    const S = C.S;
    try {
      if (!S.months) S.months = await C.api('months');
      S.reportMonth = S.reportMonth || (S.months[0] && S.months[0].key);
      if (!S.report || S.report.month !== S.reportMonth) S.report = await C.api('monthReport', { month: S.reportMonth });
      if (App.route().name === 'coils') App.refresh();
    } catch (er) { App.toast(er.message, 'err'); }
  };
  C.monthlyView = () => {
    const S = C.S, r = S.report;
    if (!S.months || !r) return '<p class="hint pad">Loading the monthly report…</p>';
    const isCurrent = r.month === S.month;
    const consTable = b => {
      const sizes = {}; const add = (c, f) => { const k = c.width + '|' + bmt(c.thickness); sizes[k] = sizes[k] || { width: c.width, thickness: c.thickness, usedN: 0, usedKg: 0, stockN: 0, stockKg: 0 }; sizes[k][f + 'N']++; sizes[k][f + 'Kg'] += c.weight; };
      b.used.forEach(c => add(c, 'used')); b.stock.forEach(c => add(c, 'stock'));
      const rows = Object.values(sizes).sort((x, y) => x.width - y.width || x.thickness - y.thickness);
      const cell = (n, w) => n ? `${kg(w)} <span class="hint">(${n} coil${n === 1 ? '' : 's'})</span>` : '<span class="hint">none</span>';
      return rows.length ? `<table class="wtable"><thead><tr><th>Size</th><th class="r">Used, to invoice</th><th class="r">${isCurrent ? 'In stock now' : 'In stock at month end'}</th></tr></thead><tbody>${rows.map(x => `<tr><td><b>${x.width} × ${bmt(x.thickness)}</b></td><td class="r">${cell(x.usedN, x.usedKg)}</td><td class="r">${cell(x.stockN, x.stockKg)}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">No consignment coils this month.</p>';
    };
    const moveBtn = c => c.countsIn ? `<button class="btn small" data-act="coilMonth" data-key="${e(c.key)}" data-push="">Move back</button>` : isCurrent ? `<button class="btn small" data-act="coilMonth" data-key="${e(c.key)}" data-push="1">Push to next month</button>` : '';
    return `<div class="row" style="flex-wrap:wrap;margin-bottom:14px"><select data-act-change="coilMonthSel" style="width:auto">${S.months.map(m => App.opt(m.key, m.label, r.month)).join('')}</select><button class="btn dark" data-act="coilPdf" data-type="usage">Download usage PDF</button></div>
      ${isCurrent ? '<p class="hint">This month is still running. The PDFs save to Drive automatically at 5pm on the last working day.</p>' : ''}
      <div class="statcards" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:620px"><div class="statcard dark"><p class="l">Coils used</p><p class="v">${r.used.length}</p></div><div class="statcard"><p class="l">Total weight</p><p class="v">${kg(r.usedKg)}</p></div></div>
      ${r.consignment.map(b => `<section class="card"><h3>${e(b.supplier)} consignment</h3>${consTable(b)}<div class="row-btns"><button class="btn primary" data-act="coilPdf" data-type="consignment" data-sup="${e(b.supplier)}">Download ${e(b.supplier)} statement</button></div></section>`).join('')}
      <section class="card"><h3>Usage by size</h3>${r.bySpec.length ? `<table class="wtable"><thead><tr><th>Supplier</th><th>Size</th><th class="r">Coils</th><th class="r">Weight</th></tr></thead><tbody>${r.bySpec.map(s => `<tr><td>${e(s.supplier)}</td><td>${s.width} × ${bmt(s.thickness)}</td><td class="r">${s.count}</td><td class="r">${kg(s.kg)}</td></tr>`).join('')}<tr><td colspan="2"><b>Total</b></td><td class="r"><b>${r.used.length}</b></td><td class="r"><b>${kg(r.usedKg)}</b></td></tr></tbody></table>` : '<p class="hint">No coils scanned out in this month.</p>'}</section>
      ${r.used.length ? `<section class="card"><h3>Coils used</h3><div class="table-scroll"><table class="wtable"><thead><tr><th>Coil</th><th>Size</th><th>Scanned out</th><th>Jobs</th><th class="r">Weight</th><th></th></tr></thead><tbody>${r.used.map(c => { const loc = C.S.coils.find(x => x.key === c.key) || c; return `<tr><td><b>${e(c.coilId)}</b><div class="hint">${e(c.supplier)}${c.consignment ? ', consignment' : ''}</div></td><td>${c.width} × ${bmt(c.thickness)}</td><td>${App.fmtShort(App.iso(new Date(c.scannedOutAt)))}<div class="hint">${e(c.scannedOutBy)}</div></td><td><div class="tags">${(loc.jobs || []).map(j => `<span class="tag job">${e(j)}</span>`).join('')}</div></td><td class="r">${kg(c.weight)}</td><td class="r">${moveBtn(c)}</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
      <section class="card"><h3>Saved in Google Drive</h3>${r.files.length ? `<ul class="activity">${r.files.slice().reverse().map(f => `<li><a href="${e(f.url)}" target="_blank" rel="noopener">${e(f.name)}</a> <span class="hint">${App.fmtStamp(f.created)}</span></li>`).join('')}</ul>` : '<p class="hint">No PDFs saved for this month yet.</p>'}</section>`;
  };
  A.coilMonthSel = el => { C.S.reportMonth = el.value; C.S.report = null; App.refresh(); C.loadMonthly(); };
  A.coilMonth = async el => {
    const push = !!el.dataset.push; const c = C.S.report.used.find(x => x.key === el.dataset.key);
    if (!(await App.confirm(push ? `Push coil ${c.coilId} to next month?` : `Move coil ${c.coilId} back?`, push ? 'It keeps its real scan-out date, but counts in next month\'s usage and statement instead.' : 'It goes back to counting in the month it was actually scanned out.', push ? 'Push to next month' : 'Move back'))) return;
    try { const upd = await C.api('setCountsIn', { key: c.key, push }); C.upsert(upd); C.S.months = null; C.S.report = null; App.refresh(); C.loadMonthly(); } catch (er) { App.toast(er.message, 'err'); }
  };
  A.coilPdf = async el => {
    const label = el.textContent; el.disabled = true; el.textContent = 'Making PDF…';
    try {
      const r = await C.api('makePdf', { month: C.S.reportMonth, type: el.dataset.type, supplier: el.dataset.sup });
      const bytes = Uint8Array.from(atob(r.base64), ch => ch.charCodeAt(0));
      App.download(r.name, new Blob([bytes], { type: 'application/pdf' }));
      App.toast('Downloaded and saved to Drive: ' + r.name); C.S.report = null; C.loadMonthly();
    } catch (er) { App.toast(er.message, 'err'); }
    el.disabled = false; el.textContent = label;
  };

  /* ---------- Crew ---------- */
  C.crewView = () => {
    const crew = C.S.crew; if (!crew) return '<p class="hint pad">Loading the crew…</p>';
    const active = crew.filter(c => c.active), inactive = crew.filter(c => !c.active);
    const row = c => `<tr><td><b>${e(c.name)}</b>${c.locked ? ' <span class="tag warn">Locked</span>' : ''}</td><td>${e(c.role)}</td><td class="row-btns" style="margin:0">
      <button class="btn small" data-act="crewUpd" data-name="${e(c.name)}" data-k="role" data-v="${c.role === 'Admin' ? 'Worker' : 'Admin'}">Make ${c.role === 'Admin' ? 'worker' : 'admin'}</button>
      <button class="btn small" data-act="crewPin" data-name="${e(c.name)}">New PIN</button>
      <button class="btn small ghost" data-act="crewUpd" data-name="${e(c.name)}" data-k="active" data-v="${c.active ? '' : '1'}">${c.active ? 'Deactivate' : 'Reactivate'}</button></td></tr>`;
    return `<section class="card"><h3>Add a crew member</h3><div class="grid3">${App.field('Name', '<input id="cr-name">')}${App.field('PIN (4 to 6 numbers)', '<input id="cr-pin" inputmode="numeric" maxlength="6">')}${App.field('Role', `<select id="cr-role">${App.opts(['Worker', 'Admin'])}</select>`)}</div><button class="btn primary" data-act="crewAdd">Add to the crew</button></section>
      <section class="card"><h3>Crew (${active.length})</h3><table class="wtable"><tbody>${active.map(row).join('')}</tbody></table></section>
      ${inactive.length ? `<section class="card"><h3>Deactivated</h3><table class="wtable"><tbody>${inactive.map(row).join('')}</tbody></table></section>` : ''}
      <section class="card soft"><h3>Crew scan page</h3><p>The crew scan coils out on their phones at <b>crew.html</b> on this same website, with their name and PIN. Open it on their phone and use "Add to Home Screen".</p><a class="btn" href="crew.html" target="_blank" rel="noopener">Open the crew scan page</a></section>`;
  };
  A.crewAdd = async () => {
    const name = document.getElementById('cr-name').value.trim(), pin = document.getElementById('cr-pin').value.trim(), role = document.getElementById('cr-role').value;
    try { C.S.crew = await C.api('addCrew', { name, pin, role }); App.toast(`${name} added. They can sign in now.`); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
  };
  A.crewUpd = async el => {
    const data = { name: el.dataset.name }; if (el.dataset.k === 'role') data.role = el.dataset.v; else data.active = !!el.dataset.v;
    try { C.S.crew = await C.api('updateCrew', data); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
  };
  A.crewPin = async el => {
    const pin = await App.prompt(`New PIN for ${el.dataset.name}`, '4 to 6 numbers'); if (!pin) return;
    try { C.S.crew = await C.api('updateCrew', { name: el.dataset.name, pin }); App.toast('PIN changed'); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
  };

  /* ---------- Suppliers ---------- */
  C.suppliersView = () => `<section class="card"><h3>Add a supplier</h3><div class="grid2">${App.field('Name', '<input id="sp-name">')}<div class="fld"><span>&#160;</span><label class="check"><input type="checkbox" id="sp-cons"> Their steel is on consignment</label></div></div><button class="btn primary" data-act="supAdd">Add supplier</button></section>
    <section class="card"><h3>Suppliers</h3><table class="wtable"><tbody>${C.S.suppliers.map(s => `<tr><td><b>${e(s.name)}</b></td><td><label class="check"><input type="checkbox" data-act-change="supCons" data-sup="${e(s.name)}" ${s.consignment ? 'checked' : ''}> Consignment</label></td></tr>`).join('')}</tbody></table></section>`;
  A.supAdd = async () => { const name = document.getElementById('sp-name').value.trim(); if (!name) return; try { C.S.suppliers = await C.api('addSupplier', { name, consignment: document.getElementById('sp-cons').checked }); App.refresh(); } catch (er) { App.toast(er.message, 'err'); } };
  A.supCons = async el => { try { C.S.suppliers = await C.api('updateSupplier', { name: el.dataset.sup, consignment: el.checked }); App.toast(`${el.dataset.sup} ${el.checked ? 'set to' : 'no longer on'} consignment`); } catch (er) { App.toast(er.message, 'err'); } };

  /* ---------- Coils tab on a job ---------- */
  C.jobTab = est => {
    if (!C.cfg().apiUrl) return '<section class="card"><p>Connect the coil tracker in Settings to track coils on jobs.</p></section>';
    if (!C.S.token) return C.signInCard();
    if (!C.S.loadedAt) return '<p class="hint pad">Loading coils…</p>';
    const coils = C.forJob(est.number);
    return `<section class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><h3 style="margin:0">Coils used on this job</h3>
      <div class="row-btns" style="margin:0"><button class="btn" data-act="coilScan" data-mode="assign" data-job="${e(est.number)}">Scan a coil</button><button class="btn primary" data-act="jobCoilPick">+ Add coil</button></div></div>
      <div class="job-coils">${coils.map(c => { const other = (c.jobs || []).filter(j => j !== est.number.toUpperCase());
        return `<div class="jcoil"><span class="ring" aria-hidden="true"></span><span class="txt"><b>${e(c.coilId)}</b><span>${c.width} × ${bmt(c.thickness)} BMT, ${kg(c.weight)}, ${e(c.supplier)}</span></span>
          ${other.length ? `<span class="tag warn">Shared with ${e(other.join(', '))}</span>` : ''}${c.status === 'Used' ? `<span class="tag ok">Scanned out ${App.fmtShort(App.iso(new Date(c.scannedOutAt)))}</span>` : '<span class="tag">In stock</span>'}
          ${C.isAdmin() ? `<button class="icon-btn" data-act="coilUnassign" data-key="${e(c.key)}" data-job="${e(est.number.toUpperCase())}" aria-label="Take this coil off the job">✕</button>` : ''}</div>`; }).join('') || '<p class="hint">No coils on this job yet. Scan a coil or add one from the list.</p>'}</div>
      <p class="hint">${coils.length} coil${coils.length === 1 ? '' : 's'} on this job. One coil can be on as many jobs as you need.</p></section>`;
  };
  A.jobCoilPick = () => {
    const est = App.cur; const have = new Set(C.forJob(est.number).map(c => c.key));
    const list = C.S.coils.filter(c => !have.has(c.key)).sort((a, b) => (a.status === 'In stock' ? 0 : 1) - (b.status === 'In stock' ? 0 : 1) || (b.signedInAt || '').localeCompare(a.signedInAt || '')).slice(0, 120);
    const m = App.modal(`Add a coil to ${est.number}`, `<input type="search" id="jc-q" placeholder="Search coil ID or size" style="margin-bottom:10px">
      <div class="jc-list">${list.map(c => `<button class="jc-row" data-k="${e(c.key)}" data-s="${e((c.coilId + ' ' + c.width + ' ' + bmt(c.thickness) + ' ' + c.supplier).toLowerCase())}"><b>${e(c.coilId)}</b><span>${c.width} × ${bmt(c.thickness)}, ${kg(c.weight)}</span>${c.status === 'Used' ? '<span class="tag">Used</span>' : '<span class="tag ok">In stock</span>'}${(c.jobs || []).length ? `<span class="tag job">${e(c.jobs.join(', '))}</span>` : ''}</button>`).join('')}</div>`, { wide: true });
    m.querySelector('#jc-q').oninput = ev => { const q = ev.target.value.toLowerCase(); m.querySelectorAll('.jc-row').forEach(r => r.hidden = q && !r.dataset.s.includes(q)); };
    m.querySelectorAll('.jc-row').forEach(b => b.onclick = async () => {
      try { const jobs = await C.api('assignJob', { key: b.dataset.k, job: est.number }); C.upsert({ key: b.dataset.k, jobs }); App.closeModal(); App.refresh(); } catch (er) { App.toast(er.message, 'err'); }
    });
  };
})();
