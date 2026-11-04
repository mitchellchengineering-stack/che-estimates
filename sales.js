/* Sales: the CH Sales Tracker, rebuilt inside the hub.
   Uses the same Apps Script and "CH Sales Tracker" Google Sheet, so contacts, calls, photos, templates
   and the weekly emails all carry on. The old phone app can keep running alongside it. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const PRODUCTS = [{ key: 'steel', label: 'Steel Framing', short: 'Framing' }, { key: 'battens', label: 'Ceiling Battens', short: 'Battens' }, { key: 'doors', label: 'Pre-hung Doors', short: 'Doors' }, { key: 'brackets', label: 'Brackets', short: 'Brackets' }];
  const STATUSES = ['Interested', 'Maybe', 'Call back later', 'Not interested'];
  const STAGES = ['Lead', 'Quote sent', 'Won', 'Lost'];
  const TEMPS = ['Hot', 'Warm', 'Cold'];
  const CUSTOMER_TYPES = ['Builder', 'Group home builder', 'Developer', 'Architect / designer', 'Homeowner', 'Merchant / reseller', 'Other'];
  const SOURCES = ['Cold call', 'Referral', 'Trade show', 'Website', 'Drop-in visit', 'Social media', 'Existing customer', 'Other'];
  const REASONS = ['Price', 'Sticking with timber', 'Already has a supplier', 'No current projects', 'Not the decision maker', 'Timing / lead time', 'Other'];
  const OUTCOMES = ['Interested', 'Maybe', 'Call back later', 'Not interested', 'Left voicemail', 'No answer', 'Quote sent', 'Just a chat'];
  const KIND = { followup: 'Follow up', callback: 'Call back', review: 'Ask for a review', revisit: 'Revisit' };
  const TABS = [['all', 'All'], ['due', 'Follow-ups due'], ['steel', 'Steel Framing'], ['battens', 'Ceiling Battens'], ['doors', 'Pre-hung Doors'], ['brackets', 'Brackets'], ['framesdoors', 'Frames + Doors'], ['hot', 'Hot'], ['callback', 'Call back'], ['maybe', 'Maybe'], ['not', 'Not interested'], ['customers', 'Customers'], ['archived', 'Archived']];
  const DEF = { 'Follow-up Days': 7, 'Revisit Months': 6, 'Review Days': 30, 'Shutdown Start (MM-DD)': '12-20', 'Shutdown End (MM-DD)': '01-12', 'Company Name': 'CH Engineering' };
  const saved = JSON.parse(localStorage.getItem('che-sales') || '{}');

  const SL = App.Sales = {
    S: { config: null, contacts: [], activity: [], photos: [], loadedAt: 0, loading: null, error: '', tab: 'all', search: '', owner: '', stage: '', temp: '', view: 'list', meName: saved.meName || '' },
    cfg() { return S().sales || {}; },
    ready() { const c = this.cfg(); return !!(c.apiUrl && c.passcode); },
    setting(k) { const v = this.S.config && this.S.config.settings && this.S.config.settings[k]; return v === undefined || v === '' ? DEF[k] : v; },
    num(k) { const n = parseFloat(this.setting(k)); return isNaN(n) ? DEF[k] : n; },
    team() { return ((this.S.config && this.S.config.team) || []).map(t => t.name).filter(Boolean); },
    me() {
      if (this.S.meName) return this.S.meName;
      const mine = (st.me().name || '').toLowerCase(); const first = mine.split(' ')[0];
      return this.team().find(n => n.toLowerCase() === mine) || this.team().find(n => n.toLowerCase().split(' ')[0] === first) || st.me().name;
    },
    async api(action, body = {}) {
      let out;
      try {
        const r = await fetch(this.cfg().apiUrl, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, passcode: this.cfg().passcode, user: this.me() }, body)) });
        out = await r.json();
      } catch (er) { throw new Error('Can\'t reach the sales tracker. Check your connection.'); }
      if (!out.ok) throw new Error(out.error === 'bad_passcode' ? 'The sales tracker passcode doesn\'t match. Check it in Settings, Sales.' : (out.error || 'Something went wrong.'));
      return out;
    },
    apply(d) {
      if (!d) return;
      this.S.contacts = (d.contacts || []).map(c => Object.assign({ people: [], products: {} }, c));
      this.S.activity = d.activity || []; this.S.photos = d.photos || [];
    },
    async load(force) {
      if (!this.ready()) return false;
      if (!force && this.S.loadedAt && Date.now() - this.S.loadedAt < 60000) return false;
      if (this.S.loading) return this.S.loading;
      this.S.loading = (async () => {
        try {
          if (!this.S.config || force) {
            const a = await this.api('auth'); this.S.config = a.config;
            const m = String(a.config.sheetUrl || '').match(/\/d\/([^/]+)/);
            if (m && this.cfg().sheetId !== m[1] && st.mode === 'drive') { S().sales.sheetId = m[1]; st.save(); }
          }
          const r = await this.api('getAll'); this.apply(r.data);
          this.S.loadedAt = Date.now(); this.S.error = '';
          this.draftEmails(); this.syncFromEstimates();
          return true;
        } catch (er) { this.S.error = er.message; this.S.loadedAt = Date.now(); return true; }
        finally { this.S.loading = null; }
      })();
      return this.S.loading;
    },
    get(id) { return this.S.contacts.find(c => c.id === id); },
    primary(c) { return (c.people || []).find(p => p.name || p.phone || p.email) || {}; },
    /* Save one or more changes straight to the Sheet */
    async push(ops) {
      ops.forEach(o => o.opId = App.uid());
      const r = await this.api('sync', { ops });
      const bad = (r.results || []).filter(x => !x.ok);
      this.apply(r.data); this.S.loadedAt = Date.now();
      if (bad.length) throw new Error(bad[0].error || 'Couldn\'t save to the sales tracker.');
      return r;
    },
    async saveContact(c, activity) {
      c.updatedAt = new Date().toISOString();
      const i = this.S.contacts.findIndex(x => x.id === c.id); if (i >= 0) this.S.contacts[i] = c; else this.S.contacts.push(c);
      const ops = [{ op: 'saveContact', contact: App.clone(c) }];
      if (activity) ops.push({ op: 'addActivity', activity: Object.assign({ id: App.uid(), contactId: c.id, company: c.company, at: new Date().toISOString(), user: this.me(), type: 'Note', outcome: '', note: '' }, activity) });
      await this.push(ops);
    },

    /* ---------- follow-up rules (same as the phone app) ---------- */
    inShutdown(s) { const a = this.setting('Shutdown Start (MM-DD)'), b = this.setting('Shutdown End (MM-DD)'); if (!/^\d\d-\d\d$/.test(a) || !/^\d\d-\d\d$/.test(b)) return false; const md = s.slice(5); return a <= b ? (md >= a && md <= b) : (md >= a || md <= b); },
    afterShutdown(s) { if (!this.inShutdown(s)) return s; const b = this.setting('Shutdown End (MM-DD)'); let y = +s.slice(0, 4); if (s.slice(5) > b) y += 1; return App.addDays(`${y}-${b}`, 1); },
    workday(s) { while ([0, 6].includes(App.parseDate(s).getDay())) s = App.addDays(s, 1); return s; },
    addWorkdays(s, n) { while (n > 0) { s = App.addDays(s, 1); if (![0, 6].includes(App.parseDate(s).getDay())) n--; } return s; },
    plan(s) { return this.workday(this.afterShutdown(s)); },
    auto(status, stage, outcome) {
      const base = App.today();
      if (stage === 'Won') return { date: this.plan(App.addDays(base, this.num('Review Days'))), type: 'review' };
      if (stage === 'Lost' || status === 'Not interested') return { date: this.plan(App.addMonths(base, this.num('Revisit Months'))), type: 'revisit' };
      if (outcome === 'Quote sent' || stage === 'Quote sent' && outcome === 'quote') return { date: this.plan(this.addWorkdays(base, 5)), type: 'followup' };
      if (status === 'Call back later' || ['Left voicemail', 'No answer'].includes(outcome)) return { date: this.plan(this.addWorkdays(base, 2)), type: 'callback' };
      return { date: this.plan(App.addDays(base, this.num('Follow-up Days'))), type: 'followup' };
    },
    fu(c) {
      const kind = KIND[c.followUpType] || 'Follow up';
      if (c.archived) return { state: 'none', label: 'Archived', kind };
      if (!/^\d{4}-\d\d-\d\d$/.test(c.nextFollowUp || '')) return { state: 'none', label: 'No follow-up set', kind };
      const d = App.daysBetween(App.today(), c.nextFollowUp);
      if (d < 0) return { state: 'overdue', d, kind, label: `Overdue ${-d} day${d === -1 ? '' : 's'}` };
      if (d === 0) return { state: 'today', d, kind, label: 'Today' };
      if (d <= 7) return { state: 'week', d, kind, label: App.fmtDate(c.nextFollowUp, { weekday: 'short', day: 'numeric', month: 'short' }) };
      if (c.followUpType === 'revisit') return { state: 'none', d, kind, label: `Revisit ${App.fmtDate(c.nextFollowUp, { month: 'long' })}` };
      return { state: 'ok', d, kind, label: App.fmtDate(c.nextFollowUp, { day: 'numeric', month: 'short' }) };
    },
    active(c) { return !c.archived && c.stage !== 'Won' && c.stage !== 'Lost' && c.status !== 'Not interested'; },
    inTab(c, t) {
      if (t === 'archived') return !!c.archived; if (c.archived) return false;
      switch (t) {
        case 'due': return ['overdue', 'today', 'week'].includes(this.fu(c).state);
        case 'steel': case 'battens': case 'doors': case 'brackets': return !!(c.products && c.products[t]);
        case 'framesdoors': return !!(c.products && c.products.steel && c.products.doors);
        case 'hot': return c.temperature === 'Hot' && c.stage !== 'Won';
        case 'callback': return c.status === 'Call back later';
        case 'maybe': return c.status === 'Maybe';
        case 'not': return c.status === 'Not interested' || c.stage === 'Lost';
        case 'customers': return c.stage === 'Won';
      }
      return true;
    },
    summary() {
      const cs = this.S.contacts.filter(c => !c.archived); const month = App.today().slice(0, 7);
      const fus = cs.map(c => [c, this.fu(c)]);
      const won = cs.filter(c => c.stage === 'Won' && (c.quoteDate || c.updatedAt || '').slice(0, 7) === month);
      const quotes = cs.filter(c => c.stage === 'Quote sent');
      return {
        today: fus.filter(([, f]) => f.state === 'today').map(x => x[0]), overdue: fus.filter(([, f]) => f.state === 'overdue').map(x => x[0]),
        hot: cs.filter(c => c.temperature === 'Hot' && c.stage !== 'Won' && c.stage !== 'Lost'), newM: cs.filter(c => (c.createdAt || '').slice(0, 7) === month),
        quotes, quoteVal: quotes.reduce((t, c) => t + (App.num(c.quoteAmount) || 0), 0), won, wonVal: won.reduce((t, c) => t + (App.num(c.quoteAmount) || 0), 0),
        hotNoDate: cs.filter(c => c.temperature === 'Hot' && this.active(c) && !c.nextFollowUp),
        reviews: fus.filter(([c, f]) => c.followUpType === 'review' && ['overdue', 'today'].includes(f.state)).map(x => x[0])
      };
    },
    sortUrgent(a, b) { const U = { overdue: 0, today: 1, week: 2, ok: 3, none: 4 }; const fa = SL.fu(a), fb = SL.fu(b); return U[fa.state] - U[fb.state] || String(a.nextFollowUp || '9999').localeCompare(String(b.nextFollowUp || '9999')) || String(a.company).localeCompare(String(b.company)); },

    /* ---------- follow-up emails: drafted from the sales templates, sent only once approved ---------- */
    tpl(name) { const T = (this.S.config && this.S.config.templates) || {}; return T[name] || null; },
    fill(str, v) { return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) => v[k] ?? ''); },
    vars(c, sender) {
      const prods = PRODUCTS.filter(p => c.products && c.products[p.key]); const p = this.primary(c);
      const paras = prods.map(x => { const t = this.tpl(x.label); if (!t || !t.body) return ''; const link = this.setting('Brochure: ' + x.label); return this.fill(t.body, { brochure: link ? `\nMore info: ${link}` : '' }); }).filter(Boolean).join('\n\n');
      const list = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
      return { first_name: (p.name || '').split(' ')[0] || 'there', contact_name: p.name || '', company: c.company || '', company_name: this.setting('Company Name'), products: prods.length ? list(prods.map(x => x.label.toLowerCase())) : 'our steel framing products', product_paragraphs: paras, sender: sender || this.me(), review_link: this.setting('Google Review Link') || '' };
    },
    /* Emails from the hub end on "Cheers," with your Gmail signature underneath, like the estimate emails.
       So the name and company lines after the sign-off come out, and anything else down there (like the
       opt-out line) moves up above "Cheers,". */
    tidy(body, sender, companyName) {
      const lines = String(body || '').replace(/\r/g, '').split('\n');
      let i = -1; lines.forEach((l, k) => { if (/^\s*(cheers|thanks|thanks again|thank you|kind regards|regards|warm regards|many thanks)[,!.]?\s*$/i.test(l)) i = k; });
      const drop = [sender, companyName, this.setting('Company Name')].filter(Boolean).map(x => String(x).trim().toLowerCase());
      if (i < 0) { while (lines.length && (!lines[lines.length - 1].trim() || drop.includes(lines[lines.length - 1].trim().toLowerCase()))) lines.pop(); return lines.join('\n').trim() + '\n\nCheers,'; }
      const tail = lines.slice(i + 1).filter(l => l.trim() && !drop.includes(l.trim().toLowerCase()));
      const head = lines.slice(0, i).join('\n').replace(/\s+$/, '');
      return (tail.length ? head + '\n\n' + tail.join('\n') : head) + '\n\nCheers,';
    },
    validEmail(v) { return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(v || '').trim()); },
    /* Why a due follow-up has no email waiting, so it's clear what to fix */
    whyNoEmail(c) {
      if (!['followup', 'review'].includes(c.followUpType)) return c.followUpType === 'callback' ? 'This one is a call back, so no email is written for it.' : '';
      if (!c.emailConsent) return 'No email was written because "Happy to receive emails" isn\'t ticked for this contact.';
      if (!this.primary(c).email) return 'No email was written because the main contact has no email address.';
      if (!this.validEmail(this.primary(c).email)) return `No email was written because the email address doesn't look right (${this.primary(c).email}). Fix it under People.`;
      return '';
    },
    queue() { return (st.data.salesMail || []).filter(m => !m.deleted).map(m => { if (m.status === 'waiting' && !m.tidied) { m.body = this.tidy(m.body, m.owner); m.tidied = true; } return m; }); },
    waiting() { return this.queue().filter(m => m.status === 'waiting'); },
    draftEmails() {
      if (!st.data || !this.S.config) return;
      st.data.salesMail = st.data.salesMail || []; let added = 0;
      this.S.contacts.forEach(c => {
        if (c.archived || !c.emailConsent || !['followup', 'review'].includes(c.followUpType)) return;
        const f = this.fu(c); if (!['overdue', 'today'].includes(f.state)) return;
        const p = this.primary(c); if (!p.email || !this.validEmail(p.email)) return;
        const key = `${c.id}|${c.nextFollowUp}|${c.followUpType}`;
        if (st.data.salesMail.some(m => m.key === key)) return;
        const t = this.tpl(c.followUpType === 'review' ? 'Review Request' : 'Follow-up'); if (!t) return;
        const v = this.vars(c, c.owner || this.me());
        const m = { id: App.uid(), key, contactId: c.id, company: c.company, to: p.email, toName: p.name || '', kind: c.followUpType, due: c.nextFollowUp, owner: c.owner || '', subject: this.fill(t.subject, v), body: this.tidy(this.fill(t.body, v).replace(/\n{3,}/g, '\n\n').trim(), v.sender), status: 'waiting', createdAt: Date.now() };
        st.data.salesMail.push(m); st.touch(m); added++;
      });
      if (added) st.save();
    },
    async sendMail(m, subject, body, toOverride) {
      if (st.mode !== 'drive') throw new Error('Connect Google to send emails from the hub.');
      const c0 = this.get(m.contactId);
      const to = String(toOverride || (c0 && this.primary(c0).email) || m.to || '').trim();
      if (!this.validEmail(to)) throw new Error(`The email address for ${m.company} doesn't look right (${to || 'none'}). Use "Edit first" to fix it.`);
      /* if the address was corrected here, save it on the contact too */
      if (c0 && toOverride && to.toLowerCase() !== String(this.primary(c0).email || '').trim().toLowerCase()) {
        const n = Object.assign({}, c0); n.people = App.clone(n.people || []); if (!n.people.length) n.people.push({ name: '', role: '', phone: '', email: '' });
        const i = n.people.findIndex(p => p.name || p.phone || p.email); n.people[i < 0 ? 0 : i].email = to;
        await this.saveContact(n, { type: 'Note', outcome: 'Email address corrected', note: to });
      }
      m.to = to;
      await App.G.send({ to, subject, html: await App.mail.html(body) });
      m.status = 'sent'; m.sentAt = Date.now(); m.sentBy = st.me().email; m.subject = subject; m.body = body; st.touch(m); st.save();
      const c = this.get(m.contactId);
      if (c) {
        const n = Object.assign({}, c, { lastContacted: App.today() });
        if (m.kind === 'review') { n.nextFollowUp = ''; n.followUpType = ''; }
        else { const a = this.auto(n.status, n.stage); n.nextFollowUp = a.date; n.followUpType = a.type; }
        await this.saveContact(n, { type: 'Email', outcome: m.kind === 'review' ? 'Review request sent' : 'Follow-up email sent', note: subject });
      }
    },
    /* ---------- estimates <-> contacts ---------- */
    linkedEstimates(c) { const emails = (c.people || []).map(p => (p.email || '').toLowerCase()).filter(Boolean); return st.live().filter(x => x.salesContactId === c.id || (!x.salesContactId && x.client.email && emails.includes(x.client.email.toLowerCase()))); },
    contactFor(est) {
      if (est.salesContactId) return this.get(est.salesContactId);
      const em = (est.client.email || '').toLowerCase(); if (!em) return null;
      return this.S.contacts.find(c => (c.people || []).some(p => (p.email || '').toLowerCase() === em)) || null;
    },
    /* Moves contacts along when their estimates are sent, accepted or rejected (runs whenever sales data loads) */
    async syncFromEstimates() {
      if (!this.S.loadedAt || this.S.error) return;
      const ops = [];
      st.live().filter(x => !x.practice && ['sent', 'accepted', 'rejected'].includes(x.status)).forEach(est => {
        const c = this.contactFor(est); if (!c) return;
        const done = est.salesSync || {}; if (done[est.status]) return;
        const n = Object.assign({}, c); const amt = String(Math.round(st.totals(est).sub));
        let note = '';
        if (est.status === 'sent' && !['Won', 'Lost'].includes(c.stage)) { n.stage = 'Quote sent'; n.quoteAmount = amt; n.quoteDate = est.sentDate || App.today(); const a = this.auto(n.status, n.stage, 'Quote sent'); n.nextFollowUp = a.date; n.followUpType = a.type; note = `Estimate ${st.displayNumber(est)} sent, ${App.money(+amt, 0)}`; }
        if (est.status === 'accepted') { n.stage = 'Won'; n.quoteAmount = amt; const a = this.auto(n.status, 'Won'); n.nextFollowUp = a.date; n.followUpType = a.type; note = `Estimate ${st.displayNumber(est)} accepted, ${App.money(+amt, 0)}`; }
        if (est.status === 'rejected' && c.stage !== 'Won') { n.stage = 'Lost'; n.reason = est.lostReason || n.reason; const a = this.auto(n.status, 'Lost'); n.nextFollowUp = a.date; n.followUpType = a.type; note = `Estimate ${st.displayNumber(est)} not accepted${est.lostReason ? ': ' + est.lostReason : ''}`; }
        est.salesContactId = c.id; est.salesSync = Object.assign({}, done, { [est.status]: Date.now() }); st.touch(est);
        if (!note) return;
        n.updatedAt = new Date().toISOString();
        ops.push({ op: 'saveContact', contact: n }, { op: 'addActivity', activity: { id: App.uid(), contactId: c.id, company: c.company, at: new Date().toISOString(), user: this.me(), type: 'Estimate', outcome: n.stage, note } });
      });
      st.save();
      if (ops.length) { try { await this.push(ops); if (['sales', ''].includes(App.route().name)) App.refresh(); } catch (er) { /* tries again next time */ } }
    }
  };

  /* ---------- small UI helpers ---------- */
  const stripe = s => ({ overdue: '#b3261e', today: '#f5c400', week: '#e8890c', ok: '#2e8540', none: '#c4cacf' }[s]);
  const prodChips = c => PRODUCTS.filter(p => c.products && c.products[p.key]).map(p => `<span class="pchip ${c.products[p.key] === 'Maybe' ? 'maybe' : ''}">${c.products[p.key] === 'Maybe' ? '?' : '✓'} ${p.short}</span>`).join('');
  const tempTag = t => t ? `<span class="tag ${t === 'Hot' ? 'bad' : t === 'Warm' ? 'warn' : 'blue'}">${e(t)}</span>` : '';
  const stageTag = s => `<span class="tag ${s === 'Won' ? 'ok' : s === 'Quote sent' ? 'blue' : s === 'Lost' ? '' : ''}">${e(s || 'Lead')}</span>`;
  const segHtml = (name, opts, cur, act) => `<div class="seg wrap">${opts.map(o => `<label><input type="radio" name="${name}" value="${e(o)}" data-act-change="${act}" ${cur === o ? 'checked' : ''}><span>${e(o)}</span></label>`).join('')}</div>`;

  /* ---------- Sales page ---------- */
  App.views.sales = (a, b) => {
    const s = SL.S;
    if (a === 'c' && b) return SL.contactView(b);
    const head = right => `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Live from the CH Sales Tracker sheet</p><h1>Sales</h1></div><div class="head-actions">${right || ''}</div></div>`;
    if (!SL.ready()) return head() + `<div class="empty"><h2>Connect the sales tracker</h2><p>Add its web app link and the team passcode in Settings, Sales.</p><a class="btn primary" href="#/settings/sales">Open Settings</a></div>`;
    if (!s.loadedAt) return head() + '<p class="hint pad">Loading contacts…</p>';
    if (s.error) return head('<button class="btn" data-act="salesRefresh">Try again</button>') + `<div class="banner warn">${e(s.error)}</div>`;
    const sm = SL.summary(); const wait = SL.waiting();
    let list = s.contacts.filter(c => SL.inTab(c, s.tab));
    if (s.owner) list = list.filter(c => c.owner === s.owner);
    if (s.stage) list = list.filter(c => (c.stage || 'Lead') === s.stage);
    if (s.temp) list = list.filter(c => c.temperature === s.temp);
    const q = s.search.trim().toLowerCase();
    if (q) list = list.filter(c => [c.company, c.region, c.address, c.notes, ...(c.people || []).flatMap(p => [p.name, p.phone, p.email])].join(' ').toLowerCase().includes(q));
    list.sort(SL.sortUrgent);
    const count = t => s.contacts.filter(c => SL.inTab(c, t)).length;
    const owners = [...new Set(s.contacts.map(c => c.owner).filter(Boolean))].sort();
    return head(`<button class="btn" data-act="salesView" data-v="${s.view === 'map' ? 'list' : 'map'}">${s.view === 'map' ? 'List' : 'Map'}</button><button class="btn" data-act="salesCheat">Cheat sheet</button><button class="btn" data-act="salesRefresh">Refresh</button><button class="btn primary" data-act="salesAdd">+ Add contact</button>`) + `
    <div class="statcards six">
      <div class="statcard dark"><p class="l">Due today</p><p class="v">${sm.today.length}</p><p class="s">follow-ups</p></div>
      <div class="statcard"><p class="l">Overdue</p><p class="v ${sm.overdue.length ? 'neg' : ''}">${sm.overdue.length}</p><p class="s">follow-ups</p></div>
      <div class="statcard"><p class="l">Hot leads</p><p class="v">${sm.hot.length}</p><p class="s">not yet won</p></div>
      <div class="statcard"><p class="l">New this month</p><p class="v">${sm.newM.length}</p><p class="s">leads</p></div>
      <div class="statcard"><p class="l">Quotes out</p><p class="v">${App.money(sm.quoteVal, 0)}</p><p class="s">${sm.quotes.length} contact${sm.quotes.length === 1 ? '' : 's'}</p></div>
      <div class="statcard"><p class="l">Won this month</p><p class="v">${sm.won.length}</p><p class="s">${App.money(sm.wonVal, 0)}</p></div>
    </div>
    ${wait.length ? `<section class="approve-bar"><span><b>${wait.length} sales follow-up email${wait.length === 1 ? ' is' : 's are'} waiting for your approval</b><span>${e(wait.slice(0, 3).map(m => m.company).join(', '))}${wait.length > 3 ? ` and ${wait.length - 3} more` : ''}. Written from your Email Templates.</span></span><button class="btn primary" data-act="salesApprove">Review and send</button></section>` : ''}
    ${(() => { const dueNo = s.contacts.filter(c => !c.archived && ['overdue', 'today'].includes(SL.fu(c).state) && ['followup', 'review'].includes(c.followUpType) && !SL.queue().some(m => m.contactId === c.id && m.due === c.nextFollowUp)); const noCons = dueNo.filter(c => !c.emailConsent).length, noEm = dueNo.filter(c => c.emailConsent && !SL.primary(c).email).length;
      return noCons || noEm ? `<p class="hint" style="margin:-6px 0 14px">${noCons ? `${noCons} due follow-up${noCons === 1 ? ' has' : 's have'} no email written because "Happy to receive emails" isn't ticked. ` : ''}${noEm ? `${noEm} ${noEm === 1 ? 'has' : 'have'} no email address.` : ''} Tick it on the contact if they're happy to get emails.</p>` : ''; })()}
    ${s.view === 'map' ? '<section class="card"><div id="sales-map" style="height:560px;border-radius:14px"></div></section>' : `
    <section class="card">
      <div class="tabs-scroll"><div class="seg wrap">${TABS.map(([k, l]) => `<label><input type="radio" name="stab" value="${k}" data-act-change="salesTab" ${s.tab === k ? 'checked' : ''}><span>${l} (${count(k)})</span></label>`).join('')}</div></div>
      <div class="row" style="flex-wrap:wrap;margin:12px 0">
        <input type="search" id="sales-q" placeholder="Search company, person, phone or region" value="${e(s.search)}" data-act-input="salesSearch" style="flex:1 1 260px">
        <select data-act-change="salesFilter" data-k="owner" style="width:auto"><option value="">Everyone</option>${owners.map(o => App.opt(o, o, s.owner)).join('')}</select>
        <select data-act-change="salesFilter" data-k="stage" style="width:auto"><option value="">Any stage</option>${STAGES.map(o => App.opt(o, o, s.stage)).join('')}</select>
        <select data-act-change="salesFilter" data-k="temp" style="width:auto"><option value="">Hot, warm and cold</option>${TEMPS.map(o => App.opt(o, o, s.temp)).join('')}</select>
      </div>
      ${list.length ? `<div class="table-scroll"><table class="wtable sales-table"><thead><tr><th></th><th>Company</th><th>Interested in</th><th>Status</th><th>Stage</th><th>Next follow-up</th><th>Contacted by</th><th></th></tr></thead><tbody>
      ${list.map(c => { const f = SL.fu(c); const p = SL.primary(c);
        return `<tr data-act="salesOpen" data-id="${e(c.id)}" tabindex="0"><td class="stripe" style="background:${stripe(f.state)}"></td>
          <td><b>${e(c.company || p.name || 'No name')}</b><div class="hint">${e([p.name, p.phone].filter(Boolean).join(', '))}${c.region ? ' · ' + e(c.region) : ''}</div></td>
          <td><div class="tags">${prodChips(c)}</div></td><td class="small">${e(c.status || '')}<div>${tempTag(c.temperature)}</div></td>
          <td>${stageTag(c.stage)}${c.quoteAmount && c.stage !== 'Lead' ? `<div class="small"><b>${App.money(App.num(c.quoteAmount), 0)}</b></div>` : ''}</td>
          <td class="small"><b class="${f.state === 'overdue' ? 'neg' : ''}">${e(f.label)}</b>${c.nextFollowUp ? `<div class="hint">${e(f.kind)}</div>` : ''}</td><td class="small">${e(c.owner || '')}</td>
          <td class="r nowrap">${p.phone ? `<a class="btn small" href="tel:${e(p.phone.replace(/\s/g, ''))}" data-stop="1">Call</a>` : ''}<button class="btn small" data-act="salesLog" data-id="${e(c.id)}">Log</button></td></tr>`; }).join('')}</tbody></table></div>`
      : '<div class="empty" style="padding:30px"><b>No contacts here</b></div>'}
      <p class="legend" style="margin-top:12px">${[['overdue', 'Overdue'], ['today', 'Due today'], ['week', 'This week'], ['ok', 'Later'], ['none', 'No follow-up']].map(([k, l]) => `<span><i style="background:${stripe(k)}"></i>${l}</span>`).join('')}</p>
    </section>`}`;
  };
  App.views.sales.mount = async (a, b) => {
    if (!SL.ready()) return;   /* not connected yet: nothing to load (and no reloading the page) */
    const need = !SL.S.loadedAt;
    const ch = await SL.load();
    if ((need || ch) && App.route().name === 'sales') { App.refresh(); return; }
    if (SL.S.view === 'map' && !a && document.getElementById('sales-map')) {
      App.loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
      await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
      const map = L.map('sales-map').setView([-37.787, 175.279], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      const pts = [];
      SL.S.contacts.filter(c => !c.archived && c.lat && c.lng).forEach(c => { const f = SL.fu(c); pts.push([c.lat, c.lng]);
        L.circleMarker([c.lat, c.lng], { radius: 9, color: '#15171a', weight: 1.5, fillColor: stripe(f.state), fillOpacity: 0.95 }).addTo(map).bindPopup(`<b>${e(c.company)}</b><br>${e(f.label)}<br><a href="#/sales/c/${e(c.id)}">Open</a>`); });
      if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 12 });
    }
  };
  A.salesRefresh = async () => { SL.S.config = null; await SL.load(true); App.refresh(); if (!SL.S.error) App.toast('Sales updated'); };
  A.salesTab = el => { SL.S.tab = el.value; App.refresh(); };
  A.salesFilter = el => { SL.S[el.dataset.k] = el.value; App.refresh(); };
  A.salesView = el => { SL.S.view = el.dataset.v; App.refresh(); };
  A.salesSearch = App.debounce(el => { SL.S.search = el.value; App.refresh(); const i = document.getElementById('sales-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  A.salesOpen = (el, ev) => { if (ev.target.closest('a,button')) return; location.hash = `#/sales/c/${el.dataset.id}`; };
  A.salesCheat = () => {
    const items = (SL.S.config && SL.S.config.cheatsheet) || [];
    App.modal('Steel vs timber cheat sheet', `<input type="search" id="cq" placeholder="Search objections" style="margin-bottom:10px"><div class="cheat">${items.map(it => `<details><summary>${e(it.q)}</summary><p>${e(it.a)}</p></details>`).join('') || '<p class="hint">The cheat sheet is empty. Add rows to the Cheat Sheet tab in the Google Sheet.</p>'}</div>`, { wide: true })
      .querySelector('#cq').oninput = ev => { const q = ev.target.value.toLowerCase(); document.querySelectorAll('.cheat details').forEach(d => d.hidden = q && !d.textContent.toLowerCase().includes(q)); };
  };

  /* ---------- Add contact ---------- */
  A.salesAdd = () => {
    const m = App.modal('Add a contact', `
      ${App.field('Company', '<input id="ad-co">')}
      <div class="grid3">${App.field('Contact name', '<input id="ad-nm">')}${App.field('Phone', '<input id="ad-ph" inputmode="tel">')}${App.field('Email', '<input id="ad-em" type="email">')}</div>
      <div class="grid3">${App.field('Region', `<input id="ad-rg" list="ad-regions"><datalist id="ad-regions">${String(SL.setting('Regions') || 'Waikato').split(',').map(r => `<option>${e(r.trim())}</option>`).join('')}</datalist>`)}${App.field('Customer type', `<select id="ad-ty"><option value=""></option>${App.opts(CUSTOMER_TYPES)}</select>`)}${App.field('Lead source', `<select id="ad-src"><option value=""></option>${App.opts(SOURCES)}</select>`)}</div>
      ${App.field('Address', '<input id="ad-ad">')}
      <div class="fld"><span>Interested in (tap once for interested, twice for maybe)</span><div class="prod-pick">${PRODUCTS.map(p => `<button type="button" class="pp" data-k="${p.key}" data-v="">${p.label}</button>`).join('')}</div></div>
      <div class="fld"><span>Temperature</span>${segHtml('ad-t', TEMPS, 'Warm', '')}</div>
      <label class="check"><input type="checkbox" id="ad-cons"> Happy to receive emails</label>
      ${App.field('Notes', '<textarea id="ad-no" rows="3"></textarea>')}`,
      { wide: true, actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="ad-ok">Add contact</button>' });
    m.querySelectorAll('.pp').forEach(b => b.onclick = () => { const v = b.dataset.v === '' ? 'Interested' : b.dataset.v === 'Interested' ? 'Maybe' : ''; b.dataset.v = v; b.className = 'pp ' + (v === 'Interested' ? 'on' : v === 'Maybe' ? 'maybe' : ''); b.textContent = (v === 'Interested' ? '✓ ' : v === 'Maybe' ? '? ' : '') + PRODUCTS.find(p => p.key === b.dataset.k).label; });
    m.querySelector('#ad-ok').onclick = async ev => {
      const v = id => m.querySelector(id).value.trim();
      if (!v('#ad-co') && !v('#ad-nm')) return App.toast('Add a company or a name', 'err');
      const products = {}; m.querySelectorAll('.pp').forEach(b => { if (b.dataset.v) products[b.dataset.k] = b.dataset.v; });
      const status = Object.values(products).includes('Interested') ? 'Interested' : Object.values(products).includes('Maybe') ? 'Maybe' : '';
      const c = { id: App.uid(), createdAt: new Date().toISOString(), createdBy: SL.me(), owner: SL.me(), company: v('#ad-co'), region: v('#ad-rg'), address: v('#ad-ad'), customerType: v('#ad-ty'), people: [{ name: v('#ad-nm'), role: '', phone: v('#ad-ph'), email: v('#ad-em') }], products, status, temperature: (m.querySelector('input[name="ad-t"]:checked') || {}).value || 'Warm', stage: 'Lead', lastContacted: App.today(), emailConsent: m.querySelector('#ad-cons').checked, source: v('#ad-src'), notes: v('#ad-no') };
      const a = SL.auto(status, 'Lead'); c.nextFollowUp = a.date; c.followUpType = a.type;
      ev.target.disabled = true;
      try { await SL.saveContact(c, { type: 'Note', outcome: 'New lead', note: 'Added in the hub' }); App.closeModal(); App.toast('Contact added'); location.hash = `#/sales/c/${c.id}`; } catch (er) { App.toast(er.message, 'err'); ev.target.disabled = false; }
    };
  };

  /* ---------- Log a call ---------- */
  A.salesLog = (el, ev) => {
    if (ev) ev.stopPropagation();
    const c = SL.get(el.dataset.id); if (!c) return;
    const m = App.modal(`Log: ${c.company || SL.primary(c).name}`, `
      <div class="fld"><span>How</span>${segHtml('lg-ch', ['Call', 'Email', 'Visit', 'Text', 'Note'], 'Call', 'salesLogTouch')}</div>
      <div class="fld"><span>How did it go?</span>${segHtml('lg-out', OUTCOMES, '', 'salesLogTouch')}</div>
      <div id="lg-reason" hidden>${App.field('Reason', `<select id="lg-r"><option value=""></option>${App.opts(REASONS)}</select>`)}</div>
      ${App.field('Note', '<textarea id="lg-note" rows="3"></textarea>')}
      <div class="grid2">${App.field('Next follow-up', `<input type="date" id="lg-next" value="${e(SL.auto(c.status, c.stage).date)}">`)}${App.field('Type', `<select id="lg-type">${App.opts([{ value: 'followup', label: 'Follow up' }, { value: 'callback', label: 'Call back' }, { value: 'review', label: 'Ask for a review' }, { value: 'revisit', label: 'Revisit' }], SL.auto(c.status, c.stage).type)}</select>`)}</div>
      <p class="hint">The date fills in from what you pick above. Clear it for no follow-up.</p>`,
      { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="lg-ok">Save</button>' });
    A.salesLogTouch = () => {
      const out = (m.querySelector('input[name="lg-out"]:checked') || {}).value || '';
      m.querySelector('#lg-reason').hidden = out !== 'Not interested';
      const status = STATUSES.includes(out) ? out : c.status; const stage = out === 'Quote sent' && c.stage !== 'Won' ? 'Quote sent' : out === 'Not interested' ? c.stage : c.stage;
      const a = SL.auto(status, stage, out); m.querySelector('#lg-next').value = a.date; m.querySelector('#lg-type').value = a.type;
    };
    m.querySelector('#lg-ok').onclick = async ev2 => {
      const ch = (m.querySelector('input[name="lg-ch"]:checked') || {}).value || 'Call'; const out = (m.querySelector('input[name="lg-out"]:checked') || {}).value || ''; const note = m.querySelector('#lg-note').value.trim();
      if (ch === 'Note' && !note && !out) return App.toast('Add a note first', 'err');
      const n = Object.assign({}, c);
      if (ch !== 'Note') n.lastContacted = App.today();
      if (STATUSES.includes(out)) n.status = out;
      if ((out === 'Interested' || out === 'Maybe') && n.stage === 'Lost') n.stage = 'Lead';
      if (out === 'Not interested') n.reason = m.querySelector('#lg-r').value;
      if (out === 'Quote sent' && n.stage !== 'Won') { n.stage = 'Quote sent'; if (!n.quoteDate) n.quoteDate = App.today(); }
      n.nextFollowUp = m.querySelector('#lg-next').value || ''; n.followUpType = n.nextFollowUp ? m.querySelector('#lg-type').value : '';
      ev2.target.disabled = true;
      try { await SL.saveContact(n, { type: ch, outcome: out, note }); App.closeModal(); App.toast(n.nextFollowUp ? `Logged. Next follow-up ${App.fmtShort(n.nextFollowUp)}.` : 'Logged.'); App.refresh(); } catch (er) { App.toast(er.message, 'err'); ev2.target.disabled = false; }
    };
  };

  /* ---------- Contact page ---------- */
  SL.contactView = id => {
    const c = SL.get(id);
    if (!SL.S.loadedAt) return '<p class="hint pad">Loading…</p>';
    if (!c) return '<div class="empty"><h2>Contact not found</h2><a class="btn" href="#/sales">Back to Sales</a></div>';
    const p = SL.primary(c); const f = SL.fu(c);
    const acts = SL.S.activity.filter(a => a.contactId === c.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const photos = SL.S.photos.filter(x => x.contactId === c.id);
    const ests = SL.linkedEstimates(c);
    const mail = SL.waiting().find(x => x.contactId === c.id);
    const fld = (label, key, type = 'text', opts) => App.field(label, opts ? `<select data-act-change="scSet" data-k="${key}"><option value=""></option>${App.opts(opts, c[key] || '')}</select>` : `<input type="${type}" value="${e(c[key] || '')}" data-act-change="scSet" data-k="${key}">`);
    const icon = t => ({ Call: '☎', Email: '✉', Visit: '⌂', Text: '✆', Estimate: '$' }[t] || '•');
    return `<div class="page-head"><div><p class="crumbs"><a href="#/sales">Sales</a></p>
      <div class="tags" style="margin-bottom:8px">${c.customerType ? `<span class="tag">${e(c.customerType)}</span>` : ''}${tempTag(c.temperature)}${stageTag(c.stage)}${c.archived ? '<span class="tag">Archived</span>' : ''}</div>
      <h1>${e(c.company || p.name || 'No name')}</h1><p class="sub">${e([p.name, p.phone, c.region].filter(Boolean).join(', '))}</p></div>
      <div class="head-actions">${p.phone ? `<a class="btn" href="tel:${e(p.phone.replace(/\s/g, ''))}">Call</a>` : ''}${p.email ? `<button class="btn" data-act="scEmail">Email</button>` : ''}<button class="btn" data-act="salesLog" data-id="${e(c.id)}">Log a call</button><button class="btn primary" data-act="scEstimate">+ Create estimate</button></div></div>
    <div class="ed-cols">
      <div class="ed-main">
        <section class="card"><h3>People</h3><div class="people">${(c.people || []).map((x, i) => `<div class="person"><div class="grid2">${App.field('Name', `<input value="${e(x.name || '')}" data-act-change="scPerson" data-i="${i}" data-k="name">`)}${App.field('Role', `<input value="${e(x.role || '')}" data-act-change="scPerson" data-i="${i}" data-k="role">`)}${App.field('Phone', `<input value="${e(x.phone || '')}" data-act-change="scPerson" data-i="${i}" data-k="phone" inputmode="tel">`)}${App.field('Email', `<input value="${e(x.email || '')}" data-act-change="scPerson" data-i="${i}" data-k="email" type="email">`)}</div>${i ? `<button class="btn small ghost" data-act="scPersonDel" data-i="${i}">Remove</button>` : '<span class="hint">Main contact</span>'}</div>`).join('')}</div>
          <button class="btn small dashed" data-act="scPersonAdd">+ Add a person</button>
          <div class="grid3" style="margin-top:14px">${fld('Company', 'company')}${fld('Customer type', 'customerType', 'text', CUSTOMER_TYPES)}${fld('Region', 'region')}</div>${fld('Address', 'address')}</section>
        <section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Interested in</h3><span class="hint">Tap once for interested, twice for maybe</span></div>
          <div class="prod-pick" style="margin-top:10px">${PRODUCTS.map(x => { const v = (c.products || {})[x.key] || ''; return `<button class="pp ${v === 'Interested' ? 'on' : v === 'Maybe' ? 'maybe' : ''}" data-act="scProd" data-k="${x.key}">${v === 'Interested' ? '✓ ' : v === 'Maybe' ? '? ' : ''}${x.label}</button>`; }).join('')}</div>
          <div class="fld" style="margin-top:14px"><span>Status</span>${segHtml('sc-st', STATUSES, c.status, 'scStatus')}</div>
          ${c.status === 'Not interested' || c.stage === 'Lost' ? fld('Reason', 'reason', 'text', REASONS) : ''}
          <div class="fld"><span>Temperature</span>${segHtml('sc-tp', TEMPS, c.temperature, 'scTemp')}</div>
          <div class="grid3">${fld('Stage', 'stage', 'text', STAGES)}${App.field('Contacted by', `<select data-act-change="scSet" data-k="owner">${App.opts([...new Set(SL.team().concat(c.owner ? [c.owner] : []))], c.owner || '')}</select>`)}${fld('Lead source', 'source', 'text', SOURCES)}</div>
          <div class="grid3">${fld('Number of houses', 'houses')}${fld('Project start', 'projectStart')}${fld('Current supplier', 'supplier')}</div>
          <div class="grid3">${fld('Event or trade show', 'event')}${fld('Referred by', 'referredBy')}${fld('Quote amount', 'quoteAmount')}</div>
          <label class="check"><input type="checkbox" data-act-change="scConsent" ${c.emailConsent ? 'checked' : ''}> Happy to receive emails</label></section>
        <section class="card"><h3>Notes</h3><textarea rows="4" data-act-change="scSet" data-k="notes">${e(c.notes || '')}</textarea></section>
        ${photos.length ? `<section class="card"><h3>Photos</h3><div class="photo-row">${photos.map(x => `<a href="${e(x.url)}" target="_blank" rel="noopener" class="ph">${e(x.caption || 'Photo')}<span class="hint">${e(x.user || '')}, ${App.fmtShort(App.iso(new Date(x.at)))}</span></a>`).join('')}</div></section>` : ''}
        <div class="row-btns"><button class="btn ghost" data-act="scArchive">${c.archived ? 'Unarchive' : 'Archive this contact'}</button></div>
      </div>
      <aside class="ed-side">
        ${mail ? `<section class="mail-wait"><p class="k">Follow-up email ready, waiting for approval</p><p class="t">${e(mail.subject)}</p><p class="s">Due ${App.fmtShort(mail.due)}. Sends from your Gmail to ${e(mail.to)}.</p><div class="pre">${e(mail.body.slice(0, 180))}…</div>
          <div class="row-btns"><button class="btn primary" data-act="smSend" data-id="${mail.id}">Approve and send</button><button class="btn" data-act="smEdit" data-id="${mail.id}">Edit first</button><button class="btn ghost" data-act="smSkip" data-id="${mail.id}">Skip</button></div></section>` : ''}
        <section class="card"><h3>Next follow-up</h3><div class="fu-line"><span class="dotbar" style="background:${stripe(f.state)}"></span><span><b class="${f.state === 'overdue' ? 'neg' : ''}">${e(f.label)}</b>${c.nextFollowUp ? `<span class="hint" style="display:block">${e(f.kind)}</span>` : ''}</span></div>
          <div class="grid2" style="margin-top:10px">${App.field('Date', `<input type="date" value="${e(c.nextFollowUp || '')}" data-act-change="scSet" data-k="nextFollowUp">`)}${App.field('Type', `<select data-act-change="scSet" data-k="followUpType"><option value=""></option>${App.opts([{ value: 'followup', label: 'Follow up' }, { value: 'callback', label: 'Call back' }, { value: 'review', label: 'Ask for a review' }, { value: 'revisit', label: 'Revisit' }], c.followUpType || '')}</select>`)}</div>
          ${['overdue', 'today'].includes(f.state) && !mail && SL.whyNoEmail(c) ? `<p class="hint" style="margin:0 0 10px">${e(SL.whyNoEmail(c))}</p>` : ''}
          <button class="btn" data-act="salesLog" data-id="${e(c.id)}">Done, log it and set the next one</button></section>
        <section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Estimates</h3><span class="hint">Linked automatically</span></div>
          ${ests.map(x => `<a class="est-link" href="#/e/${x.id}"><span><b>${e(st.displayNumber(x))}</b> ${e(x.heading || '')}<span class="hint" style="display:block">${App.statusLabel ? App.statusLabel(x.status) : e(x.status)}${x.sentDate ? `, sent ${App.fmtShort(x.sentDate)}` : ''}${x.openedAt ? ', opened' : ''}</span></span><b>${App.money(st.totals(x).sub, 0)}</b></a>`).join('') || '<p class="hint">No estimates yet.</p>'}
          <button class="btn primary" data-act="scEstimate" style="margin-top:10px">+ Create estimate</button></section>
        <section class="card"><h3>Activity</h3>${acts.length ? acts.slice(0, 30).map(a => `<div class="act-item"><span class="ic" aria-hidden="true">${icon(a.type)}</span><span><b>${e(a.type)}${a.outcome ? ': ' + e(a.outcome) : ''}</b>${a.note ? `<span>${e(a.note)}</span>` : ''}<span class="hint">${e(a.user || '')}, ${App.fmtStamp(a.at)}</span></span></div>`).join('') : '<p class="hint">Nothing logged yet.</p>'}</section>
      </aside>
    </div>`;
  };
  const curC = () => SL.get(App.route().b);
  const saveC = async (n, act) => { try { await SL.saveContact(n, act); App.refresh(); } catch (er) { App.toast(er.message, 'err'); } };
  A.scSet = el => { const n = Object.assign({}, curC()); n[el.dataset.k] = el.value; if (el.dataset.k === 'nextFollowUp' && !n.followUpType && n.nextFollowUp) n.followUpType = 'followup'; saveC(n); };
  A.scConsent = el => saveC(Object.assign({}, curC(), { emailConsent: el.checked }));
  A.scStatus = el => { const n = Object.assign({}, curC(), { status: el.value }); if ((el.value === 'Interested' || el.value === 'Maybe') && n.stage === 'Lost') n.stage = 'Lead'; const a = SL.auto(n.status, n.stage); n.nextFollowUp = a.date; n.followUpType = a.type; saveC(n, { type: 'Note', outcome: el.value, note: 'Status changed' }); };
  A.scTemp = el => saveC(Object.assign({}, curC(), { temperature: el.value }));
  A.scProd = el => { const n = Object.assign({}, curC()); n.products = Object.assign({}, n.products); const v = n.products[el.dataset.k] || ''; n.products[el.dataset.k] = v === '' ? 'Interested' : v === 'Interested' ? 'Maybe' : ''; if (!n.status) n.status = Object.values(n.products).includes('Interested') ? 'Interested' : Object.values(n.products).includes('Maybe') ? 'Maybe' : ''; saveC(n); };
  A.scPerson = el => { const n = Object.assign({}, curC()); n.people = App.clone(n.people || []); n.people[+el.dataset.i][el.dataset.k] = el.value; saveC(n); };
  A.scPersonAdd = () => { const n = Object.assign({}, curC()); n.people = App.clone(n.people || []).concat([{ name: '', role: '', phone: '', email: '' }]); saveC(n); };
  A.scPersonDel = el => { const n = Object.assign({}, curC()); n.people = App.clone(n.people || []); n.people.splice(+el.dataset.i, 1); saveC(n); };
  A.scArchive = () => { const c = curC(); saveC(Object.assign({}, c, { archived: !c.archived })); };
  A.scEmail = () => {
    const c = curC(); const p = SL.primary(c); const t = SL.tpl('Follow-up') || { subject: '', body: '' }; const v = SL.vars(c);
    App.mail.compose({ title: `Email ${c.company || p.name}`, to: p.email, subject: SL.fill(t.subject, v), body: SL.tidy(SL.fill(t.body, v).replace(/\n{3,}/g, '\n\n').trim(), v.sender),
      onSent: () => { const n = Object.assign({}, c, { lastContacted: App.today() }); const a = SL.auto(n.status, n.stage); n.nextFollowUp = a.date; n.followUpType = a.type; saveC(n, { type: 'Email', outcome: 'Email sent', note: '' }); } });
  };
  A.scEstimate = async () => {
    const c = curC(); const p = SL.primary(c);
    const type = await new Promise(res => { const m = App.modal('Create an estimate', '<p>Which kind of estimate?</p>', { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-t="general">General</button><button class="btn primary" data-t="ft">Full frame and truss</button>' }); m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { App.closeModal(); res(b.dataset.t); }); });
    if (!type) return;
    const est = st.newEstimate(type);
    Object.assign(est.client, { name: p.name || '', company: c.company || '', email: p.email || '', phone: p.phone || '' });
    est.siteAddress = c.address || ''; est.salesContactId = c.id; est.leadSource = c.source || est.leadSource;
    st.log(est, `Created from the sales contact ${c.company || p.name}`); st.touch(est); st.save();
    SL.saveContact(Object.assign({}, c), { type: 'Estimate', outcome: 'Estimate started', note: `${st.displayNumber(est)} (${type === 'ft' ? 'Full F&T' : 'General'})` }).catch(() => {});
    location.hash = `#/e/${est.id}`;
  };

  /* ---------- Approving the follow-up emails ---------- */
  A.salesApprove = () => {
    const list = SL.waiting(); if (!list.length) return App.toast('Nothing waiting');
    const m = App.modal(`Sales follow-up emails (${list.length})`, `<p class="hint">Nothing goes out until you approve it. Each email sends from your Gmail.</p>${list.map(x => `<div class="mail-row" data-id="${x.id}"><div><b>${e(x.company)}</b> <span class="hint">to ${e(x.toName || '')} ${e((SL.get(x.contactId) && SL.primary(SL.get(x.contactId)).email) || x.to)}, due ${App.fmtShort(x.due)}${x.owner ? ', ' + e(x.owner) + '\'s contact' : ''}</span><p class="small" style="margin:4px 0 0"><b>${e(x.subject)}</b></p><p class="hint" style="margin:2px 0 0">${e(x.body.slice(0, 140))}…</p></div>
      ${(() => { const c = SL.get(x.contactId); const to = (c && SL.primary(c).email) || x.to; return SL.validEmail(to) ? '' : `<p class="neg small" style="margin:6px 0 0">The email address doesn't look right: ${e(to)}. Click Edit first to fix it.</p>`; })()}
      <div class="row-btns" style="margin:8px 0 0"><button class="btn small primary" data-act="smSend" data-id="${x.id}">Approve and send</button><button class="btn small" data-act="smEdit" data-id="${x.id}">Edit first</button><button class="btn small ghost" data-act="smSkip" data-id="${x.id}">Skip</button></div></div>`).join('')}`, { wide: true });
    return m;
  };
  const mailById = id => { const x = SL.queue().find(q => q.id === id); if (x && x.status === 'waiting' && !x.tidied) { x.body = SL.tidy(x.body, x.owner); x.tidied = true; } return x; };
  A.smSend = async el => {
    const x = mailById(el.dataset.id); el.disabled = true;
    try { await SL.sendMail(x, x.subject, x.body); App.toast(`Sent to ${x.company}`); const row = el.closest('.mail-row'); if (row) row.remove(); if (!document.querySelector('.mail-row')) App.closeModal(); App.refresh(); }
    catch (er) { App.toast(er.message, 'err', 6000); el.disabled = false; }
  };
  A.smEdit = el => {
    const x = mailById(el.dataset.id);
    const cur0 = SL.get(x.contactId); const to0 = (cur0 && SL.primary(cur0).email) || x.to;
    const m = App.modal(`Email ${x.company}`, `${App.field('To', `<input id="se-to" type="email" value="${e(to0)}">`)}${SL.validEmail(to0) ? '' : '<p class="neg small" style="margin:-6px 0 10px">This address doesn\'t look right. Fix it here and it\'ll be saved on the contact too.</p>'}${App.field('Subject', `<input id="se-s" value="${e(x.subject)}">`)}${App.field('Message', `<textarea id="se-b" rows="12">${e(x.body)}</textarea>`)}`,
      { wide: true, actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="se-ok">Send</button>' });
    m.querySelector('#se-ok').onclick = async ev => { ev.target.disabled = true; try { await SL.sendMail(x, m.querySelector('#se-s').value, m.querySelector('#se-b').value, m.querySelector('#se-to').value); App.closeModal(); App.toast(`Sent to ${x.company}`); App.refresh(); } catch (er) { App.toast(er.message, 'err', 6000); ev.target.disabled = false; } };
  };
  A.smSkip = el => { const x = mailById(el.dataset.id); x.status = 'skipped'; x.skippedBy = st.me().email; st.touch(x); st.save(); const row = el.closest('.mail-row'); if (row) row.remove(); if (!document.querySelector('.mail-row') && document.querySelector('.modal')) App.closeModal(); App.toast('Skipped. The follow-up date stays as it is.'); App.refresh(); };

  /* ---------- For the home dashboard, calendar and follow-ups ---------- */
  SL.needs = () => {
    if (!SL.ready() || !SL.S.loadedAt || SL.S.error) return [];
    const sm = SL.summary(); const out = []; const w = SL.waiting();
    const names = l => l.slice(0, 2).map(c => c.company || SL.primary(c).name).join(', ') + (l.length > 2 ? `, +${l.length - 2}` : '');
    if (sm.overdue.length) out.push({ lvl: 'red', t: `${sm.overdue.length} sales follow-up${sm.overdue.length === 1 ? '' : 's'} overdue`, s: names(sm.overdue), b: 'Sales', href: '#/sales', act: 'salesTabDue' });
    if (w.length) out.push({ lvl: 'amber', t: `${w.length} sales email${w.length === 1 ? '' : 's'} waiting for approval`, s: 'Written from your templates, ready to send', b: 'Review', href: '#/sales' });
    sm.reviews.forEach(c => out.push({ lvl: 'amber', t: `Ask ${c.company || SL.primary(c).name} for a review`, s: 'Job won, review reminder is due', b: 'Open', href: `#/sales/c/${c.id}` }));
    if (sm.hotNoDate.length) out.push({ lvl: 'blue', t: `${sm.hotNoDate.length} hot lead${sm.hotNoDate.length === 1 ? '' : 's'} with no follow-up date`, s: names(sm.hotNoDate), b: 'Sales', href: '#/sales' });
    return out;
  };
  SL.events = () => {
    if (!SL.ready() || !SL.S.loadedAt || SL.S.error) return [];
    return SL.S.contacts.filter(c => !c.archived && c.nextFollowUp && c.followUpType !== 'revisit').map(c => ({ type: 'sale', date: c.nextFollowUp, cls: 'sale', text: `${c.company || SL.primary(c).name}`, title: `${KIND[c.followUpType] || 'Follow up'}: ${c.company} (${c.owner || ''})`, href: `#/sales/c/${c.id}` }));
  };
  SL.panel = () => {
    if (!SL.ready()) return `<section class="snap"><h3>Sales follow-ups</h3><p class="hint">Connect the sales tracker in Settings, Sales.</p><a class="more" href="#/settings/sales">Settings</a></section>`;
    if (!SL.S.loadedAt) return `<section class="snap"><h3>Sales follow-ups</h3><p class="hint">Loading…</p></section>`;
    if (SL.S.error) return `<section class="snap"><h3>Sales follow-ups</h3><p class="hint">${e(SL.S.error)}</p></section>`;
    const sm = SL.summary(); const due = sm.overdue.concat(sm.today);
    return `<section class="snap"><h3>Sales follow-ups<em>${due.length} due</em></h3>
      ${due.slice(0, 5).map(c => { const f = SL.fu(c); const p = SL.primary(c); return `<a class="kvr2" href="#/sales/c/${e(c.id)}"><span style="display:flex;gap:10px;align-items:center"><span class="dotbar" style="background:${stripe(f.state)};min-height:30px"></span><span><b>${e(c.company || p.name)}</b><span class="hint" style="display:block">${e(f.label)}, ${e(f.kind.toLowerCase())}</span></span></span></a>`; }).join('') || '<p class="hint">Nothing due today.</p>'}
      <div class="gauge-cells" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:10px"><span class="gcell"><span>HOT LEADS</span><b>${sm.hot.length}</b></span><span class="gcell"><span>NEW THIS MONTH</span><b>${sm.newM.length}</b></span><span class="gcell low"><span>QUOTES OUT</span><b>${App.money(sm.quoteVal / 1000, 0)}k</b></span></div>
      <a class="more" href="#/sales">Sales</a></section>`;
  };
})();
