/* FRAMECAD detailing PDF reader (uses pdf.js) */
App.FC = {
  PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  CATS: ['Walls', 'Joists', 'Trusses', 'Roof panels', 'Other'],

  async lib() {
    await App.loadScript(this.PDFJS);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = this.WORKER;
    return window.pdfjsLib;
  },

  category(group, code) {
    const g = (group || '').toLowerCase();
    if (/wall|panel/.test(g)) return 'Walls';
    if (/joist|floor/.test(g)) return 'Joists';
    if (/truss/.test(g)) return 'Trusses';
    if (/roof/.test(g)) return /^RF/i.test(code) ? 'Roof panels' : 'Trusses';
    if (/^J/i.test(code)) return 'Joists';
    if (/^(Tr|HN|HG|PC|SR|GT|CT|R\d|T\d|H\d)/i.test(code)) return 'Trusses';
    if (/^RF/i.test(code)) return 'Roof panels';
    if (/^(L|N|S|W|P|D)/i.test(code)) return 'Walls';
    return 'Other';
  },
  level(group) {
    if (/\bGF\b|ground|lower/i.test(group)) return 'Ground floor';
    if (/\bFF\b|first|upper|level 1/i.test(group)) return 'First floor';
    return '';
  },
  profileToSection(p) {
    const m = p && p.match(/(75|89|150)\s*[Cc]\s*(\d\.\d{2})/);
    return m ? { size: `${m[1]}x41`, gauge: m[2] } : null;
  },

  async parse(buffer, fileName = '') {
    const pdfjs = await this.lib();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    const frames = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.map(i => (i.str || '').trim()).filter(Boolean);
      const text = items.join('\n');
      const len = text.match(/Total Length:\s*([\d.,]+)\s*m/i);
      const wt = text.match(/Total Weight:\s*([\d.,]+)\s*kg/i);
      const qty = text.match(/Quantity:\s*(\d+)/i);
      const prof = text.match(/\b(75|89|150)\s*[Cc]\s*(\d\.\d{2})\b/);
      let title = null;
      items.forEach(s => {
        const m = s.match(/^(.*\S)\s+-\s+([A-Za-z]{1,4}[\w.]*\d[\w.\-]*)$/);
        if (m && !/^(Total|Estimated|Quantity|Op\d)/i.test(m[1])) title = m;
      });
      if (!title || !(len || qty || prof)) continue;
      let group = title[1].split(/\s+-\s+/).pop().replace(/^Detailing\s*/i, '').trim();
      const code = title[2];
      const q = qty ? parseInt(qty[1], 10) : 1;
      frames.push({
        id: App.uid(), page: p, name: code, group, category: this.category(group, code), level: this.level(group),
        qty: q, length: len ? parseFloat(len[1].replace(/,/g, '')) : null, weight: wt ? parseFloat(wt[1].replace(/,/g, '')) : null,
        profile: prof ? `${prof[1]}C${prof[2]}` : ''
      });
    }
    return this.summarise({ fileName, pages: doc.numPages, frames, readAt: Date.now() });
  },

  summarise(fc) {
    let lm = 0, kg = 0; const byCat = {}, byProfile = {};
    let missing = 0;
    fc.frames.forEach(f => {
      const fl = (f.length || 0) * f.qty; lm += fl; kg += (f.weight || 0) * f.qty;
      byCat[f.category] = (byCat[f.category] || 0) + f.qty;
      if (f.profile) byProfile[f.profile] = (byProfile[f.profile] || 0) + fl;
      if (f.length == null) missing++;
    });
    return Object.assign(fc, { totalLM: App.round(lm, 2), totalKg: App.round(kg, 1), byCat, byProfile, missingLength: missing });
  },

  summaryText(fc) {
    return this.CATS.filter(c => fc.byCat[c]).map(c => `${fc.byCat[c]} ${c.toLowerCase()}`).join(', ');
  }
};
