/* Driver: today's deliveries on the phone. Photo of the drop, the client signs on screen, Mark delivered.
   A signed docket PDF is made, saved to the job in Drive, and an email to the client is drafted for the driver to send.
   Compliance pack: the job's documents bundled into one PDF with a cover page. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const D = App.Driver = { photos: {}, sig: null };
  D.loads = day => {
    const out = [];
    (App.Jobs ? App.Jobs.list() : []).forEach(j => (j.job.loads || []).forEach(l => { if (l.date === day) out.push({ j, l }); }));
    return out.sort((a, b) => (a.l.delivered ? 1 : 0) - (b.l.delivered ? 1 : 0) || String(a.j.number).localeCompare(String(b.j.number)));
  };
  D.kg = (j, l) => App.Docs.jobFrames(j).filter(f => (l.frameIds || []).includes(f.id)).reduce((t, f) => t + (f.weight || 0) * (f.qty || 1), 0);

  /* ---------- the driver's day ---------- */
  App.views.driver = (jid, lid) => {
    if (jid && lid) return D.loadView(jid, lid);
    const day = App.state.drvDay || App.today(); const list = D.loads(day);
    return `<div class="drv"><div class="page-head"><div><p class="sub" style="margin:0 0 6px">${App.fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Deliveries</h1></div>
      <div class="head-actions"><div class="seg">${[[App.addDays(App.today(), -1), 'Yesterday'], [App.today(), 'Today'], [App.addDays(App.today(), 1), 'Tomorrow']].map(([d, l]) => `<label><input type="radio" name="dd" value="${d}" data-act-change="drvDay" ${day === d ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div></div>
      ${list.length ? list.map(({ j, l }) => `<a class="card drv-load ${l.delivered ? 'done' : ''}" href="#/driver/${j.id}/${l.id}"><div class="row" style="justify-content:space-between;align-items:flex-start"><b class="dn">${e(st.displayNumber(j))} load ${l.n} of ${j.job.loads.length}</b>${l.delivered ? '<span class="tag ok">Delivered</span>' : '<span class="tag warn">To go</span>'}</div>
        <p class="da">${e(j.siteAddress || 'No site address')}</p><p class="hint">${e(j.client.company || j.client.name)}${j.client.phone ? ', ' + e(j.client.phone) : ''}. ${(l.frameIds || []).length} items, ${Math.round(D.kg(j, l)).toLocaleString('en-NZ')} kg</p></a>`).join('')
      : '<div class="empty"><h2>No deliveries booked</h2><p>Loads booked on a job\'s Frames and deliveries tab show here.</p></div>'}</div>`;
  };
  A.drvDay = el => { App.state.drvDay = el.value; App.refresh(); };
  D.loadView = (jid, lid) => {
    const j = st.get(jid); const l = j && (j.job.loads || []).find(x => x.id === lid); if (!l) return '<div class="empty"><h2>Load not found</h2><a class="btn" href="#/driver">Back</a></div>';
    App.cur = j; const frames = App.Docs.jobFrames(j).filter(f => (l.frameIds || []).includes(f.id));
    const key = `${jid}|${lid}`; const ph = D.photos[key] || [];
    const map = j.siteAddress ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.siteAddress)}` : '';
    if (l.delivered) return `<div class="drv"><p class="crumbs"><a href="#/driver">Deliveries</a></p><h1>${e(j.siteAddress || '')}</h1><div class="card"><p><span class="tag ok">Delivered</span> ${l.signed ? `Signed for by <b>${e(l.signed.name)}</b>, ${App.fmtStamp(l.signed.at)}` : ''}</p>${l.signed && l.signed.link ? `<a class="btn" href="${e(l.signed.link)}" target="_blank" rel="noopener">Open the signed docket</a>` : ''}</div></div>`;
    return `<div class="drv"><p class="crumbs"><a href="#/driver">Deliveries</a></p><p class="sub" style="margin:0">${e(st.displayNumber(j))} load ${l.n} of ${j.job.loads.length}</p><h1 style="margin:4px 0 12px">${e(j.siteAddress || 'No site address')}</h1>
      <div class="drv-btns">${map ? `<a class="btn big" href="${map}" target="_blank" rel="noopener">Directions</a>` : ''}${j.client.phone ? `<a class="btn big" href="tel:${e(j.client.phone.replace(/\s/g, ''))}">Call ${e((j.client.name || 'client').split(' ')[0])}</a>` : ''}</div>
      <section class="card"><h3>On this load</h3>${frames.length ? `<p>${frames.map(f => `${e(f.name)}${f.qty > 1 ? ' ×' + f.qty : ''}`).join(', ')}</p>` : '<p class="hint">No frames listed for this load.</p>'}<p class="hint">${Math.round(D.kg(j, l)).toLocaleString('en-NZ')} kg</p></section>
      <section class="card"><h3>Photos of the drop</h3><div class="drv-ph">${ph.map((p, i) => `<span><img src="${p}" alt="Photo ${i + 1}"><button class="icon-btn" data-act="drvPhDel" data-i="${i}" aria-label="Remove photo">✕</button></span>`).join('')}</div>
        <label class="btn big">Take a photo<input type="file" accept="image/*" capture="environment" hidden data-act-change="drvPhoto"></label></section>
      <section class="card"><h3>Signed for by</h3>${App.field('Their name', `<input id="drv-name" value="${e(App.state.drvName || '')}" autocomplete="off">`)}
        <div class="sig-wrap"><canvas id="drv-sig" aria-label="Signature box"></canvas><button class="btn small ghost" data-act="drvSigClear">Clear</button></div><p class="hint">Sign with a finger in the box.</p></section>
      <button class="btn primary big" style="width:100%" data-act="drvDone" data-j="${jid}" data-l="${lid}">Mark delivered</button>
      <p class="hint" style="text-align:center">Makes the signed docket, saves it to the job, and opens an email to ${e(j.client.email || 'the client')} for you to send.</p></div>`;
  };
  /* signature pad */
  App.views.driver.mount = (jid, lid) => {
    const c = document.getElementById('drv-sig'); if (!c) return;
    const r = c.getBoundingClientRect(); const k = window.devicePixelRatio || 1; c.width = r.width * k; c.height = r.height * k;
    const x = c.getContext('2d'); x.scale(k, k); x.lineWidth = 2.6; x.lineCap = 'round'; x.strokeStyle = '#15171a'; D.sigDirty = false;
    let on = false; const pt = ev => { const b = c.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
    c.addEventListener('pointerdown', ev => { on = true; c.setPointerCapture(ev.pointerId); const [a, b2] = pt(ev); x.beginPath(); x.moveTo(a, b2); });
    c.addEventListener('pointermove', ev => { if (!on) return; const [a, b2] = pt(ev); x.lineTo(a, b2); x.stroke(); D.sigDirty = true; });
    c.addEventListener('pointerup', () => { on = false; });
    const n = document.getElementById('drv-name'); if (n) n.oninput = () => { App.state.drvName = n.value; };
  };
  A.drvSigClear = () => { const c = document.getElementById('drv-sig'); c.getContext('2d').clearRect(0, 0, c.width, c.height); D.sigDirty = false; };
  /* photos are shrunk so the docket stays a sensible size */
  A.drvPhoto = async el => {
    const f = el.files[0]; if (!f) return; const r = App.route(); const key = `${r.a}|${r.b}`;
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    const sc = Math.min(1, 1400 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * sc; c.height = img.height * sc;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    (D.photos[key] = D.photos[key] || []).push(c.toDataURL('image/jpeg', 0.82)); App.refresh();
  };
  A.drvPhDel = el => { const r = App.route(); D.photos[`${r.a}|${r.b}`].splice(+el.dataset.i, 1); App.refresh(); };

  /* the signed docket: the customer docket, plus photos and the signature */
  D.signedSpec = (j, l) => {
    const spec = App.Docs.docket(j, l, 'customer'); const s2 = l.signed || {};
    const photos = (s2.photos || []).slice(0, 4);
    spec.flow = spec.flow.concat([
      App.Docs.blk(`<div class="signed-stamp">Delivered and signed</div>`),
      photos.length ? App.Docs.blk(`${App.Docs.h2('Photos of the drop')}<div class="inc-photos">${photos.map(p => `<img src="${p}" alt="">`).join('')}</div>`) : ''
    ].filter(Boolean));
    spec.bottom = `<div class="signed-box"><div><p class="l">Received by</p><p class="v">${e(s2.name || '')}</p><p class="s">Signed on site, ${App.fmtStamp(s2.at)}${s2.by ? `. Delivered by ${e(s2.by)}` : ''}</p></div><div class="sig">${s2.sig ? `<img src="${s2.sig}" alt="Signature">` : ''}</div></div>`;
    return spec;
  };
  A.drvDone = async el => {
    const j = st.get(el.dataset.j); const l = j.job.loads.find(x => x.id === el.dataset.l); const key = `${j.id}|${l.id}`;
    const name = (document.getElementById('drv-name') || {}).value || ''; if (!name.trim()) return App.toast('Add the name of who signed', 'err');
    if (!D.sigDirty) return App.toast('Get them to sign in the box', 'err');
    const sig = document.getElementById('drv-sig').toDataURL('image/png');
    l.signed = { name: name.trim(), at: Date.now(), by: st.me().name, sig, photos: D.photos[key] || [] };
    l.delivered = true; l.deliveredAt = Date.now(); st.log(j, `Load ${l.n} delivered, signed for by ${name.trim()}`);
    if (j.job.loads.every(x => x.delivered) && ['delivery', 'yard', 'manufacturing', 'scheduled'].includes(j.job.stage)) { j.job.stage = 'delivered'; (j.job.stageLog = j.job.stageLog || []).push({ stage: 'delivered', at: Date.now(), by: st.me().name }); }
    st.touch(j); st.save(); App.state.drvName = '';
    App.toast('Making the signed docket…');
    let blob = null;
    try { blob = await App.Docs.toPdf(D.signedSpec(j, l)); } catch (er) { App.toast('Couldn\'t make the PDF: ' + er.message, 'err', 6000); }
    const fname = `${st.displayNumber(j)} Delivery ${l.n} signed.pdf`;
    if (blob && st.mode === 'drive') {
      try {
        const fo = await st.subFolder(j, 'Dockets and checklists'); const up = await App.G.uploadOrReplace({ name: fname, parent: fo, blob, mime: 'application/pdf' });
        l.signed.link = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
        const pf = await st.subFolder(j, 'Delivery photos');
        for (const [i, p] of (l.signed.photos || []).entries()) await App.G.uploadOrReplace({ name: `${st.displayNumber(j)} Delivery ${l.n} photo ${i + 1}.jpg`, parent: pf, blob: await (await fetch(p)).blob(), mime: 'image/jpeg' });
        /* the photos and signature live in Drive now, so keep the app's data small */
        l.signed.photos = []; l.signed.photoCount = (D.photos[key] || []).length; st.touch(j); st.save();
      } catch (er) { App.toast('Saved here, but not to Drive yet: ' + er.message, 'err', 7000); }
    }
    delete D.photos[key];
    if (blob && j.client.email && st.mode === 'drive') {
      const first = (j.client.name || '').split(' ')[0] || 'there';
      App.mail.compose({ title: 'Email the signed docket', est: j, kind: 'docket', to: j.client.email, subject: `Delivered: ${st.displayNumber(j)}, load ${l.n} of ${j.job.loads.length}`,
        body: `Hi ${first},\n\nYour delivery for ${j.heading || 'your job'} (load ${l.n} of ${j.job.loads.length}) was dropped off and signed for by ${l.signed.name}. The signed docket is attached.\n\nPlease check the frames within 2 days and let us know if anything's missing or damaged.\n\nCheers,`,
        extra: [{ name: fname, mime: 'application/pdf', base64: await App.blobToBase64(blob) }], onSent: () => { st.log(j, `Signed docket for load ${l.n} emailed to ${j.client.email}`); st.save(); } });
    }
    App.refresh();
  };

  /* ---------- Compliance pack ---------- */
  const DOCS = [['ps1', 'Producer statement, design (PS1)', 'From the engineer'], ['mill', 'Steel mill certificates', 'Axxis / NZ Steel'], ['nash', 'NASH member statement', 'Your standard document (Settings, Company)'], ['detailing', 'Frame list and detailing', 'From the Detailing tab'], ['dockets', 'Delivery dockets, signed', 'From the driver'], ['warranty', 'Warranty', 'Made from your warranty wording'], ['ps3', 'Producer statement, construction (PS3)', 'If needed']];
  D.comp = est => { est.job.compliance = est.job.compliance || {}; return est.job.compliance; };
  D.compTab = est => {
    const c = D.comp(est); const loads = (est.job.loads || []).filter(l => l.signed && l.signed.link); const sets = App.Detailing ? App.Detailing.forEst(est) : [];
    const status = k => {
      if (k === 'dockets') return loads.length ? ['ok', `${loads.length} of ${(est.job.loads || []).length} signed`] : ['warn', 'None signed yet'];
      if (k === 'detailing') return sets.length ? ['ok', `${sets.length} set${sets.length === 1 ? '' : 's'}`] : ['', 'None uploaded'];
      if (k === 'warranty') return S().company.warranty ? ['ok', 'Ready'] : ['warn', 'Add your warranty wording in Settings, Company'];
      if (k === 'nash') return S().company.nashFile ? ['ok', 'Ready'] : ['warn', 'Upload it once in Settings, Company'];
      if (c[k] && c[k].na) return ['', 'Not needed'];
      return c[k] && c[k].files && c[k].files.length ? ['ok', `${c[k].files.length} file${c[k].files.length === 1 ? '' : 's'}`] : ['warn', 'Not uploaded'];
    };
    return `<section class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><h3 style="margin:0">Compliance pack</h3><span class="row"><button class="btn" data-act="compBuild">Download PDF</button><button class="btn primary" data-act="compEmail">Email to the builder</button></span></div>
      <p class="hint">Everything the builder or council needs, bundled into one PDF with a cover page and contents. Saved to the job folder in Drive.</p>
      <table class="wtable"><tbody>${DOCS.map(([k, l, src]) => { const [cls, txt] = status(k); const upl = ['ps1', 'mill', 'ps3'].includes(k);
        return `<tr><td><b>${l}</b><div class="hint">${src}</div></td><td><span class="tag ${cls}">${e(txt)}</span></td><td class="r nowrap">${upl ? `<label class="btn small">Upload<input type="file" accept="application/pdf" multiple hidden data-act-change="compUp" data-k="${k}"></label>${k !== 'mill' ? `<button class="btn small ghost" data-act="compNa" data-k="${k}">${c[k] && c[k].na ? 'Needed' : 'Not needed'}</button>` : ''}` : ''}</td></tr>`; }).join('')}</tbody></table></section>`;
  };
  A.compUp = async el => {
    const est = App.cur; const k = el.dataset.k; const c = D.comp(est); if (st.mode !== 'drive') return App.toast('Connect Google first', 'err');
    try { const fo = await st.subFolder(est, 'Compliance'); c[k] = c[k] || { files: [] }; c[k].na = false;
      for (const f of el.files) { const up = await App.G.uploadOrReplace({ name: f.name, parent: fo, blob: f, mime: 'application/pdf' }); c[k].files.push({ name: f.name, id: up.id }); }
      st.touch(est); st.save(); App.refresh(); App.toast('Uploaded'); } catch (er) { App.toast(er.message, 'err'); }
  };
  A.compNa = el => { const est = App.cur; const c = D.comp(est); const k = el.dataset.k; c[k] = c[k] || { files: [] }; c[k].na = !c[k].na; st.touch(est); st.save(); App.refresh(); };
  D.coverSpec = (est, list) => {
    const R = App.Reports, Dd = App.Docs;
    const flow = [Dd.blk(`<div class="cards3"><div class="card"><p class="l">Site</p><p class="v">${e(est.siteAddress || '')}</p></div><div class="card"><p class="l">Builder</p><p class="v">${e(est.client.company || est.client.name)}</p></div><div class="card"><p class="l">Job</p><p class="v">${e(st.displayNumber(est))}</p></div></div>`),
      R.section('Contents', R.table(['', 'Document'], list.map((t, i) => [String(i + 1), e(t)])))];
    if (S().company.warranty) flow.push(R.section('Warranty', `<div class="note"><p>${App.textToHtml(App.fill(S().company.warranty, st.vars(est, {})))}</p></div>`));
    return R.spec('Compliance pack', est.siteAddress || st.displayNumber(est), [['Job', st.displayNumber(est)], ['Builder', est.client.company || est.client.name]], flow, 'estimate');
  };
  D.buildPack = async est => {
    if (!window.PDFLib) await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
    const c = D.comp(est); const parts = []; const list = [];
    const addDrive = async (id, label) => { try { parts.push(new Uint8Array(await (await App.G.getBlob(id)).arrayBuffer())); list.push(label); } catch (er) { /* skip a file we can't read */ } };
    for (const f of ((c.ps1 || {}).files || [])) await addDrive(f.id, 'Producer statement (PS1): ' + f.name);
    for (const f of ((c.mill || {}).files || [])) await addDrive(f.id, 'Mill certificate: ' + f.name);
    if (S().company.nashFile) await addDrive(S().company.nashFile, 'NASH member statement');
    if (App.Detailing) for (const set of App.Detailing.forEst(est)) for (const f of set.files.filter(x => x.kind === 'pdf' && x.driveId)) await addDrive(f.driveId, `${f.label}: ${set.desc}`);
    for (const l of (est.job.loads || []).filter(x => x.signed && x.signed.link)) { const m = l.signed.link.match(/\/d\/([^/]+)/); if (m) await addDrive(m[1], `Delivery docket ${l.n}, signed by ${l.signed.name}`); }
    for (const f of ((c.ps3 || {}).files || [])) await addDrive(f.id, 'Producer statement (PS3): ' + f.name);
    if (S().company.warranty) list.push('Warranty (on the cover page)');
    const cover = new Uint8Array(await (await App.Docs.toPdf(D.coverSpec(est, list))).arrayBuffer());
    const out = await PDFLib.PDFDocument.create();
    for (const bytes of [cover].concat(parts)) { try { const src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p)); } catch (er) { /* skip */ } }
    const blob = new Blob([await out.save()], { type: 'application/pdf' }); const name = `${st.displayNumber(est)} Compliance pack.pdf`;
    if (st.mode === 'drive') { try { await App.G.uploadOrReplace({ name, parent: await st.subFolder(est, 'Compliance'), blob, mime: 'application/pdf' }); } catch (er) { /* still give them the file */ } }
    return { blob, name };
  };
  A.compBuild = async () => { if (st.mode !== 'drive') return App.toast('Connect Google first', 'err'); App.toast('Putting the pack together…'); try { const p = await D.buildPack(App.cur); App.download(p.name, p.blob, 'application/pdf'); App.toast('Downloaded, and saved in the job\'s Compliance folder'); } catch (er) { App.toast(er.message, 'err', 6000); } };
  A.compEmail = async () => {
    const est = App.cur; if (!est.client.email) return App.toast('Add the client\'s email first', 'err'); if (st.mode !== 'drive') return App.toast('Connect Google first', 'err');
    App.toast('Putting the pack together…');
    try { const p = await D.buildPack(est); const first = (est.client.name || '').split(' ')[0] || 'there';
      App.mail.compose({ title: 'Email the compliance pack', est, kind: 'compliance', to: est.client.email, subject: `Compliance pack: ${st.displayNumber(est)}, ${est.siteAddress || est.heading || ''}`, body: `Hi ${first},\n\nPlease find attached the compliance pack for ${est.siteAddress || est.heading || 'the job'}: the producer statement, steel certificates, NASH statement, detailing, signed delivery dockets and warranty.\n\nCheers,`, extra: [{ name: p.name, mime: 'application/pdf', base64: await App.blobToBase64(p.blob) }],
        onSent: () => { D.comp(est).sentAt = Date.now(); st.log(est, 'Compliance pack emailed to ' + est.client.email); st.touch(est); st.save(); } });
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
})();
