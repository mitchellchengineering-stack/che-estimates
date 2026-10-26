/* Shared helpers */
const App = window.App = { actions: {}, views: {}, state: {} };

App.esc = s => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
App.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
App.num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
App.round = (n, dp = 2) => Math.round((Number(n) || 0) * 10 ** dp) / 10 ** dp;
App.money = (n, dp = 2) => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp });
App.pct = n => (isFinite(n) ? (n * 100).toFixed(1) : '0.0') + '%';
App.clone = o => JSON.parse(JSON.stringify(o));

/* Dates are stored as local yyyy-mm-dd strings */
App.iso = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
App.today = () => App.iso(new Date());
App.parseDate = s => { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
App.addDays = (s, n) => { const d = App.parseDate(s); d.setDate(d.getDate() + n); return App.iso(d); };
App.addMonths = (s, n) => { const d = App.parseDate(s); const day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < day) d.setDate(0); return App.iso(d); };
App.daysBetween = (a, b) => Math.round((App.parseDate(b) - App.parseDate(a)) / 86400000);
App.fmtDate = (s, opts) => { if (!s) return ''; const d = App.parseDate(s); return d.toLocaleDateString('en-NZ', opts || { day: 'numeric', month: 'short', year: 'numeric' }); };
App.fmtLong = s => App.fmtDate(s, { day: 'numeric', month: 'long', year: 'numeric' });
App.fmtShort = s => App.fmtDate(s, { day: 'numeric', month: 'short' });
App.fmtStamp = ts => ts ? new Date(ts).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
App.weekStart = s => { const d = App.parseDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return App.iso(d); };

App.getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
App.setPath = (obj, path, val) => {
  const keys = path.split('.'); let o = obj;
  keys.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(k) ? [] : {}; o = o[k]; });
  o[keys[keys.length - 1]] = val;
};
App.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
App.firstName = name => (name || '').trim().split(/\s+/)[0] || 'there';
App.slug = s => (s || '').replace(/[\\/:*?"<>|]+/g, '').trim();

/* Template fill for emails: {first_name}, {number} etc. */
App.fill = (tpl, vars) => (tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
App.textToHtml = t => App.esc(t).replace(/\n/g, '<br>');

/* Toasts */
App.toast = (msg, kind = 'ok', ms = 3200) => {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
};

/* Modals */
App.modal = (title, body, { wide = false, actions = '' } = {}) => {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${App.esc(title)}">
    <div class="modal-head"><h3>${App.esc(title)}</h3><button class="icon-btn" data-act="closeModal" aria-label="Close">✕</button></div>
    <div class="modal-body">${body}</div>
    ${actions ? `<div class="modal-foot">${actions}</div>` : ''}
  </div>`;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) App.closeModal(); });
  root.appendChild(wrap);
  const f = wrap.querySelector('input,select,textarea,button:not(.icon-btn)'); if (f) setTimeout(() => f.focus(), 30);
  return wrap.querySelector('.modal');
};
App.closeModal = () => { const r = document.getElementById('modal-root'); if (r.lastElementChild) r.lastElementChild.remove(); };
App.actions.closeModal = () => App.closeModal();
App.confirm = (title, text, okLabel = 'Confirm') => new Promise(res => {
  const m = App.modal(title, `<p>${text}</p>`, { actions: `<button class="btn ghost" data-r="0">Cancel</button><button class="btn primary" data-r="1">${App.esc(okLabel)}</button>` });
  m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { App.closeModal(); res(b.dataset.r === '1'); });
});
App.prompt = (title, label, value = '') => new Promise(res => {
  const m = App.modal(title, `<label class="fld"><span>${App.esc(label)}</span><input id="prompt-in" value="${App.esc(value)}"></label>`,
    { actions: `<button class="btn ghost" data-r="0">Cancel</button><button class="btn primary" data-r="1">OK</button>` });
  const inp = m.querySelector('#prompt-in');
  inp.onkeydown = e => { if (e.key === 'Enter') { App.closeModal(); res(inp.value); } };
  m.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { App.closeModal(); res(b.dataset.r === '1' ? inp.value : null); });
});

/* Small HTML builders */
App.opt = (val, label, cur) => `<option value="${App.esc(val)}" ${String(val) === String(cur) ? 'selected' : ''}>${App.esc(label ?? val)}</option>`;
App.opts = (list, cur) => list.map(x => typeof x === 'object' ? App.opt(x.value, x.label, cur) : App.opt(x, x, cur)).join('');
App.field = (label, inner, cls = '') => `<label class="fld ${cls}"><span>${label}</span>${inner}</label>`;

/* File helpers */
App.readFile = (file, as = 'dataURL') => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej;
  if (as === 'dataURL') r.readAsDataURL(file); else if (as === 'text') r.readAsText(file); else r.readAsArrayBuffer(file);
});
App.blobToBase64 = blob => App.readFile(blob).then(d => d.split(',')[1]);
App.compressImage = (file, max = 1400, q = 0.78) => new Promise(async res => {
  const url = await App.readFile(file);
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    res(c.toDataURL('image/jpeg', q));
  };
  img.src = url;
});
App.dataUrlToBlob = d => { const [h, b] = d.split(','); const mime = h.match(/:(.*?);/)[1]; const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); };
App.download = (name, blobOrText, mime = 'text/plain') => {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: mime });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
};
App.loadScript = src => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s);
});
App.loadCss = href => { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } };
App.imgToDataUrl = src => new Promise(res => {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
  img.onerror = () => res(null); img.src = src;
});
