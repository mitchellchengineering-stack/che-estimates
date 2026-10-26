/* App shell: routing, binding, home, help, start-up */
(() => {
  const e = App.esc, st = App.store, S = () => App.store.s(), A = App.actions;

  const NAV = [
    ['', 'Create estimate', '<path d="M12 5v14M5 12h14"/>'],
    ['tracker', 'Estimate tracker', '<path d="M4 6h16M4 12h16M4 18h10"/>'],
    ['followups', 'Follow-ups', '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>'],
    ['production', 'Production', '<path d="M3 20V9l6 4V9l6 4V5h6v15z"/>'],
    ['calendar', 'Calendar', '<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
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
    const active = r.name === 'e' || r.name === 'new' ? (r.name === 'new' ? '' : 'tracker') : r.name === 'job' ? 'production' : r.name;
    document.getElementById('nav').innerHTML = NAV.map(([k, l, ic]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${l}</span>${k === 'followups' && due ? `<em class="badge">${due}</em>` : ''}</a>`).join('');
    const me = st.data ? st.me() : null;
    document.getElementById('side-foot').innerHTML = me ? `<span>${e(me.name)}</span><small>${st.mode === 'drive' ? 'Saving to Google Drive' : 'Saving in this browser'}</small>` : '';
  };
  App.renderTop = () => {
    const t = document.getElementById('topbar'); if (!st.data) { t.innerHTML = ''; return; }
    t.innerHTML = `<button class="icon-btn menu-btn" data-act="toggleMenu" aria-label="Menu">☰</button>
      ${App.state.practice ? '<div class="practice-flag">Practice mode: new estimates use TEST numbers and stay out of the stats</div>' : '<div></div>'}
      <div class="top-right">
        ${App.state.needsReconnect ? '<button class="btn small primary" data-act="reconnect">Reconnect Google</button>' : ''}
        <span id="sync" class="sync">${st.mode === 'drive' ? 'Saved' : 'This browser only'}</span>
        <label class="switch" title="Practice mode"><input type="checkbox" data-act-change="togglePractice" ${App.state.practice ? 'checked' : ''}><span></span>Practice</label>
      </div>`;
  };
  App.renderSync = txt => { const s = document.getElementById('sync'); if (s) { s.textContent = txt; s.className = 'sync ' + (txt === 'Not saved' ? 'bad' : ''); } };

  App.render = (keepScroll = false) => {
    if (!st.data) return;
    const r = App.route(); const main = document.getElementById('main');
    const y = window.scrollY;
    let html = '', mount = null;
    if (r.name === 'new') {
      const est = st.newEstimate(r.a === 'ft' ? 'ft' : 'general', !!App.state.practice);
      location.replace(`#/e/${est.id}`); return;
    }
    const v = { '': ['home'], e: ['estimate', r.a, r.b], job: ['job', r.a, r.b], tracker: ['tracker'], followups: ['followups'], production: ['production'], calendar: ['calendar'], dashboard: ['dashboard'], map: ['map'], settings: ['settings', r.a], help: ['help'] }[r.name] || ['home'];
    if (['tracker', 'followups', 'production', 'calendar', 'dashboard', 'map', 'help', 'home'].includes(v[0])) App.cur = null;
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
    st.touch(target); st.save();
    if (isChange && (el.dataset.rerender || el.dataset.rerenderBlur)) { App.refreshKeepFocus(); return; }
    if (App.cur && App.cur.workings) {
      const tot = document.querySelector('[data-live="totals"]'); if (tot) tot.innerHTML = App.Est.totalsHtml(App.cur);
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
    const jobs = App.Jobs.list(); const today = App.today(); const wkEnd = App.addDays(today, 7);
    const making = jobs.filter(j => j.job.stage === 'manufacturing');
    const yard = jobs.filter(j => j.job.stage === 'yard');
    const deliveries = []; jobs.forEach(j => (j.job.loads || []).forEach(l => { if (l.date && !l.delivered && l.date >= today && l.date <= wkEnd) deliveries.push({ j, l }); }));
    deliveries.sort((a, b) => a.l.date < b.l.date ? -1 : 1);
    const due = App.Track.due();
    const expiring = st.live().filter(x => x.status === 'sent' && !x.practice && !x.archived && x.expiry >= today && x.expiry <= wkEnd);
    const overdue = [];
    jobs.forEach(j => {
      if (j.job.manufactureDate && j.job.manufactureDate < today && ['accepted', 'detailing', 'scheduled'].includes(j.job.stage)) overdue.push({ j, text: `was due to start manufacture ${App.fmtShort(j.job.manufactureDate)}` });
      (j.job.loads || []).forEach(l => { if (l.date && l.date < today && !l.delivered) overdue.push({ j, text: `delivery ${l.n} was booked for ${App.fmtShort(l.date)} but isn't marked delivered` }); });
    });
    const recent = st.live().filter(x => !x.archived).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
    const templates = st.data.templates.filter(t => !t.deleted);
    const jobLine = j => `<a href="#/job/${j.id}"><b>${e(j.number)}</b> ${e(j.client.company || j.client.name)}<span class="hint">${e(j.heading)}</span></a>`;
    const panel = (title, items, empty, link) => `<section class="snap"><h3>${title}${items.length ? ` <em>${items.length}</em>` : ''}</h3>${items.length ? `<div class="snap-list">${items.join('')}</div>` : `<p class="hint">${empty}</p>`}${link || ''}</section>`;
    const next = st.nextSeq(st.yy());
    return `<section class="hero">
      <div class="hero-text"><h1>Create an estimate</h1><p>${App.state.practice ? 'Practice mode is on, so this will be a TEST estimate.' : `The next number is <b>${e(st.numberFor(st.yy(), next))}</b>.`}</p></div>
      <div class="hero-choices">
        <a class="choice" href="#/new/general"><span class="choice-t">General</span><span>Garages, sheds, cabins and smaller jobs. Size, stud height, sections and what's included.</span></a>
        <a class="choice" href="#/new/ft"><span class="choice-t">Full frame and truss</span><span>Houses and bigger jobs. Design criteria, scope, exclusions, extras and sign-off.</span></a>
      </div>
      ${templates.length ? `<label class="fld inline tpl-pick"><span>Or start from a template</span><select data-act-change="startTemplate"><option value="">Choose a template…</option>${templates.map(t => `<option value="${e(t.id)}">${e(t.name)} (${t.type === 'ft' ? 'F&T' : 'General'})</option>`).join('')}</select></label>` : ''}
    </section>
    <div class="snaps">
      ${panel('In manufacturing', making.map(j => { const c = App.Jobs.checkDone(j); return jobLine(j).replace('</a>', `${c.total ? `<span class="tag">${c.done} of ${c.total} frames</span>` : ''}</a>`); }), 'Nothing being made right now.', '<a class="more" href="#/production">Production board</a>')}
      ${panel('In the yard, ready to go', yard.map(jobLine), 'The yard is clear.')}
      ${panel('Deliveries in the next 7 days', deliveries.map(({ j, l }) => `<a href="#/job/${j.id}/deliveries"><b>${App.fmtDate(l.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b> ${e(j.number)} delivery ${l.n}/${j.job.loads.length}<span class="hint">${e(j.siteAddress)}</span></a>`), 'No deliveries booked this week.', '<a class="more" href="#/calendar">Calendar</a>')}
      ${panel('Follow-ups ready', due.map(d => `<a href="#/followups"><b>${e(d.est.number)}</b> ${e(d.est.client.company || d.est.client.name)}<span class="hint">${{ fu1: 'First follow-up', fu2: 'Second follow-up', expiry: 'Expiry reminder', review: 'Review request' }[d.kind]}</span></a>`), 'No follow-ups waiting.')}
      ${panel('Expiring this week', expiring.map(x => `<a href="#/e/${x.id}"><b>${e(x.number)}</b> ${e(x.client.company || x.client.name)}<span class="hint">Expires ${App.fmtShort(x.expiry)}</span></a>`), 'Nothing expiring this week.')}
      ${panel('Overdue', overdue.map(o => `<a href="#/job/${o.j.id}" class="bad"><b>${e(o.j.number)}</b> ${e(o.text)}</a>`), 'Nothing overdue.')}
    </div>
    <section class="card recent"><h3>Recently worked on</h3>${recent.length ? `<div class="recent-list">${recent.map(x => `<a href="#/${x.job ? 'job' : 'e'}/${x.id}"><b>${e(st.displayNumber(x))}</b><span>${e(x.client.company || x.client.name || 'No client yet')}</span><span class="hint">${e(x.heading)}</span><span class="pill ${x.status}">${x.status}</span></a>`).join('')}</div>` : '<p class="hint">Your estimates will show here.</p>'}</section>`;
  };

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
    document.getElementById('main').innerHTML = `<div class="signin"><img src="assets/logo.png" alt="CH Engineering"><h1>Estimates</h1>
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
      document.getElementById('main').innerHTML = `<div class="signin"><img src="assets/logo.png" alt=""><h1>No access</h1><p>${e(App.G.user.email)} isn't on the list of people who can use this app. Ask an admin to add you in Settings.</p><button class="btn" onclick="App.G.signOut()">Sign out</button></div>`;
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
