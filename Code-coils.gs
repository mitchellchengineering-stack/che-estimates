/**
 * CH Engineering Coil Tracker — Google Apps Script backend
 *
 * This script is the "engine" behind the app. It:
 *   - stores every coil, crew member and supplier in a Google Sheet ("Coil Register")
 *   - checks names + PINs and decides who is an admin
 *   - signs coils in, scans them out, prints-label bookkeeping
 *   - builds the monthly usage PDF and the consignment statement PDFs (with the logo)
 *   - runs automatically on the last working day of each month, with a safety re-run on the 1st
 *
 * FIRST TIME: set SETUP_ADMIN_NAME and SETUP_ADMIN_PIN below, then run setup() once.
 */

// ───────────────────────── Settings you can change ─────────────────────────
const SETUP_ADMIN_NAME = 'Davin';   // first admin, created by setup()
const SETUP_ADMIN_PIN = '';           // 4–6 digits. Fill in before running setup(), then clear it again.

const TZ = 'Pacific/Auckland';
const APP_FOLDER_NAME = 'CH Engineering Coil Tracker';
const USAGE_FOLDER_NAME = 'Coil Usage Reports';
const COMPANY_NAME = 'CH Engineering';
// Watermark: paste the ID of your "Statement template" Google Doc here (the long code in its web address, between /d/ and /edit).
// Leave it empty to keep the plain statements with no watermark.
const WATERMARK_TEMPLATE_DOC_ID = '';
const LOGO_URL = 'https://mitchellchengineering-stack.github.io/coil-tracker/logo.png'; // logo used on the PDFs
const TOKEN_DAYS = 60;          // how long a phone stays signed in
const MAX_PIN_ATTEMPTS = 5;     // wrong PINs before a short lockout
const LOCK_MINUTES = 10;
const MONTH_END_HOUR = 17;      // last-working-day run happens between 5pm and 6pm
const DEFAULT_SUPPLIERS = [['Steel & Tube', 'Yes'], ['Fletcher Steel', 'No']];

// ───────────────────────── Sheet layout ─────────────────────────
const SHEETS = {
  coils: { name: 'Coils', headers: ['Key', 'Coil ID', 'Supplier', 'Consignment', 'Grade', 'Width (mm)', 'Thickness (BMT)', 'Weight (kg)', 'Status', 'Signed in', 'Signed in by', 'Scanned out', 'Scanned out by', 'Labels printed', 'Notes', 'Counts in month'] },
  crew: { name: 'Crew', headers: ['Name', 'Role', 'Active', 'PIN hash', 'Salt', 'Failed attempts', 'Locked until', 'Added'] },
  suppliers: { name: 'Suppliers', headers: ['Name', 'Consignment', 'Added'] },
  closed: { name: 'Closed days', headers: ['Date', 'Reason'] },
  reports: { name: 'Report log', headers: ['Month', 'Report', 'Supplier', 'File name', 'Link', 'Created', 'Trigger'] },
  coiljobs: { name: 'Coil jobs', headers: ['Coil key', 'Job', 'Assigned', 'Assigned by'] },
  activejobs: { name: 'Active jobs', headers: ['Job', 'Client', 'Updated'] },
};
const C = { key: 0, id: 1, supplier: 2, cons: 3, grade: 4, width: 5, thick: 6, kg: 7, status: 8, inAt: 9, inBy: 10, outAt: 11, outBy: 12, printed: 13, notes: 14, countsIn: 15 };
const W = { name: 0, role: 1, active: 2, hash: 3, salt: 4, fails: 5, lockedUntil: 6, added: 7 };
const IN_STOCK = 'In stock';
const USED = 'Used';

// ───────────────────────── One-time setup ─────────────────────────
function setup() {
  if (!/^\d{4,6}$/.test(SETUP_ADMIN_PIN)) {
    throw new Error('Set SETUP_ADMIN_PIN (4–6 digits) at the top of Code.gs before running setup().');
  }
  const props = PropertiesService.getScriptProperties();

  let folder = props.getProperty('FOLDER_ID') ? DriveApp.getFolderById(props.getProperty('FOLDER_ID')) : null;
  if (!folder) {
    folder = DriveApp.createFolder(APP_FOLDER_NAME);
    props.setProperty('FOLDER_ID', folder.getId());
  }

  let ss = props.getProperty('SHEET_ID') ? SpreadsheetApp.openById(props.getProperty('SHEET_ID')) : null;
  if (!ss) {
    ss = SpreadsheetApp.create('Coil Register');
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    props.setProperty('SHEET_ID', ss.getId());
  }
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SHEETS).forEach(k => ensureSheet_(ss, SHEETS[k]));
  const blank = ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 1) ss.deleteSheet(blank);
  SS_ = ss;

  if (!props.getProperty('TOKEN_SECRET')) {
    props.setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }

  const sup = sheet_('suppliers');
  if (sup.getLastRow() < 2) DEFAULT_SUPPLIERS.forEach(s => sup.appendRow([s[0], s[1], new Date()]));

  if (!findCrew_(SETUP_ADMIN_NAME)) {
    const salt = Utilities.getUuid();
    sheet_('crew').appendRow([SETUP_ADMIN_NAME, 'Admin', 'Yes', hashPin_(SETUP_ADMIN_PIN, salt), salt, 0, '', new Date()]);
  }

  usageFolder_();

  // Daily timers: month-end check at 5pm, safety top-up check at 1am.
  ScriptApp.getProjectTriggers()
    .filter(t => ['monthEndCheck', 'firstOfMonthCheck'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monthEndCheck').timeBased().everyDays(1).atHour(MONTH_END_HOUR).inTimezone(TZ).create();
  ScriptApp.newTrigger('firstOfMonthCheck').timeBased().everyDays(1).atHour(1).inTimezone(TZ).create();

  Logger.log('All set. Drive folder: ' + folder.getUrl());
  Logger.log('Coil Register sheet: ' + ss.getUrl());
}

// ───────────────────────── Web endpoints ─────────────────────────
function doGet() {
  return json_({ ok: true, data: { app: 'CH Engineering Coil Tracker', time: new Date().toISOString() } });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'The app sent something the server could not read.' });
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const fn = ACTIONS[req.action];
    if (!fn) throw appError_('Unknown action: ' + req.action);
    return json_({ ok: true, data: fn(req) });
  } catch (err) {
    if (!err.app) console.error(err);
    return json_({ ok: false, error: err.message || String(err), code: err.code || '' });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* lock not held */ }
  }
}

