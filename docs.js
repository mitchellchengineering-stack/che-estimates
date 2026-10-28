/* Printable documents, laid out as real A4 pages.
   Every page gets the same header (full on page 1, running after), footer and one watermark.
   Long lists split across pages and carry on under a running header. */
App.Docs = {
  e: App.esc,
  imgCache: {},
  W: 794, H: 1123,

  async ensureImage(est) {
    if (!est.image) return null;
    const key = est.image.driveId || est.id;
    if (this.imgCache[key]) return this.imgCache[key];
    if (est.image.data) return (this.imgCache[key] = est.image.data);
    if (est.image.driveId && App.store.mode === 'drive') {
      try { const b = await App.G.getBlob(est.image.driveId); this.imgCache[key] = await App.readFile(b); return this.imgCache[key]; } catch (e) { return null; }
    }
    return null;
  },
  imgUrl(est) { if (!est.image) return null; return est.image.data || this.imgCache[est.image.driveId] || null; },

  /* ---------- building blocks ---------- */
  co() { return App.store.s().company; },
  fullHead(label, number, meta = [], chips = '') {
    return `<div class="pg-head"><img class="logo" src="logo.png" alt="CH Engineering, steel framed homes">
      <div class="tb">${label ? `<p class="lbl">${this.e(label)}</p>` : ''}<p class="num">${this.e(number)}</p>
      ${meta.length ? `<div class="meta">${meta.filter(m => m[1]).map(m => `<span>${this.e(m[0])}</span><b>${this.e(m[1])}</b>`).join('')}</div>` : ''}
      ${chips ? `<div class="chips end">${chips}</div>` : ''}</div></div>`;
  },
  runHead(number, sub) {
    return `<div class="pg-run"><img src="logo.png" alt="CH Engineering"><div class="tb"><p class="num">${this.e(number)}</p><p class="sub">${this.e(sub)}<span class="cont">continued</span></p></div></div>`;
  },
  footFull() {
    const c = this.co();
    return `<div class="pg-foot"><div class="rule"></div><div class="row">
      <div class="partners"><img class="ax" src="axxis.png" alt="Axxis steel for framing"><img class="na" src="nash.png" alt="NASH member"></div>
      <p class="ctr">${this.e(c.phone)} &#160;|&#160; ${this.e(c.email)} &#160;|&#160; ${this.e(c.website)}</p>
      <p class="pgn">Page <span class="pn"></span> of <span class="pt"></span></p></div>
      <p class="cca">${this.e(c.ccaLine)}</p></div>`;
  },
  footSimple(text) {
    return `<div class="pg-foot"><div class="rule"></div><div class="row"><p>${this.e(text)}</p><p class="pgn">Page <span class="pn"></span> of <span class="pt"></span></p></div></div>`;
  },
  h2(t) { return `<h2 class="h2" data-title="${this.e(t)}">${this.e(t)}</h2>`; },
  blk(inner, cls = '') { return `<section class="blk ${cls}">${inner}</section>`; },
  card(l, v, s) { return `<div class="card"><p class="l">${this.e(l)}</p><p class="v">${this.e(v || '')}</p>${s ? `<p class="s">${this.e(s)}</p>` : ''}</div>`; },
  ticks(items, no = false) { return `<div class="ticks" data-items>${items.map(t => `<span class="tick ${no ? 'no' : ''}"><b>${no ? '–' : '✓'}</b>${this.e(t)}</span>`).join('')}</div>`; },
  chip(t) { return `<span class="chip">${this.e(t)}</span>`; },
  darkChip(t) { return `<span class="chip dark">${this.e(t)}</span>`; },
  yellowChip(t) { return `<span class="chip yel">${this.e(t)}</span>`; },
  sectionsChips(est) {
    return (est.sections || []).filter(s => s.size).map(s => `${s.size}${s.gauges && s.gauges.length ? ', ' + s.gauges.join(' and ') + ' BMT' : ''}`);
  },
  signRow(cols, push) { return `<div class="sign${push ? ' push' : ''}" style="grid-template-columns:${cols.map(c => c[1] || '1fr').join(' ')}">${cols.map(c => `<div><div class="line"></div><span>${this.e(c[0])}</span></div>`).join('')}</div>`; },
  shutdownNote() {
    const sd = App.store.s().estimate.shutdown; const t = App.today();
    if (!sd.showFrom || !sd.closedTo || t < sd.showFrom || t > sd.closedTo) return '';
    return this.blk(`<div class="note yel">${this.e(App.fill(sd.message, { closed_from: App.fmtLong(sd.closedFrom), closed_to: App.fmtLong(sd.closedTo), show_from: App.fmtLong(sd.showFrom) }))}</div>`);
  },
  priceBox(est) {
    const t = App.store.totals(est); const s = App.store.s();
    let top = '';
    if (est.type === 'ft' && t.extras) top = `<div class="sm"><span>Frame and truss${est.delivery && est.delivery.on ? ', delivered' : ''}</span><span>${App.money(t.price)}</span></div><div class="sm"><span>Additional extras</span><span>${App.money(t.extras)}</span></div><div class="rule"></div>`;
    const gst = est.gst ? `<div class="rule"></div><div class="sm"><span>GST 15%</span><span>${App.money(t.gst)}</span></div><div class="sm big2"><span>Total incl GST</span><span>${App.money(t.incl)}</span></div>` : '';
    return `<div class="price">${top}<p class="lbl">Total excl GST</p><p class="big">${App.money(t.sub)}</p>${gst}
      <p class="dep">A ${s.estimate.depositPct}% deposit is required before manufacture.${s.estimate.leadTime ? ` Current lead time: ${this.e(s.estimate.leadTime)}.` : ''}</p></div>`;
  },
  joinNice(a) { a = a.map(x => (x || '').trim()).filter(Boolean); if (a.length < 2) return a.join(''); return a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; },

  /* ---------- estimate ---------- */
  estimate(est) {
    const s = App.store.s(); const st = App.store; const num = st.displayNumber(est);
    const who = est.client.company || est.client.name;
    const meta = [['Date', App.fmtLong(est.date)], ['Valid until', App.fmtLong(est.expiry)], ['Prepared by', est.preparedBy]];
    const img = this.imgUrl(est) ? this.blk(`<div class="img3d"><img src="${this.imgUrl(est)}" alt="3D view of the project"></div>`) : '';
    const deliveryLine = est.delivery && est.delivery.on ? `Delivery to ${est.siteAddress || 'site'}` : null;
    const notListed = `<p class="nl">${this.e(s.estimate.notListed)}</p>`;
    const opts = (est.options || []).filter(o => o.desc);
    const optBox = opts.length ? `<div class="extras"><p class="t">Optional extras <span>(not included in the total)</span></p>${opts.map(o => `<div class="exrow"><span>${this.e(o.desc)}</span><b>${App.num(o.price) ? App.money(o.price) : 'Price on request'}</b></div>`).join('')}</div>` : '';
    const flow = [];
    let bottom;

    if (est.type !== 'ft') {
      const b = est.building || {};
      flow.push(this.blk(`<div class="cards3">${this.card('Client', est.client.name || est.client.company, est.client.email || est.client.phone)}${this.card('Job', est.heading, est.client.company && est.client.name ? est.client.company : '')}${this.card('Site', est.siteAddress)}</div>`));
      if (img) flow.push(img);
      if (est.description) flow.push(this.blk(`<p class="desc">${App.textToHtml(est.description)}</p>`));
      const stats = [['Size', b.width && b.depth ? `${b.width}m x ${b.depth}m` : ''], ['Stud height', b.studHeight ? b.studHeight + 'm' : ''], ['Roof pitch', b.roofPitch ? b.roofPitch + '°' : ''], ['Floor area', b.floorArea ? b.floorArea + 'm²' : '']].filter(x => x[1]);
      flow.push(this.blk(`${this.h2('The building')}${stats.length ? `<div class="stats" style="grid-template-columns:repeat(${stats.length},minmax(0,1fr))">${stats.map(x => `<div class="stat"><p class="l">${x[0]}</p><p class="v">${this.e(x[1])}</p></div>`).join('')}</div>` : ''}
        <div class="chips">${this.sectionsChips(est).map(c => this.chip(c)).join('')}<span class="chip-note">${this.e(s.estimate.steelSpec)}</span></div>`));
      const incl = (est.inclusions || []).filter(Boolean); if (deliveryLine) incl.push(deliveryLine);
      if (incl.length) flow.push(this.blk(`${this.h2('What\'s included')}${this.ticks(incl)}`));
      if (est.notes) flow.push(this.blk(`<div class="note"><p class="t">Notes</p><p>${App.textToHtml(est.notes)}</p></div>`));
      const sd = this.shutdownNote(); if (sd) flow.push(sd);
      bottom = `<div class="bottom"><div class="left">${optBox}${notListed}</div>${this.priceBox(est)}</div>${est.showAcceptance ? this.signRow([['Signed', '2fr'], ['Name', '2fr'], ['Date', '1fr']]) : ''}`;
    } else {
      const ft = est.ft; const c = ft.criteria;
      const plans = [ft.plansStage, ft.plansRev ? 'Rev ' + ft.plansRev : ''].filter(Boolean).join(', ');
      flow.push(this.blk(`<div class="cards3">${this.card('Customer', who, est.client.company ? est.client.name : (est.client.email || est.client.phone))}${this.card('Project', ft.projectName || est.heading, est.siteAddress)}${this.card('Plans', plans || 'As supplied', ft.plansDate ? 'Received ' + App.fmtLong(ft.plansDate) : '')}</div>`));
      if (img) flow.push(img);
      const STAR = { 'LGS wall framing': ['LGS wall frames', 'Detailed, manufactured and labelled'], 'LGS roof trusses': ['LGS trusses', 'Engineered roof trusses'], 'LGS floor joists': ['LGS floor joists', 'Manufactured to the detailing'] };
      const secTxt = (est.sections || []).filter(x => /^\d/.test(x.size)).map(x => x.size).join(' and ');
      const stars = Object.keys(STAR).filter(k => ft.scope[k] === 'inc');
      if (stars.length) {
        flow.push(this.blk(`${this.h2('Your frame and truss package')}<div class="stars" style="grid-template-columns:repeat(${stars.length},minmax(0,1fr))">${stars.map(k => `<div class="star"><span class="top"><span class="ck">✓</span><span class="inc">INCLUDED</span></span><span class="t">${STAR[k][0]}</span><span class="s">${this.e(k === 'LGS wall framing' && secTxt ? secTxt + ', ' + STAR[k][1].toLowerCase() : STAR[k][1])}</span></div>`).join('')}</div>
          <p class="cap">${deliveryLine ? 'Delivered to site. ' : ''}Everything else that's included is listed below.</p>`));
      }
      const crit = App.CRITERIA.filter(([k]) => c[k] && c[k].v);
      if (crit.length) flow.push(this.blk(`${this.h2('Frame and truss details')}<div class="kv2" data-items>${crit.map(([k, l]) => `<div class="kvr"><span>${l}</span><b>${this.e(c[k].v)}${c[k].a ? '<i class="assumed">ASSUMED</i>' : ''}</b></div>`).join('')}</div>`));
      flow.push(this.blk(`${this.h2('Steel specification')}<div class="chips">${this.sectionsChips(est).map(x => this.chip(x)).join('')}<span class="chip-note">${this.e(s.estimate.steelSpec)}</span></div>`));
      const also = s.ft.scopeItems.filter(i => ft.scope[i] === 'inc' && !STAR[i]).concat((est.inclusions || []).filter(Boolean));
      if (deliveryLine) also.push(deliveryLine);
      if (also.length) flow.push(this.blk(`${this.h2(stars.length ? 'Also included' : 'What\'s included')}${this.ticks(also)}`));
      const exc = s.ft.scopeItems.filter(i => ft.scope[i] === 'exc');
      if (!deliveryLine) exc.push('Delivery');
      ft.exclusions.filter(x => x.on).forEach(x => exc.push(x.text));
      if (exc.length) flow.push(this.blk(`${this.h2('Not included')}${this.ticks(exc, true)}`));
      if (ft.scope['Material box (fixings)'] === 'inc' && ft.materialBox) flow.push(this.blk(`<div class="note"><p class="t">Material box includes</p><p>${this.e(ft.materialBox)}</p></div>`));
      const notes = (est.description ? [est.description] : []).concat(ft.notes.filter(Boolean)).concat(est.notes ? [est.notes] : []);
      if (notes.length) flow.push(this.blk(`${this.h2('Project notes')}<div class="paras" data-items>${notes.map(n => `<p>${App.textToHtml(n)}</p>`).join('')}</div>`));
      if (ft.conditions.filter(Boolean).length) flow.push(this.blk(`${this.h2('Conditions')}<div class="paras" data-items>${ft.conditions.filter(Boolean).map(p => `<p>${this.e(p)}</p>`).join('')}</div>`));
      const sd = this.shutdownNote(); if (sd) flow.push(sd);
      const extras = (est.extras || []).filter(x => x.desc);
      let exBox = '';
      if (extras.length) {
        exBox = est.extrasMode === 'itemised'
          ? `<div class="extras"><p class="t">Additional extras</p>${extras.map(x => `<div class="exrow"><span>${this.e(x.desc)}</span><b>${App.money(x.price)}</b></div>`).join('')}</div>`
          : `<div class="extras lump"><div><p class="t">Additional extras</p><span>${this.e(est.extrasLabel || this.joinNice(extras.map(x => x.desc)))}</span></div><b>${App.money(App.store.totals(est).extras)}</b></div>`;
      }
      bottom = `<div class="bottom"><div class="left">${exBox}${optBox}${notListed}</div>${this.priceBox(est)}</div>${est.showAcceptance ? this.signRow([['Signed', '2fr'], ['Name', '2fr'], ['Date', '1fr'], ['PO number', '1fr']]) : ''}`;
    }
    const tcs = s.tcs.filter(Boolean);
    const after = tcs.length ? [`<section class="blk tcs"><h1 class="h1" data-title="Terms and conditions">Terms and conditions</h1><ol data-items>${tcs.map(t => { const m = t.match(/^([^:]{2,40}):\s*(.*)$/); return `<li>${m ? `<b>${this.e(m[1])}.</b> ${this.e(m[2])}` : this.e(t)}</li>`; }).join('')}</ol></section>`] : [];
    return {
      head: this.fullHead(est.type === 'ft' ? 'Frame and truss estimate' : 'Estimate', num, meta),
      run: this.runHead(num, [est.heading || (est.ft && est.ft.projectName), who].filter(Boolean).join(', ')),
      foot: this.footFull(), flow, bottom, after, number: num
    };
  },

  /* ---------- workings ---------- */
  workings(est) {
    const st = App.store; const w = est.workings; const c = st.calc(est); const num = st.displayNumber(est);
    const pct = r => App.round((st.lineMk(r, est) - 1) * 100, 1) + '%';
    const flow = [];
    flow.push(this.blk(`<div class="note red"><p>Internal only. Not for the client.</p></div>`));
    if (w.framecad) flow.push(this.blk(`${this.h2('FRAMECAD detailing')}<p>${this.e(w.framecad.fileName)}: ${App.round(w.framecad.totalLM, 2)} LM, ${App.round(w.framecad.totalKg, 1)} kg, ${this.e(App.FC.summaryText(w.framecad))}</p>`));
    flow.push(this.blk(`${this.h2('Steel')}<table class="dt"><thead><tr><th>Section and gauge</th><th class="r">Metres</th><th class="r">Cost/LM</th><th class="r">Cost</th><th class="r">Markup</th><th class="r">Sell</th></tr></thead><tbody data-items>
      ${(w.steel || []).map(r => `<tr><td>${this.e(r.size)} ${this.e(r.gauge)} BMT</td><td class="r">${App.round(App.num(r.lm), 2)}</td><td class="r">${App.money(r.rate)}</td><td class="r">${App.money(st.steelCost(r))}</td><td class="r">${pct(r)}</td><td class="r">${App.money(st.steelCost(r) * st.lineMk(r, est))}</td></tr>`).join('') || '<tr><td colspan="6">None</td></tr>'}</tbody></table>`));
    flow.push(this.blk(`${this.h2('Other lines')}<table class="dt"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Cost</th><th class="r">Markup</th><th class="r">Sell</th></tr></thead><tbody data-items>
      ${(w.lines || []).map(l => `<tr><td>${this.e(l.desc)}${l.bucket !== 'main' ? ` <i>(${l.bucket === 'extra' ? 'extra' : 'option'})</i>` : ''}</td><td class="r">${this.e(l.qty)} ${this.e(l.unit || '')}</td><td class="r">${App.money(l.cost)}</td><td class="r">${App.money(st.lineCost(l))}</td><td class="r">${pct(l)}</td><td class="r">${App.money(st.lineCost(l) * st.lineMk(l, est))}</td></tr>`).join('') || '<tr><td colspan="6">None</td></tr>'}</tbody></table>`));
    if (w.notes) flow.push(this.blk(`${this.h2('Notes')}<div class="paras" data-items>${w.notes.split(/\n{2,}/).map(p => `<p>${App.textToHtml(p)}</p>`).join('')}</div>`));
    if (w.sketch && w.sketch.data) flow.push(this.blk(`${this.h2('Sketch')}<div class="img3d sketch"><img src="${w.sketch.data}" alt="Sketch"></div>`));
    const bottom = `<div class="bottom"><div class="left"></div><div class="price"><div class="sm"><span>Total cost</span><span>${App.money(c.cost)}</span></div><div class="sm"><span>Margin</span><span>${App.pct(c.margin)}</span></div><div class="rule"></div><p class="lbl">Sell from workings</p><p class="big">${App.money(c.sell)}</p><p class="dep">Estimate price: ${App.money(st.totals(est).sub)}</p></div></div>`;
    return { head: this.fullHead('Workings', num, [['Client', est.client.company || est.client.name], ['Job', est.heading], ['Printed', App.fmtLong(App.today())]]), run: this.runHead(num, 'Workings'), foot: this.footSimple('CH Engineering Ltd, internal use'), flow, bottom, after: [], number: num + ' workings' };
  },

  /* ---------- jobs ---------- */
  jobFrames(est) { return (est.job && est.job.frames && est.job.frames.length ? est.job.frames : (est.workings.framecad && est.workings.framecad.frames)) || []; },
  ftype(f) { return /wall|joist|truss|roof|panel/i.test(f.group || '') ? f.group : f.category; },
  countText(frames) { const c = {}; frames.forEach(f => c[f.category] = (c[f.category] || 0) + f.qty); return App.FC.CATS.filter(k => c[k]).map(k => `${c[k]} ${k.toLowerCase()}`).join(', '); },
  checklist(est) {
    const job = est.job || {}; const frames = this.jobFrames(est); const loads = job.loads || []; const st = App.store;
    const groups = loads.length > 1
      ? loads.map(l => { const f = frames.filter(x => (l.frameIds || []).includes(x.id)); return { t: `Delivery ${l.n}`, s: this.countText(f), f }; })
      : App.FC.CATS.map(c => ({ t: c, s: '', f: frames.filter(f => f.category === c) })).filter(g => g.f.length);
    const ticks = (job.checklist && job.checklist.ticks) || {};
    const flow = [this.blk(`<div class="cards3">${this.card('Job', `${st.displayNumber(est)}, ${est.client.company || est.client.name}`)}${this.card('Steel', this.sectionsChips(est).join('; '))}${this.card('Frames', `${frames.length} types, ${frames.reduce((t, f) => t + f.qty, 0)} pieces`)}</div>
      <p class="cap">Tick each frame once it's made and checked.${loads.length > 1 ? ' Built in delivery order, so the first load is ready first.' : ''}</p>`)];
    groups.forEach(g => flow.push(this.blk(`<h2 class="h2" data-title="${this.e(g.t)}">${this.e(g.t)}${g.s ? `<span class="hs">${this.e(g.s)}</span>` : ''}</h2><div class="tgrid" data-items>${g.f.map(f => `<div class="tcell"><b>${this.e(f.name)}${f.qty > 1 ? `<i>x${f.qty}</i>` : ''}</b><span class="box">${ticks[f.id] ? '✓' : ''}</span></div>`).join('')}</div>`)));
    if (!frames.length) flow.push(this.blk('<p>No frames yet. Upload the PDF detailing on the job page.</p>'));
    const bottom = this.signRow([['Foreman sign-off, all frames complete and checked', '2fr'], ['Date', '1fr']], true);
    return { head: this.fullHead('', 'Factory checklist', [], job.manufactureDate ? this.darkChip('Make from ' + App.fmtDate(job.manufactureDate, { weekday: 'short', day: 'numeric', month: 'short' })) : ''), run: this.runHead(st.displayNumber(est), 'Factory checklist'), foot: this.footSimple('CH Engineering Ltd, internal use'), flow, bottom, after: [], number: st.displayNumber(est) };
  },
  docket(est, load, copy) {
    const st = App.store; const job = est.job || {}; const loads = job.loads || []; const all = this.jobFrames(est);
    const frames = load ? all.filter(f => (load.frameIds || []).includes(f.id)) : all;
    const n = load ? `${load.n} of ${loads.length}` : '1 of 1';
    const date = load && load.date ? load.date : '';
    const chips = this.darkChip('Delivery ' + n) + (copy === 'customer' ? this.yellowChip('Customer copy') : this.chip('Our copy'));
    const head = this.fullHead('', 'Delivery docket', [], chips);
    const run = this.runHead(st.displayNumber(est), `Delivery ${n}, ${copy === 'customer' ? 'customer copy' : 'our copy'}`);
    const kg = frames.reduce((t, f) => t + (f.weight || 0) * f.qty, 0);
    if (copy === 'customer') {
      const counts = {}; frames.forEach(f => counts[f.category] = (counts[f.category] || 0) + f.qty);
      const later = {}; if (load) loads.filter(l => l.n > load.n).forEach(l => all.filter(f => (l.frameIds || []).includes(f.id)).forEach(f => { if (!counts[f.category] && !later[f.category]) later[f.category] = l.n; }));
      const cats = App.FC.CATS.filter(c => counts[c] || later[c]);
      const label = { Walls: 'Wall frames', Joists: 'Joists', Trusses: 'Trusses', 'Roof panels': 'Roof panels', Other: 'Other' };
      const flow = [
        this.blk(`<div class="cards3">${this.card('Job', st.displayNumber(est))}${this.card('Delivered', date ? App.fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '')}${this.card('For', est.client.company || est.client.name)}</div><p class="site"><b>Site</b> ${this.e(est.siteAddress)}</p>`),
        this.blk(`${this.h2('On this delivery')}<div class="tiles" style="grid-template-columns:repeat(${Math.max(1, Math.min(4, cats.length))},minmax(0,1fr))">${cats.map(c => counts[c] ? `<div class="tile"><p class="n">${counts[c]}</p><p class="t">${label[c]}</p></div>` : `<div class="tile later"><p class="n">0</p><p class="t">${label[c]}</p><p class="s">Coming on delivery ${later[c]}</p></div>`).join('') || '<p>No frames listed</p>'}</div>`),
        this.blk(`${this.h2('Steel')}<div class="chips">${this.sectionsChips(est).map(x => this.chip(x)).join('')}<span class="chip-note">${this.e(App.store.s().estimate.steelSpec)}</span></div>`),
        this.blk(`<div class="note boxed"><p>Please check this delivery and let us know about any shortage or damage within <b>2 working days</b>. Store frames off the ground, flat and covered until they're installed.</p></div>`)
      ];
      return { head, run, foot: this.footFull(), flow, bottom: this.signRow([['Received by (signature)', '2fr'], ['Name', '2fr'], ['Date', '1fr']], true), after: [], number: st.displayNumber(est) };
    }
    const flow = [
      this.blk(`<div class="cards4">${this.card('Job', st.displayNumber(est))}${this.card('Delivery date', date ? App.fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '')}${this.card('Client', est.client.company || est.client.name)}${this.card('Load weight', kg ? Math.round(kg).toLocaleString('en-NZ') + ' kg' : '')}</div><p class="site"><b>Site</b> ${this.e(est.siteAddress)}</p>`),
      this.blk(`<table class="dt docket"><thead><tr><th>Frame</th><th>Type</th><th class="r">Qty</th><th class="c">Loaded</th><th class="c">Unloaded</th></tr></thead><tbody data-items>${frames.map(f => `<tr><td><b>${this.e(f.name)}</b></td><td>${this.e(this.ftype(f))}</td><td class="r">${f.qty}</td><td class="c"><span class="box"></span></td><td class="c"><span class="box"></span></td></tr>`).join('') || '<tr><td colspan="5">No frames listed</td></tr>'}</tbody></table>`)
    ];
    return { head, run, foot: this.footSimple(`${this.co().name}, ${this.co().address}`), flow, bottom: this.signRow([['Driver'], ['Received by'], ['Date and time']], true), after: [], number: st.displayNumber(est) };
  },
  po(est, po) {
    const tot = po.lines.reduce((a, l) => a + App.num(l.qty) * App.num(l.cost), 0);
    const flow = [
      this.blk(`<div class="cards3">${this.card('Supplier', po.supplier, po.supplierEmail)}${this.card('Deliver to', po.deliverTo || this.co().address)}${this.card('Required by', po.requiredBy ? App.fmtLong(po.requiredBy) : 'As soon as possible')}</div>`),
      this.blk(`<table class="dt"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead><tbody data-items>${po.lines.map(l => `<tr><td>${this.e(l.desc)}</td><td class="r">${this.e(l.qty)} ${this.e(l.unit || '')}</td><td class="r">${App.money(l.cost)}</td><td class="r">${App.money(App.num(l.qty) * App.num(l.cost))}</td></tr>`).join('')}</tbody></table>`)
    ];
    if (po.notes) flow.push(this.blk(`<div class="note"><p>${App.textToHtml(po.notes)}</p></div>`));
    return { head: this.fullHead('Purchase order', po.number, [['Date', App.fmtLong(po.date)], ['Job', App.store.displayNumber(est)]]), run: this.runHead(po.number, 'Purchase order'), foot: this.footFull(), flow, bottom: `<div class="bottom"><div class="left"></div><div class="price"><p class="lbl">Total excl GST</p><p class="big">${App.money(tot)}</p></div></div>`, after: [], number: po.number };
  },

  /* ---------- page layout engine ---------- */
  preload() {
    if (!this._pre) this._pre = Promise.all(['logo.png', 'axxis.png', 'nash.png'].map(src => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = src; })));
    return this._pre;
  },
  async paginate(spec) {
    if (Array.isArray(spec)) {
      const all = []; const host = document.createElement('div'); host.className = 'pg-host'; document.body.appendChild(host);
      for (const sp of spec) { const r = await this.paginate(sp); r.pages.forEach(p => { host.appendChild(p); all.push(p); }); r.host.remove(); }
      return { host, pages: all };
    }
    await this.preload();
    try { await document.fonts.ready; } catch (e) {}
    const host = document.createElement('div'); host.className = 'pg-host'; document.body.appendChild(host);
    const pages = [];
    const toEl = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
    const newPage = first => {
      const p = toEl(`<div class="pg"><img class="pg-wm" src="logo.png" alt=""><div class="pg-bar"></div>${first ? spec.head : spec.run}<div class="pg-body"></div>${spec.foot}</div>`);
      host.appendChild(p); pages.push(p); return p.querySelector('.pg-body');
    };
    const over = b => b.scrollHeight > b.clientHeight + 1;
    const imgsReady = el => Promise.all([...el.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const flowEls = spec.flow.map(toEl);
    const tmp = document.createElement('div'); tmp.style.display = 'none'; flowEls.forEach(x => tmp.appendChild(x)); host.appendChild(tmp);
    await imgsReady(tmp); tmp.remove();
    let body = newPage(true);
    await imgsReady(host);
    const markCont = el => { const h = el.querySelector('[data-title]'); if (h && !h.dataset.cont) { h.dataset.cont = '1'; h.firstChild.textContent = h.dataset.title + ' (continued)'; } };
    const place = (el, guard = 0) => {
      body.appendChild(el);
      if (!over(body)) return;
      body.removeChild(el);
      const items = el.querySelector('[data-items]');
      const kids = items ? [...items.children] : [];
      if (kids.length > 1 && guard < 60) {
        const wasEmpty = !body.children.length;
        const shell = el.cloneNode(true); const sItems = shell.querySelector('[data-items]'); sItems.innerHTML = '';
        body.appendChild(shell); let moved = 0;
        for (const k of kids) { sItems.appendChild(k); if (over(body)) { sItems.removeChild(k); break; } moved++; }
        if (!moved) body.removeChild(shell);
        const rest = kids.slice(moved);
        if (!rest.length) return;
        const next = el.cloneNode(true); const nItems = next.querySelector('[data-items]'); nItems.innerHTML = ''; rest.forEach(r => nItems.appendChild(r));
        if (!moved && wasEmpty) { body.appendChild(next); return; }
        if (moved) markCont(next);
        body = newPage(false);
        return place(next, guard + 1);
      }
      if (!body.children.length || guard > 60) { body.appendChild(el); return; }
      body = newPage(false); return place(el, guard + 1);
    };
    flowEls.forEach(el => place(el));
    if (spec.bottom) {
      const wrap = toEl(`<div class="bottom-wrap">${spec.bottom}</div>`);
      body.appendChild(wrap);
      if (over(body)) {
        body.removeChild(wrap);
        /* keep the last section company on the new page, so the price never sits on a page by itself */
        const last = body.children.length > 1 ? body.lastElementChild : null;
        const prev = body;
        body = newPage(false);
        if (last) { body.appendChild(last); body.appendChild(wrap); if (over(body)) { prev.appendChild(last); } }
        if (!wrap.parentNode) body.appendChild(wrap);
      }
    }
    (spec.after || []).forEach(h => { body = newPage(false); place(toEl(h)); });
    pages.forEach((p, i) => { p.querySelectorAll('.pn').forEach(x => x.textContent = i + 1); p.querySelectorAll('.pt').forEach(x => x.textContent = pages.length); });
    await imgsReady(host);
    return { host, pages };
  },
  async pagesHtml(spec) { const { host, pages } = await this.paginate(spec); const html = pages.map(p => p.outerHTML).join(''); host.remove(); return html; },

  async toPdf(spec) {
    await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    const { host, pages } = await this.paginate(spec);
    try {
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      for (let i = 0; i < pages.length; i++) {
        const canvas = await window.html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: this.W, height: this.H, windowWidth: this.W, logging: false });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
      }
      return pdf.output('blob');
    } finally { host.remove(); }
  },
  async print(spec) {
    const root = document.getElementById('print-root');
    root.innerHTML = await this.pagesHtml(spec);
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    await Promise.all([...root.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    setTimeout(() => window.print(), 150);
  },
  async fill(el, spec) {
    if (!el) return;
    el.innerHTML = '<p class="hint pad">Laying out the pages…</p>';
    const html = await this.pagesHtml(spec);
    if (!el.isConnected) return;
    el.innerHTML = `<div class="pg-stack">${html}</div>`;
    const fit = () => { const s = el.querySelector('.pg-stack'); if (!s) return; s.style.zoom = Math.min(1, (el.clientWidth - 24) / this.W); };
    fit(); window.addEventListener('resize', fit);
  },
  preview(title, spec, { pdfName, onDrive } = {}) {
    const m = App.modal(title, `<div class="doc-preview" id="pv-box"></div>`, {
      wide: true,
      actions: `<button class="btn ghost" data-k="print">Print</button><button class="btn ghost" data-k="pdf">Download PDF</button>${onDrive ? '<button class="btn primary" data-k="drive">Save to Drive</button>' : ''}`
    });
    this.fill(m.querySelector('#pv-box'), spec);
    m.querySelector('[data-k=print]').onclick = () => this.print(spec);
    m.querySelector('[data-k=pdf]').onclick = async e => { const b = e.target; b.disabled = true; b.textContent = 'Making PDF…'; try { App.download(pdfName || 'document.pdf', await this.toPdf(spec)); } catch (er) { App.toast(er.message, 'err'); } b.disabled = false; b.textContent = 'Download PDF'; };
    if (onDrive) m.querySelector('[data-k=drive]').onclick = async e => { const b = e.target; b.disabled = true; b.textContent = 'Saving…'; try { await onDrive(); App.toast('Saved to Drive'); } catch (er) { App.toast(er.message, 'err', 6000); } b.disabled = false; b.textContent = 'Save to Drive'; };
    return m;
  }
};
