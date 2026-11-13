/* SSM Work · Spare Part module.
   Routes (inside the hub): #spare-part          → project list + "Create new project" button + search bar
                            #spare-part/sp-<JO> → one spare part project in the "Suggested spares" format (import / export .xlsx)
   Data:  /api/spare-part/jobs – job list from RAK_Master_Project_on_hand; /spare-part/data/sources.json – Job Order / P&ID / aux snapshot added by Job No.
          /api/spare-part/projects       – saved spare part projects (Supabase via middleware);
                                           falls back to this browser's storage if the table is not set up yet. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LS = "ssm.spare-part.projects.v1";
  const norm = s => String(s ?? "").toLowerCase().replace(/[\s\-_.,()#/]+/g, "");
  const has = (hay, q) => !q || norm(hay).includes(norm(q));
  let SRC = null, PROJECTS = null, MODE = "server", ROOT = null, Q = { jo: "", customer: "", name: "" };

  /* ---------- storage ---------- */
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch { return []; } };
  const lsWrite = list => { try { localStorage.setItem(LS, JSON.stringify(list)); } catch {} };
  /* Jobs: RAK_Master_Project_on_hand (via /api/spare-part/jobs) is the job list; Job Order header, P&ID and aux equipment
     from sources.json (snapshot of Drive + Project Pipeline) are added when the same Job No. is there. */
  const jobKey = v => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  async function loadJobs() {
    const snap = await fetch("/spare-part/data/sources.json", { cache: "no-store" }).then(r => r.ok ? r.json() : { jobs: [] }).catch(() => ({ jobs: [] }));
    const master = await fetch("/api/spare-part/jobs", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!master || !Array.isArray(master.jobs)) return { ...snap, from: "snapshot" };
    const byJo = new Map((snap.jobs || []).map(j => [jobKey(j.jo), j]));
    const jobs = master.jobs.map(m => {
      const d = byJo.get(jobKey(m.job_no)) || {};
      return { scope: [], aux: [], pid: [], pidTags: [], layout: [], ...d, jo: m.job_no, customerShort: m.customer || d.customerShort || "",
        customer: m.customer_full || d.customer || m.customer || "", name: m.job_full || m.job_name || d.name || "", shortName: m.job_name || "", detail: !!d.jo };
    }).sort((a, b) => String(b.jo).localeCompare(String(a.jo), "en", { numeric: true }));
    return { ...snap, jobs, from: master.table };
  }
  async function loadAll() {
    if (!SRC) SRC = await loadJobs();
    if (PROJECTS) return;
    try {
      const r = await fetch("/api/spare-part/projects", { cache: "no-store" });
      if (!r.ok) throw 0;
      PROJECTS = await r.json(); MODE = "server";
      // Projects made while the database was not connected live only in this browser: upload them once, then clear them.
      const onServer = x => PROJECTS.some(p => p.id === x.id || (p.jo && p.jo === x.jo));
      const all = lsRead(), local = all.filter(x => x && x.id && !onServer(x));
      const left = all.filter(x => x && x.id && onServer(x)); // same Job No. already on the server: keep the browser copy, don't overwrite
      for (const x of local) {
        const u = await fetch("/api/spare-part/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(x) }).catch(() => null);
        if (u && u.ok) PROJECTS.unshift(x); else left.push(x);
      }
      if (local.length) lsWrite(left);
    } catch { PROJECTS = lsRead(); MODE = "local"; }
  }
  async function save(p) {
    p.updated = new Date().toISOString();
    if (MODE === "server") {
      const r = await fetch("/api/spare-part/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) }).catch(() => null);
      if (r && r.ok) { const saved = await r.json(); upsert(saved); return saved; }
      MODE = "local";
    }
    upsert(p); lsWrite(PROJECTS); return p;
  }
  async function remove(id) {
    if (MODE === "server") {
      const r = await fetch("/api/spare-part/projects?id=" + encodeURIComponent(id), { method: "DELETE" }).catch(() => null);
      if (!r || !r.ok) return false;
    }
    PROJECTS = PROJECTS.filter(x => x.id !== id); if (MODE === "local") lsWrite(PROJECTS);
    return true;
  }
  const upsert = p => { const i = PROJECTS.findIndex(x => x.id === p.id); i < 0 ? PROJECTS.unshift(p) : (PROJECTS[i] = p); };
  // URL of a project: #spare-part/sp-<Job No.>  e.g. #spare-part/sp-04202026
  const slugOf = p => "sp-" + (String(p.jo || "").trim().replace(/[^\w-]+/g, "-") || p.id);
  const uid = () => "sp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- starting lines from the Project Pipeline aux list (category per equipment type) ---------- */
  function auxCat(eq) {
    const c = (eq.category || "").toLowerCase(), n = (eq.name || "").toLowerCase();
    if (c.includes("pump") || /pump/.test(n)) return "Pump";
    if (c.includes("filtration")) return "Filter";
    if (c.includes("heat") || c.includes("heater")) return "Heater & Heat Exchanger";
    if (c.includes("rectifier")) return "Electrical Part";
    if (c.includes("instrument")) return "Instrument & Sensor";
    return "Mechanical Part";
  }
  const auxLines = eqs => eqs.map(eq => ({ id: uid(), prio: "Recommended", cat: auxCat(eq), code: "", desc: [eq.name, eq.spec].filter(Boolean).join(" · "),
    pqty: eq.qty || "", unit: eq.unit || "pc", ovr: "", tech: [eq.tag && "Tag: " + eq.tag, eq.zone].filter(Boolean).join(" · "), reason: "", source: "Aux list" }));

  /* ---------- views ---------- */
  const STATUS = { draft: ["Draft", "soon"], review: ["Review", "soon"], issued: ["Issued", "live"], inactive: ["Inactive", "off"] };
  const isAdmin = () => !!(window.SSM_ME && window.SSM_ME.role === "admin");
  const pill = s => { const [t, k] = STATUS[s] || STATUS.draft; return `<span class="badge ${k}">${t}</span>`; };
  const fmtDate = d => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";

  function topBar() {
    return `<div class="sp-bar" role="search">
      <label><span>Job No.</span><input data-q="jo" value="${esc(Q.jo)}" placeholder="เช่น 04202026" inputmode="numeric"></label>
      <label><span>Customer</span><input data-q="customer" value="${esc(Q.customer)}" placeholder="เช่น HAM-LET"></label>
      <label><span>Project name</span><input data-q="name" value="${esc(Q.name)}" placeholder="เช่น EP Line"></label>
      </div>`;
  }
  const matches = p => has(p.jo, Q.jo) && has((p.customer || "") + " " + (p.customerShort || ""), Q.customer) && has(p.name, Q.name);

  function listTable() {
    const rows = PROJECTS.filter(matches);
    if (!PROJECTS.length) return `<div class="empty">ยังไม่มีโปรเจค Spare Part · กด <b>Create new project</b> เพื่อเลือก Job แล้วระบบจะดึงข้อมูลจาก Job Order, Aux list และ P&ID ให้</div>`;
    if (!rows.length) return `<div class="empty">ไม่พบโปรเจคที่ตรงกับคำค้น</div>`;
    return `<div class="tbl"><table><thead><tr><th>Job No.</th><th>Customer</th><th>Project name</th><th>รายการอะไหล่</th><th>สถานะ</th><th>อัปเดต</th><th></th></tr></thead><tbody>${rows.map(p => `
      <tr class="${p.status === "inactive" ? "sp-off" : ""}"><td><span class="jo">${esc(p.jo)}</span></td><td>${esc(p.customerShort || p.customer)}<div class="sub">${esc(p.site || "")}</div></td>
      <td>${esc(p.name)}</td><td>${(p.lines || []).length}</td><td>${pill(p.status)}</td><td class="sub">${fmtDate(p.updated)}</td>
      <td><a class="open" href="#spare-part/${encodeURIComponent(slugOf(p))}">เปิด →</a></td></tr>`).join("")}</tbody></table></div>`;
  }

  function pageList() {
    const banner = MODE === "local" ? `<div class="sp-note">⚠️ ยังไม่ได้เชื่อมฐานข้อมูล Spare Part · โปรเจคที่สร้างจะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น (ผู้ดูแลรันไฟล์ <code>database/spare_part_projects.sql</code> ใน Supabase แล้วจะบันทึกส่วนกลาง)</div>` : "";
    const create = `<div class="sp-create"><button class="sp-btn primary big" data-act="new">＋ Create new project</button><span class="sub">เลือก Job → ดึงข้อมูลจาก Job Order, Aux list และ P&ID → ได้ Draft รายการอะไหล่</span></div>`;
    ROOT.innerHTML = create + topBar() + banner + `<div id="spList">${listTable()}</div>`
      + `<p class="sp-src">แหล่งข้อมูล: Job Order ใน <a href="${esc(SRC.sources?.drive)}" target="_blank" rel="noopener">RAK Project 2026</a> (เฉพาะ job ตั้งแต่ ต.ค. 2026) · Aux/Equipment จาก <a href="${esc(SRC.sources?.pipeline)}" target="_blank" rel="noopener">Project Pipeline</a> · P&ID ในโฟลเดอร์ job · อัปเดตข้อมูล ${esc(SRC.updated || "")}</p>`;
    ROOT.querySelectorAll("[data-q]").forEach(i => i.addEventListener("input", () => { Q[i.dataset.q] = i.value.trim(); ROOT.querySelector("#spList").innerHTML = listTable(); }));
  }

  /* --- Create new project wizard --- */
  let WIZ = null;
  function openWizard() { WIZ = { step: 1, q: "", job: null, head: null, eqSel: null }; drawWizard(); }
  function closeWizard() { WIZ = null; document.getElementById("spModal")?.remove(); }
  function drawWizard() {
    let m = document.getElementById("spModal");
    if (!m) { m = document.createElement("div"); m.id = "spModal"; m.className = "sp-modal"; document.body.appendChild(m); }
    const used = new Set(PROJECTS.map(p => p.jo));
    let body = "", foot = "";
    if (WIZ.step === 1) {
      const jobs = SRC.jobs.filter(j => has([j.jo, j.customer, j.customerShort, j.name, j.shortName, j.pmName].join(" "), WIZ.q));
      body = `<p class="sp-sub">เลือก Job ที่จะทำรายการอะไหล่ · ${SRC.from === "snapshot" ? "จากข้อมูล Job Order ตั้งแต่ ต.ค. 2026" : "จาก RAK_Master_Project_on_hand (" + SRC.jobs.length + " งาน)"}</p>
        <input class="sp-in" id="wq" placeholder="ค้นหา Job No. / ลูกค้า / ชื่องาน" value="${esc(WIZ.q)}">
        <div class="sp-jobs">${jobs.map(j => `<button class="sp-job" data-jo="${esc(j.jo)}" ${used.has(j.jo) ? "disabled" : ""}>
          <span class="jo">${esc(j.jo)}</span><b>${esc(j.name)}</b><span class="sub">${esc(j.customerShort)} · ${esc(j.customer)}</span>
          <span class="sp-tags">${j.aux.length ? `<i>${j.aux.length} equipment</i>` : ""}${j.pid.length ? `<i>${j.pid.length} P&ID</i>` : ""}${used.has(j.jo) ? "<i>มีโปรเจคแล้ว</i>" : ""}</span></button>`).join("") || `<div class="empty">ไม่พบ job</div>`}</div>`;
    } else if (WIZ.step === 2) {
      const h = WIZ.head, j = WIZ.job;
      const f = (k, label, wide) => `<label class="${wide ? "wide" : ""}"><span>${label}</span><input data-h="${k}" value="${esc(h[k])}"></label>`;
      body = `<p class="sp-sub">ข้อมูลเบื้องต้นจาก RAK_Master_Project_on_hand${j.joFile ? ` และ <a href="${esc(j.joFile)}" target="_blank" rel="noopener">Job Order ${esc(j.jo)}</a>` : ""} แก้ไขได้</p>
        <div class="sp-form">${f("jo", "Job No.")}${f("customerShort", "Customer (ย่อ)")}${f("customer", "Customer", 1)}${f("name", "Project name", 1)}
        ${f("site", "สถานที่")}${f("contact", "ผู้ติดต่อลูกค้า")}${f("tel", "โทร")}${f("qo", "QO No.")}${f("po", "PO No.")}${f("delivery", "กำหนดส่งมอบ")}${f("pm", "หัวหน้าโครงการ")}${f("coordinator", "ผู้ประสานงาน")}${f("systems", "Systems (จำนวนชุด)")}${f("rate", "Maximum rate (%)")}</div>
        ${j.scope.length ? `<h4 class="sp-h">ขอบเขตงานตาม Job Order</h4><ul class="sp-scope">${j.scope.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}`;
    } else {
      const j = WIZ.job;
      body = `<p class="sp-sub">Aux / Equipment list จาก Project Pipeline (JO ${esc(j.jo)}) · เลือกอุปกรณ์ที่จะเป็นรายการตั้งต้น (หรือไม่เลือกเลย แล้ว Import ไฟล์ Suggested spares ในหน้าโปรเจค)</p>
        <div class="tbl"><table><thead><tr><th></th><th>Equipment</th><th>Tag (P&ID)</th><th>Zone</th><th>Qty</th></tr></thead><tbody>${j.aux.map((e, i) => `
          <tr><td><input type="checkbox" data-eq="${i}" ${WIZ.eqSel[i] ? "checked" : ""}></td><td><b>${esc(e.name)}</b><div class="sub">${esc(e.spec)}</div>${e.specStatus !== "approved" ? `<span class="badge soon">spec ${esc(e.specStatus)}</span>` : ""}</td>
          <td>${esc(e.tag || "–")}</td><td>${esc(e.zone || e.system || "")}<div class="sub">${esc([e.system, e.location].filter(Boolean).join(" · "))}</div></td><td>${e.qty} ${esc(e.unit)}</td></tr>`).join("")}</tbody></table></div>
        <h4 class="sp-h">อ้างอิง P&ID</h4>${j.pid.length ? `<ul class="sp-scope">${j.pid.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></li>`).join("")}${j.pidTags.map(t => `<li class="sub">${esc(t)}</li>`).join("")}</ul>`
          : `<p class="sub">ยังไม่พบ P&ID ในโฟลเดอร์ job${(j.layout || []).length ? ` · มี <a href="${esc(j.layout[0].url)}" target="_blank" rel="noopener">${esc(j.layout[0].title)}</a>` : ""}</p>`}`;
    }
    if (WIZ.step > 1) foot += `<button class="sp-btn" data-w="back">← ย้อนกลับ</button>`;
    if (WIZ.step === 2) foot += WIZ.job.aux.length || WIZ.job.pid.length ? `<button class="sp-btn primary" data-w="next">ถัดไป: Equipment →</button>` : `<button class="sp-btn primary" data-w="create">สร้าง Draft</button>`;
    if (WIZ.step === 3) foot += `<button class="sp-btn primary" data-w="create">สร้าง Draft</button>`;
    m.innerHTML = `<div class="sp-dlg" role="dialog" aria-modal="true" aria-label="Create new project">
      <div class="sp-dlg-h"><b>Create new project</b><span class="sp-steps">${["เลือก Job", "ข้อมูลโปรเจค", "Equipment & P&ID"].map((s, i) => `<i class="${WIZ.step === i + 1 ? "on" : ""}">${i + 1}. ${s}</i>`).join("")}</span><button class="sp-x" data-w="close" aria-label="ปิด">✕</button></div>
      <div class="sp-dlg-b">${body}</div><div class="sp-dlg-f">${foot}</div></div>`;
    m.onclick = e => { if (e.target === m) closeWizard(); };
    m.querySelectorAll("[data-w]").forEach(b => b.onclick = () => wizAct(b.dataset.w));
    const wq = m.querySelector("#wq"); if (wq) { wq.oninput = () => { WIZ.q = wq.value; const pos = wq.selectionStart; drawWizard(); const n = document.getElementById("wq"); n.focus(); n.setSelectionRange(pos, pos); }; }
    m.querySelectorAll("[data-jo]").forEach(b => b.onclick = () => {
      const j = SRC.jobs.find(x => x.jo === b.dataset.jo);
      WIZ.job = j; WIZ.step = 2; WIZ.eqSel = j.aux.map(() => true);
      WIZ.head = { jo: j.jo, customer: j.customer, customerShort: j.customerShort, name: j.name, site: j.site, contact: j.contact, tel: j.tel, qo: j.qo, po: j.po, delivery: j.delivery, pm: j.pm, coordinator: j.coordinator, systems: 1, rate: 15 };
      drawWizard();
    });
    m.querySelectorAll("[data-h]").forEach(i => i.oninput = () => { WIZ.head[i.dataset.h] = i.value; });
    m.querySelectorAll("[data-eq]").forEach(i => i.onchange = () => { WIZ.eqSel[+i.dataset.eq] = i.checked; });
  }
  async function wizAct(a) {
    if (a === "close") return closeWizard();
    if (a === "back") { WIZ.step--; return drawWizard(); }
    if (a === "next") { WIZ.step = 3; return drawWizard(); }
    if (a === "create") {
      const j = WIZ.job, eqs = j.aux.filter((_, i) => WIZ.eqSel[i]);
      const { systems: _s, rate: _r, ...head } = WIZ.head;
      const p = { id: uid(), ...head, ij: j.ij, status: "draft", created: new Date().toISOString(), createdBy: (window.SSM_ME && window.SSM_ME.email) || "",
        refs: { folder: j.folder, joFile: j.joFile, pid: j.pid, layout: j.layout || [], pipeline: SRC.sources?.pipeline },
        equipment: eqs, lines: auxLines(eqs), systems: Math.max(1, num(_s) || 1), maxRate: (num(_r) || 15) / 100 };
      const saved = await save(p); closeWizard(); location.hash = "#spare-part/" + encodeURIComponent(slugOf(saved));
    }
  }

  /* --- project detail: "Suggested spare part list" format (EP500L Rev01, 13 Nov 2026) ---
     Qty / system = Project qty ÷ Systems; Spare / system = MAX(1, ROUNDDOWN(Qty / system × Maximum rate)) (0 when Qty / system = 0);
     Spare / all systems = Spare / system × Systems; a value typed in Spare / system overrides the formula for that row. */
  const PRIOS = ["Critical", "Recommended", "Optional"];
  const CATS = ["Pump", "Filter", "Instrument & Sensor", "Electrical Part", "Pneumatic Part", "Valve", "Mechanical Part", "Heater & Heat Exchanger", "Seal & O-Ring", "Nozzle & Cleaning Accessory"];
  const prioCls = v => "p-" + String(v || "recommended").toLowerCase();
  const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
  const fmtN = n => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  const settingsOf = p => ({ systems: Math.max(1, num(p.systems) || 1), rate: (num(p.maxRate) > 0 ? num(p.maxRate) : 0.15) });
  function calc(l, p) {
    const { systems, rate } = settingsOf(p);
    const qps = num(l.pqty) / systems;
    const manual = String(l.ovr ?? "").trim() !== "";
    const auto = qps > 0 ? Math.max(1, Math.floor(qps * rate + 1e-9)) : 0;
    const sps = manual ? num(l.ovr) : auto;
    const lr = qps > 0 ? sps / qps : 0;
    const note = (qps % 1 ? "Check allocation; " : "") + (manual ? "Manual; " : "") + (qps <= 0 ? "No project qty" : lr > rate + 1e-9 ? "Minimum-1 exception" : `Within ${fmtN(rate * 100)}%`);
    return { qps, auto, sps, total: sps * systems, lr, note, manual };
  }
  const catsOf = p => { const c = []; (p.lines || []).forEach(l => { if (!c.includes(l.cat)) c.push(l.cat); }); (p.cats || []).forEach(x => { if (!c.includes(x)) c.push(x); });
    return c.sort((a, b) => (CATS.indexOf(a) < 0 ? 99 : CATS.indexOf(a)) - (CATS.indexOf(b) < 0 ? 99 : CATS.indexOf(b))); };
  function migrate(p) { // projects saved in the earlier zone / 14-column layout
    if (p.systems === undefined) p.systems = 1;
    if (p.maxRate === undefined) p.maxRate = 0.15;
    (p.lines || []).forEach(l => {
      if (l.cat !== undefined) return;
      Object.assign(l, { cat: l.zone || "Mechanical Part", code: l.partNo || "", desc: [l.equip, l.tag, l.part, l.maker, l.spec].filter(Boolean).join(" · "),
        pqty: l.installed ?? "", ovr: "", tech: l.remark || "", reason: "", prio: l.prio === "Consumable" ? "Recommended" : (l.prio || "Recommended") });
    });
    return p;
  }
  const COLS = ["No.", "Priority", "Category", "Material code", "Description / model as supplied", "Project qty", "Qty / system", "Spare / system", "Spare / all systems", "Spare rate / system", "Unit", "Quantity note", "Technical note", "Reason for recommendation"];
  //              No  Prio Cat  Code Desc PQty QPS  SPS  Tot  Rate Unit QNote Tech Reason (actions)
  const COL_W  = [46, 150, 176, 170, 330, 84, 84, 96, 96, 84, 70, 170, 280, 260, 48];
  const COL_AL = ["c", "c", "", "", "", "c", "c", "c", "c", "c", "c", "", "", ""];
  function pageProject(p) {
    migrate(p);
    const S = settingsOf(p);
    const r = p.refs || {};
    const links = [r.joFile && `<a href="${esc(r.joFile)}" target="_blank" rel="noopener">Job Order</a>`, r.folder && `<a href="${esc(r.folder)}" target="_blank" rel="noopener">โฟลเดอร์ Job</a>`,
      ...(r.pid || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`), ...(r.layout || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`)].filter(Boolean).join(" · ");
    const cats = catsOf(p);
    const txt = (l, k, ph = "") => `<textarea class="sp-cell sp-wrap" rows="1" data-l="${l.id}" data-k="${k}" placeholder="${esc(ph)}">${esc(l[k])}</textarea>`;
    const box = (l, k, v, ph = "", cls = "") => `<input class="sp-cell ${cls}" data-l="${l.id}" data-k="${k}" value="${esc(v)}" placeholder="${esc(ph)}" inputmode="decimal">`;
    let no = 0;
    const body = cats.map((c, ci) => {
      const rows = p.lines.filter(l => l.cat === c);
      return `<tr class="sp-zone"><td colspan="${COLS.length + 1}"><div class="sp-zone-in">
          <input class="sp-zname" data-cat="${ci}" value="${esc(c)}" aria-label="ชื่อหมวด">
          <span class="sub">${rows.length} รายการ</span><span class="sp-ztot" data-ctot="${ci}"></span>
          <button class="sp-btn sm" data-addin="${ci}">＋ เพิ่มรายการ</button><button class="sp-btn sm" data-master="${ci}">🔍 เพิ่มจาก Master</button></div></td></tr>`
        + rows.map(l => { no++; const k = calc(l, p); return `<tr data-row="${l.id}">
          <td class="c">${no}</td>
          <td class="c"><select class="sp-cell sp-prio ${prioCls(l.prio)}" data-l="${l.id}" data-k="prio">${PRIOS.map(o => `<option class="${prioCls(o)}" ${l.prio === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
          <td><select class="sp-cell sp-cat" data-move="${l.id}" aria-label="Category">${[...new Set([...cats, ...CATS])].map(x => `<option ${x === l.cat ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></td>
          <td><div class="sp-pn">${txt(l, "code", "Material code")}<button class="sp-x sp-find" data-find="${l.id}" title="ค้นหาจาก Master Item แล้วเติมแถวนี้" aria-label="ค้นหาจาก Master Item">🔍</button></div></td>
          <td>${txt(l, "desc")}</td>
          <td class="c">${box(l, "pqty", l.pqty)}</td>
          <td class="c calc" data-qps="${l.id}">${fmtN(k.qps)}</td>
          <td class="c">${box(l, "ovr", k.manual ? l.ovr : "", String(k.auto), k.manual ? "sp-manual" : "")}</td>
          <td class="c calc tot" data-tot="${l.id}">${fmtN(k.total)}</td>
          <td class="c calc" data-rate="${l.id}">${k.qps > 0 ? fmtN(k.lr * 100) + "%" : "–"}</td>
          <td class="c">${txt(l, "unit")}</td>
          <td class="calc note" data-note="${l.id}">${esc(k.note)}</td>
          <td>${txt(l, "tech")}</td><td>${txt(l, "reason")}</td>
          <td class="act"><button class="sp-x" data-del="${l.id}" title="ลบรายการ">✕</button></td></tr>`; }).join("");
    }).join("");
    const crit = p.lines.filter(l => l.prio === "Critical").length;
    ROOT.innerHTML = `<a class="open" href="#spare-part">← รายการโปรเจค</a>
      <div class="sp-head"><div><span class="jo">JO ${esc(p.jo)}</span> ${pill(p.status)}<h2>${esc(p.name)}</h2>
        <div class="sub">${esc(p.customer)} · ${esc(p.site || "")} · ผู้ติดต่อ ${esc(p.contact || "-")} ${esc(p.tel || "")} · QO ${esc(p.qo || "-")} · PO ${esc(p.po || "-")} · ส่งมอบ ${esc(p.delivery || "-")}</div>
        ${p.tplTitle ? `<div class="sub">${esc(p.tplTitle)}${p.tplSub ? " · " + esc(p.tplSub) : ""}</div>` : ""}
        <div class="sp-links">${links}</div>
        <div class="sp-docs">${(p.docs || []).map((d, i) => `<span class="sp-doc"><a href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(d.title || d.url)}</a><button class="sp-x" data-deldoc="${i}" title="เอาลิงก์ออก" aria-label="เอาลิงก์ออก">✕</button></span>`).join("")}
          <button class="sp-btn sm" data-a="adddoc">＋ แนบลิงก์เอกสาร</button></div>
        <form class="sp-docform" id="spDocForm" hidden><input class="sp-in" name="title" placeholder="ชื่อเอกสาร เช่น Datasheet Serfilco EO1, Quotation PE"><input class="sp-in" name="url" type="url" required placeholder="https://… (Google Drive, SharePoint, เว็บผู้ผลิต)">
          <button class="sp-btn primary sm" type="submit">เพิ่ม</button><button class="sp-btn sm" type="button" data-a="canceldoc">ยกเลิก</button><span class="sp-docerr" id="spDocErr"></span></form></div>
        <div class="sp-actions"><select class="sp-in" id="spStatus">${Object.keys(STATUS).map(s => `<option value="${s}" ${p.status === s ? "selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select>
          <button class="sp-btn" data-a="cat">＋ เพิ่มหมวด</button><button class="sp-btn" data-a="import">⬆ Import from template</button>
          <button class="sp-btn" data-a="xlsx" title="ไฟล์ Excel รูปแบบ Suggested spares พร้อมสูตร + Engineering review / Material basis / Engineering source">⬇ Export (.xlsx)</button>
          <button class="sp-btn" data-a="customer" title="ไม่มี Quantity note, Technical note และ Spare rate">Export for customer</button>
          <button class="sp-btn primary" data-a="save">บันทึก</button>${isAdmin() ? `<button class="sp-btn" data-a="edithead">✎ แก้ไขรายละเอียด</button><button class="sp-btn danger" data-a="delete">ลบโปรเจค</button>` : ""}</div></div>
      <div class="sp-params"><label>Systems <input class="sp-in" id="spSys" value="${S.systems}" inputmode="numeric"></label>
        <label>Maximum rate <input class="sp-in" id="spRate" value="${fmtN(S.rate * 100)}" inputmode="decimal"> %</label>
        <span class="sub">Qty / system = Project qty ÷ ${S.systems} · Spare / system = MAX(1, ROUNDDOWN(Qty / system × ${fmtN(S.rate * 100)}%)) · พิมพ์ในช่อง Spare / system เพื่อกำหนดเอง (ลบค่าออก = กลับไปใช้สูตร)</span>
        <span class="sp-kpi"><b>${p.lines.length}</b> รายการ · <b>${crit}</b> Critical · รวม <b id="spGrand"></b> ชิ้น</span></div>
      <div class="tbl sp-edit"><table style="width:${COL_W.reduce((a, b) => a + b, 0)}px"><colgroup>${COL_W.map(w => `<col style="width:${w}px">`).join("")}</colgroup><thead><tr>${COLS.map((c, i) => `<th class="${COL_AL[i]}">${i === 8 ? `Spare / ${S.systems} system${S.systems > 1 ? "s" : ""}` : c}</th>`).join("")}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${COLS.length + 1}" class="sub">ยังไม่มีรายการ · กด ⬆ Import from template หรือ ＋ เพิ่มหมวด</td></tr>`}</tbody></table></div>
      ${reviewHtml(p)}
      ${refSheetsHtml(p)}
      <span class="sp-saved" id="spSaved" aria-live="polite"></span>`;
    const totals = () => {
      cats.forEach((c, i) => { const t = p.lines.filter(l => l.cat === c).reduce((a, l) => a + calc(l, p).total, 0); const el = ROOT.querySelector(`[data-ctot="${i}"]`); if (el) el.textContent = t ? `spare ${fmtN(t)} ชิ้น` : ""; });
      ROOT.querySelector("#spGrand").textContent = fmtN(p.lines.reduce((a, l) => a + calc(l, p).total, 0));
    };
    totals();
    const fit = t => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
    ROOT.querySelectorAll("textarea.sp-wrap").forEach(t => { fit(t); t.addEventListener("input", () => fit(t)); });
    const mark = () => { ROOT.querySelector("#spSaved").textContent = "มีการแก้ไขที่ยังไม่บันทึก"; };
    const redraw = () => { const box = ROOT.querySelector(".sp-edit"), sx = box ? box.scrollLeft : 0, sy = box ? box.scrollTop : 0, y = window.scrollY; pageProject(p); const nb = ROOT.querySelector(".sp-edit"); if (nb) { nb.scrollLeft = sx; nb.scrollTop = sy; } window.scrollTo(0, y); mark(); };
    const blank = cat => ({ id: uid(), prio: "Recommended", cat, code: "", desc: "", pqty: "", unit: "pc", ovr: "", tech: "", reason: "", source: "Manual" });
    const refreshRow = l => { const k = calc(l, p); const q = s => ROOT.querySelector(s);
      q(`[data-qps="${l.id}"]`).textContent = fmtN(k.qps); q(`[data-tot="${l.id}"]`).textContent = fmtN(k.total);
      q(`[data-rate="${l.id}"]`).textContent = k.qps > 0 ? fmtN(k.lr * 100) + "%" : "–"; q(`[data-note="${l.id}"]`).textContent = k.note;
      const o = q(`[data-l="${l.id}"][data-k="ovr"]`); o.placeholder = String(k.auto); o.classList.toggle("sp-manual", k.manual); totals(); };
    ROOT.querySelectorAll(".sp-cell[data-l]").forEach(i => i.oninput = i.onchange = () => {
      const l = p.lines.find(x => x.id === i.dataset.l); l[i.dataset.k] = i.value; mark();
      if (i.dataset.k === "prio") i.className = "sp-cell sp-prio " + prioCls(i.value);
      if (i.dataset.k === "pqty" || i.dataset.k === "ovr") refreshRow(l);
    });
    const setParam = () => { const s = num(ROOT.querySelector("#spSys").value), rt = num(ROOT.querySelector("#spRate").value);
      if (s >= 1) p.systems = Math.round(s); if (rt > 0 && rt <= 100) p.maxRate = rt / 100; redraw(); };
    ROOT.querySelector("#spSys").onchange = setParam; ROOT.querySelector("#spRate").onchange = setParam;
    ROOT.querySelectorAll(".sp-zname").forEach(i => i.onchange = () => {
      const old = cats[+i.dataset.cat], nu = i.value.trim() || old;
      p.lines.forEach(l => { if (l.cat === old) l.cat = nu; }); p.cats = (p.cats || []).map(c => c === old ? nu : c); redraw();
    });
    ROOT.querySelectorAll("[data-master]").forEach(b => b.onclick = () => { const c = cats[+b.dataset.master];
      openMaster({ title: "เพิ่มจาก Master Item → " + c, multi: true, onPick: its => { its.forEach(it => p.lines.push(fromItem(it, blank(c)))); redraw(); ROOT.querySelector("#spSaved").textContent = `เพิ่ม ${its.length} รายการจาก Master · ใส่ Project qty แล้วกด บันทึก`; } }); });
    ROOT.querySelectorAll("[data-find]").forEach(b => b.onclick = () => { const l = p.lines.find(x => x.id === b.dataset.find);
      openMaster({ title: "เลือก item ให้แถวนี้", multi: false, onPick: ([it]) => { fromItem(it, l); redraw(); } }); });
    ROOT.querySelectorAll("[data-addin]").forEach(b => b.onclick = () => { p.lines.push(blank(cats[+b.dataset.addin])); redraw(); });
    ROOT.querySelectorAll("[data-move]").forEach(s => s.onchange = () => { p.lines.find(x => x.id === s.dataset.move).cat = s.value; redraw(); });
    bindReview(p, redraw, mark);
    ROOT.querySelectorAll("details.sp-ref").forEach(d => d.ontoggle = () => { if (d.open && !d.dataset.done) { d.dataset.done = 1; d.querySelector(".sp-refbody").innerHTML = aoaTable((p.sheets || {})[d.dataset.sheet] || []); } });
    const df = ROOT.querySelector("#spDocForm");
    df.onsubmit = e => {
      e.preventDefault();
      const url = df.url.value.trim(), title = df.title.value.trim();
      let ok = false; try { ok = /^https?:$/.test(new URL(url).protocol); } catch {}
      if (!ok) { ROOT.querySelector("#spDocErr").textContent = "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"; return; }
      p.docs = [...(p.docs || []), { title: title || url, url, by: (window.SSM_ME && window.SSM_ME.email) || "", at: new Date().toISOString() }];
      redraw();
    };
    ROOT.querySelectorAll("[data-deldoc]").forEach(b => b.onclick = () => { const d = p.docs[+b.dataset.deldoc]; if (confirm("เอาลิงก์ \"" + (d.title || d.url) + "\" ออก?")) { p.docs.splice(+b.dataset.deldoc, 1); redraw(); } });
    ROOT.querySelector("#spStatus").onchange = e => { p.status = e.target.value; mark(); };
    ROOT.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { p.lines = p.lines.filter(x => x.id !== b.dataset.del); redraw(); });
    ROOT.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      try {
        if (a === "cat") { const n = prompt("ชื่อหมวดใหม่ (เช่น Pump, Filter, Valve)", ""); if (n && n.trim()) { p.cats = [...(p.cats || []), n.trim()]; p.lines.push(blank(n.trim())); redraw(); } }
        if (a === "adddoc") { df.hidden = false; df.title.focus(); }
        if (a === "canceldoc") { df.hidden = true; df.reset(); ROOT.querySelector("#spDocErr").textContent = ""; }
        if (a === "edithead" && isAdmin()) editHead(p, async () => { await save(p); const h = "#spare-part/" + encodeURIComponent(slugOf(p)); if (location.hash !== h) history.replaceState(null, "", h); pageProject(p); ROOT.querySelector("#spSaved").textContent = "บันทึกรายละเอียดโปรเจคแล้ว " + new Date().toLocaleTimeString("th-TH"); });
        if (a === "xlsx") await exportXlsx(p, false);
        if (a === "customer") await exportXlsx(p, true);
        if (a === "import") openImport(p, (n, how) => { redraw(); ROOT.querySelector("#spSaved").textContent = `นำเข้า ${n} รายการ (${how === "replace" ? "แทนที่" : "เพิ่มต่อท้าย"}) · กด บันทึก เพื่อเก็บ`; });
        if (a === "save") { p.cats = catsOf(p); await save(p); ROOT.querySelector("#spSaved").textContent = "บันทึกแล้ว " + new Date().toLocaleTimeString("th-TH") + (MODE === "local" ? " (ในเบราว์เซอร์นี้)" : ""); }
        if (a === "delete" && isAdmin() && confirm("ลบโปรเจค Spare Part " + p.jo + " – " + p.name + " ?\nลบแล้วกู้คืนไม่ได้ (ถ้าแค่เลิกใช้ ให้เปลี่ยนสถานะเป็น Inactive)")) {
          const ok = await remove(p.id); if (ok) location.hash = "#spare-part"; else ROOT.querySelector("#spSaved").textContent = "ลบไม่สำเร็จ (ต้องเป็น admin)"; }
      } catch (e) { ROOT.querySelector("#spSaved").textContent = "⚠️ " + (e.message || e); }
    });
  }
  /* Engineering review (sheet of the same name) – editable list under the table */
  const REV_COLS = [["ref", "Ref."], ["topic", "Topic"], ["item", "Item / scope"], ["finding", "Finding / source"], ["action", "Required action"]];
  function reviewHtml(p) {
    const rv = p.review || [];
    return `<details class="sp-box" ${rv.length ? "open" : ""}><summary><b>Engineering review before purchase</b> <span class="sub">${rv.length} หัวข้อ</span></summary>
      <div class="tbl"><table class="sp-rev"><colgroup><col style="width:60px"><col style="width:160px"><col style="width:220px"><col><col><col style="width:40px"></colgroup>
      <thead><tr>${REV_COLS.map(([, t]) => `<th>${t}</th>`).join("")}<th></th></tr></thead><tbody>
      ${rv.map((x, i) => `<tr>${REV_COLS.map(([k]) => `<td><textarea class="sp-cell sp-wrap" rows="1" data-rv="${i}" data-rk="${k}">${esc(x[k])}</textarea></td>`).join("")}<td><button class="sp-x" data-rvdel="${i}" title="ลบหัวข้อ">✕</button></td></tr>`).join("")}
      </tbody></table></div><button class="sp-btn sm" data-rvadd="1">＋ เพิ่มหัวข้อ review</button></details>`;
  }
  function bindReview(p, redraw, mark) {
    ROOT.querySelectorAll("[data-rv]").forEach(t => t.oninput = () => { p.review[+t.dataset.rv][t.dataset.rk] = t.value; mark(); });
    ROOT.querySelectorAll("[data-rvdel]").forEach(b => b.onclick = () => { p.review.splice(+b.dataset.rvdel, 1); redraw(); });
    const add = ROOT.querySelector("[data-rvadd]"); if (add) add.onclick = () => { p.review = [...(p.review || []), { ref: String((p.review || []).length + 1).padStart(2, "0"), topic: "", item: "", finding: "", action: "" }]; redraw(); };
  }
  /* Material basis / Engineering source are kept as imported (read-only) and written back on export */
  const REF_SHEETS = [["basis", "Material basis"], ["source", "Engineering source"]];
  function refSheetsHtml(p) {
    const s = p.sheets || {};
    return REF_SHEETS.filter(([k]) => (s[k] || []).length).map(([k, t]) => `<details class="sp-box sp-ref" data-sheet="${k}"><summary><b>${t}</b> <span class="sub">${Math.max(0, s[k].length - 1)} แถว · จากไฟล์ที่นำเข้า (อ่านอย่างเดียว)</span></summary><div class="sp-refbody sub">กำลังแสดง…</div></details>`).join("");
  }
  const aoaTable = aoa => !aoa.length ? "" : `<div class="tbl" style="max-height:420px;overflow:auto"><table class="sp-mt"><thead><tr>${aoa[0].map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${aoa.slice(1).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

  /* --- Excel: export in the Suggested spares format, import the same file back --- */
  const XLSX_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
  let xlsxP = null;
  const loadXLSX = () => xlsxP || (xlsxP = new Promise((ok, no) => {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement("script"); s.src = XLSX_SRC; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous";
    s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; no(new Error("โหลดตัวอ่าน Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  }));
  const sortedLines = p => { const cs = catsOf(p); return [...(p.lines || [])].sort((a, b) => cs.indexOf(a.cat) - cs.indexOf(b.cat)); };
  async function exportXlsx(p, customer) {
    const X = await loadXLSX(); migrate(p);
    const S = settingsOf(p), pct = fmtN(S.rate * 100), lines = sortedLines(p);
    const title = p.tplTitle || `${p.name} | SUGGESTED SPARE PART LIST`;
    const sub = p.tplSub || `RAK • ${p.customerShort || p.customer || ""} • JO ${p.jo} • ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    const wb = X.utils.book_new();
    if (customer) {
      const head = ["No.", "Priority", "Category", "Material code", "Description / model", `Qty / system`, "Spare / system", `Spare / ${S.systems} systems`, "Unit", "Reason for recommendation"];
      const rows = lines.map((l, i) => { const k = calc(l, p); return [i + 1, l.prio, l.cat, l.code, l.desc, k.qps, k.sps, k.total, l.unit, l.reason]; });
      const ws = X.utils.aoa_to_sheet([[], [title], [sub], [], ["Systems", S.systems], [], head, ...rows]);
      ws["!cols"] = [6, 14, 22, 20, 60, 12, 12, 14, 10, 55].map(w => ({ wch: w }));
      X.utils.book_append_sheet(wb, ws, "Suggested spares");
      return X.writeFile(wb, `SparePart_${p.jo}_${(p.customerShort || "").replace(/\W+/g, "")}_customer.xlsx`);
    }
    const H0 = 10; // header row, data from row 11 (same layout as the Rev01 file)
    const aoa = [[], [title], [sub], [], ["Systems", S.systems, "Maximum rate", S.rate], [`Quantity per system = project quantity ÷ ${S.systems}. Spare per system = MAX(1, ROUNDDOWN(quantity per system × ${pct}%, 0)).`],
      [`Total spare = spare per system × ${S.systems}; separate stock per system. Minimum 1 is an explicit exception where the rate exceeds ${pct}%.`],
      ["Material code identifies the proposed item; exact OEM part number and as-built compatibility must be confirmed before purchase. No prices included."], [],
      COLS.map((c, i) => i === 5 ? "Project qty (Excel)" : i === 8 ? `Spare / ${S.systems} systems` : c)];
    lines.forEach((l, i) => aoa.push([i + 1, l.prio, l.cat, l.code, l.desc, num(l.pqty), null, null, null, null, l.unit, null, l.tech, l.reason]));
    const ws = X.utils.aoa_to_sheet(aoa);
    lines.forEach((l, i) => { const r = H0 + 1 + i, k = calc(l, p);
      ws["G" + r] = { t: "n", f: `F${r}/$B$5`, v: k.qps };
      ws["H" + r] = k.manual ? { t: "n", v: k.sps } : { t: "n", f: `IF(G${r}>0,MAX(1,ROUNDDOWN(G${r}*$D$5,0)),0)`, v: k.sps };
      ws["I" + r] = { t: "n", f: `H${r}*$B$5`, v: k.total };
      ws["J" + r] = { t: "n", f: `IF(G${r}>0,H${r}/G${r},0)`, v: k.lr, z: "0.0%" };
      ws["L" + r] = { t: "s", f: `IF(MOD(G${r},1)<>0,"Check allocation; ","")&IF(J${r}>$D$5,"Minimum-1 exception","Within ${pct}%")`, v: k.note };
    });
    ws["D5"].z = "0%";
    ws["!cols"] = [6, 16, 22, 23, 65, 14, 13, 13, 13, 12, 13, 24, 63, 55].map(w => ({ wch: w }));
    ws["!autofilter"] = { ref: `A${H0}:N${H0 + lines.length}` };
    X.utils.book_append_sheet(wb, ws, "Suggested spares");
    const rv = X.utils.aoa_to_sheet([["ENGINEERING REVIEW BEFORE PURCHASE"], REV_COLS.map(([, t]) => t), ...(p.review || []).map(x => REV_COLS.map(([k]) => x[k] || ""))]);
    rv["!cols"] = [8, 22, 34, 70, 70].map(w => ({ wch: w }));
    X.utils.book_append_sheet(wb, rv, "Engineering review");
    REF_SHEETS.forEach(([k, t]) => { const a = (p.sheets || {})[k]; if (a && a.length) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(a), t); });
    X.writeFile(wb, `SparePart_${p.jo}_${(p.customerShort || "").replace(/\W+/g, "")}_Suggested_spares.xlsx`);
  }
  const hkey = s => norm(s).replace(/[^a-z0-9ก-๙]/g, "");
  const HEADS = { no: ["no"], prio: ["priority"], cat: ["category", "zone", "หมวด"], code: ["materialcode", "partnodrawingref", "partno", "code"],
    desc: ["descriptionmodelassupplied", "descriptionmodel", "description", "partdescription"], pqty: ["projectqtyexcel", "projectqty", "installedqty", "qty"],
    qps: ["qtysystem"], sps: ["sparesystem"], unit: ["unit"], tech: ["technicalnote", "remarks", "remark"], reason: ["reasonforrecommendation", "reason"] };
  function parseSpares(aoa) {
    let hr = -1, map = {};
    for (let r = 0; r < Math.min(aoa.length, 40) && hr < 0; r++) {
      const keys = (aoa[r] || []).map(hkey);
      if (keys.includes("materialcode") || keys.some(k => k.startsWith("descriptionmodel")) || keys.includes("partdescription")) {
        hr = r; keys.forEach((k, c) => { for (const [f, al] of Object.entries(HEADS)) if (map[f] === undefined && al.includes(k)) { map[f] = c; break; } });
      }
    }
    if (hr < 0 || map.desc === undefined) throw new Error("ไม่พบหัวตาราง (ต้องมีคอลัมน์ Material code / Description)");
    let systems = 1, rate = 0.15;
    for (let r = 0; r < hr; r++) (aoa[r] || []).forEach((v, c) => {
      const k = hkey(v);
      if (k === "systems") systems = num(aoa[r][c + 1]) || systems;
      if (k === "maximumrate") { const x = num(aoa[r][c + 1]); if (x > 0) rate = x > 1 ? x / 100 : x; }
    });
    const firstText = r => (aoa[r] || []).find(v => String(v ?? "").trim()) || "";
    const title = String(firstText(1) || firstText(0) || "").trim(), sub = String(firstText(2) || "").trim();
    const g = (row, f) => map[f] === undefined ? "" : String(row[map[f]] ?? "").trim();
    const lines = []; let skipped = 0, cat = CATS[0];
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r] || [], filled = row.map(v => String(v ?? "").trim()).filter(Boolean);
      if (!filled.length) continue;
      const desc = g(row, "desc"), code = g(row, "code");
      if (!desc && !code) { if (filled.length === 1 && !/total/i.test(filled[0])) cat = filled[0]; else skipped++; continue; }
      const pr = g(row, "prio").toLowerCase();
      const l = { id: uid(), prio: pr.startsWith("crit") ? "Critical" : pr.startsWith("opt") ? "Optional" : "Recommended", cat: g(row, "cat") || cat, code, desc,
        pqty: g(row, "pqty") === "" ? "" : num(g(row, "pqty")), unit: g(row, "unit") || "pc", ovr: "", tech: g(row, "tech"), reason: g(row, "reason"), source: "Import" };
      const want = g(row, "sps");
      if (want !== "") { const k = calc(l, { systems, maxRate: rate }); if (num(want) !== k.auto) l.ovr = num(want); }
      lines.push(l);
    }
    return { lines, skipped, systems, rate, title, sub };
  }
  function parseReview(aoa) {
    const hr = aoa.findIndex(r => (r || []).map(hkey).includes("topic"));
    if (hr < 0) return [];
    const keys = aoa[hr].map(hkey), idx = { ref: keys.indexOf("ref"), topic: keys.indexOf("topic"), item: keys.indexOf("itemscope"), finding: keys.indexOf("findingsource"), action: keys.indexOf("requiredaction") };
    return aoa.slice(hr + 1).filter(r => (r || []).some(v => String(v ?? "").trim())).map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i < 0 ? "" : String(r[i] ?? "").trim()])));
  }
  const trimAoa = aoa => { const hr = aoa.findIndex(r => (r || []).filter(v => String(v ?? "").trim()).length >= 4); return (hr < 0 ? aoa : aoa.slice(hr)).filter(r => (r || []).some(v => String(v ?? "").trim())).map(r => r.map(v => v ?? "")).slice(0, 3000); };
  async function readFile(file) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: "array" });
    const aoaOf = n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
    const pick = re => wb.SheetNames.find(n => re.test(n));
    const order = [pick(/suggest|spare/i), ...wb.SheetNames].filter(Boolean);
    let res = null, sheet = "";
    for (const n of order) { if (/review|basis|source|lists|readme/i.test(n)) continue; try { const r = parseSpares(aoaOf(n)); if (r.lines.length) { res = r; sheet = n; break; } } catch (e) { if (wb.SheetNames.length === 1) throw e; } }
    if (!res) throw new Error("ไม่พบรายการในไฟล์ (ต้องมีหัวตาราง Material code / Description และอย่างน้อย 1 แถว)");
    const rvName = pick(/review/i), bName = pick(/basis/i), sName = pick(/engineering\s*source|^source/i);
    res.review = rvName ? parseReview(aoaOf(rvName)) : null;
    res.sheets = { basis: bName ? trimAoa(aoaOf(bName)) : null, source: sName ? trimAoa(aoaOf(sName)) : null };
    res.sheet = sheet;
    return res;
  }
  function openImport(p, done) {
    const m = document.createElement("div"); m.className = "sp-modal"; m.id = "spImport"; document.body.appendChild(m);
    let res = null;
    const draw = (msg = "") => {
      const cs = res ? [...new Set(res.lines.map(l => l.cat))] : [];
      m.innerHTML = `<div class="sp-dlg" role="dialog" aria-modal="true" aria-label="Import from template" style="width:min(680px,100%)">
        <div class="sp-dlg-h"><b>Import from template</b><span class="sp-steps"></span><button class="sp-x" data-i="close" aria-label="ปิด">✕</button></div>
        <div class="sp-dlg-b">
          <p class="sp-sub">นำเข้าไฟล์ Excel รูปแบบ <b>Suggested spares</b> (เช่น EP500L_Suggested_Spare_Parts Rev01) · อ่าน Systems, Maximum rate, รายการอะไหล่ และ sheet Engineering review / Material basis / Engineering source ถ้ามี · จาก Google Sheets ให้ Download เป็น .xlsx ก่อน</p>
          <p><button class="sp-btn" data-i="tpl">⬇ Download template (.xlsx)</button> <span class="sub">ไฟล์รูปแบบเดียวกัน มีรายการปัจจุบันของโปรเจคนี้</span></p>
          <label class="sp-drop"><input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
            <b>เลือกไฟล์</b> หรือลากไฟล์มาวางที่นี่</label>
          ${msg ? `<div class="sp-note">${msg}</div>` : ""}
          ${res ? `<div class="sp-preview"><b>พบ ${res.lines.length} รายการ</b> ใน ${cs.length} หมวด (sheet "${esc(res.sheet)}") · Systems ${res.systems} · Maximum rate ${fmtN(res.rate * 100)}%
            ${res.lines.some(l => l.ovr !== "") ? `<br><span class="sub">${res.lines.filter(l => l.ovr !== "").length} แถวมี Spare / system ต่างจากสูตร → เก็บเป็นค่ากำหนดเอง</span>` : ""}
            <ul class="sp-scope">${cs.map(c => `<li>${esc(c)} – ${res.lines.filter(l => l.cat === c).length} รายการ</li>`).join("")}</ul>
            <span class="sub">${res.review ? `Engineering review ${res.review.length} หัวข้อ · ` : ""}${res.sheets.basis ? `Material basis ${res.sheets.basis.length - 1} แถว · ` : ""}${res.sheets.source ? `Engineering source ${res.sheets.source.length - 1} แถว` : ""}</span></div>` : ""}
        </div>
        <div class="sp-dlg-f">${res ? `<button class="sp-btn" data-i="append">เพิ่มต่อท้ายรายการเดิม</button><button class="sp-btn primary" data-i="replace">แทนที่ทั้งหมด (${(p.lines || []).length} รายการเดิม)</button>` : `<button class="sp-btn" data-i="close">ยกเลิก</button>`}</div></div>`;
      const fi = m.querySelector("input[type=file]"), drop = m.querySelector(".sp-drop");
      const take = async f => { if (!f) return; draw("กำลังอ่าน " + esc(f.name) + " …"); try { res = await readFile(f); draw(); } catch (e) { res = null; draw("⚠️ " + esc(e.message || e)); } };
      fi.onchange = () => take(fi.files[0]);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add("on"); }; drop.ondragleave = () => drop.classList.remove("on");
      drop.ondrop = e => { e.preventDefault(); take(e.dataTransfer.files[0]); };
      m.querySelectorAll("[data-i]").forEach(b => b.onclick = async () => {
        const a = b.dataset.i;
        if (a === "close") return m.remove();
        if (a === "tpl") { try { await exportXlsx(p, false); } catch (e) { draw("⚠️ " + esc(e.message || e)); } return; }
        if (a === "replace") {
          if ((p.lines || []).length && !confirm(`แทนที่ ${p.lines.length} รายการเดิม, Systems/Maximum rate, Engineering review และข้อมูลอ้างอิง ด้วยข้อมูลจากไฟล์?`)) return;
          Object.assign(p, { lines: res.lines, systems: res.systems, maxRate: res.rate, cats: [], tplTitle: res.title, tplSub: res.sub });
          if (res.review) p.review = res.review;
          p.sheets = { ...(p.sheets || {}), ...Object.fromEntries(Object.entries(res.sheets).filter(([, v]) => v)) };
        } else p.lines = [...(p.lines || []), ...res.lines];
        m.remove(); done(res.lines.length, a);
      });
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    draw();
  }

  const HEAD_FIELDS = [["jo", "Job No."], ["customerShort", "Customer (ย่อ)"], ["customer", "Customer", 1], ["name", "Project name", 1], ["site", "สถานที่"], ["contact", "ผู้ติดต่อลูกค้า"],
    ["tel", "โทร"], ["qo", "QO No."], ["po", "PO No."], ["delivery", "กำหนดส่งมอบ"], ["pm", "หัวหน้าโครงการ"], ["coordinator", "ผู้ประสานงาน"]];
  function editHead(p, done) { // admin only: header details taken from the Job Order
    const m = document.createElement("div"); m.className = "sp-modal"; document.body.appendChild(m);
    m.innerHTML = `<div class="sp-dlg" role="dialog" aria-modal="true" aria-label="แก้ไขรายละเอียดโปรเจค" style="width:min(820px,100%)">
      <div class="sp-dlg-h"><b>แก้ไขรายละเอียดโปรเจค</b><span class="sp-steps"><i class="on">Admin</i></span><button class="sp-x" data-h="close" aria-label="ปิด">✕</button></div>
      <div class="sp-dlg-b"><div class="sp-form">${HEAD_FIELDS.map(([k, label, wide]) => `<label class="${wide ? "wide" : ""}"><span>${label}</span><input data-f="${k}" value="${esc(p[k])}"></label>`).join("")}</div>
        <p class="sub" style="margin-top:12px">ข้อมูลตั้งต้นมาจาก Job Order · การแก้ไขที่นี่ไม่ได้แก้ไฟล์ Job Order ใน Drive</p></div>
      <div class="sp-dlg-f"><button class="sp-btn" data-h="close">ยกเลิก</button><button class="sp-btn primary" data-h="ok">บันทึกรายละเอียด</button></div></div>`;
    const close = () => m.remove();
    m.onclick = e => { if (e.target === m) close(); };
    m.querySelectorAll('[data-h="close"]').forEach(b => b.onclick = close);
    m.querySelector('[data-h="ok"]').onclick = () => {
      const v = {}; m.querySelectorAll("[data-f]").forEach(i => { v[i.dataset.f] = i.value.trim(); });
      if (!v.jo || !v.name) { alert("ต้องมี Job No. และ Project name"); return; }
      if (PROJECTS.some(x => x.id !== p.id && String(x.jo).trim() === v.jo)) { alert("Job No. " + v.jo + " มีโปรเจค Spare Part อยู่แล้ว"); return; }
      Object.assign(p, v); close(); done();
    };
    m.querySelector("[data-f]").focus();
  }
  /* --- RAK_Master_Item search (via /api/spare-part/items; cost is returned to admins only) --- */
  const itemPart = it => {
    const m = it.d2.match(/^(?:part\s*:\s*)?(.*?)\s*mater(?:i)?al\s*:\s*(.+)$/i);
    if (it.kind === "2") return m ? { part: m[1].trim(), spec: m[2].trim() } : { part: it.d2.replace(/^part\s*:\s*/i, ""), spec: "" };
    return { part: it.d1, spec: it.d2 };
  };
  const fromItem = (it, l) => Object.assign(l, { code: it.code, desc: [it.d1, it.d2, it.maker].filter(Boolean).join(" "), unit: it.unit || l.unit, source: "Master" });
  function openMaster(opt) { // opt: { title, multi, onPick(items) }
    const m = document.createElement("div"); m.className = "sp-modal"; document.body.appendChild(m);
    let q = "", kind = "", items = [], total = 0, sel = new Map(), msg = "พิมพ์รหัส ชื่ออุปกรณ์ หรือชื่ออะไหล่ เช่น impeller, PAE1001, serfilco", group = null, timer = 0;
    const money2 = n => n ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "–";
    const margin = it => it.cost === undefined ? "" : !it.sale ? `<span class="badge off">ไม่มีราคาขาย</span>`
      : it.cost && it.sale < it.cost ? `<span class="badge sp-loss">ขาดทุน</span>` : it.cost ? (gp => `<span class="badge ${gp < 15 ? "soon" : "live"}" title="${gp < 15 ? "กำไรต่ำกว่า 15%" : ""}">GP ${gp}%</span>`)(Math.round((1 - it.cost / it.sale) * 100)) : "";
    async function load() {
      const u = group ? "/api/spare-part/items?group=" + encodeURIComponent(group) : "/api/spare-part/items?q=" + encodeURIComponent(q) + (kind ? "&kind=" + kind : "");
      if (!group && !q.trim()) { items = []; return draw(); }
      msg = "กำลังค้นหา…"; draw();
      try { const r = await fetch(u); if (r.status === 503) throw new Error("ยังไม่พบตาราง RAK_Master_Item"); if (!r.ok) throw new Error("ค้นหาไม่สำเร็จ (" + r.status + ")");
        const d = await r.json(); items = d.items || []; if (group) items.sort((x, y) => (y.kind === "2") - (x.kind === "2") || x.code.localeCompare(y.code)); total = d.total || items.length; msg = items.length ? "" : "ไม่พบรายการ"; }
      catch (e) { items = []; msg = "⚠️ " + (e.message || e); }
      draw();
    }
    function draw() {
      const isAdm = items.some(it => it.cost !== undefined);
      m.innerHTML = `<div class="sp-dlg" role="dialog" aria-modal="true" aria-label="ค้นหาจาก Master Item" style="width:min(1000px,100%)">
        <div class="sp-dlg-h"><b>${esc(opt.title || "ค้นหาจาก Master Item")}</b><span class="sp-steps">${group ? `<i class="on">อะไหล่กลุ่ม ${esc(group)}</i>` : ""}</span><button class="sp-x" data-m="close" aria-label="ปิด">✕</button></div>
        <div class="sp-dlg-b">
          ${group ? `<button class="sp-btn sm" data-m="back">← กลับไปผลค้นหา</button>` : `<div class="sp-msearch"><input class="sp-in" id="mq" value="${esc(q)}" placeholder="ค้นหาใน RAK_Master_Item" autocomplete="off">
            <span class="sp-seg">${[["", "ทั้งหมด"], ["1", "อุปกรณ์"], ["2", "อะไหล่"]].map(([k, t]) => `<button class="${kind === k ? "on" : ""}" data-kind="${k}">${t}</button>`).join("")}</span></div>`}
          ${msg ? `<p class="sub" style="margin:12px 2px">${esc(msg)}</p>` : ""}
          ${items.length ? `<div class="tbl" style="margin-top:10px"><table class="sp-mt"><thead><tr><th></th><th>รหัส</th><th>รายการ</th><th>ผู้ผลิต</th><th class="c">หน่วย</th><th class="r">ราคาขาย</th>${isAdm ? `<th class="r">ต้นทุน std.</th><th class="c">GP</th>` : ""}<th></th></tr></thead><tbody>
            ${items.map((it, i) => `<tr class="${sel.has(it.code) ? "on" : ""}"><td>${opt.multi ? `<input type="checkbox" data-sel="${i}" ${sel.has(it.code) ? "checked" : ""}>` : `<button class="sp-btn sm primary" data-pick="${i}">เลือก</button>`}</td>
              <td class="mono">${esc(it.code)}${it.kind === "2" ? `<div><span class="badge soon">อะไหล่</span></div>` : ""}</td><td><b>${esc(it.d1)}</b><div class="sub">${esc(it.d2)}</div></td><td>${esc(it.maker)}</td>
              <td class="c">${esc(it.unit)}</td><td class="r">${money2(it.sale)}</td>${isAdm ? `<td class="r">${money2(it.cost)}</td><td class="c">${margin(it)}</td>` : ""}
              <td>${it.kind === "1" && it.group && !group ? `<button class="sp-btn sm" data-grp="${esc(it.group)}">อะไหล่ของรุ่นนี้ →</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
            ${!group && total > items.length ? `<p class="sub">แสดง ${items.length} จาก ${total} รายการ · พิมพ์คำเพิ่มเพื่อให้แคบลง</p>` : ""}` : ""}
        </div>
        <div class="sp-dlg-f">${opt.multi ? `<span class="sub" style="margin-right:auto">เลือกแล้ว ${sel.size} รายการ</span><button class="sp-btn" data-m="close">ยกเลิก</button><button class="sp-btn primary" data-m="add" ${sel.size ? "" : "disabled"}>เพิ่ม ${sel.size} รายการ</button>` : `<button class="sp-btn" data-m="close">ปิด</button>`}</div></div>`;
      const mq = m.querySelector("#mq");
      if (mq) { mq.focus(); mq.setSelectionRange(q.length, q.length); mq.oninput = () => { q = mq.value; clearTimeout(timer); timer = setTimeout(load, 280); }; }
      m.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { kind = b.dataset.kind; load(); });
      m.querySelectorAll("[data-grp]").forEach(b => b.onclick = () => { group = b.dataset.grp; load(); });
      m.querySelectorAll("[data-sel]").forEach(c => c.onchange = () => { const it = items[+c.dataset.sel]; c.checked ? sel.set(it.code, it) : sel.delete(it.code); draw(); });
      m.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { m.remove(); opt.onPick([items[+b.dataset.pick]]); });
      m.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
        const a = b.dataset.m;
        if (a === "close") m.remove();
        if (a === "back") { group = null; load(); }
        if (a === "add" && sel.size) { m.remove(); opt.onPick([...sel.values()]); }
      });
    }
    m.onclick = e => { if (e.target === m) m.remove(); };
    draw();
  }

  /* ---------- mount ---------- */
  const CSS = `
.main,.content,#spRoot{min-width:0;max-width:100%}.sp-bar>*,.sp-form>*{min-width:0}
.sp-bar{display:grid;grid-template-columns:1fr 1.3fr 1.6fr;gap:10px;align-items:end;background:var(--paper,#fff);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin:0 0 16px;position:sticky;top:8px;z-index:3;box-shadow:0 10px 24px -22px rgba(0,0,0,.5)}
.sp-bar label,.sp-form label{display:grid;gap:4px;font-size:12px;color:var(--muted)}
.sp-bar input,.sp-in,.sp-form input{font:inherit;font-size:14px;color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#fff;width:100%}
.sp-bar input:focus,.sp-in:focus,.sp-form input:focus,.sp-cell:focus{outline:2px solid var(--blush-2);border-color:var(--rak)}
.sp-btn{font:inherit;font-size:13.5px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:8px 14px;cursor:pointer;white-space:nowrap}
.sp-btn.primary{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}.sp-btn.primary:hover{background:var(--rak-dark)}
.sp-create{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 14px}.sp-btn.big{font-size:15px;padding:11px 20px;border-radius:11px}
.sp-btn.danger{color:var(--rak);border-color:var(--blush-2)}.sp-btn.danger:hover{background:var(--rak);color:#fff}.badge.off{background:#eceef1;color:#6d7582}tr.sp-off td{opacity:.55}
.sp-drop{display:block;border:2px dashed var(--line);border-radius:12px;padding:22px;text-align:center;cursor:pointer;color:var(--muted);margin:12px 0}.sp-drop:hover,.sp-drop.on{border-color:var(--rak);background:var(--blush);color:var(--rak)}.sp-preview{background:var(--bg);border-radius:10px;padding:10px 12px;margin-top:10px}
.sp-prio{font-weight:600;border-radius:20px!important;padding:4px 8px!important;border:1px solid transparent!important;cursor:pointer}
.p-critical{background:#fde2e2!important;color:#b00000!important;border-color:#f5b5b5!important}
.p-recommended{background:#fff1d6!important;color:#8a5a00!important;border-color:#f1d38a!important}
.p-consumable{background:#e3f0ff!important;color:#0b5394!important;border-color:#b6d4f5!important}
option.p-critical,option.p-recommended,option.p-consumable{font-weight:600}
.sp-pn{display:flex;gap:2px;align-items:flex-start}.sp-find{font-size:12px;padding:5px 4px;opacity:.55}.sp-find:hover{opacity:1}
.sp-msearch{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sp-msearch .sp-in{flex:1 1 320px}.sp-seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}.sp-seg button{font:inherit;font-size:13px;border:0;background:#fff;padding:7px 12px;cursor:pointer;color:var(--muted)}.sp-seg button.on{background:var(--blush);color:var(--rak);font-weight:600}
.sp-mt td{vertical-align:top;padding:8px 8px}.sp-mt .c{text-align:center}.sp-mt .r{text-align:right;font-variant-numeric:tabular-nums}.sp-mt tr.on td{background:var(--blush)}.sp-mt .mono{font-family:"IBM Plex Mono",monospace;font-size:12.5px;white-space:nowrap}.badge.sp-loss{background:#fde2e2;color:#b00000}.sp-mt .badge{white-space:nowrap}
.p-optional{background:#e9edf2!important;color:#4a5563!important;border-color:#cfd6df!important}
.sp-edit td.calc{color:var(--muted);padding-top:11px;font-variant-numeric:tabular-nums}.sp-edit td.tot{color:var(--ink);font-weight:700}.sp-edit td.note{font-size:12px;line-height:1.35}
.sp-edit input.sp-manual{background:#fff6e0;border-color:#f1d38a;font-weight:700}.sp-edit select.sp-cat{font-size:12.5px}
.sp-params{display:flex;flex-wrap:wrap;gap:14px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin:0 0 12px}.sp-params label{display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600}.sp-params .sp-in{width:70px;padding:6px 8px;text-align:center}.sp-params .sub{flex:1 1 360px;font-size:12px}.sp-kpi{font-size:13px}
.sp-box{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-top:14px}.sp-box summary{cursor:pointer}.sp-box .tbl{margin:10px 0}.sp-rev td{vertical-align:top;padding:4px}
.sp-note{background:var(--amber-soft,#fff6e0);border:1px solid #f1d38a;border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:13px}
.sp-src{color:var(--muted);font-size:12.5px;margin-top:14px}.sp-src a{color:var(--rak)}
.sp-modal{position:fixed;inset:0;background:rgba(18,18,18,.45);display:grid;place-items:center;z-index:50;padding:16px}
.sp-dlg{background:#fff;border-radius:16px;width:min(920px,100%);max-height:92vh;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.sp-dlg-h{display:flex;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}.sp-dlg-h b{font-size:16px}
.sp-steps{display:flex;gap:6px;flex:1;flex-wrap:wrap}.sp-steps i{font-style:normal;font-size:12px;color:var(--muted);background:var(--bg);border-radius:20px;padding:3px 10px}.sp-steps i.on{background:var(--blush);color:var(--rak);font-weight:600}
.sp-x{border:0;background:none;color:var(--muted);font-size:15px;cursor:pointer;padding:4px 6px;border-radius:6px}.sp-x:hover{background:var(--blush);color:var(--rak)}
.sp-dlg-b{overflow:auto;padding:16px 18px}.sp-dlg-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--line)}
.sp-sub{margin:0 0 10px;color:var(--muted)}.sp-sub a{color:var(--rak)}
.sp-jobs{display:grid;gap:8px;margin-top:10px}
.sp-job{all:unset;box-sizing:border-box;display:grid;gap:2px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;cursor:pointer}
.sp-job:hover:not([disabled]){border-color:var(--rak);background:var(--blush)}.sp-job[disabled]{opacity:.5;cursor:not-allowed}
.sp-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}.sp-tags i{font-style:normal;font-size:11.5px;background:var(--bg);border-radius:6px;padding:1px 7px;color:var(--muted)}
.sp-form{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.sp-form .wide{grid-column:span 2}
.sp-h{margin:16px 0 6px;font-size:14px}.sp-scope{margin:0;padding-left:18px;display:grid;gap:3px}.sp-scope a{color:var(--rak)}
.sp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin:10px 0 14px}.sp-head h2{margin:6px 0 4px;font-size:20px;font-weight:600}
.sp-links{margin-top:6px;font-size:13px}.sp-links a{color:var(--rak)}
.sp-docs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}.sp-doc{display:inline-flex;align-items:center;gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:20px;padding:2px 4px 2px 10px;font-size:13px}.sp-doc a{color:var(--ink);text-decoration:none;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sp-doc a:hover{color:var(--rak);text-decoration:underline}.sp-doc .sp-x{font-size:11px;padding:2px 5px}
.sp-docform{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}.sp-docform .sp-in{width:auto;font-size:13px;padding:6px 9px}.sp-docform .sp-in[name=title]{flex:1 1 220px}.sp-docform .sp-in[name=url]{flex:2 1 320px}.sp-docerr{color:var(--rak);font-size:12.5px}.sp-docform[hidden]{display:none}
.sp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sp-actions .sp-in{width:auto}
.sp-edit{overflow:auto;max-height:calc(100vh - 96px)}.sp-edit thead th{position:sticky;top:0;z-index:4;background:#f7f8fa;box-shadow:inset 0 -1px 0 var(--line)}.sp-edit tfoot td{position:sticky;bottom:0;z-index:3;background:#fff;box-shadow:inset 0 1px 0 var(--line)}.sp-edit table{table-layout:fixed}.sp-edit th{white-space:normal;vertical-align:bottom;line-height:1.3;padding:10px 6px}.sp-edit td{vertical-align:top;padding:6px 5px}.sp-edit .c{text-align:center}.sp-edit td.c:first-child{color:var(--muted);padding-top:11px}.sp-edit .r{text-align:right}.sp-edit td.c .sp-cell{text-align:center}.sp-edit td.r .sp-cell{text-align:right}.sp-edit .sp-cell{width:100%;min-width:0;box-sizing:border-box;line-height:1.4}.sp-edit select.sp-prio{text-align:center;text-align-last:center}.sp-edit td.amt{font-variant-numeric:tabular-nums;white-space:nowrap;padding-top:11px;padding-right:10px;font-weight:600}.sp-edit .tag{font-size:12px;color:var(--muted)}.sp-edit td.act{white-space:nowrap;text-align:center}.sp-move{font:inherit;font-size:12px;border:1px solid var(--line);border-radius:6px;background:#fff;width:34px;padding:3px}
.sp-zone td{background:var(--blush);padding:8px 10px!important}.sp-zone-in{display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;left:10px;width:max-content}.sp-zname{font:inherit;font-weight:600;color:var(--rak);border:1px solid transparent;background:transparent;border-radius:6px;padding:4px 6px;min-width:320px}.sp-zname:hover,.sp-zname:focus{border-color:var(--blush-2);background:#fff}.sp-ztot{font-weight:600;font-size:13px}.sp-btn.sm{font-size:12px;padding:4px 10px}.sp-edit tfoot td{padding:10px 8px;border-top:2px solid var(--line)}.sp-edit td{padding:4px 4px;vertical-align:top}.sp-cell{font:inherit;font-size:13px;line-height:1.4;width:100%;min-width:0;box-sizing:border-box;border:1px solid transparent;border-radius:6px;padding:5px 6px;background:transparent;color:var(--ink)}
.sp-cell:hover{border-color:var(--line);background:#fff}textarea.sp-wrap{resize:none;overflow:hidden;display:block;white-space:pre-wrap;word-break:break-word}
.sp-saved{display:block;font-size:12.5px;color:var(--muted);margin-top:6px}.sp-link{all:unset;color:var(--rak);cursor:pointer;text-decoration:underline}
@media (max-width:760px){.sp-bar{grid-template-columns:1fr 1fr;position:static}.sp-bar label:nth-child(3){grid-column:span 2}.sp-form{grid-template-columns:1fr 1fr}}`;

  async function mount(el, sub) {
    ROOT = el;
    if (!document.getElementById("spCss")) { const s = document.createElement("style"); s.id = "spCss"; s.textContent = CSS; document.head.appendChild(s); }
    el.innerHTML = `<div class="empty">กำลังโหลด…</div>`;
    await loadAll();
    if (ROOT !== el) return;
    if (sub) {
      const key = decodeURIComponent(sub);
      const p = PROJECTS.find(x => slugOf(x) === key) || PROJECTS.find(x => x.id === key); // old links used the internal id
      if (p) return pageProject(JSON.parse(JSON.stringify(p)));
      el.innerHTML = `<div class="empty">ไม่พบโปรเจคนี้ · <a class="open" href="#spare-part">กลับรายการ</a></div>`; return;
    }
    pageList();
    el.querySelector('[data-act="new"]').onclick = openWizard;
  }
  window.SparePart = { mount };
})();
