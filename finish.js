/* Finishing a job: an Extras tab for unquoted extras as they happen, a Job complete button
   (files it under Completed jobs and saves a summary to Drive), and Send final invoice to CH Accounts:
   a checklist, then a draft email to review. Nothing is sent without you clicking Send. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const F = App.Finish = {};
  const cur = () => App.cur;
  const save = est => { st.touch(est); st.save(); };
  F.extras = est => ((est.job && est.job.extras) || []).filter(x => !x.deleted && (x.desc || App.num(x.amount)));
  F.extrasTotal = est => F.extras(est).reduce((t, x) => t + App.num(x.amount), 0);
  F.varTotal = est => App.Var ? App.Var.total(est) : 0;
  /* what's already been invoiced at the start (the deposit) */
  F.deposit = est => {
    const d = est.job.deposit || {}; const t = st.totals(est);
    if (d.notRequired) return { amount: 0, label: 'Nothing invoiced at the start (no deposit)' };
    const amount = d.amount != null && d.mode ? App.num(d.amount) : t.deposit; const pct = d.mode ? App.num(d.pct) : App.num(S().estimate.depositPct);
    return { amount, pct, label: `${App.round(pct, 1)}% deposit, ${App.money(amount)}` };
  };
  F.balance = (est, o = {}) => {
    const total = o.total != null ? o.total : st.totals(est).sub; const dep = o.deposit != null ? o.deposit : F.deposit(est).amount;
    return { total, vars: F.varTotal(est), extras: F.extrasTotal(est), dep, balance: total + F.varTotal(est) + F.extrasTotal(est) - dep };
  };

  /* ---------- Extras tab ---------- */
  F.extrasTab = est => {
    const list = F.extras(est); const vars = App.Var ? App.Var.approved(est) : [];
    return `<section class="card"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Extras to charge</h3><button class="btn primary" data-act="fxEdit">+ Add an extra</button></div>
      <p class="hint">Anything added during the job that wasn't quoted, so it doesn't get forgotten. They're added to the final invoice when the job is complete. (Changes the client approves first go under Variations.)</p>
      ${list.length ? `<table class="wtable"><thead><tr><th>Extra</th><th>Added</th><th class="r">Amount excl GST</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td><b>${e(x.desc)}</b>${x.notes ? `<div class="hint">${e(x.notes)}</div>` : ''}</td><td class="small">${x.date ? App.fmtShort(x.date) : ''}${x.by ? ', ' + e(x.by) : ''}</td><td class="r">${App.money(x.amount)}</td><td class="r nowrap"><button class="btn small ghost" data-act="fxEdit" data-id="${x.id}">Edit</button></td></tr>`).join('')}
        <tr class="tot"><td colspan="2"><b>Extras total</b></td><td class="r"><b>${App.money(F.extrasTotal(est))}</b></td><td></td></tr></tbody></table>` : '<p class="hint">No extras on this job yet.</p>'}
      ${vars.length ? `<p class="hint" style="margin-top:12px">Also on the final invoice: ${vars.length} approved variation${vars.length === 1 ? '' : 's'}, ${App.money(F.varTotal(est))}.</p>` : ''}</section>`;
  };
  A.fxEdit = el => {
    const est = cur(); est.job.extras = est.job.extras || []; const x = el && el.dataset && el.dataset.id ? est.job.extras.find(z => z.id === el.dataset.id) : null;
    const m = App.modal(x ? 'Edit extra' : 'Add an extra', `${App.field('What was the extra?', `<input id="fx-d" value="${e(x ? x.desc : '')}" placeholder="e.g. Extra lintel over the garage door">`)}
      <div class="grid2">${App.field('Amount to charge (excl GST)', `<input id="fx-a" inputmode="decimal" value="${e(x ? x.amount : '')}">`)}${App.field('Date', `<input type="date" id="fx-dt" value="${e(x ? x.date : App.today())}">`)}</div>
      ${App.field('Notes (optional)', `<input id="fx-n" value="${e(x ? x.notes || '' : '')}" placeholder="Who asked for it, why">`)}`,
      { actions: `${x ? '<button class="btn ghost danger" id="fx-x">Remove</button>' : ''}<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="fx-ok">Save</button>` });
    m.querySelector('#fx-ok').onclick = () => {
      const d = m.querySelector('#fx-d').value.trim(); if (!d) return App.toast('Say what the extra was', 'err');
      const o = x || { id: App.uid(), by: st.me().name }; Object.assign(o, { desc: d, amount: App.num(m.querySelector('#fx-a').value), date: m.querySelector('#fx-dt').value, notes: m.querySelector('#fx-n').value.trim() });
      if (!x) { est.job.extras.push(o); st.log(est, `Extra added: ${d}${o.amount ? ' (' + App.money(o.amount) + ')' : ''}`); }
      save(est); App.closeModal(); App.refresh();
    };
    if (x) m.querySelector('#fx-x').onclick = () => { x.deleted = true; save(est); App.closeModal(); App.refresh(); };
  };

  /* ---------- Job complete ---------- */
  F.card = est => {
    const j = est.job;
    if (j.stage !== 'complete') return `<section class="card fin-card"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><span><b>Job finished?</b><span class="hint" style="display:block">Marking it complete moves it to Completed jobs, saves a job summary to Google Drive, then you can send the final invoice to CH Accounts.${F.extras(est).length ? ` It has ${F.extras(est).length} extra${F.extras(est).length === 1 ? '' : 's'} to charge.` : ''}</span></span><button class="btn dark" data-act="jobComplete">Job complete</button></div></section>`;
    const f = j.final || {};
    return `<section class="card fin-card done"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:10px"><span><b>Job completed</b> ${j.completedAt ? App.fmtStamp(j.completedAt) : ''}${j.completedBy ? ', ' + e(j.completedBy) : ''}<span class="hint" style="display:block">${j.summaryLink ? `<a href="${e(j.summaryLink)}" target="_blank" rel="noopener">Job summary</a> saved in Completed jobs.` : 'In Completed jobs.'}</span></span>
      ${f.sentAt ? `<span class="row" style="flex:none"><span class="tag ok">Final invoice sent ${App.fmtStamp(f.sentAt)}</span><button class="btn small ghost" data-act="finalInvoice">Send again</button></span>` : '<button class="btn primary" data-act="finalInvoice">Send final invoice to CH Accounts</button>'}</div></section>`;
  };
  A.jobComplete = async () => {
    const est = cur();
    if (!(await App.confirm(`Mark ${st.displayNumber(est)} as complete?`, 'It moves to Completed jobs, and a summary of the whole job is saved to Google Drive (Completed jobs, and the client\'s folder). Then you can send the final invoice to CH Accounts.', 'Job complete'))) return;
    const j = est.job; j.stage = 'complete'; j.completedAt = Date.now(); j.completedBy = st.me().name; (j.stageLog = j.stageLog || []).push({ stage: 'complete', at: Date.now(), by: st.me().name });
    st.log(est, 'Job completed'); save(est); App.refresh();
    try { App.toast('Saving the job summary to Google Drive…'); await F.file(est); save(est); App.refresh(); App.toast('Job filed. Next: send the final invoice to CH Accounts.'); }
    catch (er) { App.toast('Marked complete, but saving to Drive didn\'t work: ' + er.message, 'err', 7000); }
  };
  F.file = async est => {
    if (st.mode !== 'drive' || !App.Reports || !App.Reports.jobSpec) return;
    const who = est.client.company || est.client.name || 'No client'; const safe = s2 => String(s2).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
    const name = safe(`${st.displayNumber(est)} ${who}${est.heading ? ', ' + est.heading : ''}`);
    const blob = await App.Docs.toPdf(App.Reports.jobSpec(est.id)); const pdf = `${name} job summary.pdf`;
    const done = await App.G.folder(name, await App.G.folder('Completed jobs', st.rootId));
    const cl = await App.G.folder(name, await App.G.folder(safe(who), await App.G.folder('Clients', st.rootId)));
    const up = await App.G.uploadOrReplace({ name: pdf, parent: done, blob, mime: 'application/pdf' });
    await App.G.uploadOrReplace({ name: pdf, parent: cl, blob, mime: 'application/pdf' });
    est.job.summaryLink = up.webViewLink || `https://drive.google.com/file/d/${up.id}/view`;
  };

  /* ---------- Final invoice: checklist, then a draft to review ---------- */
  A.finalInvoice = el => {
    const est = (el && el.dataset && el.dataset.id && st.get(el.dataset.id)) || cur(); App.cur = est;
    if (!S().emails.accountsEmail) return App.toast('Add the accounts email in Settings, Emails first', 'err', 6000);
    const t = st.totals(est); const dep = F.deposit(est); const vars = App.Var ? App.Var.approved(est) : [];
    const exRow = (z) => `<div class="row ex-row" style="margin-bottom:6px" data-id="${e(z.id || '')}"><input class="ex-d" value="${e(z.desc || '')}" placeholder="What was the extra?" style="flex:2"><input class="ex-a" value="${e(z.amount || '')}" inputmode="decimal" placeholder="$ excl GST" style="flex:1"><button class="icon-btn ex-x" type="button" aria-label="Remove">✕</button></div>`;
    const m = App.modal(`Before you send ${st.displayNumber(est)} to CH Accounts`, `<p class="hint">Tick each one to check it. Nothing is sent from here: the next step is a draft email for you to review.</p>
      <div class="inv-checks">
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Is the job total correct?</b><span class="row" style="margin-top:6px"><input id="fi-total" value="${e(App.round(t.sub, 2))}" inputmode="decimal" style="max-width:180px"> <span class="hint">excl GST, as quoted${est.rev ? ' (Rev ' + est.rev + ')' : ''}</span></span></span></label>
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>What was already invoiced at the start?</b><span class="hint" style="display:block">${e(dep.label)}. Change it if it was different.</span><span class="row" style="margin-top:6px"><input id="fi-dep" value="${e(App.round(dep.amount, 2))}" inputmode="decimal" style="max-width:180px"> <span class="hint">excl GST already invoiced</span></span></span></label>
        ${vars.length ? `<label class="inv-check"><input type="checkbox" class="ic"><span><b>Approved variations to include</b>${vars.map(v => `<span class="kvr2" style="display:flex"><span>V${v.n}: ${e(v.title)}</span><b>${App.money(v.price)}</b></span>`).join('')}</span></label>` : ''}
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Were there any extras during the job to charge for?</b><span class="hint" style="display:block">These come from the Extras tab. Add any others, or leave it empty.</span><span id="fi-ex" style="display:block;margin-top:6px">${F.extras(est).map(exRow).join('')}</span><button class="btn small" type="button" id="fi-ex-add">+ Add an extra</button></span></label>
        <label class="inv-check"><input type="checkbox" class="ic"><span><b>Are the client, PO and site right?</b><span class="grid3" style="margin-top:6px">${App.field('Company or client', `<input id="fi-co" value="${e(est.client.company || est.client.name || '')}">`)}${App.field('Client PO / reference', `<input id="fi-po" value="${e(est.clientPo || '')}">`)}${App.field('Site', `<input id="fi-site" value="${e(est.siteAddress || '')}">`)}</span></span></label>
      </div>
      <div class="fin-bal" id="fi-bal"></div>`, { wide: true, actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="fi-ok" disabled>Draft the email</button>' });
    const ok = m.querySelector('#fi-ok'); const checks = [...m.querySelectorAll('.ic')];
    const readEx = () => [...m.querySelectorAll('.ex-row')].map(r => ({ id: r.dataset.id || App.uid(), desc: r.querySelector('.ex-d').value.trim(), amount: App.num(r.querySelector('.ex-a').value) })).filter(z => z.desc || z.amount);
    const bal = () => { const tot = App.num(m.querySelector('#fi-total').value), d = App.num(m.querySelector('#fi-dep').value), ex = readEx().reduce((s2, z) => s2 + z.amount, 0), vt = F.varTotal(est);
      m.querySelector('#fi-bal').innerHTML = `<div><span>Job total</span><b>${App.money(tot)}</b></div>${vt ? `<div><span>Approved variations</span><b>+ ${App.money(vt)}</b></div>` : ''}${ex ? `<div class="red"><span>Extras</span><b>+ ${App.money(ex)}</b></div>` : ''}<div><span>Already invoiced</span><b>− ${App.money(d)}</b></div><div class="big"><span>Balance to invoice (excl GST)</span><b>${App.money(tot + vt + ex - d)}</b></div>`; };
    checks.forEach(c => c.onchange = () => { c.closest('.inv-check').classList.toggle('on', c.checked); ok.disabled = !checks.every(z => z.checked); });
    const bindEx = () => m.querySelectorAll('.ex-x').forEach(b2 => b2.onclick = ev => { ev.preventDefault(); b2.closest('.ex-row').remove(); bal(); });
    m.querySelector('#fi-ex-add').onclick = ev => { ev.preventDefault(); m.querySelector('#fi-ex').insertAdjacentHTML('beforeend', exRow({})); bindEx(); };
    m.addEventListener('input', bal); bindEx(); bal();
    ok.onclick = () => {
      const j = est.job; const keep = readEx(); const ids = new Set(keep.map(z => z.id));
      (j.extras || []).forEach(z => { if (!ids.has(z.id)) z.deleted = true; });
      keep.forEach(z => { const ex = (j.extras = j.extras || []).find(y => y.id === z.id); if (ex) Object.assign(ex, z, { deleted: false }); else j.extras.push(Object.assign(z, { date: App.today(), by: st.me().name })); });
      const co = m.querySelector('#fi-co').value.trim(); if (est.client.company || !est.client.name) est.client.company = co; else est.client.name = co;
      est.clientPo = m.querySelector('#fi-po').value.trim(); est.siteAddress = m.querySelector('#fi-site').value.trim();
      j.final = Object.assign(j.final || {}, { total: App.num(m.querySelector('#fi-total').value), deposit: App.num(m.querySelector('#fi-dep').value) });
      save(est); App.closeModal(); F.email(est);
    };
  };
  F.summarySpec = est => {
    const R = App.Reports, D = App.Docs; const f = est.job.final || {}; const b = F.balance(est, f); const vars = App.Var ? App.Var.approved(est) : []; const ex = F.extras(est);
    const rows = [['Job total, as quoted', App.money(b.total)]].concat(vars.map(v => [`Variation V${v.n}: ${e(v.title)}`, App.money(v.price)])).concat(ex.map(x => [`<span class="ex-red">${e(x.desc)} <span class="ex-tag">Added during the job</span></span>`, `<span class="ex-red">${App.money(x.amount)}</span>`])).concat([['Less already invoiced at the start', '− ' + App.money(b.dep)], ['<b>Balance to invoice (excl GST)</b>', `<b>${App.money(b.balance)}</b>`]]);
    const flow = [D.blk(R.stats([['Balance to invoice', App.money(b.balance), 'excl GST'], ['Job total', App.money(b.total), ''], ['Variations and extras', App.money(b.vars + b.extras), ''], ['Already invoiced', App.money(b.dep), '']])), R.section('Final invoice', R.table(['', 'Excl GST'], rows, [1]))];
    return R.spec('Final invoice summary', st.displayNumber(est), [['Client', est.client.company || est.client.name], ['PO / reference', est.clientPo || ''], ['Site', est.siteAddress || '']], flow, 'estimate');
  };
  F.email = async est => {
    const f = est.job.final || {}; const b = F.balance(est, f); const vars = App.Var ? App.Var.approved(est) : []; const ex = F.extras(est);
    const vlines = vars.length ? vars.map(v => `Variation V${v.n}, ${v.title}: ${App.money(v.price)}`).join('\n') + '\n' : '';
    const xlines = ex.length ? ex.map(x => `Extra, ${x.desc}: ${App.money(x.amount)}`).join('\n') + '\n' : '';
    const company = est.client.company && est.client.company.trim();
    const tt = App.mail.tpl('final', est, { po_ref: est.clientPo || 'not given', company_line: company ? `\nCompany: ${company}` : '', site_address: est.siteAddress || '', job_total: App.money(b.total), variation_lines: vlines, extra_lines: xlines, deposit_line: App.money(b.dep), balance: App.money(b.balance) });
    App.toast('Attaching the estimate and a summary…');
    let extra = [];
    try { const blob = await App.Docs.toPdf(F.summarySpec(est)); extra = [{ name: `${st.displayNumber(est)} final invoice summary.pdf`, mime: 'application/pdf', base64: await App.blobToBase64(blob) }]; } catch (er) { /* the estimate still goes */ }
    App.mail.compose({ title: `Send ${st.displayNumber(est)} to CH Accounts`, est, kind: 'accounts', to: S().emails.accountsEmail, subject: tt.subject, body: tt.body, attachEstimate: true, extra,
      onSent: () => { est.job.final.sentAt = Date.now(); est.job.final.sentBy = st.me().name; st.log(est, `Final invoice sent to CH Accounts: balance ${App.money(b.balance)}`); save(est); App.refresh(); App.toast('Sent to CH Accounts'); } });
  };

  /* ---------- Completed jobs (Production > Completed jobs) ---------- */
  F.completedView = () => {
    const list = App.Jobs.list().filter(j => j.job.stage === 'complete').sort((a, b) => (b.job.completedAt || 0) - (a.job.completedAt || 0));
    return `<section class="card"><h3>Completed jobs</h3>${list.length ? `<div class="table-scroll"><table class="wtable"><thead><tr><th>Job</th><th>Client</th><th>Site</th><th>Completed</th><th>Final invoice</th><th></th></tr></thead><tbody>
      ${list.map(j => `<tr><td><b>${e(st.displayNumber(j))}</b><div class="hint">${e(j.heading || '')}</div></td><td>${e(j.client.company || j.client.name)}</td><td class="small">${e(j.siteAddress || '')}</td><td class="small">${j.job.completedAt ? App.fmtShort(App.iso(new Date(j.job.completedAt))) : ''}</td>
        <td>${j.job.final && j.job.final.sentAt ? `<span class="tag ok">Sent ${App.fmtShort(App.iso(new Date(j.job.final.sentAt)))}</span>` : `<button class="btn small primary" data-act="finalInvoice" data-id="${j.id}">Send final invoice</button>`}</td><td class="r"><a class="btn small" href="#/job/${j.id}">Open</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">Jobs go here when you click Job complete on them.</p>'}</section>`;
  };
  F.needs = () => (App.Jobs ? App.Jobs.list() : []).filter(j => j.job.stage === 'complete' && !(j.job.final && j.job.final.sentAt)).map(j => ({ lvl: 'amber', t: `${st.displayNumber(j)}: send the final invoice to CH Accounts`, s: j.client.company || j.client.name, b: 'Open', href: `#/job/${j.id}` }));
})();
