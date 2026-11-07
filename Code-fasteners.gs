/**
 * CH Engineering - Stock Take app (backend)
 * Paste this whole file into Extensions > Apps Script in your Google Sheet,
 * replacing the default Code.gs. See SETUP.md for the full steps.
 */

// ---- Settings you may want to change -------------------------------------
// Who gets emails, the supplier's details and the wording now come from the CH Engineering app
// (Settings > Coils and fasteners > Fastener emails). These two lines link this script to the app.
var FOLDER_ID = '1SNzD7A4PwS6slrwomqORv5StlPQ0lk_A';   // the shared CH Engineering Estimates folder
var APP_LINK = 'https://mitchellchengineering-stack.github.io/che-estimates/';
var MANAGER_EMAIL = 'operations.chengineering@gmail.com';   // used if the app's settings can't be read
var TIMEZONE = 'Pacific/Auckland';
// true  = email only when stock goes BELOW the minimum (e.g. minimum 20: email at 19, not at 20)
// false = also email when stock lands exactly on the minimum
var EMAIL_ONLY_BELOW = true;
// true  = email on every sign out while stock is low
// false = email only the first time an item drops into the low zone
var EMAIL_EVERY_TIME = true;
// ---------------------------------------------------------------------------

var ITEMS = 'Items';
var STAFF = 'Staff';
var LOG = 'Log';

function doGet() {
  ensureSheets_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('CH Engineering Stock')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureSheets_() {
  var ss = ss_();
  var defs = [
    [ITEMS, ['Item', 'In stock', 'Minimum', 'Last updated']],
    [STAFF, ['Name']],
    [LOG, ['Time', 'Action', 'Item', 'Qty', 'Person', 'Stock after']]
  ];
  defs.forEach(function (d) {
    var sh = ss.getSheetByName(d[0]);
    if (!sh) {
      sh = ss.insertSheet(d[0]);
      sh.appendRow(d[1]);
      sh.getRange(1, 1, 1, d[1].length).setFontWeight('bold').setBackground('#FFD800');
      sh.setFrozenRows(1);
    }
  });
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
}

function now_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function nice_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'EEE d MMM yyyy, h:mm a');
}

function log_(action, item, qty, person, after) {
  ss_().getSheetByName(LOG).appendRow([now_(), action, item, qty, person || '', after]);
}

function findItem_(sh, name) {
  var vals = sh.getDataRange().getValues();
  var key = String(name).trim().toLowerCase();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === key) {
      return { row: i + 1, name: vals[i][0], qty: Number(vals[i][1]) || 0, min: Number(vals[i][2]) || 0 };
    }
  }
  return null;
}

