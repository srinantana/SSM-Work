/* SSM Work · Punch List module — trial, open to Dew only for now (13 Nov 2026).
   Routes (inside the hub): #punch-list          → overview of every punch list (search Job no. / customer / project) + "สร้าง Punch list"
                            #punch-list/<id>     → one project's punch list: summary, filters, line-by-line items, photos, export
   Data:  /api/punch-list/jobs      – projects from RAK_Master_Project_on_hand (same reader as Manpower / Spare Part)
          /api/punch-list/people    – names for "ผู้รับผิดชอบ" from RAK_Employee
          /api/punch-list/projects, /items, /photo – Supabase tables punch_list_projects / punch_list_items and Storage bucket
                                       punch-photos (database/punch_list.sql), all through the middleware (service key).
          Without the API (or before punch_list.sql is run) everything is kept in this browser only — "โหมดทดลอง" —
          so the screens can still be tried; nothing is shared with other people in that mode. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const API = "/api/punch-list/";
  const LS = "ssm.punch-list.v1";
  const norm = s => String(s ?? "").toLowerCase().replace(/[\s\-_.,()#/]+/g, "");
  const jobKey = v => String(v ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  /* ---------- the punch list format (agreed with Dew, 13 Nov 2026) ---------- */
  const STATUS = [
    { id: "open",  label: "Open",  th: "ยังไม่แก้" },
    { id: "wip",   label: "WIP",   th: "กำลังแก้ไข" },
    { id: "check", label: "Check", th: "แก้แล้ว รอตรวจ / รอลูกค้ายืนยัน" },
    { id: "done",  label: "Done",  th: "ปิดแล้ว" },
  ];
  // ที่มาของปัญหา = the process the item came from. Internal processes (ncr: true) are the ones to follow up with an NCR.
  const PROCESS = [
    { id: "design",     th: "ออกแบบ",                en: "Design / Engineering",     ncr: true },
    { id: "purchase",   th: "จัดซื้อ / Supplier",     en: "Purchasing / Supplier",    ncr: true },
    { id: "fab",        th: "ผลิต",                  en: "Fabrication",              ncr: true },
    { id: "assembly",   th: "ประกอบ",                en: "Assembly",                 ncr: true },
    { id: "install",    th: "ติดตั้ง",                en: "Installation",             ncr: true },
    { id: "commission", th: "ทดสอบ / Commissioning", en: "Testing / Commissioning",  ncr: true },
    { id: "customer",   th: "ลูกค้าขอเพิ่ม",           en: "Customer request",         ncr: false },
    { id: "other",      th: "อื่นๆ",                  en: "Other",                    ncr: false },
  ];
  const DISC = ["Mechanical", "Piping PP / PVDF", "Duct / Exhaust", "Electrical", "Control / Program", "Safety", "Utility", "Label / Document", "Other"];
  const SEV = [
    { id: "A", th: "A · ต้องแก้ก่อน SAT / ความปลอดภัย" },
    { id: "B", th: "B · ต้องแก้ก่อนส่งมอบ" },
    { id: "C", th: "C · เล็กน้อย แก้หลังส่งมอบได้" },
  ];
  const TEAMS = ["Quality Assurance RAK", "Electrical Engineering", "Mechanical Engineering", "Production", "Purchasing", "Site team RAK", "Customer"];
  const stOf = id => STATUS.find(s => s.id === id) || STATUS[0];
  const prOf = id => PROCESS.find(p => p.id === id);
  const isLate = it => it.status !== "done" && it.due_date && it.due_date < todayIso();

  let MODE = null, ROOT = null, PROJECTS = [], STATS = [], JOBS = null, PEOPLE = null, Q = "";
  let CUR = null, ITEMS = [], F = { q: "", status: "", process: "", sev: "", who: "", late: false };
  let QA = { process: "install", assignee: "", due: "" }; // quick-add keeps the last choices for the next line

  /* ---------- storage: server (Supabase via middleware) or this browser ---------- */
  const L = {
    read() { try { return JSON.parse(localStorage.getItem(LS)) || { projects: [], items: [], seq: 1 }; } catch { return { projects: [], items: [], seq: 1 }; } },
    write(d) { try { localStorage.setItem(LS, JSON.stringify(d)); return true; } catch { return false; } },
  };
  async function api(path, opt = {}) {
    const headers = { ...(opt.headers || {}) };
    if (typeof opt.body === "string") headers["content-type"] = "application/json";
    const r = await fetch(API + path, { cache: "no-store", ...opt, headers });
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok) { const e = new Error((d && d.error) || "HTTP " + r.status); e.status = r.status; throw e; }
    return d;
  }
  const local = () => MODE !== "server";
  const me = () => (window.SSM_ME && (window.SSM_ME.username || window.SSM_ME.email)) || "me";
  async function detect() {
    if (MODE) return;
    try { await api("projects"); MODE = "server"; }
    catch (e) { MODE = e.status === 503 ? "local-db" : "local"; if (window.PUNCH_DEMO && !L.read().projects.length) L.write(window.PUNCH_DEMO()); }
  }
  async function loadProjects() {
    if (!local()) { const d = await api("projects"); PROJECTS = d.projects || []; STATS = d.stats || []; return; }
    const d = L.read(); PROJECTS = d.projects; STATS = d.items.map(i => ({ project_id: i.project_id, status: i.status, due_date: i.due_date, severity: i.severity, ncr: i.ncr }));
  }
  async function loadJobs() {
    if (JOBS) return JOBS;
    try { const d = await api("jobs"); JOBS = d.jobs || []; } catch { JOBS = window.PUNCH_DEMO_JOBS || []; }
    return JOBS;
  }
  async function loadPeople() {
    if (PEOPLE) return PEOPLE;
    try { const d = await api("people"); PEOPLE = d.people || []; } catch { PEOPLE = window.PUNCH_DEMO_PEOPLE || []; }
    return PEOPLE;
  }
  async function saveProject(p) {
    if (!local()) return api("projects", { method: "POST", body: JSON.stringify(p) });
    const d = L.read(), now = new Date().toISOString();
    p.id = p.id || "pl-" + (jobKey(p.job_no) || Date.now().toString(36));
    const i = d.projects.findIndex(x => x.id === p.id);
    const row = { status: "active", note: "", site: "", created_by: me(), created_at: now, ...(i >= 0 ? d.projects[i] : {}), ...p, updated_by: me(), updated_at: now };
    if (i >= 0) d.projects[i] = row; else d.projects.unshift(row);
    if (!L.write(d)) throw new Error("พื้นที่เก็บในเบราว์เซอร์เต็ม");
    return row;
  }
  async function deleteProject(p) {
    if (!local()) return api("project-delete", { method: "POST", body: JSON.stringify({ id: p.id }) });
    const d = L.read(); d.projects = d.projects.filter(x => x.id !== p.id); d.items = d.items.filter(x => x.project_id !== p.id); L.write(d);
  }
  async function loadItems(pid) {
    if (!local()) { const d = await api("items?project=" + encodeURIComponent(pid)); return d.items || []; }
    return L.read().items.filter(x => x.project_id === pid).sort((a, b) => a.no - b.no);
  }
  async function saveItem(it) {
    if (!local()) { const d = await api("items", { method: "POST", body: JSON.stringify(it) }); return d.item; }
    const d = L.read(), now = new Date().toISOString();
    if (!it.id) { it.id = d.seq++; it.created_by = me(); it.created_at = now; }
    const row = { ...it, updated_by: me(), updated_at: now };
    const i = d.items.findIndex(x => x.id === it.id);
    if (i >= 0) d.items[i] = row; else d.items.push(row);
    const p = d.projects.find(x => x.id === it.project_id); if (p) p.updated_at = now;
    if (!L.write(d)) throw new Error("พื้นที่เก็บในเบราว์เซอร์เต็ม (รูปถ่ายในโหมดทดลองเก็บได้จำกัด) — ลบรูปบางรูปแล้วลองใหม่");
    return row;
  }
  async function deleteItem(it) {
    if (!local()) return api("items-delete", { method: "POST", body: JSON.stringify({ id: it.id }) });
    const d = L.read(); d.items = d.items.filter(x => x.id !== it.id); L.write(d);
  }
  // Photos are shrunk in the browser before upload (long side 1600 px on the server, 900 px in the trial mode).
  function shrink(file, max, q) {
    return new Promise((ok, no) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(b => b ? ok({ blob: b, data: c.toDataURL("image/jpeg", q) }) : no(new Error("อ่านรูปไม่สำเร็จ")), "image/jpeg", q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error("ไฟล์นี้ไม่ใช่รูปภาพที่เปิดได้")); };
      img.src = url;
    });
  }
  async function uploadPhoto(pid, file) {
    const at = new Date().toISOString();
    if (local()) { const s = await shrink(file, 900, 0.6); return { p: s.data, at, by: me() }; }
    const s = await shrink(file, 1600, 0.78);
    const d = await api("photo?project=" + encodeURIComponent(pid), { method: "POST", body: s.blob, headers: { "content-type": "image/jpeg" } });
    return { p: d.path, at, by: me() };
  }
  const photoSrc = ph => String(ph.p).startsWith("data:") ? ph.p : API + "photo?p=" + encodeURIComponent(ph.p);

  /* ---------- small view helpers ---------- */
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = iso => { if (!iso) return ""; const [y, m, d] = String(iso).slice(0, 10).split("-"); return `${+d} ${MON[+m - 1]} ${y.slice(2)}`; };
  const stBadge = id => { const s = stOf(id); return `<span class="pl-st st-${s.id}" title="${esc(s.th)}">${s.label}</span>`; };
  const sevBadge = id => id ? `<span class="pl-sev sev-${esc(id)}" title="${esc((SEV.find(s => s.id === id) || {}).th || "")}">${esc(id)}</span>` : "";
  const prChip = id => { const p = prOf(id); return p ? `<span class="pl-pr" title="${esc(p.en)}">${esc(p.th)}</span>` : `<span class="sub">—</span>`; };
  function count(list) {
    const c = { total: list.length, open: 0, wip: 0, check: 0, done: 0, late: 0, a: 0, ncr: 0 };
    list.forEach(i => { c[i.status in c ? i.status : "open"]++; if (isLate(i)) c.late++; if (i.severity === "A" && i.status !== "done") c.a++; if (i.ncr) c.ncr++; });
    c.pct = c.total ? Math.round(c.done / c.total * 100) : 0;
    return c;
  }
  const modeNote = () => MODE === "server" ? "" : `<div class="pl-note">🧪 <b>โหมดทดลอง</b> — ${MODE === "local-db" ? "ยังไม่ได้สร้างตารางในฐานข้อมูล (รัน <code>database/punch_list.sql</code> ใน Supabase)" : "ยังไม่ได้เชื่อมฐานข้อมูล"} ข้อมูลและรูปถ่ายเก็บไว้ในเบราว์เซอร์นี้เท่านั้น คนอื่นยังมองไม่เห็น · ทดลองเพิ่ม / แก้ / export ได้เต็มที่</div>`;
  function kpis(c, withProjects) {
    const k = (n, l, cls = "") => `<div class="pl-kpi ${cls}"><b>${n}</b><span>${l}</span></div>`;
    return `<div class="pl-kpis">${withProjects != null ? k(withProjects, "Punch list") : ""}${k(c.total, "รายการทั้งหมด")}${k(c.open, "Open", "k-open")}${k(c.wip, "WIP", "k-wip")}${k(c.check, "Check", "k-check")}${k(c.done, "Done", "k-done")}${k(c.late, "เลยกำหนด", c.late ? "k-late" : "")}${k(c.a, "ค้าง A (ก่อน SAT)", c.a ? "k-late" : "")}</div>`;
  }
  const bar = c => `<div class="pl-bar-p" title="ปิดแล้ว ${c.done}/${c.total}"><i class="b-done" style="width:${c.total ? c.done / c.total * 100 : 0}%"></i><i class="b-check" style="width:${c.total ? c.check / c.total * 100 : 0}%"></i><i class="b-wip" style="width:${c.total ? c.wip / c.total * 100 : 0}%"></i></div>`;
  function toast(t, err) {
    let el = document.getElementById("plToast");
    if (!el) { el = document.createElement("div"); el.id = "plToast"; document.body.appendChild(el); }
    el.className = err ? "err" : ""; el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, err ? 6000 : 2200);
  }
  function modal(html, width = 760) {
    const m = document.createElement("div"); m.className = "pl-modal";
    m.innerHTML = `<div class="pl-dlg" role="dialog" aria-modal="true" style="width:min(${width}px,100%)">${html}</div>`;
    document.body.appendChild(m);
    const close = () => { m.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    m.addEventListener("mousedown", e => { if (e.target === m) close(); });
    m.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
    return { el: m, close };
  }
  function peopleList() {
    let dl = document.getElementById("plPeople");
    if (!dl) { dl = document.createElement("datalist"); dl.id = "plPeople"; document.body.appendChild(dl); }
    const seen = new Set(), opts = [];
    const add = (v, label) => { const k = v.toLowerCase(); if (!v || seen.has(k)) return; seen.add(k); opts.push(`<option value="${esc(v)}" label="${esc(label || "")}">`); };
    TEAMS.forEach(t => add(t, "ทีม / หน่วยงาน"));
    (PEOPLE || []).forEach(p => add(p.name, [p.th, p.nick && "(" + p.nick + ")"].filter(Boolean).join(" ")));
    ITEMS.forEach(i => add(i.assignee, "ใช้ในโปรเจคนี้"));
    dl.innerHTML = opts.join("");
  }

  /* ---------- page 1: every punch list ---------- */
  function pageList() {
    const byP = new Map();
    STATS.forEach(s => { if (!byP.has(s.project_id)) byP.set(s.project_id, []); byP.get(s.project_id).push(s); });
    const list = PROJECTS.filter(p => !Q || norm([p.job_no, p.customer, p.name, p.site].join(" ")).includes(norm(Q)));
    const all = count(STATS);
    const cards = list.map(p => {
      const c = count(byP.get(p.id) || []);
      return `<a class="pl-card" href="#punch-list/${encodeURIComponent(p.id)}">
        <div class="pl-card-h"><span class="pl-jo">JOB ${esc(p.job_no || "—")}</span>${p.status === "closed" ? `<span class="pl-st st-done">ปิดโปรเจค</span>` : ""}${c.late ? `<span class="pl-late">เลยกำหนด ${c.late}</span>` : ""}</div>
        <b class="pl-cust">${esc(p.customer || "—")}</b><span class="pl-name">${esc(p.name || "")}</span>
        ${bar(c)}
        <div class="pl-cnt"><span>ทั้งหมด <b>${c.total}</b></span><span class="t-open">Open <b>${c.open}</b></span><span class="t-wip">WIP <b>${c.wip}</b></span><span class="t-check">Check <b>${c.check}</b></span><span class="t-done">Done <b>${c.done}</b></span><span class="pl-pct">${c.pct}%</span></div>
        <span class="sub">อัปเดต ${esc(fmt(p.updated_at))}${p.updated_by ? " · " + esc(p.updated_by) : ""}</span></a>`;
    }).join("");
    ROOT.innerHTML = `${modeNote()}
      <div class="pl-top"><input class="pl-in" id="plQ" type="search" placeholder="🔍 ค้นหา Job no. / ลูกค้า / ชื่อโปรเจค" value="${esc(Q)}"><button class="pl-btn primary" data-a="new">＋ สร้าง Punch list</button></div>
      ${kpis(all, PROJECTS.length)}
      <div class="pl-cards">${cards || `<div class="empty">${Q ? `ไม่พบโปรเจคที่ตรงกับ “${esc(Q)}”` : "ยังไม่มี Punch list · กด ＋ สร้าง Punch list แล้วเลือกโปรเจคจาก Master project on hand"}</div>`}</div>`;
    const q = ROOT.querySelector("#plQ");
    q.oninput = () => { Q = q.value; const pos = q.selectionStart; pageList(); const n = ROOT.querySelector("#plQ"); n.focus(); n.setSelectionRange(pos, pos); };
    ROOT.querySelector('[data-a="new"]').onclick = openNew;
  }

  async function openNew() {
    const dlg = modal(`<div class="pl-dlg-h"><b>สร้าง Punch list</b><span class="sub">เลือกโปรเจคจาก Master project on hand</span><button class="pl-x" data-close aria-label="ปิด">✕</button></div>
      <div class="pl-dlg-b"><input class="pl-in" id="nq" type="search" placeholder="ค้นหา Job no. / ลูกค้า / ชื่องาน" autofocus><div class="pl-jobs" id="nl"><div class="sub">กำลังโหลดรายชื่อโปรเจค…</div></div>
        <details class="pl-manual"><summary>ไม่พบโปรเจค? กรอกเอง</summary><div class="pl-form">
          <label>Job no.<input class="pl-in" name="job_no" placeholder="เช่น 02702026"></label>
          <label>ลูกค้า<input class="pl-in" name="customer" data-customer></label>
          <label class="wide">ชื่อโปรเจค<input class="pl-in" name="name"></label>
          <label class="wide">สถานที่ / Site<input class="pl-in" name="site"></label>
          <div class="wide"><button class="pl-btn primary" data-a="manual">สร้าง</button></div></div></details></div>`, 760);
    const el = dlg.el, jobs = await loadJobs();
    const made = new Set(PROJECTS.map(p => jobKey(p.job_no)).filter(Boolean));
    const draw = () => {
      const q = norm(el.querySelector("#nq").value);
      const hit = jobs.filter(j => !q || norm([j.job_no, j.customer, j.customer_full, j.job_name, j.job_full].join(" ")).includes(q)).slice(0, 60);
      el.querySelector("#nl").innerHTML = hit.map((j, i) => `<button class="pl-job" data-i="${jobs.indexOf(j)}" ${made.has(jobKey(j.job_no)) ? "disabled" : ""}>
        <span><span class="pl-jo">JOB ${esc(j.job_no)}</span> <b>${esc(j.customer)}</b>${made.has(jobKey(j.job_no)) ? ` <span class="pl-st st-done">มี Punch list แล้ว</span>` : ""}</span><span>${esc(j.job_full || j.job_name)}</span></button>`).join("")
        || `<div class="sub">${jobs.length ? "ไม่พบโปรเจค — ลองคำค้นอื่น หรือกรอกเองด้านล่าง" : "อ่านตาราง RAK_Master_Project_on_hand ไม่ได้ — กรอกเองด้านล่าง"}</div>`;
    };
    draw();
    el.querySelector("#nq").oninput = draw;
    const create = async p => {
      try { const saved = await saveProject(p); dlg.close(); location.hash = "#punch-list/" + encodeURIComponent(saved.id); }
      catch (e) { toast("สร้างไม่สำเร็จ: " + e.message, 1); }
    };
    el.querySelector("#nl").onclick = e => {
      const b = e.target.closest("[data-i]"); if (!b || b.disabled) return;
      const j = jobs[+b.dataset.i];
      create({ job_no: j.job_no, customer: j.customer, name: j.job_full || j.job_name });
    };
    el.querySelector('[data-a="manual"]').onclick = () => {
      const v = n => el.querySelector(`[name="${n}"]`).value.trim();
      if (!v("job_no") && !v("name")) return toast("ใส่ Job no. หรือชื่อโปรเจค", 1);
      if (v("job_no") && made.has(jobKey(v("job_no")))) return toast("Job no. นี้มี Punch list แล้ว", 1);
      create({ job_no: v("job_no"), customer: v("customer"), name: v("name"), site: v("site") });
    };
  }

  /* ---------- page 2: one project's punch list ---------- */
  function filtered() {
    const q = norm(F.q);
    return ITEMS.filter(i => (!F.status || (F.status === "notdone" ? i.status !== "done" : i.status === F.status))
      && (!F.process || i.process === F.process) && (!F.sev || i.severity === F.sev) && (!F.who || i.assignee === F.who)
      && (!F.late || isLate(i)) && (!q || norm([i.no, i.details, i.remark, i.note, i.assignee, i.discipline, i.ncr_no, i.cause].join(" ")).includes(q)));
  }
  function breakdown() {
    const rows = PROCESS.map(p => { const l = ITEMS.filter(i => i.process === p.id); return { p, n: l.length, left: l.filter(i => i.status !== "done").length, ncr: l.filter(i => i.ncr).length }; }).filter(r => r.n);
    const none = ITEMS.filter(i => !prOf(i.process)).length;
    const max = Math.max(1, ...rows.map(r => r.n));
    return `<div class="pl-break"><div class="pl-break-h"><b>แยกตามที่มาของปัญหา</b><span class="sub">ใช้ต่อยอดติดตาม NCR · กดเพื่อกรอง</span></div>
      ${rows.map(r => `<button class="pl-brow ${F.process === r.p.id ? "on" : ""}" data-pr="${r.p.id}"><span>${esc(r.p.th)}${r.p.ncr ? "" : ` <i class="sub">(ไม่ใช่ NCR)</i>`}</span><span class="pl-btrack"><i style="width:${r.n / max * 100}%"></i></span><span class="pl-bnum"><b>${r.n}</b> · ค้าง ${r.left}${r.ncr ? ` · NCR ${r.ncr}` : ""}</span></button>`).join("")}
      ${none ? `<div class="pl-brow"><span class="sub">ยังไม่ระบุที่มา</span><span></span><span class="pl-bnum"><b>${none}</b></span></div>` : ""}
      ${rows.length || none ? "" : `<div class="sub">ยังไม่มีรายการ</div>`}</div>`;
  }
  function rowHtml(i) {
    const nB = (i.photos_before || []).length, nA = (i.photos_after || []).length;
    const th = (list, cls) => list.slice(0, 2).map(ph => `<img class="pl-th ${cls}" src="${esc(photoSrc(ph))}" alt="" loading="lazy">`).join("");
    return `<tr data-id="${i.id}" class="${i.status === "done" ? "is-done" : ""} ${isLate(i) ? "is-late" : ""}">
      <td class="c n">${i.no}</td>
      <td class="d"><div class="pl-det">${esc(i.details) || `<span class="sub">(ยังไม่ใส่รายละเอียด)</span>`}</div>
        <div class="pl-meta">${sevBadge(i.severity)}${i.discipline ? `<span class="pl-disc">${esc(i.discipline)}</span>` : ""}${i.ncr ? `<span class="pl-ncr" title="ต้องออก NCR">NCR${i.ncr_no ? " " + esc(i.ncr_no) : ""}</span>` : ""}</div>
        ${i.remark ? `<div class="pl-remark" title="Remark — แสดงในรายงานลูกค้า">💬 ${esc(i.remark)}</div>` : ""}
        ${i.note ? `<div class="pl-notep" title="Note ภายใน — ไม่ส่งลูกค้า">🔒 ${esc(i.note)}</div>` : ""}</td>
      <td>${prChip(i.process)}</td>
      <td>${esc(i.assignee) || `<span class="sub">—</span>`}</td>
      <td class="c nowrap ${isLate(i) ? "late" : ""}">${esc(fmt(i.due_date)) || `<span class="sub">—</span>`}${isLate(i) ? `<div class="pl-latec">เลยกำหนด</div>` : ""}</td>
      <td class="c"><select class="pl-ss st-${esc(i.status)}" data-st aria-label="สถานะ">${STATUS.map(s => `<option value="${s.id}" ${s.id === i.status ? "selected" : ""}>${s.label}</option>`).join("")}</select></td>
      <td class="c nowrap">${esc(fmt(i.finished_date)) || `<span class="sub">—</span>`}</td>
      <td class="ph"><div class="pl-phs"><span class="pl-phg" title="ก่อนแก้ ${nB} รูป">${th(i.photos_before || [], "b")}${nB > 2 ? `<i>+${nB - 2}</i>` : ""}${nB ? "" : `<i class="none">ก่อน</i>`}</span><span class="pl-phg" title="หลังแก้ ${nA} รูป">${th(i.photos_after || [], "a")}${nA > 2 ? `<i>+${nA - 2}</i>` : ""}${nA ? "" : `<i class="none">หลัง</i>`}</span></div></td>
    </tr>`;
  }
  function pageProject() {
    const p = CUR, c = count(ITEMS), list = filtered();
    const whos = [...new Set(ITEMS.map(i => i.assignee).filter(Boolean))].sort();
    const opt = (arr, cur) => arr.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`).join("");
    const isAdm = local() || (window.SSM_ME && window.SSM_ME.role === "admin");
    ROOT.innerHTML = `${modeNote()}
      <div class="pl-head"><div><a class="pl-back" href="#punch-list">‹ Punch list ทั้งหมด</a>
        <div class="pl-eyebrow">PUNCH LIST REPORT · <span class="pl-jo">JOB ${esc(p.job_no || "—")}</span>${p.status === "closed" ? ` <span class="pl-st st-done">ปิดโปรเจค</span>` : ""}</div>
        <h2>${esc(p.name || "—")}</h2><div class="sub">ลูกค้า <b>${esc(p.customer || "—")}</b>${p.site ? " · " + esc(p.site) : ""}${p.note ? " · " + esc(p.note) : ""}</div></div>
        <div class="pl-actions">
          <button class="pl-btn" data-a="report" title="รายงานพร้อมรูปก่อน / หลัง สำหรับส่งลูกค้า → บันทึกเป็น PDF">🖨 รายงานลูกค้า (PDF)</button>
          <button class="pl-btn" data-a="xc" title="Excel สำหรับส่งลูกค้า — มี Remark ไม่มีข้อมูลภายใน (ผู้รับผิดชอบ / Note / ที่มา / NCR)">⬇ Excel ลูกค้า</button>
          <button class="pl-btn" data-a="xi" title="Excel ภายใน — มีที่มา หมวดงาน ระดับ NCR และสรุปตามกระบวนการ">⬇ Excel ภายใน + NCR</button>
          <button class="pl-btn" data-a="imp" title="นำเข้ารายการจากไฟล์ Punch list เดิม (.xlsx)">⬆ Import</button>
          <button class="pl-btn" data-a="edit">✎ โปรเจค</button>${isAdm ? `<button class="pl-btn ghost" data-a="del">ลบ</button>` : ""}
        </div></div>
      ${kpis(c)}
      <div class="pl-grid2"><div class="pl-prog"><div class="pl-prog-h"><b>ความคืบหน้า</b><span class="pl-pct big">${c.pct}%</span></div>${bar(c)}
        <div class="pl-legend"><span class="t-done">■ Done ${c.done}</span><span class="t-check">■ Check ${c.check}</span><span class="t-wip">■ WIP ${c.wip}</span><span class="t-open">■ Open ${c.open}</span></div>
        <div class="sub" style="margin-top:8px">ค้างระดับ A (ต้องแก้ก่อน SAT) <b>${c.a}</b> · ติด NCR <b>${c.ncr}</b> รายการ</div></div>${breakdown()}</div>
      <div class="pl-filters">
        <input class="pl-in" data-f="q" type="search" placeholder="🔍 ค้นหารายการ / หมายเหตุ / NCR no." value="${esc(F.q)}">
        <select class="pl-in" data-f="status"><option value="">ทุกสถานะ</option>${opt([["notdone", "ยังไม่ปิด (Open+WIP+Check)"], ...STATUS.map(s => [s.id, s.label + " · " + s.th])], F.status)}</select>
        <select class="pl-in" data-f="process"><option value="">ทุกที่มา</option>${opt(PROCESS.map(x => [x.id, x.th]), F.process)}</select>
        <select class="pl-in" data-f="sev"><option value="">ทุกระดับ</option>${opt(SEV.map(s => [s.id, s.th]), F.sev)}</select>
        <select class="pl-in" data-f="who"><option value="">ทุกผู้รับผิดชอบ</option>${opt(whos.map(w => [w, w]), F.who)}</select>
        <label class="pl-chk"><input type="checkbox" data-f="late" ${F.late ? "checked" : ""}> เลยกำหนด</label>
        ${F.q || F.status || F.process || F.sev || F.who || F.late ? `<button class="pl-btn sm ghost" data-a="clear">ล้างตัวกรอง</button>` : ""}
        <span class="sub" style="margin-left:auto">แสดง ${list.length} / ${ITEMS.length}</span></div>
      <div class="tbl pl-tbl"><table><thead><tr><th class="c">Item</th><th>รายละเอียด</th><th>ที่มา</th><th>ผู้รับผิดชอบ</th><th class="c">Due date</th><th class="c">Status</th><th class="c">Finished</th><th>รูป ก่อน / หลัง</th></tr></thead>
        <tbody>${list.map(rowHtml).join("") || `<tr><td colspan="8" class="sub" style="padding:18px;text-align:center">${ITEMS.length ? "ไม่มีรายการตรงกับตัวกรอง" : "ยังไม่มีรายการ · พิมพ์รายการแรกในช่องด้านล่าง แล้วกด Enter"}</td></tr>`}</tbody>
        <tfoot><tr class="pl-qa"><td class="c sub">${(Math.max(0, ...ITEMS.map(i => i.no)) || 0) + 1}</td>
          <td><input class="pl-in" id="qaD" placeholder="＋ พิมพ์รายการใหม่ แล้วกด Enter (เพิ่มได้ทีละบรรทัด)"></td>
          <td><select class="pl-in" id="qaP">${PROCESS.map(x => `<option value="${x.id}" ${x.id === QA.process ? "selected" : ""}>${esc(x.th)}</option>`).join("")}</select></td>
          <td><input class="pl-in" id="qaA" list="plPeople" placeholder="ผู้รับผิดชอบ" value="${esc(QA.assignee)}"></td>
          <td><input class="pl-in" id="qaU" type="date" value="${esc(QA.due)}"></td>
          <td colspan="3"><button class="pl-btn primary" data-a="add">เพิ่ม</button> <button class="pl-btn" data-a="full" title="เพิ่มพร้อมรายละเอียดครบ + รูป">＋ แบบละเอียด</button></td></tr></tfoot></table></div>
      <p class="sub" style="margin-top:8px">กดที่แถวเพื่อแก้ไขรายละเอียด ใส่รูปก่อน / หลัง ระดับความสำคัญ และ NCR · เปลี่ยนสถานะเป็น Done ระบบใส่ Finished date = วันนี้ให้อัตโนมัติ</p>`;
    peopleList();
    const $ = s => ROOT.querySelector(s);
    ROOT.querySelectorAll("[data-f]").forEach(inp => {
      const ev = inp.type === "search" ? "input" : "change";
      inp.addEventListener(ev, () => {
        F[inp.dataset.f] = inp.type === "checkbox" ? inp.checked : inp.value;
        const pos = inp.type === "search" ? inp.selectionStart : null;
        pageProject();
        if (pos != null) { const n = ROOT.querySelector('[data-f="q"]'); n.focus(); n.setSelectionRange(pos, pos); }
      });
    });
    ROOT.querySelectorAll("[data-pr]").forEach(b => b.onclick = () => { F.process = F.process === b.dataset.pr ? "" : b.dataset.pr; pageProject(); });
    ROOT.querySelector("tbody").addEventListener("click", e => {
      if (e.target.closest("select")) return;
      const tr = e.target.closest("tr[data-id]"); if (tr) openItem(ITEMS.find(i => String(i.id) === tr.dataset.id));
    });
    ROOT.querySelector("tbody").addEventListener("change", async e => {
      const s = e.target.closest("[data-st]"); if (!s) return;
      const it = ITEMS.find(i => String(i.id) === s.closest("tr").dataset.id);
      await commit(setStatus({ ...it }, s.value));
    });
    const add = async full => {
      const d = $("#qaD").value.trim();
      QA = { process: $("#qaP").value, assignee: $("#qaA").value.trim(), due: $("#qaU").value };
      const it = blank({ details: d, process: QA.process, assignee: QA.assignee, due_date: QA.due || null });
      if (full) return openItem(it);
      if (!d) { $("#qaD").focus(); return toast("พิมพ์รายละเอียดรายการก่อน", 1); }
      if (await commit(it)) { const n = $("#qaD"); n && n.focus(); }
    };
    $("#qaD").addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(false); } });
    const act = {
      add: () => add(false), full: () => add(true), report: openReport, xc: () => exportXlsx(true), xi: () => exportXlsx(false), imp: openImport, edit: editProject,
      clear: () => { F = { q: "", status: "", process: "", sev: "", who: "", late: false }; pageProject(); },
      del: async () => {
        if (!confirm(`ลบ Punch list ของ JOB ${p.job_no} ทั้งหมด ${ITEMS.length} รายการ (รวมรูปถ่าย)?\nลบแล้วกู้คืนไม่ได้`)) return;
        try { await deleteProject(p); location.hash = "#punch-list"; } catch (e) { toast("ลบไม่สำเร็จ: " + e.message, 1); }
      },
    };
    ROOT.querySelectorAll("[data-a]").forEach(b => { if (act[b.dataset.a]) b.onclick = act[b.dataset.a]; });
  }
  function blank(x) {
    return { project_id: CUR.id, no: (Math.max(0, ...ITEMS.map(i => i.no)) || 0) + 1, details: "", process: "install", discipline: "", severity: "B", assignee: "", due_date: null,
      status: "open", finished_date: null, remark: "", note: "", ncr: false, ncr_no: "", cause: "", photos_before: [], photos_after: [], ...x };
  }
  function setStatus(it, st) {
    it.status = st;
    if (st === "done" && !it.finished_date) it.finished_date = todayIso();
    if (st !== "done") it.finished_date = null;
    return it;
  }
  async function commit(it) {
    try {
      const saved = await saveItem(it);
      const i = ITEMS.findIndex(x => x.id === saved.id);
      if (i >= 0) ITEMS[i] = saved; else ITEMS.push(saved);
      ITEMS.sort((a, b) => a.no - b.no);
      pageProject(); toast("บันทึกแล้ว · Item " + saved.no);
      return saved;
    } catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, 1); return null; }
  }

  /* ---------- item dialog: details, cause / NCR, photos before / after ---------- */
  function openItem(src) {
    if (!src) return;
    const it = JSON.parse(JSON.stringify(src)), isNew = !it.id;
    const sel = (name, arr, cur, empty) => `<select class="pl-in" name="${name}">${empty ? `<option value="">${empty}</option>` : ""}${arr.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    const dlg = modal(`<div class="pl-dlg-h"><b>${isNew ? "เพิ่มรายการ" : "Item " + it.no}</b><span class="sub">${esc(CUR.customer)} · JOB ${esc(CUR.job_no)}</span><button class="pl-x" data-close aria-label="ปิด">✕</button></div>
      <div class="pl-dlg-b"><div class="pl-form">
        <label class="wide4">รายละเอียด (Details)<textarea class="pl-in" name="details" rows="2">${esc(it.details)}</textarea></label>
        <label>Item no.<input class="pl-in" name="no" type="number" min="1" value="${it.no}"></label>
        <label>Status${sel("status", STATUS.map(s => [s.id, s.label + " · " + s.th]), it.status)}</label>
        <label>Due date<input class="pl-in" name="due_date" type="date" value="${esc(it.due_date || "")}"></label>
        <label>Finished date<input class="pl-in" name="finished_date" type="date" value="${esc(it.finished_date || "")}"></label>
        <label class="wide">ผู้รับผิดชอบ (Assign) 🔒 ภายใน<input class="pl-in" name="assignee" list="plPeople" value="${esc(it.assignee)}" placeholder="ชื่อคน หรือทีม เช่น Quality Assurance RAK"></label>
        <label>ระดับความสำคัญ${sel("severity", SEV.map(s => [s.id, s.th]), it.severity, "— ไม่ระบุ —")}</label>
        <label>หมวดงาน${sel("discipline", DISC.map(d => [d, d]), it.discipline, "— ไม่ระบุ —")}</label>
        <fieldset class="wide4 pl-fs"><legend>ที่มาของปัญหา → ติดตาม NCR</legend><div class="pl-form">
          <label class="wide">มาจากกระบวนการ${sel("process", PROCESS.map(x => [x.id, x.th + " · " + x.en]), it.process, "— ไม่ระบุ —")}</label>
          <label class="pl-chk wide" style="align-self:end"><input type="checkbox" name="ncr" ${it.ncr ? "checked" : ""}> ต้องออก NCR</label>
          <label>NCR no.<input class="pl-in" name="ncr_no" value="${esc(it.ncr_no)}" placeholder="ถ้ามี"></label>
          <label class="wide3">สาเหตุ / Root cause (ภายใน ไม่แสดงในรายงานลูกค้า)<input class="pl-in" name="cause" value="${esc(it.cause)}" placeholder="เช่น แบบไม่ระบุ cover, ใช้ข้อต่อผิดสเปก"></label>
          <div class="wide4 sub" id="ncrHint"></div></div></fieldset>
        <label class="wide4 pl-rmk">💬 Remark — ข้อความสำคัญถึงลูกค้า (แสดงในรายงาน / Excel ลูกค้า)<textarea class="pl-in" name="remark" rows="2" placeholder="เช่น แก้ไขแล้ว รอลูกค้าตรวจรับ / ต้องหยุดไลน์ 2 ชม. วันที่ …">${esc(it.remark || "")}</textarea></label>
        <label class="wide4">🔒 Note ภายใน (ไม่ส่งลูกค้า)<textarea class="pl-in" name="note" rows="2" placeholder="รายละเอียดการแก้ไข / ข้อมูลสำหรับทีม">${esc(it.note)}</textarea></label>
        <div class="wide2 pl-phbox" data-k="photos_before"></div><div class="wide2 pl-phbox" data-k="photos_after"></div>
      </div></div>
      <div class="pl-dlg-f">${isNew ? "" : `<button class="pl-btn ghost" data-a="rm" style="margin-right:auto">ลบรายการ</button><span class="sub">${it.updated_by ? "แก้ล่าสุด " + esc(it.updated_by) + " · " + esc(fmt(it.updated_at)) : ""}</span>`}
        <button class="pl-btn" data-close>ยกเลิก</button><button class="pl-btn primary" data-a="save">บันทึก</button></div>`, 900);
    const el = dlg.el, f = n => el.querySelector(`[name="${n}"]`);
    let busy = 0;
    const hint = () => {
      const p = prOf(f("process").value);
      el.querySelector("#ncrHint").textContent = !p ? "" : p.ncr ? `ปัญหาจากกระบวนการภายใน (${p.th}) — ติ๊ก “ต้องออก NCR” ถ้าเป็นความผิดพลาดที่ต้องป้องกันการเกิดซ้ำ` : `${p.th} — ปกติไม่ต้องออก NCR`;
    };
    f("process").onchange = hint; hint();
    f("status").onchange = () => { if (f("status").value === "done" && !f("finished_date").value) f("finished_date").value = todayIso(); if (f("status").value !== "done") f("finished_date").value = ""; };
    const drawPh = () => el.querySelectorAll(".pl-phbox").forEach(box => {
      const k = box.dataset.k, list = it[k] || [];
      box.innerHTML = `<div class="pl-phh"><b>${k === "photos_before" ? "📷 รูปก่อนแก้ (Before)" : "✅ รูปหลังแก้ (After)"}</b><span class="sub">${list.length} รูป</span>
        <label class="pl-btn sm">＋ เพิ่มรูป<input type="file" accept="image/*" multiple hidden></label></div>
        <div class="pl-phl">${list.map((ph, n) => `<figure><img src="${esc(photoSrc(ph))}" alt="" data-zoom="${n}"><button class="pl-x" data-rm="${n}" title="ลบรูปนี้">✕</button></figure>`).join("") || `<div class="sub pl-drop">ยังไม่มีรูป · เลือกได้หลายรูป หรือถ่ายจากมือถือ</div>`}</div>`;
      box.querySelector("input[type=file]").onchange = async e => {
        const files = [...e.target.files]; e.target.value = "";
        if (!files.length) return;
        busy++; box.querySelector(".pl-phh .sub").textContent = `กำลังอัปโหลด ${files.length} รูป…`;
        for (const file of files) {
          try { (it[k] = it[k] || []).push(await uploadPhoto(CUR.id, file)); } catch (er) { toast("ใส่รูปไม่สำเร็จ: " + er.message, 1); }
        }
        busy--; drawPh();
      };
      box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { it[k].splice(+b.dataset.rm, 1); drawPh(); });
      box.querySelectorAll("[data-zoom]").forEach(img => img.onclick = () => zoom(list, +img.dataset.zoom));
    });
    drawPh();
    el.querySelector('[data-a="save"]').onclick = async () => {
      if (busy) return toast("รออัปโหลดรูปให้เสร็จก่อน", 1);
      ["details", "assignee", "severity", "discipline", "process", "ncr_no", "cause", "remark", "note", "status"].forEach(n => { it[n] = f(n).value.trim(); });
      it.no = Math.max(1, parseInt(f("no").value, 10) || it.no);
      it.due_date = f("due_date").value || null; it.finished_date = f("finished_date").value || null; it.ncr = f("ncr").checked;
      if (!it.details) return toast("ใส่รายละเอียดรายการ", 1);
      if (await commit(it)) dlg.close();
    };
    const rm = el.querySelector('[data-a="rm"]');
    if (rm) rm.onclick = async () => {
      if (!confirm(`ลบ Item ${it.no} “${it.details.slice(0, 60)}” ?`)) return;
      try { await deleteItem(it); ITEMS = ITEMS.filter(x => x.id !== it.id); dlg.close(); pageProject(); toast("ลบแล้ว"); } catch (e) { toast("ลบไม่สำเร็จ: " + e.message, 1); }
    };
  }
  function zoom(list, n) {
    const z = modal(`<div class="pl-zoom"><img src="${esc(photoSrc(list[n]))}" alt=""><div class="pl-dlg-f"><span class="sub" style="margin-right:auto">${n + 1} / ${list.length}${list[n].by ? " · " + esc(list[n].by) : ""}${list[n].at ? " · " + esc(fmt(list[n].at)) : ""}</span>
      ${list.length > 1 ? `<button class="pl-btn" data-z="-1">‹</button><button class="pl-btn" data-z="1">›</button>` : ""}<button class="pl-btn" data-close>ปิด</button></div></div>`, 1100);
    z.el.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { z.close(); zoom(list, (n + +b.dataset.z + list.length) % list.length); });
  }

  function editProject() {
    const p = CUR;
    const dlg = modal(`<div class="pl-dlg-h"><b>ข้อมูลโปรเจค</b><button class="pl-x" data-close aria-label="ปิด">✕</button></div>
      <div class="pl-dlg-b"><div class="pl-form">
        <label>Job no.<input class="pl-in" name="job_no" value="${esc(p.job_no)}" disabled></label>
        <label>ลูกค้า<input class="pl-in" name="customer" data-customer value="${esc(p.customer)}"></label>
        <label class="wide">ชื่อโปรเจค<input class="pl-in" name="name" value="${esc(p.name)}"></label>
        <label class="wide">สถานที่ / Site<input class="pl-in" name="site" value="${esc(p.site || "")}"></label>
        <label>สถานะโปรเจค<select class="pl-in" name="status"><option value="active" ${p.status !== "closed" ? "selected" : ""}>กำลังดำเนินการ</option><option value="closed" ${p.status === "closed" ? "selected" : ""}>ปิดโปรเจคแล้ว</option></select></label>
        <label class="wide4">หมายเหตุโปรเจค<input class="pl-in" name="note" value="${esc(p.note || "")}" placeholder="เช่น SAT 30-Oct-2026"></label></div></div>
      <div class="pl-dlg-f"><button class="pl-btn" data-close>ยกเลิก</button><button class="pl-btn primary" data-a="save">บันทึก</button></div>`, 720);
    dlg.el.querySelector('[data-a="save"]').onclick = async () => {
      const v = n => dlg.el.querySelector(`[name="${n}"]`).value.trim();
      try { CUR = await saveProject({ ...p, customer: v("customer"), name: v("name"), site: v("site"), status: v("status"), note: v("note") }); dlg.close(); pageProject(); toast("บันทึกแล้ว"); }
      catch (e) { toast("บันทึกไม่สำเร็จ: " + e.message, 1); }
    };
  }

  /* ---------- export: Excel (customer / internal) and printable customer report ---------- */
  const XLSX_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
  let xlsxP = null;
  const loadXLSX = () => xlsxP || (xlsxP = new Promise((ok, no) => {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement("script"); s.src = XLSX_SRC; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous";
    s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; no(new Error("โหลดตัวสร้าง Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  }));
  const fileBase = () => `PunchList_${jobKey(CUR.job_no) || "job"}_${String(CUR.customer || "").replace(/[^\w]+/g, "")}_${todayIso().replace(/-/g, "")}`;
  async function exportXlsx(customer) {
    let X; try { X = await loadXLSX(); } catch (e) { return toast(e.message, 1); }
    const c = count(ITEMS), p = CUR;
    const head = customer
      ? ["Item", "Details", "Due date", "Status", "Finished date", "Remark", "Photo before", "Photo after"]
      : ["Item", "Details", "Assign", "Due date", "Status", "Finished date", "Remark (customer)", "Note (internal)", "Process (ที่มา)", "Discipline", "Severity", "NCR", "NCR no.", "Root cause", "Photo before", "Photo after", "Updated by", "Updated"];
    const row = i => {
      const ph = [(i.photos_before || []).length || "", (i.photos_after || []).length || ""];
      if (customer) return [i.no, i.details, fmt(i.due_date), stOf(i.status).label, fmt(i.finished_date), i.remark || "", ...ph];
      return [i.no, i.details, i.assignee, fmt(i.due_date), stOf(i.status).label, fmt(i.finished_date), i.remark || "", i.note, (prOf(i.process) || {}).en || "", i.discipline, i.severity, i.ncr ? "Yes" : "", i.ncr_no, i.cause, ...ph, i.updated_by || "", fmt(i.updated_at)];
    };
    const aoa = [
      ["RAK ENGINEERING"], ["ELECTROPLATING PLANT, AIR POLLUTION, CONTROL SYSTEM, WATER AND WASTEWATER TREATMENT PLANT"], ["PUNCH LIST REPORT"], [],
      ["Project Name :", p.name, "", "", "", "JOB No. :", p.job_no], ["Customer :", p.customer, "", "", "", "Report date :", fmt(todayIso())], [],
      ["Status Summary", "Item " + c.total, "Open " + c.open, "WIP " + c.wip, "Check " + c.check, "Done " + c.done, "Closed " + c.pct + "%"], [],
      head, ...ITEMS.map(row),
    ];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws["!merges"] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: head.length - 1 } })).concat([{ s: { r: 4, c: 1 }, e: { r: 4, c: 4 } }, { s: { r: 5, c: 1 }, e: { r: 5, c: 4 } }]);
    ws["!cols"] = head.map(h => ({ wch: { Item: 6, Details: 52, Assign: 24, Remark: 44, "Remark (customer)": 40, "Note (internal)": 36, "Root cause": 30, "Process (ที่มา)": 22 }[h] || 13 }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Punch list");
    if (!customer) {
      const by = [["Process (ที่มา)", "ที่มา", "Items", "Not done", "NCR"], ...PROCESS.map(x => { const l = ITEMS.filter(i => i.process === x.id); return [x.en, x.th, l.length, l.filter(i => i.status !== "done").length, l.filter(i => i.ncr).length]; }).filter(r => r[2])];
      const s2 = X.utils.aoa_to_sheet(by); s2["!cols"] = [{ wch: 26 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 8 }];
      X.utils.book_append_sheet(wb, s2, "By process");
      const ncr = [["Item", "Details", "Process", "Discipline", "NCR no.", "Root cause", "Assign", "Status", "Finished date"], ...ITEMS.filter(i => i.ncr).map(i => [i.no, i.details, (prOf(i.process) || {}).en || "", i.discipline, i.ncr_no, i.cause, i.assignee, stOf(i.status).label, fmt(i.finished_date)])];
      const s3 = X.utils.aoa_to_sheet(ncr); s3["!cols"] = [{ wch: 6 }, { wch: 50 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 34 }, { wch: 22 }, { wch: 9 }, { wch: 12 }];
      X.utils.book_append_sheet(wb, s3, "NCR follow-up");
    }
    X.writeFile(wb, fileBase() + (customer ? "_customer.xlsx" : "_internal.xlsx"));
  }
  function openReport() {
    const dlg = modal(`<div class="pl-dlg-h"><b>รายงาน Punch list สำหรับลูกค้า</b><button class="pl-x" data-close aria-label="ปิด">✕</button></div>
      <div class="pl-dlg-b"><div class="pl-form">
        <label class="wide4">รายการที่แสดง<select class="pl-in" name="scope"><option value="all">ทุกรายการ (${ITEMS.length})</option><option value="notdone">เฉพาะที่ยังไม่ปิด (${ITEMS.filter(i => i.status !== "done").length})</option><option value="filter">ตามตัวกรองบนหน้าจอ (${filtered().length})</option></select></label>
        <label class="pl-chk wide4"><input type="checkbox" name="photos" checked> แสดงรูปก่อน / หลังแก้</label>
        <p class="sub wide4">รายงานแสดงเฉพาะ Remark — ไม่มีข้อมูลภายใน (ผู้รับผิดชอบ, Note, ที่มาของปัญหา, NCR, สาเหตุ) · ในหน้าพิมพ์ เลือกปลายทาง “บันทึกเป็น PDF / Save as PDF” แล้วส่งให้ลูกค้า</p></div></div>
      <div class="pl-dlg-f"><button class="pl-btn" data-close>ยกเลิก</button><button class="pl-btn primary" data-a="go">🖨 เปิดหน้าพิมพ์</button></div>`, 620);
    dlg.el.querySelector('[data-a="go"]').onclick = () => {
      const v = n => dlg.el.querySelector(`[name="${n}"]`);
      const list = v("scope").value === "all" ? ITEMS : v("scope").value === "notdone" ? ITEMS.filter(i => i.status !== "done") : filtered();
      dlg.close(); printReport(list, v("photos").checked);
    };
  }
  function printReport(list, photos) {
    const p = CUR, c = count(ITEMS);
    const imgs = (arr) => (arr || []).map(ph => `<img src="${esc(photoSrc(ph))}" alt="">`).join("") || `<span class="none">—</span>`;
    const html = `<div class="rp-h"><div><div class="rp-co">RAK ENGINEERING</div><div class="rp-sub">ELECTROPLATING PLANT, AIR POLLUTION, CONTROL SYSTEM, WATER AND WASTEWATER TREATMENT PLANT</div></div><div class="rp-t">PUNCH LIST REPORT</div></div>
      <table class="rp-info"><tr><th>Project Name</th><td>${esc(p.name)}</td><th>JOB No.</th><td>${esc(p.job_no)}</td></tr><tr><th>Customer</th><td>${esc(p.customer)}${p.site ? " · " + esc(p.site) : ""}</td><th>Report date</th><td>${esc(fmt(todayIso()))}</td></tr></table>
      <div class="rp-sum"><span>Item <b>${c.total}</b></span><span>Open <b>${c.open}</b></span><span>WIP <b>${c.wip}</b></span><span>Check <b>${c.check}</b></span><span>Done <b>${c.done}</b></span><span>Closed <b>${c.pct}%</b></span></div>
      <table class="rp-tbl"><thead><tr><th>Item</th><th>Details</th><th>Due date</th><th>Status</th><th>Finished</th><th>Remark</th>${photos ? "<th>Before</th><th>After</th>" : ""}</tr></thead><tbody>
      ${list.map(i => `<tr><td class="c">${i.no}</td><td>${esc(i.details)}</td><td class="c">${esc(fmt(i.due_date))}</td><td class="c"><b class="st-${esc(i.status)}">${stOf(i.status).label}</b></td><td class="c">${esc(fmt(i.finished_date))}</td><td class="rp-rmk">${esc(i.remark || "")}</td>${photos ? `<td class="ph">${imgs(i.photos_before)}</td><td class="ph">${imgs(i.photos_after)}</td>` : ""}</tr>`).join("")}</tbody></table>
      <div class="rp-sign"><div>Prepared by (RAK)<i></i></div><div>Checked by (Customer)<i></i></div></div>`;
    let box = document.getElementById("plPrint");
    if (!box) { box = document.createElement("div"); box.id = "plPrint"; document.body.appendChild(box); }
    box.innerHTML = html;
    document.body.classList.add("pl-printing");
    const done = () => { document.body.classList.remove("pl-printing"); box.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    const wait = [...box.querySelectorAll("img")].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }));
    Promise.race([Promise.all(wait), new Promise(r => setTimeout(r, 8000))]).then(() => { window.print(); setTimeout(() => { if (document.body.classList.contains("pl-printing") && !matchMedia("print").matches) done(); }, 1500); });
  }

  /* ---------- import from an existing punch list sheet (e.g. HAM-LET EP500L tab "Punchlist") ---------- */
  function parseDate(v, X) {
    if (v == null || v === "") return null;
    if (typeof v === "number" && X) { const d = X.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
    if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const s = String(v).trim().replace(/\s+/g, " ");
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = /^(\d{1,2})[ \-/]([A-Za-z]{3})[a-z]*[ \-/](\d{2,4})$/.exec(s);
    if (m) { const mo = MON.findIndex(x => x.toLowerCase() === m[2].toLowerCase()); if (mo >= 0) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(s);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    return null;
  }
  function parseSheet(aoa, X) {
    const low = v => String(v ?? "").trim().toLowerCase();
    const h = aoa.findIndex(r => r && r.some(v => low(v) === "item") && r.some(v => /^details?$|รายละเอียด/.test(low(v))));
    if (h < 0) return null;
    const H = aoa[h].map(low), col = re => H.findIndex(v => re.test(v));
    const cItem = col(/^item$/), cDet = col(/^details?$|รายละเอียด/);
    let cWho = col(/assign|ผู้รับผิดชอบ|responsible|owner/); if (cWho < 0 && !H[cDet + 1]) cWho = cDet + 1;
    const cDue = col(/due/), cSt = col(/^status/), cFin = col(/finish|เสร็จ/), cNote = col(/^note|หมายเหตุ/), cRmk = col(/^remark/), cPr = col(/process|ที่มา/), cSev = col(/severity|ระดับ/), cDisc = col(/discipline|หมวด/);
    const cNcrNo = col(/ncr no/), cCause = col(/root cause|สาเหตุ/);
    const out = [];
    for (const r of aoa.slice(h + 1)) {
      if (!r) continue;
      const no = parseInt(r[cItem], 10), det = String(r[cDet] ?? "").trim();
      if (!det || !(no > 0)) continue;
      // free-text note: the named column, else the first text cell to the right of the Ref / Before / After columns
      let note = cNote >= 0 ? String(r[cNote] ?? "").trim() : "";
      if (cNote < 0) for (let k = Math.max(cFin, cSt, cDue) + 2; k < r.length; k++) { const t = String(r[k] ?? "").trim(); if (t && isNaN(+t)) { note = t; break; } }
      const st = low(r[cSt]); const status = /done|close|ปิด|เสร็จ/.test(st) ? "done" : /wip|progress|กำลัง/.test(st) ? "wip" : /check|ตรวจ/.test(st) ? "check" : "open";
      const prTxt = cPr >= 0 ? low(r[cPr]) : "", pr = PROCESS.find(x => prTxt && (x.en.toLowerCase() === prTxt || x.th === prTxt || x.id === prTxt));
      const remark = cRmk >= 0 ? String(r[cRmk] ?? "").trim() : "";
      out.push(blank({ no, details: det, remark, assignee: cWho >= 0 ? String(r[cWho] ?? "").trim() : "", due_date: cDue >= 0 ? parseDate(r[cDue], X) : null, status,
        finished_date: cFin >= 0 ? parseDate(r[cFin], X) : null, note, process: pr ? pr.id : "", severity: cSev >= 0 && /^[ABC]$/i.test(String(r[cSev] ?? "").trim()) ? String(r[cSev]).trim().toUpperCase() : "",
        discipline: cDisc >= 0 ? String(r[cDisc] ?? "").trim() : "", ncr_no: cNcrNo >= 0 ? String(r[cNcrNo] ?? "").trim() : "", cause: cCause >= 0 ? String(r[cCause] ?? "").trim() : "" }));
      const last = out[out.length - 1]; last.ncr = !!last.ncr_no;
      if (status === "done" && !last.finished_date) last.finished_date = last.due_date;
    }
    return out;
  }
  function openImport() {
    const dlg = modal(`<div class="pl-dlg-h"><b>นำเข้ารายการจาก Excel</b><button class="pl-x" data-close aria-label="ปิด">✕</button></div>
      <div class="pl-dlg-b"><p class="sub">ไฟล์ Punch list เดิม (เช่น HAM-LET EP500L แท็บ <b>Punchlist</b>) หรือไฟล์ที่ export จากเมนูนี้ · อ่านคอลัมน์ Item, Details, ผู้รับผิดชอบ, Due date, Status, Finished date, Note · จาก Google Sheets ให้ File → Download → .xlsx ก่อน</p>
        <label class="pl-drop2"><input type="file" accept=".xlsx,.xls,.csv" hidden>📂 เลือกไฟล์ .xlsx</label><div id="impOut"></div></div>
      <div class="pl-dlg-f"><button class="pl-btn" data-close>ปิด</button><button class="pl-btn primary" data-a="go" disabled>นำเข้า</button></div>`, 820);
    let rows = [];
    const el = dlg.el, go = el.querySelector('[data-a="go"]');
    el.querySelector("input[type=file]").onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      const out = el.querySelector("#impOut"); out.innerHTML = `<p class="sub">กำลังอ่าน…</p>`;
      try {
        const X = await loadXLSX(), wb = X.read(await file.arrayBuffer(), { cellDates: false });
        const names = [...wb.SheetNames].sort((a, b) => (/punch/i.test(b) ? 1 : 0) - (/punch/i.test(a) ? 1 : 0));
        let sheet = null;
        for (const n of names) { const r = parseSheet(X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }), X); if (r && r.length) { rows = r; sheet = n; break; } }
        if (!sheet) { out.innerHTML = `<p class="pl-err">ไม่พบตารางที่มีหัวคอลัมน์ Item และ Details</p>`; go.disabled = true; return; }
        const start = (Math.max(0, ...ITEMS.map(i => i.no)) || 0);
        const clash = start > 0 && rows.some(r => ITEMS.some(i => i.no === r.no));
        out.innerHTML = `<p>พบ <b>${rows.length}</b> รายการ ในแท็บ <b>${esc(sheet)}</b>${clash ? ` · เลข Item ซ้ำกับรายการเดิม — จะเรียงเลขต่อจาก ${start}` : ""}</p>
          <div class="tbl" style="max-height:300px;overflow:auto"><table><thead><tr><th>Item</th><th>Details</th><th>Assign</th><th>Due</th><th>Status</th><th>Finished</th><th>Note</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.no}</td><td>${esc(r.details)}</td><td>${esc(r.assignee)}</td><td class="nowrap">${esc(fmt(r.due_date))}</td><td>${stBadge(r.status)}</td><td class="nowrap">${esc(fmt(r.finished_date))}</td><td class="sub">${esc(r.note)}</td></tr>`).join("")}</tbody></table></div>
          <p class="sub">ที่มาของปัญหา ระดับ และ NCR ใส่เพิ่มได้ทีหลังจากหน้ารายการ</p>`;
        if (clash) rows.forEach((r, k) => { r.no = start + k + 1; });
        go.disabled = false;
      } catch (er) { out.innerHTML = `<p class="pl-err">${esc(er.message || er)}</p>`; }
    };
    go.onclick = async () => {
      go.disabled = true; go.textContent = "กำลังนำเข้า…";
      let ok = 0;
      for (const r of rows) { try { const s = await saveItem(r); ITEMS.push(s); ok++; } catch (e) { toast("นำเข้าไม่ครบ: " + e.message, 1); break; } }
      ITEMS.sort((a, b) => a.no - b.no); dlg.close(); pageProject(); toast(`นำเข้าแล้ว ${ok} รายการ`);
    };
  }

  /* ---------- styles ---------- */
  const CSS = `
.pl-note{background:var(--amber-soft,#fff4da);border:1px solid #f1d38a;border-radius:10px;padding:9px 12px;margin:0 0 14px;font-size:13px}
.pl-in{font:inherit;font-size:13.5px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#fff;color:var(--ink);width:100%;min-width:0}
.pl-in:focus{border-color:#df8989;outline:none;box-shadow:0 0 0 3px var(--blush)}
textarea.pl-in{resize:vertical;line-height:1.5}
.pl-btn{font:inherit;font-size:13px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:7px 13px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.pl-btn:hover{border-color:var(--rak);color:var(--rak)}.pl-btn.primary{background:var(--rak);border-color:var(--rak);color:#fff}.pl-btn.primary:hover{background:var(--rak-dark);color:#fff}
.pl-btn.ghost{border-color:transparent;color:var(--muted)}.pl-btn.ghost:hover{color:var(--rak);background:var(--blush)}.pl-btn.sm{font-size:12px;padding:4px 10px}.pl-btn[disabled]{opacity:.5;cursor:not-allowed}
.pl-top{display:flex;gap:10px;align-items:center;margin:4px 0 14px}.pl-top .pl-in{flex:1;max-width:560px}
.pl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px;margin:0 0 14px}
.pl-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px;display:grid}.pl-kpi b{font-size:22px;line-height:1.2;font-variant-numeric:tabular-nums}.pl-kpi span{font-size:12px;color:var(--muted)}
.pl-kpi.k-open b{color:#c70404}.pl-kpi.k-wip b{color:#946719}.pl-kpi.k-check b{color:#1d5fa8}.pl-kpi.k-done b{color:#188764}.pl-kpi.k-late{background:#fff0f0;border-color:#ffd9d9}.pl-kpi.k-late b{color:#c70404}
.pl-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.pl-card{display:grid;gap:6px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;text-decoration:none;color:inherit}.pl-card:hover{border-color:var(--rak);box-shadow:0 8px 22px -16px rgba(199,4,4,.6)}
.pl-card-h{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.pl-cust{font-size:15px}.pl-name{color:var(--muted);font-size:13px;line-height:1.4}
.pl-jo{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;color:var(--rak);background:var(--blush);border-radius:6px;padding:1px 7px;font-weight:600}
.pl-late{font-size:11.5px;background:#c70404;color:#fff;border-radius:20px;padding:0 8px}
.pl-bar-p{display:flex;height:8px;border-radius:9px;background:#fbe3e3;overflow:hidden}.pl-bar-p i{display:block;height:100%}.b-done{background:#188764}.b-check{background:#5b8fd1}.b-wip{background:#e3b04b}
.pl-cnt{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--muted)}.pl-cnt b{color:var(--ink)}.pl-pct{margin-left:auto;font-weight:700;color:var(--ink)}.pl-pct.big{font-size:22px}
.t-open{color:#c70404}.t-wip{color:#946719}.t-check{color:#1d5fa8}.t-done{color:#188764}
.pl-st{display:inline-block;font-size:11.5px;font-weight:600;border-radius:20px;padding:0 9px;white-space:nowrap}
.st-open{background:#ffe2e2;color:#b00000}.st-wip{background:#fff1d6;color:#8a5a00}.st-check{background:#e3efff;color:#1d5fa8}.st-done{background:#e2f5ec;color:#147052}
.pl-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin:0 0 14px}.pl-head h2{margin:4px 0 2px;font-size:21px;font-weight:600}
.pl-back{font-size:13px;color:var(--rak);text-decoration:none}.pl-eyebrow{font-size:11px;letter-spacing:1px;color:var(--muted);margin-top:8px}
.pl-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:820px}
.pl-grid2{display:grid;grid-template-columns:minmax(240px,1fr) minmax(300px,1.5fr);gap:12px;margin-bottom:14px}
.pl-prog,.pl-break{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}.pl-prog-h,.pl-break-h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px}
.pl-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:8px}
.pl-brow{all:unset;box-sizing:border-box;display:grid;grid-template-columns:170px 1fr 150px;gap:10px;align-items:center;width:100%;padding:3px 6px;border-radius:7px;font-size:13px;cursor:pointer}.pl-brow:hover,.pl-brow.on{background:var(--blush)}
.pl-btrack{height:7px;background:var(--bg);border-radius:9px;overflow:hidden}.pl-btrack i{display:block;height:100%;background:var(--rak);border-radius:9px}.pl-bnum{font-size:12px;color:var(--muted);text-align:right}.pl-bnum b{color:var(--ink)}
.pl-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.pl-filters .pl-in{width:auto}.pl-filters input[type=search]{flex:1 1 240px}
.pl-chk{display:inline-flex;gap:6px;align-items:center;font-size:13px;cursor:pointer}.pl-form>label.pl-chk{display:flex;flex-direction:row;font-size:13px}.pl-chk input{width:16px;height:16px;accent-color:var(--rak)}
.pl-tbl table{width:100%;border-collapse:collapse}.pl-tbl th{font-size:12px;text-align:left;background:#f7f8fa;padding:9px 8px;white-space:nowrap;border-bottom:1px solid var(--line)}
.pl-tbl td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13.5px}.pl-tbl .c{text-align:center}.pl-tbl td.n{font-weight:700;color:var(--muted)}.nowrap{white-space:nowrap}
.pl-tbl tbody tr{cursor:pointer}.pl-tbl tbody tr:hover td{background:#fff8f8}.pl-tbl tr.is-done td{color:#7b828d}.pl-tbl tr.is-done .pl-det{text-decoration:line-through;text-decoration-color:#b9c0c9}
.pl-tbl td.late{color:#c70404;font-weight:600}.pl-latec{font-size:10.5px;font-weight:600}
.pl-det{line-height:1.45;white-space:pre-wrap}.pl-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}.pl-remark{font-size:12px;color:#1d5fa8;background:#eef5ff;border-radius:6px;padding:3px 7px;margin-top:4px;white-space:pre-wrap;line-height:1.4}.pl-rmk textarea{border-color:#b6d4f5;background:#f7fbff}.pl-notep{font-size:12px;color:var(--muted);margin-top:4px;white-space:pre-wrap;line-height:1.4}
.pl-sev{font-size:11px;font-weight:700;border-radius:5px;padding:0 6px}.sev-A{background:#c70404;color:#fff}.sev-B{background:#fff1d6;color:#8a5a00}.sev-C{background:#eef1f5;color:#5a6472}
.pl-disc{font-size:11px;background:var(--bg);color:var(--muted);border-radius:5px;padding:0 6px}.pl-ncr{font-size:11px;font-weight:700;background:#2b2f36;color:#fff;border-radius:5px;padding:0 6px}
.pl-pr{font-size:12px;background:#f1f3f7;border-radius:6px;padding:1px 7px;white-space:nowrap}
.pl-ss{font:inherit;font-size:12px;font-weight:600;border:0;border-radius:20px;padding:3px 8px;cursor:pointer}
.pl-phs{display:flex;gap:8px}.pl-phg{display:flex;gap:2px;align-items:center}.pl-th{width:34px;height:34px;object-fit:cover;border-radius:6px;border:2px solid #ffd9d9}.pl-th.a{border-color:#bfe3d3}
.pl-phg i{font-style:normal;font-size:11px;color:var(--muted)}.pl-phg i.none{border:1px dashed #d5dae2;border-radius:6px;padding:6px 4px;font-size:10.5px}
.pl-qa td{background:#fcfcfd;border-bottom:0}.pl-qa .pl-in{padding:7px 9px}
.pl-modal{position:fixed;inset:0;background:rgba(18,18,18,.45);display:grid;place-items:center;z-index:60;padding:16px}
.pl-dlg{background:#fff;border-radius:16px;max-height:92vh;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.pl-dlg-h{display:flex;gap:12px;align-items:baseline;padding:14px 18px;border-bottom:1px solid var(--line)}.pl-dlg-h b{font-size:16px}.pl-dlg-h .pl-x{margin-left:auto}
.pl-dlg-b{overflow:auto;padding:16px 18px}.pl-dlg-f{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--line)}
.pl-x{border:0;background:none;color:var(--muted);font-size:14px;cursor:pointer;padding:4px 7px;border-radius:6px}.pl-x:hover{background:var(--blush);color:var(--rak)}
.pl-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 12px}.pl-form>label{display:grid;gap:4px;font-size:12.5px;font-weight:600;color:#4a5260}
.pl-form .wide{grid-column:span 2}.pl-form .wide2{grid-column:span 2}.pl-form .wide3{grid-column:span 3}.pl-form .wide4{grid-column:1/-1}
.pl-fs{border:1px solid var(--line);border-radius:12px;padding:10px 12px 12px;margin:0}.pl-fs legend{font-size:12.5px;font-weight:700;color:var(--rak);padding:0 6px}
.pl-phbox{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.pl-phh{display:flex;gap:8px;align-items:center;margin-bottom:8px}.pl-phh .pl-btn{margin-left:auto}
.pl-phl{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}.pl-phl figure{margin:0;position:relative}.pl-phl img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:zoom-in;display:block}
.pl-phl .pl-x{position:absolute;top:3px;right:3px;background:rgba(255,255,255,.9);font-size:11px;padding:2px 6px}.pl-drop{grid-column:1/-1;border:1px dashed #d5dae2;border-radius:8px;padding:14px;text-align:center}
.pl-zoom{display:grid;grid-template-rows:1fr auto;max-height:92vh}.pl-zoom img{max-width:100%;max-height:80vh;object-fit:contain;margin:auto;display:block;background:#111}
.pl-jobs{display:grid;gap:6px;margin:10px 0}.pl-job{all:unset;box-sizing:border-box;display:grid;gap:2px;border:1px solid var(--line);border-radius:10px;padding:9px 12px;cursor:pointer;font-size:13.5px}
.pl-job:hover:not([disabled]){border-color:var(--rak);background:var(--blush)}.pl-job[disabled]{opacity:.55;cursor:not-allowed}.pl-manual summary{cursor:pointer;color:var(--rak);font-size:13px;margin:6px 0 10px}
.pl-drop2{display:block;border:2px dashed #d5dae2;border-radius:12px;padding:22px;text-align:center;cursor:pointer;margin:10px 0}.pl-drop2:hover{border-color:var(--rak);background:var(--blush)}.pl-err{color:var(--rak)}
#plToast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#22252b;color:#fff;padding:9px 16px;border-radius:10px;font-size:13.5px;z-index:80;box-shadow:0 10px 30px -10px rgba(0,0,0,.5)}#plToast.err{background:#c70404}
#plPrint{display:none}
@media print{body.pl-printing>*:not(#plPrint){display:none!important}body.pl-printing #plPrint{display:block}body.pl-printing{background:#fff}
  @page{size:A4 landscape;margin:10mm}
  #plPrint{font:11px/1.45 "IBM Plex Sans Thai","Leelawadee UI",Tahoma,sans-serif;color:#111}
  .rp-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #c70404;padding-bottom:6px;margin-bottom:8px}.rp-co{font-size:20px;font-weight:700;letter-spacing:1px}.rp-sub{font-size:8.5px;color:#555}.rp-t{font-size:16px;font-weight:700;color:#c70404}
  .rp-info{width:100%;border-collapse:collapse;margin-bottom:6px}.rp-info th{text-align:left;width:110px;color:#555;font-weight:600;padding:2px 6px}.rp-info td{padding:2px 6px;font-weight:600}
  .rp-sum{display:flex;gap:18px;border:1px solid #ccc;border-radius:6px;padding:5px 10px;margin-bottom:8px}
  .rp-tbl{width:100%;border-collapse:collapse}.rp-tbl th{background:#c70404;color:#fff;padding:5px;font-size:10.5px;text-align:left}.rp-tbl td{border:1px solid #ccc;padding:5px;vertical-align:top}.rp-tbl tr{break-inside:avoid}.rp-tbl .c{text-align:center;white-space:nowrap}
  .rp-tbl td.ph{width:150px}.rp-tbl td.ph img{width:70px;height:70px;object-fit:cover;margin:1px;border:1px solid #ddd}.rp-tbl .none{color:#aaa}.rp-rmk{white-space:pre-wrap;font-size:10.5px;width:200px}
  .rp-tbl .st-open{color:#b00000;background:none}.rp-tbl .st-wip{color:#8a5a00;background:none}.rp-tbl .st-check{color:#1d5fa8;background:none}.rp-tbl .st-done{color:#147052;background:none}
  .rp-sign{display:flex;gap:60px;margin-top:28px;break-inside:avoid}.rp-sign div{flex:1}.rp-sign i{display:block;border-bottom:1px solid #333;height:36px}}
@media (max-width:820px){.pl-grid2{grid-template-columns:1fr}.pl-form{grid-template-columns:1fr 1fr}.pl-form .wide3{grid-column:1/-1}.pl-brow{grid-template-columns:110px 1fr 110px}.pl-actions{justify-content:flex-start}
  .pl-tbl thead{display:none}.pl-tbl tr{display:grid;grid-template-columns:40px 1fr;border-bottom:1px solid var(--line)}.pl-tbl td{border:0;padding:4px 8px}.pl-tbl td:not(.n):not(.d){grid-column:2}.pl-tbl td.c{text-align:left}.pl-qa td{grid-column:1/-1!important}}`;

  async function mount(el, sub) {
    ROOT = el;
    if (!document.getElementById("plCss")) { const s = document.createElement("style"); s.id = "plCss"; s.textContent = CSS; document.head.appendChild(s); }
    el.innerHTML = `<div class="empty">กำลังโหลด…</div>`;
    try {
      await detect(); await loadProjects(); loadPeople().then(() => { if (CUR) peopleList(); });
    } catch (e) { el.innerHTML = `<div class="empty">โหลด Punch list ไม่สำเร็จ (${esc(e.message)}) — ลองรีเฟรชหน้า</div>`; return; }
    if (ROOT !== el) return;
    if (sub) {
      const id = decodeURIComponent(sub);
      const p = PROJECTS.find(x => x.id === id);
      if (!p) { el.innerHTML = `<div class="empty">ไม่พบ Punch list นี้ · <a class="open" href="#punch-list">กลับรายการ</a></div>`; return; }
      if (!CUR || CUR.id !== p.id) F = { q: "", status: "", process: "", sev: "", who: "", late: false };
      CUR = p;
      try { ITEMS = await loadItems(p.id); } catch (e) { el.innerHTML = `<div class="empty">โหลดรายการไม่สำเร็จ (${esc(e.message)})</div>`; return; }
      if (ROOT === el) pageProject();
      return;
    }
    CUR = null; ITEMS = [];
    pageList();
  }
  window.PunchList = { mount, _parseSheet: parseSheet, _parseDate: parseDate };
})();
