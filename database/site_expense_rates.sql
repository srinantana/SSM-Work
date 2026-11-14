-- Site Expense master rates — generated from Master_rate_site_expense.xlsx (14 Nov 2026) by database/rates/gen_rates.py

-- Run once in the SSM Work Supabase SQL editor. Re-running replaces the rows (truncate + insert).

begin;

create table if not exists se_rate_manday (grp text primary key, rate_per_day numeric not null, ot_rate_per_hour numeric not null, updated_at timestamptz default now());
create table if not exists se_rate_accommodation (acc_type text not null, period text not null check (period in ('Daily','Monthly')), rate numeric not null, updated_at timestamptz default now(), primary key (acc_type, period));
create table if not exists se_rate_transport_zone (province text primary key, zone text not null, distance_band text, zone_desc text, note text);
create table if not exists se_rate_transport (transport_type text primary key, zone_a numeric, zone_b numeric, zone_c numeric, zone_d numeric, zone_e numeric, unit text, remarks text, updated_at timestamptz default now());
create table if not exists se_rate_domestic_travel (travel_type text not null, destination text not null, budget_rate numeric not null, updated_at timestamptz default now(), primary key (travel_type, destination));
truncate se_rate_manday, se_rate_accommodation, se_rate_transport_zone, se_rate_transport, se_rate_domestic_travel;

insert into se_rate_manday (grp, rate_per_day, ot_rate_per_hour) values
  ('Engineer', 2000, 300),
  ('SC/SSM', 2000, 300),
  ('Lead technician', 1500, 300),
  ('Technician', 1000, 300);

insert into se_rate_accommodation (acc_type, period, rate) values
  ('Local Hotel', 'Daily', 700),
  ('Local Hotel', 'Monthly', 10000),
  ('International Hotel', 'Daily', 2000),
  ('International Hotel', 'Monthly', 45000),
  ('Local Apartment', 'Monthly', 10000),
  ('International Apartment', 'Daily', 1500),
  ('International Apartment', 'Monthly', 30000);

