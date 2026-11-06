/**
 * CH Engineering Estimates – Google helper script
 *
 * What it does, every morning:
 *  - Sends (or lines up for approval) the 1-week and 2-week follow-up emails for estimates YOU sent
 *  - Sends a reminder 3 days before an estimate's pricing expires
 *  - Sends review requests a set number of days after a job is marked complete
 *  - Emails you your sales follow-ups due today, and any sales emails waiting for your approval
 *  - Skips a follow-up if the client has already replied to you
 * Every Monday (optional): emails the team a summary of the week ahead.
 * As a web app (optional): records when clients open estimate emails.
 *
 * Each person who sends estimates installs their OWN copy, so emails come from their Gmail.
 * Full instructions are in README.md.
 */

// ===== Fill these in =====
const FOLDER_ID = 'PASTE_THE_SHARED_FOLDER_ID_HERE';  // Settings > Google and data in the app shows this
const SEND_HOUR = 8;            // what hour of the morning to run (NZ time)
const WEEKLY_SUMMARY = true;    // set to false for the second person so the team only gets one summary
const APP_LINK = 'https://YOUR-GITHUB-NAME.github.io/che-estimates/';  // where the app lives
// =========================

const TZ = 'Pacific/Auckland';

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('daily').timeBased().atHour(SEND_HOUR).everyDays(1).inTimezone(TZ).create();
  if (WEEKLY_SUMMARY) ScriptApp.newTrigger('weeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone(TZ).create();
  daily();
  Logger.log('All set. The helper will run every morning at ' + SEND_HOUR + 'am.');
}

/* ---------- Daily run ---------- */
function daily() {
  const me = Session.getActiveUser().getEmail().toLowerCase();
  const data = loadData_(); if (!data) return;
  const s = data.settings;
  const user = (s.users || []).find(u => (u.email || '').toLowerCase() === me) || { name: me, followupMode: 'ask' };
  const mode = user.followupMode || 'ask';
  const logRef = getLog_(me); const log = logRef.log;
  const today = today_();
  const sentNow = [], queuedNow = [];

  const logged = (id, kind, statusTest) => log.entries.some(e => e.estId === id && e.kind === kind && statusTest(e.status));
  const done = (est, kind) => {
    if (kind === 'review') return !!(est.job && est.job.reviewDone) || logged(est.id, kind, st => st !== 'queued');
    const f = est.followups || {};
    return (f[kind] && f[kind].status && f[kind].status !== 'queued') || logged(est.id, kind, st => st !== 'queued');
  };
  const handle = (est, kind) => {
    if (kind !== 'review' && hasReplied_(est)) { log.entries.push({ estId: est.id, kind, status: 'replied', at: Date.now(), by: me }); return; }
    if (mode === 'auto') {
      try { sendTemplate_(est, kind, s, user); log.entries.push({ estId: est.id, kind, status: 'sent', at: Date.now(), by: me }); sentNow.push(label_(est, kind)); }
      catch (err) { Logger.log('Could not send ' + kind + ' for ' + est.number + ': ' + err); }
    } else if (!logged(est.id, kind, st => st === 'queued')) {
      log.entries.push({ estId: est.id, kind, status: 'queued', at: Date.now(), by: me }); queuedNow.push(label_(est, kind));
    }
  };

  (data.estimates || []).filter(e => !e.deleted && !e.practice && !e.archived).forEach(est => {
    if (est.status === 'sent' && (est.sentBy || '').toLowerCase() === me && !(est.followups && est.followups.paused) && est.client && est.client.email) {
      const sd = est.sentDate || (est.sentAt ? Utilities.formatDate(new Date(est.sentAt), TZ, 'yyyy-MM-dd') : null);
      if (sd) {
        if (!done(est, 'fu1') && today >= addDays_(sd, 7)) handle(est, 'fu1');
        else if (done(est, 'fu1') && !done(est, 'fu2') && today >= addDays_(sd, 14)) handle(est, 'fu2');
      }
      const left = daysBetween_(today, est.expiry);
      if (est.expiry && left >= 0 && left <= 3 && !done(est, 'expiry')) handle(est, 'expiry');
    }
    if (est.job && est.job.stage === 'complete' && (est.createdBy || '').toLowerCase() === me && est.client && est.client.email && !done(est, 'review')) {
      const c = (est.job.stageLog || []).slice().reverse().find(l => l.stage === 'complete');
      const delay = (s.production && s.production.reviewDelayDays) || 10;
      if (c && daysBetween_(Utilities.formatDate(new Date(c.at), TZ, 'yyyy-MM-dd'), today) >= delay) handle(est, 'review');
    }
  });

  saveLog_(logRef);
  try { salesReminder_(data, user, me); } catch (err) { Logger.log('Sales reminder skipped: ' + err); }
  if (sentNow.length || queuedNow.length) {
    let body = '';
    if (sentNow.length) body += 'These went out this morning:\n' + sentNow.map(x => ' - ' + x).join('\n') + '\n\n';
    if (queuedNow.length) body += 'These are ready for you to check and send (Follow-ups page in the app):\n' + queuedNow.map(x => ' - ' + x).join('\n') + '\n\n';
    body += APP_LINK + '#/followups';
    GmailApp.sendEmail(me, `Estimates: ${sentNow.length ? sentNow.length + ' follow-up' + (sentNow.length > 1 ? 's' : '') + ' sent' : ''}${sentNow.length && queuedNow.length ? ', ' : ''}${queuedNow.length ? queuedNow.length + ' waiting for you' : ''}`, body);
  }
}

