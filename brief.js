/* Morning brief: the first time you open the app after the brief time (9am by default) each day,
   it walks you through today, what to follow up, and anything that needs a look. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const key = () => `che-brief-${(st.me().email || 'me').toLowerCase()}-${App.today()}`;
  const rkey = () => key() + '-resume';
  const getR = () => { try { return JSON.parse(localStorage.getItem(rkey()) || 'null'); } catch (er) { return null; } };
  const setR = v => { if (v) localStorage.setItem(rkey(), JSON.stringify(v)); else localStorage.removeItem(rkey()); B.pill(); };
  const B = App.Brief = {
    started: false,
    hour() { const h = parseInt(S().brief && S().brief.hour, 10); return isNaN(h) ? 9 : h; },
    on() { return !(S().brief && S().brief.off); },
    async maybe() {
      B.pill();
      if (B.started || !st.data || !B.on() || App.state.practice) return;
      if (new Date().getHours() < B.hour() || localStorage.getItem(key())) return;
      B.started = true;
      await B.prepare();
      if (localStorage.getItem(key())) return;
      B.open();
    },
    /* make sure sales, coils and fasteners have loaded, but don't wait for ever */
    async prepare() {
      const jobs = [];
      if (App.Sales && App.Sales.ready()) jobs.push(App.Sales.load().catch(() => {}));
      if (App.Coil && App.Coil.ready()) jobs.push(App.Coil.load().catch(() => {}));
      if (App.Fast && App.Fast.ready()) jobs.push(App.Fast.load().catch(() => {}));
      await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 7000))]);
    },
    steps() {
      const today = App.today(), tom = App.addDays(today, 1);
      const jobs = App.Jobs ? App.Jobs.list() : [];
      const item = (t, s, href, act) => ({ t, s, href, act });
      /* 1. Today */
      const day = [];
      jobs.forEach(j => {
        (j.job.loads || []).forEach(l => { if (!l.delivered && (l.date === today || l.date === tom)) day.push(item(`${j.number} delivery ${l.n} of ${j.job.loads.length} ${l.date === today ? 'today' : 'tomorrow'}`, `${j.client.company || j.client.name}, ${j.siteAddress || ''}${l.docketAt ? '' : '. Docket not printed yet'}`, `#/job/${j.id}/deliveries`)); });
        if (j.job.manufactureDate === today || j.job.manufactureDate === tom) day.push(item(`${j.number} starts manufacture ${j.job.manufactureDate === today ? 'today' : 'tomorrow'}`, `${j.client.company || j.client.name}${j.job.frames.length ? '' : '. No frame list yet'}`, `#/job/${j.id}`));
      });
      (st.data.events || []).filter(x => !x.deleted && (x.date === today || x.date === tom)).forEach(x => day.push(item(x.title, x.date === today ? 'Today' : 'Tomorrow', '#/calendar')));
      /* 2. Follow up */
      const fu = [];
      (App.Accept ? App.Accept.needs() : []).forEach(a => fu.push(item(a.t, a.s, a.href)));
      const KL = { fu1: 'First follow-up ready to send', fu2: 'Second follow-up ready to send', expiry: 'Expiry reminder ready to send', review: 'Review request ready to send' };
      const due = App.Track ? App.Track.due() : [];
      due.forEach(d => fu.push(item(`${st.displayNumber(d.est)} ${d.est.client.company || d.est.client.name}`, `${KL[d.kind] || 'Email ready to send'}${d.est.openedAt ? ', they opened the estimate' : ''}`, '#/followups')));
      const SL = App.Sales;
      if (SL && SL.ready() && SL.S.loadedAt && !SL.S.error) {
        const w = SL.waiting(); if (w.length) fu.push(item(`${w.length} sales email${w.length === 1 ? '' : 's'} waiting for your approval`, w.slice(0, 3).map(m => m.company).join(', '), '#/sales', 'salesApprove'));
        const sm = SL.summary(); const me = SL.me().toLowerCase().split(' ')[0];
        sm.overdue.concat(sm.today).filter(c => !c.owner || c.owner.toLowerCase().split(' ')[0] === me).filter(c => c.followUpType !== 'revisit').slice(0, 8)
          .forEach(c => { const f = SL.fu(c); fu.push(item(`${f.kind}: ${c.company || SL.primary(c).name}`, `${f.label}${SL.primary(c).phone ? ', ' + SL.primary(c).phone : ''}`, `#/sales/c/${c.id}`)); });
      }
      st.live().filter(x => x.status === 'sent' && !x.practice && !x.archived && x.expiry >= today && x.expiry <= App.addDays(today, 3) && !due.some(d => d.est === x && d.kind === 'expiry'))
        .forEach(x => fu.push(item(`${st.displayNumber(x)} expires ${App.fmtDate(x.expiry, { weekday: 'long' })}`, `${x.client.company || x.client.name}, ${App.money(st.totals(x).sub, 0)}`, `#/e/${x.id}`)));
      /* 3. Needs a look */
      const look = [];
      (App.Jobs ? App.Jobs.attention() : []).forEach(a => look.push(item(a.t, a.s, a.href)));
      (App.Safety ? App.Safety.needs() : []).concat(App.Maint ? App.Maint.needs() : []).forEach(a => look.push(item(a.t, a.s, a.href)));
      if (App.Fast && App.Fast.S.loadedAt && !App.Fast.S.error) { const low = App.Fast.low(); if (low.length) look.push(item(`${low.length} fastener${low.length === 1 ? '' : 's'} to reorder`, low.map(i => i.name).join(', '), '#/fasteners')); }
      if (App.Coil && App.Coil.ready() && App.Coil.S.loadedAt) App.Coil.summary().low.forEach(x => look.push(item(`${App.Coil.bmt(x.t)} BMT coils running low`, `${x.n} left in stock`, '#/coils')));
      if (App.Pricing) { const sp = App.Pricing.stale(); if (sp.length) look.push(item(`${sp.length} estimate${sp.length === 1 ? '' : 's'} priced with old steel prices`, sp.slice(0, 3).map(x => st.displayNumber(x)).join(', '), '#/pricing')); }
      /* 4. Yesterday's numbers */
      const yest = App.addDays(today, -1); const real = st.live().filter(x => !x.practice);
      const sentY = real.filter(x => x.sentDate === yest), wonY = real.filter(x => x.acceptedAt === yest);
      return [
        { k: 'today', t: 'Today and tomorrow', empty: 'Nothing booked for today or tomorrow.', items: day },
        { k: 'fu', t: 'To follow up', empty: 'Nothing to follow up today.', items: fu },
        { k: 'look', t: 'Needs a look', empty: 'Nothing needs a look.', items: look },
        { k: 'num', t: 'Yesterday', nums: [['Estimates sent', sentY.length, App.money(sentY.reduce((t, x) => t + st.totals(x).sub, 0), 0)], ['Jobs won', wonY.length, App.money(wonY.reduce((t, x) => t + st.totals(x).sub, 0), 0)], ['Waiting on a reply', real.filter(x => x.status === 'sent' && !x.archived).length, App.money(real.filter(x => x.status === 'sent' && !x.archived).reduce((t, x) => t + st.totals(x).sub, 0), 0)]] }
      ];
    },
    open(force) {
      const steps = B.steps(); const R = getR() || { step: 0, done: [] }; let i = Math.min(R.step || 0, steps.length - 1);
      const isDone = it => (R.done || []).includes(it.t);
      const hr = new Date().getHours(); const hi = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      const total = steps.reduce((t, s) => t + (s.items ? s.items.length : 0), 0);
      const m = App.modal(`${hi}, ${e((st.me().name || '').split(' ')[0])}`, '<div id="brief-body"></div>', { wide: true, actions: '<button class="btn ghost" id="br-skip">Skip the brief</button><button class="btn" id="br-back">Back</button><button class="btn primary" id="br-next">Next</button>' });
      m.classList.add('brief-modal');
      const draw = () => {
        const s = steps[i];
        const dots = `<div class="br-dots">${steps.map((x, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}">${e(x.t)}${x.items && x.items.length ? ` <em>${x.items.length}</em>` : ''}</span>`).join('')}</div>`;
        let body = '';
        if (s.nums) body = `<div class="br-nums">${s.nums.map(([l, n, v]) => `<div><p>${l}</p><b>${n}</b><span>${v}</span></div>`).join('')}</div><p class="hint" style="margin-top:14px">That's everything${total ? `: ${total} thing${total === 1 ? '' : 's'} on the list today` : ''}. You can open the brief again any time from the home page.</p>`;
        else body = s.items.length ? `<div class="br-list">${s.items.map((x, k) => `<a class="br-item ${isDone(x) ? 'done' : ''}" href="${x.href}" data-k="${k}"><span><b>${isDone(x) ? '✓ ' : ''}${e(x.t)}</b><span class="hint">${e(x.s || '')}</span></span><span class="br-go">${isDone(x) ? 'Open again' : 'Open'}</span></a>`).join('')}</div>` : `<p class="br-empty">${s.empty}</p>`;
        m.querySelector('#brief-body').innerHTML = `${i === 0 ? `<p class="hint" style="margin:0 0 12px">${App.fmtDate(App.today(), { weekday: 'long', day: 'numeric', month: 'long' })}. Here's your day.</p>` : ''}${dots}<h3 class="br-h">${e(s.t)}</h3>${body}`;
        m.querySelectorAll('.br-item').forEach(a => a.onclick = ev => {
          const it = s.items[+a.dataset.k]; B.done();
          /* remember where you were, so the "Back to the brief" button can bring you back here */
          const done = new Set(R.done || []); done.add(it.t); R.done = [...done]; R.step = i; setR(R);
          App.closeModal(); if (it.act && A[it.act]) { ev.preventDefault(); location.hash = it.href; setTimeout(() => A[it.act](), 400); } });
        m.querySelector('#br-back').disabled = i === 0;
        m.querySelector('#br-next').textContent = i === steps.length - 1 ? 'Done' : 'Next';
      };
      m.querySelector('#br-next').onclick = () => { if (i === steps.length - 1) { B.done(); setR(null); App.closeModal(); App.toast('Have a good day'); } else { i++; if (getR()) { R.step = i; setR(R); } draw(); } };
      m.querySelector('#br-back').onclick = () => { if (i > 0) { i--; if (getR()) { R.step = i; setR(R); } draw(); } };
      m.querySelector('#br-skip').onclick = () => { B.done(); setR(null); App.closeModal(); };
      const pill = document.getElementById('brief-pill'); if (pill) pill.hidden = true;
      const obs = new MutationObserver(() => { if (!document.body.contains(m)) { obs.disconnect(); B.pill(); } }); obs.observe(document.getElementById('modal-root') || document.body, { childList: true, subtree: true });
      draw();
    },
    done() { localStorage.setItem(key(), '1'); },
    /* floating "Back to the brief" button while you're working through it */
    pill() {
      let p = document.getElementById('brief-pill'); const R = st.data ? getR() : null;
      if (!R || document.querySelector('.brief-modal')) { if (p) p.hidden = true; return; }
      const left = B.steps().reduce((t, s) => t + (s.items || []).filter(x => !(R.done || []).includes(x.t)).length, 0);
      if (!p) { p = document.createElement('div'); p.id = 'brief-pill'; document.body.appendChild(p); }
      p.hidden = false;
      p.innerHTML = `<button class="bp-go" data-act="briefResume"><b>Morning brief</b><span>${left ? `${left} thing${left === 1 ? '' : 's'} left` : 'all done'}. Back to it</span></button><button class="bp-x" data-act="briefPillClose" aria-label="Finish the brief">✕</button>`;
    }
  };
  A.briefOpen = async () => { await B.prepare(); B.open(true); };
  A.briefResume = () => B.open(true);
  A.briefPillClose = () => setR(null);
})();
