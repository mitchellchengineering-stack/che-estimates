/* Accept online and Variations.
   The estimate email gets an "Accept this estimate" button; a variation email gets "Approve".
   Both go to a page run by the helper script, which saves the client's answer for the app to pick up. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
  const AC = App.Accept = {
    url() { return S().emails && S().emails.trackingUrl; },
    on() { return !!AC.url() && S().estimate.acceptOnline !== false; },
    link(est) {
      if (!AC.on()) return '';
      if (!est.acceptToken) { est.acceptToken = token(); st.touch(est); st.save(); }
      est.acceptInfo = { depositPct: S().estimate.depositPct };
      return `${AC.url()}?a=accept&e=${encodeURIComponent(est.id)}&t=${est.acceptToken}`;
    },
    varLink(est, v) { if (!AC.url()) return ''; if (!v.token) v.token = token(); return `${AC.url()}?a=var&e=${encodeURIComponent(est.id)}&v=${encodeURIComponent(v.id)}&t=${v.token}`; },
    button(href, label) { return `<p style="margin:22px 0"><a href="${e(href)}" style="display:inline-block;background:#f5c400;color:#15171a;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;padding:13px 24px;border-radius:10px;text-decoration:none">${e(label)}</a></p>`; },
    /* apply what clients did on the page */
    apply(list) {
      let changed = false;
      (list || []).forEach(r => {
        const est = st.get(r.estId); if (!est) return;
        if (r.type === 'accept') {
          if (est.onlineAccept && est.onlineAccept.at === r.at) return;
          if (est.status === 'accepted') return;
          est.status = 'accepted'; est.acceptedAt = App.iso(new Date(r.at)); est.clientPo = r.po || est.clientPo;
          est.job = est.job || App.Est.newJob(); est.job.acceptedAt = est.acceptedAt;
          const t = st.totals(est); Object.assign(est.job.deposit, { amount: App.round(t.deposit, 2), pct: S().estimate.depositPct, mode: 'pct' });
          if (est.workings.framecad && !est.job.frames.length) est.job.frames = App.clone(est.workings.framecad.frames);
          est.onlineAccept = { name: r.name, po: r.po, at: r.at, ack: false };
          st.upsertCustomer(est); st.log(est, `Accepted online by ${r.name}. PO/reference: ${r.po || '-'}`); st.touch(est); changed = true;
        } else if (r.type === 'variation') {
          const v = (est.variations || []).find(x => x.id === r.varId); if (!v || v.respondedAt === r.at) return;
          v.status = r.decision === 'decline' ? 'declined' : 'approved'; v.respondedAt = r.at; v.approvedBy = r.name; v.approvedAt = App.iso(new Date(r.at)); v.online = true; v.ack = false;
          st.log(est, `Variation V${v.n} ${v.status} online by ${r.name}`); st.touch(est); changed = true;
        }
      });
      if (changed) { st.save(); if (App.Sales) App.Sales.syncFromEstimates(); App.refresh && App.refresh(); }
    },
    needs() {
      const out = [];
      st.live().forEach(x => {
        if (x.onlineAccept && !x.onlineAccept.ack) out.push({ lvl: 'blue', t: `${x.onlineAccept.name} accepted ${st.displayNumber(x)} online`, s: `PO ${x.onlineAccept.po || '-'}. Check the deposit and email accounts`, b: 'Open job', href: `#/job/${x.id}` });
        (x.variations || []).filter(v => v.online && !v.ack && !v.deleted).forEach(v => out.push({ lvl: v.status === 'approved' ? 'blue' : 'amber', t: `${v.approvedBy} ${v.status} V${v.n} on ${st.displayNumber(x)}`, s: v.title, b: 'Open', href: `#/job/${x.id}/variations` }));
      });
      return out;
    }
  };

  /* ---------- the "accepted online" banner on the job ---------- */
  AC.banner = est => {
    const o = est.onlineAccept; if (!o || o.ack) return '';
    return `<div class="banner accept-banner"><span><b>${e(o.name)} accepted this online</b> on ${App.fmtStamp(o.at)}, PO/reference <b>${e(o.po || '-')}</b>. The deposit is set to ${S().estimate.depositPct}%: change it below if this job is different.</span>
      <span class="row-btns" style="margin:0">${S().emails.accountsEmail ? '<button class="btn small primary" data-act="accountsEmail">Email accounts</button>' : ''}${est.client.email ? '<button class="btn small" data-act="acceptThanks">Send thank-you email</button>' : ''}<button class="btn small ghost" data-act="acceptAck">Done</button></span></div>`;
  };
  A.acceptAck = () => { const est = App.cur; est.onlineAccept.ack = true; st.touch(est); st.save(); App.refresh(); };
  A.acceptThanks = () => { const est = App.cur; const t = App.mail.tpl('thanks', est); App.mail.compose({ title: 'Thank-you email', est, kind: 'thanks', to: est.client.email, subject: t.subject, body: t.body, onSent: () => { st.log(est, 'Thank-you email sent'); st.save(); } }); };

  /* ---------- Variations ---------- */
  const V = App.Var = {
    list(est) { return (est.variations || []).filter(v => !v.deleted); },
    approved(est) { return V.list(est).filter(v => v.status === 'approved'); },
    total(est) { return V.approved(est).reduce((t, v) => t + App.num(v.price), 0); },
    cost(est) { return V.approved(est).reduce((t, v) => t + App.num(v.cost), 0); }
  };
  const STATUS = { draft: ['Draft', ''], sent: ['Waiting for the client', 'warn'], approved: ['Approved', 'ok'], declined: ['Declined', 'bad'] };
  V.tab = est => {
    const list = V.list(est); const t = st.totals(est);
    list.filter(v => v.online && !v.ack).forEach(v => { v.ack = true; st.touch(est); });
    if (list.some(v => v.online)) st.save();
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Variations</h3><button class="btn primary" data-act="varEdit">+ Add a variation</button></div>
      <p class="hint">Anything that changes after the job is accepted. Price it, send it to the client to approve, and it's added to the job total.</p>
      ${list.length ? `<div class="table-scroll"><table class="wtable"><thead><tr><th>Variation</th><th>Asked for</th><th class="r">Price excl GST</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(v => `<tr><td><b>V${v.n}: ${e(v.title)}</b>${v.desc ? `<div class="hint">${e(v.desc.slice(0, 120))}</div>` : ''}</td><td class="small">${App.fmtShort(App.iso(new Date(v.createdAt)))}${v.askedBy ? ', ' + e(v.askedBy) : ''}</td><td class="r"><b>${App.money(v.price)}</b></td>
        <td><span class="tag ${STATUS[v.status][1]}">${STATUS[v.status][0]}${v.status === 'approved' || v.status === 'declined' ? ` ${App.fmtShort(v.approvedAt)}` : ''}</span>${v.approvedBy ? `<div class="hint">${e(v.approvedBy)}${v.online ? ', online' : ''}</div>` : ''}</td>
        <td class="r nowrap">${v.status === 'draft' || v.status === 'sent' ? `<button class="btn small primary" data-act="varSend" data-id="${v.id}">${v.status === 'sent' ? 'Email again' : 'Send to client'}</button><button class="btn small" data-act="varMark" data-id="${v.id}">Mark approved</button>` : ''}${v.status === 'approved' && S().emails.accountsEmail ? `<button class="btn small" data-act="varAccounts" data-id="${v.id}">Email accounts</button>` : ''}<button class="btn small" data-act="varPdf" data-id="${v.id}">PDF</button><button class="btn small ghost" data-act="varEdit" data-id="${v.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No variations on this job.</p>'}
      <div class="var-tot"><span>Original price <b>${App.money(t.sub)}</b> + approved variations <b>${App.money(V.total(est))}</b></span><b>Job total ${App.money(t.sub + V.total(est))} excl GST</b></div></section>`;
  };
  const cur = () => App.cur; const vById = id => (cur().variations || []).find(v => v.id === id);
  A.varEdit = el => {
    const est = cur(); const v = el.dataset.id ? vById(el.dataset.id) : null;
    const m = App.modal(v ? `V${v.n}: ${v.title}` : 'Add a variation', `${App.field('What\'s changing (short)', `<input id="vr-t" value="${e(v ? v.title : '')}" placeholder="e.g. Raise stud height to 2.7 m">`)}
      ${App.field('Details', `<textarea id="vr-d" rows="4" placeholder="What's changing and why">${e(v ? v.desc || '' : '')}</textarea>`)}
      <div class="grid3">${App.field('Price to the client (excl GST)', `<input id="vr-p" inputmode="decimal" value="${e(v ? v.price : '')}">`)}${App.field('Extra cost to you (optional)', `<input id="vr-c" inputmode="decimal" value="${e(v ? v.cost || '' : '')}">`)}${App.field('Who asked for it', `<input id="vr-a" value="${e(v ? v.askedBy || '' : '')}">`)}</div>
      ${App.field('Effect on delivery (optional)', `<input id="vr-del" value="${e(v ? v.delivery || '' : '')}" placeholder="e.g. Adds 2 days">`)}`,
      { wide: true, actions: `${v ? '<button class="btn ghost danger" id="vr-x">Remove</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="vr-ok">Save</button>` });
    m.querySelector('#vr-ok').onclick = () => {
      const g = id => m.querySelector(id).value.trim(); if (!g('#vr-t')) return App.toast('Say what\'s changing', 'err');
      const o = v || { id: App.uid(), n: (est.variations || []).filter(x => !x.deleted).length + 1, status: 'draft', createdAt: Date.now(), by: st.me().name };
      Object.assign(o, { title: g('#vr-t'), desc: g('#vr-d'), price: App.num(g('#vr-p')), cost: App.num(g('#vr-c')), askedBy: g('#vr-a'), delivery: g('#vr-del') });
      if (!v) { est.variations = est.variations || []; est.variations.push(o); st.log(est, `Variation V${o.n} added: ${o.title}`); }
      st.touch(est); st.save(); App.closeModal(); App.refresh();
    };
    if (v) m.querySelector('#vr-x').onclick = async () => { if (!(await App.confirm(`Remove V${v.n}?`, '', 'Remove'))) return; v.deleted = true; st.touch(est); st.save(); App.closeModal(); App.refresh(); };
  };
  V.spec = (est, v) => {
    const R = App.Reports, D = App.Docs; const gst = App.num(v.price) * 0.15;
    const flow = [D.blk(R.stats([['Price excl GST', App.money(v.price), ''], ['GST', App.money(gst), ''], ['Total incl GST', App.money(App.num(v.price) + gst), '']])),
      R.section('What\'s changing', `<div class="note"><p><b>${e(v.title)}</b></p><p>${App.textToHtml(v.desc || '')}</p></div>`)];
    if (v.delivery) flow.push(R.section('Effect on delivery', `<div class="note"><p>${e(v.delivery)}</p></div>`));
    const others = V.approved(est).filter(x => x.id !== v.id).reduce((t, x) => t + App.num(x.price), 0);
    flow.push(R.section('Job total', R.table(['', 'Excl GST'], [['Original price', App.money(st.totals(est).sub)], ['Other approved variations', App.money(others)], ['This variation', App.money(v.price)], ['<b>Job total with this variation</b>', `<b>${App.money(st.totals(est).sub + others + App.num(v.price))}</b>`]], [1])));
    flow.push(D.blk(v.status === 'approved' ? `<div class="note"><p><b>Approved</b> by ${e(v.approvedBy || '')} on ${App.fmtLong(v.approvedAt)}${v.online ? ' (online)' : ''}.</p></div>` : D.signRow([['Approved by', '2fr'], ['Signed', '2fr'], ['Date', '1fr']])));
    return R.spec('Variation', `V${v.n} to ${st.displayNumber(est)}`, [['Client', est.client.company || est.client.name], ['Site', est.siteAddress || '']], flow, 'estimate');
  };
  A.varPdf = el => { const est = cur(); const v = vById(el.dataset.id); App.Reports.show(`Variation V${v.n}`, V.spec(est, v), `${st.displayNumber(est)} Variation V${v.n}`); };
  A.varSend = async el => {
    const est = cur(); const v = vById(el.dataset.id); if (!est.client.email) return App.toast('Add the client\'s email on the estimate first', 'err');
    const link = AC.varLink(est, v); st.touch(est); st.save();
    App.toast('Making the variation PDF…');
    let extra = [];
    try { const blob = await App.Docs.toPdf(V.spec(est, v)); extra = [{ name: `${st.displayNumber(est)} Variation V${v.n}.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) }]; } catch (er) {}
    const first = (est.client.name || '').split(' ')[0] || 'there';
    const body = `Hi ${first},\n\nAs discussed, here's variation V${v.n} to ${st.displayNumber(est)} (${est.heading || ''}): ${v.title}.\n\nThe price for this change is ${App.money(v.price)} excl GST.${v.delivery ? ' ' + v.delivery + '.' : ''} The details are in the attached PDF.\n\n${link ? 'You can approve it online with the button below, or just reply to this email.' : 'Just reply to this email to approve it.'}\n\nCheers,`;
    App.mail.compose({ title: `Send V${v.n} to the client`, est, kind: 'variation', to: est.client.email, subject: `Variation V${v.n} to ${st.displayNumber(est)}: ${v.title}`, body, extra, buttonLink: link, buttonLabel: 'Approve this variation',
      onSent: () => { v.status = 'sent'; v.sentAt = Date.now(); st.log(est, `Variation V${v.n} sent to the client`); st.touch(est); st.save(); App.refresh(); } });
  };
  A.varMark = async el => {
    const est = cur(); const v = vById(el.dataset.id);
    const who = await App.prompt(`Who approved V${v.n}?`, est.client.name || ''); if (!who) return;
    Object.assign(v, { status: 'approved', approvedBy: who, approvedAt: App.today() }); st.log(est, `Variation V${v.n} approved by ${who}`); st.touch(est); st.save(); App.refresh();
  };
  A.varAccounts = el => {
    const est = cur(); const v = vById(el.dataset.id);
    const body = `Hi,\n\nVariation V${v.n} on ${st.displayNumber(est)} for ${est.client.company || est.client.name} has been approved by ${v.approvedBy || 'the client'}.\n\nClient PO / reference: ${est.clientPo || 'not given'}\nVariation: ${v.title}\nPrice (excl GST): ${App.money(v.price)}\nJob total now (excl GST): ${App.money(st.totals(est).sub + V.total(est))}\n\nThe variation is attached. Could you please add it to their next invoice?\n\nCheers,`;
    (async () => { let extra = []; try { const blob = await App.Docs.toPdf(V.spec(est, v)); extra = [{ name: `${st.displayNumber(est)} Variation V${v.n}.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) }]; } catch (er) {}
      App.mail.compose({ title: 'Email accounts about the variation', est, kind: 'accounts', to: S().emails.accountsEmail, subject: `Variation approved: V${v.n} on ${st.displayNumber(est)}`, body, extra, onSent: () => { v.invoiced = Date.now(); st.log(est, `Accounts emailed about V${v.n}`); st.touch(est); st.save(); } }); })();
  };
})();
