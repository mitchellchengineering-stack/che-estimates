/* Printable documents (estimate, workings, checklist, dockets, PO) */
App.Docs = {
  e: App.esc,
  imgCache: {},

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

  band(t) { return `<div class="doc-band">${this.e(t)}</div>`; },
  kv(rows, cls = '') {
    return `<table class="kv ${cls}">${rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(r => `<tr><th>${this.e(r[0])}</th><td>${r[2] ? r[1] : this.e(r[1])}</td></tr>`).join('')}</table>`;
  },
  list(items) { return items.length ? `<ul class="doc-list">${items.map(i => `<li>${this.e(i)}</li>`).join('')}</ul>` : ''; },
  sectionsLines(est) {
    return (est.sections || []).filter(s => s.size).map(s => `${App.sectionLabel(s.size)}${s.gauges && s.gauges.length ? ', ' + s.gauges.map(g => g + ' BMT').join(' and ') : ''}`);
  },
  head(est, title, metaRows) {
    const s = App.store.s();
    return `<div class="doc-head">
      <div class="doc-brand"><img src="assets/logo.png" alt="CH Engineering"><div class="doc-addr">${this.e(s.company.name)}<br>${this.e(s.company.address)}</div></div>
      <div class="doc-titlebox"><h1>${this.e(title)}</h1>${this.kv(metaRows, 'meta')}</div>
    </div>`;
  },
  footer() {
    const c = App.store.s().company;
    return `<div class="doc-foot avoid">
      <div class="partners"><img src="assets/axxis.png" alt="Axxis steel for framing"><img src="assets/nash.png" alt="NASH member"></div>
      <div class="contact">${this.e(c.phone)}<br>${this.e(c.email)}<br>${this.e(c.website)}</div>
      <div class="cca">${this.e(c.ccaLine)}</div>
    </div>`;
  },
  shutdownNote() {
    const sd = App.store.s().estimate.shutdown; const t = App.today();
    if (!sd.showFrom || !sd.closedTo || t < sd.showFrom || t > sd.closedTo) return '';
    return `<div class="doc-note avoid">${this.e(App.fill(sd.message, { closed_from: App.fmtLong(sd.closedFrom), closed_to: App.fmtLong(sd.closedTo), show_from: App.fmtLong(sd.showFrom) }))}</div>`;
  },
  priceBox(est) {
    const t = App.store.totals(est); const s = App.store.s();
    let rows = '';
    if (est.type === 'ft' && t.extras) {
      rows += `<tr><th>Frame and truss total</th><td>${App.money(t.price)}</td></tr><tr><th>Additional extras</th><td>${App.money(t.extras)}</td></tr>`;
    }
    rows += `<tr class="subt"><th>${est.gst ? 'Subtotal (excl GST)' : 'Total (excl GST)'}</th><td>${App.money(t.sub)}</td></tr>`;
    if (est.gst) rows += `<tr><th>GST 15%</th><td>${App.money(t.gst)}</td></tr><tr class="grand"><th>Total (incl GST)</th><td>${App.money(t.incl)}</td></tr>`;
    return `<div class="price-box avoid"><table>${rows}</table>
      <p class="deposit">Please note we require a ${s.estimate.depositPct}% deposit prior to manufacture.</p>
      ${s.estimate.leadTime ? `<p class="lead">Current lead time: ${this.e(s.estimate.leadTime)}</p>` : ''}</div>`;
  },
  acceptance() {
    return `<div class="accept avoid"><div><span>Signed</span></div><div><span>Name</span></div><div><span>Date</span></div><div><span>PO number</span></div></div>`;
  },
  tcs() {
    const list = App.store.s().tcs;
    if (!list.length) return '';
    return `<div class="tcs">${this.band('Terms and conditions')}<ol>${list.map(t => { const m = t.match(/^([^:]{2,40}):\s*(.*)$/); return `<li>${m ? `<b>${this.e(m[1])}.</b> ${this.e(m[2])}` : this.e(t)}</li>`; }).join('')}</ol></div>`;
  },
  image(est) { const u = this.imgUrl(est); return u ? `<div class="doc-image avoid"><img src="${u}" alt="3D view of the project"></div>` : ''; },

  estimate(est) {
    const s = App.store.s(); const num = App.store.displayNumber(est);
    const meta = [['Estimate number', num], ['Date', App.fmtLong(est.date)], ['Expiry', App.fmtLong(est.expiry)], ['Prepared by', est.preparedBy]];
    const notListed = `<div class="not-listed avoid">${this.e(s.estimate.notListed)}</div>`;
    const options = (est.options || []).filter(o => o.desc).length ? `${this.band('Optional extras (not included in the total)')}<table class="lines">${est.options.filter(o => o.desc).map(o => `<tr><td>${this.e(o.desc)}</td><td class="r">${App.money(o.price)}</td></tr>`).join('')}</table>` : '';
    const deliveryLine = est.delivery && est.delivery.on ? `Delivery to ${est.siteAddress || 'site'}` : null;

    if (est.type !== 'ft') {
      const b = est.building || {};
      const size = b.width && b.depth ? `${b.width}m wide x ${b.depth}m deep` : '';
      const incl = (est.inclusions || []).filter(Boolean).slice(); if (deliveryLine) incl.push(deliveryLine);
      return `<div class="doc">
        ${this.head(est, 'Estimate', meta)}
        <div class="two">
          <div>${this.band('Client')}${this.kv([['Name', est.client.company ? `${est.client.name}${est.client.name ? ', ' : ''}${est.client.company}` : est.client.name], ['Email', est.client.email], ['Phone', est.client.phone]])}</div>
          <div>${this.band('Project')}${this.kv([['Reference', est.heading], ['Site', est.siteAddress]])}</div>
        </div>
        ${this.image(est)}
        ${est.description ? `${this.band('Description')}<p class="desc">${App.textToHtml(est.description)}</p>` : ''}
        ${this.band('Framing')}
        ${this.kv([['Building size', size], ['Stud height', b.studHeight ? b.studHeight + 'm' : ''], ['Roof pitch', b.roofPitch ? b.roofPitch + '°' : ''], ['Floor area', b.floorArea ? b.floorArea + 'm²' : '']])}
        ${this.list(this.sectionsLines(est))}
        ${incl.length ? this.band('What\'s included') + this.list(incl) : ''}
        ${est.notes ? `${this.band('Notes')}<p class="desc">${App.textToHtml(est.notes)}</p>` : ''}
        ${options}
        <div class="price-row">${notListed}${this.priceBox(est)}</div>
        ${this.shutdownNote()}
        ${est.showAcceptance ? this.acceptance() : ''}
        ${this.footer()}
        <div class="page-break"></div>
        ${this.tcs()}
      </div>`;
    }

    const ft = est.ft; const c = ft.criteria;
    const crit = App.CRITERIA.filter(([k]) => c[k] && c[k].v).map(([k, l]) => [l, `${this.e(c[k].v)}${c[k].a ? ' <b class="assumed">ASSUMED</b>' : ''}`, true]);
    const half = Math.ceil(crit.length / 2);
    const inc = s.ft.scopeItems.filter(i => ft.scope[i] === 'inc').concat(est.inclusions.filter(Boolean));
    const exc = s.ft.scopeItems.filter(i => ft.scope[i] === 'exc');
    if (deliveryLine) inc.push(deliveryLine); else exc.push('Delivery');
    ft.exclusions.filter(x => x.on).forEach(x => exc.push(x.text));
    const extras = (est.extras || []).filter(x => x.desc);
    const plans = [ft.plansStage, ft.plansRev ? 'Rev ' + ft.plansRev : '', ft.plansDate ? 'received ' + App.fmtDate(ft.plansDate) : ''].filter(Boolean).join(', ');
    return `<div class="doc">
      ${this.head(est, 'Frame and Truss Estimate', meta)}
      ${this.band('Project details')}
      <div class="two">${this.kv([['Customer', est.client.company || est.client.name], ['Contact', est.client.company ? est.client.name : ''], ['Email', est.client.email], ['Phone', est.client.phone]])}
      ${this.kv([['Project', ft.projectName || est.heading], ['Site address', est.siteAddress], ['Plans', plans]])}</div>
      ${this.image(est)}
      ${this.band('LGS frame and truss details')}
      <div class="two">${this.kv(crit.slice(0, half))}${this.kv(crit.slice(half))}</div>
      ${this.band('Steel specification')}
      ${this.list(this.sectionsLines(est))}
      <p class="spec">${this.e(s.estimate.steelSpec)}</p>
      ${this.band('Scope')}
      <div class="two scope"><div><h4>Included</h4>${this.list(inc)}</div><div><h4>Not included</h4>${this.list(exc)}</div></div>
      ${ft.scope['Material box (fixings)'] === 'inc' && ft.materialBox ? `${this.band('Material box includes')}<p class="desc">${this.e(ft.materialBox)}</p>` : ''}
      ${(est.description || ft.notes.filter(Boolean).length || est.notes) ? `${this.band('Project specific notes')}${est.description ? `<p class="desc">${App.textToHtml(est.description)}</p>` : ''}${this.list(ft.notes.filter(Boolean))}${est.notes ? `<p class="desc">${App.textToHtml(est.notes)}</p>` : ''}` : ''}
      ${ft.conditions.filter(Boolean).length ? `${this.band('Conditions')}<div class="conditions">${ft.conditions.filter(Boolean).map(p => `<p>${this.e(p)}</p>`).join('')}</div>` : ''}
      ${this.band('Pricing and acceptance')}
      <div class="price-row">
        <div>${extras.length ? `<h4>Additional extras</h4><table class="lines">${extras.map(x => `<tr><td>${this.e(x.desc)}</td><td class="r">${App.money(x.price)}</td></tr>`).join('')}</table>` : ''}${notListed}</div>
        ${this.priceBox(est)}
      </div>
      ${options}
      ${this.shutdownNote()}
      ${est.showAcceptance ? this.acceptance() : ''}
      ${this.footer()}
      <div class="page-break"></div>
      ${this.tcs()}
    </div>`;
  },

  workings(est) {
    const w = est.workings; const c = App.store.calc(est); const mk = App.num(w.markup) || 1;
    const steel = (w.steel || []).map(r => `<tr><td>${this.e(r.size)} ${this.e(r.gauge)} BMT</td><td class="r">${App.round(App.num(r.lm), 2)} LM</td><td class="r">${App.money(r.rate)}</td><td class="r">${App.money(App.store.steelCost(r))}</td><td class="r">${App.money(App.store.steelCost(r) * (r.markup ? App.num(r.markup) : mk))}</td></tr>`).join('');
    const lines = (w.lines || []).map(l => `<tr><td>${this.e(l.desc)}${l.bucket !== 'main' ? ` <i>(${l.bucket === 'extra' ? 'extra' : 'option'})</i>` : ''}</td><td class="r">${this.e(l.qty)} ${this.e(l.unit || '')}</td><td class="r">${App.money(l.cost)}</td><td class="r">${App.money(App.store.lineCost(l))}</td><td class="r">${App.money(App.store.lineCost(l) * (l.markup ? App.num(l.markup) : mk))}</td></tr>`).join('');
    const fc = w.framecad;
    return `<div class="doc">
      ${this.head(est, 'Workings', [['Estimate', App.store.displayNumber(est)], ['Client', est.client.company || est.client.name], ['Reference', est.heading], ['Printed', App.fmtLong(App.today())]])}
      <p class="internal">Internal only. Not for the client.</p>
      ${fc ? `${this.band('FRAMECAD detailing')}<p class="desc">${this.e(fc.fileName)}: ${App.round(fc.totalLM, 2)} LM, ${App.round(fc.totalKg, 1)} kg, ${this.e(App.FC.summaryText(fc))}</p>` : ''}
      ${this.band('Steel')}<table class="lines grid"><tr><th>Section and gauge</th><th class="r">Metres</th><th class="r">Rate</th><th class="r">Cost</th><th class="r">Sell</th></tr>${steel || '<tr><td colspan="5">None</td></tr>'}</table>
      ${this.band('Other lines')}<table class="lines grid"><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Cost</th><th class="r">Sell</th></tr>${lines || '<tr><td colspan="5">None</td></tr>'}</table>
      <div class="price-box avoid"><table>
        <tr><th>Markup</th><td>x${mk}</td></tr><tr><th>Total cost</th><td>${App.money(c.cost)}</td></tr>
        <tr><th>Sell (main)</th><td>${App.money(c.main)}</td></tr>${c.extra ? `<tr><th>Sell (extras)</th><td>${App.money(c.extra)}</td></tr>` : ''}
        <tr class="grand"><th>Margin</th><td>${App.pct(c.margin)}</td></tr><tr><th>Estimate price</th><td>${App.money(App.store.totals(est).sub)}</td></tr>
      </table></div>
      ${w.notes ? `${this.band('Notes')}<p class="desc">${App.textToHtml(w.notes)}</p>` : ''}
      ${w.sketch && w.sketch.data ? `${this.band('Sketch')}<div class="doc-image"><img src="${w.sketch.data}" alt="Sketch"></div>` : ''}
    </div>`;
  },

  ftype(f) { return /wall|joist|truss|roof|panel/i.test(f.group || '') ? f.group : f.category; },
  jobFrames(est) { return (est.job && est.job.frames) || (est.workings.framecad && est.workings.framecad.frames) || []; },
  jobInfo(est, extraRows = []) {
    return this.kv([['Job', App.store.displayNumber(est)], ['Client', est.client.company || est.client.name], ['Site', est.siteAddress], ...extraRows]);
  },

  checklist(est) {
    const job = est.job || {}; const frames = this.jobFrames(est);
    const loads = (job.loads || []);
    const groups = loads.length > 1
      ? loads.map(l => ({ title: `Delivery ${l.n} of ${loads.length}${l.date ? ', ' + App.fmtDate(l.date) : ''}`, frames: frames.filter(f => (l.frameIds || []).includes(f.id)) }))
      : App.FC.CATS.map(c => ({ title: c, frames: frames.filter(f => f.category === c) })).filter(g => g.frames.length);
    return `<div class="doc">
      ${this.head(est, 'Factory Checklist', [['Job', App.store.displayNumber(est)], ['Manufacture', job.manufactureDate ? App.fmtLong(job.manufactureDate) : '']])}
      ${this.jobInfo(est, [['Sections', this.sectionsLines(est).join('; ')]])}
      ${groups.map(g => `${this.band(g.title)}<table class="lines grid ticks"><tr><th>Frame</th><th>Type</th><th class="r">Qty</th><th class="c">Done</th></tr>
        ${g.frames.map(f => `<tr><td><b>${this.e(f.name)}</b></td><td>${this.e(this.ftype(f))}</td><td class="r">${f.qty}</td><td class="c"><span class="box">${job.checklist && job.checklist.ticks && job.checklist.ticks[f.id] ? '✓' : ''}</span></td></tr>`).join('')}</table>`).join('') || '<p>No frames yet. Upload the PDF detailing on the job page.</p>'}
      <div class="signoff avoid"><div><span>Foreman sign-off</span>${job.checklist && job.checklist.foreman ? this.e(job.checklist.foreman) : ''}</div><div><span>Date</span>${job.checklist && job.checklist.date ? App.fmtDate(job.checklist.date) : ''}</div></div>
    </div>`;
  },

  docket(est, load, copy) {
    const job = est.job || {}; const loads = job.loads || []; const all = this.jobFrames(est);
    const frames = load ? all.filter(f => (load.frameIds || []).includes(f.id)) : all;
    const title = `Delivery Docket${copy === 'customer' ? ' (customer copy)' : ''}`;
    const meta = [['Job', App.store.displayNumber(est)], ['Delivery', load ? `${load.n} of ${loads.length}` : '1 of 1'], ['Date', load && load.date ? App.fmtLong(load.date) : '']];
    if (copy === 'customer') {
      const counts = {}; frames.forEach(f => counts[f.category] = (counts[f.category] || 0) + f.qty);
      const summary = App.FC.CATS.filter(c => counts[c]).map(c => `${counts[c]} ${c.toLowerCase()}`);
      return `<div class="doc">${this.head(est, title, meta)}${this.jobInfo(est)}
        ${this.band('This delivery')}${this.list(summary)}
        ${this.band('Sections and gauges')}${this.list(this.sectionsLines(est))}
        <p class="desc">Please check this delivery and let us know of any shortage or damage within 2 working days.</p>
        <div class="signoff avoid"><div><span>Received by</span></div><div><span>Date</span></div></div>${this.footer()}</div>`;
    }
    return `<div class="doc">${this.head(est, title, meta)}${this.jobInfo(est)}
      <table class="lines grid ticks"><tr><th>Frame</th><th>Type</th><th class="r">Qty</th><th class="c">Loaded</th><th class="c">Unloaded</th></tr>
      ${frames.map(f => `<tr><td><b>${this.e(f.name)}</b></td><td>${this.e(this.ftype(f))}</td><td class="r">${f.qty}</td><td class="c"><span class="box"></span></td><td class="c"><span class="box"></span></td></tr>`).join('') || '<tr><td colspan="5">No frames listed</td></tr>'}</table>
      <div class="signoff avoid"><div><span>Driver</span></div><div><span>Received by</span></div><div><span>Date</span></div></div></div>`;
  },

  po(est, po) {
    const tot = po.lines.reduce((a, l) => a + App.num(l.qty) * App.num(l.cost), 0);
    return `<div class="doc">${this.head(est, 'Purchase Order', [['PO number', po.number], ['Date', App.fmtLong(po.date)], ['Job', App.store.displayNumber(est)]])}
      ${this.kv([['Supplier', po.supplier], ['Deliver to', po.deliverTo || App.store.s().company.address], ['Required by', po.requiredBy ? App.fmtLong(po.requiredBy) : '']])}
      <table class="lines grid"><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr>
      ${po.lines.map(l => `<tr><td>${this.e(l.desc)}</td><td class="r">${this.e(l.qty)} ${this.e(l.unit || '')}</td><td class="r">${App.money(l.cost)}</td><td class="r">${App.money(App.num(l.qty) * App.num(l.cost))}</td></tr>`).join('')}</table>
      <div class="price-box avoid"><table><tr class="grand"><th>Total (excl GST)</th><td>${App.money(tot)}</td></tr></table></div>
      ${po.notes ? `<p class="desc">${App.textToHtml(po.notes)}</p>` : ''}${this.footer()}</div>`;
  },

  /* Output */
  async wmData() { if (this._wm !== undefined) return this._wm; try { this._wm = await App.imgToDataUrl('assets/logo.png'); } catch (e) { this._wm = null; } return this._wm; },
  async toPdf(html, { number = '' } = {}) {
    const host = document.createElement('div'); host.className = 'pdf-host'; host.innerHTML = html; document.body.appendChild(host);
    await Promise.all([...host.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    try {
      const wm = await this.wmData();
      const worker = html2pdf().set({
        margin: [10, 10, 14, 10], image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], before: '.page-break', avoid: ['.avoid', 'tr', '.kv', '.doc-band'] }
      }).from(host.firstElementChild).toPdf();
      const pdf = await worker.get('pdf');
      const n = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        if (wm) { try { pdf.saveGraphicsState(); pdf.setGState(new pdf.GState({ opacity: 0.06 })); pdf.addImage(wm, 'PNG', 30, 128, 150, 37.7); pdf.restoreGraphicsState(); } catch (e) {} }
        pdf.setFontSize(8); pdf.setTextColor(130);
        pdf.text(`${number}   Page ${i} of ${n}`, 200, 291, { align: 'right' });
      }
      return pdf.output('blob');
    } finally { host.remove(); }
  },
  print(html) {
    const root = document.getElementById('print-root');
    root.innerHTML = `<img class="print-wm" src="assets/logo.png" alt="">${html}`;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    const imgs = [...root.querySelectorAll('img')];
    Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(() => window.print(), 100));
  },
  preview(title, html, { pdfName, number, onDrive } = {}) {
    const m = App.modal(title, `<div class="doc-preview">${html}</div>`, {
      wide: true,
      actions: `<button class="btn ghost" data-k="print">Print</button><button class="btn ghost" data-k="pdf">Download PDF</button>${onDrive ? '<button class="btn primary" data-k="drive">Save to Drive</button>' : ''}`
    });
    m.querySelector('[data-k=print]').onclick = () => this.print(html);
    m.querySelector('[data-k=pdf]').onclick = async e => { e.target.disabled = true; e.target.textContent = 'Making PDF…'; try { App.download(pdfName || 'document.pdf', await this.toPdf(html, { number })); } catch (er) { App.toast(er.message, 'err'); } e.target.disabled = false; e.target.textContent = 'Download PDF'; };
    if (onDrive) m.querySelector('[data-k=drive]').onclick = async e => { e.target.disabled = true; e.target.textContent = 'Saving…'; try { await onDrive(); App.toast('Saved to Drive'); } catch (er) { App.toast(er.message, 'err', 6000); } e.target.disabled = false; e.target.textContent = 'Save to Drive'; };
    return m;
  }
};
