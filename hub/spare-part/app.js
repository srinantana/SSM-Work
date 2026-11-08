/* SSM Work · Spare Part module.
   Routes (inside the hub): #spare-part          → project list + "Create new project" button + search bar
                            #spare-part/<id>     → one spare part project (editable, export CSV)
   Data:  /spare-part/data/sources.json  – jobs (Job Order header + scope, P&ID refs, aux equipment from Project Pipeline)
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
  async function loadAll() {
    if (!SRC) SRC = await fetch("/spare-part/data/sources.json", { cache: "no-store" }).then(r => r.ok ? r.json() : { jobs: [] }).catch(() => ({ jobs: [] }));
    if (PROJECTS) return;
    try {
      const r = await fetch("/api/spare-part/projects", { cache: "no-store" });
      if (!r.ok) throw 0;
      PROJECTS = await r.json(); MODE = "server";
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
    if (MODE === "server") await fetch("/api/spare-part/projects?id=" + encodeURIComponent(id), { method: "DELETE" }).catch(() => null);
    PROJECTS = PROJECTS.filter(x => x.id !== id); if (MODE === "local") lsWrite(PROJECTS);
  }
  const upsert = p => { const i = PROJECTS.findIndex(x => x.id === p.id); i < 0 ? PROJECTS.unshift(p) : (PROJECTS[i] = p); };
  const uid = () => "sp-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- spare part suggestions (rules per equipment category) ---------- */
  const R = (part, per, unit, prio, remark = "") => ({ part, per, unit, prio, remark });
  function rulesFor(eq) {
    const n = (eq.name || "").toLowerCase(), c = (eq.category || "").toLowerCase();
    if (/peristaltic/.test(n)) return [R("Pump tubing (Tygon) – ตามขนาดหัวปั๊ม", 2, "roll", "Consumable", "สายสึกหรอ เปลี่ยนตามชั่วโมงใช้งาน"), R("Pump head (same model)", .25, "pc", "Recommended")];
    if (/tygon|tubing/.test(n)) return [R(eq.name, 1, eq.unit || "roll", "Consumable")];
    if (/grundfos|cm 3|crne/.test(n)) return [R("Shaft seal kit", .5, "set", "Critical"), R("O-ring / gasket kit", .5, "set", "Recommended")];
    if (c.includes("pump")) return [R("Impeller", .5, "pc", "Recommended"), R("Bushing / bearing set", .5, "set", "Critical"), R("O-ring / seal kit (Viton)", 1, "set", "Consumable")];
    if (c.includes("filtration")) return [R("Filter cartridge 20\" (ไมครอนตามกระบวนการ)", 6, "pc", "Consumable", "เผื่อเปลี่ยน ~6 ครั้ง/ปี/ชุด ปรับตามหน้างาน"), R("Chamber lid O-ring (Viton)", 1, "pc", "Consumable")];
    if (c.includes("heater")) return [R("Spare heater (same model)", .5, "pc", "Critical"), R("Over-temperature (OTP) sensor", .5, "pc", "Recommended")];
    if (c.includes("heating & cooling")) return [R("Connection gasket / fitting set", 1, "set", "Recommended")];
    if (c.includes("rectifier")) return [R("Cooling fan", 1, "pc", "Recommended"), R("Fuse / control board set (ตามคำแนะนำผู้ผลิต)", 1, "set", "Critical", "ขอรายการจาก PE ตาม serial no.")];
    if (c.includes("agitator")) return [R("Brushless motor + driver (same model)", 1, "set", "Critical")];
    if (c.includes("fan")) return [R("Motor bearing set", 1, "set", "Recommended"), R("Flexible connector / shaft seal", 1, "pc", "Recommended")];
    return [R("Spare (ระบุ)", 1, eq.unit || "pc", "Recommended")];
  }
  const PID_COMMON = [
    R("Level float switch (PVDF)", 1, "pc", "Critical", "LL/L/H/HH ตาม P&ID"),
    R("Temperature sensor PT-100 (Teflon coated)", 1, "pc", "Critical", "TE ตาม P&ID"),
    R("Air solenoid valve 'Festo' 2x3/2", 1, "pc", "Recommended", "VCA / jig clamping"),
    R("PVDF union ball valve d32", 2, "pc", "Recommended"),
  ];
  function suggest(job, eqs) {
    const lines = [];
    eqs.forEach(eq => rulesFor(eq).forEach(r => lines.push({
      id: uid(), equip: eq.name, tag: eq.tag || "", location: eq.location || eq.system || "", part: r.part,
      qty: Math.max(1, Math.ceil((eq.qty || 1) * r.per)), unit: r.unit, prio: r.prio, source: "Aux list", remark: r.remark,
    })));
    if ((job.pid || []).length) PID_COMMON.forEach(r => lines.push({ id: uid(), equip: "Instrument / valve", tag: "", location: "ตาม P&ID", part: r.part, qty: r.per, unit: r.unit, prio: r.prio, source: "P&ID", remark: r.remark }));
    return lines;
  }

  /* ---------- views ---------- */
  const STATUS = { draft: ["Draft", "soon"], review: ["Review", "soon"], issued: ["Issued", "live"] };
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
      <tr><td><span class="jo">${esc(p.jo)}</span></td><td>${esc(p.customerShort || p.customer)}<div class="sub">${esc(p.site || "")}</div></td>
      <td>${esc(p.name)}</td><td>${(p.lines || []).length}</td><td>${pill(p.status)}</td><td class="sub">${fmtDate(p.updated)}</td>
      <td><a class="open" href="#spare-part/${encodeURIComponent(p.id)}">เปิด →</a></td></tr>`).join("")}</tbody></table></div>`;
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
      const jobs = SRC.jobs.filter(j => has([j.jo, j.customer, j.customerShort, j.name, j.pmName].join(" "), WIZ.q));
      body = `<p class="sp-sub">เลือก Job ที่จะทำรายการอะไหล่ (Job Order ตั้งแต่ ต.ค. 2026)</p>
        <input class="sp-in" id="wq" placeholder="ค้นหา Job No. / ลูกค้า / ชื่องาน" value="${esc(WIZ.q)}">
        <div class="sp-jobs">${jobs.map(j => `<button class="sp-job" data-jo="${esc(j.jo)}" ${used.has(j.jo) ? "disabled" : ""}>
          <span class="jo">${esc(j.jo)}</span><b>${esc(j.name)}</b><span class="sub">${esc(j.customerShort)} · ${esc(j.customer)}</span>
          <span class="sp-tags"><i>${j.aux.length} equipment</i><i>${j.pid.length ? j.pid.length + " P&ID" : "ไม่มี P&ID"}</i>${used.has(j.jo) ? "<i>มีโปรเจคแล้ว</i>" : ""}</span></button>`).join("") || `<div class="empty">ไม่พบ job</div>`}</div>`;
    } else if (WIZ.step === 2) {
      const h = WIZ.head, j = WIZ.job;
      const f = (k, label, wide) => `<label class="${wide ? "wide" : ""}"><span>${label}</span><input data-h="${k}" value="${esc(h[k])}"></label>`;
      body = `<p class="sp-sub">ข้อมูลเบื้องต้นจาก <a href="${esc(j.joFile)}" target="_blank" rel="noopener">Job Order ${esc(j.jo)}</a> แก้ไขได้</p>
        <div class="sp-form">${f("jo", "Job No.")}${f("customerShort", "Customer (ย่อ)")}${f("customer", "Customer", 1)}${f("name", "Project name", 1)}
        ${f("site", "สถานที่")}${f("contact", "ผู้ติดต่อลูกค้า")}${f("tel", "โทร")}${f("qo", "QO No.")}${f("po", "PO No.")}${f("delivery", "กำหนดส่งมอบ")}${f("pm", "หัวหน้าโครงการ")}${f("coordinator", "ผู้ประสานงาน")}</div>
        <h4 class="sp-h">ขอบเขตงานตาม Job Order</h4><ul class="sp-scope">${j.scope.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`;
    } else {
      const j = WIZ.job;
      body = `<p class="sp-sub">Aux / Equipment list จาก Project Pipeline (JO ${esc(j.jo)}) · เลือกอุปกรณ์ที่จะทำอะไหล่แนะนำ</p>
        <div class="tbl"><table><thead><tr><th></th><th>Equipment</th><th>Tag (P&ID)</th><th>System / Location</th><th>Qty</th></tr></thead><tbody>${j.aux.map((e, i) => `
          <tr><td><input type="checkbox" data-eq="${i}" ${WIZ.eqSel[i] ? "checked" : ""}></td><td><b>${esc(e.name)}</b><div class="sub">${esc(e.spec)}</div>${e.specStatus !== "approved" ? `<span class="badge soon">spec ${esc(e.specStatus)}</span>` : ""}</td>
          <td>${esc(e.tag || "–")}</td><td>${esc(e.system || "")}<div class="sub">${esc(e.location || "")}</div></td><td>${e.qty} ${esc(e.unit)}</td></tr>`).join("")}</tbody></table></div>
        <h4 class="sp-h">อ้างอิง P&ID</h4>${j.pid.length ? `<ul class="sp-scope">${j.pid.map(p => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></li>`).join("")}${j.pidTags.map(t => `<li class="sub">${esc(t)}</li>`).join("")}</ul>`
          : `<p class="sub">ยังไม่พบ P&ID ในโฟลเดอร์ job${(j.layout || []).length ? ` · มี <a href="${esc(j.layout[0].url)}" target="_blank" rel="noopener">${esc(j.layout[0].title)}</a>` : ""}</p>`}`;
    }
    if (WIZ.step > 1) foot += `<button class="sp-btn" data-w="back">← ย้อนกลับ</button>`;
    if (WIZ.step === 2) foot += `<button class="sp-btn primary" data-w="next">ถัดไป: Equipment →</button>`;
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
      WIZ.head = { jo: j.jo, customer: j.customer, customerShort: j.customerShort, name: j.name, site: j.site, contact: j.contact, tel: j.tel, qo: j.qo, po: j.po, delivery: j.delivery, pm: j.pm, coordinator: j.coordinator };
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
      const p = { id: uid(), ...WIZ.head, ij: j.ij, status: "draft", created: new Date().toISOString(), createdBy: (window.SSM_ME && window.SSM_ME.email) || "",
        refs: { folder: j.folder, joFile: j.joFile, pid: j.pid, layout: j.layout || [], pipeline: SRC.sources?.pipeline },
        equipment: eqs, lines: suggest(j, eqs) };
      const saved = await save(p); closeWizard(); location.hash = "#spare-part/" + encodeURIComponent(saved.id);
    }
  }

  /* --- project detail --- */
  function pageProject(p) {
    const r = p.refs || {};
    const links = [r.joFile && `<a href="${esc(r.joFile)}" target="_blank" rel="noopener">Job Order</a>`, r.folder && `<a href="${esc(r.folder)}" target="_blank" rel="noopener">โฟลเดอร์ Job</a>`,
      ...(r.pid || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`), ...(r.layout || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`)].filter(Boolean).join(" · ");
    const cell = (l, k, cls = "") => `<td class="${cls}"><input class="sp-cell" data-l="${l.id}" data-k="${k}" value="${esc(l[k])}"${k === "qty" ? ' inputmode="decimal"' : ""}></td>`;
    ROOT.innerHTML = `<a class="open" href="#spare-part">← รายการโปรเจค</a>
      <div class="sp-head"><div><span class="jo">JO ${esc(p.jo)}</span> ${pill(p.status)}<h2>${esc(p.name)}</h2>
        <div class="sub">${esc(p.customer)} · ${esc(p.site || "")} · ผู้ติดต่อ ${esc(p.contact || "-")} ${esc(p.tel || "")} · QO ${esc(p.qo || "-")} · PO ${esc(p.po || "-")} · ส่งมอบ ${esc(p.delivery || "-")}</div>
        <div class="sp-links">${links}</div></div>
        <div class="sp-actions"><select class="sp-in" id="spStatus">${Object.keys(STATUS).map(s => `<option value="${s}" ${p.status === s ? "selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select>
          <button class="sp-btn" data-a="add">＋ เพิ่มรายการ</button><button class="sp-btn" data-a="csv">Export Excel (CSV)</button><button class="sp-btn primary" data-a="save">บันทึก</button></div></div>
      <div class="tbl sp-edit"><table><thead><tr><th>#</th><th>Equipment</th><th>Tag</th><th>Location</th><th>Spare part</th><th>Part no.</th><th>Qty</th><th>Unit</th><th>Priority</th><th>Source</th><th>Remark</th><th></th></tr></thead><tbody>
      ${(p.lines || []).map((l, i) => `<tr><td>${i + 1}</td>${cell(l, "equip", "w2")}${cell(l, "tag")}${cell(l, "location")}${cell(l, "part", "w2")}${cell(l, "partNo")}${cell(l, "qty", "n")}${cell(l, "unit", "n")}
        <td><select class="sp-cell" data-l="${l.id}" data-k="prio">${["Critical", "Recommended", "Consumable"].map(o => `<option ${l.prio === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
        <td class="sub">${esc(l.source || "")}</td>${cell(l, "remark", "w2")}<td><button class="sp-x" data-del="${l.id}" title="ลบรายการ">✕</button></td></tr>`).join("")}</tbody></table></div>
      <p class="sp-src">อะไหล่ที่ระบบเสนอเป็นค่าเริ่มต้นตามประเภทอุปกรณ์ ตรวจสอบ part no. และจำนวนกับผู้ผลิต/วิศวกรก่อนส่งลูกค้า · <button class="sp-link" data-a="delete">ลบโปรเจคนี้</button></p>
      <span class="sp-saved" id="spSaved" aria-live="polite"></span>`;
    let dirty = false; const mark = () => { dirty = true; ROOT.querySelector("#spSaved").textContent = "มีการแก้ไขที่ยังไม่บันทึก"; };
    ROOT.querySelectorAll(".sp-cell").forEach(i => i.oninput = i.onchange = () => { const l = p.lines.find(x => x.id === i.dataset.l); l[i.dataset.k] = i.dataset.k === "qty" ? Number(i.value) || i.value : i.value; mark(); });
    ROOT.querySelector("#spStatus").onchange = e => { p.status = e.target.value; mark(); };
    ROOT.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { p.lines = p.lines.filter(x => x.id !== b.dataset.del); pageProject(p); mark(); });
    ROOT.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === "add") { p.lines.push({ id: uid(), equip: "", tag: "", location: "", part: "", partNo: "", qty: 1, unit: "pc", prio: "Recommended", source: "Manual", remark: "" }); pageProject(p); mark(); }
      if (a === "csv") exportCsv(p);
      if (a === "save") { await save(p); dirty = false; ROOT.querySelector("#spSaved").textContent = "บันทึกแล้ว " + new Date().toLocaleTimeString("th-TH") + (MODE === "local" ? " (ในเบราว์เซอร์นี้)" : ""); }
      if (a === "delete" && confirm("ลบโปรเจค Spare Part " + p.jo + " ? (ลบแล้วกู้คืนไม่ได้)")) { await remove(p.id); location.hash = "#spare-part"; }
    });
  }
  function exportCsv(p) {
    const head = ["No.", "Equipment", "Tag", "Location", "Spare part", "Part no.", "Qty", "Unit", "Priority", "Source", "Remark"];
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const meta = [["Recommended Spare Part List"], ["Customer", p.customer], ["Project", p.name], ["Job No.", p.jo], ["QO / PO", (p.qo || "") + " / " + (p.po || "")], []];
    const rows = (p.lines || []).map((l, i) => [i + 1, l.equip, l.tag, l.location, l.part, l.partNo, l.qty, l.unit, l.prio, l.source, l.remark]);
    const csv = "﻿" + [...meta, head, ...rows].map(r => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `SparePart_${p.jo}_${(p.customerShort || "").replace(/\W+/g, "")}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
.sp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sp-actions .sp-in{width:auto}
.sp-edit{overflow-x:auto}.sp-edit table{min-width:1500px}.sp-edit td{padding:4px 5px;vertical-align:middle}.sp-edit select.sp-cell{min-width:128px}.sp-cell{font:inherit;font-size:13px;width:100%;min-width:70px;border:1px solid transparent;border-radius:6px;padding:5px 6px;background:transparent;color:var(--ink)}
.sp-cell:hover{border-color:var(--line);background:#fff}.sp-edit td.w2 .sp-cell{min-width:230px}.sp-edit td.n .sp-cell{min-width:48px;width:56px}
.sp-saved{display:block;font-size:12.5px;color:var(--muted);margin-top:6px}.sp-link{all:unset;color:var(--rak);cursor:pointer;text-decoration:underline}
@media (max-width:760px){.sp-bar{grid-template-columns:1fr 1fr;position:static}.sp-bar label:nth-child(3){grid-column:span 2}.sp-form{grid-template-columns:1fr 1fr}}`;

  async function mount(el, sub) {
    ROOT = el;
    if (!document.getElementById("spCss")) { const s = document.createElement("style"); s.id = "spCss"; s.textContent = CSS; document.head.appendChild(s); }
    el.innerHTML = `<div class="empty">กำลังโหลด…</div>`;
    await loadAll();
    if (ROOT !== el) return;
    if (sub) {
      const p = PROJECTS.find(x => x.id === decodeURIComponent(sub));
      if (p) return pageProject(JSON.parse(JSON.stringify(p)));
      el.innerHTML = `<div class="empty">ไม่พบโปรเจคนี้ · <a class="open" href="#spare-part">กลับรายการ</a></div>`; return;
    }
    pageList();
    el.querySelector('[data-act="new"]').onclick = openWizard;
  }
  window.SparePart = { mount };
})();
