/* SSM Work · Manpower module (วางแผนกำลังคน) — Planning Board: people × days, replacing the Google Sheet
   "26 (PD)- ตารางงานและวันหยุดช่าง 2569" (tab แผนช่าง). Phase 1 = view only; editing (SC / PC / SSM) comes in Phase 2.
   Routes (inside the hub): #manpower                         → month view around today
                            #manpower/<zoom>/<yyyy-mm-dd>     → zoom = week | month | quarter
   Data:  GET /api/manpower/board?from=&to=  → workers, projects, milestones, assignments, absences, holidays, canEdit */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const UNITS = [["ME", "ME · งานโลหะ"], ["PP", "PP · งานพลาสติก"], ["EE", "EE · ไฟฟ้า"], ["PC", "PC · วางแผนผลิต"], ["SC", "SC / SSM"]];
  const ZOOMS = [["week", "สัปดาห์"], ["month", "เดือน"], ["quarter", "3 เดือน"]];
  const MF = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const DS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];   // by Date.getDay()
  const ABS = { // absence type → [short label, css class, long label]
    H: ["H", "off", "วันหยุด"], PH: ["PH", "ph", "วันหยุดนักขัตฤกษ์"], EX: ["EX", "ph", "วันหยุดพิเศษบริษัท"],
    "พักร้อน": ["พักร้อน", "lv", "ลาพักร้อน"], "ลาป่วย": ["ป่วย", "lv", "ลาป่วย"], "ลาป่วยครึ่งวัน": ["ป่วย½", "lv", "ลาป่วยครึ่งวัน"],
    "ลากิจ": ["กิจ", "lv", "ลากิจ"], "ลาไม่รับค่าจ้าง": ["ไม่รับ", "lv", "ลาไม่รับค่าจ้าง"], "ลา": ["ลา", "lv", "ลา"],
    "สลับวันหยุด": ["สลับ", "off", "สลับวันหยุด"],
  };
  const KIND = { admin: ["#6d7582", "ประชุม / อบรม / ธุรการ"], internal: ["#9a7b4f", "งานภายใน"], other: ["#b3b8c2", "อื่นๆ (ตรวจสอบ)"] };

  let ROOT = null, DATA = null, LOADING = null, ERR = "", CUR = { W: [] };
  const S = { page: "board", zoom: "month", date: new Date(), units: new Set(UNITS.map(u => u[0])), cust: "", project: "", person: "", q: "", left: false, miles: true, msOpen: (() => { try { return localStorage.getItem("mp.msOpen") !== "0"; } catch (e) { return true; } })() };
  const WT = [["fab", "Fab"], ["assembly", "Assembly"], ["install", "Install"], ["service", "Service"], ["other", "Other"]];
  const WTL = Object.fromEntries(WT);
  const LV = [["ลาป่วย", "ลาป่วย"], ["พักร้อน", "ลาพักร้อน"], ["ลากิจ", "ลากิจ"]];

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const key = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fromKey = k => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  function range() {
    const d = S.date;
    if (S.zoom === "week") { const a = addDays(d, -((d.getDay() + 6) % 7)); return [a, addDays(a, 13)]; }   // two weeks from Monday
    if (S.zoom === "quarter") { const a = new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % 3), 1); return [a, new Date(a.getFullYear(), a.getMonth() + 3, 0)]; }
    return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0)];
  }
  function step(n) {
    const d = S.date;
    if (S.zoom === "week") return addDays(d, 14 * n);
    if (S.zoom === "quarter") return new Date(d.getFullYear(), d.getMonth() + 3 * n, 1);
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
  }
  function title() {
    const [a, b] = range();
    if (S.zoom === "month") return `${MF[a.getMonth()]} ${a.getFullYear()}`;
    if (S.zoom === "quarter") return `${MS[a.getMonth()]} – ${MS[b.getMonth()]} ${b.getFullYear()}`;
    return `${a.getDate()} ${MS[a.getMonth()]} – ${b.getDate()} ${MS[b.getMonth()]} ${b.getFullYear()}`;
  }
  const href = (zoom, d) => "#manpower/" + zoom + "/" + key(d);
  const MIN = new Date(2026, 0, 1), MAX = new Date(2027, 11, 31);   // planning calendar: 1 Jan 2026 – 31 Dec 2027
  const clampDate = d => d < MIN ? MIN : d > MAX ? MAX : d;

  /* ---------- load ---------- */
  const loadErr = st => st === 503 ? "ยังไม่ได้สร้างตารางข้อมูลกำลังคนใน Supabase (database/manpower.sql)" : st === 403 ? "บัญชีนี้ยังไม่มีสิทธิ์เมนูวางแผนกำลังคน" : "โหลดข้อมูลไม่สำเร็จ (" + st + ")";
  const jobKey = v => String(v == null ? "" : v).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  function prep(d) {
    d.P = new Map(d.projects.map(p => [p.code, p]));
    d.master = d.master || [];
    d.MJ = new Map(d.master.map(m => [jobKey(m.job_no), m]));
    d.A = new Map(d.assignments.map(x => [x.worker_id + "|" + x.day, x]));
    d.X = new Map(d.absences.map(x => [x.worker_id + "|" + x.day, x]));
    d.H = new Map(d.holidays.map(x => [x.day, x]));
    d.SV = new Map();
    (d.service || []).forEach(x => { const k = x.worker_id + "|" + x.day; if (!d.SV.has(k)) d.SV.set(k, []); d.SV.get(k).push(x); });
    d.RQ = new Map();   // ขอคน (Service Plan requests): pending / confirmed people per day
    (d.requests || []).forEach(x => { const k = x.worker_id + "|" + x.day; if (!d.RQ.has(k)) d.RQ.set(k, []); d.RQ.get(k).push(x); });
    d.busy = new Set(d.assignments.concat(d.absences.filter(x => !["H", "PH", "EX"].includes(x.type)), d.service || []).map(x => x.worker_id));
    return d;
  }
  async function fetchRange(from, to) {
    const r = await fetch(`/api/manpower/board?from=${from}&to=${to}`, { cache: "no-store" });
    if (!r.ok) { const e = new Error(loadErr(r.status)); e.status = r.status; throw e; }
    return prep(await r.json());
  }
  async function load() {
    const [a, b] = range(), want = key(a) + "|" + key(b);
    if (DATA && DATA.want === want) return;
    ERR = "";
    try { const d = await fetchRange(key(a), key(b)); d.want = want; DATA = d; }
    catch (err) { ERR = err.status ? err.message : "โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้า"; DATA = null; }
  }
  function ensure() { if (!LOADING) LOADING = load().finally(() => { LOADING = null; }); return LOADING; }

  /* ---------- helpers ---------- */
  const norm = s => String(s ?? "").toLowerCase().replace(/\s+/g, "");
  // Cells are coloured by work type (Dew, 11 Nov 2026); project colours stay on milestone rows only
  const WCOL = { fab: "#e8590c", assembly: "#1c7ed6", install: "#2f9e44", service: "#7048e8", other: "#868e96" };
  const WSHORT = { fab: "Fab", assembly: "Assy", install: "Install", service: "SO", other: "" };
  const typeOf = a => a.work_type && WCOL[a.work_type] ? a.work_type : (a.project_code === "SERVICE" ? "service" : "other");
  // old job = a project from the sheet not yet linked to RAK_Master_Project_on_hand by Job no. → light grey; new jobs → work-type colour
  const OLD_COL = "#c3c8ce";
  const isOld = a => { const p = a.project_code ? DATA.P.get(a.project_code) : null; return !!p && p.code !== "SERVICE" && !masterOf(p); };
  const colorOf = a => isOld(a) ? OLD_COL : a.kind === "admin" && typeOf(a) === "other" ? "#adb5bd" : WCOL[typeOf(a)];
  const MSC = { FAT: "#f08c00", INST: "#1c7ed6", SAT: "#2f9e44" };
  const msKind = l => { const u = String(l || "").trim().toUpperCase(); return /^FAT\b/.test(u) ? "FAT" : /^(INST|INSTALL|ติดตั้ง)/.test(u) || u === "ติดตั้ง" ? "INST" : /^SAT\b|COMMISSION/.test(u) ? "SAT" : ""; };
  const shortOf = p => p ? (p.short_name || p.name) : "";
  // master row (RAK_Master_Project_on_hand) for a project, matched by Job no.
  // a plan project linked to a master row whose customer is clearly different → the Job no. was probably typed on the wrong job
  const custKey = v => String(v || "").toLowerCase().replace(/[^a-z0-9ก-๙]/g, "");
  const linkOdd = (p, m) => { const a = custKey(p && p.customer), b = custKey(m && m.customer); return !!(a && b && p.code !== "SERVICE" && !a.startsWith(b) && !b.startsWith(a)); };
  const masterOf = p => p && p.job_no ? DATA.MJ.get(jobKey(p.job_no)) : null;
  // cell text: "work type | customer | short job name"; jobs without a real customer / project show their own wording
  function cellText(a) {
    const p = a.project_code ? DATA.P.get(a.project_code) : null, t = WSHORT[typeOf(a)];
    const m = masterOf(p);
    if (m && (m.customer || m.job_name) && !linkOdd(p, m)) return [t, m.customer, m.job_name].filter(Boolean).join(" | ");
    const cust = p && p.customer && p.code !== "SERVICE" ? p.customer : "";
    let tail = cust ? shortOf(p) : a.text.replace(/^จอง\s*/, "");
    if (t === "SO" && !cust) tail = tail.replace(/^(SO|WR|IS)\s+/i, "");
    return [t, cust, tail].filter(Boolean).join(" | ");
  }
  const projName = a => a.project_code && DATA.P.get(a.project_code) ? DATA.P.get(a.project_code).name : (KIND[a.kind] || KIND.other)[1];
  function days() { const [a, b] = range(), out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
  // Two-level job filter: customer first, then a job of that customer. Service Plan cells match by their customer name.
  const custOf = code => { const p = code && DATA.P.get(code); return p ? (p.customer || "") : ""; };
  const lc = x => String(x || "").toLowerCase().trim();
  const matchA = a => S.project ? a.project_code === S.project : S.cust ? lc(custOf(a.project_code)) === lc(S.cust) : true;
  const matchSv = list => S.project ? S.project === "SERVICE" || list.some(j => lc(j.job) === lc((DATA.P.get(S.project) || {}).job_no)) : S.cust ? list.some(j => lc(j.customer).includes(lc(S.cust)) || lc(S.cust).includes(lc(j.customer))) || lc(custOf("SERVICE")) === lc(S.cust) : true;
  const matchM = code => S.project ? code === S.project : S.cust ? lc(custOf(code)) === lc(S.cust) : true;
  function customers(withMaster) {
    const set = new Map();
    DATA.projects.forEach(p => { if (p.customer) set.set(lc(p.customer), p.customer); });
    if (withMaster) (DATA.master || []).forEach(m => { if (m.customer && !set.has(lc(m.customer))) set.set(lc(m.customer), m.customer); });
    return [...set.values()].sort((a, b) => a.localeCompare(b, "th"));
  }
  function visibleWorkers() {
    const q = norm(S.q);
    const busyIn = new Set();
    if (S.cust || S.project) {
      DATA.assignments.forEach(a => { if (matchA(a)) busyIn.add(a.worker_id); });
      DATA.SV.forEach((v, k) => { if (matchSv(v)) busyIn.add(k.split("|")[0]); });
    }
    return DATA.workers.filter(w => S.units.has(w.unit) && (!S.person || w.id === S.person) && (!(S.cust || S.project) || busyIn.has(w.id) || w.id === S.person) && (w.active || (S.left && DATA.busy.has(w.id)) || w.id === S.person) && (!q || norm(w.name_th + w.nickname + w.trade).includes(q)
      || (DATA.assignments.some(a => a.worker_id === w.id && norm(a.text).includes(q)))));
  }
  const dayOff = (k, d) => DATA.H.has(k) || d.getDay() === 0;

  /* ---------- render ---------- */
  function toolbar() {
    const [a] = range();
    const zoom = ZOOMS.map(([z, t]) => `<a href="${href(z, S.date)}" class="${S.zoom === z ? "on" : ""}">${t}</a>`).join("");
    const units = UNITS.map(([u]) => `<label class="mp-chk"><input type="checkbox" data-unit="${u}" ${S.units.has(u) ? "checked" : ""}>${u}</label>`).join("");
    const custs = DATA ? customers().map(c => `<option value="${esc(c)}" ${lc(S.cust) === lc(c) ? "selected" : ""}>${esc(c)}</option>`).join("") : "";
    const projs = DATA ? DATA.projects.filter(p => !S.cust || lc(p.customer) === lc(S.cust)).map(p => `<option value="${esc(p.code)}" ${S.project === p.code ? "selected" : ""}>${esc(p.name)}${p.job_no ? " · " + esc(p.job_no) : ""}${p.status !== "active" ? " (" + esc(p.status) + ")" : ""}</option>`).join("") : "";
    const ppl = DATA ? UNITS.map(([u, l]) => `<optgroup label="${esc(l)}">${DATA.workers.filter(w => w.unit === u && (w.active || S.left)).map(w => `<option value="${esc(w.id)}" ${S.person === w.id ? "selected" : ""}>${esc(w.nickname || w.name_th)} · ${esc(w.name_th)}</option>`).join("")}</optgroup>`).join("") : "";
    const can = DATA && DATA.canEdit;
    const nf = [S.cust, S.project, S.person, S.q].filter(Boolean).length + (S.units.size < UNITS.length ? 1 : 0) + (S.left ? 1 : 0);
    return `<div class="mp-head">
      <div class="mp-title"><h2>วางแผนกำลังคน</h2>${tabs(DATA && DATA.canEdit)}${window.SPRequest ? `<button type="button" class="mp-btn mp-rqb${DATA && DATA.pendingRequests ? " on" : ""}" id="mpReq" title="คำขอคนจาก Service Plan (ทดลองใช้)">คำขอคน${DATA && DATA.pendingRequests ? `<b class="mp-ndot" title="${DATA.pendingRequests} คำขอรอ Confirm">${DATA.pendingRequests > 99 ? "99+" : DATA.pendingRequests}</b>` : ""}</button>` : ""}<span class="mp-badge ${can ? "ed" : ""}">${can ? "SC / PC / SSM · ลงงาน / แก้ไข / Confirm ได้" : "ดูอย่างเดียว"}</span></div>
      <div class="mp-nav">${range()[0] <= MIN ? `<span class="mp-btn off">‹</span>` : `<a class="mp-btn" href="${href(S.zoom, step(-1))}" aria-label="ก่อนหน้า">‹</a>`}<a class="mp-btn" href="${href(S.zoom, today())}">วันนี้</a>${range()[1] >= MAX ? `<span class="mp-btn off">›</span>` : `<a class="mp-btn" href="${href(S.zoom, step(1))}" aria-label="ถัดไป">›</a>`}<b>${esc(title())}</b><span class="mp-zoom">${zoom}</span><button type="button" class="mp-btn mp-fs" id="mpFull" title="${isFull() ? "ออกจากเต็มจอ (Esc)" : "ขยายเต็มจอ"}">${isFull() ? "✕ ออกจากเต็มจอ" : "⛶ เต็มจอ"}</button></div>
      <div class="mp-filters">${units}
        <span class="mp-fl"><select id="mpCust" aria-label="1. ลูกค้า"><option value="">ลูกค้า: ทั้งหมด</option>${custs}</select><i>›</i><select id="mpProj" aria-label="2. ชื่องาน"><option value="">${S.cust ? "งานของ " + esc(S.cust) + ": ทั้งหมด" : "ชื่องาน: ทั้งหมด"}</option>${projs}</select></span>
        <select id="mpPerson" aria-label="ชื่อคน"><option value="">ชื่อคน: ทุกคน</option>${ppl}</select>
        <button type="button" class="mp-clr${nf ? " on" : ""}" id="mpClr" ${nf ? "" : "disabled"} title="ล้างลูกค้า งาน ชื่อคน คำค้นหา และหน่วยงาน">✕ Clear filter${nf ? ` <b>${nf}</b>` : ""}</button>
        <input id="mpQ" type="search" placeholder="ค้นหาชื่อ / งาน" value="${esc(S.q)}" aria-label="ค้นหา">
        <label class="mp-chk"><input type="checkbox" id="mpLeft" ${S.left ? "checked" : ""}>แสดงคนที่ลาออก</label>
        <label class="mp-chk"><input type="checkbox" id="mpMiles" ${S.miles ? "checked" : ""}>Milestone</label></div>
    </div>`;
  }

  function grid() {
    const ds = days(), tk = key(today()), W = visibleWorkers();
    CUR = { W: W.filter(w => S.units.has(w.unit)).map(w => w.id) };
    const cls = "mp-z-" + S.zoom;
    // header rows: month band + day numbers
    let months = "", cur = -1, span = 0;
    const flush = () => { if (span) months += `<th class="mp-mon" colspan="${span}"><span>${MF[cur % 100]} ${Math.floor(cur / 100)}</span></th>`; };
    ds.forEach(d => { const m = d.getFullYear() * 100 + d.getMonth(); if (m !== cur) { flush(); cur = m; span = 0; } span++; });
    flush();
    const dayHead = ds.map(d => { const k = key(d), h = DATA.H.get(k); return `<th class="mp-d ${dayOff(k, d) ? "we" : ""} ${k === tk ? "td" : ""}" title="${esc(h ? (h.name || ABS[h.type]?.[2] || h.type) : "")}"><span>${DS[d.getDay()]}</span>${d.getDate()}</th>`; }).join("");
    // milestones — ดิว and กอล์ฟ (canMilestone) click a cell to add / change / delete
    let miles = "";
    const cm = !!DATA.canMilestone;
    if (S.miles && (DATA.milestones.length || cm)) {
      const byP = new Map(), allP = new Map();
      DATA.milestones.forEach(m => { if (matchM(m.project_code)) { if (!byP.has(m.project_code)) byP.set(m.project_code, new Map()); const x = byP.get(m.project_code); if (!x.has(m.day)) x.set(m.day, []); x.get(m.day).push(m.label); } });
      // INST → SAT bars from all milestones, so a bar crossing the edge of the screen still shows
      (DATA.milestonesAll || DATA.milestones).forEach(m => { if (!matchM(m.project_code)) return; if (!allP.has(m.project_code)) allP.set(m.project_code, []); allP.get(m.project_code).push(m); });
      const barsOf = code => { const L = allP.get(code) || [], sats = L.filter(m => msKind(m.label) === "SAT").map(m => m.day).sort();
        return L.filter(m => msKind(m.label) === "INST").map(m => [m.day, sats.find(k => k >= m.day) || m.day]); };
      const vf = key(ds[0]), vt = key(ds[ds.length - 1]);
      DATA.projects.forEach(p => { if (!byP.has(p.code) && barsOf(p.code).some(([a, b]) => a <= vt && b >= vf)) byP.set(p.code, new Map()); });
      const rows = DATA.projects.filter(p => byP.has(p.code)).map(p => {
        const M = byP.get(p.code), all = [...M.keys()].sort();
        const bars = barsOf(p.code);
        const inBar = k => bars.some(([a, b]) => k > a && k < b);
        const mm = masterOf(p), jn = (mm && mm.job_no) || p.job_no || "", sn = (mm && mm.job_name) || p.short_name || p.name;
        const full = [jn, (mm && mm.customer) || p.customer, (mm && mm.job_full) || p.name].filter(Boolean).join(" · ");
        return `<tr class="mp-ms"><th class="mp-name mp-pj" data-pj="${esc(p.code)}" title="${esc(full)} — กดเพื่อดูรายละเอียด"><i style="background:${esc(p.color)}"></i>${jn ? `<b class="mp-jn">${esc(jn)}</b>` : ""}<span class="mp-sn">${esc(sn)}</span>${p.status !== "active" ? ` <em>${esc(p.status)}</em>` : ""}</th>${ds.map(d => {
          const k = key(d), t = M.get(k), dm = cm ? ` data-m="${esc(p.code + "|" + k)}"` : "";
          if (t) {
            const kinds = t.map(msKind), kd = kinds.includes("SAT") ? "SAT" : kinds.includes("INST") ? "INST" : kinds.includes("FAT") ? "FAT" : "";
            const lab = kinds.includes("FAT") && kd !== "FAT" ? "FAT" : kd;
            return `<td class="mp-c ms${kd ? " ms-" + kd.toLowerCase() : ""}${lab === "FAT" && kd !== "FAT" ? " ms-also-fat" : ""}" style="--c:${esc(kd ? MSC[kd] : p.color)}" title="${esc(t.join(" · "))}"${dm}><span>${kd === "INST" || kd === "SAT" ? "" : "◆ "}${esc(t.join(" · "))}</span></td>`;
          }
          if (inBar(k)) return `<td class="mp-c ms ms-bar" style="--c:${MSC.INST}" title="ติดตั้ง (INST → SAT)"${dm}></td>`;
          return `<td class="mp-c ${dayOff(k, d) ? "we" : ""}${cm ? " ed" : ""}"${dm}></td>`;
        }).join("")}</tr>`; }).join("");
      const nP = DATA.projects.filter(p => byP.has(p.code)).length;
      if (rows || cm) miles = `<tr class="mp-grp"><th class="mp-name"><button type="button" class="mp-mtog" aria-expanded="${S.msOpen}" title="${S.msOpen ? "ย่อ" : "ขยาย"} Milestone">${S.msOpen ? "▾" : "▸"} ◆ Milestone <small>(${nP})</small></button>${cm ? ` <button type="button" class="mp-madd" title="เพิ่ม Milestone">+ เพิ่ม</button>` : ""}<span class="mp-mslg"><i style="background:${MSC.FAT}"></i>FAT<i class="bar" style="background:${MSC.INST}"></i>INST<i style="background:${MSC.SAT}"></i>SAT</span></th><td colspan="${ds.length}"></td></tr>` + (S.msOpen ? rows : "");
    }
    // people grouped by unit (CUR.W = on-screen order, used by drag-select)
    CUR.W = UNITS.flatMap(([u]) => W.filter(w => w.unit === u).map(w => w.id));
    let body = "";
    UNITS.forEach(([u, label]) => {
      const ws = W.filter(w => w.unit === u);
      if (!ws.length) return;
      body += `<tr class="mp-grp"><th class="mp-name">${esc(label)} <span>${ws.filter(w => w.active).length} คน</span></th><td colspan="${ds.length}"></td></tr>`;
      ws.forEach(w => {
        body += `<tr><th class="mp-name${w.active ? "" : " left"}" title="${esc(w.name_th)}${w.emp_code ? " · " + esc(w.emp_code) : ""}"><b>${esc(w.nickname || w.name_th)}</b><small>${esc(w.name_th)}${w.trade ? " · " + esc(w.trade) : ""}${w.active ? "" : " · ลาออก"}</small></th>`
          + ds.map(d => cell(w, d)).join("") + "</tr>";
      });
    });
    // daily summary
    const act = W.filter(w => w.active);
    const sum = (f, lab, c) => `<tr class="mp-sum ${c}"><th class="mp-name">${lab}</th>${ds.map(d => { const n = f(key(d), d); return `<td class="mp-c">${n || ""}</td>`; }).join("")}</tr>`;
    const working = (k) => act.filter(w => { const a = DATA.A.get(w.id + "|" + k), sv = DATA.SV.get(w.id + "|" + k); return (a && matchA(a)) || (sv && !a && matchSv(sv)); }).length;
    const leave = (k) => act.filter(w => { const x = DATA.X.get(w.id + "|" + k); return x && ABS[x.type] && ABS[x.type][1] === "lv"; }).length;
    const free = (k, d) => dayOff(k, d) ? 0 : act.filter(w => !DATA.A.has(w.id + "|" + k) && !DATA.X.has(w.id + "|" + k) && !DATA.SV.has(w.id + "|" + k)).length;
    const foot = sum(working, S.project || S.cust ? "คนในงานที่เลือก" : "มีงาน", "w") + sum(leave, "ลา", "l") + sum(free, "ว่าง (ยังไม่ลงงาน)", "f");
    if (!W.length) return `<div class="mp-empty">${S.cust || S.project ? "ไม่มีใครลงงานนี้ในช่วงที่เลือก ลองเปลี่ยนเดือนหรือซูม 3 เดือน" : "ไม่พบรายชื่อตามตัวกรอง"}</div>`;
    return `<div class="mp-scroll ${cls}"><table class="mp-grid"><thead><tr><th class="mp-name mp-corner" rowspan="2">ชื่อ</th>${months}</tr><tr>${dayHead}</tr></thead>
      <tbody>${miles}${body}</tbody><tfoot>${foot}</tfoot></table></div>`;
  }

  const spText = j => [j.type, j.customer].filter(Boolean).join(" ") || j.job;
  const spColor = () => (DATA.P.get("SERVICE") || { color: "#2f6fd6" }).color;
  // ขอคน flag on top of the normal cell: "ขอ" = waiting for PC (กอล์ฟ / โจ้), "✓" = confirmed from a request
  function cell(w, d) {
    let h = cell0(w, d);
    const id = w.id + "|" + key(d), rq = DATA.RQ.get(id);
    if (!rq) return h;
    const pend = rq.filter(x => x.status === "pending");
    const tip = rq.map(x => `${x.req_no} ${x.label} (${x.status === "pending" ? (x.mode === "swap" ? "ขอสลับ · รอ PC" : "รอ PC") : "Confirm"})`).join(", ");
    const flag = `<b class="mp-rq${pend.length ? "" : " ok"}" title="${esc("คำขอคน: " + tip)}">${pend.length ? "ขอ" : "✓"}</b>`;
    if (!h.includes(" data-k=")) h = h.replace("<td ", `<td data-k="${esc(id)}" `);
    return h.replace('class="mp-c', `class="mp-c${pend.length ? " rq" : ""}`).replace(/<\/td>$/, flag + "</td>");
  }
  function cell0(w, d) {
    const k = key(d), id = w.id + "|" + k, a = DATA.A.get(id), x = DATA.X.get(id), we = dayOff(k, d), sv = DATA.SV.get(id);
    const base = `mp-c${we ? " we" : ""}${k === key(today()) ? " td" : ""}`;
    // Service Plan (Confirm) next to a different plan for the same person/day → flag, never hide either one
    const clash = sv && ((a && a.project_code !== "SERVICE") || (x && ABS[x.type] && ABS[x.type][1] === "lv"));
    const flag = sv ? `<b class="mp-sp${clash ? " x" : ""}" title="${esc(clash ? "ชนกับงานจาก Service Plan: " : "Service Plan: ") + esc(sv.map(spText).join(", "))}">${clash ? "!" : "SP"}</b>` : "";
    // leave wins over planned work on the same day (work is kept and flagged)
    if (x && ABS[x.type] && ABS[x.type][1] === "lv") {
      const t = ABS[x.type], wf = a ? `<b class="mp-sp x" title="${esc("มีงานลงไว้: " + a.text)}">!</b>` : flag;
      return `<td class="${base} ab lv" data-k="${esc(id)}" title="${esc(t[2] + (x.note ? " · " + x.note : ""))}"><span>${esc(t[0])}</span>${wf}</td>`;
    }
    if (a && matchA(a)) {
      const c = colorOf(a), txt = cellText(a);
      return `<td class="${base} job${a.tentative ? " tent" : ""}" style="--c:${esc(c)}" data-k="${esc(id)}" title="${esc((a.tentative ? "จอง · " : "") + txt + (txt.includes(a.text) ? "" : " — " + a.text))}"><span>${esc(txt)}</span>${flag}</td>`;
    }
    if (sv && !a && !(x && ABS[x.type] && ABS[x.type][1] === "lv") && matchSv(sv)) {
      const txt = sv.map(j => ["SO", j.customer, j.job].filter(Boolean).join(" | ")).join(" / ");
      return `<td class="${base} job sv" style="--c:${WCOL.service}" data-k="${esc(id)}" title="${esc(sv.map(spText).join(", "))}"><span>${esc(txt)}</span>${flag}</td>`;
    }
    if (x && sv) { const t = ABS[x.type] || [x.type, "lv", x.type]; return `<td class="${base} ab ${t[1]}" data-k="${esc(id)}" title="${esc(t[2])}"><span>${esc(t[0])}</span>${flag}</td>`; }
    if (a) return `<td class="${base} dim" data-k="${esc(id)}" title="${esc(a.text)}"></td>`;
    const ed = DATA.canEdit ? ` data-k="${esc(id)}"` : "";
    if (x) { const t = ABS[x.type] || [x.type, "lv", x.type]; return `<td class="${base} ab ${t[1]}" data-k="${esc(id)}" title="${esc(t[2])}"><span>${esc(t[0])}</span></td>`; }
    return `<td class="${base}${DATA.canEdit ? " ed" : ""}"${ed}${DATA.canEdit ? ' title="กดเพื่อลงงาน"' : ""}></td>`;
  }

  function legend() {
    const n = new Map();
    DATA.assignments.forEach(a => { const c = a.project_code || "_" + a.kind; n.set(c, (n.get(c) || 0) + 1); });
    let spOnly = 0;
    DATA.SV.forEach((v, k) => { if (!DATA.A.has(k)) spOnly++; });
    if (spOnly) n.set("SERVICE", (n.get("SERVICE") || 0) + spOnly);
    const items = DATA.projects.filter(p => n.has(p.code)).sort((a, b) => n.get(b.code) - n.get(a.code))
      .map(p => `<button type="button" class="mp-lg pj ${S.project === p.code ? "on" : ""}" data-p="${esc(p.code)}" title="${esc(p.name)}">${esc(p.customer && p.code !== "SERVICE" ? p.customer + " · " : "")}${esc(shortOf(p))} <b>${n.get(p.code)}</b></button>`)
      .concat(Object.keys(KIND).filter(k => n.has("_" + k)).map(k => `<span class="mp-lg pj">${KIND[k][1]} <b>${n.get("_" + k)}</b></span>`));
    const tn = {}; DATA.assignments.forEach(a => { if (isOld(a)) return; const t = typeOf(a); tn[t] = (tn[t] || 0) + 1; }); tn.service = (tn.service || 0) + spOnly;
    const nOld = DATA.assignments.filter(isOld).length;
    const types = WT.map(([v, l]) => `<span class="mp-lg ty"><i style="background:${WCOL[v]}"></i>${l} <b>${tn[v] || 0}</b></span>`).join("")
      + (nOld ? `<span class="mp-lg ty" title="งานจากชีตเดิมที่ยังไม่ได้ผูก Job no. กับ RAK_Master_Project_on_hand (ผูกได้ที่ ข้อมูลหลัก → งาน / ลูกค้า)"><i style="background:${OLD_COL}"></i>งานเดิม (ยังไม่ผูก Job no.) <b>${nOld}</b></span>` : "");
    const um = DATA.serviceUnmatched || [];
    const review = um.length && DATA.canEdit ? `<details class="mp-um"><summary>ชื่อใน Service Plan ที่จับคู่กับช่างไม่ได้ ${um.length} งาน</summary><ul>${um.map(j => `<li><b>${esc(j.job || "แถว " + j.row)}</b> ${esc(j.customer)} · ${esc(j.status)} — ${j.names.map(esc).join(", ")}</li>`).join("")}</ul><p>แก้ชื่อในใบขอคนให้ตรงกับชื่อจริงของช่าง (ถ้าชื่อซ้ำให้ใส่ต้นนามสกุล เช่น "สัญญา สม") แล้ว board จะอัปเดตเอง</p></details>` : "";
    return `<div class="mp-legend"><span class="mp-lt">สีตามประเภทงาน</span>${types}<span class="mp-sep"></span><span class="mp-lt">งาน (กดเพื่อกรอง)</span>${items.join("")}<span class="mp-lg"><i class="tent-i"></i>จอง (ยังไม่ยืนยัน)</span><span class="mp-lg"><b class="mp-sp in">SP</b>Confirm จาก Service Plan</span><span class="mp-lg"><b class="mp-sp x in">!</b>ชนกับ Service Plan</span><span class="mp-lg"><b class="mp-rq in">ขอ</b>คำขอคนรอ PC Confirm</span><span class="mp-lg"><i class="lv-i"></i>ลา</span><span class="mp-lg"><i class="off-i"></i>H / PH วันหยุด</span></div>${review}`;
  }

  // Contiguous "จอง" run of the same text for one person (gaps of days off / blank Sundays allowed).
  function runOf(wid, day, text) {
    const days = [day];
    for (const dir of [-1, 1]) {
      let d = fromKey(day), gap = 0;
      while (gap < 3) {
        d = addDays(d, dir); const k = key(d), a = DATA.A.get(wid + "|" + k);
        if (k < DATA.from || k > DATA.to) break;
        if (a && a.tentative && a.text === text) { days.push(k); gap = 0; } else if (!a) gap++; else break;
      }
    }
    return days.sort();
  }
  const reloadBoard = () => { if (DATA) DATA.want = ""; DCACHE.clear(); return ensure().then(draw); };
  function detail(k) {
    const [wid, day] = k.split("|"), w = DATA.workers.find(x => x.id === wid), a = DATA.A.get(k), x = DATA.X.get(k), sv = DATA.SV.get(k) || [], d = fromKey(day);
    const pj0 = a && a.project_code ? DATA.P.get(a.project_code) : null;
    const mm = masterOf(pj0), odd = mm && linkOdd(pj0, mm);
    let body = a ? `<dl class="mp-dl"><dt>ประเภทงาน</dt><dd><i class="mp-dot" style="background:${esc(colorOf(a))}"></i>${esc(WTL[typeOf(a)] || "—")}</dd>
      ${mm ? `<dt>Job no.</dt><dd>${esc(mm.job_no)}</dd>
      <dt>ลูกค้า</dt><dd>${esc(mm.customer || "—")}${mm.customer_full ? ` <span class="mp-m">${esc(mm.customer_full)}</span>` : ""}</dd>
      <dt>ชื่องาน</dt><dd>${esc(mm.job_full || mm.job_name)}${mm.job_name && mm.job_name !== mm.job_full ? ` <span class="mp-m">(${esc(mm.job_name)})</span>` : ""}</dd>
      ${odd ? `<dt>⚠ ตรวจสอบ</dt><dd class="mp-odd">งานในแผนคือ <b>${esc(pj0.customer)} · ${esc(pj0.name)}</b> แต่ผูกกับ Job no. ${esc(mm.job_no)} ของ ${esc(mm.customer)} — Job no. น่าจะผิด แก้ได้ที่ ข้อมูลหลัก → งาน / ลูกค้า</dd>` : ""}`
      : `${pj0 && pj0.customer ? `<dt>ลูกค้า</dt><dd>${esc(pj0.customer)}</dd>` : ""}
      <dt>ชื่องาน</dt><dd>${esc(pj0 ? pj0.name : projName(a))}${pj0 && pj0.short_name ? ` <span class="mp-m">(${esc(pj0.short_name)})</span>` : ""}</dd>
      <dt>Job no.</dt><dd>${esc(pj0 && pj0.job_no ? pj0.job_no + " (ไม่พบใน master)" : "— ยังไม่ผูก Job no.")}</dd>`}
      <dt>รายละเอียด</dt><dd>${esc(a.text)}</dd>
      <dt>สถานะ</dt><dd>${a.tentative ? "จอง (ยังไม่ยืนยัน)" : "ยืนยันแล้ว"}${a.updated_by ? ` <span class="mp-m">· ลงโดย ${esc(a.updated_by)}</span>` : ""}</dd></dl>`
      : x ? `<dl class="mp-dl"><dt>ประเภท</dt><dd>${esc((ABS[x.type] || [0, 0, x.type])[2])}</dd>${x.note ? `<dt>หมายเหตุ</dt><dd>${esc(x.note)}</dd>` : ""}</dl>` : "";
    if (a && x && ABS[x.type] && ABS[x.type][1] === "lv") body = `<dl class="mp-dl"><dt>วันลา</dt><dd>${esc(ABS[x.type][2])}${x.note ? " · " + esc(x.note) : ""}</dd><dt>งานที่ลงไว้</dt><dd>⚠ ${esc(a.text)}</dd></dl>`;
    let actions = "";
    if (a && a.tentative) {
      const run = runOf(wid, day, a.text), lo = run[0], hi = run[run.length - 1];
      const team = DATA.assignments.filter(y => y.tentative && y.text === a.text && y.day >= lo && y.day <= hi);
      const teamN = new Set(team.map(y => y.worker_id)).size;
      actions = DATA.canConfirm ? `<div class="mp-act"><span>Confirm Manpower</span>
        <button type="button" class="mp-ok" data-scope="day">วันนี้</button>
        ${run.length > 1 ? `<button type="button" class="mp-ok" data-scope="run">ทั้งช่วงของคนนี้ (${run.length} วัน)</button>` : ""}
        ${teamN > 1 ? `<button type="button" class="mp-ok" data-scope="team">ทั้งทีม (${teamN} คน · ${team.length} ช่อง)</button>` : ""}
        <small>${esc(fromKey(lo).getDate() + " " + MS[fromKey(lo).getMonth()])} – ${esc(fromKey(hi).getDate() + " " + MS[fromKey(hi).getMonth()])} · คำว่า "จอง" จะถูกตัดออก</small></div>`
        : `<p class="mp-ro">${DATA.canEdit ? "บัญชีนี้ลงงานจองได้ แต่ Confirm Manpower ไม่ได้" : "ยืนยันได้เฉพาะ SC / PC / SSM"}</p>`;
      actions += `<script type="application/json" class="mp-run">${JSON.stringify({ text: a.text, run, team: team.map(y => [y.worker_id, y.day]) }).replace(/</g, "\\u003c")}</script>`;
    }
    if (sv.length) body += `<div class="mp-svd"><h4><b class="mp-sp in">SP</b> Confirm จาก Service Plan</h4>${sv.map(j => `<dl class="mp-dl"><dt>Job no.</dt><dd>${esc(j.job)} · ${esc(j.type)}</dd><dt>ลูกค้า</dt><dd>${esc(j.customer)}</dd><dt>งาน</dt><dd>${esc(j.desc.split("\n")[0])}</dd><dt>สถานะ</dt><dd>${esc(j.status)}</dd></dl>`).join("")}<p class="mp-ro">ข้อมูลมาจากใบขอคนอัตโนมัติ แก้ที่ Service Plan / ใบขอคน${(a && a.project_code !== "SERVICE") ? " · ⚠ วันนี้มีงานอื่นลงไว้แล้ว ตรวจสอบว่าคนนี้ไปงานไหน" : ""}</p></div>`;
    const rq = DATA.RQ.get(k) || [];
    if (rq.length) body += `<div class="mp-svd"><h4><b class="mp-rq in">ขอ</b> คำขอคนจาก Service Plan</h4>${rq.map(q => `<div class="mp-rqr"><span><b>${esc(q.req_no)}</b> ${esc(q.label)} · <b class="${q.status === "pending" ? "w" : "c"}">${q.status === "pending" ? (q.mode === "swap" ? "ขอสลับคน · รอ PC" : "รอ PC Confirm") : "Confirm แล้ว"}</b></span><button type="button" class="mp-ok" data-rq="${q.rid}">${q.status === "pending" && DATA.canApprove ? "เปิดคำขอ · Confirm / Reject" : "เปิดคำขอ"}</button></div>`).join("")}<p class="mp-ro">สถานะเดียวกับเมนู Service Plan · Confirm / Reject: ดิว กอล์ฟ (ทุกคน) · โจ้ (เฉพาะช่างไฟฟ้า)</p></div>`;
    const form = DATA.canEdit ? editForms({ ids: [wid], from: day, to: day, a, x }) : "";
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="รายละเอียด"><header><div><b>${esc(w ? (w.nickname || w.name_th) : wid)}</b> <span>${esc(w ? w.name_th : "")}</span><div class="mp-when">${DS[d.getDay()]}. ${d.getDate()} ${MF[d.getMonth()]} ${d.getFullYear()}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>${body}${actions}${form}<div class="mp-msg" role="status"></div></div>`;
    if (DATA.canEdit) wireForms(el, { ids: [wid], from: day, to: day }, () => close());
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", async e => {
      if (e.target === el || e.target.closest(".mp-x")) return close();
      const rqb = e.target.closest("[data-rq]");
      if (rqb) { close(); return void (window.SPRequest && window.SPRequest.open(+rqb.dataset.rq, reloadBoard)); }
      const b = e.target.closest(".mp-ok"); if (!b) return;
      const info = JSON.parse(el.querySelector(".mp-run").textContent), scope = b.dataset.scope;
      const cells = scope === "day" ? [[wid, day]] : scope === "run" ? info.run.map(dd => [wid, dd]) : info.team;
      const by = new Map(); cells.forEach(([w2, d2]) => { if (!by.has(w2)) by.set(w2, []); by.get(w2).push(d2); });
      el.querySelectorAll(".mp-ok").forEach(x => { x.disabled = true; });
      const msg = el.querySelector(".mp-msg"); msg.textContent = "กำลังบันทึก…";
      try {
        const r = await fetch("/api/manpower/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: info.text, items: [...by].map(([worker_id, days]) => ({ worker_id, days })) }) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(res.error || r.status);
        cells.forEach(([w2, d2]) => { const y = DATA.A.get(w2 + "|" + d2); if (y && y.tentative && y.text === info.text) { y.tentative = false; y.text = res.text; } });
        msg.textContent = `ยืนยันแล้ว ${res.confirmed} ช่อง`;
        draw(); setTimeout(close, 700);
      } catch (err) { msg.textContent = "บันทึกไม่สำเร็จ (" + err.message + ")"; el.querySelectorAll(".mp-ok").forEach(x => { x.disabled = false; }); }
    });
    document.addEventListener("keydown", onKey);
    (document.fullscreenElement || document.body).appendChild(el);
    el.querySelector(".mp-x").focus();
  }


  /* ---------- add / edit forms (SC / PC / SSM) — one cell, or a block dragged on the grid ---------- */
  const fmtD = k => { const d = fromKey(k); return d.getDate() + " " + MS[d.getMonth()] + " " + String(d.getFullYear()).slice(2); };
  function picker(ids) {
    const sel = new Set(ids);
    return `<details class="mp-pick"><summary>คนที่จะลง: <b class="mp-pn">${sel.size}</b> คน · เพิ่ม / เอาออก</summary><div class="mp-pl">${UNITS.map(([u, l]) => {
      const ws = DATA.workers.filter(w => w.unit === u && (w.active || sel.has(w.id)));
      return ws.length ? `<fieldset><legend>${esc(l)}</legend>${ws.map(w => `<label><input type="checkbox" name="who" value="${esc(w.id)}" ${sel.has(w.id) ? "checked" : ""}>${esc(w.nickname || w.name_th)}</label>`).join("")}</fieldset>` : "";
    }).join("")}</div></details>`;
  }
  function editForms({ ids, from, to, a, x, bulk }) {
    const pj = a && a.project_code ? DATA.P.get(a.project_code) : null;
    const cust = pj ? pj.customer || "" : (S.cust || ""), job = pj ? pj.name : "", jno = pj ? pj.job_no || "" : "";
    const wt = a ? (a.work_type || "other") : "";
    const note = a && pj && a.text !== pj.name ? a.text.replace(/^จอง\s*/, "") : (a && !pj ? a.text : "");
    const isLv = x && ABS[x.type] && ABS[x.type][1] === "lv";
    const toField = `<label>ถึงวันที่<input type="date" name="to" value="${esc(to)}" min="${esc(from)}" max="2027-12-31"></label>`;
    return `${picker(ids)}
      <details class="mp-fwrap" ${a || isLv ? "" : "open"}><summary>${a ? "แก้ไขงาน" : "ลงงาน"}</summary><form class="mp-form mp-wform" autocomplete="off">
        <label>ลูกค้า<input name="customer" list="mpCustL" value="${esc(cust)}" placeholder="เช่น UCT, Ham-Let, SMT" required></label>
        <label>ชื่องาน<input name="job" list="mpJobL" value="${esc(job)}" placeholder="เลือกงานเดิมหรือพิมพ์ชื่องานใหม่" required></label>
        <label>Job no.<input name="job_no" value="${esc(jno)}" placeholder="เช่น 04002026"></label>
        <fieldset><legend>ประเภทงาน</legend>${WT.map(([v, l]) => `<label class="mp-wt"><input type="radio" name="work_type" value="${v}" ${wt === v ? "checked" : ""} required>${l}</label>`).join("")}</fieldset>
        <label class="wide">รายละเอียด (ไม่บังคับ)<input name="note" value="${esc(note)}" placeholder="เช่น ประกอบถัง T-05, เดินสายตู้ MCC"></label>
        ${toField}
        <div class="mp-chks"><label><input type="checkbox" name="skip" checked> ข้ามวันอาทิตย์ / วันหยุด / วันลา</label><label${a && a.tentative && !DATA.canConfirm ? ' title="งานจองนี้ต้องให้ SC / PC / SSM คนอื่น Confirm"' : ""}><input type="checkbox" name="tentative" ${a && a.tentative ? "checked" : ""}${a && a.tentative && !DATA.canConfirm ? " disabled" : ""}> จอง (ยังไม่ยืนยัน)</label></div>
        <div class="mp-fbtn"><button type="submit" class="mp-save">บันทึก</button>${a || bulk ? `<button type="button" class="mp-del">${bulk ? "ลบงานทั้งหมดในช่องที่เลือก" : "ลบงานวันนี้"}</button>` : ""}</div>
        <datalist id="mpCustL">${customers(true).map(c => `<option value="${esc(c)}">`).join("")}</datalist><datalist id="mpJobL"></datalist>
      </form></details>
      <details class="mp-fwrap lv" ${isLv ? "open" : ""}><summary>${isLv ? "แก้ไข / ยกเลิกวันลา" : "ลงวันลา"}</summary><form class="mp-form mp-lform" autocomplete="off">
        <fieldset><legend>ประเภทการลา</legend>${LV.map(([v, l]) => `<label class="mp-wt"><input type="radio" name="type" value="${v}" ${isLv && x.type === v ? "checked" : ""} required>${l}</label>`).join("")}</fieldset>
        ${toField}
        <label>หมายเหตุ (ไม่บังคับ)<input name="note" value="${esc(isLv ? x.note || "" : "")}" placeholder="เช่น ไปโรงพยาบาล, ลาครึ่งวันเช้า"></label>
        <div class="mp-chks"><label><input type="checkbox" name="skip" checked> ข้ามวันอาทิตย์ / วันหยุด</label><label><input type="checkbox" name="clear" checked> ลบงานที่ลงไว้ในวันลา</label></div>
        <div class="mp-fbtn"><button type="submit" class="mp-save">บันทึกวันลา</button>${isLv || bulk ? `<button type="button" class="mp-ldel">${bulk ? "ยกเลิกวันลาทั้งหมดในช่องที่เลือก" : "ยกเลิกวันลาวันนี้"}</button>` : ""}</div>
      </form></details>`;
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || r.status);
    return res;
  }
  function wireForms(el, ctx, close) {
    const msg = el.querySelector(".mp-msg");
    const reload = () => { if (DATA) DATA.want = ""; DCACHE.clear(); return ensure().then(draw); };
    const who = () => [...el.querySelectorAll("[name=who]:checked")].map(i => i.value);
    const pn = el.querySelector(".mp-pn");
    el.querySelectorAll("[name=who]").forEach(i => i.addEventListener("change", () => { pn.textContent = who().length; }));
    const daysOf = (f) => { const out = []; for (let d = fromKey(ctx.from), e = fromKey(f.to.value || ctx.to); d <= e; d = addDays(d, 1)) out.push(key(d)); return out; };
    const run = async (btn, work, done) => {
      const ids = who();
      if (!ids.length) { msg.textContent = "เลือกคนอย่างน้อย 1 คน"; return; }
      btn.disabled = true; msg.textContent = "กำลังบันทึก…";
      try { const res = await work(ids); msg.textContent = done(res); await reload(); setTimeout(close, 600); }
      catch (err) { msg.textContent = "ไม่สำเร็จ (" + err.message + ")"; btn.disabled = false; }
    };
    const f = el.querySelector(".mp-wform");
    if (f) {
      const jobsFor = () => {
        const c = lc(f.customer.value), seen = new Set();
        const opts = DATA.projects.filter(p => !c || lc(p.customer) === c).map(p => { seen.add(jobKey(p.job_no)); return `<option value="${esc(p.name)}">${esc(p.job_no || "")}</option>`; });
        DATA.master.filter(m => (!c || lc(m.customer) === c) && !seen.has(jobKey(m.job_no))).forEach(m => opts.push(`<option value="${esc(m.job_full || m.job_name)}">${esc(m.job_no + " · " + m.job_name)}</option>`));
        el.querySelector("#mpJobL").innerHTML = opts.join("");
      };
      // typing a Job no. that is in the master fills customer + job name
      f.job_no.addEventListener("change", () => { const m = DATA.MJ.get(jobKey(f.job_no.value)); if (m) { if (!f.customer.value) f.customer.value = m.customer; if (!f.job.value) f.job.value = m.job_full || m.job_name; jobsFor(); } });
      jobsFor();
      f.customer.addEventListener("input", jobsFor);
      f.job.addEventListener("change", () => {
        const hit = DATA.projects.find(p => lc(p.name) === lc(f.job.value) && (!f.customer.value || lc(p.customer) === lc(f.customer.value)));
        const mh = !hit && DATA.master.find(m => (lc(m.job_full) === lc(f.job.value) || lc(m.job_name) === lc(f.job.value)) && (!f.customer.value || lc(m.customer) === lc(f.customer.value)));
        if (mh) { if (!f.customer.value) f.customer.value = mh.customer; if (!f.job_no.value) f.job_no.value = mh.job_no; }
        if (hit) { if (!f.customer.value) f.customer.value = hit.customer || ""; if (hit.job_no && !f.job_no.value) f.job_no.value = hit.job_no; if (hit.code === "SERVICE" && !f.querySelector("[name=work_type]:checked")) f.querySelector("[value=service]").checked = true; }
      });
      f.addEventListener("submit", e => { e.preventDefault(); run(f.querySelector(".mp-save"), ids => post("/api/manpower/assign", {
        worker_ids: ids, from: ctx.from, to: f.to.value || ctx.to, customer: f.customer.value, job: f.job.value, job_no: f.job_no.value,
        work_type: (f.querySelector("[name=work_type]:checked") || {}).value, note: f.note.value, tentative: f.tentative.checked, skip_off: f.skip.checked }),
        res => `บันทึกแล้ว ${res.saved} ช่อง (${res.people} คน)`); });
      const del = f.querySelector(".mp-del");
      if (del) del.addEventListener("click", () => run(del, ids => post("/api/manpower/clear", { items: ids.map(worker_id => ({ worker_id, days: daysOf(f) })) }), res => `ลบแล้ว ${res.removed} ช่อง`));
    }
    const lf = el.querySelector(".mp-lform");
    if (lf) {
      lf.addEventListener("submit", e => { e.preventDefault(); run(lf.querySelector(".mp-save"), ids => post("/api/manpower/leave", {
        worker_ids: ids, from: ctx.from, to: lf.to.value || ctx.to, type: (lf.querySelector("[name=type]:checked") || {}).value, note: lf.note.value, skip_off: lf.skip.checked, clear_work: lf.clear.checked }),
        res => `บันทึกวันลาแล้ว ${res.saved} วัน${res.removed ? ` · ลบงานที่ลงไว้ ${res.removed} ช่อง` : ""}`); });
      const ld = lf.querySelector(".mp-ldel");
      if (ld) ld.addEventListener("click", () => run(ld, ids => post("/api/manpower/leave-clear", { items: ids.map(worker_id => ({ worker_id, days: daysOf(lf) })) }), res => `ยกเลิกวันลาแล้ว ${res.removed} วัน`));
    }
  }
  // Block dragged on the grid: people × days
  function bulk(ids, from, to) {
    const n = (fromKey(to) - fromKey(from)) / 864e5 + 1;
    const names = ids.map(id => { const w = DATA.workers.find(x => x.id === id); return w ? w.nickname || w.name_th : id; });
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="ลงงานหลายช่อง"><header><div><b>เลือก ${ids.length} คน × ${n} วัน</b><div class="mp-when">${esc(fmtD(from))} – ${esc(fmtD(to))}</div><div class="mp-when">${esc(names.join(", "))}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>${editForms({ ids, from, to, bulk: true })}<div class="mp-msg" role="status"></div></div>`;
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); clearSel(); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".mp-x")) close(); });
    document.addEventListener("keydown", onKey);
    (document.fullscreenElement || document.body).appendChild(el);
    wireForms(el, { ids, from, to }, close);
    el.querySelector(".mp-x").focus();
  }
  // drag-select (editors): press on a cell, drag across people / days, release → bulk dialog; a plain click opens the cell
  let DRAG = null;
  const clearSel = () => ROOT && ROOT.querySelectorAll("td.sel").forEach(t => t.classList.remove("sel"));
  function dragRect(k1, k2) {
    const [w1, d1] = k1.split("|"), [w2, d2] = k2.split("|"), W = CUR.W, i1 = W.indexOf(w1), i2 = W.indexOf(w2);
    const lo = Math.min(i1, i2), hi = Math.max(i1, i2);
    return { ids: W.slice(lo, hi + 1), from: d1 < d2 ? d1 : d2, to: d1 < d2 ? d2 : d1 };
  }
  function paintSel(r) {
    clearSel();
    const set = new Set(r.ids);
    ROOT.querySelectorAll(".mp-grid tbody td[data-k]").forEach(t => { const [w, d] = t.dataset.k.split("|"); if (set.has(w) && d >= r.from && d <= r.to) t.classList.add("sel"); });
  }
  function bindDrag(g) {
    g.addEventListener("pointerdown", e => {
      const td = e.target.closest("tbody td[data-k]");
      if (!td || e.button !== 0) return;
      DRAG = { k0: td.dataset.k, k1: td.dataset.k, moved: false };
      e.preventDefault();
    });
    g.addEventListener("pointerover", e => {
      if (!DRAG) return;
      const td = e.target.closest("tbody td[data-k]");
      if (!td || td.dataset.k === DRAG.k1) return;
      DRAG.k1 = td.dataset.k; DRAG.moved = DRAG.k1 !== DRAG.k0;
      paintSel(dragRect(DRAG.k0, DRAG.k1));
    });
    const end = () => {
      if (!DRAG) return;
      const d = DRAG; DRAG = null;
      if (!d.moved) { clearSel(); detail(d.k0); return; }
      const r = dragRect(d.k0, d.k1);
      bulk(r.ids, r.from, r.to);
    };
    g.addEventListener("pointerup", end);
    g.addEventListener("pointercancel", () => { DRAG = null; clearSel(); });
    if (!window.__mpUp) { window.__mpUp = true; document.addEventListener("pointerup", () => { if (DRAG) { DRAG = null; clearSel(); } }); }
  }

  /* ---------- ข้อมูลหลัก / ประวัติการแก้ไข (SC / PC / SSM) ---------- */
  const tabs = can => `<nav class="mp-tabs"><a href="#manpower" class="${S.page === "dash" ? "on" : ""}">ภาพรวม</a><a href="#manpower/board" class="${S.page === "board" ? "on" : ""}">วางแผนกำลังคน</a>${can ? `<a href="#manpower/data" class="${S.page === "data" ? "on" : ""}">ข้อมูลหลัก</a><a href="#manpower/log" class="${S.page === "log" ? "on" : ""}">ประวัติการแก้ไข</a>` : ""}</nav>`;
  const pageHead = (title, can) => `<div class="mp-head"><div class="mp-title"><h2>${title || "Manpower"}</h2>${tabs(can)}</div></div>`;
  const STATUS = [["active", "Active"], ["hold", "Hold"], ["postponed", "เลื่อน"], ["cancelled", "ยกเลิก"], ["done", "เสร็จแล้ว"]];
  async function dataPage(box) {
    let M;
    try { const r = await fetch("/api/manpower/master", { cache: "no-store" }); M = await r.json(); if (!r.ok) throw new Error(M.error || r.status); }
    catch (err) { box.innerHTML = `<div class="mp-empty">โหลดข้อมูลไม่สำเร็จ (${esc(err.message)})</div>`; return; }
    const tab = S.dtab || "workers";
    const opt = (list, v) => list.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    const wRow = w => `<tr data-id="${esc(w ? w.id : "")}"><td><input name="emp_code" value="${esc(w ? w.emp_code || "" : "")}" placeholder="R#####" size="8"></td>
      <td><input name="name_th" value="${esc(w ? w.name_th : "")}" placeholder="ชื่อ นามสกุล" required></td><td><input name="nickname" value="${esc(w ? w.nickname || "" : "")}" size="8"></td>
      <td><select name="unit">${opt(UNITS.map(([u]) => [u, u]), w ? w.unit : "ME")}</select></td><td><input name="trade" value="${esc(w ? w.trade || "" : "")}" placeholder="เช่น ประกอบ" size="10"></td>
      <td><input name="sort" type="number" value="${esc(w ? w.sort : "")}" style="width:70px"></td><td class="c"><input name="active" type="checkbox" ${!w || w.active ? "checked" : ""}></td>
      <td><button type="button" class="mp-rs">${w ? "บันทึก" : "เพิ่มช่าง"}</button></td></tr>`;
    M.master = M.master || []; const mj = new Map(M.master.map(m => [jobKey(m.job_no), m]));
    // งาน / ลูกค้า: jobs come from RAK_Master_Project_on_hand (edited in Supabase); Manpower keeps only status + milestone colour.
    // Projects imported from the old sheet that have no matching Job no. are listed below to be linked.
    const linked = new Map(); M.projects.forEach(p => { if (p.job_no && mj.has(jobKey(p.job_no)) && !linked.has(jobKey(p.job_no))) linked.set(jobKey(p.job_no), p); });
    const legacy = M.projects.filter(p => !(p.job_no && mj.has(jobKey(p.job_no))));
    const mRow = m => { const p = linked.get(jobKey(m.job_no));
      return `<tr data-code="${esc(p ? p.code : "")}" data-jn="${esc(m.job_no)}" data-q="${esc(lc([m.job_no, m.customer, m.job_full, m.job_name].join(" ")))}"><td>${esc(m.job_no)}</td><td>${esc(m.customer)}</td><td>${esc(m.job_full)}</td><td>${esc(m.job_name !== m.job_full ? m.job_name : "")}</td>
      <td><select name="status">${opt(STATUS, p ? p.status : "active")}</select></td><td>${p ? (linkOdd(p, m) ? `<span class="mp-odd" title="ผูกกับงานในแผน: ${esc(p.customer + " · " + p.name)} — ลูกค้าไม่ตรง">⚠ ผูกกับ ${esc(p.customer)} · ${esc(p.name)}</span> <button type="button" class="mp-hd mp-unlink" data-code="${esc(p.code)}">ยกเลิกการผูก</button>` : `<span class="mp-on">ใช้ในแผน</span>`) : ""}</td><td><input name="color" type="color" value="${esc(p ? p.color : "#6d7582")}"></td>
      <td><button type="button" class="mp-rs mp-ms-save">บันทึก</button></td></tr>`; };
    const lRow = p => `<tr data-code="${esc(p.code)}"><td>${esc(p.customer || "")}</td><td>${esc(p.name)}</td><td><input name="job_no" list="mpMJ" value="${esc(p.job_no || "")}" placeholder="เลือก Job no." size="12">${p.job_no ? ` <em class="mp-warn" title="ไม่พบ Job no. นี้ใน RAK_Master_Project_on_hand">?</em>` : ""}</td>
      <td><select name="status">${opt(STATUS, p.status)}</select></td><td><input name="color" type="color" value="${esc(p.color)}"></td><td><button type="button" class="mp-rs mp-lg-save">บันทึก</button></td></tr>`;
    // sortable master list: click a header, click again to reverse; blanks always last
    if (!S.msort) S.msort = { k: "job_no", dir: -1 };
    const MSK = [["job_no", "Job no."], ["customer", "Customer_Name"], ["job_full", "Job_Full_name"], ["job_name", "Job_name (ชื่อย่อ)"], ["status", "สถานะ"], ["used", "ใช้ในแผน"]];
    const STL = Object.fromEntries(STATUS);
    const sv = (m, k) => { const p = linked.get(jobKey(m.job_no)); return k === "status" ? STL[p ? p.status : "active"] || "" : k === "used" ? (p ? "ใช้ในแผน" : "") : k === "job_name" ? (m.job_name !== m.job_full ? m.job_name || "" : "") : String(m[k] || ""); };
    const sortedMaster = () => M.master.slice().sort((a, b) => { const x = sv(a, S.msort.k), y = sv(b, S.msort.k);
      if (!x !== !y) return x ? -1 : 1;
      return S.msort.dir * x.localeCompare(y, "th", { numeric: true }) || String(b.job_no).localeCompare(String(a.job_no)); });
    const projBody = () => !M.masterTable ? `<p class="mp-hint"><b>อ่านตาราง RAK_Master_Project_on_hand ไม่ได้</b> · ตรวจชื่อตารางใน Supabase</p>` : `<p class="mp-hint">ข้อมูลงานมาจากตาราง <b>RAK_Master_Project_on_hand</b> (${M.master.length} งาน) · แก้ชื่องาน / ลูกค้า / ชื่อย่อ ที่ตารางนั้นใน Supabase · ที่นี่ตั้งได้เฉพาะสถานะและสี Milestone · ช่องในตารางแผนแสดง "ประเภทงาน | Customer_Name | Job_name"</p>
        <input class="mp-mq" type="search" placeholder="ค้นหา Job no. / ลูกค้า / ชื่องาน">
        <table class="mp-mt mp-jobs"><thead><tr>${MSK.map(([k, l]) => `<th data-sk="${k}" class="${S.msort.k === k ? "on" : ""}">${l}<span class="ar">${S.msort.k === k ? (S.msort.dir > 0 ? "▲" : "▼") : "↕"}</span></th>`).join("")}<th>สี Milestone</th><th></th></tr></thead><tbody>${sortedMaster().map(mRow).join("")}</tbody></table>
        ${legacy.length ? `<h4>งานเดิมจากชีต ที่ยังไม่ได้ผูก Job no. (${legacy.length})</h4><p class="mp-hint">เลือก Job no. จาก master แล้วกดบันทึก · งานและ Milestone เดิมจะย้ายไปใช้ชื่อจาก master ให้ · งานรวมหลายลูกค้า (เช่น Service) ไม่ต้องผูกก็ได้</p>
        <datalist id="mpMJ">${M.master.map(m => `<option value="${esc(m.job_no)}">${esc((m.customer ? m.customer + " · " : "") + (m.job_full || m.job_name))}</option>`).join("")}</datalist>
        <table class="mp-mt"><thead><tr><th>ลูกค้า (เดิม)</th><th>ชื่องาน (เดิม)</th><th>Job no.</th><th>สถานะ</th><th>สี Milestone</th><th></th></tr></thead><tbody>${legacy.map(lRow).join("")}</tbody></table>` : ""}`;
    const years = [...new Set(M.holidays.map(h => h.day.slice(0, 4)))].sort();
    const hBody = `<form class="mp-hadd"><input type="date" name="day" min="2026-01-01" max="2027-12-31" required><input name="name" placeholder="ชื่อวันหยุด เช่น วันสงกรานต์"><select name="type"><option value="PH">PH · วันหยุดนักขัตฤกษ์</option><option value="EX">EX · วันหยุดพิเศษบริษัท</option></select><button type="submit" class="mp-rs">เพิ่มวันหยุด</button></form>
      <p class="mp-hint">วันอาทิตย์เป็นวันหยุดอยู่แล้ว ไม่ต้องเพิ่ม · ปี 2027 รอปฏิทินบริษัทจาก HR</p>
      ${years.map(y => `<h4>${y}</h4><table class="mp-mt"><tbody>${M.holidays.filter(h => h.day.startsWith(y)).map(h => `<tr><td>${esc(fmtD(h.day))}</td><td>${esc(DS[fromKey(h.day).getDay()])}</td><td>${esc(h.type)}</td><td>${esc(h.name || "")}</td><td><button type="button" class="mp-hd" data-day="${esc(h.day)}">ลบ</button></td></tr>`).join("")}</tbody></table>`).join("") || `<p class="mp-hint">ยังไม่มีวันหยุดบริษัท</p>`}`;
    box.innerHTML = `<div class="mp-dtabs">${[["workers", `ช่าง (${M.workers.length})`], ["projects", `งาน / ลูกค้า (${M.masterTable ? M.master.length : M.projects.length})`], ["holidays", `วันหยุดบริษัท (${M.holidays.length})`]].map(([k, l]) => `<button type="button" data-t="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="mp-card">${tab === "workers" ? `<p class="mp-hint">ใส่รหัสพนักงานให้คนที่ยังไม่มี (รหัส X###) แล้วกดบันทึก ข้อมูลงานและวันลาเดิมจะย้ายตามให้ · เอาติ๊ก "ทำงานอยู่" ออกเมื่อลาออก (ประวัติยังอยู่)</p>
        <table class="mp-mt"><thead><tr><th>รหัสพนักงาน</th><th>ชื่อ-นามสกุล</th><th>ชื่อเล่น</th><th>หน่วยงาน</th><th>ตำแหน่ง</th><th>ลำดับ</th><th>ทำงานอยู่</th><th></th></tr></thead><tbody>${wRow(null)}${M.workers.map(wRow).join("")}</tbody></table>`
      : tab === "projects" ? projBody()
      : hBody}</div><div class="mp-msg mp-pmsg" role="status"></div>`;
    const msg = box.querySelector(".mp-pmsg");
    const done = async (fn, okText) => { msg.textContent = "กำลังบันทึก…"; try { await fn(); msg.textContent = okText; if (DATA) DATA.want = ""; DCACHE.clear(); ensure(); dataPage(box).then(() => { box.querySelector(".mp-pmsg").textContent = okText; }); } catch (err) { msg.textContent = "บันทึกไม่สำเร็จ — " + (err.message === "input" ? "ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง ตรวจช่องที่ต้องกรอกอีกครั้ง" : err.message); } };
    box.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { S.dtab = b.dataset.t; dataPage(box); }));
    box.querySelectorAll("tr[data-id] .mp-rs").forEach(b => b.addEventListener("click", () => { const tr = b.closest("tr"), v = n => tr.querySelector(`[name=${n}]`);
      // QA-06: say which field is missing or wrong before sending, and put the cursor there
      tr.querySelectorAll("[aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
      const code = v("emp_code").value.trim().toUpperCase(), bad = (el, t) => { el.setAttribute("aria-invalid", "true"); el.focus(); msg.textContent = t; };
      if (!v("name_th").value.trim()) return bad(v("name_th"), "กรอกชื่อ-นามสกุลของช่างก่อน");
      if (code && !/^R\d{4,8}$/.test(code)) return bad(v("emp_code"), "รหัสพนักงานต้องขึ้นต้นด้วย R ตามด้วยตัวเลข 4–8 หลัก เช่น R69010 (เว้นว่างได้ถ้ายังไม่มี)");
      done(() => post("/api/manpower/master/worker", { id: tr.dataset.id, emp_code: v("emp_code").value.trim(), name_th: v("name_th").value, nickname: v("nickname").value, unit: v("unit").value, trade: v("trade").value, sort: v("sort").value, active: v("active").checked }), tr.dataset.id ? "บันทึกข้อมูลช่างแล้ว" : "เพิ่มช่างแล้ว"); }));
    box.querySelectorAll(".mp-ms-save").forEach(b => b.addEventListener("click", () => { const tr = b.closest("tr"), v = n => tr.querySelector(`[name=${n}]`);
      const lp = M.projects.find(x => x.code === tr.dataset.code), lm = mj.get(jobKey(tr.dataset.jn));
      if (lp && lm && linkOdd(lp, lm)) { msg.textContent = "งานนี้ผูก Job no. ไม่ตรงลูกค้า — กด ยกเลิกการผูก ก่อน แล้วผูก Job no. ที่ถูกต้องในรายการงานเดิม"; return; }
      done(() => post("/api/manpower/master/project", { code: tr.dataset.code, job_no: tr.dataset.jn, status: v("status").value, color: v("color").value }), "บันทึกงานแล้ว"); }));
    box.querySelectorAll(".mp-lg-save").forEach(b => b.addEventListener("click", () => { const tr = b.closest("tr"), v = n => tr.querySelector(`[name=${n}]`), p = M.projects.find(x => x.code === tr.dataset.code) || {};
      const jn = v("job_no").value.trim();
      if (jn && !mj.has(jobKey(jn))) { msg.textContent = "ไม่พบ Job no. " + jn + " ในตาราง master"; return; }
      done(() => post("/api/manpower/master/project", { code: tr.dataset.code, name: p.name, customer: p.customer, job_no: jn, status: v("status").value, color: v("color").value }), jn ? "ผูก Job no. แล้ว" : "บันทึกงานแล้ว"); }));
    const jt = box.querySelector(".mp-jobs");
    if (jt) jt.querySelectorAll("th[data-sk]").forEach(th => th.addEventListener("click", () => {
      const k = th.dataset.sk; S.msort = { k, dir: S.msort.k === k ? -S.msort.dir : (k === "job_no" ? -1 : 1) };
      const tb = jt.tBodies[0], rows = new Map([...tb.rows].map(r => [r.dataset.jn, r]));
      sortedMaster().forEach(m => { const r = rows.get(m.job_no); if (r) tb.appendChild(r); });
      jt.querySelectorAll("th[data-sk]").forEach(h => { const on = h.dataset.sk === k; h.classList.toggle("on", on); h.querySelector(".ar").textContent = on ? (S.msort.dir > 0 ? "▲" : "▼") : "↕"; }); }));
    box.querySelectorAll(".mp-unlink").forEach(b => b.addEventListener("click", () => { const p = M.projects.find(x => x.code === b.dataset.code); if (!p) return;
      done(() => post("/api/manpower/master/project", { code: p.code, name: p.name, customer: p.customer, job_no: "", status: p.status, color: p.color }), "ยกเลิกการผูกแล้ว · งานกลับไปอยู่ในรายการงานเดิมด้านล่าง"); }));
    const mq = box.querySelector(".mp-mq");
    if (mq) mq.addEventListener("input", () => { const q = lc(mq.value); box.querySelectorAll(".mp-jobs tbody tr").forEach(tr => { tr.hidden = !!q && !tr.dataset.q.includes(q); }); });
    const hf = box.querySelector(".mp-hadd");
    if (hf) hf.addEventListener("submit", e => { e.preventDefault(); done(() => post("/api/manpower/master/holiday", { day: hf.day.value, name: hf.name.value, type: hf.type.value }), "เพิ่มวันหยุดแล้ว"); });
    box.querySelectorAll(".mp-hd").forEach(b => b.addEventListener("click", () => done(() => post("/api/manpower/master/holiday-delete", { day: b.dataset.day }), "ลบวันหยุดแล้ว")));
  }
  const ACT = { assign: "ลงงาน", clear: "ลบงาน", confirm: "Confirm งานจอง", leave: "ลงวันลา", "leave-clear": "ยกเลิกวันลา", "worker-add": "เพิ่มช่าง", "worker-edit": "แก้ข้อมูลช่าง", "project-add": "เพิ่มงาน", "project-edit": "แก้ข้อมูลงาน", holiday: "เพิ่มวันหยุด", "holiday-delete": "ลบวันหยุด", "milestone-add": "เพิ่ม Milestone", "milestone-edit": "แก้ Milestone", "milestone-delete": "ลบ Milestone", "sp-request": "ขอคน (Service Plan)", "sp-draft": "บันทึกงานรอนัดวัน", "sp-draft-edit": "แก้งานรอนัดวัน", "sp-cancel": "ยกเลิกคำขอคน", "sp-confirm": "Confirm คำขอคน", "sp-reject": "ปฏิเสธคำขอคน" };
  function logSummary(r) {
    const d = r.detail || {}, nm = id => { const w = DATA.workers.find(x => x.id === id); return w ? w.nickname || w.name_th : id; };
    const span = list => { const s2 = [...new Set(list)].sort(); return s2.length ? (s2.length === 1 ? fmtD(s2[0]) : `${fmtD(s2[0])} – ${fmtD(s2[s2.length - 1])} (${s2.length} วัน)`) : ""; };
    const people = d.workers ? Object.entries(d.workers) : d.items ? d.items.map(i => [i.worker_id, i.days]) : d.worker_id ? [[d.worker_id, d.days || []]] : [];
    const who = people.length ? people.map(([id]) => nm(id)).join(", ") + " · " + span(people.flatMap(([, ds]) => ds)) : "";
    if (r.action === "assign") return `${who} · ${[d.customer, d.job, d.job_no].filter(Boolean).join(" / ")} · ${WTL[d.work_type] || ""}${d.tentative ? " · จอง" : ""}`;
    if (r.action === "clear" || r.action === "leave-clear") return `${who} · ${(d.removed || []).length} ช่อง`;
    if (r.action === "leave") return `${who} · ${(LV.find(x => x[0] === d.type) || [0, d.type])[1]}${d.note ? " · " + d.note : ""}${(d.removed_work || []).length ? ` · ลบงาน ${d.removed_work.length} ช่อง` : ""}`;
    if (r.action === "confirm") return `${(d.items || []).map(i => nm(i.worker_id)).join(", ")} · ${d.newText || d.text} · ${d.cells || 0} ช่อง`;
    if (r.action.startsWith("worker")) return `${d.name_th || ""}${d.newId && d.newId !== d.old_id ? " · รหัส " + (d.old_id ? d.old_id + " → " : "") + d.newId : ""}${d.active === false ? " · ไม่ได้ทำงานแล้ว" : ""}`;
    if (r.action.startsWith("project")) return [d.customer, d.name, d.job_no, d.status].filter(Boolean).join(" / ");
    if (r.action.startsWith("holiday")) return `${fmtD(d.day)} ${d.name || ""}`;
    if (r.action.startsWith("sp-")) { // Service Plan ขอคน — older cancel entries only kept the request id
      const job = [d.type, d.customer, d.job].filter(Boolean).join(" · ");
      const when = d.from ? (d.to && d.to !== d.from ? `${fmtD(d.from)} – ${fmtD(d.to)}` : fmtD(d.from)) : d.expect ? `คาดว่า ${fmtD(d.expect)}` : "";
      const names = (d.people || []).map(p => nm(p.worker_id)).filter(Boolean);
      const head = d.req_no || (d.id ? `คำขอ #${d.id}` : "");
      if (r.action === "sp-confirm" || r.action === "sp-reject") return [names.join(", "), d.cells ? `${d.cells} ช่อง` : "", (d.replaced || []).length ? `แทนงานเดิม ${d.replaced.length} ช่อง` : "", d.note || ""].filter(Boolean).join(" · ");
      return [head, job, when, names.length ? names.join(", ") : ""].filter(Boolean).join(" · ") || "—";
    }
    if (r.action.startsWith("milestone")) { const m = r.action === "milestone-delete" ? (d.removed || [])[0] || {} : d; const pj = DATA.P.get(m.project_code); return m.day ? `${pj ? pj.name : m.project_code || ""} · ${fmtD(m.day)} · ${m.label || ""}` : ""; }
    return "";
  }
  async function logPage(box, before) {
    let rows;
    try { const r = await fetch("/api/manpower/log" + (before ? "?before=" + before : ""), { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); rows = j.rows; }
    catch (err) { box.innerHTML = `<div class="mp-empty">โหลดประวัติไม่สำเร็จ (${esc(err.message)})</div>`; return; }
    const html = rows.map(r => `<tr><td class="nw">${esc(new Date(r.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }))}</td><td>${esc(r.by_user)}</td><td><b class="mp-act-${esc(r.action)}">${esc(ACT[r.action] || "อื่น ๆ")}</b>${ACT[r.action] ? "" : `<div class="mp-hint">${esc(r.action)}</div>`}</td><td>${esc(logSummary(r))}</td></tr>`).join("");
    if (!before) box.innerHTML = `<div class="mp-card"><p class="mp-hint">บันทึกทุกการลงงาน แก้ไข ลบ ลงวันลา Confirm และแก้ข้อมูลหลัก ล่าสุดอยู่บนสุด</p><table class="mp-mt mp-log"><thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>${html || `<tr><td colspan="4" class="mp-hint">ยังไม่มีการแก้ไข</td></tr>`}</tbody></table><div class="mp-more"></div></div>`;
    else box.querySelector(".mp-log tbody").insertAdjacentHTML("beforeend", html);
    const more = box.querySelector(".mp-more");
    more.innerHTML = rows.length === 100 ? `<button type="button" class="mp-rs">โหลดเพิ่ม</button>` : "";
    const b = more.querySelector("button"); if (b) b.addEventListener("click", () => logPage(box, rows[rows.length - 1].id));
  }

  /* ---------- project detail (click a milestone row name) ---------- */
  function projectDialog(code) {
    const p = DATA.P.get(code); if (!p) return;
    const m = masterOf(p) || {}, ms = (DATA.milestonesAll || DATA.milestones).filter(x => x.project_code === code).sort((a, b) => a.day < b.day ? -1 : 1);
    const asg = DATA.assignments.filter(a => a.project_code === code), ppl = new Set(asg.map(a => a.worker_id));
    const STL = { active: "Active", hold: "Hold", postponed: "เลื่อน", cancelled: "ยกเลิก", done: "เสร็จแล้ว" };
    const row = (k, v) => v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "";
    const el = document.createElement("div"); el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="รายละเอียดงาน"><header><div><b>${esc(m.job_no || p.job_no || "")} ${esc(m.job_name || p.short_name || p.name)}</b><div class="mp-when">${esc(m.customer || p.customer || "")}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>
      <table class="mp-pjd">${row("Job no.", m.job_no || p.job_no)}${row("ชื่องานเต็ม", m.job_full || p.name)}${row("ชื่อย่อ", m.job_name || p.short_name)}${row("ลูกค้า", m.customer || p.customer)}${row("ชื่อลูกค้าเต็ม", m.customer_full)}${row("สถานะ", STL[p.status] || p.status)}
        ${row("ในช่วงที่แสดง", asg.length ? `${asg.length} man-day · ${ppl.size} คน` : "ยังไม่มีคนลงงาน")}</table>
      ${!m.job_no ? `<p class="mp-hint">งานนี้ยังไม่ได้ผูก Job no. กับ RAK_Master_Project_on_hand — ผูกได้ที่ ข้อมูลหลัก → งาน / ลูกค้า</p>` : ""}
      <h4>Milestone</h4>${ms.length ? `<ul class="mp-pjms">${ms.map(x => `<li><i style="background:${msKind(x.label) ? MSC[msKind(x.label)] : esc(p.color)}"></i><b>${esc(x.label)}</b> ${esc(fmtD(x.day))}</li>`).join("")}</ul>` : `<p class="mp-hint">ยังไม่มี Milestone</p>`}</div>`;
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".mp-x")) close(); });
    document.addEventListener("keydown", onKey);
    (document.fullscreenElement || document.body).appendChild(el);
  }

  /* ---------- Milestone (ดิว / กอล์ฟ) ---------- */
  function milestoneDialog(code, day) {
    const list = code && day ? DATA.milestones.filter(m => m.project_code === code && m.day === day) : [];
    const p = code ? DATA.P.get(code) : null;
    const projOpts = DATA.projects.filter(x => x.status !== "cancelled" || x.code === code).map(x => `<option value="${esc(x.code)}" ${x.code === code ? "selected" : ""}>${esc((x.customer ? x.customer + " · " : "") + x.name)}</option>`).join("");
    const SUG = ["FAB", "Assembly", "FAT", "รื้อ", "Pack", "Delivery", "ติดตั้ง", "Commissioning", "SAT", "Handover"];
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="Milestone"><header><div><b>◆ Milestone</b> <span>${esc(p ? p.name : "เพิ่มใหม่")}</span>${day ? `<div class="mp-when">${esc(fmtD(day))}</div>` : ""}</div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>
      ${list.length ? `<div class="mp-mlist">${list.map(m => `<form class="mp-mrow" data-id="${m.id}"><input name="label" value="${esc(m.label)}" required><input type="date" name="day" value="${esc(m.day)}" min="2026-01-01" max="2027-12-31"><button type="submit" class="mp-rs">บันทึก</button><button type="button" class="mp-hd mp-mdel">ลบ</button></form>`).join("")}</div>` : ""}
      <form class="mp-form mp-mform" autocomplete="off"><h4 class="wide">${list.length ? "เพิ่มอีก Milestone" : "เพิ่ม Milestone"}</h4>
        <label class="wide">งาน<select name="project_code" required><option value="">เลือกงาน</option>${projOpts}</select></label>
        <label>วันที่<input type="date" name="day" value="${esc(day || key(today()))}" min="2026-01-01" max="2027-12-31" required></label>
        <label>Milestone<input name="label" list="mpMsL" placeholder="เช่น FAT, Delivery, SAT" required></label>
        <datalist id="mpMsL">${SUG.map(x => `<option value="${x}">`).join("")}</datalist>
        <div class="mp-fbtn"><button type="submit" class="mp-save">เพิ่ม</button></div></form><div class="mp-msg" role="status"></div></div>`;
    const msg = el.querySelector(".mp-msg");
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    const go = async (fn, ok) => { msg.textContent = "กำลังบันทึก…"; try { await fn(); msg.textContent = ok; if (DATA) DATA.want = ""; DCACHE.clear(); await ensure(); draw(); setTimeout(close, 500); } catch (err) { msg.textContent = "ไม่สำเร็จ (" + err.message + ")"; } };
    el.querySelectorAll(".mp-mrow").forEach(f => {
      f.addEventListener("submit", e => { e.preventDefault(); go(() => post("/api/manpower/milestone", { id: f.dataset.id, project_code: code, day: f.day.value, label: f.label.value }), "บันทึกแล้ว"); });
      f.querySelector(".mp-mdel").addEventListener("click", () => go(() => post("/api/manpower/milestone-delete", { id: f.dataset.id }), "ลบแล้ว"));
    });
    const mf = el.querySelector(".mp-mform");
    mf.addEventListener("submit", e => { e.preventDefault(); go(() => post("/api/manpower/milestone", { project_code: mf.project_code.value, day: mf.day.value, label: mf.label.value }), "เพิ่มแล้ว"); });
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".mp-x")) close(); });
    document.addEventListener("keydown", onKey);
    (document.fullscreenElement || document.body).appendChild(el);
    (list.length ? el.querySelector(".mp-mrow input") : mf.label).focus();
  }

  /* ---------- full screen: Fullscreen API where available, else a fixed overlay (iPhone / iPad Safari) ---------- */
  const isFull = () => !!ROOT && (document.fullscreenElement === ROOT || ROOT.classList.contains("mp-full"));
  function toggleFull() {
    if (!ROOT) return;
    if (isFull()) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      ROOT.classList.remove("mp-full"); document.body.classList.remove("mp-noscroll");
    } else if (ROOT.requestFullscreen && document.fullscreenEnabled) {
      ROOT.requestFullscreen().catch(() => { ROOT.classList.add("mp-full"); document.body.classList.add("mp-noscroll"); draw(); });
    } else { ROOT.classList.add("mp-full"); document.body.classList.add("mp-noscroll"); }
    setTimeout(draw, 60);
  }
  if (!window.__mpFs) {
    window.__mpFs = true;
    document.addEventListener("fullscreenchange", () => { if (ROOT && document.body.contains(ROOT)) draw(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && ROOT && ROOT.classList.contains("mp-full") && !document.querySelector(".mp-modal")) toggleFull(); });
    window.addEventListener("hashchange", () => { if (ROOT && ROOT.classList.contains("mp-full") && !location.hash.startsWith("#manpower")) { ROOT.classList.remove("mp-full"); document.body.classList.remove("mp-noscroll"); } });
  }

  /* ---------- ภาพรวม (dashboard): first page of the Manpower menu ---------- */
  const PERIODS = [["month", "เดือนนี้"], ["next", "เดือนหน้า"], ["q3", "3 เดือนข้างหน้า"], ["y2026", "ทั้งปี 2026"], ["y2027", "ทั้งปี 2027"]];
  function periodRange(p) {
    const t = today(), m0 = new Date(t.getFullYear(), t.getMonth(), 1);
    if (p === "next") return [new Date(t.getFullYear(), t.getMonth() + 1, 1), new Date(t.getFullYear(), t.getMonth() + 2, 0)];
    if (p === "q3") return [t, addDays(new Date(t.getFullYear(), t.getMonth() + 3, t.getDate()), -1)];
    if (p === "y2026") return [new Date(2026, 0, 1), new Date(2026, 11, 31)];
    if (p === "y2027") return [new Date(2027, 0, 1), new Date(2027, 11, 31)];
    return [m0, new Date(t.getFullYear(), t.getMonth() + 1, 0)];
  }
  const DCACHE = new Map();
  function cached(from, to) {   // one request per range, reused for 60 s (and while it is still loading)
    const k = from + "|" + to, hit = DCACHE.get(k);
    if (hit && Date.now() - hit.at < 60000) return hit.p;
    const p = fetchRange(from, to);
    DCACHE.set(k, { at: Date.now(), p });
    p.catch(() => DCACHE.delete(k));
    return p;
  }
  // every planned man-day: an assignment, or a Service Plan job on an otherwise empty day
  function mandays(d) {
    const out = [];
    d.assignments.forEach(a => out.push({ w: a.worker_id, day: a.day, code: a.project_code || "_" + a.kind, wt: a.work_type || "other", tent: a.tentative }));
    d.SV.forEach((v, k) => { if (!d.A.has(k)) { const [w, day] = k.split("|"); out.push({ w, day, code: "SERVICE", wt: "service", tent: false, sp: true }); } });
    return out;
  }
  const isLeave = x => x && ABS[x.type] && ABS[x.type][1] === "lv";
  function bars(rows, total, link) {
    if (!rows.length) return `<p class="mp-hint">ยังไม่มีข้อมูลในช่วงนี้</p>`;
    const max = Math.max(...rows.map(r => r.n));
    return `<div class="mp-bars">${rows.map(r => `<${link && r.code ? `a href="#manpower/month/${esc(link)}" data-go="${esc(r.code)}"` : "div"} class="mp-bar"><span class="mp-bl" title="${esc(r.label)}"><i style="background:${esc(r.color || "#6d7582")}"></i>${esc(r.label)}</span><span class="mp-bt"><b style="width:${Math.max(2, r.n / max * 100).toFixed(1)}%;background:${esc(r.color || "#6d7582")}"></b></span><span class="mp-bn">${r.n.toLocaleString()}<small>${total ? Math.round(r.n / total * 100) + "%" : ""}</small></span></${link && r.code ? "a" : "div"}>`).join("")}</div>`;
  }
  async function dashPage(box) {
    const per = S.dper || "month", [pa, pb] = periodRange(per), t = today(), near = [t, addDays(t, 29)];
    let D, N;
    try { [D, N] = await Promise.all([cached(key(pa), key(pb)), cached(key(near[0]), key(near[1]))]); }
    catch (err) { box.innerHTML = pageHead("Manpower") + `<div class="mp-empty">${esc(err.message)}</div>`; return; }
    if (S.page !== "dash") return;
    const can = D.canEdit, act = N.workers.filter(w => w.active), tk = key(t);
    // today
    const offToday = N.H.has(tk) || t.getDay() === 0;
    const onLeave = act.filter(w => isLeave(N.X.get(w.id + "|" + tk))).length;
    const working = act.filter(w => N.A.has(w.id + "|" + tk) || N.SV.has(w.id + "|" + tk)).length;
    const free = offToday ? 0 : act.filter(w => !N.A.has(w.id + "|" + tk) && !N.X.has(w.id + "|" + tk) && !N.SV.has(w.id + "|" + tk)).length;
    const avail = act.length - onLeave;
    const util = avail ? Math.round(working / avail * 100) : 0;
    const tentN = N.assignments.filter(a => a.tentative).length;
    // period man-days
    const md = mandays(D), total = md.length;
    const by = (f) => { const m = new Map(); md.forEach(r => { const k = f(r); m.set(k, (m.get(k) || 0) + 1); }); return m; };
    const pRows = [...by(r => r.code)].map(([code, n]) => { const p = D.P.get(code); return { code: p ? code : "", label: p ? p.name : (KIND[code.slice(1)] || KIND.other)[1], color: p ? p.color : (KIND[code.slice(1)] || KIND.other)[0], n }; }).sort((a, b) => b.n - a.n);
    const cRows = [...by(r => { const p = D.P.get(r.code); return p && p.customer ? p.customer : "ไม่ระบุลูกค้า"; })].map(([label, n]) => ({ label, n, color: "#3d5a80" })).sort((a, b) => b.n - a.n);
    const W = new Map(D.workers.map(w => [w.id, w]));
    const UC = { ME: "#c2410c", PP: "#0e7490", EE: "#7c3aed", PC: "#a16207", SC: "#be185d" };
    const uRows = UNITS.map(([u, l]) => ({ label: l, color: UC[u], n: md.filter(r => (W.get(r.w) || {}).unit === u).length })).filter(r => r.n);
    const WC = WCOL;
    const tRows = WT.map(([v, l]) => ({ label: l, color: WC[v], n: md.filter(r => r.wt === v).length })).filter(r => r.n);
    // weekly trend (Monday-based)
    const wk = new Map();
    md.forEach(r => { const d = fromKey(r.day), m = addDays(d, -((d.getDay() + 6) % 7)), k = key(m); wk.set(k, (wk.get(k) || 0) + 1); });
    const weeks = []; for (let m = addDays(pa, -((pa.getDay() + 6) % 7)); m <= pb; m = addDays(m, 7)) weeks.push([key(m), wk.get(key(m)) || 0]);
    const wmax = Math.max(1, ...weeks.map(w => w[1]));
    // capacity next 14 days: free people per unit
    const d14 = []; for (let i = 0; i < 14; i++) d14.push(addDays(t, i));
    // a day off for the company: Sunday, company holiday, or a day most people have H / PH (e.g. Saturdays off)
    const dOff = d => { const k = key(d); if (N.H.has(k) || d.getDay() === 0) return true; const off = act.filter(w => { const x = N.X.get(w.id + "|" + k); return x && ["H", "PH", "EX", "สลับวันหยุด"].includes(x.type); }).length; return off >= act.length / 2; };
    const offs = d14.map(dOff);
    const cap = UNITS.map(([u, l]) => { const ws = act.filter(w => w.unit === u); return { u, l, n: ws.length, free: d14.map((d, i) => { const k = key(d); return offs[i] ? null : ws.filter(w => !N.A.has(w.id + "|" + k) && !N.X.has(w.id + "|" + k) && !N.SV.has(w.id + "|" + k)).length; }) }; }).filter(r => r.n);
    const capTot = d14.map((d, i) => cap.every(r => r.free[i] === null) ? null : cap.reduce((s2, r) => s2 + (r.free[i] || 0), 0));
    const heat = (v, n) => v === null ? `<td class="off">–</td>` : `<td style="background:${v === 0 ? "#fde3e3" : `rgba(21,128,61,${(0.12 + 0.6 * v / Math.max(1, n)).toFixed(2)})`}">${v}</td>`;
    // milestones & tentative in the next 30 days
    const ms = N.milestones.slice().sort((a, b) => a.day < b.day ? -1 : 1).slice(0, 12);
    const tg = new Map();
    N.assignments.filter(a => a.tentative).forEach(a => { if (!tg.has(a.text)) tg.set(a.text, { text: a.text, code: a.project_code, ppl: new Set(), lo: a.day, hi: a.day, n: 0 }); const g = tg.get(a.text); g.ppl.add(a.worker_id); g.n++; if (a.day < g.lo) g.lo = a.day; if (a.day > g.hi) g.hi = a.day; });
    const tList = [...tg.values()].sort((a, b) => a.lo < b.lo ? -1 : 1).slice(0, 10);
    const kpi = (id, lab, v, sub, cls) => `<button type="button" class="mp-kpi ${cls || ""}" data-kpi="${id}" title="กดเพื่อดูรายละเอียด"><span>${lab}</span><b>${v}</b><small>${sub || ""} <em>ดูรายละเอียด ›</em></small></button>`;
    box.innerHTML = pageHead("Manpower", can) + `
      <div class="mp-dash-top"><div><h3>ภาพรวมกำลังคน</h3><p class="mp-hint">${esc(DS[t.getDay()])}. ${t.getDate()} ${MF[t.getMonth()]} ${t.getFullYear()}${offToday ? " · วันนี้เป็นวันหยุด" : ""}</p></div>
        <a class="mp-go" href="#manpower/board">วางแผนกำลังคน →</a></div>
      <div class="mp-kpis">${kpi("all", "ช่างทั้งหมด", act.length, "คนที่ทำงานอยู่")}${kpi("work", "ทำงานวันนี้", working, "มีงานลงไว้ / Service Plan", "g")}${kpi("leave", "ลาวันนี้", onLeave, "ลาป่วย / พักร้อน / ลากิจ", "a")}${kpi("free", "ว่างวันนี้", offToday ? "–" : free, "ยังไม่ได้ลงงาน", "r")}${kpi("util", "Utilization วันนี้", util + "%", "ทำงาน ÷ คนที่ไม่ลา")}${kpi("tent", "งานจองรอ Confirm", tentN, "ช่องใน 30 วันข้างหน้า", "t")}</div>
      <div class="mp-card"><div class="mp-ch"><h4>คนว่าง 14 วันข้างหน้า <small>จำนวนคนที่ยังไม่ได้ลงงานและไม่ได้ลา · กดวันที่เพื่อเปิดตาราง</small></h4></div>
        <div class="mp-capw"><table class="mp-cap"><thead><tr><th></th>${d14.map(d => `<th><a href="#manpower/week/${key(d)}">${DS[d.getDay()]}<br>${d.getDate()}/${d.getMonth() + 1}</a></th>`).join("")}</tr></thead>
        <tbody>${cap.map(r => `<tr><th>${esc(r.u)} <small>${r.n} คน</small></th>${r.free.map(v => heat(v, r.n)).join("")}</tr>`).join("")}<tr class="tot"><th>รวม</th>${capTot.map(v => heat(v, act.length)).join("")}</tr></tbody></table></div></div>
      <div class="mp-card"><div class="mp-ch"><h4>Man-day summary</h4><div class="mp-per">${PERIODS.map(([k2, l]) => `<button type="button" data-per="${k2}" class="${per === k2 ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <p class="mp-hint">${esc(fmtD(key(pa)))} – ${esc(fmtD(key(pb)))} · รวม <b>${total.toLocaleString()}</b> man-day · คนละเฉลี่ย ${act.length ? (total / act.length).toFixed(1) : 0} วัน${md.filter(r => r.tent).length ? ` · ในนี้เป็นงานจอง ${md.filter(r => r.tent).length.toLocaleString()} วัน` : ""}</p>
        <div class="mp-g2"><div><h5>แยกตามงาน <small>กดเพื่อเปิดตารางของงานนั้น</small></h5>${bars(pRows.slice(0, 12), total, key(pa))}</div><div><h5>แยกตามลูกค้า</h5>${bars(cRows.slice(0, 12), total)}</div></div>
        <div class="mp-g3"><div><h5>แยกตามหน่วยงาน</h5>${bars(uRows, total)}</div><div><h5>แยกตามประเภทงาน</h5>${bars(tRows, total)}</div>
          <div><h5>รายสัปดาห์</h5><div class="mp-wk">${weeks.map(([k2, n]) => `<div title="สัปดาห์ ${esc(fmtD(k2))} · ${n} man-day"><b style="height:${(n / wmax * 100).toFixed(1)}%"></b><span>${fromKey(k2).getDate()}/${fromKey(k2).getMonth() + 1}</span></div>`).join("")}</div></div></div></div>
      <div class="mp-g2"><div class="mp-card"><h4>Milestone 30 วันข้างหน้า</h4>${ms.length ? `<ul class="mp-ul">${ms.map(m => { const p = N.P.get(m.project_code); return `<li><span class="d">${esc(fmtD(m.day))}</span><i style="background:${esc(p ? p.color : "#999")}"></i><b>${esc(m.label)}</b> <span>${esc(p ? p.name : m.project_code)}</span></li>`; }).join("")}</ul>` : `<p class="mp-hint">ยังไม่มี Milestone ใน 30 วันข้างหน้า</p>`}</div>
        <div class="mp-card"><h4>งานจองรอ Confirm <small>30 วันข้างหน้า</small></h4>${tList.length ? `<ul class="mp-ul">${tList.map(g => `<li><span class="d">${esc(fmtD(g.lo))}${g.hi !== g.lo ? " – " + esc(fmtD(g.hi)) : ""}</span><b>${esc(g.text.replace(/^จอง\s*/, ""))}</b> <span>${g.ppl.size} คน · ${g.n} ช่อง</span> <a href="#manpower/${(fromKey(g.hi) - fromKey(g.lo)) / 864e5 < 14 ? "week" : "month"}/${esc(g.lo)}" data-gt="${esc(g.text)}" data-gc="${esc(g.code || "")}">เปิด</a></li>`).join("")}</ul>` : `<p class="mp-hint">ไม่มีงานจองค้างอยู่</p>`}</div></div>`;
    // ---- KPI boxes → detail popup ----
    const nm = w => `<b>${esc(w.nickname || w.name_th)}</b> <span class="mp-m">${esc(w.name_th)}${w.trade ? " · " + esc(w.trade) : ""}</span>`;
    const byUnit = (list, row) => UNITS.map(([u, l]) => { const ws = list.filter(x => (x.w || x).unit === u); return ws.length ? `<h5>${esc(l)} <small>${ws.length} คน</small></h5><ul class="mp-dlist">${ws.map(row).join("")}</ul>` : ""; }).join("") || `<p class="mp-hint">ไม่มีรายการ</p>`;
    const jobOf = (w) => {
      const a = N.A.get(w.id + "|" + tk), sv = N.SV.get(w.id + "|" + tk) || [];
      const p = a && a.project_code ? N.P.get(a.project_code) : null;
      const job = a ? `<i class="mp-dot" style="background:${esc(p ? p.color : "#999")}"></i>${esc(a.text)}${p && p.customer ? ` <span class="mp-m">· ${esc(p.customer)}</span>` : ""}${a.tentative ? ` <em class="mp-tg">จอง</em>` : ""}${a.work_type && WTL[a.work_type] && a.work_type !== "other" ? ` <span class="mp-m">· ${esc(WTL[a.work_type])}</span>` : ""}` : "";
      const sp = sv.map(j => `<span class="mp-sp in">SP</span>${esc([j.type, j.customer, j.job].filter(Boolean).join(" · "))}`).join(" ");
      return [job, sp].filter(Boolean).join("<br>");
    };
    const openLink = (g) => `<a class="mp-open" href="#manpower/${(fromKey(g.hi) - fromKey(g.lo)) / 864e5 < 14 ? "week" : "month"}/${esc(g.lo)}" data-gt="${esc(g.text)}" data-gc="${esc(g.code || "")}">เปิดในตาราง ›</a>`;
    function kpiDetail(id) {
      const ws = act.map(w => ({ w }));
      if (id === "all") return ["ช่างทั้งหมด " + act.length + " คน", byUnit(ws, x => `<li>${nm(x.w)}${x.w.emp_code ? ` <span class="mp-m">${esc(x.w.emp_code)}</span>` : ""}</li>`)];
      if (id === "work") { const list = ws.filter(x => N.A.has(x.w.id + "|" + tk) || N.SV.has(x.w.id + "|" + tk)); return ["ทำงานวันนี้ " + list.length + " คน", byUnit(list, x => `<li>${nm(x.w)}<div class="mp-dj">${jobOf(x.w)}</div></li>`)]; }
      if (id === "leave") { const list = ws.filter(x => isLeave(N.X.get(x.w.id + "|" + tk))); return ["ลาวันนี้ " + list.length + " คน", byUnit(list, x => { const l = N.X.get(x.w.id + "|" + tk); return `<li>${nm(x.w)}<div class="mp-dj"><em class="mp-lvt">${esc(ABS[l.type][2])}</em>${l.note ? " · " + esc(l.note) : ""}</div></li>`; })]; }
      if (id === "free") {
        if (offToday) return ["ว่างวันนี้", `<p class="mp-hint">วันนี้เป็นวันหยุด</p>`];
        const list = ws.filter(x => !N.A.has(x.w.id + "|" + tk) && !N.X.has(x.w.id + "|" + tk) && !N.SV.has(x.w.id + "|" + tk));
        return ["ว่างวันนี้ " + list.length + " คน", `<p class="mp-hint">ยังไม่ได้ลงงานและไม่ได้ลา · ${can ? "กดชื่อเพื่อลงงานในตาราง" : ""}</p>` + byUnit(list, x => `<li>${nm(x.w)}${can ? ` <a class="mp-open" href="#manpower/week/${tk}" data-person="${esc(x.w.id)}">ลงงาน ›</a>` : ""}</li>`)];
      }
      if (id === "util") {
        const rows = UNITS.map(([u, l]) => { const us = act.filter(w => w.unit === u); if (!us.length) return ""; const lv = us.filter(w => isLeave(N.X.get(w.id + "|" + tk))).length, wk = us.filter(w => N.A.has(w.id + "|" + tk) || N.SV.has(w.id + "|" + tk)).length, av = us.length - lv, pc = av ? Math.round(wk / av * 100) : 0;
          return `<tr><th>${esc(l)}</th><td>${us.length}</td><td>${lv}</td><td>${wk}</td><td><div class="mp-ub"><b style="width:${pc}%"></b></div></td><td><b>${pc}%</b></td></tr>`; }).join("");
        return ["Utilization วันนี้ " + util + "%", `<p class="mp-hint">Utilization = คนที่มีงานวันนี้ ÷ คนที่ไม่ได้ลา</p><table class="mp-mt mp-ut"><thead><tr><th>หน่วยงาน</th><th>คน</th><th>ลา</th><th>มีงาน</th><th></th><th>%</th></tr></thead><tbody>${rows}</tbody></table>`];
      }
      if (id === "tent") {
        const all = [...tg.values()].sort((a, b) => a.lo < b.lo ? -1 : 1);
        return ["งานจองรอ Confirm · " + all.length + " งาน · " + tentN + " ช่อง", all.length ? `<p class="mp-hint">30 วันข้างหน้า · เปิดในตารางแล้วกดช่องจอง → Confirm ทั้งทีม</p><ul class="mp-dlist">${all.map(g => { const p = N.P.get(g.code);
          return `<li><div class="mp-dh"><b>${esc(g.text.replace(/^จอง\s*/, ""))}</b> ${openLink(g)}</div><div class="mp-dj">${esc(fmtD(g.lo))}${g.hi !== g.lo ? " – " + esc(fmtD(g.hi)) : ""} · ${g.ppl.size} คน · ${g.n} ช่อง${p ? ` · <i class="mp-dot" style="background:${esc(p.color)}"></i>${esc(p.name)}` : ""}</div><div class="mp-dj mp-m">${[...g.ppl].map(id2 => { const w = W.get(id2); return esc(w ? w.nickname || w.name_th : id2); }).join(", ")}</div></li>`; }).join("")}</ul>` : `<p class="mp-hint">ไม่มีงานจองค้างอยู่</p>`];
      }
      return ["", ""];
    }
    const wireOpen = (root, close) => {
      root.querySelectorAll("[data-gt]").forEach(a => a.addEventListener("click", () => { const c = a.dataset.gc; S.project = c; S.cust = c ? (N.P.get(c) || {}).customer || "" : ""; S.person = ""; S.q = a.dataset.gt; if (close) close(); }));
      root.querySelectorAll("[data-person]").forEach(a => a.addEventListener("click", () => { S.project = S.cust = S.q = ""; S.person = a.dataset.person; S.zoom = "week"; if (close) close(); }));
    };
    box.querySelectorAll("[data-kpi]").forEach(b => b.addEventListener("click", () => {
      const [title, html] = kpiDetail(b.dataset.kpi);
      const el = document.createElement("div");
      el.className = "mp-modal";
      el.innerHTML = `<div class="mp-dlg mp-wide" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><b>${esc(title)}</b><div class="mp-when">${esc(DS[t.getDay()])}. ${t.getDate()} ${MF[t.getMonth()]} ${t.getFullYear()}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header><div class="mp-dbody">${html}</div></div>`;
      const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
      const onKey = e => { if (e.key === "Escape") close(); };
      el.addEventListener("click", e => { if (e.target === el || e.target.closest(".mp-x")) close(); });
      document.addEventListener("keydown", onKey);
      wireOpen(el, close);
      (document.fullscreenElement || document.body).appendChild(el);
      el.querySelector(".mp-x").focus();
    }));
    box.querySelectorAll("[data-per]").forEach(b => b.addEventListener("click", () => { S.dper = b.dataset.per; box.querySelectorAll("[data-per]").forEach(x => x.classList.toggle("on", x === b)); box.classList.add("mp-busy"); dashPage(box).finally(() => box.classList.remove("mp-busy")); }));
    // open the board already filtered: a job (man-day summary) or one booking (job + its wording → only the people booked)
    box.querySelectorAll("[data-go]").forEach(a => a.addEventListener("click", () => { S.project = a.dataset.go; S.cust = (D.P.get(a.dataset.go) || {}).customer || ""; S.person = ""; S.q = ""; S.zoom = "month"; }));
    box.querySelectorAll("[data-gt]").forEach(a => a.addEventListener("click", () => { const c = a.dataset.gc; S.project = c; S.cust = c ? (N.P.get(c) || {}).customer || "" : ""; S.person = ""; S.q = a.dataset.gt; }));
  }

  function draw() {
    if (!ROOT) return;
    if (S.page === "dash") { ROOT.classList.remove("mp-ed"); ROOT.innerHTML = `<div id="mpPage" class="mp-page"><div class="mp-empty">กำลังโหลด…</div></div>`; dashPage(ROOT.querySelector("#mpPage")); return; }
    if (!DATA) { ROOT.innerHTML = toolbar() + `<div class="mp-empty">${esc(ERR || "กำลังโหลด…")}</div>`; bind(); return; }
    ROOT.classList.toggle("mp-ed", !!DATA.canEdit);
    if (S.page !== "board" && DATA.canEdit) { ROOT.innerHTML = pageHead("วางแผนกำลังคน", true) + `<div id="mpPage" class="mp-page"><div class="mp-empty">กำลังโหลด…</div></div>`; (S.page === "data" ? dataPage : logPage)(ROOT.querySelector("#mpPage")); return; }
    ROOT.innerHTML = toolbar() + legend() + grid()
      + `<p class="mp-note">ข้อมูลตั้งแต่ 1 ม.ค. 2026 นำเข้าจาก Google Sheet "ตารางงานและวันหยุดช่าง 2569" ครั้งเดียว · งาน SP มาจาก Service Plan (ใบขอคน สถานะ Confirm / Complete)${DATA.serviceUpdated ? " อัปเดต " + esc(new Date(DATA.serviceUpdated).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })) : ""} · กดช่องเพื่อดูรายละเอียด</p>`;
    bind();
    const sc0 = ROOT.querySelector(".mp-scroll");
    if (sc0 && isFull()) ROOT.style.setProperty("--mp-top", Math.ceil(sc0.getBoundingClientRect().top - ROOT.getBoundingClientRect().top + 16) + "px");
    const t = ROOT.querySelector("th.mp-d.td"), sc = ROOT.querySelector(".mp-scroll"), nc = ROOT.querySelector(".mp-corner");
    if (t && sc && nc) sc.scrollLeft = Math.max(0, t.offsetLeft - nc.offsetWidth - 2 * t.offsetWidth);
  }
  function bind() {
    ROOT.querySelectorAll("[data-unit]").forEach(c => c.addEventListener("change", () => { c.checked ? S.units.add(c.dataset.unit) : S.units.delete(c.dataset.unit); draw(); }));
    const c = ROOT.querySelector("#mpCust"); if (c) c.addEventListener("change", () => { S.cust = c.value; S.project = ""; draw(); });
    const p = ROOT.querySelector("#mpProj"); if (p) p.addEventListener("change", () => { S.project = p.value; draw(); });
    const pp = ROOT.querySelector("#mpPerson"); if (pp) pp.addEventListener("change", () => { S.person = pp.value; draw(); });
    const cl = ROOT.querySelector("#mpClr"); if (cl) cl.addEventListener("click", () => { S.cust = S.project = S.person = S.q = ""; S.units = new Set(UNITS.map(u => u[0])); S.left = false; draw(); });
    const q = ROOT.querySelector("#mpQ"); if (q) q.addEventListener("change", () => { S.q = q.value.trim(); draw(); });
    const l = ROOT.querySelector("#mpLeft"); if (l) l.addEventListener("change", () => { S.left = l.checked; draw(); });
    const m = ROOT.querySelector("#mpMiles"); if (m) m.addEventListener("change", () => { S.miles = m.checked; draw(); });
    const fs = ROOT.querySelector("#mpFull"); if (fs) fs.addEventListener("click", toggleFull);
    const rqb = ROOT.querySelector("#mpReq"); if (rqb) rqb.addEventListener("click", () => window.SPRequest.openList(reloadBoard));
    ROOT.querySelectorAll(".mp-lg[data-p]").forEach(b => b.addEventListener("click", () => { const on = S.project === b.dataset.p; S.project = on ? "" : b.dataset.p; S.cust = on ? "" : custOf(b.dataset.p); draw(); }));
    const g = ROOT.querySelector(".mp-grid");
    if (g && DATA && DATA.canMilestone) g.addEventListener("click", e => {
      if (e.target.closest(".mp-madd")) return milestoneDialog(null, null);
      if (e.target.closest(".mp-mtog")) { S.msOpen = !S.msOpen; try { localStorage.setItem("mp.msOpen", S.msOpen ? "1" : "0"); } catch (err) {} return draw(); }
      const pj = e.target.closest("th[data-pj]"); if (pj) return projectDialog(pj.dataset.pj);
      const td = e.target.closest("td[data-m]"); if (td) { const [c, d] = td.dataset.m.split("|"); milestoneDialog(c, d); }
    });
    if (g && DATA && DATA.canEdit) bindDrag(g);
    else if (g) g.addEventListener("click", e => { const td = e.target.closest("td[data-k]"); if (td) detail(td.dataset.k); });
  }

  function mount(el, sub) {
    if (!document.getElementById("mpCss")) { const s = document.createElement("style"); s.id = "mpCss"; s.textContent = CSS; document.head.appendChild(s); }
    ROOT = el;
    // In full screen, links inside the menu (month ‹ ›, zoom, page tabs, "เปิด") must not change location.hash:
    // the hub re-renders the page on hashchange, which drops full screen. Update the URL quietly and redraw in place.
    el.addEventListener("click", e => {
      const a = e.target.closest("a[href^='#manpower']");
      if (!a || !isFull() || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      const href = a.getAttribute("href");
      try { history.pushState(null, "", href); } catch (err) {}
      route(href.replace(/^#manpower\/?/, ""));
    });
    route(sub);
  }
  function route(sub) {
    const [z, k] = String(sub || "").split("/");
    if (ZOOMS.some(x => x[0] === z)) S.zoom = z;
    S.page = z === "data" || z === "log" ? z : !sub ? "dash" : "board";
    if (S.page === "board") S.date = clampDate(fromKey(k) || (z === "board" ? today() : S.date));
    if (S.page === "dash") { draw(); return; }
    draw();
    ensure().then(draw);
  }

  const CSS = `
.mp-root{display:grid;gap:14px}
.mp-rq{position:absolute;left:1px;bottom:1px;font-size:9px;line-height:1;padding:2px 3px;border-radius:3px;background:#f59e0b;color:#fff;font-weight:700;pointer-events:none}.mp-rq.ok{background:#188764}
.mp-rq.in{position:static;display:inline-block;margin-right:4px;font-size:10px}td.mp-c.rq{outline:2px dashed #f59e0b;outline-offset:-2px}
.mp-rqr{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;font-size:13px;margin:4px 0}.mp-rqr b.w{color:#b4530a}.mp-rqr b.c{color:#188764}
.mp-rqb{cursor:pointer;position:relative;overflow:visible}.mp-rqb.on{border-color:#e03131;color:#c92a2a}.mp-ndot{position:absolute;top:-8px;right:-8px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#e03131;color:#fff;font-size:11px;font-weight:700;line-height:20px;text-align:center;box-shadow:0 0 0 2px #fff;animation:mpPulse 1.6s ease-out 3}@keyframes mpPulse{0%{box-shadow:0 0 0 2px #fff,0 0 0 2px rgba(224,49,49,.6)}100%{box-shadow:0 0 0 2px #fff,0 0 0 10px rgba(224,49,49,0)}}
.mp-head{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:grid;gap:10px}
.mp-title{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mp-title h2{margin:0;font-size:19px;font-weight:600}
.mp-badge{font-size:11px;border-radius:999px;padding:2px 10px;background:#eef0f3;color:var(--muted)}.mp-badge.ed{background:var(--green-soft);color:var(--green)}
.mp-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mp-nav b{font-size:15px;margin:0 6px;font-weight:600}
.mp-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:4px 12px;text-decoration:none;color:var(--ink)}.mp-btn:hover{border-color:#f0b9b9;color:var(--rak)}
.mp-zoom{margin-left:auto;display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.mp-zoom a{padding:4px 12px;text-decoration:none;color:var(--muted);font-size:13px}.mp-zoom a.on{background:var(--rak);color:#fff}
.mp-filters{display:flex;gap:8px 14px;align-items:center;flex-wrap:wrap;font-size:13px}
.mp-filters select,.mp-filters input[type=search]{font:inherit;font-size:13px;border:1px solid #dce1e8;border-radius:8px;padding:4px 10px;max-width:260px}
.mp-chk{display:inline-flex;gap:5px;align-items:center;color:#4a515c;cursor:pointer}
.mp-legend{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:12px}
.mp-lt{color:var(--muted);margin-right:4px}
.mp-lg{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:2px 10px;color:#4a515c;font-size:12px}
button.mp-lg:hover,.mp-lg.on{border-color:var(--rak);color:var(--rak)}.mp-lg b{font-weight:600}
.mp-lg i,.mp-dot{display:inline-block;width:10px;height:10px;border-radius:3px}
.tent-i{background:repeating-linear-gradient(135deg,#999 0 2px,#fff 2px 4px)}.lv-i{background:#ffe7b0}.off-i{background:#e4e7ec}
.mp-scroll{overflow:auto;max-height:calc(100vh - 230px);background:#fff;border:1px solid var(--line);border-radius:12px}
.mp-grid{border-collapse:separate;border-spacing:0;font-size:11px;min-width:100%}
.mp-grid th,.mp-grid td{border-right:1px solid #eef0f3;border-bottom:1px solid #eef0f3;padding:0}
.mp-grid thead th{position:sticky;background:#fff;z-index:3}
.mp-grid thead tr:first-child th{top:0;height:24px}.mp-grid thead tr:nth-child(2) th{top:24px}
.mp-mon{font-weight:600;font-size:12px;text-align:left;padding:2px 0!important;color:#424a57}.mp-mon span{position:sticky;left:178px;padding:0 8px}
.mp-d{font-weight:500;color:#4a515c;text-align:center;line-height:1.15;padding:3px 0!important}.mp-d span{display:block;font-size:9.5px;color:#9aa1ab;font-weight:400}
.mp-d.we{background:#f3f4f6!important}.mp-d.td{background:var(--rak)!important;color:#fff}.mp-d.td span{color:#ffd9d9}
.mp-name{position:sticky;left:0;z-index:2;background:#fff;text-align:left;min-width:170px;max-width:170px;padding:3px 10px!important;font-weight:400;border-right:1px solid var(--line)!important}
.mp-corner{z-index:4!important;vertical-align:bottom}
.mp-name b{display:block;font-weight:600;font-size:12px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-name small{display:block;font-size:10px;color:#9aa1ab;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-name.left b{color:#9aa1ab;text-decoration:line-through}
.mp-grp th,.mp-grp td{background:#f7f8fa!important;height:26px}.mp-grp th{font-weight:600;font-size:12px;color:#424a57;padding:4px 10px!important;text-align:left;white-space:nowrap}
.mp-grp th span{font-weight:400;color:var(--muted);margin-left:6px}
.mp-ms .mp-name{font-size:11.5px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden}
.mp-ms .mp-name i{width:9px;height:9px;border-radius:2px;flex:none}.mp-ms .mp-name em{font-style:normal;font-size:10px;color:var(--amber)}
.mp-c{height:34px;vertical-align:middle;text-align:center;position:relative}
.mp-c.we{background:#f7f8fa}.mp-c.td{box-shadow:inset 2px 0 0 var(--rak),inset -2px 0 0 var(--rak)}
.mp-c[data-k]{cursor:pointer}
.mp-c.job{background:color-mix(in srgb,var(--c) 17%,#fff);box-shadow:inset 3px 0 0 var(--c)}
.mp-c.job.tent{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 18%,#fff) 0 5px,#fff 5px 9px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 55%,#fff)}
.mp-c.dim{background:repeating-linear-gradient(135deg,#f3f4f6 0 3px,#fff 3px 6px)}
.mp-c span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0 3px;line-height:1.25;color:#2b3038;overflow-wrap:anywhere}
.mp-c.ab span{font-size:10px;font-weight:600}
.mp-c.ab.off{background:#eceef2}.mp-c.ab.off span{color:#8b939f}
.mp-c.ab.ph{background:#fde3e3}.mp-c.ab.ph span{color:var(--rak)}
.mp-c.ab.lv{background:#fff1cc}.mp-c.ab.lv span{color:var(--amber)}
.mp-c.ms{background:color-mix(in srgb,var(--c) 12%,#fff)}.mp-c.ms span{font-weight:600;color:var(--c);font-size:10px}.mp-c.ms-bar,.mp-c.ms-inst,.mp-c.ms-sat{background:color-mix(in srgb,var(--c) 45%,#fff)}.mp-c.ms-inst span,.mp-c.ms-sat span{color:#fff;text-shadow:0 0 2px rgba(0,0,0,.35)}.mp-c.ms-sat{background:var(--c)}.mp-c.ms-inst{background:color-mix(in srgb,var(--c) 75%,#fff)}.mp-c.ms-fat{background:var(--c)}.mp-c.ms-fat span{color:#fff}.mp-c.ms-also-fat{box-shadow:inset 4px 0 0 ${MSC.FAT}}
.mp-odd{color:#c92a2a}.mp-oddr td{background:#fff5f5}
.mp-mtog{border:0;background:none;font:inherit;font-weight:700;color:inherit;cursor:pointer;padding:0}.mp-mtog small{font-weight:400;color:var(--muted)}
.mp-pj{cursor:pointer}.mp-pj:hover .mp-sn{text-decoration:underline}.mp-ms .mp-name .mp-jn{font-weight:600;font-variant-numeric:tabular-nums;color:#495057;flex:none}.mp-ms .mp-name .mp-sn{overflow:hidden;text-overflow:ellipsis}
.mp-pjd{border-collapse:collapse;width:calc(100% - 32px);font-size:13px;margin:8px 16px 10px}.mp-dlg>h4,.mp-pjms,.mp-dlg>.mp-hint{margin-left:16px;margin-right:16px}.mp-pjms{margin-bottom:16px}.mp-pjd th{background:none;text-align:left;font-weight:500;color:var(--muted);padding:4px 10px 4px 0;white-space:nowrap;vertical-align:top;width:110px}.mp-pjd td{padding:4px 0}
.mp-pjms{list-style:none;padding:0;margin:4px 0;display:grid;gap:4px;font-size:13px}.mp-pjms i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
.mp-mslg{margin-left:8px;font-size:10px;font-weight:400;color:var(--muted);display:inline-flex;gap:3px;align-items:center}.mp-mslg i{width:9px;height:9px;border-radius:50%;display:inline-block;margin-left:5px}.mp-mslg i.bar{width:16px;border-radius:2px}
.mp-z-week .mp-c,.mp-z-week .mp-d{min-width:104px;max-width:104px}.mp-z-week .mp-c{height:44px}.mp-z-week .mp-c span{-webkit-line-clamp:3}
.mp-z-month .mp-c,.mp-z-month .mp-d{min-width:58px;max-width:58px}.mp-z-month .mp-c span{font-size:9.5px}
.mp-z-quarter .mp-c,.mp-z-quarter .mp-d{min-width:22px;max-width:22px}.mp-z-quarter .mp-c.job{background:color-mix(in srgb,var(--c) 42%,#fff);box-shadow:none}.mp-z-quarter .mp-c.job.tent{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 42%,#fff) 0 3px,#fff 3px 6px)}.mp-z-quarter .mp-c.ms{background:var(--c)}.mp-z-quarter .mp-c.ms-bar{background:color-mix(in srgb,var(--c) 55%,#fff)}.mp-z-quarter .mp-c{height:26px}.mp-z-quarter .mp-c.job span,.mp-z-quarter .mp-c.ms span{display:none}.mp-z-quarter .mp-c.ab span{font-size:8.5px}
.mp-grid tfoot th,.mp-grid tfoot td{position:sticky;background:#fff;font-weight:600;font-size:11px}
.mp-grid tfoot tr:nth-child(1) th,.mp-grid tfoot tr:nth-child(1) td{bottom:52px;border-top:2px solid var(--line)}
.mp-grid tfoot tr:nth-child(2) th,.mp-grid tfoot tr:nth-child(2) td{bottom:26px}
.mp-grid tfoot tr:nth-child(3) th,.mp-grid tfoot tr:nth-child(3) td{bottom:0}
.mp-grid tfoot .mp-c{height:26px}.mp-grid tfoot th.mp-name{z-index:3}
.mp-sum.w td{color:var(--green)}.mp-sum.l td{color:var(--amber)}.mp-sum.f td{color:var(--rak)}
.mp-empty{background:#fff;border:1px dashed var(--line);border-radius:12px;padding:28px;text-align:center;color:var(--muted)}
.mp-note{margin:0;font-size:12px;color:var(--muted)}
.mp-modal{position:fixed;inset:0;background:rgba(18,20,24,.45);display:grid;place-items:center;padding:16px;z-index:60}
.mp-dlg{background:#fff;border-radius:14px;width:min(460px,100%);box-shadow:0 24px 60px -20px rgba(0,0,0,.45)}
.mp-dlg header{display:flex;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
.mp-dlg header span{color:var(--muted);font-size:12.5px}.mp-when{font-size:12.5px;color:#4a515c;margin-top:2px}
.mp-x{border:0;background:#f3f4f6;border-radius:8px;width:30px;height:30px;flex:none}
.mp-dl{display:grid;grid-template-columns:90px 1fr;gap:6px 12px;margin:0;padding:14px 16px}.mp-dl dt{color:var(--muted)}.mp-dl dd{margin:0;display:flex;gap:6px;align-items:center}
.mp-sp{position:absolute;top:1px;right:1px;font-size:8px;line-height:1;font-weight:700;color:#fff;background:var(--c,#2f6fd6);border-radius:3px;padding:2px 3px}
.mp-sp.x{background:var(--rak)}.mp-sp.in{position:static;display:inline-block;background:#2f6fd6;margin-right:4px}.mp-sp.x.in{background:var(--rak)}
.mp-c.sv{box-shadow:inset 3px 0 0 var(--c),inset 0 0 0 1px color-mix(in srgb,var(--c) 35%,#fff)}
.mp-z-quarter .mp-sp{display:none}
.mp-um{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12px;color:#4a515c}
.mp-um summary{cursor:pointer;color:var(--amber);font-weight:600}.mp-um ul{margin:8px 0;padding-left:18px;max-height:220px;overflow:auto}.mp-um li{margin:2px 0}.mp-um p{margin:4px 0 0;color:var(--muted)}
.mp-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);background:#f7fbf8}
.mp-act>span{font-weight:600;font-size:13px;width:100%}.mp-act small{width:100%;color:var(--muted);font-size:11.5px}
.mp-ok{border:1px solid var(--green);background:#fff;color:var(--green);border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.mp-ok:hover{background:var(--green);color:#fff}.mp-ok:disabled{opacity:.5;cursor:wait}
.mp-ro{margin:0;padding:0 16px 12px;font-size:12px;color:var(--muted)}
.mp-svd{border-top:1px solid var(--line)}.mp-svd h4{margin:12px 16px 0;font-size:13px}.mp-svd .mp-dl{padding-bottom:8px}
.mp-msg{padding:0 16px 12px;font-size:12.5px;color:var(--green)}.mp-msg:empty{display:none}
.mp-dlg{max-height:calc(100vh - 32px);overflow:auto}
.mp-fl{display:inline-flex;align-items:center;gap:4px}.mp-fl i{font-style:normal;color:var(--muted)}
.mp-clr{border:1px solid var(--line);background:#fff;color:#9aa1ab;font:inherit;font-size:13px;border-radius:8px;padding:4px 12px;cursor:default;white-space:nowrap}
.mp-clr.on{border-color:var(--rak);color:var(--rak);cursor:pointer}.mp-clr.on:hover{background:var(--rak);color:#fff}
.mp-clr b{display:inline-grid;place-items:center;min-width:18px;height:18px;border-radius:9px;background:var(--rak);color:#fff;font-size:11px;margin-left:4px;padding:0 4px}.mp-clr.on:hover b{background:#fff;color:var(--rak)}
.mp-c.ed:hover{background:#fff6f6;box-shadow:inset 0 0 0 1px #f0b9b9;cursor:copy}
.mp-fwrap{border-top:1px solid var(--line)}.mp-fwrap summary{cursor:pointer;padding:12px 16px;font-weight:600;font-size:13.5px;color:var(--rak)}
.mp-form{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;padding:0 16px 14px;font-size:12.5px;color:#4a515c}
.mp-form label{display:grid;gap:4px;min-width:0}.mp-form input{box-sizing:border-box;width:100%;min-width:0}.mp-form input[type=radio],.mp-form input[type=checkbox]{width:auto}.mp-form label.wide,.mp-form fieldset,.mp-chks,.mp-fbtn{grid-column:1/-1}
.mp-form input[type=text],.mp-form input:not([type]),.mp-form input[type=date]{font:inherit;font-size:13.5px;border:1px solid #dce1e8;border-radius:8px;padding:6px 10px;color:var(--ink)}
.mp-form fieldset{border:0;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px}.mp-form legend{padding:0;margin-bottom:4px}
.mp-wt{display:inline-flex!important;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:4px 12px;cursor:pointer;font-size:13px}
.mp-wt:has(input:checked){border-color:var(--rak);background:#fff1f1;color:var(--rak)}.mp-wt input{margin:0}
.mp-chks{display:flex;flex-wrap:wrap;gap:6px 16px}.mp-chks label{display:inline-flex;align-items:center;gap:6px}
.mp-fbtn{display:flex;gap:8px}.mp-save{background:var(--rak);color:#fff;border:0;border-radius:8px;padding:8px 18px;font:inherit;font-weight:600;cursor:pointer}
.mp-fwrap.lv summary{color:var(--amber)}.mp-lform .mp-wt:has(input:checked){border-color:var(--amber);background:#fff6e0;color:var(--amber)}.mp-lform .mp-save{background:var(--amber)}
.mp-ldel,.mp-del{background:#fff;color:var(--rak);border:1px solid #f0b9b9;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer}.mp-save:disabled,.mp-del:disabled{opacity:.5}
@media (max-width:640px){.mp-form{grid-template-columns:1fr}}
.mp-grid td.sel{box-shadow:inset 0 0 0 2px var(--rak)!important;background:#ffe9e9!important}
.mp-ed .mp-grid{user-select:none;-webkit-user-select:none}.mp-ed .mp-grid tbody td[data-k]{cursor:cell;touch-action:pan-x pan-y}
.mp-pick{border-top:1px solid var(--line)}.mp-pick summary{cursor:pointer;padding:10px 16px;font-size:13px;color:#4a515c}.mp-pick summary b{color:var(--rak)}
.mp-pl{padding:0 16px 10px;display:grid;gap:8px;max-height:260px;overflow:auto}
.mp-pl fieldset{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px}.mp-pl legend{font-weight:600;font-size:12px;color:var(--muted);margin-bottom:2px}
.mp-pl label{display:inline-flex;gap:4px;align-items:center}
.mp-tabs{display:inline-flex;gap:4px;background:#f3f4f6;border-radius:9px;padding:3px}.mp-tabs a{padding:4px 12px;border-radius:7px;text-decoration:none;color:#5d6572;font-size:13px}.mp-tabs a.on{background:#fff;color:var(--rak);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.mp-btn.off{opacity:.35;pointer-events:none}
.mp-page{display:grid;gap:12px}.mp-dtabs{display:flex;gap:6px;flex-wrap:wrap}.mp-dtabs button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}.mp-dtabs button.on{border-color:var(--rak);color:var(--rak);background:#fff1f1;font-weight:600}
.mp-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow:auto}
.mp-mt{border-collapse:collapse;font-size:12.5px;width:100%}.mp-mt [aria-invalid="true"]{outline:2px solid #c70404;outline-offset:1px;background:#fff0f0}.mp-mt th{text-align:left;color:var(--muted);font-weight:500;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
.mp-mt td{padding:4px 6px;border-bottom:1px solid #f0f1f4;vertical-align:middle}.mp-mt td.c{text-align:center}.mp-mt td.nw{white-space:nowrap}
.mp-mt input,.mp-mt select,.mp-hadd input,.mp-hadd select{font:inherit;font-size:12.5px;border:1px solid #dce1e8;border-radius:6px;padding:4px 6px;max-width:100%}
.mp-mt input[name=name_th],.mp-mt input[name=name]{min-width:180px}.mp-mt input[type=color]{padding:0;width:40px;height:26px}
.mp-mt tbody tr:first-child{background:#fbfcf8}
.mp-rs{border:1px solid var(--rak);background:#fff;color:var(--rak);border-radius:7px;padding:4px 10px;font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}.mp-rs:hover{background:var(--rak);color:#fff}
.mp-hd{border:0;background:none;color:var(--muted);cursor:pointer;font:inherit;font-size:12px}.mp-hd:hover{color:var(--rak)}
.mp-hadd{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mp-hint{font-size:12px;color:var(--muted);margin:6px 0 10px}.mp-card h4{margin:14px 0 4px;font-size:13px}.mp-warn{color:#c92a2a;font-weight:700;font-style:normal;cursor:help}.mp-on{font-size:11px;color:#2f9e44;white-space:nowrap}.mp-jobs td:nth-child(3){min-width:260px}.mp-jobs tbody tr:first-child{background:none}.mp-jobs th[data-sk]{cursor:pointer;user-select:none}.mp-jobs th[data-sk]:hover{color:#222}.mp-jobs th .ar{font-size:10px;margin-left:3px;opacity:.35}.mp-jobs th.on{color:var(--rak)}.mp-jobs th.on .ar{opacity:1}.mp-mq{width:320px;max-width:100%;margin:0 0 8px;padding:6px 10px}
.mp-pmsg{padding:0;font-size:13px}.mp-more{padding-top:10px}
.mp-madd{margin-left:8px;border:1px solid var(--rak);background:#fff;color:var(--rak);border-radius:6px;padding:1px 8px;font:inherit;font-size:11px;cursor:pointer}.mp-madd:hover{background:var(--rak);color:#fff}
.mp-ms td[data-m]{cursor:pointer}.mp-ms td[data-m].ed:hover{background:#fff6f6;box-shadow:inset 0 0 0 1px #f0b9b9}
.mp-mlist{padding:10px 16px;display:grid;gap:6px;border-bottom:1px solid var(--line)}.mp-mrow{display:flex;gap:6px;align-items:center}
.mp-mrow input{font:inherit;font-size:13px;border:1px solid #dce1e8;border-radius:7px;padding:5px 8px}.mp-mrow input[name=label]{flex:1;min-width:0}
.mp-mform{padding-top:12px}.mp-mform h4{margin:0;font-size:13px}.mp-mform select{font:inherit;font-size:13.5px;border:1px solid #dce1e8;border-radius:8px;padding:6px 8px;width:100%}
.mp-fs{margin-left:6px;cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
.mp-root:fullscreen,.mp-root.mp-full{background:var(--bg,#f5f6f8);padding:12px 14px;overflow:auto;gap:10px}
.mp-root.mp-full{position:fixed;inset:0;z-index:50}
body.mp-noscroll{overflow:hidden}
.mp-root:fullscreen .mp-scroll,.mp-root.mp-full .mp-scroll{max-height:none;height:calc(100vh - var(--mp-top,230px))}
.mp-root:fullscreen .mp-head,.mp-root.mp-full .mp-head{padding:10px 14px;gap:8px}
.mp-root:fullscreen .mp-note,.mp-root.mp-full .mp-note{display:none}
.mp-root:fullscreen .mp-legend,.mp-root.mp-full .mp-legend{flex-wrap:nowrap;overflow-x:auto;padding-bottom:2px}.mp-root:fullscreen .mp-lg,.mp-root.mp-full .mp-lg{white-space:nowrap;flex:none}
.mp-root:fullscreen .mp-um,.mp-root.mp-full .mp-um{display:none}
.mp-busy .mp-card:nth-of-type(3){opacity:.45;pointer-events:none;transition:opacity .2s}
.mp-dash-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.mp-dash-top h3{margin:0;font-size:18px}.mp-dash-top .mp-hint{margin:2px 0 0}
.mp-go{background:var(--rak);color:#fff;text-decoration:none;border-radius:10px;padding:10px 20px;font-weight:600;font-size:15px;box-shadow:0 6px 16px -8px rgba(199,4,4,.6)}.mp-go:hover{filter:brightness(1.08)}
.mp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.mp-kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:2px}.mp-kpi span{font-size:12.5px;color:var(--muted)}.mp-kpi b{font-size:26px;font-weight:700;line-height:1.15}.mp-kpi small{font-size:11px;color:#9aa1ab}
.mp-kpi.g b{color:var(--green)}.mp-kpi.a b{color:var(--amber)}.mp-kpi.r b{color:var(--rak)}.mp-kpi.t b{color:#2f6fd6}
.mp-card h4{margin:0 0 8px;font-size:14px}.mp-card h4 small,.mp-card h5 small{font-weight:400;color:var(--muted);font-size:11.5px;margin-left:6px}.mp-card h5{margin:8px 0 6px;font-size:12.5px;color:#424a57}
.mp-ch{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.mp-ch h4{margin:0}
.mp-per{display:inline-flex;gap:4px;flex-wrap:wrap}.mp-per button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:3px 12px;font:inherit;font-size:12.5px;cursor:pointer}.mp-per button.on{background:var(--rak);border-color:var(--rak);color:#fff}
.mp-g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px}.mp-g3{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:6px}
.mp-bars{display:grid;gap:5px}.mp-bar{display:grid;grid-template-columns:minmax(110px,42%) 1fr 64px;gap:8px;align-items:center;font-size:12.5px;color:var(--ink);text-decoration:none}
a.mp-bar:hover .mp-bl{color:var(--rak)}
.mp-bl{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-bl i{width:9px;height:9px;border-radius:2px;flex:none}
.mp-bt{background:#f1f3f6;border-radius:4px;height:12px;overflow:hidden}.mp-bt b{display:block;height:100%;border-radius:4px}
.mp-bn{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}.mp-bn small{font-weight:400;color:var(--muted);margin-left:4px;font-size:10.5px}
.mp-wk{display:flex;align-items:flex-end;gap:3px;height:120px;padding-top:6px}.mp-wk div{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;min-width:0}
.mp-wk b{display:block;width:100%;background:#3d5a80;border-radius:3px 3px 0 0;min-height:1px}.mp-wk span{font-size:9px;color:var(--muted);margin-top:3px;white-space:nowrap}
.mp-capw{overflow-x:auto}.mp-cap{border-collapse:separate;border-spacing:3px;font-size:12px;width:100%}.mp-cap th{font-weight:500;color:#4a515c;text-align:left;white-space:nowrap;padding:0 6px 0 0}.mp-cap th small{color:var(--muted);font-weight:400}
.mp-cap thead th{text-align:center;font-size:11px;line-height:1.2;padding:0}.mp-cap thead a{color:#4a515c;text-decoration:none}.mp-cap thead a:hover{color:var(--rak)}
.mp-cap td{text-align:center;border-radius:5px;height:26px;min-width:34px;font-weight:600;font-variant-numeric:tabular-nums}.mp-cap td.off{color:#c3c8d0;background:#f5f6f8;font-weight:400}
.mp-cap tr.tot th,.mp-cap tr.tot td{font-weight:700}
.mp-ul{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:12.5px}.mp-ul li{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mp-ul .d{color:var(--muted);min-width:88px;font-variant-numeric:tabular-nums}
.mp-ul i{width:9px;height:9px;border-radius:2px}.mp-ul li>span:not(.d){color:var(--muted)}.mp-ul a{color:var(--rak);font-size:12px;margin-left:auto}
button.mp-kpi{font:inherit;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s}button.mp-kpi:hover{border-color:#f0b9b9;box-shadow:0 4px 14px -8px rgba(0,0,0,.25)}
.mp-kpi small em{font-style:normal;color:var(--rak);opacity:0;transition:opacity .15s;margin-left:4px}button.mp-kpi:hover small em{opacity:1}
.mp-dlg.mp-wide{width:min(640px,100%)}.mp-dbody{padding:4px 16px 16px;max-height:70vh;overflow:auto}.mp-dbody h5{margin:12px 0 4px;font-size:12.5px;color:#424a57}.mp-dbody h5 small{font-weight:400;color:var(--muted)}
.mp-dlist{list-style:none;margin:0;padding:0;display:grid;gap:2px}.mp-dlist li{padding:6px 0;border-bottom:1px solid #f0f1f4;font-size:13px}
.mp-m{color:var(--muted);font-size:12px}.mp-dj{font-size:12.5px;color:#4a515c;margin-top:2px;line-height:1.5}.mp-dj .mp-dot{margin-right:4px;vertical-align:middle}
.mp-dh{display:flex;gap:8px;align-items:baseline;justify-content:space-between}
.mp-tg{font-style:normal;font-size:11px;border:1px dashed #9aa1ab;border-radius:4px;padding:0 4px;color:#4a515c}.mp-lvt{font-style:normal;color:var(--amber);font-weight:600}
.mp-open{color:var(--rak);font-size:12px;white-space:nowrap;margin-left:6px}
.mp-ut td,.mp-ut th{font-size:13px}.mp-ub{background:#f1f3f6;border-radius:4px;height:10px;width:140px;overflow:hidden}.mp-ub b{display:block;height:100%;background:var(--green)}
.mp-sep{width:1px;height:18px;background:var(--line);margin:0 4px}.mp-lg.pj{background:#fafbfc}.mp-lg.ty{font-weight:500}
@media (max-width:640px){.mp-legend{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.mp-lg{white-space:nowrap;flex:none}.mp-mon span{left:120px}.mp-name{min-width:112px;max-width:112px}.mp-name small{display:none}.mp-zoom{margin-left:0}.mp-scroll{max-height:none}}
`;

  window.Manpower = { mount, _range: range, _state: S };
})();