const ACTIONS = {
  crewNames: () => readRows_('crew').filter(r => yes_(r.v[W.active])).map(r => String(r.v[W.name])).sort(),
  login: login_,
  bootstrap: bootstrap_,
  findCoil: findCoil_,
  scanOut: scanOut_,
  signIn: signIn_,
  updateCoil: updateCoil_,
  returnToStock: returnToStock_,
  setCountsIn: setCountsIn_,
  deleteCoil: deleteCoil_,
  markPrinted: markPrinted_,
  addSupplier: addSupplier_,
  updateSupplier: updateSupplier_,
  listCrew: listCrew_,
  addCrew: addCrew_,
  updateCrew: updateCrew_,
  months: months_,
  monthReport: req => { auth_(req, true); return buildReport_(checkMonth_(req.month)); },
  makePdf: makePdf_,
  // Added for the CH Engineering Estimates app
  allCoils: allCoilsAction_,
  assignJob: assignJob_,
  unassignJob: unassignJob_,
  setActiveJobs: setActiveJobs_,
  activeJobs: req => { auth_(req, false); return activeJobs_(); },
};

// ───────────────────────── Sign in / sessions ─────────────────────────
function login_(req) {
  const name = String(req.name || '').trim();
  const pin = String(req.pin || '').trim();
  const crew = findCrew_(name);
  if (!crew || !yes_(crew.v[W.active])) throw appError_('That name isn\'t on the crew list. Ask an admin to add you.');
  const sh = sheet_('crew');
  const lockedUntil = crew.v[W.lockedUntil];
  if (lockedUntil instanceof Date && lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
    throw appError_('Too many wrong PINs. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.');
  }
  if (hashPin_(pin, crew.v[W.salt]) !== crew.v[W.hash]) {
    const fails = (Number(crew.v[W.fails]) || 0) + 1;
    if (fails >= MAX_PIN_ATTEMPTS) {
      sh.getRange(crew.row, W.fails + 1, 1, 2).setValues([[0, new Date(Date.now() + LOCK_MINUTES * 60000)]]);
      throw appError_('Too many wrong PINs. Locked for ' + LOCK_MINUTES + ' minutes.');
    }
    sh.getRange(crew.row, W.fails + 1).setValue(fails);
    throw appError_('That PIN didn\'t match. ' + (MAX_PIN_ATTEMPTS - fails) + ' tries left.');
  }
  sh.getRange(crew.row, W.fails + 1, 1, 2).setValues([[0, '']]);
  const user = { name: String(crew.v[W.name]), role: String(crew.v[W.role]) };
  return { token: makeToken_(user.name), user: user };
}

function auth_(req, adminOnly) {
  const name = readToken_(req.token);
  const crew = name ? findCrew_(name) : null;
  if (!crew || !yes_(crew.v[W.active])) throw appError_('Please sign in again.', 'signed_out');
  const user = { name: String(crew.v[W.name]), role: String(crew.v[W.role]) };
  if (adminOnly && user.role !== 'Admin') throw appError_('Only admins can do that.', 'forbidden');
  return user;
}

function makeToken_(name) {
  const payload = JSON.stringify({ n: name, e: Date.now() + TOKEN_DAYS * 864e5 });
  return Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + sign_(payload);
}

function readToken_(token) {
  if (!token || String(token).indexOf('.') < 0) return null;
  const parts = String(token).split('.');
  let payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8');
  } catch (e) { return null; }
  if (sign_(payload) !== parts[1]) return null;
  const o = JSON.parse(payload);
  return o.e > Date.now() ? o.n : null;
}

function sign_(payload) {
  const secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret));
}

function hashPin_(pin, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin, Utilities.Charset.UTF_8));
}

// ───────────────────────── Coils ─────────────────────────
function bootstrap_(req) {
  const user = auth_(req, false);
  const thisMonth = monthKey_(new Date());
  const coils = allCoils_().filter(c => c.status === IN_STOCK || (c.scannedOutAt && usageMonth_(c) === thisMonth));
  const map = assignmentMap_();
  coils.forEach(c => { c.jobs = map[c.key] || []; });
  return { user: user, coils: coils, suppliers: suppliers_(), month: thisMonth, activeJobs: activeJobs_() };
}

function findCoil_(req) {
  auth_(req, false);
  const q = String(req.query || '').trim();
  const key = q.toUpperCase().indexOf('CHE|') === 0 ? normKey_(q.slice(4)) : null;
  const matches = allCoils_().filter(c => key ? c.key === key : normId_(c.coilId) === normId_(q));
  return { matches: matches };
}

function scanOut_(req) {
  const user = auth_(req, false);
  const hit = coilRow_(req.key);
  const c = hit.coil;
  if (c.status !== IN_STOCK) {
    throw appError_('Coil ' + c.coilId + ' was already scanned out by ' + c.scannedOutBy + ' on ' + fmtDate_(new Date(c.scannedOutAt)) + '.');
  }
  sheet_('coils').getRange(hit.row, C.status + 1, 1, 5).setValues([[USED, hit.v[C.inAt], hit.v[C.inBy], new Date(), user.name]]);
  sheet_('coils').getRange(hit.row, C.countsIn + 1).setValue('');
  if (req.job) addAssignment_(c.key, req.job, user.name);
  const out = coilRow_(req.key).coil;
  out.jobs = jobsFor_(out.key);
  return out;
}

function signIn_(req) {
  const user = auth_(req, true);
  const f = cleanCoilFields_(req);
  const key = makeKey_(f.supplier, f.coilId);
  if (allCoils_().some(c => c.key === key)) throw appError_('Coil ' + f.coilId + ' from ' + f.supplier + ' is already in the system.');
  sheet_('coils').appendRow([key, f.coilId, f.supplier, f.consignment ? 'Yes' : 'No', f.grade, f.width, f.thickness, f.weight, IN_STOCK, new Date(), user.name, '', '', 0, f.notes]);
  return coilRow_(key).coil;
}

function updateCoil_(req) {
  auth_(req, true);
  const hit = coilRow_(req.key);
  const f = cleanCoilFields_(req);
  const newKey = makeKey_(f.supplier, f.coilId);
  if (newKey !== hit.coil.key && allCoils_().some(c => c.key === newKey)) {
    throw appError_('Coil ' + f.coilId + ' from ' + f.supplier + ' is already in the system.');
  }
  const sh = sheet_('coils');
  sh.getRange(hit.row, 1, 1, 8).setValues([[newKey, f.coilId, f.supplier, f.consignment ? 'Yes' : 'No', f.grade, f.width, f.thickness, f.weight]]);
  sh.getRange(hit.row, C.notes + 1).setValue(f.notes);
  return coilRow_(newKey).coil;
}

