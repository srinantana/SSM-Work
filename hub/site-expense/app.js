/* Site Expense menu — structure only (not in use yet).
   Routes:  #site-expense            → Dashboard (default)
            #site-expense/dashboard  → Budget vs Actual, searchable by Project no.
            #site-expense/estimate   → Estimate from scope of work (SOW) → approval → open Job → Budgetary
            #site-expense/actual     → Daily actual expense from site, against the locked budget
   Every input and button here is disabled on purpose. When a section goes live, replace its preview with the real page
   and flip LIVE[section] to true. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const LIVE = { dashboard: false, estimate: false, actual: false };

  // Expense categories shared by Estimate, Budgetary and Actual so all three compare line by line.
  const CATS = ["ค่าแรง (Manday)", "เบี้ยเลี้ยง", "ที่พัก", "ค่าเดินทาง / รถ", "วัสดุสิ้นเปลือง / เครื่องมือ", "อื่นๆ"];

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
        <tbody>${CATS.map(c => `<tr><td>${esc(c)}</td><td class="r">–</td><td class="r">–</td><td class="r">–</td><td><span class="se-meter"><i></i></span></td></tr>`).join("")}</tbody>
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
      <div class="se-form">${field("Project no. / JO", "เลือกโปรเจคที่มีงบแล้ว", "wide")}${field("วันที่", "วว/ดด/ปปปป")}${field("หมวด", CATS[1])}${field("รายการ", "เช่น ค่าที่พัก 2 ห้อง", "wide")}${field("จำนวนเงิน (บาท)", "0.00")}${field("ใบเสร็จ", "แนบรูป")}</div>
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
@media (max-width:860px){.se-tabs{grid-template-columns:1fr}.se-bar,.se-form,.se-kpis{grid-template-columns:1fr 1fr}.se-other,.se-sec .plan{grid-template-columns:1fr}}
@media (max-width:520px){.se-f.wide{grid-column:1/-1}.se-flow .ar{display:none}}`;

  function mount(el, sub) {
    if (!document.getElementById("seCss")) { const s = document.createElement("style"); s.id = "seCss"; s.textContent = CSS; document.head.appendChild(s); }
    const cur = secOf(sub);
    const flow = FLOW.map(([ic, a, b]) => `<span class="st"><span>${ic}</span><span>${esc(a)}<small>${esc(b)}</small></span></span>`).join('<span class="ar">→</span>');
    const tabs = SECTIONS.map(s => `<a class="se-tab" href="#site-expense/${s.id}" ${s.id === cur.id ? 'aria-current="page"' : ""}><span class="n">${s.ic}</span><b>${s.no}. ${esc(s.name)}</b><small>${esc(s.th)}</small></a>`).join("");
    const plan = `<ul class="plan">${cur.plan.map(x => `<li><span class="ck"></span>${esc(x)}</li>`).join("")}</ul>`;
    el.innerHTML = `
      <div style="display:grid;gap:16px">
        <div class="se-off">🚧 <span><b>วางโครงสร้างไว้แล้ว · ยังไม่เปิดใช้งาน</b> — หน้าจอด้านล่างเป็นตัวอย่างโครงสร้าง ยังกรอกหรือบันทึกข้อมูลไม่ได้</span></div>
        <div class="se-flow" aria-label="ลำดับงาน Site Expense">${flow}</div>
        <nav class="se-tabs" aria-label="ส่วนของ Site Expense">${tabs}</nav>
        <section class="se-sec" aria-labelledby="seH">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h3 id="seH">${cur.ic} ${cur.no}. ${esc(cur.name)} · ${esc(cur.th)}</h3><span class="badge ${LIVE[cur.id] ? "live" : "soon"}">${LIVE[cur.id] ? "ใช้งานได้" : "ยังไม่เปิดใช้งาน"}</span></div>
          <p>${esc(cur.desc)}</p>
          ${plan}
          <div class="se-preview" aria-hidden="true" inert>${PREVIEW[cur.id]()}</div>
        </section>
      </div>`;
  }
  window.SiteExpense = { mount };
})();
