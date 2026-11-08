/* Site Expense menu — structure only (not in use yet).
   Routes:  #site-expense                    → Overview of all projects (workflow, KPIs, search, status filter)
            #site-expense/<id>               → one project, section 1 Dashboard (Budget vs Actual)
            #site-expense/<id>/estimate      → section 2 Estimate from scope of work (SOW) → approval → open Job → Budgetary
            #site-expense/<id>/actual        → section 3 Daily actual expense from site, against the locked budget
   The projects in SAMPLE are placeholders so the layout can be reviewed; they will come from
   public.site_expense_projects (database/site_expense.sql) when the menu goes live.
   Every input and button here is disabled on purpose. When a section goes live, replace its preview with the real page
   and flip LIVE[section] to true. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LIVE = { dashboard: false, estimate: false, actual: false };

  // Expense category groups shared by Estimate, Budgetary and Actual so all three compare line by line.
  // Codes match public.site_expense_categories in database/site_expense.sql.
  const svg = d => `<svg class="se-ci" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const CATS = [
    { code: "manpower", name: "Manpower", th: "ค่าแรง / Manday",
      ic: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.8c1.7.6 2.8 2.2 3 4.7"/>') },
    { code: "subcontract", name: "Subcontract", th: "ผู้รับเหมาช่วง",
      ic: svg('<path d="M14.7 6.3a4 4 0 0 0-5.3 5.3l-5.6 5.6a1.8 1.8 0 0 0 2.6 2.6l5.6-5.6a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.4-.2-.2-2.4z"/>') },
    { code: "transportation", name: "Transportation", th: "ขนส่ง / รถ",
      ic: svg('<path d="M2.5 6.5h11v9.5h-11zM13.5 9.5h4l3 3.2V16h-7"/><circle cx="6.5" cy="17.2" r="1.8"/><circle cx="16.8" cy="17.2" r="1.8"/>') },
    { code: "accommodation", name: "Accommodation", th: "ที่พัก",
      ic: svg('<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M10.5 20.5V16h3v4.5"/>') },
    { code: "travel", name: "Travel & Air Ticket", th: "เดินทาง / ตั๋วเครื่องบิน",
      ic: svg('<path d="M10.2 13.8 4 12.5l-1.2 1.2 5.2 2.6 2.6 5.2 1.2-1.2-1.3-6.2 4.3-4.3 3.8 6.6 1.3-1.3-1.6-8.2 2.6-2.6a1.6 1.6 0 0 0-2.3-2.3l-2.6 2.6-8.2-1.6L5.5 4.3l6.6 3.8z"/>') },
    { code: "site_expense", name: "Site Expense", th: "ค่าใช้จ่ายหน้างาน",
      ic: svg('<path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4-2.1-1.4-2.2 1.4z"/><path d="M12 7.5v8M14.3 9a2 2 0 0 0-2.1-1.3c-1.2 0-2.2.7-2.2 1.7 0 2.3 4.4 1.3 4.4 3.6 0 1-1 1.7-2.2 1.7a2.2 2.2 0 0 1-2.2-1.4"/>') },
  ];
  const catCell = c => `<span class="se-cat">${c.ic}<span>${esc(c.name)}<small>${esc(c.th)}</small></span></span>`;

  const SECTIONS = [
    { id: "dashboard", no: "1", name: "Dashboard", th: "Budget vs Actual", ic: "📊",
      desc: "ดูงบที่อนุมัติเทียบกับค่าใช้จ่ายจริงของแต่ละโปรเจค ค้นหาด้วย Project no. / JO",
      plan: ["ค้นหาโปรเจคด้วย Project no. / JO, ลูกค้า หรือชื่อโปรเจค", "Budget vs Actual แยกตามหมวดค่าใช้จ่าย พร้อม % ที่ใช้ไป", "เตือนเมื่อใช้งบเกิน 80% และเกินงบ", "อื่นๆ: งานที่รออนุมัติ, โปรเจคที่ยังไม่บันทึก Actual, สรุปรายเดือน"] },
    { id: "estimate", no: "2", name: "Estimate", th: "ประเมินจาก Scope of Work", ic: "📝",
      desc: "ประเมินค่าใช้จ่ายติดตั้งจาก SOW ส่งอนุมัติ เมื่อเปิด Job แล้วเปลี่ยนเป็น Budgetary",
      plan: ["เลือก IJ / โปรเจค แล้วกรอก Scope of Work เป็นรายการงาน", "คำนวณ manday และค่าใช้จ่ายตาม Master rate", "ส่งอนุมัติ SC → SSM → MD", "เมื่ออนุมัติและเปิด Job (JO) แล้ว Transform เป็น Budgetary และล็อกงบ"] },
    { id: "actual", no: "3", name: "Actual record", th: "บันทึกค่าใช้จ่ายจริงจากหน้างาน", ic: "🧾",
      desc: "ทีมหน้างานบันทึกค่าใช้จ่ายรายวัน เทียบกับงบที่ได้รับ",
      plan: ["เปิดให้บันทึกได้เมื่อโปรเจคมี JO และ Budgetary แล้วเท่านั้น", "บันทึกรายวัน: วันที่ หมวด รายการ จำนวนเงิน แนบรูปใบเสร็จ", "แสดงงบคงเหลือของแต่ละหมวดขณะบันทึก", "หัวหน้างานตรวจรายการก่อนนับเข้า Actual"] },
  ];
  const secOf = id => SECTIONS.find(s => s.id === id) || SECTIONS[0];

  const FLOW = [
    ["📝", "Estimate", "จาก SOW"],
    ["✅", "อนุมัติ", "SC → SSM → MD"],
    ["🏗️", "เปิด Job", "ได้ JO"],
    ["🔒", "Budgetary", "ล็อกงบ"],
    ["🧾", "Actual", "บันทึกรายวัน"],
    ["📊", "Dashboard", "Budget vs Actual"],
  ];

  const off = `disabled aria-disabled="true"`;
  const field = (label, ph, span = "") => `<label class="se-f ${span}">${esc(label)}<input ${off} placeholder="${esc(ph)}"></label>`;
  const emptyRows = (cols, n = 3) => Array.from({ length: n }, () => `<tr>${Array.from({ length: cols }, () => `<td><span class="se-sk"></span></td>`).join("")}</tr>`).join("");

  function previewDashboard() {
    const kpi = (l, s) => `<div class="se-kpi"><span>${esc(l)}</span><b>–</b><small>${esc(s)}</small></div>`;
    return `
      <div class="se-bar">${field("ค้นหา Project no. / JO", "เช่น JO202603023, ชื่อลูกค้า, ชื่อโปรเจค", "wide")}${field("ลูกค้า", "ทั้งหมด")}${field("สถานะ", "ทั้งหมด")}</div>
      <div class="se-kpis">${kpi("Budget (อนุมัติ)", "บาท")}${kpi("Actual (ใช้จริง)", "บาท")}${kpi("คงเหลือ", "บาท")}${kpi("ใช้ไป", "% ของงบ")}</div>
      <div class="tbl"><table><thead><tr><th>หมวดค่าใช้จ่าย</th><th class="r">Budget</th><th class="r">Actual</th><th class="r">คงเหลือ</th><th>% ใช้ไป</th></tr></thead>
        <tbody>${CATS.map(c => `<tr><td>${catCell(c)}</td><td class="r">–</td><td class="r">–</td><td class="r">–</td><td><span class="se-meter"><i></i></span></td></tr>`).join("")}</tbody>
        <tfoot><tr><td><b>รวม</b></td><td class="r">–</td><td class="r">–</td><td class="r">–</td><td></td></tr></tfoot></table></div>
      <div class="se-other">
        <div class="se-box"><b>⏳ รออนุมัติ</b><span>Estimate ที่ส่งแล้ว รอ SSM / MD</span></div>
        <div class="se-box"><b>⚠️ ใช้งบเกิน 80%</b><span>โปรเจคที่ควรติดตาม</span></div>
        <div class="se-box"><b>📅 ยังไม่บันทึก Actual</b><span>โปรเจคที่ไม่มีรายการเกิน 3 วัน</span></div>
      </div>`;
  }

  function previewEstimate() {
    const steps = ["ร่าง (SC)", "ตรวจ (SSM)", "อนุมัติ (MD)", "เปิด Job (JO)", "Budgetary 🔒"];
    return `
      <div class="se-steps">${steps.map((s, i) => `<span class="se-step"><i>${i + 1}</i>${esc(s)}</span>`).join('<span class="se-arr">→</span>')}</div>
      <div class="se-form">${field("IJ / Project no.", "เลือกจาก IJ")}${field("ลูกค้า", "ดึงจาก IJ")}${field("ชื่อโปรเจค", "ดึงจาก IJ", "wide")}${field("สถานที่ติดตั้ง", "Site")}${field("ช่วงเวลาติดตั้ง", "เริ่ม – สิ้นสุด")}</div>
      <div class="tbl"><table><thead><tr><th>No.</th><th>Scope of Work (งาน)</th><th class="c">คน</th><th class="c">วัน</th><th class="c">Manday</th><th>หมวด</th><th class="r">จำนวนเงิน</th></tr></thead>
        <tbody>${emptyRows(7)}</tbody>
        <tfoot><tr><td colspan="6" class="r"><b>รวมประเมิน (ตาม Master rate)</b></td><td class="r">–</td></tr></tfoot></table></div>
      <div class="se-actions"><button class="sp-btn" ${off}>＋ เพิ่มงาน</button><button class="sp-btn" ${off}>บันทึกร่าง</button><button class="sp-btn primary" ${off}>ส่งอนุมัติ →</button><button class="sp-btn" ${off}>🔒 Transform เป็น Budgetary</button></div>`;
  }

  function previewActual() {
    return `
      <div class="se-gate">🔒 บันทึกได้เมื่อโปรเจคมี <b>JO</b> และ <b>Budgetary</b> ที่ล็อกแล้ว</div>
      <div class="se-form">${field("Project no. / JO", "เลือกโปรเจคที่มีงบแล้ว", "wide")}${field("วันที่", "วว/ดด/ปปปป")}${field("หมวด", CATS[5].name)}${field("รายการ", "เช่น ค่าที่พัก 2 ห้อง", "wide")}${field("จำนวนเงิน (บาท)", "0.00")}${field("ใบเสร็จ", "แนบรูป")}</div>
      <div class="se-actions"><button class="sp-btn primary" ${off}>＋ บันทึกรายการ</button><span class="se-left">งบคงเหลือหมวดนี้: <b>–</b></span></div>
      <div class="tbl"><table><thead><tr><th>วันที่</th><th>หมวด</th><th>รายการ</th><th class="r">จำนวนเงิน</th><th>ใบเสร็จ</th><th>ผู้บันทึก</th><th>สถานะ</th></tr></thead>
        <tbody>${emptyRows(7)}</tbody></table></div>`;
  }
  const PREVIEW = { dashboard: previewDashboard, estimate: previewEstimate, actual: previewActual };

  const CSS = `
.se-flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.se-flow .st{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:9px;background:#fafbfc;border:1px solid var(--line);font-size:12.5px;line-height:1.3}
.se-flow .st span{font-size:18px}.se-flow .st small{display:block;color:var(--muted);font-size:11px}
.se-flow .ar{color:#c3c8d0}
.se-ci{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.se-cat{display:inline-flex;align-items:center;gap:10px;color:#3d4450;line-height:1.3}.se-cat small{display:block;color:var(--muted);font-size:11px}
.se-cats{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:10px}
.se-cats h4{margin:0;font-size:13px;font-weight:600;color:#424a57}
.se-cats ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.se-cats li{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fafbfc;font-size:13px}
.se-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.se-tab{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;align-items:center;text-decoration:none;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.se-tab:hover{border-color:#f0b9b9}
.se-tab[aria-current="page"]{border-color:var(--rak);background:var(--blush);box-shadow:inset 0 -3px 0 var(--rak)}
.se-tab .n{grid-row:span 2;display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:#fff;border:1px solid var(--blush-2);font-size:20px}
.se-tab b{font-weight:600;font-size:15px}.se-tab small{color:var(--muted);font-size:12px}
.se-off{display:flex;gap:10px;align-items:center;background:var(--amber-soft);border:1px solid #f1d38a;color:#6b4b12;border-radius:10px;padding:10px 14px;font-size:13px}
.se-sec{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px;display:grid;gap:14px}
.se-sec h3{margin:0;font-size:17px;font-weight:600}.se-sec > p{margin:-8px 0 0;color:var(--muted);font-size:13px}
.se-preview{position:relative;display:grid;gap:12px;opacity:.62;filter:grayscale(.35);pointer-events:none;user-select:none}
.se-preview::before{content:"ตัวอย่างโครงสร้าง";position:absolute;top:-6px;right:0;font-size:10.5px;letter-spacing:.5px;background:#eceef1;color:#6d7582;border-radius:999px;padding:1px 9px;z-index:1}
.se-bar,.se-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.se-f{display:grid;gap:4px;font-size:12px;color:var(--muted)}.se-f.wide{grid-column:span 2}
.se-f input{font:inherit;font-size:13.5px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#f8f9fb;width:100%}
.se-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.se-kpi{border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:#fafbfc}.se-kpi span{font-size:11.5px;color:var(--muted)}
.se-kpi b{display:block;font-size:24px;font-weight:600;line-height:1.3}.se-kpi small{font-size:11px;color:var(--muted)}
.se-meter{display:block;height:8px;border-radius:99px;background:#eceef1;min-width:90px}.se-meter i{display:block;width:0;height:100%}
.se-sk{display:block;height:10px;border-radius:5px;background:#eceef1}
.se-other{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.se-box{border:1px dashed #dce2eb;border-radius:10px;padding:10px 14px;display:grid;font-size:13px}.se-box span{color:var(--muted);font-size:12px}
.se-steps{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px}
.se-step{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:3px 12px 3px 4px;background:#fafbfc}
.se-step i{font-style:normal;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#eceef1;font-size:11px;font-weight:600}
.se-arr{color:#c3c8d0}
.se-sec .sp-btn{font:inherit;font-size:13.5px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:8px 14px;white-space:nowrap}
.se-sec .sp-btn.primary{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}
.se-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.se-left{margin-left:auto;font-size:13px;color:var(--muted)}
.se-gate{border:1px solid var(--line);background:#f7f8fa;border-radius:10px;padding:9px 14px;font-size:13px}
.se-sec td.r,.se-sec th.r{text-align:right}.se-sec td.c,.se-sec th.c{text-align:center}
.se-sec .plan{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px}
@media (max-width:1100px){.se-cats ul{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:860px){.se-cats ul{grid-template-columns:1fr 1fr}.se-tabs{grid-template-columns:1fr}.se-bar,.se-form,.se-kpis{grid-template-columns:1fr 1fr}.se-other,.se-sec .plan{grid-template-columns:1fr}}
@media (max-width:520px){.se-f.wide{grid-column:1/-1}.se-flow .ar{display:none}}`;

  /* ---------- overview: all projects ---------- */
  const STATUS = {
    draft:     { th: "Draft",     cls: "s-draft" },
    requested: { th: "Requested", cls: "s-req" },
    approved:  { th: "Approved",  cls: "s-ok" },
    revise:    { th: "Revise",    cls: "s-rev" },
  };
  const SAMPLE = [
    { id: "ij2610005", ij: "IJ2610005", jo: "", name: "New Dual EP Line", customer: "ULTRA CLEAN TECHNOLOGY (SINGAPORE)", city: "Singapore",
      status: "requested", days: 7, people: 7, planned: 566350, approved: 0, list: "active",
      phases: [["Phase 1 Installation", "23 May 2027", "30 May 2027", 7]] },
    { id: "ij2604012", ij: "IJ2604012", jo: "", name: "New Dual EP Line", customer: "ULTRA CLEAN TECHNOLOGY (ISRAEL)", city: "Tel Aviv",
      status: "requested", days: 10, people: 8, planned: 1268375, approved: 0, list: "active",
      phases: [["Phase 1 Installation", "—", "—", 10]] },
    { id: "ij20602006", ij: "IJ20602006", jo: "", name: "Plating Line & WWTP relocation", customer: "ISOBE", city: "Nagoya",
      status: "requested", days: 96, people: 13, planned: 2151000, approved: 0, list: "active",
      phases: [["Dismantle", "—", "—", 30], ["Installation", "—", "—", 50], ["Test & SAT", "—", "—", 16]] },
  ];
  const baht = n => "฿" + Math.round(n).toLocaleString("en-US");
  const L = d => `<svg class="se-ci" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    flow: L('<rect x="3.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.5"/><path d="M6.5 9.5v3a2 2 0 0 0 2 2h6"/>'),
    plus: L('<path d="M12 5v14M5 12h14"/>'),
    eye: L('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    check: L('<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.5 2.5 5-5.2"/>'),
    users: CATS[0].ic, money: L('<path d="M12 3.5v17M16.5 7.3a3.6 3.6 0 0 0-3.8-2.3H11a3.3 3.3 0 0 0 0 6.6h2a3.3 3.3 0 0 1 0 6.6h-1.8a3.7 3.7 0 0 1-3.9-2.4"/>'),
    clock: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    box: L('<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4"/>'),
    trash: L('<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-13M10 10.5v6.5M14 10.5v6.5"/>'),
    search: L('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
    cal: L('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="15.5" cy="15.5" r="2.6"/><path d="M15.5 14.4v1.2l.8.6"/>'),
    back: L('<path d="M14.5 6 8.5 12l6 6"/>'),
  };
  let VIEW = { list: "active", status: "all", q: "" };
  let OPEN = new Set();

  function overview(el) {
    const act = SAMPLE.filter(p => p.list === "active");
    const kpi = (ic, label, val) => `<div class="se-k"><span class="se-k-ic">${ic}</span><span><small>${label}</small><b>${val}</b></span></div>`;
    el.innerHTML = `
      <div class="se-ov">
        <div class="se-off">🚧 <span><b>วางโครงสร้างไว้แล้ว · ยังไม่เปิดใช้งาน</b> — รายการด้านล่างเป็น<b>ข้อมูลตัวอย่าง</b> กดเข้าไปดูโครง 3 Section ของแต่ละโปรเจคได้ แต่ยังสร้างหรือบันทึกข้อมูลไม่ได้</span></div>
        <div class="se-wf"><span class="se-wf-t">${IC.flow}<b>Workflow</b></span>
          <span class="se-pill p-red">${IC.plus}SC creates new project</span><span class="ar">→</span>
          <span class="se-pill p-amb">${IC.eye}Sent to SSM review</span><span class="ar">→</span>
          <span class="se-pill p-grn">${IC.check}Sent to MD approve</span></div>
        <div class="se-ks">
          ${kpi(IC.users, "Active Projects", act.length)}
          ${kpi(IC.money, "Total Planned", baht(act.reduce((a, p) => a + p.planned, 0)))}
          ${kpi(IC.check, "Approved Budget", baht(act.reduce((a, p) => a + p.approved, 0)))}
          ${kpi(IC.clock, "Waiting Approval", act.filter(p => p.status === "requested").length)}
        </div>
        <div class="se-row">
          <div class="se-seg" role="tablist">
            ${[["active", "Active", ""], ["archived", "Archived", IC.box], ["trash", "Trash", IC.trash]].map(([k, t, ic]) => `<button class="se-sb ${VIEW.list === k ? "on" : ""}" data-list="${k}">${ic}${t}</button>`).join("")}
          </div>
          <button class="se-new" disabled title="ยังไม่เปิดใช้งาน">${IC.plus}New Project</button>
        </div>
        <div class="se-row">
          <label class="se-q">${IC.search}<input id="seQ" placeholder="Search IJ, JO, customer, city..." value="${esc(VIEW.q)}"></label>
          <div class="se-chips">${["all", "draft", "requested", "approved", "revise"].map(k => `<button class="se-chip ${VIEW.status === k ? "on" : ""}" data-st="${k}">${k === "all" ? "All" : STATUS[k].th}</button>`).join("")}</div>
        </div>
        <div id="seList" class="se-list"></div>
      </div>`;
    const draw = () => {
      const q = VIEW.q.toLowerCase();
      const rows = SAMPLE.filter(p => p.list === VIEW.list && (VIEW.status === "all" || p.status === VIEW.status)
        && (!q || [p.ij, p.jo, p.name, p.customer, p.city].join(" ").toLowerCase().includes(q)));
      el.querySelector("#seList").innerHTML = rows.length ? rows.map(card).join("") : `<div class="empty">${q ? `ไม่พบโปรเจคที่ตรงกับ “${esc(VIEW.q)}”` : "ยังไม่มีโปรเจค"}</div>`;
      el.querySelectorAll("[data-tl]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const id = b.dataset.tl; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); draw(); });
    };
    el.querySelectorAll("[data-list]").forEach(b => b.onclick = () => { VIEW.list = b.dataset.list; overview(el); });
    el.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { VIEW.status = b.dataset.st; overview(el); });
    el.querySelector("#seQ").oninput = e => { VIEW.q = e.target.value; draw(); };
    draw();
  }

  function card(p) {
    const st = STATUS[p.status], open = OPEN.has(p.id);
    const tl = open ? `<div class="se-tl"><div class="se-tl-h">${IC.cal}<b>Project Timeline</b><span>${esc(p.phases[0][1])} – ${esc(p.phases[p.phases.length - 1][2])} · ${p.days} days</span></div>
      <ul>${p.phases.map(([n, a, b, d]) => `<li><b>${esc(n)}</b><span>${esc(a)} – ${esc(b)} · ${d} days</span></li>`).join("")}</ul></div>` : "";
    return `<article class="se-card ${open ? "open" : ""}">
      <a class="se-card-main" href="#site-expense/${encodeURIComponent(p.id)}">
        <span class="se-card-l"><span class="se-id"><b>${esc(p.ij)}</b>${p.jo ? `<span class="se-jo">JO ${esc(p.jo)}</span>` : ""}<span class="se-st ${st.cls}">${st.th}</span>
          <button class="se-tlb" data-tl="${esc(p.id)}" aria-expanded="${open}" title="Project Timeline">${IC.cal}<span>${open ? "▴" : "▾"}</span></button></span>
          <span class="se-nm">${esc(p.name)}</span><span class="se-cu">${esc(p.customer)} · ${esc(p.city)}</span></span>
        <span class="se-card-r"><span>${p.days} days</span><span class="se-ppl">${CATS[0].ic}${p.people}</span><b>${baht(p.planned)}</b></span>
      </a>${tl}</article>`;
  }

  /* ---------- one project: 3 sections ---------- */
  function project(el, p, secId) {
    const cur = secOf(secId);
    const st = STATUS[p.status];
    const flow = FLOW.map(([ic, a, b]) => `<span class="st"><span>${ic}</span><span>${esc(a)}<small>${esc(b)}</small></span></span>`).join('<span class="ar">→</span>');
    const href = s => `#site-expense/${encodeURIComponent(p.id)}${s === "dashboard" ? "" : "/" + s}`;
    const tabs = SECTIONS.map(s => `<a class="se-tab" href="${href(s.id)}" ${s.id === cur.id ? 'aria-current="page"' : ""}><span class="n">${s.ic}</span><b>${s.no}. ${esc(s.name)}</b><small>${esc(s.th)}</small></a>`).join("");
    const plan = `<ul class="plan">${cur.plan.map(x => `<li><span class="ck"></span>${esc(x)}</li>`).join("")}</ul>`;
    el.innerHTML = `
      <div style="display:grid;gap:16px">
        <a class="se-back" href="#site-expense">${IC.back}Overview all project</a>
        <div class="se-ph">
          <div><div class="se-id"><b>${esc(p.ij)}</b>${p.jo ? `<span class="se-jo">JO ${esc(p.jo)}</span>` : `<span class="se-jo none">ยังไม่มี JO</span>`}<span class="se-st ${st.cls}">${st.th}</span></div>
            <h2>${esc(p.name)}</h2><div class="se-cu">${esc(p.customer)} · ${esc(p.city)}</div></div>
          <div class="se-ph-r"><span><small>ระยะเวลา</small><b>${p.days} days</b></span><span><small>คน</small><b>${p.people}</b></span><span><small>Planned</small><b>${baht(p.planned)}</b></span></div>
        </div>
        <div class="se-off">🚧 <span><b>ข้อมูลตัวอย่าง · ยังไม่เปิดใช้งาน</b> — หน้าจอด้านล่างเป็นโครงสร้าง ยังกรอกหรือบันทึกข้อมูลไม่ได้</span></div>
        <div class="se-flow" aria-label="ลำดับงานของโปรเจค">${flow}</div>
        <nav class="se-tabs" aria-label="Section ของโปรเจค">${tabs}</nav>
        <section class="se-sec" aria-labelledby="seH">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h3 id="seH">${cur.ic} ${cur.no}. ${esc(cur.name)} · ${esc(cur.th)}</h3><span class="badge ${LIVE[cur.id] ? "live" : "soon"}">${LIVE[cur.id] ? "ใช้งานได้" : "ยังไม่เปิดใช้งาน"}</span></div>
          <p>${esc(cur.desc)}</p>
          ${plan}
          <div class="se-cats"><h4>กลุ่มหมวดค่าใช้จ่าย</h4><ul>${CATS.map(c => `<li>${catCell(c)}</li>`).join("")}</ul></div>
          <div class="se-preview" aria-hidden="true" inert>${PREVIEW[cur.id]()}</div>
        </section>
      </div>`;
  }

  const CSS2 = `
.se-ov{display:grid;gap:16px}
.se-wf{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:14px 18px}
.se-wf-t{display:flex;align-items:center;gap:8px;color:var(--rak);margin-right:6px}.se-wf-t b{color:var(--ink);font-weight:600}
.se-pill{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 14px;font-weight:500;font-size:13.5px}
.se-pill .se-ci{width:17px;height:17px}
.p-red{background:#fde8e8;color:var(--rak)}.p-amb{background:#fdf1c9;color:#a0560c}.p-grn{background:#dff5e9;color:#1d7a4f}
.se-wf .ar{color:#a6adb8}
.se-ks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.se-k{display:flex;gap:14px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.se-k-ic{display:grid;place-items:center;width:46px;height:46px;border-radius:11px;background:#fde8e8;color:var(--rak);flex:none}.se-k-ic .se-ci{width:24px;height:24px}
.se-k small{display:block;color:var(--muted);font-size:12.5px}.se-k b{display:block;font-size:22px;font-weight:600;line-height:1.3;font-variant-numeric:tabular-nums}
.se-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between}
.se-seg{display:flex;gap:8px}
.se-sb{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;color:#3d4450;border-radius:9px;padding:7px 14px;font-size:14px}
.se-sb .se-ci{width:17px;height:17px}.se-sb.on{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}
.se-new{display:inline-flex;align-items:center;gap:8px;border:0;background:var(--rak);color:#fff;border-radius:9px;padding:9px 18px;font-size:14px;font-weight:600}
.se-new:disabled{opacity:.5;cursor:not-allowed}.se-new .se-ci{width:18px;height:18px}
.se-q{position:relative;flex:1 1 320px;max-width:400px}.se-q .se-ci{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#a0a8b4;width:18px;height:18px}
.se-q input{width:100%;font:inherit;border:1px solid var(--line);border-radius:9px;padding:9px 12px 9px 40px;background:#fff}
.se-chips{display:flex;flex-wrap:wrap;gap:4px;margin-right:auto}
.se-chip{border:0;background:none;color:#5d6673;border-radius:999px;padding:5px 13px;font-size:13.5px}.se-chip:hover{background:#f1f3f6}.se-chip.on{background:#fde8e8;color:var(--rak);font-weight:600}
.se-list{display:grid;gap:12px}
.se-card{background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.se-card:hover,.se-card.open{border-color:#f0c4c4;box-shadow:0 8px 22px -18px rgba(0,0,0,.5)}
.se-card-main{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:16px 20px;text-decoration:none}
.se-card-l{display:grid;gap:2px;min-width:0}
.se-id{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.se-id b{font-size:17px;font-weight:600}
.se-jo{font-size:12px;color:var(--rak);font-weight:600}.se-jo.none{color:var(--muted);font-weight:400}
.se-st{font-size:12px;font-weight:600;border-radius:6px;padding:1px 10px}
.s-draft{background:#eceef1;color:#5d6673}.s-req{background:#fdf1c9;color:#a0560c}.s-ok{background:#dff5e9;color:#1d7a4f}.s-rev{background:#fde8e8;color:var(--rak)}
.se-tlb{display:inline-flex;align-items:center;gap:2px;border:0;background:none;color:#9aa2ad;padding:2px 4px;border-radius:6px}.se-tlb:hover{background:#f1f3f6;color:var(--rak)}.se-tlb .se-ci{width:17px;height:17px}
.se-nm{font-weight:500;font-size:14.5px;margin-top:4px}.se-cu{color:var(--muted);font-size:13px}
.se-card-r{display:flex;align-items:center;gap:18px;color:var(--muted);white-space:nowrap;font-size:14px}.se-card-r b{color:var(--ink);font-size:15.5px;font-weight:600;font-variant-numeric:tabular-nums}
.se-ppl{display:inline-flex;align-items:center;gap:4px}.se-ppl .se-ci{width:16px;height:16px}
.se-tl{border-top:1px solid var(--line);background:#fafbfc;padding:14px 20px 16px}
.se-tl-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:var(--rak)}.se-tl-h b{color:var(--ink);font-weight:600}.se-tl-h span{color:var(--muted);font-size:12.5px}
.se-tl ul{list-style:none;margin:10px 0 0 9px;padding:0 0 0 18px;border-left:2px solid #e2e5ea;display:grid;gap:8px}
.se-tl li{position:relative;display:grid}.se-tl li::before{content:"";position:absolute;left:-24px;top:7px;width:8px;height:8px;border-radius:50%;background:var(--rak)}
.se-tl li b{font-weight:500}.se-tl li span{color:var(--muted);font-size:12.5px}
.se-back{display:inline-flex;align-items:center;gap:4px;justify-self:start;text-decoration:none;color:var(--muted);font-size:13px}.se-back:hover{color:var(--rak)}.se-back .se-ci{width:17px;height:17px}
.se-ph{display:flex;flex-wrap:wrap;gap:14px 24px;justify-content:space-between;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 20px}
.se-ph h2{margin:4px 0 0;font-size:20px;font-weight:600}
.se-ph-r{display:flex;gap:22px}.se-ph-r small{display:block;color:var(--muted);font-size:11.5px}.se-ph-r b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
@media (max-width:1000px){.se-ks{grid-template-columns:1fr 1fr}}
@media (max-width:640px){.se-ks{grid-template-columns:1fr}.se-card-main{flex-direction:column;align-items:stretch}.se-card-r{justify-content:flex-start;gap:14px}.se-q{max-width:none}.se-wf .ar{display:none}}`;

  function mount(el, sub) {
    if (!document.getElementById("seCss")) { const s = document.createElement("style"); s.id = "seCss"; s.textContent = CSS + CSS2; document.head.appendChild(s); }
    const [pid, sec] = (sub || "").split("/").map(decodeURIComponent);
    if (!pid) return overview(el);
    const p = SAMPLE.find(x => x.id === pid);
    if (!p) { el.innerHTML = `<div class="empty">ไม่พบโปรเจคนี้ · <a class="open" href="#site-expense">กลับ Overview</a></div>`; return; }
    project(el, p, sec || "dashboard");
  }

  window.SiteExpense = { mount };
})();