/** Everything the app needs on screen. */
function getData() {
  ensureSheets_();
  var ss = ss_();
  var iv = ss.getSheetByName(ITEMS).getDataRange().getValues();
  var items = [];
  for (var i = 1; i < iv.length; i++) {
    if (String(iv[i][0]).trim() === '') continue;
    items.push({ name: String(iv[i][0]), qty: Number(iv[i][1]) || 0, min: Number(iv[i][2]) || 0 });
  }
  var sv = ss.getSheetByName(STAFF).getDataRange().getValues();
  var staff = [];
  for (var j = 1; j < sv.length; j++) {
    if (String(sv[j][0]).trim() !== '') staff.push(String(sv[j][0]));
  }
  items.sort(function (a, b) { return a.name.localeCompare(b.name); });
  staff.sort();
  return { items: items, staff: staff };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function cleanQty_(q) {
  var n = Math.floor(Number(q));
  if (!isFinite(n) || n <= 0) throw new Error('Enter a quantity of 1 or more.');
  return n;
}

/** Take stock out. Returns whether the item is now low. */
function signOut(person, itemName, qty) {
  return withLock_(function () {
    qty = cleanQty_(qty);
    if (!person) throw new Error('Choose your name.');
    var sh = ss_().getSheetByName(ITEMS);
    var it = findItem_(sh, itemName);
    if (!it) throw new Error('Item not found. Refresh the app and try again.');
    if (qty > it.qty) {
      throw new Error('Only ' + it.qty + ' of ' + it.name + ' in stock. Check the number or tell your supervisor.');
    }
    var after = it.qty - qty;
    sh.getRange(it.row, 2).setValue(after);
    sh.getRange(it.row, 4).setValue(now_());
    log_('Sign out', it.name, qty, person, after);
    var low = after <= it.min;
    var emailZone = EMAIL_ONLY_BELOW ? (after < it.min) : (after <= it.min);
    var wasZone = EMAIL_ONLY_BELOW ? (it.qty < it.min) : (it.qty <= it.min);
    var emailed = false, emailFailed = false;
    if (emailZone && (EMAIL_EVERY_TIME || !wasZone)) {
      emailed = sendLowEmail_(it.name, after, it.min, qty, person);
      emailFailed = !emailed;
    }
    return { item: it.name, qty: after, min: it.min, low: low, emailed: emailed, emailFailed: emailFailed };
  });
}

/** Book new stock in (deliveries). */
function signIn(itemName, qty, person) {
  return withLock_(function () {
    qty = cleanQty_(qty);
    var sh = ss_().getSheetByName(ITEMS);
    var it = findItem_(sh, itemName);
    if (!it) throw new Error('Item not found. Refresh the app and try again.');
    var after = it.qty + qty;
    sh.getRange(it.row, 2).setValue(after);
    sh.getRange(it.row, 4).setValue(now_());
    log_('Sign in', it.name, qty, person, after);
    return { item: it.name, qty: after, min: it.min, low: after <= it.min };
  });
}

/** Add a brand new item. */
function addItem(name, qty, min) {
  return withLock_(function () {
    name = String(name || '').trim();
    if (!name) throw new Error('Enter an item name.');
    qty = Math.floor(Number(qty)); min = Math.floor(Number(min));
    if (!isFinite(qty) || qty < 0) throw new Error('Enter the starting quantity (0 or more).');
    if (!isFinite(min) || min < 0) throw new Error('Enter the minimum level (0 or more).');
    var sh = ss_().getSheetByName(ITEMS);
    if (findItem_(sh, name)) throw new Error(name + ' is already in the system.');
    sh.appendRow([name, qty, min, now_()]);
    log_('New item', name, qty, '', qty);
    return { item: name, qty: qty, min: min, low: qty <= min };
  });
}

/** Correct a count after a stock take and/or change the minimum level. */
function updateItem(itemName, newQty, newMin, person) {
  return withLock_(function () {
    var sh = ss_().getSheetByName(ITEMS);
    var it = findItem_(sh, itemName);
    if (!it) throw new Error('Item not found. Refresh the app and try again.');
    newQty = Math.floor(Number(newQty)); newMin = Math.floor(Number(newMin));
    if (!isFinite(newQty) || newQty < 0) throw new Error('Enter the counted quantity (0 or more).');
    if (!isFinite(newMin) || newMin < 0) throw new Error('Enter the minimum level (0 or more).');
    sh.getRange(it.row, 2).setValue(newQty);
    sh.getRange(it.row, 3).setValue(newMin);
    sh.getRange(it.row, 4).setValue(now_());
    if (newQty !== it.qty) log_('Count fix', it.name, newQty - it.qty, person, newQty);
    if (newMin !== it.min) log_('Minimum changed', it.name, newMin, person, newQty);
    return { item: it.name, qty: newQty, min: newMin, low: newQty <= newMin };
  });
}

function addStaff(name) {
  return withLock_(function () {
    name = String(name || '').trim();
    if (!name) throw new Error('Enter a name.');
    var sh = ss_().getSheetByName(STAFF);
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === name.toLowerCase()) throw new Error(name + ' is already on the list.');
    }
    sh.appendRow([name]);
    return true;
  });
}

function removeStaff(name) {
  return withLock_(function () {
    var sh = ss_().getSheetByName(STAFF);
    var vals = sh.getDataRange().getValues();
    for (var i = vals.length - 1; i >= 1; i--) {
      if (String(vals[i][0]).trim() === String(name).trim()) sh.deleteRow(i + 1);
    }
    return true;
  });
}