function returnToStock_(req) {
  auth_(req, true);
  const hit = coilRow_(req.key);
  sheet_('coils').getRange(hit.row, C.status + 1).setValue(IN_STOCK);
  sheet_('coils').getRange(hit.row, C.outAt + 1, 1, 2).setValues([['', '']]);
  sheet_('coils').getRange(hit.row, C.countsIn + 1).setValue('');
  return coilRow_(req.key).coil;
}

// Push a used coil into next month's usage (e.g. Steel & Tube did their consignment check early), or move it back.
function setCountsIn_(req) {
  auth_(req, true);
  const hit = coilRow_(req.key);
  const c = hit.coil;
  if (c.status !== USED || !c.scannedOutAt) throw appError_('Only coils that have been scanned out can be moved between months.');
  const sh = sheet_('coils');
  const head = sh.getRange(1, C.countsIn + 1);
  if (!head.getValue()) head.setValue(SHEETS.coils.headers[C.countsIn]).setFontWeight('bold');
  const cell = sh.getRange(hit.row, C.countsIn + 1);
  cell.setNumberFormat('@');
  if (req.push) {
    cell.setValue(nextMonth_(monthKey_(new Date(c.scannedOutAt))));
  } else {
    cell.setValue('');
  }
  return coilRow_(req.key).coil;
}

function deleteCoil_(req) {
  auth_(req, true);
  const hit = coilRow_(req.key);
  if (hit.coil.status !== IN_STOCK) throw appError_('Only coils that are still in stock can be deleted. Return it to stock first if it was scanned out by mistake.');
  sheet_('coils').deleteRow(hit.row);
  return { deleted: hit.coil.key };
}

function markPrinted_(req) {
  auth_(req, true);
  const keys = (req.keys || []).map(normKey_);
  const sh = sheet_('coils');
  const out = [];
  readRows_('coils').forEach(r => {
    if (keys.indexOf(String(r.v[C.key])) >= 0) {
      const n = (Number(r.v[C.printed]) || 0) + 1;
      sh.getRange(r.row, C.printed + 1).setValue(n);
      r.v[C.printed] = n;
      out.push(coilObj_(r.v));
    }
  });
  return out;
}

function cleanCoilFields_(req) {
  const match = suppliers_().filter(s => s.name.toUpperCase() === String(req.supplier || '').trim().toUpperCase())[0];
  const supplier = match ? match.name : '';
  const coilId = String(req.coilId || '').trim().replace(/\s+/g, ' ');
  const width = Number(req.width);
  const thickness = Number(req.thickness);
  const weight = Number(String(req.weight || '').replace(/,/g, ''));
  if (!supplier) throw appError_('Pick a supplier from the list.');
  if (!coilId) throw appError_('Enter the coil ID from the supplier tag.');
  if (!(width > 0)) throw appError_('Pick the coil width.');
  if (!(thickness > 0)) throw appError_('Pick the thickness.');
  if (!(weight > 0)) throw appError_('Enter the coil weight in kg.');
  return {
    supplier: supplier, coilId: coilId, width: width, thickness: thickness, weight: weight,
    consignment: !!req.consignment, grade: String(req.grade || 'G550').trim() || 'G550',
    notes: String(req.notes || '').trim(),
  };
}

// ───────────────────────── Suppliers ─────────────────────────
function suppliers_() {
  return readRows_('suppliers').filter(r => r.v[0] !== '').map(r => ({ name: String(r.v[0]), consignment: yes_(r.v[1]) }));
}

function addSupplier_(req) {
  auth_(req, true);
  const name = String(req.name || '').trim();
  if (!name) throw appError_('Enter the supplier name.');
  if (name.indexOf('|') >= 0) throw appError_('Supplier names can\'t contain the | character.');
  if (suppliers_().some(s => s.name.toUpperCase() === name.toUpperCase())) throw appError_(name + ' is already on the list.');
  sheet_('suppliers').appendRow([name, req.consignment ? 'Yes' : 'No', new Date()]);
  return suppliers_();
}

function updateSupplier_(req) {
  auth_(req, true);
  const row = readRows_('suppliers').filter(r => String(r.v[0]).toUpperCase() === String(req.name || '').toUpperCase())[0];
  if (!row) throw appError_('Supplier not found.');
  sheet_('suppliers').getRange(row.row, 2).setValue(req.consignment ? 'Yes' : 'No');
  return suppliers_();
}

// ───────────────────────── Crew ─────────────────────────
function listCrew_(req) {
  auth_(req, true);
  return readRows_('crew').filter(r => r.v[W.name] !== '').map(r => ({
    name: String(r.v[W.name]),
    role: String(r.v[W.role]),
    active: yes_(r.v[W.active]),
    locked: r.v[W.lockedUntil] instanceof Date && r.v[W.lockedUntil].getTime() > Date.now(),
  }));
}

function addCrew_(req) {
  auth_(req, true);
  const name = String(req.name || '').trim();
  const pin = String(req.pin || '').trim();
  const role = req.role === 'Admin' ? 'Admin' : 'Worker';
  if (!name) throw appError_('Enter their name.');
  if (findCrew_(name)) throw appError_(name + ' is already on the crew list.');
  if (!/^\d{4,6}$/.test(pin)) throw appError_('PINs are 4 to 6 numbers.');
  const salt = Utilities.getUuid();
  sheet_('crew').appendRow([name, role, 'Yes', hashPin_(pin, salt), salt, 0, '', new Date()]);
  return listCrew_(req);
}

function updateCrew_(req) {
  const me = auth_(req, true);
  const crew = findCrew_(req.name);
  if (!crew) throw appError_('Crew member not found.');
  const sh = sheet_('crew');
  const isSelf = String(crew.v[W.name]).toLowerCase() === me.name.toLowerCase();
  const activeAdmins = readRows_('crew').filter(r => r.v[W.role] === 'Admin' && yes_(r.v[W.active])).length;
  const isActiveAdmin = crew.v[W.role] === 'Admin' && yes_(crew.v[W.active]);

  if (req.role && req.role !== crew.v[W.role]) {
    if (isActiveAdmin && activeAdmins <= 1) throw appError_('You need at least one admin.');
    sh.getRange(crew.row, W.role + 1).setValue(req.role === 'Admin' ? 'Admin' : 'Worker');
  }
  if (typeof req.active === 'boolean') {
    if (!req.active && isSelf) throw appError_('You can\'t deactivate yourself.');
    if (!req.active && isActiveAdmin && activeAdmins <= 1) throw appError_('You need at least one admin.');
    sh.getRange(crew.row, W.active + 1).setValue(req.active ? 'Yes' : 'No');
  }
  if (req.pin) {
    if (!/^\d{4,6}$/.test(String(req.pin))) throw appError_('PINs are 4 to 6 numbers.');
    const salt = Utilities.getUuid();
    sh.getRange(crew.row, W.hash + 1, 1, 4).setValues([[hashPin_(String(req.pin), salt), salt, 0, '']]);
  }
  return listCrew_(req);
}

