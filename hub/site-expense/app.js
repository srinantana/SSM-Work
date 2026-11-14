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
.se-jo{font-size:12px;color:var(--rak);font-weight:600}.se-jobchip{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:600;color:#14532d;background:#e7f6ec;border:1px solid #bfe5cc;border-radius:999px;padding:2px 10px;font-variant-numeric:tabular-nums}.se-dupb{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:#fff;color:var(--muted);font:inherit;font-size:12.5px;border-radius:8px;padding:4px 9px;cursor:pointer}.se-dupb:hover{border-color:var(--rak);color:var(--rak)}.se-dupb .se-ci{width:14px;height:14px}.se-dupsrc{display:flex;gap:10px;align-items:flex-start;background:#f6f8fb;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:13.5px}.se-dupsrc small{display:block;color:var(--muted);margin-top:2px}.se-dupsrc .se-ci{width:16px;height:16px;margin-top:2px;flex:none}.se-dupopt{display:grid;gap:6px;margin-top:12px;border-top:1px dashed var(--line);padding-top:10px;font-size:13.5px}.se-dupopt label{display:flex;gap:8px;align-items:flex-start}.se-dupopt small{color:var(--muted)}.se-from{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--muted);margin:2px 0}.se-from .se-ci{width:13px;height:13px}.se-jo.none{color:var(--muted);font-weight:400}
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
  const KEY = "ssm-site-expense-v4"; // v4 (14 Nov 2026): test data cleared, start empty before the Base44 move
  const num = v => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
  const baht = n => "฿" + Math.round(n).toLocaleString("en-US");
  const money = n => Math.round(n).toLocaleString("en-US");
  const uid = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtD = d => { if (!d) return "—"; const x = new Date(d + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  const span = (a, b) => (a && b) ? Math.max(1, Math.round((new Date(b) - new Date(a)) / 864e5)) : 0; // same as Base44: end − start
  const catOf = code => CATS.find(c => c.code === code) || CATS[5];

  const STATUS = {
    draft:     { th: "Draft",         cls: "s-draft", wait: "SC กำลังร่าง" },
    requested: { th: "Requested",     cls: "s-req",   wait: "รออนุมัติ (ดิว หรือ บี)" },
    reviewed:  { th: "Requested",     cls: "s-req",   wait: "รออนุมัติ (ดิว หรือ บี)" }, // old two-step data: same as requested
    approved:  { th: "Approved",      cls: "s-ok",    wait: "รอ Get Award (Job no.)" },
    revise:    { th: "Revise",        cls: "s-rev",   wait: "ส่งกลับให้ SC แก้" },
    locked:    { th: "Budget locked", cls: "s-lock",  wait: "บันทึก Actual ได้" },
  };
  const FILTERS = [["all", "All", null], ["draft", "Draft", ["draft"]], ["requested", "Requested", ["requested", "reviewed"]], ["approved", "Approved", ["approved"]], ["locked", "Awarded (Job)", ["locked"]], ["revise", "Revise", ["revise"]]];
  // RAK Site & Service team. Only SSM may Get Award and adjust the Budget control.
  // Site Expense permissions by person (set by Dew, 9 Nov 2026). The server applies the same list for menu access.
  const PEOPLE = [["dew", "ดิว", "nantana.s", "SSM"], ["bee", "บี", "chayanun.s", "MD"], ["spy", "สปาย", "prakaikaew.p", "SC"], ["art", "อาร์ต", "sakkamon.c", "SC"], ["num", "หนุ่ม", "teedanai.h", "SC"], ["ning", "นิ้ง", "chalunda.w", "ดู"], ["new", "นิว", "suwitcha.b", "ดู"]];
  const PERMS = {
    create:  ["teedanai.h", "prakaikaew.p", "sakkamon.c", "nantana.s"],
    approve: ["nantana.s", "chayanun.s"],   // either one approves (one step)
    award:   ["nantana.s"],
    actual:  ["teedanai.h", "prakaikaew.p", "sakkamon.c", "nantana.s"],
    check:   ["nantana.s"],
  };
  const ROLE_TH = { sc: "SC", ssm: "SSM", md: "MD", create: "ผู้สร้าง", review: "SSM", approve: "อนุมัติ", award: "SSM" };
  const namesWith = k => PEOPLE.filter(x => PERMS[k].includes(x[2])).map(x => x[1]).join(" / ");

  const L = d => `<svg class="se-ci" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const IC = {
    copy: '<svg class="se-ci" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
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

  /* ---------- category detail structures (follow the Base44 / SC Site Expense schema) ----------
     Each category has one or more line groups; every line stores { id, cat, kind, ...fields }.
     Totals: manpower = คน×วัน×ค่าแรง + คน×ชม.OT×ค่า OT · subcontract = เหมา + manday · vehicles = คัน×เที่ยว×ราคา + คนให้สัญญาณ
             ground = จำนวน×ครั้ง×ราคา · accommodation = ห้อง×คืน/เดือน×ราคา · air = ใบ×ราคา · documents/site = จำนวน×ราคา */
  // Master rates copied from the SC Site Expense app in Base44 (10 Nov 2026) until the SSM Work rate tables exist in Supabase.
  // ---- Master rate: generated from Master_rate_site_expense.xlsx (Dew, 14 Nov 2026) by database/rates/gen_rates.py — fallback when Supabase rates cannot be read ----
  let RATE_SRC = "Master rate 14 พ.ย. 2026";
  let RATE_MANDAY = [["Engineer", 2000, 300], ["SC/SSM", 2000, 300], ["Lead technician", 1500, 300], ["Technician", 1000, 300]]; // [group, rate/day, OT/hour]
  let RATE_ACC = [["Local Hotel", "Daily", 700], ["Local Hotel", "Monthly", 10000], ["International Hotel", "Daily", 2000], ["International Hotel", "Monthly", 45000], ["Local Apartment", "Monthly", 10000], ["International Apartment", "Daily", 1500], ["International Apartment", "Monthly", 30000]]; // [type, Daily|Monthly, rate]
  let ZONES = {"A": {"band": "0-100", "th": "กรุงเทพฯ และใกล้เคียง", "prov": ["กรุงเทพมหานคร", "สมุทรปราการ", "สมุทรสาคร", "ปทุมธานี", "นนทบุรี", "นครปฐม", "พระนครศรีอยุธยา"]}, "B": {"band": "101-200", "th": "ภาคตะวันออกและรอบนอก", "prov": ["ชลบุรี", "ระยอง", "ฉะเชิงเทรา", "ปราจีนบุรี", "สระบุรี", "นครนายก", "ราชบุรี", "สุพรรณบุรี"]}, "C": {"band": "201-350", "th": "ระยะกลาง", "prov": ["จันทบุรี", "กาญจนบุรี", "ลพบุรี", "นครราชสีมา", "เพชรบุรี", "สระแก้ว", "ชัยนาท", "อ่างทอง"]}, "D": {"band": "351-600", "th": "ระยะไกล", "prov": ["ประจวบคีรีขันธ์", "ขอนแก่น", "นครสวรรค์", "พิจิตร", "พิษณุโลก", "ตราด", "บุรีรัมย์", "สุรินทร์", "กำแพงเพชร"]}, "E": {"band": ">600", "th": "ระยะไกลพิเศษ", "prov": ["เชียงใหม่", "ลำพูน", "เชียงราย", "อุดรธานี", "อุบลราชธานี", "สุราษฎร์ธานี", "สงขลา", "ภูเก็ต"]}};
  let RATE_VEH = [["6 ล้อ (คอกยาว, ธรรมดา)", [5500, 8500, 13000, 21000, 35000], "THB/trip", "Budget ceiling estimate; not supplier-verified"], ["รถ 6 ล้อ เฮี๊ยบติดเครน", [9000, 12000, 18000, 27000, 40000], "THB/trip", "Budget ceiling estimate; not supplier-verified"], ["รถ 10 ล้อ เฮี๊ยบติดเครน", [12000, 17000, 24000, 36000, 55000], "THB/trip", "Budget ceiling estimate; not supplier-verified"], ["เทรลเลอร์", [12000, 17000, 25000, 38000, 60000], "THB/trip", "Budget ceiling estimate; not supplier-verified"], ["โฟล์คลิฟท์ 2 ตัน", [7000, 10000, 14000, 20000, 30000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["โฟล์คลิฟท์ 5 ตัน", [10000, 14000, 19000, 28000, 42000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 10 ตัน", [10000, 14000, 19000, 27000, 40000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 20 ตัน", [13000, 18000, 24000, 34000, 50000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 25 ตัน", [15000, 20000, 27000, 38000, 55000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 30 ตัน", [18000, 24000, 32000, 45000, 65000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 35 ตัน", [20000, 27000, 36000, 50000, 75000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 50 ตัน", [26000, 35000, 47000, 65000, 95000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 55 ตัน", [29000, 39000, 52000, 72000, 105000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 60 ตัน", [33000, 44000, 58000, 80000, 115000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 70 ตัน", [39000, 52000, 68000, 95000, 135000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 75 ตัน", [43000, 57000, 75000, 105000, 150000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 80 ตัน", [50000, 65000, 85000, 120000, 170000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 100 ตัน", [75000, 95000, 125000, 175000, 250000], "THB/1 day incl. estimated mobilization", "Budget ceiling estimate; not supplier-verified"], ["รถเครน 200 ตัน", [150000, 190000, 250000, 350000, 500000], "THB/day", "Indicative budget allowance only; supplier quotation required; mobilization, rigging and permits may be extra"]]; // [type, [Zone A..E], unit, remark]
  let RATE_TRAVEL = {"รถส่วนตัว (Round Trip)": [["Samutprakarn", 2000], ["Samutsakhon", 2000], ["Chacheongsao", 2000], ["Chonburi", 2500], ["Bangkok", 2000], ["Pathumthani", 2500], ["Ayutthaya", 2500], ["Rayong", 3000], ["Nakornratchasrima", 4000], ["Kamphaengphet", 6000], ["Khonkean", 6000], ["Lamphun", 10000]], "รถส่วนตัว (Site Trip)": [["All Location", 500]], "รถ Pick up (Round Trip)": [["Samutprakarn", 2000], ["Samutsakhon", 2000], ["Chacheongsao", 2000], ["Chonburi", 2000], ["Bangkok", 2000], ["Pathumthani", 2000], ["Ayutthaya", 2500], ["Rayong", 2500], ["Nakornratchasrima", 3000], ["Kamphaengphet", 4000], ["Khonkean", 6000], ["Lamphun", 6000]], "รถ Pick up (Site Trip)": [["All Location", 1000]], "รถตู้ (Round Trip)": [["Samutprakarn", 2500], ["Samutsakhon", 2500], ["Chacheongsao", 2500], ["Chonburi", 3000], ["Bangkok", 2500], ["Pathumthani", 3000], ["Ayutthaya", 3000], ["Rayong", 3500], ["Nakornratchasrima", 4500], ["Kamphaengphet", 6500], ["Khonkean", 7000], ["Lamphun", 12000]], "รถตู้ (Site Trip)": [["All Location", 1000]]}; // type → [[destination, rate]]
  let RATE_COUNTRY = [["Thailand", "Local (Thailand)"], ["Afghanistan", "Developing Country"], ["Albania", "Developing Country"], ["Algeria", "Developing Country"], ["Andorra", "Developed Country"], ["Angola", "Developing Country"], ["Antigua and Barbuda", "Developing Country"], ["Argentina", "Developing Country"], ["Armenia", "Developing Country"], ["Aruba", "Developing Country"], ["Australia", "Developed Country"], ["Austria", "Developed Country"], ["Azerbaijan", "Developing Country"], ["Bahamas", "Developing Country"], ["Bahrain", "Developing Country"], ["Bangladesh", "Developing Country"], ["Barbados", "Developing Country"], ["Belarus", "Developing Country"], ["Belgium", "Developed Country"], ["Belize", "Developing Country"], ["Benin", "Developing Country"], ["Bhutan", "Developing Country"], ["Bolivia", "Developing Country"], ["Bosnia and Herzegovina", "Developing Country"], ["Botswana", "Developing Country"], ["Brazil", "Developing Country"], ["Brunei", "Developing Country"], ["Bulgaria", "Developed Country"], ["Burkina Faso", "Developing Country"], ["Burundi", "Developing Country"], ["Cabo Verde", "Developing Country"], ["Cambodia", "Developing Country"], ["Cameroon", "Developing Country"], ["Canada", "Developed Country"], ["Central African Republic", "Developing Country"], ["Chad", "Developing Country"], ["Chile", "Developing Country"], ["China", "Developing Country"], ["Colombia", "Developing Country"], ["Comoros", "Developing Country"], ["Congo (Democratic Republic)", "Developing Country"], ["Congo (Republic)", "Developing Country"], ["Costa Rica", "Developing Country"], ["Croatia", "Developed Country"], ["Cyprus", "Developed Country"], ["Czech Republic", "Developed Country"], ["Côte d'Ivoire", "Developing Country"], ["Denmark", "Developed Country"], ["Djibouti", "Developing Country"], ["Dominica", "Developing Country"], ["Dominican Republic", "Developing Country"], ["Ecuador", "Developing Country"], ["Egypt", "Developing Country"], ["El Salvador", "Developing Country"], ["Equatorial Guinea", "Developing Country"], ["Eritrea", "Developing Country"], ["Estonia", "Developed Country"], ["Eswatini", "Developing Country"], ["Ethiopia", "Developing Country"], ["Fiji", "Developing Country"], ["Finland", "Developed Country"], ["France", "Developed Country"], ["Gabon", "Developing Country"], ["Gambia", "Developing Country"], ["Georgia", "Developing Country"], ["Germany", "Developed Country"], ["Ghana", "Developing Country"], ["Greece", "Developed Country"], ["Grenada", "Developing Country"], ["Guatemala", "Developing Country"], ["Guinea", "Developing Country"], ["Guinea-Bissau", "Developing Country"], ["Guyana", "Developing Country"], ["Haiti", "Developing Country"], ["Honduras", "Developing Country"], ["Hong Kong SAR", "Developed Country"], ["Hungary", "Developing Country"], ["Iceland", "Developed Country"], ["India", "Developing Country"], ["Indonesia", "Developing Country"], ["Iran", "Developing Country"], ["Iraq", "Developing Country"], ["Ireland", "Developed Country"], ["Israel", "Developed Country"], ["Italy", "Developed Country"], ["Jamaica", "Developing Country"], ["Japan", "Developed Country"], ["Jordan", "Developing Country"], ["Kazakhstan", "Developing Country"], ["Kenya", "Developing Country"], ["Kiribati", "Developing Country"], ["Korea (South)", "Developed Country"], ["Kosovo", "Developing Country"], ["Kuwait", "Developing Country"], ["Kyrgyz Republic", "Developing Country"], ["Laos", "Developing Country"], ["Latvia", "Developed Country"], ["Lebanon", "Developing Country"], ["Lesotho", "Developing Country"], ["Liberia", "Developing Country"], ["Libya", "Developing Country"], ["Liechtenstein", "Developed Country"], ["Lithuania", "Developed Country"], ["Luxembourg", "Developed Country"], ["Macao SAR", "Developed Country"], ["Madagascar", "Developing Country"], ["Malawi", "Developing Country"], ["Malaysia", "Developing Country"], ["Maldives", "Developing Country"], ["Mali", "Developing Country"], ["Malta", "Developed Country"], ["Marshall Islands", "Developing Country"], ["Mauritania", "Developing Country"], ["Mauritius", "Developing Country"], ["Mexico", "Developing Country"], ["Micronesia", "Developing Country"], ["Moldova", "Developing Country"], ["Mongolia", "Developing Country"], ["Montenegro", "Developing Country"], ["Morocco", "Developing Country"], ["Mozambique", "Developing Country"], ["Myanmar", "Developing Country"], ["Namibia", "Developing Country"], ["Nauru", "Developing Country"], ["Nepal", "Developing Country"], ["Netherlands", "Developed Country"], ["New Zealand", "Developed Country"], ["Nicaragua", "Developing Country"], ["Niger", "Developing Country"], ["Nigeria", "Developing Country"], ["North Korea", "Developing Country"], ["North Macedonia", "Developing Country"], ["Norway", "Developed Country"], ["Oman", "Developing Country"], ["Pakistan", "Developing Country"], ["Palau", "Developing Country"], ["Palestine", "Developing Country"], ["Panama", "Developing Country"], ["Papua New Guinea", "Developing Country"], ["Paraguay", "Developing Country"], ["Peru", "Developing Country"], ["Philippines", "Developing Country"], ["Poland", "Developing Country"], ["Portugal", "Developed Country"], ["Puerto Rico", "Developed Country"], ["Qatar", "Developing Country"], ["Romania", "Developing Country"], ["Russia", "Developing Country"], ["Rwanda", "Developing Country"], ["Samoa", "Developing Country"], ["San Marino", "Developed Country"], ["Saudi Arabia", "Developing Country"], ["Senegal", "Developing Country"], ["Serbia", "Developing Country"], ["Seychelles", "Developing Country"], ["Sierra Leone", "Developing Country"], ["Singapore", "Developed Country"], ["Slovak Republic", "Developed Country"], ["Slovenia", "Developed Country"], ["Solomon Islands", "Developing Country"], ["Somalia", "Developing Country"], ["South Africa", "Developing Country"], ["South Sudan", "Developing Country"], ["Spain", "Developed Country"], ["Sri Lanka", "Developing Country"], ["St. Kitts and Nevis", "Developing Country"], ["St. Lucia", "Developing Country"], ["St. Vincent and the Grenadines", "Developing Country"], ["Sudan", "Developing Country"], ["Suriname", "Developing Country"], ["Sweden", "Developed Country"], ["Switzerland", "Developed Country"], ["Syria", "Developing Country"], ["São Tomé and Príncipe", "Developing Country"], ["Taiwan", "Developed Country"], ["Tajikistan", "Developing Country"], ["Tanzania", "Developing Country"], ["Timor-Leste", "Developing Country"], ["Togo", "Developing Country"], ["Tonga", "Developing Country"], ["Trinidad and Tobago", "Developing Country"], ["Tunisia", "Developing Country"], ["Turkmenistan", "Developing Country"], ["Tuvalu", "Developing Country"], ["Türkiye", "Developing Country"], ["Uganda", "Developing Country"], ["Ukraine", "Developing Country"], ["United Arab Emirates", "Developing Country"], ["United Kingdom", "Developed Country"], ["United States", "Developed Country"], ["Uruguay", "Developing Country"], ["Uzbekistan", "Developing Country"], ["Vanuatu", "Developing Country"], ["Venezuela", "Developing Country"], ["Vietnam", "Developing Country"], ["Yemen", "Developing Country"], ["Zambia", "Developing Country"], ["Zimbabwe", "Developing Country"]]; // [country, allowance type] — Developed = IMF advanced economies (WEO Apr 2026)
  let RATE_ALLOW = [["Local (Thailand)", 150], ["Developed Country", 1200], ["Developing Country", 800]]; // [type, THB/day] daily allowance for manpower staying overnight
  // ---- end of generated master rate ----
  // Project destination (Thai province) → transport zone and the destination names used in the domestic travel sheet
  const DEST_ALIAS = { "กรุงเทพฯ": "กรุงเทพมหานคร", "อยุธยา": "พระนครศรีอยุธยา" }; // names saved before the master rate
  const TRAVEL_DEST = { "สมุทรปราการ": "Samutprakarn", "สมุทรสาคร": "Samutsakhon", "ฉะเชิงเทรา": "Chacheongsao", "ชลบุรี": "Chonburi", "กรุงเทพมหานคร": "Bangkok",
    "ปทุมธานี": "Pathumthani", "พระนครศรีอยุธยา": "Ayutthaya", "ระยอง": "Rayong", "นครราชสีมา": "Nakornratchasrima", "กำแพงเพชร": "Kamphaengphet", "ขอนแก่น": "Khonkean", "ลำพูน": "Lamphun" };
  let NO_ZONE = Object.keys(TRAVEL_DEST).filter(d => !Object.values(ZONES).some(z => z.prov.includes(d))); // in travel sheet but not zoned
  const destOf = p => DEST_ALIAS[p.destination] || p.destination || "";
  const zoneOf = p => Object.keys(ZONES).find(z => ZONES[z].prov.includes(destOf(p))) || "";
  const destSelect = (id, cur) => { cur = DEST_ALIAS[cur] || cur || "";
    const o = d => `<option value="${esc(d)}" ${cur === d ? "selected" : ""}>${esc(d)}</option>`;
    return `<select id="${id}"><option value="">ต่างประเทศ / อื่นๆ</option>${Object.entries(ZONES).map(([z, v]) => `<optgroup label="Zone ${z} · ${esc(v.band)} km · ${esc(v.th)}">${v.prov.map(o).join("")}</optgroup>`).join("")}${NO_ZONE.length ? `<optgroup label="ไม่อยู่ใน Zone (ราคารถขนส่งกรอกเอง)">${NO_ZONE.map(o).join("")}</optgroup>` : ""}${cur && !Object.keys(TRAVEL_DEST).concat(...Object.values(ZONES).map(z => z.prov)).includes(cur) ? o(cur) : ""}</select>`; };
  // A master item whose price depends on the project: fn(p) → { rate }, with how to describe it in the pick list
  // no zone → no price (note "ABCDE".indexOf("") is 0)
  const byZone = (arr, unit, remark) => Object.assign(p => { const z = zoneOf(p), i = z ? "ABCDE".indexOf(z) : -1; return { rate: i >= 0 ? arr[i] : "" }; }, { where: "zone", unit, remark });
  const byTravel = (list) => { const m = Object.fromEntries(list); return Object.assign(p => ({ rate: m[TRAVEL_DEST[destOf(p)]] != null ? m[TRAVEL_DEST[destOf(p)]] : "" }), { where: "travel", unit: "เที่ยว" }); };
  const MR = { allowance: 150, signal: 4500 }; // allowance = Local fallback; signal crew is not in the master rate file
  // Daily allowance (เบี้ยเลี้ยง) by country type, chosen per project; a Thai destination means Local (Thailand)
  const ALLOW_LOCAL = "Local (Thailand)";
  const countryTier = c => (RATE_COUNTRY.find(x => x[0] === c) || [])[1] || "";
  const countryOf = p => destOf(p) ? "Thailand" : (p.country || "");
  const allowTier = p => p.allowance_tier || (destOf(p) ? ALLOW_LOCAL : countryTier(p.country));
  const countrySelect = (id, cur) => { const g = t => RATE_COUNTRY.filter(x => x[1] === t && x[0] !== "Thailand");
    const o = c => `<option value="${esc(c)}" ${cur === c ? "selected" : ""}>${esc(c)}</option>`;
    return `<select id="${id}"><option value="">— เลือกประเทศ —</option>${cur && !RATE_COUNTRY.some(x => x[0] === cur) ? o(cur) : ""}${RATE_ALLOW.filter(([t]) => t !== ALLOW_LOCAL).map(([t, r]) => `<optgroup label="${esc(t)} · ฿${money(r)}/วัน">${g(t).map(x => o(x[0])).join("")}</optgroup>`).join("")}</select>`; };
  const allowRateOf = t => { const r = RATE_ALLOW.find(x => x[0] === t); return r ? r[1] : ""; };
  const allowRate = p => { const r = allowRateOf(allowTier(p) || ALLOW_LOCAL); return r === "" ? MR.allowance : r; };
  const allowSelect = (id, cur) => `<select id="${id}"><option value="">— เลือก —</option>${RATE_ALLOW.map(([t, r]) => `<option value="${esc(t)}" ${cur === t ? "selected" : ""}>${esc(t.replace(/ Country$/, "").replace(/ \(Thailand\)$/, ""))} · ฿${money(r)}/วัน</option>`).join("")}</select>`;
  const pos = (n, d, ot) => [n, { day_rate: d, ot_rate: ot }];
  const unitTh = u => /day/i.test(u) ? "วัน" : "เที่ยว";
  const accTh = (t, per) => `${t} · ${per === "Monthly" ? "รายเดือน" : "รายวัน"}`;
  const ACC_RATE = (t, per) => (RATE_ACC.find(x => x[0] === t && x[1] === per) || [])[2];
  const MASTER = {
    positions: RATE_MANDAY.map(([g, d, ot]) => pos(g, d, ot)),
    vehicles: RATE_VEH.map(([t, z, u, rm]) => [t, byZone(z, unitTh(u), /quotation/i.test(rm) ? "ต้องขอใบเสนอราคา · ค่า mobilization/rigging/permit อาจคิดเพิ่ม" : /mobili/i.test(u) ? "รวม mobilization แล้ว" : "")]),
    ground: [].concat(...Object.entries(RATE_TRAVEL).map(([t, l]) => l.length === 1 && /all location/i.test(l[0][0]) ? [[t, { rate: l[0][1] }]] : [[t, byTravel(l)]])),
    rooms: RATE_ACC.map(([t, per, r]) => [accTh(t, per), { rate: r, billing: per === "Monthly" ? "month" : "night" }]),
    airlines: [].concat(...[["Indonesia", 15000, 20000], ["Malaysia", 15000, 20000], ["Vietnam", 15000, 20000], ["Japan", 25000, 35000]].map(([c, a, t]) => [
      [`Air Asia · ${c}`, { airline: "Air Asia", country: c, fare: a }], [`Thai Airways · ${c}`, { airline: "Thai Airways", country: c, fare: t }]]), [["OTHER", { airline: "OTHER" }]]),
    docs: [["Visa fee / ค่าธรรมเนียมวีซ่า", { rate: 3000 }], ["Invitation letter / หนังสือเชิญจากปลายทาง", { rate: 1000 }], ["Travel Insurance", { rate: 1500 }], ["Passport ทำใหม่/ต่ออายุ (เหลือ < 6 เดือน)", { rate: 1500 }],
      ["ใบรับรองแพทย์ / Fit to work", { rate: 800 }], ["Vaccination certificate", { rate: 500 }], ["Work permit / COE ปลายทาง", { rate: 2000 }], ["Taxi Airport Round trip (Destination)", { rate: 4000 }], ["Excess baggage (เครื่องมือช่าง)", { rate: 2500 }]],
    tiers: [["เงินสำรองหน้าไซส์ (Cash in advance)", { rate: 5000 }], ["Safety Equipments 1 — scope เล็ก", { rate: 3000 }], ["Safety Equipments 2 — scope กลาง", { rate: 5000 }], ["Safety Equipments 3 — scope ใหญ่", { rate: 20000 }],
      ["Pocket money 1 — scope เล็ก", { rate: 3000 }], ["Pocket money 2 — scope กลาง", { rate: 6000 }], ["Pocket money 3 — scope ใหญ่", { rate: 10000 }],
      ["Site material expense 1 — scope เล็ก", { rate: 5000 }], ["Site material expense 2 — scope กลาง", { rate: 15000 }], ["Site material expense 3 — scope ใหญ่", { rate: 25000 }], ["อื่นๆ (ระบุเอง)", { rate: 0 }]],
  };
  // Rates come from Supabase when the server has them (GET /api/site-expense/rates); the generated block above is the fallback.
  function buildMaster() {
    NO_ZONE = Object.keys(TRAVEL_DEST).filter(d => !Object.values(ZONES).some(z => z.prov.includes(d)));
    MASTER.positions = RATE_MANDAY.map(([g, d, ot]) => pos(g, d, ot));
    MASTER.vehicles = RATE_VEH.map(([t, z, u, rm]) => [t, byZone(z, unitTh(u), /quotation/i.test(rm) ? "ต้องขอใบเสนอราคา · ค่า mobilization/rigging/permit อาจคิดเพิ่ม" : /mobili/i.test(u) ? "รวม mobilization แล้ว" : "")]);
    MASTER.ground = [].concat(...Object.entries(RATE_TRAVEL).map(([t, l]) => l.length === 1 && /all location/i.test(l[0][0]) ? [[t, { rate: l[0][1] }]] : [[t, byTravel(l)]]));
    MASTER.rooms = RATE_ACC.map(([t, per, r]) => [accTh(t, per), { rate: r, billing: per === "Monthly" ? "month" : "night" }]);
  }
  let RATES_FROM = "built-in", ratesLoading = null;
  function loadRates(redraw) {
    if (RATES_FROM !== "built-in" || ratesLoading) return;
    ratesLoading = fetch("/api/site-expense/rates", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(r => r.ok ? r.json() : null).then(d => {
        if (!d || !Array.isArray(d.manday) || !d.manday.length || !d.zones || !Array.isArray(d.veh)) { RATES_FROM = "fallback"; return; }
        RATE_MANDAY = d.manday; RATE_ACC = d.acc; ZONES = d.zones; RATE_VEH = d.veh; RATE_TRAVEL = d.travel; if (Array.isArray(d.allowance) && d.allowance.length) RATE_ALLOW = d.allowance; if (Array.isArray(d.countries) && d.countries.length) RATE_COUNTRY = d.countries;
        RATE_SRC = "Master rate (Supabase" + (d.updated ? " · อัปเดต " + new Date(d.updated).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "") + ")";
        RATES_FROM = "supabase"; buildMaster(); if (redraw) redraw();
      }).catch(() => { RATES_FROM = "fallback"; });
  }
  const F = (k, l, o = {}) => Object.assign({ k, l, t: "num" }, o);
  const FORMS = {
    manpower: [{ kind: "mp", title: "กำลังคน", hint: "คน × วัน × ค่าแรง + คน × ชม. OT × ค่า OT/ชม. + ค้างคืน: คน × วัน × เบี้ยเลี้ยง · ค่าแรงและค่า OT ตาม Master rate",
      fields: [F("position", "ตำแหน่ง", { t: "pick", list: "positions", w: 180 }), F("qty", "คน", { w: 64, d: 1 }), F("days", "วัน", { w: 64 }), F("day_rate", "ค่าแรง/วัน", { w: 100 }), F("ot_hours", "ชม. OT/คน", { w: 84 }), F("ot_rate", "ค่า OT/ชม.", { w: 90 }), F("overnight", "ค้างคืน", { t: "check", w: 64 }), F("allow_rate", "เบี้ยเลี้ยง/วัน", { w: 84, d: MR.allowance }), F("note", "หมายเหตุ", { t: "text" })],
      amt: r => num(r.qty) * num(r.days) * num(r.day_rate) + num(r.qty) * num(r.ot_hours) * num(r.ot_rate) + (r.overnight ? num(r.qty) * num(r.days) * num(r.allow_rate) : 0),
      brief: r => `${r.position || "–"} ×${num(r.qty) || 0}` }],
    subcontract: [{ kind: "sub", title: "ผู้รับเหมาช่วง", hint: "เหมา (lot × ราคา) + Manday (จำนวน × ราคา)",
      fields: [F("title", "งาน", { t: "text", w: 150 }), F("scope", "ขอบเขตงาน", { t: "text" }), F("supplier", "ผู้รับเหมา", { t: "text", w: 140 }), F("lump_qty", "เหมา (lot)", { w: 72 }), F("lump_rate", "ราคาเหมา", { w: 100 }), F("manday_qty", "Manday", { w: 72 }), F("manday_rate", "ราคา/Manday", { w: 100 })],
      amt: r => num(r.lump_qty) * num(r.lump_rate) + num(r.manday_qty) * num(r.manday_rate),
      brief: r => r.title || r.supplier || "–" }],
    transportation: [
      { kind: "veh", title: "รถขนส่ง / เครน / โฟล์คลิฟท์", hint: "คัน × เที่ยว (หรือวัน) × ราคา + คนให้สัญญาณ × ค่าให้สัญญาณ · ราคาตาม Zone ของ “จังหวัดปลายทาง” · รถ 6/10 ล้อ เทรลเลอร์ คิดต่อเที่ยว · เครน โฟล์คลิฟท์ คิดต่อวัน (รวม mobilization)",
        fields: [F("description", "ประเภทรถ", { t: "pick", list: "vehicles", w: 190 }), F("vehicles_qty", "คัน", { w: 60, d: 1 }), F("trips", "เที่ยว/วัน", { w: 70, d: 1 }), F("rate", "ราคา/เที่ยว·วัน", { w: 110 }), F("signal_crew", "คนให้สัญญาณ", { w: 90 }), F("signal_rate", "ค่าให้สัญญาณ", { w: 100, d: MR.signal }), F("note", "หมายเหตุ", { t: "text" })],
        amt: r => num(r.vehicles_qty) * num(r.trips) * num(r.rate) + num(r.signal_crew) * num(r.signal_rate),
        brief: r => `${r.description || "–"} ×${num(r.trips) || 0} เที่ยว` }],
    accommodation: [{ kind: "acc", title: "ที่พัก", hint: "ห้อง × คืน (หรือเดือน) × ราคา",
      fields: [F("label", "ที่พัก / ประเภทห้อง", { t: "pick", list: "rooms", w: 220 }), F("billing", "คิดเป็น", { t: "select", opts: [["night", "คืน"], ["month", "เดือน"]], w: 80 }), F("unit_qty", "ห้อง", { w: 64, d: 1 }), F("periods", "คืน / เดือน", { w: 80, d: 1 }), F("rate", "ราคา", { w: 100 }), F("note", "หมายเหตุ", { t: "text" })],
      amt: r => num(r.unit_qty) * num(r.periods) * num(r.rate),
      brief: r => `${num(r.unit_qty) || 0} ห้อง × ${num(r.periods) || 0} ${r.billing === "month" ? "เดือน" : "คืน"}` }],
    travel: [
      { kind: "air", title: "ตั๋วเครื่องบิน", hint: "จำนวนใบ × ราคา/ใบ",
        fields: [F("for_label", "สำหรับ (ทีม / ตำแหน่ง)", { t: "text", w: 170 }), F("country", "ปลายทาง", { t: "text", w: 120 }), F("airline", "สายการบิน", { t: "pick", list: "airlines", w: 170 }), F("ticket_type", "ประเภท", { t: "select", opts: [["Fixed", "Fixed"], ["Flexible", "Flexible"]], w: 96 }), F("qty", "ใบ", { w: 60, d: 1 }), F("fare", "ราคา/ใบ", { w: 100 })],
        amt: r => num(r.qty) * num(r.fare),
        brief: r => `✈ ${r.for_label || r.country || "ตั๋ว"} ×${num(r.qty) || 0}` },
      { kind: "doc", title: "เอกสารเดินทาง / ค่าใช้จ่ายต่อคน", hint: "จำนวนคน × ราคา/คน",
        fields: [F("doc_name", "เอกสาร", { t: "pick", list: "docs", w: 220 }), F("qty", "คน", { w: 64, d: 1 }), F("rate", "ราคา/คน", { w: 100 }), F("note", "หมายเหตุ", { t: "text" })],
        amt: r => num(r.qty) * num(r.rate),
        brief: r => r.doc_name || "–" },
      { kind: "tground", title: "รถรับส่ง / เดินทางในประเทศ", hint: "คัน × เที่ยว × ราคา · Round Trip ราคาตามจังหวัดปลายทาง · Site Trip ราคาเดียวทุกพื้นที่",
        fields: [F("description", "ประเภท", { t: "pick", list: "ground", w: 230 }), F("vehicles_qty", "คัน", { w: 60, d: 1 }), F("trips", "เที่ยว", { w: 64, d: 1 }), F("rate", "ราคา/เที่ยว", { w: 100 }), F("note", "หมายเหตุ", { t: "text" })],
        amt: r => num(r.vehicles_qty) * num(r.trips) * num(r.rate),
        brief: r => r.description || "–" }],
    site_expense: [{ kind: "se", title: "ค่าใช้จ่ายหน้างาน", hint: "จำนวน × ราคา",
      fields: [F("tier_item", "รายการ", { t: "pick", list: "tiers", w: 200 }), F("description", "รายละเอียด", { t: "text" }), F("qty", "จำนวน", { w: 72, d: 1 }), F("rate", "ราคา", { w: 100 }), F("holder_name", "ผู้ถือเงิน", { t: "text", w: 120 })],
      amt: r => num(r.qty) * num(r.rate),
      brief: r => r.tier_item || r.description || "–" }],
  };
  const KIND = {}; Object.values(FORMS).forEach(gs => gs.forEach(g => KIND[g.kind] = g));
  KIND.ground = KIND.veh;
  const newLine = (cat, kind) => { const g = KIND[kind], l = { id: uid(), cat, kind }; g.fields.forEach(f => l[f.k] = f.t === "check" ? false : f.k === "billing" ? "night" : f.k === "ticket_type" ? "Fixed" : f.d != null ? f.d : ""); return l; };
  // Lines from the earlier single-table Estimate → the category structure (totals stay the same)
  function migrateLine(l) {
    if (l.kind) return l;
    const q = (l.qty !== "" && l.qty != null) ? num(l.qty) : num(l.people) * num(l.days);
    const base = { id: l.id || uid(), cat: l.cat };
    switch (l.cat) {
      case "manpower": return Object.assign(base, { kind: "mp", position: l.scope || "", qty: num(l.people) ? l.people : 1, days: num(l.people) && num(l.days) ? l.days : q || "", day_rate: l.rate, ot_hours: "", ot_rate: "", overnight: false, note: l.remark || "" });
      case "subcontract": return Object.assign(base, { kind: "sub", title: l.scope || "", scope: "", supplier: "", lump_qty: q || 1, lump_rate: l.rate, manday_qty: "", manday_rate: "" });
      case "transportation": return Object.assign(base, { kind: "veh", description: l.scope || "", vehicles_qty: 1, trips: q || 1, rate: l.rate, signal_crew: "", signal_rate: "", note: "" });
      case "accommodation": return Object.assign(base, { kind: "acc", label: l.scope || "", billing: l.unit === "เดือน" ? "month" : "night", unit_qty: 1, periods: q || 1, rate: l.rate, note: "" });
      case "travel": return Object.assign(base, { kind: "air", for_label: l.scope || "", country: "", airline: "", ticket_type: "Fixed", qty: q || 1, fare: l.rate });
      default: return Object.assign(base, { cat: "site_expense", kind: "se", tier_item: "", description: l.scope || "", qty: q || 1, rate: l.rate, holder_name: "" });
    }
  }

  /* ---------- working period (phases) ---------- */
  // Phases may have gaps between them (e.g. supervision in June and July, installation in August–September).
  function wpPanel(p, ed, open) {
    const ph = phasesOf(p), dated = ph.filter(x => x.start && x.end);
    const sorted = dated.slice().sort((a, b) => a.start.localeCompare(b.start));
    const warn = [];
    sorted.forEach((x, i) => { if (x.end < x.start) warn.push(`${x.name || "phase"}: วันสิ้นสุดก่อนวันเริ่ม`); if (i && x.start < sorted[i - 1].end) warn.push(`${sorted[i - 1].name} กับ ${x.name} ช่วงเวลาซ้อนกัน`); });
    const gaps = sorted.slice(1).map((x, i) => span(sorted[i].end, x.start)).filter(g => g > 1);
    const row = (x, i) => ed
      ? `<tr data-ph="${x.id}"><td class="c se-no">${i + 1}</td><td><input class="se-in" data-pk="name" value="${esc(x.name || "")}" placeholder="เช่น Phase 1 Installation"></td><td><input class="se-in" type="date" data-pk="start" value="${esc(x.start || "")}"></td><td><input class="se-in" type="date" data-pk="end" value="${esc(x.end || "")}"></td><td class="c"><b>${phDays(x) || "–"}</b></td><td><button class="se-x" data-phdel aria-label="ลบ phase">${IC.x}</button></td></tr>`
      : `<tr><td class="c se-no">${i + 1}</td><td>${esc(x.name || "–")}</td><td>${fmtD(x.start)}</td><td>${fmtD(x.end)}</td><td class="c"><b>${phDays(x) || "–"}</b></td><td></td></tr>`;
    return `<details class="se-grp se-wp" ${open ? "open" : ""}><summary class="se-grp-h"><b>📅 Working period</b><span class="se-hint">${ph.length} phase · ทำงานจริง ${daysOf(p) || "–"} วัน${dated.length ? ` · ${fmtD(p.start)} – ${fmtD(p.end)}` : ""}${gaps.length ? ` · มีช่วงว่างระหว่าง phase ${gaps.length} ช่วง` : ""}</span></summary>
      <div class="tbl"><table class="se-dt se-wpt"><colgroup><col style="width:40px"><col><col style="width:150px"><col style="width:150px"><col style="width:70px"><col style="width:36px"></colgroup>
        <thead><tr><th class="c">#</th><th>Phase</th><th>เริ่ม</th><th>สิ้นสุด</th><th class="c">วัน</th><th></th></tr></thead>
        <tbody>${ph.length ? ph.map(row).join("") : `<tr><td colspan="6" class="se-muted c" style="padding:14px">ยังไม่มี phase${ed ? " · กด ＋ เพิ่ม phase" : ""}</td></tr>`}</tbody></table></div>
      ${warn.length ? `<div class="se-alert">⚠️ ${warn.map(esc).join(" · ")}</div>` : ""}
      ${ed ? `<div class="se-actions"><button class="se-btn" data-phadd>${IC.plus}เพิ่ม phase</button><span class="se-hint">วัน = วันสิ้นสุด − วันเริ่ม (แบบเดียวกับ Base44) · แก้วันที่แล้ว วันของกำลังคนใน phase นั้นจะปรับตาม ยกเว้นแถวที่แก้วันเอง</span></div>` : ""}
    </details>`;
  }
  function wireWp(sec, p, redraw) {
    const after = () => { syncDates(p); save(); redraw(); };
    sec.querySelectorAll("tr[data-ph]").forEach(tr => {
      const x = p.phases.find(y => y.id === tr.dataset.ph); if (!x) return;
      tr.querySelectorAll("[data-pk]").forEach(inp => inp.onchange = () => {
        x[inp.dataset.pk] = inp.value.trim();
        if (inp.dataset.pk !== "name") p.lines.forEach(l => { if (l.kind === "mp" && l.phase === x.id && l.days_auto !== false) l.days = phDays(x) || l.days; });
        after();
      });
      const d = tr.querySelector("[data-phdel]");
      if (d) d.onclick = () => {
        const n = p.lines.filter(l => l.phase === x.id).length;
        if (n && !confirm(`ลบ ${x.name || "phase นี้"}? ค่าใช้จ่าย ${n} รายการใน phase นี้จะย้ายไป “ทั้งโปรเจค”`)) return;
        p.phases = p.phases.filter(y => y !== x); p.lines.forEach(l => { if (l.phase === x.id) l.phase = ""; }); after();
      };
    });
    const a = sec.querySelector("[data-phadd]");
    if (a) a.onclick = () => {
      const last = phasesOf(p).filter(x => x.end).map(x => x.end).sort().pop() || "";
      p.phases.push({ id: "ph" + uid(), name: `Phase ${p.phases.length + 1}`, start: "", end: "" }); save(); redraw();
      const r = sec.querySelector("tr[data-ph]:last-of-type [data-pk=start]"); if (r) { if (last) r.min = last; r.focus(); }
    };
  }
  // Manpower summary by phase: head count, man-days, wages, OT, allowance
  function mpSummary(p) {
    const ph = phasesOf(p), known = new Set(ph.map(x => x.id)), mp = p.lines.filter(l => l.kind === "mp");
    const rows = ph.map((x, i) => [`${i + 1}. ${x.name || "Phase " + (i + 1)}`, mp.filter(l => l.phase === x.id), phDays(x)]);
    const un = mp.filter(l => !known.has(l.phase)); if (un.length) rows.push(["ยังไม่ระบุ phase", un, null]);
    const calc = ls => ls.reduce((o, l) => { const q = num(l.qty), d = num(l.days); o.ppl += q; o.md += q * d; o.wage += q * d * num(l.day_rate); o.ot += q * num(l.ot_hours) * num(l.ot_rate); o.al += l.overnight ? q * d * num(l.allow_rate) : 0; return o; }, { ppl: 0, md: 0, wage: 0, ot: 0, al: 0 });
    const all = calc(mp), tr = (n, o, d, b) => `<tr${b ? ' class="se-sumrow"' : ""}><td>${n}</td><td class="c">${d == null ? "" : d || "–"}</td><td class="c">${o.ppl || "–"}</td><td class="c">${o.md ? money(o.md) : "–"}</td><td class="r">${money(o.wage)}</td><td class="r">${money(o.ot)}</td><td class="r">${money(o.al)}</td><td class="r"><b>${money(o.wage + o.ot + o.al)}</b></td></tr>`;
    return `<div class="se-grp-h"><b>📊 สรุปกำลังคนตาม phase</b><span class="se-hint">คนสูงสุดในหนึ่ง phase ${peopleOf(p)} คน · รวม ${money(all.md)} man-day</span></div>
      <div class="tbl"><table class="se-mps"><thead><tr><th>Phase</th><th class="c">วัน</th><th class="c">คน</th><th class="c">Man-day</th><th class="r">ค่าแรง</th><th class="r">OT</th><th class="r">เบี้ยเลี้ยง</th><th class="r">รวม</th></tr></thead>
      <tbody>${rows.map(([n, ls, d]) => tr(esc(n), calc(ls), d)).join("")}</tbody>
      <tfoot>${tr("<b>รวมทั้งหมด</b>", Object.assign(all, { ppl: peopleOf(p) }), daysOf(p), true)}</tfoot></table></div>`;
  }

  const phPeople = (p, id) => p.lines.filter(l => l.kind === "mp" && l.phase === id).reduce((a, l) => a + num(l.qty), 0);
  // Category total per phase
  function catSummary(p, code) {
    const ph = phasesOf(p), known = new Set(ph.map(x => x.id)), ls = p.lines.filter(l => l.cat === code);
    const sum = f => ls.filter(f).reduce((a, l) => a + amtOf(l), 0);
    const rows = ph.map((x, i) => [`${i + 1}. ${x.name || "Phase " + (i + 1)}`, phDays(x), sum(l => l.phase === x.id)]);
    const all = sum(l => !known.has(l.phase)); if (all) rows.push(["ทั้งโปรเจค", null, all]);
    const T = ls.reduce((a, l) => a + amtOf(l), 0);
    return `<div class="se-grp-h"><b>📊 สรุปตาม phase</b></div><div class="tbl"><table class="se-mps"><thead><tr><th>Phase</th><th class="c">วัน</th><th class="r">จำนวนเงิน</th><th>สัดส่วน</th></tr></thead>
      <tbody>${rows.map(([n, d, v]) => `<tr><td>${esc(n)}</td><td class="c">${d == null ? "" : d || "–"}</td><td class="r">${money(v)}</td><td class="se-mt">${T ? `<span class="se-meter"><i style="width:${v / T * 100}%"></i></span><span class="se-pct">${(v / T * 100).toFixed(0)}%</span>` : ""}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td><b>รวม</b></td><td class="c">${daysOf(p) || ""}</td><td class="r"><b>${money(T)}</b></td><td></td></tr></tfoot></table></div>`;
  }
  // Accommodation draft from manpower that stays overnight: twin rooms for pairs, a single for an odd one out,
  // nights = days − 1 (as in the SC Site Expense app); hotel rate by location. Replaces earlier drafts of that phase.
  function autoRooms(p, id) {
    const ph = phasesOf(p).find(x => x.id === id); if (!ph) return;
    const n = p.lines.filter(l => l.kind === "mp" && l.phase === id && l.overnight).reduce((a, l) => a + num(l.qty), 0);
    const nights = Math.max(1, (phDays(ph) || 1) - 1);
    if (!n) return toast(`ยังไม่มีกำลังคนที่ “ค้างคืน” ใน ${ph.name || "phase นี้"} · ติ๊กค้างคืนในหน้า Manpower ก่อน`);
    const old = p.lines.filter(l => l.kind === "acc" && l.phase === id && l.auto);
    if (old.length && !confirm(`มีที่พักที่ Auto draft ไว้แล้วใน ${ph.name} · สร้างใหม่แทนของเดิม?`)) return;
    p.lines = p.lines.filter(l => !old.includes(l));
    const local = !!p.destination, hotel = local ? "Local Hotel" : "International Hotel", rate = ACC_RATE(hotel, "Daily"), twin = Math.floor(n / 2), single = n % 2;
    const mk = (label, rooms) => Object.assign(newLine("accommodation", "acc"), { phase: id, auto: true, label, billing: "night", unit_qty: rooms, periods: nights, rate, note: `Auto · ${n} คนค้างคืน` });
    if (twin) p.lines.push(mk(`Twin Room (${hotel})`, twin));
    if (single) p.lines.push(mk(`Single Room (${hotel})`, single));
    toast(`Auto draft: ${n} คน → ${twin ? twin + " Twin" : ""}${twin && single ? " + " : ""}${single ? single + " Single" : ""} × ${nights} คืน`);
  }
  // Working period page: phases + cost of every category per phase
  function secPeriod(sec, p, redraw, href) {
    const ed = editable(p), ph = phasesOf(p), known = new Set(ph.map(x => x.id));
    const cell = (code, f) => p.lines.filter(l => l.cat === code && f(l)).reduce((a, l) => a + amtOf(l), 0);
    const rows = ph.map((x, i) => [`<span class="se-phn">${i + 1}</span>${esc(x.name || "Phase " + (i + 1))}`, l => l.phase === x.id, phDays(x), phPeople(p, x.id)]);
    if (p.lines.some(l => !known.has(l.phase))) rows.push([`<span class="se-phn all">∑</span>ทั้งโปรเจค`, l => !known.has(l.phase), null, null]);
    sec.innerHTML = `
      <a class="se-back" href="#site-expense/${encodeURIComponent(p.id)}/estimate">${IC.back}สรุป Estimate ทุกหมวด</a>
      <div class="se-catnav"><a href="${href("period")}" class="on">${IC.cal}<span>Working period</span></a>${CATS.map(x => `<a href="${href(x.code)}">${x.ic}<span>${esc(x.name)}</span></a>`).join("")}</div>
      <div class="se-sec-h"><h3 class="se-cat-h">${IC.cal}Working period <small>ช่วงทำงานแต่ละ phase · ไม่จำเป็นต้องต่อเนื่องกัน</small></h3>${ed ? `<span class="badge live">แก้ไขได้</span>` : `<span class="badge off">อ่านอย่างเดียว</span>`}</div>
      ${wpPanel(p, ed, true)}
      <div class="se-grp"><div class="se-grp-h"><b>💰 ค่าใช้จ่ายแยกตาม phase × หมวด</b><span class="se-hint">กดตัวเลขเพื่อไปกรอกในหมวดนั้น</span></div>
        <div class="tbl"><table class="se-matrix"><thead><tr><th>Phase</th><th class="c">วัน</th><th class="c">คน</th>${CATS.map(c => `<th class="r">${esc(c.name)}</th>`).join("")}<th class="r">รวม</th></tr></thead>
        <tbody>${rows.length ? rows.map(([n, f, d, ppl]) => `<tr><td>${n}</td><td class="c">${d == null ? "" : d || "–"}</td><td class="c">${ppl == null ? "" : ppl || "–"}</td>${CATS.map(c => { const v = cell(c.code, f); return `<td class="r"><a class="se-mlink" href="${href(c.code)}">${v ? money(v) : "–"}</a></td>`; }).join("")}<td class="r"><b>${money(CATS.reduce((a, c) => a + cell(c.code, f), 0))}</b></td></tr>`).join("")
          : `<tr><td colspan="${CATS.length + 4}" class="se-muted c" style="padding:16px">เพิ่ม phase ด้านบนก่อน</td></tr>`}</tbody>
        <tfoot><tr><td><b>รวม</b></td><td class="c">${daysOf(p) || ""}</td><td class="c">${peopleOf(p) || ""}</td>${CATS.map(c => `<td class="r"><b>${money(cell(c.code, () => true))}</b></td>`).join("")}<td class="r"><b>${money(totalOf(p))}</b></td></tr></tfoot></table></div></div>`;
    wireWp(sec, p, redraw);
  }

  /* ---------- related documents (like ProjectAttachment in the SC Site Expense app) ---------- */
  const DOC_TYPES = [["SOW", "📄", "Scope of Work"], ["Layout", "📐", "Layout"], ["Overview plant", "🏭", "Overview plant"], ["P&ID", "🧭", "P&ID"], ["Drawing", "📏", "Drawing"],
    ["Quotation", "💲", "Quotation"], ["MOM", "📝", "MOM"], ["KOM", "🚩", "KOM"], ["Photo", "📷", "Photo"], ["Other", "📎", "อื่นๆ"]];
  const KEY_DOCS = ["SOW", "Layout", "Overview plant"];
  const docIc = t => (DOC_TYPES.find(x => x[0] === t) || DOC_TYPES[DOC_TYPES.length - 1])[1];
  const canDocs = p => p.list === "active" && (can("create") || can("award"));
  const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
  function docsBox(p) {
    const docs = p.docs || [], ed = canDocs(p);
    const missing = KEY_DOCS.filter(t => !docs.some(d => d.type === t));
    const chip = d => { const u = safeUrl(d.link); return `<span class="se-doc" title="${esc([d.type, d.note, d.file ? "ไฟล์: " + d.file : "", d.by ? "เพิ่มโดย " + d.by : ""].filter(Boolean).join(" · "))}">
      ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">` : "<span>"}<i>${docIc(d.type)}</i><b>${esc(d.type)}</b>${d.title && d.title !== d.type ? `<span>${esc(d.title)}</span>` : ""}${d.file && !u ? `<small>${esc(d.file)}</small>` : ""}${u ? `<em>↗</em></a>` : "</span>"}
      ${ed ? `<button class="se-x" data-docdel="${d.id}" aria-label="ลบเอกสาร ${esc(d.title || d.type)}">${IC.x}</button>` : ""}</span>`; };
    return `<div class="se-docs"><span class="se-docs-h">📎 เอกสารที่เกี่ยวข้อง</span>
      ${docs.map(chip).join("")}
      ${ed ? missing.map(t => `<button class="se-doc add" data-docadd="${esc(t)}">${docIc(t)} + ${esc(t)}</button>`).join("") + `<button class="se-doc add" data-docadd="">${IC.plus}เพิ่มเอกสาร</button>` : (docs.length ? "" : `<span class="se-muted">ยังไม่มีเอกสาร</span>`)}</div>`;
  }
  function wireDocs(el, p, redraw) {
    el.querySelectorAll("[data-docadd]").forEach(b => b.onclick = () => docForm(p, b.dataset.docadd, redraw));
    el.querySelectorAll("[data-docdel]").forEach(b => b.onclick = () => {
      const d = (p.docs || []).find(x => x.id === b.dataset.docdel);
      if (d && confirm(`ลบเอกสาร ${d.title || d.type}?`)) { p.docs = p.docs.filter(x => x !== d); save(); redraw(); }
    });
  }
  function docForm(p, type, redraw) {
    const m = modal("เพิ่มเอกสารที่เกี่ยวข้อง · " + p.ij, `
      <div class="se-fgrid">
        <label>ประเภท *<select id="dType">${DOC_TYPES.map(([t, ic, th]) => `<option value="${esc(t)}" ${t === (type || "SOW") ? "selected" : ""}>${ic} ${esc(th)}</option>`).join("")}</select></label>
        <label class="w2">ชื่อเอกสาร<input id="dTitle" placeholder="เช่น SOW Rev.2, Layout Line 3"></label>
        <label class="w3">ลิงก์ (Google Drive / SharePoint / URL)<input id="dLink" type="url" placeholder="https://drive.google.com/..."></label>
        <label class="w3">หรือแนบไฟล์<input id="dFile" type="file"></label>
        <label class="w3">หมายเหตุ<input id="dNote" placeholder="เช่น ฉบับที่ลูกค้าส่งมา 5 Nov"></label>
      </div>
      <p class="se-hint" style="margin:0">โหมดทดลองเก็บแค่ชื่อไฟล์ ยังไม่อัปโหลดจริง · แนะนำใส่ลิงก์ Google Drive ของ Job เพื่อให้ทุกคนเปิดได้</p>`,
      mm => {
        const g = id => mm.querySelector(id).value.trim(), f = mm.querySelector("#dFile").files[0];
        const link = g("#dLink");
        if (!link && !f) return "ใส่ลิงก์หรือแนบไฟล์อย่างน้อย 1 อย่าง";
        if (link && !safeUrl(link)) return "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://";
        p.docs = p.docs || [];
        p.docs.push({ id: uid(), type: g("#dType"), title: g("#dTitle") || (f ? f.name.replace(/\.[^.]+$/, "") : ""), link, file: f ? f.name : "", note: g("#dNote"), by: who(), at: new Date().toISOString() });
        save(); toast("เพิ่มเอกสารแล้ว"); redraw();
      }, "เพิ่มเอกสาร");
    return m;
  }

  /* ---------- category detail page ---------- */
  function secCategory(sec, p, redraw, code) {
    const c = catOf(code), ed = editable(p), groups = FORMS[c.code];
    const est = sumByCat(p)[c.code], bud = p.budget ? p.budget[c.code] || 0 : null, act = actualBy(p)[c.code];
    const href = x => `#site-expense/${encodeURIComponent(p.id)}/cat/${x}`;
    const kpi = (l, v, cls = "") => `<div class="se-kpi ${cls}"><span>${l}</span><b>${v}</b></div>`;
    const cell = (l, f) => {
      const v = l[f.k];
      if (!ed) return f.t === "check" ? (v ? "✓" : "–") : f.t === "select" ? esc((f.opts.find(o => o[0] === v) || [, v || "–"])[1]) : f.t === "num" ? (v === "" || v == null ? "–" : money(num(v))) : esc(v || "–");
      if (f.t === "check") return `<input type="checkbox" data-k="${f.k}" ${v ? "checked" : ""} aria-label="${esc(f.l)}">`;
      if (f.t === "select") return `<select class="se-in" data-k="${f.k}">${f.opts.map(o => `<option value="${o[0]}" ${o[0] === v ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
      if (f.t === "pick") return `<input class="se-in" data-k="${f.k}" data-pick="${f.list}" list="dl-${f.list}" value="${esc(v)}" placeholder="เลือกหรือพิมพ์">`;
      return `<input class="se-in ${f.t === "num" ? "r" : ""}" data-k="${f.k}" value="${esc(v)}" ${f.t === "num" ? 'inputmode="decimal"' : ""}>`;
    };
    const GF = [];   // row filter of each rendered group (index = data-gi)
    const group = (g, o = {}) => {
      const gi = GF.push(l => l.cat === c.code && l.kind === g.kind && (!o.filter || o.filter(l))) - 1;
      const rows = p.lines.filter(GF[gi]);
      const sub = rows.reduce((a, l) => a + amtOf(l), 0);
      return `<div class="se-grp ${o.cls || ""}" data-kind="${g.kind}" data-gi="${gi}">
        <div class="se-grp-h"><b>${o.title || esc(g.title)}</b><span class="se-hint">${esc(o.hint != null ? o.hint : g.hint)}</span><span class="se-grp-t">${baht(sub)}</span></div>
        <div class="tbl"><table class="se-dt"><thead><tr><th class="c" style="width:40px">#</th>${g.fields.map(f => `<th class="${f.t === "num" ? "r" : f.t === "check" ? "c" : ""}" ${f.w ? `style="width:${f.w}px"` : ""}>${esc(f.l)}</th>`).join("")}<th class="r" style="width:120px">จำนวนเงิน</th>${ed ? '<th style="width:36px"></th>' : ""}</tr></thead>
        <tbody>${rows.length ? rows.map((l, i) => `<tr data-id="${l.id}"><td class="c se-no">${i + 1}</td>${g.fields.map(f => `<td class="${f.t === "num" ? "r" : f.t === "check" ? "c" : ""}">${cell(l, f)}</td>`).join("")}<td class="r se-amt" data-amt>${money(amtOf(l))}</td>${ed ? `<td><button class="se-x" data-del aria-label="ลบแถว">${IC.x}</button></td>` : ""}</tr>`).join("")
          : `<tr><td colspan="${g.fields.length + (ed ? 3 : 2)}" class="se-muted c" style="padding:16px">ยังไม่มีรายการ</td></tr>`}</tbody></table></div>
        ${ed && !o.noAdd ? `<button class="se-btn" data-add="${g.kind}" data-phase="${esc(o.phase || "")}">${IC.plus}เพิ่ม${esc(g.title)}${o.addTo ? " ใน " + esc(o.addTo) : ""}</button>` : ""}</div>`;
    };
    if (code === "period") return secPeriod(sec, p, redraw, href);
    const phases = phasesOf(p), byPhase = phases.length > 0;
    if (phases.length === 1) p.lines.forEach(l => { if (!l.phase) l.phase = phases[0].id; });
    const known = new Set(phases.map(x => x.id));
    const inPh = id => l => id ? l.phase === id : !known.has(l.phase);
    // One section per phase (+ one for costs that belong to the whole project); a kind's table shows once it has rows.
    const section = (id, i, ph) => {
      const shown = groups.filter(g => groups.length === 1 || p.lines.some(l => l.cat === c.code && l.kind === g.kind && inPh(id)(l)));
      const sub = p.lines.filter(l => l.cat === c.code && inPh(id)(l)).reduce((a, l) => a + amtOf(l), 0);
      const head = ph ? `<span class="se-phn">${i + 1}</span>${esc(ph.name || "Phase " + (i + 1))} <small class="se-muted">${fmtD(ph.start)} – ${fmtD(ph.end)} · ${phDays(ph) || "–"} วัน${c.code !== "manpower" ? ` · ${phPeople(p, id)} คน` : ""}</small>`
        : `<span class="se-phn all">∑</span>ทั้งโปรเจค <small class="se-muted">ค่าใช้จ่ายที่ไม่ผูกกับ phase ใด เช่น เหมาทั้งงาน ประกัน แพ็คของ</small>`;
      const tools = c.code === "accommodation" && ed && ph ? `<button class="se-btn auto" data-auto="${id}">✨ Auto draft ที่พัก</button>` : "";
      return `<div class="se-phsec ${ph ? "" : "all"}" data-sec="${id}"><div class="se-phsec-h"><b>${head}</b><span class="se-grp-t" data-phsub="${id}">${baht(sub)}</span></div>
        ${shown.map(g => group(g, { filter: inPh(id), phase: id, noAdd: true, cls: groups.length === 1 ? "in-ph solo" : "in-ph" })).join("") || `<p class="se-muted" style="margin:0">ยังไม่มีรายการ</p>`}
        ${ed ? `<div class="se-actions">${groups.map(g => `<button class="se-btn" data-add="${g.kind}" data-phase="${id}">${IC.plus}${esc(g.title)}</button>`).join("")}${tools}</div>` : ""}</div>`;
    };
    const showAll = !byPhase || c.code !== "manpower" || p.lines.some(l => l.cat === c.code && !known.has(l.phase));
    const body = !byPhase ? groups.map(g => group(g)).join("")
      : `<p class="se-hint" style="margin:0">${esc(groups.map(g => g.title + ": " + g.hint).join(" · "))}</p>`
        + phases.map((ph, i) => section(ph.id, i, ph)).join("")
        + (showAll ? section("", 0, null) : "")
        + `<div class="se-grp" id="catSum">${c.code === "manpower" ? mpSummary(p) : catSummary(p, c.code)}</div>`;
    const lists = [...new Set(groups.flatMap(g => g.fields.filter(f => f.t === "pick").map(f => f.list)))];
    const acts = p.actuals.filter(a => a.cat === c.code).sort((a, b) => b.date.localeCompare(a.date));
    const STA = { pending: ["รอตรวจ", "s-req"], checked: ["ตรวจแล้ว", "s-ok"], rejected: ["ไม่ผ่าน", "s-rev"] };
    const canAdd = p.status === "locked" && p.list === "active" && can("actual"), canChk = p.list === "active" && can("check");
    sec.innerHTML = `
      <a class="se-back" href="#site-expense/${encodeURIComponent(p.id)}/estimate">${IC.back}สรุป Estimate ทุกหมวด</a>
      <div class="se-catnav"><a href="${href("period")}" class="${code === "period" ? "on" : ""}">${IC.cal}<span>Working period</span></a>${CATS.map(x => `<a href="${href(x.code)}" class="${x.code === c.code ? "on" : ""}">${x.ic}<span>${esc(x.name)}</span></a>`).join("")}</div>
      <div class="se-sec-h"><h3 class="se-cat-h">${c.ic}${esc(c.name)} <small>${esc(c.th)}</small></h3>${ed ? `<span class="badge live">แก้ไขได้</span>` : `<span class="badge off">${p.status === "locked" ? "🔒 ล็อกเป็น Budgetary แล้ว" : "อ่านอย่างเดียว"}</span>`}</div>
      <div class="se-kpis">${kpi("Estimate", baht(est))}${kpi("Budget", bud == null ? "—" : baht(bud))}${kpi("Actual", baht(act))}${kpi("คงเหลือ", bud == null ? "—" : baht(bud - act), bud != null && bud - act < 0 ? "over" : "")}</div>
      ${byPhase ? "" : `<div class="se-alert">ยังไม่ได้แบ่ง Working period · <a href="${href("period")}">กำหนด phase</a> แล้วค่าใช้จ่ายทุกหมวดจะแยกตาม phase ได้</div>`}
      ${lists.map(k => `<datalist id="dl-${k}">${MASTER[k].map(([n, d]) => { const v = typeof d === "function" ? d(p) : d; return `<option value="${esc(n)}">${typeof d === "function" ? (v.rate !== "" ? money(v.rate) + "/" + d.unit + " · " + (d.where === "zone" ? "Zone " + zoneOf(p) : esc(destOf(p))) : d.where === "zone" ? "ราคาตาม Zone ของจังหวัดปลายทาง" : "ราคาตามจังหวัดปลายทาง") + (d.remark ? " · " + d.remark : "") : Object.values(v).filter(x => typeof x === "number").map(money).join(" / ")}</option>`; }).join("")}</datalist>`).join("")}
      ${body}
      <div class="se-cat-tot"><span>รวม Estimate หมวด ${esc(c.name)}</span><b id="seCatTot">${baht(est)}</b></div>
      ${ed ? `${c.code === "manpower" ? `<p class="se-hint se-allow">เบี้ยเลี้ยงค้างคืน: ${countryOf(p) ? esc(countryOf(p)) + " · " : ""}<b>${esc(allowTier(p) || "ยังไม่เลือกประเภทประเทศ")}</b> · ฿${money(allowRate(p))}/วัน${allowTier(p) ? "" : " (ใช้อัตรา Local ไปก่อน)"} · เปลี่ยนได้ที่ “แก้ไขข้อมูล” ของโปรเจค</p>` : ""}<p class="se-hint">พิมพ์หรือเลือกจากรายการ ระบบเติมราคาตาม ${RATE_SRC}${p.destination ? ` · ปลายทาง ${esc(destOf(p))}${zoneOf(p) ? " (Zone " + zoneOf(p) + ")" : ""}` : ""} · แก้ราคาเองได้ · บันทึกอัตโนมัติ</p>` : ""}
      <div class="se-grp">
        <div class="se-grp-h"><b>🧾 Actual ในหมวดนี้</b><span class="se-hint">${p.status === "locked" ? (canAdd ? "บันทึกค่าใช้จ่ายจริงของหมวดนี้" : `บันทึกได้เฉพาะ ${namesWith("actual")}`) : "บันทึกได้หลัง Get Award"}</span><span class="se-grp-t">${baht(act)}</span></div>
        ${canAdd ? `<div class="se-form2">
          <label class="se-f">วันที่<input type="date" id="cDate" value="${today()}"></label>
          <label class="se-f w2">รายการ<input id="cDesc" placeholder="เช่น ${esc(c.code === "accommodation" ? "ที่พัก 4 ห้อง × 3 คืน" : c.code === "manpower" ? "ค่าแรงทีมติดตั้ง สัปดาห์ 1" : "รายละเอียดค่าใช้จ่าย")}"></label>
          <label class="se-f">จำนวนเงิน (บาท)<input id="cAmt" inputmode="decimal" placeholder="0"></label>
          <label class="se-f">ใบเสร็จ<input type="file" id="cFile" accept="image/*,application/pdf"></label>
          <div class="se-f"><button class="se-btn primary" id="cAdd">${IC.plus}บันทึก</button></div></div>` : ""}
        <div class="tbl"><table><thead><tr><th>วันที่</th><th>รายการ</th><th class="r">จำนวนเงิน</th><th>ใบเสร็จ</th><th>ผู้บันทึก</th><th>สถานะ</th><th></th></tr></thead>
          <tbody>${acts.length ? acts.map(a => `<tr data-a="${a.id}"><td>${fmtD(a.date)}</td><td>${esc(a.desc)}</td><td class="r">${money(num(a.amount))}</td><td>${a.receipt ? `📎 ${esc(a.receipt)}` : `<span class="se-muted">–</span>`}</td><td>${esc(a.by)}</td><td><span class="se-st ${STA[a.status][1]}">${STA[a.status][0]}</span></td>
            <td><span class="se-rowact">${canChk && a.status === "pending" ? `<button class="se-btn sm" data-chk="checked">✓</button><button class="se-btn sm" data-chk="rejected">✗</button>` : ""}${canAdd && a.status === "pending" ? `<button class="se-x" data-adel aria-label="ลบ">${IC.x}</button>` : ""}</span></td></tr>`).join("")
            : `<tr><td colspan="7" class="se-muted c" style="padding:16px">ยังไม่มีรายการ</td></tr>`}</tbody></table></div>
      </div>`;
    const tot = () => {
      sec.querySelector("#seCatTot").textContent = baht(sumByCat(p)[c.code]);
      sec.querySelectorAll(".se-grp[data-gi]").forEach(gEl => { gEl.querySelector(".se-grp-t").textContent = baht(p.lines.filter(GF[+gEl.dataset.gi]).reduce((a, l) => a + amtOf(l), 0)); });
      sec.querySelectorAll("[data-phsub]").forEach(x => { const id = x.dataset.phsub; x.textContent = baht(p.lines.filter(l => l.cat === c.code && (id ? l.phase === id : !known.has(l.phase))).reduce((a, l) => a + amtOf(l), 0)); });
      const ms = sec.querySelector("#catSum"); if (ms) ms.innerHTML = c.code === "manpower" ? mpSummary(p) : catSummary(p, c.code);
    };
    wireWp(sec, p, redraw);
    sec.querySelectorAll("tr[data-id]").forEach(tr => {
      const l = p.lines.find(x => x.id === tr.dataset.id); if (!l) return;
      const upd = () => { save(); tr.querySelector("[data-amt]").textContent = money(amtOf(l)); tot(); };
      tr.querySelectorAll("input[data-k]").forEach(inp => {
        if (inp.type === "checkbox") inp.onchange = () => { l[inp.dataset.k] = inp.checked; upd(); };
        else inp.oninput = () => { l[inp.dataset.k] = inp.value; if (inp.dataset.k === "days") l.days_auto = false; upd(); };
        if (inp.dataset.pick) inp.onchange = () => { const m = MASTER[inp.dataset.pick].find(x => x[0] === inp.value); if (m) { Object.assign(l, typeof m[1] === "function" ? m[1](p) : m[1]); save(); redraw(); } };
      });
      tr.querySelectorAll("select[data-k]").forEach(s => s.onchange = () => { l[s.dataset.k] = s.value; upd(); });
      const d = tr.querySelector("[data-del]"); if (d) d.onclick = () => { p.lines = p.lines.filter(x => x !== l); save(); redraw(); };
    });
    sec.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
      const nl = newLine(c.code, b.dataset.add);
      if (nl.kind === "mp") nl.allow_rate = allowRate(p);
      const ph = phasesOf(p).find(x => x.id === b.dataset.phase);
      nl.phase = ph ? ph.id : "";
      const team = ph ? phPeople(p, ph.id) : peopleOf(p), days = ph ? phDays(ph) : daysOf(p);
      if ((nl.kind === "doc" || nl.kind === "air") && team) nl.qty = team;   // default: the team of that phase
      if (nl.kind === "mp") { nl.days = days || ""; nl.days_auto = true; }
      if (nl.kind === "acc" && days) nl.periods = Math.max(1, days - 1);
      p.lines.push(nl); save(); redraw();
      const row = document.querySelector(`tr[data-id="${nl.id}"]`), ins = row && row.querySelectorAll("input");
      if (ins && ins.length) ins[0].focus();
    });
    sec.querySelectorAll("[data-auto]").forEach(b => b.onclick = () => { autoRooms(p, b.dataset.auto); save(); redraw(); });
    const add = sec.querySelector("#cAdd");
    if (add) add.onclick = () => {
      const g = id => sec.querySelector(id).value.trim(), amount = num(g("#cAmt"));
      if (!g("#cDate") || !g("#cDesc") || amount <= 0) return toast("กรอกวันที่ รายการ และจำนวนเงิน");
      const f = sec.querySelector("#cFile").files[0];
      p.actuals.push({ id: uid(), date: g("#cDate"), cat: c.code, desc: g("#cDesc"), amount, receipt: f ? f.name : "", by: who(), status: "pending" });
      save(); toast(bud != null && bud - actualBy(p)[c.code] < 0 ? "บันทึกแล้ว · ⚠️ หมวดนี้เกินงบ" : "บันทึกแล้ว · รอตรวจ"); redraw();
    };
    sec.querySelectorAll("tr[data-a]").forEach(tr => {
      const a = p.actuals.find(x => x.id === tr.dataset.a);
      tr.querySelectorAll("[data-chk]").forEach(b => b.onclick = () => { a.status = b.dataset.chk; save(); redraw(); });
      const d = tr.querySelector("[data-adel]"); if (d) d.onclick = () => { p.actuals = p.actuals.filter(x => x !== a); save(); redraw(); };
    });
  }

  const CSS4 = `
.se-click{cursor:pointer}.se-click:hover td{background:var(--blush)}.se-click .se-go{color:var(--rak);font-size:12.5px;white-space:nowrap;font-weight:600}
.se-catnav{display:flex;flex-wrap:wrap;gap:6px}
.se-catnav a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 9px;font-size:13px;color:#3d4450;background:#fff}
.se-catnav a .se-ci{width:16px;height:16px}.se-catnav a:hover{border-color:#f0b9b9}.se-catnav a.on{background:var(--rak);border-color:var(--rak);color:#fff;font-weight:600}
.se-cat-h{display:flex;align-items:center;gap:8px}.se-cat-h .se-ci{width:22px;height:22px;color:var(--rak)}.se-cat-h small{font-weight:400;color:var(--muted);font-size:13px}
.se-grp{display:grid;gap:10px;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff}
.se-grp-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}.se-grp-h b{font-size:14.5px;font-weight:600}.se-grp-t{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}
.se-grp .se-btn{justify-self:start}
.se-dt{min-width:760px;table-layout:fixed}.se-dt td{padding:5px 6px;vertical-align:middle}.se-dt th{padding:9px 6px;white-space:normal;line-height:1.25}
.se-dt td .se-in{min-width:0}
.se-cat-tot{display:flex;justify-content:space-between;align-items:center;background:var(--blush);border:1px solid var(--blush-2);border-radius:10px;padding:10px 14px;font-weight:600}
.se-cat-tot b{font-size:18px;color:var(--rak)}
.se-wp summary{cursor:pointer;list-style:none}.se-wp summary::-webkit-details-marker{display:none}.se-wp summary b::after{content:" ▾";color:var(--muted);font-weight:400}.se-wp:not([open]) summary b::after{content:" ▸"}
.se-wpt{min-width:560px}
.se-phsec{display:grid;gap:10px;border:1px solid var(--line);border-left:4px solid var(--rak);border-radius:12px;padding:12px 14px;background:#fff}
.se-phsec.all{border-left-color:#6d7582;background:#fbfbfc}.se-phsec-h{display:flex;align-items:center;gap:10px}.se-phsec-h b{font-size:15px;font-weight:600}.se-phsec-h small{font-weight:400;font-size:12.5px;margin-left:6px}
.se-grp.in-ph{border:0;padding:0;background:transparent}.se-grp.in-ph.solo>.se-grp-h{display:none}.se-grp.in-ph .se-grp-t{font-size:13px;color:var(--muted)}
.se-phn.all{background:#6d7582}
.se-btn.auto{background:#fff7e0;border-color:#f1d38a;color:#7a5410;font-weight:600}
.se-matrix{min-width:980px}.se-matrix td:first-child{min-width:190px;white-space:nowrap}.se-matrix td,.se-matrix th{font-variant-numeric:tabular-nums}.se-matrix tfoot td{border-top:2px solid var(--line);background:#fafbfc}
.se-mlink{color:inherit;text-decoration:none}.se-mlink:hover{color:var(--rak);text-decoration:underline}
.se-phg{border-left:4px solid var(--rak)}.se-phn{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--rak);color:#fff;font-size:12px;margin-right:8px}
.se-phg .se-grp-h small{font-weight:400;font-size:12.5px;margin-left:6px}
.se-mps td,.se-mps th{font-variant-numeric:tabular-nums}.se-mps tfoot td{border-top:2px solid var(--line);background:#fafbfc}
.se-estcat td{vertical-align:middle}.se-estcat .se-brief{color:var(--muted);font-size:12.5px}
@media (max-width:640px){.se-catnav a span{display:none}.se-catnav a{padding:6px 9px}}`;

  /* ---------- store ---------- */
  // Sample projects only when localStorage "ssm-site-expense-demo" = "1" (automated tests); everyone else starts empty.
  function seed() {
    let demo = false; try { demo = localStorage.getItem("ssm-site-expense-demo") === "1"; } catch (e) {}
    if (!demo) return { v: 2, user: "dew", projects: [] };
    const mk = (o) => Object.assign({ jo: "", list: "active", lines: [], history: [], budget: null, lockedAt: null, actuals: [], createdAt: new Date().toISOString() }, o);
    const L1 = (cat, kind, o) => Object.assign(newLine(cat, kind), o);
    return { v: 2, user: "dew", projects: [
      mk({ id: "ij2610005", ij: "IJ2610005", name: "New Dual EP Line", customer: "ULTRA CLEAN TECHNOLOGY (SINGAPORE)", city: "Singapore",
        start: "2027-05-23", end: "2027-05-30", phases: [{ id: "ph1", name: "Phase 1 Installation", start: "2027-05-23", end: "2027-05-30" }], status: "requested",
        destination: "", // from Base44 project IJ2610005 — totals ฿566,350 there and here
        lines: [
          L1("manpower", "mp", { position: "Site Engineer", qty: 1, days: 7, day_rate: 2000, ot_hours: 20, ot_rate: 375, overnight: true, note: "SC" }),
          L1("manpower", "mp", { position: "Team Lead", qty: 2, days: 7, day_rate: 2000, ot_hours: 20, ot_rate: 375, overnight: true }),
          L1("manpower", "mp", { position: "Technician", qty: 3, days: 7, day_rate: 1000, ot_hours: 20, ot_rate: 187.5, overnight: true }),
          L1("manpower", "mp", { position: "Programmer", qty: 1, days: 7, day_rate: 5000, ot_hours: 20, ot_rate: 937.5, overnight: true }),
          L1("subcontract", "sub", { title: "Packing", scope: "Tools packing", lump_qty: 1, lump_rate: 10000 }),
          L1("subcontract", "sub", { title: "Truck", scope: "CBT", lump_qty: 1, lump_rate: 120000 }),
          L1("accommodation", "acc", { label: "Single Room", unit_qty: 1, periods: 6, rate: 2500 }),
          L1("accommodation", "acc", { label: "Twin Room", unit_qty: 3, periods: 6, rate: 2500 }),
          L1("travel", "air", { for_label: "Site Engineer (SC)", country: "Singapore", airline: "OTHER", qty: 1, fare: 22000 }),
          L1("travel", "air", { for_label: "Team Lead", country: "Singapore", airline: "OTHER", qty: 2, fare: 22000 }),
          L1("travel", "air", { for_label: "Technician", country: "Singapore", airline: "OTHER", qty: 3, fare: 22000 }),
          L1("travel", "air", { for_label: "Programmer", country: "Singapore", airline: "OTHER", qty: 1, fare: 22000 }),
          L1("travel", "doc", { doc_name: "Travel Insurance", qty: 7, rate: 1500 }),
          L1("travel", "doc", { doc_name: "Invitation letter / หนังสือเชิญจากปลายทาง", qty: 7, rate: 1000 }),
          L1("travel", "doc", { doc_name: "Taxi Airport Round trip (Destination)", qty: 1, rate: 4000, note: "Programmer" }),
          L1("travel", "tground", { description: "รถตู้ (Site Trip)", vehicles_qty: 1, trips: 1, rate: 1000 }),
          L1("travel", "tground", { description: "Taxi Airport Round trip (Thailand)", vehicles_qty: 2, trips: 6, rate: 1000 }),
          L1("site_expense", "se", { tier_item: "Pocket money 3 — scope ใหญ่", description: "Pocket Money", qty: 1, rate: 30000, holder_name: "อาร์ต" })],
        history: [{ at: new Date().toISOString(), role: "sc", by: "สปาย", action: "submit", note: "" }] }),
      mk({ id: "ij2604012", ij: "IJ2604012", name: "New Dual EP Line", customer: "ULTRA CLEAN TECHNOLOGY (ISRAEL)", city: "Tel Aviv",
        start: "2027-03-01", end: "2027-03-10", phases: [{ id: "ph1", name: "Phase 1 Installation", start: "2027-03-01", end: "2027-03-10" }], status: "draft",
        lines: [L1("manpower", "mp", { position: "Technician", qty: 3, days: 10, day_rate: 1000, ot_hours: 10, ot_rate: 187.5 }), L1("manpower", "mp", { position: "Team Lead", qty: 3, days: 10, day_rate: 2000, ot_hours: 10, ot_rate: 375, overnight: true })] }),
      mk({ id: "ij20602006", ij: "IJ20602006", jo: "03302026", name: "Plating Line & WWTP relocation", customer: "ISOBE", city: "Nagoya",
        start: "2027-06-10", end: "2027-09-14", // phases from Base44 — with gaps between them
        phases: [{ id: "ph1", name: "Phase 1 Supervision", start: "2027-06-10", end: "2027-06-15" }, { id: "ph2", name: "Phase 2 Supervision", start: "2027-07-15", end: "2027-07-20" }, { id: "ph3", name: "Phase 3 Installation", start: "2027-08-15", end: "2027-09-14" }],
        status: "locked", lockedAt: new Date().toISOString(),
        lines: [
          L1("manpower", "mp", { phase: "ph1", position: "Site Engineer", qty: 1, days: 5, day_rate: 2000, ot_rate: 375, overnight: true }), L1("manpower", "mp", { phase: "ph1", position: "Team Lead", qty: 3, days: 5, day_rate: 2000, ot_rate: 375, overnight: true, note: "PP+ME+EE" }),
          L1("manpower", "mp", { phase: "ph2", position: "Site Engineer", qty: 1, days: 5, day_rate: 2000, ot_rate: 375, overnight: true }), L1("manpower", "mp", { phase: "ph2", position: "Team Lead", qty: 3, days: 5, day_rate: 2000, ot_rate: 375, overnight: true, note: "PP+ME+EE" }),
          L1("manpower", "mp", { phase: "ph3", position: "Site Engineer", qty: 1, days: 30, day_rate: 2000, ot_rate: 375, overnight: true }), L1("manpower", "mp", { phase: "ph3", position: "Team Lead", qty: 3, days: 30, day_rate: 2000, ot_rate: 375, overnight: true, note: "PP+ME+EE" }),
          L1("manpower", "mp", { phase: "ph3", position: "Technician", qty: 8, days: 30, day_rate: 1000, ot_rate: 187.5, overnight: true, note: "PP+ME+EE" }), L1("manpower", "mp", { phase: "ph3", position: "Engineer", qty: 1, days: 10, day_rate: 2000, ot_rate: 375, overnight: true, note: "If needed", days_auto: false }),
          L1("transportation", "veh", { phase: "ph3", description: "รถ 10 ล้อ เฮี๊ยบติดเครน", vehicles_qty: 2, trips: 5, rate: 8500 }), L1("transportation", "veh", { phase: "ph3", description: "รถเครน 25 ตัน", vehicles_qty: 1, trips: 4, rate: 9000, signal_crew: 2, signal_rate: 4500 }),
          L1("accommodation", "acc", { label: "Hotel Rental", unit_qty: 2, periods: 10, rate: 2000 }), L1("accommodation", "acc", { label: "House rental (Airbnb)", billing: "month", unit_qty: 1, periods: 1, rate: 200000 })],
        history: [{ at: new Date().toISOString(), role: "sc", by: "อาร์ต", action: "submit", note: "" }, { at: new Date().toISOString(), role: "ssm", by: "ดิว", action: "approve", note: "" }, { at: new Date().toISOString(), role: "md", by: "บี", action: "approve", note: "" }, { at: new Date().toISOString(), role: "ssm", by: "ดิว", action: "award", note: "Job 03302026" }],
        actuals: [
          { id: uid(), date: "2027-06-12", cat: "manpower", desc: "ค่าแรง Phase 1 Supervision", amount: 42000, receipt: "", by: "อาร์ต", status: "checked" },
          { id: uid(), date: "2027-06-11", cat: "accommodation", desc: "Hotel 2 ห้อง × 5 คืน", amount: 20000, receipt: "hotel-w1.jpg", by: "หนุ่ม", status: "checked" },
          { id: uid(), date: "2027-06-14", cat: "transportation", desc: "รถ 10 ล้อ ขนอุปกรณ์", amount: 17000, receipt: "", by: "อาร์ต", status: "pending" }] }),
    ].map(p => { if (p.status === "locked") p.budget = sumByCat(p); return p; }) };
  }
  let DB = null;
  function load() { try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && (d.v === 1 || d.v === 2)) { if (!d.user) d.user = { sc: "spy", ssm: "dew", md: "bee" }[d.role] || "dew"; d.projects.forEach(p => p.lines = (p.lines || []).map(migrateLine)); d.v = 2; return d; } } catch (e) {} return seed(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} }
  const me = () => PEOPLE.find(x => x[0] === DB.user) || PEOPLE[0];
  const can = k => PERMS[k].includes(me()[2]);
  const who = () => me()[1];

  /* ---------- calculations ---------- */
  const qtyOf = l => (l.qty !== "" && l.qty != null) ? num(l.qty) : num(l.people) * num(l.days);
  const amtOf = l => l.kind && KIND[l.kind] ? KIND[l.kind].amt(l) : qtyOf(l) * num(l.rate);
  const totalOf = p => p.lines.reduce((a, l) => a + amtOf(l), 0);
  function sumByCat(p) { const o = {}; CATS.forEach(c => o[c.code] = 0); p.lines.forEach(l => o[l.cat] = (o[l.cat] || 0) + amtOf(l)); return o; }
  const phasesOf = p => { p.phases = (p.phases || []).filter(Boolean); p.phases.forEach(x => { if (!x.id) x.id = "ph" + uid(); }); return p.phases; };
  const phDays = ph => span(ph.start, ph.end);
  // Working days: sum of the phases (they may have gaps); without dated phases, the project start–end.
  const daysOf = p => { const ph = phasesOf(p).filter(x => x.start && x.end); return ph.length ? ph.reduce((a, x) => a + phDays(x), 0) : span(p.start, p.end); };
  // Head count: the biggest team in any one phase (the same people usually move between phases).
  const peopleOf = p => {
    const mp = p.lines.filter(l => l.kind === "mp"), ph = phasesOf(p);
    if (ph.length < 2) return mp.reduce((a, l) => a + num(l.qty), 0);
    const by = {}; mp.forEach(l => by[l.phase || "-"] = (by[l.phase || "-"] || 0) + num(l.qty));
    return Math.max(0, ...Object.values(by));
  };
  const syncDates = p => { const d = phasesOf(p).filter(x => x.start && x.end); if (d.length) { p.start = d.map(x => x.start).sort()[0]; p.end = d.map(x => x.end).sort().pop(); } };
  const plannedOf = p => p.budget ? Object.values(p.budget).reduce((a, b) => a + b, 0) : totalOf(p);
  const actualBy = p => { const o = {}; CATS.forEach(c => o[c.code] = 0); p.actuals.filter(a => a.status !== "rejected").forEach(a => o[a.cat] += num(a.amount)); return o; };
  const editable = p => (p.status === "draft" || p.status === "revise") && can("create") && p.list === "active";

  /* ---------- shared bits ---------- */
  function roleBar() {
    return `<div class="se-role"><span>🧪 โหมดทดลอง · ทดสอบเป็น</span>${PEOPLE.map(([k, n, u, t]) => `<button class="se-rb ${DB.user === k ? "on" : ""}" data-user="${k}" title="${esc(u)}">${esc(n)} <small>${esc(t)}</small></button>`).join("")}
      <span class="se-role-n">ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น · ราคาตาม ${RATE_SRC}</span><button class="se-link" data-reset>ล้างข้อมูลทดลอง</button></div>`;
  }
  function wireRole(el, redraw) {
    el.querySelectorAll("[data-user]").forEach(b => b.onclick = () => { DB.user = b.dataset.user; DB.picked = true; save(); redraw(); });
    const r = el.querySelector("[data-reset]");
    if (r) r.onclick = () => { if (confirm("ล้างข้อมูลทั้งหมดในเบราว์เซอร์นี้แล้วเริ่มใหม่ (ว่าง)?")) { DB = seed(); save(); location.hash = "#site-expense"; redraw(); } };
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
          <span class="se-pill p-amb">${IC.eye}Sent for approval</span><span class="ar">→</span>
          <span class="se-pill p-grn">${IC.check}ดิว หรือ บี approve</span><span class="ar">→</span>
          <span class="se-pill p-blu">${IC.lock}Open Job → Budgetary</span></div>
        <div class="se-ks">
          ${kpi(CATS[0].ic, "Active Projects", act.length)}
          ${kpi(IC.money, "Total Planned", baht(act.reduce((a, p) => a + plannedOf(p), 0)))}
          ${kpi(IC.check, "Approved Budget", baht(act.filter(p => p.status === "approved" || p.status === "locked").reduce((a, p) => a + plannedOf(p), 0)))}
          ${kpi(IC.clock, "Waiting Approval", act.filter(p => p.status === "requested" || p.status === "reviewed").length)}
        </div>
        <div class="se-row">
          <div class="se-seg">${[["active", "Active", ""], ["archived", "Archived", IC.box], ["trash", "Trash", IC.trash]].map(([k, t, ic]) => `<button class="se-sb ${VIEW.list === k ? "on" : ""}" data-list="${k}">${ic}${t}${k !== "active" && cnt(k) ? ` <small>${cnt(k)}</small>` : ""}</button>`).join("")}</div>
          ${can("create") ? `<button class="se-new" data-new>${IC.plus}New Project</button>` : `<span class="se-hint">สร้างโปรเจคได้เฉพาะ ${namesWith("create")}</span>`}
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
      el.querySelectorAll("[data-dup]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const src = DB.projects.find(x => x.id === b.dataset.dup); if (src) dupForm(src); });
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
        <span class="se-card-l"><span class="se-id"><b>${esc(p.ij)}</b>${p.jo ? `<span class="se-jobchip" title="Get Award แล้ว">🏆 Job ${esc(p.jo)}</span>` : ""}<span class="se-st ${st.cls}">${st.th}</span>
          <button class="se-tlb" data-tl="${esc(p.id)}" aria-expanded="${open}" aria-label="Project Timeline">${IC.cal}<span>${open ? "▴" : "▾"}</span></button><span class="se-wait">${st.wait}</span></span>
          <span class="se-nm">${esc(p.name)}</span><span class="se-cu">${esc(p.customer)}${p.city ? " · " + esc(p.city) : ""}</span></span>
        <span class="se-card-r">${can("create") ? `<button class="se-dupb" data-dup="${esc(p.id)}" title="Duplicate เป็น Estimate ใหม่" aria-label="Duplicate ${esc(p.ij)} เป็น Estimate ใหม่">${IC.copy}<span>Duplicate</span></button>` : ""}<span>${daysOf(p)} days</span><span class="se-ppl">${CATS[0].ic}${peopleOf(p)}</span><b>${baht(plannedOf(p))}</b></span>
      </a>${tl}</article>`;
  }

  /* ---------- new / edit project ---------- */
  function projectForm(p) {
    const v = p || { ij: "", name: "", customer: "", city: "", start: "", end: "", phases: [] };
    const phaseRow = (x = {}) => `<div class="se-phr" data-id="${esc(x.id || "")}"><input placeholder="ชื่อ phase เช่น Installation" value="${esc(x.name || "")}" data-k="name"><input type="date" value="${esc(x.start || "")}" data-k="start"><input type="date" value="${esc(x.end || "")}" data-k="end"><button class="se-x" data-delph aria-label="ลบ phase">${IC.x}</button></div>`;
    const m = modal(p ? "แก้ไขข้อมูลโปรเจค" : "New Project", `
      <div class="se-fgrid">
        <label>IJ no. *<input id="fIj" value="${esc(v.ij)}" placeholder="IJ2611001"></label>
        <label class="w2">Project name *<input id="fName" value="${esc(v.name)}" placeholder="เช่น New Dual EP Line"></label>
        <label class="w2">Customer<input id="fCus" value="${esc(v.customer)}"></label>
        <label>City / Site<input id="fCity" value="${esc(v.city)}"></label>
        <label>จังหวัดปลายทาง (ราคารถ · ค่าเดินทาง)${destSelect("fDest", v.destination)}</label>
        <label class="se-ctry">ประเทศ (งานต่างประเทศ)${countrySelect("fCountry", p ? p.country || "" : "")}</label>
        <label>เบี้ยเลี้ยง (ประเภทประเทศ)${allowSelect("fAllow", p ? allowTier(p) : "")}</label>
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
        const phases = [...mm.querySelectorAll(".se-phr")].map(r => ({ id: r.dataset.id || "ph" + uid(), name: r.querySelector('[data-k="name"]').value.trim(), start: r.querySelector('[data-k="start"]').value, end: r.querySelector('[data-k="end"]').value })).filter(x => x.name);
        const dest = mm.querySelector("#fDest").value, country = dest ? "" : mm.querySelector("#fCountry").value, tier = mm.querySelector("#fAllow").value || (dest ? ALLOW_LOCAL : countryTier(country));
        if (!dest && !country && !tier) return "งานต่างประเทศ: เลือกประเทศ (หรือประเภทเบี้ยเลี้ยง)";
        if (!tier) return "เลือกเบี้ยเลี้ยง (ประเภทประเทศ)";
        const data = { ij, name, customer: g("#fCus"), city: g("#fCity"), destination: dest, country, allowance_tier: tier, start: s, end: e, phases };
        if (p) {
          const oldRate = allowRate(p), newRate = allowRateOf(tier); let moved = 0;
          if (newRate !== "" && newRate !== oldRate) p.lines.forEach(l => { if (l.kind === "mp" && (l.allow_rate === "" || num(l.allow_rate) === num(oldRate))) { l.allow_rate = newRate; moved++; } });
          Object.assign(p, data); syncDates(p); save(); toast("บันทึกข้อมูลโปรเจคแล้ว" + (moved ? ` · เปลี่ยนเบี้ยเลี้ยง ${moved} รายการเป็น ฿${money(newRate)}/วัน` : "")); window.dispatchEvent(new HashChangeEvent("hashchange")); }
        else {
          const np = Object.assign({ id: ij.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + uid().slice(0, 4), jo: "", status: "draft", list: "active", lines: [], history: [], budget: null, lockedAt: null, actuals: [], createdAt: new Date().toISOString() }, data);
          DB.projects.unshift(np); save(); toast("สร้างโปรเจคแล้ว · เริ่มกรอก Estimate"); location.hash = "#site-expense/" + encodeURIComponent(np.id) + "/estimate";
        }
      }, p ? "บันทึก" : "สร้างโปรเจค");
    m.querySelector("[data-addph]").onclick = () => { m.querySelector("#fPh").insertAdjacentHTML("beforeend", phaseRow()); wirePh(); };
    const wirePh = () => m.querySelectorAll("[data-delph]").forEach(b => b.onclick = () => b.parentElement.remove());
    wirePh();
    const fa = m.querySelector("#fAllow"), fc = m.querySelector("#fCountry"), fd = m.querySelector("#fDest"), cw = m.querySelector(".se-ctry");
    const showC = () => { cw.style.display = fd.value ? "none" : ""; };
    fd.addEventListener("change", () => { if (fd.value) fa.value = ALLOW_LOCAL; else fa.value = countryTier(fc.value) || (fa.value === ALLOW_LOCAL ? "" : fa.value); showC(); });
    fc.addEventListener("change", () => { const t = countryTier(fc.value); if (t) fa.value = t; });
    showC();
  }


  /* ---------- duplicate a past project into a new draft Estimate ---------- */
  const addDays = (d, n) => { if (!d) return ""; const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const diffDays = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
  function dupForm(src) {
    const srcPh = phasesOf(src).length ? src.phases : (src.start ? [{ id: "ph" + uid(), name: "Phase 1", start: src.start, end: src.end }] : []);
    const base = src.start || (srcPh[0] && srcPh[0].start) || "";
    const nLines = (src.lines || []).length;
    const phRow = x => `<div class="se-phr" data-id="${esc(x.id)}"><input value="${esc(x.name)}" data-k="name" aria-label="ชื่อ phase"><input type="date" value="${esc(x.start || "")}" data-k="start" aria-label="เริ่ม"><input type="date" value="${esc(x.end || "")}" data-k="end" aria-label="สิ้นสุด"><button class="se-x" data-delph aria-label="ลบ phase">${IC.x}</button></div>`;
    const m = modal("Duplicate เป็น Estimate ใหม่", `
      <div class="se-dupsrc">${IC.copy}<span>ต้นแบบ <b>${esc(src.ij)}</b>${src.jo ? ` · Job ${esc(src.jo)}` : ""} · ${esc(src.name)} · ${baht(totalOf(src))}<small>${nLines} รายการ Estimate · ${srcPh.length} phase · ${peopleOf(src)} คน</small></span></div>
      <div class="se-fgrid">
        <label>IJ no. ใหม่ *<input id="dIj" placeholder="IJ2611001"></label>
        <label class="w2">Project name *<input id="dName" value="${esc(src.name)}"></label>
        <label class="w2">Customer<input id="dCus" value="${esc(src.customer || "")}"></label>
        <label>City / Site<input id="dCity" value="${esc(src.city || "")}"></label>
        <label>จังหวัดปลายทาง (Zone ราคารถ · ค่าเดินทาง)${destSelect("dDest", src.destination)}</label>
        <label>วันเริ่มงานใหม่<input id="dStart" type="date" value="${esc(base)}"></label>
      </div>
      <p class="se-hint" style="margin:8px 0 0">เปลี่ยนวันเริ่มงาน แล้วทุก phase จะเลื่อนตาม โดยคงจำนวนวันและช่วงเว้นระหว่าง phase ไว้ แก้ทีละ phase ต่อได้</p>
      <div class="se-phs"><b>Project Timeline (phase)</b><div id="dPh">${srcPh.map(phRow).join("")}</div><button class="se-btn" data-addph>${IC.plus}เพิ่ม phase</button></div>
      <div class="se-dupopt">
        <label><input type="checkbox" id="dLines" ${nLines ? "checked" : "disabled"}> คัดลอกรายการ Estimate ทุกหมวด (${nLines} รายการ) · แก้จำนวนคนและรายการต่อได้หลังสร้าง</label>
        <small>ไม่คัดลอก: เอกสารที่เกี่ยวข้อง (SOW, Layout ฯลฯ ให้แนบของงานใหม่), สถานะอนุมัติ, Job no., Budget, Actual และประวัติ · โปรเจคใหม่เริ่มเป็น Draft</small>
      </div>`,
      mm => {
        const g = id => mm.querySelector(id).value.trim();
        const ij = g("#dIj"), name = g("#dName");
        if (!ij || !name) return "กรอก IJ no. ใหม่ และ Project name";
        if (DB.projects.some(x => x.ij.toLowerCase() === ij.toLowerCase() && x.list !== "trash")) return "มี IJ นี้อยู่แล้ว";
        const phases = [...mm.querySelectorAll("#dPh .se-phr")].map(r => ({ id: r.dataset.id || "ph" + uid(), name: r.querySelector('[data-k="name"]').value.trim(), start: r.querySelector('[data-k="start"]').value, end: r.querySelector('[data-k="end"]').value })).filter(x => x.name);
        if (phases.some(x => x.start && x.end && x.end < x.start)) return "มี phase ที่วันสิ้นสุดอยู่ก่อนวันเริ่ม";
        const keep = new Set(phases.map(x => x.id));
        const lines = mm.querySelector("#dLines").checked ? JSON.parse(JSON.stringify(src.lines || [])).map(l => Object.assign(l, { id: uid() }, l.phase && !keep.has(l.phase) ? { phase: "" } : {})) : [];
        const s0 = phases.map(x => x.start).filter(Boolean).sort()[0] || g("#dStart"), e0 = phases.map(x => x.end).filter(Boolean).sort().pop() || "";
        const now = new Date().toISOString();
        const np = { id: ij.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + uid().slice(0, 4), ij, jo: "", name, customer: g("#dCus"), city: g("#dCity"), destination: mm.querySelector("#dDest").value,
          allowance_tier: src.allowance_tier || "", country: src.country || "", start: s0, end: e0, phases, lines, docs: [], status: "draft", list: "active", budget: null, lockedAt: null, award: null, actuals: [], createdAt: now, from: { id: src.id, ij: src.ij, jo: src.jo || "" },
          history: [{ at: now, role: "create", by: who(), action: "duplicate", note: `สร้างจาก ${src.ij}${src.jo ? " (Job " + src.jo + ")" : ""}` }] };
        syncDates(np);
        DB.projects.unshift(np); VIEW.list = "active"; save();
        toast(`สร้าง ${ij} จาก ${src.ij} แล้ว · ปรับคนและวันในแต่ละหมวด`);
        location.hash = "#site-expense/" + encodeURIComponent(np.id) + "/estimate";
      }, "สร้าง Estimate ใหม่");
    const wirePh = () => m.querySelectorAll("[data-delph]").forEach(b => b.onclick = () => b.parentElement.remove());
    wirePh();
    m.querySelector("[data-addph]").onclick = () => { m.querySelector("#dPh").insertAdjacentHTML("beforeend", phRow({ id: "ph" + uid(), name: "", start: "", end: "" })); wirePh(); };
    let prev = base;
    m.querySelector("#dStart").onchange = e => {
      const nv = e.target.value; if (!nv || !prev) { prev = nv; return; }
      const n = diffDays(prev, nv); prev = nv; if (!n) return;
      m.querySelectorAll('#dPh [data-k="start"], #dPh [data-k="end"]').forEach(i => { if (i.value) i.value = addDays(i.value, n); });
    };
    m.querySelector("#dIj").focus();
  }

  /* ---------- project page ---------- */
  const SECS = [
    { id: "dashboard", no: "1", name: "Dashboard", th: "Budget vs Actual", ic: "📊" },
    { id: "estimate", no: "2", name: "Estimate", th: "ประเมินจาก Scope of Work", ic: "📝" },
    { id: "actual", no: "3", name: "Actual record", th: "บันทึกค่าใช้จ่ายจริงจากหน้างาน", ic: "🧾" },
  ];
  function project(el, p, secId, catCode) {
    const isCat = secId === "cat" && (catCode === "period" || CATS.some(c => c.code === catCode));
    const cur = isCat ? SECS[1] : SECS.find(s => s.id === secId) || SECS[0];
    const st = STATUS[p.status];
    const href = s => `#site-expense/${encodeURIComponent(p.id)}${s === "dashboard" ? "" : "/" + s}`;
    const steps = [["draft", "SC ร่าง"], ["requested", "อนุมัติ (ดิว / บี)"], ["approved", "Get Award (Job no.)"], ["locked", "Budgetary 🔒"]];
    const order = ["draft", "requested", "approved", "locked"];
    const at = p.status === "revise" ? 0 : p.status === "reviewed" ? 1 : order.indexOf(p.status);
    const stepper = steps.map(([k, t], i) => `<span class="se-step ${i < at ? "done" : i === at ? "now" : ""}"><i>${i < at ? "✓" : i + 1}</i>${t}</span>`).join('<span class="se-arr">→</span>');
    const listNote = p.list !== "active" ? `<div class="se-off">${p.list === "trash" ? "🗑️ โปรเจคนี้อยู่ใน Trash" : "📦 โปรเจคนี้ถูก Archive"} · <button class="se-link" data-restore>กู้คืนเป็น Active</button></div>` : "";
    el.innerHTML = `
      <div style="display:grid;gap:16px">
        <a class="se-back" href="#site-expense">${IC.back}Overview all project</a>
        ${roleBar()}
        ${listNote}
        <div class="se-ph">
          <div style="min-width:0"><div class="se-id"><b>${esc(p.ij)}</b>${p.jo ? `<span class="se-jobchip">🏆 Job ${esc(p.jo)}</span>` : `<span class="se-jo none">ยังไม่มี Job no.</span>`}<span class="se-st ${st.cls}">${st.th}</span><span class="se-wait">${st.wait}</span></div>
            <h2>${esc(p.name)}</h2>${p.from ? `<div class="se-from">${IC.copy}สร้างจาก ${esc(p.from.ij)}${p.from.jo ? " · Job " + esc(p.from.jo) : ""}</div>` : ""}<div class="se-cu">${esc(p.customer)}${p.city ? " · " + esc(p.city) : ""} · ${fmtD(p.start)} – ${fmtD(p.end)}</div></div>
          <div class="se-ph-r"><span><small>ระยะเวลา</small><b>${daysOf(p)} days</b></span><span><small>คน</small><b>${peopleOf(p)}</b></span><span><small>${p.budget ? "Budget" : "Planned"}</small><b>${baht(plannedOf(p))}</b></span></div>
          ${p.award ? `<div class="se-award"><span class="se-aw-ic">🏆</span><span><b>Awarded</b> · ${esc(p.ij)} → <b class="se-jo">Job ${esc(p.jo)}</b> · ${fmtD(p.award.date)}${p.award.value ? ` · มูลค่างาน ${baht(p.award.value)}` : ""}${p.award.by ? ` · เปิด Job โดย ${esc(p.award.by)}` : ""}${p.award.note || p.award.source ? `<small>${[p.award.note, p.award.source].filter(Boolean).map(esc).join(" · ")}${p.award.estimate && Math.round(Object.values(p.award.estimate).reduce((x, y) => x + y, 0)) !== Math.round(plannedOf(p)) ? ` · ปรับจาก Estimate ${baht(Object.values(p.award.estimate).reduce((x, y) => x + y, 0))}` : ""}</small>` : ""}</span><span class="se-aw-b">Budget control ${baht(plannedOf(p))} 🔒</span></div>` : ""}
          ${docsBox(p)}
          <div class="se-ph-a">${p.status === "approved" && p.list === "active" ? (can("award") ? `<button class="se-btn award" data-award>🏆 Get Award</button>` : `<span class="se-hint" style="margin-right:auto">รอ ${namesWith("award")} กด Get Award และกำหนด Budget control</span>`) : ""}${editable(p) ? `<button class="se-btn" data-edit>${IC.edit}แก้ไขข้อมูล</button>` : ""}${can("create") ? `<button class="se-btn" data-dup>${IC.copy}Duplicate เป็น Estimate ใหม่</button>` : ""}${p.list === "active" ? `<button class="se-btn" data-arch>${IC.box}Archive</button><button class="se-btn danger" data-trash>${IC.trash}Trash</button>` : ""}</div>
        </div>
        <div class="se-steps">${stepper}</div>
        <nav class="se-tabs" aria-label="Section ของโปรเจค">${SECS.map(s => `<a class="se-tab" href="${href(s.id)}" ${s.id === cur.id ? 'aria-current="page"' : ""}><span class="n">${s.ic}</span><b>${s.no}. ${esc(s.name)}</b><small>${esc(s.th)}</small></a>`).join("")}</nav>
        <section class="se-sec" id="seSec"></section>
      </div>`;
    const redraw = () => project(el, p, isCat ? "cat" : cur.id, catCode);
    wireRole(el, redraw);
    const on = (sel, fn) => { const b = el.querySelector(sel); if (b) b.onclick = fn; };
    on("[data-edit]", () => projectForm(p));
    on("[data-award]", () => getAward(p));
    on("[data-dup]", () => dupForm(p));
    on("[data-arch]", () => { p.list = "archived"; save(); toast("ย้ายไป Archived แล้ว"); redraw(); });
    on("[data-trash]", () => { if (confirm("ย้ายโปรเจคนี้ไป Trash?")) { p.list = "trash"; save(); toast("ย้ายไป Trash แล้ว"); location.hash = "#site-expense"; } });
    on("[data-restore]", () => { p.list = "active"; save(); toast("กู้คืนแล้ว"); redraw(); });
    wireDocs(el, p, redraw);
    const sec = el.querySelector("#seSec");
    if (isCat) return secCategory(sec, p, redraw, catCode);
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
      <div class="se-aw-h"><b>Budget control ที่จะล็อก</b><span class="se-hint">ตั้งต้นจาก Estimate ที่อนุมัติแล้ว · แก้เป็นตัวเลขจากฝ่ายบริหารโครงการได้</span><button class="se-link" type="button" data-awreset>ใช้ตัวเลข Estimate ทั้งหมด</button></div>
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
        p.history.push({ at: p.award.at, role: "award", by: who(), action: "award", note: `Job ${jo} · Budget ${baht(total)}${changed ? ` (Estimate ${baht(estTotal)})` : ""}${p.award.source ? " · " + p.award.source : ""}` });
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

  // Category rows (Dashboard and Estimate) open that category's detail page
  function goRows(sec, p) {
    sec.querySelectorAll("[data-go]").forEach(tr => {
      const go = () => { location.hash = `#site-expense/${encodeURIComponent(p.id)}/cat/${tr.dataset.go}`; };
      tr.onclick = go; tr.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
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
      ${bud ? "" : `<div class="se-gate">${IC.lock} ยังไม่มีงบ Budgetary — แสดงยอด Estimate ไว้ให้ดูก่อน เมื่ออนุมัติและ Get Award (ได้ Job no.) แล้ว จะเทียบ Budget กับ Actual ได้</div>`}
      <div class="se-kpis">
        ${kpi(bud ? "Budget (ล็อกแล้ว)" : "Estimate", baht(bud ? B : totalOf(p)), "บาท")}
        ${kpi("Actual (ใช้จริง)", baht(A), pend.length ? `รวมรายการรอตรวจ ${pend.length} รายการ` : "บาท")}
        ${kpi("คงเหลือ", bud ? baht(B - A) : "—", "บาท", bud && B - A < 0 ? "over" : "")}
        ${kpi("ใช้ไป", bud && B ? pct(A, B).toFixed(1) + "%" : "—", "% ของงบ", bud && pct(A, B) > 100 ? "over" : bud && pct(A, B) >= 80 ? "warn" : "")}
      </div>
      ${over.length ? `<div class="se-alert">⚠️ หมวดที่ใช้งบถึง 80% ขึ้นไป: ${over.map(c => `<b>${esc(c.name)}</b> (${pct(act[c.code], bud[c.code]).toFixed(0)}%)`).join(", ")}</div>` : ""}
      <div class="tbl"><table><thead><tr><th>หมวดค่าใช้จ่าย</th>${bud ? "" : `<th class="r">Estimate</th>`}<th class="r">Budget</th><th class="r">Actual</th><th class="r">คงเหลือ</th><th>% ใช้ไป</th></tr></thead>
        <tbody>${CATS.map(c => { const b = bud ? bud[c.code] : 0, a = act[c.code]; return `<tr class="se-click" data-go="${c.code}" tabindex="0" title="ดูรายละเอียด ${esc(c.name)}"><td>${catCell(c)}</td>${bud ? "" : `<td class="r">${est[c.code] ? money(est[c.code]) : "–"}</td>`}<td class="r">${bud ? money(b) : "–"}</td><td class="r">${a ? money(a) : "–"}</td><td class="r ${bud && b - a < 0 ? "neg" : ""}">${bud ? money(b - a) : "–"}</td><td class="se-mt">${meter(a, b)} <span class="se-go">›</span></td></tr>`; }).join("")}</tbody>
        <tfoot><tr><td><b>รวม</b></td>${bud ? "" : `<td class="r"><b>${money(totalOf(p))}</b></td>`}<td class="r"><b>${bud ? money(B) : "–"}</b></td><td class="r"><b>${money(A)}</b></td><td class="r"><b>${bud ? money(B - A) : "–"}</b></td><td class="se-mt">${meter(A, B)}</td></tr></tfoot></table></div>
      <div class="se-other">
        <div class="se-box"><b>⏳ สถานะอนุมัติ</b><span>${STATUS[p.status].th} · ${STATUS[p.status].wait}</span></div>
        <div class="se-box"><b>🧾 Actual รอตรวจ</b><span>${pend.length ? `${pend.length} รายการ · ${baht(pend.reduce((a, x) => a + num(x.amount), 0))}` : "ไม่มี"}</span></div>
        <div class="se-box"><b>📅 บันทึกล่าสุด</b><span>${p.actuals.length ? fmtD(p.actuals.map(a => a.date).sort().pop()) : "ยังไม่มีรายการ"}</span></div>
      </div>`;
    goRows(sec, p);
  }

  /* ---------- 2. Estimate ---------- */
  function secEstimate(sec, p, redraw) {
    const ed = editable(p);
    const by = sumByCat(p);
    const actions = [];
    if (p.list === "active") {
      if ((p.status === "draft" || p.status === "revise") && can("create")) actions.push(`<button class="se-btn primary" data-act="submit">ส่งขออนุมัติ →</button>`);
      if ((p.status === "requested" || p.status === "reviewed") && can("approve")) actions.push(`<button class="se-btn" data-act="back">↩ ส่งกลับให้ SC แก้</button><button class="se-btn primary" data-act="approve">✓ อนุมัติงบ</button>`);
      if (p.status === "approved" && can("award")) actions.push(`<button class="se-btn award" data-act="award">🏆 Get Award · ผูก Job no. &amp; ล็อก Budget control</button>`);
    }
    const owner = { draft: "create", revise: "create", requested: "approve", reviewed: "approve", approved: "award" }[p.status];
    const waitMsg = p.list === "active" && owner && !actions.length ? `<span class="se-hint">ขั้นตอนนี้เป็นของ ${namesWith(owner)} · สลับคนด้านบนเพื่อทดสอบ</span>` : "";
    const hist = p.history.slice().reverse();
    const ACT = { submit: "ส่งตรวจ", approve: "ผ่าน / อนุมัติ", back: "ส่งกลับแก้", lock: "เปิด Job & ล็อกงบ", award: "Get Award · ผูก Job no. & ล็อก Budget control", duplicate: "Duplicate จากโปรเจคเดิม" };
    sec.innerHTML = `
      <div class="se-sec-h"><h3>📝 Estimate · ประเมินจาก Scope of Work</h3>${ed ? `<span class="badge live">แก้ไขได้</span>` : `<span class="badge off">${p.status === "locked" ? "🔒 ล็อกเป็น Budgetary แล้ว" : "อ่านอย่างเดียว"}</span>`}</div>
      ${p.status === "revise" ? `<div class="se-alert">↩ ถูกส่งกลับให้แก้: ${esc((p.history.filter(h => h.action === "back").pop() || {}).note || "-")}</div>` : ""}
      <div class="tbl"><table class="se-estcat"><thead><tr><th>หมวดค่าใช้จ่าย</th><th>รายละเอียด</th><th class="c">รายการ</th><th class="r">Estimate</th><th></th></tr></thead>
        <tbody>${CATS.map(c => { const ls = p.lines.filter(l => l.cat === c.code), b = ls.map(l => KIND[l.kind] ? KIND[l.kind].brief(l) : "").filter(Boolean); return `<tr class="se-click" data-go="${c.code}" tabindex="0" title="${ed ? "กรอก" : "ดู"}รายละเอียด ${esc(c.name)}"><td>${catCell(c)}</td><td class="se-brief">${b.length ? esc(b.slice(0, 3).join(" · ")) + (b.length > 3 ? ` · +${b.length - 3}` : "") : "–"}</td><td class="c">${ls.length || "–"}</td><td class="r"><b>${by[c.code] ? money(by[c.code]) : "–"}</b></td><td class="r"><span class="se-go">${ed ? "กรอกรายละเอียด" : "ดูรายละเอียด"} →</span></td></tr>`; }).join("")}</tbody>
        <tfoot>${phasesOf(p).length > 1 ? `<tr><td colspan="5" class="se-muted" style="font-size:12.5px">ตาม phase: ${phasesOf(p).map((x, i) => `${esc(x.name || "Phase " + (i + 1))} ${baht(p.lines.filter(l => l.phase === x.id).reduce((a, l) => a + amtOf(l), 0))}`).join(" · ")} · <a href="#site-expense/${encodeURIComponent(p.id)}/cat/period">ดูทั้งหมด →</a></td></tr>` : ""}<tr><td colspan="3"><b>รวมประเมิน</b></td><td class="r"><b>${money(totalOf(p))}</b></td><td></td></tr></tfoot></table></div>
      ${ed ? `<p class="se-hint">กดที่หมวดเพื่อกรอกรายละเอียด (ตำแหน่ง ค่าแรง OT ที่พัก ตั๋ว รถ ฯลฯ) ระบบคำนวณยอดให้ตามสูตรเดียวกับ SC Site Expense</p>` : ""}
      <div class="se-approve">
        <div class="se-actions">${actions.join("")}${waitMsg}</div>
        <div class="se-hist"><b>ประวัติการอนุมัติ</b>${hist.length ? `<ul>${hist.map(h => `<li><span class="se-who">${esc(ROLE_TH[h.role] || h.role.toUpperCase())}</span>${h.by ? `<b class="se-by">${esc(h.by)}</b>` : ""} ${ACT[h.action] || esc(h.action)}${h.note ? ` · <i>${esc(h.note)}</i>` : ""}<small>${new Date(h.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</small></li>`).join("")}</ul>` : `<p class="se-muted">ยังไม่มี</p>`}</div>
      </div>`;
    goRows(sec, p);
    const log = (action, note = "") => p.history.push({ at: new Date().toISOString(), role: { submit: "create", lock: "award", award: "award" }[action] || "approve", by: who(), action, note });
    sec.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === "submit") {
        if (!p.lines.length || totalOf(p) <= 0) return toast("ใส่รายการ Estimate และจำนวนเงินก่อนส่งตรวจ");
        log("submit"); p.status = "requested"; save(); toast("ส่งขออนุมัติแล้ว · รอดิวหรือบีอนุมัติ"); redraw();
      } else if (a === "approve") {
        log("approve"); p.status = "approved"; save(); toast(`${who()} อนุมัติงบแล้ว · รอ Get Award`); redraw();
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
    const act = actualBy(p), active = p.list === "active", canAdd = active && can("actual"), canChk = active && can("check");
    const left = c => p.budget[c] - act[c];
    const rows = p.actuals.slice().sort((a, b) => b.date.localeCompare(a.date));
    const STA = { pending: ["รอตรวจ", "s-req"], checked: ["ตรวจแล้ว", "s-ok"], rejected: ["ไม่ผ่าน", "s-rev"] };
    sec.innerHTML = `
      <div class="se-sec-h"><h3>🧾 Actual record · Job ${esc(p.jo)}</h3>${canAdd ? `<span class="badge live">บันทึกได้</span>` : `<span class="badge off">ดูอย่างเดียว · บันทึกได้เฉพาะ ${namesWith("actual")}</span>`}</div>
      ${canAdd ? `<div class="se-form2">
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
          <td><span class="se-rowact">${canChk && a.status === "pending" ? `<button class="se-btn sm" data-chk="checked">✓</button><button class="se-btn sm" data-chk="rejected">✗</button>` : ""}${canAdd && a.status === "pending" ? `<button class="se-x" data-adel aria-label="ลบ">${IC.x}</button>` : ""}</span></td></tr>`).join("")
          : `<tr><td colspan="8" class="se-muted c" style="padding:22px">ยังไม่มีรายการ</td></tr>`}</tbody></table></div>`;
    if (canAdd) {
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
    }
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
.se-docs{display:flex;flex-wrap:wrap;align-items:center;gap:8px;width:100%;border-top:1px dashed var(--line);padding-top:12px}
.se-docs-h{font-size:13px;font-weight:600;color:#424a57;margin-right:4px}
.se-doc{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:10px;background:#fafbfc;font-size:13px;padding:3px 4px 3px 10px;max-width:100%}
.se-doc>a,.se-doc>span{display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;min-width:0}
.se-doc>a:hover b{color:var(--rak);text-decoration:underline}.se-doc i{font-style:normal}.se-doc b{font-weight:600}
.se-doc span span,.se-doc a span{color:#5d6673;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}.se-doc small{color:var(--muted)}.se-doc em{font-style:normal;color:var(--muted);margin-right:6px}
.se-doc .se-x{padding:2px}
.se-doc.add{border-style:dashed;background:#fff;color:var(--muted);padding:5px 12px;cursor:pointer;font:inherit;font-size:13px}.se-doc.add:hover{border-color:var(--rak);color:var(--rak)}.se-doc.add .se-ci{width:15px;height:15px}
.se-fgrid .w3{grid-column:1/-1}
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
.se-fgrid input,.se-fgrid select,.se-phr input{font:inherit;font-size:14px;border:1px solid var(--line);border-radius:9px;padding:7px 10px;width:100%;color:var(--ink)}.se-fgrid select{background:#fff;min-height:40px}.se-fgrid select:focus{outline:2px solid #f4c7c7;border-color:var(--rak)}
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
    if (!document.getElementById("seCss")) { const s = document.createElement("style"); s.id = "seCss"; s.textContent = CSS + CSS2 + CSS3 + CSS4; document.head.appendChild(s); }
    document.querySelectorAll(".se-modal").forEach(m => m.remove());
    if (!DB) {
      DB = load();
      DB.projects.forEach(p => { const ph = phasesOf(p); if (ph.length === 1) p.lines.forEach(l => { if (!l.phase) l.phase = ph[0].id; }); });
      const signed = PEOPLE.find(x => x[2] === ((window.SSM_ME || {}).username || ""));
      if (signed && !DB.picked) DB.user = signed[0]; // start as the signed-in person until someone switches in the test bar
    }
    loadRates(() => { if (el.isConnected && !document.querySelector(".se-modal")) mount(el, sub); }); // re-draw once with Supabase rates
    const [pid, sec, code] = (sub || "").split("/").map(decodeURIComponent);
    if (!pid) return overview(el);
    const p = DB.projects.find(x => x.id === pid);
    if (!p) { el.innerHTML = `<div class="empty">ไม่พบโปรเจคนี้ · <a class="open" href="#site-expense">กลับ Overview</a></div>`; return; }
    project(el, p, sec || "dashboard", code);
  }
  window.SiteExpense = { mount };
})();
