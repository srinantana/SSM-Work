-- SSM Work · Candidates — public written test for job applicants + internal review / scoring.
-- Run once in the Supabase project used by ssmwork.vercel.app: Dashboard → SQL Editor → New query → Run.
-- Personal data of applicants (PDPA): only the hub middleware (service key) reads and writes these tables —
-- RLS is on and there are no policies. Rejected / withdrawn applicants are deleted 90 days after the decision.
-- The public form (/apply) only ever receives cand_tests.content — the rubric stays internal.

create table if not exists public.cand_tests (
  id          bigint generated always as identity primary key,
  slug        text not null unique,             -- /apply#<slug>
  title       text not null,                    -- position, e.g. Site Control
  open        boolean not null default true,    -- accepting applications
  trial       boolean not null default true,    -- โหมดทดลองใช้: ข้อมูลล้างได้ก่อนเปิดใช้จริง
  content     jsonb not null,                   -- public: intro, rules, context, questions
  rubric      jsonb not null default '{}'::jsonb, -- internal: scoring dimensions, what to look for, follow-up questions
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.candidates (
  id            bigint generated always as identity primary key,
  test_id       bigint references public.cand_tests(id),
  position      text,
  name          text not null,
  phone         text,
  email         text,
  line_id       text,
  answers       jsonb not null default '{}'::jsonb,   -- {"1": "...", "2": "..."}
  ai_note       text,                                 -- what the applicant used AI / research tools for
  consent_at    timestamptz not null,                 -- PDPA consent
  consent_ver   text,
  started_at    timestamptz,                          -- when the applicant opened the test (from the browser)
  submitted_at  timestamptz not null default now(),
  ip_hash       text,                                 -- hashed, only for spam limits
  status        text not null default 'new',          -- new | screening | interview | interviewed | offer | hired | rejected | withdrawn
  status_at     timestamptz not null default now(),
  files         jsonb not null default '[]'::jsonb,   -- [{p (storage) | url (Google Drive), name, at, by}]
  note          text,
  seen_by       jsonb not null default '[]'::jsonb
);
create index if not exists candidates_submitted on public.candidates (submitted_at desc);

create table if not exists public.cand_scores (
  id            bigint generated always as identity primary key,
  candidate_id  bigint not null references public.candidates(id) on delete cascade,
  assessor      text not null,                        -- username
  assessor_name text,
  scores        jsonb not null default '{}'::jsonb,   -- {"1": [5,4,3,4], ...} — 4 dimensions × 0–5 per question
  total         numeric(5,1),
  strengths     text,
  concerns      text,                                 -- ข้อกังวลและคำถามสำหรับสัมภาษณ์
  updated_at    timestamptz not null default now(),
  unique (candidate_id, assessor)
);

create table if not exists public.cand_log (
  id            bigint generated always as identity primary key,
  candidate_id  bigint references public.candidates(id) on delete cascade,
  at            timestamptz not null default now(),
  by            text,
  action        text,
  detail        text
);

alter table public.cand_tests add column if not exists trial boolean not null default true;   -- added 20 Nov 2026 (โหมดทดลองใช้)
alter table public.candidates add column if not exists cv_text text;    -- added 20 Nov 2026: ข้อความจาก CV สำหรับวิเคราะห์ความเข้ากันได้
alter table public.candidates add column if not exists fit jsonb;       -- added 20 Nov 2026: ผลวิเคราะห์ CV × โครงสร้าง SSM (hub/candidates/fit.js)

-- Interview notes (added 20 Nov 2026): one row per note; everyone with the menu writes, author or ดิว / นุ่น edit / delete.
create table if not exists public.cand_notes (
  id             bigint generated always as identity primary key,
  candidate_id   bigint not null references public.candidates(id) on delete cascade,
  interview_date date not null default current_date,
  round          text,                                 -- รอบ 1 / รอบ 2 / โทร / หน้างาน …
  panel          text,                                 -- ผู้ร่วมสัมภาษณ์
  note           text not null,
  recommend      text,                                 -- hire | consider | no
  author         text not null,                        -- username
  author_name    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cand_notes_cand on public.cand_notes (candidate_id);
alter table public.cand_notes enable row level security;

alter table public.cand_tests  enable row level security;
alter table public.candidates  enable row level security;
alter table public.cand_scores enable row level security;
alter table public.cand_log    enable row level security;

-- private bucket for CV / Resume (PDF or image, max 5 MB) — attached by ดิว / นุ่น only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidates', 'candidates', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Site Control test Rev 01 (from RAK_Site_Control_Candidate_Test.docx + RAK_Site_Control_Assessment_Guide.docx)
insert into public.cand_tests (slug, title, open, content, rubric)
values ('site-control', 'Site Control', true, $j${"title": "Site Control", "org": "RAK Engineering", "rev": "Rev 01", "intro": "แบบทดสอบนี้ใช้ประเมินแนวคิดในการบริหารงานติดตั้งและประสานงานหน้างาน ไม่มีคำตอบตายตัว ให้ตอบด้วยภาษาของตนเอง โดยเขียนเป็นข้อความ ตาราง หรือรายการขั้นตอนก็ได้ เน้นอธิบายว่าจะทำอะไร เพราะอะไร และจะประสานใคร", "rules": ["เวลาที่แนะนำ 60–75 นาที จำนวน 5 ข้อ ข้อละ 20 คะแนน รวม 100 คะแนน", "ความยาวคำตอบรวมไม่เกิน 5 หน้า — พิมพ์คำตอบแยกในช่องของแต่ละข้อ", "หากข้อมูลไม่เพียงพอ ให้ระบุสมมติฐานและข้อมูลที่ต้องการเพิ่มเติม", "ไม่จำเป็นต้องเชี่ยวชาญระบบชุบผิวโดยตรง แต่ต้องอธิบายเหตุผลในการตัดสินใจ", "หากใช้เครื่องมือช่วยค้นคว้าหรือ AI ให้ระบุว่าใช้ช่วยส่วนใด (มีช่องให้ระบุท้ายแบบทดสอบ) และต้องสามารถอธิบายคำตอบของตนเองในการสัมภาษณ์ได้"], "context": ["RAK Engineering ออกแบบ ผลิต และติดตั้งระบบ Surface Treatment พร้อมระบบท่อ ระบบน้ำ ระบบระบายอากาศ และระบบควบคุม โดยทีม Site & Service Management ประสานงานกับฝ่ายโครงการ ฝ่ายวิศวกรรม และฝ่ายผลิต เพื่อส่งมอบงานตามมาตรฐาน เวลา และงบประมาณ", "ในโจทย์นี้ SSM หมายถึงทีมบริหารงานติดตั้งและบริการ ส่วน TPM เป็นผู้ประสานด้านเทคนิคและแบบ และ Production Control เป็นผู้ประสานทรัพยากรฝ่ายผลิต สถานการณ์ทั้งหมดเป็นสถานการณ์สมมติสำหรับการประเมิน"], "questions": [{"no": 1, "title": "วางแผนก่อนเข้าติดตั้งให้พร้อมจริง", "points": 20, "scenario": "RAK กำลังจะเข้าติดตั้งระบบ Surface Treatment ที่โรงงานลูกค้าในอีก 7 วัน โดยมีระยะเวลาติดตั้งตามแผน 10 วัน ขอบเขตงานประกอบด้วยการตั้งถัง เดินท่อ PP ติดตั้ง Duct เดินสายไฟ และทดสอบระบบ", "facts": ["ถังและอุปกรณ์หลักผลิตเสร็จแล้ว แต่ยังไม่ยืนยันรายการจัดส่งครบถ้วน", "แบบเดินท่อฉบับล่าสุดอยู่ระหว่างยืนยันกับ TPM", "ฝ่ายผลิตแจ้งว่าสามารถจัดช่างให้ได้ แต่ยังไม่ยืนยันจำนวนและทักษะ", "ลูกค้ายังไม่ยืนยันความพร้อมของพื้นที่และไฟฟ้าสำหรับติดตั้ง"], "ask": "หากคุณได้รับมอบหมายให้ควบคุมและประสานงาน Site นี้ คุณจะเตรียมงานอย่างไรตั้งแต่วันนี้จนถึงวันเข้าติดตั้ง?", "parts": ["เรื่องที่ต้องตรวจสอบและจัดลำดับความสำคัญ", "แผนงานเบื้องต้น พร้อมผู้ที่ต้องประสานและกำหนดเวลายืนยัน", "เงื่อนไขที่ใช้ตัดสินว่า \"พร้อมเข้าหน้างาน\" และสิ่งที่จะทำหากยังไม่พร้อม"]}, {"no": 2, "title": "เมื่อแผนติดตั้งเริ่มล่าช้า", "points": 20, "scenario": "วันที่ 3 ของการติดตั้ง พบว่า", "facts": ["งานเดินท่อต้องรอข้อต่อสำคัญ ซึ่งจะมาถึงอีก 2 วัน", "ช่าง 2 คนจากทีม 6 คนถูกขอให้กลับไปช่วยงานเร่งด่วนที่โรงงาน RAK", "ลูกค้ายืนยันว่าต้องพร้อมทดสอบระบบในวันที่ 10 ตามเดิม", "งบค่าใช้จ่ายหน้างานมีจำกัด และการทำ OT ต้องขออนุมัติ"], "ask": "คุณจะบริหารสถานการณ์นี้อย่างไร?", "parts": ["แสดงแผนดำเนินการใน 24 ชั่วโมงแรก", "เปรียบเทียบอย่างน้อย 2 ทางเลือก พร้อมผลกระทบต่อเวลา ค่าใช้จ่าย คุณภาพ และกำลังคน แล้วเลือกแนวทางที่เสนอให้ Site & Service Manager ตัดสินใจ", "ระบุข้อมูลที่ต้องขอเพิ่มเติมก่อนยืนยันกำหนดเสร็จกับลูกค้า"]}, {"no": 3, "title": "ความปลอดภัยและคุณภาพภายใต้แรงกดดัน", "points": 20, "scenario": "ระหว่างติดตั้ง Duct บนที่สูง คุณพบว่าทีมผู้รับเหมาช่วงจัดพื้นที่ทำงานและอุปกรณ์ป้องกันการตกไม่พร้อม ขณะเดียวกัน ตำแหน่ง Support บางจุดไม่ตรงกับแบบล่าสุด", "facts": ["หัวหน้าช่างเสนอว่า \"ติดตั้งต่อไปก่อน เดี๋ยวแก้ทีหลัง\"", "ลูกค้าขอให้เร่งทำให้เสร็จภายในวันนี้ เพราะจะกระทบแผนเปิดพื้นที่ผลิต"], "ask": "คุณจะทำอะไรทันที และจะดำเนินการต่ออย่างไรจนสามารถกลับมาทำงานได้?", "parts": ["งานใดต้องหยุดหรือจำกัด และเหตุผล", "วิธีประสานหัวหน้าช่าง ผู้รับเหมาช่วง TPM และลูกค้า", "หลักฐานหรือบันทึกที่ต้องจัดทำ", "เงื่อนไขและผู้ที่ต้องตรวจยืนยันก่อนเริ่มงานต่อ"]}, {"no": 4, "title": "ลูกค้าขอเพิ่มงานแต่ยังไม่มีอนุมัติ", "points": 20, "scenario": "ลูกค้าขอให้ย้ายตำแหน่งท่อและเพิ่มจุดต่อใช้งาน 2 จุด โดยบอกว่า \"ทำเพิ่มให้ก่อน ค่าใช้จ่ายค่อยคุยกับฝ่ายขายทีหลัง\"", "facts": ["คุณประเมินเบื้องต้นว่าจะใช้ช่าง 2 คนเพิ่มอีก 1 วัน และต้องซื้อวัสดุเพิ่ม", "ยังไม่ทราบผลกระทบต่อแบบและการทดสอบระบบ", "ลูกค้ายืนยันว่าเคยแจ้งความต้องการนี้กับฝ่ายขายแล้ว"], "ask": "คุณจะจัดการคำขอนี้อย่างไร เพื่อรักษาความสัมพันธ์กับลูกค้าและควบคุมขอบเขตงาน?", "parts": ["ระบุขั้นตอนตรวจสอบ ประเมินผลกระทบ และขอการตัดสินใจ", "เขียนข้อความสั้นถึงลูกค้าไม่เกิน 150 คำ เพื่ออธิบายแนวทางดำเนินการอย่างสุภาพและชัดเจน"]}, {"no": 5, "title": "รายงานและส่งมอบงานอย่างตรวจสอบได้", "points": 20, "scenario": "ก่อนวันส่งมอบ 1 วัน คุณได้รับข้อมูลดังนี้", "facts": ["งานติดตั้งเครื่องกลเสร็จแล้ว แต่ยังไม่ได้ตรวจร่วมกับลูกค้า", "ทดสอบ I/O ผ่าน 18 จาก 20 จุด อีก 2 จุดยังรอแก้ไข", "พบรอยรั่วที่ข้อต่อท่อ 1 จุด", "ฝาครอบอุปกรณ์ 2 ชิ้นยังไม่ติดตั้ง", "ลูกค้าขอให้ลงนามส่งมอบ เพราะต้องเริ่มใช้งานวันรุ่งขึ้น", "ทีมช่างมีกำหนดออกจาก Site ในวันถัดไป"], "ask": "จัดทำรายงานสั้นถึง Site & Service Manager เพื่อใช้ตัดสินใจเรื่องการส่งมอบ โดยมี", "parts": ["สถานะงานที่แยกชัดเจนระหว่าง \"ติดตั้งเสร็จ\" \"ทดสอบผ่าน\" และ \"ลูกค้าตรวจรับ\"", "Punch List พร้อมลำดับความสำคัญ ผู้รับผิดชอบที่เสนอ และกำหนดแก้ไข", "ข้อเสนอว่าจะส่งมอบได้หรือไม่ ภายใต้เงื่อนไขใด และต้องขอข้อมูลเพิ่มเติมอะไร", "แผนติดตามงานค้างและการจัดกำลังคนหลังวันส่งมอบ"]}]}$j$::jsonb, $j${"note": "ใช้ประกอบการประเมินข้อสอบข้อเขียนก่อนสัมภาษณ์ โดยพิจารณาหลักฐานในคำตอบและเหตุผลของผู้สมัคร ไม่เน้นความสวยงามของภาษา", "dims": ["การระบุประเด็นสำคัญ", "ความเป็นไปได้ของแผน", "การประสานงานและขอบเขตอำนาจ", "เหตุผลพร้อมวิธีติดตามผล"], "dimShort": ["ประเด็น", "แผน", "ประสานงาน", "เหตุผลและติดตาม"], "scale": ["0 = ไม่ตอบหรือไม่เกี่ยวข้อง", "1 = กล่าวกว้างและมีข้อบกพร่องสำคัญ", "2 = เห็นบางประเด็นแต่ยังขาดขั้นตอน", "3 = ครอบคลุมประเด็นหลักและพอปฏิบัติได้", "4 = ชัดเจนพร้อมเหตุผลและผู้รับผิดชอบ", "5 = ครบถ้วน เชื่อมผลกระทบ และมีวิธีตรวจยืนยันหรือติดตามผล"], "questions": [{"no": 1, "title": "เตรียมงาน", "want": "ตรวจความพร้อมทั้งแบบ คน ของ พื้นที่ และเอกสาร มีเจ้าของงาน กำหนดเวลา และเกณฑ์พร้อมเข้าติดตั้ง", "probe": "เริ่มงานตามวันนัดโดยไม่ตรวจข้อจำกัด หรือทำเพียง Checklist ที่ไม่มีคนติดตาม"}, {"no": 2, "title": "แก้แผนล่าช้า", "want": "เข้าใจลำดับงานและงานที่ทำคู่ขนานได้ เปรียบเทียบทางเลือก ประสานทรัพยากร และขออนุมัติก่อนเพิ่มค่าใช้จ่าย", "probe": "ใช้ OT เป็นคำตอบเดียว หรือรับปากกำหนดเสร็จโดยไม่มีข้อมูลรองรับ"}, {"no": 3, "title": "Safety และ Quality", "want": "หยุดงานส่วนที่ไม่ปลอดภัย ควบคุมพื้นที่ ขอข้อยุติทางเทคนิค และกำหนดเงื่อนไขเริ่มงานต่อ", "probe": "ยอมทำต่อเพราะลูกค้าเร่ง หรือแก้แบบเองโดยไม่ผ่านผู้รับผิดชอบ"}, {"no": 4, "title": "ควบคุมขอบเขตงาน", "want": "ตรวจขอบเขตเดิม บันทึกคำขอ ประเมินผลต่อราคา เวลา และแบบ พร้อมสื่อสารโดยไม่กล่าวโทษฝ่ายอื่น", "probe": "ทำเพิ่มก่อนโดยไม่บันทึก หรือปฏิเสธลูกค้าทันทีโดยไม่ตรวจสอบ"}, {"no": 5, "title": "รายงานและส่งมอบ", "want": "รายงานตามข้อเท็จจริง แยกสถานะงาน ประเมินความสำคัญของข้อบกพร่อง และมีแผนปิดงานที่ติดตามได้", "probe": "รายงานว่าเสร็จ 100% เพราะติดตั้งครบ หรือยอมส่งมอบโดยไม่พิจารณาผลของงานค้าง"}], "usage": "ใช้ข้อสอบเป็นข้อมูลประกอบการสัมภาษณ์ และให้ผู้สมัครอธิบายหรือปรับคำตอบเมื่อเงื่อนไขเปลี่ยน ประเด็นความปลอดภัย การรายงานตามจริง และการทำงานเกินอำนาจควรถามให้ชัดเจน แม้คะแนนรวมจะสูง", "scope": "ชุดนี้เน้น Site Control ที่ช่วยวางแผนและควบคุมหน้างาน ส่วนงาน PR/ERP, Packing List และ Logistics เป็นบทบาทสนับสนุนของ SC ตามโครงสร้างทีม จึงประเมินผ่านการประสานงานในข้อ 1 เป็นหลัก"}$j$::jsonb)
on conflict (slug) do update set title = excluded.title, content = excluded.content, rubric = excluded.rubric, updated_at = now();
