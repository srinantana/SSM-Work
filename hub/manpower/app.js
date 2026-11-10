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
    "พักร้อน": ["พร", "lv", "พักร้อน"], "ลาป่วย": ["ป่วย", "lv", "ลาป่วย"], "ลาป่วยครึ่งวัน": ["ป่วย½", "lv", "ลาป่วยครึ่งวัน"],
    "ลากิจ": ["กิจ", "lv", "ลากิจ"], "ลาไม่รับค่าจ้าง": ["ไม่รับ", "lv", "ลาไม่รับค่าจ้าง"], "ลา": ["ลา", "lv", "ลา"],
    "สลับวันหยุด": ["สลับ", "off", "สลับวันหยุด"],
  };
  const KIND = { admin: ["#6d7582", "ประชุม / อบรม / ธุรการ"], internal: ["#9a7b4f", "งานภายใน"], other: ["#b3b8c2", "อื่นๆ (ตรวจสอบ)"] };

  let ROOT = null, DATA = null, LOADING = null, ERR = "";
  const S = { zoom: "month", date: new Date(), units: new Set(UNITS.map(u => u[0])), project: "", q: "", left: false, miles: true };

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

  /* ---------- load ---------- */
  async function load() {
    const [a, b] = range(), want = key(a) + "|" + key(b);
    if (DATA && DATA.want === want) return;
    ERR = "";
    try {
      const r = await fetch(`/api/manpower/board?from=${key(a)}&to=${key(b)}`, { cache: "no-store" });
      if (!r.ok) { ERR = r.status === 503 ? "ยังไม่ได้สร้างตารางข้อมูลกำลังคนใน Supabase (database/manpower.sql)" : r.status === 403 ? "บัญชีนี้ยังไม่มีสิทธิ์เมนูวางแผนกำลังคน" : "โหลดข้อมูลไม่สำเร็จ (" + r.status + ")"; DATA = null; return; }
      const d = await r.json();
      d.want = want;
      d.P = new Map(d.projects.map(p => [p.code, p]));
      d.A = new Map(d.assignments.map(x => [x.worker_id + "|" + x.day, x]));
      d.X = new Map(d.absences.map(x => [x.worker_id + "|" + x.day, x]));
      d.H = new Map(d.holidays.map(x => [x.day, x]));
      d.busy = new Set(d.assignments.concat(d.absences.filter(x => !["H", "PH", "EX"].includes(x.type))).map(x => x.worker_id));
      DATA = d;
    } catch { ERR = "โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้า"; DATA = null; }
  }
  function ensure() { if (!LOADING) LOADING = load().finally(() => { LOADING = null; }); return LOADING; }

  /* ---------- helpers ---------- */
  const norm = s => String(s ?? "").toLowerCase().replace(/\s+/g, "");
  const colorOf = a => a.project_code && DATA.P.get(a.project_code) ? DATA.P.get(a.project_code).color : (KIND[a.kind] || KIND.other)[0];
  const projName = a => a.project_code && DATA.P.get(a.project_code) ? DATA.P.get(a.project_code).name : (KIND[a.kind] || KIND.other)[1];
  function days() { const [a, b] = range(), out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
  function visibleWorkers() {
    const q = norm(S.q);
    return DATA.workers.filter(w => S.units.has(w.unit) && (w.active || (S.left && DATA.busy.has(w.id))) && (!q || norm(w.name_th + w.nickname + w.trade).includes(q)
      || (DATA.assignments.some(a => a.worker_id === w.id && norm(a.text).includes(q)))));
  }
  const dayOff = (k, d) => DATA.H.has(k) || d.getDay() === 0;

  /* ---------- render ---------- */
  function toolbar() {
    const [a] = range();
    const zoom = ZOOMS.map(([z, t]) => `<a href="${href(z, S.date)}" class="${S.zoom === z ? "on" : ""}">${t}</a>`).join("");
    const units = UNITS.map(([u]) => `<label class="mp-chk"><input type="checkbox" data-unit="${u}" ${S.units.has(u) ? "checked" : ""}>${u}</label>`).join("");
    const projs = DATA ? DATA.projects.map(p => `<option value="${esc(p.code)}" ${S.project === p.code ? "selected" : ""}>${esc(p.name)}${p.status !== "active" ? " (" + esc(p.status) + ")" : ""}</option>`).join("") : "";
    const can = DATA && DATA.canEdit;
    return `<div class="mp-head">
      <div class="mp-title"><h2>วางแผนกำลังคน</h2><span class="mp-badge ${can ? "ed" : ""}">${can ? "สิทธิ์แก้ไข (SC / PC / SSM) · เปิดแก้ไขใน Phase 2" : "ดูอย่างเดียว"}</span></div>
      <div class="mp-nav"><a class="mp-btn" href="${href(S.zoom, step(-1))}" aria-label="ก่อนหน้า">‹</a><a class="mp-btn" href="${href(S.zoom, today())}">วันนี้</a><a class="mp-btn" href="${href(S.zoom, step(1))}" aria-label="ถัดไป">›</a><b>${esc(title())}</b><span class="mp-zoom">${zoom}</span></div>
      <div class="mp-filters">${units}
        <select id="mpProj" aria-label="กรองโปรเจกต์"><option value="">ทุกโปรเจกต์</option>${projs}</select>
        <input id="mpQ" type="search" placeholder="ค้นหาชื่อ / งาน" value="${esc(S.q)}" aria-label="ค้นหา">
        <label class="mp-chk"><input type="checkbox" id="mpLeft" ${S.left ? "checked" : ""}>แสดงคนที่ลาออก</label>
        <label class="mp-chk"><input type="checkbox" id="mpMiles" ${S.miles ? "checked" : ""}>Milestone</label></div>
    </div>`;
  }

  function grid() {
    const ds = days(), tk = key(today()), W = visibleWorkers();
    const cls = "mp-z-" + S.zoom;
    // header rows: month band + day numbers
    let months = "", cur = -1, span = 0;
    const flush = () => { if (span) months += `<th class="mp-mon" colspan="${span}"><span>${MF[cur % 100]} ${Math.floor(cur / 100)}</span></th>`; };
    ds.forEach(d => { const m = d.getFullYear() * 100 + d.getMonth(); if (m !== cur) { flush(); cur = m; span = 0; } span++; });
    flush();
    const dayHead = ds.map(d => { const k = key(d), h = DATA.H.get(k); return `<th class="mp-d ${dayOff(k, d) ? "we" : ""} ${k === tk ? "td" : ""}" title="${esc(h ? (h.name || ABS[h.type]?.[2] || h.type) : "")}"><span>${DS[d.getDay()]}</span>${d.getDate()}</th>`; }).join("");
    // milestones
    let miles = "";
    if (S.miles && DATA.milestones.length) {
      const byP = new Map();
      DATA.milestones.forEach(m => { if (!S.project || m.project_code === S.project) { if (!byP.has(m.project_code)) byP.set(m.project_code, new Map()); const x = byP.get(m.project_code); x.set(m.day, (x.get(m.day) ? x.get(m.day) + " · " : "") + m.label); } });
      const rows = DATA.projects.filter(p => byP.has(p.code)).map(p => `<tr class="mp-ms"><th class="mp-name"><i style="background:${esc(p.color)}"></i>${esc(p.name)}${p.status !== "active" ? ` <em>${esc(p.status)}</em>` : ""}</th>${ds.map(d => { const t = byP.get(p.code).get(key(d)); return t ? `<td class="mp-c ms" style="--c:${esc(p.color)}" title="${esc(t)}"><span>◆ ${esc(t)}</span></td>` : `<td class="mp-c ${dayOff(key(d), d) ? "we" : ""}"></td>`; }).join("")}</tr>`).join("");
      if (rows) miles = `<tr class="mp-grp"><th class="mp-name">◆ Milestone โปรเจกต์</th><td colspan="${ds.length}"></td></tr>` + rows;
    }
    // people grouped by unit
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
    const working = (k) => act.filter(w => { const a = DATA.A.get(w.id + "|" + k); return a && (!S.project || a.project_code === S.project); }).length;
    const leave = (k) => act.filter(w => { const x = DATA.X.get(w.id + "|" + k); return x && ABS[x.type] && ABS[x.type][1] === "lv"; }).length;
    const free = (k, d) => dayOff(k, d) ? 0 : act.filter(w => !DATA.A.has(w.id + "|" + k) && !DATA.X.has(w.id + "|" + k)).length;
    const foot = sum(working, S.project ? "คนในโปรเจกต์" : "มีงาน", "w") + sum(leave, "ลา", "l") + sum(free, "ว่าง (ยังไม่ลงงาน)", "f");
    if (!W.length) return `<div class="mp-empty">ไม่พบรายชื่อตามตัวกรอง</div>`;
    return `<div class="mp-scroll ${cls}"><table class="mp-grid"><thead><tr><th class="mp-name mp-corner" rowspan="2">ชื่อ</th>${months}</tr><tr>${dayHead}</tr></thead>
      <tbody>${miles}${body}</tbody><tfoot>${foot}</tfoot></table></div>`;
  }

  function cell(w, d) {
    const k = key(d), id = w.id + "|" + k, a = DATA.A.get(id), x = DATA.X.get(id), we = dayOff(k, d);
    const base = `mp-c${we ? " we" : ""}${k === key(today()) ? " td" : ""}`;
    if (a && (!S.project || a.project_code === S.project)) {
      const c = colorOf(a);
      return `<td class="${base} job${a.tentative ? " tent" : ""}" style="--c:${esc(c)}" data-k="${esc(id)}" title="${esc(a.text)}"><span>${esc(a.text)}</span></td>`;
    }
    if (a) return `<td class="${base} dim" data-k="${esc(id)}" title="${esc(a.text)}"></td>`;
    if (x) { const t = ABS[x.type] || [x.type, "lv", x.type]; return `<td class="${base} ab ${t[1]}" data-k="${esc(id)}" title="${esc(t[2])}"><span>${esc(t[0])}</span></td>`; }
    return `<td class="${base}"></td>`;
  }

  function legend() {
    const n = new Map();
    DATA.assignments.forEach(a => { const c = a.project_code || "_" + a.kind; n.set(c, (n.get(c) || 0) + 1); });
    const items = DATA.projects.filter(p => n.has(p.code)).sort((a, b) => n.get(b.code) - n.get(a.code))
      .map(p => `<button type="button" class="mp-lg ${S.project === p.code ? "on" : ""}" data-p="${esc(p.code)}"><i style="background:${esc(p.color)}"></i>${esc(p.name)} <b>${n.get(p.code)}</b></button>`)
      .concat(Object.keys(KIND).filter(k => n.has("_" + k)).map(k => `<span class="mp-lg"><i style="background:${KIND[k][0]}"></i>${KIND[k][1]} <b>${n.get("_" + k)}</b></span>`));
    return `<div class="mp-legend"><span class="mp-lt">Man-day ในช่วงนี้</span>${items.join("")}<span class="mp-lg"><i class="tent-i"></i>จอง (ยังไม่ยืนยัน)</span><span class="mp-lg"><i class="lv-i"></i>ลา</span><span class="mp-lg"><i class="off-i"></i>H / PH วันหยุด</span></div>`;
  }

  function detail(k) {
    const [wid, day] = k.split("|"), w = DATA.workers.find(x => x.id === wid), a = DATA.A.get(k), x = DATA.X.get(k), d = fromKey(day);
    const body = a ? `<dl class="mp-dl"><dt>งาน</dt><dd>${esc(a.text)}</dd><dt>โปรเจกต์</dt><dd><i class="mp-dot" style="background:${esc(colorOf(a))}"></i>${esc(projName(a))}</dd><dt>สถานะ</dt><dd>${a.tentative ? "จอง (ยังไม่ยืนยัน)" : "ยืนยันแล้ว"}</dd></dl>`
      : x ? `<dl class="mp-dl"><dt>ประเภท</dt><dd>${esc((ABS[x.type] || [0, 0, x.type])[2])}</dd></dl>` : "";
    const el = document.createElement("div");
    el.className = "mp-modal";
    el.innerHTML = `<div class="mp-dlg" role="dialog" aria-modal="true" aria-label="รายละเอียด"><header><div><b>${esc(w ? (w.nickname || w.name_th) : wid)}</b> <span>${esc(w ? w.name_th : "")}</span><div class="mp-when">${DS[d.getDay()]}. ${d.getDate()} ${MF[d.getMonth()]} ${d.getFullYear()}</div></div><button type="button" class="mp-x" aria-label="ปิด">✕</button></header>${body}</div>`;
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".mp-x")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    el.querySelector(".mp-x").focus();
  }

  function draw() {
    if (!ROOT) return;
    if (!DATA) { ROOT.innerHTML = toolbar() + `<div class="mp-empty">${esc(ERR || "กำลังโหลด…")}</div>`; bind(); return; }
    ROOT.innerHTML = toolbar() + legend() + grid()
      + `<p class="mp-note">ข้อมูลตั้งแต่ 1 ม.ค. 2026 นำเข้าจาก Google Sheet "ตารางงานและวันหยุดช่าง 2569" ครั้งเดียว · จากนี้ใช้ SSM Work เป็นที่วางแผนที่เดียว · กดช่องเพื่อดูรายละเอียด</p>`;
    bind();
    const t = ROOT.querySelector("th.mp-d.td"), sc = ROOT.querySelector(".mp-scroll"), nc = ROOT.querySelector(".mp-corner");
    if (t && sc && nc) sc.scrollLeft = Math.max(0, t.offsetLeft - nc.offsetWidth - 2 * t.offsetWidth);
  }
  function bind() {
    ROOT.querySelectorAll("[data-unit]").forEach(c => c.addEventListener("change", () => { c.checked ? S.units.add(c.dataset.unit) : S.units.delete(c.dataset.unit); draw(); }));
    const p = ROOT.querySelector("#mpProj"); if (p) p.addEventListener("change", () => { S.project = p.value; draw(); });
    const q = ROOT.querySelector("#mpQ"); if (q) q.addEventListener("change", () => { S.q = q.value.trim(); draw(); });
    const l = ROOT.querySelector("#mpLeft"); if (l) l.addEventListener("change", () => { S.left = l.checked; draw(); });
    const m = ROOT.querySelector("#mpMiles"); if (m) m.addEventListener("change", () => { S.miles = m.checked; draw(); });
    ROOT.querySelectorAll(".mp-lg[data-p]").forEach(b => b.addEventListener("click", () => { S.project = S.project === b.dataset.p ? "" : b.dataset.p; draw(); }));
    const g = ROOT.querySelector(".mp-grid"); if (g) g.addEventListener("click", e => { const td = e.target.closest("td[data-k]"); if (td) detail(td.dataset.k); });
  }

  function mount(el, sub) {
    if (!document.getElementById("mpCss")) { const s = document.createElement("style"); s.id = "mpCss"; s.textContent = CSS; document.head.appendChild(s); }
    ROOT = el;
    const [z, k] = String(sub || "").split("/");
    if (ZOOMS.some(x => x[0] === z)) S.zoom = z;
    S.date = fromKey(k) || (sub ? S.date : today());
    draw();
    ensure().then(draw);
  }

  const CSS = `
.mp-root{display:grid;gap:14px}
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
.mp-c.ms{background:color-mix(in srgb,var(--c) 12%,#fff)}.mp-c.ms span{font-weight:600;color:var(--c);font-size:10px}
.mp-z-week .mp-c,.mp-z-week .mp-d{min-width:104px;max-width:104px}.mp-z-week .mp-c{height:44px}.mp-z-week .mp-c span{-webkit-line-clamp:3}
.mp-z-month .mp-c,.mp-z-month .mp-d{min-width:58px;max-width:58px}.mp-z-month .mp-c span{font-size:9.5px}
.mp-z-quarter .mp-c,.mp-z-quarter .mp-d{min-width:22px;max-width:22px}.mp-z-quarter .mp-c.job{background:color-mix(in srgb,var(--c) 42%,#fff);box-shadow:none}.mp-z-quarter .mp-c.job.tent{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--c) 42%,#fff) 0 3px,#fff 3px 6px)}.mp-z-quarter .mp-c.ms{background:var(--c)}.mp-z-quarter .mp-c{height:26px}.mp-z-quarter .mp-c.job span,.mp-z-quarter .mp-c.ms span{display:none}.mp-z-quarter .mp-c.ab span{font-size:8.5px}
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
@media (max-width:640px){.mp-legend{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}.mp-lg{white-space:nowrap;flex:none}.mp-mon span{left:120px}.mp-name{min-width:112px;max-width:112px}.mp-name small{display:none}.mp-zoom{margin-left:0}.mp-scroll{max-height:none}}
`;

  window.Manpower = { mount, _range: range, _state: S };
})();
