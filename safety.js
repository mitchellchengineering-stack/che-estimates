/* Health and safety: built around NZ's Health and Safety at Work Act 2015.
   Hazards, incidents and near misses, toolbox talks, people and training, checks, and hazardous substances. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const TABS = [['', 'Overview'], ['hazards', 'Hazards'], ['incidents', 'Incidents'], ['talks', 'Toolbox talks'], ['people', 'People and training'], ['checks', 'Checks'], ['substances', 'Substances']];
  const RISK = ['High', 'Medium', 'Low'];
  const TYPES = ['Near miss', 'Injury', 'Damage', 'Dangerous incident'];
  const TICKETS = ['Site induction', 'Roll-former operator', 'Forklift (F endorsement)', 'First aid', 'HIAB / crane', 'Working at height'];
  const col = k => (st.data[k] = st.data[k] || []);
  const live = k => col(k).filter(x => !x.deleted);
  const save = x => { x.updatedAt = Date.now(); st.touch(x); st.save(); };
  const add = (k, x) => { x.id = x.id || App.uid(); x.createdAt = x.createdAt || Date.now(); col(k).push(x); save(x); return x; };
  const riskTag = r => `<span class="tag ${r === 'High' ? 'bad' : r === 'Medium' ? 'warn' : 'ok'}">${e(r || '')}</span>`;
  const fdate = d => d ? App.fmtShort(String(d).slice(0, 10)) : '';

  /* starting lists, with fixed ids so two people opening it at once don't double up */
  const SEED_HAZ = [['coils', 'Coils falling during handling', 'Coil store, forklift', 'High', 'Coil cradles, forklift only, nobody under a raised coil'], ['rollformer', 'Roll-former moving parts', 'All roll-formers', 'High', 'Guards fitted, lock out before clearing jams, trained operators only'], ['edges', 'Sharp steel edges and offcuts', 'Factory floor', 'Medium', 'Cut-resistant gloves, offcut bins emptied daily'], ['noise', 'Noise from roll-formers', 'Factory', 'Medium', 'Hearing protection zone, yearly hearing checks'], ['yard', 'Reversing truck and forklift', 'Yard', 'Medium', 'Spotter when reversing, hi-vis in the yard, 10 km/h'], ['lifting', 'Manual handling of frames', 'Factory, loading', 'Medium', 'Two-person lifts for heavy frames, frame trolleys'], ['height', 'Working at height on trucks', 'Loading bay', 'Low', 'Load from the ground where possible, platform ladder']];
  const SEED_CHK = [['forklift', 'Forklift pre-start', 1], ['guards', 'Roll-former guards and emergency stops', 7], ['fire', 'Fire extinguishers', 182], ['firstaid', 'First aid kits', 30], ['lifting', 'Lifting gear and chains (competent person)', 182], ['ladders', 'Ladders and platforms', 30], ['drill', 'Emergency evacuation drill', 182], ['hiab', 'HIAB pre-use check', 1]];
  const SEED_SUB = [['crc', 'CRC 5-56', 'Aerosol, flammable. Store in the cage.'], ['galv', 'Galv spray (zinc)', 'Aerosol, flammable. Use with ventilation.'], ['lube', 'Roll-former lubricant', 'Machine room'], ['lpg', 'LPG (forklift)', 'Gas bottles, outside cage']];
  const seed = () => {
    if (!st.data || S().hsSeeded) return;
    SEED_HAZ.forEach(([id, hazard, where, risk, controls]) => { if (!col('hazards').some(x => x.id === 'hz-' + id)) col('hazards').push({ id: 'hz-' + id, hazard, where, risk, controls, reviewed: App.today(), createdAt: Date.now(), updatedAt: Date.now() }); });
    SEED_CHK.forEach(([id, name, every]) => { if (!col('checks').some(x => x.id === 'ck-' + id)) col('checks').push({ id: 'ck-' + id, name, every, history: [], createdAt: Date.now(), updatedAt: Date.now() }); });
    SEED_SUB.forEach(([id, name, notes]) => { if (!col('substances').some(x => x.id === 'sb-' + id)) col('substances').push({ id: 'sb-' + id, name, notes, sds: '', createdAt: Date.now(), updatedAt: Date.now() }); });
    S().hsSeeded = true; S().updatedAt = Date.now(); st.touch(S()); st.save();
  };

  const H = App.Safety = {
    checkDue(c) { const last = (c.history || []).slice(-1)[0]; if (!last) return { state: 'over', label: 'Not done yet', next: App.today() }; const next = App.addDays(last.date, App.num(c.every) || 30); const d = App.daysBetween(App.today(), next); return { last, next, d, state: d < 0 ? 'over' : d <= 7 ? 'soon' : 'ok', label: d < 0 ? `Overdue ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'Today' : d <= 7 ? App.fmtDate(next, { weekday: 'short', day: 'numeric', month: 'short' }) : App.fmtShort(next) }; },
    expiring(days = 30) { const out = []; live('staff').forEach(p => (p.tickets || []).forEach(t => { if (t.expiry && App.daysBetween(App.today(), t.expiry) <= days) out.push({ p, t, d: App.daysBetween(App.today(), t.expiry) }); })); return out.sort((a, b) => a.d - b.d); },
    lastTalk() { return live('talks').map(t => t.date).sort().pop(); },
    talkEvery() { return App.num((S().safety || {}).talkEvery) || 7; },
    daysSinceLTI() { const l = live('incidents').filter(i => i.lostTime).map(i => String(i.when).slice(0, 10)).sort().pop(); return l ? { d: App.daysBetween(l, App.today()), date: l } : null; },
    /* for Needs you and the morning brief */
    needs() {
      if (!st.data) return [];
      const out = [];
      live('checks').forEach(c => { const d = H.checkDue(c); if (d.state === 'over' && (c.history || []).length) out.push({ lvl: 'red', t: `${c.name} check overdue`, s: d.label, b: 'Do it', href: '#/safety/checks' }); });
      H.expiring(30).forEach(x => out.push({ lvl: x.d < 0 ? 'red' : 'amber', t: `${x.p.name}: ${x.t.name} ${x.d < 0 ? 'has expired' : 'expires in ' + x.d + ' days'}`, s: 'Book a refresher', b: 'Open', href: '#/safety/people' }));
      live('incidents').filter(i => i.status !== 'Closed').forEach(i => (i.actions || []).filter(a => !a.done && a.due && a.due <= App.today()).forEach(a => out.push({ lvl: 'amber', t: `Incident action due: ${a.text}`, s: `${i.ref}, ${a.who || ''}`, b: 'Open', href: '#/safety/incidents' })));
      const lt = H.lastTalk(); if (live('staff').length && (!lt || App.daysBetween(lt, App.today()) >= H.talkEvery())) out.push({ lvl: 'amber', t: 'Toolbox talk due', s: lt ? `Last one ${fdate(lt)}` : 'None recorded yet', b: 'Start one', href: '#/safety/talks' });
      return out;
    }
  };

  /* ---------- page ---------- */
  App.views.safety = (tab = '') => {
    seed();
    const head = `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Keeping everyone safe at 8 Wickham Street</p><h1>Health and safety</h1></div><div class="head-actions"><button class="btn primary" data-act="incNew">Report an incident</button></div></div>
      <nav class="tabs">${TABS.map(([k, l]) => `<a href="#/safety${k ? '/' + k : ''}" class="${(tab || '') === k ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
    const v = { '': H.overview, hazards: H.hazards, incidents: H.incidents, talks: H.talks, people: H.people, checks: H.checks, substances: H.substances }[tab || ''] || H.overview;
    return head + v();
  };
  H.overview = () => {
    const lti = H.daysSinceLTI(); const hz = live('hazards'); const ch = live('checks').map(c => [c, H.checkDue(c)]);
    const yr = App.today().slice(0, 4); const inc = live('incidents').filter(i => String(i.when).startsWith(yr));
    const due = H.needs().concat(ch.filter(([c, d]) => d.state === 'soon').map(([c, d]) => ({ lvl: 'blue', t: `${c.name}`, s: `Due ${d.label}`, b: 'Do it', href: '#/safety/checks' })));
    const recent = live('incidents').sort((a, b) => String(b.when).localeCompare(String(a.when))).slice(0, 4);
    return `<div class="statcards" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      <div class="statcard dark"><p class="l">Days without a lost-time injury</p><p class="v">${lti ? lti.d : '-'}</p><p class="s">${lti ? 'last one ' + fdate(lti.date) : 'none recorded'}</p></div>
      <div class="statcard"><p class="l">Hazards</p><p class="v">${hz.length}</p><p class="s">${hz.filter(h => h.risk === 'High').length} rated high</p></div>
      <div class="statcard"><p class="l">Checks due this week</p><p class="v">${ch.filter(([, d]) => d.state !== 'ok').length}</p><p class="s">${ch.filter(([, d]) => d.state === 'over').length} overdue</p></div>
      <div class="statcard"><p class="l">Tickets expiring</p><p class="v">${H.expiring(30).length}</p><p class="s">in the next 30 days</p></div>
      <div class="statcard"><p class="l">Incidents this year</p><p class="v">${inc.length}</p><p class="s">${inc.filter(i => i.type === 'Near miss').length} near misses</p></div></div>
    <div class="row-btns" style="margin-bottom:16px"><button class="btn dark" data-act="incNew">Report an incident or near miss</button><button class="btn" data-act="talkNew">Start a toolbox talk</button><button class="btn" data-act="hazEdit">Add a hazard</button></div>
    <div class="hub2"><section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Due this week</h3>${due.length ? `<span class="tag warn">${due.length}</span>` : ''}</div>${due.length ? due.slice(0, 8).map(App.Track.alertHtml).join('') : '<p class="hint">Nothing due. Nice.</p>'}</section>
      <section class="card" style="margin:0"><h3>Recent incidents</h3>${recent.length ? recent.map(i => `<a class="kvr2" href="#/safety/incidents" data-act="incOpen" data-id="${i.id}"><span><b>${e(i.type)}: ${e(i.title || i.what || '').slice(0, 70)}</b><span class="hint" style="display:block">${fdate(i.when)}${i.who ? ', ' + e(i.who) : ''}</span></span>${i.status === 'Closed' ? '<span class="tag ok">Closed</span>' : '<span class="tag warn">Open</span>'}</a>`).join('') : '<p class="hint">No incidents recorded.</p>'}</section></div>
    <section class="card soft"><h3>Serious harm? Notify WorkSafe</h3><p>If someone dies, is seriously injured or ill, or there's a dangerous incident, it's a notifiable event. Keep the area as it is (unless you need to help someone or make it safe) and notify WorkSafe as soon as possible. The incident form keeps the record. Check WorkSafe's guidance if you're not sure whether something is notifiable.</p></section>`;
  };

  /* ---------- hazards ---------- */
  H.hazards = () => {
    const list = live('hazards').sort((a, b) => RISK.indexOf(a.risk) - RISK.indexOf(b.risk));
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Hazard register</h3><button class="btn primary" data-act="hazEdit">+ Add a hazard</button></div>
      <div class="table-scroll"><table class="wtable" style="margin-top:10px"><thead><tr><th>Hazard</th><th>Where</th><th>Risk</th><th>How we control it</th><th>Reviewed</th><th></th></tr></thead><tbody>
      ${list.map(h => `<tr><td><b>${e(h.hazard)}</b></td><td>${e(h.where || '')}</td><td>${riskTag(h.risk)}</td><td class="small">${e(h.controls || '')}</td><td class="small">${fdate(h.reviewed)}</td><td class="r"><button class="btn small" data-act="hazEdit" data-id="${h.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="hint">No hazards yet.</td></tr>'}</tbody></table></div></section>`;
  };
  A.hazEdit = el => {
    const h = el.dataset.id ? col('hazards').find(x => x.id === el.dataset.id) : { risk: 'Medium', reviewed: App.today() };
    const m = App.modal(h.id ? 'Edit hazard' : 'Add a hazard', `${App.field('Hazard', `<input id="hz-h" value="${e(h.hazard || '')}">`)}<div class="grid2">${App.field('Where', `<input id="hz-w" value="${e(h.where || '')}">`)}${App.field('Risk', `<select id="hz-r">${App.opts(RISK, h.risk)}</select>`)}</div>
      ${App.field('How we control it', `<textarea id="hz-c" rows="3">${e(h.controls || '')}</textarea>`)}${App.field('Last reviewed', `<input type="date" id="hz-d" value="${e(h.reviewed || App.today())}">`)}`,
      { actions: `${h.id ? '<button class="btn ghost danger" id="hz-del">Remove</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="hz-ok">Save</button>` });
    m.querySelector('#hz-ok').onclick = () => { const v = id => m.querySelector(id).value.trim(); if (!v('#hz-h')) return App.toast('Describe the hazard', 'err'); Object.assign(h, { hazard: v('#hz-h'), where: v('#hz-w'), risk: v('#hz-r'), controls: v('#hz-c'), reviewed: v('#hz-d') }); h.id ? save(h) : add('hazards', h); App.closeModal(); App.refresh(); };
    if (h.id) m.querySelector('#hz-del').onclick = () => { h.deleted = true; save(h); App.closeModal(); App.refresh(); };
  };

  /* ---------- incidents ---------- */
  H.incidents = () => {
    const list = live('incidents').sort((a, b) => String(b.when).localeCompare(String(a.when)));
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Incidents and near misses</h3><button class="btn primary" data-act="incNew">+ Report one</button></div>
      <div class="table-scroll"><table class="wtable" style="margin-top:10px"><thead><tr><th>Ref</th><th>Type</th><th>What happened</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr><td><b>${e(i.ref)}</b></td><td>${e(i.type)}${i.notifiable ? ' <span class="tag bad">Notifiable</span>' : ''}</td><td class="small">${e((i.what || '').slice(0, 110))}</td><td class="small">${fdate(i.when)}</td><td>${i.status === 'Closed' ? '<span class="tag ok">Closed</span>' : '<span class="tag warn">Open</span>'}</td>
        <td class="r nowrap"><button class="btn small" data-act="incOpen" data-id="${i.id}">Open</button><button class="btn small" data-act="incPdf" data-id="${i.id}">PDF</button></td></tr>`).join('') || '<tr><td colspan="6" class="hint">Nothing reported. Report near misses too, they\'re how you stop the next injury.</td></tr>'}</tbody></table></div></section>`;
  };
  A.incNew = () => H.incForm({ type: 'Near miss', when: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), reportedBy: st.me().name, status: 'Open', actions: [], photos: [] });
  A.incOpen = (el, ev) => { if (ev) ev.preventDefault(); H.incForm(col('incidents').find(x => x.id === el.dataset.id)); };
  H.incForm = i => {
    const people = live('staff').map(p => p.name);
    const m = App.modal(i.id ? `${i.ref}: ${i.type}` : 'Report an incident or near miss', `
      <div class="fld"><span>What happened?</span><div class="seg wrap">${TYPES.map(t => `<label><input type="radio" name="in-t" value="${t}" ${i.type === t ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <div class="grid2">${App.field('When', `<input type="datetime-local" id="in-when" value="${e(String(i.when || '').slice(0, 16))}">`)}${App.field('Where', `<input id="in-where" value="${e(i.where || '')}" placeholder="e.g. Coil store">`)}</div>
      <div class="grid2">${App.field('Who was involved', `<input id="in-who" value="${e(i.who || '')}" list="in-people"><datalist id="in-people">${people.map(p => `<option>${e(p)}</option>`).join('')}</datalist>`)}${App.field('Reported by', `<input id="in-by" value="${e(i.reportedBy || '')}">`)}</div>
      ${App.field('Short title', `<input id="in-title" value="${e(i.title || '')}" placeholder="e.g. Coil slipped on the forklift tines">`)}
      ${App.field('What happened', `<textarea id="in-what" rows="3">${e(i.what || '')}</textarea>`)}
      ${App.field('Any injury?', `<input id="in-inj" value="${e(i.injury || '')}" placeholder="None, or describe it">`)}
      <label class="check"><input type="checkbox" id="in-lti" ${i.lostTime ? 'checked' : ''}> Someone had time off work because of it (lost-time injury)</label>
      ${App.field('Why it happened', `<textarea id="in-why" rows="2">${e(i.why || '')}</textarea>`)}
      <div class="fld"><span>What we're doing about it</span><div id="in-acts">${(i.actions || []).map((a, k) => H.actRow(a, k)).join('')}</div><button class="btn small dashed" id="in-act-add" type="button">+ Add an action</button></div>
      <div class="fld"><span>Photos</span><div class="row" style="flex-wrap:wrap" id="in-ph">${(i.photos || []).map(p => `<span class="tag">${e(p.name)}</span>`).join('')}</div><input type="file" id="in-files" accept="image/*" multiple></div>
      <div class="banner warn" style="margin:8px 0"><b>Is it a notifiable event?</b> Death, serious injury or illness, or a dangerous incident must be notified to WorkSafe as soon as possible.
        <div class="seg" style="margin-top:8px"><label><input type="radio" name="in-n" value="no" ${!i.notifiable ? 'checked' : ''}><span>No</span></label><label><input type="radio" name="in-n" value="yes" ${i.notifiable ? 'checked' : ''}><span>Yes, it's been notified to WorkSafe</span></label></div></div>
      <div class="grid2">${App.field('Status', `<select id="in-st">${App.opts(['Open', 'Closed'], i.status || 'Open')}</select>`)}${App.field('Signed off by', `<input id="in-sign" value="${e(i.signedOff || '')}" placeholder="When it's closed out">`)}</div>`,
      { wide: true, actions: `${i.id ? '<button class="btn" id="in-pdf">Download PDF</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="in-ok">${i.id ? 'Save' : 'Report it'}</button>` });
    let actions = App.clone(i.actions || []);
    const redraw = () => { m.querySelector('#in-acts').innerHTML = actions.map((a, k) => H.actRow(a, k)).join(''); bind(); };
    const bind = () => m.querySelectorAll('.act-row').forEach(r => { const k = +r.dataset.k; r.querySelectorAll('input').forEach(inp => inp.onchange = () => { const f = inp.dataset.f; actions[k][f] = inp.type === 'checkbox' ? (inp.checked ? App.today() : '') : inp.value; }); const x = r.querySelector('.act-del'); if (x) x.onclick = () => { actions.splice(k, 1); redraw(); }; });
    bind(); m.querySelector('#in-act-add').onclick = () => { actions.push({ text: '', who: '', due: '', done: '' }); redraw(); };
    const collect = () => ({ type: m.querySelector('input[name="in-t"]:checked').value, when: m.querySelector('#in-when').value, where: m.querySelector('#in-where').value.trim(), who: m.querySelector('#in-who').value.trim(), reportedBy: m.querySelector('#in-by').value.trim(), title: m.querySelector('#in-title').value.trim(), what: m.querySelector('#in-what').value.trim(), injury: m.querySelector('#in-inj').value.trim(), lostTime: m.querySelector('#in-lti').checked, why: m.querySelector('#in-why').value.trim(), actions: actions.filter(a => a.text), notifiable: m.querySelector('input[name="in-n"]:checked').value === 'yes', status: m.querySelector('#in-st').value, signedOff: m.querySelector('#in-sign').value.trim() });
    const saveIt = async () => {
      const v = collect(); if (!v.what) { App.toast('Say what happened', 'err'); return null; }
      Object.assign(i, v);
      if (!i.ref) { const yr = String(v.when || App.today()).slice(0, 4); const n = live('incidents').filter(x => String(x.ref || '').startsWith(yr)).length + 1; i.ref = `${yr}-${String(n).padStart(3, '0')}`; }
      i.photos = i.photos || []; const files = [...(m.querySelector('#in-files').files || [])];
      for (const f of files) { const p = { id: App.uid(), name: f.name }; if (st.mode === 'drive') { try { const root = await App.G.folder('Health and safety', st.rootId); const fo = await App.G.folder('Incidents', root); const sub = await App.G.folder(i.ref, fo); const up = await App.G.upload({ name: f.name, parent: sub, blob: f }); p.driveId = up.id; } catch (er) { App.toast('Photo not saved to Drive: ' + er.message, 'err'); } } H.photoMem[p.id] = f; i.photos.push(p); }
      i.id ? save(i) : add('incidents', i); return i;
    };
    m.querySelector('#in-ok').onclick = async ev => { ev.target.disabled = true; const r = await saveIt(); if (!r) { ev.target.disabled = false; return; } App.closeModal(); App.toast(`Saved as ${r.ref}`); App.refresh(); };
    if (i.id) m.querySelector('#in-pdf').onclick = async () => { const r = await saveIt(); if (r) { App.closeModal(); H.incPdf(r); } };
  };
  H.photoMem = {};
  H.actRow = (a, k) => `<div class="act-row row" data-k="${k}" style="flex-wrap:wrap;margin-bottom:6px"><input data-f="text" value="${e(a.text || '')}" placeholder="Action" style="flex:2 1 220px"><input data-f="who" value="${e(a.who || '')}" placeholder="Who" style="flex:1 1 100px"><input type="date" data-f="due" value="${e(a.due || '')}" style="flex:0 1 160px"><label class="check small"><input type="checkbox" data-f="done" ${a.done ? 'checked' : ''}> Done</label><button class="icon-btn act-del" type="button" aria-label="Remove">✕</button></div>`;
  A.incPdf = el => H.incPdf(col('incidents').find(x => x.id === el.dataset.id));
  H.incPdf = async i => {
    const R = App.Reports, D = App.Docs; const box = (l, v) => `<div class="card"><p class="l">${e(l)}</p><p class="v" style="font-size:13px;font-weight:600">${e(v || '-')}</p></div>`;
    const imgs = [];
    for (const p of (i.photos || []).slice(0, 4)) { try { const b = H.photoMem[p.id] || (p.driveId && st.mode === 'drive' ? await App.G.getBlob(p.driveId) : null); if (b) imgs.push(await App.readFile(b, 'dataURL')); } catch (er) {} }
    const flow = [D.blk(R.stats([['Type', i.type, ''], ['When', i.when ? App.fmtDate(String(i.when).slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : '', String(i.when || '').slice(11, 16)], ['Where', i.where || '-', ''], ['Status', i.status || 'Open', '']])),
      D.blk(`<div class="cards3">${box('Who was involved', i.who)}${box('Reported by', i.reportedBy)}${box('Injury', i.injury || 'None')}</div>`),
      R.section('What happened', `<div class="note"><p>${App.textToHtml(i.what || '')}</p></div>`)];
    if (i.why) flow.push(R.section('Why it happened', `<div class="note"><p>${App.textToHtml(i.why)}</p></div>`));
    flow.push(R.section('What we\'re doing about it', R.table(['Action', 'Who', 'Due', 'Done'], (i.actions || []).map(a => [e(a.text), e(a.who || ''), a.due ? fdate(a.due) : '', a.done ? '✓ ' + fdate(a.done) : '-']))));
    if (imgs.length) flow.push(R.section('Photos', `<div class="inc-photos">${imgs.map(u => `<img src="${u}" alt="">`).join('')}</div>`));
    flow.push(D.blk(`<div class="cards3" style="grid-template-columns:1fr 1fr">${box('Notifiable event (WorkSafe)?', i.notifiable ? 'Yes, notified to WorkSafe' : 'No. Not a death, serious injury or illness, or a dangerous incident.')}${box('Signed off', i.signedOff || 'Not yet')}</div>`));
    R.show(`Incident ${i.ref}`, R.spec('Incident report', `${i.type} ${i.ref}`, [['Reference', i.ref]], flow, 'safety'), `Incident ${i.ref}`);
  };

  /* ---------- toolbox talks ---------- */
  H.talks = () => {
    const list = live('talks').sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Toolbox talks</h3><button class="btn primary" data-act="talkNew">+ Start one</button></div><p class="hint">A reminder shows when it's been ${H.talkEvery()} days since the last one.</p>
      <table class="wtable"><thead><tr><th>Date</th><th>Topic</th><th>Who was there</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td><b>${fdate(t.date)}</b></td><td>${e(t.topic)}</td><td class="small">${e((t.attendees || []).join(', '))}</td><td class="r nowrap"><button class="btn small" data-act="talkOpen" data-id="${t.id}">Open</button><button class="btn small" data-act="talkPdf" data-id="${t.id}">PDF</button></td></tr>`).join('') || '<tr><td colspan="4" class="hint">No toolbox talks recorded yet.</td></tr>'}</tbody></table></section>`;
  };
  A.talkNew = () => H.talkForm({ date: App.today(), attendees: [] });
  A.talkOpen = el => H.talkForm(col('talks').find(x => x.id === el.dataset.id));
  H.talkForm = t => {
    const people = live('staff').map(p => p.name);
    const m = App.modal(t.id ? 'Toolbox talk' : 'Start a toolbox talk', `<div class="grid2">${App.field('Date', `<input type="date" id="tk-d" value="${e(t.date)}">`)}${App.field('Run by', `<input id="tk-by" value="${e(t.by || st.me().name)}">`)}</div>
      ${App.field('Topic', `<input id="tk-t" value="${e(t.topic || '')}" placeholder="e.g. Coil handling">`)}
      <div class="fld"><span>Who was there</span><div class="chips-row">${people.map(p => `<label class="chip ${(t.attendees || []).includes(p) ? 'on' : ''}"><input type="checkbox" value="${e(p)}" ${(t.attendees || []).includes(p) ? 'checked' : ''}>${e(p)}</label>`).join('') || '<span class="hint">Add people in People and training first.</span>'}</div>${App.field('Anyone else', `<input id="tk-x" value="${e(t.others || '')}">`)}</div>
      ${App.field('What we talked about', `<textarea id="tk-n" rows="4">${e(t.notes || '')}</textarea>`)}${App.field('Actions', `<textarea id="tk-a" rows="2">${e(t.actions || '')}</textarea>`)}`,
      { wide: true, actions: `${t.id ? '<button class="btn" id="tk-pdf">Download PDF</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="tk-ok">Save</button>` });
    m.querySelectorAll('.chips-row input').forEach(c => c.onchange = () => c.closest('.chip').classList.toggle('on', c.checked));
    const saveIt = () => { const v = id => m.querySelector(id).value.trim(); if (!v('#tk-t')) { App.toast('Add the topic', 'err'); return null; } Object.assign(t, { date: v('#tk-d'), by: v('#tk-by'), topic: v('#tk-t'), attendees: [...m.querySelectorAll('.chips-row input:checked')].map(c => c.value), others: v('#tk-x'), notes: v('#tk-n'), actions: v('#tk-a') }); t.id ? save(t) : add('talks', t); return t; };
    m.querySelector('#tk-ok').onclick = () => { if (saveIt()) { App.closeModal(); App.refresh(); } };
    if (t.id) m.querySelector('#tk-pdf').onclick = () => { const r = saveIt(); if (r) { App.closeModal(); H.talkPdf(r); } };
  };
  A.talkPdf = el => H.talkPdf(col('talks').find(x => x.id === el.dataset.id));
  H.talkPdf = t => {
    const R = App.Reports, D = App.Docs;
    const flow = [D.blk(R.stats([['Date', App.fmtLong(t.date), ''], ['Run by', t.by || '-', ''], ['People there', String((t.attendees || []).length + (t.others ? 1 : 0)), '']])),
      R.section('Who was there', R.table(['Name', 'Signature'], (t.attendees || []).concat(t.others ? t.others.split(',').map(x => x.trim()) : []).map(n => [e(n), '']))),
      R.section('What we talked about', `<div class="note"><p>${App.textToHtml(t.notes || '-')}</p></div>`)];
    if (t.actions) flow.push(R.section('Actions', `<div class="note"><p>${App.textToHtml(t.actions)}</p></div>`));
    R.show('Toolbox talk', R.spec('Toolbox talk', t.topic, [], flow, 'safety'), `Toolbox talk ${t.date} ${t.topic}`);
  };

  /* ---------- people and training ---------- */
  H.people = () => {
    const ppl = live('staff'); const tickets = [...new Set(TICKETS.concat(ppl.flatMap(p => (p.tickets || []).map(t => t.name))))];
    const cell = (p, name) => { const t = (p.tickets || []).find(x => x.name === name); if (!t) return '<span class="hint">-</span>'; if (t.na) return '<span class="hint">Not needed</span>'; if (t.training) return '<span class="tag blue">In training</span>'; if (!t.expiry) return '<span class="tag ok">✓ Held</span>'; const d = App.daysBetween(App.today(), t.expiry); return d < 0 ? '<span class="tag bad">Expired</span>' : d <= 30 ? `<span class="tag warn">Expires in ${d} days</span>` : `<span class="tag ok">✓ to ${fdate(t.expiry)}</span>`; };
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">People and training</h3><button class="btn primary" data-act="personEdit">+ Add a person</button></div>
      <p class="hint">Who's trained and signed off for what. Reminders show 30 days before anything expires.</p>
      <div class="table-scroll"><table class="wtable"><thead><tr><th>Person</th>${tickets.map(t => `<th>${e(t)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${ppl.map(p => `<tr><td><b>${e(p.name)}</b><div class="hint">${e(p.role || '')}</div></td>${tickets.map(t => `<td>${cell(p, t)}</td>`).join('')}<td class="r"><button class="btn small" data-act="personEdit" data-id="${p.id}">Edit</button></td></tr>`).join('') || `<tr><td colspan="${tickets.length + 2}" class="hint">Add your team to start the training matrix.</td></tr>`}</tbody></table></div></section>`;
  };
  A.personEdit = el => {
    const p = el.dataset.id ? col('staff').find(x => x.id === el.dataset.id) : { tickets: [] };
    const all = [...new Set(TICKETS.concat((p.tickets || []).map(t => t.name)))];
    const row = (name, t = {}) => `<div class="tk-row" data-name="${e(name)}"><b>${e(name)}</b><select class="tk-s">${App.opts([{ value: '', label: 'Not held' }, { value: 'held', label: 'Held' }, { value: 'training', label: 'In training' }, { value: 'na', label: 'Not needed' }], t.na ? 'na' : t.training ? 'training' : t.name ? 'held' : '')}</select><input type="date" class="tk-e" value="${e(t.expiry || '')}" title="Expiry date, if it expires"></div>`;
    const m = App.modal(p.id ? p.name : 'Add a person', `<div class="grid2">${App.field('Name', `<input id="pp-n" value="${e(p.name || '')}">`)}${App.field('Role', `<input id="pp-r" value="${e(p.role || '')}" placeholder="e.g. Roll-former operator">`)}</div>
      <div class="fld"><span>Tickets and training (add the expiry date if it has one)</span><div id="pp-t">${all.map(n => row(n, (p.tickets || []).find(t => t.name === n))).join('')}</div>
      <div class="row"><input id="pp-new" placeholder="Add another ticket, e.g. Welding"><button class="btn small" id="pp-add" type="button">Add</button></div></div>`,
      { wide: true, actions: `${p.id ? '<button class="btn ghost danger" id="pp-del">Remove person</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="pp-ok">Save</button>` });
    m.querySelector('#pp-add').onclick = () => { const n = m.querySelector('#pp-new').value.trim(); if (n) { m.querySelector('#pp-t').insertAdjacentHTML('beforeend', row(n)); m.querySelector('#pp-new').value = ''; } };
    m.querySelector('#pp-ok').onclick = () => {
      const name = m.querySelector('#pp-n').value.trim(); if (!name) return App.toast('Add their name', 'err');
      p.name = name; p.role = m.querySelector('#pp-r').value.trim();
      p.tickets = [...m.querySelectorAll('.tk-row')].map(r => { const s2 = r.querySelector('.tk-s').value; if (!s2) return null; return { name: r.dataset.name, expiry: r.querySelector('.tk-e').value, training: s2 === 'training', na: s2 === 'na' }; }).filter(Boolean);
      p.id ? save(p) : add('staff', p); App.closeModal(); App.refresh();
    };
    if (p.id) m.querySelector('#pp-del').onclick = () => { p.deleted = true; save(p); App.closeModal(); App.refresh(); };
  };

  /* ---------- checks ---------- */
  H.checks = () => {
    const list = live('checks').map(c => [c, H.checkDue(c)]).sort((a, b) => (a[1].next || '').localeCompare(b[1].next || ''));
    const tag = d => `<span class="tag ${d.state === 'over' ? 'bad' : d.state === 'soon' ? 'warn' : 'ok'}">${e(d.label)}</span>`;
    const ev = n => n === 1 ? 'Daily' : n === 7 ? 'Weekly' : n === 30 ? 'Monthly' : n === 182 ? '6-monthly' : n === 365 ? 'Yearly' : `Every ${n} days`;
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Checks and inspections</h3><button class="btn" data-act="checkEdit">+ Add a check</button></div>
      <table class="wtable" style="margin-top:10px"><thead><tr><th>Check</th><th>How often</th><th>Last done</th><th>Next due</th><th></th></tr></thead><tbody>
      ${list.map(([c, d]) => `<tr><td><b>${e(c.name)}</b></td><td>${ev(App.num(c.every))}</td><td class="small">${d.last ? `${fdate(d.last.date)}, ${e(d.last.by || '')}${d.last.result === 'fail' ? ' <span class="tag bad">Problem found</span>' : ''}` : '<span class="hint">Not yet</span>'}</td><td>${tag(d)}</td>
        <td class="r nowrap"><button class="btn small primary" data-act="checkDo" data-id="${c.id}">Do it</button><button class="btn small ghost" data-act="checkEdit" data-id="${c.id}">Edit</button></td></tr>`).join('')}</tbody></table></section>`;
  };
  A.checkDo = el => {
    const c = col('checks').find(x => x.id === el.dataset.id);
    const m = App.modal(c.name, `<div class="grid2">${App.field('Date', `<input type="date" id="cd-d" value="${App.today()}">`)}${App.field('Done by', `<input id="cd-b" value="${e(st.me().name)}">`)}</div>
      <div class="fld"><span>Result</span><div class="seg"><label><input type="radio" name="cd-r" value="pass" checked><span>All good</span></label><label><input type="radio" name="cd-r" value="fail"><span>Problem found</span></label></div></div>${App.field('Notes', '<textarea id="cd-n" rows="2"></textarea>')}`,
      { actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="cd-ok">Record it</button>' });
    m.querySelector('#cd-ok').onclick = () => { c.history = c.history || []; c.history.push({ date: m.querySelector('#cd-d').value, by: m.querySelector('#cd-b').value.trim(), result: m.querySelector('input[name="cd-r"]:checked').value, notes: m.querySelector('#cd-n').value.trim() }); c.history.sort((a, b) => a.date.localeCompare(b.date)); save(c); App.closeModal(); App.toast('Recorded'); App.refresh(); };
  };
  A.checkEdit = el => {
    const c = el.dataset.id ? col('checks').find(x => x.id === el.dataset.id) : { every: 30, history: [] };
    const m = App.modal(c.id ? 'Edit check' : 'Add a check', `${App.field('Check', `<input id="ce-n" value="${e(c.name || '')}">`)}${App.field('How often (days)', `<select id="ce-e">${[[1, 'Daily'], [7, 'Weekly'], [14, 'Fortnightly'], [30, 'Monthly'], [91, '3-monthly'], [182, '6-monthly'], [365, 'Yearly']].map(([v, l]) => App.opt(v, l, App.num(c.every))).join('')}</select>`)}`,
      { actions: `${c.id ? '<button class="btn ghost danger" id="ce-del">Remove</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="ce-ok">Save</button>` });
    m.querySelector('#ce-ok').onclick = () => { const n = m.querySelector('#ce-n').value.trim(); if (!n) return; c.name = n; c.every = +m.querySelector('#ce-e').value; c.id ? save(c) : add('checks', c); App.closeModal(); App.refresh(); };
    if (c.id) m.querySelector('#ce-del').onclick = () => { c.deleted = true; save(c); App.closeModal(); App.refresh(); };
  };

  /* ---------- substances ---------- */
  H.substances = () => `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Hazardous substances</h3><button class="btn" data-act="subEdit">+ Add a substance</button></div>
    <p class="hint">Keep a safety data sheet (SDS) for each one. Your supplier provides them. Ask for a new one if yours is more than 5 years old.</p>
    <table class="wtable"><thead><tr><th>Substance</th><th>Where and how it's stored</th><th>Safety data sheet</th><th></th></tr></thead><tbody>
    ${live('substances').map(s2 => { const old = s2.sdsDate && App.daysBetween(s2.sdsDate, App.today()) > 1826; return `<tr><td><b>${e(s2.name)}</b></td><td class="small">${e(s2.notes || '')}</td><td>${s2.sdsLink ? `<a href="${e(s2.sdsLink)}" target="_blank" rel="noopener">Open</a> ` : ''}${s2.sdsDate ? (old ? `<span class="tag warn">Dated ${fdate(s2.sdsDate)}, get a new one</span>` : `<span class="tag ok">Dated ${fdate(s2.sdsDate)}</span>`) : '<span class="tag warn">Not on file</span>'}</td><td class="r"><button class="btn small" data-act="subEdit" data-id="${s2.id}">Edit</button></td></tr>`; }).join('')}</tbody></table></section>`;
  A.subEdit = el => {
    const s2 = el.dataset.id ? col('substances').find(x => x.id === el.dataset.id) : {};
    const m = App.modal(s2.id ? s2.name : 'Add a substance', `${App.field('Substance', `<input id="sb-n" value="${e(s2.name || '')}">`)}${App.field('Where and how it\'s stored', `<input id="sb-w" value="${e(s2.notes || '')}">`)}
      <div class="grid2">${App.field('SDS date', `<input type="date" id="sb-d" value="${e(s2.sdsDate || '')}">`)}${App.field('Upload the SDS (PDF)', '<input type="file" id="sb-f" accept="application/pdf">')}</div>`,
      { actions: `${s2.id ? '<button class="btn ghost danger" id="sb-del">Remove</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="sb-ok">Save</button>` });
    m.querySelector('#sb-ok').onclick = async ev => {
      const n = m.querySelector('#sb-n').value.trim(); if (!n) return; ev.target.disabled = true;
      Object.assign(s2, { name: n, notes: m.querySelector('#sb-w').value.trim(), sdsDate: m.querySelector('#sb-d').value });
      const f = m.querySelector('#sb-f').files[0];
      if (f && st.mode === 'drive') { try { const root = await App.G.folder('Health and safety', st.rootId); const fo = await App.G.folder('Safety data sheets', root); const up = await App.G.uploadOrReplace({ name: f.name, parent: fo, blob: f, mime: 'application/pdf' }); s2.sdsLink = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`; if (!s2.sdsDate) s2.sdsDate = App.today(); } catch (er) { App.toast(er.message, 'err'); } }
      s2.id ? save(s2) : add('substances', s2); App.closeModal(); App.refresh();
    };
    if (s2.id) m.querySelector('#sb-del').onclick = () => { s2.deleted = true; save(s2); App.closeModal(); App.refresh(); };
  };

  /* ---------- summary PDF ---------- */
  App.Reports && (App.Reports.build.safety = r => {
    const R = App.Reports, D = App.Docs; const inc = live('incidents').filter(i => R.inRange(i.when, r)); const lti = H.daysSinceLTI();
    const flow = [R.multi() ? D.blk(R.stats([['Days without a lost-time injury', lti ? String(lti.d) : '-', ''], [`Incidents, ${r.label}`, String(inc.length), `${inc.filter(i => i.type === 'Near miss').length} near misses`], ['Hazards', String(live('hazards').length), `${live('hazards').filter(h => h.risk === 'High').length} high`], ['Toolbox talks', String(live('talks').filter(t => R.inRange(t.date, r)).length), r.label]])) : ''];
    if (R.has('incidents')) flow.push(R.section('Incidents', R.table(['Ref', 'Type', 'What happened', 'When', 'Status'], inc.map(i => [e(i.ref), e(i.type), e((i.what || '').slice(0, 90)), fdate(i.when), e(i.status || 'Open')]))));
    if (R.has('hazards')) flow.push(R.section('Hazard register', R.table(['Hazard', 'Where', 'Risk', 'Controls'], live('hazards').sort((a, b) => RISK.indexOf(a.risk) - RISK.indexOf(b.risk)).map(h => [e(h.hazard), e(h.where || ''), e(h.risk), e(h.controls || '')]))));
    if (R.has('checks')) flow.push(R.section('Checks', R.table(['Check', 'Last done', 'Next due'], live('checks').map(c => { const d = H.checkDue(c); return [e(c.name), d.last ? fdate(d.last.date) + ', ' + e(d.last.by || '') : 'Not yet', e(d.label)]; }))));
    if (R.has('training')) flow.push(R.section('Training', R.table(['Person', 'Ticket', 'Status', 'Expires'], live('staff').flatMap(p => (p.tickets || []).filter(t => !t.na).map((t, k) => [k === 0 ? e(p.name) : '', e(t.name), t.training ? 'In training' : 'Held', t.expiry ? fdate(t.expiry) : '-'])))));
    if (R.has('talks')) flow.push(R.section(`Toolbox talks, ${r.label}`, R.table(['Date', 'Topic', 'Run by', 'Who was there'], live('talks').filter(t => R.inRange(t.date, r)).sort((a, b) => String(a.date).localeCompare(String(b.date))).map(t => [fdate(t.date), e(t.topic), e(t.by || ''), e((t.attendees || []).join(', '))]))));
    if (R.has('substances')) flow.push(R.section('Hazardous substances', R.table(['Substance', 'Storage', 'Safety data sheet'], live('substances').map(x => [e(x.name), e(x.notes || ''), x.sdsDate ? 'Dated ' + fdate(x.sdsDate) : 'Not on file']))));
    const t = R.titled('Health and safety', 'safety');
    R.show(t, R.spec('Health and safety summary', t, [['Period', r.label]], flow, 'safety'), `${t} ${r.label}`);
  });
})();
