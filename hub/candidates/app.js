/* SSM Work · Candidates — applicants' written tests from the public form (/apply), CV / Resume, scoring, status.
   Pre:    ดิว / นุ่น เพิ่มผู้สมัครจาก CV ก่อนทำแบบทดสอบ (answers = {}) → /apply ส่งด้วยชื่อ-นามสกุลตรงกัน (ไม่นับเว้นวรรค) เติมคำตอบเข้าแถวเดิม
   Fit:    วิเคราะห์ความเข้ากันได้เบื้องต้น — ดิว / นุ่น วางข้อความ CV → fit.js ให้คะแนนตามโครงสร้าง SSM → POST /api/candidates/fit
   Routes: #candidates (ผู้สมัคร) · #candidates/c/<id> (ผู้สมัครรายคน) · #candidates/tests (แบบทดสอบ + ลิงก์ / QR)
   Data:   GET /api/candidates/data → { me: {username, name, canEdit}, keepDays, purged, tests, candidates, scores }
   Rights: everyone with the menu reads answers and keeps their own score sheet; ดิว / นุ่น (canEdit) change status,
           attach CV / Resume (upload or Google Drive link), edit notes, delete. Rejected / withdrawn → deleted after keepDays. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const ST = { new: ["ใหม่", "s-new"], screening: ["คัดกรอง", "s-cal"], interview: ["นัดสัมภาษณ์", "s-loan"], interviewed: ["สัมภาษณ์แล้ว", "s-loan"], offer: ["เสนองาน", "s-warn"],
    hired: ["รับเข้าทำงาน", "s-ok"], rejected: ["ไม่ผ่าน", "s-off"], withdrawn: ["ถอนตัว", "s-off"] };
  const DRIVE_FOLDER = "https://drive.google.com/drive/folders/1VukVt1u2sVWmsqeRdUolDKlzDLVkoslv";
  const QR = ["https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js", "sha384-e9EFD6BGC90bkW9aDV5xbbBfzwN7G8YImHao2lfLVKV/hPB0E0go+H3I64h7oHtA"];

  let ROOT = null, D = null, ERR = "", LOADING = null;
  const S = { page: "", id: 0, q: "", st: "", test: "", add: false };
  const me = () => (D && D.me) || {};

  const pad = n => String(n).padStart(2, "0");
  const fmtT = s => { if (!s) return ""; const d = new Date(s); return d.getDate() + " " + MS[d.getMonth()] + " " + String(d.getFullYear() + 543).slice(2) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const dur = (a, b) => { if (!a || !b) return ""; const m = Math.round((new Date(b) - new Date(a)) / 6e4); if (m < 0 || m > 60 * 24 * 14) return ""; return m < 60 ? m + " นาที" : Math.floor(m / 60) + " ชม. " + (m % 60) + " นาที"; };
  const chip = (l, c) => `<span class="cd-chip ${c}">${esc(l)}</span>`;
  const stChip = c => chip(...(ST[c.status] || [c.status, "s-off"]));
  const testOf = c => D.tests.find(t => t.id === c.test_id) || D.tests[0] || { content: {}, rubric: {} };
  const scoresOf = c => D.scores.filter(s => s.candidate_id === c.id);
  const avg = c => { const s = scoresOf(c).filter(x => x.total != null); return s.length ? Math.round(s.reduce((a, b) => a + Number(b.total), 0) / s.length * 10) / 10 : null; };
  const isNew = c => !(c.seen_by || []).includes(me().username);
  const daysLeft = c => ["rejected", "withdrawn"].includes(c.status) ? Math.max(0, D.keepDays - Math.floor((Date.now() - new Date(c.status_at)) / 864e5)) : null;
  const pending = c => !Object.keys(c.answers || {}).length;   // สร้างจาก CV แล้ว รอผู้สมัครทำแบบทดสอบ
  const PREFIXES = ["นางสาว", "น.ส.", "นส.", "นาง", "นาย", "mrs.", "mr.", "ms."];   // same rule as candNameKeys in middleware
  const nameKeys = s => { const k = String(s ?? "").normalize("NFC").replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, ""); return [k, ...PREFIXES.filter(p => k.toLowerCase().startsWith(p) && k.length > p.length).map(p => k.slice(p.length))]; };
  const nameKey = s => nameKeys(s)[0];
  const sameName = (a, b) => { const A = nameKeys(a); return nameKeys(b).some(k => A.includes(k)); };
  const fileHref = f => f.url || "/api/candidates/file?p=" + encodeURIComponent(f.p);

  async function load(force) {
    if (D && !force) return D;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try { const r = await fetch("/api/candidates/data", { cache: "no-store" }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === "no_table" ? "ยังไม่ได้สร้างตาราง — ให้ Admin รัน database/candidates.sql ใน Supabase ก่อน" : (j.error || "HTTP " + r.status));
        D = j; ERR = ""; } catch (e) { ERR = e.message; }
      LOADING = null; draw();
    })();
    return LOADING;
  }
  async function post(path, body) {
    const r = await fetch("/api/candidates/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j;
  }
  function toast(m, bad) { const t = document.createElement("div"); t.className = "cd-toast" + (bad ? " bad" : ""); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 2400); }

  function draw() {
    if (!ROOT) return;
    if (ERR) { ROOT.innerHTML = `<div class="cd-card cd-err">${esc(ERR)}</div>`; return; }
    if (!D) { ROOT.innerHTML = `<div class="cd-card">กำลังโหลด…</div>`; return; }
    const newN = D.candidates.filter(isNew).length;
    const tabs = `<div class="cd-tabs"><a href="#candidates" class="${S.page !== "tests" ? "on" : ""}">ผู้สมัคร${newN ? ` <b class="cd-dot">${newN}</b>` : ""}</a><a href="#candidates/tests" class="${S.page === "tests" ? "on" : ""}">แบบทดสอบ · ลิงก์สมัคร</a>${me().canEdit ? `<span class="cd-role">ดิว / นุ่น — แก้ไขได้</span>` : ""}</div>`;
    const trial = D.tests.some(t => t.trial);
    const banner = trial ? `<div class="cd-trial"><div>🧪 <b>โหมดทดลองใช้</b> — ทดลองส่งแบบทดสอบ ให้คะแนน แนบไฟล์ได้ตามสบาย ข้อมูลทั้งหมดล้างได้ก่อนเปิดใช้งานจริง · หน้าสมัครจะขึ้นป้าย “ทดลองระบบ”</div>${me().canEdit ? `<div><button class="cd-btn ghost sm" data-a="reset">🧹 ล้างข้อมูลทดลองทั้งหมด</button> <button class="cd-btn sm" data-a="golive">🚀 เปิดใช้งานจริง</button></div>` : ""}</div>` : "";
    ROOT.innerHTML = tabs + banner + (S.page === "c" ? vCand() : S.page === "tests" ? vTests() : vList());
    bind();
  }

  function vList() {
    const cs = D.candidates, q = S.q.toLowerCase();
    const list = cs.filter(c => (!S.st || c.status === S.st || (S.st === "open" && !["hired", "rejected", "withdrawn"].includes(c.status)) || (S.st === "pending" && pending(c))) && (!S.test || String(c.test_id) === S.test)
      && (!q || [c.name, c.phone, c.email, c.line_id, c.position].some(v => String(v || "").toLowerCase().includes(q))));
    const cnt = k => cs.filter(c => c.status === k).length;
    const unscored = cs.filter(c => !["rejected", "withdrawn"].includes(c.status) && !scoresOf(c).some(s => s.assessor === me().username)).length;
    const soon = cs.filter(c => { const d = daysLeft(c); return d !== null && d <= 14; }).length;
    const tiles = [["📥", "ผู้สมัครทั้งหมด", cs.length, ""], ["🆕", "ยังไม่ได้เปิดดู", cs.filter(isNew).length, "new"], ["✍️", "ฉันยังไม่ให้คะแนน", unscored, unscored ? "warn" : ""],
      ["📅", "นัดสัมภาษณ์", cnt("interview"), ""], ["🤝", "รับเข้าทำงาน", cnt("hired"), "ok"], ["🗑", `จะถูกลบใน 14 วัน`, soon, soon ? "warn" : ""]];
    return `<div class="cd-tiles">${tiles.map(([i, l, n, k]) => `<div class="cd-tile t-${k}"><i>${i}</i><b>${n}</b><span>${l}</span></div>`).join("")}</div>
      ${D.purged ? `<div class="cd-note">ลบข้อมูลผู้สมัครที่ไม่ผ่าน / ถอนตัวครบ ${D.keepDays} วันแล้ว ${D.purged} คน (PDPA)</div>` : ""}
      <div class="cd-bar"><input type="search" id="cdQ" placeholder="🔍 ค้นหาชื่อ / เบอร์ / อีเมล" value="${esc(S.q)}">
        <select id="cdSt"><option value="">ทุกสถานะ</option><option value="open"${S.st === "open" ? " selected" : ""}>กำลังพิจารณา</option><option value="pending"${S.st === "pending" ? " selected" : ""}>รอทำแบบทดสอบ</option>${Object.entries(ST).map(([k, [l]]) => `<option value="${k}"${S.st === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        ${D.tests.length > 1 ? `<select id="cdTest"><option value="">ทุกตำแหน่ง</option>${D.tests.map(t => `<option value="${t.id}"${S.test === String(t.id) ? " selected" : ""}>${esc(t.title)}</option>`).join("")}</select>` : ""}
        ${me().canEdit ? `<button class="cd-btn" data-a="add-open">+ เพิ่มผู้สมัคร (จาก CV)</button> <a class="cd-btn ghost" href="${DRIVE_FOLDER}" target="_blank" rel="noopener">📁 โฟลเดอร์ CV (Drive)</a>` : ""}</div>
      ${me().canEdit && S.add ? vAdd() : ""}
      <div class="cd-card cd-scroll"><table class="cd-t"><thead><tr><th>ผู้สมัคร</th><th>ตำแหน่ง</th><th>ส่งเมื่อ</th><th>ใช้เวลา</th><th>สถานะ</th><th class="n">คะแนนเฉลี่ย</th><th class="n">เข้ากันได้*</th><th>CV</th></tr></thead><tbody>
      ${list.map(c => { const a = avg(c), n = scoresOf(c).length, dl = daysLeft(c);
        return `<tr class="${isNew(c) ? "new" : ""}" data-go="${c.id}"><td><a href="#candidates/c/${c.id}"><b>${esc(c.name)}</b></a>${isNew(c) ? " " + chip("ใหม่", "s-new") : ""}<div class="sub">${esc([c.phone, c.email].filter(Boolean).join(" · "))}</div></td>
          <td>${esc(c.position || "")}</td><td>${pending(c) ? `<span class="sub">สร้าง ${fmtT(c.submitted_at)}</span>` : fmtT(c.submitted_at)}</td><td>${dur(c.started_at, c.submitted_at)}</td><td>${stChip(c)}${pending(c) ? " " + chip("รอทำแบบทดสอบ", "s-warn") : ""}${dl !== null ? `<div class="sub">ลบใน ${dl} วัน</div>` : ""}</td>
          <td class="n">${a !== null ? `<b>${a}</b><span class="sub"> / 100 (${n})</span>` : `<span class="sub">ยังไม่มี</span>`}</td><td class="n">${fitPct(c) !== null ? `<span class="cd-fitn ${fitCls(fitPct(c))}">${fitPct(c)}%</span>` : `<span class="sub">–</span>`}</td><td>${(c.files || []).length ? "📎 " + c.files.length : ""}</td></tr>`; }).join("") || `<tr><td colspan="8" class="muted">ยังไม่มีผู้สมัคร — ส่งลิงก์สมัครจากแท็บ “แบบทดสอบ · ลิงก์สมัคร”</td></tr>`}
      </tbody></table><div class="sub" style="margin-top:6px">* เข้ากันได้ = ผลวิเคราะห์ CV × โครงสร้าง SSM สำหรับตำแหน่ง Site Control (คีย์เวิร์ด · เบื้องต้น)</div></div>`;
  }

  // ---------- เพิ่มผู้สมัครจาก CV ก่อนทำแบบทดสอบ — คำตอบเข้าชื่อนี้เมื่อชื่อ-นามสกุลตรงกันทุกตัวอักษร (ไม่นับเว้นวรรค) ----------
  function vAdd() {
    return `<div class="cd-card cd-add"><h3>+ เพิ่มผู้สมัครจาก CV (ก่อนทำแบบทดสอบ)</h3>
      <p class="sub">เมื่อผู้สมัครส่งแบบทดสอบด้วย <b>ชื่อ-นามสกุลที่ตรงกันทุกตัวอักษร</b> (ไม่นับเว้นวรรค และไม่นับคำนำหน้า นาย / นาง / นางสาว) คำตอบจะเข้ามาอยู่ในชื่อนี้อัตโนมัติ</p>
      <div class="cd-addg"><label class="cd-lab">ชื่อ-นามสกุล *<input id="adName" placeholder="เช่น วิสุธรรม แก้วเกษ"></label>
        <label class="cd-lab">เบอร์โทร<input id="adPhone" inputmode="tel"></label><label class="cd-lab">อีเมล<input id="adEmail" type="email"></label><label class="cd-lab">LINE<input id="adLine"></label>
        ${D.tests.length > 1 ? `<label class="cd-lab">ตำแหน่ง<select id="adTest">${D.tests.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join("")}</select></label>` : ""}
        <label class="cd-lab" style="grid-column:1/-1">ลิงก์ CV ใน Google Drive (ไฟล์หรือโฟลเดอร์)<input id="adCv" type="url" placeholder="https://drive.google.com/…"></label>
        <label class="cd-lab" style="grid-column:1/-1">โน้ต<textarea id="adNote" rows="2"></textarea></label></div>
      <div id="adWarn" class="sub"></div>
      <button class="cd-btn" data-a="add-save">บันทึก</button> <button class="cd-btn ghost" data-a="add-close">ยกเลิก</button></div>`;
  }

  // ---------- วิเคราะห์ความเข้ากันได้เบื้องต้น (CV × โครงสร้าง SSM) — scoring in fit.js ----------
  const fitPct = c => { const r = c.fit && (c.fit.roles || []).find(x => x.k === "sitecontrol"); return r ? r.pct : null; };
  const fitCls = p => p >= 70 ? "ok" : p >= 50 ? "mid" : "low";
  const FIT_TXT = {};   // unsaved CV text per candidate
  const FOLD_KEY = "ssm.cand.fitOpen";   // ย่อ / ขยาย — remembered per browser
  const fitOpen = () => { try { return localStorage.getItem(FOLD_KEY) !== "0"; } catch { return true; } };
  function vFit(c) {
    const m = me(), F = window.CandFit, f = c.fit;
    const txt = FIT_TXT[c.id] ?? c.cv_text ?? "";
    const res = f ? `<div class="cd-fit">
        <div class="cd-fitroles">${(f.roles || []).map(r => `<div class="cd-fitrole${r.k === "sitecontrol" ? " main" : ""}${r.k === f.best ? " best" : ""}"><span>${esc(r.name)}${r.k === f.best ? " ⭐" : ""}</span><div class="cd-fitbar"><i class="${fitCls(r.pct)}" style="width:${Math.max(2, r.pct)}%"></i></div><b>${r.pct}%</b></div>`).join("")}</div>
        <div class="cd-fitmeta"><b>${esc(f.level || "")}</b> · ประสบการณ์ ${f.years !== null && f.years !== undefined ? "≈ " + f.years + " ปี" : "ไม่พบช่วงปีใน CV"}${f.lead ? " · มีประสบการณ์นำทีม" : ""} · วิเคราะห์ ${fmtT(f.at)}${f.by ? " โดย " + esc(f.by) : ""}</div>
        <table class="cd-t"><thead><tr><th>ด้านงานตามโครงสร้าง SSM</th><th class="n">คะแนน</th><th>คำที่พบใน CV</th></tr></thead><tbody>
        ${(f.dims || []).map(d => `<tr><td>${esc(d.name)}</td><td class="n"><span class="cd-fitn ${fitCls(d.score)}">${d.score}</span></td><td>${(d.hits || []).map(h => `<span class="cd-kw">${esc(h)}</span>`).join(" ") || `<span class="sub">ไม่พบ</span>`}</td></tr>`).join("")}</tbody></table>
        ${(f.gaps || []).length ? `<div class="cd-fitgap"><b>❓ ด้านที่ CV ยังไม่แสดง — คำถามแนะนำตอนสัมภาษณ์</b><ul>${f.gaps.map(g => `<li><b>${esc(g.name)}:</b> ${esc(g.ask)}</li>`).join("")}</ul><button class="cd-btn ghost sm" data-a="fit-ask">↳ ใส่ลงช่อง “ข้อกังวลและคำถามสำหรับสัมภาษณ์” ของฉัน</button></div>` : ""}
      </div>` : `<p class="muted">ยังไม่ได้วิเคราะห์</p>`;
    const sc = fitPct(c), open = fitOpen();
    return `<details class="cd-card cd-fold" id="cdFit"${open ? " open" : ""}><summary><h3>🧭 ความเข้ากันได้เบื้องต้น — CV × โครงสร้าง SSM</h3>${sc !== null ? `<span class="cd-fitn ${fitCls(sc)}">Site Control ${sc}%</span>` : `<span class="sub">ยังไม่ได้วิเคราะห์</span>`}<span class="cd-foldt">${open ? "ย่อ ▴" : "ขยาย ▾"}</span></summary>
      <p class="sub">เทียบคำใน CV กับ 7 ด้านงานของ SSM (คุมงานติดตั้ง · Service · วางแผน/Manday · ประสานงาน · เอกสาร/ERP · Safety/SAT · เทคนิค) แล้วให้น้ำหนักตาม 3 บทบาท — ใช้คัดกรองเบื้องต้น ไม่แทนแบบทดสอบและการสัมภาษณ์</p>
      ${res}
      ${m.canEdit ? `<details class="cd-prompt"${f ? "" : " open"}><summary>${f ? "แก้ข้อความ CV / วิเคราะห์ใหม่" : "วางข้อความจาก CV เพื่อวิเคราะห์"}</summary>
        <p class="sub">CV ใน Google Drive: เปิดไฟล์ → “เปิดด้วย Google เอกสาร” (อ่านตัวหนังสือจาก PDF/รูปให้) → คัดลอกทั้งหมดมาวางที่นี่ · ตรวจคำที่อ่านเพี้ยนก่อนกดวิเคราะห์</p>
        <textarea id="cdCv" rows="8" style="width:100%;padding:8px 11px;border:1px solid #d6dae0;border-radius:9px;font:inherit;font-size:13.5px" placeholder="วางข้อความ CV / Resume ที่นี่ — ประวัติงาน ช่วงปี หน้าที่ ทักษะ">${esc(txt)}</textarea>
        <div class="cd-bar" style="margin-top:6px"><button class="cd-btn sm" data-a="fit-run"${F ? "" : " disabled"}>🧭 วิเคราะห์และบันทึก</button>${f ? ` <button class="cd-btn ghost sm danger" data-a="fit-clear">ล้างผล</button>` : ""}<span class="sub" id="cdCvN"></span></div></details>` : f ? "" : `<p class="sub">ดิว / นุ่น เป็นผู้วาง CV เพื่อวิเคราะห์</p>`}</details>`;
  }

  function vCand() {
    const c = D.candidates.find(x => x.id === S.id), m = me();
    if (!c) return `<div class="cd-card">ไม่พบผู้สมัคร (อาจถูกลบแล้ว) <a href="#candidates">กลับ</a></div>`;
    const t = testOf(c), qs = (t.content || {}).questions || [], rb = t.rubric || {}, dims = rb.dimShort || rb.dims || ["ประเด็น", "แผน", "ประสานงาน", "เหตุผลและติดตาม"];
    const mine = myScore(c);
    const others = scoresOf(c);
    const dl = daysLeft(c);
    const sumQ = n => (mine.scores[n] || []).reduce((a, b) => a + (b || 0), 0);
    const total = qs.reduce((a, q) => a + sumQ(q.no), 0);
    const files = (c.files || []).map((f, i) => `<span class="cd-file"><a href="${esc(fileHref(f))}" target="_blank" rel="noopener">${f.url ? "🔗" : "📎"} ${esc(f.name)}</a>${m.canEdit ? ` <button class="cd-x" data-a="rm-file" data-i="${i}" title="เอาออก">×</button>` : ""}</span>`).join("");
    return `<div class="cd-back"><a href="#candidates">← ผู้สมัครทั้งหมด</a></div>
      <div class="cd-card cd-head"><div><div class="sub">${esc(c.position || "")} · ${pending(c) ? "ยังไม่ได้ส่งแบบทดสอบ" : "ส่ง " + fmtT(c.submitted_at)}${dur(c.started_at, c.submitted_at) ? " · ใช้เวลา " + dur(c.started_at, c.submitted_at) : ""}</div><h2>${esc(c.name)}</h2>
          <div class="cd-contact">📞 <a href="tel:${esc(c.phone)}">${esc(c.phone || "")}</a>${c.email ? ` · ✉️ <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}${c.line_id ? ` · LINE ${esc(c.line_id)}` : ""}</div>
          <div class="sub">${pending(c) ? `${chip("รอทำแบบทดสอบ", "s-warn")} สร้างจาก CV ${fmtT(c.submitted_at)}` : `ยินยอม PDPA ${fmtT(c.consent_at)}`}${dl !== null ? ` · <b class="bad">ข้อมูลจะถูกลบใน ${dl} วัน</b>` : ""}</div></div>
        <div class="cd-side">${m.canEdit ? `<label class="cd-lab">สถานะ<select id="cdStatus">${Object.entries(ST).map(([k, [l]]) => `<option value="${k}"${c.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>` : stChip(c)}
          <div class="cd-score"><b>${avg(c) ?? "–"}</b><span>คะแนนเฉลี่ย / 100 · ${others.length} ผู้ประเมิน</span></div>
          <button class="cd-btn ghost sm" data-a="print">🖨 พิมพ์ / PDF</button>${m.canEdit ? ` <button class="cd-btn ghost sm danger" data-a="del">🗑 ลบข้อมูล</button>` : ""}</div></div>
      <div class="cd-card"><h3>📎 CV / Resume / เอกสาร</h3><div class="cd-files">${files || `<span class="muted">ยังไม่มี${m.canEdit ? "" : " — ดิว / นุ่น เป็นผู้แนบ"}</span>`}</div>
        ${m.canEdit ? `<div class="cd-bar"><label class="cd-btn ghost sm">⬆ อัปโหลด PDF / รูป<input type="file" id="cdUp" accept="application/pdf,image/*" multiple hidden></label>
          <input type="url" id="cdLink" placeholder="วางลิงก์ไฟล์ Google Drive (จากโฟลเดอร์ CV)" style="flex:1;min-width:240px"><input type="text" id="cdLinkName" placeholder="ชื่อไฟล์ เช่น CV" style="width:140px"><button class="cd-btn sm" data-a="add-link">+ เพิ่มลิงก์</button>
          <a class="cd-btn ghost sm" href="${DRIVE_FOLDER}" target="_blank" rel="noopener">📁 เปิดโฟลเดอร์ CV</a></div>` : ""}
        ${m.canEdit ? `<div class="cd-addg"><label class="cd-lab">ชื่อ-นามสกุล (ใช้จับคู่กับแบบทดสอบ)<input id="edName" value="${esc(c.name)}"></label><label class="cd-lab">เบอร์โทร<input id="edPhone" value="${esc(c.phone || "")}"></label><label class="cd-lab">อีเมล<input id="edEmail" value="${esc(c.email || "")}"></label><label class="cd-lab">LINE<input id="edLine" value="${esc(c.line_id || "")}"></label></div>
          <label class="cd-lab">โน้ตของทีมสรรหา<textarea id="cdNote" rows="2">${esc(c.note || "")}</textarea></label><button class="cd-btn ghost sm" data-a="save-note">บันทึกชื่อ / ติดต่อ / โน้ต</button>` : c.note ? `<div class="cd-note">${esc(c.note)}</div>` : ""}</div>
      ${vFit(c)}
      ${pending(c) ? `<div class="cd-trial"><div>⏳ <b>ยังไม่ได้ทำแบบทดสอบ</b> — ส่งลิงก์ <b>${esc(location.origin)}/apply/</b> ให้ผู้สมัคร เมื่อเขาส่งด้วยชื่อ-นามสกุล “${esc(c.name)}” (ตรงทุกตัวอักษร ไม่นับเว้นวรรคและคำนำหน้า) คำตอบจะเข้ามาที่หน้านี้อัตโนมัติ</div>${m.canEdit ? `<button class="cd-btn ghost sm" data-a="copy" data-link="${esc(location.origin)}/apply/">📋 คัดลอกลิงก์</button>` : ""}</div>` : ""}
      ${rb.scale ? `<details class="cd-card cd-guide"><summary>📏 วิธีให้คะแนน (สำหรับผู้สัมภาษณ์เท่านั้น)</summary><p>${esc(rb.note || "")}</p><p>ให้คะแนนข้อละ 20 คะแนน แบ่งเป็น 4 ด้าน ด้านละ 5 คะแนน: ${esc((rb.dims || []).join(" · "))}</p><ul>${rb.scale.map(x => `<li>${esc(x)}</li>`).join("")}</ul>${rb.usage ? `<p class="sub">${esc(rb.usage)}</p>` : ""}</details>` : ""}
      ${qs.map(q => { const r = (rb.questions || []).find(x => x.no === q.no) || {}; const sc = mine.scores[q.no] || [];
        return `<div class="cd-card cd-q"><div class="cd-qh"><div><span class="sub">ข้อ ${q.no} · ${q.points || 20} คะแนน</span><h3>${esc(q.title)}</h3></div><div class="cd-qt"><b>${sumQ(q.no)}</b> / 20</div></div>
          <details class="cd-prompt"><summary>ดูโจทย์</summary><p>${esc(q.scenario || "")}</p>${(q.facts || []).length ? `<ul>${q.facts.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}<p><b>${esc(q.ask || "")}</b></p><ol>${(q.parts || []).map(p => `<li>${esc(p)}</li>`).join("")}</ol></details>
          <div class="cd-qbody"><div class="cd-ans">${esc((c.answers || {})[q.no] || "— ไม่ได้ตอบ —")}</div>
            <div class="cd-rub">${r.want ? `<div><b>✅ สิ่งที่ต้องการเห็น</b><p>${esc(r.want)}</p></div>` : ""}${r.probe ? `<div><b>❓ ประเด็นที่ควรถามต่อ</b><p>${esc(r.probe)}</p></div>` : ""}
              <div class="cd-dims">${dims.map((d, i) => `<div class="cd-dim"><span>${esc(d)}</span><div class="cd-pts">${[0, 1, 2, 3, 4, 5].map(v => `<button type="button" class="${sc[i] === v ? "on" : ""}" data-sc="${q.no}" data-d="${i}" data-v="${v}">${v}</button>`).join("")}</div></div>`).join("")}</div></div></div></div>`; }).join("")}
      ${c.ai_note ? `<div class="cd-card"><h3>🤖 การใช้เครื่องมือช่วย / AI (ผู้สมัครระบุ)</h3><div class="cd-ans">${esc(c.ai_note)}</div></div>` : ""}
      <div class="cd-card"><h3>📝 สรุปการประเมินของฉัน — ${total} / 100</h3>
        <label class="cd-lab">จุดแข็งที่มีหลักฐานในคำตอบ<textarea id="cdStr" rows="3">${esc(mine.strengths || "")}</textarea></label>
        <label class="cd-lab">ข้อกังวลและคำถามสำหรับสัมภาษณ์<textarea id="cdCon" rows="3">${esc(mine.concerns || "")}</textarea></label>
        <button class="cd-btn" data-a="save-score">บันทึกคะแนน</button> <span class="sub" id="cdSaved"></span></div>
      ${others.length ? `<div class="cd-card cd-scroll"><h3>คะแนนจากผู้ประเมินทุกคน</h3><table class="cd-t"><thead><tr><th>ผู้ประเมิน</th>${qs.map(q => `<th class="n">ข้อ ${q.no}</th>`).join("")}<th class="n">รวม</th><th>จุดแข็ง</th><th>ข้อกังวล / คำถาม</th></tr></thead><tbody>
        ${others.map(s => `<tr><td>${esc(s.assessor_name || s.assessor)}<div class="sub">${fmtT(s.updated_at)}</div></td>${qs.map(q => `<td class="n">${(s.scores[q.no] || []).reduce((a, b) => a + (b || 0), 0)}</td>`).join("")}<td class="n"><b>${s.total ?? ""}</b></td><td class="pre">${esc(s.strengths || "")}</td><td class="pre">${esc(s.concerns || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="cd-card"><h3>🕓 ประวัติ</h3><div id="cdLog" class="sub">กำลังโหลด…</div></div>`;
  }

  function vTests() {
    const m = me();
    return D.tests.map(t => { const link = location.origin + "/apply/" + (D.tests.length > 1 ? "#" + t.slug : ""); const c = t.content || {};
      return `<div class="cd-card"><div class="cd-qh"><div><span class="sub">${esc(c.rev || "")}</span><h2>${esc(t.title)}</h2></div><div>${t.open ? chip("เปิดรับสมัคร", "s-ok") : chip("ปิดรับสมัคร", "s-off")}</div></div>
        <div class="cd-link"><div><b>ลิงก์สมัคร</b> (ส่งให้ใครก็ได้ ไม่ต้อง login)<div class="cd-url">${esc(link)}</div>
          <button class="cd-btn sm" data-a="copy" data-link="${esc(link)}">📋 คัดลอกลิงก์</button> <a class="cd-btn ghost sm" href="${esc(link)}" target="_blank" rel="noopener">เปิดดูหน้าสมัคร ↗</a>
          ${m.canEdit ? ` <button class="cd-btn ghost sm" data-a="toggle" data-id="${t.id}" data-open="${t.open ? 0 : 1}">${t.open ? "⏸ ปิดรับสมัคร" : "▶ เปิดรับสมัคร"}</button>` : ""}</div>
          <div class="cd-qr" data-qr="${esc(link)}"></div></div>
        <details><summary>ดูคำถาม ${(c.questions || []).length} ข้อ</summary><ol>${(c.questions || []).map(q => `<li><b>${esc(q.title)}</b> — ${esc(q.ask || "")}</li>`).join("")}</ol></details>
        <p class="sub">ผู้สมัครแนบไฟล์ในฟอร์มไม่ได้ — CV / Resume ให้ดิวหรือนุ่นแนบในหน้าผู้สมัคร · ไม่ผ่าน / ถอนตัว ลบอัตโนมัติหลัง ${D.keepDays} วัน · แก้ไขคำถาม: แก้ใน database/candidates.sql แล้วรันใหม่</p></div>`; }).join("") || `<div class="cd-card">ยังไม่มีแบบทดสอบ</div>`;
  }

  function printCand(c) {
    const t = testOf(c), qs = (t.content || {}).questions || [], rb = t.rubric || {}, mine = scoresOf(c).find(s => s.assessor === me().username) || { scores: {} };
    const dims = rb.dimShort || ["ประเด็น", "แผน", "ประสานงาน", "เหตุผลและติดตาม"];
    const w = window.open("", "_blank"); if (!w) return toast("เบราว์เซอร์บล็อกหน้าต่างใหม่", 1);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.name)} · ${esc(c.position || "")}</title><style>body{font-family:system-ui,"IBM Plex Sans Thai",sans-serif;margin:14mm;font-size:11pt;line-height:1.55}h1{font-size:16pt;margin:0}h2{font-size:12.5pt;margin:16px 0 4px;border-bottom:1px solid #999}
      .a{white-space:pre-wrap;border:1px solid #ccc;border-radius:4px;padding:8px}table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #999;padding:4px 6px;text-align:center}.m{color:#555;font-size:9.5pt}</style></head><body>
      <h1>${esc(c.name)}</h1><div class="m">${esc(c.position || "")} · ${esc(c.phone || "")} ${esc(c.email || "")} · ส่ง ${fmtT(c.submitted_at)} · ${(t.content || {}).rev || ""}</div>
      ${qs.map(q => `<h2>ข้อ ${q.no} ${esc(q.title)}</h2><div class="a">${esc((c.answers || {})[q.no] || "")}</div>`).join("")}
      ${c.ai_note ? `<h2>การใช้เครื่องมือช่วย / AI</h2><div class="a">${esc(c.ai_note)}</div>` : ""}
      <h2>แบบบันทึกคะแนน — ผู้ประเมิน ${esc(me().name || "")}</h2><table><tr><th>ข้อ</th>${dims.map(d => `<th>${esc(d)} /5</th>`).join("")}<th>รวม /20</th></tr>
      ${qs.map(q => { const s = mine.scores[q.no] || []; return `<tr><td>${q.no}</td>${dims.map((_, i) => `<td>${s[i] ?? ""}</td>`).join("")}<td>${s.reduce((a, b) => a + (b || 0), 0) || ""}</td></tr>`; }).join("")}</table>
      <p><b>คะแนนรวม ${mine.total ?? "____"} / 100</b></p><h2>จุดแข็งที่มีหลักฐานในคำตอบ</h2><div class="a">${esc(mine.strengths || "")}&nbsp;</div><h2>ข้อกังวลและคำถามสำหรับสัมภาษณ์</h2><div class="a">${esc(mine.concerns || "")}&nbsp;</div>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  let qrP = null;
  const qrLib = () => qrP || (qrP = new Promise((ok, no) => { if (window.qrcode) return ok(window.qrcode); const s = document.createElement("script"); s.src = QR[0]; s.integrity = QR[1]; s.crossOrigin = "anonymous"; s.onload = () => ok(window.qrcode); s.onerror = () => { qrP = null; no(); }; document.head.appendChild(s); }));

  function bind() {
    const on = (id, ev, fn) => { const e = ROOT.querySelector("#" + id); if (e) e.addEventListener(ev, fn); };
    on("cdQ", "input", e => { S.q = e.target.value; draw(); const q = ROOT.querySelector("#cdQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
    on("cdSt", "change", e => { S.st = e.target.value; draw(); });
    on("cdTest", "change", e => { S.test = e.target.value; draw(); });
    on("cdFit", "toggle", e => { const o = e.target.open; try { localStorage.setItem(FOLD_KEY, o ? "1" : "0"); } catch {} const t = e.target.querySelector(".cd-foldt"); if (t) t.textContent = o ? "ย่อ ▴" : "ขยาย ▾"; });
    on("adName", "input", e => { const v = e.target.value, w = ROOT.querySelector("#adWarn"); const hit = nameKey(v).length >= 4 && D.candidates.find(x => sameName(x.name, v));
      w.innerHTML = hit ? `⚠️ มีชื่อนี้แล้ว: <a href="#candidates/c/${hit.id}">${esc(hit.name)}</a>${pending(hit) ? " (รอทำแบบทดสอบ)" : " (ส่งแบบทดสอบแล้ว)"}` : ""; });
    ROOT.querySelectorAll("tr[data-go]").forEach(r => r.addEventListener("click", e => { if (!e.target.closest("a")) location.hash = "#candidates/c/" + r.dataset.go; }));
    ROOT.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => act(b.dataset.a, b.dataset)));
    const c = S.page === "c" && D.candidates.find(x => x.id === S.id);
    if (c) {
      ROOT.querySelectorAll("[data-sc]").forEach(b => b.addEventListener("click", () => {
        const mine = myScore(c); const k = b.dataset.sc; mine.scores[k] = (mine.scores[k] || [null, null, null, null]).slice();
        mine.scores[k][+b.dataset.d] = mine.scores[k][+b.dataset.d] === +b.dataset.v ? null : +b.dataset.v;
        keepText(); draw();
      }));
      on("cdStatus", "change", async e => { const st = e.target.value; let note = "";
        if (["rejected", "withdrawn"].includes(st) && !confirm(`ข้อมูลของ ${c.name} จะถูกลบอัตโนมัติใน ${D.keepDays} วัน — ยืนยัน?`)) { e.target.value = c.status; return; }
        try { await post("status", { id: c.id, status: st, note }); c.status = st; c.status_at = new Date().toISOString(); toast("เปลี่ยนสถานะแล้ว"); draw(); } catch (x) { toast(x.message, 1); } });
      on("cdUp", "change", async e => { const files = (c.files || []).slice();
        try { for (const f of e.target.files) { const pdf = f.type === "application/pdf"; if (!pdf && !/^image\//.test(f.type)) throw new Error(f.name + ": รองรับเฉพาะ PDF หรือรูป"); if (f.size > 4 * 1024 * 1024) throw new Error(f.name + ": ใหญ่เกิน 4 MB");
            const r = await fetch("/api/candidates/upload?c=" + c.id, { method: "POST", headers: { "content-type": pdf ? "application/pdf" : f.type }, body: f }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
            files.push({ p: j.path, name: f.name.slice(0, 120), at: new Date().toISOString(), by: me().name }); }
          await post("files", { id: c.id, files }); c.files = files; toast("แนบไฟล์แล้ว"); draw(); } catch (x) { toast(x.message, 1); } });
      if (!(c.seen_by || []).includes(me().username)) { c.seen_by = [...(c.seen_by || []), me().username]; post("seen", { id: c.id }).catch(() => {}); }
      const lg = ROOT.querySelector("#cdLog");
      if (lg) fetch("/api/candidates/log?c=" + c.id).then(r => r.json()).then(j => { lg.innerHTML = (j.log || []).map(x => `<div class="cd-log"><b>${esc(x.action)}</b> · ${esc(x.by || "")} · ${fmtT(x.at)}${x.detail ? ` — ${esc(x.detail)}` : ""}</div>`).join("") || "ยังไม่มี"; }).catch(() => { lg.textContent = ""; });
    }
    ROOT.querySelectorAll("[data-qr]").forEach(el => qrLib().then(Q => { const q = Q(0, "M"); q.addData(el.dataset.qr); q.make(); el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) + `<div class="sub">สแกนเพื่อสมัคร</div>`; }).catch(() => {}));
  }
  const DRAFT = {};   // unsaved score edits per candidate (kept across re-draws)
  function myScore(c) {
    if (!DRAFT[c.id]) { const s = scoresOf(c).find(x => x.assessor === me().username); DRAFT[c.id] = s ? JSON.parse(JSON.stringify(s)) : { candidate_id: c.id, assessor: me().username, assessor_name: me().name, scores: {}, strengths: "", concerns: "" }; }
    return DRAFT[c.id];
  }
  function keepText() { const c = D.candidates.find(x => x.id === S.id); if (!c) return; const cv = ROOT.querySelector("#cdCv"); if (cv) FIT_TXT[c.id] = cv.value; const m = myScore(c); const a = ROOT.querySelector("#cdStr"), b = ROOT.querySelector("#cdCon"); if (a) m.strengths = a.value; if (b) m.concerns = b.value; }
  async function act(a, ds) {
    const c = D.candidates.find(x => x.id === S.id);
    try {
      if (a === "copy") { await navigator.clipboard.writeText(ds.link).then(() => toast("คัดลอกลิงก์แล้ว"), () => prompt("คัดลอกลิงก์นี้", ds.link)); return; }
      if (a === "toggle") { await post("test", { id: +ds.id, open: ds.open === "1" }); await load(true); return toast(ds.open === "1" ? "เปิดรับสมัครแล้ว" : "ปิดรับสมัครแล้ว"); }
      if (a === "reset") {
        const n = D.candidates.length;
        const t = prompt(`ล้างข้อมูลทดลองทั้งหมด: ผู้สมัคร ${n} คน พร้อมคะแนน โน้ต และไฟล์แนบ — ลบแล้วกู้คืนไม่ได้\nพิมพ์ “ล้างข้อมูล” เพื่อยืนยัน`);
        if (t === null) return; const j = await post("reset", { confirm: t.trim() }); toast(`ล้างแล้ว ${j.deleted} คน`); location.hash = "#candidates"; return load(true);
      }
      if (a === "golive") {
        const n = D.candidates.length;
        if (n && confirm(`ยังมีข้อมูลทดลอง ${n} คน — ล้างก่อนเปิดใช้งานจริงไหม?\n(OK = ล้างแล้วเปิดใช้จริง · Cancel = ไม่เปิดตอนนี้)`)) { const t = prompt("พิมพ์ “ล้างข้อมูล” เพื่อยืนยันการล้าง"); if (t === null) return; await post("reset", { confirm: t.trim() }); }
        else if (n) return;
        if (!confirm("เปิดใช้งานจริง? หลังจากนี้ป้าย “ทดลองระบบ” จะหายจากหน้าสมัคร และล้างข้อมูลทั้งหมดไม่ได้อีก")) return;
        for (const t of D.tests.filter(x => x.trial)) await post("test", { id: t.id, trial: false });
        toast("เปิดใช้งานจริงแล้ว 🚀"); return load(true);
      }
      if (a === "add-open") { S.add = true; draw(); const e = ROOT.querySelector("#adName"); if (e) e.focus(); return; }
      if (a === "add-close") { S.add = false; return draw(); }
      if (a === "add-save") { const v = id => (ROOT.querySelector("#" + id) || {}).value?.trim() || "";
        const name = v("adName"), cv = v("adCv");
        if (nameKey(name).length < 4) return toast("กรอกชื่อ-นามสกุล", 1);
        if (cv && !/^https:\/\/(drive|docs)\.google\.com\//.test(cv)) return toast("ลิงก์ CV ต้องเป็น Google Drive", 1);
        try { const j = await post("create", { name, phone: v("adPhone"), email: v("adEmail"), line_id: v("adLine"), test_id: v("adTest") || null, note: v("adNote"), files: cv ? [{ url: cv, name: "CV (Google Drive)" }] : [] });
          S.add = false; toast("เพิ่มแล้ว — รอผู้สมัครทำแบบทดสอบ"); await load(true); location.hash = "#candidates/c/" + j.id; }
        catch (x) { toast(x.message, 1); }
        return; }
      if (!c) return;
      if (a === "print") return printCand(c);
      if (a === "fit-run") { keepText(); const text = (FIT_TXT[c.id] || "").trim();
        if (text.length < 40) return toast("วางข้อความจาก CV ก่อน (อย่างน้อยสองสามบรรทัด)", 1);
        const j = await post("fit", { id: c.id, cv_text: text, fit: window.CandFit.analyze(text) }); c.cv_text = text; c.fit = j.fit; delete FIT_TXT[c.id];
        toast("วิเคราะห์แล้ว — Site Control " + fitPct(c) + "%"); return draw(); }
      if (a === "fit-clear") { if (!confirm("ล้างผลวิเคราะห์และข้อความ CV ที่วางไว้?")) return; await post("fit", { id: c.id, cv_text: "", fit: null }); c.cv_text = null; c.fit = null; delete FIT_TXT[c.id]; return draw(); }
      if (a === "fit-ask") { keepText(); const m = myScore(c), add = (c.fit.gaps || []).map(g => "• " + g.ask).join("\n");
        if ((m.concerns || "").includes(add)) return toast("ใส่ไว้แล้ว"); m.concerns = [m.concerns, "จากผลวิเคราะห์ CV:\n" + add].filter(Boolean).join("\n"); draw(); const e = ROOT.querySelector("#cdCon"); if (e) e.scrollIntoView({ block: "center" }); return toast("ใส่คำถามแล้ว — กด “บันทึกคะแนน” เพื่อเก็บ"); }
      if (a === "save-score") { keepText(); const m = myScore(c); const j = await post("score", { id: c.id, scores: m.scores, strengths: m.strengths, concerns: m.concerns });
        D.scores = D.scores.filter(s => !(s.candidate_id === c.id && s.assessor === me().username)).concat(j.score); delete DRAFT[c.id]; toast("บันทึกคะแนนแล้ว"); return draw(); }
      if (a === "save-note") { const v = id => ROOT.querySelector("#" + id).value.trim();
        const body = { id: c.id, note: ROOT.querySelector("#cdNote").value, name: v("edName"), phone: v("edPhone"), email: v("edEmail"), line_id: v("edLine") };
        await post("note", body); Object.assign(c, { note: body.note, name: body.name.replace(/\s+/g, " "), phone: body.phone.replace(/[^\d+]/g, ""), email: body.email.toLowerCase(), line_id: body.line_id }); toast("บันทึกแล้ว"); return draw(); }
      if (a === "add-link") { const url = ROOT.querySelector("#cdLink").value.trim(), name = ROOT.querySelector("#cdLinkName").value.trim() || "CV";
        if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) return toast("ใส่ลิงก์ Google Drive (https://drive.google.com/…)", 1);
        const files = (c.files || []).concat({ url, name, at: new Date().toISOString(), by: me().name }); await post("files", { id: c.id, files }); c.files = files; toast("เพิ่มลิงก์แล้ว"); return draw(); }
      if (a === "rm-file") { if (!confirm("เอาไฟล์นี้ออก?")) return; const files = (c.files || []).filter((_, i) => i !== +ds.i); await post("files", { id: c.id, files }); c.files = files; return draw(); }
      if (a === "del") { if (!confirm(`ลบข้อมูลของ ${c.name} ทั้งหมดถาวร (คำตอบ คะแนน ไฟล์)? ใช้เมื่อผู้สมัครขอให้ลบ`)) return; await post("delete", { id: c.id }); D.candidates = D.candidates.filter(x => x.id !== c.id); toast("ลบแล้ว"); location.hash = "#candidates"; }
    } catch (x) { toast(x.message, 1); }
  }

  const CSS = `
.cd-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 14px}.cd-tabs a{padding:8px 15px;border-radius:999px;border:1px solid var(--line,#e3e6ea);text-decoration:none;color:inherit;font-size:13.5px;background:#fff}
.cd-tabs a.on{background:var(--rak);color:#fff;border-color:var(--rak)}.cd-dot{background:#c92a2a;color:#fff;border-radius:999px;padding:0 6px;font-size:11px}.cd-role{margin-left:auto;font-size:12px;color:var(--rak-dark);background:var(--blush);border-radius:999px;padding:4px 10px}
.cd-card{background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:14px;padding:16px 18px;margin-bottom:14px}.cd-card h2{margin:2px 0 6px;font-size:21px}.cd-card h3{margin:0 0 10px;font-size:15px}
.cd-err,.bad{color:#c92a2a}.muted{color:#8a9099}.sub{font-size:12px;color:#8a9099}.pre{white-space:pre-wrap;text-align:left!important;font-size:12.5px;max-width:280px}
.cd-note{background:var(--blush);border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:13px}
.cd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}.cd-tile{display:grid;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:14px;padding:12px 14px}
.cd-tile i{grid-row:span 2;font-style:normal;font-size:20px;width:40px;height:40px;display:grid;place-items:center;background:var(--blush);border-radius:12px}.cd-tile b{font-size:23px;line-height:1}.cd-tile span{font-size:12px;color:#6b7280}.t-new b{color:var(--rak)}.t-warn b{color:#d9480f}.t-ok b{color:#2b8a3e}
.cd-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.cd-bar input,.cd-bar select,.cd-lab select,.cd-lab textarea{padding:8px 11px;border:1px solid #d6dae0;border-radius:9px;font:inherit;font-size:13.5px;background:#fff}.cd-bar input[type=search]{flex:1 1 260px;max-width:420px}
.cd-btn{display:inline-block;padding:8px 15px;border-radius:9px;border:1px solid var(--rak);background:var(--rak);color:#fff;font:inherit;font-size:13.5px;cursor:pointer;text-decoration:none;white-space:nowrap}.cd-btn:hover{background:var(--rak-dark)}
.cd-btn.ghost{background:#fff;color:var(--ink,#1f2328);border-color:#d6dae0}.cd-btn.ghost:hover{background:var(--blush);border-color:var(--rak-line)}.cd-btn.sm{padding:5px 11px;font-size:12.5px}.cd-btn.danger{color:#c92a2a}
.cd-chip{display:inline-block;font-size:11.5px;padding:2px 9px;border-radius:999px;white-space:nowrap}.s-new{background:var(--blush);color:var(--rak)}.s-ok{background:#ebfbee;color:#2b8a3e}.s-loan{background:#e7f5ff;color:#1c7ed6}.s-cal{background:#f3f0ff;color:#6741d9}.s-warn{background:#fff4e6;color:#d9480f}.s-off{background:#f1f3f5;color:#6b7280}
.cd-t{width:100%;border-collapse:collapse;font-size:13.5px;min-width:0}.cd-t th,.cd-t td{padding:9px 8px;border-bottom:1px solid #f1f3f5;text-align:left;vertical-align:top}.cd-t thead th{font-size:12px;color:#6b7280;background:var(--blush);font-weight:600;white-space:nowrap}.cd-t .n{text-align:right}
.cd-t tbody tr[data-go]{cursor:pointer}.cd-t tbody tr[data-go]:hover{background:#fafbfc}.cd-t tr.new td:first-child{box-shadow:inset 3px 0 0 var(--rak)}.cd-t a{color:inherit;text-decoration:none}.cd-scroll{overflow:auto}
.cd-back{margin-bottom:10px}.cd-back a{color:var(--rak);text-decoration:none}
.cd-head{display:flex;gap:18px;justify-content:space-between;flex-wrap:wrap}.cd-contact{margin:4px 0}.cd-contact a{color:inherit}.cd-side{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.cd-score{text-align:right}.cd-score b{font-size:30px;color:var(--rak);display:block;line-height:1.1}.cd-score span{font-size:12px;color:#6b7280}
.cd-lab{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:#6b7280;margin:8px 0}.cd-lab textarea{width:100%;color:var(--ink,#1f2328)}
.cd-files{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.cd-file{background:#f6f7f9;border-radius:8px;padding:6px 10px;font-size:13px}.cd-file a{color:inherit}.cd-x{border:0;background:none;color:#c92a2a;cursor:pointer;font-size:15px}
.cd-guide summary,.cd-prompt summary{cursor:pointer;color:var(--rak);font-size:13px}.cd-prompt{margin:6px 0 10px;font-size:13.5px;background:#fafbfc;border-radius:10px;padding:8px 12px}
.cd-q{border-left:4px solid var(--rak)}.cd-qh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.cd-qh h3{margin:2px 0 4px}.cd-qt{font-size:13px;color:#6b7280}.cd-qt b{font-size:22px;color:var(--rak)}
.cd-qbody{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:16px}@media(max-width:900px){.cd-qbody{grid-template-columns:1fr}}
.cd-ans{white-space:pre-wrap;font-size:14px;line-height:1.7;background:#fafbfc;border:1px solid #f0f1f3;border-radius:10px;padding:12px 14px;max-height:560px;overflow:auto}
.cd-rub{font-size:13px;display:flex;flex-direction:column;gap:10px}.cd-rub p{margin:2px 0 0;color:#4b5563}
.cd-dims{display:flex;flex-direction:column;gap:8px;background:var(--blush);border-radius:10px;padding:10px 12px}.cd-dim span{display:block;font-size:12.5px;margin-bottom:3px}
.cd-pts{display:flex;gap:4px}.cd-pts button{flex:1;min-width:30px;padding:6px 0;border:1px solid #d6dae0;background:#fff;border-radius:8px;font:inherit;font-size:13.5px;cursor:pointer}.cd-pts button.on{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}
.cd-link{display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:10px 0}.cd-url{font:13px ui-monospace,monospace;background:#f6f7f9;border-radius:8px;padding:8px 10px;margin:6px 0 8px;word-break:break-all}
.cd-qr{width:150px;text-align:center}.cd-qr svg{width:150px;height:150px}
.cd-trial{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#fff4e6;border:1px solid #ffd8a8;color:#a14b00;border-radius:12px;padding:10px 14px;margin-bottom:14px;font-size:13.5px}
.cd-log{padding:5px 0;border-bottom:1px solid #f1f3f5}
.cd-fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.cd-fold>summary::-webkit-details-marker{display:none}.cd-fold>summary h3{margin:0}.cd-fold[open]>summary{margin-bottom:10px}
.cd-foldt{margin-left:auto;font-size:12.5px;color:var(--rak);border:1px solid var(--rak-line);border-radius:8px;padding:3px 10px;background:#fff}.cd-fold>summary:hover .cd-foldt{background:var(--blush)}
.cd-addg{display:grid;align-items:end;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:4px 12px}.cd-addg input,.cd-addg select{padding:8px 11px;border:1px solid #d6dae0;border-radius:9px;font:inherit;font-size:13.5px;color:var(--ink,#1f2328)}.cd-add{border-left:4px solid var(--rak)}#adWarn{color:#d9480f;margin:4px 0 8px}
.cd-fit{display:flex;flex-direction:column;gap:12px;margin:8px 0}.cd-fitroles{display:flex;flex-direction:column;gap:7px}.cd-fitrole{display:grid;grid-template-columns:minmax(150px,240px) 1fr 52px;gap:10px;align-items:center;font-size:13.5px}.cd-fitrole.main span{font-weight:600}.cd-fitrole b{text-align:right}
.cd-fitbar{height:10px;background:#f1f3f5;border-radius:999px;overflow:hidden}.cd-fitbar i{display:block;height:100%;border-radius:999px}.cd-fitbar i.ok{background:#2b8a3e}.cd-fitbar i.mid{background:#f08c00}.cd-fitbar i.low{background:#adb5bd}
.cd-fitn{display:inline-block;min-width:34px;text-align:center;font-weight:600;font-size:12.5px;padding:1px 7px;border-radius:999px}.cd-fitn.ok{background:#ebfbee;color:#2b8a3e}.cd-fitn.mid{background:#fff4e6;color:#d9480f}.cd-fitn.low{background:#f1f3f5;color:#6b7280}
.cd-fitmeta{font-size:13px;color:#4b5563}.cd-kw{display:inline-block;background:var(--blush);color:var(--rak);border-radius:6px;padding:1px 7px;font-size:12px;margin:1px 0}
.cd-fitgap{background:#fffbea;border:1px solid #ffe8a3;border-radius:10px;padding:10px 14px;font-size:13px}.cd-fitgap ul{margin:6px 0 8px;padding-left:20px}@media(max-width:640px){.cd-fitrole{grid-template-columns:1fr 46px}.cd-fitbar{grid-column:1/-1;grid-row:2}}
.cd-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1f2328;color:#fff;padding:10px 16px;border-radius:10px;z-index:300;font-size:13.5px}.cd-toast.bad{background:#c92a2a}
`;

  window.Candidates = {
    mount(el, sub) {
      if (!document.getElementById("cdCss")) { const s = document.createElement("style"); s.id = "cdCss"; s.textContent = CSS; document.head.appendChild(s); }
      ROOT = el; const parts = String(sub || "").split("/");
      S.page = parts[0] === "c" ? "c" : parts[0] === "tests" ? "tests" : ""; S.id = S.page === "c" ? +parts[1] || 0 : 0;
      draw(); load(S.page === "c" ? false : true);
      if (S.page === "c") scrollTo(0, 0);
    },
  };
})();
