/* Site Expense menu — TEST MODE (data kept in this browser only; not connected to Supabase yet).
   Routes:  #site-expense                 → Overview all project (workflow, KPIs, Active/Archived/Trash, search, status filter, New Project)
            #site-expense/<id>            → project · 1 Dashboard (Budget vs Actual)
            #site-expense/<id>/estimate   → project · 2 Estimate from SOW → SC → SSM → MD → open Job (JO) → Budgetary (locked)
            #site-expense/<id>/actual     → project · 3 Actual record, daily from site, SSM checks each line
   Roles can be switched in the blue test bar so one person can walk through the whole flow. */
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
  /* ======================= TEST MODE =======================
     Everything below keeps its data in this browser only (localStorage key KEY).
     Swap load()/save() for calls to /api/site-expense/* (Supabase tables in database/site_expense.sql) to go live. */
  const KEY = "ssm-site-expense-test-v1";
  const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
  const baht = n => "฿" + Math.round(n).toLocaleString("en-US");
  const money = n => Math.round(n).toLocaleString("en-US");
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtD = d => { if (!d) return "—"; const x = new Date(d + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const span = (a, b) => (a && b) ? Math.max(1, Math.round((new Date(b) - new Date(a)) / 864e5) + 1) : 0;
  const catOf = code => CATS.find(c => c.code === code) || CATS[5];

  // Sample master rates (placeholders until the real rate tables exist in Supabase)
  const RATES = {
    manpower:       [["Engineer", "manday", 3500], ["Supervisor", "manday", 4000], ["Technician", "manday", 2500], ["Helper", "manday", 1500]],
    subcontract:    [["งานเหมาช่วง (lot)", "lot", 0], ["เครนยก / Rigging", "day", 15000]],
    transportation: [["รถกระบะ", "trip", 3000], ["รถ 6 ล้อ", "trip", 8000], ["รถ 10 ล้อ", "trip", 12000]],
    accommodation:  [["ห้องพัก (ในประเทศ)", "คืน", 1200], ["ห้องพัก (ต่างประเทศ)", "คืน", 3500]],
    travel:         [["ตั๋วเครื่องบินในประเทศ", "ใบ", 4000], ["ตั๋วเครื่องบินต่างประเทศ", "ใบ", 25000], ["ค่าเดินทางในพื้นที่", "วัน", 500]],
    site_expense:   [["เบี้ยเลี้ยง", "คน-วัน", 400], ["วัสดุสิ้นเปลือง", "lot", 0], ["ค่าใช้จ่ายเบ็ดเตล็ด", "lot", 0]],
  };

  const STATUS = {
    draft:     { th: "Draft",         cls: "s-draft", wait: "SC กำลังร่าง" },
    requested: { th: "Requested",     cls: "s-req",   wait: "รอ SSM ตรวจ" },
    reviewed:  { th: "SSM reviewed",  cls: "s-req",   wait: "รอ MD อนุมัติ" },
    approved:  { th: "Approved",      cls: "s-ok",    wait: "รอ Get Award (Job no.)" },
    revise:    { th: "Revise",        cls: "s-rev",   wait: "ส่งกลับให้ SC แก้" },
    locked:    { th: "Budget locked", cls: "s-lock",  wait: "บันทึก Actual ได้" },
  };
  const FILTERS = [["all", "All", null], ["draft", "Draft", ["draft"]], ["requested", "Requested", ["requested", "reviewed"]], ["approved", "Approved", ["approved", "locked"]], ["revise", "Revise", ["revise"]]];
  // RAK Site & Service team. Only SSM may Get Award and adjust the Budget control.
  const PEOPLE = [["dew", "ดิว", "ssm", "nan.s"], ["spy", "สปาย", "sc", "pra.pu"], ["art", "อาร์ต", "sc", "sak.c"], ["num", "หนุ่ม", "sc", "tee.h"], ["bee", "บี", "md", "cha.s"]];
  const ROLE_TH = { sc: "SC", ssm: "SSM", md: "MD" };
  const namesOf = r => PEOPLE.filter(x => x[2] === r).map(x => x[1]).join(" / ");

  const L = d => `<svg class="se-ci" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    flow: L('<rect x="3.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.5"/><path d="M6.5 9.5v3a2 2 0 0 0 2 2h6"/>'),
    plus: L('<path d="M12 5v14M5 12h14"/>'),
    eye: L('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    check: L('<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.5 2.5 5-5.2"/>'),
    money: L('<path d="M12 3.5v17M16.5 7.3a3.6 3.6 0 0 0-3.8-2.3H11a3.3 3.3 0 0 0 0 6.6h2a3.3 3.3 0 0 1 0 6.6h-1.8a3.7 3.7 0 0 1-3.9-2.4"/>'),
    clock: L('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    box: L('<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4"/>'),
    trash: L('<path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.5h6.4a1.5 1.5 0 0 0 1.5-1.5l.8-13M10 10.5v6.5M14 10.5v6.5"/>'),
    search: L('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
    cal: L('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="15.5" cy="15.5" r="2.6"/><path d="M15.5 14.4v1.2l.8.6"/>'),
    back: L('<path d="M14.5 6 8.5 12l6 6"/>'),
    lock: L('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'),
    x: L('<path d="m6 6 12 12M18 6 6 18"/>'),
    edit: L('<path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/>'),
  };

  /* ---------- store ---------- */
  function seed() {
    const mk = (o) => Object.assign({ jo: "", list: "active", lines: [], history: [], budget: null, lockedAt: null, actuals: [], createdAt: new Date().toISOString() }, o);
    const L1 = (cat, scope, people, days, qty, unit, rate) => ({ id: uid(), cat, scope, people, days, qty, unit, rate, remark: "" });
    return { v: 1, user: "dew", projects: [
      mk({ id: "ij2610005", ij: "IJ2610005", name: "New Dual EP Line", customer: "ULTRA CLEAN TECHNOLOGY (SINGAPORE)", city: "Singapore",
        start: "2027-05-23", end: "2027-05-30", phases: [{ name: "Phase 1 Installation", start: "2027-05-23", end: "2027-05-30" }], status: "requested",
        lines: [L1("manpower", "Engineer", 2, 8, "", "manday", 3500), L1("manpower", "Technician", 5, 8, "", "manday", 2500), L1("travel", "ตั๋วเครื่องบินต่างประเทศ", "", "", 7, "ใบ", 25000), L1("accommodation", "ห้องพัก (ต่างประเทศ)", "", "", 28, "คืน", 3500)],
        history: [{ at: new Date().toISOString(), role: "sc", by: "สปาย", action: "submit", note: "" }] }),
      mk({ id: "ij2604012", ij: "IJ2604012", name: "New Dual EP Line", customer: "ULTRA CLEAN TECHNOLOGY (ISRAEL)", city: "Tel Aviv",
        start: "2027-03-01", end: "2027-03-10", phases: [{ name: "Phase 1 Installation", start: "2027-03-01", end: "2027-03-10" }], status: "draft",
        lines: [L1("manpower", "Technician", 8, 10, "", "manday", 2500)] }),
      mk({ id: "ij20602006", ij: "IJ20602006", jo: "03302026", name: "Plating Line & WWTP relocation", customer: "ISOBE", city: "Nagoya",
        start: "2026-11-01", end: "2027-02-04", phases: [{ name: "Dismantle", start: "2026-11-01", end: "2026-11-30" }, { name: "Installation", start: "2026-12-01", end: "2027-01-19" }, { name: "Test & SAT", start: "2027-01-20", end: "2027-02-04" }],
        status: "locked", lockedAt: new Date().toISOString(),
        lines: [L1("manpower", "Technician", 10, 96, "", "manday", 1000), L1("manpower", "Supervisor", 3, 96, "", "manday", 1500), L1("transportation", "รถ 10 ล้อ", "", "", 10, "trip", 12000), L1("accommodation", "ห้องพัก (ต่างประเทศ)", "", "", 100, "คืน", 3500)],
        history: [{ at: new Date().toISOString(), role: "sc", by: "อาร์ต", action: "submit", note: "" }, { at: new Date().toISOString(), role: "ssm", by: "ดิว", action: "approve", note: "" }, { at: new Date().toISOString(), role: "md", by: "บี", action: "approve", note: "" }, { at: new Date().toISOString(), role: "ssm", by: "ดิว", action: "award", note: "Job 03302026" }],
        actuals: [
          { id: uid(), date: "2026-11-03", cat: "manpower", desc: "ค่าแรงทีมรื้อถอน สัปดาห์ 1", amount: 182000, receipt: "", by: "อาร์ต", status: "checked" },
          { id: uid(), date: "2026-11-04", cat: "accommodation", desc: "ที่พัก 13 ห้อง × 7 คืน", amount: 318500, receipt: "hotel-w1.jpg", by: "หนุ่ม", status: "checked" },
          { id: uid(), date: "2026-11-06", cat: "transportation", desc: "รถ 10 ล้อ ขนอุปกรณ์", amount: 24000, receipt: "", by: "อาร์ต", status: "pending" }] }),
    ].map(p => { if (p.status === "locked") p.budget = sumByCat(p); return p; }) };
  }
  let DB = null;
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && d.v === 1) { if (!d.user) d.user = { sc: "spy", ssm: "dew", md: "bee" }[d.role] || "dew"; return d; } } catch (e) {} return seed(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
  const me = () => PEOPLE.find(x => x[0] === DB.user) || PEOPLE[0];
  const role = () => me()[2];
  const who = () => me()[1];

  /* ---------- calculations ---------- */
  const qtyOf = l => (l.qty !== "" && l.qty != null) ? num(l.qty) : num(l.people) * num(l.days);
  const amtOf = l => qtyOf(l) * num(l.rate);
  const totalOf = p => p.lines.reduce((a, l) => a + amtOf(l), 0);
  function sumByCat(p) { const o = {}; CATS.forEach(c => o[c.code] = 0); p.lines.forEach(l => o[l.cat] = (o[l.cat] || 0) + amtOf(l)); return o; }
  const peopleOf = p => p.lines.filter(l => l.cat === "manpower").reduce((a, l) => a + num(l.people), 0);
  const daysOf = p => span(p.start, p.end);
  const plannedOf = p => p.budget ? Object.values(p.budget).reduce((a, b) => a + b, 0) : totalOf(p);
  const actualBy = p => { const o = {}; CATS.forEach(c => o[c.code] = 0); p.actuals.filter(a => a.status !== "rejected").forEach(a => o[a.cat] += num(a.amount)); return o; };
  const editable = p => (p.status === "draft" || p.status === "revise") && role() === "sc" && p.list === "active";

  /* ---------- shared bits ---------- */
  function roleBar() {
    return `<div class="se-role"><span>🧪 โหมดทดลอง · ทดสอบเป็น</span>${PEOPLE.map(([k, n, r]) => `<button class="se-rb ${DB.user === k ? "on" : ""}" data-user="${k}" data-role="${r}">${esc(n)} <small>${ROLE_TH[r]}</small></button>`).join("")}
      <span class="se-role-n">ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น · rate เป็นค่าตัวอย่าง</span><button class="se-link" data-reset>ล้างข้อมูลทดลอง</button></div>`;
  }
  function wireRole(el, redraw) {
    el.querySelectorAll("[data-user]").forEach(b => b.onclick = () => { DB.user = b.dataset.user; DB.picked = true; save(); redraw(); });
    const r = el.querySelector("[data-reset]");
    if (r) r.onclick = () => { if (confirm("ล้างข้อมูลทดลองทั้งหมดแล้วเริ่มใหม่จากตัวอย่าง?")) { DB = seed(); save(); location.hash = "#site-expense"; redraw(); } };
  }
  function toast(msg) {
    let t = document.getElementById("seToast"); if (!t) { t = document.createElement("div"); t.id = "seToast"; document.body.appendChild(t); }
    t.textContent = msg; t.className = "on"; clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 2200);
  }
  function modal(title, body, onOk, okText = "บันทึก") {
    const m = document.createElement("div"); m.className = "se-modal";
    m.innerHTML = `<div class="se-dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="se-dlg-h"><b>${esc(title)}</b><button class="se-x" data-close aria-label="ปิด">${IC.x}</button></div>
      <div class="se-dlg-b">${body}</div><div class="se-dlg-f"><span class="se-err" id="seErr"></span><button class="se-btn" data-close>ยกเลิก</button><button class="se-btn primary" data-ok>${esc(okText)}</button></div></div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelectorAll("[data-close]").forEach(b => b.onclick = close);
    m.onclick = e => { if (e.target === m) close(); };
    m.querySelector("[data-ok]").onclick = () => { const err = onOk(m); if (err) m.querySelector("#seErr").textContent = err; else close(); };
    const f = m.querySelector("input,select,textarea"); if (f) f.focus();
    return m;
  }

  /* ---------- overview ---------- */
  let VIEW = { list: "active", status: "all", q: "" };
  const OPEN = new Set();

  function overview(el) {
    const act = DB.projects.filter(p => p.list === "active");
    const kpi = (ic, label, val) => `<div class="se-k"><span class="se-k-ic">${ic}</span><span><small>${label}</small><b>${val}</b></span></div>`;
    const cnt = k => DB.projects.filter(p => p.list === k).length;
    el.innerHTML = `
      <div class="se-ov">
        ${roleBar()}
        <div class="se-wf"><span class="se-wf-t">${IC.flow}<b>Workflow</b></span>
          <span class="se-pill p-red">${IC.plus}SC creates new project</span><span class="ar">→</span>
          <span class="se-pill p-amb">${IC.eye}Sent to SSM review</span><span class="ar">→</span>
          <span class="se-pill p-grn">${IC.check}Sent to MD approve</span><span class="ar">→</span>
          <span class="se-pill p-blu">${IC.lock}Open Job → Budgetary</span></div>
        <div class="se-ks">
          ${kpi(CATS[0].ic, "Active Projects", act.length)}
          ${kpi(IC.money, "Total Planned", baht(act.reduce((a, p) => a + plannedOf(p), 0)))}
          ${kpi(IC.check, "Approved Budget", baht(act.filter(p => p.status === "approved" || p.status === "locked").reduce((a, p) => a + plannedOf(p), 0)))}
          ${kpi(IC.clock, "Waiting Approval", act.filter(p => p.status === "requested" || p.status === "reviewed").length)}
        </div>
        <div class="se-row">
          <div class="se-seg">${[["active", "Active", ""], ["archived", "Archived", IC.box], ["trash", "Trash", IC.trash]].map(([k, t, ic]) => `<button class="se-sb ${VIEW.list === k ? "on" : ""}" data-list="${k}">${ic}${t}${k !== "active" && cnt(k) ? ` <small>${cnt(k)}</small>` : ""}</button>`).join("")}</div>
          ${role() === "sc" ? `<button class="se-new" data-new>${IC.plus}New Project</button>` : `<span class="se-hint">สร้างโปรเจคได้เฉพาะ SC (${namesOf("sc")})</span>`}
        </div>
        <div class="se-row">
          <label class="se-q">${IC.search}<input id="seQ" placeholder="Search IJ, Job no., customer, city..." value="${esc(VIEW.q)}" aria-label="ค้นหาโปรเจค"></label>
          <div class="se-chips">${FILTERS.map(([k, t]) => `<button class="se-chip ${VIEW.status === k ? "on" : ""}" data-st="${k}">${t}</button>`).join("")}</div>
        </div>
        <div id="seList" class="se-list"></div>
      </div>`;
    const draw = () => {
      const q = VIEW.q.toLowerCase(), f = FILTERS.find(x => x[0] === VIEW.status)[2];
      const rows = DB.projects.filter(p => p.list === VIEW.list && (!f || f.includes(p.status))
        && (!q || [p.ij, p.jo, p.name, p.customer, p.city].join(" ").toLowerCase().includes(q)));
      el.querySelector("#seList").innerHTML = rows.length ? rows.map(card).join("")
        : `<div class="empty">${q ? `ไม่พบโปรเจคที่ตรงกับ “${esc(VIEW.q)}”` : VIEW.list === "active" ? "ยังไม่มีโปรเจค · กด New Project ในบทบาท SC" : "ไม่มีรายการ"}</div>`;
      el.querySelectorAll("[data-tl]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const id = b.dataset.tl; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); draw(); });
    };
    wireRole(el, () => overview(el));
    el.querySelectorAll("[data-list]").forEach(b => b.onclick = () => { VIEW.list = b.dataset.list; overview(el); });
    el.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { VIEW.status = b.dataset.st; overview(el); });
    el.querySelector("#seQ").oninput = e => { VIEW.q = e.target.value; draw(); };
    const nb = el.querySelector("[data-new]"); if (nb) nb.onclick = () => projectForm(null);
    draw();
  }

  function card(p) {
    const st = STATUS[p.status], open = OPEN.has(p.id), ph = p.phases || [];
    const tl = open ? `<div class="se-tl"><div class="se-tl-h">${IC.cal}<b>Project Timeline</b><span>${fmtD(p.start)} – ${fmtD(p.end)} · ${daysOf(p)} days</span></div>
      ${ph.length ? `<ul>${ph.map(x => `<li><b>${esc(x.name)}</b><span>${fmtD(x.start)} – ${fmtD(x.end)} · ${span(x.start, x.end)} days</span></li>`).join("")}</ul>` : `<p class="se-muted">ยังไม่ได้แบ่ง phase</p>`}</div>` : "";
    return `<article class="se-card ${open ? "open" : ""}">
      <a class="se-card-main" href="#site-expense/${encodeURIComponent(p.id)}">
        <span class="se-card-l"><span class="se-id"><b>${esc(p.ij)}</b>${p.jo ? `<span class="se-jo">Job ${esc(p.jo)}</span>` : ""}<span class="se-st ${st.cls}">${st.th}</span>
          <button class="se-tlb" data-tl="${esc(p.id)}" aria-expanded="${open}" aria-label="Project Timeline">${IC.cal}<span>${open ? "▴" : "▾"}</span></button><span class="se-wait">${st.wait}</span></span>
          <span class="se-nm">${esc(p.name)}</span><span class="se-cu">${esc(p.customer)}${p.city ? " · " + esc(p.city) : ""}</span></span>
        <span class="se-card-r"><span>${daysOf(p)} days</span><span class="se-ppl">${CATS[0].ic}${peopleOf(p)}</span><b>${baht(plannedOf(p))}</b></span>
      </a>${tl}</article>`;
  }

  /* ---------- new / edit project ---------- */
  function projectForm(p) {
    const v = p || { ij: "", name: "", customer: "", city: "", start: "", end: "", phases: [] };
    const phaseRow = (x = {}) => `<div class="se-phr"><input placeholder="ชื่อ phase เช่น Installation" value="${esc(x.name || "")}" data-k="name"><input type="date" value="${esc(x.start || "")}" data-k="start"><input type="date" value="${esc(x.end || "")}" data-k="end"><button class="se-x" data-delph aria-label="ลบ phase">${IC.x}</button></div>`;
    const m = modal(p ? "แก้ไขข้อมูลโปรเจค" : "New Project", `
      <div class="se-fgrid">
        <label>IJ no. *<input id="fIj" value="${esc(v.ij)}" placeholder="IJ2611001"></label>
        <label class="w2">Project name *<input id="fName" value="${esc(v.name)}" placeholder="เช่น New Dual EP Line"></label>
        <label class="w2">Customer<input id="fCus" value="${esc(v.customer)}"></label>
        <label>City / Site<input id="fCity" value="${esc(v.city)}"></label>
        <label>Start<input id="fStart" type="date" value="${esc(v.start)}"></label>
        <label>End<input id="fEnd" type="date" value="${esc(v.end)}"></label>
      </div>
      <div class="se-phs"><b>Project Timeline (phase)</b><div id="fPh">${(v.phases.length ? v.phases : [{}]).map(phaseRow).join("")}</div><button class="se-btn" data-addph>${IC.plus}เพิ่ม phase</button></div>`,
      mm => {
        const g = id => mm.querySelector(id).value.trim();
        const ij = g("#fIj"), name = g("#fName");
        if (!ij || !name) return "กรอก IJ no. และ Project name";
        const s = g("#fStart"), e = g("#fEnd");
        if (s && e && e < s) return "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม";
        if (DB.projects.some(x => x.ij.toLowerCase() === ij.toLowerCase() && x !== p && x.list !== "trash")) return "มี IJ นี้อยู่แล้ว";
        const phases = [...mm.querySelectorAll(".se-phr")].map(r => ({ name: r.querySelector('[data-k="name"]').value.trim(), start: r.querySelector('[data-k="start"]').value, end: r.querySelector('[data-k="end"]').value })).filter(x => x.name);
        const data = { ij, name, customer: g("#fCus"), city: g("#fCity"), start: s, end: e, phases };
        if (p) { Object.assign(p, data); save(); toast("บันทึกข้อมูลโปรเจคแล้ว"); window.dispatchEvent(new HashChangeEvent("hashchange")); }
        else {
          const np = Object.assign({ id: ij.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + uid().slice(0, 4), jo: "", status: "draft", list: "active", lines: [], history: [], budget: null, lockedAt: null, actuals: [], createdAt: new Date().toISOString() }, data);
          DB.projects.unshift(np); save(); toast("สร้างโปรเจคแล้ว · เริ่มกรอก Estimate"); location.hash = "#site-expense/" + encodeURIComponent(np.id) + "/estimate";
        }
      }, p ? "บันทึก" : "สร้างโปรเจค");
    m.querySelector("[data-addph]").onclick = () => { m.querySelector("#fPh").insertAdjacentHTML("beforeend", phaseRow()); wirePh(); };
    const wirePh = () => m.querySelectorAll("[data-delph]").forEach(b => b.onclick = () => b.parentElement.remove());
    wirePh();
  }

  /* ---------- project page ---------- */
  const SECS = [
    { id: "dashboard", no: "1", name: "Dashboard", th: "Budget vs Actual", ic: "📊" },
    { id: "estimate", no: "2", name: "Estimate", th: "ประเมินจาก Scope of Work", ic: "📝" },
    { id: "actual", no: "3", name: "Actual record", th: "บันทึกค่าใช้จ่ายจริงจากหน้างาน", ic: "🧾" },
  ];
  function project(el, p, secId) {
    const cur = SECS.find(s => s.id === secId) || SECS[0];
    const st = STATUS[p.status];
    const href = s => `#site-expense/${encodeURIComponent(p.id)}${s === "dashboard" ? "" : "/" + s}`;
    const steps = [["draft", "SC ร่าง"], ["requested", "SSM ตรวจ"], ["reviewed", "MD อนุมัติ"], ["approved", "Get Award (Job no.)"], ["locked", "Budgetary 🔒"]];
    const order = ["draft", "requested", "reviewed", "approved", "locked"];
    const at = p.status === "revise" ? 0 : order.indexOf(p.status);
    const stepper = steps.map(([k, t], i) => `<span class="se-step ${i < at ? "done" : i === at ? "now" : ""}"><i>${i < at ? "✓" : i + 1}</i>${t}</span>`).join('<span class="se-arr">→</span>');
    const listNote = p.list !== "active" ? `<div class="se-off">${p.list === "trash" ? "🗑️ โปรเจคนี้อยู่ใน Trash" : "📦 โปรเจคนี้ถูก Archive"} · <button class="se-link" data-restore>กู้คืนเป็น Active</button></div>` : "";
    el.innerHTML = `
      <div style="display:grid;gap:16px">
        <a class="se-back" href="#site-expense">${IC.back}Overview all project</a>
        ${roleBar()}
        ${listNote}
        <div class="se-ph">
          <div style="min-width:0"><div class="se-id"><b>${esc(p.ij)}</b>${p.jo ? `<span class="se-jo">Job ${esc(p.jo)}</span>` : `<span class="se-jo none">ยังไม่มี Job no.</span>`}<span class="se-st ${st.cls}">${st.th}</span><span class="se-wait">${st.wait}</span></div>
            <h2>${esc(p.name)}</h2><div class="se-cu">${esc(p.customer)}${p.city ? " · " + esc(p.city) : ""} · ${fmtD(p.start)} – ${fmtD(p.end)}</div></div>
          <div class="se-ph-r"><span><small>ระยะเวลา</small><b>${daysOf(p)} days</b></span><span><small>คน</small><b>${peopleOf(p)}</b></span><span><small>${p.budget ? "Budget" : "Planned"}</small><b>${baht(plannedOf(p))}</b></span></div>
          ${p.award ? `<div class="se-award"><span class="se-aw-ic">🏆</span><span><b>Awarded</b> · ${esc(p.ij)} → <b class="se-jo">Job ${esc(p.jo)}</b> · ${fmtD(p.award.date)}${p.award.value ? ` · มูลค่างาน ${baht(p.award.value)}` : ""}${p.award.by ? ` · เปิด Job โดย ${esc(p.award.by)}` : ""}${p.award.note || p.award.source ? `<small>${[p.award.note, p.award.source].filter(Boolean).map(esc).join(" · ")}${p.award.estimate && Math.round(Object.values(p.award.estimate).reduce((x, y) => x + y, 0)) !== Math.round(plannedOf(p)) ? ` · ปรับจาก Estimate ${baht(Object.values(p.award.estimate).reduce((x, y) => x + y, 0))}` : ""}</small>` : ""}</span><span class="se-aw-b">Budget control ${baht(plannedOf(p))} 🔒</span></div>` : ""}
          <div class="se-ph-a">${p.status === "approved" && p.list === "active" ? (role() === "ssm" ? `<button class="se-btn award" data-award>🏆 Get Award</button>` : `<span class="se-hint" style="margin-right:auto">รอ SSM (${namesOf("ssm")}) กด Get Award และกำหนด Budget control</span>`) : ""}${editable(p) ? `<button class="se-btn" data-edit>${IC.edit}แก้ไขข้อมูล</button>` : ""}${p.list === "active" ? `<button class="se-btn" data-arch>${IC.box}Archive</button><button class="se-btn danger" data-trash>${IC.trash}Trash</button>` : ""}</div>
        </div>
        <div class="se-steps">${stepper}</div>
        <nav class="se-tabs" aria-label="Section ของโปรเจค">${SECS.map(s => `<a class="se-tab" href="${href(s.id)}" ${s.id === cur.id ? 'aria-current="page"' : ""}><span class="n">${s.ic}</span><b>${s.no}. ${esc(s.name)}</b><small>${esc(s.th)}</small></a>`).join("")}</nav>
        <section class="se-sec" id="seSec"></section>
      </div>`;
    const redraw = () => project(el, p, cur.id);
    wireRole(el, redraw);
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on("[data-edit]", () => projectForm(p));
    on("[data-award]", () => getAward(p));
    on("[data-arch]", () => { p.list = "archived"; save(); toast("ย้ายไป Archived แล้ว"); redraw(); });
    on("[data-trash]", () => { if (confirm("ย้ายโปรเจคนี้ไป Trash?")) { p.list = "trash"; save(); toast("ย้ายไป Trash แล้ว"); location.hash = "#site-expense"; } });
    on("[data-restore]", () => { p.list = "active"; save(); toast("กู้คืนแล้ว"); redraw(); });
    const sec = el.querySelector("#seSec");
    ({ dashboard: secDashboard, estimate: secEstimate, actual: secActual })[cur.id](sec, p, redraw);
  }


  /* ---------- Get Award: link IJ → Job no. and lock the Estimate as Budget control ---------- */
  function getAward(p) {
    const est = sumByCat(p), estTotal = totalOf(p);
    const opener = who();
    const m = modal("🏆 Get Award · " + p.ij, `
      <p class="se-hint" style="margin:0">ใส่ Job no. ที่เปิดใหม่ ระบบจะผูก ${esc(p.ij)} กับ Job นี้ และล็อก Budget control ตามตัวเลขด้านล่าง · ทีมหน้างานบันทึก Actual ได้ทันที</p>
      <div class="se-fgrid">
        <label>Job no. *<input id="awJo" placeholder="เช่น 04002026" inputmode="numeric" value="${esc(p.jo)}" autocomplete="off"></label>
        <label>วันที่ได้งาน / เปิด Job *<input id="awDate" type="date" value="${today()}"></label>
        <label>มูลค่างาน / PO (บาท)<input id="awVal" inputmode="decimal" placeholder="ไม่บังคับ"></label>
        <label class="w2">ผู้เปิด Job<input id="awBy" value="${esc(opener)}" placeholder="ชื่อผู้เปิด Job"></label>
        <label>อ้างอิง PO / เอกสาร<input id="awRef" placeholder="เช่น PO-12345"></label>
      </div>
      <div class="se-aw-h"><b>Budget control ที่จะล็อก</b><span class="se-hint">ตั้งต้นจาก Estimate ที่ MD อนุมัติ · แก้เป็นตัวเลขจากฝ่ายบริหารโครงการได้</span><button class="se-link" type="button" data-awreset>ใช้ตัวเลข Estimate ทั้งหมด</button></div>
      <div class="tbl"><table class="se-awt"><thead><tr><th>หมวด</th><th class="r">Estimate</th><th class="r">Budget control (บาท)</th><th class="r">ต่าง</th></tr></thead>
        <tbody>${CATS.map(c => `<tr data-c="${c.code}"><td>${catCell(c)}</td><td class="r se-muted">${est[c.code] ? money(est[c.code]) : "–"}</td>
          <td class="r"><input class="se-in r se-awin" data-bud="${c.code}" inputmode="decimal" value="${est[c.code] ? money(est[c.code]) : ""}" placeholder="0" aria-label="Budget control ${esc(c.name)}"></td><td class="r se-diff" data-diff></td></tr>`).join("")}</tbody>
        <tfoot><tr><td><b>รวม</b></td><td class="r se-muted">${money(estTotal)}</td><td class="r"><b id="awTot"></b></td><td class="r se-diff" id="awDiff"></td></tr></tfoot></table></div>
      <label class="se-f">ที่มา / หมายเหตุการปรับงบ<input id="awSrc" placeholder="เช่น ตามใบอนุมัติงบโครงการ ฝ่ายบริหารโครงการ 9 Nov 2026"></label>
      <p class="se-hint" style="margin:0">🔒 หลังกดยืนยัน Budget control และ Estimate จะแก้ไม่ได้อีก</p>`,
      mm => {
        const g = id => mm.querySelector(id).value.trim();
        const jo = g("#awJo").replace(/\s+/g, "").toUpperCase(), date = g("#awDate");
        if (!jo) return "ใส่ Job no.";
        if (!/^[A-Z0-9][A-Z0-9\-\/]{3,19}$/.test(jo)) return "Job no. ใช้ตัวเลข/ตัวอักษร 4–20 ตัว เช่น 04002026";
        if (!date) return "ใส่วันที่ได้งาน";
        const dup = DB.projects.find(x => x !== p && x.jo && x.jo.toUpperCase() === jo && x.list !== "trash");
        if (dup) return `Job ${jo} ผูกกับ ${dup.ij} อยู่แล้ว`;
        const bud = readBud();
        if (Object.values(bud).some(v => v < 0)) return "Budget control ต้องไม่ติดลบ";
        const total = Object.values(bud).reduce((a, b) => a + b, 0);
        if (total <= 0) return "ใส่ Budget control อย่างน้อย 1 หมวด";
        const changed = CATS.some(c => Math.round(bud[c.code]) !== Math.round(est[c.code]));
        if (changed && !g("#awSrc")) return "ตัวเลขต่างจาก Estimate · ใส่ที่มา / หมายเหตุการปรับงบ";
        p.jo = jo; p.budget = bud; p.lockedAt = new Date().toISOString(); p.status = "locked";
        p.award = { date, value: num(g("#awVal")) || 0, by: g("#awBy"), note: g("#awRef"), source: g("#awSrc"), estimate: est, at: new Date().toISOString() };
        p.history.push({ at: p.award.at, role: role(), by: who(), action: "award", note: `Job ${jo} · Budget ${baht(total)}${changed ? ` (Estimate ${baht(estTotal)})` : ""}${p.award.source ? " · " + p.award.source : ""}` });
        save(); toast(`Get Award แล้ว · ${p.ij} → Job ${jo} · ล็อก Budget control ${baht(total)}`);
        location.hash = "#site-expense/" + encodeURIComponent(p.id);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }, "ยืนยัน Get Award");
    const readBud = () => { const o = {}; m.querySelectorAll("[data-bud]").forEach(i => o[i.dataset.bud] = num(i.value)); return o; };
    const sign = d => Math.round(d) === 0 ? "" : (d > 0 ? "+" : "−") + money(Math.abs(d));
    const recalc = () => {
      const b = readBud(); let t = 0;
      m.querySelectorAll("tr[data-c]").forEach(tr => { const c = tr.dataset.c, d = b[c] - est[c]; t += b[c]; const x = tr.querySelector("[data-diff]"); x.textContent = sign(d); x.className = "r se-diff " + (d > 0 ? "up" : d < 0 ? "down" : ""); tr.classList.toggle("chg", Math.round(d) !== 0); });
      m.querySelector("#awTot").textContent = money(t);
      const dd = t - estTotal, x = m.querySelector("#awDiff"); x.textContent = sign(dd); x.className = "r se-diff " + (dd > 0 ? "up" : dd < 0 ? "down" : "");
    };
    m.querySelectorAll("[data-bud]").forEach(i => {
      i.oninput = recalc;
      i.onfocus = () => { i.value = i.value.replace(/,/g, ""); i.select(); };
      i.onblur = () => { i.value = i.value.trim() === "" ? "" : money(num(i.value)); };
    });
    m.querySelector("[data-awreset]").onclick = () => { m.querySelectorAll("[data-bud]").forEach(i => i.value = est[i.dataset.bud] ? money(est[i.dataset.bud]) : ""); recalc(); };
    recalc();
    return m;
  }

  /* ---------- 1. Dashboard ---------- */
  function secDashboard(sec, p) {
    const bud = p.budget, act = actualBy(p), est = sumByCat(p);
    const B = bud ? Object.values(bud).reduce((a, b) => a + b, 0) : 0, A = Object.values(act).reduce((a, b) => a + b, 0);
    const pend = p.actuals.filter(a => a.status === "pending");
    const pct = (a, b) => b > 0 ? a / b * 100 : 0;
    const meter = (a, b) => { const v = pct(a, b); const c = v > 100 ? "over" : v >= 80 ? "warn" : ""; return b > 0 ? `<span class="se-meter ${c}"><i style="width:${Math.min(100, v)}%"></i></span><span class="se-pct ${c}">${v.toFixed(0)}%</span>` : `<span class="se-muted">—</span>`; };
    const over = CATS.filter(c => bud && bud[c.code] > 0 && act[c.code] / bud[c.code] >= .8);
    const kpi = (l, v, s, c = "") => `<div class="se-kpi ${c}"><span>${l}</span><b>${v}</b><small>${s}</small></div>`;
    sec.innerHTML = `
      <div class="se-sec-h"><h3>📊 Dashboard · Budget vs Actual</h3>${bud ? `<span class="badge live">งบล็อกแล้ว</span>` : `<span class="badge soon">ยังไม่มี Budgetary</span>`}</div>
      ${bud ? "" : `<div class="se-gate">${IC.lock} ยังไม่มีงบ Budgetary — แสดงยอด Estimate ไว้ให้ดูก่อน เมื่อ MD อนุมัติและ Get Award (ได้ Job no.) แล้ว จะเทียบ Budget กับ Actual ได้</div>`}
      <div class="se-kpis">
        ${kpi(bud ? "Budget (ล็อกแล้ว)" : "Estimate", baht(bud ? B : totalOf(p)), "บาท")}
        ${kpi("Actual (ใช้จริง)", baht(A), pend.length ? `รวมรายการรอตรวจ ${pend.length} รายการ` : "บาท")}
        ${kpi("คงเหลือ", bud ? baht(B - A) : "—", "บาท", bud && B - A < 0 ? "over" : "")}
        ${kpi("ใช้ไป", bud && B ? pct(A, B).toFixed(1) + "%" : "—", "% ของงบ", bud && pct(A, B) > 100 ? "over" : bud && pct(A, B) >= 80 ? "warn" : "")}
      </div>
      ${over.length ? `<div class="se-alert">⚠️ หมวดที่ใช้งบถึง 80% ขึ้นไป: ${over.map(c => `<b>${esc(c.name)}</b> (${pct(act[c.code], bud[c.code]).toFixed(0)}%)`).join(", ")}</div>` : ""}
      <div class="tbl"><table><thead><tr><th>หมวดค่าใช้จ่าย</th>${bud ? "" : `<th class="r">Estimate</th>`}<th class="r">Budget</th><th class="r">Actual</th><th class="r">คงเหลือ</th><th>% ใช้ไป</th></tr></thead>
        <tbody>${CATS.map(c => { const b = bud ? bud[c.code] : 0, a = act[c.code]; return `<tr><td>${catCell(c)}</td>${bud ? "" : `<td class="r">${est[c.code] ? money(est[c.code]) : "–"}</td>`}<td class="r">${bud ? money(b) : "–"}</td><td class="r">${a ? money(a) : "–"}</td><td class="r ${bud && b - a < 0 ? "neg" : ""}">${bud ? money(b - a) : "–"}</td><td class="se-mt">${meter(a, b)}</td></tr>`; }).join("")}</tbody>
        <tfoot><tr><td><b>รวม</b></td>${bud ? "" : `<td class="r"><b>${money(totalOf(p))}</b></td>`}<td class="r"><b>${bud ? money(B) : "–"}</b></td><td class="r"><b>${money(A)}</b></td><td class="r"><b>${bud ? money(B - A) : "–"}</b></td><td class="se-mt">${meter(A, B)}</td></tr></tfoot></table></div>
      <div class="se-other">
        <div class="se-box"><b>⏳ สถานะอนุมัติ</b><span>${STATUS[p.status].th} · ${STATUS[p.status].wait}</span></div>
        <div class="se-box"><b>🧾 Actual รอตรวจ</b><span>${pend.length ? `${pend.length} รายการ · ${baht(pend.reduce((a, x) => a + num(x.amount), 0))}` : "ไม่มี"}</span></div>
        <div class="se-box"><b>📅 บันทึกล่าสุด</b><span>${p.actuals.length ? fmtD(p.actuals.map(a => a.date).sort().pop()) : "ยังไม่มีรายการ"}</span></div>
      </div>`;
  }

  /* ---------- 2. Estimate ---------- */
  function secEstimate(sec, p, redraw) {
    const ed = editable(p);
    const r = role();
    const rateOpts = (cat, l) => `<option value="">— เลือก rate —</option>` + (RATES[cat] || []).map(([n, u, v], i) => `<option value="${i}" ${l && l.unit === u && num(l.rate) === v && l.scope === n ? "selected" : ""}>${esc(n)} · ${money(v)}/${esc(u)}</option>`).join("");
    const row = (l, i) => ed ? `<tr data-id="${l.id}">
        <td class="c se-no">${i + 1}</td>
        <td><select class="se-in" data-k="cat">${CATS.map(c => `<option value="${c.code}" ${c.code === l.cat ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
            <select class="se-in se-rate" data-rate aria-label="เลือกจาก Master rate">${rateOpts(l.cat, l)}</select></td>
        <td><input class="se-in" data-k="scope" value="${esc(l.scope)}" placeholder="รายการงาน / ตำแหน่ง"></td>
        <td><input class="se-in c" data-k="people" value="${esc(l.people)}" inputmode="decimal"></td>
        <td><input class="se-in c" data-k="days" value="${esc(l.days)}" inputmode="decimal"></td>
        <td><input class="se-in c" data-k="qty" value="${esc(l.qty)}" placeholder="${num(l.people) * num(l.days) || ""}" inputmode="decimal" title="ว่างไว้ = คน × วัน"></td>
        <td><input class="se-in c" data-k="unit" value="${esc(l.unit)}"></td>
        <td><input class="se-in r" data-k="rate" value="${esc(l.rate)}" inputmode="decimal"></td>
        <td class="r se-amt" data-amt>${money(amtOf(l))}</td>
        <td><button class="se-x" data-del aria-label="ลบแถว">${IC.x}</button></td></tr>`
      : `<tr><td class="c">${i + 1}</td><td>${catCell(catOf(l.cat))}</td><td>${esc(l.scope)}</td><td class="c">${esc(l.people || "–")}</td><td class="c">${esc(l.days || "–")}</td><td class="c">${qtyOf(l) || "–"}</td><td class="c">${esc(l.unit)}</td><td class="r">${money(num(l.rate))}</td><td class="r">${money(amtOf(l))}</td><td></td></tr>`;
    const by = sumByCat(p);
    const actions = [];
    if (p.list === "active") {
      if ((p.status === "draft" || p.status === "revise") && r === "sc") actions.push(`<button class="se-btn primary" data-act="submit">ส่งให้ SSM ตรวจ →</button>`);
      if (p.status === "requested" && r === "ssm") actions.push(`<button class="se-btn" data-act="back">↩ ส่งกลับให้ SC แก้</button><button class="se-btn primary" data-act="approve">✓ ผ่าน ส่งให้ MD</button>`);
      if (p.status === "reviewed" && r === "md") actions.push(`<button class="se-btn" data-act="back">↩ ส่งกลับให้ SC แก้</button><button class="se-btn primary" data-act="approve">✓ อนุมัติงบ</button>`);
      if (p.status === "approved" && r === "ssm") actions.push(`<button class="se-btn award" data-act="award">🏆 Get Award · ผูก Job no. &amp; ล็อก Budget control</button>`);
    }
    const owner = { draft: "sc", revise: "sc", requested: "ssm", reviewed: "md", approved: "ssm" }[p.status];
    const waitMsg = p.list === "active" && owner && !actions.length ? `<span class="se-hint">ขั้นตอนนี้เป็นของ ${ROLE_TH[owner]} (${namesOf(owner)}) · สลับคนด้านบนเพื่อทดสอบ</span>` : "";
    const hist = p.history.slice().reverse();
    const ACT = { submit: "ส่งตรวจ", approve: "ผ่าน / อนุมัติ", back: "ส่งกลับแก้", lock: "เปิด Job & ล็อกงบ", award: "Get Award · ผูก Job no. & ล็อก Budget control" };
    sec.innerHTML = `
      <div class="se-sec-h"><h3>📝 Estimate · ประเมินจาก Scope of Work</h3>${ed ? `<span class="badge live">แก้ไขได้</span>` : `<span class="badge off">${p.status === "locked" ? "🔒 ล็อกเป็น Budgetary แล้ว" : "อ่านอย่างเดียว"}</span>`}</div>
      ${p.status === "revise" ? `<div class="se-alert">↩ ถูกส่งกลับให้แก้: ${esc((p.history.filter(h => h.action === "back").pop() || {}).note || "-")}</div>` : ""}
      <div class="tbl se-est"><table><colgroup><col style="width:46px"><col style="width:190px"><col><col style="width:68px"><col style="width:68px"><col style="width:78px"><col style="width:92px"><col style="width:110px"><col style="width:120px"><col style="width:40px"></colgroup><thead><tr><th class="c">No.</th><th>หมวด / Master rate</th><th>Scope of Work</th><th class="c">คน</th><th class="c">วัน</th><th class="c">จำนวน</th><th class="c">หน่วย</th><th class="r">ราคา/หน่วย</th><th class="r">จำนวนเงิน</th><th></th></tr></thead>
        <tbody>${p.lines.length ? p.lines.map(row).join("") : `<tr><td colspan="10" class="se-muted c" style="padding:22px">ยังไม่มีรายการ${ed ? " · กด ＋ เพิ่มรายการ" : ""}</td></tr>`}</tbody>
        <tfoot><tr><td colspan="8" class="r"><b>รวมประเมิน</b></td><td class="r"><b id="seTot">${money(totalOf(p))}</b></td><td></td></tr></tfoot></table></div>
      ${ed ? `<div class="se-actions"><button class="se-btn" data-add>${IC.plus}เพิ่มรายการ</button><span class="se-hint">จำนวน = คน × วัน ถ้าเว้นว่าง · เลือก Master rate แล้วระบบเติมหน่วยและราคาให้ · บันทึกอัตโนมัติ</span></div>` : ""}
      <div class="se-sum" id="seSum">${CATS.map(c => `<span>${catCell(c)}<b data-cat="${c.code}">${money(by[c.code])}</b></span>`).join("")}</div>
      <div class="se-approve">
        <div class="se-actions">${actions.join("")}${waitMsg}</div>
        <div class="se-hist"><b>ประวัติการอนุมัติ</b>${hist.length ? `<ul>${hist.map(h => `<li><span class="se-who">${esc(ROLE_TH[h.role] || h.role.toUpperCase())}</span>${h.by ? `<b class="se-by">${esc(h.by)}</b>` : ""} ${ACT[h.action] || esc(h.action)}${h.note ? ` · <i>${esc(h.note)}</i>` : ""}<small>${new Date(h.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></li>`).join("")}</ul>` : `<p class="se-muted">ยังไม่มี</p>`}</div>
      </div>`;
    const tot = () => { sec.querySelector("#seTot").textContent = money(totalOf(p)); const b = sumByCat(p); sec.querySelectorAll("[data-cat]").forEach(x => x.textContent = money(b[x.dataset.cat])); };
    const lineOf = tr => p.lines.find(l => l.id === tr.dataset.id);
    sec.querySelectorAll("tr[data-id]").forEach(tr => {
      const l = lineOf(tr);
      tr.querySelectorAll("input[data-k]").forEach(inp => inp.oninput = () => {
        l[inp.dataset.k] = inp.value; save();
        tr.querySelector("[data-amt]").textContent = money(amtOf(l));
        if (inp.dataset.k === "people" || inp.dataset.k === "days") tr.querySelector('[data-k="qty"]').placeholder = num(l.people) * num(l.days) || "";
        tot();
      });
      tr.querySelector('[data-k="cat"]').onchange = e => { l.cat = e.target.value; save(); redraw(); };
      tr.querySelector("[data-rate]").onchange = e => { const x = (RATES[l.cat] || [])[e.target.value]; if (!x) return; if (!l.scope) l.scope = x[0]; l.unit = x[1]; l.rate = x[2]; save(); redraw(); };
      tr.querySelector("[data-del]").onclick = () => { p.lines = p.lines.filter(x => x !== l); save(); redraw(); };
    });
    const add = sec.querySelector("[data-add]");
    if (add) add.onclick = () => { p.lines.push({ id: uid(), cat: "manpower", scope: "", people: "", days: "", qty: "", unit: "manday", rate: "", remark: "" }); save(); redraw(); const ins = sec.querySelectorAll('input[data-k="scope"]'); if (ins.length) ins[ins.length - 1].focus(); };
    const log = (action, note = "") => p.history.push({ at: new Date().toISOString(), role: role(), by: who(), action, note });
    sec.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === "submit") {
        if (!p.lines.length || totalOf(p) <= 0) return toast("ใส่รายการ Estimate และจำนวนเงินก่อนส่งตรวจ");
        log("submit"); p.status = "requested"; save(); toast("ส่งให้ SSM ตรวจแล้ว"); redraw();
      } else if (a === "approve") {
        log("approve"); p.status = p.status === "requested" ? "reviewed" : "approved"; save(); toast(p.status === "reviewed" ? "ผ่าน ส่งต่อให้ MD แล้ว" : "MD อนุมัติงบแล้ว · รอเปิด Job"); redraw();
      } else if (a === "back") {
        modal("ส่งกลับให้ SC แก้", `<label class="se-f">เหตุผล / สิ่งที่ต้องแก้ *<textarea id="seNote" rows="3"></textarea></label>`, mm => {
          const n = mm.querySelector("#seNote").value.trim(); if (!n) return "ใส่เหตุผลก่อนส่งกลับ";
          log("back", n); p.status = "revise"; save(); toast("ส่งกลับให้ SC แก้แล้ว"); redraw();
        }, "ส่งกลับ");
      } else if (a === "award") getAward(p);
    });
  }

  /* ---------- 3. Actual record ---------- */
  function secActual(sec, p, redraw) {
    if (p.status !== "locked") {
      sec.innerHTML = `<div class="se-sec-h"><h3>🧾 Actual record · บันทึกค่าใช้จ่ายจริงจากหน้างาน</h3><span class="badge off">ยังบันทึกไม่ได้</span></div>
        <div class="se-gate big">${IC.lock}<span><b>บันทึก Actual ได้เมื่อ Get Award แล้ว (มี Job no. และ Budget control ที่ล็อกแล้ว)</b><br>สถานะตอนนี้: ${STATUS[p.status].th} · ${STATUS[p.status].wait} · <a href="#site-expense/${encodeURIComponent(p.id)}/estimate">ไปที่ Estimate →</a></span></div>`;
      return;
    }
    const act = actualBy(p), r = role(), can = p.list === "active";
    const left = c => p.budget[c] - act[c];
    const rows = p.actuals.slice().sort((a, b) => b.date.localeCompare(a.date));
    const STA = { pending: ["รอตรวจ", "s-req"], checked: ["ตรวจแล้ว", "s-ok"], rejected: ["ไม่ผ่าน", "s-rev"] };
    sec.innerHTML = `
      <div class="se-sec-h"><h3>🧾 Actual record · Job ${esc(p.jo)}</h3><span class="badge live">บันทึกได้</span></div>
      ${can ? `<div class="se-form2">
        <label class="se-f">วันที่<input type="date" id="aDate" value="${today()}"></label>
        <label class="se-f">หมวด<select id="aCat">${CATS.map(c => `<option value="${c.code}">${esc(c.name)}</option>`).join("")}</select></label>
        <label class="se-f w2">รายการ<input id="aDesc" placeholder="เช่น ค่าที่พัก 2 ห้อง × 3 คืน"></label>
        <label class="se-f">จำนวนเงิน (บาท)<input id="aAmt" inputmode="decimal" placeholder="0"></label>
        <label class="se-f">ใบเสร็จ<input type="file" id="aFile" accept="image/*,application/pdf"></label>
        <div class="se-f w2 se-left">งบคงเหลือหมวดนี้: <b id="aLeft"></b></div>
        <div class="se-f"><button class="se-btn primary" id="aAdd">${IC.plus}บันทึกรายการ</button></div>
      </div><p class="se-hint">โหมดทดลองเก็บแค่ชื่อไฟล์ใบเสร็จ · SSM ตรวจรายการก่อนนับเป็น Actual ที่ยืนยันแล้ว (รายการรอตรวจนับรวมใน Dashboard ด้วย ยกเว้นที่ไม่ผ่าน)</p>` : ""}
      <div class="tbl"><table><thead><tr><th>วันที่</th><th>หมวด</th><th>รายการ</th><th class="r">จำนวนเงิน</th><th>ใบเสร็จ</th><th>ผู้บันทึก</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map(a => `<tr data-a="${a.id}"><td>${fmtD(a.date)}</td><td>${catCell(catOf(a.cat))}</td><td>${esc(a.desc)}</td><td class="r">${money(num(a.amount))}</td><td>${a.receipt ? `📎 ${esc(a.receipt)}` : `<span class="se-muted">–</span>`}</td><td>${esc(a.by)}</td>
          <td><span class="se-st ${STA[a.status][1]}">${STA[a.status][0]}</span></td>
          <td><span class="se-rowact">${can && r === "ssm" && a.status === "pending" ? `<button class="se-btn sm" data-chk="checked">✓</button><button class="se-btn sm" data-chk="rejected">✗</button>` : ""}${can && r === "sc" && a.status === "pending" ? `<button class="se-x" data-adel aria-label="ลบ">${IC.x}</button>` : ""}</span></td></tr>`).join("")
          : `<tr><td colspan="8" class="se-muted c" style="padding:22px">ยังไม่มีรายการ</td></tr>`}</tbody></table></div>`;
    if (!can) return;
    const upd = () => { const c = sec.querySelector("#aCat").value, v = left(c); const e = sec.querySelector("#aLeft"); e.textContent = baht(v) + " จาก " + baht(p.budget[c]); e.className = v < 0 ? "neg" : ""; };
    sec.querySelector("#aCat").onchange = upd; upd();
    sec.querySelector("#aAdd").onclick = () => {
      const g = id => sec.querySelector(id).value.trim();
      const amount = num(g("#aAmt"));
      if (!g("#aDate") || !g("#aDesc") || amount <= 0) return toast("กรอกวันที่ รายการ และจำนวนเงิน");
      const f = sec.querySelector("#aFile").files[0];
      p.actuals.push({ id: uid(), date: g("#aDate"), cat: g("#aCat"), desc: g("#aDesc"), amount, receipt: f ? f.name : "", by: who(), status: "pending" });
      save(); const c = g("#aCat"); toast(left(c) < 0 ? "บันทึกแล้ว · ⚠️ หมวดนี้เกินงบ" : "บันทึกแล้ว · รอ SSM ตรวจ"); redraw();
    };
    sec.querySelectorAll("tr[data-a]").forEach(tr => {
      const a = p.actuals.find(x => x.id === tr.dataset.a);
      tr.querySelectorAll("[data-chk]").forEach(b => b.onclick = () => { a.status = b.dataset.chk; save(); redraw(); });
      const d = tr.querySelector("[data-adel]"); if (d) d.onclick = () => { p.actuals = p.actuals.filter(x => x !== a); save(); redraw(); };
    });
  }

  const CSS3 = `
.se-role{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;background:#eef4ff;border:1px solid #cfdcf5;color:#2c4a7a;border-radius:10px;padding:8px 12px;font-size:13px}
.se-rb{border:1px solid #bccbe6;background:#fff;color:#2c4a7a;border-radius:999px;padding:2px 12px;font-size:12.5px;font-weight:600}.se-rb.on{background:#2c4a7a;border-color:#2c4a7a;color:#fff}
.se-role-n{color:#5b6f90;font-size:12px;margin-left:6px}
.se-link{border:0;background:none;color:var(--rak);text-decoration:underline;font-size:12.5px;padding:0;margin-left:auto}
.p-blu{background:#e6eefc;color:#2c4a7a}
.se-sb small{font-size:11px;opacity:.7}
.se-hint{color:var(--muted);font-size:12.5px}
.se-wait{font-size:12px;color:var(--muted)}
.se-muted{color:var(--muted)}
.s-lock{background:#e6eefc;color:#2c4a7a}
.se-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13.5px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:9px;padding:7px 13px;white-space:nowrap;cursor:pointer}
.se-btn:hover{border-color:#f0b9b9}.se-btn .se-ci{width:16px;height:16px}
.se-btn.primary{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}.se-btn.primary:hover{background:var(--rak-dark)}
.se-btn.danger{color:var(--rak)}.se-btn.sm{padding:2px 9px;font-size:13px}
.se-x{display:inline-grid;place-items:center;border:0;background:none;color:#9aa2ad;border-radius:6px;padding:3px;cursor:pointer}.se-x:hover{background:var(--blush);color:var(--rak)}.se-x .se-ci{width:16px;height:16px}
.se-ph{position:relative}.se-ph-a{display:flex;gap:8px;flex-wrap:wrap;width:100%;justify-content:flex-end;border-top:1px dashed var(--line);padding-top:10px}
.se-steps .se-step.done i{background:var(--green);color:#fff}.se-steps .se-step.now{border-color:var(--rak);background:var(--blush);color:var(--rak);font-weight:600}.se-steps .se-step.now i{background:var(--rak);color:#fff}
.se-sec-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.se-sec-h h3{margin:0;font-size:17px;font-weight:600}
.se-gate{display:flex;gap:10px;align-items:center;border:1px solid var(--line);background:#f7f8fa;border-radius:10px;padding:10px 14px;font-size:13px}.se-gate .se-ci{color:var(--muted)}
.se-gate.big{padding:22px;font-size:14px;line-height:1.7}.se-gate a{color:var(--rak)}
.se-alert{background:#fff6e0;border:1px solid #f1d38a;border-radius:10px;padding:9px 14px;font-size:13px}
.se-kpi.warn b{color:#a0560c}.se-kpi.over b{color:var(--rak)}
.se-meter{display:inline-block;vertical-align:middle;width:90px;height:8px;border-radius:99px;background:#eceef1;overflow:hidden}.se-meter i{display:block;height:100%;background:var(--green)}
.se-meter.warn i{background:#d39a17}.se-meter.over i{background:var(--rak)}
.se-pct{font-size:12px;margin-left:8px;font-variant-numeric:tabular-nums}.se-pct.warn{color:#a0560c}.se-pct.over{color:var(--rak);font-weight:600}
td.neg,.neg{color:var(--rak);font-weight:600}
.se-sec td,.se-sec th{font-variant-numeric:tabular-nums}
.se-est table{min-width:1040px}.se-est td{padding:6px 8px;vertical-align:middle}.se-est th{padding:10px 8px}
.se-in{font:inherit;font-size:13px;width:100%;border:1px solid transparent;background:#f7f8fa;border-radius:7px;padding:5px 7px;color:var(--ink)}
.se-in:hover{border-color:var(--line)}.se-in:focus{outline:2px solid var(--blush-2);border-color:var(--rak);background:#fff}
.se-in.c{text-align:center}.se-in.r{text-align:right}
.se-est table{table-layout:fixed}.se-est td:nth-child(3) .se-in{min-width:180px}
.se-rate{margin-top:4px;font-size:12px;color:var(--muted)}
.se-amt{font-weight:600;white-space:nowrap}.se-no{color:var(--muted)}
.se-sum{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.se-sum>span{display:flex;flex-direction:column;gap:4px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:#fafbfc}.se-sum b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.se-approve{display:grid;gap:12px;border-top:1px solid var(--line);padding-top:14px}
.se-jo-in{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}.se-jo-in input{font:inherit;border:1px solid var(--line);border-radius:9px;padding:6px 10px;width:150px}
.se-hist ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:6px;font-size:13px}.se-hist li small{color:var(--muted);margin-left:8px;font-size:11.5px}
.se-rb small{font-weight:400;opacity:.7;font-size:10.5px}.se-by{font-weight:600;margin:0 4px}
.se-who{display:inline-block;min-width:38px;text-align:center;font-size:11px;font-weight:600;background:#eceef1;border-radius:5px;padding:0 6px}
.se-form2{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end;background:#fafbfc;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.se-form2 .w2{grid-column:span 2}.se-form2 input,.se-form2 select,.se-f textarea{font:inherit;font-size:13.5px;border:1px solid var(--line);border-radius:9px;padding:7px 10px;background:#fff;width:100%;color:var(--ink)}
.se-left{font-size:13px;color:var(--muted);align-self:center}.se-left b{color:var(--ink)}.se-left b.neg{color:var(--rak)}
.se-rowact{white-space:nowrap;display:flex;gap:4px}
.se-modal{position:fixed;inset:0;background:rgba(18,18,18,.45);display:grid;place-items:center;z-index:60;padding:16px}
.se-dlg{background:#fff;border-radius:16px;width:min(680px,100%);max-height:92vh;display:grid;grid-template-rows:auto 1fr auto;overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.se-dlg-h{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line)}.se-dlg-h b{font-size:16px}
.se-dlg-b{padding:16px 18px;overflow:auto;display:grid;gap:14px}
.se-dlg-f{display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:12px 18px;border-top:1px solid var(--line)}
.se-err{margin-right:auto;color:var(--rak);font-size:13px}
.se-fgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.se-fgrid label{display:grid;gap:4px;font-size:12px;color:var(--muted)}.se-fgrid .w2{grid-column:span 2}
.se-fgrid input,.se-phr input{font:inherit;font-size:14px;border:1px solid var(--line);border-radius:9px;padding:7px 10px;width:100%;color:var(--ink)}
.se-phs{display:grid;gap:8px}.se-phs>b{font-size:13px}.se-phs .se-btn{justify-self:start}
.se-phr{display:grid;grid-template-columns:1.4fr 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:6px}
.se-btn.award{background:#1d7a4f;border-color:#1d7a4f;color:#fff;font-weight:600;margin-right:auto}.se-btn.award:hover{background:#166340}
.se-award{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;width:100%;background:#eefaf3;border:1px solid #bfe3d3;border-radius:10px;padding:9px 14px;font-size:13.5px}
.se-award small{display:block;color:var(--muted);font-size:12px}.se-aw-ic{font-size:20px}.se-aw-b{margin-left:auto;font-weight:600;color:#1d7a4f;white-space:nowrap}
.se-aw-h{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}.se-aw-h b{font-size:13.5px}.se-aw-h .se-link{margin-left:auto}
.se-awt{min-width:0}.se-awt td{padding:6px 12px}.se-awin{width:140px;background:#fff;border-color:var(--line)}
.se-awt tr.chg td{background:#fffaf0}
.se-dlg .tbl{max-height:none;overflow:visible}.se-dlg-b>*,.se-fgrid label{min-width:0}.se-dlg-b{overflow-x:hidden}.se-awt{width:100%}
@media (max-width:560px){.se-awt th:nth-child(4),.se-awt td:nth-child(4){display:none}.se-awt td{padding:6px 8px}.se-awt .se-cat small{display:none}.se-awt .se-cat .se-ci{display:none}.se-awin{width:100%;min-width:0;padding:5px 6px}.se-awt td:nth-child(3){width:46%}.se-awt th,.se-awt td{white-space:normal}.se-awt{table-layout:fixed}.se-awt th:nth-child(2),.se-awt td:nth-child(2){font-size:12px}.se-dlg-f{flex-wrap:wrap}.se-err{flex-basis:100%}}.se-diff{font-size:12.5px;white-space:nowrap}.se-diff.up{color:var(--rak)}.se-diff.down{color:#1d7a4f}
#seToast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;background:#22252b;color:#fff;border-radius:10px;padding:10px 18px;font-size:13.5px;z-index:70;transition:.2s;pointer-events:none}
#seToast.on{opacity:1;transform:translate(-50%,0)}
@media (max-width:1000px){.se-sum{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.se-form2{grid-template-columns:1fr 1fr}.se-fgrid{grid-template-columns:1fr 1fr}.se-phr{grid-template-columns:1fr 1fr auto}.se-phr input:first-child{grid-column:1/-1}.se-sum{grid-template-columns:1fr 1fr}.se-ph-a{justify-content:flex-start}.se-link{margin-left:0}}`;

  function mount(el, sub) {
    if (!document.getElementById("seCss")) { const s = document.createElement("style"); s.id = "seCss"; s.textContent = CSS + CSS2 + CSS3; document.head.appendChild(s); }
    document.querySelectorAll(".se-modal").forEach(m => m.remove());
    if (!DB) {
      DB = load();
      const signed = PEOPLE.find(x => x[3] === ((window.SSM_ME || {}).username || ""));
      if (signed && !DB.picked) DB.user = signed[0]; // start as the signed-in person until someone switches in the test bar
    }
    const [pid, sec] = (sub || "").split("/").map(decodeURIComponent);
    if (!pid) return overview(el);
    const p = DB.projects.find(x => x.id === pid);
    if (!p) { el.innerHTML = `<div class="empty">ไม่พบโปรเจคนี้ · <a class="open" href="#site-expense">กลับ Overview</a></div>`; return; }
    project(el, p, sec || "dashboard");
  }
  window.SiteExpense = { mount };
})();