/* ---------- Sales reminder ----------
   Each morning, tells you which of your sales follow-ups are due and which follow-up emails are waiting for
   your approval in the hub. It never emails clients itself. */
function salesReminder_(data, user, me) {
  const s = data.settings || {}; const sheetId = s.sales && s.sales.sheetId; if (!sheetId) return;
  const first = String(user.name || '').toLowerCase().split(' ')[0]; if (!first) return;
  const sh = SpreadsheetApp.openById(sheetId).getSheetByName('Contacts'); if (!sh) return;
  const rows = sh.getDataRange().getValues(); const head = rows.shift().map(String);
  const col = n => head.indexOf(n);
  const iOwner = col('Contacted By'), iCo = col('Company'), iNext = col('Next Follow-up'), iType = col('Follow-up Type'), iArch = col('Archived'), iName = col('Primary Contact');
  const today = today_(); const due = [];
  const asDate = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').slice(0, 10);
  rows.forEach(r => {
    if (String(r[iOwner] || '').toLowerCase().split(' ')[0] !== first) return;
    if (r[iArch] === true || String(r[iArch]).toLowerCase() === 'yes' || String(r[iArch]).toLowerCase() === 'true') return;
    const nx = asDate(r[iNext]); if (!/^\d{4}-\d\d-\d\d$/.test(nx) || nx > today) return;
    if (String(r[iType]) === 'revisit' && nx < today) return;
    due.push({ co: String(r[iCo] || r[iName] || 'No name'), late: daysBetween_(nx, today), type: String(r[iType] || 'followup') });
  });
  const waiting = (data.salesMail || []).filter(m => !m.deleted && m.status === 'waiting' && String(m.owner || '').toLowerCase().split(' ')[0] === first);
  if (!due.length && !waiting.length) return;
  const kind = { followup: 'follow up', callback: 'call back', review: 'ask for a review', revisit: 'revisit' };
  let body = 'Morning ' + (user.name || '').split(' ')[0] + ',\n\n';
  if (due.length) body += 'Sales follow-ups due:\n' + due.sort((a, b) => b.late - a.late).map(d => ' - ' + d.co + ': ' + (kind[d.type] || 'follow up') + (d.late > 0 ? ' (' + d.late + ' day' + (d.late === 1 ? '' : 's') + ' overdue)' : ' (today)')).join('\n') + '\n\n';
  if (waiting.length) body += 'Follow-up emails written and waiting for you to approve:\n' + waiting.map(m => ' - ' + m.company + ': ' + m.subject).join('\n') + '\n\nNothing goes to a client until you approve it.\n\n';
  body += APP_LINK + '#/sales';
  GmailApp.sendEmail(me, 'Sales: ' + [due.length ? due.length + ' follow-up' + (due.length === 1 ? '' : 's') + ' due' : '', waiting.length ? waiting.length + ' email' + (waiting.length === 1 ? '' : 's') + ' to approve' : ''].filter(Boolean).join(', '), body);
}