function findCrew_(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  return readRows_('crew').filter(r => String(r.v[W.name]).trim().toLowerCase() === n)[0] || null;
}

// ───────────────────────── Monthly reports ─────────────────────────
function months_(req) {
  auth_(req, true);
  const set = {};
  set[monthKey_(new Date())] = true;
  allCoils_().forEach(c => { if (c.scannedOutAt) set[usageMonth_(c)] = true; });
  return Object.keys(set).sort().reverse().map(k => ({ key: k, label: monthLabel_(k) }));
}

function buildReport_(mk) {
  const coils = allCoils_();
  const used = coils
    .filter(c => c.status === USED && c.scannedOutAt && usageMonth_(c) === mk)
    .sort((a, b) => a.scannedOutAt < b.scannedOutAt ? -1 : 1);
  const stockAtEnd = coils.filter(c =>
    c.signedInAt && monthKey_(new Date(c.signedInAt)) <= mk &&
    (c.status === IN_STOCK || (c.scannedOutAt && usageMonth_(c) > mk)));

  const bySpec = {};
  used.forEach(c => {
    const k = [c.supplier, c.width, c.thickness].join('|');
    bySpec[k] = bySpec[k] || { supplier: c.supplier, width: c.width, thickness: c.thickness, count: 0, kg: 0 };
    bySpec[k].count++;
    bySpec[k].kg += c.weight;
  });

  const consNames = {};
  suppliers_().filter(s => s.consignment).forEach(s => { consNames[s.name] = true; });
  used.concat(stockAtEnd).filter(c => c.consignment).forEach(c => { consNames[c.supplier] = true; });
  const consignment = Object.keys(consNames).sort().map(name => {
    const u = used.filter(c => c.consignment && c.supplier === name);
    const s = stockAtEnd.filter(c => c.consignment && c.supplier === name).sort((a, b) => a.signedInAt < b.signedInAt ? -1 : 1);
    return { supplier: name, used: u, usedKg: sum_(u), stock: s, stockKg: sum_(s) };
  });

  const files = readRows_('reports').filter(r => String(r.v[0]) === mk).map(r => ({
    report: String(r.v[1]), supplier: String(r.v[2]), name: String(r.v[3]), url: String(r.v[4]), created: iso_(r.v[5]),
  }));

  return {
    month: mk, label: monthLabel_(mk),
    used: used, usedKg: sum_(used),
    bySpec: Object.keys(bySpec).map(k => bySpec[k]).sort((a, b) => (a.supplier + a.width + a.thickness).localeCompare(b.supplier + b.width + b.thickness)),
    consignment: consignment,
    files: files,
  };
}

function makePdf_(req) {
  auth_(req, true);
  const mk = checkMonth_(req.month);
  const rep = buildReport_(mk);
  let saved;
  if (req.type === 'consignment') {
    const block = rep.consignment.filter(b => b.supplier === req.supplier)[0];
    if (!block) throw appError_('No consignment stock for ' + req.supplier + ' in ' + rep.label + '.');
    saved = saveConsignmentPdf_(rep, block, 'Downloaded from app');
  } else {
    saved = saveUsagePdf_(rep, 'Downloaded from app');
  }
  return { name: saved.name, url: saved.url, base64: Utilities.base64Encode(saved.blob.getBytes()) };
}

// Runs every day at ~5pm. Only acts on the last working day of the month.
function monthEndCheck() {
  const now = new Date();
  if (!isLastWorkingDay_(now)) return;
  runMonthReports_(monthKey_(now), 'Last working day');
}

// Runs every day at ~1am. On the 1st, re-saves last month's PDFs if anything changed after the month-end run.
function firstOfMonthCheck() {
  const now = new Date();
  if (Utilities.formatDate(now, TZ, 'd') !== '1') return;
  const mk = monthKey_(new Date(now.getTime() - 36 * 3600 * 1000));
  const stored = PropertiesService.getScriptProperties().getProperty('FP_' + mk);
  if (stored !== fingerprint_(mk)) runMonthReports_(mk, stored ? '1st of month update' : '1st of month (missed run)');
}

function runMonthReports_(mk, trigger) {
  const rep = buildReport_(mk);
  saveUsagePdf_(rep, trigger);
  rep.consignment.forEach(block => saveConsignmentPdf_(rep, block, trigger));
  PropertiesService.getScriptProperties().setProperty('FP_' + mk, fingerprint_(mk));
}

function fingerprint_(mk) {
  const rep = buildReport_(mk);
  const sig = JSON.stringify([
    rep.used.map(c => c.key + ':' + c.weight),
    rep.consignment.map(b => [b.supplier, b.stock.map(c => c.key + ':' + c.weight)]),
  ]);
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, sig, Utilities.Charset.UTF_8));
}

function isLastWorkingDay_(d) {
  const closed = {};
  readRows_('closed').forEach(r => {
    if (r.v[0] instanceof Date) closed[Utilities.formatDate(r.v[0], TZ, 'yyyy-MM-dd')] = true;
  });
  const working = t => {
    const dow = Number(Utilities.formatDate(t, TZ, 'u')); // 1 = Mon … 7 = Sun
    return dow <= 5 && !closed[Utilities.formatDate(t, TZ, 'yyyy-MM-dd')];
  };
  if (!working(d)) return false;
  const mk = monthKey_(d);
  for (let t = new Date(d.getTime() + 864e5); monthKey_(t) === mk; t = new Date(t.getTime() + 864e5)) {
    if (working(t)) return false;
  }
  return true;
}

// ───────────────────────── PDFs ─────────────────────────
function saveUsagePdf_(rep, trigger) {
  const name = rep.label + ' Coil Usage';
  const w = tryDocPdf_(name, body => buildUsageDoc_(body, rep));
  if (w.blob) return storePdf_(usageFolder_(), name, w.blob, rep.month, 'Coil usage', '', trigger);
  const html = pdfShell_(name, usageBody_(rep));
  return savePdf_(usageFolder_(), name, html, rep.month, 'Coil usage', '', trigger + w.note);
}

