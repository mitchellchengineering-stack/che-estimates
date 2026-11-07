/* Clients: regular customers, each with a folder of everything you've quoted and built for them. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const norm = s => String(s || '').trim().toLowerCase();
  const CL = App.Clients = {
    list() { return (st.data.customers || []).filter(c => c.regular && !c.deleted).sort((a, b) => (a.company || a.name || '').localeCompare(b.company || b.name || '')); },
    get(id) { return (st.data.customers || []).find(c => c.id === id); },
    label(c) { return c.company || c.name || 'Client'; },
    ests(c) {
      return st.live().filter(x => !x.practice && x.status !== 'cancelled' && (x.clientId === c.id || (!x.clientId && ((c.company && norm(x.client.company) === norm(c.company)) || (c.email && norm(x.client.email) === norm(c.email)) || (!c.company && c.name && norm(x.client.name) === norm(c.name) && !x.client.company)))))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    lm(x) { const d = App.Helper && x.job ? App.Helper.detailed(x) : null; if (d) return d.walls + d.trusses + d.joists; return (x.workings.steel || []).reduce((t, r) => t + App.num(r.lm), 0); },
    stats(c) {
      const es = CL.ests(c); const won = es.filter(x => x.status === 'accepted'); const lost = es.filter(x => x.status === 'rejected');
      const val = x => st.totals(x).sub + (App.Var ? App.Var.total(x) : 0);
      const wonV = won.reduce((t, x) => t + val(x), 0);
      return { es, won, quoted: es.filter(x => x.sentDate).reduce((t, x) => t + st.totals(x).sub, 0), wonV, rate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null, lm: won.reduce((t, x) => t + CL.lm(x), 0), avg: won.length ? wonV / won.length : 0, last: es[0] };
    },
    fill(est, c) {
      Object.assign(est.client, { name: c.name || '', company: c.company || '', email: c.email || '', phone: c.phone || '' });
      est.clientId = c.id; if (!est.siteAddress && c.address && c.useAddressAsSite) est.siteAddress = c.address;
    }
  };
  const fmt = n => Math.round(App.num(n)).toLocaleString('en-NZ');

  /* ---------- Clients page ---------- */
  App.views.clients = id => {
    if (id) return CL.page(id);
    const q = norm(App.state.clQ || '');
    const list = CL.list().filter(c => !q || norm([c.company, c.name, c.email, c.phone].join(' ')).includes(q));
    /* past customers you've quoted more than once, not yet saved as regular */
    const counts = {}; st.live().filter(x => !x.practice && (x.client.company || x.client.name)).forEach(x => { const k = norm(x.client.company || x.client.name); counts[k] = (counts[k] || 0) + 1; });
    const suggest = (st.data.customers || []).filter(c => !c.regular && !c.deleted && counts[norm(c.company || c.name)] >= 2 && !CL.list().some(r => norm(r.company || r.name) === norm(c.company || c.name))).slice(0, 8);
    return `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Your regular customers, and everything you've done for them</p><h1>Clients</h1></div><div class="head-actions"><button class="btn primary" data-act="clEdit">+ Add a client</button></div></div>
      <input type="search" id="cl-q" placeholder="Search clients" value="${e(App.state.clQ || '')}" data-act-input="clSearch" style="margin-bottom:16px">
      ${suggest.length ? `<div class="banner"><b>Quoted more than once:</b> ${suggest.map(c => `<button class="chip" data-act="clMake" data-id="${c.id}">+ ${e(c.company || c.name)}</button>`).join(' ')}<span class="hint"> Tap to save as a regular client.</span></div>` : ''}
      ${list.length ? `<div class="cl-grid">${list.map(c => { const s2 = CL.stats(c); return `<a class="card cl-card" href="#/clients/${c.id}"><div class="row" style="justify-content:space-between;align-items:flex-start"><span><b class="cn">${e(CL.label(c))}</b><span class="hint" style="display:block">${e([c.company ? c.name : '', c.phone].filter(Boolean).join(', '))}</span></span>${c.type ? `<span class="tag blue">${e(c.type)}</span>` : ''}</div>
        <div class="cl-stats"><span><em>Jobs</em><b>${s2.won.length}</b></span><span><em>Won</em><b>${App.money(s2.wonV, 0)}</b></span><span><em>Steel sold</em><b>${s2.lm ? fmt(s2.lm) + ' LM' : '-'}</b></span></div>
        <span class="hint small">${s2.last ? `Last estimate ${App.fmtShort(s2.last.date || App.iso(new Date(s2.last.createdAt)))}` : 'No estimates yet'}</span></a>`; }).join('')}</div>`
      : `<div class="empty"><h2>${CL.list().length ? 'No clients match' : 'No regular clients yet'}</h2><p>Add your regular builders here. Their details fill in on new estimates, and their folder shows everything you've done for them.</p></div>`}`;
  };
  A.clSearch = App.debounce(el => { App.state.clQ = el.value; App.refresh(); const i = document.getElementById('cl-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  A.clMake = el => { const c = CL.get(el.dataset.id); c.regular = true; st.touch(c); st.save(); App.toast(`${CL.label(c)} saved as a regular client`); App.refresh(); };

  A.clEdit = (el, ev, preset) => {
    const c = (el && el.dataset && el.dataset.id ? CL.get(el.dataset.id) : null) || Object.assign({}, preset || {});
    const isNew = !c.id;
    const f = (l, k, t = 'text') => App.field(l, `<input id="cl-${k}" type="${t}" value="${e(c[k] || '')}">`);
    const m = App.modal(isNew ? 'Add a regular client' : `Edit ${CL.label(c)}`, `<div class="grid2">${f('Company', 'company')}${f('Main contact', 'name')}${f('Email', 'email', 'email')}${f('Phone', 'phone', 'tel')}${f('Accounts email (optional)', 'accountsEmail', 'email')}${f('Type, e.g. Builder', 'type')}</div>${f('Address', 'address')}${App.field('Notes', `<textarea id="cl-notes" rows="3">${e(c.notes || '')}</textarea>`)}`,
      { wide: true, actions: `${!isNew ? '<button class="btn ghost danger" id="cl-x">Remove from Clients</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="cl-ok">Save</button>` });
    m.querySelector('#cl-ok').onclick = () => {
      const v = k => m.querySelector('#cl-' + k).value.trim();
      if (!v('company') && !v('name')) return App.toast('Add a company or a name', 'err');
      ['company', 'name', 'email', 'phone', 'accountsEmail', 'type', 'address', 'notes'].forEach(k => c[k] = v(k)); c.regular = true;
      if (isNew) { c.id = App.uid(); c.createdAt = Date.now(); st.data.customers.push(c); }
      st.touch(c); st.save(); App.closeModal(); if (isNew && !(preset && preset.stay)) location.hash = `#/clients/${c.id}`; App.refresh();
      if (preset && preset.onSave) preset.onSave(c);
    };
    if (!isNew) m.querySelector('#cl-x').onclick = () => { c.regular = false; st.touch(c); st.save(); App.closeModal(); location.hash = '#/clients'; };
  };

  /* ---------- one client's folder ---------- */
  CL.page = id => {
    const c = CL.get(id); if (!c) return '<div class="empty"><h2>Client not found</h2><a class="btn" href="#/clients">Back to Clients</a></div>';
    const s2 = CL.stats(c); const jobs = s2.es.filter(x => x.job);
    const statusTag = x => x.status === 'accepted' ? '<span class="tag ok">Won</span>' : x.status === 'rejected' ? '<span class="tag bad">Lost</span>' : x.status === 'sent' ? '<span class="tag blue">Sent</span>' : `<span class="tag">${e(x.status)}</span>`;
    const detail = (k, v) => v ? `<div class="kvr2"><span class="hint">${k}</span><b>${e(v)}</b></div>` : '';
    return `<div class="page-head"><div><p class="crumbs"><a href="#/clients">Clients</a></p><h1>${e(CL.label(c))}</h1><p class="sub">${e([c.type, c.createdAt ? 'client since ' + App.fmtDate(App.iso(new Date(c.createdAt)), { month: 'long', year: 'numeric' }) : ''].filter(Boolean).join(', '))}</p></div>
      <div class="head-actions"><button class="btn primary" data-act="clNewEst" data-id="${c.id}">+ New estimate for them</button></div></div>
      <div class="statcards" style="grid-template-columns:repeat(5,minmax(0,1fr))"><div class="statcard dark"><p class="l">Won</p><p class="v">${App.money(s2.wonV, 0)}</p><p class="s">${s2.won.length} job${s2.won.length === 1 ? '' : 's'}</p></div>
        <div class="statcard"><p class="l">Quoted</p><p class="v">${App.money(s2.quoted, 0)}</p><p class="s">${s2.es.length} estimates</p></div><div class="statcard"><p class="l">Win rate</p><p class="v">${s2.rate == null ? '-' : s2.rate + '%'}</p><p class="s">&#160;</p></div>
        <div class="statcard"><p class="l">Steel sold</p><p class="v">${s2.lm ? fmt(s2.lm) + ' LM' : '-'}</p><p class="s">from detailing or workings</p></div><div class="statcard"><p class="l">Average job</p><p class="v">${s2.avg ? App.money(s2.avg, 0) : '-'}</p><p class="s">&#160;</p></div></div>
      <div class="cl-cols"><section><h3>Jobs</h3>${jobs.length ? `<div class="cl-jobs">${jobs.map(x => { const set = App.Detailing ? App.Detailing.forEst(x)[0] : null; const ifc = set && App.Detailing.hasIfc(set);
          return `<a class="dcard" href="#/job/${x.id}"><div class="dthumb ${set ? (ifc ? 'ifc' : 'pdf') : 'none'}">${set ? `<img data-clthumb="${set.id}" alt="" hidden><span class="dbadge ${ifc ? 'ifc' : ''}">${ifc ? '3D model (IFC)' : 'PDF detailing'}</span>` : '<span class="hint">No detailing yet</span>'}</div>
            <div class="dbody"><b class="dt">${e(x.heading || (x.ft && x.ft.projectName) || 'Job')}</b><span class="hint"><b>${e(st.displayNumber(x))}</b> ${e(App.stageLabel(x.job.stage))}</span><b>${App.money(st.totals(x).sub + (App.Var ? App.Var.total(x) : 0), 0)}</b></div></a>`; }).join('')}</div>` : '<p class="hint">No jobs won yet.</p>'}</section>
        <aside><section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Details</h3><button class="btn small" data-act="clEdit" data-id="${c.id}">Edit</button></div>
          ${detail('Main contact', c.name)}${detail('Phone', c.phone)}${detail('Email', c.email)}${detail('Accounts email', c.accountsEmail)}${detail('Address', c.address)}${c.notes ? `<p class="hint" style="margin-top:8px">${e(c.notes)}</p>` : ''}</section>
        <section class="card"><h3>Estimates for them</h3>${s2.es.length ? s2.es.map(x => `<a class="kvr2" href="#/e/${x.id}"><span><b>${e(st.displayNumber(x))}</b> ${e(x.heading || '')}</span><span class="row" style="flex:none;gap:6px"><span class="small">${App.money(st.totals(x).sub, 0)}</span>${statusTag(x)}</span></a>`).join('') : '<p class="hint">None yet.</p>'}</section></aside></div>`;
  };
  App.views.clients.mount = id => {
    if (!id || !App.Detailing) return;
    document.querySelectorAll('[data-clthumb]').forEach(async img => { const set = App.Detailing.get(img.dataset.clthumb); if (!set) return; try { const url = await App.Detailing.loadThumb(set); if (url) { img.src = url; img.hidden = false; } } catch (er) {} });
  };
  A.clNewEst = async el => {
    const c = CL.get(el.dataset.id);
    const type = await new Promise(res => { const m = App.modal(`New estimate for ${CL.label(c)}`, '<p>Which kind of estimate?</p>', { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-t="general">General</button><button class="btn primary" data-t="ft">Full frame and truss</button>' }); m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { App.closeModal(); res(b.dataset.t); }); });
    if (!type) return;
    const est = st.newEstimate(type); CL.fill(est, c); st.touch(est); st.save(); location.hash = `#/e/${est.id}`;
  };

  /* ---------- picking a regular client on an estimate ---------- */
  CL.pickerHtml = est => {
    const list = CL.list(); if (!list.length) return '';
    return `<div class="row cl-pick" style="flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">${App.field('Regular client', `<select data-act-change="clPick"><option value="">One-off client (type below)</option>${list.map(c => App.opt(c.id, `${CL.label(c)}${c.company && c.name ? ' (' + c.name + ')' : ''}`, est.clientId || '')).join('')}</select>`)}</div>`;
  };
  A.clPick = el => { const est = App.cur; if (!el.value) { est.clientId = ''; st.touch(est); st.save(); return; } CL.fill(est, CL.get(el.value)); st.touch(est); st.save(); App.refresh(); App.toast('Client details filled in'); };
  A.clSaveFromEst = () => { const est = App.cur; A.clEdit(null, null, { company: est.client.company, name: est.client.name, email: est.client.email, phone: est.client.phone, stay: true, onSave: c => { est.clientId = c.id; st.touch(est); st.save(); App.refresh(); } }); };

  /* client summary PDF */
  if (App.Reports) App.Reports.build.client = id => {
    const R = App.Reports, D = App.Docs; const c = CL.get(id); const s2 = CL.stats(c);
    const flow = [D.blk(R.stats([['Won', App.money(s2.wonV, 0), `${s2.won.length} jobs`], ['Quoted', App.money(s2.quoted, 0), `${s2.es.length} estimates`], ['Win rate', s2.rate == null ? '-' : s2.rate + '%', ''], ['Steel sold', s2.lm ? fmt(s2.lm) + ' LM' : '-', '']])),
      R.section('Estimates and jobs', R.table(['Number', 'Job', 'Status', 'Value', 'Steel'], s2.es.map(x => [e(st.displayNumber(x)), e(x.heading || ''), e(x.job ? App.stageLabel(x.job.stage) : x.status), App.money(st.totals(x).sub, 0), x.job ? fmt(CL.lm(x)) + ' LM' : '-']), [3, 4]))];
    R.show(CL.label(c), R.spec('Client summary', CL.label(c), [['Contact', c.name || '']], flow), `${CL.label(c)} summary`);
  };
})();