/* ---------- Weekly summary ---------- */
function weeklySummary() {
  const data = loadData_(); if (!data) return;
  const s = data.settings; const today = today_(); const weekAgo = addDays_(today, -7); const weekOn = addDays_(today, 7);
  const ests = (data.estimates || []).filter(e => !e.deleted && !e.practice);
  const money = n => '$' + Number(n || 0).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const total = e => Number(e.price || 0) + (e.extras || []).reduce((t, x) => t + Number(x.price || 0), 0);
  const who = e => (e.client.company || e.client.name || '');
  const sent = ests.filter(e => e.sentDate && e.sentDate >= weekAgo);
  const won = ests.filter(e => e.status === 'accepted' && e.acceptedAt && e.acceptedAt >= weekAgo);
  const expiring = ests.filter(e => e.status === 'sent' && e.expiry >= today && e.expiry <= weekOn);
  const fuDue = ests.filter(e => e.status === 'sent' && e.sentDate && !(e.followups && e.followups.paused) && [7, 14].some(d => { const due = addDays_(e.sentDate, d); return due >= today && due <= weekOn; }));
  const jobs = ests.filter(e => e.job && !e.archived);
  const making = jobs.filter(j => j.job.manufactureDate && j.job.manufactureDate >= today && j.job.manufactureDate <= weekOn);
  const deliveries = []; jobs.forEach(j => (j.job.loads || []).forEach(l => { if (l.date && !l.delivered && l.date >= today && l.date <= weekOn) deliveries.push(`${l.date}: ${j.number} delivery ${l.n} of ${j.job.loads.length}, ${j.siteAddress}`); }));
  const list = (title, arr) => arr.length ? `${title}\n${arr.map(x => ' - ' + x).join('\n')}\n\n` : `${title}\n - None\n\n`;
  const body =
    `Hey team,\n\nHere's the week at a glance.\n\n` +
    list(`Estimates sent last week (${sent.length}, ${money(sent.reduce((t, e) => t + total(e), 0))})`, sent.map(e => `${e.number} ${who(e)}, ${money(total(e))}`)) +
    list(`Accepted last week (${won.length}, ${money(won.reduce((t, e) => t + total(e), 0))})`, won.map(e => `${e.number} ${who(e)}, ${money(total(e))}`)) +
    list('Follow-ups due this week', fuDue.map(e => `${e.number} ${who(e)}`)) +
    list('Estimates expiring this week', expiring.map(e => `${e.number} ${who(e)}, expires ${e.expiry}`)) +
    list('Manufacture starting this week', making.map(j => `${j.job.manufactureDate}: ${j.number} ${who(j)}`)) +
    list('Deliveries this week', deliveries.sort()) +
    `${APP_LINK}\n\nCheers,`;
  const to = (s.users || []).map(u => u.email).filter(Boolean).join(',');
  if (to) GmailApp.sendEmail(to, `This week: ${sent.length} sent last week, ${deliveries.length} deliveries coming up`, body);
}

/* ---------- Email open tracking (deploy as web app) ---------- */
function doGet(e) {
  const id = e && e.parameter && e.parameter.e;
  if (e && e.parameter && (e.parameter.a === 'accept' || e.parameter.a === 'var')) return clientPage_(e.parameter);
  if (id) {
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const it = folder.getFilesByName('email-opens.json');
      const file = it.hasNext() ? it.next() : folder.createFile('email-opens.json', JSON.stringify({ opens: [] }), 'application/json');
      const j = JSON.parse(file.getBlob().getDataAsString() || '{"opens":[]}');
      j.opens.push({ estId: id, k: e.parameter.k || '', at: Date.now() });
      if (j.opens.length > 3000) j.opens = j.opens.slice(-3000);
      file.setContent(JSON.stringify(j));
    } finally { lock.releaseLock(); }
  }
  return ContentService.createTextOutput('');
}