function saveConsignmentPdf_(rep, block, trigger) {
  const name = rep.label + ' ' + block.supplier + ' Consignment';
  const w = tryDocPdf_(name, body => buildConsignmentDoc_(body, rep, block));
  if (w.blob) return storePdf_(consignmentFolder_(block.supplier), name, w.blob, rep.month, 'Consignment', block.supplier, trigger);
  const html = pdfShell_(block.supplier + ' consignment statement', consignmentBody_(rep, block));
  return savePdf_(consignmentFolder_(block.supplier), name, html, rep.month, 'Consignment', block.supplier, trigger + w.note);
}

function savePdf_(folder, name, html, mk, report, supplier, trigger) {
  const blob = Utilities.newBlob(html, 'text/html', name + '.html').getAs('application/pdf').setName(name + '.pdf');
  return storePdf_(folder, name, blob, mk, report, supplier, trigger);
}

function storePdf_(folder, name, blob, mk, report, supplier, trigger) {
  const old = folder.getFilesByName(name + '.pdf');
  while (old.hasNext()) old.next().setTrashed(true); // replace last version (stays in Drive bin for 30 days)
  const file = folder.createFile(blob);
  sheet_('reports').appendRow([mk, report, supplier, name + '.pdf', file.getUrl(), new Date(), trigger]);
  return { name: name + '.pdf', url: file.getUrl(), blob: blob };
}

function pdfShell_(title, body) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc_(title) + '</title><style>' +
    '@page{size:A4;margin:14mm 14mm 16mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#17191b;font-size:9.5pt;margin:0}' +
    'table.head{width:100%;border-collapse:collapse;border-bottom:3px solid #fee300;margin-bottom:14px}' +
    'table.head td{border:0;padding:0 0 8px;vertical-align:bottom}' +
    'table.head img{height:46px}' +
    'table.head td.meta{text-align:right;font-size:8.5pt;color:#555}' +
    'h1{font-size:17pt;margin:0 0 2px}' +
    'h2{font-size:11.5pt;margin:20px 0 6px;padding-bottom:3px;border-bottom:1px solid #ccc}' +
    'p.note{margin:0 0 10px;color:#444}' +
    'table.totals{width:auto;border-collapse:separate;border-spacing:0 0;margin:8px 0 4px}' +
    'table.totals td{border:1px solid #d5dadd;border-left:4px solid #fee300;padding:6px 12px;min-width:130px}' +
    'table.totals td.gap{border:0;min-width:10px;padding:0}' +
    '.tot b{display:block;font-size:14pt}' +
    'table{width:100%;border-collapse:collapse;margin-top:4px}' +
    'th{text-align:left;font-size:8pt;color:#555;border-bottom:1.5px solid #17191b;padding:4px 5px}' +
    'td{border-bottom:1px solid #e3e6e8;padding:4px 5px}' +
    'td.n,th.n{text-align:right}' +
    'tr.sum td{font-weight:bold;border-top:1.5px solid #17191b;border-bottom:none}' +
    '.empty{color:#777;font-style:italic;padding:6px 0}' +
    'tr.grp td{background:#f2f3f4;font-weight:bold;border-top:1.5px solid #17191b;border-bottom:1px solid #d5dadd;padding-top:6px}' +
    'tr.sub td{font-weight:bold;border-bottom:none;padding-bottom:10px}' +
    'tr.sub td.lbl{color:#555;font-weight:normal}' +
    '</style></head><body>' + body +
    '</body></html>';
}

function header_(title, sub) {
  const data = logoData_();
  const logo = data ? '<img src="data:image/png;base64,' + data + '">' : '<b>' + esc_(COMPANY_NAME) + '</b>';
  return '<table class="head"><tr><td>' + logo + '</td><td class="meta"><h1>' + esc_(title) + '</h1>' + esc_(sub) + '</td></tr></table>';
}

// Fetches the logo from the GitHub site and keeps a copy for 6 hours.
function logoData_() {
  try {
    const cache = CacheService.getScriptCache();
    let data = cache.get('logo');
    if (data) return data;
    data = Utilities.base64Encode(UrlFetchApp.fetch(LOGO_URL).getBlob().getBytes());
    if (data.length < 100000) cache.put('logo', data, 21600);
    return data;
  } catch (e) {
    return '';
  }
}

function usageBody_(rep) {
  let h = header_(rep.label + ' coil usage', 'All coils scanned out of the steel shed');
  h += '<table class="totals"><tr><td class="tot">Coils used<b>' + rep.used.length + '</b></td><td class="gap"></td><td class="tot">Total weight<b>' + kg_(rep.usedKg) + '</b></td></tr></table>';
  h += '<h2>Summary by supplier and size</h2>';
  if (!rep.bySpec.length) {
    h += '<div class="empty">No coils were scanned out this month.</div>';
  } else {
    h += '<table><tr><th>Supplier</th><th>Width</th><th>Thickness</th><th class="n">Coils</th><th class="n">Weight</th></tr>';
    rep.bySpec.forEach(s => {
      h += '<tr><td>' + esc_(s.supplier) + '</td><td>' + s.width + ' mm</td><td>' + bmt_(s.thickness) + '</td><td class="n">' + s.count + '</td><td class="n">' + kg_(s.kg) + '</td></tr>';
    });
    h += '<tr class="sum"><td colspan="3">Total</td><td class="n">' + rep.used.length + '</td><td class="n">' + kg_(rep.usedKg) + '</td></tr></table>';
    h += '<h2>Coils used</h2>' + coilTable_(rep.used, true);
  }
  return h;
}

function consignmentBody_(rep, b) {
  const endLabel = monthEndLabel_(rep.month);
  let h = header_(b.supplier + ' consignment', rep.label + ' statement from ' + COMPANY_NAME);
  h += '<h2>Used in ' + esc_(rep.label) + ' (to invoice)</h2>' + sizeGroupedTable_(b.used, false);
  h += '<h2>Still in stock at ' + esc_(endLabel) + '</h2>' + sizeGroupedTable_(b.stock, true);
  return h;
}

