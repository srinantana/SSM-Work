/* SSM Work · Site Team (ทีมหน้างาน) — team list with passport / ID card / birth date, passport renewals, overseas trips.
   Routes (inside the hub): #site-team            → ภาพรวม (dashboard)
                            #site-team/certs[/<course>] → Certificate (skills matrix + renewals with จป)
                            #site-team/people     → รายชื่อทีม
                            #site-team/renew      → ต่ออายุ Passport
                            #site-team/trips      → เดินทางต่างประเทศ
                            #site-team/import     → นำเข้าจาก Excel (SC / PC / SSM)
   Data:  GET /api/site-team/data → { canEdit, workers (Manpower board), people (passport data), trips }
   National ID, passport no. and birth date are only sent to SC / PC / SSM (canEdit); others get name, team, expiry. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const UNITS = [["ME", "ME · งานโลหะ"], ["PP", "PP · งานพลาสติก"], ["EE", "EE · ไฟฟ้า"], ["PC", "PC · วางแผนผลิต"], ["SC", "SC / SSM"], ["EN", "Engineer"], ["SP", "Support"], ["OT", "Other"], ["-", "ไม่อยู่ใน Manpower"]];
  const GROUPS = [["EN", "Engineer"], ["SP", "Support"], ["OT", "Other"]];   // for people who are not on the Manpower board (site_team_people.team)
  const GROUP_OK = new Set(GROUPS.map(g => g[0]));
  const UNIT_L = Object.fromEntries(UNITS);
  const UNIT_ST = { ME: ["🔩", "#e8590c", "#fff4e6"], PP: ["🧪", "#1971c2", "#e7f5ff"], EE: ["⚡", "#f08c00", "#fff9db"], PC: ["📋", "#7048e8", "#f3f0ff"], SC: ["🧭", "#c2255c", "#fff0f6"],
    EN: ["📐", "#0c8599", "#e3fafc"], SP: ["🤝", "#2f9e44", "#ebfbee"], OT: ["🌱", "#5c940d", "#f4fce3"], "-": ["👤", "#868e96", "#f1f3f5"] };
  const unitBadge = u => { const [i, c, bg] = UNIT_ST[u] || UNIT_ST["-"]; return `<span class="stm-ub" style="color:${c};background:${bg}">${i} ${esc(u === "-" ? "อื่นๆ" : u)}</span>`; };
  const FLAG = { "ญี่ปุ่น": "🇯🇵", "จีน": "🇨🇳", "เกาหลีใต้": "🇰🇷", "ไต้หวัน": "🇹🇼", "เวียดนาม": "🇻🇳", "มาเลเซีย": "🇲🇾", "สิงคโปร์": "🇸🇬", "อินโดนีเซีย": "🇮🇩", "ฟิลิปปินส์": "🇵🇭",
    "อินเดีย": "🇮🇳", "กัมพูชา": "🇰🇭", "ลาว": "🇱🇦", "เมียนมา": "🇲🇲", "สหรัฐอเมริกา": "🇺🇸", "Schengen (ยุโรป)": "🇪🇺", "สหราชอาณาจักร": "🇬🇧", "ออสเตรเลีย": "🇦🇺",
    "สหรัฐอาหรับเอมิเรตส์": "🇦🇪", "ซาอุดีอาระเบีย": "🇸🇦", "ไทย": "🇹🇭", "Thailand": "🇹🇭" };
  const flag = c => FLAG[c] || "🌏";
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const RENEW = [["", "—"], ["needed", "ต้องต่ออายุ"], ["in_progress", "กำลังดำเนินการ"], ["done", "ต่อแล้ว"]];
  const RENEW_L = Object.fromEntries(RENEW);
  const INS = [["", "—"], ["trip", "รายเที่ยว"], ["annual", "รายปี"]];
  const INS_L = Object.fromEntries(INS);
  const TABS = [["", "🏠 ภาพรวม"], ["people", "👷 รายชื่อทีม"], ["renew", "🔄 ต่ออายุ Passport"], ["visas", "🛂 วีซ่า"], ["certs", "🎓 Certificate"], ["insurance", "🛡️ ประกันเดินทาง"], ["trips", "✈️ เดินทางต่างประเทศ"]];
  const TRAVEL_MONTHS = 6;   // most countries need the passport valid ≥ 6 months after the return date
  const PASS_SOON_MONTHS = 7;   // "Passport ใกล้หมดอายุ" (orange) under this many months left
  const RENEW_MONTHS = 9;    // flag for renewal this early: a Thai passport takes ~1–2 weeks plus the trip to an office

  let ROOT = null, D = null, ERR = "", LOADING = null;
  const S = { page: "", unit: "", st: "", q: "", trip: null, imp: null, vc: "", cc: "", cst: "", cOnly: true, tCert: "", cFull: false, tOpen: new Set() };
  const VISA_SOON = 3;   // months — a visa expiring sooner is flagged ใกล้หมด

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
  const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const fmt = s => { const d = parse(s); return d ? d.getDate() + " " + MS[d.getMonth()] + " " + d.getFullYear() : ""; };   // ค.ศ. — same as printed in the passport
  const age = s => { const d = parse(s), t = today(); if (!d) return ""; let a = t.getFullYear() - d.getFullYear(); if (t < new Date(t.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
  const monthsLeft = s => { const d = parse(s); return d ? (d - today()) / (30.44 * 864e5) : null; };

  /* ---------- people = Manpower workers + passport rows ---------- */
  function people() {
    const byW = new Map(D.people.filter(p => p.worker_id).map(p => [p.worker_id, p]));
    const out = D.workers.filter(w => w.active !== false || byW.has(w.id)).map(w => {
      const p = byW.get(w.id) || {};
      return { key: "w:" + w.id, worker: w, p, pid: p.id || 0, unit: w.unit || "-", name_th: w.name_th || p.name_th || "", nick: w.nickname || "",
        name_en: p.name_en || w.name_en_hr || "", code: w.emp_code || w.id, active: w.active !== false && p.active !== false };
    });
    for (const p of D.people) if (!p.worker_id) out.push({ key: "p:" + p.id, worker: null, p, pid: p.id, unit: GROUP_OK.has(p.team) ? p.team : "-", name_th: p.name_th || "", nick: "", name_en: p.name_en || "", code: p.emp_code || "", active: p.active !== false });
    return out.map(r => Object.assign(r, status(r.p)));
  }
  function status(p) {
    const has = !!(p.passport_no || p.passport_expiry || p.has_passport);
    if (!has) return { st: "none", stL: "ไม่มี Passport", m: null };
    const m = monthsLeft(p.passport_expiry);
    // labels (Dew, 20 Nov 2026): มี Passport = green · ไม่มี Passport = grey · Passport หมดอายุ = red · ใกล้หมดอายุ (< 7 months) = orange
    if (m == null) return { st: "unk", stL: "มี Passport (ไม่ทราบวันหมดอายุ)", m };
    if (m < 0) return { st: "exp", stL: "Passport หมดอายุ", m };
    if (m < PASS_SOON_MONTHS) return { st: "lt6", stL: "Passport ใกล้หมดอายุ", m };
    return { st: "ok", stL: "มี Passport", m };
  }
  const ST_CLS = { none: "st-none", unk: "st-none", exp: "st-bad", lt6: "st-warn", lt12: "st-ok", ok: "st-ok" };
  const needsRenew = r => r.active && (r.st === "exp" || r.st === "lt6" || (r.m != null && r.m < RENEW_MONTHS)) || ["needed", "in_progress"].includes(r.p.renewal_status);
  const mask = (v, keep = 4) => v ? "•".repeat(Math.max(0, String(v).length - keep)) + String(v).slice(-keep) : "";
  const fmtId = v => v && v.length === 13 ? `${v[0]}-${v.slice(1, 5)}-${v.slice(5, 10)}-${v.slice(10, 12)}-${v[12]}` : (v || "");
  const label = r => (r.name_th || r.name_en || "?") + (r.nick ? ` (${r.nick})` : "");

  /* ---------- visas: site_team_people.visas = [{ country, type, visa_no, issue, expiry, note }] ---------- */
  const COUNTRIES = ["ญี่ปุ่น", "จีน", "เกาหลีใต้", "ไต้หวัน", "เวียดนาม", "มาเลเซีย", "สิงคโปร์", "อินโดนีเซีย", "ฟิลิปปินส์", "อินเดีย", "กัมพูชา", "ลาว", "เมียนมา",
    "สหรัฐอเมริกา", "Schengen (ยุโรป)", "สหราชอาณาจักร", "ออสเตรเลีย", "สหรัฐอาหรับเอมิเรตส์", "ซาอุดีอาระเบีย"];
  const C_ALIAS = { japan: "ญี่ปุ่น", jp: "ญี่ปุ่น", china: "จีน", cn: "จีน", korea: "เกาหลีใต้", kr: "เกาหลีใต้", เกาหลี: "เกาหลีใต้", taiwan: "ไต้หวัน", tw: "ไต้หวัน", vietnam: "เวียดนาม", vn: "เวียดนาม",
    malaysia: "มาเลเซีย", my: "มาเลเซีย", singapore: "สิงคโปร์", sg: "สิงคโปร์", indonesia: "อินโดนีเซีย", id: "อินโดนีเซีย", philippines: "ฟิลิปปินส์", ph: "ฟิลิปปินส์", india: "อินเดีย", in: "อินเดีย",
    cambodia: "กัมพูชา", kh: "กัมพูชา", laos: "ลาว", la: "ลาว", myanmar: "เมียนมา", mm: "เมียนมา", usa: "สหรัฐอเมริกา", us: "สหรัฐอเมริกา", อเมริกา: "สหรัฐอเมริกา", schengen: "Schengen (ยุโรป)",
    ยุโรป: "Schengen (ยุโรป)", "korea (south)": "เกาหลีใต้", "united states": "สหรัฐอเมริกา", "united kingdom": "สหราชอาณาจักร", "united arab emirates": "สหรัฐอาหรับเอมิเรตส์", "saudi arabia": "ซาอุดีอาระเบีย", uk: "สหราชอาณาจักร", อังกฤษ: "สหราชอาณาจักร", australia: "ออสเตรเลีย", au: "ออสเตรเลีย", uae: "สหรัฐอาหรับเอมิเรตส์", saudi: "ซาอุดีอาระเบีย" };
  const cKey = c => { const k = String(c || "").trim().toLowerCase(); return C_ALIAS[k] || COUNTRIES.find(x => x.toLowerCase() === k) || String(c || "").trim(); };
  const visas = p => (Array.isArray(p.visas) ? p.visas : []).filter(v => v && v.country);
  const visaFor = (p, country) => { const k = cKey(country); return k ? visas(p).filter(v => cKey(v.country) === k).sort((a, b) => String(b.expiry || "").localeCompare(String(a.expiry || "")))[0] || null : null; };
  const visaChip = v => { const e = parse(v.expiry), bad = e && e < today();
    return `<span class="stm-vchip${bad ? " bad" : ""}" title="${esc([v.type, v.visa_no, v.note].filter(Boolean).join(" · "))}">${flag(cKey(v.country))} ${esc(v.country)}${v.type ? " · " + esc(v.type) : ""}${v.expiry ? " · " + (bad ? "หมด " : "ถึง ") + fmt(v.expiry) : ""}</span>`; };
  /* old free-text note "วีซ่าญี่ปุ่น หมดอายุ 2026-09-11" → one visa row */
  const visaSt = v => { const m = monthsLeft(v.expiry); return m == null ? ["unk", "ไม่ระบุวันหมดอายุ", "st-none"] : m < 0 ? ["exp", "หมดอายุแล้ว", "st-bad"] : m < VISA_SOON ? ["soon", "เหลือ < " + VISA_SOON + " เดือน", "st-warn"] : ["ok", "ใช้ได้", "st-ok"]; };
  /* one row per (active person × visa) — latest visa per country per person */
  function visaRows() {
    const out = [];
    for (const r of people().filter(x => x.active)) {
      const by = new Map(); for (const v of visas(r.p)) { const k = cKey(v.country), o = by.get(k); if (!o || String(v.expiry || "") > String(o.expiry || "")) by.set(k, v); }
      for (const [k, v] of by) { const [st, stL, cls] = visaSt(v); out.push({ r, v, country: k, st, stL, cls }); }
    }
    return out;
  }
  const visaFromNote = s => { const m = /วีซ่า\s*([^\s,;]+)[^0-9]*(\d{4}-\d{2}-\d{2})?/.exec(String(s || "")); return m ? [{ country: cKey(m[1]), expiry: m[2] || "" }] : []; };

  /* ---------- api ---------- */
  async function load(force) {
    if (D && !force) return D;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try {
        const r = await fetch("/api/site-team/data", { cache: "no-store" }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === "no_table" ? "ยังไม่ได้สร้างตาราง — ให้ Admin รัน database/site_team.sql ใน Supabase ก่อน" : (j.error || "HTTP " + r.status));
        D = j; ERR = "";
      } catch (e) { ERR = e.message; }
      LOADING = null; draw();
    })();
    return LOADING;
  }
  async function post(path, body) {
    const r = await fetch("/api/site-team/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j;
  }
  function toast(msg, bad) {
    const t = document.createElement("div"); t.className = "stm-toast" + (bad ? " bad" : ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 2800);
  }

  /* ---------- xlsx (SheetJS, same build as Punch List) ---------- */
  const XLSX_SRC = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const XLSX_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
  let xlsxP = null;
  const loadXLSX = () => xlsxP || (xlsxP = new Promise((ok, no) => {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement("script"); s.src = XLSX_SRC; s.integrity = XLSX_SRI; s.crossOrigin = "anonymous";
    s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; no(new Error("โหลดตัวอ่าน Excel ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  }));

  /* ---------- views ---------- */
  function tabs() {
    const t = TABS.slice(); if (D && D.canEdit) t.push(["import", "📥 นำเข้า Excel"]);
    return `<div class="stm-tabs">${t.map(([id, l]) => `<a href="#site-team${id ? "/" + id : ""}" class="${S.page === id ? "on" : ""}">${l}</a>`).join("")}</div>`;
  }
  function draw() {
    if (!ROOT) return;
    if (ERR) { ROOT.innerHTML = `<div class="stm-card stm-err">${esc(ERR)}</div>`; return; }
    if (!D) { ROOT.innerHTML = `<div class="stm-card">กำลังโหลด…</div>`; return; }
    const note = D.canEdit ? "" : `<div class="stm-note">คุณเห็นชื่อ ทีม และวันหมดอายุเท่านั้น — เลขบัตรประชาชน เลข Passport และวันเกิด ดูได้เฉพาะ SC / PC / SSM</div>`;
    const page = { "": vDash, people: vPeople, renew: vRenew, visas: vVisas, certs: vCerts, insurance: vIns, trips: vTrips, import: vImport }[S.page] || vDash;
    ROOT.innerHTML = tabs() + note + page();
    bind();
  }

  function vDash() {
    const all = people().filter(r => r.active);
    const cnt = (f) => all.filter(f).length;
    const tiles = [
      ["ทั้งหมด", all.length, "all", "👥", "people"], ["มี Passport", cnt(r => r.st === "ok" || r.st === "lt12" || r.st === "unk"), "ok", "✅", "people"],
      ["ต้องต่ออายุ", cnt(needsRenew), "warn", "⏰", "renew"], ["หมดอายุแล้ว", cnt(r => r.st === "exp"), "bad", "⛔", "renew"], ["ไม่มี Passport", cnt(r => r.st === "none"), "none", "📭", "people"],
    ];
    const units = UNITS.map(([u, l]) => {
      const rs = all.filter(r => r.unit === u); if (!rs.length) return "";
      const c = k => rs.filter(r => r.st === k).length;
      const ok = c("ok") + c("lt12") + c("unk"), bad = c("lt6") + c("exp"), no = c("none"), pc = x => (100 * x / rs.length).toFixed(1) + "%";
      return `<tr><th title="${esc(l)}">${unitBadge(u)}<div class="stm-bar" title="ใช้ได้ ${ok} · ใกล้หมด ${bad} · ไม่มี ${no}"><i class="b-ok" style="width:${pc(ok)}"></i><i class="b-bad" style="width:${pc(bad)}"></i><i class="b-no" style="width:${pc(no)}"></i></div></th><td class="n">${rs.length}</td><td class="n ok">${ok}</td><td class="n bad">${bad || ""}</td><td class="n muted">${no || ""}</td></tr>`;
    }).join("");
    const soon = all.filter(r => r.m != null && r.m < RENEW_MONTHS + 3).sort((a, b) => a.m - b.m).slice(0, 12);
    const now = iso(today());
    const trips = D.trips.filter(t => (t.date_to || t.date_from || "") >= now).slice(0, 6);
    return `<div class="stm-tiles">${tiles.map(([l, n, k, ic, go]) => `<a class="stm-tile t-${k}" href="#site-team/${go}"><i>${ic}</i><div><b>${n}</b><span>${l}</span></div></a>`).join("")}</div>
      <div class="stm-grid">
        <div class="stm-card c-team"><h3><i>🧑‍🔧</i>แยกตามทีม</h3><table class="stm-t"><thead><tr><th>ทีม</th><th class="n">คน</th><th class="n">ใช้ได้</th><th class="n" title="เหลือ &lt; 6 เดือน หรือหมดอายุแล้ว">ใกล้หมด</th><th class="n">ไม่มี</th></tr></thead><tbody>${units}</tbody></table></div>
        <div class="stm-card c-pass"><h3><i>⏳</i>Passport ใกล้หมดอายุ</h3>${soon.length ? `<table class="stm-t"><tbody>${soon.map(r => `<tr><td>${esc(label(r))}<div class="sub">${unitBadge(r.unit)}</div></td><td>${fmt(r.p.passport_expiry)}</td><td><span class="stm-st ${ST_CLS[r.st]}">${r.stL}</span></td><td>${esc(RENEW_L[r.p.renewal_status || ""] || "")}</td></tr>`).join("")}</tbody></table>` : `<p class="stm-empty">🎉 ไม่มีใครหมดอายุภายใน 1 ปี</p>`}
          <a class="stm-more" href="#site-team/renew">ดูรายการต่ออายุทั้งหมด →</a></div>
        ${visaCard()}
        ${certCard()}
        <div class="stm-card c-trip"><h3><i>✈️</i>ทริปต่างประเทศที่กำลังจะถึง</h3>${trips.length ? trips.map(tripLine).join("") : `<p class="stm-empty">🧳 ยังไม่มีทริป</p>`}<a class="stm-more" href="#site-team/trips">วางแผนทริป →</a></div>
      </div>`;
  }
  function visaCard() {
    const vr = visaRows(), cs = [...new Set(vr.map(x => x.country))].sort((a, b) => vr.filter(x => x.country === b).length - vr.filter(x => x.country === a).length || a.localeCompare(b));
    const rows = cs.map(c => { const rs = vr.filter(x => x.country === c), n = k => rs.filter(x => x.st === k).length;
      return `<tr class="stm-click" data-href="#site-team/visas/${encodeURIComponent(c)}"><th><a href="#site-team/visas/${encodeURIComponent(c)}"><span class="stm-flag">${flag(c)}</span>${esc(c)}</a></th><td class="n">${rs.length}</td><td class="n ok">${n("ok") + n("unk") || ""}</td><td class="n warn">${n("soon") || ""}</td><td class="n bad">${n("exp") || ""}</td></tr>`; }).join("");
    const soon = vr.filter(x => x.st === "soon" || x.st === "exp").length;
    return `<div class="stm-card c-visa"><h3><i>🛂</i>วีซ่า</h3>${rows ? `<table class="stm-t"><thead><tr><th>ประเทศ</th><th class="n">คน</th><th class="n">ใช้ได้</th><th class="n" title="เหลือ &lt; ${VISA_SOON} เดือน">ใกล้หมด</th><th class="n">หมดแล้ว</th></tr></thead><tbody>${rows}</tbody></table>
      ${soon ? `<p class="bad sub">⚠️ ใกล้หมด / หมดแล้ว ${soon} รายการ</p>` : ""}` : `<p class="stm-empty">🗺️ ยังไม่มีข้อมูลวีซ่า<br><span class="sub">ใส่ได้ที่ รายชื่อทีม → แก้ไข → + เพิ่มวีซ่า</span></p>`}<a class="stm-more" href="#site-team/visas">ดูวีซ่าทั้งหมด →</a></div>`;
  }
  /* travel insurance — annual policies per person + who still needs per-trip cover for upcoming trips */
  const INS_SOON_DAYS = 60;
  function insSt(p) {   // annual policy status today → [key, label, css]
    if (p.insurance_type !== "annual" || !p.insurance_expiry) return null;
    const t = today(), s = parse(p.insurance_start), e = parse(p.insurance_expiry);
    if (e < t) return ["exp", "หมดอายุแล้ว", "st-bad"];
    if (s && s > t) return ["future", "เริ่ม " + fmt(p.insurance_start), "st-none"];
    const d = Math.round((e - t) / 864e5);
    return d <= INS_SOON_DAYS ? ["soon", "เหลือ " + d + " วัน", "st-warn"] : ["ok", "Active · เหลือ " + d + " วัน", "st-ok"];
  }
  function vIns() {
    const ce = D.canEdit, now = iso(today()), q = S.q.toLowerCase();
    const ppl = people().filter(r => r.active && (!S.unit || r.unit === S.unit) && (!q || [r.name_th, r.name_en, r.nick, r.code].some(v => String(v || "").toLowerCase().includes(q))));
    const ann = ppl.map(r => ({ r, st: insSt(r.p) })).filter(x => x.st).sort((a, b) => String(a.r.p.insurance_expiry).localeCompare(String(b.r.p.insurance_expiry)));
    const n = k => ann.filter(x => x.st[0] === k).length;
    const trips = D.trips.filter(t => (t.date_to || t.date_from || "") >= now).sort((a, b) => String(a.date_from || "").localeCompare(String(b.date_from || "")));
    const tRows = trips.map(t => { const ps = tripPeople(t); return { t, ps, need: ps.filter(r => !(annualCover(r.p, t) || {}).ok) }; });
    const needN = tRows.reduce((s, x) => s + x.need.length, 0);
    const tiles = [["มีประกันรายปี (Active)", n("ok") + n("soon"), "ok", "🛡️"], ["ใกล้หมด (≤ " + INS_SOON_DAYS + " วัน)", n("soon"), "warn", "⏰"], ["หมดอายุแล้ว", n("exp"), "bad", "⛔"], ["ต้องซื้อรายเที่ยว (ทริปที่จะถึง)", needN, "all", "🧾"]];
    return `<div class="stm-tiles">${tiles.map(([l, v, k, ic]) => `<div class="stm-tile t-${k}"><i>${ic}</i><div><b>${v}</b><span>${l}</span></div></div>`).join("")}</div>
      <div class="stm-bar2"><input type="search" id="stQ" placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส" value="${esc(S.q)}">
        <select id="stU"><option value="">ทุกทีม</option>${UNITS.map(([u, l]) => `<option value="${u}"${S.unit === u ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
        ${ce ? `<button class="stm-btn" data-a="ins-add">+ เพิ่มประกันเดินทาง</button>` : ""}<span class="muted">หรือแก้ที่ปุ่มแก้ไขของแต่ละคน</span></div>
      <div class="stm-card c-ins"><h3><i>🛡️</i>ประกันเดินทางรายปี <span class="muted">(${ann.length} คน)</span></h3>
        ${ann.length ? `<div class="stm-scroll"><table class="stm-t"><thead><tr><th>ชื่อ</th><th>Name (ตาม Passport)</th><th>ทีม</th>${ce ? "<th>เลขกรมธรรม์</th>" : ""}<th>เริ่ม</th><th>หมดอายุ</th><th>สถานะ</th>${ce ? "<th></th>" : ""}</tr></thead><tbody>
        ${ann.map(({ r, st }) => `<tr><td>${esc(label(r))}<div class="sub">${esc(r.code || "")}</div></td><td>${esc(r.p.name_en || r.name_en || "")}</td><td>${unitBadge(r.unit)}</td>${ce ? `<td class="mono">${esc(r.p.insurance_policy || "—")}${r.p.insurance_file ? ` <a href="${esc(r.p.insurance_file)}" target="_blank" rel="noopener" title="เปิดกรมธรรม์">📎</a>` : ""}</td>` : ""}
          <td>${fmt(r.p.insurance_start)}</td><td>${fmt(r.p.insurance_expiry)}</td><td><span class="stm-st ${st[2]}">${st[1]}</span></td>${ce ? `<td><button class="stm-lnk" data-a="edit" data-k="${esc(r.key)}">แก้ไข</button></td>` : ""}</tr>`).join("")}
        </tbody></table></div>` : `<p class="stm-empty">🛡️ ยังไม่มีใครมีประกันรายปี</p>`}</div>
      <div class="stm-card c-trip"><h3><i>✈️</i>ทริปที่กำลังจะถึง — ใครต้องซื้อประกันรายเที่ยว</h3>
        ${tRows.length ? tRows.map(({ t, ps, need }) => `<div class="stm-trip">${tripLine(t)}
          ${ps.length ? `<div class="stm-vchips" style="margin-top:6px">${ps.map(r => { const a = annualCover(r.p, t); return `<span class="stm-cchip ${a && a.ok ? "st-ok" : "st-warn"}" title="${esc(a ? a.l : "ไม่มีประกันรายปี")}">${a && a.ok ? "🛡️" : "🧾"} ${esc(label(r))}</span>`; }).join("")}</div>
          <p class="sub">${need.length ? `<b class="bad">ต้องซื้อรายเที่ยว ${need.length} คน</b>` : "✅ ทุกคนมีประกันรายปีครอบคลุมแล้ว"} · 🛡️ มีรายปี ${ps.length - need.length} คน</p>` : `<p class="sub muted">ยังไม่ได้เลือกคน</p>`}
          <div class="stm-acts">${ce ? `<button class="stm-lnk" data-a="trip-xlsx" data-id="${t.id}">⬇ รายชื่อทำประกัน (Excel)</button>` : ""}</div></div>`).join("") : `<p class="stm-empty">🧳 ยังไม่มีทริปที่กำลังจะถึง</p>`}</div>`;
  }
  /* add / change one person's travel insurance from the insurance tab */
  function insForm() {
    const ps = people().filter(r => r.active).sort((a, b) => String(a.name_th).localeCompare(String(b.name_th), "th"));
    const optL = r => label(r) + (r.code ? " · " + r.code : "");
    const last = people().map(r => r.p).filter(p => p.insurance_type === "annual" && p.insurance_expiry).sort((a, b) => String(b.insurance_expiry).localeCompare(String(a.insurance_expiry)))[0] || {};
    const m = document.createElement("div"); m.className = "stm-modal";
    m.innerHTML = `<div class="stm-dlg"><h3>🛡️ เพิ่มประกันเดินทาง</h3><div class="stm-form">
      <label class="wide">พนักงาน *<input id="iWho" list="iPeople" placeholder="พิมพ์ชื่อ / ชื่อเล่น / รหัส แล้วเลือก"><datalist id="iPeople">${ps.map(r => `<option value="${esc(optL(r))}">${esc(r.unit + (r.p.insurance_type === "annual" ? " · มีรายปีแล้ว" : ""))}</option>`).join("")}</datalist></label>
      <p class="wide sub" id="iPick"></p>
      <label>ประเภท<select id="iType"><option value="annual">รายปี</option><option value="trip">รายเที่ยว</option></select></label>
      <label>เลขกรมธรรม์<input id="iPol" placeholder="${esc(last.insurance_policy ? last.insurance_policy.replace(/\d+$/, "…") : "")}"></label>
      <label>ประกันเริ่ม<input id="iStart" type="date" value="${esc(last.insurance_start || "")}"></label>
      <label>ประกันหมดอายุ<input id="iEnd" type="date" value="${esc(last.insurance_expiry || "")}"></label>
      <label class="wide">ลิงก์กรมธรรม์ (Google Drive)<input id="iFile" type="url" placeholder="วางลิงก์ Google Drive"></label>
    </div><div class="stm-err" id="iErr"></div>
    <div class="stm-acts"><button class="stm-btn" data-a="i-save">บันทึก</button> <button class="stm-btn ghost" data-a="i-more">บันทึก + เพิ่มคนต่อ</button> <button class="stm-btn ghost" data-a="i-close">ยกเลิก</button></div></div>`;
    document.body.appendChild(m);
    const g = id => m.querySelector("#" + id).value.trim();
    const who = () => { const k = g("iWho"); return ps.find(r => optL(r) === k) || ps.find(r => [label(r), r.name_th, r.code].includes(k)); };
    m.querySelector("#iWho").addEventListener("input", () => { const r = who(), el = m.querySelector("#iPick");
      el.innerHTML = r ? `✅ ${esc(label(r))} · ${unitBadge(r.unit)}${r.p.insurance_type === "annual" ? ` · <span class="bad">มีรายปีอยู่แล้ว ${esc(r.p.insurance_policy || "")} ถึง ${fmt(r.p.insurance_expiry)} — จะถูกแทนที่</span>` : ""}` : ""; });
    m.addEventListener("click", async e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (e.target === m || a === "i-close") return m.remove();
      if (a !== "i-save" && a !== "i-more") return;
      const r = who(); if (!r) return m.querySelector("#iErr").textContent = "เลือกพนักงานจากรายการก่อน";
      if (g("iStart") && g("iEnd") && g("iEnd") < g("iStart")) return m.querySelector("#iErr").textContent = "วันหมดอายุต้องไม่ก่อนวันเริ่ม";
      const body = { insurance_type: g("iType"), insurance_policy: g("iPol"), insurance_start: g("iStart"), insurance_expiry: g("iEnd"), insurance_file: g("iFile") };
      if (r.pid) body.id = r.pid; else if (r.worker) body.worker_id = r.worker.id;
      try {
        const j = await post("person", body); D.people = D.people.filter(x => x.id !== j.person.id).concat(j.person); toast("บันทึกประกันของ " + label(r) + " แล้ว"); draw();
        if (a === "i-more") { ["iWho", "iPol", "iFile"].forEach(id => m.querySelector("#" + id).value = ""); m.querySelector("#iPick").innerHTML = ""; m.querySelector("#iErr").textContent = ""; m.querySelector("#iWho").focus(); }
        else m.remove();
      } catch (x) { m.querySelector("#iErr").textContent = x.message; }
    });
    m.querySelector("#iWho").focus();
  }
  function vVisas() {
    const ce = D.canEdit, all = visaRows(), cs = [...new Set(all.map(x => x.country))].sort();
    const q = S.q.toLowerCase();
    const rs = all.filter(x => (!S.vc || x.country === S.vc) && (!q || [x.r.name_th, x.r.name_en, x.r.nick, x.r.code].some(v => String(v || "").toLowerCase().includes(q))))
      .sort((a, b) => a.country.localeCompare(b.country) || String(a.v.expiry || "9").localeCompare(String(b.v.expiry || "9")));
    const n = k => rs.filter(x => x.st === k).length;
    return `<div class="stm-bar2"><input type="search" id="stQ" placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส" value="${esc(S.q)}">
      <select id="stVc"><option value="">ทุกประเทศ</option>${cs.map(c => `<option${S.vc === c ? " selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <span class="muted">${rs.length} รายการ · ใช้ได้ ${n("ok") + n("unk")} · ใกล้หมด ${n("soon")} · หมดแล้ว ${n("exp")}</span></div>
      <div class="stm-card stm-scroll"><table class="stm-t"><thead><tr><th>ชื่อ</th><th>ทีม</th><th>ประเทศ</th><th>ประเภท</th>${ce ? "<th>เลขวีซ่า</th>" : ""}<th>วันออก</th><th>หมดอายุ</th><th>สถานะ</th><th>หมายเหตุ</th>${ce ? "<th></th>" : ""}</tr></thead><tbody>
      ${rs.map(x => `<tr><td>${esc(label(x.r))}<div class="sub">${esc(x.r.code)}</div></td><td>${unitBadge(x.r.unit)}</td><td>${flag(x.country)} ${esc(x.country)}</td><td>${esc(x.v.type || "")}</td>${ce ? `<td class="mono">${esc(x.v.visa_no || "")}</td>` : ""}
        <td>${fmt(x.v.issue)}</td><td>${fmt(x.v.expiry)}</td><td><span class="stm-st ${x.cls}">${x.st === "soon" ? Math.max(0, Math.floor(monthsLeft(x.v.expiry))) + " เดือน" : x.stL}</span></td><td>${esc(x.v.note || "")}</td>
        ${ce ? `<td><button class="stm-lnk" data-a="edit" data-k="${esc(x.r.key)}">แก้ไข</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="10" class="muted">ไม่มีข้อมูลวีซ่า${S.vc ? " " + esc(S.vc) : ""} — ใส่ได้ที่ รายชื่อทีม → แก้ไข → + เพิ่มวีซ่า</td></tr>`}
      </tbody></table></div>`;
  }
  /* ---------- certificates (site_team_certs) — kept with จป อิ๋ม; editors: SC / PC / SSM + จป (D.canCert) ---------- */
  const COURSES = [["SO_PRO", "จป.วิชาชีพ", "🦺"], ["SO_MGR", "จป.บริหาร", "🦺"], ["SO_SUP", "จป.หัวหน้างาน", "🦺"], ["SAFE6", "ความปลอดภัย 6 ชม.", "⛑️"],
    ["CONFINED", "งานอับอากาศ", "🕳️"], ["CRANE_FIXED", "ปั้นจั่นอยู่กับที่", "🏗️"], ["CRANE_MOBILE", "ปั้นจั่นเคลื่อนที่", "🚧"], ["SCAFFOLD", "นั่งร้าน", "🪜"],
    ["HEIGHT", "ทำงานที่สูง", "🧗"], ["ELECTRIC", "งานไฟฟ้า", "⚡"], ["FORKLIFT", "โฟล์คลิฟท์", "🚜"], ["REACH_TRUCK", "Reach Truck", "🛻"], ["FIRE_BASIC", "ดับเพลิงขั้นต้น", "🧯"], ["OTHER", "อื่นๆ", "📜"]];
  const COURSE = Object.fromEntries(COURSES.map(c => [c[0], c]));
  const courseL = c => c.course === "OTHER" ? (c.course_name || "อื่นๆ") : (COURSE[c.course] || [, c.course])[1];
  const courseI = c => (COURSE[c.course] || COURSE.OTHER)[2];
  const CERT_RENEW = [["", "—"], ["planned", "ต้องต่อ · รอนัด"], ["booked", "นัดอบรมแล้ว"], ["done", "ต่ออายุแล้ว"]];
  const CERT_RENEW_L = Object.fromEntries(CERT_RENEW);
  const CERT_LEAD_MONTHS = 3;   // วันที่ต้องต่อ is filled automatically this many months before expiry (จป can change it)
  const certAutoDue = exp => { const e = parse(exp); if (!e) return ""; return iso(addMonths(e, -CERT_LEAD_MONTHS)); };
  const thNorm = s => String(s || "").normalize("NFC").replace(/^\s*(นางสาว|น\.ส\.|นาย|นาง|Mr\.?|Ms\.?|Mrs\.?)\s*/i, "").replace(/([ั-ฺ็-๎])\1+/g, "$1").replace(/\s+/g, " ").trim();
  function certDue(c) { if (c.no_expiry || !c.expiry) return null; if (c.renew_due) return c.renew_due; return certAutoDue(c.expiry); }
  function certSt(c) {   // → [key, label, css]
    if (c.status === "resign") return ["resign", "ลาออก", "st-none"];
    const e = parse(c.expiry), t = today();
    if (c.status === "expired" || (e && e < t)) return ["exp", "หมดอายุ", "st-bad"];
    if (c.no_expiry || c.status === "registered") return ["ok", c.status === "registered" ? "ขึ้นทะเบียน" : "ไม่มีหมดอายุ", "st-ok"];
    if (!e) return ["unk", "ไม่ระบุวันหมดอายุ", "st-none"];
    const due = parse(certDue(c)); if (due && due <= t) return ["due", "ถึงเวลาต่ออายุ", "st-warn"];
    return ["ok", "ใช้ได้ถึง " + fmt(c.expiry), "st-ok"];
  }
  /* link each cert to a Site Team person: worker_id / person_id first, then the Thai name */
  function certIndex() {
    const ps = people(), byName = new Map(), byW = new Map(), byP = new Map();
    for (const r of ps) { if (r.worker) byW.set(r.worker.id, r); if (r.pid && !r.worker) byP.set(r.pid, r); const k = thNorm(r.name_th); if (k && !byName.has(k)) byName.set(k, r); }
    const rows = (D.certs || []).map(c => ({ c, r: (c.worker_id && byW.get(c.worker_id)) || (c.person_id && byP.get(c.person_id)) || byName.get(thNorm(c.holder_name)) || null }));
    const byKey = new Map(); for (const x of rows) if (x.r) { if (!byKey.has(x.r.key)) byKey.set(x.r.key, []); byKey.get(x.r.key).push(x.c); }
    return { rows, byKey };
  }
  /* one certificate per course for display: drop resigned and renewed (ต่ออายุแล้ว) ones, keep the best of the rest */
  function liveCerts(list) {
    const rank = c => ({ ok: 3, unk: 2, due: 1 })[certSt(c)[0]] || 0, by = new Map();
    for (const c of (list || []).filter(c => c.status !== "resign" && c.renew_status !== "done")) {
      const o = by.get(c.course);
      if (!o || rank(c) > rank(o) || (rank(c) === rank(o) && String(c.issue || "") > String(o.issue || ""))) by.set(c.course, c);
    }
    return [...by.values()].sort((a, b) => COURSES.findIndex(x => x[0] === a.course) - COURSES.findIndex(x => x[0] === b.course));
  }
  const hasCert = (list, course) => (list || []).some(c => c.course === course && ["ok", "due", "unk"].includes(certSt(c)[0]));
  const certChip = c => { const [k, , cls] = certSt(c); return `<span class="stm-cchip ${cls}" title="${esc(courseL(c) + (c.expiry ? " · หมด " + fmt(c.expiry) : "") + (c.cert_no ? " · " + c.cert_no : ""))}">${courseI(c)} ${esc(courseL(c))}${k === "due" ? " ⏰" : k === "exp" ? " ✕" : ""}</span>`; };
  function certCard() {
    if (!D.certsReady) return `<div class="stm-card c-cert"><h3><i>🎓</i>Certificate</h3><p class="stm-empty">🛠️ ยังไม่ได้สร้างตาราง Certificate<br><span class="sub">รัน database/site_team-004.sql ใน Supabase</span></p></div>`;
    const live = (D.certs || []).filter(c => c.status !== "resign");
    const rows = COURSES.map(([k, l, ic]) => { const cs = live.filter(c => c.course === k); if (!cs.length) return "";
      const n = s => cs.filter(c => certSt(c)[0] === s).length;
      return `<tr class="stm-click" data-href="#site-team/certs/${k}"><th><a href="#site-team/certs/${k}">${ic} ${esc(l)}</a></th><td class="n">${cs.length}</td><td class="n ok">${n("ok") + n("unk") || ""}</td><td class="n warn">${n("due") || ""}</td><td class="n bad">${n("exp") || ""}</td></tr>`; }).join("");
    const due = live.filter(c => ["due", "exp"].includes(certSt(c)[0]) && c.renew_status !== "done").length;
    return `<div class="stm-card c-cert"><h3><i>🎓</i>Certificate</h3>${rows ? `<table class="stm-t"><thead><tr><th>หลักสูตร</th><th class="n">ใบ</th><th class="n">ใช้ได้</th><th class="n" title="ถึงวันที่ต้องต่อ (${CERT_LEAD_MONTHS} เดือนก่อนหมดอายุ)">ต้องต่อ</th><th class="n">หมดแล้ว</th></tr></thead><tbody>${rows}</tbody></table>
      ${due ? `<p class="bad sub">⚠️ ต้องต่ออายุ / หมดแล้ว ${due} ใบ — ติดตามกับ จป.</p>` : ""}` : `<p class="stm-empty">📜 ยังไม่มีข้อมูล Certificate</p>`}<a class="stm-more" href="#site-team/certs">ดู Certificate ทั้งหมด →</a></div>`;
  }
  function vCerts() {
    if (!D.certsReady) return `<div class="stm-card"><p class="stm-empty">🛠️ ยังไม่ได้สร้างตาราง Certificate — รัน <b>database/site_team-004.sql</b> ใน Supabase</p></div>`;
    const ce = D.canCert, { rows, byKey } = certIndex(), q = S.q.toLowerCase(), t = today();
    const match = (name, r) => !q || [name, r && r.nick, r && r.code, r && r.name_en].some(v => String(v || "").toLowerCase().includes(q));
    // 1) matrix: people × courses — pick the right people for the job
    const used = COURSES.filter(([k]) => (D.certs || []).some(c => c.course === k));
    const ppl = people().filter(r => r.active && (!S.unit || r.unit === S.unit) && match(r.name_th, r) && (!S.cc || hasCert(byKey.get(r.key), S.cc)));
    const outsiders = S.cOnly ? [] : [...new Map(rows.filter(x => !x.r && x.c.status !== "resign" && match(x.c.holder_name)).map(x => [thNorm(x.c.holder_name), x.c.holder_name])).values()]
      .filter(n => !S.cc || hasCert(rows.filter(x => !x.r && thNorm(x.c.holder_name) === thNorm(n)).map(x => x.c), S.cc));
    const cell = (list, k) => { const c = liveCerts(list).find(x => x.course === k) || (list || []).filter(x => x.course === k).sort((a, b) => String(b.issue || "").localeCompare(String(a.issue || "")))[0]; if (!c) return `<td class="stm-cx"></td>`;
      const [st, l, cls] = certSt(c);
      const sym = st === "exp" ? "✕" : st === "due" ? "⏰" : st === "resign" ? "–" : "✓";
      return `<td class="stm-cx"><button class="stm-cdot ${cls}" ${ce ? `data-a="cert-edit" data-id="${c.id}"` : "disabled"} title="${esc(courseL(c) + " · " + l + (c.cert_no ? " · " + c.cert_no : ""))}">${sym}</button></td>`; };
    const head = `<tr><th>ชื่อ</th><th>ทีม</th>${used.map(([k, l, ic]) => `<th class="stm-ch" title="${esc(l)}"><span>${ic}</span><small>${esc(l)}</small></th>`).join("")}</tr>`;
    const body = ppl.map(r => `<tr><td>${esc(label(r))}<div class="sub">${esc(r.code)}</div></td><td>${unitBadge(r.unit)}</td>${used.map(([k]) => cell(byKey.get(r.key), k)).join("")}</tr>`).join("")
      + outsiders.map(n => `<tr class="muted-row"><td>${esc(thNorm(n))}<div class="sub">ไม่อยู่ใน Site Team</div></td><td>—</td>${used.map(([k]) => cell(rows.filter(x => !x.r && thNorm(x.c.holder_name) === thNorm(n)).map(x => x.c), k)).join("")}</tr>`).join("");
    // 2) renewals: due / expired, not resigned — worked with จป
    const ren = rows.filter(x => x.c.status !== "resign" && x.c.renew_status !== "done" && ["due", "exp"].includes(certSt(x.c)[0]) && (!S.cc || x.c.course === S.cc) && match(x.c.holder_name, x.r))
      .sort((a, b) => String(certDue(a.c) || a.c.expiry || "").localeCompare(String(certDue(b.c) || b.c.expiry || "")));
    const noExp = rows.filter(x => x.c.status !== "resign" && x.c.renew_status !== "done" && !x.c.no_expiry && !x.c.expiry && x.c.status !== "registered" && (!S.cc || x.c.course === S.cc) && match(x.c.holder_name, x.r));
    const soon = rows.filter(x => x.c.status !== "resign" && certSt(x.c)[0] === "ok" && x.c.expiry && (!S.cc || x.c.course === S.cc) && parse(certDue(x.c)) <= addMonths(t, 6)).length;
    const bar = `<div class="stm-bar2"><input type="search" id="stQ" placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส" value="${esc(S.q)}">
        <select id="stCc"><option value="">ทุกหลักสูตร</option>${COURSES.map(([k, l, ic]) => `<option value="${k}"${S.cc === k ? " selected" : ""}>${ic} ${esc(l)}</option>`).join("")}</select>
        <select id="stU"><option value="">ทุกทีม</option>${UNITS.map(([u, l]) => `<option value="${u}"${S.unit === u ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <label class="stm-ck"><input type="checkbox" id="stCOnly"${S.cOnly ? " checked" : ""}> เฉพาะคนใน Site Team</label>
        ${ce ? `<button class="stm-btn" data-a="cert-new">+ เพิ่ม Certificate</button>` : ""}</div>`;
    return `${S.cFull ? "" : bar}
      <div class="stm-card c-cert"><h3><i>⏰</i>ต้องต่ออายุ / หมดอายุ <span class="muted">(${ren.length})</span>${soon ? ` <span class="sub">· ถึงรอบต่อใน 6 เดือน ${soon} ใบ</span>` : ""}</h3>
        ${ren.length ? `<div class="stm-scroll"><table class="stm-t"><thead><tr><th>ชื่อ</th><th>หลักสูตร</th><th>เลขที่</th><th>หมดอายุ</th><th>ต้องต่อ</th><th>สถานะ</th><th>การต่ออายุ (จป.)</th><th>วันนัด</th><th>หมายเหตุ</th>${ce ? "<th></th>" : ""}</tr></thead><tbody>
        ${ren.map(({ c, r }) => { const [, l, cls] = certSt(c); return `<tr><td>${esc(r ? label(r) : thNorm(c.holder_name))}${r ? "" : `<div class="sub">ไม่อยู่ใน Site Team</div>`}</td><td>${courseI(c)} ${esc(courseL(c))}</td><td class="mono">${esc(c.cert_no || "")}</td>
          <td>${fmt(c.expiry)}</td><td>${fmt(certDue(c))}</td><td><span class="stm-st ${cls}">${l}</span></td>
          <td>${ce ? `<select data-crs="${c.id}">${CERT_RENEW.map(([k, t2]) => `<option value="${k}"${(c.renew_status || "") === k ? " selected" : ""}>${t2}</option>`).join("")}</select>` : esc(CERT_RENEW_L[c.renew_status || ""] || "")}</td>
          <td>${ce ? `<input type="date" data-crd="${c.id}" value="${esc(c.renew_date || "")}">` : fmt(c.renew_date)}</td><td>${esc(c.renew_note || c.note || "")}</td>${ce ? `<td><button class="stm-lnk" data-a="cert-edit" data-id="${c.id}">แก้ไข</button></td>` : ""}</tr>`; }).join("")}
        </tbody></table></div>` : `<p class="stm-empty">🎉 ไม่มี Certificate ที่ต้องต่ออายุตอนนี้</p>`}</div>
      ${noExp.length ? `<details class="stm-card c-cert stm-noexp"><summary><b>📝 ยังไม่ได้ใส่วันหมดอายุ ${noExp.length} ใบ</b> <span class="sub">— ให้ จป. ใส่วันหมดอายุ ระบบจะตั้งวันที่ต้องต่อ ${CERT_LEAD_MONTHS} เดือนก่อนหมดให้อัตโนมัติ และเตือนเมื่อถึงกำหนด</span></summary>
        <div class="stm-vchips" style="margin-top:8px">${noExp.map(({ c, r }) => `<button class="stm-cchip st-none" ${ce ? `data-a="cert-edit" data-id="${c.id}"` : "disabled"} title="${esc(c.cert_no || "")}">${courseI(c)} ${esc(courseL(c))} · ${esc(r ? label(r) : thNorm(c.holder_name))}</button>`).join("")}</div></details>` : ""}
      <div class="stm-card stm-cmatcard${S.cFull ? " stm-full" : ""}"><h3>ตารางทักษะ — ใครมี Certificate อะไร <span class="muted">(${ppl.length + outsiders.length} คน)</span>
          <button class="stm-btn ghost stm-fullbtn" data-a="cmat-full">${S.cFull ? "✕ ออกจากเต็มจอ" : "⛶ ขยายเต็มจอ"}</button></h3>${S.cFull ? bar : ""}
        <p class="sub">✓ เขียว ใช้ได้ · ✓ เทา ไม่ระบุวันหมดอายุ · ⏰ ถึงเวลาต่อ · ✕ หมดอายุ — ${ce ? "กดที่ช่องเพื่อแก้ไข" : "เลือกหลักสูตรด้านบนเพื่อดูเฉพาะคนที่มี"}</p>
        <div class="stm-cmatwrap"><table class="stm-t stm-cmat"><thead>${head}</thead><tbody>${body || `<tr><td colspan="20" class="muted">ไม่มีข้อมูล</td></tr>`}</tbody></table></div></div>`;
  }
  function certForm(c) {
    c = c || { course: S.cc || "SAFE6", status: "active" };
    const ps = people().filter(r => r.active), { rows } = certIndex(), hit = c.id ? (rows.find(x => x.c.id === c.id) || {}).r : null;
    const m = document.createElement("div"); m.className = "stm-modal";
    const sel = (id, l, opts, v) => `<label>${l}<select id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}"${(v || "") === k ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    const f = (id, l, v, type = "text") => `<label>${l}<input id="${id}" type="${type}" value="${esc(v ?? "")}"></label>`;
    m.innerHTML = `<div class="stm-dlg"><h3>${c.id ? "แก้ไข" : "เพิ่ม"} Certificate</h3><div class="stm-form">
      ${sel("cCourse", "หลักสูตร *", COURSES.map(([k, l, ic]) => [k, ic + " " + l]), c.course)}
      ${f("cCname", "ชื่อหลักสูตร (ถ้าเลือก อื่นๆ)", c.course_name)}
      <label class="wide">ผู้ถือ Certificate *<input id="cHolder" list="cPeople" value="${esc(hit ? hit.name_th : thNorm(c.holder_name || ""))}" placeholder="พิมพ์ชื่อ (เลือกจากรายชื่อ Site Team ได้)"><datalist id="cPeople">${ps.map(r => `<option value="${esc(r.name_th)}">${esc((r.nick ? r.nick + " · " : "") + r.unit)}</option>`).join("")}</datalist></label>
      ${f("cNo", "เลขที่ Cer.", c.cert_no)}${f("cIssue", "เริ่มใช้ Cer.", c.issue, "date")}${f("cExp", "วันหมดอายุ", c.expiry, "date")}
      <label class="stm-ck"><input type="checkbox" id="cNoExp"${c.no_expiry ? " checked" : ""}> ไม่มีหมดอายุ</label>
      ${f("cDue", "วันที่ต้องต่อ (อัตโนมัติ " + CERT_LEAD_MONTHS + " เดือนก่อนหมด · จป แก้ได้)", c.renew_due || certAutoDue(c.expiry), "date")}${f("cReview", "Cer. ทบทวน", c.review_date, "date")}
      ${sel("cSt", "สถานะ", [["active", "Active"], ["registered", "ขึ้นทะเบียน"], ["expired", "Expired Certificate"], ["resign", "Resign (ลาออก)"]], c.status)}
      <label class="wide">ลิงก์ Cer. (Google Drive)<input id="cLink" value="${esc(c.link || "")}"></label>
      <label class="wide">หมายเหตุ<input id="cNote" value="${esc(c.note || "")}"></label>
      ${sel("cRs", "การต่ออายุ (จป.)", CERT_RENEW, c.renew_status)}${f("cRd", "วันนัดอบรม / ต่ออายุ", c.renew_date, "date")}
      <label class="wide">หมายเหตุการต่ออายุ<input id="cRn" value="${esc(c.renew_note || "")}"></label>
      ${c.link ? `<a class="wide" href="${esc(c.link)}" target="_blank" rel="noopener">📎 เปิดไฟล์ Certificate</a>` : ""}
    </div><div class="stm-acts"><button class="stm-btn" data-a="c-save">บันทึก</button>${c.id ? ` <button class="stm-btn danger" data-a="c-del">ลบ</button>` : ""} <button class="stm-btn ghost" data-a="c-close">ยกเลิก</button></div></div>`;
    document.body.appendChild(m);
    const v = id => m.querySelector("#" + id).value.trim();
    let autoDue = c.renew_due ? "" : certAutoDue(c.expiry);   // keep following the expiry until จป types their own date
    m.querySelector("#cExp").addEventListener("change", () => { const d = m.querySelector("#cDue"); if (!d.value || d.value === autoDue) { autoDue = certAutoDue(v("cExp")); d.value = autoDue; } });
    m.addEventListener("click", async e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (e.target === m || a === "c-close") return m.remove();
      if (a === "c-del") { if (!confirm("ลบ Certificate นี้?")) return; try { await post("cert-delete", { id: c.id }); D.certs = D.certs.filter(x => x.id !== c.id); m.remove(); draw(); toast("ลบแล้ว"); } catch (x) { toast(x.message, 1); } return; }
      if (a !== "c-save") return;
      const name = v("cHolder"), r = ps.find(x => thNorm(x.name_th) === thNorm(name));
      const body = { id: c.id, course: v("cCourse"), course_name: v("cCname"), holder_name: name, worker_id: r && r.worker ? r.worker.id : "", person_id: r && !r.worker ? r.pid : null,
        cert_no: v("cNo"), issue: v("cIssue"), expiry: v("cExp"), no_expiry: m.querySelector("#cNoExp").checked, renew_due: v("cDue"), review_date: v("cReview"),
        status: v("cSt"), link: v("cLink"), note: v("cNote"), renew_status: v("cRs"), renew_date: v("cRd"), renew_note: v("cRn") };
      try { const j = await post("cert", body); D.certs = D.certs.filter(x => x.id !== j.cert.id).concat(j.cert); m.remove(); draw(); toast("บันทึกแล้ว"); } catch (x) { toast(x.message, 1); }
    });
  }
  async function certQuick(id, patch) {
    const c = (D.certs || []).find(x => x.id === id); if (!c) return;
    try { const j = await post("cert", { ...c, ...patch }); D.certs = D.certs.filter(x => x.id !== id).concat(j.cert); toast("บันทึกแล้ว"); draw(); } catch (x) { toast(x.message, 1); }
  }
  /* annual travel insurance covering the whole trip (insurance_start → insurance_expiry) */
  function annualCover(p, t) {
    if (p.insurance_type !== "annual" || !p.insurance_expiry) return null;
    const from = t.date_from || t.date_to, to = t.date_to || t.date_from, ok = (!from || !p.insurance_start || p.insurance_start <= from) && (!to || p.insurance_expiry >= to);
    return { ok, l: (ok ? "รายปี ✓ " : "รายปี ไม่ครอบคลุม · ") + (p.insurance_start ? fmt(p.insurance_start) + " – " : "ถึง ") + fmt(p.insurance_expiry) };
  }
  const insTd = (p, t) => { const a = annualCover(p, t); return `<td>${a ? `<span class="stm-st ${a.ok ? "st-ok" : "st-warn"}" title="${esc(p.insurance_policy || "")}">🛡️ ${esc(a.l)}</span>` : `<span class="stm-st st-none">ซื้อรายเที่ยว</span>`}</td>`; };
  /* quick view of a trip's people — name TH / EN, team, passport no. (SC / PC / SSM only), expiry, 6-month check, visa */
  function tripQuick(t) {
    const ce = D.canEdit, ps = tripPeople(t), back = parse(t.date_to || t.date_from);
    if (!ps.length) return `<div class="stm-qv"><p class="muted">ยังไม่ได้เลือกคน</p></div>`;
    const visaTd = r => { if (!t.country) return ""; const x = visaFor(r.p, t.country); if (!x) return `<td><span class="stm-st st-none">ไม่มี</span></td>`;
      const e = parse(x.expiry), ok = !e || !back || e >= back; return `<td><span class="stm-st ${ok ? "st-ok" : "st-bad"}">${x.expiry ? (ok ? "ถึง " : "หมด ") + fmt(x.expiry) : "มี"}</span></td>`; };
    const pass = r => !r.p.passport_expiry && !r.p.passport_no && !r.p.has_passport ? ["st-bad", "ไม่มี Passport"] : r.okTravel ? ["st-ok", "ผ่าน"] : ["st-bad", "ไม่ผ่าน " + TRAVEL_MONTHS + " เดือน"];
    return `<div class="stm-qv"><table class="stm-t"><thead><tr><th>#</th><th>ชื่อ-นามสกุล</th><th>Name (ตาม Passport)</th><th>ทีม</th>${ce ? "<th>Passport No.</th>" : ""}<th>หมดอายุ</th><th>Passport</th>${t.country ? `<th>วีซ่า ${flag(cKey(t.country))}</th>` : ""}<th>ประกันเดินทาง</th></tr></thead><tbody>
      ${ps.map((r, i) => { const [cls, l] = pass(r); return `<tr><td class="muted">${i + 1}</td><td>${esc(r.name_th || "")}${r.nick ? ` <span class="muted">(${esc(r.nick)})</span>` : ""}<div class="sub">${esc(r.code || "")}</div></td>
        <td>${esc(r.p.name_en || r.name_en || "")}</td><td>${unitBadge(r.unit)}</td>${ce ? `<td class="mono">${esc(r.p.passport_no || "—")}</td>` : ""}<td>${fmt(r.p.passport_expiry)}</td><td><span class="stm-st ${cls}">${l}</span></td>${visaTd(r)}${insTd(r.p, t)}</tr>`; }).join("")}
      </tbody></table>${ce ? `<button class="stm-lnk" data-a="trip-copy" data-id="${t.id}">📋 คัดลอกรายชื่อ (ชื่อ EN + Passport) ไปวางใน Excel / อีเมล</button>` : ""}</div>`;
  }
  function tripLine(t) {
    const ps = tripPeople(t), bad = ps.filter(x => !x.okTravel).length, ts = TRIP_ST[t.status] || TRIP_ST.draft, ann = ps.filter(x => (annualCover(x.p, t) || {}).ok).length;
    return `<div class="stm-trip"><span class="stm-st ${ts[1]}">${ts[0]}</span> <span class="stm-st st-none">${esc(kindL(t))}</span> <b>${esc(t.title)}</b> <span class="muted">${esc([t.job_no, t.customer].filter(Boolean).join(" · "))}${t.country ? " · " + flag(cKey(t.country)) + " " + esc(t.country) : ""}</span>
      <div class="sub">${fmt(t.date_from)}${t.date_to && t.date_to !== t.date_from ? " – " + fmt(t.date_to) : ""} · ${ps.length} คน · ประกัน${INS_L[t.insurance_type] || ""}${ann ? ` · 🛡️ มีประกันรายปีแล้ว ${ann} คน` : ""}${bad ? ` · <span class="bad">Passport ยังไม่ครบ / ไม่ผ่าน ${bad} คน</span>` : ""}</div></div>`;
  }

  function filterBar(extra = "") {
    return `<div class="stm-bar2"><input type="search" id="stQ" placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัส" value="${esc(S.q)}">
      <select id="stU"><option value="">ทุกทีม</option>${UNITS.map(([u, l]) => `<option value="${u}"${S.unit === u ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <select id="stS"><option value="">ทุกสถานะ</option>${[["ok", "มี Passport"], ["lt6", "Passport ใกล้หมดอายุ (< 7 เดือน)"], ["exp", "Passport หมดอายุ"], ["none", "ไม่มี Passport"]].map(([k, l]) => `<option value="${k}"${S.st === k ? " selected" : ""}>${l}</option>`).join("")}</select>${extra}</div>`;
  }
  function filtered(rs) {
    const q = S.q.toLowerCase();
    return rs.filter(r => (!S.unit || r.unit === S.unit) && (!S.st || r.st === S.st || (S.st === "ok" && (r.st === "unk" || r.st === "lt12")))
      && (!q || [r.name_th, r.name_en, r.nick, r.code].some(v => String(v || "").toLowerCase().includes(q))));
  }
  function vPeople() {
    const ce = D.canEdit, CI = certIndex();
    const rs = filtered(people().filter(r => r.active || S.st));
    const add = ce ? `<button class="stm-btn" data-a="add">+ เพิ่มคน (ไม่อยู่ใน Manpower)</button>` : "";
    return filterBar(add) + `<div class="stm-card stm-scroll"><table class="stm-t stm-roster"><thead><tr><th>ชื่อ</th><th>ทีม</th><th>ชื่อใน Passport</th>
      <th>เลขบัตรประชาชน</th><th>วันเกิด</th><th>Passport</th><th>หมดอายุ</th><th>สถานะ</th>${ce ? "<th></th>" : ""}</tr></thead><tbody>
      ${rs.map(r => `<tr><td>${esc(label(r))}<div class="sub">${esc(r.code)}</div></td><td>${unitBadge(r.unit)}</td><td>${esc(r.p.name_en || "")}</td>
        <td class="mono">${ce ? esc(fmtId(r.p.national_id)) : (r.pid ? "•••••••••" : "")}</td>
        <td>${ce ? (r.p.birth_date ? fmt(r.p.birth_date) + ` <span class="muted">(${age(r.p.birth_date)})</span>` : "") : ""}</td>
        <td class="mono">${ce ? esc(r.p.passport_no || "") : esc(mask(r.p.passport_no || ""))}${ce && r.p.passport_file ? ` <a href="${esc(r.p.passport_file)}" target="_blank" rel="noopener" title="เปิดสแกน">📄</a>` : ""}</td>
        <td>${fmt(r.p.passport_expiry)}</td><td><span class="stm-st ${ST_CLS[r.st]}">${r.stL}</span>${(cs => cs.length ? `<div class="stm-vchips">${cs.map(certChip).join("")}</div>` : "")(liveCerts(CI.byKey.get(r.key)))}${visas(r.p).length ? `<div class="stm-vchips">${visas(r.p).map(visaChip).join("")}</div>` : r.p.visa_note ? `<div class="sub">${esc(r.p.visa_note)}</div>` : ""}</td>
        ${ce ? `<td><button class="stm-lnk" data-a="edit" data-k="${esc(r.key)}">แก้ไข</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="9" class="muted">ไม่พบรายชื่อ</td></tr>`}
      </tbody></table></div><div class="muted stm-cnt">${rs.length} คน</div>`;
  }
  function vRenew() {
    const ce = D.canEdit;
    const rs = people().filter(needsRenew).sort((a, b) => (a.m ?? -99) - (b.m ?? -99));
    const cost = rs.reduce((s, r) => s + (Number(r.p.renewal_cost) || 0), 0);
    return `<div class="stm-note">รายชื่อคนที่ Passport หมดอายุแล้ว หรือเหลือไม่ถึง ${RENEW_MONTHS} เดือน (ต้องเหลือ ≥ ${TRAVEL_MONTHS} เดือนหลังวันกลับจึงเดินทางได้) — บันทึกสถานะและค่าใช้จ่ายที่เบิกพาช่างไปทำ Passport ได้ที่นี่</div>
      <div class="stm-card stm-scroll"><table class="stm-t"><thead><tr><th>ชื่อ</th><th>ทีม</th><th>หมดอายุ</th><th>เหลือ</th><th>สถานะต่ออายุ</th><th class="n">ค่าใช้จ่าย (บาท)</th><th>หมายเหตุ</th>${ce ? "<th></th>" : ""}</tr></thead><tbody>
      ${rs.map(r => `<tr><td>${esc(label(r))}</td><td>${esc(r.unit)}</td><td>${fmt(r.p.passport_expiry)}</td><td><span class="stm-st ${ST_CLS[r.st]}">${r.m == null ? r.stL : r.m < 0 ? "หมดแล้ว" : Math.floor(r.m) + " เดือน"}</span></td>
        <td>${esc(RENEW_L[r.p.renewal_status || ""])}</td><td class="n">${r.p.renewal_cost != null ? Number(r.p.renewal_cost).toLocaleString() : ""}</td><td>${esc(r.p.renewal_note || "")}</td>
        ${ce ? `<td><button class="stm-lnk" data-a="edit" data-k="${esc(r.key)}">อัปเดต</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="8" class="muted">ไม่มีใครต้องต่ออายุ</td></tr>`}
      </tbody>${cost ? `<tfoot><tr><th colspan="5">รวมค่าใช้จ่าย</th><th class="n">${cost.toLocaleString()}</th><th colspan="2"></th></tr></tfoot>` : ""}</table></div>`;
  }

  /* trips */
  function tripPeople(t) {
    const all = people(), byPid = new Map(all.filter(r => r.pid).map(r => [r.pid, r]));
    const back = parse(t.date_to || t.date_from);
    return (t.people || []).map(id => byPid.get(Number(id))).filter(Boolean).map(r => {
      const exp = parse(r.p.passport_expiry);
      const okTravel = !!exp && (!back || exp >= addMonths(back, TRAVEL_MONTHS));
      return Object.assign({}, r, { okTravel });
    });
  }
  function vTrips() {
    const ce = D.canEdit;
    if (S.trip) return tripForm();
    const now = iso(today());
    const list = D.trips.slice().sort((a, b) => String(b.date_from || "").localeCompare(String(a.date_from || "")));
    return `<div class="stm-bar2">${ce ? `<button class="stm-btn" data-a="trip-new">+ Create new trip</button>` : ""}<span class="muted">Passport ต้องเหลืออายุอย่างน้อย ${TRAVEL_MONTHS} เดือนนับจากวันกลับ</span></div>
      <div class="stm-card">${list.length ? list.map(t => `<div class="stm-trip${(t.date_to || t.date_from || "") < now ? " past" : ""}">${tripLine(t)}
        <div class="stm-acts"><button class="stm-lnk" data-a="trip-qv" data-id="${t.id}">${S.tOpen.has(t.id) ? "▾ ซ่อนรายชื่อ" : "👁 ดูรายชื่อ (quick view)"}</button> ${ce ? `<button class="stm-lnk" data-a="trip-edit" data-id="${t.id}">แก้ไข / เลือกคน</button> <button class="stm-lnk" data-a="trip-xlsx" data-id="${t.id}">⬇ รายชื่อทำประกัน (Excel)</button>` : ""}</div>${S.tOpen.has(t.id) ? tripQuick(t) : ""}</div>`).join("") : `<p class="muted">ยังไม่มีทริป</p>`}</div>`;
  }
  /* jobs for trips = Site Expense projects that got the award and have a locked Budget (D.jobs from /api/site-team/data) */
  const jobLabel = j => [j.jo, j.name, j.customer, j.country].filter(Boolean).join(" · ");
  function jobOpts(t) {
    const js = (D.jobs || []).slice(), has = js.some(j => j.jo === t.job_no);
    const o = js.map(j => `<option value="${esc(j.jo)}"${j.jo === t.job_no ? " selected" : ""}>${esc(jobLabel(j))}</option>`).join("");
    return o + (t.job_no && !has ? `<option value="${esc(t.job_no)}" selected>${esc(t.job_no + " · " + (t.title || ""))} (ไม่อยู่ในรายการ Get Award)</option>` : "");
  }
  /* trip kinds (Dew, 17 Nov 2026): installation = Job from Get Award · survey = IJ typed in · service = IS / IN / SO / WR typed in.
     The kind is not stored: it follows the Job no. prefix. */
  const KINDS = [["install", "Job installation (จาก Get Award)"], ["survey", "Site survey (เลข IJ)"], ["service", "Service (เลข IS / IN / SO / WR)"]];
  const TRIP_ST = { draft: ["📝 Draft", "st-none"], confirmed: ["✅ Confirmed", "st-ok"] };
  const KIND_RE = { survey: /^IJ/i, service: /^(IS|IN|SO|WR)/i };
  const kindOf = t => t.kind || (KIND_RE.survey.test(t.job_no || "") ? "survey" : KIND_RE.service.test(t.job_no || "") ? "service" : "install");
  const kindL = t => (KINDS.find(k => k[0] === kindOf(t)) || [, ""])[1].split(" (")[0];
  function pickJob(jo) {
    const j = (D.jobs || []).find(x => x.jo === jo); if (!j) return;
    Object.assign(S.trip, { job_no: j.jo, title: j.name || j.jo, customer: j.customer || "", country: cKey(j.country) || j.country || "", date_from: j.start || S.trip.date_from || "", date_to: j.end || S.trip.date_to || "" });
  }
  function tripForm() {
    const t = S.trip, ce = D.canEdit, sel = new Set((t.people || []).map(Number));
    const back = parse(t.date_to || t.date_from), need = back ? addMonths(back, TRAVEL_MONTHS) : null;
    const TI = certIndex();
    const rs = filtered(people().filter(r => r.active)).filter(r => !S.tCert || hasCert(TI.byKey.get(r.key), S.tCert));
    const chk = r => { const e = parse(r.p.passport_expiry); if (!e) return ["bad", r.st === "none" ? "ไม่มี Passport" : "ไม่ทราบวันหมดอายุ"]; if (need && e < need) return ["bad", "ไม่ถึง " + TRAVEL_MONTHS + " เดือนหลังกลับ"]; if (!need) return ["", fmt(r.p.passport_expiry)]; return ["ok", "ผ่าน"]; };
    const picked = tripPeople(t);
    const dis = ce ? "" : " disabled";
    const kind = kindOf(t), manual = kind !== "install";
    const noPass = picked.filter(r => !r.p.passport_no || !r.p.passport_expiry).length, notOk = picked.filter(r => !r.okTravel).length;
    const canConfirm = picked.length && back && !notOk;
    const cList = `<datalist id="stCountries2">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist>`;
    const head = manual
      ? `<label>${kind === "survey" ? "เลข IJ" : "เลข IS / IN / SO / WR"} *<input id="tJob" value="${esc(t.job_no || "")}" placeholder="เช่น 0021742026"${dis}></label>
        <label>งาน / โปรเจค *<input id="tTitle" value="${esc(t.title || "")}"${dis}></label>
        <label>ลูกค้า<input id="tCus" data-customer value="${esc(t.customer || "")}"${dis}></label>
        <label>ประเทศ<input id="tCountry" list="stCountries2" value="${esc(t.country || "")}"${dis}>${cList}</label>`
      : ((D.jobs || []).length || t.job_no
        ? `<label class="wide">Job (Get Award แล้ว มี Budget ใน Site Expense) *<select id="tJobSel"${dis}><option value="">— เลือก Job —</option>${jobOpts(t)}</select></label>
        <label>งาน / โปรเจค<input id="tTitle" value="${esc(t.title || "")}" readonly></label>
        <label>Job no.<input id="tJob" value="${esc(t.job_no || "")}" readonly></label>
        <label>ลูกค้า<input id="tCus" value="${esc(t.customer || "")}" readonly></label>
        <label>ประเทศ<input id="tCountry" value="${esc(t.country || "")}" readonly></label>`
        : `<p class="wide muted">ยังไม่มี Job ที่ Get Award และมี Budget ใน Site Expense — Job installation สร้างได้หลัง Get Award (Site survey / Service กรอกเลขเองได้)</p>`);
    const vCell = r => { if (!t.country) return ""; const x = visaFor(r.p, t.country); if (!x) return `<td><span class="stm-st st-none">ไม่มีวีซ่า ${esc(cKey(t.country))}</span></td>`;
      const e = parse(x.expiry), ok = !e || !back || e >= back; return `<td><span class="stm-st ${ok ? "st-ok" : "st-bad"}">วีซ่า${x.expiry ? (ok ? " ถึง " : " หมด ") + fmt(x.expiry) : ""}</span></td>`; };
    return `<div class="stm-card"><h3>${t.id ? "แก้ไขทริป" : "Create new trip"} <span class="stm-st ${(TRIP_ST[t.status] || TRIP_ST.draft)[1]}">${(TRIP_ST[t.status] || TRIP_ST.draft)[0]}</span></h3>
      <div class="stm-form">
        <label class="wide">ประเภททริป *<select id="tKind"${dis}>${KINDS.map(([k, l]) => `<option value="${k}"${kind === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        ${head}
        <label>วันไป<input type="date" id="tFrom" value="${esc(t.date_from || "")}"${dis}></label>
        <label>วันกลับ<input type="date" id="tTo" value="${esc(t.date_to || "")}"${dis}></label>
        <label>ประกันเดินทาง<select id="tIns"${dis}>${INS.slice(1).map(([k, l]) => `<option value="${k}"${(t.insurance_type || "trip") === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="wide">หมายเหตุ<input id="tNote" value="${esc(t.note || "")}"${dis}></label>
      </div>
      <h4>เลือกคน (${sel.size}) ${need ? `<span class="muted">— Passport ต้องหมดอายุหลัง ${fmt(iso(need))}</span>` : `<span class="muted">— ใส่วันกลับเพื่อตรวจ Passport</span>`}</h4>
      ${picked.length ? `<div class="stm-chips">${picked.map(r => `<span class="stm-chip ${r.okTravel ? "" : "bad"}" title="${r.okTravel ? "Passport ผ่าน" : !r.p.passport_no ? "ยังไม่มี Passport" : "Passport ไม่ผ่าน " + TRAVEL_MONTHS + " เดือน"}">${esc(label(r))}${r.okTravel ? "" : !r.p.passport_no ? " · ไม่มี Passport" : " ⚠"}</span>`).join("")}</div>
        ${notOk ? `<p class="sub bad">⚠️ ${noPass ? `ยังไม่มี Passport ${noPass} คน` : ""}${noPass && notOk > noPass ? " · " : ""}${notOk > noPass ? `Passport ไม่ผ่าน ${TRAVEL_MONTHS} เดือน ${notOk - noPass} คน` : ""} — บันทึกเป็น Draft ได้ · Confirm ได้เมื่อครบทุกคน</p>` : ""}` : ""}
      ${ce ? filterBar(`<select id="stTc"><option value="">🎓 ทุก Certificate</option>${COURSES.map(([k, l, ic]) => `<option value="${k}"${S.tCert === k ? " selected" : ""}>${ic} ต้องมี ${esc(l)}</option>`).join("")}</select>`) + `<div class="stm-scroll stm-pick"><table class="stm-t"><tbody>${rs.map(r => { const [k, l] = chk(r);
        return `<tr><td><label class="stm-ck"><input type="checkbox" data-pick="${r.pid || "w:" + (r.worker ? r.worker.id : "")}"${r.pid && sel.has(r.pid) ? " checked" : ""}> ${esc(label(r))}</label></td><td>${unitBadge(r.unit)}</td><td>${fmt(r.p.passport_expiry)}</td><td><span class="stm-st ${k === "ok" ? "st-ok" : k === "bad" ? "st-bad" : "st-none"}">${l}</span></td>${vCell(r)}${insTd(r.p, t)}<td><div class="stm-vchips">${liveCerts(TI.byKey.get(r.key)).filter(c => ["ok", "due", "unk"].includes(certSt(c)[0])).map(certChip).join("")}</div></td></tr>`; }).join("")}</tbody></table></div>` : ""}
      <div class="stm-acts">${ce ? `<button class="stm-btn ghost" data-a="trip-save" data-st="draft">💾 บันทึก Draft</button> <button class="stm-btn" data-a="trip-save" data-st="confirmed"${canConfirm ? "" : ` disabled title="Confirm ได้เมื่อทุกคนมี Passport ผ่าน ${TRAVEL_MONTHS} เดือน และใส่วันกลับแล้ว"`}>✅ Confirm trip</button>${t.id ? ` <button class="stm-btn ghost" data-a="trip-xlsx" data-id="${t.id}">⬇ รายชื่อทำประกัน</button> <button class="stm-btn danger" data-a="trip-del" data-id="${t.id}">ลบทริป</button>` : ""}` : ""} <button class="stm-btn ghost" data-a="trip-close">กลับ</button></div></div>`;
  }
  async function tripXlsx(t) {
    let X; try { X = await loadXLSX(); } catch (e) { return toast(e.message, 1); }
    const ps = tripPeople(t);
    const rows = ps.map((r, i) => ({ "ลำดับ": i + 1, "ชื่อ-สกุล (EN ตาม Passport)": r.p.name_en || r.name_en, "ชื่อ-สกุล (TH)": r.name_th, "เพศ": r.p.sex || "",
      "วันเกิด": r.p.birth_date || "", "อายุ": age(r.p.birth_date), "เลขบัตรประชาชน": r.p.national_id || "", "Passport No.": r.p.passport_no || "",
      "Passport หมดอายุ": r.p.passport_expiry || "", "ทีม": r.unit, "Passport ผ่าน 6 เดือน": r.okTravel ? "ผ่าน" : "ไม่ผ่าน",
      "ประกันรายปี": (a => a ? (a.ok ? "ครอบคลุม" : "ไม่ครอบคลุม") + " (" + (r.p.insurance_start || "") + " – " + r.p.insurance_expiry + ")" + (r.p.insurance_policy ? " " + r.p.insurance_policy : "") : "ต้องซื้อรายเที่ยว")(annualCover(r.p, t)),
      ["วีซ่า " + (cKey(t.country) || "")]: t.country ? ((x => x ? (x.type || "มี") + (x.expiry ? " ถึง " + x.expiry : "") : "ไม่มี")(visaFor(r.p, t.country))) : "" }));
    const head = [["รายชื่อทำประกันเดินทาง — " + t.title], [[t.customer, t.country].filter(Boolean).join(" · ")], ["เดินทาง " + (t.date_from || "") + " ถึง " + (t.date_to || t.date_from || "") + " · ประกัน" + (INS_L[t.insurance_type] || "")], []];
    const ws = X.utils.aoa_to_sheet(head); X.utils.sheet_add_json(ws, rows, { origin: "A5" });
    ws["!cols"] = [6, 30, 26, 6, 12, 6, 16, 14, 14, 6, 12, 34, 22].map(w => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Insurance");
    X.writeFile(wb, `TravelInsurance_${String(t.title).replace(/[^\w฀-๿]+/g, "_").slice(0, 40)}_${(t.date_from || "").replace(/-/g, "")}.xlsx`);
  }

  /* person editor (modal) */
  function personForm(r) {
    const p = r ? r.p : {}, w = r && r.worker;
    const f = (id, l, v, type = "text", extra = "") => `<label>${l}<input id="${id}" type="${type}" value="${esc(v ?? "")}"${extra}></label>`;
    /* link field: paste a Google Drive link, 📎 เปิด opens it in a new tab */
    const lnk = (id, l, v) => `<label>${l}<span class="stm-lnkf"><input id="${id}" type="url" placeholder="วางลิงก์ Google Drive" value="${esc(v ?? "")}"><a class="stm-btn ghost stm-open" data-open="${id}" href="${esc(v || "#")}" target="_blank" rel="noopener"${v ? "" : " hidden"}>📎 เปิด</a></span></label>`;
    const sel = (id, l, opts, v) => `<label>${l}<select id="${id}">${opts.map(([k, t]) => `<option value="${k}"${(v || "") === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
    const m = document.createElement("div"); m.className = "stm-modal";
    m.innerHTML = `<div class="stm-dlg"><h3>${w ? esc(label(r)) + ` <span class="muted">${esc(w.unit)} · ${esc(w.emp_code || w.id)}</span>` : (r ? "แก้ไข" : "เพิ่มคน (ไม่อยู่ใน Manpower)")}</h3>
      <div class="stm-form">
        ${w ? "" : f("pTh", "ชื่อ-สกุล (TH)", p.name_th) + f("pCode", "รหัสพนักงาน", p.emp_code) + sel("pTeam", "กลุ่ม", [["", "—"], ...GROUPS], p.team)}
        ${f("pEn", "ชื่อ-สกุล EN (ตาม Passport)", p.name_en || (r && r.name_en))}
        ${sel("pSex", "เพศ", [["", "—"], ["M", "ชาย"], ["F", "หญิง"]], p.sex)}
        ${f("pId", "เลขบัตรประชาชน (13 หลัก)", p.national_id, "text", ' inputmode="numeric" maxlength="17"')}
        ${f("pDob", "วันเกิด", p.birth_date, "date")}
        ${f("pNat", "สัญชาติ", p.nationality || "THA", "text", ' maxlength="3"')}
        ${f("pNo", "เลข Passport", p.passport_no)}
        ${f("pIss", "วันออก Passport", p.passport_issue, "date")}
        ${f("pExp", "วันหมดอายุ Passport", p.passport_expiry, "date")}
        ${lnk("pFile", "ลิงก์สแกน Passport (Google Drive)", p.passport_file)}
        ${sel("pRen", "สถานะต่ออายุ", RENEW, p.renewal_status)}
        ${f("pCost", "ค่าใช้จ่ายต่ออายุ (บาท)", p.renewal_cost, "number", ' min="0" step="1"')}
        ${f("pRenN", "หมายเหตุต่ออายุ", p.renewal_note)}
        ${sel("pIns", "ประกันเดินทาง", INS, p.insurance_type)}
        ${f("pPol", "เลขกรมธรรม์", p.insurance_policy)}
        ${f("pInsS", "ประกันเริ่ม", p.insurance_start, "date")}
        ${f("pInsE", "ประกันหมดอายุ", p.insurance_expiry, "date")}
        ${lnk("pInsF", "ลิงก์กรมธรรม์ (Google Drive)", p.insurance_file)}
        <label class="wide">หมายเหตุ<input id="pNote" value="${esc(p.note || "")}"></label>
        <div class="wide stm-visas"><div class="stm-vh">วีซ่า (แยกตามประเทศ) <button type="button" class="stm-lnk" data-a="v-add">+ เพิ่มวีซ่า</button></div><div id="pVisas"></div>
          ${p.visa_note ? `<div class="sub">บันทึกเดิม: ${esc(p.visa_note)}</div>` : ""}<datalist id="stCountries">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
        ${w ? "" : `<label class="stm-ck"><input type="checkbox" id="pAct"${p.active === false ? "" : " checked"}> ยังทำงานอยู่</label>`}
      </div><div class="stm-err" id="pErr"></div>
      <div class="stm-acts"><button class="stm-btn" data-a="p-save">บันทึก</button>${r && !w && r.pid ? ` <button class="stm-btn danger" data-a="p-del">ลบ</button>` : ""} <button class="stm-btn ghost" data-a="p-close">ยกเลิก</button></div></div>`;
    document.body.appendChild(m);
    const v = id => { const e = m.querySelector("#" + id); return e ? e.value.trim() : undefined; };
    m.querySelectorAll("[data-open]").forEach(a => { const i = m.querySelector("#" + a.dataset.open);
      i.addEventListener("input", () => { const u = i.value.trim(), ok = /^https?:\/\//.test(u); a.hidden = !ok; a.href = ok ? u : "#"; }); });
    const vBox = m.querySelector("#pVisas");
    const vRow = (x = {}) => { const d = document.createElement("div"); d.className = "stm-vrow";
      d.innerHTML = `<input data-v="country" list="stCountries" placeholder="ประเทศ" value="${esc(x.country || "")}"><input data-v="type" placeholder="ประเภท เช่น Business / Work" value="${esc(x.type || "")}">
        <input data-v="visa_no" placeholder="เลขวีซ่า" value="${esc(x.visa_no || "")}"><label>ออก<input data-v="issue" type="date" value="${esc(x.issue || "")}"></label><label>หมดอายุ<input data-v="expiry" type="date" value="${esc(x.expiry || "")}"></label>
        <input data-v="note" placeholder="หมายเหตุ เช่น Multiple entry" value="${esc(x.note || "")}"><button type="button" class="stm-lnk bad" data-a="v-del" title="ลบ">✕</button>`;
      vBox.appendChild(d); };
    (visas(p).length ? visas(p) : visaFromNote(p.visa_note)).forEach(vRow);
    const readVisas = () => [...vBox.querySelectorAll(".stm-vrow")].map(d => Object.fromEntries([...d.querySelectorAll("[data-v]")].map(i => [i.dataset.v, i.value.trim()])))
      .filter(x => x.country).map(x => Object.assign(x, { country: cKey(x.country) }));
    m.addEventListener("click", async e => {
      const a = e.target.closest("[data-a]")?.dataset.a; if (e.target === m || a === "p-close") return m.remove();
      if (a === "v-add") return vRow();
      if (a === "v-del") return e.target.closest(".stm-vrow").remove();
      if (a === "p-del") { if (!confirm("ลบข้อมูลคนนี้?")) return; try { await post("person-delete", { id: r.pid }); m.remove(); toast("ลบแล้ว"); load(true); } catch (x) { m.querySelector("#pErr").textContent = x.message; } return; }
      if (a !== "p-save") return;
      const body = { id: r ? r.pid : 0, worker_id: w ? w.id : null, name_en: v("pEn").toUpperCase(), sex: v("pSex"), national_id: v("pId"), birth_date: v("pDob"), nationality: v("pNat"),
        passport_no: v("pNo"), passport_issue: v("pIss"), passport_expiry: v("pExp"), passport_file: v("pFile"), visas: readVisas(), renewal_status: v("pRen"),
        renewal_cost: v("pCost"), renewal_note: v("pRenN"), insurance_type: v("pIns"), insurance_policy: v("pPol"), insurance_file: v("pInsF"), insurance_start: v("pInsS"), insurance_expiry: v("pInsE"), note: v("pNote") };
      if (!w) Object.assign(body, { name_th: v("pTh"), emp_code: v("pCode"), team: v("pTeam"), active: m.querySelector("#pAct").checked });
      if (body.national_id && !thaiIdOk(body.national_id.replace(/\D/g, "")) && !confirm("เลขบัตรประชาชนไม่ผ่านการตรวจหลักสุดท้าย — บันทึกต่อไหม?")) return;
      try { await post("person", body); m.remove(); toast("บันทึกแล้ว"); load(true); } catch (x) { m.querySelector("#pErr").textContent = x.message; }
    });
  }
  const thaiIdOk = i => /^\d{13}$/.test(i) && (11 - [...i.slice(0, 12)].reduce((s, d, k) => s + d * (13 - k), 0) % 11) % 10 === +i[12];

  /* import */
  const norm = s => String(s || "").toUpperCase().replace(/^(MR|MRS|MS|MISS|นาย|นาง|น\.ส\.|นางสาว)\.?\s*/i, "").replace(/[^A-Z฀-๿]+/g, " ").trim();
  function guessWorker(row) {
    const code = String(row.emp_code || "").toUpperCase(), th = norm(row.name_th), en = norm(row.name_en), thF = th.split(" ")[0], enF = en.split(" ")[0];
    const ws = D.workers;
    return (code && ws.find(w => String(w.emp_code || w.id).toUpperCase() === code))
      || (th && ws.find(w => norm(w.name_th) === th))
      || (en && ws.find(w => norm(w.name_en_hr) === en))
      || (en && ws.filter(w => norm(w.name_en_hr).split(" ")[0] === enF && norm(w.name_en_hr).split(" ")[1]?.[0] === en.split(" ")[1]?.[0]).length === 1 && ws.find(w => norm(w.name_en_hr).split(" ")[0] === enF && norm(w.name_en_hr).split(" ")[1]?.[0] === en.split(" ")[1]?.[0]))
      || (thF && ws.filter(w => norm(w.name_th).split(" ")[0] === thF).length === 1 && ws.find(w => norm(w.name_th).split(" ")[0] === thF)) || null;
  }
  const COLMAP = { "worker id": "worker_id", "รหัสพนักงาน": "emp_code", "emp code": "emp_code", "ชื่อ en (ตาม passport)": "name_en", "name (passport)": "name_en", "ชื่อ-สกุล en": "name_en",
    "ชื่อ th": "name_th", "ชื่อ-สกุล th": "name_th", "ชื่อ th (ตาม passport)": "name_th", "เพศ": "sex", "sex": "sex", "สัญชาติ": "nationality", "เลขบัตรประชาชน": "national_id",
    "วันเกิด": "birth_date", "วันเกิด (yyyy-mm-dd)": "birth_date", "passport no.": "passport_no", "เลข passport": "passport_no", "วันออก": "passport_issue", "passport ออก": "passport_issue",
    "วันหมดอายุ": "passport_expiry", "passport หมดอายุ": "passport_expiry", "วีซ่า": "visa_note", "ลิงก์สแกน": "passport_file", "หมายเหตุ": "note", "สถานะ": "active", "กลุ่ม": "team", "group": "team" };
  const toIso = v => { if (typeof v === "number" && v > 1000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }   // Excel serial date — no time-zone drift
    if (v instanceof Date) return iso(v); const s = String(v || "").trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); if (m) { let y = +m[3]; if (y > 2400) y -= 543; return y + "-" + pad(m[2]) + "-" + pad(m[1]); } return s; };
  async function readImport(file) {
    let X; try { X = await loadXLSX(); } catch (e) { return toast(e.message, 1); }
    const wb = X.read(await file.arrayBuffer());
    const ws = wb.Sheets[wb.SheetNames.find(n => /team|passport|ทีม/i.test(n)) || wb.SheetNames[0]];
    const aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
    const hi = aoa.findIndex(r => r.some(c => COLMAP[String(c).trim().toLowerCase()] === "passport_no"));
    if (hi < 0) return toast("ไม่พบหัวคอลัมน์ 'Passport No.' ในไฟล์", 1);
    const cols = aoa[hi].map(c => COLMAP[String(c).trim().toLowerCase()] || null);
    const rows = aoa.slice(hi + 1).map(r => { const o = {}; cols.forEach((k, i) => { if (k && r[i] !== "" && r[i] != null) o[k] = r[i]; }); return o; })
      .filter(o => o.name_en || o.name_th || o.passport_no).map(o => {
        for (const k of ["birth_date", "passport_issue", "passport_expiry"]) if (o[k]) o[k] = toIso(o[k]);
        if (o.national_id) o.national_id = (typeof o.national_id === "number" ? o.national_id.toFixed(0) : String(o.national_id)).replace(/\D/g, "");
        if (o.sex) o.sex = /^(f|ห|หญิง)/i.test(String(o.sex)) ? "F" : "M";
        if ("active" in o) o.active = !/ลาออก|resign|inactive/i.test(String(o.active));
        if (o.visa_note) { const vs = visaFromNote(o.visa_note); if (vs.length) o.visas = vs; }
        if (o.team) { const t = String(o.team).trim().toUpperCase(); o.team = GROUP_OK.has(t) ? t : (GROUPS.find(g => g[1].toUpperCase() === t) || [""])[0]; }
        const g = o.worker_id ? D.workers.find(w => w.id === String(o.worker_id)) : guessWorker(o);
        o.worker_id = g ? g.id : ""; if (g) o.team = ""; return o;
      });
    S.imp = rows; draw();
  }
  function vImport() {
    if (!S.imp) return `<div class="stm-card"><h3>นำเข้าข้อมูล Passport จาก Excel</h3>
      <p>ไฟล์ต้องมีแถวหัวตาราง เช่น <code>ชื่อ EN (ตาม Passport)</code> <code>ชื่อ TH</code> <code>เพศ</code> <code>เลขบัตรประชาชน</code> <code>วันเกิด</code> <code>Passport No.</code> <code>วันออก</code> <code>วันหมดอายุ</code> <code>ลิงก์สแกน</code> (ใช้ไฟล์ตรวจทานที่ส่งให้ SC / PC ได้เลย)</p>
      <p class="muted">ระบบจับคู่กับรายชื่อใน Manpower ให้อัตโนมัติ — ตรวจและเลือกเองได้ก่อนกดนำเข้า ถ้ามีข้อมูลอยู่แล้วจะอัปเดตทับ (จับคู่จากคน หรือเลข Passport)</p>
      <input type="file" id="impFile" accept=".xlsx,.xls,.csv"></div>`;
    const opts = `<option value="">— ไม่อยู่ใน Manpower (เพิ่มเป็นคนใหม่) —</option>` + GROUPS.map(([k, l]) => `<option value="+${k}">+ เพิ่มเป็นคนใหม่ · ${l}</option>`).join("") + D.workers.filter(w => w.active !== false).map(w => `<option value="${esc(w.id)}">${esc(w.unit + " · " + w.name_th + (w.nickname ? " (" + w.nickname + ")" : ""))}</option>`).join("");
    const used = new Map(); S.imp.forEach(r => r.worker_id && used.set(r.worker_id, (used.get(r.worker_id) || 0) + 1));
    return `<div class="stm-card stm-scroll"><h3>ตรวจก่อนนำเข้า — ${S.imp.length} แถว</h3><table class="stm-t"><thead><tr><th>ชื่อใน Passport</th><th>ชื่อ TH</th><th>Passport</th><th>หมดอายุ</th><th>เลขบัตร</th><th>จับคู่กับ Manpower</th></tr></thead><tbody>
      ${S.imp.map((r, i) => `<tr><td>${esc(r.name_en || "")}${r.active === false ? ' <span class="stm-st st-none">ลาออก</span>' : ""}</td><td>${esc(r.name_th || "")}</td><td class="mono">${esc(r.passport_no || "")}</td><td>${fmt(r.passport_expiry)}</td>
        <td class="mono">${esc(fmtId(r.national_id))}${r.national_id && !thaiIdOk(r.national_id) ? ' <span class="bad" title="ไม่ผ่านการตรวจหลักสุดท้าย">⚠</span>' : ""}</td>
        <td><select data-imp="${i}" class="${!r.worker_id && !r.team ? "warn" : used.get(r.worker_id) > 1 ? "bad" : ""}">${(k => opts.replace(`value="${esc(k)}"`, `value="${esc(k)}" selected`))(r.worker_id || (r.team ? "+" + r.team : ""))}</select>${used.get(r.worker_id) > 1 ? '<div class="bad sub">จับคู่ซ้ำ</div>' : ""}</td></tr>`).join("")}
      </tbody></table><div class="stm-acts"><button class="stm-btn" data-a="imp-go">นำเข้า ${S.imp.length} แถว</button> <button class="stm-btn ghost" data-a="imp-cancel">ยกเลิก</button></div></div>`;
  }

  /* ---------- events ---------- */
  function bind() {
    const on = (id, ev, fn) => { const e = ROOT.querySelector("#" + id); if (e) e.addEventListener(ev, fn); };
    const keepFocus = (id) => { const e = ROOT.querySelector("#" + id); if (e) { e.focus(); e.setSelectionRange?.(e.value.length, e.value.length); } };
    on("stQ", "input", e => { S.q = e.target.value; readTrip(); draw(); keepFocus("stQ"); });
    on("stU", "change", e => { S.unit = e.target.value; readTrip(); draw(); });
    on("stCc", "change", e => { location.hash = "#site-team/certs" + (e.target.value ? "/" + e.target.value : ""); });
    on("stCOnly", "change", e => { S.cOnly = e.target.checked; draw(); });
    on("stTc", "change", e => { readTrip(); S.tCert = e.target.value; draw(); });
    ROOT.querySelectorAll("[data-crs]").forEach(x => x.addEventListener("change", () => certQuick(+x.dataset.crs, { renew_status: x.value })));
    ROOT.querySelectorAll("[data-crd]").forEach(x => x.addEventListener("change", () => certQuick(+x.dataset.crd, { renew_date: x.value })));
    on("stVc", "change", e => { location.hash = "#site-team/visas" + (e.target.value ? "/" + encodeURIComponent(e.target.value) : ""); });
    ROOT.querySelectorAll("tr[data-href]").forEach(tr => tr.addEventListener("click", e => { if (!e.target.closest("a")) location.hash = tr.dataset.href; }));
    on("stS", "change", e => { S.st = e.target.value; readTrip(); draw(); });
    on("impFile", "change", e => e.target.files[0] && readImport(e.target.files[0]));
    ROOT.querySelectorAll("[data-imp]").forEach(s => s.addEventListener("change", () => { const r = S.imp[+s.dataset.imp]; if (s.value.startsWith("+")) { r.worker_id = ""; r.team = s.value.slice(1); } else { r.worker_id = s.value; r.team = ""; } draw(); }));
    ROOT.querySelectorAll("[data-pick]").forEach(c => c.addEventListener("change", async () => {
      readTrip(); let id = c.dataset.pick;
      if (id.startsWith("w:")) {   // on the Manpower board but no Site Team row yet (no passport) — create one so the trip can hold them
        try { const j = await post("person", { worker_id: id.slice(2) }); D.people = D.people.concat(j.person); id = j.person.id; } catch (x) { c.checked = false; return toast(x.message, 1); }
      }
      const set = new Set((S.trip.people || []).map(Number)); c.checked ? set.add(+id) : set.delete(+id); S.trip.people = [...set]; draw();
    }));
    ["tFrom", "tTo"].forEach(id => on(id, "change", () => { readTrip(); draw(); }));
    on("tJobSel", "change", e => { readTrip(); pickJob(e.target.value); draw(); });
    on("tKind", "change", e => { readTrip(); Object.assign(S.trip, { kind: e.target.value, job_no: "", title: "", customer: "", country: "" }); draw(); });
    on("tCountry", "change", () => { readTrip(); draw(); });
    ROOT.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => act(b.dataset.a, b.dataset)));
  }
  function readTrip() {
    if (!S.trip || !ROOT.querySelector("#tFrom")) return;
    const g = id => ROOT.querySelector("#" + id).value.trim();
    Object.assign(S.trip, { date_from: g("tFrom"), date_to: g("tTo"), insurance_type: g("tIns"), note: g("tNote") });
    if (kindOf(S.trip) !== "install" && ROOT.querySelector("#tJob")) Object.assign(S.trip, { job_no: g("tJob").toUpperCase().replace(/\s+/g, ""), title: g("tTitle"), customer: g("tCus"), country: g("tCountry") });
  }
  async function act(a, ds) {
    const all = () => people();
    if (a === "edit") return personForm(all().find(r => r.key === ds.k));
    if (a === "add") return personForm(null);
    if (a === "trip-new") { S.trip = { people: [], insurance_type: "trip", kind: "install", status: "draft" }; S.q = ""; return draw(); }
    if (a === "trip-edit" || a === "trip-view") { S.trip = JSON.parse(JSON.stringify(D.trips.find(t => t.id === +ds.id))); S.q = ""; return draw(); }
    if (a === "trip-close") { S.trip = null; return draw(); }
    if (a === "trip-qv") { const id = +ds.id; S.tOpen.has(id) ? S.tOpen.delete(id) : S.tOpen.add(id); return draw(); }
    if (a === "trip-copy") {
      const t = D.trips.find(x => x.id === +ds.id), rows = tripPeople(t).map((r, i) => [i + 1, r.name_th || "", r.p.name_en || r.name_en || "", r.p.passport_no || "", r.p.passport_expiry || ""].join("\t"));
      const txt = ["#\tชื่อ-นามสกุล\tName (Passport)\tPassport No.\tExpiry", ...rows].join("\n");
      try { await navigator.clipboard.writeText(txt); toast("คัดลอกรายชื่อแล้ว " + rows.length + " คน"); } catch (x) { toast("คัดลอกไม่ได้ — ใช้ปุ่ม ⬇ รายชื่อทำประกัน แทน", 1); }
      return;
    }
    if (a === "trip-xlsx") { readTrip(); const t = S.trip && S.trip.id === +ds.id ? S.trip : D.trips.find(x => x.id === +ds.id); return tripXlsx(t); }
    if (a === "trip-save") {
      readTrip(); const t = S.trip;
      const k = kindOf(t);
      if (k === "install" && !t.job_no) return toast("เลือก Job ที่ Get Award แล้วก่อน", 1);
      if (k !== "install" && !t.job_no) return toast("ใส่เลขงานก่อน", 1);
      if (!t.title) return toast("ใส่ชื่องาน / โปรเจคก่อน", 1);
      const st = ds.st === "confirmed" ? "confirmed" : "draft", bad = tripPeople(t).filter(r => !r.okTravel);
      if (st === "confirmed" && (bad.length || !tripPeople(t).length)) return toast(bad.length ? `Confirm ไม่ได้ — Passport ยังไม่ครบ / ไม่ผ่าน: ${bad.map(label).join(", ")}` : "เลือกคนก่อน Confirm", 1);
      try { const j = await post("trip", { ...t, kind: k, status: st }); S.trip = null; toast(st === "confirmed" ? "Confirm trip แล้ว ✅" : "บันทึก Draft แล้ว"); D.trips = D.trips.filter(x => x.id !== j.trip.id).concat(j.trip); draw(); } catch (x) { toast(x.message, 1); }
      return;
    }
    if (a === "trip-del") { if (!confirm("ลบทริปนี้?")) return; try { await post("trip-delete", { id: +ds.id }); S.trip = null; D.trips = D.trips.filter(x => x.id !== +ds.id); draw(); } catch (x) { toast(x.message, 1); } return; }
    if (a === "cmat-full") { S.cFull = !S.cFull; document.body.classList.toggle("stm-noscroll", S.cFull); return draw(); }
    if (a === "ins-add") return insForm();
    if (a === "cert-new") return certForm(null);
    if (a === "cert-edit") return certForm((D.certs || []).find(c => c.id === +ds.id));
    if (a === "imp-cancel") { S.imp = null; return draw(); }
    if (a === "imp-go") {
      try { const j = await post("import", { rows: S.imp }); S.imp = null; toast(`นำเข้าแล้ว: เพิ่ม ${j.created} · อัปเดต ${j.updated}` + (j.failed.length ? ` · ไม่สำเร็จ ${j.failed.length}` : ""), j.failed.length > 0); if (j.failed.length) console.warn(j.failed); location.hash = "#site-team/people"; load(true); } catch (x) { toast(x.message, 1); }
    }
  }

  const CSS = `
.stm-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}.stm-tabs a{padding:7px 14px;border-radius:999px;border:1px solid var(--line,#e3e6ea);text-decoration:none;color:inherit;font-size:13px;background:#fff}.stm-tabs a.on{background:var(--rak);color:#fff;border-color:var(--rak)}.stm-tabs a:hover{border-color:var(--rak-line,#d6dae0)}
.stm-note{font-size:12.5px;color:#6b7280;background:#f6f7f9;border-radius:10px;padding:8px 12px;margin:0 0 12px}
.stm-card{background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:12px;padding:14px 16px;margin-bottom:14px}.stm-card h3{margin:0 0 10px;font-size:15px}.stm-card h4{margin:14px 0 6px;font-size:13px}
.stm-err{color:#c92a2a}.muted{color:#8a9099}.bad{color:#c92a2a}.sub{font-size:11.5px;color:#8a9099}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;white-space:nowrap}
.stm-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}.stm-tile{background:#fff;border-top:3px solid var(--blush-2)!important;border:1px solid var(--line,#e3e6ea);border-radius:12px;padding:12px 14px}.stm-tile b{display:block;font-size:26px}.stm-tile span{font-size:12.5px;color:#6b7280}
.stm-tile.t-ok b{color:#2b8a3e}.stm-tile.t-warn b{color:#d9480f}.stm-tile.t-bad b{color:#c92a2a}.stm-tile.t-none b{color:#868e96}
.stm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}.stm-grid .stm-card{margin:0}
.stm-t{width:100%;border-collapse:collapse;font-size:13px;min-width:0}.stm-roster{min-width:980px}.stm-grid .stm-card{overflow:auto}.stm-t tbody th{background:none;font-size:13px;color:inherit;font-weight:500}.stm-t tr:last-child td{border-bottom:0}.stm-t th,.stm-t td{padding:7px 8px;border-bottom:1px solid #f0f1f3;text-align:left;vertical-align:top}.stm-t thead th{font-size:12px;color:#6b7280;font-weight:600;background:var(--blush);position:sticky;top:0}.stm-t .n{text-align:right}.stm-t td.n.ok{color:#2b8a3e}.stm-t td.n.bad{color:#c92a2a;font-weight:600}.stm-t td:nth-child(2){white-space:nowrap}
.stm-scroll{overflow:auto}.stm-pick{max-height:420px;border:1px solid #f0f1f3;border-radius:8px}
.stm-barc{width:40%}.stm-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:#f1f3f5}.stm-bar i,.stm-legend i{display:inline-block}.b-ok{background:#40c057}.b-lt12{background:#fab005}.b-lt6{background:#fa5252}.b-none{background:#ced4da}
.stm-legend{font-size:11.5px;color:#6b7280;margin-top:8px}.stm-legend i{width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px;vertical-align:-1px}
.stm-st{display:inline-block;font-size:11.5px;padding:2px 8px;border-radius:999px;white-space:nowrap}.st-ok{background:#ebfbee;color:#2b8a3e}.st-warn{background:#fff4e6;color:#d9480f}.st-bad{background:#fff5f5;color:#c92a2a}.st-none{background:#f1f3f5;color:#6b7280}
.stm-more{display:inline-block;margin-top:8px;font-size:12.5px}.stm-trip{padding:8px 0;border-bottom:1px solid #f0f1f3}.stm-trip:last-of-type{border:0}.stm-trip.past{opacity:.55}.stm-trip .stm-trip{border:0;padding:0}
.stm-bar2{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.stm-bar2 input,.stm-bar2 select,.stm-form input,.stm-form select{padding:7px 10px;border:1px solid #d6dae0;border-radius:8px;font:inherit;font-size:13px;background:#fff}.stm-bar2 input[type=search]{min-width:220px}
.stm-btn{padding:7px 14px;border-radius:8px;border:1px solid var(--rak);background:var(--rak);color:#fff;font:inherit;font-size:13px;cursor:pointer}.stm-btn:hover{background:var(--rak-dark)}.stm-btn.ghost{background:#fff;color:var(--ink,#111);border-color:#d6dae0}.stm-btn.ghost:hover{border-color:var(--rak-line);background:#fff}.stm-btn.danger{background:#fff;color:#c92a2a;border-color:#f1aeb5}
.stm-lnk{background:none;border:0;color:var(--rak);cursor:pointer;font:inherit;font-size:12.5px;padding:0}.stm-acts{margin-top:10px}.stm-cnt{font-size:12px;margin-top:-6px}
.stm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.stm-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6b7280}.stm-form .wide{grid-column:1/-1}.stm-ck{flex-direction:row!important;align-items:center;gap:6px!important;color:inherit!important;font-size:13px!important}
.stm-vchips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.stm-vchip{background:#e7f5ff;color:#1864ab;border-radius:999px;padding:2px 8px;font-size:11.5px;white-space:nowrap}.stm-vchip.bad{background:#fff5f5;color:#c92a2a}
.stm-visas{border-top:1px solid #f0f1f3;padding-top:8px}.stm-vh{font-size:12px;color:#6b7280;margin-bottom:6px;display:flex;gap:10px;align-items:center}.stm-vrow{display:grid;grid-template-columns:1.2fr 1.2fr 1fr auto auto 1.4fr auto;gap:6px;align-items:end;margin-bottom:6px}.stm-vrow input{padding:6px 8px;border:1px solid #d6dae0;border-radius:8px;font:inherit;font-size:12.5px;min-width:0}.stm-vrow label{display:flex;flex-direction:column;font-size:11px;color:#8a9099;gap:2px}
.stm-click{cursor:pointer}.stm-click:hover{background:#f8f9fb}.stm-click a{color:inherit;text-decoration:none}.stm-t td.n.warn{color:#d9480f;font-weight:600}
.stm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.stm-chip{background:#ebfbee;color:#2b8a3e;border-radius:999px;padding:3px 10px;font-size:12.5px}.stm-chip.bad{background:#fff5f5;color:#c92a2a}
select.warn{border-color:#fab005}select.bad{border-color:#fa5252}
.stm-modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;z-index:200;overflow:auto;padding:40px 12px}.stm-dlg{background:#fff;border-radius:14px;padding:18px 20px;max-width:860px;width:100%}.stm-dlg h3{margin:0 0 12px}
.stm-qv{margin-top:10px;padding:10px 12px;background:#fafbfc;border:1px solid #eef0f3;border-radius:12px;overflow:auto}.stm-qv .stm-t{margin-bottom:6px}
.stm-grid .stm-card.c-ins,.stm-card.c-ins{border-top:4px solid #339af0}.c-ins h3 i{background:#e7f5ff}
.stm-lnkf{display:flex;gap:6px;align-items:center;width:100%}.stm-lnkf input{flex:1 1 auto;width:auto!important;min-width:0}.stm-open{white-space:nowrap;padding:7px 10px;font-size:12.5px;text-decoration:none}
/* certificates */
.stm-grid .stm-card.c-cert,.stm-card.c-cert{border-top-color:#f06595}.c-cert h3 i{background:#fff0f6}
.stm-cchip{display:inline-flex;gap:3px;align-items:center;font-size:11px;padding:1px 7px;border-radius:999px;white-space:nowrap}
.stm-cmat th.stm-ch{text-align:center;vertical-align:bottom;min-width:58px}.stm-cmat th.stm-ch span{display:block;font-size:17px}.stm-cmat th.stm-ch small{display:block;font-size:10.5px;font-weight:500;line-height:1.2;color:#6b7280}
.stm-cmat td,.stm-cmat th{vertical-align:middle}.stm-cmat th.stm-ch,.stm-cmat td.stm-cx{text-align:center!important;width:96px;min-width:84px;padding-left:4px!important;padding-right:4px!important}
.stm-cdot{display:flex;align-items:center;justify-content:center;margin:0 auto;width:30px;height:30px;padding:0;border-radius:9px;border:0;font-weight:700;cursor:pointer;font-size:14px;line-height:1}.stm-cdot:disabled{cursor:default}
.muted-row td{color:#868e96}
.stm-noexp summary{cursor:pointer;list-style:none}.stm-noexp button.stm-cchip{border:0;cursor:pointer;font:inherit;font-size:11.5px}
.stm-cmatcard h3{flex-wrap:wrap}.stm-fullbtn{margin-left:auto;font-size:12.5px;padding:6px 12px}
.stm-cmatwrap{overflow:auto;max-height:72vh;border-radius:10px}
.stm-cmat thead th{position:sticky;top:0;z-index:2;background:#fdf2f8;box-shadow:0 1px 0 #f1d5e3}
.stm-cmat th:first-child,.stm-cmat td:first-child{position:sticky;left:0;z-index:1;background:#fff;min-width:190px}.stm-cmat thead th:first-child{z-index:3;background:#fdf2f8}
.stm-full{position:fixed!important;inset:0;z-index:180;margin:0!important;border-radius:0!important;display:flex;flex-direction:column;padding:16px 20px!important;background:#fff}
.stm-full .stm-cmatwrap{flex:1;max-height:none}.stm-full .stm-bar2{margin:4px 0 6px}
body.stm-noscroll{overflow:hidden}
/* friendly look (Dew, 17 Nov 2026) */
.stm-tabs a{transition:.15s}.stm-tabs a:hover{background:#fff5f5;border-color:#ffc9c9}
.stm-tile{display:flex!important;align-items:center;gap:12px;text-decoration:none;color:inherit;border:0!important;border-radius:16px!important;box-shadow:0 1px 2px rgba(16,24,40,.06);transition:transform .15s,box-shadow .15s}
.stm-tile:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(16,24,40,.10)}
.stm-tile i{font-style:normal;font-size:24px;width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#fff;flex:none}
.stm-tile.t-all{background:linear-gradient(135deg,#f3f0ff,#e5dbff)}.stm-tile.t-all b{color:#5f3dc4}
.stm-tile.t-ok{background:linear-gradient(135deg,#ebfbee,#d3f9d8)}.stm-tile.t-warn{background:linear-gradient(135deg,#fff4e6,#ffe8cc)}
.stm-tile.t-bad{background:linear-gradient(135deg,#fff5f5,#ffe3e3)}.stm-tile.t-none{background:linear-gradient(135deg,#f8f9fa,#e9ecef)}
.stm-grid .stm-card{border:0;border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.06);border-top:4px solid #e9ecef}
.stm-card.c-team{border-top-color:#845ef7}.stm-card.c-pass{border-top-color:#ff922b}.stm-card.c-visa{border-top-color:#339af0}.stm-card.c-trip{border-top-color:#20c997}
.stm-card h3{display:flex;align-items:center;gap:8px}.stm-card h3 i{font-style:normal;font-size:16px;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:#f8f9fa}
.c-team h3 i{background:#f3f0ff}.c-pass h3 i{background:#fff4e6}.c-visa h3 i{background:#e7f5ff}.c-trip h3 i{background:#e6fcf5}
.stm-ub{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.stm-bar{display:flex;height:6px;border-radius:999px;overflow:hidden;background:#f1f3f5;margin-top:5px;width:110px}.stm-bar i{display:block;height:100%}.stm-bar .b-ok{background:#51cf66}.stm-bar .b-bad{background:#ff922b}.stm-bar .b-no{background:#ced4da}
.stm-flag{font-size:16px;margin-right:6px}.stm-empty{text-align:center;color:#868e96;padding:18px 6px;font-size:14px;line-height:1.7}
.stm-more{display:inline-block;margin-top:10px;padding:5px 12px;border-radius:999px;background:#f8f9fa;text-decoration:none!important;font-size:12.5px;color:#495057}.stm-more:hover{background:#fff0f6;color:#c2255c}
.stm-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;z-index:300;font-size:13px}.stm-toast.bad{background:#c92a2a}
`;

  document.addEventListener("keydown", e => { if (e.key === "Escape" && S.cFull) { S.cFull = false; document.body.classList.remove("stm-noscroll"); if (ROOT) draw(); } });
  window.SiteTeam = {
    mount(el, sub) {
      if (!document.getElementById("stmCss")) { const s = document.createElement("style"); s.id = "stmCss"; s.textContent = CSS; document.head.appendChild(s); }
      ROOT = el; const parts = String(sub || "").split("/"), pg = parts[0];
      S.vc = pg === "visas" && parts[1] ? decodeURIComponent(parts.slice(1).join("/")) : "";
      if (pg === "certs") S.cc = COURSE[parts[1]] ? parts[1] : "";
      if (pg !== S.page) { S.cFull = false; document.body.classList.remove("stm-noscroll"); S.trip = null; if (pg !== "import") S.imp = null; }
      S.page = TABS.some(t => t[0] === pg) || pg === "import" ? pg : "";
      draw(); load();
    },
  };
})();
