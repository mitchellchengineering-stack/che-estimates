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
    const behalf = s2.type === 'driver';
    spec.flow = spec.flow.concat([
      App.Docs.blk(behalf ? `<div class="signed-stamp amber">Left on site, no one present</div>${s2.where ? `<p class="left-where"><b>Where it was left:</b> ${e(s2.where)}</p>` : ''}` : `<div class="signed-stamp">Delivered and signed</div>`),
      photos.length ? App.Docs.blk(`${App.Docs.h2('Photos of the drop')}<div class="inc-photos">${photos.map(p => `<img src="${p}" alt="">`).join('')}</div>`) : ''
    ].filter(Boolean));
    spec.bottom = `<div class="signed-box"><div><p class="l">${behalf ? 'Signed for the client by the driver' : 'Received by'}</p><p class="v">${e(behalf ? (s2.by || s2.name || '') : (s2.name || ''))}</p><p class="s">${behalf ? `No one on site. Signed ${App.fmtStamp(s2.at)}` : `Signed on site, ${App.fmtStamp(s2.at)}${s2.by ? `. Delivered by ${e(s2.by)}` : ''}`}</p></div><div class="sig">${s2.sig ? `<img src="${s2.sig}" alt="Signature">` : ''}</div></div>`;
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

  /* ---------- CH Delivery app: drivers, and deliveries coming back from it ---------- */
  D.hash = async (name, pin) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(name).trim().toLowerCase() + ':' + String(pin).trim())); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
  D.appLink = () => { const u = (S().emails && S().emails.trackingUrl) || ''; const m = u.match(/\/s\/([^/]+)\/exec/); const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, ''); return m ? `${base}delivery.html?h=${m[1]}` : ''; };
  D.teamCard = () => {
    const list = (S().drivers || []).filter(x => !x.deleted); const link = D.appLink(); const cfg = S().driverApp || {};
    return `<section class="card"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Drivers (CH Delivery app)</h3><button class="btn small primary" data-act="drvAdd">+ Add a driver</button></div>
      <p class="hint">Drivers use the CH Delivery app with their name and a PIN. They only see their deliveries: no prices, clients' money or settings, and no Google account is needed.</p>
      ${list.length ? `<table class="wtable"><thead><tr><th>Driver</th><th>PIN</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td><b>${e(x.name)}</b>${x.active === false ? ' <span class="tag">Turned off</span>' : ''}</td><td>••••</td><td class="r nowrap"><button class="btn small" data-act="drvPin" data-id="${x.id}">Change PIN</button><button class="btn small ghost" data-act="drvToggle" data-id="${x.id}">${x.active === false ? 'Turn on' : 'Turn off'}</button><button class="icon-btn" data-act="drvDel" data-id="${x.id}" aria-label="Remove">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="hint">No drivers yet.</p>'}
      <div class="fld" style="margin-top:12px"><span>The app link to send drivers</span>${link ? `<div class="row"><input readonly value="${e(link)}" onclick="this.select()"><button class="btn small" data-act="drvCopy">Copy</button></div><p class="hint">They open it on their phone, then Add to Home Screen (iPhone: Share, Add to Home Screen. Samsung: menu, Add to home screen). It works through your helper script.</p>` : '<div class="banner warn">Set up the helper web app link in Settings, Emails first. The driver app runs through it.</div>'}</div>
      <label class="check" style="margin-top:10px"><input type="checkbox" data-bind="driverApp.review" ${cfg.review !== false ? 'checked' : ''}> Let me check the signed docket email before it goes to the client</label>
      <p class="hint">Ticked: each delivery shows on Needs you with Review and send. Unticked: the docket is emailed to the client automatically once the app has filed it.</p></section>`;
  };
  const drvSave = () => { S().updatedAt = Date.now(); st.touch(S()); st.save(); App.refresh(); };
  A.drvAdd = () => {
    const m = App.modal('Add a driver', `${App.field('Name (what they type to sign in)', '<input id="dv-n" autocomplete="off">')}${App.field('PIN (4 to 6 numbers)', '<input id="dv-p" inputmode="numeric" maxlength="6" autocomplete="off">')}<p class="hint">Tell them their PIN in person or by text. It isn't shown again.</p>`, { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="dv-ok">Add</button>' });
    m.querySelector('#dv-ok').onclick = async () => {
      const n = m.querySelector('#dv-n').value.trim(), p = m.querySelector('#dv-p').value.trim();
      if (!n) return App.toast('Add their name', 'err'); if (!/^\d{4,6}$/.test(p)) return App.toast('The PIN should be 4 to 6 numbers', 'err');
      if ((S().drivers || []).some(x => !x.deleted && x.name.toLowerCase() === n.toLowerCase())) return App.toast('There\'s already a driver with that name', 'err');
      (S().drivers = S().drivers || []).push({ id: App.uid(), name: n, pinHash: await D.hash(n, p), active: true, addedAt: Date.now() }); App.closeModal(); drvSave(); App.toast(`${n} added`);
    };
  };
  A.drvPin = el => {
    const x = S().drivers.find(z => z.id === el.dataset.id);
    const m = App.modal(`New PIN for ${x.name}`, App.field('PIN (4 to 6 numbers)', '<input id="dv-p" inputmode="numeric" maxlength="6" autocomplete="off">'), { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="dv-ok">Save</button>' });
    m.querySelector('#dv-ok').onclick = async () => { const p = m.querySelector('#dv-p').value.trim(); if (!/^\d{4,6}$/.test(p)) return App.toast('The PIN should be 4 to 6 numbers', 'err'); x.pinHash = await D.hash(x.name, p); App.closeModal(); drvSave(); App.toast('PIN changed'); };
  };
  A.drvToggle = el => { const x = S().drivers.find(z => z.id === el.dataset.id); x.active = x.active === false; drvSave(); };
  A.drvDel = async el => { const x = S().drivers.find(z => z.id === el.dataset.id); if (!(await App.confirm(`Remove ${x.name}?`, 'They won\'t be able to sign in to CH Delivery any more.', 'Remove'))) return; x.deleted = true; drvSave(); };
  A.drvCopy = async () => { try { await navigator.clipboard.writeText(D.appLink()); App.toast('Link copied'); } catch (er) { App.toast(D.appLink()); } };

  /* deliveries finished in the CH Delivery app: mark the load delivered, then file the signed docket */
  D.applyLog = list => {
    let changed = false;
    (list || []).forEach(r => {
      const est = st.get(r.jobId); const l = est && est.job && (est.job.loads || []).find(x => x.id === r.loadId); if (!l) return;
      if (l.signed && l.signed.recId === r.uid) return;
      l.delivered = true; l.deliveredAt = r.at;
      l.signed = { recId: r.uid, name: r.signer.name, type: r.signer.type, where: r.signer.where || '', at: r.at, by: r.driver, sigId: r.sigId, photoIds: r.photoIds || [], folderId: r.folderId, emailState: 'filing' };
      st.log(est, r.signer.type === 'driver' ? `Load ${l.n} left on site by ${r.driver} (no one there): ${r.signer.where}` : `Load ${l.n} delivered by ${r.driver}, signed for by ${r.signer.name}`);
      if (est.job.loads.every(x => x.delivered) && ['delivery', 'yard', 'manufacturing', 'scheduled'].includes(est.job.stage)) { est.job.stage = 'delivered'; (est.job.stageLog = est.job.stageLog || []).push({ stage: 'delivered', at: Date.now(), by: r.driver }); }
      st.touch(est); changed = true;
    });
    if (changed) { st.save(); App.refresh(); }
    setTimeout(D.fileAll, 500);
  };
  const toData = async id => { const b = await App.G.getBlob(id); return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }); };
  D.fileAll = async () => {
    if (D.filing || st.mode !== 'drive') return; D.filing = true;
    try {
      for (const est of (App.Jobs ? App.Jobs.list() : [])) for (const l of (est.job.loads || [])) {
        const s2 = l.signed; if (!s2 || s2.emailState !== 'filing') continue;
        if (s2.claim && s2.claim.by !== st.me().email && Date.now() - s2.claim.at < 5 * 60000) continue;
        s2.claim = { by: st.me().email, at: Date.now() }; st.touch(est); st.save();
        try {
          const sig = s2.sigId ? await toData(s2.sigId) : ''; const photos = []; for (const id of (s2.photoIds || []).slice(0, 6)) { try { photos.push(await toData(id)); } catch (er) { /* skip */ } }
          const view = Object.assign({}, l, { signed: Object.assign({}, s2, { sig, photos }) });
          const blob = await App.Docs.toPdf(D.signedSpec(est, view));
          const fname = `${st.displayNumber(est)} Delivery ${l.n} signed.pdf`;
          const up = await App.G.uploadOrReplace({ name: fname, parent: await st.subFolder(est, 'Dockets and checklists'), blob, mime: 'application/pdf' });
          s2.pdfId = up.id; s2.link = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
          const pf = await st.subFolder(est, 'Delivery photos');
          for (const id of (s2.photoIds || [])) { try { await App.G.api(`${App.G.D}/${id}?addParents=${pf}${s2.folderId ? '&removeParents=' + s2.folderId : ''}&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (er) { /* leave it in Deliveries */ } }
          s2.emailState = !est.client.email ? 'noemail' : (S().driverApp || {}).review === false ? 'auto' : 'review';
          st.touch(est); st.save();
          if (s2.emailState === 'auto') await D.sendDocket(est, l, blob, true);
        } catch (er) { s2.claim = null; st.touch(est); st.save(); console.error(er); }
      }
    } finally { D.filing = false; App.refresh(); }
  };
  D.docketEmail = (est, l) => { const s2 = l.signed; const first = (est.client.name || '').split(' ')[0] || 'there';
    return { to: est.client.email, subject: `Delivered: ${st.displayNumber(est)}, load ${l.n} of ${est.job.loads.length}`,
      body: `Hi ${first},

Your delivery for ${est.heading || 'your job'} at ${est.siteAddress || 'site'} (load ${l.n} of ${est.job.loads.length}) was dropped off ${s2.type === 'driver' ? `with no one on site. ${s2.by} left it ${s2.where ? s2.where.charAt(0).toLowerCase() + s2.where.slice(1) : 'on site'} and signed for it` : `and signed for by ${s2.name}`}. The signed docket and photos are attached.

Please check the frames within 2 working days and let us know if anything's missing or damaged.

Cheers,` }; };
  D.sendDocket = async (est, l, blob, auto) => {
    const s2 = l.signed; const em = D.docketEmail(est, l);
    blob = blob || (s2.pdfId ? await App.G.getBlob(s2.pdfId) : null); if (!blob) return App.toast('The signed docket isn\'t saved yet', 'err');
    const att = [{ name: `${st.displayNumber(est)} Delivery ${l.n} signed.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) }];
    const done = () => { s2.emailState = 'sent'; s2.emailedAt = Date.now(); st.log(est, `Signed docket for load ${l.n} emailed to ${est.client.email}`); st.touch(est); st.save(); App.refresh(); };
    if (auto) { try { await App.G.send({ to: em.to, subject: em.subject, html: await App.mail.html(em.body, est, 'docket'), attachments: att }); done(); } catch (er) { s2.emailState = 'review'; st.touch(est); st.save(); } return; }
    App.mail.compose({ title: 'Email the signed docket', est, kind: 'docket', to: em.to, subject: em.subject, body: em.body, extra: att, onSent: done });
  };
  A.drvReview = async el => { const est = st.get(el.dataset.j); const l = est.job.loads.find(x => x.id === el.dataset.l); App.cur = est; App.toast('Getting the signed docket…'); try { await D.sendDocket(est, l, null, false); } catch (er) { App.toast(er.message, 'err'); } };
  A.drvSkip = el => { const est = st.get(el.dataset.j); const l = est.job.loads.find(x => x.id === el.dataset.l); l.signed.emailState = 'skipped'; st.touch(est); st.save(); App.refresh(); };
  D.needs = () => {
    const out = [];
    (App.Jobs ? App.Jobs.list() : []).forEach(est => (est.job.loads || []).forEach(l => {
      const s2 = l.signed; if (!s2 || !s2.recId) return;
      if (s2.emailState === 'review') out.push({ lvl: s2.type === 'driver' ? 'amber' : 'blue', t: s2.type === 'driver' ? `${st.displayNumber(est)} load ${l.n} left on site, signed by ${s2.by} for the client` : `${st.displayNumber(est)} load ${l.n} delivered, signed by ${s2.name}`, s: `${s2.by}, ${App.fmtStamp(s2.at)}. ${(s2.photoIds || []).length} photos. Email the signed docket to ${est.client.company || est.client.name}?`, b: 'Review and send', act: 'drvReview', data: { j: est.id, l: l.id } });
      if (s2.emailState === 'noemail') out.push({ lvl: 'blue', t: `${st.displayNumber(est)} load ${l.n} delivered`, s: `Signed docket saved to the job. There's no client email to send it to.`, b: 'Open job', href: `#/job/${est.id}` });
    }));
    return out;
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
