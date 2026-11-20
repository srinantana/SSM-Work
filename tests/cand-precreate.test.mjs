// /apply submit fills a pre-created applicant (answers = {}) when the full name matches, spaces ignored.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

Object.assign(process.env, { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', SESSION_SECRET: 'x'.repeat(40), SUPER_ADMIN: 'nantana.s', DEFAULT_PASSWORD: '123456', APP_URL: 'https://app.test' });
const dir = mkdtempSync(join(tmpdir(), 'mw-'));
writeFileSync(join(dir, 'mw.mjs'), readFileSync(new URL('../hub/middleware.js', import.meta.url)));
const { default: mw } = await import(join(dir, 'mw.mjs'));

const TEST = { id: 1, title: 'Site Control', open: true, content: { questions: [{ no: 1 }, { no: 2 }] } };
let rows, nextId;
const empty = (r) => !Object.keys(r.answers || {}).length;
globalThis.fetch = async (u, o = {}) => {
  const url = new URL(u), m = o.method || 'GET', q = url.searchParams, ok = (d, s = 200) => new Response(JSON.stringify(d), { status: s });
  if (url.pathname === '/rest/v1/cand_tests') return ok([TEST]);
  if (url.pathname === '/rest/v1/cand_log') return ok([]);
  if (url.pathname !== '/rest/v1/candidates') return ok([]);
  let sel = rows.slice();
  if (q.get('answers') === 'eq.{}') sel = sel.filter(empty);
  if (q.get('answers') === 'neq.{}') sel = sel.filter((r) => !empty(r));
  if (q.get('phone')) sel = sel.filter((r) => r.phone === q.get('phone').slice(3));
  if (q.get('id')) sel = sel.filter((r) => r.id === Number(q.get('id').slice(3)));
  if (q.get('ip_hash')) sel = [];
  if (m === 'GET') return ok(Number(q.get('offset')) ? [] : sel);
  const body = JSON.parse(o.body);
  if (m === 'PATCH') { sel.forEach((r) => Object.assign(r, body)); return ok(sel); }
  const r = { id: nextId++, answers: {}, ...body }; rows.push(r); return ok([r], 201);
};
const submit = (name, phone = '0811111111') => mw(new Request('https://app.test/api/apply/submit', { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slug: 'site-control', name, phone, consent: true, answers: { 1: 'a1', 2: 'a2' } }) }));

beforeEach(() => { nextId = 10; rows = [{ id: 1, test_id: 1, name: 'วิสุธรรม แก้วเกษ', phone: '0959901207', answers: {}, files: [{ url: 'https://drive.google.com/x' }], note: 'CV', consent_ver: 'manual-cv', submitted_at: '2026-11-20T00:00:00Z' }]; });

test('same name, spaces differ → answers go into the existing row', async () => {
  const r = await submit('  วิสุธรรม   แก้วเกษ ');
  assert.equal(r.status, 200);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].answers, { 1: 'a1', 2: 'a2' });
  assert.equal(rows[0].name, 'วิสุธรรม แก้วเกษ');
  assert.equal(rows[0].note, 'CV');
  assert.equal(rows[0].files.length, 1);
  assert.equal(rows[0].consent_ver, 'v1');
});

test('one character different → new applicant', async () => {
  await submit('วิสุธรรม แก้วเกส');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].answers, {});
});

for (const n of ['นายวิสุธรรม แก้วเกษ', 'นาย วิสุธรรม แก้วเกษ', 'Mr. วิสุธรรม แก้วเกษ']) {
  test(`title prefix is ignored: ${n}`, async () => {
    await submit(n);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].answers, { 1: 'a1', 2: 'a2' });
  });
}

test('prefix on the pre-created name is ignored too (นางสาว / น.ส.)', async () => {
  rows[0].name = 'นางสาว สมหญิง ใจดี';
  await submit('น.ส.สมหญิง ใจดี');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].answers, { 1: 'a1', 2: 'a2' });
});

test('นางสาว is not read as นาง + สาว…', async () => {
  rows[0].name = 'สาวิตรี ใจดี';
  await submit('นางสาวิตรี ใจดี');   // นาง + สาวิตรี → matches; documented: longest prefix first
  assert.equal(rows.length, 1);
});

test('pre-created row with the same phone does not block the submission', async () => {
  const r = await submit('วิสุธรรมแก้วเกษ', '0959901207');
  assert.equal(r.status, 200);
  assert.equal(rows.length, 1);
});

test('a row that already has answers is never overwritten', async () => {
  rows[0].answers = { 1: 'old' };
  await submit('วิสุธรรม แก้วเกษ');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].answers, { 1: 'old' });
});
