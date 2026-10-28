/* Estimate editor + workings */
(() => {
  const e = App.esc, S = () => App.store.s(), st = App.store;

  /* ---------- shared email sender ---------- */
  App.mail = {
    async html(body, est, kind) {
      const sig = await App.G.signature();
      const pixel = S().emails.trackingUrl && est ? `<img src="${e(S().emails.trackingUrl)}?e=${encodeURIComponent(est.id)}&k=${kind || 'mail'}&t=${Date.now()}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : '';
      return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${App.textToHtml(body)}</div>${sig ? `<br><div>${sig}</div>` : ''}${pixel}`;
    },
    /* Opens a compose window. opts: {est, kind, to, cc, subject, body, attachEstimate, attachBrochure, extra:[{name,mime,base64}], onSent} */
    compose(opts) {
      if (st.mode !== 'drive') { App.toast('Connect Google to send emails from the app.', 'err', 5000); return; }
      const brochure = S().emails.brochureId;
      const m = App.modal(opts.title || 'Send email', `
        ${App.field('To', `<input id="m-to" type="email" value="${e(opts.to || '')}">`)}
        ${App.field('Cc', `<input id="m-cc" value="${e(opts.cc || '')}">`)}
        ${App.field('Subject', `<input id="m-subj" value="${e(opts.subject || '')}">`)}
        ${App.field('Message', `<textarea id="m-body" rows="10">${e(opts.body || '')}</textarea>`)}
        <p class="hint">Your Gmail signature is added after "Cheers,".</p>
        ${opts.attachEstimate ? `<label class="check"><input type="checkbox" id="m-est" checked> Attach the estimate PDF</label>` : ''}
        ${brochure && opts.attachBrochure !== undefined ? `<label class="check"><input type="checkbox" id="m-bro" ${opts.attachBrochure ? 'checked' : ''}> Attach ${e(S().emails.brochureName || 'brochure')}</label>` : ''}
        ${(opts.extra || []).map(a => `<p class="hint">Attached: ${e(a.name)}</p>`).join('')}`,
        { wide: true, actions: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="m-send">Send email</button>` });
      m.querySelector('#m-send').onclick = async ev => {
        const b = ev.target; b.disabled = true; b.textContent = 'Sending…';
        try {
          const atts = (opts.extra || []).slice();
          if (opts.attachEstimate && m.querySelector('#m-est').checked) {
            const blob = await App.Est.savePdf(opts.est);
            atts.push({ name: `${st.displayNumber(opts.est)} Estimate.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) });
          }
          if (m.querySelector('#m-bro') && m.querySelector('#m-bro').checked) {
            const bb = await App.G.getBlob(brochure);
            atts.push({ name: S().emails.brochureName || 'Brochure.pdf', mime: bb.type || 'application/pdf', base64: await App.blobToBase64(bb) });
          }
          const to = m.querySelector('#m-to').value.trim();
          if (!to) throw new Error('Add who the email is going to.');
          await App.G.send({ to, cc: m.querySelector('#m-cc').value.trim(), subject: m.querySelector('#m-subj').value, html: await this.html(m.querySelector('#m-body').value, opts.est, opts.kind), attachments: atts });
          App.closeModal(); App.toast('Email sent');
          opts.onSent && opts.onSent();
        } catch (er) { App.toast(er.message, 'err', 6000); b.disabled = false; b.textContent = 'Send email'; }
      };
    },
    tpl(kind, est, vars = {}) {
      const t = S().emails.templates[kind];
      const v = st.vars(est, vars);
      return { subject: App.fill(t.subject, v), body: App.fill(t.body, v) };
    }
  };

  /* ---------- Estimate helpers ---------- */
  App.Est = {
    locked(est) { return est.status !== 'draft'; },
    async savePdf(est) {
      await App.Docs.ensureImage(est);
      const blob = await App.Docs.toPdf(App.Docs.estimate(est));
      if (st.mode === 'drive') {
        const folder = await st.jobFolder(est);
        const r = await App.G.uploadOrReplace({ name: `${st.displayNumber(est)} Estimate.pdf`, parent: folder, blob, mime: 'application/pdf' });
        est.drive.estimatePdf = r.id;
        const wb = await App.Docs.toPdf(App.Docs.workings(est));
        await App.G.uploadOrReplace({ name: `${st.displayNumber(est)} Workings.pdf`, parent: folder, blob: wb, mime: 'application/pdf' });
        st.touch(est); st.save();
      }
      return blob;
    },
    duplicates(est) {
      const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const a = norm(est.siteAddress);
      return st.live().filter(x => x.id !== est.id && !x.archived && !x.practice && ['draft', 'sent', 'accepted'].includes(x.status) &&
        ((a.length > 6 && norm(x.siteAddress) === a) || (est.client.name && norm(x.client.name) === norm(est.client.name) && norm(x.heading) === norm(est.heading) && est.heading)));
    },
    newJob() {
      return {
        stage: 'accepted', stageLog: [{ stage: 'accepted', at: Date.now(), by: st.me().name }], acceptedAt: App.today(),
        manufactureDate: '', deposit: { invoiced: false, received: false }, notifyClient: true, frames: [], loads: [],
        checklist: { ticks: {}, foreman: '', date: '' }, backcost: null, pos: [], files: [], cal: {}, notes: ''
      };
    },
    copyFields(src, dst, includeClient = true) {
      ['heading', 'description', 'sections', 'building', 'inclusions', 'options', 'extras', 'notes', 'delivery', 'gst', 'price', 'image', 'showAcceptance', 'leadSource'].forEach(k => { if (src[k] !== undefined) dst[k] = App.clone(src[k]); });
      if (includeClient) { dst.client = App.clone(src.client); dst.siteAddress = src.siteAddress; }
      dst.workings = App.clone(src.workings);
      if (src.ft && dst.type === 'ft') dst.ft = App.clone(src.ft);
    },
    ratesChanged(est) { const r = S().pricing.ratesUpdatedAt || 0; return est.workings.pricedAt && r > est.workings.pricedAt && ['draft', 'sent'].includes(est.status); }
  };

  /* ---------- View ---------- */
  App.views.estimate = (id, tab = 'details') => {
    const est = st.get(id);
    if (!est) return `<div class="empty"><h2>That estimate doesn't exist</h2><a class="btn" href="#/tracker">Go to the tracker</a></div>`;
    App.cur = est; App.state.estTab = tab;
    const locked = App.Est.locked(est);
    const tabs = [['details', 'Estimate'], ['workings', 'My workings'], ['preview', 'Preview'], ['activity', 'Notes and history']];
    const dup = App.Est.duplicates(est);
    const statusLabel = App.STATUSES.find(s => s.value === est.status).label;
    return `
    <div class="crumbs"><a href="#/tracker">← Estimate tracker</a>${est.job ? ` &#160; <a href="#/job/${est.id}">Job page →</a>` : ''}</div>
    <div class="page-head">
      <div>
        <div class="head-chips"><span class="pill ${est.status}">${statusLabel}</span><span class="pill type">${est.type === 'ft' ? 'Full frame and truss' : 'General'}</span>${est.practice ? '<span class="pill practice">Practice</span>' : ''}</div>
        <h1 class="est-num">${e(st.displayNumber(est))}</h1>
        <p class="sub">${est.client.name || est.client.company ? e(est.client.company || est.client.name) : 'New estimate'}${est.heading ? ', ' + e(est.heading) : ''}</p>
      </div>
      <div class="head-actions">${App.Est.actionButtons(est)}</div>
    </div>
    ${locked ? `<div class="banner">This estimate has been ${est.status}, so it's locked. ${['sent', 'expired', 'rejected'].includes(est.status) ? `<button class="btn small" data-act="estRevise">${est.status === 'expired' ? 'Re-quote' : 'Create revision'}</button>` : ''}</div>` : ''}
    ${App.Est.ratesChanged(est) ? `<div class="banner warn">Your rates were updated after this estimate was priced. Check the workings before it goes out.</div>` : ''}
    ${dup.length ? `<div class="banner warn">Heads up: ${dup.map(d => `<a href="#/e/${d.id}">${e(st.displayNumber(d))}</a> (${e(d.status)})`).join(', ')} looks like the same job.</div>` : ''}
    <nav class="tabs" aria-label="Estimate sections">${tabs.map(([k, l]) => `<a href="#/e/${est.id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div class="tab-body">${tab === 'workings' ? App.Est.workingsTab(est, locked) : tab === 'preview' ? App.Est.previewTab(est) : tab === 'activity' ? App.Est.activityTab(est) : App.Est.detailsTab(est, locked)}</div>`;
  };
  App.views.estimate.mount = (id, tab) => {
    const est = st.get(id); if (!est) return;
    if (tab === 'preview') App.Docs.ensureImage(est).then(() => App.Docs.fill(document.getElementById('est-preview'), App.Docs.estimate(est)));
    if (tab === 'details' && est.image) App.Docs.ensureImage(est).then(u => { const i = document.getElementById('img-thumb'); if (i && u) i.src = u; });
    if (tab === 'workings') App.Est.mountSketch(est);
  };

  App.Est.actionButtons = est => {
    const b = [];
    if (est.status === 'draft') {
      b.push(`<button class="btn" data-act="estMarkSent">Mark as sent</button>`);
      b.push(`<button class="btn primary" data-act="estEmail">Email estimate</button>`);
    }
    if (est.status === 'sent') {
      b.push(`<button class="btn" data-act="estReject">Mark rejected</button>`);
      b.push(`<button class="btn" data-act="estEmail">Email again</button>`);
      b.push(`<button class="btn primary" data-act="estAccept">Mark accepted</button>`);
    }
    if (est.status === 'expired') b.push(`<button class="btn primary" data-act="estRevise">Re-quote</button>`);
    if (est.job) b.push(`<a class="btn dark" href="#/job/${est.id}">Open job</a>`);
    b.push(`<details class="menu"><summary class="btn" aria-label="More actions">More</summary><div class="menu-pop">
      <button data-act="estPdf">Save PDF to Drive</button>
      <button data-act="estDownload">Download PDF</button>
      <button data-act="estPrint">Print</button>
      <button data-act="estDuplicate">Duplicate</button>
      <button data-act="estConvert">Copy as ${est.type === 'ft' ? 'General' : 'Full F&amp;T'} estimate</button>
      <button data-act="estTemplate">Save as template</button>
      ${['draft', 'sent'].includes(est.status) ? '<button data-act="estCancel">Cancel this estimate</button>' : ''}
      <button data-act="estArchive">${est.archived ? 'Unarchive' : 'Archive'}</button>
    </div></details>`);
    return b.join('');
  };

  /* ---------- Details tab ---------- */
  const inp = (path, val, attrs = '') => `<input data-bind="${path}" value="${e(val ?? '')}" ${attrs}>`;
  const listEditor = (path, items, ph) => `
    <div class="list-ed">${items.map((it, i) => `<div class="row"><input data-bind="${path}.${i}" value="${e(it)}" placeholder="${e(ph)}"><button class="icon-btn" data-act="rowDel" data-path="${path}" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}
    <button class="btn small dashed" data-act="rowAdd" data-path="${path}" data-tpl='""'>+ Add line</button></div>`;
  const priceRows = (path, items, ph) => `
    <div class="list-ed">${items.map((it, i) => `<div class="row"><input data-bind="${path}.${i}.desc" value="${e(it.desc)}" placeholder="${e(ph)}"><input class="money" style="max-width:150px" data-bind="${path}.${i}.price" data-type="num" value="${e(it.price)}" placeholder="$ excl GST" data-rerender-blur="1"><button class="icon-btn" data-act="rowDel" data-path="${path}" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}
    <button class="btn small dashed" data-act="rowAdd" data-path="${path}" data-tpl='{"desc":"","price":""}'>+ Add line</button></div>`;
  const STAR_ITEMS = ['LGS wall framing', 'LGS roof trusses', 'LGS floor joists'];

  App.Est.detailsTab = (est, locked) => {
    const s = S();
    const users = s.users.map(u => u.name);
    const ft = est.ft; const b = est.building;
    const main = `<fieldset ${locked ? 'disabled' : ''}>
    <section class="card">
      <h3>Client</h3>
      <div class="grid2">
        ${App.field('Name', `<input data-bind="client.name" list="cust-list" value="${e(est.client.name)}" data-act-change="pickCustomer" autocomplete="off">`)}
        ${App.field('Company', inp('client.company', est.client.company))}
        ${App.field('Email', inp('client.email', est.client.email, 'type="email"'))}
        ${App.field('Phone', inp('client.phone', est.client.phone, 'type="tel"'))}
        ${App.field('Site address', inp('siteAddress', est.siteAddress, 'data-rerender-blur="1"'))}
        ${App.field('How they found us', `<select data-bind="leadSource"><option value="">Choose…</option>${App.opts(s.estimate.leadSources, est.leadSource)}</select>`)}
      </div>
      <datalist id="cust-list">${st.data.customers.filter(c => !c.deleted).map(c => `<option value="${e(c.name)}">${e([c.company, c.email].filter(Boolean).join(', '))}</option>`).join('')}</datalist>
    </section>
    <section class="card">
      <h3>Project</h3>
      <div class="grid2">
        ${App.field('Heading', inp('heading', est.heading, 'placeholder="e.g. 3.5m x 6m single car garage"'))}
        ${App.field('Prepared by', `<select data-bind="preparedBy">${App.opts(users, est.preparedBy)}</select>`)}
        ${App.field('Estimate date', `<input type="date" data-bind="date" value="${e(est.date)}" data-rerender="1">`)}
        ${App.field('Valid until', `<input type="date" data-bind="expiry" value="${e(est.expiry)}">`)}
      </div>
      ${App.field('Description', `<textarea data-bind="description" rows="3">${e(est.description)}</textarea>`)}
    </section>
    ${est.type !== 'ft' ? `<section class="card">
      <h3>The building</h3>
      <div class="grid5">
        ${App.field('Width (m)', inp('building.width', b.width, 'inputmode="decimal"'))}
        ${App.field('Length (m)', inp('building.depth', b.depth, 'inputmode="decimal"'))}
        ${App.field('Stud height (m)', inp('building.studHeight', b.studHeight, 'inputmode="decimal"'))}
        ${App.field('Roof pitch (°)', inp('building.roofPitch', b.roofPitch, 'inputmode="decimal"'))}
        ${App.field(`Floor area (m²)<span id="fa-tag">${App.Est.faTag(est)}</span>`, inp('building.floorArea', b.floorArea, 'inputmode="decimal" id="fa-in"'))}
      </div>
      <p class="hint">Floor area works itself out from width x length. Type over it if you need to, or clear it to go back to the automatic figure.</p>
    </section>` : `<section class="card">
      <h3>Project details</h3>
      <div class="grid4">
        ${App.field('Project name', inp('ft.projectName', ft.projectName))}
        ${App.field('Plans stage', inp('ft.plansStage', ft.plansStage, 'placeholder="Concept, consent, working…"'))}
        ${App.field('Plans received', `<input type="date" data-bind="ft.plansDate" value="${e(ft.plansDate)}">`)}
        ${App.field('Plans revision', inp('ft.plansRev', ft.plansRev))}
      </div>
      <h4>Frame and truss details</h4>
      <p class="hint">Tick "Assumed" for anything you've had to guess. It shows with a yellow ASSUMED tag on the estimate.</p>
      <div class="crit">${App.CRITERIA.map(([k, l]) => `<div class="crit-row"><span>${l}</span>${inp(`ft.criteria.${k}.v`, ft.criteria[k].v)}<label class="check small"><input type="checkbox" data-bind="ft.criteria.${k}.a" ${ft.criteria[k].a ? 'checked' : ''}> Assumed</label></div>`).join('')}</div>
    </section>
    <section class="card">
      <h3>Scope</h3>
      <p class="hint">Wall frames, trusses and joists are the stars of the estimate. When they're included they get their own big tiles at the top.</p>
      <div class="scope-grid">${s.ft.scopeItems.map(i => `<div class="scope-row ${STAR_ITEMS.includes(i) ? 'star' : ''}"><span>${e(i)}${STAR_ITEMS.includes(i) ? ' <span class="tag dark">Star</span>' : ''}</span>
        <div class="seg">${[['inc', 'Included'], ['exc', 'Not included'], ['', 'Leave off']].map(([v, l]) => `<label><input type="radio" name="sc-${e(i)}" data-bind="ft.scope.${i.replace(/\./g, '')}" value="${v}" ${(ft.scope[i] || '') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>`).join('')}</div>
      ${App.field('Material box includes', `<textarea data-bind="ft.materialBox" rows="2">${e(ft.materialBox)}</textarea>`)}
      <h4>Not included</h4>
      <div class="checks">${ft.exclusions.map((x, i) => `<label class="check"><input type="checkbox" data-bind="ft.exclusions.${i}.on" ${x.on ? 'checked' : ''}> ${e(x.text)}</label>`).join('')}</div>
      <button class="btn small dashed" data-act="addExclusion">+ Add an exclusion</button>
      <h4>Project specific notes</h4>${listEditor('ft.notes', ft.notes, 'e.g. Includes 4 deliveries to site')}
      <h4>Conditions</h4>${listEditor('ft.conditions', ft.conditions, 'Condition')}
    </section>`}
    <section class="card">
      <h3>Sections and gauges</h3>
      ${est.sections.map((sec, i) => `<div class="sec-row">
        <select data-bind="sections.${i}.size" data-rerender="1" aria-label="Section">${App.opts(App.SECTIONS, sec.size)}</select>
        <div class="gauges">${(App.GAUGES[sec.size] || []).map(g => `<label class="chip ${sec.gauges.includes(g) ? 'on' : ''}"><input type="checkbox" data-act-change="toggleGauge" data-i="${i}" value="${g}" ${sec.gauges.includes(g) ? 'checked' : ''}>${g} BMT</label>`).join('')}</div>
        <button class="icon-btn" data-act="rowDel" data-path="sections" data-i="${i}" aria-label="Remove section">✕</button></div>`).join('')}
      <button class="btn small dashed" data-act="rowAdd" data-path="sections" data-tpl='{"size":"89x41","gauges":["0.75"]}'>+ Add a section</button>
    </section>
    <section class="card">
      <h3>${est.type === 'ft' ? 'Also included' : 'What\'s included'}</h3>
      <p class="hint">Anything you want listed on the estimate: labour, screws, cladding, a roller door…</p>
      ${listEditor('inclusions', est.inclusions, 'e.g. 1 x manual roller door')}
      <div class="row-btns"><button class="btn small" data-act="inclFromWorkings">Copy lines from my workings</button></div>
      <label class="check"><input type="checkbox" data-bind="delivery.on" data-rerender="1" ${est.delivery.on ? 'checked' : ''}> Delivery to ${e(est.siteAddress || 'the site address')}</label>
    </section>
    ${est.type === 'ft' ? `<section class="card"><h3>Additional extras</h3>
      <p class="hint">Priced separately and added to the total, e.g. engineering, detailing, bracing.</p>
      <div class="seg" style="margin-bottom:14px">${[['lump', 'Show as one price'], ['itemised', 'Break them down']].map(([v, l]) => `<label><input type="radio" name="exmode" data-bind="extrasMode" data-rerender="1" value="${v}" ${(est.extrasMode || 'lump') === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      ${priceRows('extras', est.extras, 'e.g. LGS engineering and foundation design')}
      ${(est.extrasMode || 'lump') === 'lump' && est.extras.length ? App.field('Wording on the estimate (optional)', inp('extrasLabel', est.extrasLabel, `placeholder="${e(App.Docs.joinNice(est.extras.map(x => x.desc)))}"`)) : ''}
    </section>` : ''}
    <section class="card"><h3>Optional extras</h3><p class="hint">Shown with a price but not added to the total. Leave the price blank for "price on request".</p>${priceRows('options', est.options, 'e.g. Gutters and downpipes')}</section>
    <section class="card"><h3>Notes on the estimate</h3><textarea data-bind="notes" rows="3">${e(est.notes)}</textarea></section>
    <section class="card">
      <h3>3D image</h3>
      ${est.image ? `<div class="img-box"><img id="img-thumb" src="${e(App.Docs.imgUrl(est) || '')}" alt="3D image"><button class="btn small" data-act="imgRemove">Remove image</button></div>` : `<label class="drop">Upload a 3D image<input type="file" accept="image/*" data-act-change="imgUpload" hidden></label><p class="hint">If you skip this, the estimate simply won't have an image.</p>`}
    </section>
    </fieldset>`;
    return `<div class="ed-cols"><div class="ed-main">${main}</div><aside class="ed-side">${App.Est.pricePanel(est, locked)}</aside></div>`;
  };
  App.Est.faTag = est => est.type === 'ft' ? '' : (est.building.floorAreaManual ? '<span class="manual-tag">Typed in</span>' : (est.building.floorArea ? '<span class="auto-tag">Auto</span>' : ''));
  App.Est.pricePanel = (est, locked) => {
    const t = st.totals(est); const c = st.calc(est);
    return `<section class="price-panel">
      <p class="lbl">Total excl GST</p>
      <p class="big" data-live="pp-total">${App.money(t.sub)}</p>
      <p class="dep" data-live="pp-dep">${S().estimate.depositPct}% deposit ${App.money(t.deposit)}</p>
      ${est.gst ? `<p class="gst-lines" data-live="pp-gst">GST ${App.money(t.gst)}, total incl GST ${App.money(t.incl)}</p>` : ''}
      <fieldset ${locked ? 'disabled' : ''}>
        ${App.field(est.type === 'ft' ? 'Frame and truss price (excl GST)' : 'Price (excl GST)', `<input class="money big" data-bind="price" data-type="num" value="${e(est.price)}" inputmode="decimal">`)}
        <button class="btn small" data-act="useWorkings" style="width:100%">Use my workings (${App.money(c.main)}${c.extra ? ' + ' + App.money(c.extra) + ' extras' : ''})</button>
        <label class="check"><input type="checkbox" data-bind="gst" data-rerender="1" ${est.gst ? 'checked' : ''}> Show GST and total incl GST</label>
        <label class="check"><input type="checkbox" data-bind="showAcceptance" ${est.showAcceptance ? 'checked' : ''}> Signature lines</label>
      </fieldset>
      <div class="trio"><span>Cost<b>${App.money(c.cost, 0)}</b></span><span>Margin<b>${c.sell ? App.pct(c.margin) : '-'}</b></span><span>Expires<b>${App.fmtShort(est.expiry)}</b></span></div>
    </section>
    <section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Preview</h3><a class="btn small" href="#/e/${est.id}/preview">Open preview</a></div></section>`;
  };
  App.Est.totalsHtml = est => '';
  App.Est.livePrice = est => {
    const t = st.totals(est);
    const set = (k, v) => { const el = document.querySelector(`[data-live="${k}"]`); if (el) el.textContent = v; };
    set('pp-total', App.money(t.sub)); set('pp-dep', `${S().estimate.depositPct}% deposit ${App.money(t.deposit)}`);
    set('pp-gst', `GST ${App.money(t.gst)}, total incl GST ${App.money(t.incl)}`);
  };
  /* After a field changes: floor area works itself out from width x length unless typed over */
  App.Est.afterBind = (est, path, el) => {
    if (!est || !est.building || est.type === 'ft') return;
    const b = est.building;
    if (path === 'building.floorArea') {
      if (String(b.floorArea).trim() === '') { b.floorAreaManual = false; App.Est.autoArea(est); const i = document.getElementById('fa-in'); if (i && document.activeElement !== i) i.value = b.floorArea; }
      else b.floorAreaManual = true;
    }
    if (path === 'building.width' || path === 'building.depth') App.Est.autoArea(est);
    const tag = document.getElementById('fa-tag'); if (tag) tag.innerHTML = App.Est.faTag(est);
  };
  App.Est.autoArea = est => {
    const b = est.building; if (b.floorAreaManual) return;
    const w = App.num(b.width), d = App.num(b.depth);
    b.floorArea = w && d ? App.round(w * d, 2) : '';
    const i = document.getElementById('fa-in'); if (i && document.activeElement !== i) i.value = b.floorArea;
  };

  /* ---------- Workings tab ---------- */
  App.Est.workingsTab = (est, locked) => {
    const w = est.workings; const s = S(); const c = st.calc(est);
    const sizes = [...new Set(est.sections.map(x => x.size).concat(w.steel.map(r => r.size)))];
    const alloc = st.steelByLM(est);
    const fc = w.framecad;
    const minM = s.pricing.minMargin;
    const lowMargin = c.sell && c.margin < minM;
    const defPct = st.defPct(est);
    const pctIn = (path, r) => `<input class="pct" data-bind="${path}.markupPct" data-type="num" value="${e(r.markupPct ?? (r.markup ? App.round((App.num(r.markup) - 1) * 100, 2) : ''))}" placeholder="${defPct}" inputmode="decimal" aria-label="Markup percent">`;
    return `<div class="workings">
    <section class="stat-dark">
      <div class="stats4">
        <div class="s"><span>Total cost</span><b data-live="w-cost">${App.money(c.cost)}</b></div>
        <div class="s y"><span>Sell price</span><b data-live="w-sell">${App.money(c.main)}${c.extra ? ` + ${App.money(c.extra)}` : ''}</b></div>
        <div class="s ${lowMargin ? 'bad' : ''}"><span>Margin</span><b data-live="w-margin">${App.pct(c.margin)}</b></div>
        <div>${App.field('Default markup (%)', `<input class="pct" style="width:100%" data-act-change="defMarkup" value="${e(defPct)}" inputmode="decimal">`)}</div>
      </div>
      ${lowMargin ? `<div class="banner warn" style="margin-top:12px">This job is under your minimum margin of ${App.pct(minM)}.</div>` : ''}
      <div class="row-btns"><button class="btn primary" data-act="useWorkings" ${locked ? 'disabled' : ''}>Use as the estimate price</button><button class="btn small" data-act="markupAll">Set every line to ${defPct}%</button><span class="hint">Estimate price is currently ${App.money(st.totals(est).sub)}</span></div>
    </section>
    <section class="card">
      <h3>FRAMECAD detailing</h3>
      ${fc ? `<div class="fc-sum"><b>${e(fc.fileName)}</b>: ${App.round(fc.totalLM, 2).toLocaleString('en-NZ')} LM, ${App.round(fc.totalKg, 1).toLocaleString('en-NZ')} kg, ${fc.frames.length} frame types (${e(App.FC.summaryText(fc))})
        ${fc.missingLength ? `<p class="hint">${fc.missingLength} pages didn't show a "Total Length", so their metres aren't counted.</p>` : ''}
        ${Object.keys(fc.byProfile).length ? `<p class="hint">Profiles found: ${Object.entries(fc.byProfile).map(([p, lm]) => `${e(p)} (${App.round(lm, 1)} LM)`).join(', ')}</p>` : ''}
        <div class="row-btns"><button class="btn small primary" data-act="fcApply">Put these metres into my steel lines</button><button class="btn small" data-act="fcFrames">See every frame</button><button class="btn small ghost" data-act="fcClear">Remove</button></div></div>`
        : `<label class="drop">Upload the FRAMECAD PDF to fill in the metres<input type="file" accept="application/pdf" data-act-change="fcUpload" hidden></label>`}
    </section>
    <section class="card">
      <h3>Steel</h3>
      <div class="targets">${sizes.map(sz => { const tgt = App.num(w.targets[sz]); const got = alloc[sz] || 0; const left = tgt - got;
        return `<div class="target"><span>${e(sz)} total</span><input data-bind="workings.targets.${sz}" data-type="num" value="${e(w.targets[sz] ?? '')}" placeholder="LM" inputmode="decimal" aria-label="${e(sz)} total metres">
        <em class="${tgt && Math.abs(left) > 0.01 ? (left > 0 ? 'warn' : 'err') : 'ok'}" data-live="tgt-${e(sz)}">${tgt ? (Math.abs(left) < 0.01 ? 'All allocated' : left > 0 ? `${App.round(left, 2)} LM still to allocate` : `${App.round(-left, 2)} LM over`) : `${App.round(got, 2)} LM allocated`}</em></div>`; }).join('')}</div>
      <p class="hint">Split each section across gauges, e.g. 700 LM at 0.75 and 300 LM at 0.95. Each line starts at your default markup, and you can change any of them.</p>
      <div class="table-scroll"><table class="wtable"><thead><tr><th>Section</th><th>Gauge</th><th class="r">Metres</th><th class="r">Cost per LM</th><th class="r">Cost</th><th class="r">Markup %</th><th class="r">Sell</th><th></th></tr></thead><tbody>
      ${w.steel.map((r, i) => `<tr>
        <td><select data-bind="workings.steel.${i}.size" data-rerender="1" aria-label="Section">${App.opts(App.SECTIONS, r.size)}</select></td>
        <td><select data-bind="workings.steel.${i}.gauge" data-act-change="steelRate" data-i="${i}" aria-label="Gauge">${App.opts(App.GAUGES[r.size] || [], r.gauge)}</select></td>
        <td><input class="num" data-bind="workings.steel.${i}.lm" data-type="num" value="${e(r.lm)}" inputmode="decimal" aria-label="Metres"></td>
        <td><input class="num" data-bind="workings.steel.${i}.rate" data-type="num" value="${e(r.rate)}" inputmode="decimal" aria-label="Cost per metre"></td>
        <td class="r" data-live="sc-${i}">${App.money(st.steelCost(r))}</td>
        <td>${pctIn(`workings.steel.${i}`, r)}</td>
        <td class="r" data-live="ss-${i}"><b>${App.money(st.steelCost(r) * st.lineMk(r, est))}</b></td>
        <td><button class="icon-btn" data-act="rowDel" data-path="workings.steel" data-i="${i}" aria-label="Remove">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <button class="btn small dashed" data-act="steelAdd">+ Add steel line</button>
    </section>
    <section class="card">
      <h3>Other lines</h3>
      <div class="table-scroll"><table class="wtable"><thead><tr><th>Item</th><th class="r">Qty</th><th>Unit</th><th class="r">Unit cost</th><th>Goes on estimate as</th><th class="r">Cost</th><th class="r">Markup %</th><th class="r">Sell</th><th></th></tr></thead><tbody>
      ${w.lines.map((l, i) => `<tr>
        <td><input data-bind="workings.lines.${i}.desc" value="${e(l.desc)}" placeholder="Description" aria-label="Description"></td>
        <td><input class="num" style="max-width:80px" data-bind="workings.lines.${i}.qty" data-type="num" value="${e(l.qty)}" inputmode="decimal" aria-label="Quantity"></td>
        <td><input class="unit" data-bind="workings.lines.${i}.unit" value="${e(l.unit || '')}" placeholder="ea" aria-label="Unit"></td>
        <td><input class="num" data-bind="workings.lines.${i}.cost" data-type="num" value="${e(l.cost)}" inputmode="decimal" aria-label="Unit cost"></td>
        <td><select data-bind="workings.lines.${i}.bucket" data-rerender="1" aria-label="Goes on estimate as">${App.opts([{ value: 'main', label: 'Part of the price' }].concat(est.type === 'ft' ? [{ value: 'extra', label: 'Additional extra' }] : []).concat([{ value: 'option', label: 'Optional extra' }]), l.bucket)}</select></td>
        <td class="r" data-live="lc-${i}">${App.money(st.lineCost(l))}</td>
        <td>${pctIn(`workings.lines.${i}`, l)}</td>
        <td class="r" data-live="ls-${i}"><b>${App.money(st.lineCost(l) * st.lineMk(l, est))}</b></td>
        <td><button class="icon-btn" data-act="rowDel" data-path="workings.lines" data-i="${i}" aria-label="Remove">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row-btns">
        <button class="btn small dashed" data-act="lineAdd">+ Add line</button>
        <button class="btn small dashed" data-act="labourAdd">+ Add labour (${App.money(s.pricing.labourRate)}/hr)</button>
        ${s.pricing.items.length ? `<select style="width:auto;height:36px" data-act-change="libAdd" aria-label="Add from price list"><option value="">+ Add from price list…</option>${s.pricing.items.map(it => `<option value="${e(it.id)}">${e(it.name)} (${App.money(it.cost)}/${e(it.unit || 'ea')})</option>`).join('')}</select>` : '<a class="hint" href="#/settings/pricing">Add common items to your price list in Settings</a>'}
      </div>
    </section>
    <section class="card">
      <h3>Delivery calculator</h3>
      <div class="grid3">
        ${App.field('Zone', `<select data-bind="workings.deliveryCalc.zone" data-rerender="1">${s.delivery.zones.map((z, i) => App.opt(i, z, w.deliveryCalc.zone)).join('')}</select>`)}
        ${App.field('Floor area (m²)', `<input data-bind="workings.deliveryCalc.area" data-type="num" value="${e(w.deliveryCalc.area || est.building.floorArea || (est.ft && est.ft.criteria.floorArea.v) || '')}" data-rerender-blur="1" inputmode="decimal">`)}
        <div class="fld"><span>Delivery price</span><div class="calc-val">${App.money(App.Est.deliveryPrice(est))}</div><button class="btn small" data-act="deliveryAdd">Add to my workings</button></div>
      </div>
    </section>
    <section class="card">
      <h3>Notes</h3>
      <textarea data-bind="workings.notes" rows="5" placeholder="How you got to the price, things to remember, supplier quotes…">${e(w.notes)}</textarea>
      <h4>Sketch pad</h4>
      <div class="sketch"><canvas id="sketch" width="1200" height="600" aria-label="Sketch pad"></canvas>
        <div class="row-btns"><button class="btn small" data-act="sketchPen">Pen</button><button class="btn small" data-act="sketchEraser">Eraser</button><button class="btn small ghost" data-act="sketchClear">Clear</button></div></div>
    </section>
    <div class="row-btns"><button class="btn" data-act="workingsPrint">Print my workings</button></div>
    </div>`;
  };
  App.Est.deliveryPrice = est => {
    const d = S().delivery; const w = est.workings;
    const area = App.num(w.deliveryCalc.area || est.building.floorArea || (est.ft && est.ft.criteria.floorArea.v));
    let band = d.bands.findIndex(b => area <= App.num(b)); if (band < 0) band = d.bands.length;
    return App.num(((d.prices[App.num(w.deliveryCalc.zone)] || [])[band]));
  };
  App.Est.liveWorkings = est => {
    const c = st.calc(est);
    const set = (k, v) => { const el = document.querySelector(`[data-live="${k}"]`); if (el) el.innerHTML = v; };
    est.workings.steel.forEach((r, i) => { set(`sc-${i}`, App.money(st.steelCost(r))); set(`ss-${i}`, `<b>${App.money(st.steelCost(r) * st.lineMk(r, est))}</b>`); });
    est.workings.lines.forEach((l, i) => { set(`lc-${i}`, App.money(st.lineCost(l))); set(`ls-${i}`, `<b>${App.money(st.lineCost(l) * st.lineMk(l, est))}</b>`); });
    set('w-cost', App.money(c.cost)); set('w-sell', App.money(c.main) + (c.extra ? ` + ${App.money(c.extra)}` : '')); set('w-margin', App.pct(c.margin));
    const alloc = st.steelByLM(est);
    Object.keys(est.workings.targets).concat(Object.keys(alloc)).forEach(sz => {
      const tgt = App.num(est.workings.targets[sz]); const got = alloc[sz] || 0; const left = tgt - got;
      const el = document.querySelector(`[data-live="tgt-${CSS.escape(sz)}"]`);
      if (el) { el.className = tgt && Math.abs(left) > 0.01 ? (left > 0 ? 'warn' : 'err') : 'ok'; el.textContent = tgt ? (Math.abs(left) < 0.01 ? 'All allocated' : left > 0 ? `${App.round(left, 2)} LM still to allocate` : `${App.round(-left, 2)} LM over`) : `${App.round(got, 2)} LM allocated`; }
    });
  };

  /* Sketch pad */
  App.Est.mountSketch = est => {
    const cv = document.getElementById('sketch'); if (!cv) return;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    if (est.workings.sketch && est.workings.sketch.data) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, cv.width, cv.height); img.src = est.workings.sketch.data; }
    let drawing = false, last = null;
    App.state.sketchMode = App.state.sketchMode || 'pen';
    const pos = ev => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * cv.width / r.width, y: (ev.clientY - r.top) * cv.height / r.height }; };
    const save = App.debounce(() => { est.workings.sketch = { data: cv.toDataURL('image/jpeg', 0.6) }; st.touch(est); st.save(); }, 800);
    cv.onpointerdown = ev => { drawing = true; last = pos(ev); cv.setPointerCapture(ev.pointerId); };
    cv.onpointermove = ev => {
      if (!drawing) return; const p = pos(ev);
      ctx.strokeStyle = App.state.sketchMode === 'eraser' ? '#fff' : '#15171a'; ctx.lineWidth = App.state.sketchMode === 'eraser' ? 26 : 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    };
    cv.onpointerup = cv.onpointercancel = () => { if (drawing) { drawing = false; save(); } };
  };

  /* ---------- Preview / activity ---------- */
  App.Est.previewTab = est => `<div class="row-btns" style="margin:0 0 14px"><button class="btn" data-act="estPrint">Print</button><button class="btn" data-act="estDownload">Download PDF</button><button class="btn primary" data-act="estPdf">Save PDF to Drive</button></div>
    <div class="doc-preview" id="est-preview"></div>`;
  App.Est.activityTab = est => {
    const fu = est.followups || {};
    return `<section class="card"><h3>Add a note</h3><div class="row"><input id="note-in" placeholder="e.g. Rang Iryna 28/10, wants to add gutters"><button class="btn" data-act="noteAdd">Add note</button></div></section>
    <section class="card"><h3>Follow-ups</h3>
      <label class="check"><input type="checkbox" data-bind="followups.paused" ${fu.paused ? 'checked' : ''}> Pause follow-up emails for this estimate</label>
      ${App.Track.fuText(est) ? `<p>${App.Track.fuText(est)}</p>` : '<p class="hint">Follow-ups start one week after the estimate is sent.</p>'}
      ${est.openedAt ? `<p>Email first opened ${App.fmtStamp(est.openedAt)}</p>` : ''}
    </section>
    <section class="card"><h3>History</h3><ul class="activity">${(est.activity || []).map(a => `<li><time>${App.fmtStamp(a.at)}</time> <b>${e(a.by)}</b> ${e(a.text)}</li>`).join('')}</ul></section>
    ${est.revisions.length ? `<section class="card"><h3>Earlier versions</h3><ul class="activity">${est.revisions.map((r, i) => `<li><button class="btn small ghost" data-act="revView" data-i="${i}">View</button> ${e(est.number)}${r.rev ? ' Rev ' + r.rev : ''}, ${App.fmtStamp(r.at)} (${e(r.status)}, ${App.money(st.totals(r.data).sub)})</li>`).join('')}</ul></section>` : ''}`;
  };

  /* ---------- Actions ---------- */
  const A = App.actions; const cur = () => App.cur;
  const save = (rerender = true) => { st.touch(cur()); st.save(); if (rerender) App.refresh(); };

  A.rowAdd = el => { const arr = App.getPath(cur(), el.dataset.path) || []; arr.push(JSON.parse(el.dataset.tpl)); App.setPath(cur(), el.dataset.path, arr); save(); };
  A.rowDel = el => { const arr = App.getPath(cur(), el.dataset.path); arr.splice(+el.dataset.i, 1); save(); };
  A.addExclusion = async () => { const t = await App.prompt('Add an exclusion', 'What isn\'t included?'); if (t) { cur().ft.exclusions.push({ text: t, on: true }); save(); } };
  A.toggleGauge = el => { const sec = cur().sections[+el.dataset.i]; const g = el.value; sec.gauges = el.checked ? [...new Set(sec.gauges.concat(g))].sort() : sec.gauges.filter(x => x !== g); save(); };
  A.pickCustomer = el => {
    const c = st.data.customers.find(x => x.name === el.value && !x.deleted); if (!c) return;
    const est = cur(); if (!est.client.email) est.client.email = c.email || ''; if (!est.client.phone) est.client.phone = c.phone || ''; if (!est.client.company) est.client.company = c.company || '';
    save();
  };
  A.inclFromWorkings = () => { const est = cur(); est.workings.lines.filter(l => l.desc && l.bucket === 'main' && l.kind !== 'delivery').forEach(l => { const t = l.kind === 'labour' ? l.desc : `${App.num(l.qty) > 1 ? App.num(l.qty) + ' x ' : '1 x '}${l.desc}`; if (!est.inclusions.includes(t)) est.inclusions.push(t); }); save(); };
  A.useWorkings = () => {
    const est = cur(); const c = st.calc(est);
    est.price = App.round(c.main, 2);
    if (est.type === 'ft') est.extras = est.workings.lines.filter(l => l.bucket === 'extra').map(l => ({ desc: l.desc, price: App.round(st.lineCost(l) * st.lineMk(l, est), 2) }));
    const opts = est.workings.lines.filter(l => l.bucket === 'option').map(l => ({ desc: l.desc, price: App.round(st.lineCost(l) * st.lineMk(l, est), 2) }));
    if (opts.length) est.options = opts;
    est.workings.pricedAt = Date.now();
    st.log(est, `Price set from workings: ${App.money(est.price)}`);
    App.toast('Estimate price updated from your workings'); save();
  };
  A.imgUpload = async el => {
    const f = el.files[0]; if (!f) return; const est = cur();
    const data = await App.compressImage(f, 1600, 0.8);
    if (st.mode === 'drive') {
      try {
        const folder = await st.jobFolder(est);
        const r = await App.G.uploadOrReplace({ name: '3D image.jpg', parent: folder, blob: App.dataUrlToBlob(data), mime: 'image/jpeg' });
        est.image = { driveId: r.id }; App.Docs.imgCache[r.id] = data;
      } catch (er) { App.toast(er.message, 'err'); return; }
    } else est.image = { data: await App.compressImage(f, 1000, 0.7) };
    save();
  };
  A.imgRemove = () => { cur().image = null; save(); };

  /* Workings actions */
  const defP = () => st.defPct(cur());
  A.steelAdd = () => { const est = cur(); const sec = est.sections[0] || { size: '89x41', gauges: ['0.75'] }; const g = sec.gauges[0] || App.GAUGES[sec.size][0]; est.workings.steel.push({ id: App.uid(), size: sec.size, gauge: g, lm: '', rate: S().pricing.rates[`${sec.size}|${g}`] || '', markupPct: defP() }); save(); };
  A.defMarkup = el => { const est = cur(); const p = App.num(el.value); est.workings.markup = App.round(1 + p / 100, 4); st.log(est, `Default markup set to ${p}%`); save(); };
  A.markupAll = async () => { const est = cur(); const p = defP(); if (!(await App.confirm('Set every line to ' + p + '%?', 'This replaces the markup on every steel line and other line with your default.', 'Set them all'))) return; est.workings.steel.concat(est.workings.lines).forEach(l => { if (l.kind !== 'delivery') { l.markupPct = p; delete l.markup; } }); save(); };
  A.steelRate = el => { const r = cur().workings.steel[+el.dataset.i]; r.gauge = el.value; const rate = S().pricing.rates[`${r.size}|${r.gauge}`]; if (rate) r.rate = rate; save(); };
  A.lineAdd = () => { cur().workings.lines.push({ id: App.uid(), desc: '', qty: 1, unit: 'ea', cost: '', bucket: 'main', markupPct: defP() }); save(); };
  A.labourAdd = () => { cur().workings.lines.push({ id: App.uid(), desc: 'Labour', qty: '', unit: 'hrs', cost: S().pricing.labourRate, bucket: 'main', kind: 'labour', markupPct: defP() }); save(); };
  A.libAdd = el => { const it = S().pricing.items.find(x => x.id === el.value); if (!it) return; cur().workings.lines.push({ id: App.uid(), desc: it.name, qty: 1, unit: it.unit || 'ea', cost: it.cost, bucket: 'main', supplier: it.supplier, supplierEmail: it.supplierEmail, libId: it.id, markupPct: defP() }); save(); };
  A.deliveryAdd = () => {
    const est = cur(); const p = App.Est.deliveryPrice(est); const s = S();
    const desc = `Delivery (${s.delivery.zones[App.num(est.workings.deliveryCalc.zone)]})`;
    let l = est.workings.lines.find(x => x.kind === 'delivery');
    const mk = App.num(est.workings.markup) || 1;
    if (!l) { l = { id: App.uid(), kind: 'delivery', bucket: 'main', unit: 'ea', qty: 1 }; est.workings.lines.push(l); }
    Object.assign(l, { desc, cost: App.round(p, 2), markupPct: 0 }); delete l.markup;
    est.delivery.on = true; App.toast('Delivery added. The price in Settings is your sell price.'); save();
  };
  A.fcUpload = async el => {
    const f = el.files[0]; if (!f) return; App.toast('Reading the drawings…');
    try {
      const fc = await App.FC.parse(await App.readFile(f, 'buffer'), f.name);
      if (!fc.frames.length) throw new Error('No frames found in that PDF. Is it FRAMECAD detailing?');
      cur().workings.framecad = fc; save();
      if (st.mode === 'drive') { try { const folder = await st.subFolder(cur(), 'Plans and detailing'); await App.G.uploadOrReplace({ name: f.name, parent: folder, blob: f, mime: 'application/pdf' }); } catch (er) {} }
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
  A.fcClear = () => { cur().workings.framecad = null; save(); };
  A.fcFrames = () => {
    const fc = cur().workings.framecad;
    App.modal('Frames read from the drawings', `<table class="wtable"><thead><tr><th>Frame</th><th>Group</th><th>Type</th><th class="r">Qty</th><th class="r">Length</th><th class="r">Weight</th><th>Profile</th></tr></thead><tbody>
      ${fc.frames.map(f => `<tr><td>${e(f.name)}</td><td>${e(f.group)}</td><td>${e(f.category)}</td><td class="r">${f.qty}</td><td class="r">${f.length != null ? f.length + ' m' : '-'}</td><td class="r">${f.weight != null ? f.weight + ' kg' : '-'}</td><td>${e(f.profile)}</td></tr>`).join('')}</tbody></table>`, { wide: true });
  };
  A.fcApply = async () => {
    const est = cur(); const fc = est.workings.framecad; const w = est.workings;
    const prof = Object.entries(fc.byProfile).filter(([, lm]) => lm > 0);
    if (prof.length) {
      prof.forEach(([p, lm]) => { const sg = App.FC.profileToSection(p); if (!sg) return; let r = w.steel.find(x => x.size === sg.size && x.gauge === sg.gauge); if (!r) { r = { id: App.uid(), size: sg.size, gauge: sg.gauge, rate: S().pricing.rates[`${sg.size}|${sg.gauge}`] || '', markupPct: defP() }; w.steel.push(r); } r.lm = App.round(lm, 2); w.targets[sg.size] = App.round((App.num(w.targets[sg.size]) || 0) + lm, 2); });
      App.toast('Metres split by profile from the drawings'); save(); return;
    }
    const sizes = est.sections.map(s => s.size);
    const m = App.modal('Which section is this steel?', `<p>The drawings show <b>${App.round(fc.totalLM, 2)} LM</b> in total but don't say which section or gauge. Pick the section, then split it across gauges in the steel table.</p>
      ${App.field('Section', `<select id="fc-sec">${App.opts(sizes.length ? sizes : App.SECTIONS)}</select>`)}`,
      { actions: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="fc-ok">Use these metres</button>` });
    m.querySelector('#fc-ok').onclick = () => {
      const sz = m.querySelector('#fc-sec').value; w.targets[sz] = App.round(fc.totalLM, 2);
      const sec = est.sections.find(s => s.size === sz);
      if (!w.steel.some(r => r.size === sz)) { const g = (sec && sec.gauges[0]) || App.GAUGES[sz][0]; w.steel.push({ id: App.uid(), size: sz, gauge: g, lm: App.round(fc.totalLM, 2), rate: S().pricing.rates[`${sz}|${g}`] || '', markupPct: defP() }); }
      App.closeModal(); save();
    };
  };
  A.sketchPen = () => { App.state.sketchMode = 'pen'; App.toast('Pen'); };
  A.sketchEraser = () => { App.state.sketchMode = 'eraser'; App.toast('Eraser'); };
  A.sketchClear = async () => { if (await App.confirm('Clear the sketch?', 'This wipes the sketch pad for this estimate.', 'Clear')) { cur().workings.sketch = null; save(); } };
  A.workingsPrint = () => App.Docs.preview('My workings', App.Docs.workings(cur()), { pdfName: `${st.displayNumber(cur())} Workings.pdf` });

  /* Estimate actions */
  A.estPrint = async () => { await App.Docs.ensureImage(cur()); App.Docs.print(App.Docs.estimate(cur())); };
  A.estDownload = async el => { el.disabled = true; App.toast('Making the PDF…'); try { await App.Docs.ensureImage(cur()); App.download(`${st.displayNumber(cur())} Estimate.pdf`, await App.Docs.toPdf(App.Docs.estimate(cur()))); } catch (er) { App.toast(er.message, 'err'); } el.disabled = false; };
  A.estPdf = async el => {
    if (st.mode !== 'drive') { App.toast('Connect Google Drive to save to Drive. You can still download the PDF.', 'err', 5000); return; }
    el.disabled = true; App.toast('Saving to Drive…');
    try { await App.Est.savePdf(cur()); App.toast(`Saved to Drive in "${st.folderName(cur())}"`); } catch (er) { App.toast(er.message, 'err', 6000); }
    el.disabled = false;
  };
  const preSend = () => new Promise(res => {
    const items = S().estimate.preSend;
    if (!items.length) return res(true);
    const m = App.modal('Before it goes out', `<div class="checks">${items.map((t, i) => `<label class="check"><input type="checkbox" class="ps"> ${e(t)}</label>`).join('')}</div>`,
      { actions: `<button class="btn ghost" data-r="0">Go back</button><button class="btn primary" data-r="1" disabled>All checked</button>` });
    const ok = m.querySelector('[data-r="1"]');
    m.querySelectorAll('.ps').forEach(c => c.onchange = () => { ok.disabled = ![...m.querySelectorAll('.ps')].every(x => x.checked); });
    m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { App.closeModal(); res(b.dataset.r === '1'); });
  });
  const markSent = est => {
    est.status = 'sent'; est.sentAt = Date.now(); est.sentDate = App.today(); est.sentBy = st.me().email;
    est.followups = { paused: est.followups && est.followups.paused };
    st.upsertCustomer(est); st.log(est, 'Marked as sent'); save();
  };
  A.estMarkSent = async () => { const est = cur(); if (!est.client.name) return App.toast('Add the client name first', 'err'); if (await preSend()) markSent(est); };
  A.estEmail = async () => {
    const est = cur();
    if (!est.client.email) return App.toast('Add the client\'s email address first', 'err');
    if (est.status === 'draft' && !(await preSend())) return;
    const t = App.mail.tpl('estimate', est);
    App.mail.compose({ title: `Email ${st.displayNumber(est)}`, est, kind: 'estimate', to: est.client.email, subject: t.subject, body: t.body, attachEstimate: true, attachBrochure: !!S().estimate.attachBrochure,
      onSent: () => { if (est.status === 'draft') markSent(est); else { st.log(est, 'Estimate emailed again'); save(); } } });
  };
  A.estAccept = () => {
    const est = cur(); const s = S();
    const m = App.modal(`Mark ${st.displayNumber(est)} accepted`, `
      ${App.field('Accepted on', `<input type="date" id="acc-date" value="${App.today()}">`)}
      ${st.mode === 'drive' && est.client.email ? `<label class="check"><input type="checkbox" id="acc-thanks" checked> Send the client a thank-you email with next steps</label>` : ''}
      ${st.mode === 'drive' && s.emails.accountsEmail ? `<label class="check"><input type="checkbox" id="acc-accts" checked> Email ${e(s.emails.accountsEmail)} to raise the deposit invoice in Xero</label>` : `<p class="hint">Add your accounts email in Settings to have the app tell them about the deposit.</p>`}`,
      { actions: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="acc-ok">Mark accepted</button>` });
    m.querySelector('#acc-ok').onclick = async ev => {
      ev.target.disabled = true;
      const thanks = m.querySelector('#acc-thanks') && m.querySelector('#acc-thanks').checked;
      const accts = m.querySelector('#acc-accts') && m.querySelector('#acc-accts').checked;
      est.status = 'accepted'; est.acceptedAt = m.querySelector('#acc-date').value || App.today();
      est.job = est.job || App.Est.newJob(); est.job.acceptedAt = est.acceptedAt;
      if (est.workings.framecad && !est.job.frames.length) est.job.frames = App.clone(est.workings.framecad.frames);
      st.upsertCustomer(est); st.log(est, 'Accepted'); st.touch(est); st.save();
      App.closeModal();
      try {
        if (accts) { const t = App.mail.tpl('accounts', est); await App.G.send({ to: s.emails.accountsEmail, subject: t.subject, html: await App.mail.html(t.body) }); st.log(est, 'Accounts emailed about the deposit'); }
        if (thanks) { const t = App.mail.tpl('thanks', est); await App.G.send({ to: est.client.email, subject: t.subject, html: await App.mail.html(t.body, est, 'thanks') }); st.log(est, 'Thank-you email sent'); }
      } catch (er) { App.toast(er.message, 'err', 6000); }
      st.save(); App.toast('Accepted. It\'s now on the production board.'); location.hash = `#/job/${est.id}`;
    };
  };
  A.estReject = () => {
    const est = cur();
    const m = App.modal(`Mark ${st.displayNumber(est)} rejected`, `${App.field('Why did we miss out?', `<select id="rej-r">${App.opts(S().estimate.lostReasons)}</select>`)}${App.field('Notes', '<input id="rej-n">')}`,
      { actions: `<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="rej-ok">Mark rejected</button>` });
    m.querySelector('#rej-ok').onclick = () => { est.status = 'rejected'; est.lostReason = m.querySelector('#rej-r').value; st.log(est, `Rejected: ${est.lostReason}${m.querySelector('#rej-n').value ? ', ' + m.querySelector('#rej-n').value : ''}`); App.closeModal(); save(); };
  };
  A.estCancel = async () => { if (await App.confirm('Cancel this estimate?', 'The number stays in the tracker, marked as cancelled.', 'Cancel estimate')) { cur().status = 'cancelled'; st.log(cur(), 'Cancelled'); save(); } };
  A.estArchive = () => { cur().archived = !cur().archived; st.log(cur(), cur().archived ? 'Archived' : 'Unarchived'); save(); };
  A.estRevise = async () => {
    const est = cur();
    if (!(await App.confirm(est.status === 'expired' ? 'Re-quote' : 'Create a revision', `This saves the current version and opens ${est.number} Rev ${est.rev + 1} for editing with today's date and a fresh expiry.`, 'Create revision'))) return;
    const snap = App.clone(est); delete snap.revisions; delete snap.activity;
    est.revisions.unshift({ rev: est.rev, at: Date.now(), by: st.me().name, status: est.status, data: snap });
    est.rev += 1; est.status = 'draft'; est.date = App.today(); est.expiry = App.addMonths(est.date, S().estimate.expiryMonths || 1);
    est.followups = { paused: false }; delete est.sentAt; delete est.openedAt;
    st.log(est, `Revision ${est.rev} created`); save();
  };
  A.revView = el => { const r = cur().revisions[+el.dataset.i]; App.Docs.preview(`${cur().number}${r.rev ? ' Rev ' + r.rev : ''}`, App.Docs.estimate(r.data), { pdfName: `${r.data.number}${r.rev ? ' Rev ' + r.rev : ''} Estimate.pdf` }); };
  A.estDuplicate = () => { const src = cur(); const n = st.newEstimate(src.type, App.state.practice); App.Est.copyFields(src, n); st.log(n, `Duplicated from ${st.displayNumber(src)}`); st.touch(n); st.save(); location.hash = `#/e/${n.id}`; };
  A.estConvert = () => { const src = cur(); const n = st.newEstimate(src.type === 'ft' ? 'general' : 'ft', App.state.practice); App.Est.copyFields(src, n); if (n.type === 'ft') n.ft = n.ft || st.newFt(); st.log(n, `Copied from ${st.displayNumber(src)}`); st.touch(n); st.save(); location.hash = `#/e/${n.id}`; };
  A.estTemplate = async () => {
    const name = await App.prompt('Save as template', 'Template name', cur().heading); if (!name) return;
    const src = cur(); const data = {}; App.Est.copyFields(src, data, false); data.type = src.type; if (src.ft) data.ft = App.clone(src.ft);
    delete data.price; data.workings.framecad = null; data.workings.sketch = null; data.image = null;
    st.data.templates.push(st.touch({ id: App.uid(), name, type: src.type, data })); st.save(); App.toast('Template saved');
  };
  A.noteAdd = () => { const v = document.getElementById('note-in').value.trim(); if (!v) return; st.log(cur(), v); save(); };
})();
