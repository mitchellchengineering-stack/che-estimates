/* Estimate helper: suggests wall, truss and joist metres from the basics on the plans.
   It starts from simple framing rules, then learns from your detailed jobs (estimated vs detailed). */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const TYPES = [['house1', 'Single-storey house', 1], ['house2', 'Two-storey house', 2], ['garage', 'Garage', 1], ['shed', 'Shed or barn', 1], ['cabin', 'Cabin or sleepout', 1], ['other', 'Other', 1]];
  const PARTS = [['walls', 'Wall framing'], ['trusses', 'Roof trusses'], ['joists', 'Floor joists']];
  const H = App.Helper = {
    TYPES, PARTS,
    rules() { return Object.assign({ studSpacing: 0.6, trussSpacing: 0.9, joistSpacing: 0.45, wallExtra: 15, waste: 5, internalPerM2: 0.3, keys: { walls: '89x41|0.75', trusses: '89x41|0.75', joists: '150x41|0.95' } }, S().helper || {}); },
    inputs(est) { return Object.assign({ type: est.type === 'ft' ? 'house1' : 'garage', area: '', storeys: '', stud: 2.4, pitch: '', roof: 'trusses', floor: 'slab', shape: 'simple', bedrooms: '', ext: '', int: '' }, est.helper || {}); },
    /* framing rules: metres of wall and roof from the floor area */
    rule(h) {
      const R = H.rules(); const area = App.num(h.area); if (!area) return null;
      const storeys = App.num(h.storeys) || (TYPES.find(t => t[0] === h.type) || [])[2] || 1;
      const foot = area / storeys; const w = Math.sqrt(foot / 1.5), l = w * 1.5;
      const shapeF = { simple: 1, L: 1.15, complex: 1.3 }[h.shape] || 1;
      const ext = App.num(h.ext) || 2 * (w + l) * shapeF * storeys;
      const house = /^house|cabin/.test(h.type);
      const intl = App.num(h.int) || (house ? (App.num(h.bedrooms) ? (6 + 7 * App.num(h.bedrooms)) * (h.type === 'cabin' ? 0.6 : 1) : area * R.internalPerM2) : 0);
      const stud = App.num(h.stud) || 2.4; const perM = stud / R.studSpacing + 3;
      const waste = 1 + App.num(R.waste) / 100;
      const walls = (ext + intl) * perM * (1 + App.num(R.wallExtra) / 100) * waste;
      let trusses = 0;
      if (h.roof === 'trusses') { const span = w * (shapeF > 1 ? 1.05 : 1); const pitch = (App.num(h.pitch) || (/^house/.test(h.type) ? 22.5 : 15)) * Math.PI / 180; const count = l * shapeF / R.trussSpacing + 1; trusses = count * (span / Math.cos(pitch) + span + span * 1.0) * waste; }
      let joists = 0;
      const jArea = (h.floor === 'joists' ? foot : 0) + (storeys > 1 ? foot * (storeys - 1) : 0);
      if (jArea) joists = jArea / R.joistSpacing * 1.1 * waste;
      return { walls, trusses, joists, ext, int: intl };
    },
    /* what each finished job actually used, from its detailing */
    detailed(est) {
      const d = est.job && est.job.detailed;
      const fr = d ? null : est.job && est.job.frames && est.job.frames.length ? est.job.frames : null;
      if (!d && !fr) return null;
      const by = d ? d.byCatLM || {} : fr.reduce((o, f) => { o[f.category] = (o[f.category] || 0) + (f.length || 0) * f.qty; return o; }, {});
      const out = { walls: by.Walls || 0, trusses: (by.Trusses || 0) + (by['Roof panels'] || 0), joists: by.Joists || 0, byProfile: d ? d.byProfile || {} : {} };
      return out.walls + out.trusses + out.joists ? out : null;
    },
    samples(type) {
      return st.live().filter(x => x.job && x.helper && App.num(x.helper.area) && H.detailed(x)).map(x => {
        const r = H.rule(H.inputs(x)); const d = H.detailed(x); return r ? { est: x, h: H.inputs(x), r, d } : null;
      }).filter(Boolean).filter(s => !type || s.h.type === type);
    },
    suggest(est) {
      const h = H.inputs(est); const r = H.rule(h); if (!r) return null;
      let pool = H.samples(h.type); let basis = 'type'; if (pool.length < 3) { const all = H.samples(); if (all.length >= 3 && pool.length < 3) { pool = all; basis = 'all'; } }
      const out = { basis, n: pool.length, parts: {} };
      PARTS.forEach(([k]) => {
        const base = r[k]; if (!base) { out.parts[k] = { lm: 0, lo: 0, hi: 0 }; return; }
        const ratios = pool.map(s => s.r[k] ? s.d[k] / s.r[k] : null).filter(x => x && isFinite(x) && x > 0.2 && x < 5).sort((a, b) => a - b);
        if (ratios.length >= 3) { const med = ratios[Math.floor(ratios.length / 2)]; out.parts[k] = { lm: base * med, lo: base * ratios[0], hi: base * ratios[ratios.length - 1], learned: true, n: ratios.length }; }
        else out.parts[k] = { lm: base, lo: base * 0.85, hi: base * 1.15 };
      });
      out.similar = H.samples().map(s => ({ s, score: (s.h.type === h.type ? 0 : 1000) + Math.abs(App.num(s.h.area) - App.num(h.area)) })).sort((a, b) => a.score - b.score).slice(0, 4).map(x => x.s);
      return out;
    }
  };

  const fmt = n => Math.round(n).toLocaleString('en-NZ');
  const r10 = n => Math.round(n / 10) * 10;
  H.sugHtml = est => {
    const sg = H.suggest(est);
    if (!sg) return `<p class="k">SUGGESTED METRES</p><p class="l">Put in the floor area to see suggested metres.</p>`;
    const R = H.rules();
    const basis = sg.n >= 3 ? `Based on ${sg.n} ${sg.basis === 'type' ? 'similar' : 'past'} job${sg.n === 1 ? '' : 's'} you've had detailed, scaled to this one` : 'Rough, from framing rules of thumb. It gets better as your jobs are detailed.';
    const sec = k => { const [s2, g] = R.keys[k].split('|'); return `${s2} ${g}`; };
    return `<p class="k">SUGGESTED METRES</p><p class="l">${basis}</p>
      ${PARTS.map(([k, l]) => { const p = sg.parts[k]; return `<div class="hs-row"><span><b>${l}</b><span>${p.lm ? sec(k) + ' BMT' : k === 'joists' ? 'none, slab floor' : k === 'trusses' ? 'no trusses' : ''}</span></span><span class="r"><b>${fmt(r10(p.lm))} LM</b>${p.lm ? `<span>range ${fmt(r10(p.lo))} to ${fmt(r10(p.hi))}</span>` : ''}</span></div>`; }).join('')}
      <div class="row-btns"><button class="btn primary" data-act="helperUse">Use these metres</button></div>
      <p class="hint" style="color:#8a939b">Fills the steel lines in the workings below, priced from Pricing. You can change them after.${est.helper && est.helper.used ? ` Last used ${App.fmtShort(App.iso(new Date(est.helper.used.at)))}.` : ''}</p>`;
  };
  H.simHtml = est => {
    const sg = H.suggest(est); const list = sg ? sg.similar : H.samples().slice(0, 4);
    if (!list.length) return '<p class="hint">Once jobs you\'ve priced with the helper are detailed, the closest ones show here and the suggestions learn from them.</p>';
    return `<table class="wtable"><thead><tr><th>Job</th><th class="r">Floor area</th><th class="r">Wall LM</th><th class="r">LM per m²</th><th class="r">Trusses</th></tr></thead><tbody>
      ${list.map(s => `<tr><td><a href="#/job/${s.est.id}"><b>${e(st.displayNumber(s.est))}</b></a><div class="hint">${e((TYPES.find(t => t[0] === s.h.type) || [, ''])[1])}, ${e(s.est.heading || '')}</div></td><td class="r">${fmt(s.h.area)} m²</td><td class="r"><b>${fmt(s.d.walls)}</b></td><td class="r">${(s.d.walls / App.num(s.h.area)).toFixed(1)}</td><td class="r">${fmt(s.d.trusses)}</td></tr>`).join('')}</tbody></table>`;
  };
  /* the helper card in My workings */
  H.card = est => {
    const h = H.inputs(est); const locked = App.Est.locked(est); const b = p => `data-bind="helper.${p}"`;
    const chip = (name, opts, cur) => `<div class="seg wrap">${opts.map(([v, l]) => `<label><input type="radio" name="hl-${name}" value="${v}" ${b(name)} data-rerender="1" ${String(cur) === String(v) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
    const num = (l, p, u, ph = '') => App.field(l, `<span class="unit-in"><input ${b(p)} data-type="num" inputmode="decimal" value="${e(h[p] ?? '')}" placeholder="${ph}" data-act-input="helperLive">${u ? `<em>${u}</em>` : ''}</span>`);
    const open = est.helper && est.helper.open !== false || (!est.workings.steel.some(r => App.num(r.lm)) && !locked);
    return `<details class="card helper" ${open ? 'open' : ''}><summary><h3 style="margin:0">Estimate helper</h3><span class="hint">Suggested metres from the plans, learning from your past jobs</span></summary>
      <fieldset ${locked ? 'disabled' : ''} class="helper-grid"><div class="helper-in">
        ${App.field('Type of job', `<select ${b('type')} data-rerender="1">${TYPES.map(([v, l]) => App.opt(v, l, h.type)).join('')}</select>`)}
        <div class="grid3">${num('Floor area', 'area', 'm²')}${num('Storeys', 'storeys', '', (TYPES.find(t => t[0] === h.type) || [])[2] || 1)}${num('Stud height', 'stud', 'm')}</div>
        <div class="grid2">${App.field('Roof', `<select ${b('roof')} data-rerender="1">${App.opts([{ value: 'trusses', label: 'Trusses' }, { value: 'none', label: 'No trusses' }], h.roof)}</select>`)}${num('Roof pitch', 'pitch', '°', /^house/.test(h.type) ? '22.5' : '15')}</div>
        ${App.field('Floor', chip('floor', [['slab', 'Concrete slab'], ['joists', 'Joists']], h.floor))}
        <p class="hint" style="margin:6px 0 4px"><b>Optional</b>, no measuring needed:</p>
        ${App.field('Shape', chip('shape', [['simple', 'Simple rectangle'], ['L', 'L-shape'], ['complex', 'Lots of corners']], h.shape))}
        ${/^house|cabin/.test(h.type) ? `<div class="grid2">${num('Bedrooms', 'bedrooms', '')}</div>` : ''}
        <details class="more-in"><summary>Wall lengths (only if you have them)</summary><div class="grid2">${num('External walls', 'ext', 'm')}${num('Internal walls', 'int', 'm')}</div></details>
      </div><div class="helper-sug" id="helper-sug">${H.sugHtml(est)}</div></fieldset>
      <h4 style="margin:16px 0 6px">Similar jobs you've done</h4><div id="helper-sim">${H.simHtml(est)}</div></details>`;
  };
  A.helperLive = App.debounce(() => { const est = App.cur; if (!est) return; const s = document.getElementById('helper-sug'); if (s) s.innerHTML = H.sugHtml(est); const m = document.getElementById('helper-sim'); if (m) m.innerHTML = H.simHtml(est); }, 150);
  A.helperToggle = el => { const est = App.cur; est.helper = Object.assign(H.inputs(est), est.helper || {}, { open: el.open }); };
  A.helperUse = async () => {
    const est = App.cur; const sg = H.suggest(est); if (!sg) return;
    const R = H.rules(); const tot = {};
    PARTS.forEach(([k]) => { const lm = r10(sg.parts[k].lm); if (lm) tot[R.keys[k]] = (tot[R.keys[k]] || 0) + lm; });
    const have = est.workings.steel.filter(r => App.num(r.lm));
    if (have.length && !(await App.confirm('Replace the steel metres?', `This sets ${Object.entries(tot).map(([k, v]) => `${k.replace('|', ' ')} to ${fmt(v)} LM`).join(', ')}. Other steel lines stay as they are.`, 'Use these metres'))) return;
    Object.entries(tot).forEach(([k, lm]) => App.Est.setSteel(est, k, lm));
    est.helper = Object.assign(H.inputs(est), est.helper || {}, { used: { walls: r10(sg.parts.walls.lm), trusses: r10(sg.parts.trusses.lm), joists: r10(sg.parts.joists.lm), at: Date.now(), n: sg.n } });
    st.log(est, `Estimate helper: ${fmt(est.helper.used.walls)} LM walls, ${fmt(est.helper.used.trusses)} LM trusses, ${fmt(est.helper.used.joists)} LM joists`);
    st.touch(est); st.save(); App.refresh(); App.toast('Steel metres filled in');
  };

  /* ---------- Estimated vs detailed (job, Back-costing) ---------- */
  H.costPer = key => { const p = App.Pricing && App.Pricing.get(key); return p ? p.cost : App.num(S().pricing.rates[key]); };
  H.compareHtml = est => {
    const d = H.detailed(est); const used = est.helper && est.helper.used;
    if (!d) return `<section class="card"><h3>Estimated vs detailed</h3><p class="hint">When the detailing comes in (Frames and deliveries, or the Detailing tab), this shows what you estimated next to what was detailed.</p></section>`;
    const R = H.rules(); const rows = [];
    if (used) PARTS.forEach(([k, l]) => { if (!used[k] && !d[k]) return; const diff = d[k] - used[k]; rows.push({ l, s: R.keys[k].replace('|', ' ') + ' BMT', est: used[k], det: d[k], diff, cost: diff * H.costPer(R.keys[k]) }); });
    else {
      const estBy = {}; (est.workings.steel || []).forEach(r => { const k = `${r.size}|${r.gauge}`; estBy[k] = (estBy[k] || 0) + App.num(r.lm); });
      const detBy = {}; Object.entries(d.byProfile || {}).forEach(([p, lm]) => { const sg = App.FC.profileToSection(p); if (sg) { const k = `${sg.size}|${sg.gauge}`; detBy[k] = (detBy[k] || 0) + lm; } });
      if (Object.keys(detBy).length) Object.keys(Object.assign({}, estBy, detBy)).forEach(k => { const a = estBy[k] || 0, b = detBy[k] || 0; rows.push({ l: k.split('|')[0], s: k.split('|')[1] + ' BMT', est: a, det: b, diff: b - a, cost: (b - a) * H.costPer(k) }); });
      else { const a = Object.values(estBy).reduce((t, v) => t + v, 0), b = d.walls + d.trusses + d.joists; rows.push({ l: 'All steel', s: 'the detailing has no profile tags, so this is the total', est: a, det: b, diff: b - a, cost: (b - a) * H.costPer('89x41|0.75') }); }
    }
    const te = rows.reduce((t, r) => t + r.est, 0), td = rows.reduce((t, r) => t + r.det, 0), tc = rows.reduce((t, r) => t + r.cost, 0);
    const pct = (a, b) => a ? (b - a) / a * 100 : 0;
    const cls = v => v > 0.5 ? 'neg' : v < -0.5 ? 'pos' : '';
    const track = H.track();
    return `<div class="evd"><section class="card" style="margin:0"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Estimated vs detailed</h3><span class="hint">${e(est.job.framesFrom || (est.job.detailed && est.job.detailed.file) || 'From the detailing')}</span></div>
      <div class="table-scroll"><table class="wtable" style="margin-top:10px"><thead><tr><th>Part</th><th class="r">Estimated</th><th class="r">Detailed</th><th class="r">Difference</th><th class="r">Effect on profit</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${e(r.l)}</b><div class="hint">${e(r.s)}</div></td><td class="r">${fmt(r.est)} LM</td><td class="r"><b>${fmt(r.det)} LM</b></td><td class="r ${cls(r.diff)}"><b>${r.diff > 0 ? '+' : ''}${fmt(r.diff)} LM</b><div class="small">${r.est ? (r.diff > 0 ? '+' : '') + Math.round(pct(r.est, r.det)) + '%' : ''}</div></td><td class="r ${cls(r.cost)}"><b>${r.cost > 0 ? '−' : r.cost < 0 ? '+' : ''}${App.money(Math.abs(r.cost), 0)}</b></td></tr>`).join('')}
      <tr class="tot"><td><b>Total</b></td><td class="r"><b>${fmt(te)} LM</b></td><td class="r"><b>${fmt(td)} LM</b></td><td class="r ${cls(td - te)}"><b>${td - te > 0 ? '+' : ''}${fmt(td - te)} LM (${te ? (td - te > 0 ? '+' : '') + Math.round(pct(te, td)) : 0}%)</b></td><td class="r ${cls(tc)}"><b>${tc > 0 ? '−' : tc < 0 ? '+' : ''}${App.money(Math.abs(tc), 0)}</b></td></tr></tbody></table></div>
      <p class="hint">"Effect on profit" is the steel cost of the difference, at your cost per metre from Pricing.${used ? '' : ' For a part-by-part comparison, use the Estimate helper on your next estimates.'}</p></section>
      <aside><section class="evd-big"><p class="k">ON THIS JOB</p><p class="v">${te ? (td - te > 0 ? '+' : '') + Math.round(pct(te, td)) + '%' : '-'}</p><p class="l">${td >= te ? 'more' : 'less'} steel than estimated, about ${App.money(Math.abs(tc), 0)} ${tc > 0 ? 'off' : 'on'} your profit</p></section>
      ${track.n ? `<section class="card" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Your track record</h3><span class="hint">${track.n} detailed job${track.n === 1 ? '' : 's'}</span></div>${track.rows.map(r => `<div class="kvr2"><span><b>${r.l}</b><span class="hint" style="display:block">${Math.abs(r.avg) < 3 ? 'usually close' : r.avg > 0 ? 'usually under-estimated' : 'usually over-estimated'}</span></span><b class="${Math.abs(r.avg) < 3 ? 'pos' : 'neg'}">${r.avg > 0 ? '+' : ''}${Math.round(r.avg)}% avg</b></div>`).join('')}${track.tip ? `<p class="hint">${e(track.tip)}</p>` : ''}</section>` : ''}</aside></div>`;
  };
  H.track = () => {
    const js = st.live().filter(x => x.job && x.helper && x.helper.used && H.detailed(x)); const rows = [];
    PARTS.forEach(([k, l]) => { const v = js.filter(x => x.helper.used[k] > 0).map(x => (H.detailed(x)[k] - x.helper.used[k]) / x.helper.used[k] * 100); if (v.length) rows.push({ l: l.replace('Wall framing', 'Walls').replace('Roof trusses', 'Trusses').replace('Floor joists', 'Joists'), avg: v.reduce((a, b) => a + b, 0) / v.length }); });
    const w = rows.find(r => r.l === 'Walls');
    return { n: js.length, rows, tip: w && Math.abs(w.avg) >= 4 ? `The helper already allows for this, so its suggestions move ${w.avg > 0 ? 'up' : 'down'} about ${Math.round(Math.abs(w.avg))}% on walls.` : '' };
  };
})();