// One block per width × thickness, each with its own subtotal. No grand total,
// because each size is priced separately.
function sizeGroupedTable_(list, showReceived) {
  if (!list.length) return '<div class="empty">None.</div>';
  const groups = {};
  list.forEach(c => {
    const k = c.width + '|' + Number(c.thickness).toFixed(2);
    (groups[k] = groups[k] || []).push(c);
  });
  const keys = Object.keys(groups).sort((a, b) => {
    const pa = a.split('|').map(Number), pb = b.split('|').map(Number);
    return pa[0] - pb[0] || pa[1] - pb[1];
  });
  const cols = showReceived ? 4 : 3;
  let h = '<table><tr><th>Coil ID</th><th>Grade</th>' + (showReceived ? '<th>Received</th>' : '') + '<th class="n">Weight</th></tr>';
  keys.forEach(k => {
    const g = groups[k];
    const size = g[0].width + ' mm × ' + bmt_(g[0].thickness);
    h += '<tr class="grp"><td colspan="' + cols + '">' + size + '</td></tr>';
    g.forEach(c => {
      h += '<tr><td><b>' + esc_(c.coilId) + '</b></td><td>' + esc_(c.grade) + '</td>' +
        (showReceived ? '<td>' + fmtDate_(new Date(c.signedInAt)) + '</td>' : '') +
        '<td class="n">' + kg_(c.weight) + '</td></tr>';
    });
    h += '<tr class="sub"><td class="lbl" colspan="' + (cols - 1) + '">' + size + ' total (' + g.length + ' coil' + (g.length === 1 ? '' : 's') + ')</td><td class="n">' + kg_(sum_(g)) + '</td></tr>';
  });
  return h + '</table>';
}

function coilTable_(list, usedCols, withTotal) {
  if (!list.length) return '<div class="empty">None.</div>';
  let h = '<table><tr><th>Coil ID</th>' + (withTotal ? '' : '<th>Supplier</th>') + '<th>Grade</th><th>Width</th><th>Thickness</th>' +
    (usedCols ? '<th>Opened</th><th>By</th>' : '<th>Received</th>') + '<th class="n">Weight</th></tr>';
  list.forEach(c => {
    h += '<tr><td><b>' + esc_(c.coilId) + '</b></td>' + (withTotal ? '' : '<td>' + esc_(c.supplier) + '</td>') +
      '<td>' + esc_(c.grade) + '</td><td>' + c.width + ' mm</td><td>' + bmt_(c.thickness) + '</td>' +
      (usedCols ? '<td>' + fmtDate_(new Date(c.scannedOutAt)) + '</td><td>' + esc_(c.scannedOutBy) + '</td>' : '<td>' + fmtDate_(new Date(c.signedInAt)) + '</td>') +
      '<td class="n">' + kg_(c.weight) + '</td></tr>';
  });
  if (withTotal) {
    h += '<tr class="sum"><td colspan="' + (usedCols ? 6 : 5) + '">Total (' + list.length + ' coil' + (list.length === 1 ? '' : 's') + ')</td><td class="n">' + kg_(sum_(list)) + '</td></tr>';
  }
  return h + '</table>';
}

// ───────────────────────── Watermarked statements (Google Doc template → PDF) ─────────────────────────
// The plain HTML → PDF converter can't draw a watermark, so when WATERMARK_TEMPLATE_DOC_ID is set the statement is
// built inside a copy of your template Doc (which carries the watermark) and exported from there.
// If anything goes wrong the plain statement is saved instead, and the reason is added to the Report log "Trigger" column.
function tryDocPdf_(name, build) {
  if (!WATERMARK_TEMPLATE_DOC_ID) return { blob: null, note: '' };
  let copy = null;
  try {
    copy = DriveApp.getFileById(WATERMARK_TEMPLATE_DOC_ID).makeCopy(name + ' (working copy)');
    const doc = DocumentApp.openById(copy.getId());
    const body = doc.getBody();
    body.clear();
    body.setPageWidth(595.28);
    body.setPageHeight(841.89);
    body.setMarginLeft(40);
    body.setMarginRight(40);
    body.setMarginTop(40);
    body.setMarginBottom(45);
    build(body);
    // drop the blank paragraph clear() leaves at the top, and shrink the spacer paragraphs between tables
    for (let i = body.getNumChildren() - 1; i >= 0; i--) {
      const el = body.getChild(i);
      if (el.getType() === DocumentApp.ElementType.PARAGRAPH && el.asParagraph().getText() === '') {
        if (i === 0 && body.getNumChildren() > 1) body.removeChild(el);
        else el.asParagraph().setAttributes(docAttr_({ size: 4 }));
      }
    }
    doc.saveAndClose();
    const blob = DriveApp.getFileById(copy.getId()).getAs('application/pdf').setName(name + '.pdf');
    return { blob: blob, note: '' };
  } catch (err) {
    console.error('Watermarked statement failed: ' + err);
    return { blob: null, note: ' (no watermark: ' + String(err && err.message || err).slice(0, 90) + ')' };
  } finally {
    if (copy) { try { copy.setTrashed(true); } catch (e2) { /* ignore */ } }
  }
}

// Run this from the Apps Script editor to test the watermark. The result shows in the Execution log.
function testWatermark() {
  if (!WATERMARK_TEMPLATE_DOC_ID) { Logger.log('Set WATERMARK_TEMPLATE_DOC_ID at the top of Code.gs first.'); return; }
  const rep = buildReport_(monthKey_(new Date()));
  const w = tryDocPdf_('Watermark test', body => buildUsageDoc_(body, rep));
  if (!w.blob) { Logger.log('FAILED' + w.note); return; }
  const file = usageFolder_().createFile(w.blob);
  Logger.log('Worked. Open this and check the watermark: ' + file.getUrl());
}

function docAttr_(o) {
  const a = {};
  a[DocumentApp.Attribute.FONT_FAMILY] = 'Arial';
  a[DocumentApp.Attribute.FONT_SIZE] = o.size || 9;
  a[DocumentApp.Attribute.BOLD] = !!o.bold;
  a[DocumentApp.Attribute.ITALIC] = !!o.italic;
  a[DocumentApp.Attribute.FOREGROUND_COLOR] = o.color || '#17191b';
  a[DocumentApp.Attribute.SPACING_BEFORE] = o.before || 0;
  a[DocumentApp.Attribute.SPACING_AFTER] = o.after || 0;
  a[DocumentApp.Attribute.LINE_SPACING] = 1;
  a[DocumentApp.Attribute.HORIZONTAL_ALIGNMENT] = o.align === 'right' ? DocumentApp.HorizontalAlignment.RIGHT : DocumentApp.HorizontalAlignment.LEFT;
  return a;
}

function docCell_(cell, text, o) {
  o = o || {};
  cell.setText(String(text));
  cell.getChild(0).asParagraph().setAttributes(docAttr_(o));
  const pad = o.pad == null ? 3 : o.pad;
  cell.setPaddingTop(pad);
  cell.setPaddingBottom(pad);
  cell.setPaddingLeft(4);
  cell.setPaddingRight(4);
  if (o.bg) cell.setBackgroundColor(o.bg);
}

