/* Business cards: each person's contact page and QR code (card.html?p=…). Details live in cards.json in the GitHub folder. */
(() => {
  const e = App.esc, A = App.actions;
  const BC = App.Cards = { data: null };
  BC.base = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  BC.link = p => `${BC.base()}card.html?p=${encodeURIComponent(p.id)}`;
  BC.load = async () => { try { BC.data = await (await fetch('cards.json?t=' + Date.now(), { cache: 'no-store' })).json(); } catch (er) { BC.data = { people: [], error: er.message }; } };
  BC.qrLib = async () => { if (!window.qrcode) await App.loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'); };
  BC.svg = (text, size = 150) => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: Math.max(2, Math.floor(size / (q.getModuleCount() + 8))), margin: 4, scalable: true }); };
  /* a crisp PNG for printing, email signatures or the van */
  BC.png = (text, px = 1200) => { const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(); const m = 4; const k = Math.floor(px / (n + m * 2)); const c = document.createElement('canvas'); c.width = c.height = k * (n + m * 2); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#15171a'; for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (q.isDark(r, cc)) x.fillRect((cc + m) * k, (r + m) * k, k, k); return c; };
  App.Set = App.Set || {};
  App.Set.cards = () => {
    if (!BC.data) { BC.load().then(() => BC.qrLib()).then(() => App.refresh()); return '<section class="card"><p class="hint">Loading the business cards…</p></section>'; }
    if (!window.qrcode) { BC.qrLib().then(() => App.refresh()); return '<section class="card"><p class="hint">Loading…</p></section>'; }
    const ppl = BC.data.people || [];
    return `<section class="card"><h3>Business cards</h3><p class="hint">Each person has their own contact page. Scanning their QR code opens it, and <b>Save my contact</b> adds them to the other person's phone. Use the QR on the back of printed cards, in email signatures, or on the vans. Apple and Google Wallet cards come next.</p></section>
      <div class="bc-grid">${ppl.map(p => `<section class="card bc-card"><div class="bc-qr">${BC.svg(BC.link(p))}</div><div><p class="bc-n">${e(p.first)} ${e(p.last)}</p><p class="hint" style="margin:0">${e(p.title)}</p><p class="small" style="margin:8px 0 0">${e(p.phone)}<br>${e(p.email)}</p>
        <div class="row-btns" style="margin-top:12px"><a class="btn small primary" href="${e(BC.link(p))}" target="_blank" rel="noopener">Open card</a><button class="btn small" data-act="bcPng" data-id="${e(p.id)}">Download QR</button><button class="btn small" data-act="bcCopy" data-id="${e(p.id)}">Copy link</button></div></div></section>`).join('')}</div>
      ${BC.data.error ? `<div class="banner warn">cards.json couldn't be read: ${e(BC.data.error)}</div>` : ''}
      <section class="card"><h3>Changing a card</h3><p class="hint">The details are in <b>cards.json</b> in your GitHub folder (the name, title, phone and email for each person). Edit it on GitHub and commit, and every card updates straight away. The QR codes don't change, so printed ones keep working.</p></section>`;
  };
  A.bcPng = el => { const p = BC.data.people.find(x => x.id === el.dataset.id); BC.png(BC.link(p)).toBlob(b => App.download(`${p.first} ${p.last} QR code.png`, b, 'image/png')); };
  A.bcCopy = async el => { const p = BC.data.people.find(x => x.id === el.dataset.id); try { await navigator.clipboard.writeText(BC.link(p)); App.toast('Link copied'); } catch (er) { App.toast(BC.link(p)); } };
})();
