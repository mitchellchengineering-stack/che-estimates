/* Google: sign-in, Drive, Gmail, Calendar */
App.G = {
  token: null, expires: 0, user: null, tokenClient: null,
  SCOPES: [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.settings.basic',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/spreadsheets.readonly'
  ].join(' '),
  FOLDER: 'application/vnd.google-apps.folder',

  enabled() { return !!(window.CHE_CONFIG && CHE_CONFIG.GOOGLE_CLIENT_ID); },

  async init() {
    await App.loadScript('https://accounts.google.com/gsi/client');
    let resolver = null;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CHE_CONFIG.GOOGLE_CLIENT_ID, scope: this.SCOPES,
      callback: resp => {
        if (resp.error) { resolver && resolver.rej(new Error(resp.error)); return; }
        this.token = resp.access_token; this.expires = Date.now() + (resp.expires_in - 60) * 1000;
        sessionStorage.setItem('che-token', JSON.stringify({ t: this.token, e: this.expires }));
        resolver && resolver.res(this.token);
      }
    });
    this._req = prompt => new Promise((res, rej) => { resolver = { res, rej }; this.tokenClient.requestAccessToken({ prompt }); });
    const saved = JSON.parse(sessionStorage.getItem('che-token') || 'null');
    if (saved && saved.e > Date.now()) { this.token = saved.t; this.expires = saved.e; }
  },
  async signIn(prompt = '') { await this._req(prompt); await this.loadUser(); return this.user; },
  signedIn() { return !!this.token && this.expires > Date.now(); },
  async loadUser() {
    const r = await this.api('https://www.googleapis.com/oauth2/v3/userinfo');
    this.user = { email: (r.email || '').toLowerCase(), name: r.name || r.email };
    return this.user;
  },
  signOut() {
    if (this.token) google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null; sessionStorage.removeItem('che-token'); location.reload();
  },

  async api(url, opts = {}, raw = false) {
    if (!this.signedIn()) { App.state.needsReconnect = true; App.renderTop && App.renderTop(); throw new Error('Not signed in to Google. Click "Reconnect Google" at the top.'); }
    const headers = Object.assign({ Authorization: 'Bearer ' + this.token }, opts.headers || {});
    const r = await fetch(url, Object.assign({}, opts, { headers }));
    if (r.status === 401) { this.token = null; App.state.needsReconnect = true; App.renderTop && App.renderTop(); throw new Error('Google session expired. Click "Reconnect Google" at the top.'); }
    if (!r.ok) { let msg = r.statusText; try { const j = await r.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) {} throw new Error('Google: ' + msg); }
    if (raw) return r;
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  },

  /* ---------- Drive ---------- */
  D: 'https://www.googleapis.com/drive/v3/files',
  U: 'https://www.googleapis.com/upload/drive/v3/files',
  q(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); },
  async find(name, parent, mime) {
    let q = `name='${this.q(name)}' and trashed=false`;
    if (parent) q += ` and '${parent}' in parents`;
    if (mime) q += ` and mimeType='${mime}'`;
    const r = await this.api(`${this.D}?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,modifiedTime)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    return r.files[0] || null;
  },
  async list(parent, extraQ = '') {
    const q = `'${parent}' in parents and trashed=false` + extraQ;
    const r = await this.api(`${this.D}?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,modifiedTime,size)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    return r.files;
  },
  async folder(name, parent) {
    const f = await this.find(name, parent, this.FOLDER);
    if (f) return f.id;
    const r = await this.api(`${this.D}?supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: this.FOLDER, parents: parent ? [parent] : undefined }) });
    return r.id;
  },
  async rename(id, name) { return this.api(`${this.D}/${id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); },
  async upload({ name, parent, blob, fileId, mime }) {
    mime = mime || blob.type || 'application/octet-stream';
    if (fileId) {
      return this.api(`${this.U}/${fileId}?uploadType=media&supportsAllDrives=true&fields=id,name,webViewLink`, { method: 'PATCH', headers: { 'Content-Type': mime }, body: blob });
    }
    const meta = { name, parents: parent ? [parent] : undefined, mimeType: mime };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', blob);
    return this.api(`${this.U}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`, { method: 'POST', body: form });
  },
  async uploadOrReplace({ name, parent, blob, mime }) {
    const ex = await this.find(name, parent);
    return this.upload({ name, parent, blob, mime, fileId: ex && ex.id });
  },
  async getText(id) { return this.api(`${this.D}/${id}?alt=media&supportsAllDrives=true`, {}, true).then(r => r.text()); },
  async getBlob(id) { return this.api(`${this.D}/${id}?alt=media&supportsAllDrives=true`, {}, true).then(r => r.blob()); },
  async meta(id) { return this.api(`${this.D}/${id}?fields=id,name,modifiedTime,version,webViewLink&supportsAllDrives=true`); },

  /* ---------- Gmail ---------- */
  b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  async signature() {
    if (this._sig !== undefined) return this._sig;
    try {
      const r = await this.api('https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs');
      const p = (r.sendAs || []).find(s => s.isPrimary) || (r.sendAs || [])[0];
      this._sig = (p && p.signature) || '';
    } catch (e) { this._sig = ''; }
    return this._sig;
  },
  /* attachments: [{name, mime, base64}] */
  async send({ to, cc, subject, html, attachments = [] }) {
    const boundary = 'che' + App.uid();
    const encSubj = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject))) + '?=';
    let mime = `To: ${to}\r\n` + (cc ? `Cc: ${cc}\r\n` : '') + `Subject: ${encSubj}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(unescape(encodeURIComponent(html))).replace(/(.{76})/g, '$1\r\n')}\r\n`;
    attachments.forEach(a => {
      mime += `--${boundary}\r\nContent-Type: ${a.mime}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${a.base64.replace(/(.{76})/g, '$1\r\n')}\r\n`;
    });
    mime += `--${boundary}--`;
    const raw = btoa(unescape(encodeURIComponent(mime))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return this.api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  },

  /* ---------- Sheets (read only) ---------- */
  async sheetValues(sheetId, ranges) {
    const q = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const r = await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
    return (r.valueRanges || []).map(v => v.values || []);
  },

  /* ---------- Calendar ---------- */
  async upsertEvent(calId, eventId, { summary, date, endDate, description, colorId }) {
    const body = { summary, description, start: { date }, end: { date: App.addDays(endDate || date, 1) } };
    if (colorId) body.colorId = colorId;
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
    if (eventId) {
      try { const r = await this.api(`${base}/${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.id; } catch (e) { /* fall through and recreate */ }
    }
    const r = await this.api(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.id;
  },
  async deleteEvent(calId, eventId) {
    try { await this.api(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${eventId}`, { method: 'DELETE' }, true); } catch (e) {}
  }
};
