/* App shell: routing, binding, home, help, start-up */
(() => {
  const e = App.esc, st = App.store, S = () => App.store.s(), A = App.actions;

  const NAV = [
    ['', 'Home', '<path d="M3 11l9-7 9 7v9H3z"/>'],
    ['tracker', 'Estimate tracker', '<path d="M4 6h16M4 12h16M4 18h10"/>'],
    ['clients', 'Clients', '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.6-4.8-4-5.6"/>'],
    ['followups', 'Follow-ups', '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'],
    ['sales', 'Sales', '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>'],
    ['production', 'Production', '<path d="M3 20V9l6 4V9l6 4V5h6v15z"/>'],
    ['driver', 'Deliveries', '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'],
    ['battens', 'Battens', '<path d="M3 6h18M3 12h18M3 18h18"/><path d="M6 4v16M18 4v16" opacity=".5"/>'],
    ['detailing', 'Detailing', '<path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6"/><path d="M8 14h8M8 17h5"/>'],
    ['calendar', 'Calendar', '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['coils', 'Coils', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'],
    ['fasteners', 'Fasteners', '<path d="M12 3v14M8 7h8M10 21h4"/>'],
    ['safety', 'Health and safety', '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'],
    ['maintenance', 'Maintenance', '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'],
    ['pricing', 'Pricing', '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'],
    ['dashboard', 'Dashboard', '<path d="M5 20V12M12 20V5M19 20v-9"/>'],
    ['map', 'Map of jobs', '<path d="M12 21s-6-6.2-6-11a6 6 0 0 1 12 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>'],
    ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'],
    ['help', 'Help', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>']
  ];

  App.route = () => {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { name: parts[0] || '', a: parts[1], b: parts[2] };
  };

  App.renderNav = () => {
    const r = App.route(); const due = st.data ? App.Track.due().length + (App.ManualFU ? App.ManualFU.due().filter(App.ManualFU.mine).length : 0) : 0;
    const sdue = st.data && App.Sales && App.Sales.S.loadedAt && !App.Sales.S.error ? (() => { const x = App.Sales.summary(); return x.overdue.length + x.today.length + App.Sales.waiting().length; })() : 0;
    const active = r.name === 'e' ? 'tracker' : r.name === 'new' ? '' : r.name === 'job' ? 'production' : r.name;
    document.getElementById('nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${l}</span>${k === 'followups' && due ? `<em class="badge">${due}</em>` : ''}${k === 'sales' && sdue ? `<em class="badge">${sdue}</em>` : ''}</a>`).join('');
    const me = st.data ? st.me() : null;
    document.getElementById('side-foot').innerHTML = me ? `<span class="av" aria-hidden="true">${e((me.name || '?')[0].toUpperCase())}</span><span><b>${e(me.name)}</b><small>${st.mode === 'drive' ? 'Saved to Google Drive' : 'Saving in this browser'}</small></span>` : '';
  };
  App.renderTop = () => {
    const t = document.getElementById('topbar'); if (!st.data) { t.innerHTML = ''; return; }
    const q = (App.state.trk && App.state.trk.search) || '';
    t.innerHTML = `<button class="icon-btn menu-btn" data-act="toggleMenu" aria-label="Menu">☰</button>
      ${App.Care && App.Care.canBack() ? '<button class="back-btn" data-act="goBack" aria-label="Back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Back</button>' : ''}
      <label class="top-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><span style="position:absolute;left:-9999px">Search everything</span><input id="top-q" type="search" placeholder="Search everything: jobs, clients, battens, coils…" value="" autocomplete="off" data-act-input="topSearch"></label>
      ${App.state.practice ? '<a class="practice-flag" href="#/settings/estimates">Practice mode is on: TEST numbers, kept out of the stats</a>' : ''}
      <div class="top-right">
        <details class="menu new-menu"><summary class="btn small primary" aria-label="Create something new">+ New</summary><div class="menu-pop">
          <a href="#/new/general">General estimate</a><a href="#/new/ft">Frame and truss estimate</a><button data-act="batNew">Batten estimate</button>
          <button data-act="mfAdd">Follow-up reminder</button>${App.cur && App.cur.job && App.route().name === 'job' ? '<button data-act="fxEdit">Extra on this job</button>' : ''}
          <button data-act="newGo" data-h="#/safety/incidents" data-a="incNew">Incident or near miss</button><a href="#/clients">Client</a><a href="#/battens/clients">Batten client</a></div></details>
        ${App.state.needsReconnect ? '<button class="btn small primary" data-act="reconnect">Reconnect Google</button>' : ''}
        <span id="sync" class="sync">${st.mode === 'drive' ? 'All saved' : 'This browser only'}</span>
      </div>`;
  };
  App.renderSync = txt => { const s = document.getElementById('sync'); if (s) { s.textContent = txt === 'Saved' ? (st.mode === 'drive' ? 'All saved' : 'Saved in this browser') : txt; s.className = 'sync ' + (txt === 'Not saved' ? 'bad' : txt === 'Saving…' ? 'busy' : ''); } };
  /* search everything: estimates, jobs, batten jobs, clients, sales contacts, coils, incidents, machines, detailing */
  App.searchAll = q => {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const has = (...v) => v.filter(Boolean).join(' ').toLowerCase().includes(q); const out = [];
    const add = (g, t, s, href) => out.push({ g, t, s, href });
    st.live().filter(x => !x.practice || App.state.practice).forEach(x => { if (has(x.number, st.displayNumber(x), x.client.name, x.client.company, x.client.email, x.heading, x.siteAddress, x.clientPo)) add(x.job ? 'Jobs' : 'Estimates', `${st.displayNumber(x)} ${x.client.company || x.client.name || ''}`, [x.heading, x.siteAddress, x.job ? App.stageLabel(x.job.stage) : x.status].filter(Boolean).join(', '), x.job ? `#/job/${x.id}` : `#/e/${x.id}`); });
    (st.data.battens || []).filter(x => !x.deleted).forEach(x => { if (has(x.number, x.client.name, x.client.company, x.lot, x.address)) add('Battens', `${x.number} ${x.client.company || x.client.name || ''}`, [x.lot, x.address, x.status].filter(Boolean).join(', '), x.status === 'accepted' ? `#/battens/job/${x.id}` : `#/battens/e/${x.id}`); });
    (st.data.customers || []).filter(c => !c.deleted && (c.regular || c.batten)).forEach(c => { if (has(c.company, c.name, c.email, c.phone)) add('Clients', c.company || c.name, [c.company ? c.name : '', c.phone, c.batten && !c.regular ? 'batten client' : ''].filter(Boolean).join(', '), c.regular ? `#/clients/${c.id}` : `#/battens/client/${c.id}`); });
    if (App.Sales && App.Sales.S.loadedAt) App.Sales.S.contacts.forEach(c => { const p = App.Sales.primary(c); if (has(c.company, p.name, p.email, p.phone, c.region)) add('Sales contacts', c.company || p.name, [p.name, p.phone, c.region].filter(Boolean).join(', '), `#/sales/c/${c.id}`); });
    if (App.Coil && App.Coil.S.loadedAt) App.Coil.S.coils.forEach(c => { if (has(c.coilId, c.supplier, (c.jobs || []).join(' '))) add('Coils', c.coilId, `${c.width} × ${App.Coil.bmt(c.thickness)}, ${c.status}`, '#/coils'); });
    (st.data.incidents || []).filter(i => !i.deleted).forEach(i => { if (has(i.ref, i.type, i.what, i.who, i.where, i.title)) add('Health and safety', `${i.ref} ${i.type}`, (i.title || i.what || '').slice(0, 60), '#/safety/incidents'); });
    (st.data.assets || []).filter(x => !x.deleted).forEach(x => { if (has(x.name, x.reg)) add('Maintenance', x.name, x.reg || (x.kind === 'vehicle' ? 'Vehicle' : 'Machine'), `#/maintenance/${x.kind === 'vehicle' ? 'vehicles' : 'machines'}`); });
    (st.data.detailing || []).filter(x => !x.deleted).forEach(x => { if (has(x.desc, (x.files || []).map(f => f.name).join(' '))) add('Detailing', x.desc, (x.files || []).map(f => f.label).join(', '), `#/detailing/${x.id}`); });
    return out;
  };
  App.renderSearch = () => {
    const i = document.getElementById('top-q'); let box = document.getElementById('top-res'); if (!i) return;
    const res = App.searchAll(i.value);
    if (!box) { box = document.createElement('div'); box.id = 'top-res'; box.setAttribute('role', 'listbox'); i.closest('.top-search').appendChild(box); }
    if (!i.value.trim() || i.value.trim().length < 2) { box.hidden = true; return; }
    const groups = {}; res.forEach(r => (groups[r.g] = groups[r.g] || []).push(r));
    box.hidden = false;
    box.innerHTML = res.length ? Object.entries(groups).map(([g, list]) => `<div class="tr-g"><p>${e(g)}</p>${list.slice(0, 6).map(r => `<a href="${r.href}" class="tr-i" data-act="searchGo"><b>${e(r.t)}</b><span>${e(r.s || '')}</span></a>`).join('')}${list.length > 6 ? `<span class="hint">and ${list.length - 6} more</span>` : ''}</div>`).join('') : '<p class="hint" style="padding:12px">Nothing found.</p>';
  };
  A.topSearch = App.debounce(() => App.renderSearch(), 180);
  A.newGo = el => { const act = el.dataset.a; location.hash = el.dataset.h; setTimeout(() => A[act] && A[act](), 250); };
  A.searchGo = () => { const i = document.getElementById('top-q'); if (i) i.value = ''; const b = document.getElementById('top-res'); if (b) b.hidden = true; };
  document.addEventListener('keydown', ev => {
    if (ev.target && ev.target.id === 'top-q') {
      if (ev.key === 'Enter') { const f = document.querySelector('#top-res .tr-i'); if (f) { ev.preventDefault(); location.hash = f.getAttribute('href'); A.searchGo(); } }
      if (ev.key === 'Escape') A.searchGo();
      if (ev.key === 'ArrowDown') { const f = document.querySelector('#top-res .tr-i'); if (f) { ev.preventDefault(); f.focus(); } }
    } else if (ev.target && ev.target.classList && ev.target.classList.contains('tr-i') && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
      const all = [...document.querySelectorAll('#top-res .tr-i')]; const k = all.indexOf(ev.target) + (ev.key === 'ArrowDown' ? 1 : -1); ev.preventDefault(); if (all[k]) all[k].focus(); else if (k < 0) document.getElementById('top-q').focus();
    }
  });
  document.addEventListener('click', ev => { if (!ev.target.closest || !ev.target.closest('.top-search')) { const b = document.getElementById('top-res'); if (b) b.hidden = true; } });

  App.render = (keepScroll = false) => {
    if (!st.data) return;
    const r = App.route(); const main = document.getElementById('main');
    const y = window.scrollY;
    let html = '', mount = null;
    if (r.name === 'new') {
      const est = st.newEstimate(r.a === 'ft' ? 'ft' : 'general', !!App.state.practice);
      location.replace(`#/e/${est.id}`); return;
    }
    const v = { '': ['home'], e: ['estimate', r.a, r.b], job: ['job', r.a, r.b], tracker: ['tracker'], followups: ['followups'], production: ['production'], calendar: ['calendar'], dashboard: ['dashboard'], map: ['map'], settings: ['settings', r.a], help: ['help'], coils: ['coils', r.a], fasteners: ['fasteners'], sales: ['sales', r.a, r.b], pricing: ['pricing'], detailing: ['detailing', r.a], safety: ['safety', r.a], maintenance: ['maintenance', r.a], clients: ['clients', r.a], battens: ['battens', r.a, r.b], driver: ['driver', r.a, r.b] }[r.name] || ['home'];
    if (['tracker', 'followups', 'production', 'calendar', 'dashboard', 'map', 'help', 'home', 'coils', 'fasteners', 'sales', 'detailing', 'safety', 'maintenance', 'clients', 'battens'].includes(v[0])) App.cur = null;
    try { html = App.views[v[0]](...v.slice(1)); mount = App.views[v[0]].mount; }
    catch (er) { console.error(er); html = `<div class="empty"><h2>Something went wrong on this page</h2><p>${e(er.message)}</p><a class="btn" href="#/">Go home</a></div>`; }
    main.innerHTML = html;
    if (mount) try { mount(...v.slice(1)); } catch (er) { console.error(er); }
    App.renderNav(); App.renderTop();
    document.body.classList.remove('menu-open');
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    App.state.staleView = false;
    if (App.Reports) { try { App.Reports.addButton(); } catch (er) { console.error(er); } }
    if (App.Backup && !App.state.backupChecked && st.data) { App.state.backupChecked = true; App.Backup.maybe(); }
    if (App.Brief) setTimeout(() => App.Brief.maybe(), 800);
  };
  App.refresh = () => App.render(true);
  /* Re-render after focus has moved, then put the cursor back where the person is typing */
  App.refreshKeepFocus = () => setTimeout(() => {
    const a = document.activeElement;
    const key = a && a.dataset && a.dataset.bind ? `[data-bind="${a.dataset.bind.replace(/"/g, '\\"')}"]` : (a && a.id ? '#' + a.id : null);
    let ss = null; try { ss = a.selectionStart; } catch (er) {}
    App.refresh();
    if (key) { const n = document.querySelector(key); if (n) { n.focus({ preventScroll: true }); try { if (ss != null) n.setSelectionRange(ss, ss); } catch (er) {} } }
  }, 0);

  /* ---------- Binding ---------- */
  const applyBind = (el, isChange) => {
    const target = App.cur; if (!target) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
    else v = el.value;
    if (el.dataset.type === 'num' && typeof v === 'string') v = v.trim() === '' ? '' : (isNaN(+v) ? v : +v);
    App.setPath(target, el.dataset.bind, v);
    if (target === S()) S().updatedAt = Date.now();
    if (App.Est && App.Est.afterBind && target.building) App.Est.afterBind(target, el.dataset.bind, el);
    st.touch(target); st.save();
    if (isChange && (el.dataset.rerender || el.dataset.rerenderBlur)) { App.refreshKeepFocus(); return; }
    if (App.cur && App.cur.workings) {
      App.Est.livePrice(App.cur);
      if (App.state.estTab === 'workings') App.Est.liveWorkings(App.cur);
    }
  };
  document.addEventListener('input', ev => {
    const el = ev.target;
    if (el.dataset.bind && !['checkbox', 'radio'].includes(el.type) && el.tagName !== 'SELECT') applyBind(el, false);
    if (el.dataset.actInput && A[el.dataset.actInput]) A[el.dataset.actInput](el, ev);
  });
  document.addEventListener('change', ev => {
    const el = ev.target;
    if (el.dataset.bind) applyBind(el, true);
    if (el.dataset.actChange && A[el.dataset.actChange]) A[el.dataset.actChange](el, ev);
  });
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    const fn = A[el.dataset.act]; if (!fn) return;
    if (el.tagName === 'BUTTON') ev.preventDefault();
    const menu = el.closest('details.menu'); if (menu) menu.removeAttribute('open');
    Promise.resolve(fn(el, ev)).catch(er => { console.error(er); App.toast(er.message, 'err', 6000); });
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.getElementById('modal-root').lastElementChild) App.closeModal(); });
  window.addEventListener('hashchange', () => App.render());

  A.toggleMenu = () => document.body.classList.toggle('menu-open');
  A.togglePractice = el => { App.state.practice = el.checked; localStorage.setItem('che-practice', el.checked ? '1' : ''); App.renderTop(); App.refresh(); };
  A.reconnect = async () => { try { await App.G.signIn(''); App.state.needsReconnect = false; App.renderTop(); App.toast('Reconnected'); if (st.pending) st.persist(); } catch (er) { App.toast(er.message, 'err'); } };
  A.startTemplate = el => {
    const t = st.data.templates.find(x => x.id === el.value); if (!t) return;
    const n = st.newEstimate(t.type, !!App.state.practice);
    App.Est.copyFields(t.data, n, false); if (t.type === 'ft' && t.data.ft) n.ft = App.clone(t.data.ft);
    st.log(n, `Started from template "${t.name}"`); st.touch(n); st.save(); location.hash = `#/e/${n.id}`;
  };

  /* ---------- Home ---------- */
  App.views.home = () => {
    const jobs = App.Jobs.list(); const today = App.today(); const wk = App.weekStart(today);
    const me = st.me(); const hr = new Date().getHours(); const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const month = today.slice(0, 7);
    const real = st.live().filter(x => !x.practice && x.status !== 'cancelled');
    const sum = a => a.reduce((t, x) => t + st.totals(x).sub, 0);
    const sentM = real.filter(x => x.sentDate && x.sentDate.startsWith(month));
    const wonM = real.filter(x => x.status === 'accepted' && (x.acceptedAt || '').startsWith(month));
    const waiting = real.filter(x => x.status === 'sent' && !x.archived).sort((a, b) => (a.sentDate || '') < (b.sentDate || '') ? -1 : 1);
    const target = App.num(S().production.monthlyTarget);
    const live = jobs.filter(j => !['delivered', 'complete'].includes(j.job.stage));
    const dels = []; jobs.forEach(j => (j.job.loads || []).forEach(l => { if (l.date && !l.delivered && l.date >= today && l.date <= App.addDays(today, 6)) dels.push({ j, l }); }));
    const kgOf = (j, ids) => j.job.frames.filter(f => !ids || ids.includes(f.id)).reduce((a, f) => a + (f.weight || 0) * f.qty, 0);
    const depOut = jobs.filter(j => !j.job.deposit.received && !j.job.deposit.notRequired && STAGE_ORDER(j) <= 6);
    const C = App.Coil; const coilsOn = C && C.ready() && C.S.loadedAt; const cs = coilsOn ? C.summary() : null;
    const F = App.Fast; const fastOn = F && F.ready() && F.S.loadedAt && !F.S.error; const low = fastOn ? F.low() : [];
    const due = App.Track.due();
    const expiring = real.filter(x => x.status === 'sent' && !x.archived && x.expiry >= today && x.expiry <= App.addDays(today, 7));
    const SLs = App.Sales; const salesOn = SLs && SLs.ready() && SLs.S.loadedAt && !SLs.S.error; const ssm = salesOn ? SLs.summary() : null;
    const needs = [];
    if (App.Accept) App.Accept.needs().forEach(a => needs.push(a));
    if (App.ManualFU) App.ManualFU.needs().forEach(a => needs.push(a));
    if (App.Battens) App.Battens.needs().forEach(a => needs.push(a));
    if (App.Finish) App.Finish.needs().forEach(a => needs.push(a));
    if (App.Care && st.data) { const left = App.Care.setupLeft(); const me = S().users.find(u => (u.email || '').toLowerCase() === (st.me().email || '').toLowerCase()); if (left && (!me || me.admin !== false) && !App.Dismiss.is('setup-' + left)) needs.push({ lvl: 'blue', t: `Setup: ${left} thing${left === 1 ? '' : 's'} still to fill in`, s: 'So everything in the app works properly', b: 'Open checklist', href: '#/settings/setup' }); }
    if (SLs) SLs.needs().forEach(a => needs.push(a));
    App.Jobs.attention().forEach(a => needs.push(a));
    if (App.Safety) App.Safety.needs().forEach(x => needs.push(x));
    if (App.Maint) App.Maint.needs().forEach(x => needs.push(x));
    if (low.length) needs.splice(1, 0, { lvl: 'red', t: `${low.length} fastener${low.length === 1 ? '' : 's'} below minimum`, s: low.map(i => i.name).join(', '), b: 'Fasteners', href: '#/fasteners' });
    if (cs) cs.low.forEach(x => needs.push({ lvl: 'amber', t: `${C.bmt(x.t)} BMT coils running low`, s: `${x.n} coil${x.n === 1 ? '' : 's'} left in stock`, b: 'Coils', href: '#/coils' }));
    if (due.length) needs.push({ lvl: 'amber', t: `${due.length} follow-up${due.length === 1 ? '' : 's'} ready to send`, s: due.map(d => `${d.est.number} ${d.est.client.company || d.est.client.name}`).slice(0, 3).join(', '), b: 'Review', href: '#/followups' });
    expiring.forEach(x => needs.push({ lvl: 'blue', t: `${x.number} expires ${App.fmtDate(x.expiry, { weekday: 'long' })}`, s: `${x.client.company || x.client.name}, ${App.money(st.totals(x).sub, 0)}`, b: 'Open', href: `#/e/${x.id}` }));
    const days = []; for (let i = 0; i < 6; i++) days.push(App.addDays(wk, i));
    const rows = App.Jobs.timelineRows(days);
    const kpi = (l, v, sub, dark) => `<div class="statcard ${dark ? 'dark' : ''}"><p class="l">${l}</p><p class="v">${v}</p><p class="s">${sub}</p></div>`;
    const templates = st.data.templates.filter(t => !t.deleted);
    return `<div class="page-head"><div><p class="sub" style="margin:0 0 6px;font-weight:700">${greet}, ${e(me.name)}. ${App.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Dashboard</h1></div>
      <div class="head-actions"><button class="brief-btn" data-act="briefOpen"><span class="sun" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg></span><span><b>Morning brief</b><em>Your day at a glance</em></span></button></div></div>
    <div class="statcards six">
      ${kpi('Quoted this month', App.money(sum(sentM), 0), `${sentM.length} sent, ${App.money(sum(waiting), 0)} waiting`, true)}
      ${kpi('Accepted this month', App.money(sum(wonM), 0), target ? `${Math.round(sum(wonM) / target * 100)}% of ${App.money(target, 0)} target` : `${wonM.length} job${wonM.length === 1 ? '' : 's'} won`)}
      ${kpi('In production', `${live.length} job${live.length === 1 ? '' : 's'}`, `${App.money(live.reduce((t, j) => t + st.totals(j).sub, 0), 0)} of work`)}
      ${salesOn ? kpi('Sales follow-ups due', ssm.today.length + ssm.overdue.length, ssm.overdue.length ? `${ssm.overdue.length} overdue` : 'none overdue') : kpi('Deliveries this week', dels.length, `${new Set(dels.map(d => d.j.id)).size} job(s), ${(dels.reduce((t, d) => t + kgOf(d.j, d.l.frameIds), 0) / 1000).toFixed(1)} t`)}
      ${salesOn ? kpi('Hot leads', ssm.hot.length, `${ssm.newM.length} new this month`) : (App.Money ? kpi('Owed to us', App.money(App.Money.total(), 0), (() => { const o = App.Money.owed(); const ov = o.filter(x => x.overdue).length; return `${o.length} invoice${o.length === 1 ? '' : 's'}${ov ? `, ${ov} overdue` : ''}`; })()) : kpi('Deposits outstanding', App.money(depOut.reduce((t, j) => t + st.totals(j).deposit, 0), 0), `${depOut.length} job${depOut.length === 1 ? '' : 's'}`))}
      ${kpi('Coils in stock', cs ? cs.ins.length : '-', cs ? C.kg(cs.ins.reduce((t, c) => t + c.weight, 0)) : '<a href="#/coils">Sign in to coils</a>')}
    </div>
    <section class="hero hero-sm">
      <svg class="roof" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 110 L300 18 L600 110" fill="none" stroke="#15171a" stroke-width="14"></path><rect x="420" y="0" width="22" height="46" fill="#15171a"></rect></svg>
      <div class="hero-text"><h2>Create an estimate</h2><p class="next">${App.state.practice ? 'Practice mode is on, so this will be a <b>TEST</b> estimate' : `Next number <b>${e(st.numberFor(st.yy(), st.nextSeq(st.yy())))}</b>`}</p></div>
      <div class="hero-choices">
        <a class="choice" href="#/new/general"><span class="ct"><b>General</b><span class="arrow" aria-hidden="true">→</span></span><span>Garages, sheds, cabins</span></a>
        <a class="choice dark" href="#/new/ft"><span class="ct"><b>Full frame and truss</b><span class="arrow" aria-hidden="true">→</span></span><span>Houses and bigger jobs</span></a>
      </div>
      ${templates.length ? `<label class="fld inline tpl-pick"><span>Or start from a template</span><select data-act-change="startTemplate"><option value="">Choose a template…</option>${templates.map(t => `<option value="${e(t.id)}">${e(t.name)} (${t.type === 'ft' ? 'F&T' : 'General'})</option>`).join('')}</select></label>` : ''}
    </section>
    <div class="hub2">
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Needs you</h3>${needs.length ? `<span class="tag bad">${needs.length}</span>` : ''}</div>
        ${needs.length ? needs.slice(0, 8).map(App.Track.alertHtml).join('') : '<p class="hint">All caught up. Nothing needs you right now.</p>'}</section>
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">This week in the factory</h3><a class="more" style="margin:0" href="#/production">Production</a></div>
        <div class="table-scroll" style="margin-top:10px">${App.Jobs.timelineHtml(days, rows)}</div></section>
    </div>
    <div class="snaps four">
      ${App.Sales ? App.Sales.panel() : ''}
      <section class="snap"><h3>Coils<em>${cs ? cs.ins.length + ' in stock' : ''}</em></h3>
        ${cs ? `<div class="gauge-cells">${cs.byT.map(x => `<a class="gcell ${cs.low.includes(x) ? 'low' : ''}" href="#/coils"><span>${C.bmt(x.t)} BMT</span><b>${x.n}</b><span>${C.kg(x.kg)}</span></a>`).join('')}</div>
          <div class="kv-list small"><div><span>Scanned out this month</span><b>${cs.used.length} coil${cs.used.length === 1 ? '' : 's'}, ${C.kg(cs.used.reduce((t, c) => t + c.weight, 0))}</b></div><div><span>Waiting for labels</span><b>${cs.unlabelled.length}</b></div><div><span>On jobs in production</span><b>${cs.onJobs.length} coil${cs.onJobs.length === 1 ? '' : 's'}, ${cs.jobsWith} job${cs.jobsWith === 1 ? '' : 's'}</b></div></div>`
          : `<p class="hint">${C && C.cfg().apiUrl ? (C.S.token ? 'Loading coils…' : 'Sign in to the coil tracker once to see coils here.') : 'Connect the coil tracker in Settings.'}</p><a class="more" href="#/coils">Coils</a>`}</section>
      <section class="snap"><h3>Fasteners<em>${fastOn ? (low.length ? `<span class="tag bad">${low.length} low</span>` : '<span class="tag ok">All OK</span>') : ''}</em></h3>
        ${fastOn ? `${low.slice(0, 5).map(i => `<div class="kvr2"><span>${e(i.name)}</span><span><b class="neg">${i.qty}</b> <span class="hint">min ${i.min}</span></span></div>`).join('') || '<p class="hint">Everything is above its minimum.</p>'}
          <p class="hint" style="margin-top:10px">Live from the stock app, updated ${F.ago()}.${F.S.log[0] ? ` Last: ${e(F.S.log[0].person || '')} ${F.S.log[0].action === 'Sign out' ? 'took' : 'added'} ${F.S.log[0].qty} x ${e(F.S.log[0].item)}, ${e(F.when(F.S.log[0].time))}` : ''}</p>`
          : `<p class="hint">${F && F.S.error ? e(F.S.error) : st.mode === 'drive' ? 'Loading fastener stock…' : 'Connect Google to see fastener stock.'}</p>`}<a class="more" href="#/fasteners">Fasteners</a></section>
      <section class="snap"><h3>Waiting on a reply<em>${App.money(sum(waiting), 0)}</em></h3>
        ${waiting.slice(0, 4).map(x => `<a class="kvr2" href="#/e/${x.id}"><span><b>${e(x.number)}</b> ${e(x.client.company || x.client.name)}<span class="hint" style="display:block">${x.sentDate ? (App.daysBetween(x.sentDate, today) ? `Sent ${App.daysBetween(x.sentDate, today)} day${App.daysBetween(x.sentDate, today) === 1 ? '' : 's'} ago` : 'Sent today') : ''}${x.openedAt ? ', opened' : ''}</span></span><b>${App.money(st.totals(x).sub, 0)}</b></a>`).join('') || '<p class="hint">Nothing waiting.</p>'}<a class="more" href="#/followups">Follow-ups</a></section>
    </div>
`;
  };
  App.views.home.mount = () => {
    const jobs = [];
    if (App.Coil && App.Coil.ready()) jobs.push(App.Coil.load().catch(() => false));
    if (App.Fast && App.Fast.ready()) jobs.push(App.Fast.load().catch(() => false));
    if (App.Sales && App.Sales.ready()) jobs.push(App.Sales.load().catch(() => false));
    if (jobs.length) Promise.all(jobs).then(r => { if (r.some(Boolean) && App.route().name === '') App.refresh(); });
  };
  const STAGE_ORDER = j => App.STAGES.findIndex(s => s.value === j.job.stage);
  A.homeScan = () => { if (App.Coil && App.Coil.ready()) App.Coil.openScan('out'); else location.hash = '#/coils'; };

  App.WHATSNEW = [
    ['21', 'Nov 2026', ['<b>Deliveries</b> in the menu: the driver\'s day on a phone, with photos, the client signing on screen, and the signed docket emailed for you to send.', '<b>Compliance</b> tab on every job: PS1, mill certificates, NASH statement, detailing, signed dockets and warranty, bundled into one PDF.', '<b>Undo</b> after deleting or changing something.', '<b>+ New</b> button at the top of every page.', 'This What\'s new list and the How to guides.', 'Easier to use on a phone.']],
    ['20', 'Nov 2026', ['Batten estimates: Accept online, open tracking and follow-ups.', 'Accept online picks up acceptances within a couple of minutes, with a Test button.', 'Search everything from the top bar.', 'Setup checklist in Settings.', 'Mark invoices paid, Owed to us, and overdue reminders.', 'Battens on the Dashboard.']],
    ['19', 'Nov 2026', ['Extras tab on jobs, Job complete, and Send final invoice to CH Accounts.']],
    ['18', 'Nov 2026', ['Batten invoices attach the estimate with extras in red. Raking rates per m². Batten back-costing.']],
    ['17', 'Nov 2026', ['Batten Job complete and Send invoice to CH Accounts.']],
    ['16', 'Nov 2026', ['An ✕ to hide suggestions and warnings.']],
    ['15', 'Nov 2026', ['Back button, new version banner, restore from a backup, archive finished years, Report a problem.']]
  ];
  App.HOWTO = [
    ['Send an estimate', ['Home, pick General or Full frame and truss (or + New at the top).', 'Fill in the client, job and what\'s included, then Workings for the price.', 'Click <b>Email estimate</b>, check the email, and Send. The client gets an Accept button.', 'Follow-ups are drafted for you on the Follow-ups page.']],
    ['When a job is accepted', ['It shows on Needs you (or click Mark accepted on the estimate).', 'Click <b>Email accounts about the deposit</b> on the job.', 'Book the manufacture date, frames and deliveries on the job.', 'Mark the deposit paid when it comes in (Dashboard, Owed to us).']],
    ['Deliver a load (drivers)', ['Open <b>Deliveries</b> on your phone.', 'Tap the load, then Directions.', 'Take photos of the drop, get the client to sign, and tap <b>Mark delivered</b>.', 'Check the email to the client and tap Send.']],
    ['Finish a job and get it invoiced', ['Add any extras on the job\'s Extras tab as they happen.', 'On the Overview, click <b>Job complete</b>.', 'Click <b>Send final invoice to CH Accounts</b>, tick each check, then review and send the email.', 'Mark it paid when the money comes in.']],
    ['Send a compliance pack', ['Open the job, Compliance tab.', 'Upload the PS1 and mill certificates (the rest fills in itself).', 'Click <b>Email to the builder</b>, check it and Send.']],
    ['Battens, from estimate to invoice', ['Battens, + New batten estimate. Tick the options; the price works itself out.', 'Email it. Follow-ups and Accept online work like the main estimates.', 'When accepted: Print measure sheet, attach plans, assign coils.', 'Type the measure into the Machine file and Download CSV.', 'Job complete, then Send invoice to CH Accounts.']],
    ['Report an incident', ['+ New, Incident or near miss.', 'Fill it in, add photos, and answer the notifiable question.', 'Add the corrective actions, and close it when they\'re done.']],
    ['Add a team member', ['Settings, Team, Add a person (their Google email).', 'Pick Admin or Staff. The Drive folder is shared with them.', 'They open the app and sign in with Google.']],
    ['Fix a mistake', ['Use <b>Undo</b> straight after deleting something.', 'Deleted estimates and contacts can be restored in Settings, Google and data, Recently deleted (60 days).', 'For a bigger problem: Settings, Google and data, Restore from a backup.']]
  ];
  App.views.help = () => `<div class="page-head"><div><h1>Help</h1><p class="sub">How the app fits together.${App.Care && App.Care.version ? ` Version ${App.Care.version}.` : ''}</p></div><div class="head-actions"><button class="btn" data-act="reportProblem">Report a problem</button></div></div>
    <div class="help">
    <section class="card"><h3>What's new</h3><div class="whatsnew">${App.WHATSNEW.map(([v, d, items]) => `<details ${v === App.WHATSNEW[0][0] ? 'open' : ''}><summary><b>Version ${v}</b> <span class="hint">${d}</span></summary><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></details>`).join('')}</div></section>
    <section class="card"><h3>How to…</h3><div class="howto">${App.HOWTO.map(([t, steps]) => `<details><summary><b>${t}</b></summary><ol>${steps.map(s2 => `<li>${s2}</li>`).join('')}</ol></details>`).join('')}</div></section>
    <section class="card"><h3>Making an estimate</h3><ol>
      <li>On the home screen, pick <b>General</b> or <b>Full frame and truss</b>. The number and date fill in automatically.</li>
      <li>Fill in the client, project, sections and gauges, and what's included. Untick delivery if it's not included.</li>
      <li>Switch to <b>My workings</b> to work out the price. Upload the FRAMECAD PDF to fill in the metres, split them across gauges, add other lines, then press <b>Use as the estimate price</b>.</li>
      <li>Check the <b>Preview</b>, then <b>Email estimate</b>. It saves the PDF and workings to Google Drive, emails the client, and marks it sent.</li>
    </ol></section>
    <section class="card"><h3>After it's sent</h3><p>Sent estimates are locked so nothing changes by accident. To change one, use <b>Create revision</b>, which makes Rev 1, Rev 2 and so on. Follow-ups go out one and two weeks after sending, from whoever sent it. You'll see them on the <b>Follow-ups</b> page.</p></section>
    <section class="card"><h3>When it's accepted</h3><p>Mark it accepted and it becomes a job on the <b>Production</b> board. On the job page you can upload the plans and FRAMECAD files, plan deliveries, print the factory checklist and delivery dockets, make purchase orders, create variations, and back-cost the job when it's done.</p></section>
    <section class="card"><h3>Practice mode</h3><p>Switch on <b>Practice</b> at the top to try things out. Practice estimates get TEST numbers, don't use up real numbers, and stay out of the dashboard.</p></section>
    <section class="card"><h3>Where things are saved</h3><p>${st.mode === 'drive' ? 'Everything is saved in the shared "CH Engineering Estimates" folder in Google Drive, with a folder for each year and a folder for each job.' : 'Right now everything is saved in this browser only. Follow the setup guide (README) to connect Google Drive so you and Davin share the same data.'}</p></section>
    </div>`;

  /* ---------- Start-up ---------- */
  const signInScreen = (msg = '') => {
    document.getElementById('main').innerHTML = `<div class="signin"><img src="logo.png" alt="CH Engineering"><h1>Estimates</h1>
      ${msg ? `<p class="err">${e(msg)}</p>` : '<p>Sign in with your CH Engineering Google account.</p>'}
      <button class="btn primary big" id="signin-btn">Sign in with Google</button></div>`;
    document.getElementById('signin-btn').onclick = async () => {
      try { await App.G.signIn('select_account'); await boot(); } catch (er) { signInScreen(er.message); }
    };
  };
  const boot = async () => {
    document.getElementById('main').innerHTML = '<div class="loading">Loading your estimates…</div>';
    await st.load();
    const me = st.me();
    if (st.mode === 'drive' && me.unknown && S().users.length) {
      document.getElementById('main').innerHTML = `<div class="signin"><img src="logo.png" alt=""><h1>No access</h1><p>${e(App.G.user.email)} isn't on the list of people who can use this app. Ask an admin to add you in Settings.</p><button class="btn" onclick="App.G.signOut()">Sign out</button></div>`;
      return;
    }
    document.body.classList.add('ready');
    App.render();
    if (st.mode === 'drive') setInterval(() => st.poll(), 45000);
    setInterval(() => App.renderNav(), 60000);
  };
  window.addEventListener('DOMContentLoaded', async () => {
    App.state.practice = !!localStorage.getItem('che-practice');
    try {
      if (App.G.enabled()) {
        await App.G.init();
        if (App.G.signedIn()) { try { await App.G.loadUser(); return await boot(); } catch (er) { /* token stale */ } }
        signInScreen();
      } else await boot();
    } catch (er) { console.error(er); document.getElementById('main').innerHTML = `<div class="signin"><h1>Couldn't start</h1><p class="err">${e(er.message)}</p></div>`; }
  });
})();