insert into se_rate_transport_zone (province, zone, distance_band, zone_desc, note) values
  ('กรุงเทพมหานคร', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('สมุทรปราการ', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('สมุทรสาคร', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('ปทุมธานี', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('นนทบุรี', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('นครปฐม', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('พระนครศรีอยุธยา', 'A', '0-100', 'กรุงเทพฯ และใกล้เคียง', 'Preliminary grouping - verify actual route'),
  ('ชลบุรี', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('ระยอง', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('ฉะเชิงเทรา', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('ปราจีนบุรี', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('สระบุรี', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('นครนายก', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('ราชบุรี', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('สุพรรณบุรี', 'B', '101-200', 'ภาคตะวันออกและรอบนอก', 'Preliminary grouping - verify actual route'),
  ('จันทบุรี', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('กาญจนบุรี', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('ลพบุรี', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('นครราชสีมา', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('เพชรบุรี', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('สระแก้ว', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('ชัยนาท', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('อ่างทอง', 'C', '201-350', 'ระยะกลาง', 'Preliminary grouping - verify actual route'),
  ('ประจวบคีรีขันธ์', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('ขอนแก่น', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('นครสวรรค์', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('พิจิตร', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('พิษณุโลก', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('ตราด', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('บุรีรัมย์', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('สุรินทร์', 'D', '351-600', 'ระยะไกล', 'Preliminary grouping - verify actual route'),
  ('กำแพงเพชร', 'D', '351-600', 'ระยะไกล', 'Same rate as neighbouring provinces (นครสวรรค์ / พิจิตร / พิษณุโลก) - Dew 14 Nov 2026'),
  ('เชียงใหม่', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('ลำพูน', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('เชียงราย', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('อุดรธานี', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('อุบลราชธานี', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('สุราษฎร์ธานี', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('สงขลา', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route'),
  ('ภูเก็ต', 'E', '>600', 'ระยะไกลพิเศษ', 'Preliminary grouping - verify actual route');

insert into se_rate_transport (transport_type, zone_a, zone_b, zone_c, zone_d, zone_e, unit, remarks) values
  ('6 ล้อ (คอกยาว, ธรรมดา)', 5500, 8500, 13000, 21000, 35000, 'THB/trip', 'Budget ceiling estimate; not supplier-verified'),
  ('รถ 6 ล้อ เฮี๊ยบติดเครน', 9000, 12000, 18000, 27000, 40000, 'THB/trip', 'Budget ceiling estimate; not supplier-verified'),
  ('รถ 10 ล้อ เฮี๊ยบติดเครน', 12000, 17000, 24000, 36000, 55000, 'THB/trip', 'Budget ceiling estimate; not supplier-verified'),
  ('เทรลเลอร์', 12000, 17000, 25000, 38000, 60000, 'THB/trip', 'Budget ceiling estimate; not supplier-verified'),
  ('โฟล์คลิฟท์ 2 ตัน', 7000, 10000, 14000, 20000, 30000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('โฟล์คลิฟท์ 5 ตัน', 10000, 14000, 19000, 28000, 42000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 10 ตัน', 10000, 14000, 19000, 27000, 40000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 20 ตัน', 13000, 18000, 24000, 34000, 50000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 25 ตัน', 15000, 20000, 27000, 38000, 55000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 30 ตัน', 18000, 24000, 32000, 45000, 65000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 35 ตัน', 20000, 27000, 36000, 50000, 75000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 50 ตัน', 26000, 35000, 47000, 65000, 95000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 55 ตัน', 29000, 39000, 52000, 72000, 105000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 60 ตัน', 33000, 44000, 58000, 80000, 115000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 70 ตัน', 39000, 52000, 68000, 95000, 135000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 75 ตัน', 43000, 57000, 75000, 105000, 150000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 80 ตัน', 50000, 65000, 85000, 120000, 170000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 100 ตัน', 75000, 95000, 125000, 175000, 250000, 'THB/1 day incl. estimated mobilization', 'Budget ceiling estimate; not supplier-verified'),
  ('รถเครน 200 ตัน', 150000, 190000, 250000, 350000, 500000, 'THB/day', 'Indicative budget allowance only; supplier quotation required; mobilization, rigging and permits may be extra');

insert into se_rate_domestic_travel (travel_type, destination, budget_rate) values
  ('รถส่วนตัว (Round Trip)', 'Samutprakarn', 2000),
  ('รถส่วนตัว (Round Trip)', 'Samutsakhon', 2000),
  ('รถส่วนตัว (Round Trip)', 'Chacheongsao', 2000),
  ('รถส่วนตัว (Round Trip)', 'Chonburi', 2500),
  ('รถส่วนตัว (Round Trip)', 'Bangkok', 2000),
  ('รถส่วนตัว (Round Trip)', 'Pathumthani', 2500),
  ('รถส่วนตัว (Round Trip)', 'Ayutthaya', 2500),
  ('รถส่วนตัว (Round Trip)', 'Rayong', 3000),
  ('รถส่วนตัว (Round Trip)', 'Nakornratchasrima', 4000),
  ('รถส่วนตัว (Round Trip)', 'Kamphaengphet', 6000),
  ('รถส่วนตัว (Round Trip)', 'Khonkean', 6000),
  ('รถส่วนตัว (Round Trip)', 'Lamphun', 10000),
  ('รถส่วนตัว (Site Trip)', 'All Location', 500),
  ('รถ Pick up (Round Trip)', 'Samutprakarn', 2000),
  ('รถ Pick up (Round Trip)', 'Samutsakhon', 2000),
  ('รถ Pick up (Round Trip)', 'Chacheongsao', 2000),
  ('รถ Pick up (Round Trip)', 'Chonburi', 2000),
  ('รถ Pick up (Round Trip)', 'Bangkok', 2000),
  ('รถ Pick up (Round Trip)', 'Pathumthani', 2000),
  ('รถ Pick up (Round Trip)', 'Ayutthaya', 2500),
  ('รถ Pick up (Round Trip)', 'Rayong', 2500),
  ('รถ Pick up (Round Trip)', 'Nakornratchasrima', 3000),
  ('รถ Pick up (Round Trip)', 'Kamphaengphet', 4000),
  ('รถ Pick up (Round Trip)', 'Khonkean', 6000),
  ('รถ Pick up (Round Trip)', 'Lamphun', 6000),
  ('รถ Pick up (Site Trip)', 'All Location', 1000),
  ('รถตู้ (Round Trip)', 'Samutprakarn', 2500),
  ('รถตู้ (Round Trip)', 'Samutsakhon', 2500),
  ('รถตู้ (Round Trip)', 'Chacheongsao', 2500),
  ('รถตู้ (Round Trip)', 'Chonburi', 3000),
  ('รถตู้ (Round Trip)', 'Bangkok', 2500),
  ('รถตู้ (Round Trip)', 'Pathumthani', 3000),
  ('รถตู้ (Round Trip)', 'Ayutthaya', 3000),
  ('รถตู้ (Round Trip)', 'Rayong', 3500),
  ('รถตู้ (Round Trip)', 'Nakornratchasrima', 4500),
  ('รถตู้ (Round Trip)', 'Kamphaengphet', 6500),
  ('รถตู้ (Round Trip)', 'Khonkean', 7000),
  ('รถตู้ (Round Trip)', 'Lamphun', 12000),
  ('รถตู้ (Site Trip)', 'All Location', 1000);

-- RLS on with no policies: browsers cannot read or write these tables directly; the SSM Work server reads them with the service role. Edit rates in Supabase or regenerate from the xlsx.
alter table se_rate_manday enable row level security; alter table se_rate_accommodation enable row level security; alter table se_rate_transport_zone enable row level security; alter table se_rate_transport enable row level security; alter table se_rate_domestic_travel enable row level security;
commit;
