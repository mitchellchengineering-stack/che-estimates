/* Data store: settings, estimates/jobs, numbering, sync */
App.SECTIONS = ['75x41', '89x41', '150x41', 'Top hat purlin', 'Top hat batten'];
App.GAUGES = { '75x41': ['0.55', '0.75', '0.95', '1.15'], '89x41': ['0.55', '0.75', '0.95', '1.15'], '150x41': ['0.55', '0.75', '0.95', '1.15'], 'Top hat purlin': ['0.75'], 'Top hat batten': ['0.55'] };
App.sectionLabel = s => /^\d/.test(s) ? `${s} galvanised LGS` : (s === 'Top hat purlin' ? 'Top hat roofing purlins' : 'Top hat ceiling battens');
App.STATUSES = [
  { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' }, { value: 'expired', label: 'Expired' }, { value: 'cancelled', label: 'Cancelled' }
];
App.STAGES = [
  { value: 'accepted', label: 'Accepted' }, { value: 'detailing', label: 'Being detailed' }, { value: 'scheduled', label: 'Scheduled for manufacture' },
  { value: 'manufacturing', label: 'Manufacturing' }, { value: 'yard', label: 'In yard, ready to go' }, { value: 'delivery', label: 'Scheduled for delivery' },
  { value: 'delivered', label: 'Delivered' }, { value: 'complete', label: 'Complete' }
];
App.stageLabel = v => (App.STAGES.find(s => s.value === v) || {}).label || v;
App.CRITERIA = [
  ['frameHeight', 'Frame height'], ['studCentres', 'Stud centres'], ['nogCentres', 'Nog centres'], ['levels', 'Number of levels'],
  ['floorArea', 'Floor area (m²)'], ['roofPitch', 'Roof pitch'], ['roofType', 'Roofing type'], ['windZone', 'Wind zone'],
  ['soffit', 'Soffit overhang'], ['trussType', 'Truss type'], ['heelHeight', 'Heel height'], ['eqZone', 'Earthquake zone']
];

App.defaultSettings = () => ({
  updatedAt: 0,
  company: {
    name: 'CH Engineering Ltd', address: '8 Wickham Street, Frankton, Hamilton 3024', phone: '022 609 0176',
    email: 'operations.chengineering@gmail.com', website: 'www.chengineering.co.nz',
    ccaLine: 'Our estimates and invoices are issued in accordance with the Construction Contracts Act 2002'
  },
  users: [
    { email: 'mitchell.chengineering@gmail.com', name: 'Mitchell', phone: '', admin: true, followupMode: 'ask' },
    { email: 'operations.chengineering@gmail.com', name: 'Davin Barham', phone: '022 609 0176', admin: true, followupMode: 'ask' }
  ],
  numbering: { prefix: 'CHE', startSeq: { '26': 130 } },
  estimate: {
    expiryMonths: 1, depositPct: 25, leadTime: '', showAcceptanceGeneral: true, attachBrochure: true,
    shutdown: { showFrom: '', closedFrom: '', closedTo: '', message: 'Please note we are closed from {closed_from} to {closed_to}. Orders confirmed after {show_from} may be scheduled for manufacture after the break.' },
    steelSpec: 'GS550 galvanised steel (Axxis, NZ Steel)',
    notListed: 'Please note anything not listed in this estimate is not included in this estimate or pricing.',
    preSend: ['Client email and site address checked', 'Sections and gauges correct', 'Delivery on or off as intended', 'GST display correct', 'Price matches workings', '3D image added (if we have one)'],
    leadSources: ['Repeat builder', 'Referral', 'Website', 'Facebook', 'Google', 'Walk-in / phone', 'Other'],
    lostReasons: ['Price', 'Timing', 'Went with timber', 'Went with a competitor', 'Project on hold', 'No response', 'Other']
  },
  tcs: [
    'Validity: This estimate is valid for one month from the date of issue. After that, pricing may be reviewed.',
    'Acceptance: Signing this estimate, confirming acceptance in writing, or paying the deposit is acceptance of the estimate and these terms.',
    'Pricing: Prices are in New Zealand dollars and exclude GST unless stated. Pricing is based on the plans and information supplied at the time of estimating.',
    'Deposit: A 25% deposit is required before detailing or manufacture begins. The balance is payable as invoiced, within 7 days of the invoice date unless agreed otherwise in writing.',
    'Payment claims: Payment claims and invoices are issued in accordance with the Construction Contracts Act 2002.',
    'Variations: Any change to plans, specifications, quantities or scope after acceptance, including re-detailing or remanufacture, will be charged as a variation.',
    'Plans and engineering: The customer is responsible for supplying accurate, current plans. Pricing is subject to the engineer\'s final design. No allowance is made for thicker gauge steel or larger sections unless stated.',
    'Lead times: Lead times are approximate and start once the deposit, final plans and approved detailing are received. We are not liable for delays outside our control.',
    'Delivery: Where included, delivery is by our truck and trailer and unloaded by our team. The site must have clear, safe, all-weather access for a truck and trailer and a flat, dry area close to the build for unloading. Extra charges may apply where access is restricted, waiting time is required, or a return trip is needed.',
    'Checking deliveries: Please check each delivery against the delivery docket and tell us of any shortage or damage within 2 working days.',
    'Storage on site: Once delivered, frames and trusses must be stored off the ground, kept flat and protected. We are not responsible for damage that happens on site after delivery.',
    'Ownership and risk: Risk passes to the customer on delivery. Ownership of all goods stays with CH Engineering Ltd until paid for in full.',
    'Installation: Unless included in this estimate, installation is by others and must follow the plans, detailing and NASH standards. We are not responsible for installation errors by others.',
    'Cancellation: If an order is cancelled after detailing or manufacture has started, costs already incurred are payable and may be deducted from the deposit.',
    'Warranty: Steel is covered by the steel manufacturer\'s warranty. Our liability is limited to repairing or replacing faulty frames we manufactured. Where goods are bought for business purposes, the Consumer Guarantees Act does not apply to the extent permitted by law.',
    'Late payment: Overdue amounts may incur interest and reasonable debt recovery costs.'
  ],
  ft: {
    scopeItems: ['LGS wall framing', 'LGS roof trusses', 'LGS floor joists', 'Lintels and lintel plating', 'Strap bracing', 'Truss to truss connections', 'Truss to wall connections', 'Material box (fixings)', 'LGS engineering', 'Foundation design', 'LGS detailing', 'Producer statement (PS1)'],
    exclusions: [
      { text: 'Timber of any kind', on: true },
      { text: 'Structural steel', on: true },
      { text: 'Installation labour', on: true },
      { text: 'Nogs or framing to truss heels or between gable truss webs for cladding or lining support', on: true },
      { text: 'Thicker gauge or larger profile steel than stated', on: true },
      { text: 'Gutters, downpipes, cladding or roofing', on: false },
      { text: 'Building consent fees', on: false }
    ],
    conditions: [
      'Frame and truss pricing and supply is as per the plans provided at the time of the estimate.',
      'Any additional information, plans, details, requests, revisions or changes not specifically allowed for in this estimate are excluded and, if required, may be charged as a variation during detailing or manufacture.',
      'Please check this estimate matches the job requirements and ask us about anything unclear before signing.',
      'All pricing is subject to the engineer\'s final design.',
      'Where the project includes structural steel such as portals, beams or posts that could affect framing, extra time may be needed for site measures before manufacture.'
    ],
    materialBox: 'Ramset pins and chargers, multigrips, electrical grommets, all fixings to assemble frames on site, grinding discs, top plate connectors, 12kN hold-down brackets and screw bolts.'
  },
  pricing: { markup: 1.2, minMargin: 0.15, labourRate: 65, rates: {}, ratesUpdatedAt: 0, items: [] },
  delivery: {
    zones: ['Zone 1: Hamilton', 'Zone 2: within 50km', 'Zone 3: further than 50km'],
    bands: [50, 150, 250],
    prices: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    truckMaxKg: 0
  },
  production: { capacityPerWeek: 0, reviewDelayDays: 10, monthlyTarget: 0 },
  google: { calendarId: 'primary', calendarSync: true },
  emails: {
    accountsEmail: '', trackingUrl: '', brochureId: '', brochureName: '',
    templates: {
      estimate: { subject: 'Estimate {number}, {heading}', body: 'Hi {first_name},\n\nThanks for the opportunity to price this one. Please find attached our estimate {number} for {heading}.\n\nThe pricing is held until {expiry}. If you have any questions or would like anything adjusted, just reply to this email or give me a call.\n\nCheers,' },
      fu1: { subject: 'Following up: Estimate {number}, {heading}', body: 'Hi {first_name},\n\nI hope you\'re well. I just wanted to check in on the estimate we sent through last week for {heading}. If you have any questions, or if anything needs adjusting, I\'m happy to go through it with you. Just reply to this email or give me a call.\n\nCheers,' },
      fu2: { subject: 'Estimate {number}, {heading}', body: 'Hi {first_name},\n\nJust one last check-in on our estimate for {heading}. Your pricing is held until {expiry}, so if you\'d like to go ahead, or if your plans have changed and you\'d like us to revise anything, just let me know.\n\nIf now isn\'t the right time, no worries at all, and I won\'t keep following up. We\'d love to help whenever you\'re ready.\n\nCheers,' },
      expiry: { subject: 'Your pricing is held until {expiry}: Estimate {number}', body: 'Hi {first_name},\n\nJust a quick heads-up that the pricing on our estimate for {heading} is held until {expiry}. If you\'d like to lock it in, just reply to this email and we\'ll get things moving.\n\nCheers,' },
      thanks: { subject: 'Thanks for going ahead: {number}, {heading}', body: 'Hi {first_name},\n\nThanks for choosing us for {heading}. Here\'s what happens next:\n\n1. We\'ll send through the {deposit_pct}% deposit invoice ({deposit}).\n2. Once the deposit and final plans are in, we\'ll start detailing.\n3. We\'ll confirm manufacture and delivery dates with you.\n\nIf you have any questions along the way, just reply to this email.\n\nCheers,' },
      accounts: { subject: 'Accepted: {number}, {client_name}. Deposit invoice needed', body: 'Hi,\n\n{number} for {client_name} ({heading}) has been accepted.\n\nClient email: {client_email}\nSite: {site_address}\nTotal (excl GST): {total}\nDeposit ({deposit_pct}%, excl GST): {deposit}\n\nCould you please raise the deposit invoice in Xero?\n\nCheers,' },
      delivery: { subject: 'Delivery booked: {number}, {delivery_date}', body: 'Hi {first_name},\n\nYour delivery for {heading} is booked for {delivery_date} ({load}).\n\nWe deliver by truck and trailer and unload ourselves, so please make sure there\'s clear, safe access for a truck and trailer, and a flat, dry area close to the build for unloading.\n\nCheers,' },
      review: { subject: 'How did we do? {heading}', body: 'Hi {first_name},\n\nNow that everything\'s delivered for {heading}, we\'d love to hear how it went. If you have a minute, a Google review really helps a small Waikato business like ours.\n\nThanks again for the work.\n\nCheers,\n\nIf you\'d rather not get emails like this, just reply and let us know and we won\'t send any more.' },
      po: { subject: 'Purchase order {po_number}: {number}', body: 'Hi,\n\nPlease find attached purchase order {po_number} for job {number} ({site_address}).\n\nCheers,' }
    }
  }
});

App.defaultData = () => ({ v: 1, settings: App.defaultSettings(), counters: { practice: 0 }, estimates: [], customers: [], templates: [], events: [] });

App.store = {
  data: null, mode: 'local', rootId: null, fileId: null, saving: false, pending: false, lastSync: 0, logs: [],

  me() {
    const u = App.G.user; const s = this.data && this.data.settings;
    if (!u) { const f = s && s.users[0]; return f ? Object.assign({}, f, { admin: true }) : { email: 'local', name: 'Me', admin: true, followupMode: 'ask' }; }
    const found = s && s.users.find(x => x.email.toLowerCase() === u.email);
    return found || { email: u.email, name: u.name, admin: false, followupMode: 'ask', unknown: true };
  },
  s() { return this.data.settings; },

  normalise(d) {
    const base = App.defaultData();
    d = Object.assign(base, d || {});
    const ds = App.defaultSettings();
    const deep = (target, src) => { Object.keys(src).forEach(k => { if (target[k] === undefined) target[k] = src[k]; else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deep(target[k], src[k]); }); };
    deep(d.settings, ds);
    ['estimates', 'customers', 'templates', 'events'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    return d;
  },

  async load() {
    if (App.G.enabled()) {
      this.mode = 'drive';
      this.rootId = CHE_CONFIG.DRIVE_FOLDER_ID || await this.findRoot();
      const f = await App.G.find('che-app-data.json', this.rootId);
      if (f) { this.fileId = f.id; this.data = this.normalise(JSON.parse(await App.G.getText(f.id) || '{}')); }
      else { this.data = this.normalise(null); await this.persist(true); }
      await this.loadLogs();
    } else {
      this.mode = 'local';
      this.data = this.normalise(JSON.parse(localStorage.getItem('che-data') || 'null'));
    }
    this.housekeeping();
    this.lastSync = Date.now();
  },
  async findRoot() {
    const name = 'CH Engineering Estimates';
    const q = `name='${name}' and mimeType='${App.G.FOLDER}' and trashed=false`;
    const r = await App.G.api(`${App.G.D}?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    if (r.files.length) return r.files[0].id;
    return App.G.folder(name, null);
  },

  /* Merge remote into local in place, newest updatedAt wins per record */
  mergeInto(local, remote) {
    let changed = false;
    if ((remote.settings.updatedAt || 0) > (local.settings.updatedAt || 0)) { local.settings = remote.settings; changed = true; }
    Object.keys(remote.counters || {}).forEach(k => { if ((remote.counters[k] || 0) > (local.counters[k] || 0)) { local.counters[k] = remote.counters[k]; changed = true; } });
    ['estimates', 'customers', 'templates', 'events'].forEach(k => {
      const idx = new Map(local[k].map((r, i) => [r.id, i]));
      (remote[k] || []).forEach(r => {
        if (!idx.has(r.id)) { local[k].push(r); changed = true; }
        else { const i = idx.get(r.id); if ((r.updatedAt || 0) > (local[k][i].updatedAt || 0)) { local[k][i] = r; changed = true; } }
      });
    });
    return changed;
  },

  save() { this.pending = true; App.renderSync && App.renderSync('Saving…'); this._deb(); },
  _deb: App.debounce(() => App.store.persist(), 1200),
  async persist(force) {
    if (this.saving) { this.pending = true; return; }
    this.saving = true; this.pending = false;
    try {
      if (this.mode === 'local') {
        try { localStorage.setItem('che-data', JSON.stringify(this.data)); }
        catch (e) { App.toast('This browser is out of storage space. Connect Google Drive to keep saving.', 'err', 6000); }
      } else {
        if (this.fileId && !force) {
          const remote = this.normalise(JSON.parse(await App.G.getText(this.fileId) || '{}'));
          if (this.mergeInto(this.data, remote)) this.remoteChanged();
        }
        const blob = new Blob([JSON.stringify(this.data)], { type: 'application/json' });
        const r = await App.G.upload({ name: 'che-app-data.json', parent: this.rootId, blob, fileId: this.fileId, mime: 'application/json' });
        this.fileId = r.id;
      }
      this.lastSync = Date.now();
      App.renderSync && App.renderSync('Saved');
    } catch (e) {
      App.renderSync && App.renderSync('Not saved');
      App.toast('Save failed: ' + e.message, 'err', 6000);
      this.pending = true;
    } finally {
      this.saving = false;
      if (this.pending) setTimeout(() => this.persist(), 3000);
    }
  },
  async poll() {
    if (this.mode !== 'drive' || this.saving || this.pending || !App.G.signedIn()) return;
    try {
      const m = await App.G.meta(this.fileId);
      if (new Date(m.modifiedTime).getTime() <= this.lastSync) return;
      const remote = this.normalise(JSON.parse(await App.G.getText(this.fileId) || '{}'));
      this.lastSync = Date.now();
      if (this.mergeInto(this.data, remote)) this.remoteChanged();
      await this.loadLogs();
    } catch (e) { /* quiet */ }
  },
  remoteChanged() {
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#main')) { App.state.staleView = true; return; }
    App.refresh && App.refresh();
  },

  /* Follow-up logs written by the Google Apps Script helper */
  async loadLogs() {
    if (this.mode !== 'drive') return;
    try {
      const files = await App.G.list(this.rootId, ` and name contains 'followup-log-'`);
      const logs = [];
      for (const f of files) { try { const j = JSON.parse(await App.G.getText(f.id)); (j.entries || []).forEach(e => logs.push(e)); } catch (e) {} }
      const opens = await App.G.find('email-opens.json', this.rootId);
      if (opens) { try { const j = JSON.parse(await App.G.getText(opens.id)); (j.opens || []).forEach(o => logs.push(Object.assign({ kind: 'open' }, o))); } catch (e) {} }
      this.logs = logs;
      this.applyLogs();
    } catch (e) {}
  },
  applyLogs() {
    let changed = false;
    this.logs.forEach(l => {
      const est = this.get(l.estId); if (!est) return;
      est.followups = est.followups || {};
      if (l.kind === 'open') { if (!est.openedAt || l.at < est.openedAt) { est.openedAt = l.at; } return; }
      if (l.kind === 'review') { if (est.job && !est.job.reviewDone && l.status !== 'queued') { est.job.reviewDone = { status: l.status, at: l.at }; changed = true; } return; }
      const cur = est.followups[l.kind];
      if (!cur || (cur.status === 'queued' && l.status !== 'queued')) {
        if (cur && cur.status === l.status) return;
        est.followups[l.kind] = { status: l.status, at: l.at, by: l.by, source: 'script' };
        changed = true;
      }
    });
    if (changed) this.save();
  },

  /* Housekeeping on load: expire old estimates */
  housekeeping() {
    const today = App.today(); let changed = false;
    this.data.estimates.forEach(e => {
      if (e.status === 'sent' && e.expiry && e.expiry < today) { e.status = 'expired'; this.log(e, 'Marked expired (past expiry date)'); this.touch(e); changed = true; }
    });
    if (changed) this.save();
  },

  /* Records */
  touch(rec) { rec.updatedAt = Date.now(); rec.updatedBy = this.me().email; return rec; },
  log(est, text) { est.activity = est.activity || []; est.activity.unshift({ at: Date.now(), by: this.me().name, text }); },
  get(id) { return this.data.estimates.find(e => e.id === id); },
  live() { return this.data.estimates.filter(e => !e.deleted); },

  yy(dateStr) { return (dateStr || App.today()).slice(2, 4); },
  nextSeq(yy) {
    const s = this.s(); const start = (s.numbering.startSeq && s.numbering.startSeq[yy]) || 1;
    const used = this.data.estimates.filter(e => !e.practice && !e.parentId && e.yy === yy).map(e => e.seq || 0);
    return Math.max(start, (this.data.counters[yy] || 0) + 1, used.length ? Math.max(...used) + 1 : 0);
  },
  numberFor(yy, seq) { return `${this.s().numbering.prefix}${yy}${String(seq).padStart(3, '0')}`; },

  newEstimate(type, practice = false, opts = {}) {
    const s = this.s(); const me = this.me(); const today = App.today(); const yy = opts.yy || this.yy(today);
    let number, seq = null;
    if (opts.number) number = opts.number;
    else if (practice) { this.data.counters.practice = (this.data.counters.practice || 0) + 1; number = 'TEST-' + String(this.data.counters.practice).padStart(3, '0'); }
    else { seq = this.nextSeq(yy); this.data.counters[yy] = seq; number = this.numberFor(yy, seq); }
    const est = {
      id: App.uid(), type, practice, yy, seq, number, parentId: opts.parentId || null, rev: 0, status: 'draft', archived: false,
      createdAt: Date.now(), createdBy: me.email, preparedBy: me.name, date: today, expiry: App.addMonths(today, s.estimate.expiryMonths || 1),
      client: { name: '', company: '', email: '', phone: '' }, siteAddress: '', heading: '', description: '', leadSource: '',
      sections: [{ size: '89x41', gauges: ['0.75'] }],
      building: { width: '', depth: '', studHeight: '2.4', roofPitch: '', floorArea: '' },
      ft: type === 'ft' ? this.newFt() : null,
      inclusions: [], options: [], extras: [], notes: '',
      delivery: { on: false }, gst: false, price: 0, image: null,
      showAcceptance: type === 'ft' ? true : !!s.estimate.showAcceptanceGeneral,
      followups: { paused: false }, activity: [], revisions: [],
      workings: { markup: s.pricing.markup, steel: [], targets: {}, lines: [], notes: '', sketch: null, framecad: null, pricedAt: null, deliveryCalc: { zone: 0, area: '' } },
      job: null, drive: {}
    };
    this.log(est, `Created${practice ? ' (practice)' : ''}`);
    this.touch(est);
    this.data.estimates.push(est);
    this.save();
    return est;
  },
  newFt() {
    const s = this.s(); const criteria = {};
    App.CRITERIA.forEach(([k]) => criteria[k] = { v: '', a: false });
    criteria.studCentres.v = '600crs'; criteria.nogCentres.v = '1200crs'; criteria.frameHeight.v = '2400';
    const scope = {}; s.ft.scopeItems.forEach(i => scope[i] = ['LGS wall framing', 'LGS roof trusses', 'Material box (fixings)', 'LGS detailing'].includes(i) ? 'inc' : 'exc');
    return {
      projectName: '', plansStage: 'Concept', plansDate: '', plansRev: '', criteria, scope,
      materialBox: s.ft.materialBox, notes: [], exclusions: s.ft.exclusions.map(x => ({ text: x.text, on: x.on })), conditions: s.ft.conditions.slice()
    };
  },
  displayNumber(e) { return e.number + (e.rev ? ` Rev ${e.rev}` : ''); },

  /* Customers address book */
  upsertCustomer(est) {
    const c = est.client; if (!c.name) return;
    const key = (c.email || c.name).toLowerCase();
    let cust = this.data.customers.find(x => (x.email || x.name).toLowerCase() === key);
    if (!cust) { cust = { id: App.uid(), name: c.name, company: c.company, email: c.email, phone: c.phone }; this.data.customers.push(cust); }
    else Object.assign(cust, { name: c.name, company: c.company || cust.company, email: c.email || cust.email, phone: c.phone || cust.phone });
    this.touch(cust);
  },

  /* Money maths */
  lineCost(l) { return App.num(l.qty) * App.num(l.cost); },
  steelCost(r) { return App.num(r.lm) * App.num(r.rate); },
  calc(est) {
    const w = est.workings || {}; const mk = App.num(w.markup) || 1;
    let cost = 0, main = 0, extra = 0, option = 0, mainCost = 0, extraCost = 0;
    (w.steel || []).forEach(r => { const c = this.steelCost(r); const s = c * (r.markup ? App.num(r.markup) : mk); cost += c; mainCost += c; main += s; });
    (w.lines || []).forEach(l => {
      const c = this.lineCost(l); const s = c * (l.markup ? App.num(l.markup) : mk);
      if (l.bucket === 'option') { option += s; return; }
      cost += c;
      if (l.bucket === 'extra') { extra += s; extraCost += c; } else { main += s; mainCost += c; }
    });
    const sell = main + extra;
    return { cost, main, extra, option, sell, mainCost, extraCost, margin: sell ? (sell - cost) / sell : 0 };
  },
  totals(est) {
    const extras = (est.extras || []).reduce((a, x) => a + App.num(x.price), 0);
    const sub = App.num(est.price) + extras;
    const gst = sub * 0.15;
    return { price: App.num(est.price), extras, sub, gst, incl: sub + gst, deposit: sub * (this.s().estimate.depositPct / 100) };
  },
  steelByLM(est) { const o = {}; (est.workings.steel || []).forEach(r => { o[r.size] = (o[r.size] || 0) + App.num(r.lm); }); return o; },

  vars(est, extra = {}) {
    const s = this.s(); const t = this.totals(est);
    return Object.assign({
      first_name: App.firstName(est.client.name), client_name: est.client.company || est.client.name, client_email: est.client.email,
      number: this.displayNumber(est), heading: est.heading || 'your project', site_address: est.siteAddress || '',
      expiry: App.fmtLong(est.expiry), total: App.money(t.sub), deposit: App.money(t.deposit), deposit_pct: s.estimate.depositPct,
      sender_name: this.me().name, phone: this.me().phone || s.company.phone,
      closed_from: App.fmtLong(s.estimate.shutdown.closedFrom), closed_to: App.fmtLong(s.estimate.shutdown.closedTo), show_from: App.fmtLong(s.estimate.shutdown.showFrom)
    }, extra);
  },

  /* Drive job folders */
  folderName(est) { return App.slug(`${est.number} – ${est.client.company || est.client.name || 'Client'} – ${est.heading || 'Estimate'}`); },
  async jobFolder(est) {
    if (this.mode !== 'drive') throw new Error('Connect Google Drive to save files.');
    est.drive = est.drive || {};
    const year = '20' + (est.yy || this.yy(est.date));
    const yearId = await App.G.folder(est.practice ? 'Practice' : year, this.rootId);
    const want = this.folderName(est);
    if (est.drive.folderId) {
      try { const m = await App.G.meta(est.drive.folderId); if (m.name !== want) await App.G.rename(est.drive.folderId, want); return est.drive.folderId; } catch (e) { /* recreate */ }
    }
    est.drive.folderId = await App.G.folder(want, yearId);
    this.touch(est); this.save();
    return est.drive.folderId;
  },
  async subFolder(est, name) { const p = await this.jobFolder(est); return App.G.folder(name, p); }
};
