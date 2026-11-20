/* SSM Work · Team Tracking — small to-dos of the team: เอกสาร แผนงาน Estimate Report … who does it, by when.
   Routes: #team-tracking (งานของฉัน) · #team-tracking/given (ที่ฉันมอบหมาย) · #team-tracking/team (ทั้งทีม)
   Data:   GET /api/team-tracking/data → { me: {username, name, admin}, people: [{username, name}], tasks }
   Anyone with the menu adds a to-do for themselves or a teammate; the assignee / creator ticks it off.
   Repeating to-dos (รายวัน / รายสัปดาห์ / รายเดือน) create the next one when marked done. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  const CAT = { doc: "📄 เอกสาร", plan: "🗓 แผนงาน", estimate: "💰 Estimate", report: "📊 Report", other: "📌 อื่นๆ" };
  const REP = { "": "ไม่ซ้ำ", daily: "ทุกวัน", weekly: "ทุกสัปดาห์", monthly: "ทุกเดือน" };
  const TABS = [["", "งานของฉัน"], ["given", "ที่ฉันมอบหมาย"], ["team", "ทั้งทีม"]];

  let ROOT = null, D = null, ERR = "", LOADING = null;
  const S = { page: "", showDone: false, who: "", q: "" };
  const me = () => (D && D.me) || {};

  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const addDays = n => { const d = today(); d.setDate(d.getDate() + n); return iso(d); };
  const days = s => { const d = parse(s); return d ? Math.round((d - today()) / 864e5) : null; };
  const fmt = s => { const d = parse(s); return d ? DOW[d.getDay()] + " " + d.getDate() + " " + MS[d.getMonth()] : ""; };
  const fmtT = s => { if (!s) return ""; const d = new Date(s); return d.getDate() + " " + MS[d.getMonth()] + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const open = t => t.status === "todo" || t.status === "doing";
  const nameOf = u => (D.people.find(p => p.username === u) || {}).name || u;
  const dueChip = t => { if (!t.due) return ""; const n = days(t.due);
    if (!open(t)) return `<span class="tt-chip s-off">${fmt(t.due)}</span>`;
    if (n < 0) return `<span class="tt-chip s-bad">เลยกำหนด ${-n} วัน</span>`;
    if (n === 0) return `<span class="tt-chip s-warn">วันนี้</span>`;
    if (n === 1) return `<span class="tt-chip s-warn">พรุ่งนี้</span>`;
    return `<span class="tt-chip s-off">${fmt(t.due)}</span>`; };
  const bucket = t => { if (!t.due) return 4; const n = days(t.due); return n < 0 ? 0 : n === 0 ? 1 : n <= 7 ? 2 : 3; };
  const BUCKETS = ["⏰ เลยกำหนด", "📍 วันนี้", "📅 ภายใน 7 วัน", "🗂 ภายหลัง", "• ไม่กำหนดวัน"];
  const sortT = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || (a.priority === "high" ? -1 : 0) - (b.priority === "high" ? -1 : 0) || a.id - b.id;

  async function load(force) {
    if (D && !force) return D;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try { const r = await fetch("/api/team-tracking/data", { cache: "no-store" }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === "no_table" ? "ยังไม่ได้สร้างตาราง — ให้ Admin รัน database/team_tracking.sql ใน Supabase ก่อน" : (j.error || "HTTP " + r.status));
        D = j; if (!D.people.some(p => p.username === D.me.username)) D.people.unshift({ username: D.me.username, name: D.me.name }); ERR = ""; } catch (e) { ERR = e.message; }
      LOADING = null; draw();
    })();
    return LOADING;
  }
  async function post(path, body) {
    const r = await fetch("/api/team-tracking/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j;
  }
  function toast(m, bad) { const t = document.createElement("div"); t.className = "tt-toast" + (bad ? " bad" : ""); t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 5000 : 2200); }
  const upsert = t => { D.tasks = D.tasks.filter(x => x.id !== t.id).concat(t); };

  function draw() {
    if (!ROOT) return;
    if (ERR) { ROOT.innerHTML = `<div class="tt-card tt-err">${esc(ERR)}</div>`; return; }
    if (!D) { ROOT.innerHTML = `<div class="tt-card">กำลังโหลด…</div>`; return; }
    const m = me(), mine = D.tasks.filter(t => open(t) && t.assignee === m.username);
    const late = mine.filter(t => t.due && days(t.due) < 0).length, now = mine.filter(t => t.due && days(t.due) === 0).length;
    const given = D.tasks.filter(t => open(t) && t.created_by === m.username && t.assignee !== m.username);
    const cnt = { "": mine.length + (late ? ` · <b class="tt-red">${late} เลย</b>` : now ? ` · ${now} วันนี้` : ""), given: given.length, team: D.tasks.filter(open).length };
    ROOT.innerHTML = `<div class="tt-tabs">${TABS.map(([id, l]) => `<a href="#team-tracking${id ? "/" + id : ""}" class="${S.page === id ? "on" : ""}">${l} <span class="tt-n">${cnt[id]}</span></a>`).join("")}</div>
      ${quickAdd()}${S.page === "team" ? vTeam() : vList()}`;
    bind();
  }
  function quickAdd() {
    const m = me(), def = S.page === "team" && S.who ? S.who : m.username;
    return `<div class="tt-card tt-add"><input id="qTitle" placeholder="➕ เพิ่มงาน เช่น ส่ง Estimate งาน JO-1234, ทำแผนติดตั้ง HAMLET, Report ประจำสัปดาห์" maxlength="200">
      <select id="qWho" title="ให้ใครทำ">${D.people.map(p => `<option value="${esc(p.username)}"${p.username === def ? " selected" : ""}>${p.username === m.username ? "ฉันเอง" : esc(p.name)}</option>`).join("")}</select>
      <span class="tt-quick">${[["วันนี้", 0], ["พรุ่งนี้", 1], ["+3 วัน", 3], ["+7 วัน", 7]].map(([l, n]) => `<button type="button" data-due="${addDays(n)}">${l}</button>`).join("")}</span>
      <input type="date" id="qDue" value="${addDays(1)}"><select id="qCat">${Object.entries(CAT).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
      <button class="tt-btn" id="qAdd">เพิ่ม</button></div>`;
  }
  function row(t) {
    const m = me(), can = m.admin || t.assignee === m.username || t.created_by === m.username;
    const who = S.page === "" ? (t.created_by !== m.username ? `<span class="sub">จาก ${esc(t.created_by_name || t.created_by)}</span>` : "") : `<span class="tt-who">👤 ${esc(t.assignee === m.username ? "ฉัน" : (t.assignee_name || nameOf(t.assignee)))}</span>`;
    return `<div class="tt-row ${t.status}${t.priority === "high" ? " hi" : ""}">
      <button class="tt-ck" data-a="toggle" data-id="${t.id}" title="${open(t) ? "ทำเสร็จแล้ว" : "เปิดงานใหม่"}"${can ? "" : " disabled"}>${t.status === "done" ? "✓" : t.status === "cancelled" ? "–" : ""}</button>
      <div class="tt-main" data-a="edit" data-id="${t.id}"><div class="tt-title">${t.priority === "high" ? "🔥 " : ""}${esc(t.title)}${t.status === "doing" ? ` <span class="tt-chip s-loan">กำลังทำ</span>` : ""}</div>
        <div class="tt-meta">${dueChip(t)}<span class="tt-chip s-cat">${CAT[t.category] || CAT.other}</span>${t.job_no ? `<span class="tt-chip s-off">${esc(t.job_no)}</span>` : ""}${t.customer ? `<span class="sub">${esc(t.customer)}</span>` : ""}${t.repeat ? `<span class="tt-chip s-off">🔁 ${REP[t.repeat]}</span>` : ""}${(t.notes || []).length ? `<span class="sub">💬 ${t.notes.length}</span>` : ""}${who}</div></div></div>`;
  }
  function groups(list) {
    const g = [[], [], [], [], []]; list.filter(open).sort(sortT).forEach(t => g[bucket(t)].push(t));
    return g.map((ts, i) => ts.length ? `<div class="tt-group"><h4 class="${i === 0 ? "tt-red" : ""}">${BUCKETS[i]} <span>${ts.length}</span></h4>${ts.map(row).join("")}</div>` : "").join("");
  }
  function vList() {
    const m = me();
    const list = S.page === "given" ? D.tasks.filter(t => t.created_by === m.username && t.assignee !== m.username) : D.tasks.filter(t => t.assignee === m.username);
    const done = list.filter(t => !open(t)).sort((a, b) => String(b.done_at || b.updated_at).localeCompare(String(a.done_at || a.updated_at)));
    const body = groups(list);
    return `<div class="tt-card">${body || `<p class="muted tt-empty">${S.page === "given" ? "ยังไม่ได้มอบหมายงานให้ใคร — เลือกชื่อในช่อง “ให้ใครทำ” ตอนเพิ่มงาน" : "ไม่มีงานค้าง 🎉"}</p>`}
      ${done.length ? `<div class="tt-group"><h4><button class="tt-lnk" data-a="done">${S.showDone ? "▾" : "▸"} เสร็จแล้ว / ยกเลิก (45 วันล่าสุด) <span>${done.length}</span></button></h4>${S.showDone ? done.map(row).join("") : ""}</div>` : ""}</div>`;
  }
  function vTeam() {
    const people = D.people.map(p => { const ts = D.tasks.filter(t => open(t) && t.assignee === p.username);
      return { p, ts, late: ts.filter(t => t.due && days(t.due) < 0).length, today: ts.filter(t => t.due && days(t.due) === 0).length }; })
      .sort((a, b) => b.late - a.late || b.ts.length - a.ts.length);
    const q = S.q.toLowerCase();
    return `<div class="tt-bar"><input type="search" id="tQ" placeholder="🔍 ค้นหางาน / Job / ลูกค้า" value="${esc(S.q)}"></div>
      <div class="tt-people">${people.map(({ p, ts, late, today: td }) => { const show = q ? ts.filter(t => [t.title, t.job_no, t.customer].some(v => String(v || "").toLowerCase().includes(q))) : ts;
        if (q && !show.length) return "";
        return `<div class="tt-card tt-person${late ? " has-late" : ""}"><div class="tt-ph"><b>${esc(p.username === me().username ? p.name + " (ฉัน)" : p.name)}</b>
          <span>${ts.length} งาน${late ? ` · <b class="tt-red">เลย ${late}</b>` : ""}${td ? ` · วันนี้ ${td}` : ""}</span>
          ${ts.length ? `<button class="tt-lnk" data-a="remind" data-u="${esc(p.username)}" title="คัดลอกข้อความเตือนไปวางใน LINE">📋 ข้อความเตือน</button>` : ""}</div>
          ${show.sort(sortT).slice(0, 12).map(row).join("") || `<p class="muted small">ไม่มีงานค้าง</p>`}${show.length > 12 ? `<p class="sub">และอีก ${show.length - 12} งาน</p>` : ""}
          <button class="tt-lnk" data-a="addfor" data-u="${esc(p.username)}">+ เพิ่มงานให้ ${esc(p.name)}</button></div>`; }).join("")}</div>`;
  }

  function dlg(t) {
    const m = me(), can = m.admin || t.assignee === m.username || t.created_by === m.username;
    const md = document.createElement("div"); md.className = "tt-modal";
    const dis = can ? "" : " disabled";
    md.innerHTML = `<div class="tt-dlg"><div class="sub">สร้างโดย ${esc(t.created_by_name || t.created_by)} · ${fmtT(t.created_at)}${t.done_at ? " · เสร็จ " + fmtT(t.done_at) : ""}</div>
      <label class="tt-l wide">งาน<input id="eTitle" value="${esc(t.title)}"${dis}></label>
      <div class="tt-form">
        <label class="tt-l">ให้ใครทำ<select id="eWho"${dis}>${D.people.map(p => `<option value="${esc(p.username)}"${p.username === t.assignee ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
        <label class="tt-l">กำหนดเสร็จ<input type="date" id="eDue" value="${esc(t.due || "")}"${dis}></label>
        <label class="tt-l">หมวด<select id="eCat"${dis}>${Object.entries(CAT).map(([k, l]) => `<option value="${k}"${t.category === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="tt-l">สถานะ<select id="eSt"${dis}>${[["todo", "ยังไม่เริ่ม"], ["doing", "กำลังทำ"], ["done", "เสร็จแล้ว"], ["cancelled", "ยกเลิก"]].map(([k, l]) => `<option value="${k}"${t.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="tt-l">ความสำคัญ<select id="ePri"${dis}><option value="normal">ปกติ</option><option value="high"${t.priority === "high" ? " selected" : ""}>🔥 ด่วน</option></select></label>
        <label class="tt-l">ทำซ้ำ<select id="eRep"${dis}>${Object.entries(REP).map(([k, l]) => `<option value="${k}"${(t.repeat || "") === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="tt-l">Job no.<input id="eJob" value="${esc(t.job_no || "")}"${dis}></label>
        <label class="tt-l">ลูกค้า<input id="eCus" data-customer value="${esc(t.customer || "")}"${dis}></label>
      </div>
      <label class="tt-l wide">รายละเอียด<textarea id="eDet" rows="3"${dis}>${esc(t.detail || "")}</textarea></label>
      <h4>💬 อัปเดต / โน้ต</h4><div class="tt-notes">${(t.notes || []).map(n => `<div class="tt-note"><b>${esc(n.by)}</b> <span class="sub">${fmtT(n.at)}</span><div>${esc(n.text)}</div></div>`).join("") || `<span class="muted small">ยังไม่มี</span>`}</div>
      ${can ? `<div class="tt-noteadd"><input id="eNote" placeholder="เช่น ส่งร่างให้ลูกค้าแล้ว รอคอนเฟิร์ม"><button class="tt-btn ghost" data-d="note">ส่ง</button></div>` : ""}
      <div class="tt-err" id="eErr"></div>
      <div class="tt-acts">${can ? `<button class="tt-btn" data-d="save">บันทึก</button>` : ""} <button class="tt-btn ghost" data-d="close">ปิด</button>${m.admin || t.created_by === m.username ? ` <button class="tt-btn ghost danger" data-d="del">ลบ</button>` : ""}</div></div>`;
    document.body.appendChild(md);
    const v = id => md.querySelector("#" + id).value.trim();
    md.addEventListener("click", async e => {
      const a = e.target.closest("[data-d]")?.dataset.d; if (e.target === md || a === "close") return md.remove();
      try {
        if (a === "note") { const text = v("eNote"); if (!text) return; const j = await post("note", { id: t.id, text }); upsert(j.task); md.remove(); dlg(j.task); draw(); }
        if (a === "save") {
          const j = await post("task", { id: t.id, title: v("eTitle"), assignee: v("eWho"), due: v("eDue"), category: v("eCat"), priority: v("ePri"), repeat: v("eRep"), job_no: v("eJob"), customer: v("eCus"), detail: v("eDet") });
          upsert(j.task);
          if (v("eSt") !== t.status) { const s = await post("status", { id: t.id, status: v("eSt") }); upsert(s.task); if (s.next) { upsert(s.next); toast("สร้างงานรอบถัดไปแล้ว " + fmt(s.next.due)); } }
          md.remove(); draw(); toast("บันทึกแล้ว");
        }
        if (a === "del") { if (!confirm("ลบงานนี้?")) return; await post("delete", { id: t.id }); D.tasks = D.tasks.filter(x => x.id !== t.id); md.remove(); draw(); }
      } catch (x) { md.querySelector("#eErr").textContent = x.message; }
    });
  }

  function remindText(u) {
    const ts = D.tasks.filter(t => open(t) && t.assignee === u).sort(sortT);
    const line = t => `• ${t.title}${t.job_no ? " (" + t.job_no + ")" : ""}${t.due ? " — " + (days(t.due) < 0 ? "เลยกำหนด " + (-days(t.due)) + " วัน" : days(t.due) === 0 ? "ครบวันนี้" : "ภายใน " + fmt(t.due)) : ""}`;
    return `สวัสดีค่ะ คุณ${nameOf(u)} 🙏 งานที่ค้างอยู่ใน SSM Work (${ts.length} งาน)\n${ts.map(line).join("\n")}\nอัปเดตสถานะได้ที่ ${location.origin}/#team-tracking`;
  }

  function bind() {
    const $ = s => ROOT.querySelector(s);
    const add = async () => {
      const title = $("#qTitle").value.trim(); if (!title) return $("#qTitle").focus();
      try { const j = await post("task", { title, assignee: $("#qWho").value, due: $("#qDue").value, category: $("#qCat").value }); upsert(j.task);
        toast(j.task.assignee === me().username ? "เพิ่มงานแล้ว" : "มอบหมายให้ " + nameOf(j.task.assignee) + " แล้ว"); draw(); ROOT.querySelector("#qTitle").focus(); } catch (x) { toast(x.message, 1); }
    };
    $("#qAdd").onclick = add; $("#qTitle").addEventListener("keydown", e => { if (e.key === "Enter") add(); });
    ROOT.querySelectorAll("[data-due]").forEach(b => b.onclick = () => { $("#qDue").value = b.dataset.due; });
    const tq = $("#tQ"); if (tq) tq.addEventListener("input", e => { S.q = e.target.value; draw(); const x = ROOT.querySelector("#tQ"); x.focus(); x.setSelectionRange(x.value.length, x.value.length); });
    ROOT.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", async () => {
      const a = b.dataset.a, t = D.tasks.find(x => x.id === +b.dataset.id);
      try {
        if (a === "toggle") { const j = await post("status", { id: t.id, status: open(t) ? "done" : "todo" }); upsert(j.task); if (j.next) { upsert(j.next); toast("🔁 สร้างรอบถัดไป " + fmt(j.next.due)); } else if (open(t)) toast("✓ เสร็จแล้ว"); draw(); }
        if (a === "edit") dlg(t);
        if (a === "done") { S.showDone = !S.showDone; draw(); }
        if (a === "addfor") { S.who = b.dataset.u; draw(); ROOT.querySelector("#qTitle").focus(); scrollTo(0, 0); }
        if (a === "remind") { const txt = remindText(b.dataset.u); await navigator.clipboard.writeText(txt).then(() => toast("คัดลอกแล้ว — วางใน LINE ได้เลย"), () => prompt("คัดลอกข้อความนี้", txt)); }
      } catch (x) { toast(x.message, 1); }
    }));
  }

  const CSS = `
.tt-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.tt-tabs a{padding:8px 15px;border-radius:999px;border:1px solid var(--line,#e3e6ea);text-decoration:none;color:inherit;font-size:13.5px;background:#fff}
.tt-tabs a.on{background:var(--rak);color:#fff;border-color:var(--rak)}.tt-n{opacity:.8;font-size:12px}.tt-tabs a.on .tt-red{color:#fff}
.tt-card{background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:14px;padding:14px 16px;margin-bottom:14px}.tt-err,.tt-red{color:#c92a2a}.muted{color:#8a9099}.small{font-size:13px}.sub{font-size:12px;color:#8a9099}
.tt-add{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.tt-add #qTitle{flex:1 1 320px;font-size:15px}
.tt-add input,.tt-add select,.tt-bar input,.tt-l input,.tt-l select,.tt-l textarea,.tt-noteadd input{padding:9px 11px;border:1px solid #d6dae0;border-radius:9px;font:inherit;font-size:13.5px;background:#fff;color:inherit}
.tt-quick{display:flex;gap:4px}.tt-quick button{border:1px solid #d6dae0;background:#fff;border-radius:8px;padding:6px 9px;font:inherit;font-size:12.5px;cursor:pointer}.tt-quick button:hover{background:var(--blush);border-color:var(--rak-line)}
.tt-btn{padding:9px 16px;border-radius:9px;border:1px solid var(--rak);background:var(--rak);color:#fff;font:inherit;font-size:13.5px;cursor:pointer}.tt-btn:hover{background:var(--rak-dark)}.tt-btn.ghost{background:#fff;color:var(--ink,#1f2328);border-color:#d6dae0}.tt-btn.danger{color:#c92a2a}
.tt-lnk{background:none;border:0;color:var(--rak);cursor:pointer;font:inherit;font-size:13px;padding:0}
.tt-group{margin-bottom:10px}.tt-group h4{margin:6px 0 4px;font-size:13px;color:#4b5563}.tt-group h4 span{color:#9aa1a9;font-weight:400}
.tt-row{display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid #f1f3f5}.tt-row:last-child{border:0}.tt-row.hi .tt-title{font-weight:600}
.tt-row.done .tt-title,.tt-row.cancelled .tt-title{text-decoration:line-through;color:#9aa1a9}
.tt-ck{flex:none;width:24px;height:24px;border-radius:7px;border:2px solid var(--rak-line,#ccd);background:#fff;color:#fff;font-weight:700;cursor:pointer;margin-top:1px;line-height:1}.tt-ck:hover{border-color:var(--rak)}.tt-row.done .tt-ck{background:var(--rak);border-color:var(--rak)}.tt-ck:disabled{opacity:.4;cursor:default}
.tt-main{flex:1;min-width:0;cursor:pointer}.tt-title{font-size:14.5px}.tt-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:3px}.tt-who{font-size:12.5px;color:#4b5563}
.tt-chip{display:inline-block;font-size:11.5px;padding:1px 8px;border-radius:999px;white-space:nowrap}.s-bad{background:#fff5f5;color:#c92a2a;font-weight:600}.s-warn{background:#fff4e6;color:#d9480f}.s-off{background:#f1f3f5;color:#6b7280}.s-loan{background:#e7f5ff;color:#1c7ed6}.s-cat{background:var(--blush);color:var(--rak-dark)}
.tt-empty{padding:16px 4px;margin:0}
.tt-bar{margin-bottom:12px}.tt-bar input{width:100%;max-width:420px}
.tt-people{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}.tt-people .tt-card{margin:0}.tt-person.has-late{border-top:3px solid #fa5252}
.tt-ph{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px}.tt-ph>span{font-size:12.5px;color:#6b7280}.tt-ph .tt-lnk{margin-left:auto;font-size:12px}
.tt-modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;z-index:200;overflow:auto;padding:40px 12px}.tt-dlg{background:#fff;border-radius:16px;padding:18px 20px;max-width:760px;width:100%}
.tt-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:10px 0}.tt-l{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6b7280}.tt-l.wide{margin-top:8px}.tt-l.wide input{font-size:15px}
.tt-dlg h4{margin:14px 0 6px;font-size:13.5px}.tt-notes{max-height:220px;overflow:auto}.tt-note{padding:6px 0;border-bottom:1px solid #f1f3f5;font-size:13px}
.tt-noteadd{display:flex;gap:6px;margin-top:8px}.tt-noteadd input{flex:1}.tt-acts{display:flex;gap:6px;margin-top:14px}
.tt-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1f2328;color:#fff;padding:10px 16px;border-radius:10px;z-index:300;font-size:13.5px}.tt-toast.bad{background:#c92a2a}
`;
  window.TeamTracking = {
    mount(el, sub) {
      if (!document.getElementById("ttCss")) { const s = document.createElement("style"); s.id = "ttCss"; s.textContent = CSS; document.head.appendChild(s); }
      ROOT = el; const pg = String(sub || "").split("/")[0];
      S.page = TABS.some(t => t[0] === pg) ? pg : ""; if (S.page !== "team") S.who = "";
      draw(); load(true);
    },
  };
})();
