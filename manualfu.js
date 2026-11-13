/* Manual follow-ups: for anything not sent through the app (plans you emailed someone, a chat on site).
   On the day it shows on Needs you and the morning brief, with an email already written. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const col = () => (st.data.manualfu = st.data.manualfu || []);
  const MF = App.ManualFU = {
    open() { return col().filter(x => !x.deleted && x.status !== 'done').sort((a, b) => String(a.due).localeCompare(String(b.due))); },
    due() { return MF.open().filter(x => x.due <= App.today()); },
    mine(x) { return !x.owner || x.owner === st.me().email; },
    needs() { return MF.due().filter(MF.mine).map(x => ({ lvl: 'amber', t: `Follow up ${x.name}${x.company ? ', ' + x.company : ''}`, s: x.about, b: 'Follow-ups', href: '#/followups' })); },
    tpl(x) {
      const t = (S().emails.templates || {}).manual || { subject: 'Following up: {about}', body: 'Hi {first_name},\n\nJust following up on {about}.\n\nCheers,' };
      const v = { first_name: (x.name || '').split(' ')[0] || 'there', name: x.name || '', company: x.company || '', about: x.about || '' };
      const f = s2 => String(s2 || '').replace(/\{(\w+)\}/g, (m, k) => v[k] !== undefined ? v[k] : m);
      return { subject: f(t.subject), body: f(t.body) };
    }
  };
  MF.section = () => {
    const list = MF.open();
    return `<section class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Your own follow-ups</h3><button class="btn small primary" data-act="mfAdd">+ Add a follow-up</button></div>
      <p class="hint">For anything not sent through the app, like plans you emailed someone. On the day, it shows on Needs you with an email already written.</p>
      ${list.length ? list.map(x => { const d = App.daysBetween(App.today(), x.due); return `<div class="alert"><span class="dotbar ${d < 0 ? 'red' : d === 0 ? 'amber' : 'blue'}"></span><span class="txt"><b>${e(x.name)}${x.company ? ', ' + e(x.company) : ''}</b><span>${e(x.about)} · ${d < 0 ? `overdue ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'due today' : 'due ' + App.fmtShort(x.due)}${x.owner && x.owner !== st.me().email ? ' · ' + e((S().users.find(u => u.email === x.owner) || {}).name || x.owner) : ''}</span></span>
        <span class="row" style="flex:none;flex-wrap:wrap"><button class="btn small primary" data-act="mfSend" data-id="${x.id}">${d <= 0 ? 'Review and send' : 'Send now'}</button><button class="btn small" data-act="mfLater" data-id="${x.id}">A week later</button><button class="btn small ghost" data-act="mfDone" data-id="${x.id}">Done</button><button class="btn small ghost" data-act="mfAdd" data-id="${x.id}">Edit</button></span></div>`; }).join('') : '<p class="hint">None at the moment.</p>'}</section>`;
  };
  A.mfAdd = el => {
    const x = el && el.dataset && el.dataset.id ? col().find(z => z.id === el.dataset.id) : { due: App.addDays(App.today(), 7), owner: st.me().email };
    const users = S().users || [];
    const m = App.modal(x.id ? 'Edit follow-up' : 'Add a follow-up', `<p class="hint">For anything not sent through the app, like plans you emailed someone.</p>
      <div class="grid2">${App.field('Their name', `<input id="mf-n" value="${e(x.name || '')}">`)}${App.field('Email', `<input id="mf-e" type="email" value="${e(x.email || '')}">`)}${App.field('Company (optional)', `<input id="mf-c" value="${e(x.company || '')}">`)}
      ${App.field('Follow up on', `<input type="date" id="mf-d" value="${e(x.due)}">`)}</div>
      ${App.field('What it\'s about', `<input id="mf-a" value="${e(x.about || '')}" placeholder="e.g. the plans I sent through for the 3-bay garage in Te Kowhai">`)}
      <p class="hint" style="margin-top:-6px">It reads "Just following up on …", so write it to finish that sentence.</p>
      ${users.length > 1 ? App.field('Whose follow-up', `<select id="mf-o">${users.map(u => App.opt(u.email, u.name, x.owner || st.me().email)).join('')}</select>`) : ''}`,
      { wide: true, actions: `${x.id ? '<button class="btn ghost danger" id="mf-del">Delete</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="mf-ok">${x.id ? 'Save' : 'Add follow-up'}</button>` });
    if (x.id) m.querySelector('#mf-del').onclick = () => { x.deleted = true; st.touch(x); st.save(); App.closeModal(); App.refresh(); };
    m.querySelector('#mf-ok').onclick = () => {
      const v = id => m.querySelector(id).value.trim(); if (!v('#mf-n') || !v('#mf-a')) return App.toast('Add their name and what it\'s about', 'err');
      Object.assign(x, { name: v('#mf-n'), email: v('#mf-e'), company: v('#mf-c'), due: v('#mf-d') || App.addDays(App.today(), 7), about: v('#mf-a'), owner: m.querySelector('#mf-o') ? m.querySelector('#mf-o').value : st.me().email, status: 'open' });
      if (!x.id) { x.id = App.uid(); x.createdAt = Date.now(); col().push(x); }
      st.touch(x); st.save(); App.closeModal(); App.toast(`Follow-up set for ${App.fmtShort(x.due)}`); App.refresh();
    };
  };
  const byId = id => col().find(z => z.id === id);
  A.mfSend = el => {
    const x = byId(el.dataset.id); if (!x.email) return App.toast('Add their email first (Edit)', 'err');
    const t = MF.tpl(x);
    App.mail.compose({ title: `Follow up ${x.name}`, to: x.email, subject: t.subject, body: t.body, kind: 'manual',
      onSent: () => { x.status = 'done'; x.sentAt = Date.now(); st.touch(x); st.save(); App.refresh(); App.toast('Sent. Add another follow-up if you want to chase it again.'); } });
  };
  A.mfLater = el => { const x = byId(el.dataset.id); x.due = App.addDays(App.today() > x.due ? App.today() : x.due, 7); st.touch(x); st.save(); App.toast(`Moved to ${App.fmtShort(x.due)}`); App.refresh(); };
  A.mfDone = el => { const x = byId(el.dataset.id); x.status = 'done'; x.doneAt = Date.now(); st.touch(x); st.save(); App.refresh(); };
})();
