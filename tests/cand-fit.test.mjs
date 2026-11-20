import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const F = createRequire(import.meta.url)('../hub/candidates/fit.js');

test('years: AD and BE ranges, present', () => {
  assert.equal(F.years('Technician 2017-2022\nLead 2023-ปัจจุบัน'), new Date().getFullYear() - 2017);
  assert.equal(F.years('2560 – 2565'), 5);
  assert.equal(F.years('ประสบการณ์ 8 ปี'), 8);
  assert.equal(F.years('ไม่มีปี'), null);
});

test('English words match whole words only', () => {
  const r = F.analyze('approved by PRESIDENT; sprint');
  assert.ok(!r.dims.find((d) => d.k === 'doc').hits.includes('pr'));
});

test('site lead CV scores higher for Site Control than an office CV', () => {
  const site = F.analyze('Lead Technician 2017-ปัจจุบัน หัวหน้าทีมช่าง ควบคุมงานติดตั้งหน้างาน ประสานงานลูกค้าและผู้รับเหมา วางแผนงานรายวัน Daily report ความปลอดภัย Commissioning SAT ซ่อมบำรุง Service PLC ไฟฟ้า');
  const office = F.analyze('เจ้าหน้าที่ธุรการ 2022-2024 Excel เอกสาร รายงาน');
  const sc = (r) => r.roles.find((x) => x.k === 'sitecontrol').pct;
  assert.ok(sc(site) >= 70, 'site ' + sc(site));
  assert.ok(sc(office) < 40, 'office ' + sc(office));
  assert.ok(site.lead);
  assert.equal(office.gaps.some((g) => g.k === 'site'), true);
});
