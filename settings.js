/* Settings */
(() => {
  const e = App.esc, S = () => App.store.s(), st = App.store, A = App.actions;
  const SECTIONS = [['company', 'Company and users'], ['estimates', 'Estimates'], ['tcs', 'Terms and conditions'], ['ft', 'Frame and truss defaults'], ['pricing', 'Pricing'], ['delivery', 'Delivery'], ['production', 'Production'], ['stock', 'Coils and fasteners'], ['emails', 'Emails'], ['google', 'Google and data']];
  const inp = (path, val, attrs = '') => `<input data-bind="${path}" value="${e(val ?? '')}" ${attrs}>`;
  const list = (path, items, ph, rows = 1) => `<div class="list-ed">${items.map((it, i) => `<div class="row">${rows > 1 ? `<textarea data-bind="${path}.${i}" rows="${rows}" placeholder="${e(ph)}">${e(it)}</textarea>` : `<input data-bind="${path}.${i}" value="${e(it)}" placeholder="${e(ph)}">`}
    <span class="move"><button class="icon-btn" data-act="rowMove" data-path="${path}" data-i="${i}" data-d="-1" aria-label="Move up">↑</button><button class="icon-btn" data-act="rowMove" data-path="${path}" data-i="${i}" data-d="1" aria-label="Move down">↓</button></span>
    <button class="icon-btn" data-act="rowDel" data-path="${path}" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}
    <button class="btn small ghost" data-act="rowAdd" data-path="${path}" data-tpl='""'>Add</button></div>`;

  App.views.settings = (sec = 'company') => {
    const s = S(); App.cur = s; const me = st.me();
    const body = (App.Set[sec] || App.Set.company)(s);
    return `<div class="page-head"><div><h1>Settings</h1><p class="sub">${me.admin ? 'Changes save automatically and apply to everyone.' : 'Only admins can change settings.'}</p></div></div>
      <div class="settings"><nav class="set-nav">${SECTIONS.map(([k, l]) => `<a href="#/settings/${k}" class="${sec === k ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <fieldset class="set-body" ${me.admin ? '' : 'disabled'}>${body}</fieldset></div>`;
  };
  App.Set = {};

  App.Set.company = s => `<section class="card"><h3>Company details</h3><p class="hint">These show on every estimate, docket and purchase order.</p>
    <div class="grid2">${App.field('Company name', inp('company.name', s.company.name))}${App.field('Address', inp('company.address', s.company.address))}
    ${App.field('Phone', inp('company.phone', s.company.phone))}${App.field('Email', inp('company.email', s.company.email))}
    ${App.field('Website', inp('company.website', s.company.website))}${App.field('Footer line', inp('company.ccaLine', s.company.ccaLine))}</div></section>
    <section class="card"><h3>Who can use the app</h3><p class="hint">Only these Google accounts can sign in. Each person's name shows as "Prepared by" and their phone is used in their emails.</p>
    <table class="wtable"><thead><tr><th>Name</th><th>Gmail address</th><th>Phone</th><th>Admin</th><th></th></tr></thead><tbody>
    ${s.users.map((u, i) => `<tr><td>${inp(`users.${i}.name`, u.name)}</td><td>${inp(`users.${i}.email`, u.email, 'type="email"')}</td><td>${inp(`users.${i}.phone`, u.phone)}</td><td><input type="checkbox" data-bind="users.${i}.admin" ${u.admin ? 'checked' : ''}></td><td><button class="icon-btn" data-act="rowDel" data-path="users" data-i="${i}" aria-label="Remove">✕</button></td></tr>`).join('')}
    </tbody></table><button class="btn small ghost" data-act="rowAdd" data-path="users" data-tpl='{"name":"","email":"","phone":"","admin":false,"followupMode":"ask"}'>Add a person</button></section>`;

  App.Set.estimates = s => {
    const yy = st.yy(); const es = s.estimate;
    return `<section class="card"><h3>Practice mode</h3><p class="hint">Practice estimates get TEST numbers, don't use up real numbers, and stay out of the stats. A small banner shows at the top while it's on. This is set for this computer only.</p>
      <label class="switch"><input type="checkbox" data-act-change="togglePractice" ${App.state.practice ? 'checked' : ''}><span></span>Practice mode</label></section>
    <section class="card"><h3>Numbering</h3>
      <div class="grid3">${App.field('Prefix', inp('numbering.prefix', s.numbering.prefix))}
      ${App.field(`First number for 20${yy}`, `<input data-bind="numbering.startSeq.${yy}" data-type="num" value="${e(s.numbering.startSeq[yy] || 1)}" data-rerender-blur="1">`)}
      <div class="fld"><span>Next estimate will be</span><div class="calc-val">${e(st.numberFor(yy, st.nextSeq(yy)))}</div></div></div>
      <p class="hint">Each new year starts again at 001 (e.g. CHE27001), and the tracker gets a tab for each year.</p></section>
    <section class="card"><h3>Estimate defaults</h3><div class="grid3">
      ${App.field('Valid for (months)', `<input data-bind="estimate.expiryMonths" data-type="num" value="${e(es.expiryMonths)}">`)}
      ${App.field('Deposit (%)', `<input data-bind="estimate.depositPct" data-type="num" value="${e(es.depositPct)}">`)}
      ${App.field('Current lead time', inp('estimate.leadTime', es.leadTime, 'placeholder="e.g. approx. 4 weeks from approval"'))}</div>
      ${App.field('Steel specification line', inp('estimate.steelSpec', es.steelSpec))}
      ${App.field('"Not listed" note', `<textarea data-bind="estimate.notListed" rows="2">${e(es.notListed)}</textarea>`)}
      <label class="check"><input type="checkbox" data-bind="estimate.showAcceptanceGeneral" ${es.showAcceptanceGeneral ? 'checked' : ''}> Show the signature box on General estimates by default</label>
      <label class="check"><input type="checkbox" data-bind="estimate.attachBrochure" ${es.attachBrochure ? 'checked' : ''}> Attach the brochure to estimate emails by default</label></section>
    <section class="card"><h3>Holiday shutdown note</h3><p class="hint">Between "Show from" and the end of the break, this note is added to every estimate.</p>
      <div class="grid3">${App.field('Show from', `<input type="date" data-bind="estimate.shutdown.showFrom" value="${e(es.shutdown.showFrom)}">`)}${App.field('Closed from', `<input type="date" data-bind="estimate.shutdown.closedFrom" value="${e(es.shutdown.closedFrom)}">`)}${App.field('Back on', `<input type="date" data-bind="estimate.shutdown.closedTo" value="${e(es.shutdown.closedTo)}">`)}</div>
      ${App.field('Message', `<textarea data-bind="estimate.shutdown.message" rows="2">${e(es.shutdown.message)}</textarea>`)}</section>
    <section class="card"><h3>Checklist before an estimate goes out</h3>${list('estimate.preSend', es.preSend, 'Check item')}</section>
    <div class="grid2"><section class="card"><h3>How clients find us</h3>${list('estimate.leadSources', es.leadSources, 'Source')}</section>
    <section class="card"><h3>Reasons we miss out</h3>${list('estimate.lostReasons', es.lostReasons, 'Reason')}</section></div>
    <section class="card"><h3>Templates</h3>${st.data.templates.filter(t => !t.deleted).length ? `<ul class="activity">${st.data.templates.filter(t => !t.deleted).map(t => `<li>${e(t.name)} <span class="tag">${t.type === 'ft' ? 'F&amp;T' : 'General'}</span> <button class="btn small ghost danger" data-act="tplDel" data-id="${t.id}">Delete</button></li>`).join('')}</ul>` : '<p class="hint">Save any estimate as a template from its "More" menu.</p>'}</section>
    <section class="card"><h3>Client address book</h3><p class="hint">Clients are added automatically when an estimate is sent.</p>${st.data.customers.filter(c => !c.deleted).length ? `<table class="wtable"><tbody>${st.data.customers.filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name)).map(c => `<tr><td>${e(c.name)}</td><td>${e(c.company || '')}</td><td>${e(c.email || '')}</td><td>${e(c.phone || '')}</td><td><button class="icon-btn" data-act="custDel" data-id="${c.id}" aria-label="Remove">✕</button></td></tr>`).join('')}</tbody></table>` : '<p class="hint">Empty for now.</p>'}</section>`;
  };

  App.Set.tcs = s => `<section class="card"><h3>Terms and conditions</h3><p class="hint">These print on the last page of every estimate. Start a line with a short title and a colon (e.g. "Delivery: …") to make the title bold. These are a sensible starting point, but it's worth having them checked by a lawyer.</p>${list('tcs', s.tcs, 'Term', 3)}</section>`;

  App.Set.ft = s => `<section class="card"><h3>Scope items</h3><p class="hint">Each F&amp;T estimate lets you mark these as included or not included.</p>${list('ft.scopeItems', s.ft.scopeItems, 'Scope item')}</section>
    <section class="card"><h3>Standard exclusions</h3><p class="hint">Ticked ones are switched on for new F&amp;T estimates.</p>
      <div class="list-ed">${s.ft.exclusions.map((x, i) => `<div class="row"><input type="checkbox" data-bind="ft.exclusions.${i}.on" ${x.on ? 'checked' : ''} aria-label="On by default">${inp(`ft.exclusions.${i}.text`, x.text)}<button class="icon-btn" data-act="rowDel" data-path="ft.exclusions" data-i="${i}" aria-label="Remove">✕</button></div>`).join('')}
      <button class="btn small ghost" data-act="rowAdd" data-path="ft.exclusions" data-tpl='{"text":"","on":true}'>Add</button></div></section>
    <section class="card"><h3>Standard conditions</h3>${list('ft.conditions', s.ft.conditions, 'Condition', 2)}</section>
    <section class="card"><h3>Material box contents</h3><textarea data-bind="ft.materialBox" rows="3">${e(s.ft.materialBox)}</textarea></section>`;

  App.Set.pricing = s => {
    const p = s.pricing; const gauges = ['0.55', '0.75', '0.95', '1.15'];
    return `<section class="card"><h3>Markup and labour</h3><div class="grid3">
      ${App.field('Default markup (%)', `<input data-act-change="setMarkupPct" value="${e(App.round((App.num(p.markup) - 1) * 100, 2))}" inputmode="decimal">`)}
      ${App.field('Minimum margin (%)', `<input data-act-change="minMargin" value="${e(App.round(p.minMargin * 100, 1))}">`)}
      ${App.field('Labour rate ($/hr cost)', `<input data-bind="pricing.labourRate" data-type="num" value="${e(p.labourRate)}">`)}</div></section>
    <section class="card"><h3>Steel cost per lineal metre</h3><p class="hint">Your cost, before markup. When you change these, estimates priced on the old rates get flagged.</p>
      <table class="wtable rates"><thead><tr><th>Section</th>${gauges.map(g => `<th class="r">${g} BMT</th>`).join('')}</tr></thead><tbody>
      ${App.SECTIONS.map(sec => `<tr><td>${e(sec)}</td>${gauges.map(g => App.GAUGES[sec].includes(g) ? `<td><input class="num" data-act-change="rateSet" data-k="${e(sec)}|${g}" value="${e(p.rates[`${sec}|${g}`] ?? '')}" placeholder="$"></td>` : '<td></td>').join('')}</tr>`).join('')}</tbody></table>
      ${p.ratesUpdatedAt ? `<p class="hint">Rates last changed ${App.fmtStamp(p.ratesUpdatedAt)}</p>` : ''}</section>
    <section class="card"><h3>Price list</h3><p class="hint">Things you add often: garage doors, PA doors, windows, flashings, screws. Add the supplier so you can make purchase orders.</p>
      <table class="wtable"><thead><tr><th>Item</th><th>Unit</th><th class="r">Cost</th><th>Supplier</th><th>Supplier email</th><th></th></tr></thead><tbody>
      ${p.items.map((it, i) => `<tr><td>${inp(`pricing.items.${i}.name`, it.name)}</td><td>${inp(`pricing.items.${i}.unit`, it.unit, 'class="unit"')}</td><td><input class="num" data-bind="pricing.items.${i}.cost" data-type="num" value="${e(it.cost)}"></td><td>${inp(`pricing.items.${i}.supplier`, it.supplier)}</td><td>${inp(`pricing.items.${i}.supplierEmail`, it.supplierEmail, 'type="email"')}</td><td><button class="icon-btn" data-act="rowDel" data-path="pricing.items" data-i="${i}" aria-label="Remove">✕</button></td></tr>`).join('')}
      </tbody></table><button class="btn small ghost" data-act="itemAdd">Add an item</button></section>`;
  };

  App.Set.delivery = s => {
    const d = s.delivery; const bandLabel = i => i === 0 ? `Up to ${d.bands[0]}m²` : i < d.bands.length ? `${d.bands[i - 1]}–${d.bands[i]}m²` : `Over ${d.bands[d.bands.length - 1]}m²`;
    return `<section class="card"><h3>Delivery prices</h3><p class="hint">Your sell price for delivery, by zone and floor area. The workings pad uses this.</p>
      <div class="grid3">${d.bands.map((b, i) => App.field(`Floor area band ${i + 1} ends at (m²)`, `<input data-bind="delivery.bands.${i}" data-type="num" value="${e(b)}" data-rerender-blur="1">`)).join('')}</div>
      <table class="wtable"><thead><tr><th>Zone</th>${Array.from({ length: d.bands.length + 1 }, (_, i) => `<th class="r">${bandLabel(i)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${d.zones.map((z, zi) => `<tr><td>${inp(`delivery.zones.${zi}`, z)}</td>${Array.from({ length: d.bands.length + 1 }, (_, bi) => `<td><input class="num" data-bind="delivery.prices.${zi}.${bi}" data-type="num" value="${e((d.prices[zi] || [])[bi] ?? '')}" placeholder="$"></td>`).join('')}<td><button class="icon-btn" data-act="zoneDel" data-i="${zi}" aria-label="Remove zone">✕</button></td></tr>`).join('')}
      </tbody></table><button class="btn small ghost" data-act="zoneAdd">Add a zone</button></section>
      <section class="card"><h3>Truck and trailer</h3>${App.field('Most it can carry (kg)', `<input data-bind="delivery.truckMaxKg" data-type="num" value="${e(d.truckMaxKg || '')}">`)}<p class="hint">Used to warn you when a delivery load is too heavy.</p></section>`;
  };

  App.Set.production = s => `<section class="card"><h3>Production</h3><div class="grid3">
    ${App.field('Jobs the factory can handle a week', `<input data-bind="production.capacityPerWeek" data-type="num" value="${e(s.production.capacityPerWeek || '')}">`)}
    ${App.field('Days after completion to ask for a review', `<input data-bind="production.reviewDelayDays" data-type="num" value="${e(s.production.reviewDelayDays)}">`)}
    ${App.field('Monthly sales target ($ excl GST)', `<input data-bind="production.monthlyTarget" data-type="num" value="${e(s.production.monthlyTarget || '')}">`)}</div>
    <p class="hint">When you book a job into a week that's already full, the app warns you.</p></section>`;

  App.Set.stock = s => {
    const c = s.coils, f = s.fasteners; const C = App.Coil;
    return `<section class="card"><h3>Coil tracker</h3><p class="hint">The Coils page uses your existing coil tracker script and Coil Register sheet, so all coils, PINs and QR labels carry over.</p>
      ${App.field('Coil tracker web app link', inp('coils.apiUrl', c.apiUrl, 'placeholder="https://script.google.com/macros/s/…/exec"'))}
      <div class="grid3">${App.field('Widths (mm, comma separated)', `<input data-act-change="numList" data-path="coils.widths" value="${e((c.widths || []).join(', '))}">`)}${App.field('Thicknesses (BMT, comma separated)', `<input data-act-change="numList" data-path="coils.thicknesses" value="${e((c.thicknesses || []).join(', '))}">`)}${App.field('Default grade', inp('coils.defaultGrade', c.defaultGrade))}</div>
      ${App.field('Warn when a gauge is down to this many coils', `<input data-bind="coils.lowPerGauge" data-type="num" value="${e(c.lowPerGauge ?? 1)}" style="max-width:120px">`)}
      <p>${C && C.S.user ? `Signed in to the coil tracker as <b>${e(C.S.user.name)}</b> on this computer. <button class="btn small ghost" data-act="coilSignOut">Sign out</button>` : 'Not signed in to the coil tracker on this computer. <a href="#/coils">Sign in on the Coils page</a>.'}</p></section>
    <section class="card"><h3>Fasteners</h3><p class="hint">The Fasteners page reads the stock app's Google Sheet. Everyone who uses the estimates app needs to be able to open that sheet (Viewer is enough).</p>
      ${App.field('Fastener Google Sheet ID', inp('fasteners.sheetId', f.sheetId, 'placeholder="the long code between /d/ and /edit in the sheet\'s address"'))}
      ${App.field('Stock app link (for the "Open the stock app" button)', inp('fasteners.appUrl', f.appUrl))}</section>`;
  };

  App.Set.emails = s => {
    const em = s.emails; const names = { estimate: 'Sending an estimate', fu1: 'First follow-up (1 week)', fu2: 'Second follow-up (2 weeks)', expiry: 'Expiry reminder (3 days before)', thanks: 'Thank you on acceptance', accounts: 'To accounts on acceptance', delivery: 'Delivery booked', review: 'Review request', po: 'Purchase order' };
    return `<section class="card"><h3>Email settings</h3><div class="grid2">
      ${App.field('Accounts email (for deposit invoices in Xero)', inp('emails.accountsEmail', em.accountsEmail, 'type="email"'))}
      ${App.field('Email open tracking link (from the helper script)', inp('emails.trackingUrl', em.trackingUrl, 'placeholder="https://script.google.com/macros/s/…/exec"'))}</div>
      <h4>Brochure or capability statement</h4>
      ${em.brochureId ? `<p>${e(em.brochureName)} <button class="btn small ghost" data-act="brochureDel">Remove</button></p>` : ''}
      ${st.mode === 'drive' ? `<label class="drop small">${em.brochureId ? 'Replace' : 'Upload'} PDF<input type="file" accept="application/pdf" data-act-change="brochureUp" hidden></label>` : '<p class="hint">Connect Google Drive to upload a brochure.</p>'}</section>
    <section class="card"><h3>Email wording</h3><p class="hint">You can use: {first_name}, {client_name}, {number}, {heading}, {site_address}, {expiry}, {total}, {deposit}, {deposit_pct}, {delivery_date}, {load}, {po_number}. Your Gmail signature is added after "Cheers,".</p>
      ${Object.keys(names).map(k => `<details class="tpl"><summary>${names[k]}</summary>${App.field('Subject', inp(`emails.templates.${k}.subject`, em.templates[k].subject))}${App.field('Message', `<textarea data-bind="emails.templates.${k}.body" rows="9">${e(em.templates[k].body)}</textarea>`)}</details>`).join('')}</section>`;
  };

  App.Set.google = s => `<section class="card"><h3>Google connection</h3>
    ${st.mode === 'drive' ? `<p>Connected as <b>${e(App.G.user && App.G.user.email)}</b>. Everything is saved in your shared Google Drive folder.</p>
      ${App.field('Shared Drive folder ID', `<input readonly value="${e(st.rootId)}" onclick="this.select()">`)}
      <p class="hint">Put this ID in <code>js/config.js</code> as DRIVE_FOLDER_ID and share the folder with everyone in "Who can use the app". <a href="https://drive.google.com/drive/folders/${e(st.rootId)}" target="_blank" rel="noopener">Open the folder</a></p>
      <div class="grid2">${App.field('Google Calendar ID', inp('google.calendarId', s.google.calendarId, 'placeholder="primary"'))}<div class="fld"><span>Calendar</span><label class="check"><input type="checkbox" data-bind="google.calendarSync" ${s.google.calendarSync ? 'checked' : ''}> Add manufacture and delivery dates to Google Calendar</label></div></div>
      <button class="btn" data-act="signOut">Sign out</button>`
    : `<p>The app is running in <b>this browser only</b> mode, so everything is saved on this computer. Follow the setup guide (README) to connect Google Drive, Gmail and Calendar.</p>`}</section>
    <section class="card"><h3>Backup</h3><p class="hint">Download everything as a single file, or load a backup back in (it merges, nothing is deleted).</p>
      <div class="row-btns"><button class="btn" data-act="backupDown">Download backup</button><label class="btn ghost">Load a backup<input type="file" accept="application/json" data-act-change="backupUp" hidden></label></div></section>`;

  const save = () => { S().updatedAt = Date.now(); st.save(); App.refresh(); };
  A.rowMove = el => { const arr = App.getPath(App.cur, el.dataset.path); const i = +el.dataset.i, j = i + (+el.dataset.d); if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; st.touch(App.cur); st.save(); App.refresh(); };
  A.rateSet = el => { const p = S().pricing; const v = el.value === '' ? '' : App.num(el.value); if (p.rates[el.dataset.k] !== v) { p.rates[el.dataset.k] = v; p.ratesUpdatedAt = Date.now(); } save(); };
  A.numList = el => { App.setPath(S(), el.dataset.path, el.value.split(/[,\s]+/).map(Number).filter(n => n > 0)); save(); };
  A.setMarkupPct = el => { S().pricing.markup = App.round(1 + App.num(el.value) / 100, 4); save(); };
  A.minMargin = el => { S().pricing.minMargin = App.num(el.value) / 100; save(); };
  A.itemAdd = () => { S().pricing.items.push({ id: App.uid(), name: '', unit: 'ea', cost: '', supplier: '', supplierEmail: '' }); save(); };
  A.zoneAdd = () => { const d = S().delivery; d.zones.push(`Zone ${d.zones.length + 1}`); d.prices.push(Array(d.bands.length + 1).fill(0)); save(); };
  A.zoneDel = el => { const d = S().delivery; d.zones.splice(+el.dataset.i, 1); d.prices.splice(+el.dataset.i, 1); save(); };
  A.tplDel = el => { const t = st.data.templates.find(x => x.id === el.dataset.id); t.deleted = true; st.touch(t); st.save(); App.refresh(); };
  A.custDel = el => { const c = st.data.customers.find(x => x.id === el.dataset.id); c.deleted = true; st.touch(c); st.save(); App.refresh(); };
  A.brochureUp = async el => {
    const f = el.files[0]; if (!f) return;
    try { const folder = await App.G.folder('Brochure', st.rootId); const r = await App.G.upload({ name: f.name, parent: folder, blob: f, mime: 'application/pdf' }); S().emails.brochureId = r.id; S().emails.brochureName = f.name; save(); App.toast('Brochure uploaded'); }
    catch (er) { App.toast(er.message, 'err'); }
  };
  A.brochureDel = () => { S().emails.brochureId = ''; S().emails.brochureName = ''; save(); };
  A.signOut = () => App.G.signOut();
  A.backupDown = () => App.download(`CH Engineering estimates backup ${App.today()}.json`, JSON.stringify(st.data, null, 1), 'application/json');
  A.backupUp = async el => {
    const f = el.files[0]; if (!f) return;
    try { const d = st.normalise(JSON.parse(await App.readFile(f, 'text'))); st.mergeInto(st.data, d); st.save(); App.toast('Backup loaded'); App.refresh(); }
    catch (er) { App.toast('That file isn\'t a backup from this app.', 'err'); }
  };
})();
