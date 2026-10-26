/**
 * CH Engineering Estimates – Google helper script
 *
 * What it does, every morning:
 *  - Sends (or lines up for approval) the 1-week and 2-week follow-up emails for estimates YOU sent
 *  - Sends a reminder 3 days before an estimate's pricing expires
 *  - Sends review requests a set number of days after a job is marked complete
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
  if (sentNow.length || queuedNow.length) {
    let body = '';
    if (sentNow.length) body += 'These went out this morning:\n' + sentNow.map(x => ' - ' + x).join('\n') + '\n\n';
    if (queuedNow.length) body += 'These are ready for you to check and send (Follow-ups page in the app):\n' + queuedNow.map(x => ' - ' + x).join('\n') + '\n\n';
    body += APP_LINK + '#/followups';
    GmailApp.sendEmail(me, `Estimates: ${sentNow.length ? sentNow.length + ' follow-up' + (sentNow.length > 1 ? 's' : '') + ' sent' : ''}${sentNow.length && queuedNow.length ? ', ' : ''}${queuedNow.length ? queuedNow.length + ' waiting for you' : ''}`, body);
  }
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
