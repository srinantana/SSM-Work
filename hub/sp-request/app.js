/* SSM Work · ขอคน (Service Plan manpower requests, trial) — shared by Service Plan and Manpower.
   window.SPRequest: load(force) · page(el, onChange) · openList(onChange) · open(id, onChange) · form(onChange)
   API /api/service-plan/req/{list,avail,create,decide,cancel} (hub/middleware.js). The requester is the signed-in user.
   Availability comes from the Manpower plan: f ว่าง · a มีคำขออื่นรอ PC · h ติดจอง · b มีงานยืนยันแล้ว · o ลา / วันหยุด.
   Confirm / Reject: ดิว and กอล์ฟ for everyone, โจ้ for unit EE only (canApprove + approveUnits from the API); ขอคน only
   for the people the API allows (canRequest). Sundays / holidays are bookable (7 days); only leave blocks a day. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TYPES = ["IS", "SO", "IN", "WR", "IJ", "JO"];
  const UNITS = ["ME", "PP", "EE", "PC", "SC"];
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const DS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  const PST = { pending: ["รอ PC", "p"], confirmed: ["Confirm", "c"], rejected: ["ไม่อนุมัติ", "r"], cancelled: ["ยกเลิก", "x"] };
  const AV = { f: "ว่าง", a: "มีคำขออื่นรอ PC", h: "ติดจอง", b: "มีงานยืนยันแล้ว", o: "ลา" };
  const dt = k => new Date(k + "T00:00:00");
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const addD = (k, n) => { const d = dt(k); d.setDate(d.getDate() + n); return iso(d); };
  const fmt = k => { const d = dt(k); return `${d.getDate()} ${MS[d.getMonth()]}`; };
  const fmtR = (a, b) => a === b ? `${fmt(a)} ${dt(a).getFullYear()}` : `${fmt(a)} – ${fmt(b)} ${dt(b).getFullYear()}`;
  const who = p => p.nick || String(p.name || "").split(" ")[0];

  let L = null, LOADING = null, VIEW = null;

  async function call(path, body) {
    const r = await fetch("/api/service-plan/req/" + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error === "no_table" ? "ยังไม่ได้สร้างตารางคำขอใน Supabase (database/service_plan_requests.sql)" : d.error || "ผิดพลาด " + r.status); e.status = r.status; throw e; }
    return d;
  }
  function load(force) {
    if (L && !force) return Promise.resolve(L);
    if (!LOADING) LOADING = call("list").then(d => { L = d; return d; }).finally(() => { LOADING = null; });
    return LOADING;
  }
  // overall status of a request, from its people
  function status(r) {
    if (r.cancelled) return ["ยกเลิก", "x"];
    const n = s => r.people.filter(p => p.status === s).length, p = n("pending"), c = n("confirmed"), j = n("rejected");
    if (p && !c && !j) return ["รอ PC", "p"];
    if (p) return ["Confirm บางส่วน · รอ PC", "m"];
    if (c && j) return ["Confirm บางส่วน", "m"];
    return c ? ["Confirm", "c"] : ["ไม่อนุมัติ", "r"];
  }
  const subject = r => [r.type, r.customer, r.job_name].filter(Boolean).join(" | ");
  const pending = () => L ? L.requests.filter(r => !r.cancelled && r.people.some(p => p.status === "pending")) : [];

  function css() {
    if (document.getElementById("sprCss")) return;
    const s = document.createElement("style"); s.id = "sprCss"; s.textContent = CSS; document.head.appendChild(s);
  }
  function modal(html, wide) {
    css();
    const el = document.createElement("div");
    el.className = "spr-modal";
    el.innerHTML = `<div class="spr-dlg${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { el.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { const all = document.querySelectorAll(".spr-modal"); if (e.key === "Escape" && all[all.length - 1] === el) close(); };
    el.addEventListener("mousedown", e => { if (e.target === el) close(); });
    el.addEventListener("click", e => { if (e.target.closest(".spr-x")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(el);
    return { el, close };
  }

  /* ---------- list ---------- */
  function listHtml() {
    const me = L.me.username, f = VIEW || (L.canApprove ? "wait" : "mine");
    const sets = { wait: pending(), mine: L.requests.filter(r => r.requested_by === me), all: L.requests };
    const rows = sets[f] || [];
    const tab = (k, t) => `<button type="button" data-f="${k}" class="${f === k ? "on" : ""}">${t} <b>${sets[k].length}</b></button>`;
    return `<div class="spr-top"><div class="spr-tabs">${tab("wait", "รอ Confirm")}${tab("mine", "คำขอของฉัน")}${tab("all", "ทั้งหมด")}</div>
      ${L.canRequest ? `<button type="button" class="spr-btn pri" data-new>+ ขอคน</button>` : ""}</div>
      <p class="spr-hint">${L.canApprove ? "คุณมีสิทธิ์ <b>Confirm / Reject</b> คำขอ" + (L.approveUnits ? " เฉพาะช่างไฟฟ้า (" + L.approveUnits.join(", ") + ")" : " ทุกคน") : L.canRequest ? "ส่งคำขอแล้วรอ Confirm (กอล์ฟ · โจ้ สำหรับช่างไฟฟ้า) · ผู้ขอ = ชื่อที่ login: <b>" + esc(L.me.name) + "</b>" : "บัญชีนี้ดูคำขอได้อย่างเดียว (ยังไม่มีสิทธิ์ขอคน)"}</p>
      ${rows.length ? `<div class="spr-list">${rows.map(card).join("")}</div>` : `<div class="spr-empty">${f === "wait" ? "ไม่มีคำขอรอ Confirm" : f === "mine" ? "ยังไม่มีคำขอของคุณ" : "ยังไม่มีคำขอ"}</div>`}`;
  }
  function card(r) {
    const [t, c] = status(r), sw = r.people.some(p => p.mode === "swap" && p.status === "pending");
    return `<button type="button" class="spr-card st-${c}" data-open="${r.id}">
      <span class="spr-row"><b>${esc(r.req_no)}</b><span class="spr-pill st-${c}">${esc(t)}</span>${sw ? `<span class="spr-pill sw">ขอสลับคน</span>` : ""}<span class="spr-when">📅 ${esc(fmtR(r.date_from, r.date_to))}</span></span>
      <span class="spr-sub">${esc(subject(r))}${r.job_no ? " | " + esc(r.job_no) : ""}</span>
      <span class="spr-ppl">${r.people.map(p => `<i class="st-${PST[p.status][1]}" title="${esc(p.name + " · " + PST[p.status][0])}">${p.is_leader ? "★ " : ""}${esc(who(p))}</i>`).join("")}</span>
      <span class="spr-by">ผู้ขอ ${esc(r.requested_name || r.requested_by)}${r.vehicle ? " · 🚗 " + esc(r.vehicle) : ""}</span></button>`;
  }
  function bindList(box, onChange) {
    const redraw = () => { box.innerHTML = listHtml(); };
    box.onclick = e => {
      const f = e.target.closest("[data-f]"); if (f) { VIEW = f.dataset.f; return redraw(); }
      if (e.target.closest("[data-new]")) return form(() => { redraw(); onChange && onChange(); });
      const o = e.target.closest("[data-open]"); if (o) return open(+o.dataset.open, () => { redraw(); onChange && onChange(); });
    };
    redraw();
  }
  async function page(el, onChange) {
    css();
    el.innerHTML = `<div class="spr-empty">กำลังโหลดคำขอ…</div>`;
    try { await load(true); } catch (err) { el.innerHTML = `<div class="spr-empty err">${esc(err.message)}</div>`; return; }
    if (document.body.contains(el)) bindList(el, onChange);
  }
  async function openList(onChange) {
    const m = modal(`<header><h3>คำขอคน <small>ทดลองใช้</small></h3><button type="button" class="spr-x" aria-label="ปิด">✕</button></header><div class="spr-body" id="sprLB"><div class="spr-empty">กำลังโหลด…</div></div>`, true);
    const box = m.el.querySelector("#sprLB");
    try { await load(true); bindList(box, onChange); } catch (err) { box.innerHTML = `<div class="spr-empty err">${esc(err.message)}</div>`; }
  }

  /* ---------- detail + Confirm / Reject ---------- */
  async function open(id, onChange) {
    try { await load(); } catch (err) { return void modal(`<header><h3>คำขอคน</h3><button type="button" class="spr-x">✕</button></header><div class="spr-body"><div class="spr-empty err">${esc(err.message)}</div></div>`); }
    let r = L.requests.find(x => x.id === id);
    if (!r) { await load(true).catch(() => {}); r = L.requests.find(x => x.id === id); }
    if (!r) return;
    const m = modal("", true);
    const draw = msg => {
      r = L.requests.find(x => x.id === id) || r;
      const inScope = p => !L.approveUnits || L.approveUnits.includes(p.unit);
      const [t, c] = status(r), allPend = r.people.filter(p => p.status === "pending"), can = L.canApprove && !r.cancelled, pend = allPend.filter(inScope);
      const mine = r.requested_by === L.me.username, anyC = r.people.some(p => p.status === "confirmed");
      const conf = p => (p.conflicts || []).length ? `<details class="spr-cf"><summary>${p.mode === "swap" ? "⚠ งานชน" : "มีคำขออื่นซ้อน"} ${(p.conflicts || []).length} วัน (ตอนส่งคำขอ)</summary><ul>${p.conflicts.map(x => `<li><b>${esc(fmt(x.day))}</b> <span class="av-${esc(x.s)}">${esc(AV[x.s] || "")}</span> ${esc(x.t)}</li>`).join("")}</ul></details>` : "";
      m.el.querySelector(".spr-dlg").innerHTML = `<header class="st-${c}"><div><span class="spr-pill st-${c}">${esc(t)}</span> <span class="spr-pill ty">${esc(r.type)}</span> <small>${esc(r.req_no)}</small><h3>${esc(subject(r))}</h3></div><button type="button" class="spr-x" aria-label="ปิด">✕</button></header>
        <div class="spr-body">
          <dl class="spr-dl"><dt>ลูกค้า</dt><dd>${esc(r.customer)}</dd><dt>ชื่องาน</dt><dd>${esc(r.job_name)}</dd>${r.job_no ? `<dt>เลขงาน</dt><dd>${esc(r.job_no)}</dd>` : ""}
            <dt>ช่วงวัน</dt><dd>${esc(fmtR(r.date_from, r.date_to))}</dd><dt>ทะเบียนรถ</dt><dd><b>${esc(r.vehicle || "–")}</b></dd>
            ${r.description ? `<dt>รายละเอียด</dt><dd class="pre">${esc(r.description)}</dd>` : ""}
            <dt>ผู้ขอ</dt><dd>${esc(r.requested_name || r.requested_by)} · ${esc(new Date(r.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }))}</dd></dl>
          <h4>คนที่ขอ (${r.people.length})</h4>
          <div class="spr-plist">${r.people.map(p => `<div class="spr-p st-${PST[p.status][1]}">
            <div class="spr-pn"><b>${p.is_leader ? "★ " : ""}${esc(who(p))}</b> <span>${esc(p.name)} · ${esc(p.unit)}${p.is_leader ? " · หัวหน้าทีม (SS)" : ""}</span>
              <span class="spr-pill ${p.mode === "swap" ? "sw" : "bk"}">${p.mode === "swap" ? "ขอสลับคน" : "ขอจอง (ว่าง)"}</span><span class="spr-pill st-${PST[p.status][1]}">${PST[p.status][0]}</span></div>
            ${p.reason ? `<div class="spr-rs">เหตุผลที่ขอสลับ: ${esc(p.reason)}</div>` : ""}${conf(p)}
            ${p.decided_at && p.status !== "pending" ? `<div class="spr-by">${PST[p.status][0]} โดย ${esc(p.decided_name || p.decided_by || "")} · ${esc(new Date(p.decided_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }))}${p.decision_note ? " · " + esc(p.decision_note) : ""}</div>` : ""}
            ${can && p.status === "pending" && inScope(p) ? `<div class="spr-pa"><button type="button" class="spr-btn ok" data-act="confirm" data-id="${p.id}">✓ Confirm</button><button type="button" class="spr-btn no" data-act="reject" data-id="${p.id}">✕ Reject</button></div>` : ""}</div>`).join("")}</div>
          ${can && pend.length ? `<div class="spr-act"><input id="sprNote" placeholder="หมายเหตุถึงผู้ขอ (ถ้ามี)" maxlength="300">
            ${pend.length > 1 ? `<button type="button" class="spr-btn ok" data-act="confirm" data-id="all">✓ Confirm ทั้ง ${pend.length} คน${L.approveUnits ? " (ช่างไฟฟ้า)" : ""}</button><button type="button" class="spr-btn no" data-act="reject" data-id="all">✕ Reject ทั้งหมด</button>` : ""}
            <small>Confirm แล้วระบบจะลงงาน Service ใน Manpower board ให้ทันที (ทุกวันในช่วง รวมวันอาทิตย์ / วันหยุด ยกเว้นวันลา)${pend.some(p => p.mode === "swap") ? " · <b>คำขอสลับ: งานเดิมของคนนั้นในวันดังกล่าวจะถูกแทนที่</b> (เก็บไว้ในประวัติการแก้ไข)" : ""}</small></div>` : ""}
          ${allPend.length && !pend.length ? `<p class="spr-hint">รอ Confirm — กอล์ฟ (ทุกคน) · โจ้ (เฉพาะช่างไฟฟ้า)</p>` : ""}
          ${(mine || L.canApprove) && !r.cancelled && !anyC && allPend.length ? `<button type="button" class="spr-link" data-cancel>ยกเลิกคำขอนี้</button>` : ""}
          <div class="spr-msg" role="status">${msg || ""}</div></div>`;
    };
    draw();
    m.el.addEventListener("click", async e => {
      const b = e.target.closest("[data-act]"), cx = e.target.closest("[data-cancel]");
      if (!b && !cx) return;
      const msg = m.el.querySelector(".spr-msg"), note = (m.el.querySelector("#sprNote") || {}).value || "";
      m.el.querySelectorAll("button[data-act],[data-cancel]").forEach(x => { x.disabled = true; });
      msg.textContent = "กำลังบันทึก…";
      try {
        let done;
        if (cx) { await call("cancel", { id }); done = "ยกเลิกคำขอแล้ว"; }
        else {
          const ids = b.dataset.id === "all" ? r.people.filter(p => p.status === "pending" && (!L.approveUnits || L.approveUnits.includes(p.unit))).map(p => p.id) : [+b.dataset.id];
          const res = await call("decide", { ids, action: b.dataset.act, note });
          done = b.dataset.act === "confirm" ? `Confirm แล้ว ${res.done} คน · ลง Manpower ${res.cells} ช่อง${res.replaced ? " (แทนที่งานเดิม " + res.replaced + " ช่อง)" : ""}` : `Reject แล้ว ${res.done} คน`;
        }
        await load(true); draw(esc(done)); onChange && onChange();
      } catch (err) { await load(true).catch(() => {}); draw(`<span class="err">${esc(err.message)}</span>`); }
    });
  }

  /* ---------- new request ---------- */
  function form(onChange) {
    return load().then(() => L.canRequest ? buildForm(onChange) : void modal(`<header><h3>+ ขอคน</h3><button type="button" class="spr-x">✕</button></header><div class="spr-body"><div class="spr-empty">บัญชีนี้ยังไม่มีสิทธิ์ขอคน — ผู้ที่ขอได้: ดิว อิ๋ม ปุ๋ม หนุ่ม สปาย อาร์ต แพรวา ไอซ์ ซี กอล์ฟ โจ้<br>ติดต่อดิว (SSM) เพื่อเพิ่มสิทธิ์</div></div>`), err => void modal(`<header><h3>+ ขอคน</h3><button type="button" class="spr-x">✕</button></header><div class="spr-body"><div class="spr-empty err">${esc(err.message)}</div></div>`));
  }
  function buildForm(onChange) {
    const F = { people: new Map(), tab: "day", day: "all", free: true, person: "", av: null, key: "", unit: "" };
    const t0 = iso(new Date());
    const m = modal(`<header><h3>+ ขอคน <small>ทดลองใช้</small></h3><button type="button" class="spr-x" aria-label="ปิด">✕</button></header>
      <form class="spr-body spr-form" novalidate>
        <p class="spr-hint">ผู้ขอ: <b>${esc(L ? L.me.name : "")}</b> (ตามชื่อที่ login) · ขอได้ครบ 7 วัน รวมวันอาทิตย์และวันหยุด</p>
        <div class="spr-grid">
          <label>ประเภท<select name="type" required>${TYPES.map(t => `<option>${t}</option>`).join("")}</select></label>
          <label class="w2">ชื่อลูกค้า<input name="customer" required maxlength="120" list="sprCust" autocomplete="off"><datalist id="sprCust">${(L ? L.customers : []).map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
          <label class="w3">ชื่องาน<input name="job_name" required maxlength="160" placeholder="เช่น PM ประจำปี Line 2 / ซ่อมปั๊ม"></label>
          <label><span>เลขงาน <small>(ถ้ามี)</small></span><input name="job_no" maxlength="40"></label>
          <label>ตั้งแต่วันที่<input type="date" name="from" required min="${addD(t0, -30)}" value="${t0}"></label>
          <label>ถึงวันที่<input type="date" name="to" required value="${t0}"></label>
          <label class="w2">ทะเบียนรถ<select name="veh"><option value="">— ยังไม่ระบุ / ไม่ใช้รถ —</option>${(L ? L.vehicles : []).map(v => `<option>${esc(v)}</option>`).join("")}<option value="__other">อื่น ๆ (พิมพ์เอง)</option></select><input name="veh2" maxlength="60" placeholder="พิมพ์ทะเบียนรถ" hidden></label>
          <label class="w3"><span>รายละเอียดงาน <small>(ถ้ามี)</small></span><textarea name="description" rows="2" maxlength="2000"></textarea></label>
        </div>
        <h4>เลือกคน</h4>
        <div id="sprPick"><div class="spr-empty">เลือกช่วงวันก่อน</div></div>
        <h4>คนที่เลือก <span id="sprN"></span></h4>
        <div id="sprSel"></div>
        <div class="spr-foot"><div class="spr-msg" role="status"></div><button type="submit" class="spr-btn pri">ส่งคำขอให้ PC Confirm</button></div>
      </form>`, true);
    const f = m.el.querySelector("form"), pick = m.el.querySelector("#sprPick"), sel = m.el.querySelector("#sprSel"), msg = m.el.querySelector(".spr-msg");
    const rng = () => ({ a: f.from.value, b: f.to.value });
    // state of worker w in the requested range
    const sub = w => { const { a, b } = rng(), i = F.av.days.indexOf(a), j = F.av.days.indexOf(b); return { i, c: w.c.slice(i, j + 1) }; };
    const cat = w => { const c = sub(w).c; return !/[^o]/.test(c) ? "o" : /b/.test(c) ? "b" : /h/.test(c) ? "h" : /a/.test(c) ? "a" : "f"; };
    const cnt = (c, ch) => c.split(ch).length - 1;
    const strip = (w, lo, hi, big) => { const { a, b } = rng(); let h = ""; for (let i = lo; i <= hi; i++) { const d = F.av.days[i], s = w.c[i], inR = d >= a && d <= b; h += `<i class="av-${s}${inR ? " in" : ""}" title="${esc(DS[dt(d).getDay()] + " " + fmt(d) + " · " + AV[s] + (w.t[i] ? ": " + w.t[i] : ""))}">${big ? dt(d).getDate() : ""}</i>`; } return `<span class="spr-strip${big ? " big" : ""}">${h}</span>`; };
    const sum = w => { const c = sub(w).c, n = c.length - cnt(c, "o"), fr = cnt(c, "f") + cnt(c, "a"); const k = cat(w); return k === "o" ? "ลาตลอดช่วง" : k === "f" ? `ว่างครบ ${n} วัน` : k === "a" ? `ว่าง ${n} วัน · มีคำขออื่นรออยู่` : `ว่าง ${fr}/${n} วัน · ${cnt(c, "b") ? "ชนงาน " + cnt(c, "b") + " วัน" : ""}${cnt(c, "b") && cnt(c, "h") ? " · " : ""}${cnt(c, "h") ? "ติดจอง " + cnt(c, "h") + " วัน" : ""}`; };
    const addBtn = w => cat(w) === "o" ? `<button type="button" class="spr-add" disabled>ไม่ว่าง</button>` : F.people.has(w.id) ? `<button type="button" class="spr-add on" data-rm="${esc(w.id)}">✓ เลือกแล้ว</button>` : `<button type="button" class="spr-add" data-add="${esc(w.id)}">${"hb".includes(cat(w)) ? "+ ขอสลับ" : "+ เลือก"}</button>`;

    function drawPick() {
      const { a, b } = rng();
      if (!F.av) return;
      const i0 = F.av.days.indexOf(a), i1 = F.av.days.indexOf(b), n = i1 - i0 + 1;
      const tabs = `<div class="spr-tabs sm"><button type="button" data-tab="day" class="${F.tab === "day" ? "on" : ""}">ตามวัน — ใครว่างบ้าง</button><button type="button" data-tab="person" class="${F.tab === "person" ? "on" : ""}">ตามคน — ว่างวันไหน</button></div>`;
      const legend = `<div class="spr-lg">${Object.keys(AV).map(k => `<span><i class="av-${k}"></i>${AV[k]}</span>`).join("")}</div>`;
      if (F.tab === "person") {
        const w = F.av.workers.find(x => x.id === F.person);
        const opts = UNITS.map(u => `<optgroup label="${u}">${F.av.workers.filter(x => x.unit === u).map(x => `<option value="${esc(x.id)}" ${x.id === F.person ? "selected" : ""}>${esc((x.nick ? x.nick + " · " : "") + x.name)}</option>`).join("")}</optgroup>`).join("");
        let body = `<div class="spr-empty">เลือกชื่อเพื่อดูว่าคนนี้ว่างวันไหน</div>`;
        if (w) {
          // weeks (Mon–Sun) of the whole window; requested days are outlined
          let cal = `<div class="spr-cal"><div class="spr-ch">${["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map(x => `<span>${x}</span>`).join("")}</div><div class="spr-cg">`;
          for (let k = 0; k < (dt(F.av.days[0]).getDay() + 6) % 7; k++) cal += `<i class="pad"></i>`;
          F.av.days.forEach((d, i) => { const s = w.c[i], inR = d >= a && d <= b, dd = dt(d); cal += `<i class="av-${s}${inR ? " in" : ""}" title="${esc(fmt(d) + " · " + AV[s] + (w.t[i] ? ": " + w.t[i] : ""))}"><b>${dd.getDate()}</b>${dd.getDate() === 1 || i === 0 ? `<small>${MS[dd.getMonth()]}</small>` : ""}${w.t[i] ? `<em>${esc(w.t[i])}</em>` : ""}</i>`; });
          cal += `</div></div>`;
          body = `<div class="spr-who"><b>${esc(w.nick || w.name)}</b> <span>${esc(w.name)} · ${esc(w.unit)}${w.trade ? " · " + esc(w.trade) : ""}</span><span class="spr-pill av-${cat(w)}">${esc(sum(w))}</span>${addBtn(w)}</div>${cal}<p class="spr-hint">กรอบสีแดง = ช่วงวันที่ขอ (${esc(fmtR(a, b))}) · แสดงถึง ${esc(fmt(F.av.to))}</p>`;
        }
        pick.innerHTML = tabs + `<div class="spr-pk"><select id="sprWho"><option value="">— เลือกชื่อ —</option>${opts}</select></div>` + legend + body;
        return;
      }
      const order = "fahbo", di = F.day === "all" ? -1 : F.av.days.indexOf(F.day);
      const st = w => di < 0 ? cat(w) : w.c[di];
      const list = F.av.workers.filter(w => (!F.unit || w.unit === F.unit) && (!F.free || "fa".includes(st(w)) || F.people.has(w.id))).sort((x, y) => order.indexOf(st(x)) - order.indexOf(st(y)));
      const dayChips = n > 1 ? `<div class="spr-days"><button type="button" data-day="all" class="${F.day === "all" ? "on" : ""}">ทั้งช่วง ${n} วัน</button>${F.av.days.slice(i0, i1 + 1).map((d, k) => `<button type="button" data-day="${d}" class="${F.day === d ? "on" : ""}${F.av.off[i0 + k] ? " off" : ""}" title="${esc(F.av.off[i0 + k] || "")}">${DS[dt(d).getDay()]} ${dt(d).getDate()}</button>`).join("")}</div>` : "";
      const nFree = F.av.workers.filter(w => st(w) === "f").length;
      pick.innerHTML = tabs + dayChips + `<div class="spr-pk"><select id="sprUnit"><option value="">ทุกหน่วย</option>${UNITS.map(u => `<option ${F.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select>
        <label class="spr-chk"><input type="checkbox" id="sprFree" ${F.free ? "checked" : ""}>แสดงเฉพาะคนว่าง</label><span class="spr-cnt">ว่าง${di < 0 ? "ครบช่วง" : ""} <b>${nFree}</b> คน จาก ${F.av.workers.length}</span></div>` + legend
        + (list.length ? `<div class="spr-wl">${list.map(w => `<div class="spr-w av-${st(w)}${F.people.has(w.id) ? " sel" : ""}">${addBtn(w)}<span class="spr-wn"><b>${esc(w.nick || w.name.split(" ")[0])}</b> <small>${esc(w.name)} · ${esc(w.unit)}</small></span>${strip(w, i0, i1)}<span class="spr-ws">${esc(di < 0 ? sum(w) : AV[w.c[di]] + (w.t[di] ? ": " + w.t[di] : ""))}</span></div>`).join("")}</div>` : `<div class="spr-empty">ไม่มีคนว่าง${F.free ? " — เอาติ๊ก “แสดงเฉพาะคนว่าง” ออกเพื่อขอสลับคน" : ""}</div>`);
    }
    function drawSel() {
      m.el.querySelector("#sprN").textContent = F.people.size ? `(${F.people.size})` : "";
      if (!F.people.size || !F.av) { sel.innerHTML = `<div class="spr-empty sm">ยังไม่ได้เลือก</div>`; return; }
      const { i } = sub(F.av.workers[0]);
      let warn = 0;
      sel.innerHTML = [...F.people].map(([id, p]) => {
        const w = F.av.workers.find(x => x.id === id); if (!w) return "";
        const k = cat(w), c = sub(w).c, swap = "hb".includes(k); if (swap || k === "o") warn++;
        const hits = [...c].map((s, n) => "hb".includes(s) ? `${fmt(F.av.days[i + n])} ${w.t[i + n] || AV[s]}` : "").filter(Boolean);
        return `<div class="spr-s av-${k}"><div class="spr-pn"><b>${esc(w.nick || w.name.split(" ")[0])}</b> <span>${esc(w.name)} · ${esc(w.unit)}</span>
          <span class="spr-pill ${swap ? "sw" : k === "o" ? "st-r" : "bk"}">${k === "o" ? "ลาตลอดช่วง — เอาออก" : swap ? "⚠ งานชน → ขอสลับคน" : k === "a" ? "ว่าง (มีคำขออื่นรออยู่)" : "ว่าง → ขอจอง"}</span>
          <label class="spr-chk"><input type="radio" name="leader" value="${esc(id)}" ${p.leader ? "checked" : ""}>หัวหน้าทีม (SS)</label><button type="button" class="spr-rm" data-rm="${esc(id)}" aria-label="เอาออก">✕</button></div>
          ${swap ? `<div class="spr-rs">${esc(hits.slice(0, 4).join(" · "))}${hits.length > 4 ? ` … อีก ${hits.length - 4} วัน` : ""}</div><input data-reason="${esc(id)}" value="${esc(p.reason || "")}" maxlength="300" placeholder="เหตุผลที่ขอสลับ${k === "b" ? " (ต้องกรอก — งานเดิมยืนยันแล้ว)" : " (ถ้ามี)"}" ${k === "b" ? "required" : ""}>` : ""}</div>`;
      }).join("") + (warn ? `<p class="spr-warn">⚠ มีคนที่งานชน: คำขอจะถูกส่งเป็น <b>ขอสลับคน</b> ให้ PC พิจารณา — ถ้า PC Confirm งานเดิมในวันนั้นจะถูกแทนที่</p>` : "");
    }
    async function avail() {
      const { a, b } = rng();
      f.to.min = a;
      if (!a || !b) return;
      if (b < a) { f.to.value = a; return avail(); }
      if ((dt(b) - dt(a)) / 864e5 > 61) { pick.innerHTML = `<div class="spr-empty err">ช่วงวันยาวเกิน 62 วัน แบ่งเป็นหลายคำขอ</div>`; F.av = null; return; }
      const lo = addD(a, -(((dt(a).getDay() + 6) % 7))), hi = addD(b, 28), key = lo + "|" + hi;
      if (F.day !== "all" && (F.day < a || F.day > b)) F.day = "all";
      if (F.key !== key || !F.av) {
        pick.innerHTML = `<div class="spr-empty">กำลังเช็คความว่างจาก Manpower…</div>`;
        try { F.av = await call(`avail?from=${lo}&to=${hi}`); F.key = key; }
        catch (err) { F.av = null; pick.innerHTML = `<div class="spr-empty err">${esc(err.message)}</div>`; return; }
      }
      drawPick(); drawSel();
    }
    f.from.addEventListener("change", avail); f.to.addEventListener("change", avail);
    f.veh.addEventListener("change", () => { f.veh2.hidden = f.veh.value !== "__other"; if (!f.veh2.hidden) f.veh2.focus(); });
    m.el.addEventListener("click", e => {
      const t = e.target.closest("[data-tab]"); if (t) { F.tab = t.dataset.tab; return drawPick(); }
      const d = e.target.closest("[data-day]"); if (d) { F.day = d.dataset.day; return drawPick(); }
      const ad = e.target.closest("[data-add]"); if (ad) { F.people.set(ad.dataset.add, { leader: false, reason: "" }); drawPick(); return drawSel(); }
      const rm = e.target.closest("[data-rm]"); if (rm) { F.people.delete(rm.dataset.rm); drawPick(); return drawSel(); }
    });
    m.el.addEventListener("change", e => {
      if (e.target.id === "sprWho") { F.person = e.target.value; drawPick(); }
      if (e.target.id === "sprUnit") { F.unit = e.target.value; drawPick(); }
      if (e.target.id === "sprFree") { F.free = e.target.checked; drawPick(); }
      if (e.target.name === "leader") F.people.forEach((p, id) => { p.leader = id === e.target.value; });
    });
    m.el.addEventListener("input", e => { const r = e.target.dataset && e.target.dataset.reason; if (r && F.people.has(r)) F.people.get(r).reason = e.target.value; });
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const say = t => { msg.innerHTML = `<span class="err">${esc(t)}</span>`; };
      if (!f.customer.value.trim() || !f.job_name.value.trim()) return say("กรอกชื่อลูกค้าและชื่องาน");
      if (!F.av || !F.people.size) return say("เลือกคนอย่างน้อย 1 คน");
      for (const [id, p] of F.people) { const w = F.av.workers.find(x => x.id === id), k = w ? cat(w) : "o"; if (k === "o") return say(`${w ? w.nick || w.name : id} ลาตลอดช่วง เอาออกจากรายชื่อ`); if (k === "b" && !p.reason.trim()) return say(`ใส่เหตุผลที่ขอสลับ ${w.nick || w.name} (งานเดิมยืนยันแล้ว)`); }
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; msg.textContent = "กำลังส่งคำขอ…";
      try {
        const res = await call("create", { type: f.type.value, customer: f.customer.value, job_name: f.job_name.value, job_no: f.job_no.value, description: f.description.value,
          vehicle: f.veh.value === "__other" ? f.veh2.value : f.veh.value, from: f.from.value, to: f.to.value,
          people: [...F.people].map(([worker_id, p]) => ({ worker_id, is_leader: p.leader, reason: p.reason })) });
        await load(true); VIEW = "mine";
        msg.innerHTML = `ส่งคำขอ <b>${esc(res.req_no)}</b> แล้ว${res.swaps ? " (ขอสลับ " + res.swaps + " คน)" : ""} — รอ PC Confirm`;
        onChange && onChange();
        setTimeout(m.close, 1200);
      } catch (err) { btn.disabled = false; say(err.message); if (err.status === 409 || err.status === 400) { F.key = ""; avail(); } }
    });
    (L ? Promise.resolve() : load().catch(() => {})).then(avail);
  }

  const CSS = `
.spr-modal{position:fixed;inset:0;background:rgba(18,20,24,.45);display:grid;place-items:start center;padding:24px 12px;z-index:80;overflow:auto}
.spr-dlg{background:#fff;border-radius:14px;width:min(560px,100%);box-shadow:0 24px 60px -20px rgba(0,0,0,.45)}.spr-dlg.wide{width:min(860px,100%)}
.spr-dlg header{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line);border-radius:14px 14px 0 0;background:var(--cs,#fafbfc)}
.spr-dlg h3{margin:4px 0 0;font-size:16px;line-height:1.45}.spr-dlg h3 small,.spr-dlg header small{font-weight:500;color:var(--muted);font-size:12px}
.spr-dlg h4{margin:14px 0 6px;font-size:13.5px}
.spr-x{border:1px solid var(--line);background:#fff;border-radius:8px;width:32px;height:32px;flex:none;cursor:pointer}
.spr-body{padding:14px 18px 18px;display:grid;gap:8px}
.st-p{--c:#c28a12;--cs:#fff4da}.st-c{--c:#188764;--cs:#e9f7f0}.st-r{--c:#c0392b;--cs:#fdecea}.st-x{--c:#6d7582;--cs:#eef0f3}.st-m{--c:#2f6fd6;--cs:#e8f0fd}
.spr-pill{display:inline-block;font-size:11px;font-weight:600;border-radius:999px;padding:1px 9px;background:#fff;color:var(--c,#4a515c);border:1px solid var(--c,#c9ced6);white-space:nowrap}
.spr-pill.ty{color:#fff;background:#22252b;border-color:#22252b}.spr-pill.sw{color:#b4530a;border-color:#e8a15a;background:#fff3e6}.spr-pill.bk{color:#188764;border-color:#8fd0b8;background:#effaf5}
.spr-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.spr-tabs{display:flex;flex-wrap:wrap;background:#eef0f3;border-radius:9px;padding:3px;gap:2px}
.spr-tabs button{border:0;background:none;padding:6px 12px;border-radius:7px;color:#5d6572;font:inherit;font-size:13px;cursor:pointer}
.spr-tabs button.on{background:#fff;color:var(--rak);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}.spr-tabs button b{font-weight:600;color:var(--muted)}
.spr-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 14px;font:inherit;font-size:13.5px;cursor:pointer;color:var(--ink)}
.spr-btn.pri{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}.spr-btn.ok{background:#188764;border-color:#188764;color:#fff;font-weight:600}.spr-btn.no{color:#c0392b;border-color:#e6b0aa}
.spr-btn:disabled{opacity:.5;cursor:default}
.spr-hint{margin:0;font-size:12.5px;color:var(--muted)}.spr-warn{margin:6px 0 0;font-size:12.5px;color:#b4530a;background:#fff3e6;border:1px solid #f1cfa6;border-radius:8px;padding:8px 10px}
.spr-empty{padding:22px;text-align:center;color:var(--muted);background:#fafbfc;border:1px dashed var(--line);border-radius:10px;font-size:13.5px}.spr-empty.sm{padding:10px}.spr-empty.err,.spr-msg .err{color:#c0392b}
.spr-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.spr-card{display:grid;gap:5px;text-align:left;border:1px solid var(--line);border-left:4px solid var(--c);background:#fff;border-radius:10px;padding:10px 12px;font:inherit;color:var(--ink);cursor:pointer;min-width:0}
.spr-card:hover{background:var(--cs)}
.spr-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12.5px}.spr-when{margin-left:auto;color:var(--muted)}
.spr-sub{font-weight:600;font-size:13.5px;overflow-wrap:anywhere}
.spr-ppl{display:flex;flex-wrap:wrap;gap:4px}.spr-ppl i{font-style:normal;font-size:11.5px;border-radius:6px;padding:1px 7px;background:var(--cs);color:var(--c);border:1px solid var(--c)}
.spr-by{font-size:11.5px;color:var(--muted)}
.spr-dl{display:grid;grid-template-columns:110px 1fr;gap:5px 12px;margin:0;font-size:13.5px}.spr-dl dt{color:var(--muted)}.spr-dl dd{margin:0}.spr-dl .pre{white-space:pre-wrap}
.spr-plist{display:grid;gap:8px}
.spr-p,.spr-s{border:1px solid var(--line);border-left:4px solid var(--c,#c9ced6);border-radius:10px;padding:9px 12px;display:grid;gap:6px}
.spr-pn{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13.5px}.spr-pn>span:not(.spr-pill){color:var(--muted);font-size:12px}
.spr-rs{font-size:12.5px;color:#7a4a12}.spr-cf{font-size:12.5px}.spr-cf summary{cursor:pointer;color:#b4530a}.spr-cf ul{margin:4px 0 0;padding-left:18px;display:grid;gap:2px}
.spr-cf .av-h{color:#b4530a}.spr-cf .av-b{color:#c0392b}.spr-cf .av-a{color:#2f6fd6}
.spr-pa{display:flex;gap:8px}.spr-pa .spr-btn{padding:5px 12px;font-size:13px}
.spr-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center;background:#f6f8fa;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:6px}
.spr-act input{flex:1 1 220px;height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit}.spr-act small{flex-basis:100%;color:var(--muted);font-size:12px}
.spr-link{background:none;border:0;padding:0;color:#c0392b;font:inherit;font-size:12.5px;cursor:pointer;justify-self:start;text-decoration:underline}
.spr-msg{font-size:13px;min-height:18px;color:#188764}
.spr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.spr-grid .w2{grid-column:span 2}.spr-grid .w3{grid-column:1/-1}
.spr-grid label{display:grid;gap:4px;align-content:start;font-size:12.5px;color:#4a515c}.spr-grid small{color:var(--muted)}
.spr-form input,.spr-form select,.spr-form textarea{width:100%;min-height:36px;border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;font-size:14px;background:#fff;box-sizing:border-box}
.spr-form input[type=checkbox],.spr-form input[type=radio]{width:auto;min-height:0}
.spr-tabs.sm button{padding:5px 10px;font-size:12.5px}
.spr-days{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}.spr-days button{border:1px solid var(--line);background:#fff;border-radius:7px;padding:3px 8px;font:inherit;font-size:12px;cursor:pointer}
.spr-days button.on{background:#22252b;color:#fff;border-color:#22252b}.spr-days button.off{color:#b4bac3}
.spr-pk{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0}.spr-pk select{width:auto;min-width:130px}.spr-chk{display:inline-flex;gap:5px;align-items:center;font-size:12.5px;color:#4a515c}.spr-cnt{margin-left:auto;font-size:12.5px;color:var(--muted)}
.spr-lg{display:flex;flex-wrap:wrap;gap:10px;font-size:11.5px;color:var(--muted);margin-bottom:6px}.spr-lg span{display:inline-flex;gap:4px;align-items:center}.spr-lg i{width:12px;height:12px;border-radius:3px;display:inline-block}
i.av-f,.spr-pill.av-f{background:#bfe8d4}i.av-a,.spr-pill.av-a{background:#cfe0fb}i.av-h,.spr-pill.av-h{background:#ffd9a3}i.av-b,.spr-pill.av-b{background:#f4a79d}i.av-o,.spr-pill.av-o{background:#e3e6ea}
.spr-pill[class*=av-]{border-color:transparent;color:#2b3038}
.spr-wl{display:grid;gap:4px;max-height:330px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px}
.spr-w{display:grid;grid-template-columns:92px minmax(120px,1.1fr) auto minmax(110px,1fr);gap:8px;align-items:center;padding:4px 6px;border-radius:8px;font-size:12.5px}
.spr-w.sel{background:#f1faf6}.spr-w:hover{background:#f6f8fa}.spr-wn small{color:var(--muted);display:block;font-size:11px}.spr-ws{color:#4a515c;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spr-add{border:1px solid var(--line);background:#fff;border-radius:7px;padding:4px 6px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.spr-add.on{background:#188764;border-color:#188764;color:#fff}.spr-add:disabled{color:#b4bac3;cursor:default}.spr-w.av-h .spr-add:not(.on),.spr-w.av-b .spr-add:not(.on){color:#b4530a;border-color:#e8a15a}
.spr-strip{display:inline-flex;gap:1px}.spr-strip i{width:7px;height:18px;border-radius:2px;display:inline-block}
.spr-who{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13.5px}.spr-who>span:not(.spr-pill){color:var(--muted);font-size:12px}
.spr-cal{margin-top:8px}.spr-ch,.spr-cg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}.spr-ch span{font-size:11px;color:var(--muted);text-align:center}
.spr-cg i{font-style:normal;min-height:46px;border-radius:6px;padding:3px 5px;display:grid;align-content:start;font-size:11px;overflow:hidden;border:2px solid transparent}
.spr-cg i.pad{background:none}.spr-cg i.in{border-color:var(--rak)}.spr-cg i b{font-size:12px}.spr-cg i small{color:#4a515c;font-size:10px}.spr-cg i em{font-style:normal;font-size:10px;line-height:1.25;color:#3a4048;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.spr-s input[data-reason]{height:34px}.spr-rm{margin-left:auto;border:0;background:none;color:#9aa1ab;cursor:pointer;font-size:14px}
.spr-foot{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:8px;position:sticky;bottom:0;background:#fff;padding:10px 0 0;border-top:1px solid var(--line)}
@media (max-width:640px){.spr-grid{grid-template-columns:1fr 1fr}.spr-grid .w2{grid-column:1/-1}.spr-w{grid-template-columns:84px 1fr}.spr-w .spr-strip,.spr-w .spr-ws{grid-column:1/-1}.spr-dl{grid-template-columns:1fr}.spr-modal{padding:0}.spr-dlg{border-radius:0;min-height:100vh}.spr-cg i em{display:none}}
`;

  window.SPRequest = { load, page, openList, open, form, status, pending: () => pending().length, data: () => L };
})();
