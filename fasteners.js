/* Fasteners: a live, read-only view of the stock app's Google Sheet (Items and Log tabs). */
(() => {
  const e = App.esc, A = App.actions, st = App.store;
  const F = App.Fast = {
    S: { items: [], log: [], loadedAt: 0, error: '', loading: null, search: '' },
    cfg() { return st.s().fasteners || {}; },
    ready() { return st.mode === 'drive' && !!this.cfg().sheetId; },
    async load(force) {
      if (!this.ready()) return false;
      if (!force && this.S.loadedAt && Date.now() - this.S.loadedAt < 120000) return false;
      if (this.S.loading) return this.S.loading;
      this.S.loading = (async () => {
        try {
          const [items, log] = await App.G.sheetValues(this.cfg().sheetId, ['Items!A2:D', 'Log!A2:F']);
          this.S.items = items.filter(r => String(r[0] || '').trim()).map(r => ({ name: String(r[0]), qty: Number(r[1]) || 0, min: Number(r[2]) || 0, updated: r[3] || '' })).sort((a, b) => a.name.localeCompare(b.name));
          this.S.log = log.filter(r => r[0]).map(r => ({ time: String(r[0]), action: String(r[1] || ''), item: String(r[2] || ''), qty: Number(r[3]) || 0, person: String(r[4] || ''), after: r[5] })).reverse();
          this.S.loadedAt = Date.now(); this.S.error = '';
          return true;
        } catch (er) {
          this.S.error = /permission|403|404/i.test(er.message) ? 'Couldn\'t open the fastener sheet. Make sure it\'s shared with your Google account, and that you\'ve signed in again since the update.' : er.message;
          this.S.loadedAt = Date.now(); return true;
        } finally { this.S.loading = null; }
      })();
      return this.S.loading;
    },
    low() { return this.S.items.filter(i => i.qty <= i.min); },
    when(t) { const d = new Date(String(t).replace(' ', 'T')); if (isNaN(d)) return t; const today = App.today(); const iso = App.iso(d); return iso === today ? d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) : iso === App.addDays(today, -1) ? 'Yesterday' : App.fmtShort(iso); },
    usedThisMonth() {
      const m = App.today().slice(0, 7); const tot = {};
      this.S.log.filter(l => l.action === 'Sign out' && l.time.slice(0, 7) === m).forEach(l => tot[l.item] = (tot[l.item] || 0) + l.qty);
      return Object.entries(tot).sort((a, b) => b[1] - a[1]);
    },
    ago() { if (!this.S.loadedAt) return ''; const m = Math.round((Date.now() - this.S.loadedAt) / 60000); return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : m + ' minutes ago'; }
  };

  App.views.fasteners = () => {
    const S = F.S; const cfg = F.cfg();
    const head = `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Live from your stock app${S.loadedAt && !S.error ? '. Updated ' + F.ago() : ''}</p><h1>Fasteners</h1></div>
      <div class="head-actions"><button class="btn" data-act="fastRefresh">Refresh</button>${cfg.appUrl ? `<a class="btn primary" href="${e(cfg.appUrl)}" target="_blank" rel="noopener">Open the stock app</a>` : ''}</div></div>`;
    if (st.mode !== 'drive') return head + '<div class="empty"><h2>Connect Google to see fastener stock</h2><p>The fastener figures come from the stock app\'s Google Sheet.</p></div>';
    if (!cfg.sheetId) return head + '<div class="empty"><h2>No fastener sheet set</h2><a class="btn" href="#/settings/stock">Add it in Settings</a></div>';
    if (!S.loadedAt) return head + '<p class="hint pad">Loading fastener stock…</p>';
    if (S.error) return head + `<div class="banner warn">${e(S.error)}</div>`;
    const low = F.low(); const q = S.search.toLowerCase();
    const items = S.items.filter(i => !q || i.name.toLowerCase().includes(q));
    const most = F.usedThisMonth().slice(0, 6);
    return head + `
    ${low.length ? `<section style="margin-bottom:18px"><h3 style="display:flex;gap:10px;align-items:center">Below minimum, reorder these <span class="tag" style="background:var(--red-bg);color:var(--red)">${low.length}</span></h3>
      <div class="lowcards">${low.map(i => `<div class="lowcard"><p class="n">${e(i.name)}</p><p class="q">${i.qty} <span>left, min ${i.min}</span></p></div>`).join('')}</div></section>` : '<div class="banner" style="background:var(--green-bg);border-color:transparent">Everything is above its minimum.</div>'}
    <div class="ed-cols">
      <section class="card ed-main" style="margin:0"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Stock</h3><span class="hint">${S.items.length} items</span></div>
        <input type="search" id="fast-q" style="margin:12px 0" placeholder="Search items" value="${e(S.search)}" data-act-input="fastSearch">
        <div class="table-scroll"><table class="wtable"><thead><tr><th>Item</th><th class="r">In stock</th><th class="r">Minimum</th><th>Level</th><th>Status</th></tr></thead><tbody>
        ${items.map(i => { const lo = i.qty <= i.min; const pct = Math.min(100, i.min ? i.qty / (i.min * 3) * 100 : 100);
          return `<tr class="${lo ? 'low' : ''}"><td><b>${e(i.name)}</b></td><td class="r"><b class="${lo ? 'neg' : ''}">${i.qty}</b></td><td class="r hint">${i.min}</td><td style="width:32%"><div class="lvl ${lo ? 'lo' : ''}"><i style="width:${pct}%"></i></div></td><td>${lo ? '<span class="tag" style="background:var(--red-bg);color:var(--red)">Reorder</span>' : '<span class="tag ok">OK</span>'}</td></tr>`; }).join('')}</tbody></table></div></section>
      <aside class="card ed-side" style="margin:0"><h3>Recent activity</h3>
        ${S.log.slice(0, 12).map(l => `<div class="actrow"><span><b>${e(l.item)}</b><span class="hint">${e(l.action)}${l.person ? ' by ' + e(l.person) : ''}, ${e(F.when(l.time))}</span></span><b class="${l.action === 'Sign in' ? 'pos' : ''}">${l.action === 'Sign out' ? '-' : l.action === 'Sign in' ? '+' : ''}${l.qty}</b></div>`).join('') || '<p class="hint">No activity yet.</p>'}
        ${most.length ? `<h4>Most used this month</h4>${most.map(([n, q]) => `<div class="kvr2"><span>${e(n)}</span><b>${q}</b></div>`).join('')}` : ''}
      </aside>
    </div>`;
  };
  App.views.fasteners.mount = async () => { const need = !F.S.loadedAt; const ch = await F.load(); if ((need || ch) && App.route().name === 'fasteners') App.refresh(); };
  A.fastRefresh = async () => { await F.load(true); App.refresh(); App.toast('Fastener stock updated'); };
  A.fastSearch = App.debounce(el => { F.S.search = el.value; App.refresh(); const i = document.getElementById('fast-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
})();
