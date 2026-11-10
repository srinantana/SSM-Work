/* SSM Work · Service Plan module — calendar of site/service jobs from the sheet "ใบร้องขอคนจากฝ่ายผลิต" (tab ใบขอคน 2026).
   Routes (inside the hub): #service-plan                    → month view, today
                            #service-plan/<view>/<yyyy-mm-dd> → view = day | week | month | year
   Data:  /api/service-plan/jobs          – latest sheet rows, pushed by Apps Script on every added/changed row (scripts/service-plan-push.gs)
          /service-plan/data/snapshot.json – fallback snapshot until the first sync (or if Supabase is unreachable)
   Rows kept: column E (type) ∈ IS/SO/IN/WR and column I (status) ∈ New/Checking/Confirm/Complete.
   Subject:   Status | Type | Customer (F) | Job no. (D) — SS team leader (N).   Detail: Working description (G) + ทะเบียนรถ (H). */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SHEET = "https://docs.google.com/spreadsheets/d/1jubBroZnav3iWEVN74yMM1A5OKmsvZkmIUxpWWvnPmQ/edit";
  const DEFAULT_GID = 384071614;
  const TYPES = ["IS", "SO", "IN", "WR"];
  const STATUSES = ["New", "Checking", "Confirm", "Complete"];
  const ST_CLS = { New: "n", Checking: "k", Confirm: "c", Complete: "d" };
  const VIEWS = [["day", "วัน"], ["week", "สัปดาห์"], ["month", "เดือน"], ["year", "ปี"]];
  const MF = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const DS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];            // weeks start on Monday
  const DF = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"]; // by Date.getDay()
  const MAX_SPAN = 92;  // longest job (days) drawn on the calendar

  let JOBS = null, UNDATED = [], META = null, ROOT = null, LOADING = null, TIMER = null;
  const S = { view: "month", date: new Date(), q: "", st: new Set(STATUSES), ty: new Set(TYPES) };

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const key = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fromKey = k => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(k || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const weekStart = d => addDays(d, -((d.getDay() + 6) % 7));
  const sameDay = (a, b) => a && b && key(a) === key(b);
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };
  // Sheet dates are d/m/yy (5/1/26) or d/m/yyyy; Buddhist years (2569) are converted. "TBC", "Dec", "Next Week" → no date.
  function parseDate(s) {
    const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(String(s || "").trim());
    if (!m) return null;
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (y > 2400) y -= 543;
    const dt = new Date(y, mo - 1, d);
    return dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
  }
  const fmt = d => d ? `${d.getDate()} ${MS[d.getMonth()]} ${d.getFullYear()}` : "";
  const fmtLong = d => `${DF[d.getDay()]} ${d.getDate()} ${MF[d.getMonth()]} ${d.getFullYear()}`;

  /* ---------- rows → jobs ---------- */
  const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();
  const people = s => String(s ?? "").split(/\n|\/|,/).map(x => x.trim()).filter(Boolean).map(x => /^\d+$/.test(x) ? x + " คน" : x).join(", ");
  const statusOf = s => STATUSES.find(x => x.toLowerCase() === clean(s).toLowerCase()) || null;
  function toJobs(rows) {
    const dated = [], undated = [];
    (rows || []).forEach(r => {
      const v = r.v || [];
      const type = clean(v[4]).toUpperCase(), status = statusOf(v[8]);
      if (!TYPES.includes(type) || !status) return;
      let start = parseDate(v[15]), end = parseDate(v[16]);
      if (!start && end) start = end;
      if (start && (!end || end < start)) end = start;
      if (start && (end - start) / 864e5 > MAX_SPAN) end = addDays(start, MAX_SPAN);
      const j = { id: "r" + r.n, n: r.n, job: clean(v[3]), type, customer: clean(v[5]), desc: String(v[6] ?? "").trim(), car: clean(v[7]),
        status, ss: people(v[13]), start, end, rawStart: clean(v[15]), rawEnd: clean(v[16]) };
      j.subject = [j.status, j.type, j.customer, j.job].filter(Boolean).join(" | ") + (j.ss ? " — " + j.ss : "");
      (start ? dated : undated).push(j);
    });
    dated.sort((a, b) => a.start - b.start || a.n - b.n);
    return { dated, undated };
  }

  /* ---------- load ---------- */
  async function load(force) {
    let data = null, src = "live", why = "";
    try {
      const r = await fetch("/api/service-plan/jobs", { cache: "no-store" });
      if (r.ok) data = await r.json();
      else why = r.status === 503 ? "ยังไม่มีข้อมูลซิงก์จาก Google Sheet" : "โหลดข้อมูลไม่สำเร็จ (" + r.status + ")";
    } catch { why = "โหลดข้อมูลไม่สำเร็จ"; }
    if (!data || !Array.isArray(data.rows)) {
      src = "snapshot";
      data = await fetch("/service-plan/data/snapshot.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
    }
    if (!data) { META = { src: "none", why }; JOBS = []; UNDATED = []; return; }
    const { dated, undated } = toJobs(data.rows);
    JOBS = dated; UNDATED = undated;
    META = { src, why, updated: data.updated ? new Date(data.updated) : null, fetched: new Date(), gid: data.gid || DEFAULT_GID, sheet: data.sheet || "" };
  }
  function ensure(force) {
    if (!LOADING || force) LOADING = load(force).finally(() => { LOADING = null; });
    return LOADING;
  }

  /* ---------- filtering ---------- */
  const norm = s => String(s ?? "").toLowerCase().replace(/[\s\-_.,()#/|]+/g, "");
  const visible = j => S.st.has(j.status) && S.ty.has(j.type) && (!S.q || norm([j.job, j.customer, j.desc, j.ss, j.car, j.type, j.status].join(" ")).includes(norm(S.q)));
  function byDay(from, to) { // Map key → jobs touching that day, within [from, to]
    const map = new Map();
    JOBS.filter(visible).forEach(j => {
      if (j.end < from || j.start > to) return;
      for (let d = j.start < from ? from : j.start; d <= j.end && d <= to; d = addDays(d, 1)) {
        const k = key(d); if (!map.has(k)) map.set(k, []); map.get(k).push(j);
      }
    });
    return map;
  }

  /* ---------- pieces ---------- */
  const href = (view, d) => "#service-plan/" + view + "/" + key(d);
  const chip = (j, d) => {
    const cont = d && !sameDay(d, j.start) && !(d.getDay() === 1);
    return `<button type="button" class="spc-ev st-${ST_CLS[j.status]}" data-j="${j.id}" title="${esc(j.subject)}">${cont ? "↳ " : ""}${esc(j.subject)}</button>`;
  };
  const card = j => `<button type="button" class="spc-card st-${ST_CLS[j.status]}" data-j="${j.id}">
      <span class="spc-sub">${esc(j.subject)}</span>
      <span class="spc-meta">📅 ${esc(fmt(j.start))}${sameDay(j.start, j.end) ? "" : " – " + esc(fmt(j.end))} · 🚗 ${esc(j.car || "–")}</span>
      ${j.desc ? `<span class="spc-desc1">${esc(j.desc)}</span>` : ""}</button>`;

  function title() {
    const d = S.date;
    if (S.view === "day") return fmtLong(d);
    if (S.view === "week") { const a = weekStart(d), b = addDays(a, 6); return `${a.getDate()} ${MS[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? " " + a.getFullYear() : ""} – ${b.getDate()} ${MS[b.getMonth()]} ${b.getFullYear()}`; }
    if (S.view === "month") return `${MF[d.getMonth()]} ${d.getFullYear()}`;
    return String(d.getFullYear());
  }
  function step(n) {
    const d = S.date;
    if (S.view === "day") return addDays(d, n);
    if (S.view === "week") return addDays(d, 7 * n);
    if (S.view === "month") return new Date(d.getFullYear(), d.getMonth() + n, 1);
    return new Date(d.getFullYear() + n, 0, 1);
  }

  function toolbar() {
    const all = JOBS.concat(UNDATED).filter(j => S.ty.has(j.type));
    const cnt = s => all.filter(j => j.status === s).length;
    const src = META.src === "live"
      ? `<span class="spc-src live">● Google Sheet</span> ซิงก์ล่าสุด ${esc((META.updated || META.fetched).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }))}`
      : META.src === "snapshot"
        ? `<span class="spc-src snap">● ข้อมูลสำรอง</span> ณ ${esc(META.updated ? META.updated.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "–")}${META.why ? " · " + esc(META.why) : ""}`
        : `<span class="spc-src snap">● โหลดข้อมูลไม่สำเร็จ</span>`;
    return `<div class="spc-bar">
      <div class="spc-nav"><a class="spc-btn" href="${href(S.view, step(-1))}" aria-label="ก่อนหน้า">‹</a><a class="spc-btn" href="${href(S.view, today())}">วันนี้</a><a class="spc-btn" href="${href(S.view, step(1))}" aria-label="ถัดไป">›</a><h2>${esc(title())}</h2></div>
      <div class="spc-views" role="tablist">${VIEWS.map(([v, t]) => `<a role="tab" aria-selected="${v === S.view}" href="${href(v, S.date)}">${t}</a>`).join("")}</div>
    </div>
    <div class="spc-bar spc-filters">
      <label class="spc-search"><input id="spcQ" type="search" placeholder="ค้นหา เลขงาน / ลูกค้า / รายละเอียด / ชื่อ SS / ทะเบียนรถ" value="${esc(S.q)}"></label>
      <div class="spc-chips">${STATUSES.map(s => `<button type="button" class="spc-f st-${ST_CLS[s]}" data-st="${s}" aria-pressed="${S.st.has(s)}"><i></i>${s} <b>${cnt(s)}</b></button>`).join("")}</div>
      <div class="spc-chips">${TYPES.map(t => `<button type="button" class="spc-f ty" data-ty="${t}" aria-pressed="${S.ty.has(t)}">${t}</button>`).join("")}</div>
    </div>
    <div class="spc-info">${src} · <button type="button" class="spc-link" id="spcRefresh">⟳ รีเฟรชข้อมูล</button> · <a class="spc-link" href="${SHEET}#gid=${META.gid || DEFAULT_GID}" target="_blank" rel="noopener">เปิด Google Sheet ↗</a></div>`;
  }

  function viewMonth() {
    const y = S.date.getFullYear(), m = S.date.getMonth(), t = today();
    const from = weekStart(new Date(y, m, 1)), last = new Date(y, m + 1, 0);
    const to = addDays(weekStart(last), 6), map = byDay(from, to);
    let cells = "";
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const list = map.get(key(d)) || [], out = d.getMonth() !== m;
      cells += `<div class="spc-cell${out ? " o" : ""}${sameDay(d, t) ? " t" : ""}${d.getDay() === 0 || d.getDay() === 6 ? " we" : ""}">
        <a class="spc-dn" href="${href("day", d)}">${d.getDate()}</a>
        ${list.slice(0, 3).map(j => chip(j, d)).join("")}
        ${list.length > 3 ? `<a class="spc-more" href="${href("day", d)}">+${list.length - 3} งาน</a>` : ""}
        ${list.length ? `<a class="spc-dots" href="${href("day", d)}" aria-label="${list.length} งาน">${list.slice(0, 5).map(j => `<i class="st-${ST_CLS[j.status]}"></i>`).join("")}</a>` : ""}</div>`;
    }
    return `<div class="spc-month"><div class="spc-head">${DS.map(x => `<span>${x}</span>`).join("")}</div><div class="spc-grid">${cells}</div></div>`;
  }

  function viewWeek() {
    const a = weekStart(S.date), b = addDays(a, 6), map = byDay(a, b), t = today();
    let cols = "";
    for (let d = a, i = 0; i < 7; d = addDays(d, 1), i++) {
      const list = map.get(key(d)) || [];
      cols += `<section class="spc-col${sameDay(d, t) ? " t" : ""}"><a class="spc-ch" href="${href("day", d)}"><b>${DS[i]}</b> ${d.getDate()} ${MS[d.getMonth()]}<span>${list.length ? list.length + " งาน" : ""}</span></a>
        ${list.length ? list.map(j => card(j)).join("") : `<div class="spc-none">–</div>`}</section>`;
    }
    return `<div class="spc-week">${cols}</div>`;
  }

  function viewDay() {
    const d = S.date, list = byDay(d, d).get(key(d)) || [];
    return `<div class="spc-day">${list.length ? list.map(j => card(j)).join("") : `<div class="empty">ไม่มีงานในวันนี้</div>`}</div>`;
  }

  function viewYear() {
    const y = S.date.getFullYear(), t = today();
    const map = byDay(new Date(y, 0, 1), new Date(y, 11, 31));
    let html = "";
    for (let m = 0; m < 12; m++) {
      const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
      const jobs = new Set();
      let cells = "";
      for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells += `<span></span>`;
      for (let d = first; d <= last; d = addDays(d, 1)) {
        const list = map.get(key(d)) || [];
        list.forEach(j => jobs.add(j.id));
        const lv = list.length >= 4 ? 3 : list.length >= 2 ? 2 : list.length ? 1 : 0;
        cells += `<a class="spc-yd l${lv}${sameDay(d, t) ? " t" : ""}" href="${href("day", d)}" title="${esc(fmt(d))}${list.length ? " · " + list.length + " งาน" : ""}">${d.getDate()}</a>`;
      }
      html += `<section class="spc-ym"><a class="spc-ymh" href="${href("month", first)}"><b>${MF[m]}</b><span>${jobs.size ? jobs.size + " งาน" : ""}</span></a>
        <div class="spc-yh">${DS.map(x => `<span>${x}</span>`).join("")}</div><div class="spc-yg">${cells}</div></section>`;
    }
    return `<div class="spc-year">${html}</div><div class="spc-legend">จำนวนงานต่อวัน <i class="l1"></i>1 <i class="l2"></i>2–3 <i class="l3"></i>4+</div>`;
  }

  function undated() {
    const list = UNDATED.filter(visible);
    if (!list.length) return "";
    return `<details class="spc-und"><summary>ยังไม่ระบุวันเข้างาน (TBC ฯลฯ) · ${list.length} งาน</summary><div class="spc-day">${list.map(j => card(j).replace(/📅 [^·]*·/, `📅 ${esc(j.rawStart || "ไม่ระบุ")} ·`)).join("")}</div></details>`;
  }

  /* ---------- detail ---------- */
  function detail(j) {
    document.querySelectorAll(".spc-modal").forEach(m => m.remove());
    const range = sameDay(j.start, j.end) ? fmtLong(j.start) : `${fmtLong(j.start)} – ${fmtLong(j.end)}`;
    const when = j.start ? range : (j.rawStart || "ไม่ระบุ") + (j.rawEnd && j.rawEnd !== j.rawStart ? " – " + j.rawEnd : "");
    const el = document.createElement("div");
    el.className = "spc-modal";
    el.innerHTML = `<div class="spc-dlg" role="dialog" aria-modal="true" aria-labelledby="spcDt">
      <header class="st-${ST_CLS[j.status]}"><div><span class="spc-pill st-${ST_CLS[j.status]}">${esc(j.status)}</span> <span class="spc-pill ty">${esc(j.type)}</span><h3 id="spcDt">${esc(j.subject)}</h3></div><button type="button" class="spc-x" aria-label="ปิด">✕</button></header>
      <div class="spc-dlg-b">
        <dl class="spc-dl">
          <dt>ลูกค้า</dt><dd>${esc(j.customer || "–")}</dd>
          <dt>เลขงาน</dt><dd>${esc(j.job || "–")}</dd>
          <dt>วันเข้างาน</dt><dd>${esc(when)}</dd>
          <dt>SS (หัวหน้าทีม)</dt><dd>${esc(j.ss || "–")}</dd>
          <dt>ทะเบียนรถ</dt><dd><b>${esc(j.car || "–")}</b></dd>
        </dl>
        <h4>Working description</h4>
        <div class="spc-desc">${esc(j.desc || "–")}</div>
        <a class="spc-link" href="${SHEET}#gid=${META.gid || DEFAULT_GID}&range=D${j.n}" target="_blank" rel="noopener">เปิดแถว ${j.n} ใน Google Sheet ↗</a>
      </div></div>`;
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".spc-x")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    el.querySelector(".spc-x").focus();
  }

  /* ---------- render ---------- */
  function draw() {
    if (!ROOT || !document.body.contains(ROOT)) return;
    const body = S.view === "day" ? viewDay() : S.view === "week" ? viewWeek() : S.view === "year" ? viewYear() : viewMonth();
    const qFocus = document.activeElement && document.activeElement.id === "spcQ", pos = qFocus ? document.activeElement.selectionStart : 0;
    ROOT.innerHTML = toolbar() + `<div class="spc-body v-${S.view}">${body}</div>` + undated();
    if (qFocus) { const q = ROOT.querySelector("#spcQ"); q.focus(); q.setSelectionRange(pos, pos); }
  }
  function bind(el) {
    el.addEventListener("click", e => {
      const ev = e.target.closest("[data-j]");
      if (ev) { const id = ev.dataset.j; const j = JOBS.concat(UNDATED).find(x => x.id === id); if (j) detail(j); return; }
      const f = e.target.closest("[data-st],[data-ty]");
      if (f) {
        const set = f.dataset.st ? S.st : S.ty, v = f.dataset.st || f.dataset.ty;
        set.has(v) ? set.delete(v) : set.add(v);
        return draw();
      }
      if (e.target.closest("#spcRefresh")) {
        e.target.closest("#spcRefresh").textContent = "กำลังโหลด…";
        ensure(true).then(draw);
      }
    });
    el.addEventListener("input", e => { if (e.target.id === "spcQ") { S.q = e.target.value; draw(); } });
  }

  function mount(el, sub) {
    if (!document.getElementById("spcCss")) { const s = document.createElement("style"); s.id = "spcCss"; s.textContent = CSS; document.head.appendChild(s); }
    document.querySelectorAll(".spc-modal").forEach(m => m.remove());
    const [v, d] = (sub || "").split("/");
    S.view = VIEWS.some(x => x[0] === v) ? v : "month";
    S.date = fromKey(d) || today();
    ROOT = el; bind(el);
    if (JOBS) return draw();
    el.innerHTML = `<div class="empty">กำลังโหลดแผนงานจาก Google Sheet…</div>`;
    ensure(false).then(draw);
    if (!TIMER) TIMER = setInterval(() => { if (ROOT && document.body.contains(ROOT) && !document.querySelector(".spc-modal")) ensure(true).then(draw); }, 5 * 60 * 1000);
  }

  const CSS = `
.spc-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.spc-nav{display:flex;align-items:center;gap:6px}.spc-nav h2{margin:0 0 0 8px;font-size:19px;font-weight:600}
.spc-btn{display:inline-grid;place-items:center;min-width:36px;height:34px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:#fff;text-decoration:none;color:var(--ink);font-size:13.5px}
.spc-btn:hover{border-color:#f0b9b9;color:var(--rak)}
.spc-views{display:flex;background:#eef0f3;border-radius:9px;padding:3px}
.spc-views a{padding:5px 14px;border-radius:7px;text-decoration:none;color:#5d6572;font-size:13.5px}
.spc-views a[aria-selected="true"]{background:#fff;color:var(--rak);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.spc-filters{justify-content:flex-start}
.spc-search{flex:1 1 280px}.spc-search input{width:100%;height:36px;border:1px solid var(--line);border-radius:8px;padding:0 12px;font:inherit;background:#fff}
.spc-chips{display:flex;flex-wrap:wrap;gap:6px}
.spc-f{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:999px;padding:3px 11px;font-size:12.5px;color:#4a515c}
.spc-f b{font-weight:600;color:var(--muted)}
.spc-f i{width:9px;height:9px;border-radius:50%;background:var(--c)}
.spc-f[aria-pressed="false"]{opacity:.45;text-decoration:line-through}
.spc-f.ty[aria-pressed="true"]{background:#22252b;color:#fff;border-color:#22252b}
.spc-info{font-size:12px;color:var(--muted)}
.spc-src{font-weight:600}.spc-src.live{color:var(--green)}.spc-src.snap{color:var(--amber)}
.spc-link{background:none;border:0;padding:0;color:var(--rak);font:inherit;text-decoration:none;cursor:pointer}.spc-link:hover{text-decoration:underline}
.st-n{--c:#2f6fd6;--cs:#e8f0fd}.st-k{--c:#c28a12;--cs:#fff4da}.st-c{--c:#188764;--cs:#e9f7f0}.st-d{--c:#6d7582;--cs:#eef0f3}
.spc-month{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.spc-head,.spc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.spc-head span{padding:8px;font-size:12px;color:var(--muted);text-align:center;border-bottom:1px solid var(--line);background:#fafbfc}
.spc-cell{min-height:118px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px;display:flex;flex-direction:column;gap:3px;min-width:0}
.spc-cell:nth-child(7n){border-right:0}.spc-cell.we{background:#fcfcfd}.spc-cell.o{background:#f8f9fa}.spc-cell.o .spc-dn{color:#b4bac3}
.spc-dn{align-self:flex-start;font-size:12px;text-decoration:none;color:#4a515c;width:24px;height:24px;display:grid;place-items:center;border-radius:50%}
.spc-dn:hover{background:var(--blush)}.spc-cell.t .spc-dn{background:var(--rak);color:#fff;font-weight:600}
.spc-ev{display:block;width:100%;text-align:left;border:0;border-left:3px solid var(--c);background:var(--cs);color:#2b3038;border-radius:4px;padding:2px 6px;font-size:11.5px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.spc-ev:hover{filter:brightness(.96)}
.spc-more{font-size:11px;color:var(--muted);text-decoration:none;padding-left:4px}.spc-more:hover{color:var(--rak)}
.spc-dots{display:none}
.spc-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.spc-col{background:#fff;border:1px solid var(--line);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:6px;min-width:0}
.spc-col.t{border-color:#f0b9b9;box-shadow:0 0 0 2px var(--blush)}
.spc-ch{display:flex;flex-wrap:wrap;gap:4px;align-items:baseline;text-decoration:none;color:var(--ink);font-size:13px;padding:2px 4px}
.spc-ch span{margin-left:auto;font-size:11px;color:var(--muted)}
.spc-none{color:#c3c8d0;text-align:center;padding:10px 0}
.spc-card{display:grid;gap:3px;text-align:left;border:1px solid var(--line);border-left:4px solid var(--c);background:#fff;border-radius:8px;padding:8px 10px;color:var(--ink);width:100%;min-width:0}
.spc-card:hover{background:var(--cs)}
.spc-sub{font-weight:600;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.spc-meta{font-size:11.5px;color:var(--muted)}
.spc-desc1{font-size:12px;color:#4a515c;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.spc-week .spc-sub{font-size:12px}.spc-week .spc-desc1{display:none}
.spc-day{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
.spc-year{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.spc-ym{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.spc-ymh{display:flex;justify-content:space-between;text-decoration:none;color:var(--ink);margin-bottom:6px}.spc-ymh span{font-size:11.5px;color:var(--rak)}
.spc-yh,.spc-yg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}
.spc-yh span{font-size:10px;color:#9aa1ab}
.spc-yd{font-size:11px;line-height:24px;border-radius:5px;text-decoration:none;color:#4a515c}
.spc-yd:hover{outline:1px solid #f0b9b9}
.l1{background:#ffe1e1}.l2{background:#ffadad}.l3{background:var(--rak);color:#fff!important}
.spc-yd.t{box-shadow:inset 0 0 0 2px #22252b;font-weight:600}
.spc-legend{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px}.spc-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;margin-left:6px}
.spc-und{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.spc-und summary{cursor:pointer;font-weight:600;color:var(--amber)}.spc-und[open] summary{margin-bottom:10px}
.spc-modal{position:fixed;inset:0;background:rgba(18,20,24,.45);display:grid;place-items:center;padding:16px;z-index:60}
.spc-dlg{background:#fff;border-radius:14px;width:min(620px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 60px -20px rgba(0,0,0,.45)}
.spc-dlg header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line);background:var(--cs);border-radius:14px 14px 0 0}
.spc-dlg h3{margin:8px 0 0;font-size:16px;line-height:1.5}
.spc-pill{display:inline-block;font-size:11px;font-weight:600;border-radius:999px;padding:1px 9px;background:#fff;color:var(--c);border:1px solid var(--c)}
.spc-pill.ty{color:#fff;background:#22252b;border-color:#22252b}
.spc-x{border:0;background:#fff;border-radius:8px;width:32px;height:32px;flex:none}
.spc-dlg-b{padding:16px 18px;display:grid;gap:10px}
.spc-dl{display:grid;grid-template-columns:130px 1fr;gap:6px 12px;margin:0}.spc-dl dt{color:var(--muted)}.spc-dl dd{margin:0}
.spc-dlg h4{margin:6px 0 0;font-size:13.5px}
.spc-desc{white-space:pre-wrap;background:#fafbfc;border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-size:13.5px}
@media (max-width:900px){.spc-week{grid-template-columns:1fr}.spc-week .spc-desc1{display:-webkit-box}}
@media (max-width:640px){.spc-cell{min-height:64px}.spc-cell .spc-ev,.spc-cell .spc-more{display:none}.spc-dots{display:flex;flex-wrap:wrap;gap:2px;padding:2px}.spc-dots i{width:7px;height:7px;border-radius:50%;background:var(--c)}
  .spc-nav h2{font-size:16px}.spc-views a{padding:5px 10px}.spc-dl{grid-template-columns:1fr}.spc-dl dt{font-size:12px}.spc-day{grid-template-columns:1fr}}
`;

  window.ServicePlan = { mount, _toJobs: toJobs, _parseDate: parseDate };
})();