// rows: array of rows; each cell is a string or [string, options]
function docTable_(body, rows, widths, noBorder) {
  const t = body.appendTable(rows.map(r => r.map(c => String(Array.isArray(c) ? c[0] : c))));
  t.setBorderColor('#d5dadd');
  t.setBorderWidth(noBorder ? 0 : 0.5);
  rows.forEach((r, i) => r.forEach((c, j) => {
    docCell_(t.getCell(i, j), Array.isArray(c) ? c[0] : c, Array.isArray(c) ? c[1] : {});
  }));
  if (widths) widths.forEach((w, j) => t.setColumnWidth(j, w));
  return t;
}

function docH2_(body, text) {
  body.appendParagraph(text).setAttributes(docAttr_({ size: 11.5, bold: true, before: 14, after: 4 }));
}

function docNote_(body, text) {
  body.appendParagraph(text).setAttributes(docAttr_({ italic: true, color: '#777', before: 4 }));
}

function docHeader_(body, title, sub) {
  const t = body.appendTable([['', '']]);
  t.setBorderWidth(0);
  t.setColumnWidth(0, 230);
  t.setColumnWidth(1, 285);
  const left = t.getCell(0, 0), right = t.getCell(0, 1);
  docCell_(left, '', { pad: 0 });
  const data = logoData_();
  if (data) {
    const img = left.getChild(0).asParagraph().appendInlineImage(Utilities.newBlob(Utilities.base64Decode(data), 'image/png', 'logo.png'));
    const ratio = img.getWidth() / img.getHeight();
    img.setHeight(46);
    img.setWidth(Math.round(46 * ratio));
  } else {
    docCell_(left, COMPANY_NAME, { size: 14, bold: true });
  }
  docCell_(right, title, { size: 17, bold: true, align: 'right', pad: 0 });
  right.appendParagraph(sub).setAttributes(docAttr_({ size: 8.5, color: '#555', align: 'right' }));
  left.setVerticalAlignment(DocumentApp.VerticalAlignment.BOTTOM);
  right.setVerticalAlignment(DocumentApp.VerticalAlignment.BOTTOM);
  // yellow rule under the header
  const bar = body.appendTable([[' ']]);
  bar.setBorderWidth(0);
  docCell_(bar.getCell(0, 0), ' ', { size: 1, pad: 0, bg: '#fee300' });
  bar.getRow(0).setMinimumHeight(3);
}

function buildUsageDoc_(body, rep) {
  const lab = { size: 8, color: '#555', bg: '#f2f3f4' }, val = { size: 13, bold: true };
  const th = { size: 8, bold: true, color: '#555', bg: '#f2f3f4' }, thr = { size: 8, bold: true, color: '#555', bg: '#f2f3f4', align: 'right' };
  const r = { align: 'right' };
  docHeader_(body, rep.label + ' coil usage', 'All coils scanned out of the steel shed');
  docTable_(body, [[['Coils used', lab], [String(rep.used.length), val], ['Total weight', lab], [kg_(rep.usedKg), val]]], [90, 70, 90, 120], false);
  docH2_(body, 'Summary by supplier and size');
  if (!rep.bySpec.length) { docNote_(body, 'No coils were scanned out this month.'); return; }
  const rows = [[['Supplier', th], ['Width', th], ['Thickness', th], ['Coils', thr], ['Weight', thr]]];
  rep.bySpec.forEach(s => rows.push([s.supplier, s.width + ' mm', bmt_(s.thickness), [String(s.count), r], [kg_(s.kg), r]]));
  const sum = { bold: true, bg: '#f2f3f4' }, sumr = { bold: true, bg: '#f2f3f4', align: 'right' };
  rows.push([['Total', sum], ['', sum], ['', sum], [String(rep.used.length), sumr], [kg_(rep.usedKg), sumr]]);
  docTable_(body, rows, [150, 80, 90, 70, 125]);
  docH2_(body, 'Coils used');
  const rows2 = [[['Coil ID', th], ['Supplier', th], ['Grade', th], ['Width', th], ['Thickness', th], ['Opened', th], ['By', th], ['Weight', thr]]];
  rep.used.forEach(c => rows2.push([[c.coilId, { bold: true }], c.supplier, c.grade, c.width + ' mm', bmt_(c.thickness), fmtDate_(new Date(c.scannedOutAt)), c.scannedOutBy, [kg_(c.weight), r]]));
  docTable_(body, rows2, [68, 78, 40, 50, 58, 70, 66, 85]);
}

function buildConsignmentDoc_(body, rep, b) {
  docHeader_(body, b.supplier + ' consignment', rep.label + ' statement from ' + COMPANY_NAME);
  docH2_(body, 'Used in ' + rep.label + ' (to invoice)');
  docSizeGrouped_(body, b.used, false);
  docH2_(body, 'Still in stock at ' + monthEndLabel_(rep.month));
  docSizeGrouped_(body, b.stock, true);
}

// One block per width × thickness, each with its own subtotal (each size is priced separately, so no grand total).
function docSizeGrouped_(body, list, showReceived) {
  if (!list.length) { docNote_(body, 'None.'); return; }
  const th = { size: 8, bold: true, color: '#555', bg: '#f2f3f4' }, thr = { size: 8, bold: true, color: '#555', bg: '#f2f3f4', align: 'right' };
  const grp = { bold: true, bg: '#e7e9eb' }, grpr = { bold: true, bg: '#e7e9eb', align: 'right' };
  const groups = {};
  list.forEach(c => { const k = c.width + '|' + Number(c.thickness).toFixed(2); (groups[k] = groups[k] || []).push(c); });
  const keys = Object.keys(groups).sort((a, b) => { const pa = a.split('|').map(Number), pb = b.split('|').map(Number); return pa[0] - pb[0] || pa[1] - pb[1]; });
  const blank = n => { const out = []; for (let i = 0; i < n; i++) out.push(['', grp]); return out; };
  const rows = [showReceived
    ? [['Coil ID', th], ['Grade', th], ['Received', th], ['Weight', thr]]
    : [['Coil ID', th], ['Grade', th], ['Weight', thr]]];
  keys.forEach(k => {
    const g = groups[k];
    const size = g[0].width + ' mm × ' + bmt_(g[0].thickness);
    rows.push([[size, grp]].concat(blank(showReceived ? 3 : 2)));
    g.forEach(c => rows.push(showReceived
      ? [[c.coilId, { bold: true }], c.grade, fmtDate_(new Date(c.signedInAt)), [kg_(c.weight), { align: 'right' }]]
      : [[c.coilId, { bold: true }], c.grade, [kg_(c.weight), { align: 'right' }]]));
    const label = [size + ' total (' + g.length + ' coil' + (g.length === 1 ? '' : 's') + ')', { color: '#555' }];
    const total = [kg_(sum_(g)), { bold: true, align: 'right' }];
    rows.push(showReceived ? [label, '', '', total] : [label, '', total]);
  });
  docTable_(body, rows, showReceived ? [215, 100, 100, 100] : [250, 130, 135]);
}

