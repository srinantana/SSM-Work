-- SSM Work · Site Team migration 004 (18 Nov 2026) — run once in Supabase SQL Editor.
-- Safety / skill certificates per person (from the sheet "บันทึกอบรมความปลอดภัย_RAK_Certificate"), kept with จป (อิ๋ม).
-- One row = one certificate of one person. holder_name is the Thai name as on the certificate; worker_id / person_id
-- link it to the Site Team list when known (the app also matches by name). Office staff who are not on the site team
-- can still be kept here. RLS on, no policies: only the hub middleware (service key) reads / writes. Safe to run again.

create table if not exists public.site_team_certs (
  id           bigserial primary key,
  course       text not null,                 -- SO_PRO, SO_MGR, SO_SUP, SAFE6, CONFINED, CRANE_FIXED, CRANE_MOBILE, SCAFFOLD, HEIGHT, ELECTRIC, FORKLIFT, FIRE_BASIC (ดับเพลิงขั้นต้น), OTHER
  course_name  text,                          -- free name when course = OTHER
  holder_name  text not null,
  worker_id    text,                          -- mp_workers.id
  person_id    bigint,                        -- site_team_people.id (people not on the Manpower board)
  cert_no      text,
  issue        date,                          -- เริ่มใช้ Cer.
  expiry       date,                          -- วันหมดอายุ Cer.
  no_expiry    boolean not null default false,-- ไม่มีหมดอายุ (จป., ความปลอดภัย 6 ชม.)
  renew_due    date,                          -- วันที่ต้องต่อ Cer. (blank = 90 days before expiry)
  review_date  date,                          -- Cer.ทบทวน (อับอากาศ)
  status       text not null default 'active',-- active / registered (ขึ้นทะเบียน) / expired / resign
  link         text,                          -- Google Drive folder / file
  note         text,
  renew_status text,                          -- '' / planned (ต้องต่อ — รอนัด) / booked (นัดอบรมแล้ว) / done (ต่อแล้ว)
  renew_date   date,                          -- วันนัดอบรม / ต่ออายุ
  renew_note   text,
  updated_by   text,
  updated_at   timestamptz not null default now()
);
create index if not exists site_team_certs_course on public.site_team_certs (course);
alter table public.site_team_certs enable row level security;
