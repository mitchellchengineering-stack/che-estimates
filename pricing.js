/* Pricing: the lineal metre profit calculator, one tab per machine.
   It works out cost per metre (steel + overheads + labour) and the sell price at your machine margin,
   and those are the prices the estimates use for the steel you make, so it isn't marked up twice. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const money = v => App.money(v);
  const PERIOD = { week: 1, month: 52 / 12, year: 52 };

  const P = App.Pricing = {
    machines() { return S().machines || []; },
    tab: 0,
    /* every section and gauge a machine can make */
    options(m) { return (m.sections || []).flatMap(sec => (App.GAUGES[sec] || []).map(g => `${sec}|${g}`)); },
    calc(m, gauge) {
      const bmt = Number(gauge); const scrap = 1 + App.num(m.scrapPct) / 100;
      const kg = App.num(m.coilWidth) / 1000 * bmt / 1000 * (App.num(m.density) || 7850) * scrap;
      const steel = kg * App.num(m.pricePerTonne) / 1000;
      const out = App.num(m.output);
      const oh = out ? App.num(m.overhead) / out : 0;
      const lab = out ? App.num(m.operators) * App.num(m.ratePerOperator) / out : 0;
      const cost = steel + oh + lab; const pct = App.num(m.marginPct) / 100;
      const sell = m.marginType === 'markup' ? cost * (1 + pct) : (pct < 1 ? cost / (1 - pct) : cost);
      return { kg, steel, oh, lab, cost, sell, profit: sell - cost, markupPct: cost ? (sell / cost - 1) * 100 : 0, marginPct: sell ? (sell - cost) / sell * 100 : 0 };
    },
    /* key 'section|gauge' -> price, from whichever machine makes it */
    list() {
      const out = {};
      P.machines().forEach(m => (m.products || []).forEach(k => { if (out[k]) return; const g = k.split('|')[1]; out[k] = Object.assign({ machine: m.name, key: k }, P.calc(m, g)); }));
      return out;
    },
    get(key) { return P.list()[key] || null; },
    markupFor(key) { const p = P.get(key); return p ? App.round(p.markupPct, 2) : null; },
    /* Write the calculated prices into the rates the estimates use */
    sync() {
      const pr = S().pricing; const list = P.list(); let changed = false;
      pr.rates = pr.rates || {}; pr.steelMarkup = pr.steelMarkup || {};
      Object.values(list).forEach(p => {
        const cost = App.round(p.cost, 4), mk = App.round(p.markupPct, 2);
        if (pr.rates[p.key] !== cost || pr.steelMarkup[p.key] !== mk) { pr.rates[p.key] = cost; pr.steelMarkup[p.key] = mk; changed = true; }
      });
      if (changed) pr.ratesUpdatedAt = Date.now();
      return changed;
    },
    /* Open estimates whose steel lines don't match the current prices */
    stale() {
      const list = P.list();
      return st.live().filter(x => !x.archived && ['draft', 'sent'].includes(x.status) && (x.workings.steel || []).some(r => {
        const p = list[`${r.size}|${r.gauge}`]; if (!p || !App.num(r.lm)) return false;
        return Math.abs(App.num(r.rate) - p.cost) > 0.005 || Math.abs(App.num(r.markupPct) - p.markupPct) > 0.05;
      }));
    },
    reprice(est) {
      const list = P.list();
      (est.workings.steel || []).forEach(r => { const p = list[`${r.size}|${r.gauge}`]; if (p) { r.rate = App.round(p.cost, 4); r.markupPct = App.round(p.markupPct, 2); delete r.markup; } });
      if (est.workings.pricedAt) { const c = st.calc(est); est.price = App.round(c.main, 2); est.workings.pricedAt = Date.now(); }
    },
    /* What a job makes, split by type of line */
    profit(est) {
      const w = est.workings || {}; const by = { made: [0, 0], bought: [0, 0], labour: [0, 0], delivery: [0, 0] };
      (w.steel || []).forEach(r => { const c = st.steelCost(r); by.made[0] += c; by.made[1] += c * st.lineMk(r, est); });
      (w.lines || []).forEach(l => { if (l.bucket === 'option') return; const c = st.lineCost(l); const k = l.kind === 'labour' ? 'labour' : l.kind === 'delivery' ? 'delivery' : 'bought'; by[k][0] += c; by[k][1] += c * st.lineMk(l, est); });
      const cost = Object.values(by).reduce((t, x) => t + x[0], 0); const workSell = Object.values(by).reduce((t, x) => t + x[1], 0);
      const t = st.totals(est); const varSell = App.Var ? App.Var.total(est) : 0, varCost = App.Var ? App.Var.cost(est) : 0;
      const sell = (t.sub || workSell) + varSell;
      const costAll = cost + varCost;
      return { by, cost: costAll, workSell, sell, adjust: t.sub ? t.sub - workSell : 0, varSell, profit: sell - costAll, margin: sell ? (sell - costAll) / sell : 0 };
    }
  };

  /* ---------- Pricing page ---------- */
  const fld = (label, path, val, unit, attrs = '') => `<label class="fld"><span>${label}</span><span class="unit-in"><input data-bind="${path}" data-type="num" value="${e(val ?? '')}" inputmode="decimal" data-act-input="prLive" ${attrs}>${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  const seg = (name, path, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" data-bind="${path}" data-rerender="1" ${cur === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  P.panelHtml = (m, i) => {
    const gauges = (m.products || []).map(k => k.split('|')); const sel = m.view && m.products.includes(m.view) ? m.view : (m.products.find(k => k.endsWith('|0.75')) || m.products[0]);
    if (!sel) return '<p class="hint" style="color:#c9ced3">Pick the sections and gauges this machine makes.</p>';
    const [sec, g] = sel.split('|'); const c = P.calc(m, g);
    const per = PERIOD[m.period || 'week']; const wk = App.num(m.output) / per;
    const span = (v, col) => `<span style="width:${c.sell ? Math.max(0, v / c.sell * 100) : 0}%;background:${col}"></span>`;
    const mt = n => App.money(n, 0);
    return `<p class="k">${e(m.name)} · ${e(m.coilWidth)}mm coil · ${e(sec)} ${e(g)} BMT</p>
      <p class="l">Sell price per lineal metre</p><p class="big">${money(c.sell)}<span> / LM</span></p>
      <p class="l">Costs you ${money(c.cost)}, you make <b class="pos">${money(c.profit)}</b> a metre (${App.round(c.marginPct, 1)}% of the sell price, ${App.round(c.markupPct, 1)}% on cost)</p>
      <div class="pr-bar">${span(c.steel, '#8a939b')}${span(c.oh, '#5c636b')}${span(c.lab, '#c4cacf')}${span(c.profit, 'var(--yellow)')}</div>
      <div class="pr-legend"><span><i style="background:#8a939b"></i>Steel ${money(c.steel)}</span><span><i style="background:#5c636b"></i>Overheads ${money(c.oh)}</span><span><i style="background:#c4cacf"></i>Labour ${money(c.lab)}</span><span><i style="background:var(--yellow)"></i>Profit ${money(c.profit)}</span></div>
      <table class="pr-t"><thead><tr><th>${(m.sections || []).length > 1 ? 'Section' : 'BMT'}</th><th class="r">Weight</th><th class="r">Steel</th><th class="r">Cost</th><th class="r">Sell</th><th class="r">Profit</th></tr></thead><tbody>
      ${gauges.map(([s2, g2]) => { const x = P.calc(m, g2); return `<tr class="${`${s2}|${g2}` === sel ? 'on' : ''}" data-act="prView" data-i="${i}" data-k="${e(s2)}|${e(g2)}"><td><b>${(m.sections || []).length > 1 ? e(s2.replace('Top hat ', '')) + ' ' : ''}${e(g2)}</b></td><td class="r">${x.kg.toFixed(3)} kg</td><td class="r">${money(x.steel)}</td><td class="r">${money(x.cost)}</td><td class="r y">${money(x.sell)}</td><td class="r pos">${money(x.profit)}</td></tr>`; }).join('')}</tbody></table>
      <div class="pr-time"><b>This machine over time, at ${e(g)} BMT</b><div class="g"><span></span><b>Week</b><b>Month</b><b>Year</b>
        ${[['Metres made', 1, false], ['Sales', c.sell, true], ['Total cost', c.cost, true], ['Profit', c.profit, true]].map(([l, mult, isM]) => `<span class="l">${l}</span>${[1, 52 / 12, 52].map(f => `<span class="${l === 'Profit' ? 'pos' : ''}">${isM ? mt(wk * f * mult) : Math.round(wk * f).toLocaleString('en-NZ')}</span>`).join('')}`).join('')}</div></div>`;
  };
  P.allHtml = () => {
    const list = Object.values(P.list()).sort((a, b) => App.SECTIONS.indexOf(a.key.split('|')[0]) - App.SECTIONS.indexOf(b.key.split('|')[0]) || a.key.localeCompare(b.key));
    return `<table class="wtable"><thead><tr><th>Section</th><th>Gauge</th><th>Machine</th><th class="r">Cost / LM</th><th class="r">Sell / LM</th><th class="r">Profit / LM</th></tr></thead><tbody>
      ${list.map(p => { const [s2, g2] = p.key.split('|'); return `<tr><td><b>${e(s2)}</b></td><td>${e(g2)} BMT</td><td class="hint">${e(p.machine)}</td><td class="r">${money(p.cost)}</td><td class="r"><b>${money(p.sell)}</b></td><td class="r pos">${money(p.profit)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="hint">No machines set up yet.</td></tr>'}</tbody></table>`;
  };
  App.views.pricing = () => {
    App.cur = S();
    const ms = P.machines(); if (P.tab >= ms.length) P.tab = 0;
    const i = P.tab; const m = ms[i]; const base = `machines.${i}`;
    const stale = P.stale();
    const head = `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Cost and sell price per lineal metre, for every machine</p><h1>Pricing</h1></div>
      <div class="head-actions"><button class="btn" data-act="prAdd">+ Add a machine</button></div></div>`;
    const banner = stale.length ? `<div class="banner warn pr-stale"><span><b>${stale.length} open estimate${stale.length === 1 ? ' was' : 's were'} priced with different steel prices.</b> ${e(stale.slice(0, 4).map(x => st.displayNumber(x)).join(', '))}${stale.length > 4 ? '…' : ''}</span><button class="btn small dark" data-act="prStale">Review and update them</button></div>` : '';
    if (!m) return head + '<div class="empty"><h2>No machines yet</h2><button class="btn primary" data-act="prAdd">+ Add a machine</button></div>';
    const opts = P.options(m);
    const coilChips = [...new Set(ms.map(x => App.num(x.coilWidth)).filter(Boolean))].sort((a, b) => b - a);
    return head + banner + `
    <div class="seg wrap" style="margin-bottom:16px">${ms.map((x, k) => `<label><input type="radio" name="prm" value="${k}" data-act-change="prTab" ${k === i ? 'checked' : ''}><span>${e(x.name)}</span></label>`).join('')}</div>
    <div class="pr-cols">
      <div class="pr-left">
        <section class="card"><h3><span class="num-b">1</span>Steel</h3><p class="hint">The coil this machine runs, and what you pay for it.</p>
          <div class="grid2">${App.field('Machine name', `<input data-bind="${base}.name" value="${e(m.name)}" data-rerender-blur="1">`)}${fld('Coil width', `${base}.coilWidth`, m.coilWidth, 'mm')}</div>
          <div class="chips-row">${coilChips.map(w => `<button class="chip ${App.num(m.coilWidth) === w ? 'on' : ''}" data-act="prCoil" data-w="${w}">${w}mm</button>`).join('')}</div>
          <div class="fld"><span>What this machine makes</span><div class="chips-row">${App.SECTIONS.map(sec => `<label class="chip ${(m.sections || []).includes(sec) ? 'on' : ''}"><input type="checkbox" data-act-change="prSection" data-s="${e(sec)}" ${(m.sections || []).includes(sec) ? 'checked' : ''}>${e(sec)}</label>`).join('')}</div></div>
          <div class="fld"><span>Gauges it runs</span><div class="chips-row">${opts.map(k => { const [s2, g2] = k.split('|'); const on = (m.products || []).includes(k); return `<label class="chip ${on ? 'on' : ''}"><input type="checkbox" data-act-change="prProduct" data-k="${e(k)}" ${on ? 'checked' : ''}>${(m.sections || []).length > 1 ? e(s2.replace('Top hat ', '')) + ' ' : ''}${e(g2)} BMT</label>`; }).join('')}</div></div>
          <div class="grid3">${fld('Steel cost', `${base}.pricePerTonne`, m.pricePerTonne, '$ / tonne')}${fld('Scrap and waste', `${base}.scrapPct`, m.scrapPct, '%')}${fld('Steel density', `${base}.density`, m.density, 'kg/m³')}</div></section>
        <section class="card"><h3><span class="num-b">2</span>Overheads</h3><p class="hint">Rent, power, insurance and maintenance, spread over what this machine makes.</p>
          ${seg('prp', `${base}.period`, [['week', 'Per week'], ['month', 'Per month'], ['year', 'Per year']], m.period || 'week')}
          <div class="grid2" style="margin-top:12px">${fld('Overheads', `${base}.overhead`, m.overhead, `$ / ${m.period || 'week'}`)}${fld('Machine output', `${base}.output`, m.output, `LM / ${m.period || 'week'}`)}</div></section>
        <section class="card"><h3><span class="num-b">3</span>Labour</h3><p class="hint">People running this machine over the same period.</p>
          <div class="grid2">${fld('Operators', `${base}.operators`, m.operators, '')}${fld('Cost per operator', `${base}.ratePerOperator`, m.ratePerOperator, `$ / ${m.period || 'week'}`)}</div></section>
        <section class="card"><h3><span class="num-b">4</span>Margin</h3><p class="hint">What you make on every metre this machine produces. Estimates use this, and don't add another markup on top.</p>
          ${seg('prmt', `${base}.marginType`, [['margin', 'Margin on sell price'], ['markup', 'Markup on cost']], m.marginType || 'margin')}
          <div class="grid2" style="margin-top:12px">${fld(m.marginType === 'markup' ? 'Markup' : 'Margin', `${base}.marginPct`, m.marginPct, '%')}<p class="hint" id="pr-eq" style="align-self:end">${P.eqText(m)}</p></div></section>
      </div>
      <aside class="pr-panel" id="pr-panel">${P.panelHtml(m, i)}</aside>
    </div>
    <section class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Every section at a glance</h3><span class="hint">These are the prices your estimates use for the steel you make</span></div><div id="pr-all" style="margin-top:10px">${P.allHtml()}</div></section>`;
  };
  P.eqText = m => { const p = App.num(m.marginPct); if (!p) return ''; return m.marginType === 'markup' ? `A ${p}% markup is a ${App.round(p / (100 + p) * 100, 1)}% margin` : (p < 100 ? `A ${p}% margin is a ${App.round(p / (100 - p) * 100, 1)}% markup` : ''); };
  App.views.pricing.mount = () => { if (P.sync()) st.save(); };
  P.live = () => {
    if (P.sync()) st.save();
    const m = P.machines()[P.tab]; if (!m) return;
    const panel = document.getElementById('pr-panel'); if (panel) panel.innerHTML = P.panelHtml(m, P.tab);
    const all = document.getElementById('pr-all'); if (all) all.innerHTML = P.allHtml();
    const eq = document.getElementById('pr-eq'); if (eq) eq.textContent = P.eqText(m);
  };
  A.prLive = App.debounce(() => P.live(), 120);
  A.prTab = el => { P.tab = +el.value; App.refresh(); };
  A.prView = el => { P.machines()[+el.dataset.i].view = el.dataset.k; P.live(); };
  const touch = () => { S().updatedAt = Date.now(); st.touch(S()); P.sync(); st.save(); App.refresh(); };
  A.prCoil = el => { P.machines()[P.tab].coilWidth = +el.dataset.w; touch(); };
  A.prSection = el => {
    const m = P.machines()[P.tab]; m.sections = m.sections || []; m.products = m.products || [];
    if (el.checked) { m.sections.push(el.dataset.s); (App.GAUGES[el.dataset.s] || []).forEach(g => m.products.push(`${el.dataset.s}|${g}`)); }
    else { m.sections = m.sections.filter(s => s !== el.dataset.s); m.products = m.products.filter(k => !k.startsWith(el.dataset.s + '|')); }
    touch();
  };
  A.prProduct = el => { const m = P.machines()[P.tab]; m.products = (m.products || []).filter(k => k !== el.dataset.k); if (el.checked) m.products.push(el.dataset.k); touch(); };
  A.prAdd = async () => {
    const name = await App.prompt('Name the machine', 'e.g. 100mm C-section'); if (!name) return;
    const base = P.machines()[0] || {};
    S().machines.push({ id: App.uid(), name, sections: [], products: [], coilWidth: '', pricePerTonne: base.pricePerTonne || 1450, scrapPct: 5, density: 7850, period: 'week', overhead: base.overhead || 0, output: base.output || 0, operators: base.operators || 1, ratePerOperator: base.ratePerOperator || 0, marginType: 'margin', marginPct: base.marginPct || 25 });
    P.tab = S().machines.length - 1; touch();
  };
  A.prDel = async el => { const i = +el.dataset.i; const m = P.machines()[i]; if (!(await App.confirm(`Remove ${m.name}?`, 'Its prices come off the price list and the Pricing page. Estimates already priced keep their numbers. This can\'t be undone.', 'Remove machine'))) return; S().machines.splice(i, 1); P.tab = 0; S().updatedAt = Date.now(); st.touch(S()); P.sync(); st.save(); App.refresh(); };
  A.prStale = () => {
    const list = P.stale();
    const m = App.modal('Update estimates to the new steel prices', `<p class="hint">Drafts are ticked. Sent estimates aren't, because the client already has that price. Tick one if you want to re-price it anyway.</p>
      <div class="table-scroll"><table class="wtable"><thead><tr><th></th><th>Estimate</th><th>Status</th><th class="r">Price now</th><th class="r">With new prices</th></tr></thead><tbody>
      ${list.map(x => { const copy = App.clone(x); P.reprice(copy); copy.workings.pricedAt = x.workings.pricedAt; const nw = x.workings.pricedAt ? st.calc(copy).main + st.totals(x).extras : null;
        return `<tr><td><input type="checkbox" class="ps-up" value="${x.id}" ${x.status === 'draft' ? 'checked' : ''} style="width:20px;height:20px"></td><td><b>${e(st.displayNumber(x))}</b><div class="hint">${e(x.client.company || x.client.name)}</div></td><td>${App.statusLabel ? App.statusLabel(x.status) : e(x.status)}</td><td class="r">${App.money(st.totals(x).sub, 0)}</td><td class="r"><b>${nw == null ? 'Workings only' : App.money(nw, 0)}</b></td></tr>`; }).join('')}</tbody></table></div>`,
      { wide: true, actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="ps-go">Update the ticked ones</button>' });
    m.querySelector('#ps-go').onclick = () => {
      const ids = [...m.querySelectorAll('.ps-up:checked')].map(c => c.value);
      ids.forEach(id => { const x = st.get(id); P.reprice(x); st.log(x, 'Steel re-priced from the Pricing page'); st.touch(x); });
      st.save(); App.closeModal(); App.toast(`${ids.length} estimate${ids.length === 1 ? '' : 's'} updated`); App.refresh();
    };
  };
})();
