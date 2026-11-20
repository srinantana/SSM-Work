/* SSM Work · Candidates — วิเคราะห์ความเข้ากันได้เบื้องต้น: CV / Resume × โครงสร้างงาน SSM
   Keyword-based, runs in the browser (no AI, no cost). Source of the structure: "Project & Sale Department 2026_SSM.pdf"
   — SSM = Site Project Management + Service Management in a Matrix with Production; SC (Site & Service Control) supports
   with Packing List / Logistics / ERP; 4 project phases: Quoting → Pre-installation → Execution → Closing (SAT / Punch list).
   CandFit.analyze(text) → { v, years, lead, dims: [{k, name, score, hits}], roles: [{k, name, pct}], best, level, gaps } */
(function (root) {
  "use strict";
  const V = 1;
  // 7 ด้านจากโครงสร้าง SSM — kw: คำที่ค้นใน CV (ไทยเทียบแบบ substring, อังกฤษเทียบทั้งคำ)
  const DIMS = [
    { k: "site", name: "คุมงานติดตั้งหน้างาน", src: "Phase 3 Execution · Site Kick-off & Supervision",
      kw: ["ติดตั้ง", "หน้างาน", "คุมงาน", "ควบคุมงาน", "ไซต์งาน", "โฟร์แมน", "installation", "install", "installer", "on-site", "onsite", "site", "supervisor", "supervision", "foreman", "erection", "construction", "ก่อสร้าง"],
      ask: "เล่างานติดตั้งที่เคยคุมหน้างานเอง 1 งาน — ขนาดทีม ระยะเวลา ปัญหาหน้างานที่แก้เอง" },
    { k: "service", name: "งานบริการ · ซ่อมบำรุง · วิเคราะห์ปัญหา", src: "Service Management Workflow · Diagnosis",
      kw: ["ซ่อม", "บำรุง", "บริการ", "แก้ปัญหา", "วิเคราะห์ปัญหา", "เบรกดาวน์", "service", "maintenance", "repair", "troubleshoot", "troubleshooting", "diagnosis", "diagnose", "breakdown", "preventive", "corrective", "after-sales"],
      ask: "ยกตัวอย่างเครื่องเสียที่เคยหาสาเหตุเอง — ขั้นตอนวิเคราะห์ และสรุปผลส่งลูกค้าอย่างไร" },
    { k: "plan", name: "วางแผน · ประเมิน Manday / ค่าใช้จ่าย", src: "Phase 1 Quoting · Phase 2 Daily Task Planning",
      kw: ["วางแผน", "แผนงาน", "ตารางงาน", "ประเมิน", "ประมาณการ", "งบประมาณ", "ต้นทุน", "ค่าใช้จ่าย", "planning", "plan", "schedule", "scheduling", "manday", "man-day", "estimate", "estimation", "budget", "cost", "boq", "gantt", "timeline", "ms project"],
      ask: "ถ้าได้ TOR งานติดตั้ง 1 ไลน์ จะประเมินจำนวนช่าง × วัน และค่าใช้จ่ายหน้างานอย่างไร" },
    { k: "coord", name: "ประสานงานลูกค้า · ผู้รับเหมา · นำทีม", src: "Matrix Structure · Client & Sub-contractor Coordination",
      kw: ["ประสานงาน", "ลูกค้า", "ผู้รับเหมา", "หัวหน้า", "ดูแลทีม", "ควบคุมทีม", "สื่อสาร", "ประชุม", "coordinate", "coordination", "coordinator", "customer", "client", "subcontractor", "sub-contractor", "contractor", "lead", "leader", "team", "communication", "meeting", "stakeholder"],
      ask: "เคยต้องประสานลูกค้า ผู้รับเหมา และฝ่ายผลิตพร้อมกันไหม — ตอนแผนชนกันตัดสินใจอย่างไร" },
    { k: "doc", name: "เอกสาร · รายงาน · ERP / Logistics", src: "SC Role · Daily Site Report · Packing List · PR",
      kw: ["รายงาน", "เอกสาร", "จัดซื้อ", "เบิก", "ขนส่ง", "คลังสินค้า", "สต็อก", "report", "reporting", "document", "documentation", "erp", "sap", "pr", "po", "purchase", "packing", "logistics", "shipping", "stock", "inventory", "excel"],
      ask: "เคยทำ Daily Site Report / Packing List / เปิด PR ในระบบ ERP ไหม — ใช้โปรแกรมอะไร" },
    { k: "qhse", name: "ความปลอดภัย · มาตรฐาน · ทดสอบส่งมอบ", src: "Safety Board · Phase 4 SAT / Commissioning / Punch List",
      kw: ["ความปลอดภัย", "จป", "มาตรฐาน", "ทดสอบ", "ส่งมอบ", "ตรวจรับ", "safety", "iso", "qc", "qa", "quality", "standard", "sat", "fat", "commissioning", "punch", "handover", "permit", "loto", "lockout", "inspection"],
      ask: "เล่าการทำ SAT / Commissioning หรือการปิด Punch List ที่เคยทำ — ใครเซ็นรับ" },
    { k: "tech", name: "พื้นฐานเทคนิค (ไฟฟ้า · เครื่องกล · ระบบควบคุม)", src: "TPM Technical Support · ทีมช่างปฏิบัติการ",
      kw: ["ไฟฟ้า", "เครื่องกล", "ระบบควบคุม", "ปั๊ม", "ท่อ", "ชุบ", "น้ำเสีย", "เชื่อม", "แบบงาน", "electrical", "electric", "mechanical", "plc", "hmi", "scada", "automation", "control", "instrument", "pump", "piping", "pipe", "plating", "wastewater", "welding", "autocad", "drawing", "p&id", "hardware", "software", "network"],
      ask: "อ่านแบบ P&ID / Wiring diagram ได้ระดับไหน — ตัวอย่างงานที่ใช้จริง" },
  ];
  // น้ำหนักต่อบทบาทในโครงสร้าง SSM (รวม 100)
  const ROLES = [
    { k: "sitecontrol", name: "Site Control (SSM Supervisor)", w: { site: 25, coord: 20, plan: 15, qhse: 15, service: 10, doc: 10, tech: 5 } },
    { k: "sc", name: "SC — Site & Service Control", w: { doc: 30, coord: 25, plan: 15, site: 10, tech: 10, service: 5, qhse: 5 } },
    { k: "tech", name: "ทีมช่างปฏิบัติการ", w: { tech: 30, service: 25, site: 20, qhse: 15, coord: 5, doc: 5 } },
  ];
  const LEAD = ["หัวหน้า", "ผู้ควบคุม", "ดูแลทีม", "lead", "leader", "supervisor", "foreman", "manager", "head", "chief"];

  const norm = s => " " + String(s || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ") + " ";
  const isTh = w => /[฀-๿]/.test(w);
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = (t, w) => isTh(w) ? t.includes(w) : new RegExp("(^|[^a-z0-9])" + esc(w) + "($|[^a-z0-9])").test(t);
  const hitScore = n => n >= 4 ? 100 : n === 3 ? 85 : n === 2 ? 65 : n === 1 ? 35 : 0;

  // ปีประสบการณ์จากช่วงปี เช่น 2017-2022, 2565 – ปัจจุบัน, 2023-Present
  function years(text) {
    const now = new Date().getFullYear(), t = String(text || "");
    const Y = y => { y = +y; return y > 2400 ? y - 543 : y; };
    const re = /((?:19|20|25)\d{2})\s*(?:-|–|—|ถึง|to)\s*((?:19|20|25)\d{2}|ปัจจุบัน|present|now|current)/gi;
    let m, lo = Infinity, hi = -Infinity;
    while ((m = re.exec(t))) { const a = Y(m[1]), b = /\d/.test(m[2]) ? Y(m[2]) : now; if (a < 1970 || a > now || b < a || b > now + 1) continue; lo = Math.min(lo, a); hi = Math.max(hi, b); }
    const yy = t.match(/(\d{1,2})\s*(?:\+\s*)?(?:ปี|years?|yrs?)/i);
    const span = lo === Infinity ? null : hi - lo;
    const stated = yy && +yy[1] <= 45 ? +yy[1] : null;
    return span === null ? stated : stated === null ? span : Math.max(span, stated);
  }
  const yearScore = y => y === null ? null : y >= 5 ? 100 : y >= 3 ? 75 : y >= 1 ? 50 : 25;

  function analyze(text) {
    const t = norm(text);
    const dims = DIMS.map(d => { const hits = [...new Set(d.kw.filter(w => has(t, w)))]; return { k: d.k, name: d.name, score: hitScore(hits.length), hits: hits.slice(0, 8) }; });
    const by = Object.fromEntries(dims.map(d => [d.k, d.score]));
    const y = years(text), ys = yearScore(y), lead = LEAD.some(w => has(t, w));
    const roles = ROLES.map(r => { let s = 0; for (const [k, w] of Object.entries(r.w)) s += (by[k] || 0) * w / 100;
      let pct = ys === null ? s : s * 0.85 + ys * 0.15;
      if (lead && r.k === "sitecontrol") pct = Math.min(100, pct + 5);
      return { k: r.k, name: r.name, pct: Math.round(pct) }; });
    const best = roles.slice().sort((a, b) => b.pct - a.pct)[0];
    const sc = roles[0].pct;
    const level = sc >= 70 ? "เหมาะมาก — นัดสัมภาษณ์" : sc >= 50 ? "พอใช้ — สัมภาษณ์เจาะประเด็นที่ขาด" : sc >= 30 ? "ยังไม่ชัด — ดูแบบทดสอบประกอบ" : "ข้อมูลใน CV น้อย / ไม่ตรง";
    const gaps = DIMS.filter(d => by[d.k] < 40).map(d => ({ k: d.k, name: d.name, ask: d.ask }));
    const words = (String(text || "").match(/\S+/g) || []).length;
    return { v: V, years: y, lead, words, dims, roles, best: best.k, level, gaps };
  }

  const api = { analyze, years, DIMS, ROLES, V };
  root.CandFit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
