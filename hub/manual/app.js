/* SSM Work · คู่มือการใช้งาน (user manual) — always the last menu, open to every signed-in user.
   Routes (inside the hub): #manual            → getting started + every menu
                            #manual/<section>  → one section (start | home | site-expense | spare-part | punch-list | service-plan | manpower | admin)
   The admin section is shown to admins only. When a menu changes, update its section here. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Each section: id, title, who (who can use it), intro, steps: [[heading, [lines]]], tips: [lines]
  const SECTIONS = [
    { id: "start", title: "เริ่มต้นใช้งาน", emoji: "👋", menu: null,
      who: "ทุกคนที่มีบัญชี SSM Work",
      intro: "เข้าระบบ ตั้งรหัสผ่าน และรู้จักหน้าจอหลักของ SSM Work",
      steps: [
        ["เข้าระบบครั้งแรก", [
          "เปิด <b>ssmwork.vercel.app</b> บนคอมพิวเตอร์หรือมือถือ",
          "ชื่อผู้ใช้ = <b>ชื่อจริงภาษาอังกฤษ . ตัวแรกของนามสกุล</b> เช่น <code>nantana.s</code> (ถ้าชื่อซ้ำ จะเพิ่มตัวถัดไปของนามสกุล)",
          "ใส่รหัสผ่านเริ่มต้นที่ได้จากผู้ดูแลระบบ",
          "ระบบจะให้ <b>ตั้งรหัสผ่านใหม่ทันที</b> อย่างน้อย 8 ตัว และห้ามใช้รหัสเริ่มต้น",
        ]],
        ["หน้าจอหลัก", [
          "แถบซ้าย = เมนูที่คุณมีสิทธิ์ (บนมือถือ/iPad กดปุ่ม ☰ มุมซ้ายบน)",
          "มุมขวาบน = ชื่อของคุณ, <b>เปลี่ยนรหัสผ่าน</b>, <b>ออกจากระบบ</b> (บนมือถืออยู่ในเมนู ☰ ด้านล่าง)",
          "ป้ายข้างเมนู: <b>ทดลอง</b> = ยังเป็นข้อมูลทดสอบ · <b>เร็วๆ นี้</b> = กำลังพัฒนา",
        ]],
        ["เปลี่ยนรหัสผ่าน / ลืมรหัสผ่าน", [
          "กด <b>เปลี่ยนรหัสผ่าน</b> → ใส่รหัสปัจจุบัน → ตั้งรหัสใหม่ 2 ครั้ง → บันทึก",
          "ลืมรหัสผ่าน: แจ้งผู้ดูแลระบบให้กด <b>รีเซ็ตรหัส</b> แล้วเข้าด้วยรหัสเริ่มต้นและตั้งใหม่อีกครั้ง",
        ]],
      ],
      tips: [
        "ไม่เห็นเมนูที่ต้องใช้ = ยังไม่ได้รับสิทธิ์ ขอให้ผู้ดูแลระบบติ๊กเมนูนั้นให้ (มีผลทันที)",
        "เข้าระบบค้างไว้ได้ 12 ชั่วโมง หลังจากนั้นต้องเข้าใหม่",
        "หน้าเว็บแสดงแบบเก่า กด Ctrl+Shift+R (Mac: Cmd+Shift+R)",
        "ช่อง <b>ลูกค้า</b> ทุกเมนูใช้รายชื่อเดียวกันจาก RAK_Master_Customer_List — พิมพ์บางส่วนของชื่อแล้วเลือก <b>ชื่อย่อ</b> จากรายการ",
      ] },

    { id: "home", title: "Home", emoji: "🏠", menu: "home",
      who: "ทุกคน",
      intro: "หน้าแรกรวมเมนูทั้งหมดที่คุณใช้ได้ และนโยบายคุณภาพของบริษัท",
      steps: [
        ["ใช้งาน", [
          "กดการ์ดเมนูใน <b>เมนูของคุณ</b> หรือกดชื่อเมนูในแถบซ้าย เพื่อเข้าเมนูนั้น",
          "การ์ดมีป้ายสถานะ: <b>ใช้งานได้</b> / <b>ทดลองใช้งาน</b> / <b>กำลังพัฒนา</b>",
        ]],
      ],
      tips: ["ถ้าขึ้นว่า “บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าเมนูใด” ให้ติดต่อผู้ดูแลระบบ"] },

    { id: "site-expense", title: "Site Expense", emoji: "💰", menu: "site-expense",
      who: "ดู: หนุ่ม สปาย อาร์ต ดิว บี นิ้ง นิว · สร้างโปรเจค / บันทึก Actual: หนุ่ม สปาย อาร์ต ดิว · อนุมัติ: ดิว หรือ บี · Get Award + แก้งบ: ดิว",
      intro: "ประเมินค่าใช้จ่ายหน้างานจาก Scope of Work → อนุมัติ → เปิด Job เป็น Budget control → บันทึกค่าใช้จ่ายจริง และเทียบ Budget vs Actual",
      note: "เมนูนี้ยังเป็น <b>โหมดทดลอง</b>: ข้อมูลเก็บไว้ในเบราว์เซอร์ของเครื่องนั้นเท่านั้น ยังไม่ส่งเข้าระบบกลาง แถบสีฟ้าด้านบนใช้สลับบทบาทเพื่อทดลองทั้ง flow",
      steps: [
        ["1 · Overview all project", [
          "หน้าแรกของเมนู: Workflow, ตัวเลขสรุป, แท็บ <b>Active / Archived / Trash</b>, ช่องค้นหา และตัวกรองสถานะ",
          "กด <b>New Project</b> → ใส่ IJ no., Project name, Customer, City / Site, จังหวัดปลายทาง (ใช้คิดราคารถ) และ Project Timeline (phase เริ่ม–สิ้นสุด)",
        ]],
        ["2 · Estimate จาก Scope of Work (SC)", [
          "ใส่ค่าใช้จ่ายแยก 6 หมวด: <b>Manpower, Subcontract, Transportation, Accommodation, Travel &amp; Air Ticket, Site Expense</b>",
          "ดูสรุปกำลังคนและค่าใช้จ่ายแยกตาม phase · แนบลิงก์เอกสารหรือไฟล์ได้",
          "กด <b>ส่งขออนุมัติ →</b>",
        ]],
        ["3 · อนุมัติ (ดิว หรือ บี คนใดคนหนึ่ง)", [
          "<b>✓ อนุมัติงบ</b> หรือ <b>↩ ส่งกลับให้ SC แก้</b> พร้อมเหตุผล · ดูได้ใน <b>ประวัติการอนุมัติ</b>",
        ]],
        ["4 · Get Award (ดิว)", [
          "เมื่อได้งาน กด <b>🏆 Get Award</b> → ใส่ Job no. (เช่น 04002026), วันที่เปิด Job, มูลค่างาน / PO",
          "ตั้ง <b>Budget control</b> (ใช้ตัวเลข Estimate ทั้งหมด หรือปรับรายหมวดพร้อมที่มา) แล้วล็อก",
        ]],
        ["5 · Actual record (ทีมหน้างาน)", [
          "บันทึกค่าใช้จ่ายจริงรายวัน: วันที่, หมวด, รายการ, จำนวนเงิน, ใบเสร็จ",
          "SSM ตรวจทีละรายการ",
        ]],
        ["6 · Dashboard", [
          "เทียบ <b>Budget vs Actual</b> รายหมวด: คงเหลือ และ % ใช้ไป · ค้นหาด้วย Project no.",
        ]],
      ],
      tips: ["โปรเจคที่จบแล้วย้ายไป Archived · ลบแล้วไปอยู่ Trash และกู้คืนเป็น Active ได้"] },

    { id: "spare-part", title: "Spare Part", emoji: "⚙️", menu: "spare-part",
      who: "ผู้ที่ได้รับสิทธิ์เมนู Spare Part",
      intro: "ทำรายการอะไหล่แนะนำให้ลูกค้า แยกตามโซน / ระบบ อ้างอิง Job Order, P&ID และ Equipment list จาก Project Pipeline",
      steps: [
        ["ค้นหาโปรเจค", [
          "แถบค้นหาด้านบน: <b>Job No. / Customer / Project name</b>",
          "ตารางแสดงจำนวนรายการอะไหล่ สถานะ และวันที่อัปเดต · กดแถวเพื่อเปิด",
        ]],
        ["สร้างโปรเจคใหม่", [
          "กด <b>＋ Create new project</b> → เลือก Job (จาก Job Order ตั้งแต่ ต.ค. 2026) ระบบดึงลูกค้าและ <b>ขอบเขตงานตาม Job Order</b> มาให้",
          "กด <b>ถัดไป: Equipment →</b> ตรวจรายการ Equipment, Tag (P&amp;ID), Zone, Qty จาก Project Pipeline",
          "กด <b>สร้าง Draft</b>",
        ]],
        ["แก้ไขรายการอะไหล่", [
          "<b>＋ เพิ่มรายการในโซนนี้</b> · <b>＋ เพิ่มโซน</b> · <b>＋ แนบลิงก์เอกสาร</b>",
          "<b>⬆ Import from template</b>: กด Download template (.xlsx) กรอกแล้วเลือกไฟล์ (เลือกได้ว่าจะเพิ่มต่อท้ายรายการเดิม)",
          "<b>✎ แก้ไขรายละเอียด</b> ของโปรเจค แล้วกด <b>บันทึก</b>",
        ]],
        ["ส่งให้ลูกค้า", [
          "เปลี่ยนสถานะ <b>Draft → Review → Issued</b> (Inactive = ไม่ใช้แล้ว)",
          "กด <b>Export for customer</b> ได้ไฟล์ตามแบบฟอร์มลูกค้า พร้อมยอดรวม (excl. VAT)",
        ]],
      ],
      tips: ["ลบโปรเจคได้จากหน้าโปรเจค (ลบโปรเจค) — ตรวจให้แน่ใจก่อน"] },

    { id: "punch-list", title: "Punch List", emoji: "📋", menu: "punch-list",
      who: "ช่วงทดลอง: เปิดให้ ดิว ใช้คนเดียวก่อน · คนอื่นที่มีสิทธิ์เมนูจะเห็นเป็น “เร็วๆ นี้”",
      intro: "Punch list รายโปรเจค ติดตามงานค้างระหว่างติดตั้งจนถึง SAT และส่งมอบ · ส่งรายงานให้ลูกค้า · ใช้ที่มาของปัญหาติดตาม NCR ต่อ",
      note: "เมนูนี้ <b>อยู่ระหว่างทดลอง</b> — รูปแบบและขั้นตอนอาจปรับเปลี่ยน",
      steps: [
        ["สร้าง Punch list ของโปรเจค", [
          "หน้าแรกของเมนูแสดง Punch list ทุกโปรเจค พร้อมสรุป Open / WIP / Check / Done และงานเลยกำหนด · ค้นหาด้วย Job no. / ลูกค้า / ชื่อโปรเจค",
          "กด <b>＋ สร้าง Punch list</b> แล้วเลือกโปรเจคจาก <b>RAK_Master_Project_on_hand</b> (1 โปรเจค = 1 Punch list) · ไม่พบโปรเจค กด “กรอกเอง”",
        ]],
        ["เพิ่มรายการทีละบรรทัด", [
          "พิมพ์รายการในช่องล่างสุดของตาราง เลือกที่มา ผู้รับผิดชอบ Due date แล้วกด <b>Enter</b> — ช่องที่มา / ผู้รับผิดชอบ / Due date จำค่าเดิมไว้ให้บรรทัดต่อไป",
          "<b>＋ แบบละเอียด</b> หรือกดที่แถว เพื่อใส่ระดับความสำคัญ หมวดงาน NCR หมายเหตุ และรูป",
          "เปลี่ยนสถานะได้จากตารางทันที · Done = ใส่ Finished date วันนี้ให้อัตโนมัติ",
        ]],
        ["รูปก่อน / หลังแก้", [
          "ในหน้ารายการ กด <b>＋ เพิ่มรูป</b> ในช่อง Before หรือ After · เลือกได้หลายรูป หรือถ่ายจากมือถือ · ระบบย่อรูปให้ก่อนอัปโหลด",
          "กดรูปเพื่อดูขนาดใหญ่ · ✕ เพื่อลบรูป",
        ]],
        ["ที่มาของปัญหา → NCR", [
          "เลือกกระบวนการที่ทำให้เกิดรายการ: ออกแบบ · จัดซื้อ / Supplier · ผลิต · ประกอบ · ติดตั้ง · ทดสอบ / Commissioning · ลูกค้าขอเพิ่ม · อื่นๆ",
          "ปัญหาจากกระบวนการภายในให้ติ๊ก <b>ต้องออก NCR</b> ใส่ NCR no. และสาเหตุ (Root cause) — ข้อมูลส่วนนี้ไม่แสดงในรายงานลูกค้า",
          "ระดับ: <b>A</b> ต้องแก้ก่อน SAT / ความปลอดภัย · <b>B</b> ต้องแก้ก่อนส่งมอบ · <b>C</b> เล็กน้อย แก้หลังส่งมอบได้",
          "กล่อง “แยกตามที่มาของปัญหา” กดเพื่อกรองรายการตามกระบวนการ",
        ]],
        ["Export ส่งลูกค้า", [
          "<b>🖨 รายงานลูกค้า (PDF)</b> — หัวรายงาน RAK, สรุปสถานะ, ตารางพร้อมรูปก่อน / หลัง, ช่องลงชื่อ → เลือก “บันทึกเป็น PDF”",
          "<b>⬇ Excel ลูกค้า</b> — รูปแบบ PUNCH LIST REPORT ไม่มีข้อมูลภายใน · <b>⬇ Excel ภายใน + NCR</b> — มีที่มา ระดับ NCR และแท็บ By process / NCR follow-up",
          "<b>⬆ Import</b> — นำเข้ารายการจากไฟล์ Punch list เดิม (.xlsx) เช่น แท็บ Punchlist ของ HAM-LET EP500L",
        ]],
      ],
      tips: ["ลบ Punch list ทั้งโปรเจคได้เฉพาะผู้ดูแลระบบ (ปุ่ม ลบ ในหน้าโปรเจค)"] },

    { id: "service-plan", title: "Service Plan", emoji: "📅", menu: "service-plan",
      who: "ผู้ที่ได้รับสิทธิ์เมนู Service Plan · ขอคนได้: ดิว อิ๋ม ปุ๋ม หนุ่ม สปาย อาร์ต แพรวา ไอซ์ ซี กอล์ฟ โจ้ · Confirm / Reject: ดิว กอล์ฟ (ทุกคน) โจ้ (เฉพาะช่างไฟฟ้า)",
      intro: "ปฏิทินงานบริการ IS / SO / IN / WR จาก Google Sheet “ใบร้องขอคนจากฝ่ายผลิต” (แท็บ ใบขอคน 2026)",
      steps: [
        ["ดูปฏิทิน", [
          "เลือกมุมมอง <b>วัน / สัปดาห์ / เดือน / ปี</b> และเลื่อนช่วงเวลาด้วยปุ่มลูกศร",
          "แต่ละงานแสดง <b>สถานะ | ประเภท | ลูกค้า | Job no.</b> และชื่อ SS (หัวหน้าทีม)",
          "สีบอกสถานะ: New / Checking / Confirm / Complete",
        ]],
        ["Dashboard ปริมาณงานและการใช้คน", [
          "เมนู Service Plan เปิดมาที่ <b>Dashboard</b> เป็นหน้าแรก เลือกดูราย <b>เดือน / ปี</b> · กด <b>📅 ปฏิทิน Service Plan</b> เพื่อเข้าปฏิทิน และ <b>‹ Dashboard</b> เพื่อกลับ",
          "ตัวเลขหลัก: จำนวนงาน · วันงาน (1 งาน × 1 วัน) · Man-day (คน × วัน) · จำนวนคนที่ออกงาน · งานรอนัดวัน",
          "กราฟปริมาณงานรายเดือน แยกประเภทงาน ลูกค้า การใช้รถ และตาราง <b>การใช้คน</b> (% ใช้งาน = man-day ÷ วันทำงาน จ.–ส. ของช่วงนั้น)",
          "นับเฉพาะงาน Service ในปฏิทินนี้ งานในโรงงานดูที่เมนู Manpower · กดชื่อคนหรือลูกค้าเพื่อค้นงานในปฏิทิน",
        ]],
        ["ดูรายละเอียดงาน", [
          "กดที่งาน → Working description และทะเบียนรถ",
        ]],
        ["ขอคน (ทดลองใช้)", [
          "กด <b>+ ขอคน</b> — ผู้ขอคือชื่อที่ login เข้ามา",
          "เลือกประเภท <b>IS / SO / IN / WR / IJ / JO</b> กรอกชื่อลูกค้า ชื่องาน ช่วงวัน และเลือกทะเบียนรถ",
          "เลือกคนได้ 2 แบบ: <b>ตามวัน</b> (วันนั้นใครว่างบ้าง) หรือ <b>ตามคน</b> (คนนี้ว่างวันไหน) — ดูจากแผนในเมนูวางแผนกำลังคน",
          "สี: เขียว = ว่าง · ฟ้า = มีคำขออื่นรอ PC · ส้ม = ติดจอง · แดง = มีงานยืนยันแล้ว · เทา = ลา (เลือกไม่ได้) · งาน Service ขอได้ครบ 7 วัน รวมวันอาทิตย์และวันหยุด",
          "คนว่าง → <b>ขอจอง</b> · คนที่งานชน → ระบบเตือนและส่งเป็น <b>ขอสลับคน</b> (งานที่ยืนยันแล้วต้องใส่เหตุผล)",
          "กด <b>ส่งคำขอให้ PC Confirm</b> แล้วติดตามสถานะรายคนได้ที่ <b>คำขอคน / Confirm → คำขอของฉัน</b>",
        ]],
        ["งานรอนัดวัน (ยังไม่ได้วันจากลูกค้า)", [
          "กด <b>+ ขอคน</b> กรอกประเภท ลูกค้า ชื่องาน รายละเอียด แล้วใส่ <b>คาดว่าจะเข้างานประมาณ</b> → กด <b>บันทึกเป็นงานรอนัดวัน</b> (ไม่ต้องเลือกวันและคน)",
          "งานจะอยู่ในแท็บ <b>รอนัดวัน</b> ของหน้าคำขอคน และกล่อง <b>ยังไม่ระบุวันเข้างาน</b> ใต้ปฏิทิน — ทุกคนที่เข้า Service Plan เห็น · ยังไม่ขึ้น Manpower board",
          "ก่อนถึงวันที่คาดไว้ <b>3 สัปดาห์</b> จะมีแถบเตือนสีม่วงด้านบนของทุกหน้า กดที่ชื่องานเพื่อเปิด",
          "เมื่อลูกค้ายืนยันวัน: เปิดงาน → <b>ใส่วัน + เลือกคน / แก้ไข</b> → ส่งคำขอให้ PC Confirm",
        ]],
        ["Confirm / Reject (ดิว กอล์ฟ · โจ้เฉพาะช่างไฟฟ้า)", [
          "เปิด <b>คำขอคน / Confirm</b> ใน Service Plan หรือปุ่ม <b>คำขอคน</b> บน board วางแผนกำลังคน — สถานะเดียวกันทั้งสองที่",
          "Confirm / Reject ได้ทีละคนหรือทั้งคำขอ · Confirm แล้วระบบลงงาน Service ใน Manpower board ให้ทันที ทุกวันในช่วง (ยกเว้นวันลา) · โจ้เห็นปุ่มเฉพาะช่างไฟฟ้า (EE)",
          "คำขอสลับคน: เมื่อ Confirm งานเดิมของคนนั้นในวันดังกล่าวจะถูกแทนที่ (ดูย้อนหลังได้ในประวัติการแก้ไข)",
        ]],
        ["ข้อมูลอัปเดต", [
          "เมื่อเพิ่มหรือแก้แถวในใบขอคน ปฏิทินจะอัปเดตเอง · กด <b>⟳ รีเฟรชข้อมูล</b> เพื่อโหลดล่าสุด",
        ]],
      ],
      tips: ["แก้ข้อมูลงานที่ Google Sheet ใบขอคนเท่านั้น หน้าเว็บนี้ใช้ดู", "แสดงเฉพาะประเภท IS / SO / IN / WR ที่สถานะ New, Checking, Confirm, Complete"] },

    { id: "manpower", title: "Manpower", emoji: "👷", menu: "manpower",
      who: "ดู: ทุกคนที่ได้รับสิทธิ์เมนู · ลงงาน / แก้ไข: SC (อาร์ต หนุ่ม สปาย), PC (กอล์ฟ แพร ไอซ์ ซี), เอ๋, SSM (ดิว) · Confirm Manpower (งานจอง): ทุกคนที่แก้ได้ ยกเว้นสปาย · Milestone: ดิว กอล์ฟ เอ๋",
      intro: "Planning Board คน × วัน แทน Google Sheet ตารางงานและวันหยุดช่าง — ใครอยู่งานไหน ลา หรือว่าง",
      steps: [
        ["อ่าน Planning Board", [
          "แถว = คน แยกหน่วยงาน <b>ME / PP / EE / PC / SC</b> · คอลัมน์ = วัน",
          "ซูม <b>สัปดาห์ / เดือน / 3 เดือน</b> · กด <b>วันนี้</b> เพื่อกลับมาวันนี้ · <b>⛶ เต็มจอ</b> (ออกด้วย Esc)",
          "สีตามโปรเจค · <b>ลายทาง = จอง</b> (ยังไม่ Confirm) · H / PH / ลา = วันหยุดหรือวันลา",
          "แถวบนสุด = <b>Milestone</b> ของโปรเจค · ด้านล่างมีสรุปรายวัน และ legend man-day (กดเพื่อกรอง)",
          "ป้าย <b>SP</b> = งานจาก Service Plan ที่ Confirm แล้ว · <b>!</b> = ชนกับงานอื่นหรือวันลา",
        ]],
        ["กรองข้อมูล", [
          "เลือก <b>ลูกค้า</b> แล้วเลือก <b>ชื่องาน</b> ของลูกค้านั้น · กรองชื่อคน · ค้นหา · <b>ล้างตัวกรอง</b>",
        ]],
        ["ลงงาน (ผู้มีสิทธิ์แก้ไข)", [
          "กดช่องวันที่ของคนนั้น (ลากเพื่อเลือกหลายวัน หรือเลือกหลายคนพร้อมกันได้)",
          "ใส่ ลูกค้า, ชื่องาน (เลือกเดิมหรือพิมพ์ใหม่), Job no., ประเภทงาน <b>Fab / Assembly / Install / Service / Other</b>, รายละเอียด, ถึงวันที่ (ข้ามวันอาทิตย์ วันหยุด และวันลาให้อัตโนมัติ)",
          "ติ๊ก <b>จอง</b> ถ้ายังไม่ยืนยัน แล้วกด <b>บันทึก</b> · ลบงานวันนั้นได้จากหน้าต่างเดียวกัน",
        ]],
        ["Confirm งานจอง", [
          "กดช่องที่เป็น “จอง” → <b>Confirm Manpower</b> เลือก วันนี้ / ทั้งช่วงของคนนี้ / ทั้งทีม",
        ]],
        ["วันลา และข้อมูลหลัก", [
          "<b>บันทึกวันลา</b>: ลาป่วย / ลาพักร้อน / ลากิจ",
          "<b>ข้อมูลหลัก</b>: รายชื่อคน (รหัสพนักงาน หน่วยงาน ตำแหน่ง ลำดับ ทำงานอยู่), โปรเจค (สี), วันหยุด",
          "<b>ประวัติการแก้ไข</b>: ใคร ทำอะไร เมื่อไหร่ ล่าสุดอยู่บน",
          "<b>◆ Milestone</b> (ดิว กอล์ฟ เอ๋): กดช่องแถว Milestone เพื่อเพิ่ม แก้ หรือลบ",
          "<b>คำขอคน</b>: ช่องกรอบประสีส้มมีป้าย <b>ขอ</b> = มีคำขอจาก Service Plan รอ PC · ป้าย <b>✓</b> = Confirm จากคำขอแล้ว · กดช่องหรือปุ่ม <b>คำขอคน</b> เพื่อเปิดคำขอ (Confirm / Reject: ดิว กอล์ฟ · โจ้เฉพาะช่างไฟฟ้า)",
        ]],
      ],
      tips: ["ทุกการแก้ไขถูกบันทึกในประวัติการแก้ไข", "ไม่ต้องลงงานจาก Service Plan ซ้ำ — งานที่ Confirm / Complete ในใบขอคนจะขึ้นบน board ให้เอง"] },

    { id: "admin", title: "ผู้ดูแลระบบ", emoji: "🛡️", menu: null, adminOnly: true,
      who: "ผู้ดูแลระบบเท่านั้น",
      intro: "จัดการบัญชีผู้ใช้และสิทธิ์เข้าแต่ละเมนู ที่ปุ่ม <b>จัดการผู้ใช้</b> มุมขวาบน",
      steps: [
        ["ภาพรวม", [
          "กล่องตัวเลขด้านบน: ทั้งหมด / รอตั้งรหัสครั้งแรก / ตั้งรหัสแล้ว / ปิดใช้งาน / ผู้ดูแล (ติดอยู่ด้านบนตอนเลื่อน)",
          "ค้นหาด้วยชื่อผู้ใช้ ชื่อ หรือรหัสพนักงาน",
        ]],
        ["ให้สิทธิ์เมนู", [
          "ติ๊กเมนูที่ให้เข้าได้ในคอลัมน์เมนูของแต่ละคน — <b>มีผลทันที</b> · บัญชีใหม่เริ่มต้นไม่มีสิทธิ์เมนูใด",
          "Site Expense กำหนดสิทธิ์ตามรายชื่อ (ตามรายชื่อ) ไม่ใช่ช่องติ๊ก",
        ]],
        ["จัดการบัญชี", [
          "<b>รีเซ็ตรหัส</b> (กลับเป็นรหัสเริ่มต้น และบังคับตั้งใหม่) · <b>ตั้งเป็นผู้ดูแล</b> / ถอด · <b>ปิดใช้งาน</b> / เปิด · <b>ลบ</b> · ✎ แก้ชื่อผู้ใช้",
          "<b>รีเซ็ตผู้ใช้ทั้งหมดจาก RAK_Employee</b>: ลบบัญชีทั้งหมดแล้วสร้างใหม่จากรายชื่อพนักงานใน Supabase — สิทธิ์เมนูเดิมจะหายทั้งหมด ใช้เมื่อจำเป็นเท่านั้น",
        ]],
      ],
      tips: ["บัญชี Super admin ปิดใช้งานหรือลบไม่ได้"] },
  ];

  const CSS = `
.mn{display:grid;gap:18px}
.mn-chips{display:flex;flex-wrap:wrap;gap:8px}
.mn-chip{display:inline-flex;align-items:center;gap:6px;text-decoration:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font-size:13px;color:#4a5260}
.mn-chip:hover{border-color:#f0b9b9;color:var(--rak)}
.mn-chip[aria-current="true"]{background:var(--blush);border-color:#f3c2c2;color:var(--rak);font-weight:600}
.mn-chip .lk{font-size:10.5px;color:var(--muted)}
.mn-card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px 24px;display:grid;gap:14px;scroll-margin-top:90px}
.mn-head{display:flex;gap:14px;align-items:flex-start}
.mn-em{display:grid;place-items:center;flex:none;width:46px;height:46px;border-radius:13px;background:var(--blush);font-size:22px}
.mn-head h2{margin:0;font-size:19px;font-weight:600}
.mn-head p{margin:2px 0 0;color:var(--muted);font-size:13.5px}
.mn-who{font-size:12.5px;color:#4a5260;background:#f7f8fa;border-radius:8px;padding:8px 12px}
.mn-who b{color:var(--ink)}
.mn-note{font-size:13px;background:#eef4ff;color:#2f5aa8;border-radius:8px;padding:9px 12px}
.mn-lock{font-size:12.5px;background:var(--amber-soft);color:var(--amber);border-radius:8px;padding:8px 12px}
.mn-steps{display:grid;gap:12px;margin:0;padding:0;list-style:none;counter-reset:st}
.mn-steps>li{display:grid;grid-template-columns:28px 1fr;gap:10px;counter-increment:st}
.mn-steps>li::before{content:counter(st);display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--rak);color:#fff;font-size:12.5px;font-weight:600}
.mn-steps h4{margin:2px 0 4px;font-size:14.5px;font-weight:600}
.mn-steps ul{margin:0;padding-left:18px;display:grid;gap:3px;font-size:13.5px;color:#3b4049}
.mn-tips{margin:0;padding:10px 14px 10px 32px;background:#fffaf0;border:1px dashed #ecd6a6;border-radius:10px;font-size:13px;color:#6b5320;display:grid;gap:3px}
.mn code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:#f1f3f6;border-radius:4px;padding:1px 5px}
@media (max-width:600px){.mn-card{padding:16px}.mn-head h2{font-size:17px}}
`;

  const me = () => (typeof ME !== "undefined" && ME) || null;
  const isAdmin = () => !!(me() && me().role === "admin");
  const canOpen = s => !s.menu || s.menu === "home" || isAdmin() || !!(me() && (me().modules || []).includes(s.menu));

  function card(s) {
    const locked = !canOpen(s);
    return `<section class="mn-card" id="mn-${s.id}">
      <div class="mn-head"><span class="mn-em" aria-hidden="true">${s.emoji}</span><div><h2>${esc(s.title)}</h2><p>${s.intro}</p></div></div>
      <div class="mn-who"><b>ใครใช้ได้:</b> ${esc(s.who)}</div>
      ${locked ? `<div class="mn-lock">🔒 คุณยังไม่มีสิทธิ์เข้าเมนูนี้ — อ่านคู่มือได้ ถ้าต้องใช้งานให้ขอสิทธิ์จากผู้ดูแลระบบ</div>` : ""}
      ${s.note ? `<div class="mn-note">${s.note}</div>` : ""}
      <ol class="mn-steps">${s.steps.map(([h, lines]) => `<li><div><h4>${esc(h)}</h4><ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul></div></li>`).join("")}</ol>
      ${s.tips && s.tips.length ? `<ul class="mn-tips">${s.tips.map(t => `<li>💡 ${t}</li>`).join("")}</ul>` : ""}
    </section>`;
  }

  function mount(root, sub) {
    if (!document.getElementById("mn-css")) {
      const st = document.createElement("style"); st.id = "mn-css"; st.textContent = CSS; document.head.appendChild(st);
    }
    const list = SECTIONS.filter(s => !s.adminOnly || isAdmin());
    const cur = list.some(s => s.id === sub) ? sub : "";
    const chips = `<nav class="mn-chips" aria-label="หัวข้อคู่มือ"><a class="mn-chip" href="#manual" aria-current="${cur ? "false" : "true"}">📖 ทั้งหมด</a>${
      list.map(s => `<a class="mn-chip" href="#manual/${s.id}" aria-current="${s.id === cur}">${s.emoji} ${esc(s.title)}${canOpen(s) ? "" : ' <span class="lk">🔒</span>'}</a>`).join("")
    }</nav>`;
    root.innerHTML = `<div class="mn">${chips}${(cur ? list.filter(s => s.id === cur) : list).map(card).join("")}</div>`;
  }

  window.Manual = { mount, SECTIONS };
})();
