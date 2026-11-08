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
    if (MODE === "server") {
      const r = await fetch("/api/spare-part/projects?id=" + encodeURIComponent(id), { method: "DELETE" }).catch(() => null);
      if (!r || !r.ok) return false;
    }
    PROJECTS = PROJECTS.filter(x => x.id !== id); if (MODE === "local") lsWrite(PROJECTS);
    return true;
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
  // Specification / Material without the model text already shown under Manufacturer / Model
  const specOf = eq => (eq.spec || "").split(" · ").filter(seg => { const k = norm(seg).slice(0, 6); return !(k && norm(eq.model).includes(k)) && !/^(series|power station|ptfe immersion coil$)/i.test(seg); }).join(" · ");
  function suggest(job, eqs) {
    const lines = [];
    const weeks = d => d ? Math.ceil(d / 7) : "";
    eqs.forEach(eq => rulesFor(eq).forEach(r => {
      const same = /same model|pump head/i.test(r.part);
      lines.push({
        id: uid(), zone: eq.zone || eq.location || eq.system || "Zone A", equip: eq.name, tag: eq.tag || "", part: r.part, partNo: same ? (eq.model || "") : "",
        maker: [eq.maker, eq.model].filter(Boolean).join(" / "), spec: specOf(eq), installed: eq.qty || "",
        qty: Math.max(1, Math.ceil((eq.qty || 1) * r.per)), unit: r.unit, prio: r.prio, leadWeeks: weeks(eq.leadDays), unitPrice: "", source: "Aux list", remark: r.remark,
      });
    }));
    if ((job.pid || []).length) PID_COMMON.forEach(r => lines.push({ id: uid(), zone: "Instrument & Valve (ตาม P&ID)", equip: "Instrument / valve", tag: "", part: r.part, partNo: "", maker: "", spec: "", installed: "",
      qty: r.per, unit: r.unit, prio: r.prio, leadWeeks: "", unitPrice: "", source: "P&ID", remark: r.remark }));
    const order = [...new Set(lines.map(l => l.zone))].sort((x, y) => (x.startsWith("Instrument") ? 1 : 0) - (y.startsWith("Instrument") ? 1 : 0) || x.localeCompare(y));
    return lines.sort((x, y) => order.indexOf(x.zone) - order.indexOf(y.zone));
  }

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
        <div class="tbl"><table><thead><tr><th></th><th>Equipment</th><th>Tag (P&ID)</th><th>Zone</th><th>Qty</th></tr></thead><tbody>${j.aux.map((e, i) => `
          <tr><td><input type="checkbox" data-eq="${i}" ${WIZ.eqSel[i] ? "checked" : ""}></td><td><b>${esc(e.name)}</b><div class="sub">${esc(e.spec)}</div>${e.specStatus !== "approved" ? `<span class="badge soon">spec ${esc(e.specStatus)}</span>` : ""}</td>
          <td>${esc(e.tag || "–")}</td><td>${esc(e.zone || e.system || "")}<div class="sub">${esc([e.system, e.location].filter(Boolean).join(" · "))}</div></td><td>${e.qty} ${esc(e.unit)}</td></tr>`).join("")}</tbody></table></div>
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
  const PRIOS = ["Critical", "Recommended", "Consumable"];
  const prioCls = v => "p-" + String(v || "recommended").toLowerCase();
  const COLS = ["No.", "Equipment / Tag", "Part description", "Part No. / Drawing Ref.", "Manufacturer / Model", "Specification / Material", "Installed qty", "Recommended spare qty", "Unit", "Priority", "Lead time (weeks)", "Unit price", "Amount", "Remarks"];
  const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
  const money = n => n ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  const amountOf = l => num(l.qty) * num(l.unitPrice);
  const zonesOf = p => { const z = []; (p.lines || []).forEach(l => { if (!z.includes(l.zone)) z.push(l.zone); }); (p.zones || []).forEach(x => { if (!z.includes(x)) z.push(x); }); return z; };
  function migrate(p) { // projects saved before the 14-column layout
    (p.lines || []).forEach(l => {
      if (l.zone === undefined) l.zone = l.location || "Zone A";
      if (l.maker === undefined) l.maker = "";
      if (l.spec === undefined) l.spec = "";
      if (l.installed === undefined) l.installed = "";
      if (l.leadWeeks === undefined) l.leadWeeks = "";
      if (l.unitPrice === undefined) l.unitPrice = "";
    });
    return p;
  }
  function pageProject(p) {
    migrate(p);
    const r = p.refs || {};
    const links = [r.joFile && `<a href="${esc(r.joFile)}" target="_blank" rel="noopener">Job Order</a>`, r.folder && `<a href="${esc(r.folder)}" target="_blank" rel="noopener">โฟลเดอร์ Job</a>`,
      ...(r.pid || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`), ...(r.layout || []).map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>`)].filter(Boolean).join(" · ");
    const zones = zonesOf(p);
    const NUMK = /^(qty|installed|leadWeeks|unitPrice|unit)$/;
    const inp = (l, k, cls = "", ph = "") => NUMK.test(k)
      ? `<input class="sp-cell ${cls}" data-l="${l.id}" data-k="${k}" value="${esc(l[k])}" placeholder="${esc(ph)}"${k !== "unit" ? ' inputmode="decimal"' : ""}>`
      : `<textarea class="sp-cell sp-wrap ${cls}" rows="1" data-l="${l.id}" data-k="${k}" placeholder="${esc(ph)}">${esc(l[k])}</textarea>`;
    let no = 0;
    const body = zones.map((z, zi) => {
      const rows = p.lines.filter(l => l.zone === z);
      return `<tr class="sp-zone"><td colspan="${COLS.length + 1}"><div class="sp-zone-in">
          <input class="sp-zname" data-zone="${zi}" value="${esc(z)}" aria-label="ชื่อโซน">
          <span class="sub">${rows.length} รายการ</span><span class="sp-ztot" data-ztot="${zi}"></span>
          <button class="sp-btn sm" data-addin="${zi}">＋ เพิ่มรายการในโซนนี้</button></div></td></tr>`
        + rows.map(l => { no++; return `<tr data-row="${l.id}">
          <td class="c">${no}</td>
          <td class="w2">${inp(l, "equip", "", "Equipment")}${inp(l, "tag", "tag", "Tag")}</td>
          <td class="w2">${inp(l, "part")}</td><td>${inp(l, "partNo")}</td><td class="w2">${inp(l, "maker")}</td><td class="w2">${inp(l, "spec")}</td>
          <td class="n">${inp(l, "installed")}</td><td class="n">${inp(l, "qty")}</td><td class="n">${inp(l, "unit")}</td>
          <td><select class="sp-cell sp-prio ${prioCls(l.prio)}" data-l="${l.id}" data-k="prio">${PRIOS.map(o => `<option class="${prioCls(o)}" ${l.prio === o ? "selected" : ""}>${o}</option>`).join("")}</select></td>
          <td class="n">${inp(l, "leadWeeks")}</td><td class="m">${inp(l, "unitPrice", "r")}</td><td class="m r amt" data-amt="${l.id}">${money(amountOf(l))}</td>
          <td class="w2">${inp(l, "remark")}</td>
          <td class="act"><select class="sp-move" data-move="${l.id}" title="ย้ายโซน" aria-label="ย้ายโซน"><option value="">⇄</option>${zones.map((x, i) => x === z ? "" : `<option value="${i}">${esc(x)}</option>`).join("")}</select><button class="sp-x" data-del="${l.id}" title="ลบรายการ">✕</button></td></tr>`; }).join("");
    }).join("");
    ROOT.innerHTML = `<a class="open" href="#spare-part">← รายการโปรเจค</a>
      <div class="sp-head"><div><span class="jo">JO ${esc(p.jo)}</span> ${pill(p.status)}<h2>${esc(p.name)}</h2>
        <div class="sub">${esc(p.customer)} · ${esc(p.site || "")} · ผู้ติดต่อ ${esc(p.contact || "-")} ${esc(p.tel || "")} · QO ${esc(p.qo || "-")} · PO ${esc(p.po || "-")} · ส่งมอบ ${esc(p.delivery || "-")}</div>
        <div class="sp-links">${links}</div></div>
        <div class="sp-actions"><select class="sp-in" id="spStatus">${Object.keys(STATUS).map(s => `<option value="${s}" ${p.status === s ? "selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select>
          <button class="sp-btn" data-a="zone">＋ เพิ่มโซน</button><button class="sp-btn" data-a="import">⬆ Import from template</button><button class="sp-btn" data-a="csv" title="ไฟล์ CSV สำหรับส่งลูกค้า: ไม่มี Remarks และเฉพาะรายการที่ใส่ Unit price แล้ว">Export for customer</button><button class="sp-btn primary" data-a="save">บันทึก</button>${isAdmin() ? `<button class="sp-btn danger" data-a="delete">ลบโปรเจค</button>` : ""}</div></div>
      <div class="tbl sp-edit"><table><colgroup>${[44, 210, 190, 130, 160, 190, 66, 84, 58, 150, 68, 104, 110, 170, 72].map(w => `<col style="width:${w}px">`).join("")}</colgroup><thead><tr>${COLS.map(c => `<th>${c}</th>`).join("")}<th></th></tr></thead><tbody>${body || `<tr><td colspan="${COLS.length + 1}" class="sub">ยังไม่มีรายการ · กด ＋ เพิ่มโซน</td></tr>`}</tbody>
        <tfoot><tr><td colspan="12" class="r"><b>Total (excl. VAT)</b></td><td class="r"><b id="spGrand"></b></td><td colspan="2"></td></tr></tfoot></table></div>
      <p class="sp-src">อะไหล่ที่ระบบเสนอเป็นค่าเริ่มต้นตามประเภทอุปกรณ์ · ใส่ Part No. และ Unit price (ราคาขาย) ก่อนส่งลูกค้า · Lead time เริ่มต้นจาก Project Pipeline</p>
      <span class="sp-saved" id="spSaved" aria-live="polite"></span>`;
    const totals = () => {
      zones.forEach((z, i) => { const t = p.lines.filter(l => l.zone === z).reduce((a, l) => a + amountOf(l), 0); const el = ROOT.querySelector(`[data-ztot="${i}"]`); if (el) el.textContent = t ? "รวม " + money(t) : ""; });
      ROOT.querySelector("#spGrand").textContent = money(p.lines.reduce((a, l) => a + amountOf(l), 0)) || "–";
    };
    totals();
    const fit = t => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
    ROOT.querySelectorAll("textarea.sp-wrap").forEach(t => { fit(t); t.addEventListener("input", () => fit(t)); });
    const mark = () => { ROOT.querySelector("#spSaved").textContent = "มีการแก้ไขที่ยังไม่บันทึก"; };
    const redraw = () => { const y = window.scrollY; pageProject(p); window.scrollTo(0, y); mark(); };
    const blank = zone => ({ id: uid(), zone, equip: "", tag: "", part: "", partNo: "", maker: "", spec: "", installed: "", qty: 1, unit: "pc", prio: "Recommended", leadWeeks: "", unitPrice: "", remark: "", source: "Manual" });
    ROOT.querySelectorAll(".sp-cell").forEach(i => i.oninput = i.onchange = () => {
      const l = p.lines.find(x => x.id === i.dataset.l); l[i.dataset.k] = i.value; mark();
      if (i.dataset.k === "prio") i.className = "sp-cell sp-prio " + prioCls(i.value);
      if (i.dataset.k === "qty" || i.dataset.k === "unitPrice") { ROOT.querySelector(`[data-amt="${l.id}"]`).textContent = money(amountOf(l)); totals(); }
    });
    ROOT.querySelectorAll(".sp-zname").forEach(i => i.onchange = () => {
      const old = zones[+i.dataset.zone], nu = i.value.trim() || old;
      p.lines.forEach(l => { if (l.zone === old) l.zone = nu; }); p.zones = (p.zones || []).map(z => z === old ? nu : z); redraw();
    });
    ROOT.querySelectorAll("[data-addin]").forEach(b => b.onclick = () => { p.lines.push(blank(zones[+b.dataset.addin])); redraw(); });
    ROOT.querySelectorAll("[data-move]").forEach(s => s.onchange = () => { if (s.value === "") return; p.lines.find(x => x.id === s.dataset.move).zone = zones[+s.value]; redraw(); });
    ROOT.querySelector("#spStatus").onchange = e => { p.status = e.target.value; mark(); };
    ROOT.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { p.lines = p.lines.filter(x => x.id !== b.dataset.del); redraw(); });
    ROOT.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === "zone") { const n = prompt("ชื่อโซนใหม่ (Process tank หรือ System)", "Zone " + String.fromCharCode(65 + zones.length) + " – "); if (n && n.trim()) { p.zones = [...(p.zones || []), n.trim()]; p.lines.push(blank(n.trim())); redraw(); } }
      if (a === "csv") exportCsv(p);
      if (a === "import") openImport(p, (n, how) => { redraw(); ROOT.querySelector("#spSaved").textContent = `นำเข้า ${n} รายการ (${how === "replace" ? "แทนที่" : "เพิ่มต่อท้าย"}) · กด บันทึก เพื่อเก็บ`; });
      if (a === "save") { p.zones = zonesOf(p); await save(p); ROOT.querySelector("#spSaved").textContent = "บันทึกแล้ว " + new Date().toLocaleTimeString("th-TH") + (MODE === "local" ? " (ในเบราว์เซอร์นี้)" : ""); }
      if (a === "delete" && isAdmin() && confirm("ลบโปรเจค Spare Part " + p.jo + " – " + p.name + " ?\nลบแล้วกู้คืนไม่ได้ (ถ้าแค่เลิกใช้ ให้เปลี่ยนสถานะเป็น Inactive)")) {
        const ok = await remove(p.id); if (ok) location.hash = "#spare-part"; else ROOT.querySelector("#spSaved").textContent = "ลบไม่สำเร็จ (ต้องเป็น admin)"; }
    });
  }
  /* --- Excel / spreadsheet template: download + import --- */
  const XLSX_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
  let xlsxP = null;
  const loadXLSX = () => xlsxP || (xlsxP = new Promise((ok, no) => {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement("script"); s.src = XLSX_SRC; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous";
    s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; no(new Error("โหลดตัวอ่าน Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  }));
  const TPL_COLS = ["Zone", ...COLS];
  async function downloadTemplate(p) {
    const X = await loadXLSX(); migrate(p);
    const meta = [["Recommended Spare Part List – import template"], ["Customer", p.customer], ["Project", p.name], ["Job No.", p.jo],
      ["วิธีใช้: แก้/เพิ่มแถวใต้หัวตาราง · คอลัมน์ Zone ใส่ชื่อ Process tank หรือ System · แถวที่ไม่มี Part description จะถูกข้าม · Amount คำนวณเอง (ไม่ต้องกรอก)"], []];
    const head = meta.length;
    const rows = (p.lines || []).map((l, i) => [l.zone, i + 1, [l.equip, l.tag].filter(Boolean).join(" / "), l.part, l.partNo, l.maker, l.spec, l.installed === "" ? null : num(l.installed), num(l.qty), l.unit, l.prio,
      l.leadWeeks === "" ? null : num(l.leadWeeks), l.unitPrice === "" ? null : num(l.unitPrice), null, l.remark]);
    if (!rows.length) rows.push(["Zone A – EP Tank T101 (ตัวอย่าง)", 1, "Serfilco vertical pump / P101A1", "Impeller", "", "Serfilco / EO1KV3-D.75", "PVDF/Viton", 2, 1, "pc", "Recommended", 9, 12500, null, ""]);
    const ws = X.utils.aoa_to_sheet([...meta, TPL_COLS, ...rows]);
    rows.forEach((_, i) => { const r = head + 2 + i; ws["N" + r] = { t: "n", f: `IF(M${r}="","",I${r}*M${r})` }; });
    ws["!cols"] = [28, 6, 40, 34, 22, 30, 36, 10, 12, 8, 13, 10, 12, 14, 34].map(w => ({ wch: w }));
    const lists = X.utils.aoa_to_sheet([["Priority"], ["Critical"], ["Recommended"], ["Consumable"]]);
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Spare Part"); X.utils.book_append_sheet(wb, lists, "Lists");
    X.writeFile(wb, `SparePart_${p.jo}_template.xlsx`);
  }
  const hkey = s => norm(s).replace(/[^a-z0-9ก-๙]/g, "");
  const HEADS = { zone: ["zone", "โซน", "processtank", "system"], no: ["no"], equipTag: ["equipmenttag"], equip: ["equipment"], tag: ["tag", "tagno"],
    part: ["partdescription", "description", "sparepart", "part"], partNo: ["partnodrawingref", "partno", "partnumber", "drawingref"],
    maker: ["manufacturermodel", "manufacturer", "maker", "brand"], spec: ["specificationmaterial", "specification", "material", "spec"],
    installed: ["installedqty", "installed"], qty: ["recommendedspareqty", "recommendedqty", "spareqty", "qty", "quantity"], unit: ["unit", "uom"],
    prio: ["priority"], leadWeeks: ["leadtimeweeks", "leadtime"], unitPrice: ["unitprice", "price"], amount: ["amount"], remark: ["remarks", "remark", "note", "notes"] };
  function parseSheet(aoa) {
    let hr = -1, map = {};
    for (let r = 0; r < Math.min(aoa.length, 40) && hr < 0; r++) {
      const keys = (aoa[r] || []).map(hkey);
      if (keys.some(k => k === "partdescription" || k === "description" || k === "sparepart")) {
        hr = r;
        keys.forEach((k, c) => { for (const [f, al] of Object.entries(HEADS)) if (map[f] === undefined && al.includes(k)) { map[f] = c; break; } });
      }
    }
    if (hr < 0 || map.part === undefined) throw new Error("ไม่พบหัวตาราง (ต้องมีคอลัมน์ Part description)");
    const lines = []; let zone = "Zone A", skipped = 0;
    const g = (row, f) => map[f] === undefined ? "" : String(row[map[f]] ?? "").trim();
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r] || []; const filled = row.map(v => String(v ?? "").trim()).filter(Boolean);
      if (!filled.length) continue;
      const part = g(row, "part");
      if (!part) { // zone header row (grouped layout) or subtotal / total / note row
        if (map.zone === undefined && filled.length === 1 && !/total|subtotal|ช่องเหลือง|unit price/i.test(filled[0])) zone = filled[0]; else skipped++;
        continue;
      }
      if (/^(sub)?total/i.test(part)) { skipped++; continue; }
      let equip = g(row, "equip"), tag = g(row, "tag");
      if (map.equipTag !== undefined) { const v = g(row, "equipTag"), i = v.lastIndexOf(" / "), last = i > 0 ? v.slice(i + 3) : "";
        if (last && !/\s/.test(last) && /\d/.test(last)) { equip = v.slice(0, i); tag = last; } else equip = v; }
      const pr = g(row, "prio").toLowerCase();
      const n = v => { const x = num(v); return v === "" ? "" : x; };
      lines.push({ id: uid(), zone: g(row, "zone") || zone, equip, tag, part, partNo: g(row, "partNo"), maker: g(row, "maker"), spec: g(row, "spec"),
        installed: n(g(row, "installed")), qty: n(g(row, "qty")) || 1, unit: g(row, "unit") || "pc",
        prio: pr.startsWith("c") && pr.includes("crit") ? "Critical" : pr.startsWith("con") ? "Consumable" : "Recommended",
        leadWeeks: n(g(row, "leadWeeks")), unitPrice: n(g(row, "unitPrice")), source: "Import", remark: g(row, "remark") });
    }
    return { lines, skipped };
  }
  async function readFile(file) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: "array" });
    for (const name of wb.SheetNames) {
      if (/^lists$|^readme$/i.test(name)) continue;
      try { const res = parseSheet(X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" })); if (res.lines.length) return { ...res, sheet: name }; } catch (e) { if (wb.SheetNames.length === 1) throw e; }
    }
    throw new Error("ไม่พบรายการในไฟล์ (ต้องมีหัวตาราง Part description และอย่างน้อย 1 แถว)");
  }
  function openImport(p, done) {
    const m = document.createElement("div"); m.className = "sp-modal"; m.id = "spImport"; document.body.appendChild(m);
    let res = null;
    const draw = (msg = "") => {
      m.innerHTML = `<div class="sp-dlg" role="dialog" aria-modal="true" aria-label="Import from template" style="width:min(640px,100%)">
        <div class="sp-dlg-h"><b>Import from template</b><span class="sp-steps"></span><button class="sp-x" data-i="close" aria-label="ปิด">✕</button></div>
        <div class="sp-dlg-b">
          <p class="sp-sub">นำเข้ารายการอะไหล่จากไฟล์ Excel (.xlsx, .xls) หรือ CSV · จาก Google Sheets ให้กด File → Download → Microsoft Excel (.xlsx) ก่อน</p>
          <p><button class="sp-btn" data-i="tpl">⬇ Download template (.xlsx)</button> <span class="sub">template มีรายการปัจจุบันของโปรเจคนี้อยู่แล้ว แก้แล้ว import กลับได้</span></p>
          <label class="sp-drop"><input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
            <b>เลือกไฟล์</b> หรือลากไฟล์มาวางที่นี่</label>
          ${msg ? `<div class="sp-note">${msg}</div>` : ""}
          ${res ? `<div class="sp-preview"><b>พบ ${res.lines.length} รายการ</b> ใน ${[...new Set(res.lines.map(l => l.zone))].length} โซน (sheet "${esc(res.sheet)}")${res.skipped ? ` · ข้าม ${res.skipped} แถว (หัวโซน/ยอดรวม/หมายเหตุ)` : ""}
            <ul class="sp-scope">${[...new Set(res.lines.map(l => l.zone))].map(z => `<li>${esc(z)} – ${res.lines.filter(l => l.zone === z).length} รายการ</li>`).join("")}</ul></div>` : ""}
        </div>
        <div class="sp-dlg-f">${res ? `<button class="sp-btn" data-i="append">เพิ่มต่อท้ายรายการเดิม</button><button class="sp-btn primary" data-i="replace">แทนที่รายการเดิมทั้งหมด (${(p.lines || []).length})</button>` : `<button class="sp-btn" data-i="close">ยกเลิก</button>`}</div></div>`;
      const fi = m.querySelector("input[type=file]"), drop = m.querySelector(".sp-drop");
      const take = async f => { if (!f) return; draw("กำลังอ่าน " + esc(f.name) + " …"); try { res = await readFile(f); draw(); } catch (e) { res = null; draw("⚠️ " + esc(e.message || e)); } };
      fi.onchange = () => take(fi.files[0]);
      drop.ondragover = e => { e.preventDefault(); drop.classList.add("on"); }; drop.ondragleave = () => drop.classList.remove("on");
      drop.ondrop = e => { e.preventDefault(); take(e.dataTransfer.files[0]); };
      m.querySelectorAll("[data-i]").forEach(b => b.onclick = async () => {
        const a = b.dataset.i;
        if (a === "close") return m.remove();
        if (a === "tpl") { try { await downloadTemplate(p); } catch (e) { draw("⚠️ " + esc(e.message || e)); } return; }
        if (a === "replace" && (p.lines || []).length && !confirm(`แทนที่ ${p.lines.length} รายการเดิมด้วย ${res.lines.length} รายการจากไฟล์?`)) return;
        p.lines = a === "replace" ? res.lines : [...(p.lines || []), ...res.lines];
        m.remove(); done(res.lines.length, a);
      });
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    draw();
  }

  function exportCsv(p) { // customer copy: no Remarks column, only lines that have a Unit price
    migrate(p);
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = COLS.filter(c => c !== "Remarks"), pad = n => Array(n).fill("");
    const priced = l => String(l.unitPrice ?? "").trim() !== "" && num(l.unitPrice) > 0;
    if (!p.lines.some(priced)) { alert("ยังไม่มีรายการที่ใส่ Unit price · Export for customer ส่งออกเฉพาะรายการที่มีราคา"); return; }
    const out = [["Recommended Spare Part List"], ["Customer", p.customer], ["Project", p.name], ["Job No.", p.jo], ["QO / PO", (p.qo || "") + " / " + (p.po || "")], [], cols];
    let no = 0, grand = 0;
    zonesOf(p).forEach(z => {
      const rows = p.lines.filter(l => l.zone === z && priced(l)); if (!rows.length) return;
      out.push([z]); let sub = 0;
      rows.forEach(l => { const a = amountOf(l); sub += a; out.push([++no, [l.equip, l.tag].filter(Boolean).join(" / "), l.part, l.partNo, l.maker, l.spec, l.installed, l.qty, l.unit, l.prio, l.leadWeeks, num(l.unitPrice), a]); });
      grand += sub; out.push([...pad(11), "Subtotal " + z, sub]);
    });
    out.push([], [...pad(11), "Total (excl. VAT)", grand]);
    const csv = "\ufeff" + out.map(r => r.map(q).join(",")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `SparePart_${p.jo}_${(p.customerShort || "").replace(/\W+/g, "")}_customer.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
.sp-edit{overflow-x:auto}.sp-edit table{table-layout:fixed;width:1806px}.sp-edit th{white-space:normal;vertical-align:bottom;line-height:1.3;padding:8px 6px}.sp-edit .c{text-align:center;color:var(--muted)}.sp-edit .r,.sp-edit .r input{text-align:right}.sp-edit td.amt{font-variant-numeric:tabular-nums;white-space:nowrap;padding-right:10px}.sp-edit .tag{font-size:12px;color:var(--muted)}.sp-edit td.act{white-space:nowrap}.sp-move{font:inherit;font-size:12px;border:1px solid var(--line);border-radius:6px;background:#fff;width:40px;padding:3px 2px}
.sp-zone td{background:var(--blush);padding:8px 10px!important;position:sticky;left:0}.sp-zone-in{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sp-zname{font:inherit;font-weight:600;color:var(--rak);border:1px solid transparent;background:transparent;border-radius:6px;padding:4px 6px;min-width:320px}.sp-zname:hover,.sp-zname:focus{border-color:var(--blush-2);background:#fff}.sp-ztot{font-weight:600;font-size:13px}.sp-btn.sm{font-size:12px;padding:4px 10px}.sp-edit tfoot td{padding:10px 8px;border-top:2px solid var(--line)}.sp-edit td{padding:4px 4px;vertical-align:top}.sp-cell{font:inherit;font-size:13px;line-height:1.4;width:100%;min-width:0;box-sizing:border-box;border:1px solid transparent;border-radius:6px;padding:5px 6px;background:transparent;color:var(--ink)}
.sp-cell:hover{border-color:var(--line);background:#fff}textarea.sp-wrap{resize:none;overflow:hidden;display:block;white-space:pre-wrap;word-break:break-word}.sp-edit td.c,.sp-edit td.amt{padding-top:10px}.sp-edit td.n .sp-cell{text-align:center}
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