// ───────────────────────── Drive folders ─────────────────────────
function appFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
  if (!id) throw appError_('Run setup() first.');
  return DriveApp.getFolderById(id);
}

function subFolder_(name) {
  const parent = appFolder_();
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function usageFolder_() { return subFolder_(USAGE_FOLDER_NAME); }
function consignmentFolder_(supplier) { return subFolder_(supplier + ' Coil Charges'); }

// ───────────────────────── Helpers ─────────────────────────
let SS_;
function ss_() {
  if (!SS_) {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    if (!id) throw appError_('Run setup() first.');
    SS_ = SpreadsheetApp.openById(id);
  }
  return SS_;
}
function sheet_(k) {
  const ss = ss_();
  return ss.getSheetByName(SHEETS[k].name) || ensureSheet_(ss, SHEETS[k]);
}

function ensureSheet_(ss, def) {
  const sh = ss.getSheetByName(def.name) || ss.insertSheet(def.name);
  sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function readRows_(k) {
  const sh = sheet_(k);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, SHEETS[k].headers.length).getValues().map((v, i) => ({ row: i + 2, v: v }));
}

function allCoils_() {
  return readRows_('coils').filter(r => r.v[C.key] !== '').map(r => coilObj_(r.v));
}

function coilRow_(key) {
  const k = normKey_(key);
  const r = readRows_('coils').filter(x => String(x.v[C.key]) === k)[0];
  if (!r) throw appError_('That coil isn\'t in the system any more. Refresh the list.');
  return { row: r.row, v: r.v, coil: coilObj_(r.v) };
}

function coilObj_(v) {
  return {
    key: String(v[C.key]), coilId: String(v[C.id]), supplier: String(v[C.supplier]), consignment: yes_(v[C.cons]),
    grade: String(v[C.grade]), width: Number(v[C.width]) || 0, thickness: Number(v[C.thick]) || 0, weight: Number(v[C.kg]) || 0,
    status: String(v[C.status]), signedInAt: iso_(v[C.inAt]), signedInBy: String(v[C.inBy]),
    scannedOutAt: iso_(v[C.outAt]), scannedOutBy: String(v[C.outBy]), labelsPrinted: Number(v[C.printed]) || 0, notes: String(v[C.notes] || ''),
    countsIn: v[C.countsIn] instanceof Date ? monthKey_(v[C.countsIn]) : String(v[C.countsIn] || ''),
  };
}

function makeKey_(supplier, coilId) { return normKey_(supplier + '|' + coilId); }
function normKey_(k) { return String(k || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function normId_(s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); }
function yes_(v) { return v === true || /^(yes|y|true)$/i.test(String(v).trim()); }
function iso_(d) { return d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : ''); }
function sum_(list) { return list.reduce((t, c) => t + (Number(c.weight) || 0), 0); }
// The month a used coil counts in: a manual override if one was set, otherwise the month it was scanned out.
function usageMonth_(c) { return c.countsIn || (c.scannedOutAt ? monthKey_(new Date(c.scannedOutAt)) : ''); }
function nextMonth_(mk) { const p = mk.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1], 1)); return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2); }
function monthKey_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM'); }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthLabel_(mk) { const p = mk.split('-').map(Number); return MONTHS[p[1] - 1] + ' ' + p[0]; }
function monthEndLabel_(mk) { const p = mk.split('-').map(Number); return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate() + ' ' + monthLabel_(mk); }
function fmtDate_(d) { return Utilities.formatDate(d, TZ, 'd MMM yyyy'); }
function kg_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' kg'; }
function bmt_(t) { return Number(t).toFixed(2) + ' BMT'; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function checkMonth_(m) { if (!/^\d{4}-\d{2}$/.test(String(m))) throw appError_('Pick a month.'); return String(m); }
function appError_(message, code) { const e = new Error(message); e.app = true; e.code = code || ''; return e; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ───────────────────────── Coils on jobs (CH Engineering Estimates app) ─────────────────────────
// One coil can be on many jobs, and one job can have many coils. Only the coil and the job number are stored.
function assignmentMap_() {
  const map = {};
  readRows_('coiljobs').forEach(r => {
    const k = String(r.v[0]); const j = String(r.v[1]).trim();
    if (!k || !j) return;
    (map[k] = map[k] || []);
    if (map[k].indexOf(j) < 0) map[k].push(j);
  });
  return map;
}
function jobsFor_(key) { return assignmentMap_()[normKey_(key)] || []; }
function addAssignment_(key, job, by) {
  const k = normKey_(key); const j = String(job || '').trim().toUpperCase();
  if (!j) throw appError_('Choose a job.');
  if (jobsFor_(k).indexOf(j) >= 0) return false;
  sheet_('coiljobs').appendRow([k, j, new Date(), by]);
  return true;
}
function allCoilsAction_(req) {
  const user = auth_(req, false);
  const map = assignmentMap_();
  const coils = allCoils_();
  coils.forEach(c => { c.jobs = map[c.key] || []; });
  return { user: user, coils: coils, suppliers: suppliers_(), month: monthKey_(new Date()), activeJobs: activeJobs_() };
}
function assignJob_(req) {
  const user = auth_(req, false);
  coilRow_(req.key);
  addAssignment_(req.key, req.job, user.name);
  return jobsFor_(req.key);
}
function unassignJob_(req) {
  auth_(req, true);
  const k = normKey_(req.key); const j = String(req.job || '').trim().toUpperCase();
  const sh = sheet_('coiljobs');
  readRows_('coiljobs').filter(r => String(r.v[0]) === k && String(r.v[1]).trim().toUpperCase() === j)
    .map(r => r.row).sort((a, b) => b - a).forEach(row => sh.deleteRow(row));
  return jobsFor_(k);
}
// The estimates app sends the jobs currently in production, so the crew can pick one when scanning out.
function setActiveJobs_(req) {
  auth_(req, true);
  const sh = sheet_('activejobs');
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, 3).clearContent();
  const rows = (req.jobs || []).slice(0, 200).map(j => [String(j.job || '').toUpperCase(), String(j.client || ''), new Date()]);
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  return activeJobs_();
}
function activeJobs_() {
  return readRows_('activejobs').filter(r => String(r.v[0]).trim()).map(r => ({ job: String(r.v[0]), client: String(r.v[1]) }));
}