/* ---------- Settings from the CH Engineering app ---------- */
function hub_() {
  var cache = CacheService.getScriptCache(); var c = cache.get('hub');
  if (c) return JSON.parse(c);
  var out = { lowEmails: MANAGER_EMAIL, monthlyTo: '', monthlyName: '', monthlyCheckFirst: true, reorderMultiple: 2, lowNote: 'Please order more.', monthlyIntro: "Here's our fastener stock at the end of {month}, and what we used this month. Could you please send through the items marked to reorder?", company: { name: 'CH Engineering Ltd', address: '8 Wickham Street, Frankton, Hamilton 3024', phone: '022 609 0176' } };
  try {
    var it = DriveApp.getFolderById(FOLDER_ID).getFilesByName('che-app-data.json');
    if (it.hasNext()) {
      var d = JSON.parse(it.next().getBlob().getDataAsString());
      var f = (d.settings && d.settings.fasteners) || {};
      ['lowEmails', 'monthlyTo', 'monthlyName', 'monthlyCheckFirst', 'reorderMultiple', 'lowNote', 'monthlyIntro'].forEach(function (k) { if (f[k] !== undefined && f[k] !== '') out[k] = f[k]; });
      if (d.settings && d.settings.company) out.company = d.settings.company;
    }
  } catch (e) { /* use the defaults */ }
  cache.put('hub', JSON.stringify(out), 600);
  return out;
}
function emails_(list) { return String(list || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); }).join(','); }
function shell_(inner, h) {
  var c = h.company || {};
  return '<div style="font-family:Arial,sans-serif;color:#15171a;max-width:620px;border:1px solid #e3e6e8;border-radius:12px;overflow:hidden">' +
    '<div style="height:8px;background:#f5c400"></div><div style="padding:20px 24px"><img src="' + APP_LINK + 'logo.png" alt="CH Engineering" style="width:180px;display:block">' + inner + '</div>' +
    '<div style="padding:12px 24px;background:#15171a;color:#c9ced3;font-size:12px">' + esc_(c.name || 'CH Engineering Ltd') + ' &middot; ' + esc_(c.address || '') + ' &middot; ' + esc_(c.phone || '') + '</div></div>';
}
function esc_(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function row_(a, b) { return '<tr><td style="padding:8px 0;border-bottom:1px solid #eef0ee;color:#5c636b">' + a + '</td><td style="padding:8px 0;border-bottom:1px solid #eef0ee;text-align:right;font-weight:bold">' + b + '</td></tr>'; }

function sendLowEmail_(item, left, min, took, person) {
  try {
    var h = hub_();
    var others = getData().items.filter(function (i) { return i.name !== item && i.qty <= i.min; });
    var inner = '<div style="margin-top:16px;background:#fbe6e4;border-radius:12px;padding:14px 16px"><div style="font-size:12px;font-weight:bold;color:#b3261e;letter-spacing:.04em">LOW STOCK, PLEASE REORDER</div><div style="font-size:26px;font-weight:bold;margin-top:4px">' + esc_(item) + '</div></div>' +
      '<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px">' + row_('In stock now', left) + row_('Minimum', min) + row_('Just signed out', took + ' by ' + esc_(person)) + row_('When', nice_()) + '</table>' +
      (others.length ? '<p style="margin:14px 0 4px;font-size:13px;font-weight:bold">Also low</p><p style="margin:0;font-size:14px">' + others.map(function (i) { return esc_(i.name) + ' (' + i.qty + ' left, min ' + i.min + ')'; }).join(' &middot; ') + '</p>' : '') +
      (h.lowNote ? '<p style="margin:16px 0 0;font-size:14px">' + esc_(h.lowNote) + '</p>' : '');
    MailApp.sendEmail({ to: emails_(h.lowEmails) || MANAGER_EMAIL, subject: 'Low stock: ' + item + ' (' + left + ' left)', htmlBody: shell_(inner, h), body: item + ' is low: ' + left + ' left (minimum ' + min + ').' });
    return true;
  } catch (e) {
    return false;
  }
}

/* ---------- Monthly summary for your supplier (last working day, 4pm) ---------- */
function isLastWorkingDay_(d) {
  var t = new Date(d); if (t.getDay() === 0 || t.getDay() === 6) return false;
  var n = new Date(t); do { n.setDate(n.getDate() + 1); } while (n.getDay() === 0 || n.getDay() === 6);
  return n.getMonth() !== t.getMonth();
}
function monthlyCheck() {
  var now = new Date(); var key = 'monthly-' + Utilities.formatDate(now, TIMEZONE, 'yyyy-MM');
  if (!isLastWorkingDay_(now) || PropertiesService.getScriptProperties().getProperty(key)) return;
  sendMonthly_(false);
  PropertiesService.getScriptProperties().setProperty(key, '1');
}
function sendMonthly_(test) {
  var h = hub_(); var month = Utilities.formatDate(new Date(), TIMEZONE, 'MMMM yyyy'); var ym = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
  var used = {};
  ss_().getSheetByName(LOG).getDataRange().getValues().slice(1).forEach(function (r) {
    var t = r[0] instanceof Date ? Utilities.formatDate(r[0], TIMEZONE, 'yyyy-MM-dd') : String(r[0]);
    if (r[1] === 'Sign out' && t.slice(0, 7) === ym) used[r[2]] = (used[r[2]] || 0) + Number(r[3] || 0);
  });
  var mult = Number(h.reorderMultiple) || 2;
  var items = getData().items.map(function (i) { return { name: i.name, qty: i.qty, min: i.min, used: used[i.name] || 0, reorder: i.qty <= i.min ? Math.max(1, Math.ceil(i.min * mult - i.qty)) : 0 }; });
  var table = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#15171a;color:#fff"><th style="padding:7px 10px;text-align:left">Item</th><th style="padding:7px 10px;text-align:right">Used</th><th style="padding:7px 10px;text-align:right">In stock</th><th style="padding:7px 10px;text-align:right">Reorder</th></tr></thead><tbody>' +
    items.map(function (i) { return '<tr style="border-bottom:1px solid #eef0ee' + (i.reorder ? ';background:#fff4c7' : '') + '"><td style="padding:7px 10px;font-weight:bold">' + esc_(i.name) + '</td><td style="padding:7px 10px;text-align:right">' + i.used + '</td><td style="padding:7px 10px;text-align:right">' + i.qty + '</td><td style="padding:7px 10px;text-align:right;font-weight:bold">' + (i.reorder || '') + '</td></tr>'; }).join('') + '</tbody></table>';
  var first = (h.monthlyName || '').split(' ')[0];
  var intro = String(h.monthlyIntro || '').replace(/\{month\}/g, month);
  var checkFirst = h.monthlyCheckFirst !== false || test || !emails_(h.monthlyTo);
  var note = checkFirst ? '<div style="margin-top:14px;background:#fff4c7;border-radius:10px;padding:10px 12px;font-size:13px"><b>To check before it goes to ' + esc_(h.monthlyName || 'your supplier') + (emails_(h.monthlyTo) ? ' (' + esc_(h.monthlyTo) + ')' : '') + '.</b> Forward it on once you\'re happy.</div>' : '';
  var inner = note + '<p style="margin:16px 0 4px;font-size:14px">Hi ' + esc_(first || 'there') + ',</p><p style="margin:0 0 12px;font-size:14px">' + esc_(intro) + '</p>' + table + '<p style="margin:14px 0 0;font-size:14px">Cheers,<br>' + esc_((h.company && h.company.name) || 'CH Engineering') + '</p><p style="margin:6px 0 0;font-size:12px;color:#5c636b">The full stock list is attached as a PDF.</p>';
  var html = shell_(inner, h);
  var pdf = Utilities.newBlob('<html><body style="font-family:Arial,sans-serif;color:#15171a"><h2>' + esc_((h.company && h.company.name) || 'CH Engineering') + ': fastener stock, ' + month + '</h2>' + table + '</body></html>', 'text/html', 'stock.html').getAs('application/pdf').setName('Fastener stock ' + month + '.pdf');
  var to = checkFirst ? (emails_(h.lowEmails) || MANAGER_EMAIL) : emails_(h.monthlyTo);
  MailApp.sendEmail({ to: to, cc: checkFirst ? '' : emails_(h.lowEmails), subject: (h.company && h.company.name ? h.company.name.replace(/ Ltd$/, '') : 'CH Engineering') + ': fastener stock, ' + month, htmlBody: html, body: intro, attachments: [pdf] });
}
/* Run this once from the editor so the monthly summary sends itself */
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'monthlyCheck') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('monthlyCheck').timeBased().everyDays(1).atHour(16).inTimezone(TIMEZONE).create();
  hub_();
}
/* Sends this month's summary to you now, to see how it looks */
function testMonthly() { sendMonthly_(true); }

/** Run this once from the editor to test that email works. */
function testEmail() {
  CacheService.getScriptCache().remove('hub');
  sendLowEmail_('Test item', 5, 20, 1, 'Test');
}