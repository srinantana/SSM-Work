/* SSM Work · QA Tools — tool & measuring-equipment register with photos, borrow / return, annual calibration.
   Routes: #qa-tools (ภาพรวม) · #qa-tools/list (ทะเบียน) · #qa-tools/loans (ยืม-คืน) · #qa-tools/cal (สอบเทียบ)
           #qa-tools/import (นำเข้า Excel, ผู้ดูแล) · #qa-tools/tool/<id> (รายละเอียด — the QR label points here)
   Data:   GET /api/qa-tools/data → { me: {username, name, canManage, canApprove}, tools, loans, cals }
   Roles:  ผู้ดูแลเครื่องมือ (อาร์ต) — register, photos / documents, receive returns, calibration
           ผู้อนุมัติ (ดิว) — approves calibration results and retiring a tool. Anyone with the menu can borrow. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const CATS = [["measuring", "📏 เครื่องมือวัด"], ["electrical", "⚡ เครื่องมือไฟฟ้า / มิเตอร์"], ["power", "🔌 เครื่องมือช่าง (ไฟฟ้า)"], ["hand", "🔧 เครื่องมือช่าง (มือ)"], ["lifting", "🏗 ยก / รอก / สลิง"], ["safety", "🦺 อุปกรณ์ความปลอดภัย"], ["other", "📦 อื่นๆ"]];
  const CAT_L = Object.fromEntries(CATS);
  const ST = { available: ["ยืมได้", "s-ok"], on_loan: ["ถูกยืม", "s-loan"], calibration: ["ส่งสอบเทียบ", "s-cal"], repair: ["ซ่อม / ชำรุด", "s-warn"], lost: ["สูญหาย", "s-bad"], retire_pending: ["รออนุมัติจำหน่าย", "s-off"], retired: ["จำหน่ายแล้ว", "s-off"] };
  const RES = { pass: "ผ่าน", adjusted: "ปรับตั้งแล้วผ่าน", fail: "ไม่ผ่าน" };
  const COND = { ok: "ปกติ", damaged: "ชำรุด", missing_parts: "อุปกรณ์ไม่ครบ" };
  const TABS = [["", "ภาพรวม"], ["list", "ทะเบียนเครื่องมือ"], ["loans", "ยืม-คืน"], ["cal", "สอบเทียบ"]];
  const DUE_SOON = 30;   // days before the calibration due date to start warning

  let ROOT = null, D = null, ERR = "", LOADING = null;
  const S = { page: "", tool: 0, q: "", cat: "", dept: "", st: "", imp: null, sel: new Set(), aq: "", au: "", aa: "", am: "", audit: null, view: (() => { try { return localStorage.getItem("qaView") || "grid"; } catch (e) { return "grid"; } })() };

  /* ---------- helpers ---------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const TODAY = () => iso(today());
  const fmt = s => { const d = parse(s); return d ? d.getDate() + " " + MS[d.getMonth()] + " " + d.getFullYear() : ""; };
  const fmtT = s => { if (!s) return ""; const d = new Date(s); return d.getDate() + " " + MS[d.getMonth()] + " " + String(d.getFullYear()).slice(2) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const days = s => { const d = parse(s); return d ? Math.round((d - today()) / 864e5) : null; };
  const addDays = n => { const d = today(); d.setDate(d.getDate() + n); return iso(d); };
  const age = s => { const d = parse(s); if (!d) return ""; const t = today(); let m = (t.getFullYear() - d.getFullYear()) * 12 + t.getMonth() - d.getMonth(); if (t.getDate() < d.getDate()) m--; if (m < 0) return ""; const y = Math.floor(m / 12); return (y ? y + " ปี " : "") + (m % 12 ? (m % 12) + " เดือน" : y ? "" : "< 1 เดือน"); };
  const fileUrl = p => "/api/qa-tools/file?p=" + encodeURIComponent(p);
  const isLink = u => /^https?:\/\/\S+$/i.test(String(u || "").trim());
  const docHref = f => f.url ? (isLink(f.url) ? f.url : "#") : fileUrl(f.p);   // uploaded file {p} or link {url}
  const me = () => (D && D.me) || {};
  const tById = id => D.tools.find(t => t.id === +id);
  const openLoan = t => D.loans.find(l => l.tool_id === t.id && l.status !== "returned");
  function calState(t) {
    if (!t.needs_cal) return { k: "na", l: "ไม่ต้องสอบเทียบ", c: "s-off" };
    if (!t.next_cal_due) return { k: "unk", l: "ยังไม่มีกำหนด", c: "s-warn" };
    const n = days(t.next_cal_due);
    if (n < 0) return { k: "over", l: "เลยกำหนด " + (-n) + " วัน", c: "s-bad", n };
    if (n <= DUE_SOON) return { k: "soon", l: "อีก " + n + " วัน", c: "s-warn", n };
    return { k: "ok", l: fmt(t.next_cal_due), c: "s-ok", n };
  }
  const chip = (l, c) => `<span class="qa-chip ${c}">${esc(l)}</span>`;
  const stChip = t => t.status === "available" && !t.lendable ? chip("ใช้งานได้", "s-ok") : t.status === "available" && calState(t).k === "over" ? chip("ห้ามยืม / ห้ามใช้", "s-bad") : chip(...(ST[t.status] || [t.status, "s-off"]));
  const active = t => !["retired"].includes(t.status);
  const canBorrow = t => t.lendable && t.status === "available" && calState(t).k !== "over";
  const normName = s => String(s || "").replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").replace(/\s+/g, "");
  const isMine = t => !!t.owner_name && normName(t.owner_name) === normName(me().name);
  // a photo is an uploaded file {p} or a web picture {url} (sample image of the model — kind "web"); broken web pictures fall back to the icon
  const imgErr = `onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:this.className+' qa-noimg',textContent:'🧰'}))"`;
  const thumb = (t, cls = "qa-th") => t.photos && t.photos[0] ? `<span class="qa-thw"><img class="${cls}${t.photos[0].url ? " qa-web" : ""}" loading="lazy" referrerpolicy="no-referrer" src="${esc(docHref(t.photos[0]))}" alt="" ${imgErr}>${t.photos[0].url ? `<i class="qa-webtag">ตัวอย่าง</i>` : ""}</span>` : `<span class="${cls} qa-noimg">${(CAT_L[t.category] || "🧰").split(" ")[0]}</span>`;

  /* ---------- api ---------- */
  async function load(force) {
    if (D && !force) return D;
    if (LOADING) return LOADING;
    LOADING = (async () => {
      try {
        const r = await fetch("/api/qa-tools/data", { cache: "no-store" }); const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error === "no_table" ? "ยังไม่ได้สร้างตาราง — ให้ Admin รัน database/qa_tools.sql ใน Supabase ก่อน" : (j.error || "HTTP " + r.status));
        D = j; ERR = "";
      } catch (e) { ERR = e.message; }
      LOADING = null; draw();
    })();
    return LOADING;
  }
  async function post(path, body) {
    const r = await fetch("/api/qa-tools/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j;
  }
  function toast(msg, bad) {
    const t = document.createElement("div"); t.className = "qa-toast" + (bad ? " bad" : ""); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 2600);
  }
  function shrink(file, max = 1600, q = 0.82) {
    return new Promise((ok, no) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(u); const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(b => b ? ok(b) : no(new Error("อ่านรูปไม่สำเร็จ")), "image/jpeg", q); };
      img.onerror = () => { URL.revokeObjectURL(u); no(new Error("อ่านรูปไม่สำเร็จ")); };
      img.src = u;
    });
  }
  async function upload(file, toolId) {
    const pdf = file.type === "application/pdf";
    const body = pdf ? file : await shrink(file);
    if (body.size > 4 * 1024 * 1024) throw new Error(file.name + ": ไฟล์ใหญ่เกิน 4 MB");
    const r = await fetch("/api/qa-tools/file?tool=" + (toolId || "new"), { method: "POST", headers: { "content-type": pdf ? "application/pdf" : "image/jpeg" }, body });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
    return { p: j.path, name: file.name.slice(0, 120), at: new Date().toISOString(), by: me().name };
  }

  /* ---------- external libs (loaded on demand) ---------- */
  const LIBS = {
    xlsx: ["https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js", "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT", "XLSX"],
    qr: ["https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js", "sha384-e9EFD6BGC90bkW9aDV5xbbBfzwN7G8YImHao2lfLVKV/hPB0E0go+H3I64h7oHtA", "qrcode"],
  };
  const libP = {};
  const lib = k => libP[k] || (libP[k] = new Promise((ok, no) => {
    const [src, sri, g] = LIBS[k]; if (window[g]) return ok(window[g]);
    const s = document.createElement("script"); s.src = src; s.integrity = sri; s.crossOrigin = "anonymous";
    s.onload = () => ok(window[g]); s.onerror = () => { delete libP[k]; no(new Error("โหลดไลบรารีไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่")); };
    document.head.appendChild(s);
  }));
  const qrSvg = (Q, text, cell = 3) => { const q = Q(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 1, scalable: true }); };
  const toolLink = t => location.origin + "/#qa-tools/tool/" + t.id;

  /* ---------- views ---------- */
  function draw() {
    if (!ROOT) return;
    if (ERR) { ROOT.innerHTML = `<div class="qa-card qa-err">${esc(ERR)}</div>`; return; }
    if (!D) { ROOT.innerHTML = `<div class="qa-card">กำลังโหลด…</div>`; return; }
    const m = me();
    const tabs = TABS.slice(); if (m.canApprove) tabs.push(["audit", "📜 ประวัติการทำรายการ"]); if (m.canManage) tabs.push(["import", "⬆ นำเข้า Excel"]);
    const pend = D.cals.filter(c => c.status === "pending_approval" || (m.canManage && c.status === "pending_verify")).length + D.tools.filter(t => t.status === "retire_pending").length;
    const role = m.canApprove ? "ผู้อนุมัติ" : m.canManage ? "ผู้ดูแลเครื่องมือ" : "";
    const head = `<div class="qa-tabs">${tabs.map(([id, l]) => `<a href="#qa-tools${id ? "/" + id : ""}" class="${S.page === id ? "on" : ""}">${l}${id === "cal" && m.canApprove && pend ? ` <b class="qa-dot">${pend}</b>` : ""}</a>`).join("")}${role ? `<span class="qa-role">${role}</span>` : ""}</div>`;
    const page = S.page === "tool" ? vTool() : ({ "": vDash, list: vList, loans: vLoans, cal: vCal, audit: vAudit, import: vImport }[S.page] || vDash)();
    ROOT.innerHTML = head + page;
    bind();
  }

  function vDash() {
    const m = me(), ts = D.tools.filter(active);
    const open = D.loans.filter(l => l.status !== "returned");
    const late = open.filter(l => l.due_back && days(l.due_back) < 0);
    const cs = ts.map(t => [t, calState(t)]);
    const over = cs.filter(([, c]) => c.k === "over"), soon = cs.filter(([, c]) => c.k === "soon");
    const pending = D.cals.filter(c => c.status === "pending_approval" || (m.canManage && c.status === "pending_verify")).length + D.tools.filter(t => t.status === "retire_pending").length;
    const tiles = [["🧰", "เครื่องมือทั้งหมด", ts.length, "", "list"], ["✅", "ยืมได้", ts.filter(canBorrow).length, "ok", "list"], ["🤝", "ถูกยืมอยู่", open.length, "loan", "loans"],
      ["⏰", "เกินกำหนดคืน", late.length, late.length ? "bad" : "", "loans"], ["🎯", "สอบเทียบใน " + DUE_SOON + " วัน", soon.length, soon.length ? "warn" : "", "cal"], ["⛔", "เลยกำหนดสอบเทียบ", over.length, over.length ? "bad" : "", "cal"]];
    const noDue = cs.filter(([, c]) => c.k === "unk").length;
    if (noDue) tiles.push(["❔", "ยังไม่มีวันครบสอบเทียบ", noDue, "warn", "cal"]);
    if (m.canApprove || m.canManage) tiles.push(["✍️", "รออนุมัติ", pending, pending ? "warn" : "", "cal"]);
    return `<div class="qa-tiles">${tiles.map(([ic, l, n, k, href]) => `<a class="qa-tile t-${k}" href="#qa-tools/${href}"><i>${ic}</i><b>${n}</b><span>${l}</span></a>`).join("")}</div>
      ${vKpi(ts, cs, open, late)}`;
  }

  /* ---------- KPI dashboard (ภาพรวม) — computed from the register, loans and calibration records ---------- */
  function vKpi(ts, cs, open, late) {
    const pct = (a, b) => b ? Math.round(a * 100 / b) : 0, num = n => Number(n || 0).toLocaleString();
    const bar = (v, max, cls = "") => `<span class="qa-kbar ${cls}"><i style="width:${max ? Math.max(2, Math.round(v * 100 / max)) : 0}%"></i></span>`;
    const tone = p => p >= 90 ? "ok" : p >= 70 ? "warn" : "bad";
    // 1) calibration readiness
    const need = cs.filter(([t]) => t.needs_cal), cnt = k => need.filter(([, c]) => c.k === k).length;
    const okN = cnt("ok") + cnt("soon"), overN = cnt("over"), unkN = cnt("unk"), soonN = cnt("soon"), comp = pct(okN, need.length);
    // 2) by department
    const deps = {}; need.forEach(([t, c]) => { const d = t.department || "ไม่ระบุแผนก"; const o = deps[d] || (deps[d] = { n: 0, over: 0 }); o.n++; if (c.k === "over" || c.k === "unk") o.over++; });
    const depRows = Object.entries(deps).map(([d, o]) => ({ d, ...o, p: pct(o.n - o.over, o.n) })).sort((a, b) => a.p - b.p || b.n - a.n);
    // 3) workload: overdue now + next 12 months
    const t0 = today(), months = Array.from({ length: 12 }, (_, i) => new Date(t0.getFullYear(), t0.getMonth() + i, 1));
    const load = months.map(mo => need.filter(([t]) => { const d = parse(t.next_cal_due); return d && d >= t0 && d.getFullYear() === mo.getFullYear() && d.getMonth() === mo.getMonth(); }).length);
    const lmax = Math.max(overN, ...load, 1);
    // 4) calibration results this year
    const y = t0.getFullYear(), yc = D.cals.filter(c => String(c.cal_date || "").startsWith(String(y)));
    const res = k => yc.filter(c => c.result === k).length, appr = yc.filter(c => c.status === "approved");
    const cost = yc.reduce((a, c) => a + (+c.cost || 0), 0), labs = {}; yc.forEach(c => { const l = c.lab || "ไม่ระบุ"; labs[l] = (labs[l] || 0) + (+c.cost || 0); });
    const tat = yc.filter(c => c.sent_date && c.cal_date).map(c => (parse(c.cal_date) - parse(c.sent_date)) / 864e5).filter(n => n >= 0);
    const waitV = D.cals.filter(c => c.status === "pending_verify").length, waitA = D.cals.filter(c => c.status === "pending_approval").length, atLab = D.cals.filter(c => c.status === "sent").length;
    // 5) loans
    const since = new Date(t0); since.setDate(since.getDate() - 90);
    const recent = D.loans.filter(l => l.out_at && new Date(l.out_at) >= since), top = {}; recent.forEach(l => { top[l.tool_id] = (top[l.tool_id] || 0) + 1; });
    const topRows = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => [tById(+id), n]).filter(r => r[0]);
    const done = D.loans.filter(l => l.returned_at && l.out_at), dur = done.length ? done.reduce((a, l) => a + (new Date(l.returned_at) - new Date(l.out_at)) / 864e5, 0) / done.length : 0;
    const lateRet = done.filter(l => l.due_back && new Date(l.returned_at) > new Date(l.due_back + "T23:59:59")).length;
    // 6) register quality
    const ages = ts.map(t => parse(t.purchase_date)).filter(Boolean).map(d => (t0 - d) / 864e5 / 365.25);
    const old10 = ages.filter(a => a >= 10).length, realPh = ts.filter(t => (t.photos || []).some(f => f.kind !== "web")).length;
    const webPh = ts.filter(t => (t.photos || []).length && !(t.photos || []).some(f => f.kind !== "web")).length, fa = ts.filter(t => t.fixed_asset_no).length, owner = ts.filter(t => t.owner_name || t.lendable).length;
    const kv = (l, v, extra = "") => `<div class="qa-kv2"><span>${l}</span><b>${v}</b>${extra}</div>`;
    return `<div class="qa-kpi">
      <div class="qa-card qa-kc"><h3>🎯 ความพร้อมสอบเทียบ</h3>
        <div class="qa-ring t-${tone(comp)}" style="--p:${comp}"><b>${comp}%</b><span>อยู่ในกำหนด</span></div>
        <div class="qa-legend"><a href="#qa-tools/list" data-a="kpi" data-st="calsoon"><i class="d-warn"></i>ครบใน ${DUE_SOON} วัน <b>${soonN}</b></a><a href="#qa-tools/list" data-a="kpi" data-st="calover"><i class="d-bad"></i>เลยกำหนด <b>${overN}</b></a>${unkN ? `<a href="#qa-tools/cal"><i class="d-off"></i>ไม่มีวันครบ <b>${unkN}</b></a>` : ""}<span><i class="d-ok"></i>ในกำหนด <b>${okN - soonN}</b></span></div>
        <p class="sub">เครื่องมือที่ต้องสอบเทียบ ${num(need.length)} รายการ · เป้าหมาย ≥ 95%</p></div>
      <div class="qa-card qa-kc"><h3>🏭 ความพร้อมรายแผนก</h3>
        <table class="qa-kt">${depRows.map(r => `<tr data-a="kpi" data-dept="${esc(r.d === "ไม่ระบุแผนก" ? "" : r.d)}" data-st="calover" title="ดูรายการเลยกำหนดของแผนกนี้"><td>${esc(r.d)}</td><td class="n">${r.n}</td><td class="w">${bar(r.p, 100, "t-" + tone(r.p))}</td><td class="n t-${tone(r.p)}">${r.p}%</td></tr>`).join("") || `<tr><td class="muted">ไม่มีข้อมูล</td></tr>`}</table>
        <p class="sub">จำนวน · % อยู่ในกำหนด — กดแถวเพื่อดูรายการเลยกำหนด</p></div>
      <div class="qa-card qa-kc qa-wide"><h3>📅 ภาระงานสอบเทียบ 12 เดือนข้างหน้า</h3>
        <div class="qa-cols"><div class="qa-col over" title="เลยกำหนดแล้ว ${overN}"><b>${overN}</b><i style="height:${Math.round(overN * 100 / lmax)}%"></i><span>ค้าง</span></div>${load.map((n, i) => `<div class="qa-col${i === 0 ? " now" : ""}" title="${MS[months[i].getMonth()]} ${months[i].getFullYear()}: ${n}"><b>${n || ""}</b><i style="height:${Math.round(n * 100 / lmax)}%"></i><span>${MS[months[i].getMonth()]}${months[i].getMonth() === 0 || i === 0 ? "<br>" + String(months[i].getFullYear() + 543).slice(2) : ""}</span></div>`).join("")}</div>
        <p class="sub">จำนวนเครื่องมือที่ครบกำหนดแต่ละเดือน (แท่งแดง = เลยกำหนดแล้ว ต้องเคลียร์ก่อน)</p></div>
      <div class="qa-card qa-kc"><h3>🧪 ผลสอบเทียบปี ${y + 543}</h3>
        <div class="qa-kgrid">${kv("สอบเทียบแล้ว", num(yc.length))}${kv("อนุมัติแล้ว", num(appr.length))}${kv("ผ่าน", num(res("pass")), `<em class="t-ok">${pct(res("pass"), yc.length)}%</em>`)}${kv("ปรับตั้งแล้วผ่าน", num(res("adjusted")))}${kv("ไม่ผ่าน", num(res("fail")), res("fail") ? `<em class="t-bad">ต้องประเมินผลกระทบ</em>` : "")}${kv("เวลาที่ Lab ใช้ (เฉลี่ย)", tat.length ? Math.round(tat.reduce((a, b) => a + b, 0) / tat.length) + " วัน" : "-")}</div>
        <div class="qa-kgrid">${kv("อยู่ที่ Lab", num(atLab))}${kv("รอทวนสอบ", num(waitV), waitV ? `<em class="t-warn">QA Engineer</em>` : "")}${kv("รออนุมัติ", num(waitA), waitA ? `<em class="t-warn">ดิว</em>` : "")}</div></div>
      <div class="qa-card qa-kc"><h3>💰 ค่าสอบเทียบปี ${y + 543}</h3>
        <div class="qa-big">${num(cost)} <small>บาท</small></div>
        <table class="qa-kt">${Object.entries(labs).sort((a, b) => b[1] - a[1]).map(([l, v]) => `<tr><td>${esc(l)}</td><td class="w">${bar(v, cost)}</td><td class="n">${num(v)}</td></tr>`).join("") || `<tr><td class="muted">ยังไม่มีค่าใช้จ่ายที่บันทึก</td></tr>`}</table></div>
      <div class="qa-card qa-kc"><h3>🤝 ยืม-คืน</h3>
        <div class="qa-kgrid">${kv("ถูกยืมอยู่", num(open.length))}${kv("เกินกำหนดคืน", num(late.length), late.length ? `<em class="t-bad">ตาม</em>` : "")}${kv("ยืม 90 วันล่าสุด", num(recent.length))}${kv("ยืมเฉลี่ย", done.length ? dur.toFixed(1) + " วัน" : "-")}${kv("คืนตรงเวลา", done.length ? pct(done.length - lateRet, done.length) + "%" : "-")}</div>
        ${topRows.length ? `<h4>ยืมบ่อย (90 วัน)</h4><table class="qa-kt">${topRows.map(([t, n]) => `<tr><td><a href="#qa-tools/tool/${t.id}">${esc(t.asset_no)}</a> <span class="sub">${esc(t.name)}</span></td><td class="n">${n} ครั้ง</td></tr>`).join("")}</table>` : `<p class="sub">ยังไม่มีการยืมใน 90 วัน</p>`}</div>
      <div class="qa-card qa-kc"><h3>🗂 คุณภาพข้อมูลทะเบียน</h3>
        <div class="qa-kgrid">${kv("มีรูปจริง", pct(realPh, ts.length) + "%", `<em>${realPh}/${ts.length}${webPh ? " · รูปตัวอย่าง " + webPh : ""}</em>`)}${kv("มีรหัสทรัพย์สิน", pct(fa, ts.length) + "%", `<em>${fa}/${ts.length}</em>`)}${kv("มีผู้ถือครอง / เครื่องมือกลาง", pct(owner, ts.length) + "%", `<em>${owner}/${ts.length}</em>`)}${kv("อายุเฉลี่ย", ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) + " ปี" : "-")}${kv("อายุ ≥ 10 ปี", num(old10), old10 ? `<em class="t-warn">พิจารณาทดแทน</em>` : "")}</div></div>
    </div>`;
  }

  function filters() {
    return `<div class="qa-bar"><input type="search" id="qaQ" placeholder="🔍 ค้นหา รหัส / ชื่อ / ยี่ห้อ / ขนาด / ผู้ถือครอง" value="${esc(S.q)}">
      <select id="qaCat"><option value="">ทุกประเภท</option>${CATS.map(([k, l]) => `<option value="${k}"${S.cat === k ? " selected" : ""}>${l}</option>`).join("")}</select>
      <select id="qaDept"><option value="">ทุกแผนก</option>${[...new Set(D.tools.map(t => t.department).filter(Boolean))].sort().map(d => `<option${S.dept === d ? " selected" : ""}>${esc(d)}</option>`).join("")}</select><select id="qaSt"><option value="">ทุกสถานะ</option>${Object.entries(ST).map(([k, [l]]) => `<option value="${k}"${S.st === k ? " selected" : ""}>${l}</option>${k === "available" ? `<option value="blocked"${S.st === "blocked" ? " selected" : ""}>ห้ามยืม / ห้ามใช้ (เลยกำหนดสอบเทียบ)</option>` : ""}`).join("")}<option value="inuse"${S.st === "inuse" ? " selected" : ""}>ใช้งานได้ (มีผู้ถือครองประจำ)</option><option value="calover"${S.st === "calover" ? " selected" : ""}>เลยกำหนดสอบเทียบ</option><option value="calsoon"${S.st === "calsoon" ? " selected" : ""}>สอบเทียบใน ${DUE_SOON} วัน</option></select>`;
  }
  function filtered() {
    const q = S.q.toLowerCase();
    return D.tools.filter(t => (S.st === "retired" || t.status !== "retired")
      && (!S.cat || t.category === S.cat) && (!S.dept || t.department === S.dept)
      && (!S.st || (S.st === "available" ? canBorrow(t) : S.st === "blocked" ? t.status === "available" && t.lendable && calState(t).k === "over" : t.status === S.st) || (S.st === "inuse" && t.status === "available" && !t.lendable) || (S.st === "calover" && calState(t).k === "over") || (S.st === "calsoon" && calState(t).k === "soon"))
      && (!q || [t.asset_no, t.fixed_asset_no, t.name, t.brand, t.model, t.serial_no, t.owner_name, t.department, t.location, t.spec].some(v => String(v || "").toLowerCase().includes(q))));
  }
  function vList() {
    const m = me(), ts = filtered();
    const tools = m.canManage ? `<button class="qa-btn" data-a="new">+ เพิ่มเครื่องมือ</button>` : "";
    const sel = S.sel.size ? `<button class="qa-btn ghost" data-a="labels">🏷 พิมพ์ป้าย QR (${S.sel.size})</button> <button class="qa-lnk" data-a="sel-none">ล้าง</button>` : `<button class="qa-btn ghost" data-a="sel-all">☑ เลือกทั้งหมดเพื่อพิมพ์ป้าย</button>`;
    const vbtn = `<span class="qa-vsw" role="group" aria-label="มุมมอง"><button class="${S.view !== "rows" ? "on" : ""}" data-a="view" data-v="grid" title="มุมมองการ์ด">▦</button><button class="${S.view === "rows" ? "on" : ""}" data-a="view" data-v="rows" title="มุมมองรายบรรทัด">☰</button></span>`;
    const head = filters() + tools + ` <button class="qa-btn ghost" data-a="xlsx">⬇ Excel</button></div><div class="qa-bar2">${sel}<span class="muted">${ts.length} รายการ</span>${vbtn}</div>`;
    const empty = `<p class="muted">ไม่พบเครื่องมือ${m.canManage && !D.tools.length ? " — เริ่มจาก “+ เพิ่มเครื่องมือ” หรือ “⬆ นำเข้า Excel”" : ""}</p>`;
    if (S.view === "rows") return head + (ts.length ? `<div class="qa-card qa-scroll"><table class="qa-t qa-rows"><thead><tr><th></th><th>รหัส</th><th>ชื่อเครื่องมือ</th><th>ยี่ห้อ / รุ่น / ขนาด</th><th>สถานะ</th><th>สอบเทียบ</th><th>ผู้ถือครอง / ผู้ยืม</th><th></th></tr></thead><tbody>
      ${ts.map(t => { const c = calState(t), l = openLoan(t); return `<tr><td><input type="checkbox" data-sel="${t.id}"${S.sel.has(t.id) ? " checked" : ""}></td>
        <td class="mono"><a href="#qa-tools/tool/${t.id}">${esc(t.asset_no)}</a></td><td><a href="#qa-tools/tool/${t.id}"><b>${esc(t.name)}</b></a></td>
        <td class="sub">${esc([t.brand, t.model, t.spec].filter(x => x && x !== "-").join(" · "))}</td><td>${stChip(t)}</td><td>${t.needs_cal ? chip(c.l, c.c) : `<span class="sub">—</span>`}</td>
        <td class="sub">${l ? "👤 " + esc(l.borrower_name) + " · คืน " + fmt(l.due_back) : t.lendable ? "🧰 เครื่องมือกลาง" : esc([t.owner_name, t.department].filter(Boolean).join(" · "))}</td>
        <td>${canBorrow(t) ? `<button class="qa-btn sm" data-a="borrow" data-id="${t.id}">ยืม</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>` : empty);
    return head + `
      <div class="qa-cards">${ts.map(t => { const c = calState(t), l = openLoan(t);
        return `<div class="qa-tcard"><label class="qa-pick"><input type="checkbox" data-sel="${t.id}"${S.sel.has(t.id) ? " checked" : ""}></label>
          <a href="#qa-tools/tool/${t.id}" class="qa-tlink">${thumb(t)}<div class="qa-tbody"><div class="sub mono">${esc(t.asset_no)}</div><b>${esc(t.name)}</b>
          <div class="sub">${esc([t.brand, t.model, t.spec].filter(x => x && x !== "-").join(" · "))}</div>
          <div class="qa-tags">${stChip(t)}${t.needs_cal ? chip("🎯 " + c.l, c.c) : ""}</div>
          ${l ? `<div class="sub">👤 ยืมโดย ${esc(l.borrower_name)} · คืน ${fmt(l.due_back)}</div>` : t.lendable ? `<div class="sub">🧰 เครื่องมือกลาง ให้ยืมได้</div>` : t.owner_name ? `<div class="sub">🧑‍🔧 ${esc(t.owner_name)}${t.department ? " · " + esc(t.department) : ""}</div>` : ""}</div></a>
          ${canBorrow(t) ? `<button class="qa-btn sm" data-a="borrow" data-id="${t.id}">ยืม</button>` : ""}</div>`; }).join("") || empty}</div>`;
  }

  function vTool() {
    const t = tById(S.tool), m = me();
    if (!t) return `<div class="qa-card">ไม่พบเครื่องมือนี้ <a href="#qa-tools/list">กลับไปทะเบียน</a></div>`;
    const c = calState(t), l = openLoan(t);
    const cals = D.cals.filter(x => x.tool_id === t.id), loans = D.loans.filter(x => x.tool_id === t.id);
    const pendCal = cals.find(x => x.status === "pending_approval"), sentCal = cals.find(x => ["sent", "rejected", "pending_verify"].includes(x.status)), verCal = cals.find(x => x.status === "pending_verify");
    const info = [["รหัสเครื่องมือ", `<span class="mono">${esc(t.asset_no)}</span>`], ["รหัสทรัพย์สิน", t.fixed_asset_no ? `<span class="mono">${esc(t.fixed_asset_no)}</span>` : ""], ["ประเภท", esc(CAT_L[t.category] || t.category || "")], ["ยี่ห้อ / รุ่น", esc([t.brand, t.model].filter(Boolean).join(" / "))],
      ["Serial No.", `<span class="mono">${esc(t.serial_no || "")}</span>`], ["ขนาด / ช่วงวัด", esc(t.spec || "")], ["ผู้ถือครอง", esc([t.owner_name, t.department].filter(Boolean).join(" · "))], ["ที่เก็บ", esc(t.location || "")],
      ["ให้ยืม", t.lendable ? "เครื่องมือกลาง ให้ยืมได้" : ""], ["วันที่เริ่มใช้", t.purchase_date ? fmt(t.purchase_date) + ` <span class="muted">(อายุ ${age(t.purchase_date)})</span>` : ""], ["ราคา", t.price != null ? Number(t.price).toLocaleString() + " บาท" : ""],
      ["สอบเทียบ", t.needs_cal ? `ทุก ${t.cal_interval_m} เดือน · ล่าสุด ${fmt(t.last_cal_date) || "-"} · ครบกำหนด ${chip(c.l, c.c)}` : "ไม่ต้องสอบเทียบ"], ["หมายเหตุ", esc(t.note || "")]].filter(r => r[1]);
    const acts = [];
    if (canBorrow(t)) acts.push(`<button class="qa-btn" data-a="borrow" data-id="${t.id}">🤝 ยืม</button>`);
    else if (t.status === "available" && c.k === "over") acts.push(`<span class="qa-warnbox">⛔ เลยกำหนดสอบเทียบ — ห้ามใช้/ห้ามยืมจนกว่าจะสอบเทียบ</span>`);
    if (l && l.status === "out" && (l.borrower === m.username || m.canManage)) acts.push(`<button class="qa-btn" data-a="ret-req" data-id="${l.id}">↩ แจ้งคืน</button>`);
    if (l && m.canManage) acts.push(`<button class="qa-btn" data-a="receive" data-id="${l.id}">📥 รับคืน</button>`);
    if (m.canManage) {
      acts.push(`<button class="qa-btn ghost" data-a="edit" data-id="${t.id}">✏️ แก้ไข / รูป / เอกสาร</button>`);
      if (!l && t.status !== "retired") acts.push(`<button class="qa-btn ghost" data-a="holder" data-id="${t.id}">🔁 เบิก / เปลี่ยนผู้ถือครอง</button>`);
      if (t.needs_cal && !l && t.status !== "calibration" && t.status !== "retired") acts.push(`<button class="qa-btn ghost" data-a="cal-send" data-id="${t.id}">🚚 ส่งสอบเทียบ</button>`);
      if (t.needs_cal && !pendCal && t.status !== "retired") acts.push(`<button class="qa-btn ghost" data-a="cal-result" data-id="${t.id}"${sentCal ? ` data-cal="${sentCal.id}"` : ""}>📄 บันทึกผลสอบเทียบ</button>`);
      if (verCal) acts.push(`<button class="qa-btn" data-a="cal-verify" data-id="${verCal.id}">🔎 ทวนสอบ (FM-QA-10)</button>`);
      if (!l && !["retire_pending", "retired"].includes(t.status)) acts.push(`<button class="qa-btn ghost danger" data-a="retire" data-id="${t.id}">🗑 ขอจำหน่าย</button>`);
    }
    if (m.canApprove && t.status === "retire_pending") acts.push(`<button class="qa-btn" data-a="retire-ok" data-id="${t.id}">✔ อนุมัติจำหน่าย</button><button class="qa-btn ghost" data-a="retire-no" data-id="${t.id}">✖ ไม่อนุมัติ</button>`);
    acts.push(`<button class="qa-btn ghost" data-a="label" data-id="${t.id}">🏷 ป้าย QR</button>`);
    const docs = (t.docs || []).map(f => `<a class="qa-doc" target="_blank" rel="noopener" href="${esc(docHref(f))}">${f.url ? "🔗" : "📎"} ${esc(f.name || "เอกสาร")}</a>`).join("");
    return `<div class="qa-back"><a href="#qa-tools/list">← ทะเบียนเครื่องมือ</a></div>
      <div class="qa-card qa-detail"><div class="qa-photos">${(t.photos || []).length ? t.photos.map(f => `<a href="${esc(docHref(f))}" target="_blank" rel="noopener" class="qa-thw"><img src="${esc(docHref(f))}"${f.url ? ' class="qa-web"' : ""} referrerpolicy="no-referrer" alt="">${f.url ? `<i class="qa-webtag">รูปตัวอย่างจากอินเทอร์เน็ต</i>` : ""}</a>`).join("") : thumb(t, "qa-th xl")}</div>
        <div class="qa-dinfo"><div class="sub mono">${esc(t.asset_no)}</div><h2>${esc(t.name)}</h2><div class="qa-tags">${stChip(t)}${t.needs_cal ? chip("🎯 สอบเทียบ " + c.l, c.c) : ""}</div>
          ${l ? `<div class="qa-loanbox">👤 <b>${esc(l.borrower_name)}</b> ยืมตั้งแต่ ${fmtT(l.out_at)} · กำหนดคืน <b>${fmt(l.due_back)}</b>${days(l.due_back) < 0 ? " " + chip("เกินกำหนด", "s-bad") : ""}<div class="sub">${esc([l.job_no, l.customer, l.site, l.purpose].filter(Boolean).join(" · "))}</div>${l.status === "return_requested" ? `<div>${chip("แจ้งคืนแล้ว รอผู้ดูแลรับคืน", "s-loan")}</div>` : ""}</div>` : ""}
          ${t.retire_reason && t.status === "retire_pending" ? `<div class="qa-warnbox">ขอจำหน่าย: ${esc(t.retire_reason)}</div>` : ""}
          <table class="qa-kv">${info.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>
          ${docs ? `<div class="qa-docs">${docs}</div>` : ""}
          <div class="qa-acts">${acts.join(" ")}</div></div></div>
      <div class="qa-grid">
        <div class="qa-card"><h3>🎯 ประวัติสอบเทียบ</h3>${cals.length ? `<table class="qa-t"><thead><tr><th>วันที่</th><th>หน่วยงาน</th><th>ผล</th><th>ครบกำหนด</th><th>สถานะ</th></tr></thead><tbody>${cals.map(x => `<tr><td>${fmt(x.cal_date) || "ส่ง " + fmt(x.sent_date)}</td><td>${esc(x.lab || "")}${x.cert_no ? `<div class="sub">ใบรับรอง ${esc(x.cert_no)}</div>` : ""}${(x.docs || []).map(f => ` <a target="_blank" rel="noopener" href="${esc(docHref(f))}" title="${esc(f.name || "ใบรับรอง")}">${f.url ? "🔗" : "📎"}</a>`).join("")}</td><td>${x.result ? chip(RES[x.result], x.result === "fail" ? "s-bad" : "s-ok") : ""}</td><td>${fmt(x.next_due)}</td><td>${calStatus(x)}${x.verify ? ` <button class="qa-lnk" data-a="cal-print" data-id="${x.id}" title="พิมพ์บันทึกผลการทวนสอบ">🖨 FM-QA-10</button>` : ""} <button class="qa-lnk" data-a="cal-view" data-id="${x.id}">📜 ประวัติ</button></td></tr>`).join("")}</tbody></table>` : `<p class="muted">ยังไม่มี</p>`}</div>
        <div class="qa-card"><h3>🤝 ประวัติการยืม</h3>${loans.length ? `<table class="qa-t"><thead><tr><th>ผู้ยืม</th><th>งาน</th><th>ยืม</th><th>คืน</th></tr></thead><tbody>${loans.slice(0, 30).map(x => `<tr><td>${esc(x.borrower_name)}</td><td>${esc([x.job_no, x.customer].filter(Boolean).join(" · "))}</td><td>${fmtT(x.out_at)}</td><td>${x.returned_at ? fmtT(x.returned_at) + (x.return_condition && x.return_condition !== "ok" ? " " + chip(COND[x.return_condition], "s-warn") : "") : chip("ยังไม่คืน", "s-loan")}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">ยังไม่เคยถูกยืม</p>`}</div>
        <div class="qa-card"><h3>🕓 บันทึกการเปลี่ยนแปลง</h3><div id="qaLog" class="sub">กำลังโหลด…</div></div>
      </div>`;
  }
  const calStatus = x => ({ sent: chip("ส่งแล้ว รอผล", "s-cal"), pending_verify: chip("รอทวนสอบ (QA)", "s-cal"), pending_approval: chip("รออนุมัติ", "s-warn"), approved: chip("อนุมัติ · " + (x.approved_by || ""), "s-ok"), rejected: chip("ไม่อนุมัติ", "s-bad") }[x.status] || "") + (x.approve_note ? `<div class="sub">${esc(x.approve_note)}</div>` : "");

  function vLoans() {
    const m = me(), open = D.loans.filter(l => l.status !== "returned").sort((a, b) => String(a.due_back).localeCompare(String(b.due_back)));
    const done = D.loans.filter(l => l.status === "returned").slice(0, 50);
    const tr = l => { const t = tById(l.tool_id) || {}; const n = days(l.due_back);
      return `<tr><td><a href="#qa-tools/tool/${t.id}">${esc(t.name || "?")}</a><div class="sub mono">${esc(t.asset_no || "")}</div></td><td>${esc(l.borrower_name)}</td><td>${esc([l.job_no, l.customer, l.site].filter(Boolean).join(" · "))}</td>
        <td>${fmtT(l.out_at)}</td><td>${fmt(l.due_back)} ${l.status === "returned" ? "" : n < 0 ? chip("เกิน " + (-n) + " วัน", "s-bad") : n <= 1 ? chip(n ? "พรุ่งนี้" : "วันนี้", "s-warn") : ""}</td>
        <td>${l.status === "returned" ? fmtT(l.returned_at) + (l.return_condition !== "ok" ? " " + chip(COND[l.return_condition] || "", "s-warn") : "") + `<div class="sub">รับโดย ${esc(l.received_by || "")}</div>`
          : (l.status === "return_requested" ? chip("แจ้งคืนแล้ว", "s-loan") + " " : "") + (m.canManage ? `<button class="qa-btn sm" data-a="receive" data-id="${l.id}">📥 รับคืน</button>` : l.borrower === m.username && l.status === "out" ? `<button class="qa-btn sm" data-a="ret-req" data-id="${l.id}">↩ แจ้งคืน</button>` : "")}</td></tr>`; };
    const head = `<thead><tr><th>เครื่องมือ</th><th>ผู้ยืม</th><th>งาน / ลูกค้า / ไซต์</th><th>ยืมเมื่อ</th><th>กำหนดคืน</th><th></th></tr></thead>`;
    return `<div class="qa-card qa-scroll"><h3>กำลังถูกยืม (${open.length})</h3><table class="qa-t">${head}<tbody>${open.map(tr).join("") || `<tr><td colspan="6" class="muted">ไม่มี</td></tr>`}</tbody></table></div>
      <div class="qa-card qa-scroll"><h3>🔁 เบิก / เปลี่ยนผู้ถือครองล่าสุด</h3>${(D.holds || []).length ? `<table class="qa-t"><thead><tr><th>เครื่องมือ</th><th>รายละเอียด</th><th>บันทึกโดย</th><th>เมื่อ</th></tr></thead><tbody>${D.holds.slice(0, 60).map(h => { const t = tById(h.tool_id) || {}; return `<tr><td><a href="#qa-tools/tool/${t.id}">${esc(t.asset_no || "")}</a> ${esc(t.name || "")}</td><td>${esc(h.detail || "")}</td><td>${esc(h.by || "")}</td><td>${fmtT(h.at)}</td></tr>`; }).join("")}</tbody></table>` : `<p class="muted">ยังไม่มี — ผู้ดูแลกด “🔁 เบิก / เปลี่ยนผู้ถือครอง” ในหน้าเครื่องมือ</p>`}</div>
      <div class="qa-card qa-scroll"><h3>คืนแล้วล่าสุด (ยืม)</h3><table class="qa-t">${head}<tbody>${done.map(tr).join("") || `<tr><td colspan="6" class="muted">ยังไม่มี</td></tr>`}</tbody></table></div>`;
  }

  function vCal() {
    const m = me(), ts = D.tools.filter(t => active(t) && t.needs_cal);
    const pend = D.cals.filter(c => c.status === "pending_approval"), sent = D.cals.filter(c => c.status === "sent" || c.status === "rejected"), ver = D.cals.filter(c => c.status === "pending_verify");
    const retire = D.tools.filter(t => t.status === "retire_pending");
    const y = today().getFullYear();
    const plan = Array.from({ length: 12 }, (_, i) => ts.filter(t => { const d = parse(t.next_cal_due); return d && d.getFullYear() === y && d.getMonth() === i; }));
    const noDate = ts.filter(t => !t.next_cal_due), overdue = ts.filter(t => calState(t).k === "over");
    const name = c => { const t = tById(c.tool_id) || {}; return `<a href="#qa-tools/tool/${t.id}">${esc(t.name || "?")}</a><div class="sub mono">${esc(t.asset_no || "")}</div>`; };
    return `${m.canApprove || m.canManage ? `<div class="qa-card qa-scroll"><h3>✍️ รออนุมัติผลสอบเทียบ (${pend.length})</h3>${pend.length ? `<table class="qa-t"><thead><tr><th>เครื่องมือ</th><th>วันที่สอบเทียบ</th><th>หน่วยงาน / ใบรับรอง</th><th>ผล</th><th>ครบกำหนดถัดไป</th><th>ค่าใช้จ่าย</th><th></th></tr></thead><tbody>${pend.map(c => `<tr><td>${name(c)}</td><td>${fmt(c.cal_date)}</td><td>${esc(c.lab || "")}<div class="sub">${esc(c.cert_no || "")}</div>${(c.docs || []).map(f => `<a target="_blank" rel="noopener" href="${esc(docHref(f))}">${f.url ? "🔗" : "📎"} ${esc(f.name || "ใบรับรอง")}</a>`).join(" ")}</td><td>${chip(RES[c.result], c.result === "fail" ? "s-bad" : "s-ok")}</td><td>${fmt(c.next_due)}</td><td>${c.cost != null ? Number(c.cost).toLocaleString() : ""}</td><td>${c.verify ? `<button class="qa-lnk" data-a="cal-print" data-id="${c.id}">🖨 FM-QA-10</button>${m.canManage ? ` <button class="qa-lnk" data-a="cal-verify" data-id="${c.id}">✏️ ทวนสอบ</button>` : ""}<br>` : ""}${m.canApprove ? `<button class="qa-btn sm" data-a="cal-ok" data-id="${c.id}">✔ อนุมัติ</button> <button class="qa-btn sm ghost" data-a="cal-no" data-id="${c.id}">✖</button>` : `<span class="sub">รอดิวอนุมัติ</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">ไม่มี</p>`}
      <h4>🔎 รอทวนสอบภายใน โดย QA Engineer (${ver.length})</h4>${ver.length ? `<table class="qa-t"><thead><tr><th>เครื่องมือ</th><th>วันที่สอบเทียบ</th><th>หน่วยงาน / ใบรับรอง</th><th>ผล</th><th></th></tr></thead><tbody>${ver.map(c => `<tr><td>${name(c)}</td><td>${fmt(c.cal_date)}</td><td>${esc(c.lab || "")}<div class="sub">${esc(c.cert_no || "")}</div>${(c.docs || []).map(f => `<a target="_blank" rel="noopener" href="${esc(docHref(f))}">${f.url ? "🔗" : "📎"} ${esc(f.name || "ใบรับรอง")}</a>`).join(" ")}</td><td>${chip(RES[c.result], c.result === "fail" ? "s-bad" : "s-ok")}</td><td>${m.canManage ? `<button class="qa-btn sm" data-a="cal-verify" data-id="${c.id}">🔎 ทวนสอบ</button>` : `<span class="sub">รอ QA Engineer</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">ไม่มี</p>`}
        ${retire.length ? `<h4>🗑 ขอจำหน่าย / เลิกใช้</h4>${retire.map(t => `<div class="qa-row2"><a href="#qa-tools/tool/${t.id}">${esc(t.asset_no + " · " + t.name)}</a> <span class="sub">${esc(t.retire_reason || "")}</span> ${m.canApprove ? `<button class="qa-btn sm" data-a="retire-ok" data-id="${t.id}">✔ อนุมัติ</button> <button class="qa-btn sm ghost" data-a="retire-no" data-id="${t.id}">✖</button>` : ""}</div>`).join("")}` : ""}</div>` : ""}
      <div class="qa-card qa-scroll"><h3>🚚 ส่งสอบเทียบอยู่ (${sent.length})</h3>${sent.length ? `<table class="qa-t"><thead><tr><th>เครื่องมือ</th><th>ส่งวันที่</th><th>หน่วยงาน</th><th>สถานะ</th><th></th></tr></thead><tbody>${sent.map(c => `<tr><td>${name(c)}</td><td>${fmt(c.sent_date)}</td><td>${esc(c.lab || "")}</td><td>${calStatus(c)}</td><td>${m.canManage ? `<button class="qa-btn sm" data-a="cal-result" data-id="${c.tool_id}" data-cal="${c.id}">📄 บันทึกผล</button>` : ""}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">ไม่มี</p>`}</div>
      <div class="qa-card"><h3>📅 แผนสอบเทียบปี ${y}</h3>${overdue.length ? `<div class="qa-warnbox">⛔ เลยกำหนดแล้ว ${overdue.length} รายการ: ${overdue.map(t => `<a href="#qa-tools/tool/${t.id}">${esc(t.asset_no)}</a>`).join(", ")}</div>` : ""}
        <div class="qa-months">${plan.map((ts2, i) => `<div class="qa-month${i === today().getMonth() ? " now" : ""}"><b>${MS[i]}</b><span class="n">${ts2.length || ""}</span>${ts2.map(t => `<a href="#qa-tools/tool/${t.id}" title="${esc(t.name)}">${esc(t.asset_no)}</a>`).join("")}</div>`).join("")}</div>
        ${noDate.length ? `<p class="sub">ยังไม่มีกำหนดสอบเทียบ ${noDate.length} รายการ: ${noDate.map(t => `<a href="#qa-tools/tool/${t.id}">${esc(t.asset_no)}</a>`).join(", ")}</p>` : ""}
        <button class="qa-btn ghost" data-a="cal-xlsx">⬇ Excel แผนสอบเทียบ</button></div>`;
  }

  /* import */
  const COLMAP = { "รหัสเครื่องมือ": "asset_no", "รหัส": "asset_no", "tool code": "asset_no", "รหัสทรัพย์สิน": "fixed_asset_no", "asset no": "fixed_asset_no", "asset no.": "fixed_asset_no",
    "รายชื่อเครื่องมือวัด": "name", "ผู้ถือครอง": "owner_name", "แผนก": "department", "หน่วยงาน": "department", "วันที่เริ่มใช้": "purchase_date", "ขนาด": "spec", "ให้ยืมได้": "lendable", "code": "asset_no", "ชื่อเครื่องมือ": "name", "ชื่อ": "name", "รายการ": "name", "name": "name", "description": "name",
    "ประเภท": "category", "category": "category", "ยี่ห้อ": "brand", "brand": "brand", "รุ่น": "model", "model": "model", "serial no.": "serial_no", "serial no": "serial_no", "s/n": "serial_no", "serial": "serial_no",
    "spec": "spec", "ช่วงวัด": "spec", "range": "spec", "ที่เก็บ": "location", "สถานที่เก็บ": "location", "location": "location", "ผู้รับผิดชอบ": "owner_name", "owner": "owner_name",
    "วันที่ซื้อ": "purchase_date", "purchase date": "purchase_date", "ราคา": "price", "price": "price", "ต้องสอบเทียบ": "needs_cal", "สอบเทียบทุก (เดือน)": "cal_interval_m", "ความถี่สอบเทียบ (เดือน)": "cal_interval_m",
    "สอบเทียบล่าสุด": "last_cal_date", "last calibration": "last_cal_date", "วันที่สอบเทียบล่าสุด": "last_cal_date", "ครบกำหนดสอบเทียบ": "next_cal_due", "next calibration": "next_cal_due", "due date": "next_cal_due", "หมายเหตุ": "note", "note": "note" };
  const toIso = v => { if (typeof v === "number" && v > 1000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
    const s = String(v || "").trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); if (m) { let y = +m[3]; if (y < 100) y += 2000; if (y > 2400) y -= 543; return y + "-" + pad(m[2]) + "-" + pad(m[1]); } return ""; };
  const catOf = v => { const s = String(v || "").toLowerCase().trim(); if (CATS.some(c => c[0] === s)) return s; const lab = CATS.find(c => c[1].replace(/^\S+\s/, "").toLowerCase() === s); if (lab) return lab[0]; if (/วัด|measur|gauge|caliper|เวอร์เนีย|ไมโคร|ตลับ|ระดับ/.test(s)) return "measuring"; if (/มิเตอร์|meter|ไฟฟ้า|electric|megger|insulation/.test(s)) return "electrical"; if (/สว่าน|เจียร|drill|grinder|power/.test(s)) return "power"; if (/รอก|สลิง|hoist|sling|ยก/.test(s)) return "lifting"; if (/safety|ปลอดภัย|harness/.test(s)) return "safety"; if (/ประแจ|ไขควง|hand|wrench/.test(s)) return "hand"; return s ? "other" : ""; };
  async function readImport(file) {
    let X; try { X = await lib("xlsx"); } catch (e) { return toast(e.message, 1); }
    const wb = X.read(await file.arrayBuffer());
    const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    const hi = aoa.findIndex(r => r.filter(c => COLMAP[String(c).trim().toLowerCase()]).length >= 2);
    if (hi < 0) return toast("ไม่พบหัวคอลัมน์ เช่น 'รหัสทรัพย์สิน' และ 'ชื่อเครื่องมือ'", 1);
    const cols = aoa[hi].map(c => COLMAP[String(c).trim().toLowerCase()] || null);
    S.imp = aoa.slice(hi + 1).map(r => { const o = {}; cols.forEach((k, i) => { if (k && r[i] !== "" && r[i] != null && !(k in o)) o[k] = r[i]; }); return o; })
      .filter(o => o.asset_no || o.name).map(o => { for (const k of ["purchase_date", "last_cal_date", "next_cal_due"]) if (o[k] != null) o[k] = toIso(o[k]); if (o.category != null) o.category = catOf(o.category); o.asset_no = String(o.asset_no ?? "").trim(); o.name = String(o.name ?? "").trim(); if (o.owner_name) o.owner_name = String(o.owner_name).replace(/\s+/g, " ").trim(); for (const k of ["brand", "model", "spec"]) if (String(o[k] ?? "").trim() === "-") delete o[k]; return o; });
    draw();
  }
  function vImport() {
    if (!S.imp) return `<div class="qa-card"><h3>⬆ นำเข้าทะเบียนเครื่องมือจาก Excel</h3>
      <p>แถวหัวตารางควรมี <code>รหัส</code> <code>รายชื่อเครื่องมือวัด</code> และถ้ามี: <code>ยี่ห้อ</code> <code>รุ่น</code> <code>ขนาด</code> <code>ผู้ถือครอง</code> <code>แผนก</code> <code>วันที่เริ่มใช้</code> <code>รหัสทรัพย์สิน</code> <code>ประเภท</code> <code>Serial No.</code> <code>ที่เก็บ</code> <code>ราคา</code> <code>ให้ยืมได้</code> <code>ต้องสอบเทียบ</code> <code>สอบเทียบทุก (เดือน)</code> <code>สอบเทียบล่าสุด</code> <code>ครบกำหนดสอบเทียบ</code> <code>หมายเหตุ</code></p>
      <p class="muted">รหัสเครื่องมือที่มีอยู่แล้วจะอัปเดตทับ · รูปและใบรับรองเพิ่มทีหลังในหน้ารายละเอียด</p><input type="file" id="qaImp" accept=".xlsx,.xls,.csv"></div>`;
    const bad = S.imp.filter(o => !o.asset_no || !o.name).length;
    return `<div class="qa-card qa-scroll"><h3>ตรวจก่อนนำเข้า — ${S.imp.length} รายการ${bad ? ` <span class="bad">(ไม่มีรหัส/ชื่อ ${bad})</span>` : ""}</h3><table class="qa-t"><thead><tr><th>รหัส</th><th>ชื่อ</th><th>ประเภท</th><th>ยี่ห้อ / รุ่น</th><th>ขนาด</th><th>ผู้ถือครอง</th><th>เริ่มใช้</th><th>สอบเทียบล่าสุด</th><th>ครบกำหนด</th></tr></thead><tbody>
      ${S.imp.slice(0, 500).map(o => `<tr class="${!o.asset_no || !o.name ? "bad" : ""}"><td class="mono">${esc(o.asset_no)}</td><td>${esc(o.name)}</td><td>${esc(CAT_L[o.category] || "")}</td><td>${esc([o.brand, o.model].filter(Boolean).join(" / "))}</td><td>${esc(o.spec || "")}</td><td>${esc(o.owner_name || "")}<div class="sub">${esc(o.department || "")}</div></td><td>${fmt(o.purchase_date)}</td><td>${fmt(o.last_cal_date)}</td><td>${fmt(o.next_cal_due)}</td></tr>`).join("")}
      </tbody></table><div class="qa-acts"><button class="qa-btn" data-a="imp-go">นำเข้า ${S.imp.length - bad} รายการ</button> <button class="qa-btn ghost" data-a="imp-cancel">ยกเลิก</button></div></div>`;
  }

  /* ---------- dialogs ---------- */
  function dialog(title, body, onSave, saveLabel = "บันทึก") {
    const m = document.createElement("div"); m.className = "qa-modal";
    m.innerHTML = `<div class="qa-dlg"><h3>${title}</h3>${body}<div class="qa-err" id="dErr"></div><div class="qa-acts"><button class="qa-btn" data-d="save">${saveLabel}</button> <button class="qa-btn ghost" data-d="close">ยกเลิก</button></div></div>`;
    document.body.appendChild(m);
    const v = id => { const e = m.querySelector("#" + id); return e ? (e.type === "checkbox" ? e.checked : e.value.trim()) : undefined; };
    m.addEventListener("click", async e => {
      const a = e.target.closest("[data-d]")?.dataset.d; if (e.target === m || a === "close") return m.remove();
      if (a !== "save") return;
      const btn = e.target.closest("button"); btn.disabled = true;
      try { await onSave(v, m); m.remove(); } catch (x) { m.querySelector("#dErr").textContent = x.message; btn.disabled = false; }
    });
    return m;
  }
  const fld = (id, l, val, type = "text", extra = "") => `<label>${l}<input id="${id}" type="${type}" value="${esc(val ?? "")}"${extra}></label>`;
  const sel = (id, l, opts, val) => `<label>${l}<select id="${id}">${opts.map(([k, t]) => `<option value="${k}"${String(val ?? "") === k ? " selected" : ""}>${t}</option>`).join("")}</select></label>`;
  async function refresh(msg) { toast(msg); S.audit = null; await load(true); }

  function dlgBorrow(t) {
    const m = me();
    dialog(`🤝 ยืม: ${esc(t.asset_no)} · ${esc(t.name)}`, `<div class="qa-form">
      ${m.canManage ? fld("bWho", "ยืมแทน (ชื่อคนยืม — เว้นว่าง = ตัวเอง)", "") : ""}
      ${fld("bJob", "Job no.", "")}${fld("bCus", "ลูกค้า", "", "text", " data-customer")}${fld("bSite", "ไซต์ / สถานที่ใช้งาน", "")}
      ${fld("bDue", "วันที่จะคืน *", addDays(7), "date", ` min="${TODAY()}"`)}<label class="wide">ใช้ทำอะไร<input id="bPur"></label></div>
      <p class="sub">เครื่องมือจะเป็นชื่อคุณจนกว่าผู้ดูแลจะ “รับคืน” — ใช้เสร็จกด “แจ้งคืน” แล้วนำไปคืนที่ผู้ดูแล</p>`,
      async v => { await post("borrow", { tool_id: t.id, borrower_name: v("bWho"), job_no: v("bJob"), customer: v("bCus"), site: v("bSite"), due_back: v("bDue"), purpose: v("bPur") }); await refresh("ยืมแล้ว"); }, "ยืนยันการยืม");
  }
  function dlgReceive(loan) {
    const t = tById(loan.tool_id) || {};
    dialog(`📥 รับคืน: ${esc(t.asset_no || "")} · ${esc(t.name || "")}`, `<p>ผู้ยืม: <b>${esc(loan.borrower_name)}</b>${loan.return_note ? ` · <span class="sub">${esc(loan.return_note)}</span>` : ""}</p><div class="qa-form">
      ${sel("rCond", "สภาพตอนรับคืน", Object.entries(COND), "ok")}<label class="wide">หมายเหตุ<input id="rNote"></label></div><p class="sub">ถ้าชำรุด / อุปกรณ์ไม่ครบ สถานะเครื่องมือจะเป็น “ซ่อม / ชำรุด”</p>`,
      async v => { await post("receive", { id: loan.id, condition: v("rCond"), note: v("rNote") }); await refresh("รับคืนแล้ว"); }, "รับคืน");
  }
  function dlgTool(t) {
    const x = t || { needs_cal: true, cal_interval_m: 12, photos: [], docs: [] };
    const photos = (x.photos || []).slice(), docs = (x.docs || []).slice();
    const files = () => `<div class="qa-files">${photos.map((f, i) => `<span class="qa-f"><img src="${esc(docHref(f))}" referrerpolicy="no-referrer" alt=""><button type="button" data-rm="p${i}" title="ลบ">×</button></span>`).join("")}
      <label class="qa-add">📷 เพิ่มรูป<input type="file" id="tPh" accept="image/*" multiple hidden></label></div>
      <div class="qa-docs">${docs.map((f, i) => `<span class="qa-doc">📎 ${esc(f.name)} <button type="button" data-rm="d${i}">×</button></span>`).join("")}<label class="qa-add">📎 แนบเอกสาร (PDF / รูป)<input type="file" id="tDoc" accept="application/pdf,image/*" multiple hidden></label></div>`;
    const m = dialog(t ? "✏️ แก้ไขเครื่องมือ" : "+ เพิ่มเครื่องมือ", `<div class="qa-form">
      ${fld("tNo", "รหัสเครื่องมือ * (ตามสติกเกอร์ เช่น PM-03)", x.asset_no)}${fld("tName", "ชื่อเครื่องมือ *", x.name)}${sel("tCat", "ประเภท", [["", "—"], ...CATS], x.category)}
      ${fld("tFa", "รหัสทรัพย์สิน (AP02-…)", x.fixed_asset_no)}
      ${fld("tBrand", "ยี่ห้อ", x.brand)}${fld("tModel", "รุ่น", x.model)}${fld("tSn", "Serial No.", x.serial_no)}
      ${fld("tSpec", "ขนาด / ช่วงวัด / ความละเอียด", x.spec)}${fld("tOwner", "ผู้ถือครอง", x.owner_name)}${fld("tDept", "แผนก", x.department, "text", ' list="qaDepts"')}${fld("tLoc", "ที่เก็บ", x.location)}
      ${fld("tBuy", "วันที่เริ่มใช้ (ใช้คำนวณอายุ)", x.purchase_date, "date")}${fld("tPrice", "ราคา (บาท)", x.price, "number", ' min="0"')}
      ${t && ["available", "repair", "lost"].includes(x.status) ? sel("tSt", "สถานะ", [["available", "ใช้งานได้ / ยืมได้"], ["repair", "ซ่อม / ชำรุด"], ["lost", "สูญหาย"]], x.status) : ""}
      <label class="qa-ck"><input type="checkbox" id="tLend"${x.lendable ? " checked" : ""}> เครื่องมือกลาง ให้ยืมได้</label>
      <label class="qa-ck"><input type="checkbox" id="tCal"${x.needs_cal ? " checked" : ""}> ต้องสอบเทียบ</label>
      ${fld("tInt", "สอบเทียบทุก (เดือน)", x.cal_interval_m, "number", ' min="1" max="120"')}${fld("tLast", "สอบเทียบล่าสุด", x.last_cal_date, "date")}${fld("tNext", "ครบกำหนดครั้งถัดไป (ว่าง = คำนวณให้)", x.next_cal_due, "date")}
      <label class="wide">หมายเหตุ<input id="tNote" value="${esc(x.note || "")}"></label></div>
      <datalist id="qaDepts">${depts().map(d => `<option value="${esc(d)}">`).join("")}</datalist>
      <h4>รูปเครื่องมือ และเอกสาร (คู่มือ / ใบรับรอง / ใบซื้อ)</h4><div id="tFiles">${files()}</div>`,
      async v => {
        const pk = f => f.url || f.p, before = new Set((x.photos || []).map(pk)), added = photos.filter(f => !before.has(pk(f)));
        photos.sort((a, b) => (a.kind === "web") - (b.kind === "web"));   // real photos before web samples
        await post("tool", { id: t ? t.id : 0, asset_no: v("tNo"), name: v("tName"), category: v("tCat"), brand: v("tBrand"), model: v("tModel"), serial_no: v("tSn"), spec: v("tSpec"),
          location: v("tLoc"), owner_name: v("tOwner"), department: v("tDept"), fixed_asset_no: v("tFa"), lendable: v("tLend"), purchase_date: v("tBuy"), price: v("tPrice"), status: v("tSt"), needs_cal: v("tCal"), cal_interval_m: v("tInt"),
          last_cal_date: v("tLast"), next_cal_due: v("tNext"), note: v("tNote"), photos, docs });
        await refresh("บันทึกแล้ว");
        const sib = t && added.length ? sameItem({ ...t, name: v("tName"), brand: v("tBrand"), model: v("tModel"), spec: v("tSpec") }) : [];
        if (sib.length) setTimeout(() => dlgSharePhotos(t, added, sib), 50);
      });
    const box = m.querySelector("#tFiles");
    const rebind = () => {
      box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { const k = b.dataset.rm; (k[0] === "p" ? photos : docs).splice(+k.slice(1), 1); box.innerHTML = files(); rebind(); });
      [["tPh", photos], ["tDoc", docs]].forEach(([id, arr]) => { const inp = box.querySelector("#" + id); inp.onchange = async () => {
        const err = m.querySelector("#dErr"); err.textContent = "กำลังอัปโหลด…";
        try { for (const f of inp.files) arr.push(await upload(f, t ? t.id : "new")); err.textContent = ""; } catch (x) { err.textContent = x.message; }
        box.innerHTML = files(); rebind(); }; });
    };
    rebind();
  }
  // same item under other codes = same name + brand + model + size (ignoring case / spaces / "-")
  const itemKey = t => [t.name, t.brand, t.model, t.spec].map(v => String(v || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/^-$/, "")).join("|");
  const sameItem = t => { const k = itemKey(t); return D.tools.filter(o => o.id !== t.id && o.status !== "retired" && itemKey(o) === k).sort((a, b) => String(a.asset_no).localeCompare(String(b.asset_no), undefined, { numeric: true })); };
  function dlgSharePhotos(t, added, sib) {
    const m = dialog(`📷 เพิ่มรูปให้รายการเดียวกันด้วยไหม?`, `<p>เพิ่มรูปใหม่ ${added.length} รูปให้ <b>${esc(t.asset_no)}</b> แล้ว — มีอีก <b>${sib.length}</b> รหัสที่เป็นรายการเดียวกัน (${esc([t.name, t.brand, t.model, t.spec].filter(v => v && v !== "-").join(" · "))})</p>
      <div class="qa-files">${added.map(f => `<span class="qa-f"><img src="${esc(docHref(f))}" referrerpolicy="no-referrer" alt=""></span>`).join("")}</div>
      <p class="sub"><label class="qa-ck"><input type="checkbox" id="sAll" checked> เลือกทั้งหมด</label></p>
      <div class="qa-sib">${sib.map(o => `<label class="qa-ck"><input type="checkbox" data-sib="${o.id}" checked> <span class="mono">${esc(o.asset_no)}</span> <span class="sub">${esc(o.owner_name || "")}${(o.photos || []).some(f => f.kind !== "web") ? " · มีรูปแล้ว" : ""}</span></label>`).join("")}</div>
      <p class="sub">รูปจะเพิ่มต่อจากรูปเดิมของแต่ละรหัส (ไม่ลบรูปเดิม) และอยู่ก่อนรูปตัวอย่างจากอินเทอร์เน็ต</p>`,
      async () => { const ids = [...m.querySelectorAll("[data-sib]:checked")].map(c => +c.dataset.sib); if (!ids.length) throw new Error("เลือกอย่างน้อย 1 รหัส หรือกด “เฉพาะรหัสนี้”");
        const r = await post("photos-share", { from_id: t.id, ids, photos: added }); await refresh(`เพิ่มรูปให้อีก ${(r && r.updated) || ids.length} รหัสแล้ว`); }, "✔ เพิ่มให้รหัสที่เลือก");
    const cancel = m.querySelector('[data-d="close"]'); if (cancel) cancel.textContent = "เฉพาะรหัสนี้";
    const all = m.querySelector("#sAll"); all.onchange = () => m.querySelectorAll("[data-sib]").forEach(c => { c.checked = all.checked; });
  }
  const depts = () => [...new Set(["ประกันคุณภาพ", "กลโลหะ", "พลาสติก", "ไฟฟ้า", "วิศวกรรม", "ติดตั้งและบริการ", "คลังสินค้า", "วางแผนการผลิต", "การตลาด", ...D.tools.map(t => t.department).filter(Boolean)])];
  function dlgHolder(t) {
    dialog(`🔁 เบิก / เปลี่ยนผู้ถือครอง: ${esc(t.asset_no)} · ${esc(t.name)}`, `<p>ผู้ถือครองตอนนี้: <b>${esc(t.owner_name || "คลัง QA")}</b>${t.department ? " · " + esc(t.department) : ""}</p><div class="qa-form">
      ${fld("hName", "ผู้ถือครองใหม่ (เว้นว่าง = คืนเข้าคลัง QA)", "")}${fld("hDept", "แผนก", "", "text", ' list="qaDepts2"')}${fld("hDate", "วันที่", TODAY(), "date")}
      ${sel("hWhy", "สาเหตุ", [["", "—"], ["เบิกใหม่", "เบิกใหม่"], ["ลาออก", "ลาออก"], ["ชำรุด", "ชำรุด"], ["สเกลไม่ชัด", "สเกลไม่ชัด"], ["โอนย้าย", "โอนย้ายแผนก / คน"], ["อื่นๆ", "อื่นๆ"]], "")}
      ${["available", "repair", "lost"].includes(t.status) ? sel("hSt", "สถานะเครื่องมือ", [["available", "ใช้งานได้ / ยืมได้"], ["repair", "ซ่อม / ชำรุด"], ["lost", "สูญหาย"]], t.status) : ""}
      <label class="wide">หมายเหตุ<input id="hNote"></label></div><datalist id="qaDepts2">${depts().map(d => `<option value="${esc(d)}">`).join("")}</datalist>
      <p class="sub">บันทึกแทนชีต “เบิก/คืนเครื่องมือ” — ดูย้อนหลังได้ที่แท็บ ยืม-คืน และบันทึกการเปลี่ยนแปลงของเครื่องมือ · ถ้าชำรุดจนใช้ไม่ได้ ให้กด “ขอจำหน่าย” ต่อ</p>`,
      async v => { await post("holder", { id: t.id, owner_name: v("hName"), department: v("hDept"), date: v("hDate"), reason: v("hWhy"), status: v("hSt"), note: v("hNote") }); await refresh("บันทึกแล้ว"); });
  }
  function dlgCalSend(t) {
    dialog(`🚚 ส่งสอบเทียบ: ${esc(t.asset_no)} · ${esc(t.name)}`, `<div class="qa-form">${fld("cDate", "วันที่ส่ง", TODAY(), "date")}${labSel("cLab", "หน่วยงานสอบเทียบ (Lab)", lastLab(t))}<label class="wide">หมายเหตุ<input id="cNote"></label></div>`,
      async v => { await post("cal-send", { tool_id: t.id, sent_date: v("cDate"), lab: v("cLab"), note: v("cNote") }); await refresh("บันทึกการส่งสอบเทียบแล้ว"); });
  }
  const LABS = ["Thai Heart Calibration Co., Ltd. (THC)", "Quality Calibration Co.,Ltd. (QC)"];   // หน่วยงานสอบเทียบภายนอก
  const labOf = v => { const s = String(v || "").trim(); return /^thai\s*h/i.test(s) ? LABS[0] : /^quality\s*cal/i.test(s) || /^qc$/i.test(s) ? LABS[1] : s; };   // old short names → full name
  const labSel = (id, l, val) => { const cur = labOf(val), opts = LABS.concat(cur && !LABS.includes(cur) ? [cur] : []);
    return `<label>${l}<select id="${id}"><option value="">— เลือก —</option>${opts.map(o => `<option value="${esc(o)}"${o === cur ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`; };
  const lastLab = t => (D.cals.find(c => c.tool_id === t.id && c.lab) || {}).lab || "";
  function dlgCalResult(t, calId) {
    const c = D.cals.find(x => x.id === +calId) || {};
    const files = (c.docs || []).filter(f => !f.url), link = ((c.docs || []).find(f => f.url) || {}).url || "";   // certificate = link (files uploaded earlier are kept)
    const m = dialog(`📄 ผลสอบเทียบ: ${esc(t.asset_no)} · ${esc(t.name)}`, `<div class="qa-form">
      ${fld("rDate", "วันที่สอบเทียบ *", c.cal_date || TODAY(), "date")}${labSel("rLab", "หน่วยงาน (Lab)", c.lab || lastLab(t))}${fld("rCert", "เลขที่ใบรับรอง (Certificate No.)", c.cert_no)}
      ${sel("rRes", "ผล *", [["", "— เลือก —"], ...Object.entries(RES)], c.result)}${fld("rNext", "ครบกำหนดครั้งถัดไป (ว่าง = +" + (t.cal_interval_m || 12) + " เดือน)", c.next_due, "date")}${fld("rCost", "ค่าใช้จ่าย (บาท)", c.cost, "number", ' min="0"')}
      <label class="wide">🔗 ลิงก์ใบรับรอง (Certificate) — วางลิงก์ Google Drive / OneDrive ที่เก็บไฟล์<input id="rLink" type="url" placeholder="https://drive.google.com/..." value="${esc(link)}"></label>
      <label class="wide">หมายเหตุ<input id="rNote" value="${esc(c.note || "")}"></label></div>
      ${files.length ? `<div class="qa-docs">${files.map(f => `<a class="qa-doc" target="_blank" rel="noopener" href="${fileUrl(f.p)}">📎 ${esc(f.name || "ใบรับรอง")}</a>`).join("")}</div>` : ""}
      <p class="sub">บันทึกแล้วไปที่ <b>รอทวนสอบ</b> — QA Engineer ทวนสอบ (FM-QA-10) แล้วส่งให้ดิวอนุมัติ · อนุมัติแล้ววันครบกำหนดใหม่จึงมีผล และเครื่องมือกลับมาใช้งานได้</p>`,
      async v => { const url = String(v("rLink") || "").trim();
        if (url && !isLink(url)) throw new Error("ลิงก์ใบรับรองต้องขึ้นต้นด้วย https://");
        const docs = files.concat(url ? [{ url, name: "ใบรับรอง" + (v("rCert") ? " " + v("rCert") : ""), kind: "cert" }] : []);
        await post("cal-result", { tool_id: t.id, id: calId || 0, cal_date: v("rDate"), lab: v("rLab"), cert_no: v("rCert"), result: v("rRes"), next_due: v("rNext"), cost: v("rCost"), note: v("rNote"), docs }); await refresh("บันทึกผลแล้ว รอทวนสอบ"); }, "บันทึก + ส่งอนุมัติ");
  }
  function dlgNote(title, label, cb, saveLabel) { dialog(title, `<div class="qa-form"><label class="wide">${label}<input id="nNote"></label></div>`, async v => cb(v("nNote")), saveLabel); }

  /* ---------- labels / excel ---------- */
  /* ---------- ประวัติการทำรายการ: every action by every user (qa_tool_log) — ดิว only ---------- */
  function loadAudit(force) {
    if (S.audit && !force) return;
    S.audit = { loading: true, log: [] };
    fetch("/api/qa-tools/audit", { cache: "no-store" }).then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { S.audit = ok ? { log: j.log || [] } : { err: j.error || "โหลดไม่สำเร็จ", log: [] }; if (S.page === "audit") draw(); })
      .catch(() => { S.audit = { err: "โหลดไม่สำเร็จ", log: [] }; if (S.page === "audit") draw(); });
  }
  function vAudit() {
    if (!me().canApprove) return `<div class="qa-card muted">ดูได้เฉพาะดิว</div>`;
    loadAudit();
    const A = S.audit || { loading: true, log: [] };
    if (A.loading) return `<div class="qa-card muted">กำลังโหลดประวัติ…</div>`;
    if (A.err) return `<div class="qa-card qa-warnbox">${esc(A.err)}</div>`;
    const L = A.log, users = [...new Set(L.map(x => x.by).filter(Boolean))].sort(), acts = [...new Set(L.map(x => x.action).filter(Boolean))].sort();
    const months = [...new Set(L.map(x => String(x.at || "").slice(0, 7)).filter(Boolean))].sort().reverse();
    const q = S.aq.trim().toLowerCase();
    const rows = L.filter(x => { const t = tById(x.tool_id) || {};
      return (!S.au || x.by === S.au) && (!S.aa || x.action === S.aa) && (!S.am || String(x.at || "").startsWith(S.am))
        && (!q || [t.asset_no, t.name, x.by, x.action, x.detail].some(v => String(v || "").toLowerCase().includes(q))); });
    const mLabel = ym => { const [y, mo] = ym.split("-"); return MS[+mo - 1] + " " + y; };
    const show = rows.slice(0, 500);
    return `<div class="qa-card"><div class="qa-bar"><input id="qaAq" placeholder="🔍 รหัส / ชื่อเครื่องมือ / ผู้ทำ / รายละเอียด" value="${esc(S.aq)}">
      <select id="qaAu"><option value="">ทุกคน</option>${users.map(u => `<option${S.au === u ? " selected" : ""}>${esc(u)}</option>`).join("")}</select>
      <select id="qaAa"><option value="">ทุกรายการ</option>${acts.map(a => `<option${S.aa === a ? " selected" : ""}>${esc(a)}</option>`).join("")}</select>
      <select id="qaAm"><option value="">ทุกเดือน</option>${months.map(ym => `<option value="${ym}"${S.am === ym ? " selected" : ""}>${mLabel(ym)}</option>`).join("")}</select>
      <button class="qa-btn ghost" data-a="audit-reload">↻ โหลดใหม่</button></div>
      <p class="sub">${rows.length.toLocaleString()} รายการ${rows.length > show.length ? ` · แสดง ${show.length} ล่าสุด — กรองเพิ่มเพื่อดูที่เหลือ` : ""} · ทุกการทำรายการของทุกคนในเมนู QA Tools (ยืม-คืน, เพิ่ม / แก้ไขเครื่องมือ, สอบเทียบ, ทวนสอบ, อนุมัติ, ลบ) · ดูได้เฉพาะดิว</p>
      <div class="qa-scroll"><table class="qa-t"><thead><tr><th>เมื่อ</th><th>ผู้ทำ</th><th>รายการ</th><th>เครื่องมือ</th><th>รายละเอียด</th><th></th></tr></thead><tbody>
      ${show.map(x => { const t = tById(x.tool_id), c = x.cal_id && D.cals.find(k => k.id === x.cal_id); return `<tr><td class="sub" style="white-space:nowrap">${fmtT(x.at)}</td><td>${esc(x.by || "")}</td><td><b>${esc(x.action || "")}</b></td>
        <td>${t ? `<a href="#qa-tools/tool/${t.id}">${esc(t.asset_no)}</a><div class="sub">${esc(t.name)}</div>` : `<span class="sub">${x.tool_id ? "#" + x.tool_id : "—"}</span>`}</td>
        <td class="sub">${esc(x.detail || "")}</td><td>${c ? `<button class="qa-lnk" data-a="cal-view" data-id="${c.id}" title="ดูรายการสอบเทียบนี้">🎯</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">ไม่พบรายการ</td></tr>`}
      </tbody></table></div></div>`;
  }
  const x0 = c => ({ ...c, approve_note: "" });   // status chip without the note (shown in the detail)
  function dlgCalDelete(c, t) {   // ดิว only (checked again by the API)
    dialog(`🗑 ลบรายการสอบเทียบ: ${esc(t.asset_no || "")} · ${esc(t.name || "")}`, `<p>ลบรายการ ${c.cal_date ? "สอบเทียบ " + fmt(c.cal_date) : "ส่งสอบเทียบ " + fmt(c.sent_date)} ${esc(c.lab || "")}${c.verify ? " · รวมการทวนสอบ " + esc(c.verify.no || "") : ""} — ลบแล้วกู้คืนไม่ได้</p>
      ${c.status === "approved" ? `<p class="qa-warnbox">รายการนี้อนุมัติแล้ว — วันสอบเทียบล่าสุด / ครบกำหนดของเครื่องมือจะกลับไปใช้รายการที่อนุมัติก่อนหน้า (ถ้ามี)</p>` : ""}
      <div class="qa-form"><label class="wide">เหตุผลที่ลบ *<input id="dReason" placeholder="เช่น บันทึกผิดเครื่อง / ซ้ำ"></label></div>
      <p class="sub">ไทม์ไลน์ของเครื่องมือจะบันทึกว่าใครลบ เมื่อไร และข้อมูลที่ลบ</p>`,
      async v => { if (!v("dReason")) throw new Error("ใส่เหตุผลที่ลบ"); await post("cal-delete", { id: c.id, reason: v("dReason") }); await refresh("ลบรายการสอบเทียบแล้ว"); }, "🗑 ยืนยันลบ");
  }
  function dlgCalView(c) {
    if (!c) return toast("ไม่พบรายการ", 1);
    const t = tById(c.tool_id) || {}, v = c.verify, m = me();
    const kv = rows => `<table class="qa-kv">${rows.filter(r => r[1]).map(([k, val]) => `<tr><th>${k}</th><td>${val}</td></tr>`).join("")}</table>`;
    const acts = [m.canManage && ["sent", "rejected", "pending_verify", "pending_approval"].includes(c.status) ? `<button class="qa-btn sm ghost" data-v="edit">✏️ แก้ไขผลสอบเทียบ</button>` : "",
      m.canManage && c.cal_date && ["pending_verify", "pending_approval", "rejected"].includes(c.status) ? `<button class="qa-btn sm ghost" data-v="verify">🔎 ${v ? "แก้ไขการทวนสอบ" : "ทวนสอบ"}</button>` : "",
      v ? `<button class="qa-btn sm ghost" data-v="print">🖨 FM-QA-10</button>` : "",
      m.canApprove ? `<button class="qa-btn sm ghost danger" data-v="delete">🗑 ลบรายการนี้</button>` : ""].filter(Boolean).join(" ");
    const mdl = dialog(`📜 ประวัติสอบเทียบ: ${esc(t.asset_no || "")} · ${esc(t.name || "")}`, `
      <div class="qa-tags">${calStatus(x0(c))}</div>${acts ? `<div class="qa-acts">${acts}</div>` : ""}
      <h4>🎯 ผลสอบเทียบ</h4>${kv([["ส่งสอบเทียบ", fmt(c.sent_date)], ["วันที่สอบเทียบ", fmt(c.cal_date)], ["หน่วยงาน (Lab)", esc(c.lab || "")], ["เลขที่ใบรับรอง", esc(c.cert_no || "")],
        ["ใบรับรอง", (c.docs || []).map(f => `<a target="_blank" rel="noopener" href="${esc(docHref(f))}">${f.url ? "🔗" : "📎"} ${esc(f.name || "ใบรับรอง")}</a>`).join(" ")], ["ผล", c.result ? chip(RES[c.result], c.result === "fail" ? "s-bad" : "s-ok") : ""],
        ["ครบกำหนดถัดไป", fmt(c.next_due)], ["ค่าใช้จ่าย", c.cost != null ? Number(c.cost).toLocaleString() + " บาท" : ""], ["หมายเหตุ", esc(c.note || "")]]) || `<p class="muted">ยังไม่มีผล</p>`}
      <h4>🔎 ทวนสอบภายใน (FM-QA-10)</h4>${v ? kv([["Verify No.", `<span class="mono">${esc(v.no || "")}</span>`], ["วันที่ดำเนินการ", fmt(v.date)], ["ผู้ทวนสอบ", esc([v.name, v.position].filter(Boolean).join(" · "))], ["Reference Cer No.", esc(v.ref_cert || "")], ["เกณฑ์การยอมรับ", esc(v.criteria || "")]])
        + `<table class="qa-t"><thead><tr><th>จุดสอบเทียบ</th><th>Error</th><th>Uncertainty</th><th>MPE</th><th>ผล</th></tr></thead><tbody>${(v.points || []).map(x => `<tr><td>${esc(x.pt)}</td><td>${esc(x.err)}</td><td>${esc(x.unc)}</td><td>${esc(x.mpe)}</td><td>${x.ok ? chip("ผ่าน", "s-ok") : chip("ไม่ผ่าน", "s-bad")}</td></tr>`).join("")}</tbody></table>`
        + kv([["บันทึกเพิ่มเติม", esc(v.note || "")], ["มาตรการป้องกัน", esc(v.protect || "")]]) : `<p class="muted">ยังไม่ได้ทวนสอบ</p>`}
      <h4>✍️ อนุมัติ</h4>${c.approved_at ? kv([["ผล", c.status === "approved" ? chip("อนุมัติ", "s-ok") : chip("ไม่อนุมัติ", "s-bad")], ["โดย", esc(c.approved_by || "")], ["เมื่อ", fmtT(c.approved_at)], ["หมายเหตุ", esc(c.approve_note || "")]]) : `<p class="muted">ยังไม่อนุมัติ</p>`}
      <h4>🕑 ไทม์ไลน์</h4><div id="vTl" class="sub">กำลังโหลด…</div>`, async () => {}, "ปิด");
    mdl.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { mdl.remove(); const k = b.dataset.v; if (k === "edit") dlgCalResult(t, c.id); else if (k === "verify") dlgVerify(c); else if (k === "delete") dlgCalDelete(c, t); else printVerify(c); });
    const item = x => `<div class="qa-log"><b>${esc(x.action)}</b> · ${esc(x.by || "")} · ${fmtT(x.at)}${x.detail ? `<div>${esc(x.detail)}</div>` : ""}</div>`;
    fetch(`/api/qa-tools/log?tool=${c.tool_id}&cal=${c.id}`, { cache: "no-store" }).then(r => r.json()).then(j => {
      const a = j.log || [], o = j.older || [];
      mdl.querySelector("#vTl").innerHTML = (a.length ? a.map(item).join("") : "") + (o.length ? `<p class="sub">บันทึกก่อนมีประวัติรายใบ (ของเครื่องมือนี้ทุกรอบ):</p>${o.map(item).join("")}` : "") || `<p class="muted">ยังไม่มีบันทึก</p>`;
    }).catch(() => { mdl.querySelector("#vTl").textContent = "โหลดไม่สำเร็จ"; });
  }

  /* ---------- internal verification (FM-QA-10 บันทึกผลการทวนสอบเครื่องมือวัด) ---------- */
  const thD = d => { const x = parse(d); return x ? `${x.getDate()}/${x.getMonth() + 1}/${String(x.getFullYear()).slice(2)}` : ""; };
  const nextVerifyNo = d => {   // Buddhist yymm-nn, e.g. 6901-04 = 4th verification in Jan 2569
    const x = parse(d) || today(), pre = String((x.getFullYear() + 543) % 100).padStart(2, "0") + String(x.getMonth() + 1).padStart(2, "0") + "-";
    const n = D.cals.map(c => (c.verify && c.verify.no) || "").filter(v => v.startsWith(pre)).map(v => +v.slice(pre.length) || 0);
    return pre + String((n.length ? Math.max(...n) : 0) + 1).padStart(2, "0");
  };
  function dlgVerify(c) {
    if (!c) return toast("ไม่พบรายการ", 1);
    const t = tById(c.tool_id) || {}, v = c.verify || {};
    const pts = (v.points && v.points.length ? v.points : [{}, {}, {}]).map(x => ({ ...x }));
    const row = (x, i) => `<tr><td><input data-p="pt" data-i="${i}" value="${esc(x.pt || "")}" placeholder="เช่น 50 mm"></td><td><input data-p="err" data-i="${i}" value="${esc(x.err || "")}" placeholder="0.02 mm"></td>
      <td><input data-p="unc" data-i="${i}" value="${esc(x.unc || "")}" placeholder="± 0.01 mm"></td><td><input data-p="mpe" data-i="${i}" value="${esc(x.mpe || v.criteria || "")}" placeholder="± 0.05 mm"></td>
      <td><select data-p="ok" data-i="${i}"><option value="">—</option><option value="1"${x.ok === true ? " selected" : ""}>✔ ผ่าน</option><option value="0"${x.ok === false ? " selected" : ""}>✖ ไม่ผ่าน</option></select></td><td><button type="button" class="qa-lnk" data-rmp="${i}">×</button></td></tr>`;
    const tbl = () => `<table class="qa-t qa-vt"><thead><tr><th>จุดสอบเทียบ</th><th>ค่าผิดพลาด (Error)</th><th>ความไม่แน่นอน (Uncertainty)</th><th>เกณฑ์ยอมรับ (MPE)</th><th>ผล</th><th></th></tr></thead><tbody>${pts.map(row).join("")}</tbody></table><button type="button" class="qa-btn sm ghost" id="vAdd">+ เพิ่มจุด</button>`;
    const m = dialog(`🔎 ทวนสอบผลสอบเทียบ (FM-QA-10): ${esc(t.asset_no || "")} · ${esc(t.name || "")}`, `<div class="qa-form">
      ${fld("vDate", "วันที่ดำเนินการ *", v.date || TODAY(), "date")}${fld("vRef", "Reference Cer No.", v.ref_cert || c.cert_no || "")}${fld("vNo", "Verify No.", v.no || nextVerifyNo(v.date || TODAY()))}
      <label class="wide">เกณฑ์การยอมรับ<input id="vCrit" value="${esc(v.criteria || "")}" placeholder="เช่น ± 0.02 mm"></label></div>
      <p class="sub">สอบเทียบ ${fmt(c.cal_date)} · ${esc(c.lab || "")} · ผล ${esc(RES[c.result] || "")}${(c.docs || []).map(f => ` · <a target="_blank" rel="noopener" href="${esc(docHref(f))}">${f.url ? "🔗" : "📎"} ${esc(f.name || "ใบรับรอง")}</a>`).join("")} — ยี่ห้อ / รุ่น / ผู้ถือครอง ดึงจากทะเบียนเครื่องมือ</p>
      <div id="vPts">${tbl()}</div>
      <div class="qa-form"><label class="wide">บันทึกเพิ่มเติม (ถ้ามี)<textarea id="vNote" rows="2">${esc(v.note || "")}</textarea></label>
      <label class="wide">มาตรการป้องกันความเสียหายของเครื่องมือวัด<textarea id="vProt" rows="2">${esc(v.protect || "")}</textarea></label></div>
      <p class="sub">บันทึกแล้วส่งให้ดิวอนุมัติ และพิมพ์ฟอร์ม FM-QA-10 ได้ (🖨)</p>`,
      async val => {
        const points = pts.filter(x => x.pt || x.err || x.unc || x.mpe).map(x => ({ pt: x.pt || "", err: x.err || "", unc: x.unc || "", mpe: x.mpe || "", ok: x.ok === true ? true : x.ok === false ? false : null }));
        if (!points.length) throw new Error("ใส่จุดสอบเทียบอย่างน้อย 1 จุด");
        if (points.some(x => x.ok === null)) throw new Error("เลือกผล ผ่าน / ไม่ผ่าน ให้ครบทุกจุด");
        await post("cal-verify", { id: c.id, verify: { date: val("vDate"), ref_cert: val("vRef"), no: val("vNo"), criteria: val("vCrit"), points, note: val("vNote"), protect: val("vProt") } });
        await refresh("บันทึกการทวนสอบแล้ว รออนุมัติ");
      }, "บันทึกทวนสอบ + ส่งอนุมัติ");
    const box = m.querySelector("#vPts");
    const rebind = () => {
      box.querySelectorAll("[data-p]").forEach(e => e.addEventListener(e.tagName === "SELECT" ? "change" : "input", () => { const x = pts[+e.dataset.i]; x[e.dataset.p] = e.dataset.p === "ok" ? (e.value === "1" ? true : e.value === "0" ? false : null) : e.value; }));
      box.querySelectorAll("[data-rmp]").forEach(b => b.onclick = () => { pts.splice(+b.dataset.rmp, 1); if (!pts.length) pts.push({}); box.innerHTML = tbl(); rebind(); });
      box.querySelector("#vAdd").onclick = () => { pts.push({ mpe: m.querySelector("#vCrit").value }); box.innerHTML = tbl(); rebind(); };
    };
    rebind();
  }
  function printVerify(c) {
    if (!c || !c.verify) return toast("ยังไม่ได้ทวนสอบ", 1);
    const t = tById(c.tool_id) || {}, v = c.verify, ok = c.status === "approved";
    const pts = v.points.concat(Array.from({ length: Math.max(0, 5 - v.points.length) }, () => ({})));
    const w = window.open("", "_blank"); if (!w) return toast("เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up แล้วลองใหม่", 1);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>FM-QA-10 ${esc(t.asset_no || "")} ${esc(v.no || "")}</title><style>
      @page{size:A4;margin:12mm}body{font-family:"Sarabun","Noto Sans Thai",system-ui,sans-serif;font-size:11.5pt;color:#000;margin:0}
      table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:5px 7px;vertical-align:middle}th{font-weight:600;background:#f2f2f2}
      .hd td{border:none;padding:0 0 6px}.co{font-weight:700;font-size:13pt}.ti{font-weight:700;font-size:15pt;text-align:right}
      .sec{font-weight:700;margin:12px 0 4px}.lb{background:#f7f7f7;font-weight:600;white-space:nowrap;width:1%}.c{text-align:center}.box{min-height:46px;white-space:pre-wrap}
      .sg td{height:28px}.ft{text-align:right;font-size:9pt;margin-top:8px}</style></head><body>
      <table class="hd"><tr><td class="co">บริษัท รักษ์วิศวกรรม จำกัด</td><td class="ti">บันทึกผลการทวนสอบเครื่องมือวัด</td></tr></table>
      <table><tr><td class="lb">วันที่ดำเนินการ</td><td>${esc(thD(v.date))}</td><td class="lb">Reference Cer No.</td><td>${esc(v.ref_cert || "")}</td><td class="lb">Verify No.</td><td>${esc(v.no || "")}</td></tr></table>
      <div class="sec">รายละเอียดเครื่องมือวัด</div>
      <table><tr><td class="lb">ชื่อเครื่องมือวัด</td><td>${esc(t.name || "")}</td><td class="lb">รหัส</td><td>${esc(t.asset_no || "")}</td><td class="lb">ยี่ห้อ</td><td>${esc(t.brand || "-")}</td><td class="lb">รุ่น</td><td>${esc(t.model || "-")}</td></tr>
        <tr><td class="lb">ผู้ถือครอง</td><td colspan="3">${esc(t.owner_name || "")}</td><td class="lb">หน่วยงาน</td><td colspan="3">${esc(t.department || "")}</td></tr>
        <tr><td class="lb">เกณฑ์การยอมรับ</td><td colspan="7">${esc(v.criteria || "")}</td></tr>
        <tr><td class="lb">หน่วยงานสอบเทียบ</td><td colspan="3">${esc(c.lab || "")}</td><td class="lb">วันที่สอบเทียบ</td><td colspan="3">${esc(thD(c.cal_date))}</td></tr></table>
      <div class="sec">การดำเนินการทวนสอบเครื่องมือ</div>
      <table><tr><th rowspan="2">จุดสอบเทียบ</th><th rowspan="2">ค่าผิดพลาด (ERROR)<br>ของเครื่องมือวัด</th><th rowspan="2">ค่าความไม่แน่นอนของการวัด<br>(Uncertainty Measurement)</th><th rowspan="2">เกณฑ์การยอมรับ<br>(MPE)</th><th colspan="2">ผลการตรวจสอบ</th></tr><tr><th>ผ่าน</th><th>ไม่ผ่าน</th></tr>
        ${pts.map(x => `<tr><td class="c">${esc(x.pt || "")}&nbsp;</td><td class="c">${esc(x.err || "")}</td><td class="c">${esc(x.unc || "")}</td><td class="c">${esc(x.mpe || "")}</td><td class="c">${x.ok === true ? "✓" : ""}</td><td class="c">${x.ok === false ? "✓" : ""}</td></tr>`).join("")}</table>
      <div class="sec">บันทึกเพิ่มเติม (ถ้ามี)</div><table><tr><td class="box">${esc(v.note || "")}</td></tr></table>
      <div class="sec">มาตรการป้องกันความเสียหายของเครื่องมือวัด</div><table><tr><td class="box">${esc(v.protect || "")}</td></tr></table>
      <br><table class="sg"><tr><th colspan="2">ผู้ทำการทวนสอบ</th><th colspan="2">ผู้อนุมัติการทวนสอบ</th></tr>
        <tr><td class="lb">ลงชื่อ</td><td></td><td class="lb">ลงชื่อ</td><td></td></tr>
        <tr><td class="lb">ชื่อ-นามสกุล (ตัวบรรจง)</td><td>${esc(v.name || "")}</td><td class="lb">ชื่อ-นามสกุล (ตัวบรรจง)</td><td>${ok ? esc(c.approved_by || "") : ""}</td></tr>
        <tr><td class="lb">ตำแหน่ง</td><td>${esc(v.position || "วิศวกรประกันคุณภาพ")}</td><td class="lb">ตำแหน่ง</td><td>ผู้จัดการแผนก</td></tr>
        <tr><td class="lb">วันที่</td><td>${esc(thD(v.date))}</td><td class="lb">วันที่</td><td>${ok ? esc(thD(String(c.approved_at || "").slice(0, 10))) : ""}</td></tr></table>
      <div class="ft">FM-QA-10 Rev.00</div>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  async function printLabels(ids) {
    let Q; try { Q = await lib("qr"); } catch (e) { return toast(e.message, 1); }
    const ts = ids.map(tById).filter(Boolean);
    const w = window.open("", "_blank"); if (!w) return toast("เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up แล้วลองใหม่", 1);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QA Tools labels</title><style>
      body{font-family:system-ui,"Noto Sans Thai",sans-serif;margin:8mm}.g{display:grid;grid-template-columns:repeat(3,62mm);gap:4mm}
      .l{border:1px solid #333;border-radius:2mm;padding:2.5mm;display:grid;grid-template-columns:22mm 1fr;gap:2mm;align-items:center;height:26mm;box-sizing:border-box;break-inside:avoid}
      .l svg{width:22mm;height:22mm}.n{font:700 11pt ui-monospace,monospace}.t{font-size:8.5pt;line-height:1.25;max-height:2.6em;overflow:hidden}.c{font-size:7.5pt;color:#444;margin-top:1mm}.r{font-size:6.5pt;color:#c70404;font-weight:700;letter-spacing:.5px}
      @media print{body{margin:6mm}}</style></head><body><div class="g">${ts.map(t => `<div class="l">${qrSvg(Q, toolLink(t))}<div><div class="r">RAK · QA TOOLS</div><div class="n">${esc(t.asset_no)}</div><div class="t">${esc(t.name)}</div>${t.needs_cal && t.next_cal_due ? `<div class="c">Cal due: ${esc(t.next_cal_due)}</div>` : ""}</div></div>`).join("")}</div>
      <script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }
  async function exportXlsx(kind) {
    let X; try { X = await lib("xlsx"); } catch (e) { return toast(e.message, 1); }
    const ts = kind === "cal" ? D.tools.filter(t => active(t) && t.needs_cal).sort((a, b) => String(a.next_cal_due || "9").localeCompare(String(b.next_cal_due || "9"))) : filtered();
    const rows = ts.map(t => { const l = openLoan(t); return { "รหัส": t.asset_no, "ชื่อเครื่องมือ": t.name, "ประเภท": (CAT_L[t.category] || "").replace(/^\S+\s/, ""), "ยี่ห้อ": t.brand || "", "รุ่น": t.model || "", "ขนาด": t.spec || "", "Serial No.": t.serial_no || "", "รหัสทรัพย์สิน": t.fixed_asset_no || "",
      "ผู้ถือครอง": t.owner_name || "", "แผนก": t.department || "", "ที่เก็บ": t.location || "", "ให้ยืมได้": t.lendable ? "ใช่" : "", "วันที่เริ่มใช้": t.purchase_date || "", "อายุ": age(t.purchase_date), "สถานะ": (ST[t.status] || [t.status])[0], "ผู้ยืม": l ? l.borrower_name : "",
      "ต้องสอบเทียบ": t.needs_cal ? "ใช่" : "ไม่", "สอบเทียบทุก (เดือน)": t.needs_cal ? t.cal_interval_m : "", "สอบเทียบล่าสุด": t.last_cal_date || "", "ครบกำหนดสอบเทียบ": t.next_cal_due || "", "สถานะสอบเทียบ": t.needs_cal ? calState(t).l : "", "หมายเหตุ": t.note || "" }; });
    const ws = X.utils.json_to_sheet(rows); ws["!cols"] = Object.keys(rows[0] || { a: 1 }).map(k => ({ wch: Math.max(10, k.length + 2) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, kind === "cal" ? "Calibration plan" : "Tool register");
    X.writeFile(wb, (kind === "cal" ? "QA_Calibration_Plan_" : "QA_Tool_Register_") + TODAY().replace(/-/g, "") + ".xlsx");
  }

  /* ---------- events ---------- */
  function bind() {
    const on = (id, ev, fn) => { const e = ROOT.querySelector("#" + id); if (e) e.addEventListener(ev, fn); };
    on("qaQ", "input", e => { S.q = e.target.value; draw(); const q = ROOT.querySelector("#qaQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
    on("qaCat", "change", e => { S.cat = e.target.value; draw(); });
    on("qaDept", "change", e => { S.dept = e.target.value; draw(); });
    on("qaSt", "change", e => { S.st = e.target.value; draw(); });
    on("qaAq", "input", e => { S.aq = e.target.value; draw(); const q = ROOT.querySelector("#qaAq"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
    on("qaAu", "change", e => { S.au = e.target.value; draw(); });
    on("qaAa", "change", e => { S.aa = e.target.value; draw(); });
    on("qaAm", "change", e => { S.am = e.target.value; draw(); });
    on("qaImp", "change", e => e.target.files[0] && readImport(e.target.files[0]));
    ROOT.querySelectorAll("[data-sel]").forEach(c => c.addEventListener("change", () => { c.checked ? S.sel.add(+c.dataset.sel) : S.sel.delete(+c.dataset.sel); draw(); }));
    ROOT.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => act(b.dataset.a, b.dataset)));
    ROOT.querySelectorAll("[data-holder]").forEach(x => x.addEventListener("click", () => { S.q = (me().name || "").replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, "").split(" ")[0]; }));
    const lg = ROOT.querySelector("#qaLog");
    if (lg) fetch("/api/qa-tools/log?tool=" + S.tool).then(r => r.json()).then(j => { lg.innerHTML = (j.log || []).map(x => `<div class="qa-log"><b>${esc(x.action)}</b> · ${esc(x.by || "")} · ${fmtT(x.at)}${x.detail ? `<div>${esc(x.detail)}</div>` : ""}</div>`).join("") || "ยังไม่มี"; }).catch(() => { lg.textContent = ""; });
  }
  async function act(a, ds) {
    const t = ds.id ? tById(ds.id) : null, loan = ds.id ? D.loans.find(l => l.id === +ds.id) : null;
    try {
      if (a === "new") return dlgTool(null);
      if (a === "edit") return dlgTool(t);
      if (a === "holder") return dlgHolder(t);
      if (a === "borrow") return dlgBorrow(t);
      if (a === "receive") return dlgReceive(loan);
      if (a === "ret-req") return dlgNote("↩ แจ้งคืน", "หมายเหตุ (เช่น วางไว้ที่ไหน / สภาพ)", async n => { await post("return-request", { id: loan.id, note: n }); await refresh("แจ้งคืนแล้ว — นำเครื่องมือไปคืนผู้ดูแล"); }, "แจ้งคืน");
      if (a === "cal-send") return dlgCalSend(t);
      if (a === "cal-result") return dlgCalResult(t, ds.cal);
      if (a === "cal-verify") return dlgVerify(D.cals.find(c => c.id === +ds.id));
      if (a === "cal-print") return printVerify(D.cals.find(c => c.id === +ds.id));
      if (a === "cal-view") return dlgCalView(D.cals.find(c => c.id === +ds.id));
      if (a === "cal-ok" || a === "cal-no") return dlgNote(a === "cal-ok" ? "✔ อนุมัติผลสอบเทียบ" : "✖ ไม่อนุมัติผลสอบเทียบ", a === "cal-ok" ? "หมายเหตุ (ถ้ามี)" : "เหตุผล", async n => { await post("cal-approve", { id: +ds.id, approve: a === "cal-ok", note: n }); await refresh(a === "cal-ok" ? "อนุมัติแล้ว" : "ส่งกลับให้แก้ไขแล้ว"); }, a === "cal-ok" ? "อนุมัติ" : "ไม่อนุมัติ");
      if (a === "retire") return dlgNote("🗑 ขอจำหน่าย / เลิกใช้", "เหตุผล *", async n => { if (!n) throw new Error("ใส่เหตุผล"); await post("retire", { id: t.id, step: "request", reason: n }); await refresh("ส่งคำขอให้ดิวอนุมัติแล้ว"); }, "ส่งคำขอ");
      if (a === "retire-ok" || a === "retire-no") return dlgNote(a === "retire-ok" ? "✔ อนุมัติจำหน่าย" : "✖ ไม่อนุมัติจำหน่าย", "หมายเหตุ", async n => { await post("retire", { id: t.id, approve: a === "retire-ok", note: n }); await refresh("บันทึกแล้ว"); }, "ยืนยัน");
      if (a === "label") return printLabels([t.id]);
      if (a === "labels") return printLabels([...S.sel]);
      if (a === "view") { S.view = ds.v === "rows" ? "rows" : "grid"; try { localStorage.setItem("qaView", S.view); } catch (e) { /* private mode */ } return draw(); }
      if (a === "kpi") { S.q = ""; S.cat = ""; S.dept = ds.dept || ""; S.st = ds.st || ""; location.hash = "#qa-tools/list"; return; }
      if (a === "audit-reload") { loadAudit(true); return draw(); }
      if (a === "sel-all") { filtered().forEach(x => S.sel.add(x.id)); return draw(); }
      if (a === "sel-none") { S.sel.clear(); return draw(); }
      if (a === "xlsx") return exportXlsx("list");
      if (a === "cal-xlsx") return exportXlsx("cal");
      if (a === "imp-cancel") { S.imp = null; return draw(); }
      if (a === "imp-go") { const rows = S.imp.filter(o => o.asset_no && o.name); const j = await post("import", { rows }); S.imp = null; toast(`นำเข้าแล้ว: เพิ่ม ${j.created} · อัปเดต ${j.updated}` + (j.failed.length ? ` · ไม่สำเร็จ ${j.failed.length}` : ""), j.failed.length > 0); if (j.failed.length) console.warn(j.failed); location.hash = "#qa-tools/list"; return load(true); }
    } catch (x) { toast(x.message, 1); }
  }

  const CSS = `
.qa-tabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 14px}.qa-tabs a{padding:8px 15px;border-radius:999px;border:1px solid var(--line,#e3e6ea);text-decoration:none;color:inherit;font-size:13.5px;background:#fff}
.qa-tabs a:hover{border-color:var(--rak-line)}.qa-tabs a.on{background:var(--rak);color:#fff;border-color:var(--rak)}.qa-dot{background:#c92a2a;color:#fff;border-radius:999px;padding:0 6px;font-size:11px;margin-left:2px}
.qa-role{margin-left:auto;font-size:12px;color:var(--rak-dark);background:var(--blush);border-radius:999px;padding:4px 10px}
.qa-card{background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:14px;padding:16px 18px;margin-bottom:14px}.qa-card h3{margin:0 0 12px;font-size:15px}.qa-card h4{margin:14px 0 8px;font-size:13.5px}
.qa-err,.bad{color:#c92a2a}.muted{color:#8a9099}.sub{font-size:12px;color:#8a9099}.mono{font-family:ui-monospace,Menlo,monospace}
.qa-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.qa-tile{display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto;column-gap:10px;align-items:center;text-decoration:none;color:inherit;background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:14px;padding:12px 14px;transition:transform .12s}
.qa-tile:hover{transform:translateY(-2px);border-color:var(--rak-line)}.qa-tile i{grid-row:span 2;font-style:normal;font-size:22px;width:40px;height:40px;display:grid;place-items:center;background:var(--blush);border-radius:12px}
.qa-tile b{font-size:24px;line-height:1}.qa-tile span{font-size:12px;color:#6b7280}.t-ok b{color:#2b8a3e}.t-loan b{color:#1c7ed6}.t-warn b{color:#d9480f}.t-bad b{color:#c92a2a}.t-bad i{background:#fff5f5}.t-warn i{background:#fff4e6}
.qa-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.qa-kpi .qa-card{margin:0}.qa-kc h3{margin:0 0 10px}.qa-kc h4{margin:12px 0 6px;font-size:13px}.qa-wide{grid-column:1/-1}
.qa-ring{--c:#2b8a3e;width:150px;height:150px;border-radius:50%;margin:6px auto 12px;display:grid;place-content:center;text-align:center;background:radial-gradient(closest-side,#fff 74%,transparent 75% 100%),conic-gradient(var(--c) calc(var(--p)*1%),#f1f3f5 0)}.qa-ring b{font-size:32px;line-height:1}.qa-ring span{font-size:12px;color:#6b7280}.qa-ring.t-warn{--c:#e8590c}.qa-ring.t-bad{--c:#c92a2a}
.qa-legend{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:13px}.qa-legend a,.qa-legend span{color:inherit;text-decoration:none;display:flex;align-items:center;gap:6px}.qa-legend b{margin-left:auto}.qa-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}.d-ok{background:#2b8a3e}.d-warn{background:#e8590c}.d-bad{background:#c92a2a}.d-off{background:#adb5bd}
.qa-kt{width:100%;min-width:0;border-collapse:collapse;font-size:13px;table-layout:fixed}.qa-kt td:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qa-kt td{padding:5px 4px;border-bottom:1px solid #f5f5f5}.qa-kt tr[data-a]{cursor:pointer}.qa-kt tr[data-a]:hover{background:#f8faf5}.qa-kt .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;width:56px}.qa-kt .w{width:38%}.qa-kpi .qa-card{overflow:hidden;min-width:0}
.qa-kbar{display:block;height:8px;background:#f1f3f5;border-radius:6px;overflow:hidden}.qa-kbar i{display:block;height:100%;background:var(--rak,#65a30d);border-radius:6px}.qa-kbar.t-warn i{background:#e8590c}.qa-kbar.t-bad i{background:#c92a2a}
td.t-ok,em.t-ok{color:#2b8a3e}td.t-warn,em.t-warn{color:#e8590c}td.t-bad,em.t-bad{color:#c92a2a}
.qa-cols{display:flex;gap:6px;align-items:flex-end;height:170px;padding-top:6px}.qa-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}.qa-col i{width:70%;max-width:38px;background:var(--rak,#65a30d);border-radius:5px 5px 0 0;min-height:2px}.qa-col.over i{background:#c92a2a}.qa-col.now i{background:#4d7c0f}.qa-col b{font-size:12px;margin-bottom:3px}.qa-col span{font-size:11px;color:#6b7280;margin-top:4px;text-align:center;line-height:1.2;height:28px}
.qa-kgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}.qa-kv2{background:#f8f9fa;border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:2px}.qa-kv2 span{font-size:12px;color:#6b7280}.qa-kv2 b{font-size:20px}.qa-kv2 em{font-style:normal;font-size:11.5px;color:#6b7280}
.qa-big{font-size:30px;font-weight:700;margin:4px 0 10px}.qa-big small{font-size:14px;color:#6b7280;font-weight:500}
.qa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}.qa-grid .qa-card{margin:0;overflow:auto}
.qa-row{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #f1f3f5;text-decoration:none;color:inherit}.qa-row:last-child{border:0}.qa-row>span:nth-child(2){display:flex;flex-direction:column;min-width:0}.qa-right{margin-left:auto;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2px}
.qa-th{width:64px;height:64px;border-radius:10px;object-fit:cover;background:var(--blush);flex:none}.qa-th.sm{width:38px;height:38px;border-radius:8px}.qa-th.xl{width:220px;height:220px;font-size:80px}
.qa-noimg{display:grid;place-items:center;font-size:28px}.qa-th.sm.qa-noimg{font-size:18px}
.qa-chip{display:inline-block;font-size:11.5px;padding:2px 9px;border-radius:999px;white-space:nowrap}.s-ok{background:#ebfbee;color:#2b8a3e}.s-loan{background:#e7f5ff;color:#1c7ed6}.s-cal{background:#f3f0ff;color:#6741d9}.s-warn{background:#fff4e6;color:#d9480f}.s-bad{background:#fff5f5;color:#c92a2a}.s-off{background:#f1f3f5;color:#6b7280}
.qa-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.qa-bar2{display:flex;gap:10px;align-items:center;margin-bottom:12px}
.qa-bar input,.qa-bar select,.qa-form input,.qa-form select{padding:8px 11px;border:1px solid #d6dae0;border-radius:9px;font:inherit;font-size:13.5px;background:#fff}.qa-bar input[type=search]{flex:1 1 260px;max-width:420px}
.qa-btn{padding:8px 15px;border-radius:9px;border:1px solid var(--rak);background:var(--rak);color:#fff;font:inherit;font-size:13.5px;cursor:pointer;white-space:nowrap}.qa-btn:hover{background:var(--rak-dark)}.qa-btn:disabled{opacity:.5}
.qa-btn.ghost{background:#fff;color:var(--ink,#1f2328);border-color:#d6dae0}.qa-btn.ghost:hover{border-color:var(--rak-line);background:var(--blush)}.qa-btn.danger{color:#c92a2a}.qa-btn.sm{padding:5px 11px;font-size:12.5px}
.qa-lnk{background:none;border:0;color:var(--rak);cursor:pointer;font:inherit;font-size:12.5px}
.qa-th.qa-web,.qa-photos img.qa-web{object-fit:contain;background:#fff;border:1px solid #f1f3f5}.qa-sib{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 12px;max-height:260px;overflow:auto;border:1px solid #f1f3f5;border-radius:8px;padding:8px}.qa-thw{position:relative;display:inline-block;flex:none}.qa-webtag{position:absolute;left:3px;bottom:3px;background:rgba(0,0,0,.55);color:#fff;font-style:normal;font-size:9.5px;padding:1px 5px;border-radius:5px;line-height:1.4;pointer-events:none}.qa-vsw{margin-left:auto;display:inline-flex;border:1px solid #dee2e6;border-radius:8px;overflow:hidden}.qa-vsw button{border:0;background:#fff;padding:6px 11px;font-size:16px;line-height:1;cursor:pointer;color:#6b7280}.qa-vsw button.on{background:var(--rak,#65a30d);color:#fff}.qa-rows td{vertical-align:middle}.qa-rows td a{color:inherit;text-decoration:none}.qa-rows tbody tr:hover{background:#f8faf5}.qa-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.qa-tcard{position:relative;display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--line,#e3e6ea);border-radius:14px;padding:12px}.qa-tcard:hover{border-color:var(--rak-line)}
.qa-tlink{display:flex;gap:12px;text-decoration:none;color:inherit;flex:1;min-width:0}.qa-tbody{min-width:0;display:flex;flex-direction:column;gap:3px}.qa-tbody b{font-size:14.5px}
.qa-tags{display:flex;gap:4px;flex-wrap:wrap;margin:2px 0}.qa-pick{position:absolute;top:6px;left:6px;z-index:1}.qa-pick input{width:16px;height:16px}
.qa-back{margin-bottom:10px}.qa-back a{text-decoration:none;color:var(--rak)}
.qa-detail{display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:22px}@media(max-width:760px){.qa-detail{grid-template-columns:1fr}}
.qa-photos{display:grid;grid-template-columns:1fr 1fr;gap:6px;align-content:start}.qa-photos a:first-child{grid-column:1/-1}.qa-photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block}
.qa-dinfo h2{margin:2px 0 6px;font-size:22px}.qa-kv{border-collapse:collapse;margin:10px 0;font-size:13.5px;min-width:0}.qa-kv th{text-align:left;color:#6b7280;font-weight:500;padding:5px 14px 5px 0;white-space:nowrap;vertical-align:top;background:none;font-size:13px}.qa-kv td{padding:5px 0}
.qa-loanbox{background:#e7f5ff;border-radius:10px;padding:10px 12px;margin:8px 0;font-size:13.5px}.qa-warnbox{display:inline-block;background:#fff5f5;color:#c92a2a;border-radius:10px;padding:8px 12px;margin:6px 0;font-size:13px}
.qa-vt input,.qa-vt select{width:100%;min-width:70px;box-sizing:border-box;padding:5px 6px;border:1px solid #dee2e6;border-radius:6px;font:inherit}.qa-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.qa-docs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.qa-doc{background:#f6f7f9;border-radius:8px;padding:5px 10px;font-size:12.5px;text-decoration:none;color:inherit}
.qa-doc button,.qa-f button{border:0;background:none;color:#c92a2a;cursor:pointer;font-size:14px}
.qa-t{width:100%;border-collapse:collapse;font-size:13px;min-width:0}.qa-t th,.qa-t td{padding:7px 8px;border-bottom:1px solid #f1f3f5;text-align:left;vertical-align:top}.qa-t thead th{font-size:12px;color:#6b7280;background:var(--blush);font-weight:600;white-space:nowrap}.qa-t tr.bad td{background:#fff5f5}
.qa-scroll{overflow:auto}.qa-row2{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 0;border-bottom:1px solid #f1f3f5}
.qa-months{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-bottom:10px}.qa-month{border:1px solid var(--line,#e3e6ea);border-radius:10px;padding:8px 10px;min-height:70px;display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start}
.qa-month.now{border-color:var(--rak);background:var(--blush)}.qa-month b{flex:1 0 60%}.qa-month .n{font-weight:700;color:var(--rak)}.qa-month a{font:11.5px ui-monospace,monospace;background:#f6f7f9;border-radius:6px;padding:1px 6px;text-decoration:none;color:inherit}
.qa-modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;z-index:200;overflow:auto;padding:40px 12px}.qa-dlg{background:#fff;border-radius:16px;padding:20px 22px;max-width:820px;width:100%}.qa-dlg h3{margin:0 0 14px}
.qa-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.qa-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#6b7280}.qa-form .wide{grid-column:1/-1}.qa-ck{flex-direction:row!important;align-items:center;gap:6px!important;color:inherit!important;font-size:13.5px!important}
.qa-files{display:flex;gap:8px;flex-wrap:wrap}.qa-f{position:relative}.qa-f img{width:72px;height:72px;object-fit:cover;border-radius:8px;display:block}.qa-f button{position:absolute;top:-6px;right:-6px;background:#fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.2);width:20px;height:20px;line-height:1}
.qa-add{display:inline-flex;align-items:center;gap:6px;border:1px dashed var(--rak-line,#d6dae0);color:var(--rak);border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12.5px;min-height:20px}
.qa-more{display:inline-block;margin-top:8px;font-size:12.5px;color:var(--rak)}
.qa-log{padding:6px 0;border-bottom:1px solid #f1f3f5;font-size:12.5px;color:#4b5563}
.qa-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#1f2328;color:#fff;padding:10px 16px;border-radius:10px;z-index:300;font-size:13.5px}.qa-toast.bad{background:#c92a2a}
`;

  window.QATools = {
    mount(el, sub) {
      if (!document.getElementById("qaCss")) { const s = document.createElement("style"); s.id = "qaCss"; s.textContent = CSS; document.head.appendChild(s); }
      ROOT = el; const parts = String(sub || "").split("/");
      const pg = parts[0] === "tool" ? "tool" : (TABS.some(t => t[0] === parts[0]) || parts[0] === "import" || parts[0] === "audit" ? parts[0] : "");
      if (pg !== "import") S.imp = null;
      S.page = pg; S.tool = pg === "tool" ? +parts[1] || 0 : 0;
      draw(); load();
      if (pg === "tool") window.scrollTo(0, 0);
    },
  };
})();
