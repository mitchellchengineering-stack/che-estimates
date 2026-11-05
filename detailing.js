/* Detailing: each set of detailing (IFC 3D model and/or FRAMECAD PDFs) with a preview.
   Saved in Drive twice: CH Engineering Estimates / Detailing / {description}, and the job's own Detailing folder. */
(() => {
  const e = App.esc, A = App.actions, st = App.store, S = () => st.s();
  const LABELS = ['Wall details', 'Truss details', 'Joist details', 'Floor details', 'Wall and truss details', 'Roof panel details', 'Other'];
  const guessLabel = n => { n = n.toLowerCase(); if (/truss/.test(n) && /wall/.test(n)) return 'Wall and truss details'; if (/truss/.test(n)) return 'Truss details'; if (/joist/.test(n)) return 'Joist details'; if (/floor/.test(n)) return 'Floor details'; if (/roof|panel/.test(n)) return 'Roof panel details'; if (/wall/.test(n)) return 'Wall details'; return 'Wall details'; };
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  const D = App.Detailing = {
    mem: {},        /* fileId -> Blob (this session) */
    thumbs: {},     /* setId -> object URL */
    S: { search: '', filter: 'all' },
    list() { return (st.data.detailing || []).filter(x => !x.deleted).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); },
    get(id) { return (st.data.detailing || []).find(x => x.id === id); },
    forEst(est) { return D.list().filter(x => x.estId === est.id); },
    est(set) { return set.estId ? st.get(set.estId) : null; },
    hasIfc(set) { return set.files.some(f => f.kind === 'ifc'); },
    async blob(f) {
      if (D.mem[f.id]) return D.mem[f.id];
      if (f.driveId && st.mode === 'drive') { const b = await App.G.getBlob(f.driveId); D.mem[f.id] = b; return b; }
      throw new Error('That file isn\'t available. Connect Google to keep detailing files.');
    },
    safe(n) { return String(n || 'Detailing').replace(/[\\/:*?"<>|]+/g, '-').trim().slice(0, 80) || 'Detailing'; },
    async folders(set) {
      if (st.mode !== 'drive') return {};
      const root = await App.G.folder('Detailing', st.rootId);
      if (!set.folderId) {
        let name = D.safe(set.desc); const taken = new Set(D.list().filter(x => x.id !== set.id).map(x => x.folderName));
        for (let i = 2; taken.has(name); i++) name = `${D.safe(set.desc)} (${i})`;
        set.folderId = await App.G.folder(name, root); set.folderName = name;
      }
      const est = D.est(set); let jobId = null;
      if (est) { try { jobId = await st.subFolder(est, 'Detailing'); } catch (er) {} }
      return { main: set.folderId, job: jobId };
    },
    async addFiles(set, files, labels = {}) {
      const fo = await D.folders(set);
      for (const file of files) {
        const kind = /\.ifc$/i.test(file.name) ? 'ifc' : 'pdf';
        const rec = { id: App.uid(), name: file.name, kind, label: kind === 'ifc' ? '3D model' : (labels[file.name] || guessLabel(file.name)), size: file.size, addedAt: Date.now() };
        D.mem[rec.id] = file;
        if (kind === 'pdf') { try { const fc = await App.FC.parse(await file.arrayBuffer(), file.name); rec.pages = fc.pages || null; rec.lm = fc.totalLM || 0; rec.frames = fc.frames.length; } catch (er) {} }
        if (fo.main) { App.toast(`Saving ${file.name} to Drive…`); const up = await App.G.uploadOrReplace({ name: file.name, parent: fo.main, blob: file, mime: kind === 'pdf' ? 'application/pdf' : 'application/octet-stream' }); rec.driveId = up.id; }
        if (fo.job) { try { await App.G.uploadOrReplace({ name: file.name, parent: fo.job, blob: file, mime: kind === 'pdf' ? 'application/pdf' : 'application/octet-stream' }); } catch (er) {} }
        set.files = set.files.filter(f => f.name !== file.name).concat([rec]);
      }
      set.updatedAt = Date.now(); st.touch(set); st.save();
      await D.makeThumb(set).catch(() => {});
    },
    async create({ desc, estId, files, labels, plans }) {
      st.data.detailing = st.data.detailing || [];
      const set = { id: App.uid(), desc: desc || 'Detailing', estId: estId || '', plans: plans || '', files: [], createdAt: Date.now(), createdBy: st.me().name };
      st.data.detailing.push(set); st.touch(set);
      await D.addFiles(set, files, labels);
      const est = D.est(set); if (est) { st.log(est, `Detailing added: ${set.desc} (${set.files.map(f => f.label).join(', ')})`); st.touch(est); st.save(); }
      return set;
    },
    /* Used by the FRAMECAD uploads in the workings and job pages, so those land here too */
    async capture(est, file) {
      try {
        let set = D.forEst(est)[0];
        if (!set) await D.create({ desc: est.heading || (est.ft && est.ft.projectName) || st.displayNumber(est), estId: est.id, files: [file] });
        else await D.addFiles(set, [file]);
      } catch (er) { App.toast('Detailing: ' + er.message, 'err', 6000); }
    },
    /* Preview picture for the card: the IFC model if there is one, otherwise page 1 of the first PDF */
    async makeThumb(set) {
      let url = null;
      const ifc = set.files.find(f => f.kind === 'ifc'); const pdf = set.files.find(f => f.kind === 'pdf');
      if (ifc) {
        const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-2000px;top:0;width:640px;height:400px;';
        document.body.appendChild(host);
        try { const v = await App.IFC.open(host, await (await D.blob(ifc)).arrayBuffer()); url = v.snapshot(); v.dispose(); } finally { host.remove(); }
      } else if (pdf) {
        const pdfjs = await App.FC.lib(); const doc = await pdfjs.getDocument({ data: await (await D.blob(pdf)).arrayBuffer() }).promise;
        const page = await doc.getPage(1); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: 640 / vp0.width });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise; url = c.toDataURL('image/jpeg', 0.8);
      }
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      if (D.thumbs[set.id]) URL.revokeObjectURL(D.thumbs[set.id]);
      D.thumbs[set.id] = URL.createObjectURL(blob);
      if (st.mode === 'drive' && set.folderId) { try { const up = await App.G.uploadOrReplace({ name: 'preview.jpg', parent: set.folderId, blob, mime: 'image/jpeg' }); set.thumbId = up.id; } catch (er) {} }
      else set.thumbData = url;
      set.thumbKind = ifc ? 'ifc' : 'pdf'; st.touch(set); st.save();
      if (App.route().name === 'detailing') { const img = document.querySelector(`[data-thumb="${set.id}"]`); if (img) img.src = D.thumbs[set.id]; }
    },
    async loadThumb(set) {
      if (D.thumbs[set.id]) return D.thumbs[set.id];
      if (set.thumbData) return (D.thumbs[set.id] = set.thumbData);
      if (set.thumbId && st.mode === 'drive') { const b = await App.G.getBlob(set.thumbId); return (D.thumbs[set.id] = URL.createObjectURL(b)); }
      return null;
    }
  };

  /* ---------- IFC viewer (web-ifc + three.js) ---------- */
  const IFC = App.IFC = {
    V: '0.0.39', T: '0.152.2', libs: null,
    async load() {
      if (!IFC.libs) IFC.libs = (async () => {
        const THREE = await import(`https://esm.sh/three@${IFC.T}`);
        const { OrbitControls } = await import(`https://esm.sh/three@${IFC.T}/examples/jsm/controls/OrbitControls.js`);
        const W = await import(`https://cdn.jsdelivr.net/npm/web-ifc@${IFC.V}/web-ifc-api.js`);
        return { THREE, OrbitControls, W };
      })();
      return IFC.libs;
    },
    cat(text, cls) {
      const t = String(text || '');
      if (/truss|^\s*T\d|[-\s]T\d/i.test(t)) return 'trusses';
      if (/joist|floor|^\s*J\d|[-\s]J\d|bearer/i.test(t)) return 'joists';
      if (/wall|panel|stud|^\s*W\d|[-\s]W\d|GF-|FF-/i.test(t)) return 'walls';
      if (/WALL/.test(cls)) return 'walls'; if (/ROOF/.test(cls)) return 'trusses'; if (/SLAB/.test(cls)) return 'joists';
      return 'other';
    },
    async open(host, buffer, { interactive = false, onPick } = {}) {
      const { THREE, OrbitControls, W } = await IFC.load();
      const api = new W.IfcAPI(); api.SetWasmPath(`https://cdn.jsdelivr.net/npm/web-ifc@${IFC.V}/`, true); await api.Init();
      const mid = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: true });
      /* frame (assembly) each part belongs to, for names and walls/trusses/joists */
      const parent = {};
      try { const rels = api.GetLineIDsWithType(mid, W.IFCRELAGGREGATES); for (let i = 0; i < rels.size(); i++) { const r = api.GetLine(mid, rels.get(i)); const p = r.RelatingObject && r.RelatingObject.value; (r.RelatedObjects || []).forEach(o => { parent[o.value] = p; }); } } catch (er) {}
      const info = {}; const lineInfo = id => { if (info[id]) return info[id]; let l = {}; try { l = api.GetLine(mid, id) || {}; } catch (er) {} const v = k => (l[k] && l[k].value) || ''; const cls = (api.GetNameFromTypeCode ? api.GetNameFromTypeCode(l.type) : '') || ''; return (info[id] = { name: v('Name'), type: v('ObjectType'), desc: v('Description'), tag: v('Tag'), cls: String(cls).toUpperCase() }); };
      const group = new THREE.Group(); const meshes = []; const cats = { walls: 0, trusses: 0, joists: 0, other: 0 };
      api.StreamAllMeshes(mid, mesh => {
        const id = mesh.expressID; const me = lineInfo(id); const par = parent[id] ? lineInfo(parent[id]) : null;
        const c = IFC.cat([par && par.name, par && par.type, me.name, me.type, me.desc].join(' '), me.cls);
        const geoms = mesh.geometries;
        for (let i = 0; i < geoms.size(); i++) {
          const pg = geoms.get(i); const g = api.GetGeometry(mid, pg.geometryExpressID);
          const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
          const pos = new Float32Array(v.length / 2), nor = new Float32Array(v.length / 2);
          for (let k = 0, j = 0; k < v.length; k += 6, j += 3) { pos[j] = v[k]; pos[j + 1] = v[k + 1]; pos[j + 2] = v[k + 2]; nor[j] = v[k + 3]; nor[j + 1] = v[k + 4]; nor[j + 2] = v[k + 5]; }
          const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); bg.setIndex(new THREE.BufferAttribute(idx, 1));
          const col = pg.color; const tint = c === 'trusses' ? 0xc79a00 : null;
          const m = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: tint || new THREE.Color(col.x, col.y, col.z), transparent: col.w < 1, opacity: col.w, side: THREE.DoubleSide }));
          m.matrix.fromArray(pg.flatTransformation); m.matrixAutoUpdate = false; m.userData = { id, cat: c }; group.add(m); meshes.push(m);
          if (g.delete) g.delete();
        }
        cats[c]++;
      });
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      host.innerHTML = ''; host.appendChild(r.domElement); r.domElement.style.cssText = 'display:block;width:100%;height:100%;';
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf3f4f1); scene.add(group);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1)); const dl = new THREE.DirectionalLight(0xffffff, 0.55); dl.position.set(5, 10, 7); scene.add(dl);
      const cam = new THREE.PerspectiveCamera(40, 1.6, 0.05, 5000);
      const box = new THREE.Box3().setFromObject(group); const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1); const ctr = box.getCenter(new THREE.Vector3());
      const home = () => { cam.position.copy(ctr).add(new THREE.Vector3(size * .62, size * .42, size * .62)); cam.lookAt(ctr); if (ctl) { ctl.target.copy(ctr); ctl.update(); } };
      let ctl = null;
      const render = () => r.render(scene, cam);
      const fit = () => { const w = host.clientWidth || 640, h = host.clientHeight || 400; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); render(); };
      home(); fit();
      let ro = null;
      if (interactive) {
        ctl = new OrbitControls(cam, r.domElement); ctl.target.copy(ctr); ctl.enableDamping = false; ctl.addEventListener('change', render); ctl.update();
        ro = new ResizeObserver(fit); ro.observe(host);
        const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2(); let down = null;
        r.domElement.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
        r.domElement.addEventListener('pointerup', ev => {
          if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 4 || !onPick) return;
          const b = r.domElement.getBoundingClientRect(); ptr.set((ev.clientX - b.left) / b.width * 2 - 1, -(ev.clientY - b.top) / b.height * 2 + 1);
          ray.setFromCamera(ptr, cam); const hit = ray.intersectObjects(meshes.filter(x => x.visible), false)[0];
          if (!hit) return onPick(null);
          const id = hit.object.userData.id; const me = lineInfo(id); const par = parent[id] ? lineInfo(parent[id]) : null;
          onPick({ frame: (par && (par.name || par.tag)) || '', name: me.name || me.tag || '', type: me.type || (par && par.type) || '', cls: me.cls, cat: hit.object.userData.cat });
        });
      }
      return {
        cats,
        filter(c) { meshes.forEach(m => { m.visible = c === 'all' || m.userData.cat === c; }); render(); },
        reset() { home(); render(); },
        snapshot() { fit(); render(); return r.domElement.toDataURL('image/jpeg', 0.82); },
        dispose() { if (ro) ro.disconnect(); if (ctl) ctl.dispose(); meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); }); r.dispose(); try { api.CloseModel(mid); } catch (er) {} }
      };
    }
  };

  /* ---------- Detailing list ---------- */
  const fchip = f => `<span class="dfile"><b class="${f.kind}">${f.kind === 'ifc' ? 'IFC' : 'PDF'}</b>${e(f.label || f.name)}</span>`;
  App.views.detailing = (id) => {
    if (id) return D.setView(id);
    const all = D.list(); const s = D.S; const q = s.search.toLowerCase();
    const count = k => all.filter(x => D.match(x, k)).length;
    let list = all.filter(x => D.match(x, s.filter));
    if (q) list = list.filter(x => { const est = D.est(x); return [x.desc, est && st.displayNumber(est), est && (est.client.company || est.client.name), x.files.map(f => f.name).join(' ')].join(' ').toLowerCase().includes(q); });
    return `<div class="page-head"><div><p class="sub" style="margin:0 0 6px">Every set of detailing, with a preview</p><h1>Detailing</h1></div><div class="head-actions"><button class="btn primary" data-act="dtUpload">+ Upload detailing</button></div></div>
      <div class="row" style="flex-wrap:wrap;margin-bottom:16px"><input type="search" id="dt-q" placeholder="Search by description, job or client" value="${e(s.search)}" data-act-input="dtSearch" style="flex:1 1 300px">
        <div class="seg">${[['all', 'All'], ['ifc', 'With a 3D model'], ['pdf', 'PDF only'], ['free', 'Not linked to a job']].map(([k, l]) => `<label><input type="radio" name="dtf" value="${k}" data-act-change="dtFilter" ${s.filter === k ? 'checked' : ''}><span>${l} (${count(k)})</span></label>`).join('')}</div></div>
      ${list.length ? `<div class="dgrid">${list.map(x => { const est = D.est(x);
        return `<a class="dcard" href="#/detailing/${x.id}"><div class="dthumb ${D.hasIfc(x) ? 'ifc' : 'pdf'}"><img data-thumb="${x.id}" alt="" hidden><span class="dbadge ${D.hasIfc(x) ? 'ifc' : ''}">${D.hasIfc(x) ? '3D model (IFC)' : 'PDF detailing'}</span></div>
          <div class="dbody"><b class="dt">${e(x.desc)}</b><span class="hint">${est ? `<b>${e(st.displayNumber(est))}</b> ${e(est.client.company || est.client.name)}` : '<span class="tag yel">Not linked to a job yet</span>'}</span>
          <span class="dfiles">${x.files.map(fchip).join('')}</span><span class="hint small">Uploaded ${App.fmtShort(App.iso(new Date(x.createdAt)))}${x.createdBy ? ' by ' + e(x.createdBy) : ''}</span></div></a>`; }).join('')}</div>`
      : `<div class="empty"><h2>${all.length ? 'Nothing matches' : 'No detailing yet'}</h2><p>Upload an IFC model and the PDF detailing. Detailing you upload on an estimate or job shows here too.</p>${all.length ? '' : '<button class="btn primary" data-act="dtUpload">+ Upload detailing</button>'}</div>`}
      <p class="hint" style="margin-top:14px">Each set is saved in Google Drive twice: in the job's folder, and in CH Engineering Estimates / Detailing / (description).</p>`;
  };
  D.match = (x, k) => k === 'ifc' ? D.hasIfc(x) : k === 'pdf' ? !D.hasIfc(x) : k === 'free' ? !x.estId : true;
  App.views.detailing.mount = (id) => {
    if (id) return D.mountSet(id);
    D.list().forEach(async x => {
      try { let url = await D.loadThumb(x); if (!url && x.files.length) { await D.makeThumb(x); url = D.thumbs[x.id]; } const img = document.querySelector(`[data-thumb="${x.id}"]`); if (img && url) { img.src = url; img.hidden = false; } } catch (er) {}
    });
  };
  A.dtSearch = App.debounce(el => { D.S.search = el.value; App.refresh(); const i = document.getElementById('dt-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 200);
  A.dtFilter = el => { D.S.filter = el.value; App.refresh(); };

  /* ---------- Upload ---------- */
  A.dtUpload = (el) => {
    const preset = el && el.dataset && el.dataset.set ? D.get(el.dataset.set) : null;
    const ests = st.live().filter(x => !x.practice && !x.archived && x.status !== 'cancelled').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 150);
    const curEst = App.cur && App.cur.client ? App.cur : null;
    const m = App.modal(preset ? `Add files to ${preset.desc}` : 'Upload detailing', `
      ${preset ? '' : `${App.field('Description', `<input id="du-desc" placeholder="e.g. 6 x 6 garage or 120m² home" value="${e(curEst ? curEst.heading || '' : '')}">`)}<p class="hint" style="margin:-6px 0 12px">What it is. This names the folder in Drive.</p>
      ${App.field('Job or estimate', `<select id="du-est"><option value="">Not linked yet</option>${ests.map(x => `<option value="${x.id}" ${curEst && curEst.id === x.id ? 'selected' : ''}>${e(st.displayNumber(x))}, ${e(x.client.company || x.client.name)}, ${e(x.heading || '')}</option>`).join('')}</select>`)}
      ${App.field('Plans (optional)', '<input id="du-plans" placeholder="e.g. Building consent, Rev B">')}`}
      <label class="drop"><input type="file" id="du-files" accept=".ifc,.pdf,application/pdf" multiple><b>Drop the IFC and PDF files here</b><span class="hint">or click to choose them</span></label>
      <div id="du-list" class="du-list"></div>
      ${st.mode !== 'drive' ? '<p class="hint">You\'re not connected to Google, so these files are only kept until you close the app.</p>' : ''}`,
      { wide: true, actions: '<button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn primary" id="du-ok" disabled>Upload</button>' });
    let files = [];
    const inp = m.querySelector('#du-files'); const drop = m.querySelector('.drop');
    const show = () => {
      m.querySelector('#du-list').innerHTML = files.map((f, i) => `<div class="du-row"><b class="${/\.ifc$/i.test(f.name) ? 'ifc' : 'pdf'}">${/\.ifc$/i.test(f.name) ? 'IFC' : 'PDF'}</b><span>${e(f.name)} <span class="hint">${kb(f.size)}</span></span>${/\.ifc$/i.test(f.name) ? '<span class="hint">3D model</span>' : `<select data-i="${i}">${LABELS.map(l => App.opt(l, l, guessLabel(f.name))).join('')}</select>`}</div>`).join('');
      m.querySelector('#du-ok').disabled = !files.length;
    };
    const add = list => { [...list].forEach(f => { if (/\.(ifc|pdf)$/i.test(f.name)) files = files.filter(x => x.name !== f.name).concat([f]); else App.toast(`${f.name} isn't an IFC or PDF`, 'err'); }); show(); };
    inp.onchange = () => add(inp.files);
    drop.ondragover = ev => { ev.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = ev => { ev.preventDefault(); drop.classList.remove('over'); add(ev.dataTransfer.files); };
    m.querySelector('#du-ok').onclick = async ev => {
      const labels = {}; m.querySelectorAll('#du-list select').forEach(s => { labels[files[+s.dataset.i].name] = s.value; });
      ev.target.disabled = true; ev.target.textContent = 'Uploading…';
      try {
        let set = preset;
        if (preset) await D.addFiles(preset, files, labels);
        else {
          const desc = m.querySelector('#du-desc').value.trim(); if (!desc) { App.toast('Add a description', 'err'); ev.target.disabled = false; ev.target.textContent = 'Upload'; return; }
          set = await D.create({ desc, estId: m.querySelector('#du-est').value, files, labels, plans: m.querySelector('#du-plans').value.trim() });
        }
        App.closeModal(); App.toast('Detailing saved'); location.hash = `#/detailing/${set.id}`; App.refresh();
      } catch (er) { App.toast(er.message, 'err', 7000); ev.target.disabled = false; ev.target.textContent = 'Upload'; }
    };
  };

  /* ---------- One set ---------- */
  D.setView = id => {
    const x = D.get(id); if (!x) return '<div class="empty"><h2>Detailing not found</h2><a class="btn" href="#/detailing">Back to Detailing</a></div>';
    const est = D.est(x); const ifc = x.files.find(f => f.kind === 'ifc'); const pdfs = x.files.filter(f => f.kind === 'pdf');
    const totalLm = pdfs.reduce((t, f) => t + (f.lm || 0), 0);
    const ests = st.live().filter(z => !z.practice && !z.archived && z.status !== 'cancelled').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 150);
    const viewer = ifc ? `<section class="card dview"><div class="dv-head"><span class="row"><b class="dk ifc">IFC</b><b>3D model</b><span class="hint">${e(ifc.name)}, ${kb(ifc.size || 0)}</span></span>
        <span class="row" style="flex-wrap:wrap"><span class="seg" id="ifc-cats"></span><button class="btn small" data-act="ifcReset">Reset view</button><button class="btn small" data-act="ifcFull">Full screen</button></span></div>
      <div class="dv-3d" id="ifc-host"><p class="hint pad">Loading the 3D model…</p></div><div class="ifc-pick" id="ifc-pick" hidden></div>
      <p class="hint dv-help">Drag to spin, scroll to zoom, right-drag to move. Click a part to see what it is.</p></section>` : '';
    const pdfv = pdfs.length ? `<section class="card dview"><div class="dv-head"><span class="row"><b class="dk pdf">PDF</b><b>Detailing</b></span>
        <span class="seg wrap">${pdfs.map((f, i) => `<label><input type="radio" name="pdft" value="${f.id}" data-act-change="pdfTab" ${i === 0 ? 'checked' : ''}><span>${e(f.label)}${f.pages ? ` (${f.pages})` : ''}</span></label>`).join('')}</span>
        <span class="row"><button class="btn small" data-act="pdfPage" data-d="-1" aria-label="Previous page">‹</button><span class="small" id="pdf-pg">Page 1</span><button class="btn small" data-act="pdfPage" data-d="1" aria-label="Next page">›</button><button class="btn small" data-act="pdfZoom">Zoom</button><button class="btn small" data-act="pdfDownload">Download</button></span></div>
      <div class="dv-pdf"><div class="pdf-thumbs" id="pdf-thumbs"></div><div class="pdf-main" id="pdf-main"><p class="hint pad">Loading…</p></div></div></section>` : '';
    return `<div class="page-head"><div><p class="crumbs"><a href="#/detailing">Detailing</a></p><h1>${e(x.desc)}</h1><p class="sub">${est ? `${e(st.displayNumber(est))}, ${e(est.client.company || est.client.name)}${est.siteAddress ? ', ' + e(est.siteAddress) : ''}` : 'Not linked to a job yet'}</p></div>
      <div class="head-actions">${est ? `<a class="btn" href="${est.job ? `#/job/${est.id}` : `#/e/${est.id}`}">Open ${est.job ? 'job' : 'estimate'}</a>` : ''}<button class="btn" data-act="dtDownloadAll">Download all</button></div></div>
    <div class="dset">
      <div class="dset-main">${viewer}${pdfv}${!ifc && !pdfs.length ? '<div class="empty"><h2>No files yet</h2></div>' : ''}</div>
      <aside class="dset-side">
        <section class="card"><h3>Details</h3>
          ${App.field('Description', `<input value="${e(x.desc)}" data-act-change="dtSet" data-k="desc">`)}
          ${App.field('Job or estimate', `<select data-act-change="dtSet" data-k="estId"><option value="">Not linked yet</option>${ests.map(z => `<option value="${z.id}" ${z.id === x.estId ? 'selected' : ''}>${e(st.displayNumber(z))}, ${e(z.client.company || z.client.name)}</option>`).join('')}</select>`)}
          ${App.field('Plans', `<input value="${e(x.plans || '')}" placeholder="e.g. Building consent, Rev B" data-act-change="dtSet" data-k="plans">`)}
          <div class="kv-list small"><div><span>Uploaded</span><b>${App.fmtShort(App.iso(new Date(x.createdAt)))}${x.createdBy ? ', ' + e(x.createdBy) : ''}</b></div>${totalLm ? `<div><span>Total steel (from the PDFs)</span><b>${Math.round(totalLm).toLocaleString('en-NZ')} LM</b></div>` : ''}</div>
          ${x.folderId ? `<div class="drive-box"><b>Saved in Google Drive</b><span class="hint">CH Engineering Estimates / Detailing / ${e(x.folderName || x.desc)}${est ? `<br>…/ ${e(st.displayNumber(est))} / Detailing` : ''}</span><a class="btn small" href="https://drive.google.com/drive/folders/${e(x.folderId)}" target="_blank" rel="noopener">Open in Drive</a></div>` : ''}</section>
        ${pdfs.length ? `<section class="card"><h3>Use this detailing</h3>
          <div class="use-box"><b>Price the job</b><span class="hint">Fills the steel in the workings, split by gauge</span><button class="btn small" data-act="dtPrice" ${est && est.status === 'draft' ? '' : 'disabled'}>Use for pricing</button>${est && est.status !== 'draft' ? '<span class="hint small">Only for draft estimates.</span>' : !est ? '<span class="hint small">Link it to an estimate first.</span>' : ''}</div>
          <div class="use-box"><b>Frames and deliveries</b><span class="hint">Frame list for the checklist and delivery dockets</span><button class="btn small" data-act="dtJob" ${est && est.job ? '' : 'disabled'}>Use for the job</button>${!(est && est.job) ? '<span class="hint small">Once the job is accepted.</span>' : ''}</div></section>` : ''}
        <section class="card"><h3>Files</h3>${x.files.map(f => `<div class="du-row"><b class="${f.kind}">${f.kind === 'ifc' ? 'IFC' : 'PDF'}</b><span>${e(f.label)}<span class="hint" style="display:block">${e(f.name)}, ${kb(f.size || 0)}${f.pages ? `, ${f.pages} pages` : ''}${f.lm ? `, ${Math.round(f.lm).toLocaleString('en-NZ')} LM` : ''}</span></span><button class="icon-btn" data-act="dtFileDel" data-f="${f.id}" aria-label="Take ${e(f.name)} out of this set">✕</button></div>`).join('')}
          <button class="btn small" data-act="dtUpload" data-set="${x.id}" style="margin-top:10px">+ Add files</button></section>
        <div class="row-btns"><button class="btn ghost danger small" data-act="dtDelete">Remove this set</button></div>
      </aside></div>`;
  };
  let V = null, P = null;
  D.mountSet = async id => {
    const x = D.get(id); if (!x) return;
    if (V) { try { V.dispose(); } catch (er) {} V = null; }
    const ifc = x.files.find(f => f.kind === 'ifc');
    const firstPdf = x.files.find(f => f.kind === 'pdf');
    if (firstPdf) D.openPdf(firstPdf).catch(er => { const m = document.getElementById('pdf-main'); if (m) m.innerHTML = `<p class="hint pad">${e(er.message)}</p>`; });
    if (ifc) {
      const host = document.getElementById('ifc-host');
      try {
        const buf = await (await D.blob(ifc)).arrayBuffer();
        if (!document.getElementById('ifc-host')) return;
        V = await IFC.open(host, buf, { interactive: true, onPick: p => { const b = document.getElementById('ifc-pick'); if (!b) return; if (!p) { b.hidden = true; return; } b.hidden = false; b.innerHTML = `<b>${e(p.frame || p.name || 'Part')}</b>${p.frame && p.name ? ` <span class="hint">${e(p.name)}</span>` : ''}<span class="hint" style="display:block">${e([p.type, p.cat !== 'other' ? p.cat.replace(/s$/, '') : ''].filter(Boolean).join(', '))}</span>`; } });
        const cats = [['all', 'Everything']].concat([['walls', 'Walls'], ['trusses', 'Trusses'], ['joists', 'Joists']].filter(([k]) => V.cats[k] > 0));
        const seg = document.getElementById('ifc-cats'); if (seg && cats.length > 1) seg.innerHTML = cats.map(([k, l], i) => `<label><input type="radio" name="ifcc" value="${k}" data-act-change="ifcCat" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`).join('');
        if (!x.thumbId && !x.thumbData && x.thumbKind !== 'ifc') D.makeThumb(x).catch(() => {});
      } catch (er) { if (host) host.innerHTML = `<p class="hint pad">Couldn't open the 3D model: ${e(er.message)}</p>`; }
    }
  };
  window.addEventListener('hashchange', () => { if (V && !/^#\/detailing\//.test(location.hash)) { try { V.dispose(); } catch (er) {} V = null; } });
  A.ifcCat = el => V && V.filter(el.value);
  A.ifcReset = () => V && V.reset();
  A.ifcFull = () => { const h = document.getElementById('ifc-host'); if (!h) return; if (document.fullscreenElement) document.exitFullscreen(); else h.requestFullscreen && h.requestFullscreen(); };

  /* ---------- PDF viewer ---------- */
  D.openPdf = async f => {
    const pdfjs = await App.FC.lib(); const buf = await (await D.blob(f)).arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    P = { f, doc, page: 1, zoom: 1 };
    const th = document.getElementById('pdf-thumbs');
    if (th) {
      th.innerHTML = Array.from({ length: doc.numPages }, (_, i) => `<button class="pthumb ${i === 0 ? 'on' : ''}" data-act="pdfGo" data-p="${i + 1}"><canvas data-p="${i + 1}"></canvas><span>${i + 1}</span></button>`).join('');
      const io = new IntersectionObserver(ents => ents.forEach(async en => { if (!en.isIntersecting) return; io.unobserve(en.target); const c = en.target; const pg = await doc.getPage(+c.dataset.p); const vp0 = pg.getViewport({ scale: 1 }); const vp = pg.getViewport({ scale: 220 / vp0.width }); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; }), { root: th });
      th.querySelectorAll('canvas').forEach(c => io.observe(c));
    }
    await D.renderPage();
  };
  D.renderPage = async () => {
    if (!P) return; const main = document.getElementById('pdf-main'); if (!main) return;
    const pg = await P.doc.getPage(P.page); const vp0 = pg.getViewport({ scale: 1 });
    const w = Math.max(320, main.clientWidth - 40) * P.zoom; const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = pg.getViewport({ scale: w / vp0.width * dpr });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; c.style.width = (vp.width / dpr) + 'px';
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    main.innerHTML = ''; main.appendChild(c);
    const lab = document.getElementById('pdf-pg'); if (lab) lab.textContent = `Page ${P.page} of ${P.doc.numPages}`;
    document.querySelectorAll('.pthumb').forEach(b => b.classList.toggle('on', +b.dataset.p === P.page));
    /* keep the current page's thumbnail in view, without scrolling the whole page */
    const on = document.querySelector(`.pthumb[data-p="${P.page}"]`); const th = document.getElementById('pdf-thumbs');
    if (on && th) { const t = on.offsetTop - th.offsetTop; if (t < th.scrollTop || t > th.scrollTop + th.clientHeight - on.offsetHeight) th.scrollTop = Math.max(0, t - 10); }
  };
  A.pdfTab = el => { const x = D.get(App.route().a); const f = x && x.files.find(z => z.id === el.value); if (f) D.openPdf(f).catch(er => App.toast(er.message, 'err')); };
  A.pdfPage = el => { if (!P) return; P.page = Math.min(P.doc.numPages, Math.max(1, P.page + (+el.dataset.d))); D.renderPage(); };
  A.pdfGo = el => { if (!P) return; P.page = +el.dataset.p; D.renderPage(); };
  A.pdfZoom = () => { if (!P) return; P.zoom = P.zoom === 1 ? 1.8 : 1; D.renderPage(); };
  A.pdfDownload = async () => { if (!P) return; App.download(P.f.name, await D.blob(P.f), 'application/pdf'); };
  A.dtDownloadAll = async () => { const x = D.get(App.route().a); for (const f of x.files) { try { App.download(f.name, await D.blob(f)); } catch (er) { App.toast(er.message, 'err'); } } };

  /* ---------- Set actions ---------- */
  A.dtSet = async el => {
    const x = D.get(App.route().a); const k = el.dataset.k; const old = x[k]; x[k] = el.value; x.updatedAt = Date.now(); st.touch(x); st.save();
    if (k === 'desc' && x.folderId && st.mode === 'drive') { try { const name = D.safe(x.desc); await App.G.rename(x.folderId, name); x.folderName = name; st.touch(x); st.save(); } catch (er) {} }
    if (k === 'estId' && x.estId && x.estId !== old && st.mode === 'drive') {
      try { const fo = await D.folders(x); if (fo.job) for (const f of x.files) await App.G.uploadOrReplace({ name: f.name, parent: fo.job, blob: await D.blob(f) }); App.toast('Copied into the job\'s Detailing folder'); } catch (er) { App.toast(er.message, 'err'); }
    }
    App.refresh();
  };
  A.dtFileDel = async el => {
    const x = D.get(App.route().a); const f = x.files.find(z => z.id === el.dataset.f);
    if (!(await App.confirm(`Take ${f.name} out of this set?`, 'It stays in Google Drive, it just won\'t show here.', 'Take it out'))) return;
    x.files = x.files.filter(z => z.id !== f.id); st.touch(x); st.save(); D.makeThumb(x).catch(() => {}); App.refresh();
  };
  A.dtDelete = async () => {
    const x = D.get(App.route().a);
    if (!(await App.confirm(`Remove ${x.desc}?`, 'It comes off the Detailing tab. The files stay in Google Drive.', 'Remove'))) return;
    x.deleted = true; st.touch(x); st.save(); location.hash = '#/detailing';
  };
  const pickPdf = async x => {
    const pdfs = x.files.filter(f => f.kind === 'pdf'); if (pdfs.length === 1) return pdfs[0];
    return new Promise(res => { const m = App.modal('Which PDF?', `<p class="hint">Pick the detailing to read the frames from.</p>${pdfs.map(f => `<button class="btn" style="width:100%;margin-bottom:6px" data-f="${f.id}">${e(f.label)} <span class="hint">${e(f.name)}</span></button>`).join('')}`, {}); m.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { App.closeModal(); res(pdfs.find(f => f.id === b.dataset.f)); }); });
  };
  A.dtPrice = async () => {
    const x = D.get(App.route().a); const est = D.est(x); if (!est) return; const f = await pickPdf(x); if (!f) return;
    try { App.toast('Reading the drawings…'); const fc = await App.FC.parse(await (await D.blob(f)).arrayBuffer(), f.name); if (!fc.frames.length) throw new Error('No frames found in that PDF.'); est.workings.framecad = fc; st.log(est, `Detailing read for pricing: ${f.name}`); st.touch(est); st.save(); location.hash = `#/e/${est.id}/workings`; App.toast('Read. Check the steel split in the workings.'); }
    catch (er) { App.toast(er.message, 'err', 6000); }
  };
  A.dtJob = async () => {
    const x = D.get(App.route().a); const est = D.est(x); if (!est || !est.job) return; const f = await pickPdf(x); if (!f) return;
    try {
      const fc = await App.FC.parse(await (await D.blob(f)).arrayBuffer(), f.name); if (!fc.frames.length) throw new Error('No frames found in that PDF.');
      if (est.job.frames.length && !(await App.confirm('Replace the frame list?', `This job already has ${est.job.frames.length} frame types. Replace them with the ${fc.frames.length} from ${f.name}? Any delivery split and checklist ticks will be reset.`, 'Replace'))) return;
      est.job.frames = fc.frames; est.job.loads = []; est.job.checklist.ticks = {}; est.job.framesFrom = f.name;
      est.job.detailed = { byCatLM: fc.byCatLM, byProfile: fc.byProfile, totalLM: fc.totalLM, file: f.name, at: Date.now() };
      st.log(est, `Frames read from ${f.name}: ${App.FC.summaryText(fc)}`); st.touch(est); st.save(); location.hash = `#/job/${est.id}/deliveries`;
    } catch (er) { App.toast(er.message, 'err', 6000); }
  };
})();
