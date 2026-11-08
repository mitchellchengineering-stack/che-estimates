/* Backups: everything in the app copied into Google Drive as a spreadsheet you can open and read,
   plus a full copy of the app's data. Runs once a week automatically (when an admin opens the app), or from Settings. */
(() => {
  const A = App.actions, st = App.store, S = () => st.s();
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const d = x => x ? String(x).slice(0, 10) : '';
  const live = k => (st.data[k] || []).filter(x => !x.deleted);
  const B = App.Backup = {
    running: false,
    sheets() {
      const ests = st.live().filter(x => !x.practice);
      const who = x => x.client.company || x.client.name || '';
      const asset = Object.fromEntries(live('assets').map(a => [a.id, a.name]));
      return {
        'Estimates': ests.map(x => ({ Number: st.displayNumber(x), Date: d(x.date || x.createdAt && new Date(x.createdAt).toISOString()), Client: x.client.name, Company: x.client.company, Email: x.client.email, Phone: x.client.phone, Job: x.heading, Site: x.siteAddress, Type: x.type === 'ft' ? 'Frame and truss' : 'General', Status: x.status, 'Value excl GST': st.totals(x).sub, Sent: d(x.sentDate), Accepted: d(x.acceptedAt), 'Client PO': x.clientPo || '', 'Lead source': x.leadSource || '' })),
        'Jobs': ests.filter(x => x.job).map(x => ({ Number: st.displayNumber(x), Client: who(x), Job: x.heading, Stage: App.stageLabel(x.job.stage), Manufacture: d(x.job.manufactureDate), Deliveries: (x.job.loads || []).map(l => `${l.n}: ${d(l.date)}${l.delivered ? ' (delivered)' : ''}`).join('; '), 'Deposit paid': x.job.deposit && x.job.deposit.received ? 'Yes' : 'No', 'Approved variations': App.Var ? App.Var.total(x) : 0 })),
        'Variations': ests.flatMap(x => (x.variations || []).filter(v => !v.deleted).map(v => ({ Job: st.displayNumber(x), Variation: `V${v.n}`, What: v.title, Details: v.desc, Price: v.price, Status: v.status, 'Approved by': v.approvedBy || '', Approved: d(v.approvedAt) }))),
        'Clients': (st.data.customers || []).filter(c => !c.deleted).map(c => ({ Company: c.company, Contact: c.name, Email: c.email, Phone: c.phone, 'Accounts email': c.accountsEmail || '', Address: c.address || '', Type: c.type || '', Regular: c.regular ? 'Yes' : 'No', Notes: c.notes || '' })),
        'Detailing': live('detailing').map(x => { const e2 = x.estId && st.get(x.estId); return { Description: x.desc, Job: e2 ? st.displayNumber(e2) : '', Files: x.files.map(f => `${f.label} (${f.name})`).join('; '), Uploaded: d(new Date(x.createdAt).toISOString()), By: x.createdBy || '' }; }),
        'Follow-ups': live('manualfu').map(x => ({ Name: x.name, Company: x.company, Email: x.email, About: x.about, Due: x.due, Status: x.status })),
        'Maintenance': live('assets').flatMap(a => a.tasks.map(t => ({ 'Machine or vehicle': a.name, Rego: a.reg || '', Task: t.name, Every: `${t.every} ${t.unit}`, 'Last done': t.last ? d(t.last.date) : '', Next: App.Maint ? App.Maint.due(a, t).label : '' }))),
        'Service log': live('servicelog').map(l => ({ Date: d(l.date), 'Machine or vehicle': asset[l.assetId] || '', Type: l.kind === 'fault' ? 'Fault' : 'Service', 'What was done': [(l.tasks || []).join(', '), l.notes, l.fix].filter(Boolean).join('. '), By: l.by || '', Cost: l.cost || 0, Status: l.kind === 'fault' ? (l.status === 'closed' ? 'Fixed' : 'Open') : '' })),
        'Hazards': live('hazards').map(h => ({ Hazard: h.hazard, Where: h.where, Risk: h.risk, Controls: h.controls, Reviewed: h.reviewed })),
        'Incidents': live('incidents').map(i => ({ Ref: i.ref, Type: i.type, When: String(i.when || '').replace('T', ' '), Where: i.where, Who: i.who, 'Reported by': i.reportedBy, 'What happened': i.what, Why: i.why, Injury: i.injury, 'Lost time': i.lostTime ? 'Yes' : 'No', Actions: (i.actions || []).map(a => `${a.text} (${a.who || ''}, due ${a.due || '-'}${a.done ? ', done' : ''})`).join('; '), Notifiable: i.notifiable ? 'Yes' : 'No', Status: i.status })),
        'Toolbox talks': live('talks').map(t => ({ Date: t.date, Topic: t.topic, 'Run by': t.by, Attendees: (t.attendees || []).join(', '), Notes: t.notes, Actions: t.actions })),
        'Training': live('staff').flatMap(p => (p.tickets || []).map(t => ({ Person: p.name, Role: p.role || '', Ticket: t.name, Status: t.na ? 'Not needed' : t.training ? 'In training' : 'Held', Expires: t.expiry || '' }))),
        'Checks': live('checks').flatMap(c => (c.history || []).length ? c.history.map(h => ({ Check: c.name, 'Every (days)': c.every, Date: h.date, By: h.by, Result: h.result === 'fail' ? 'Problem found' : 'All good', Notes: h.notes })) : [{ Check: c.name, 'Every (days)': c.every, Date: '', By: '', Result: 'Not done yet', Notes: '' }]),
        'Substances': live('substances').map(x => ({ Substance: x.name, Storage: x.notes, 'SDS date': x.sdsDate || '', 'SDS link': x.sdsLink || '' }))
      };
    },
    async run(quiet) {
      if (st.mode !== 'drive' || B.running) return;
      B.running = true;
      try {
        await App.loadScript(XLSX_URL);
        const wb = window.XLSX.utils.book_new();
        Object.entries(B.sheets()).forEach(([name, rows]) => { const ws = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'Nothing yet' }]); window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); });
        const buf = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const folder = await App.G.folder('Backups', st.rootId);
        const day = App.today();
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: `CH Engineering backup ${day}`, parents: [folder], mimeType: 'application/vnd.google-apps.spreadsheet' })], { type: 'application/json' }));
        form.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const sheet = await App.G.api(`${App.G.U}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, { method: 'POST', body: form });
        await App.G.uploadOrReplace({ name: `che-app-data ${day}.json`, parent: folder, blob: new Blob([JSON.stringify(st.data)], { type: 'application/json' }), mime: 'application/json' });
        S().backup = { last: Date.now(), link: sheet.webViewLink || '', folder }; S().updatedAt = Date.now(); st.touch(S()); st.save();
        if (!quiet) App.toast('Backed up to Google Drive, in the Backups folder');
      } catch (er) { if (!quiet) App.toast('Backup didn\'t work: ' + er.message, 'err', 7000); console.error(er); }
      B.running = false;
    },
    /* once a week, quietly, when an admin opens the app */
    maybe() {
      if (st.mode !== 'drive' || !st.data) return;
      const me = S().users.find(u => u.email === st.me().email); if (!me || !me.admin) return;
      const last = (S().backup || {}).last || 0; if (Date.now() - last < 7 * 864e5) return;
      setTimeout(() => B.run(true), 20000);
    },
    card() {
      const b = S().backup || {};
      return `<section class="card"><h3>Backups</h3><p class="hint">Once a week the app saves a spreadsheet of everything (estimates, jobs, variations, clients, detailing, follow-ups, maintenance, service log, hazards, incidents, toolbox talks, training, checks and substances) into a <b>Backups</b> folder in your Google Drive, with a full copy of the app's data alongside. Coils, fasteners and sales already live in their own Google Sheets.</p>
        <p>${b.last ? `Last backup: <b>${App.fmtStamp(b.last)}</b>${b.link ? ` · <a href="${App.esc(b.link)}" target="_blank" rel="noopener">Open it</a>` : ''}${b.folder ? ` · <a href="https://drive.google.com/drive/folders/${App.esc(b.folder)}" target="_blank" rel="noopener">Backups folder</a>` : ''}` : 'No backup yet.'}</p>
        <button class="btn" data-act="backupNow" ${st.mode === 'drive' ? '' : 'disabled'}>Back up now</button></section>`;
    }
  };
  A.backupNow = async el => { el.disabled = true; el.textContent = 'Backing up…'; await B.run(false); App.refresh(); };
})();