/* ---------- Helpers ---------- */
function loadData_() {
  const it = DriveApp.getFolderById(FOLDER_ID).getFilesByName('che-app-data.json');
  if (!it.hasNext()) { Logger.log('No che-app-data.json found. Open the app once first.'); return null; }
  return JSON.parse(it.next().getBlob().getDataAsString());
}
function getLog_(me) {
  const folder = DriveApp.getFolderById(FOLDER_ID); const name = 'followup-log-' + me + '.json';
  const it = folder.getFilesByName(name);
  const file = it.hasNext() ? it.next() : folder.createFile(name, JSON.stringify({ entries: [] }), 'application/json');
  return { file, log: JSON.parse(file.getBlob().getDataAsString() || '{"entries":[]}') };
}
function saveLog_(ref) { ref.file.setContent(JSON.stringify(ref.log)); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function parse_(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12); }
function addDays_(s, n) { const d = parse_(s); d.setDate(d.getDate() + n); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function daysBetween_(a, b) { if (!a || !b) return NaN; return Math.round((parse_(b) - parse_(a)) / 86400000); }
function longDate_(s) { return s ? Utilities.formatDate(parse_(s), TZ, 'd MMMM yyyy') : ''; }
function label_(est, kind) { return `${est.number}${est.rev ? ' Rev ' + est.rev : ''} ${est.client.company || est.client.name}: ${{ fu1: 'first follow-up', fu2: 'second follow-up', expiry: 'expiry reminder', review: 'review request' }[kind]}`; }

function hasReplied_(est) {
  const sd = est.sentDate; if (!sd || !est.client.email) return false;
  const q = `from:${est.client.email} after:${sd.replace(/-/g, '/')}`;
  try { return GmailApp.search(q, 0, 1).length > 0; } catch (e) { return false; }
}

function vars_(est, s, user) {
  const sub = Number(est.price || 0) + (est.extras || []).reduce((t, x) => t + Number(x.price || 0), 0);
  const money = n => '$' + Number(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    first_name: (est.client.name || '').trim().split(/\s+/)[0] || 'there', client_name: est.client.company || est.client.name,
    client_email: est.client.email, number: est.number + (est.rev ? ' Rev ' + est.rev : ''), heading: est.heading || 'your project',
    site_address: est.siteAddress || '', expiry: longDate_(est.expiry), total: money(sub), deposit: money(sub * (s.estimate.depositPct || 25) / 100),
    deposit_pct: s.estimate.depositPct || 25, sender_name: user.name, phone: user.phone || s.company.phone
  };
}
function fill_(tpl, v) { return (tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m)); }
function esc_(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function signature_() {
  try { const r = Gmail.Users.Settings.SendAs.list('me'); const p = (r.sendAs || []).find(x => x.isPrimary) || (r.sendAs || [])[0]; return (p && p.signature) || ''; }
  catch (e) { return ''; }
}
function sendTemplate_(est, kind, s, user) {
  const t = s.emails.templates[kind]; const v = vars_(est, s, user);
  const subject = fill_(t.subject, v); const body = fill_(t.body, v);
  const sig = signature_();
  const track = s.emails.trackingUrl ? `<img src="${s.emails.trackingUrl}?e=${encodeURIComponent(est.id)}&k=${kind}&t=${Date.now()}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${esc_(body).replace(/\n/g, '<br>')}</div>${sig ? '<br><div>' + sig + '</div>' : ''}${track}`;
  GmailApp.sendEmail(est.client.email, subject, body, { htmlBody: html, name: user.name });
}


/* ---------- Online acceptance and variation approval ----------
   The estimate and variation emails link here. The client sees a short summary, enters their name
   (and PO for an estimate), and their answer is saved to client-responses.json, which the app picks up. */
function findEst_(data, id) { return (data.estimates || []).find(x => x.id === id && !x.deleted); }
function money_(n) { return '$' + Number(n || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function responses_() {
  const folder = DriveApp.getFolderById(FOLDER_ID); const it = folder.getFilesByName('client-responses.json');
  const file = it.hasNext() ? it.next() : folder.createFile('client-responses.json', JSON.stringify({ responses: [] }), 'application/json');
  return { file, j: JSON.parse(file.getBlob().getDataAsString() || '{"responses":[]}') };
}
function clientPage_(p) {
  const data = loadData_(); const est = data && findEst_(data, p.e); const logo = APP_LINK + 'logo.png';
  const shell = (title, inner) => HtmlService.createHtmlOutput(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc_(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;800&display=swap" rel="stylesheet"><style>
    body{margin:0;background:#f3f4f1;color:#15171a;font-family:Archivo,Arial,sans-serif}.bar{height:8px;background:#f5c400}.top{background:#fff;padding:14px 18px;border-bottom:1px solid #e3e6e8}.top img{width:170px;display:block}
    main{max-width:520px;margin:0 auto;padding:20px 18px 40px}h1{font-size:26px;margin:4px 0 12px;line-height:1.15}.k{font-size:13px;font-weight:700;color:#5c636b;margin:0}
    .price{background:#15171a;color:#fff;border-radius:16px;padding:16px;margin:12px 0}.price p{margin:0;font-size:13px;color:#c9ced3}.price b{display:block;font-size:30px;color:#f5c400;margin:2px 0}
    .box{background:#fff;border-radius:14px;padding:14px;margin:12px 0;font-size:15px;line-height:1.5;white-space:pre-wrap}
    label{display:block;font-size:14px;font-weight:700;color:#4a5158;margin:12px 0 6px}input[type=text]{font:inherit;font-size:17px;width:100%;box-sizing:border-box;height:52px;border:1px solid #d9dde0;border-radius:12px;padding:0 12px}
    .tick{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin:14px 0;font-weight:600;color:#15171a}.tick input{width:22px;height:22px;flex:none}
    button{font:inherit;font-weight:800;font-size:17px;width:100%;height:56px;border:0;border-radius:14px;background:#f5c400;cursor:pointer;margin-top:6px}button.no{background:#fff;border:1px solid #d9dde0;font-weight:700;font-size:15px;height:48px}
    .msg{background:#e2f2e6;color:#1e6b31;border-radius:14px;padding:16px;font-weight:700}.warn{background:#fdf0d8;color:#8a4b00}.hint{font-size:13px;color:#5c636b;text-align:center;margin-top:14px}
    </style></head><body><div class="bar"></div><div class="top"><img src="${logo}" alt="CH Engineering"></div><main>${inner}</main></body></html>`).setTitle(title).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  const phone = (data && data.settings && data.settings.company && data.settings.company.phone) || '022 609 0176';
  const call = `<p class="hint">Questions? Call ${esc_(phone)}</p>`;
  if (!est) return shell('Link not found', `<h1>We couldn't find that</h1><div class="msg warn">This link isn't working any more. Please give us a call.</div>${call}`);
  const num = est.number + (est.rev ? ' Rev ' + est.rev : ''); const done = responses_().j.responses;
  const script = (payload, okText) => `<script>function go(d){const b=document.getElementById('go');const n=document.getElementById('nm').value.trim();const po=document.getElementById('po')?document.getElementById('po').value.trim():'';
    if(!n){alert('Please add your name');return;} ${p.a === 'accept' ? "if(!po){alert('Please add your PO number or reference');return;} if(!document.getElementById('ok').checked){alert('Please tick to accept the terms');return;}" : ''}
    b.disabled=true;b.textContent='Sending…';google.script.run.withSuccessHandler(function(m){document.querySelector('main').innerHTML='<div class=\"msg\">'+m+'</div>';}).withFailureHandler(function(er){alert(er.message||er);b.disabled=false;b.textContent='Try again';}).clientRespond(Object.assign(${JSON.stringify(payload)},{name:n,po:po,decision:d}));}</script>`;
  if (p.a === 'accept') {
    if (!est.acceptToken || p.t !== est.acceptToken) return shell('Link not found', `<h1>We couldn't find that</h1><div class="msg warn">This link isn't working any more. Please give us a call.</div>${call}`);
    if (est.status === 'accepted' || done.some(r => r.type === 'accept' && r.estId === est.id)) return shell('Already accepted', `<p class="k">Estimate ${esc_(num)}</p><h1>${esc_(est.heading || '')}</h1><div class="msg">This estimate has already been accepted. Thank you, we'll be in touch.</div>${call}`);
    if (est.expiry && est.expiry < today_()) return shell('Pricing has expired', `<p class="k">Estimate ${esc_(num)}</p><h1>${esc_(est.heading || '')}</h1><div class="msg warn">The pricing on this estimate was held until ${longDate_(est.expiry)}. Please give us a call and we'll confirm it for you.</div>${call}`);
    const v = vars_(est, data.settings, {}); const dep = est.acceptInfo && est.acceptInfo.depositPct || data.settings.estimate.depositPct || 25;
    return shell(`Accept estimate ${num}`, `<p class="k">Estimate ${esc_(num)}</p><h1>${esc_(est.heading || 'Your estimate')}</h1>
      <div class="price"><p>Total excl GST</p><b>${v.total}</b><p>A ${dep}% deposit is required before manufacture.${est.expiry ? ' Valid until ' + longDate_(est.expiry) + '.' : ''}</p></div>
      <p style="font-size:14px">The full estimate is attached to our email.</p>
      <label for="nm">Your name</label><input type="text" id="nm" autocomplete="name" value="${esc_(est.client.name || '')}">
      <label for="po">Your PO number or reference</label><input type="text" id="po" autocomplete="off">
      <label class="tick"><input type="checkbox" id="ok"> I accept this estimate and its terms and conditions</label>
      <button id="go" onclick="go('accept')">Accept estimate</button>${call}${script({ type: 'accept', e: est.id, t: p.t })}`);
  }
  const va = (est.variations || []).find(x => x.id === p.v && !x.deleted);
  if (!va || !va.token || p.t !== va.token) return shell('Link not found', `<h1>We couldn't find that</h1><div class="msg warn">This link isn't working any more. Please give us a call.</div>${call}`);
  if (va.status === 'approved' || va.status === 'declined' || done.some(r => r.type === 'variation' && r.varId === va.id)) return shell('Already answered', `<p class="k">Variation V${va.n} to ${esc_(num)}</p><h1>${esc_(va.title)}</h1><div class="msg">Thanks, we've already got your answer on this one.</div>${call}`);
  return shell(`Variation V${va.n}`, `<p class="k">Variation V${va.n} to ${esc_(num)}</p><h1>${esc_(va.title)}</h1><div class="box">${esc_(va.desc || '')}</div>
    <div class="price"><p>Price for this change, excl GST</p><b>${money_(va.price)}</b>${va.delivery ? `<p>${esc_(va.delivery)}</p>` : ''}</div>
    <label for="nm">Your name</label><input type="text" id="nm" autocomplete="name" value="${esc_(est.client.name || '')}">
    <button id="go" onclick="go('approve')">Approve this variation</button><button class="no" onclick="go('decline')">Decline</button>${call}${script({ type: 'variation', e: est.id, v: va.id, t: p.t })}`);
}
/* called from the client's page */
function clientRespond(r) {
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const data = loadData_(); const est = data && findEst_(data, r.e); if (!est) throw new Error('We could not find that estimate. Please give us a call.');
    let what = '';
    if (r.type === 'accept') { if (!est.acceptToken || r.t !== est.acceptToken) throw new Error('This link is not valid.'); what = `accepted estimate ${est.number}${est.rev ? ' Rev ' + est.rev : ''}`; }
    else { const va = (est.variations || []).find(x => x.id === r.v); if (!va || r.t !== va.token) throw new Error('This link is not valid.'); what = `${r.decision === 'approve' ? 'approved' : 'declined'} variation V${va.n} on ${est.number} (${va.title})`; }
    const ref = responses_();
    ref.j.responses.push({ type: r.type, estId: r.e, varId: r.v || '', decision: r.decision || 'accept', name: String(r.name || '').slice(0, 120), po: String(r.po || '').slice(0, 120), at: Date.now() });
    ref.file.setContent(JSON.stringify(ref.j));
    const to = est.sentBy || Session.getEffectiveUser().getEmail();
    try { GmailApp.sendEmail(to, `${r.name} ${what}`, `${r.name} ${what}${r.po ? '\nPO / reference: ' + r.po : ''}.\n\nOpen the app to check the details${r.type === 'accept' ? ' and send the deposit details to accounts' : ''}:\n${APP_LINK}`); } catch (er) {}
    return r.type === 'accept' ? 'Thank you, your acceptance has been received. We\'ll be in touch about the deposit and next steps.' : (r.decision === 'approve' ? 'Thanks, the variation is approved. We\'ll take it from here.' : 'Thanks, we\'ve noted that you\'ve declined this variation. We\'ll be in touch.');
  } finally { lock.releaseLock(); }
}
