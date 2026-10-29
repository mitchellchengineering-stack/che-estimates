/* App shell: routing, binding, home, help, start-up */
(() => {
  const e = App.esc, st = App.store, S = () => App.store.s(), A = App.actions;

  const NAV = [
    ['', 'Home', '<path d="M3 11l9-7 9 7v9H3z"/>'],
    ['tracker', 'Estimate tracker', '<path d="M4 6h16M4 12h16M4 18h10"/>'],
    ['followups', 'Follow-ups', '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'],
    ['production', 'Production', '<path d="M3 20V9l6 4V9l6 4V5h6v15z"/>'],
    ['calendar', 'Calendar', '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['coils', 'Coils', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'],
    ['fasteners', 'Fasteners', '<path d="M12 3v14M8 7h8M10 21h4"/>'],
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
    const r = App.route(); const due = st.data ? App.Track.due().length : 0;
    const active = r.name === 'e' ? 'tracker' : r.name === 'new' ? '' : r.name === 'job' ? 'production' : r.name;
    document.getElementById('nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${l}</span>${k === 'followups' && due ? `<em class="badge">${due}</em>` : ''}</a>`).join('');
    const me = st.data ? st.me() : null;
    document.getElementById('side-foot').innerHTML = me ? `<span class="av" aria-hidden="true">${e((me.name || '?')[0].toUpperCase())}</span><span><b>${e(me.name)}</b><small>${st.mode === 'drive' ? 'Saved to Google Drive' : 'Saving in this browser'}</small></span>` : '';
  };
  App.renderTop = () => {
    const t = document.getElementById('topbar'); if (!st.data) { t.innerHTML = ''; return; }
    const q = (App.state.trk && App.state.trk.search) || '';
    t.innerHTML = `<button class="icon-btn menu-btn" data-act="toggleMenu" aria-label="Menu">☰</button>
      <label class="top-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><span style="position:absolute;left:-9999px">Search estimates</span><input id="top-q" type="search" placeholder="Search estimates, clients or addresses" value="${e(q)}" data-act-input="topSearch"></label>
      ${App.state.practice ? '<a class="practice-flag" href="#/settings/estimates">Practice mode is on: TEST numbers, kept out of the stats</a>' : ''}
      <div class="top-right">
        ${App.state.needsReconnect ? '<button class="btn small primary" data-act="reconnect">Reconnect Google</button>' : ''}
        <span id="sync" class="sync">${st.mode === 'drive' ? 'All saved' : 'This browser only'}</span>
      </div>`;
  };
  App.renderSync = txt => { const s = document.getElementById('sync'); if (s) { s.textContent = txt === 'Saved' ? (st.mode === 'drive' ? 'All saved' : 'Saved in this browser') : txt; s.className = 'sync ' + (txt === 'Not saved' ? 'bad' : txt === 'Saving…' ? 'busy' : ''); } };
  A.topSearch = App.debounce(el => {
    App.state.trk = App.state.trk || { year: st.yy(), search: '', status: '', type: '', who: '', archived: false, practice: false };
    App.state.trk.search = el.value;
    if (App.route().name !== 'tracker') location.hash = '#/tracker'; else App.refresh();
    setTimeout(() => { const i = document.getElementById('top-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 30);
  }, 250);

  App.render = (keepScroll = false) => {
    if (!st.data) return;
    const r = App.route(); const main = document.getElementById('main');
    const y = window.scrollY;
    let html = '', mount = null;
    if (r.name === 'new') {
      const est = st.newEstimate(r.a === 'ft' ? 'ft' : 'general', !!App.state.practice);
      location.replace(`#/e/${est.id}`); return;
    }
    const v = { '': ['home'], e: ['estimate', r.a, r.b], job: ['job', r.a, r.b], tracker: ['tracker'], followups: ['followups'], production: ['production'], calendar: ['calendar'], dashboard: ['dashboard'], map: ['map'], settings: ['settings', r.a], help: ['help'], coils: ['coils', r.a], fasteners: ['fasteners'] }[r.name] || ['home'];
    if (['tracker', 'followups', 'production', 'calendar', 'dashboard', 'map', 'help', 'home', 'coils', 'fasteners'].includes(v[0])) App.cur = null;
    try { html = App.views[v[0]](...v.slice(1)); mount = App.views[v[0]].mount; }
    catch (er) { console.error(er); html = `<div class="empty"><h2>Something went wrong on this page</h2><p>${e(er.message)}</p><a class="btn" href="#/">Go home</a></div>`; }
    main.innerHTML = html;
    if (mount) try { mount(...v.slice(1)); } catch (er) { console.error(er); }
    App.renderNav(); App.renderTop();
    document.body.classList.remove('menu-open');
    if (keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    App.state.staleView = false;
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
    const depOut = jobs.filter(j => !j.job.deposit.received && STAGE_ORDER(j) <= 6);
    const C = App.Coil; const coilsOn = C && C.ready() && C.S.loadedAt; const cs = coilsOn ? C.summary() : null;
    const F = App.Fast; const fastOn = F && F.ready() && F.S.loadedAt && !F.S.error; const low = fastOn ? F.low() : [];
    const due = App.Track.due();
    const expiring = real.filter(x => x.status === 'sent' && !x.archived && x.expiry >= today && x.expiry <= App.addDays(today, 7));
    const needs = [];
    App.Jobs.attention().forEach(a => needs.push(a));
    if (low.length) needs.splice(1, 0, { lvl: 'red', t: `${low.length} fastener${low.length === 1 ? '' : 's'} below minimum`, s: low.map(i => i.name).join(', '), b: 'Fasteners', href: '#/fasteners' });
    if (cs) cs.low.forEach(x => needs.push({ lvl: 'amber', t: `${C.bmt(x.t)} BMT coils running low`, s: `${x.n} coil${x.n === 1 ? '' : 's'} left in stock`, b: 'Coils', href: '#/coils' }));
    if (due.length) needs.push({ lvl: 'amber', t: `${due.length} follow-up${due.length === 1 ? '' : 's'} ready to send`, s: due.map(d => `${d.est.number} ${d.est.client.company || d.est.client.name}`).slice(0, 3).join(', '), b: 'Review', href: '#/followups' });
    expiring.forEach(x => needs.push({ lvl: 'blue', t: `${x.number} expires ${App.fmtDate(x.expiry, { weekday: 'long' })}`, s: `${x.client.company || x.client.name}, ${App.money(st.totals(x).sub, 0)}`, b: 'Open', href: `#/e/${x.id}` }));
    const days = []; for (let i = 0; i < 5; i++) days.push(App.addDays(wk, i));
    const rows = App.Jobs.timelineRows(days);
    const kpi = (l, v, sub, dark) => `<div class="statcard ${dark ? 'dark' : ''}"><p class="l">${l}</p><p class="v">${v}</p><p class="s">${sub}</p></div>`;
    const templates = st.data.templates.filter(t => !t.deleted);
    return `<div class="page-head"><div><p class="sub" style="margin:0 0 6px;font-weight:700">${greet}, ${e(me.name)}. ${App.fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p><h1>Dashboard</h1></div>
      <div class="head-actions"><a class="btn primary" href="#/new/general">+ General estimate</a><a class="btn dark" href="#/new/ft">+ Full F&amp;T estimate</a><button class="btn" data-act="homeScan">Scan a coil</button><a class="btn" href="#/calendar">Open calendar</a></div></div>
    <div class="statcards six">
      ${kpi('Quoted this month', App.money(sum(sentM), 0), `${sentM.length} sent, ${App.money(sum(waiting), 0)} waiting`, true)}
      ${kpi('Accepted this month', App.money(sum(wonM), 0), target ? `${Math.round(sum(wonM) / target * 100)}% of ${App.money(target, 0)} target` : `${wonM.length} job${wonM.length === 1 ? '' : 's'} won`)}
      ${kpi('In production', `${live.length} job${live.length === 1 ? '' : 's'}`, `${App.money(live.reduce((t, j) => t + st.totals(j).sub, 0), 0)} of work`)}
      ${kpi('Deliveries this week', dels.length, `${new Set(dels.map(d => d.j.id)).size} job(s), ${(dels.reduce((t, d) => t + kgOf(d.j, d.l.frameIds), 0) / 1000).toFixed(1)} t`)}
      ${kpi('Deposits outstanding', App.money(depOut.reduce((t, j) => t + st.totals(j).deposit, 0), 0), `${depOut.length} job${depOut.length === 1 ? '' : 's'}`)}
      ${kpi('Coils in stock', cs ? cs.ins.length : '-', cs ? C.kg(cs.ins.reduce((t, c) => t + c.weight, 0)) : '<a href="#/coils">Sign in to coils</a>')}
    </div>
    <div class="hub2">
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Needs you</h3>${needs.length ? `<span class="tag bad">${needs.length}</span>` : ''}</div>
        ${needs.length ? needs.slice(0, 7).map(App.Track.alertHtml).join('') : '<p class="hint">All caught up. Nothing needs you right now.</p>'}</section>
      <section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">This week in the factory</h3><a class="more" style="margin:0" href="#/production">Production</a></div>
        <div class="table-scroll" style="margin-top:10px">${App.Jobs.timelineHtml(days, rows)}</div></section>
    </div>
    <div class="snaps">
      <section class="snap"><h3>Coils<em>${cs ? cs.ins.length + ' in stock' : ''}</em></h3>
        ${cs ? `<div class="gauge-cells">${cs.byT.map(x => `<a class="gcell ${cs.low.includes(x) ? 'low' : ''}" href="#/coils"><span>${C.bmt(x.t)} BMT</span><b>${x.n}</b><span>${C.kg(x.kg)}</span></a>`).join('')}</div>
          <div class="kv-list small"><div><span>Scanned out this month</span><b>${cs.used.length} coil${cs.used.length === 1 ? '' : 's'}, ${C.kg(cs.used.reduce((t, c) => t + c.weight, 0))}</b></div><div><span>Waiting for labels</span><b>${cs.unlabelled.length}</b></div><div><span>On jobs in production</span><b>${cs.onJobs.length} coil${cs.onJobs.length === 1 ? '' : 's'}, ${cs.jobsWith} job${cs.jobsWith === 1 ? '' : 's'}</b></div></div>`
          : `<p class="hint">${C && C.cfg().apiUrl ? (C.S.token ? 'Loading coils…' : 'Sign in to the coil tracker once to see coils here.') : 'Connect the coil tracker in Settings.'}</p><a class="more" href="#/coils">Coils</a>`}</section>
      <section class="snap"><h3>Fasteners<em>${fastOn ? (low.length ? `<span class="tag bad">${low.length} low</span>` : '<span class="tag ok">All OK</span>') : ''}</em></h3>
        ${fastOn ? `${low.slice(0, 5).map(i => `<div class="kvr2"><span>${e(i.name)}</span><span><b class="neg">${i.qty}</b> <span class="hint">min ${i.min}</span></span></div>`).join('') || '<p class="hint">Everything is above its minimum.</p>'}
          <p class="hint" style="margin-top:10px">Live from the stock app, updated ${F.ago()}.${F.S.log[0] ? ` Last: ${e(F.S.log[0].person || '')} ${F.S.log[0].action === 'Sign out' ? 'took' : 'added'} ${F.S.log[0].qty} x ${e(F.S.log[0].item)}, ${e(F.when(F.S.log[0].time))}` : ''}</p>`
          : `<p class="hint">${F && F.S.error ? e(F.S.error) : st.mode === 'drive' ? 'Loading fastener stock…' : 'Connect Google to see fastener stock.'}</p>`}<a class="more" href="#/fasteners">Fasteners</a></section>
      <section class="snap"><h3>Waiting on a reply<em>${App.money(sum(waiting), 0)}</em></h3>
        ${waiting.slice(0, 4).map(x => `<a class="kvr2" href="#/e/${x.id}"><span><b>${e(x.number)}</b> ${e(x.client.company || x.client.name)}<span class="hint" style="display:block">${x.sentDate ? `Sent ${App.daysBetween(x.sentDate, today)} days ago` : ''}${x.openedAt ? ', opened' : ''}</span></span><b>${App.money(st.totals(x).sub, 0)}</b></a>`).join('') || '<p class="hint">Nothing waiting.</p>'}<a class="more" href="#/followups">Follow-ups</a></section>
    </div>
    <section class="hero hero-sm">
      <svg class="roof" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 110 L300 18 L600 110" fill="none" stroke="#15171a" stroke-width="14"></path><rect x="420" y="0" width="22" height="46" fill="#15171a"></rect></svg>
      <div class="hero-text"><h2>Create an estimate</h2><p class="next">${App.state.practice ? 'Practice mode is on, so this will be a <b>TEST</b> estimate' : `Next number <b>${e(st.numberFor(st.yy(), st.nextSeq(st.yy())))}</b>`}</p></div>
      <div class="hero-choices">
        <a class="choice" href="#/new/general"><span class="ct"><b>General</b><span class="arrow" aria-hidden="true">→</span></span><span>Garages, sheds, cabins</span></a>
        <a class="choice dark" href="#/new/ft"><span class="ct"><b>Full frame and truss</b><span class="arrow" aria-hidden="true">→</span></span><span>Houses and bigger jobs</span></a>
      </div>
      ${templates.length ? `<label class="fld inline tpl-pick"><span>Or start from a template</span><select data-act-change="startTemplate"><option value="">Choose a template…</option>${templates.map(t => `<option value="${e(t.id)}">${e(t.name)} (${t.type === 'ft' ? 'F&T' : 'General'})</option>`).join('')}</select></label>` : ''}
    </section>`;
  };
  App.views.home.mount = () => {
    const jobs = [];
    if (App.Coil && App.Coil.ready()) jobs.push(App.Coil.load().catch(() => false));
    if (App.Fast && App.Fast.ready()) jobs.push(App.Fast.load().catch(() => false));
    if (jobs.length) Promise.all(jobs).then(r => { if (r.some(Boolean) && App.route().name === '') App.refresh(); });
  };
  const STAGE_ORDER = j => App.STAGES.findIndex(s => s.value === j.job.stage);
  A.homeScan = () => { if (App.Coil && App.Coil.ready()) App.Coil.openScan('out'); else location.hash = '#/coils'; };

  App.views.help = () => `<div class="page-head"><div><h1>Help</h1><p class="sub">How the app fits together.</p></div></div>
    <div class="help">
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
