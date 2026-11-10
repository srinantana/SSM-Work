// SSM Work login gate — Vercel Routing Middleware + Supabase Auth (username + password).
// Everyone signs in with a username: full English first name + "." + first letter of the English surname
// (nantana.s). When two people would share one, the later employee code gets more surname letters
// (sanya.s / sanya.so). Usernames set by hand in /admin (✎) are kept on re-import; generated ones follow the rule. Accounts are created by the super admin at /admin from the RAK employee Excel file.
// Supabase still needs an email per account: a real company address when one is matched (nantana.s@rak.co.th),
// otherwise an internal placeholder <username>@ssm.<ALLOWED_DOMAIN> that never receives mail (shared mailboxes).
// New accounts get DEFAULT_PASSWORD and must set their own password at first sign-in. /admin can also reset every
// account from the RAK_Employee table in Supabase (or the Excel file): all accounts are deleted and recreated.
// Env vars (Vercel → Project ssmwork → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY  – Supabase project URL and publishable (anon) key. Not secret.
//   SUPABASE_SERVICE_ROLE_KEY        – secret key (sb_secret_… or legacy service_role); /admin only. Never expose it.
//   SESSION_SECRET                   – long random string used to sign the session cookie
//   APP_URL                          – https://ssmwork.vercel.app
//   ALLOWED_DOMAIN                   – rak.co.th
//   SUPER_ADMIN                      – nantana.s@rak.co.th (always admin; cannot be disabled or deleted)
//   DEFAULT_PASSWORD                 – first-login password for new / reset accounts
//   SERVICE_PLAN_TOKEN               – shared secret the Apps Script sends (header x-ssm-token) to
//                                      POST /api/service-plan/sync (scripts/service-plan-push.gs)
// If a required value is missing the site stays locked (fails closed).

export const config = { matcher: ['/((?!favicon\\.ico).*)'] };

const SESSION = 'ssm_session';
const PENDING = 'ssm_pending';
const SESSION_HOURS = 12;

const te = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(te.encode(s));
const unb64u = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

async function sign(secret, data) {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, te.encode(data)));
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function makeToken(secret, payload) {
  const body = b64uText(JSON.stringify(payload));
  return body + '.' + (await sign(secret, body));
}
async function readToken(secret, token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!sameString(sig, await sign(secret, body))) return null;
  try {
    const data = JSON.parse(unb64u(body));
    return data.exp && data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}

function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const setCookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

function page({ status = 200, title, body, headers = {} }) {
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · SSM Work</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23121212'/%3E%3Ctext x='16' y='20.3' font-family='Arial,Helvetica,sans-serif' font-size='11.5' font-weight='700' fill='%23fff' text-anchor='middle' letter-spacing='-0.2'%3ESSM%3C/text%3E%3C/svg%3E">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--rak:#c70404;--rak-dark:#a00303;--blush:#fff0f0;--blush-2:#ffd9d9;--ink:#22252b;--muted:#6d7582;--line:#e6e8ed;--bg:#f5f6f8}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:14px/1.65 "IBM Plex Sans Thai","Leelawadee UI",Tahoma,sans-serif;padding:20px}
.card{width:min(420px,100%);background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 18px 40px -28px rgba(18,18,18,.5)}
.brand{background:#121212;padding:18px 24px}.brand img{height:30px;display:block}
.brand .word{display:none;color:#fff;font-weight:700;letter-spacing:.06em}.brand .word b{color:var(--rak)}
.brand span.ws{display:block;color:#b7b7b7;font-size:9.5px;letter-spacing:2.4px;margin-top:8px}
.in{padding:26px 24px 24px;display:grid;gap:14px;justify-items:start}
.ic{display:grid;place-items:center;width:58px;height:58px;border-radius:16px;background:var(--blush);color:var(--rak)}
h1{margin:0;font-size:21px;font-weight:600;line-height:1.35}p{margin:0;color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:10px;text-decoration:none;background:var(--rak);color:#fff;border-radius:10px;padding:10px 18px;font-weight:500}
.btn:hover{background:var(--rak-dark)}.btn .g{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#fff}
.note{font-size:12px;color:var(--muted);border-top:1px solid var(--line);padding-top:12px;width:100%}
form{display:grid;gap:10px;width:100%}
input[type=email],input[type=text],input[type=password]{width:100%;font:inherit;border:1px solid #dce1e8;border-radius:10px;padding:11px 14px;color:var(--ink)}
input[type=email]:focus,input[type=text]:focus,input[type=password]:focus{outline:3px solid #f3c2c2;border-color:var(--rak)}
button.btn{border:0;cursor:pointer;font:inherit;justify-content:center}
.ok{color:#188764;background:#e9f7f0;border-radius:8px;padding:8px 12px;font-size:13px;width:100%}
label.f{display:grid;gap:4px;font-size:12.5px;color:var(--muted)}
.links{display:flex;gap:14px;font-size:12.5px}.links a{color:var(--rak)}
.err{color:var(--rak);background:var(--blush);border-radius:8px;padding:8px 12px;font-size:13px;width:100%}
code{background:var(--blush);color:var(--rak);border-radius:4px;padding:1px 6px}
</style></head><body><main class="card">
<div class="brand"><img src="/assets/rak-logo.svg" alt="RAK Engineering" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="word"><b>RAK</b> ENGINEERING</span><span class="ws">SSM WORK</span></div>
<div class="in">${body}</div></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

const LOCK = `<span class="ic"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="#ffd9d9"/><rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10.3" cy="14.6" r=".9" fill="currentColor"/><circle cx="13.7" cy="14.6" r=".9" fill="currentColor"/><path d="M10.4 17a2.2 2.2 0 0 0 3.2 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>`;
const KEY = `<span class="ic"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="12" r="4.5" fill="#ffd9d9"/><circle cx="8.5" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 12h8m-2.5 0v3m-3-3v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.3" cy="11.4" r=".8" fill="currentColor"/><circle cx="9.7" cy="11.4" r=".8" fill="currentColor"/></svg></span>`;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+$/;
const USER_RE = /^[a-z]{2,30}\.[a-z]{1,6}[0-9]?$/;
const letters = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
const inDomain = (cfg, email) => { const e = String(email || '').toLowerCase(); return e.endsWith('@' + cfg.domain) || e.endsWith('.' + cfg.domain); };
const internalEmail = (cfg, username) => `${username}@ssm.${cfg.domain}`;

// Menus that can be granted per user. Keep ids in sync with MODULES in index.html and "module" in registry.json.
// A tool folder /customers/<customer>/<project>/<tool>/ belongs to the menu whose id the folder name starts with
// (e.g. spare-part-list → spare-part). A tool folder that matches no menu is admin-only.
const MENUS = [
  { id: 'site-expense', name: 'Site Expense' },
  { id: 'spare-part', name: 'Spare Part' },
  { id: 'punch-list', name: 'Punch List' },
  { id: 'service-plan', name: 'Service Plan' },
  { id: 'manpower', name: 'Manpower' },
];
const MENU_IDS = MENUS.map((m) => m.id);
function menuOfPath(path) {
  if (path.startsWith('/spare-part/') || path.startsWith('/api/spare-part/')) return 'spare-part';
  if (path.startsWith('/site-expense/')) return 'site-expense';
  if (path.startsWith('/service-plan/') || path.startsWith('/api/service-plan/')) return 'service-plan';
  if (path.startsWith('/manpower/') || path.startsWith('/api/manpower/')) return 'manpower';
  const m = path.match(/^\/customers\/[^/]+\/[^/]+\/([^/]+)/);
  if (!m) return null; // not a tool page
  return MENU_IDS.find((id) => m[1].startsWith(id)) || '__admin';
}
// Spare Part projects live in Supabase table public.spare_part_projects (database/spare_part_projects.sql).
// The table has RLS on and no policies, so only this middleware (service key) can read or write it.
const SP_TABLE = '/rest/v1/spare_part_projects';
async function sparePartApi(cfg, req, url, prof) {
  if (url.pathname !== '/api/spare-part/projects') return json({ error: 'not found' }, 404);
  const rest = (q, opt) => call(cfg, SP_TABLE + q, { admin: true, ...opt });
  if (req.method === 'GET') {
    const r = await rest('?select=data&order=updated_at.desc&limit=1000', { method: 'GET' });
    if (!r.ok) return json({ error: 'no_table' }, 503);
    return json((Array.isArray(r.data) ? r.data : []).map((x) => x.data));
  }
  if (req.method !== 'POST' && req.method !== 'DELETE') return json({ error: 'method' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== cfg.app) return json({ error: 'bad origin' }, 403);
  if (req.method === 'DELETE') {
    if (prof.role !== 'admin') return json({ error: 'admin only' }, 403);
    const id = url.searchParams.get('id') || '';
    if (!/^[\w-]{3,64}$/.test(id)) return json({ error: 'id' }, 400);
    const r = await rest('?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
    return r.ok ? json({ ok: true }) : json({ error: 'supabase' }, 502);
  }
  let p;
  try { p = await req.json(); } catch { return json({ error: 'json' }, 400); }
  if (!p || typeof p !== 'object' || !/^[\w-]{3,64}$/.test(String(p.id || ''))) return json({ error: 'id' }, 400);
  const body = JSON.stringify(p);
  if (body.length > 900000) return json({ error: 'too large' }, 413);
  // Only admins may change project details (header taken from the Job Order); other users keep the stored values.
  const HEAD = ['jo', 'customer', 'customerShort', 'name', 'site', 'contact', 'tel', 'qo', 'po', 'delivery', 'pm', 'coordinator'];
  if (prof.role !== 'admin') {
    const cur = await rest('?select=data&id=eq.' + encodeURIComponent(p.id), { method: 'GET' });
    const old = cur.ok && Array.isArray(cur.data) && cur.data[0] && cur.data[0].data;
    if (old) HEAD.forEach((k) => { p[k] = old[k]; });
  }
  const now = new Date().toISOString();
  p.updated = now; p.updatedBy = prof.email;
  if (!p.createdBy) p.createdBy = prof.email;
  const row = { id: p.id, jo: String(p.jo || ''), customer: String(p.customer || ''), name: String(p.name || ''), status: String(p.status || 'draft'), data: p, updated_by: prof.email, updated_at: now };
  const res = await fetch(cfg.url + SP_TABLE + '?on_conflict=id', { method: 'POST', headers: { ...authHeaders(cfg.service), prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  return res.ok ? json(p) : json({ error: res.status === 404 ? 'no_table' : 'supabase' }, res.status === 404 ? 503 : 502);
}

// Service Plan: a Google Apps Script (scripts/service-plan-push.gs, "On change" trigger) watches tab "ใบขอคน 2026"
// of the sheet "ใบร้องขอคนจากฝ่ายผลิต" and, whenever a row is added or changed, posts columns A–Q of every row to
// POST /api/service-plan/sync (header x-ssm-token = SERVICE_PLAN_TOKEN). The rows are kept in Supabase table
// public.service_plan_snapshot (database/service_plan.sql); GET /api/service-plan/jobs returns them to signed-in users.
// hub/service-plan/app.js keeps only IS/SO/IN/WR rows with status New/Checking/Confirm/Complete.
const SPL_TABLE = '/rest/v1/service_plan_snapshot';
async function servicePlanSync(cfg, env, req) {
  const token = String(env.SERVICE_PLAN_TOKEN || '').trim();
  if (token.length < 16) return json({ error: 'not_configured' }, 503);
  if (!sameString(String(req.headers.get('x-ssm-token') || ''), token)) return json({ error: 'forbidden' }, 403);
  const text = await req.text().catch(() => '');
  if (text.length > 3000000) return json({ error: 'too large' }, 413);
  let d;
  try { d = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
  if (!d || !Array.isArray(d.rows)) return json({ error: 'rows' }, 400);
  const now = new Date().toISOString();
  const data = {
    updated: now, sheet: String(d.sheet || ''), gid: Number(d.gid) || null,
    rows: d.rows.filter((x) => x && Array.isArray(x.v)).slice(0, 5000)
      .map((x) => ({ n: Number(x.n) || 0, v: x.v.slice(0, 17).map((c) => String(c ?? '').slice(0, 4000)) })),
  };
  const res = await fetch(cfg.url + SPL_TABLE + '?on_conflict=id', { method: 'POST', headers: { ...authHeaders(cfg.service), prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 'main', data, updated_at: now }) });
  if (!res.ok) return json({ error: res.status === 404 ? 'no_table' : 'supabase' }, res.status === 404 ? 503 : 502);
  return json({ ok: true, rows: data.rows.length, updated: now });
}
async function servicePlanApi(cfg, req, url) {
  if (url.pathname !== '/api/service-plan/jobs') return json({ error: 'not found' }, 404);
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  const r = await call(cfg, SPL_TABLE + '?select=data&id=eq.main', { method: 'GET', admin: true });
  if (!r.ok) return json({ error: 'no_table' }, 503);
  const row = Array.isArray(r.data) && r.data[0];
  return row && row.data ? json(row.data) : json({ error: 'no_data' }, 503);
}

// Manpower (วางแผนกำลังคน) replaces the Google Sheet "26 (PD)- ตารางงานและวันหยุดช่าง 2569" (retired after a one-time
// import, scripts/manpower-import.py). Tables mp_* (database/manpower.sql) have RLS on and no policies: only this
// middleware (service key) reads them. Anyone granted the Manpower menu may view; editing (Phase 2) is limited to
// SC / PC / SSM (set by Dew, 10 Nov 2026). Matched by username, or by Thai full name when the username is not known yet.
//   SSM ดิว nantana.s · SC อาร์ต sakkamon.c, หนุ่ม teedanai.h, สปาย prakaikaew.p
//   PC กอล์ฟ kitisak.s, แพร phattharada.t, ไอซ์ pichayut.k (R69010), ซี napat.t (R69014)
const MANPOWER_EDIT = {
  usernames: ['nantana.s', 'sakkamon.c', 'teedanai.h', 'prakaikaew.p', 'kitisak.s', 'phattharada.t', 'pichayut.k', 'napat.t'],
  namesTh: ['นันทนา ศรีสกุลเตียว', 'ศักดิ์กมล จันทริมา', 'ธีร์ดนัย ฮุยสูงเนิน', 'ประกายแก้ว ปัญญา',
    'กิติศักดิ์ สุ่นศักดิ์สวัสดิ์', 'พิชญ์ยุทธ คงดิศ', 'ภัทรลดา ทองสอาด', 'นภัท ทองอำไพ'],
};
const thKey = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const canEditManpower = (prof) => MANPOWER_EDIT.usernames.includes(String(prof.username || '').toLowerCase())
  || MANPOWER_EDIT.namesTh.includes(thKey(prof.nameTh));
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// PostgREST returns at most 1000 rows per request; page through with limit/offset.
async function restAll(cfg, path, max = 40000) {
  const out = [];
  for (let off = 0; off < max; off += 1000) {
    const r = await call(cfg, `${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${off}`, { method: 'GET', admin: true });
    if (!r.ok) return null;
    out.push(...r.data);
    if (r.data.length < 1000) break;
  }
  return out;
}
async function manpowerApi(cfg, req, url, prof) {
  if (url.pathname !== '/api/manpower/board') return json({ error: 'not found' }, 404);
  if (req.method !== 'GET') return json({ error: 'method' }, 405);
  const from = url.searchParams.get('from') || '', to = url.searchParams.get('to') || '';
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || to < from) return json({ error: 'range' }, 400);
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 400) return json({ error: 'range too long' }, 400);
  const span = `day=gte.${from}&day=lte.${to}`;
  const [workers, projects, milestones, assignments, absences, holidays] = await Promise.all([
    restAll(cfg, '/rest/v1/mp_workers?select=id,emp_code,name_th,nickname,unit,trade,active,sort&order=sort.asc'),
    restAll(cfg, '/rest/v1/mp_projects?select=code,name,customer,job_no,status,color,sort,note&order=sort.asc'),
    restAll(cfg, `/rest/v1/mp_milestones?select=project_code,day,label&${span}&order=day.asc`),
    restAll(cfg, `/rest/v1/mp_assignments?select=worker_id,day,project_code,kind,text,tentative&${span}&order=day.asc,worker_id.asc`),
    restAll(cfg, `/rest/v1/mp_absences?select=worker_id,day,type&${span}&order=day.asc,worker_id.asc`),
    restAll(cfg, `/rest/v1/mp_holidays?select=day,type,name&${span}&order=day.asc`),
  ]);
  if (!workers || !projects) return json({ error: 'no_table' }, 503);
  return json({ from, to, canEdit: canEditManpower(prof), workers, projects, milestones: milestones || [], assignments: assignments || [], absences: absences || [], holidays: holidays || [] });
}

// Site Expense permissions are fixed by username (set by Dew, 9 Nov 2026), not by the admin checkboxes.
//   ดิว nantana.s · บี chayanun.s · สปาย prakaikaew.p · อาร์ต sakkamon.c · หนุ่ม teedanai.h · นิ้ง chalunda.w · นิว suwitcha.b
const SITE_EXPENSE = {
  view:    ['teedanai.h', 'prakaikaew.p', 'sakkamon.c', 'nantana.s', 'chayanun.s', 'chalunda.w', 'suwitcha.b'],
  create:  ['teedanai.h', 'prakaikaew.p', 'sakkamon.c', 'nantana.s'],   // new project, Estimate, send for review
  approve: ['nantana.s', 'chayanun.s'],                                // one-step approval: ดิว or บี
  award:   ['nantana.s'],                                               // Get Award + adjust Budget control
  actual:  ['teedanai.h', 'prakaikaew.p', 'sakkamon.c', 'nantana.s'],   // record site expenses
  check:   ['nantana.s'],                                               // check recorded actuals
};
const sitePerms = (prof) => Object.keys(SITE_EXPENSE).filter((k) => SITE_EXPENSE[k].includes(String(prof.username || '').toLowerCase()));
// Non-admins see only the menus an admin has ticked for them; a new account starts with none. Site Expense: list above only.
const effectiveMenus = (prof) => {
  const base = prof.role === 'admin' ? MENU_IDS.slice() : Array.isArray(prof.modules) ? prof.modules.filter((id) => MENU_IDS.includes(id)) : [];
  const out = base.filter((id) => id !== 'site-expense');
  if (sitePerms(prof).includes('view')) out.push('site-expense');
  return MENU_IDS.filter((id) => out.includes(id));
};
const canOpen = (prof, menu) => menu === null || (menu === 'site-expense' ? effectiveMenus(prof).includes(menu) : prof.role === 'admin' || (menu !== '__admin' && effectiveMenus(prof).includes(menu)));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function signInPage(cfg, next, { status = 401, heading = 'เข้าสู่ระบบ SSM Work', msg, error, notice, email = '', headers } = {}) {
  return page({
    status, title: 'เข้าสู่ระบบ', headers,
    body: `${LOCK}<h1>${esc(heading)}</h1><p>${msg || `สำหรับพนักงาน RAK Engineering · ชื่อผู้ใช้ = ชื่อภาษาอังกฤษเต็ม <b>.</b> นามสกุลตัวแรก`}</p>
${notice ? `<div class="ok">${notice}</div>` : ''}${error ? `<div class="err">${error}</div>` : ''}
<form method="post" action="${esc(cfg.app)}/auth/login">
<input type="hidden" name="next" value="${esc(next)}">
<label class="f">ชื่อผู้ใช้<input type="text" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="เช่น nantana.s" value="${esc(email)}"></label>
<label class="f">รหัสผ่าน<input type="password" name="password" required autocomplete="current-password"></label>
<button class="btn" type="submit">เข้าสู่ระบบ →</button>
</form>
<div class="note">เข้าครั้งแรก? ใช้รหัสผ่านเริ่มต้นที่ได้รับจากผู้ดูแล แล้วตั้งรหัสใหม่ · ลืมรหัสผ่าน ติดต่อผู้ดูแลระบบ</div>`,
  });
}

function passwordPage(cfg, { first, error, status = 200, headers } = {}) {
  return page({
    status, title: 'ตั้งรหัสผ่าน', headers,
    body: `${KEY}<h1>${first ? 'ตั้งรหัสผ่านใหม่ก่อนใช้งาน' : 'เปลี่ยนรหัสผ่าน'}</h1><p>${first ? 'เข้าครั้งแรกด้วยรหัสเริ่มต้น กรุณาตั้งรหัสผ่านของคุณเอง' : 'ใส่รหัสผ่านปัจจุบัน แล้วตั้งรหัสใหม่'}</p>
${error ? `<div class="err">${error}</div>` : ''}
<form method="post" action="${esc(cfg.app)}/auth/password">
${first ? '' : '<label class="f">รหัสผ่านปัจจุบัน<input type="password" name="current" required autocomplete="current-password"></label>'}
<label class="f">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)<input type="password" name="password" required minlength="8" autocomplete="new-password"></label>
<label class="f">ยืนยันรหัสผ่านใหม่<input type="password" name="confirm" required minlength="8" autocomplete="new-password"></label>
<button class="btn" type="submit">บันทึกรหัสผ่าน</button>
</form>
<div class="links">${first ? `<a href="${esc(cfg.app)}/auth/logout">ยกเลิก / ออกจากระบบ</a>` : `<a href="${esc(cfg.app)}/">← กลับหน้า SSM Work</a>`}</div>`,
  });
}

// New Supabase keys (sb_publishable_ / sb_secret_) go only in the apikey header; the gateway rejects them as a Bearer token.
// Legacy JWT keys (eyJ…) are also sent as the Bearer token. A signed-in user's access token always goes in Authorization.
function authHeaders(key, bearer) {
  const h = { apikey: key, 'content-type': 'application/json' };
  if (bearer) h.authorization = 'Bearer ' + bearer;
  else if (String(key).startsWith('eyJ')) h.authorization = 'Bearer ' + key;
  return h;
}

async function call(cfg, path, { method = 'POST', body, bearer, admin } = {}) {
  const key = admin ? cfg.service : cfg.anon;
  const res = await fetch(cfg.url + path, {
    method,
    headers: authHeaders(key, bearer),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}
const errText = (d) => String(d.msg || d.message || d.error_description || d.error || '').toLowerCase();

function profileOf(cfg, user) {
  const email = String(user.email || '').toLowerCase();
  const meta = user.user_metadata || {};
  const role = email === cfg.superAdmin ? 'admin' : (user.app_metadata && user.app_metadata.role) === 'admin' ? 'admin' : 'user';
  const mods = user.app_metadata && user.app_metadata.modules;
  return { id: user.id, email, username: String(meta.username || ''), name: meta.full_name || meta.username || email.split('@')[0], nameTh: String(meta.name_th || ''), role, modules: Array.isArray(mods) ? mods : null, mustChange: meta.must_change_password === true };
}

async function startSession(cfg, prof, next) {
  const token = await makeToken(cfg.secret, { id: prof.id, email: prof.email, username: prof.username, name: prof.name, role: prof.role, modules: prof.modules, exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600 });
  const h = new Headers({ location: cfg.app + safeNext(next), 'cache-control': 'no-store' });
  h.append('set-cookie', setCookie(SESSION, token, SESSION_HOURS * 3600));
  h.append('set-cookie', setCookie(PENDING, '', 0));
  return new Response(null, { status: 302, headers: h });
}

function checkNewPassword(cfg, pw, confirm, email) {
  if (pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
  if (pw !== confirm) return 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';
  if (pw === cfg.defaultPassword) return 'ห้ามใช้รหัสผ่านเริ่มต้น กรุณาตั้งรหัสใหม่';
  if (pw.toLowerCase() === email.split('@')[0]) return 'อย่าใช้ชื่อผู้ใช้เป็นรหัสผ่าน';
  return null;
}

// Re-read the account from Supabase so bans, deletions and permission changes apply right away.
async function liveProfile(cfg, sess) {
  if (!sess.id) { // session from before per-menu permissions: look the account up by email once
    const users = await listUsers(cfg).catch(() => null);
    const u = users && users.find((x) => String(x.email).toLowerCase() === String(sess.email).toLowerCase());
    if (!users) return sess;
    if (!u) return null;
    sess = { ...sess, id: u.id };
  }
  const r = await call(cfg, `/auth/v1/admin/users/${sess.id}`, { method: 'GET', admin: true });
  if (!r.ok) return r.status >= 500 ? sess : null; // keep working through a Supabase outage, but not for a removed account
  if (r.data.banned_until && new Date(r.data.banned_until) > new Date()) return null;
  const p = profileOf(cfg, r.data);
  return p.email === String(sess.email).toLowerCase() ? p : null;
}

// ---------- RAK employee data ----------
// Column names are matched loosely so both the Excel headers ("ชื่อ (EN)") and snake_case ("first_name_en") work.
const colKey = (k) => String(k || '').toLowerCase().replace(/[\s_\-()\[\].]/g, '');
const COLS = {
  code: ['รหัส', 'รหัสพนักงาน', 'code', 'employeecode', 'empcode', 'employeeid', 'empid', 'staffid'],
  status: ['สถานะ', 'status'],
  first: ['ชื่อen', 'firstnameen', 'firstname', 'nameen', 'fnameen', 'givenname'],
  last: ['นามสกุลen', 'lastnameen', 'lastname', 'surnameen', 'surname', 'lnameen', 'familyname'],
  nick: ['ชื่อเล่น', 'nickname', 'nicknameth', 'nick'],
  thFirst: ['ชื่อ', 'firstnameth', 'nameth', 'fnameth'],
  thLast: ['นามสกุล', 'lastnameth', 'surnameth', 'lnameth'],
  email: ['อีเมล', 'email', 'mail'],
};
function employeeRow(obj) {
  const by = {};
  for (const [k, v] of Object.entries(obj || {})) by[colKey(k)] = v;
  const get = (f) => { for (const c of COLS[f]) if (by[colKey(c)] != null && String(by[colKey(c)]).trim() !== '') return String(by[colKey(c)]).trim(); return ''; };
  return { code: get('code'), status: get('status'), first: get('first'), last: get('last'), nick: get('nick'), th: [get('thFirst'), get('thLast')].filter(Boolean).join(' '), email: get('email') };
}
const leftCompany = (status) => /ลาออก|พ้นสภาพ|resign|inactive|terminated|left/i.test(String(status || ''));
const EMP_TABLES = ['RAK_Employee', 'rak_employee', 'RAK_Employees', 'rak_employees', 'employees', 'employee'];
async function readEmployeeTable(cfg) {
  for (const t of EMP_TABLES) {
    const r = await call(cfg, `/rest/v1/${encodeURIComponent(t)}?select=*`, { method: 'GET', admin: true });
    if (r.ok && Array.isArray(r.data)) return { table: t, rows: r.data.map(employeeRow) };
  }
  return null;
}
// Username = full English first name . first letter of surname; on a clash the later employee code takes more surname letters.
function planUsernames(rows, taken = new Set()) {
  const out = [], extended = [];
  const list = rows.map((r) => ({ ...r, f: letters(r.first), l: letters(r.last) })).filter((r) => r.f && r.l && !leftCompany(r.status));
  list.sort((x, y) => (String(x.code || '~').toUpperCase()).localeCompare(String(y.code || '~').toUpperCase()));
  for (const r of list) {
    let username = '';
    for (let n = 1; n <= r.l.length && n <= 6 && !username; n++) { const c = `${r.f.slice(0, 30)}.${r.l.slice(0, n)}`; if (!taken.has(c)) username = c; }
    for (let d = 2; !username && d < 10; d++) { const c = `${r.f.slice(0, 30)}.${r.l[0]}${d}`; if (!taken.has(c)) username = c; }
    taken.add(username);
    if (username !== `${r.f.slice(0, 30)}.${r.l[0]}`) extended.push(`${r.nick || r.first} → ${username}`);
    const { f, l, ...rest } = r;
    out.push({ ...rest, username, auto: true });
  }
  return { rows: out, extended, skipped: rows.length - list.length };
}

// ---------- admin ----------
async function listUsers(cfg) {
  const all = [];
  for (let p = 1; p <= 10; p++) {
    const r = await call(cfg, `/auth/v1/admin/users?page=${p}&per_page=200`, { method: 'GET', admin: true });
    if (!r.ok) throw new Error('list ' + r.status);
    const users = r.data.users || [];
    all.push(...users);
    if (users.length < 200) break;
  }
  return all;
}

async function adminApi(cfg, req, path) {
  if (path === '/admin/api/users' && req.method === 'GET') {
    const users = await listUsers(cfg);
    return json(users.map((u) => {
      const p = profileOf(cfg, u);
      const md = u.user_metadata || {};
      return { id: u.id, email: p.email, username: p.username, code: md.employee_code || '', nameTh: md.name_th || '', internal: p.email.endsWith('@ssm.' + cfg.domain), name: p.name, role: p.role, modules: effectiveMenus(p), mustChange: p.mustChange, banned: !!(u.banned_until && new Date(u.banned_until) > new Date()), lastSignIn: u.last_sign_in_at || null, superAdmin: p.email === cfg.superAdmin };
    }).sort((a, b) => (a.username || '~' + a.email).localeCompare(b.username || '~' + b.email)));
  }
  if (path === '/admin/api/employees' && req.method === 'GET') {
    const t = await readEmployeeTable(cfg);
    return t ? json({ table: t.table, count: t.rows.length }) : json({ error: 'no table' }, 404);
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const body = await req.json().catch(() => ({}));

  // Reset step 1: usernames for every employee (from the Supabase table, or rows sent from the Excel file).
  if (path === '/admin/api/plan') {
    let src = 'excel', rows = Array.isArray(body.rows) ? body.rows.map((r) => (r && r.first !== undefined ? { code: String(r.code || ''), status: String(r.status || ''), first: r.first, last: r.last, nick: String(r.nick || ''), th: String(r.th || ''), email: String(r.email || '') } : employeeRow(r))) : [];
    if (body.source === 'table') { const t = await readEmployeeTable(cfg); if (!t) return json({ error: 'no table' }, 404); src = t.table; rows = t.rows; }
    const p = planUsernames(rows.slice(0, 2000));
    return json({ source: src, ...p });
  }
  // Reset step 2: delete accounts in small batches (the super admin is never deleted).
  if (path === '/admin/api/delete-many') {
    const ids = new Set((Array.isArray(body.ids) ? body.ids : []).slice(0, 25).map(String));
    const out = { deleted: 0, failed: [] };
    for (const u of await listUsers(cfg)) {
      if (!ids.has(u.id) || String(u.email).toLowerCase() === cfg.superAdmin) continue;
      const r = await call(cfg, `/auth/v1/admin/users/${u.id}`, { method: 'DELETE', admin: true });
      if (r.ok) out.deleted++; else out.failed.push(String(u.email));
    }
    return json(out);
  }

  if (path === '/admin/api/import') {
    const users = await listUsers(cfg);
    const metaOf = (u) => u.user_metadata || {};
    const byCode = new Map(), byUser = new Map(), byEmail = new Map();
    for (const u of users) {
      const m = metaOf(u);
      if (m.employee_code) byCode.set(String(m.employee_code).toUpperCase(), u);
      if (m.username) byUser.set(String(m.username).toLowerCase(), u);
      byEmail.set(String(u.email).toLowerCase(), u);
    }
    // Rows from the RAK employee file ({code, first, last, nick, th}) or the older email list ({email, name, role}).
    const rows = (Array.isArray(body.rows) ? body.rows.slice(0, 2000) : []).map((r) => ({
      code: String(r.code || '').trim().toUpperCase(), first: letters(r.first), last: letters(r.last),
      nick: String(r.nick || r.name || '').trim(), th: String(r.th || '').trim(), en: [r.first, r.last].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
      email: String(r.email || '').trim().toLowerCase(), role: String(r.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
      username: String(r.username || '').trim().toLowerCase(), auto: r.auto === true, status: String(r.status || ''),
    })).filter((r) => ((r.first && r.last) || EMAIL_RE.test(r.email)) && !leftCompany(r.status));
    rows.sort((x, y) => (x.code || '~').localeCompare(y.code || '~')); // earlier employee code keeps the short username
    const out = { created: [], updated: [], failed: [], extended: [] };
    const manual = (u) => u && metaOf(u).username && metaOf(u).username_auto === false;
    const taken = new Set(users.filter(manual).map((u) => String(metaOf(u).username).toLowerCase()));
    for (const r of rows) {
      // Link to an existing account: same employee code → same username → company email (first.l@domain or given).
      const conv = r.first && r.last ? `${r.first}.${r.last[0]}@${cfg.domain}` : '';
      let u = (r.code && byCode.get(r.code)) || (r.email && byEmail.get(r.email)) || (conv && byEmail.get(conv)) || (r.username && byUser.get(r.username)) || null;
      let username = manual(u) ? String(metaOf(u).username).toLowerCase() : r.username;
      if (!username) {
        if (!(r.first && r.last)) { out.failed.push(`${r.email || r.nick} (ไม่มีชื่อ-นามสกุลภาษาอังกฤษ)`); continue; }
        const f = r.first.slice(0, 30);
        for (let n = 1; n <= r.last.length && n <= 6 && !username; n++) { const c = `${f}.${r.last.slice(0, n)}`; if (!taken.has(c)) username = c; }
        for (let d = 2; !username && d < 10; d++) { const c = `${f}.${r.last[0]}${d}`; if (!taken.has(c)) username = c; }
        if (username !== `${f}.${r.last[0]}`) out.extended.push(`${r.nick || r.en} → ${username}`);
      }
      if (!USER_RE.test(username)) { out.failed.push(`${r.nick || r.en} (ชื่อผู้ใช้ ${username} ไม่ถูกรูปแบบ)`); continue; }
      taken.add(username);
      const meta = { username, username_auto: r.auto || (!manual(u) && !r.username) };
      if (r.nick) meta.full_name = r.nick;
      if (r.code) meta.employee_code = r.code;
      if (r.th) meta.name_th = r.th;
      if (r.en) meta.name_en = r.en;
      const email = u ? String(u.email).toLowerCase() : conv && conv === cfg.superAdmin ? conv : (r.email && inDomain(cfg, r.email) && !byEmail.has(r.email) ? r.email : internalEmail(cfg, username));
      const role = email === cfg.superAdmin ? 'admin' : (u && u.app_metadata && u.app_metadata.role === 'admin') ? 'admin' : r.role;
      const res = u
        ? await call(cfg, `/auth/v1/admin/users/${u.id}`, { method: 'PUT', admin: true, body: body.reset
          ? { password: cfg.defaultPassword, ban_duration: 'none', user_metadata: { ...meta, must_change_password: true }, app_metadata: { role } }
          : { user_metadata: meta, app_metadata: { role } } })
        : await call(cfg, '/auth/v1/admin/users', { admin: true, body: { email, password: cfg.defaultPassword, email_confirm: true, user_metadata: { ...meta, full_name: meta.full_name || username, must_change_password: true }, app_metadata: { role } } });
      if (res.ok && !u) { byEmail.set(email, res.data); byUser.set(username, res.data); }
      (res.ok ? (u ? out.updated : out.created) : out.failed).push(res.ok ? `${username} (${r.nick || r.en || email})` : `${username} (${errText(res.data) || res.status})`);
    }
    return json(out);
  }

  if (path === '/admin/api/delete-legacy') {
    // Remove old email-only accounts: no username yet and not the super admin. Refuses until the employee file
    // has been imported (at least one account besides the super admin has a username).
    const users = await listUsers(cfg);
    const hasUser = (u) => !!(u.user_metadata || {}).username;
    if (!users.some((u) => hasUser(u) && String(u.email).toLowerCase() !== cfg.superAdmin)) return json({ error: 'import first' }, 409);
    const want = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
    const out = { deleted: [], failed: [] };
    for (const u of users) {
      if (!want.has(u.id) || hasUser(u) || String(u.email).toLowerCase() === cfg.superAdmin) continue;
      const r = await call(cfg, `/auth/v1/admin/users/${u.id}`, { method: 'DELETE', admin: true });
      (r.ok ? out.deleted : out.failed).push(String(u.email));
    }
    return json(out);
  }

  if (path === '/admin/api/username') {
    const id = String(body.id || ''), username = String(body.username || '').trim().toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(id) || !USER_RE.test(username)) return json({ error: 'bad username' }, 400);
    const clash = (await listUsers(cfg)).find((u) => u.id !== id && String((u.user_metadata || {}).username || '').toLowerCase() === username);
    if (clash) return json({ error: 'taken' }, 409);
    const r = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'PUT', admin: true, body: { user_metadata: { username, username_auto: false } } });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }

  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad id' }, 400);
  const target = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'GET', admin: true });
  if (!target.ok) return json({ error: 'not found' }, 404);
  const isSuper = String(target.data.email || '').toLowerCase() === cfg.superAdmin;

  if (path === '/admin/api/reset') {
    const r = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'PUT', admin: true, body: { password: cfg.defaultPassword, user_metadata: { must_change_password: true }, ban_duration: 'none' } });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }
  if (path === '/admin/api/role') {
    if (isSuper) return json({ error: 'super admin' }, 400);
    const r = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'PUT', admin: true, body: { app_metadata: { role: body.role === 'admin' ? 'admin' : 'user' } } });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }
  if (path === '/admin/api/modules') {
    if (isSuper) return json({ error: 'super admin' }, 400);
    const list = Array.isArray(body.modules) ? [...new Set(body.modules.filter((id) => MENU_IDS.includes(id)))] : [];
    const r = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'PUT', admin: true, body: { app_metadata: { modules: list } } });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }
  if (path === '/admin/api/ban') {
    if (isSuper) return json({ error: 'super admin' }, 400);
    const r = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'PUT', admin: true, body: { ban_duration: body.ban ? '876000h' : 'none' } });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }
  if (path === '/admin/api/delete') {
    if (isSuper) return json({ error: 'super admin' }, 400);
    const r = await call(cfg, `/auth/v1/admin/users/${id}`, { method: 'DELETE', admin: true });
    return json({ ok: r.ok }, r.ok ? 200 : 502);
  }
  return json({ error: 'not found' }, 404);
}

function adminPage(cfg, me) {
  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ผู้ใช้งาน · SSM Work</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23121212'/%3E%3Ctext x='16' y='20.3' font-family='Arial,Helvetica,sans-serif' font-size='11.5' font-weight='700' fill='%23fff' text-anchor='middle' letter-spacing='-0.2'%3ESSM%3C/text%3E%3C/svg%3E">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--rak:#c70404;--rak-dark:#a00303;--blush:#fff0f0;--blush-2:#ffd9d9;--ink:#22252b;--muted:#6d7582;--line:#e6e8ed;--bg:#f5f6f8;--amber:#946719;--amber-soft:#fff4da;--green:#188764;--green-soft:#e9f7f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 "IBM Plex Sans Thai","Leelawadee UI",Tahoma,sans-serif}
.bar{background:#121212;color:#fff;position:sticky;top:0;z-index:30}.bar .in{max-width:1180px;margin:0 auto;padding:10px 24px;display:flex;align-items:center;gap:16px}
.bar img{height:26px}.bar .ws{font-size:10px;letter-spacing:2px;color:#b7b7b7;border-left:1px solid #3a3a3a;padding-left:16px}
.bar a{margin-left:auto;color:#fff;text-decoration:none;background:#2a2a2a;border-radius:999px;padding:5px 14px;font-size:12.5px}.bar a:hover{background:var(--rak)}
main{max-width:1180px;margin:0 auto;padding:26px 24px 60px;display:grid;gap:18px}
h1{margin:0;font-size:24px;font-weight:600}.sub{color:var(--muted);margin:2px 0 0}
.cards{display:flex;flex-wrap:wrap;gap:12px;position:sticky;top:50px;z-index:20;background:var(--bg);padding:10px 0;margin:-10px 0;box-shadow:0 10px 12px -12px rgba(18,18,18,.25)}.stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:110px}.stat b{display:block;font-size:22px;font-weight:600}.stat span{font-size:11.5px;color:var(--muted)}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;display:grid;gap:10px}
.panel h2{margin:0;font-size:15px;font-weight:600}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--ink)}.btn:hover{border-color:#f0b9b9;color:var(--rak)}
.btn.primary{background:var(--rak);border-color:var(--rak);color:#fff}.btn.primary:hover{background:var(--rak-dark)}
.btn:disabled{opacity:.45;cursor:not-allowed}
input[type=search]{border:1px solid #dce1e8;border-radius:8px;padding:7px 12px;font:inherit;min-width:260px}
.tbl{background:#fff;border:1px solid var(--line);border-radius:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:820px;font-size:13px}th{font-size:11px;font-weight:500;color:#8390a1;background:#f7f8fa;padding:10px 14px;text-align:left;border-bottom:1px solid var(--line)}
td{padding:10px 14px;border-bottom:1px solid #edf0f4;vertical-align:middle}tr:last-child td{border-bottom:0}
.pill{display:inline-block;white-space:nowrap;font-size:11px;border-radius:999px;padding:1px 9px;font-weight:500}
.p-admin{background:var(--blush);color:var(--rak)}.p-user{background:#f1f3f6;color:#5d6673}.p-wait{background:var(--amber-soft);color:var(--amber)}.p-ok{background:var(--green-soft);color:var(--green)}.p-ban{background:#2a2a2a;color:#fff}
.menus{display:flex;flex-direction:column;gap:2px}.chk{display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;white-space:nowrap}.chk input{accent-color:var(--rak);width:15px;height:15px}
.acts{display:flex;gap:6px;flex-wrap:wrap}.msg{font-size:13px;border-radius:8px;padding:8px 12px;background:var(--green-soft);color:var(--green)}.msg.err{background:var(--blush);color:var(--rak)}
.muted{color:var(--muted);font-size:12px}
</style></head><body>
<header class="bar"><div class="in"><img src="/assets/rak-logo.svg" alt="RAK Engineering"><span class="ws">SSM WORK · ผู้ดูแลระบบ</span><a href="/">← กลับหน้า SSM Work</a></div></header>
<main>
<div><h1>ผู้ใช้งาน</h1><p class="sub">เข้าระบบในชื่อ ${esc(me.username || me.email)} · บัญชีใหม่และบัญชีที่รีเซ็ตจะใช้รหัสเริ่มต้น และต้องตั้งรหัสใหม่ตอนเข้าครั้งแรก · บัญชีใหม่ยังเข้าเมนูไม่ได้ ติ๊กเมนูที่ให้สิทธิ์ (มีผลทันที)</p></div>
<div class="cards" id="stats"></div>
<section class="panel" style="border-color:#f0b9b9"><h2>🔄 รีเซ็ตผู้ใช้ทั้งหมดจาก RAK_Employee</h2>
<p class="muted">ลบบัญชีทั้งหมด แล้วสร้างใหม่จากรายชื่อพนักงาน · ชื่อผู้ใช้ = ชื่อ EN เต็ม . นามสกุลตัวแรก (ซ้ำ → เพิ่มตัวถัดไปของนามสกุล) · รหัสผ่านครั้งแรกเป็นรหัสเริ่มต้น และบังคับเปลี่ยนตอนเข้าครั้งแรก · บัญชี Super admin ไม่ถูกลบแต่ถูกรีเซ็ตรหัสเหมือนทุกคน · สิทธิ์เมนูเดิมจะหายทั้งหมด</p>
<div class="row"><span id="srcInfo" class="muted">กำลังตรวจหาตาราง RAK_Employee ใน Supabase…</span></div>
<div class="row"><button class="btn primary" id="resetAll">ล้างและสร้างผู้ใช้ใหม่ทั้งหมด</button><span class="muted" id="resetNote"></span></div>
<div id="resetMsg"></div></section>
<section class="panel"><h2>นำเข้ารายชื่อจาก Excel</h2>
<p class="muted">ใช้ไฟล์รายชื่อพนักงาน RAK (คอลัมน์ รหัส, ชื่อ, นามสกุล, ชื่อเล่น, ชื่อ (EN), นามสกุล (EN)) · ระบบสร้างชื่อผู้ใช้ = ชื่อ EN เต็ม . นามสกุล EN ตัวแรก ถ้าซ้ำกัน คนที่รหัสพนักงานใหม่กว่าจะได้ตัวอักษรนามสกุลเพิ่ม · ชื่อผู้ใช้ที่แก้เองด้วย ✎ จะไม่ถูกเปลี่ยนตอนนำเข้าซ้ำ · นำเข้าซ้ำได้ บัญชีเดิมจะอัปเดตชื่อโดยไม่เปลี่ยนรหัสผ่าน · บัญชีใหม่ใช้รหัสเริ่มต้นและต้องตั้งรหัสใหม่ตอนเข้าครั้งแรก</p>
<div class="row"><input type="file" id="file" accept=".xlsx,.xls,.csv"><button class="btn primary" id="doImport" disabled>นำเข้า</button><span class="muted" id="preview"></span></div>
<div id="importMsg"></div></section>
<section class="panel"><h2>เพิ่มผู้ใช้ทีละคน</h2>
<div class="row"><input type="search" id="nFirst" placeholder="ชื่อ (EN) เช่น Nantana"><input type="search" id="nLast" placeholder="นามสกุล (EN) เช่น Sriskultiew"><input type="search" id="nName" placeholder="ชื่อเล่น เช่น ดิว"><button class="btn primary" id="addOne">เพิ่ม</button><span class="muted" id="nPreview"></span></div></section>
<section class="panel" id="legacy" hidden><h2>บัญชีอีเมลเก่า (ยังไม่มีชื่อผู้ใช้)</h2><p class="muted">บัญชีที่เคยนำเข้าด้วยอีเมลและไม่ตรงกับรายชื่อพนักงาน · Super admin ไม่ถูกลบ · ลบแล้วย้อนกลับไม่ได้</p><div class="row"><span id="legacyList" class="muted"></span></div><div class="row"><button class="btn primary" id="delLegacy">ลบบัญชีอีเมลเก่าทั้งหมด</button><span class="muted" id="legacyNote"></span></div><div id="legacyMsg"></div></section>
<div class="row"><input type="search" id="q" placeholder="ค้นหาชื่อผู้ใช้ ชื่อ หรือรหัสพนักงาน…"><span class="muted" id="count"></span></div>
<div id="msg"></div>
<div class="tbl"><table><thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th>เมนูที่เข้าได้</th><th>สถานะ</th><th>เข้าล่าสุด</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="7" class="muted">กำลังโหลด…</td></tr></tbody></table></div>
</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script>
"use strict";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let USERS=[],PENDING_ROWS=[];
const MENUS=${JSON.stringify(MENUS)};
const post=(p,b)=>fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json().then(d=>({ok:r.ok,d})));
function say(t,err,el="msg"){document.getElementById(el).innerHTML=t?'<div class="msg'+(err?' err':'')+'">'+t+'</div>':"";}
async function load(){const r=await fetch("/admin/api/users",{cache:"no-store"});if(!r.ok){say("โหลดรายชื่อไม่สำเร็จ ("+r.status+")",1);return;}USERS=await r.json();draw();}
function menusCell(u){
  const se='<label class="chk" title="กำหนดตามรายชื่อในระบบ ไม่ใช่ติ๊กที่นี่"><input type="checkbox" disabled'+(u.modules.includes("site-expense")?" checked":"")+'> Site Expense <span class="muted">(ตามรายชื่อ)</span></label>';
  if(u.role==="admin")return '<div class="menus"><span class="muted">ทุกเมนู (ผู้ดูแล)</span>'+se+'</div>';
  return '<div class="menus">'+MENUS.filter(m=>m.id!=="site-expense").map(m=>'<label class="chk"><input type="checkbox" data-u="'+u.id+'" value="'+m.id+'"'+(u.modules.includes(m.id)?" checked":"")+'> '+esc(m.name)+'</label>').join("")+se+'</div>';
}
let EMP_TABLE=null;
fetch("/admin/api/employees",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{EMP_TABLE=d;document.getElementById("srcInfo").innerHTML=d?"ใช้ข้อมูลจากตาราง <b>"+esc(d.table)+"</b> ใน Supabase · "+d.count+" แถว":"ไม่พบตาราง RAK_Employee ใน Supabase · เลือกไฟล์ RAK_Employee.xlsx ในกล่อง นำเข้ารายชื่อจาก Excel ด้านล่างก่อน แล้วกดปุ่มนี้";}).catch(()=>{});
const chunks=(a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
document.getElementById("resetAll").addEventListener("click",async e=>{
  const m=t=>say(t,0,"resetMsg"),bad=t=>say(t,1,"resetMsg");
  if(!EMP_TABLE&&!PENDING_ROWS.some(r=>r.first)){bad("ยังไม่มีรายชื่อ · เลือกไฟล์ RAK_Employee.xlsx ด้านล่างก่อน");return;}
  e.target.disabled=true;m("กำลังเตรียมชื่อผู้ใช้…");
  const pl=await post("/admin/api/plan",EMP_TABLE?{source:"table"}:{rows:PENDING_ROWS});
  if(!pl.ok||!pl.d.rows||!pl.d.rows.length){bad("อ่านรายชื่อพนักงานไม่สำเร็จ");e.target.disabled=false;return;}
  const P=pl.d,others=USERS.filter(u=>!u.superAdmin);
  const ok=prompt("จะลบบัญชี "+others.length+" บัญชี และสร้างใหม่ "+P.rows.length+" คนจาก "+P.source+(P.extended.length?" (ชื่อซ้ำ: "+P.extended.join(", ")+")":"")+(P.skipped?" · ข้ามคนที่ไม่มีชื่อ EN หรือลาออก "+P.skipped+" แถว":"")+" · รหัสผ่านทุกคนรวมถึงของคุณจะกลับเป็นรหัสเริ่มต้น ย้อนกลับไม่ได้ · พิมพ์ RESET เพื่อยืนยัน");
  if(ok!=="RESET"){m("ยกเลิกแล้ว");e.target.disabled=false;return;}
  let del=0,delFail=[];
  for(const c of chunks(others.map(u=>u.id),20)){m("กำลังลบบัญชีเดิม… "+del+"/"+others.length);const r=await post("/admin/api/delete-many",{ids:c});if(r.ok){del+=r.d.deleted;delFail.push(...r.d.failed);}else delFail.push(c.length+" บัญชี");}
  let made=0,upd=0,fail=[];
  for(const c of chunks(P.rows,12)){m("กำลังสร้างผู้ใช้… "+(made+upd)+"/"+P.rows.length);const r=await post("/admin/api/import",{rows:c,reset:true});if(r.ok){made+=r.d.created.length;upd+=r.d.updated.length;fail.push(...r.d.failed);}else fail.push(c.length+" คน (ขัดข้อง)");}
  const sum="ลบ "+del+" บัญชี · สร้างใหม่ "+made+" · รีเซ็ต "+upd+(P.extended.length?"<br>ชื่อซ้ำ: "+esc(P.extended.join(", ")):"")+(delFail.length||fail.length?"<br>ไม่สำเร็จ: "+esc(delFail.concat(fail).join(", ")):"");
  say(sum+"<br>รหัสผ่านของคุณถูกรีเซ็ตแล้ว · กำลังออกจากระบบ ให้เข้าใหม่ด้วยชื่อผู้ใช้และรหัสเริ่มต้น แล้วตั้งรหัสใหม่",delFail.length+fail.length>0,"resetMsg");
  setTimeout(()=>{location.href="/auth/logout";},8000);
});
function drawLegacy(){
  const old=USERS.filter(u=>!u.username&&!u.superAdmin),ready=USERS.some(u=>u.username&&!u.superAdmin);
  document.getElementById("legacy").hidden=!old.length;
  document.getElementById("legacyList").textContent=old.length+" บัญชี: "+old.map(u=>u.email).join(", ");
  document.getElementById("delLegacy").disabled=!ready;
  document.getElementById("legacyNote").textContent=ready?"":"นำเข้าไฟล์พนักงานก่อน เพื่อให้บัญชีที่ตรงกับพนักงาน (เช่น บี) ได้ชื่อผู้ใช้และไม่ถูกลบ";
}
document.getElementById("delLegacy").addEventListener("click",async e=>{
  const old=USERS.filter(u=>!u.username&&!u.superAdmin);if(!old.length)return;
  if(!confirm("ลบบัญชีอีเมลเก่า "+old.length+" บัญชีถาวร?\\n\\n"+old.map(u=>u.email).join("\\n")+"\\n\\nย้อนกลับไม่ได้"))return;
  e.target.disabled=true;const r=await post("/admin/api/delete-legacy",{ids:old.map(u=>u.id)});
  say(r.ok?"ลบแล้ว "+r.d.deleted.length+" บัญชี"+(r.d.failed.length?" · ไม่สำเร็จ "+esc(r.d.failed.join(", ")):""):r.d&&r.d.error==="import first"?"นำเข้าไฟล์พนักงานก่อน":"ลบไม่สำเร็จ",!r.ok||r.d.failed.length>0,"legacyMsg");await load();
});
function draw(){
  drawLegacy();
  const q=document.getElementById("q").value.trim().toLowerCase();
  const list=USERS.filter(u=>!q||(u.username+" "+u.email+" "+u.name+" "+u.nameTh+" "+u.code).toLowerCase().includes(q));
  const n=k=>USERS.filter(k).length;
  document.getElementById("stats").innerHTML=[["ทั้งหมด",USERS.length],["รอตั้งรหัสครั้งแรก",n(u=>u.mustChange&&!u.banned)],["ตั้งรหัสแล้ว",n(u=>!u.mustChange&&!u.banned)],["ปิดใช้งาน",n(u=>u.banned)],["ผู้ดูแล",n(u=>u.role==="admin")]].map(([l,v])=>'<div class="stat"><b>'+v+'</b><span>'+l+'</span></div>').join("");
  document.getElementById("count").textContent=list.length+" บัญชี";
  document.getElementById("rows").innerHTML=list.map(u=>{
    const st=u.banned?'<span class="pill p-ban">ปิดใช้งาน</span>':u.mustChange?'<span class="pill p-wait">รอตั้งรหัสครั้งแรก</span>':'<span class="pill p-ok">ใช้งานได้</span>';
    const last=u.lastSignIn?new Date(u.lastSignIn).toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"}):"—";
    const dis=u.superAdmin?" disabled":"";
    return '<tr><td>'+(u.username?'<b style="font-weight:600;font-size:14px">'+esc(u.username)+'</b>':'<span class="pill p-wait">ยังไม่มีชื่อผู้ใช้</span>')+(u.superAdmin?' <span class="pill p-admin">Super admin</span>':'')+' <button class="btn" style="padding:1px 7px" data-a="username" data-id="'+u.id+'" title="แก้ชื่อผู้ใช้">✎</button><div class="muted">'+(u.internal?'ใช้อีเมลกลาง / ไม่มีอีเมล':esc(u.email))+'</div></td><td>'+esc(u.name)+(u.nameTh?'<div class="muted">'+esc(u.nameTh)+(u.code?' · '+esc(u.code):'')+'</div>':'')+'</td><td><span class="pill '+(u.role==="admin"?"p-admin":"p-user")+'">'+(u.role==="admin"?"ผู้ดูแล":"ผู้ใช้")+'</span></td><td>'+menusCell(u)+'</td><td>'+st+'</td><td class="muted">'+last+'</td><td><div class="acts">'
      +'<button class="btn" data-a="reset" data-id="'+u.id+'">รีเซ็ตรหัส</button>'
      +'<button class="btn" data-a="role" data-id="'+u.id+'" data-v="'+(u.role==="admin"?"user":"admin")+'"'+dis+'>'+(u.role==="admin"?"ถอดผู้ดูแล":"ตั้งเป็นผู้ดูแล")+'</button>'
      +'<button class="btn" data-a="ban" data-id="'+u.id+'" data-v="'+(u.banned?"0":"1")+'"'+dis+'>'+(u.banned?"เปิดใช้งาน":"ปิดใช้งาน")+'</button>'
      +'<button class="btn" data-a="delete" data-id="'+u.id+'"'+dis+'>ลบ</button></div></td></tr>';
  }).join("")||'<tr><td colspan="7" class="muted">ยังไม่มีผู้ใช้ นำเข้าจาก Excel ด้านบนได้เลย</td></tr>';
}
document.getElementById("q").addEventListener("input",draw);
document.getElementById("rows").addEventListener("change",async e=>{
  const c=e.target.closest("input[data-u]");if(!c)return;
  const id=c.dataset.u,u=USERS.find(x=>x.id===id);
  const mods=[...document.querySelectorAll('input[data-u="'+id+'"]')].filter(x=>x.checked).map(x=>x.value);
  document.querySelectorAll('input[data-u="'+id+'"]').forEach(x=>x.disabled=true);
  const r=await post("/admin/api/modules",{id,modules:mods});
  say(r.ok?"บันทึกสิทธิ์เมนูของ "+esc(u.email)+" แล้ว":"บันทึกสิทธิ์ไม่สำเร็จ: "+esc(u.email),!r.ok);await load();
});
document.getElementById("rows").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-a]");if(!b)return;const u=USERS.find(x=>x.id===b.dataset.id);const a=b.dataset.a;
  if(a==="username"){const v=prompt("ชื่อผู้ใช้ใหม่ของ "+(u.name||u.email)+" (เช่น nantana.s)",u.username||"");if(v===null)return;const r=await post("/admin/api/username",{id:u.id,username:v.trim().toLowerCase()});say(r.ok?"เปลี่ยนชื่อผู้ใช้เป็น "+esc(v.trim().toLowerCase())+" แล้ว":r.d&&r.d.error==="taken"?"ชื่อผู้ใช้นี้มีคนใช้แล้ว":"ชื่อผู้ใช้ไม่ถูกรูปแบบ (ตัวอย่าง nantana.s)",!r.ok);await load();return;}
  const who=u.username||u.email;const ask={reset:"รีเซ็ตรหัสของ "+who+" กลับเป็นรหัสเริ่มต้น และบังคับตั้งใหม่ตอนเข้าครั้งถัดไป?",delete:"ลบบัญชี "+who+" ถาวร? ย้อนกลับไม่ได้",ban:(b.dataset.v==="1"?"ปิด":"เปิด")+"การใช้งานบัญชี "+u.email+"?",role:(b.dataset.v==="admin"?"ตั้ง ":"ถอด ")+u.email+(b.dataset.v==="admin"?" เป็นผู้ดูแล?":" ออกจากผู้ดูแล?")}[a];
  if(!confirm(ask))return;b.disabled=true;
  const r=await post("/admin/api/"+a,{id:u.id,ban:b.dataset.v==="1",role:b.dataset.v});
  say(r.ok?"เรียบร้อย: "+esc(u.email):"ทำไม่สำเร็จ: "+esc(u.email),!r.ok);await load();
});
const norm=x=>String(x).toLowerCase().split(" ").join("");
const genUser=(f,l)=>{f=String(f).toLowerCase().replace(/[^a-z]/g,"");l=String(l).toLowerCase().replace(/[^a-z]/g,"");return f&&l?f+"."+l[0]:"";};
document.getElementById("file").addEventListener("change",async e=>{
  const f=e.target.files[0];PENDING_ROWS=[];document.getElementById("doImport").disabled=true;if(!f)return;
  const wb=XLSX.read(await f.arrayBuffer());const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  const h=(rows[0]||[]).map(norm);
  const at=(...k)=>h.findIndex(x=>k.includes(x));
  const iFe=at("ชื่อ(en)","firstname(en)","firstname"),iLe=at("นามสกุล(en)","lastname(en)","lastname","surname");
  if(iFe>=0&&iLe>=0){ // RAK employee file
    const iC=at("รหัส","รหัสพนักงาน","code"),iN=at("ชื่อเล่น"),iF=at("ชื่อ"),iL=at("นามสกุล"),iP=at("คำนำหน้า"),iE=at("อีเมล","email","e-mail");
    PENDING_ROWS=rows.slice(1).map(r=>({code:iC>=0?String(r[iC]).trim():"",first:String(r[iFe]).trim(),last:String(r[iLe]).trim(),nick:iN>=0?String(r[iN]).trim():"",
      th:[iF,iL].filter(i=>i>=0).map(i=>String(r[i]).trim()).filter(Boolean).join(" "),email:iE>=0?String(r[iE]).trim():""})).filter(r=>r.first&&r.last);
    const c={};PENDING_ROWS.forEach(r=>{const u=genUser(r.first,r.last);c[u]=(c[u]||0)+1;});
    const dup=Object.entries(c).filter(([,n])=>n>1).map(([u])=>u);
    document.getElementById("preview").textContent=PENDING_ROWS.length+" คน"+(dup.length?" · ชื่อผู้ใช้ซ้ำ "+dup.length+" ชุด ("+dup.join(", ")+") คนรหัสใหม่กว่าจะได้ตัวอักษรนามสกุลเพิ่ม":"");
  } else {
    const ci=k=>h.findIndex(x=>k.some(w=>x.includes(w)));
    const ie=ci(["อีเมล","email","e-mail"]),inm=ci(["ชื่อ","name"]),ir=ci(["role","สิทธิ์"]);
    if(ie<0){document.getElementById("preview").textContent="ไม่พบคอลัมน์ ชื่อ (EN) / นามสกุล (EN) ในแถวแรก";return;}
    PENDING_ROWS=rows.slice(1).map(r=>({email:String(r[ie]).trim(),name:inm>=0?String(r[inm]).trim():"",role:ir>=0?String(r[ir]).trim():""})).filter(r=>r.email.includes("@"));
    document.getElementById("preview").textContent=PENDING_ROWS.length+" แถว (ไฟล์แบบอีเมล · ต้องตั้งชื่อผู้ใช้เองภายหลัง)";
  }
  document.getElementById("doImport").disabled=!PENDING_ROWS.length;
});
const report=d=>"สร้างใหม่ "+d.created.length+" · อัปเดต "+d.updated.length+(d.extended&&d.extended.length?"<br>ชื่อผู้ใช้ที่เพิ่มตัวอักษรเพราะซ้ำ: "+esc(d.extended.join(", ")):"")+(d.failed.length?"<br>ไม่สำเร็จ "+d.failed.length+": "+esc(d.failed.join(", ")):"");
document.getElementById("doImport").addEventListener("click",async e=>{
  e.target.disabled=true;say("กำลังนำเข้า… (ประมาณ 1 นาทีสำหรับ 100 คน)",0,"importMsg");
  const r=await post("/admin/api/import",{rows:PENDING_ROWS});
  if(!r.ok){say("นำเข้าไม่สำเร็จ",1,"importMsg");e.target.disabled=false;return;}
  say(report(r.d),r.d.failed.length>0,"importMsg");await load();
});
const nPrev=()=>{const u=genUser(document.getElementById("nFirst").value,document.getElementById("nLast").value);document.getElementById("nPreview").textContent=u?"ชื่อผู้ใช้: "+u+(USERS.some(x=>x.username===u)?" (ซ้ำ ระบบจะเพิ่มตัวอักษรนามสกุล)":""):"";};
["nFirst","nLast"].forEach(id=>document.getElementById(id).addEventListener("input",nPrev));
document.getElementById("addOne").addEventListener("click",async e=>{
  const first=document.getElementById("nFirst").value.trim(),last=document.getElementById("nLast").value.trim(),nick=document.getElementById("nName").value.trim();
  if(!genUser(first,last)){say("กรอกชื่อและนามสกุลภาษาอังกฤษ",1);return;}
  e.target.disabled=true;const r=await post("/admin/api/import",{rows:[{first,last,nick}]});e.target.disabled=false;
  say(r.ok?report(r.d):"เพิ่มไม่สำเร็จ",!r.ok||(r.d.failed||[]).length>0);
  ["nFirst","nLast","nName"].forEach(id=>document.getElementById(id).value="");nPrev();await load();
});
load();
</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// ---------- main ----------
export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const env = (typeof process !== 'undefined' && process.env) || {};
  const cfg = {
    url: (env.SUPABASE_URL || '').replace(/\/$/, ''), anon: env.SUPABASE_ANON_KEY, service: env.SUPABASE_SERVICE_ROLE_KEY,
    secret: env.SESSION_SECRET, domain: (env.ALLOWED_DOMAIN || 'rak.co.th').toLowerCase().replace(/^@/, ''),
    app: (env.APP_URL || url.origin).replace(/\/$/, ''), superAdmin: String(env.SUPER_ADMIN || '').trim().toLowerCase(),
    defaultPassword: env.DEFAULT_PASSWORD || '',
  };

  // Logo on the sign-in page is public; nothing else is.
  if (path === '/assets/rak-logo.svg') return;

  if (!cfg.url || !cfg.anon || !cfg.service || !cfg.secret || cfg.secret.length < 32 || !cfg.superAdmin || cfg.defaultPassword.length < 6) {
    return page({ status: 503, title: 'กำลังตั้งค่า', body: `${LOCK}<h1>ระบบ login กำลังตั้งค่า</h1><p>ผู้ดูแลยังตั้งค่าการเข้าสู่ระบบไม่ครบ เว็บจึงปิดไว้ก่อนเพื่อความปลอดภัย</p><div class="note">ผู้ดูแล: ใส่ <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code>, <code>SUPER_ADMIN</code> และ <code>DEFAULT_PASSWORD</code> ใน Vercel แล้ว redeploy</div>` });
  }

  // n8n pushes the Service Plan sheet here (token, no session; not a browser form).
  if (path === '/api/service-plan/sync') {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    try { return await servicePlanSync(cfg, env, req); } catch { return json({ error: 'supabase' }, 502); }
  }

  // Forms post to APP_URL so every cookie lives on one host.
  if (req.method === 'POST' && url.origin !== cfg.app) return json({ error: 'wrong host' }, 400);
  if (req.method === 'POST') {
    const origin = req.headers.get('origin');
    if (origin && origin !== cfg.app) return json({ error: 'bad origin' }, 403);
  }

  if (path === '/auth/login') {
    if (req.method !== 'POST') return Response.redirect(cfg.app + '/', 302);
    const form = await req.formData().catch(() => null);
    const login = String(form?.get('username') || form?.get('email') || '').trim().toLowerCase();
    const password = String(form?.get('password') || '');
    const next = safeNext(String(form?.get('next') || '/'));
    const fail = (error, status = 401) => signInPage(cfg, next, { status, email: login, error });
    let email = '';
    if (login.includes('@')) { // fallback: company email (also how the super admin bootstraps the very first account)
      if (!EMAIL_RE.test(login) || !inDomain(cfg, login)) return fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      email = login;
    } else {
      if (!USER_RE.test(login)) return fail('ชื่อผู้ใช้ไม่ถูกรูปแบบ · ชื่อภาษาอังกฤษเต็ม . นามสกุลตัวแรก เช่น nantana.s', 400);
      const users = await listUsers(cfg).catch(() => null);
      if (!users) return fail('ระบบไม่พร้อมชั่วคราว ลองใหม่อีกครั้ง', 503);
      const u = users.find((x) => String((x.user_metadata || {}).username || '').toLowerCase() === login);
      if (!u) return fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      email = String(u.email).toLowerCase();
    }

    let r = await call(cfg, '/auth/v1/token?grant_type=password', { body: { email, password } });
    // First run: the super admin account is created on its first sign-in with the default password.
    if (!r.ok && email === cfg.superAdmin && password === cfg.defaultPassword) {
      const c = await call(cfg, '/auth/v1/admin/users', { admin: true, body: { email, password, email_confirm: true, user_metadata: { full_name: email.split('@')[0], must_change_password: true }, app_metadata: { role: 'admin' } } });
      if (c.ok) r = await call(cfg, '/auth/v1/token?grant_type=password', { body: { email, password } });
    }
    if (!r.ok) {
      if (r.status === 429) return fail('ลองเข้าระบบถี่เกินไป รอสักครู่แล้วลองใหม่', 429);
      if (errText(r.data).includes('banned')) return fail('บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ', 403);
      return fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    const prof = profileOf(cfg, r.data.user || {});
    if (!inDomain(cfg, prof.email)) return fail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 403);
    if (prof.mustChange || password === cfg.defaultPassword) {
      const pending = await makeToken(cfg.secret, { ...prof, at: r.data.access_token, next, exp: Math.floor(Date.now() / 1000) + 15 * 60 });
      return passwordPage(cfg, { first: true, headers: { 'set-cookie': setCookie(PENDING, pending, 15 * 60) } });
    }
    return startSession(cfg, prof, next);
  }

  if (path === '/auth/logout') {
    const h = new Headers();
    h.append('set-cookie', setCookie(SESSION, '', 0));
    h.append('set-cookie', setCookie(PENDING, '', 0));
    return signInPage(cfg, '/', { status: 200, heading: 'ออกจากระบบแล้ว', msg: 'แล้วพบกันใหม่ 👋', headers: h });
  }

  const pending = await readToken(cfg.secret, getCookie(req, PENDING));
  const user = await readToken(cfg.secret, getCookie(req, SESSION));
  const signedIn = user && inDomain(cfg, user.email);

  if (path === '/auth/password') {
    if (!pending && !signedIn) return signInPage(cfg, '/auth/password', { error: 'กรุณาเข้าสู่ระบบก่อน' });
    const first = !!pending;
    if (req.method !== 'POST') return passwordPage(cfg, { first });
    const form = await req.formData().catch(() => null);
    const pw = String(form?.get('password') || ''), confirm = String(form?.get('confirm') || '');
    const who = first ? pending : user;
    const bad = checkNewPassword(cfg, pw, confirm, who.username ? who.username + '@' : who.email);
    if (bad) return passwordPage(cfg, { first, error: bad, status: 400 });
    let at = first ? pending.at : null;
    if (!first) {
      const g = await call(cfg, '/auth/v1/token?grant_type=password', { body: { email: user.email, password: String(form?.get('current') || '') } });
      if (!g.ok) return passwordPage(cfg, { first, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง', status: 400 });
      at = g.data.access_token;
    }
    const u = await call(cfg, '/auth/v1/user', { method: 'PUT', bearer: at, body: { password: pw, data: { must_change_password: false } } });
    if (!u.ok) {
      const t = errText(u.data);
      return passwordPage(cfg, { first, status: 400, error: t.includes('different') ? 'รหัสใหม่ต้องไม่ซ้ำรหัสเดิม' : t.includes('weak') || t.includes('characters') ? 'รหัสผ่านง่ายเกินไป ลองใส่ตัวเลขและตัวอักษรผสมกัน' : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' });
    }
    const prof = { id: who.id, email: who.email, username: who.username, name: who.name, role: who.role, modules: who.modules };
    return startSession(cfg, prof, first ? pending.next : '/');
  }

  const signedOut = (msg) => {
    const h = new Headers();
    h.append('set-cookie', setCookie(SESSION, '', 0));
    return signInPage(cfg, path + url.search, { error: msg, headers: h });
  };

  if (path === '/auth/me') {
    if (!signedIn) return json({}, 401);
    const live = await liveProfile(cfg, user);
    if (!live) return json({}, 401);
    return json({ email: live.email, username: live.username, name: live.name, role: live.role, modules: effectiveMenus(live), siteExpense: sitePerms(live), manpowerEdit: canEditManpower(live) });
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!signedIn) return signInPage(cfg, '/admin');
    const live = await liveProfile(cfg, user);
    if (!live) return signedOut('บัญชีนี้ถูกปิดใช้งานหรือถูกลบ ติดต่อผู้ดูแลระบบ');
    if (live.role !== 'admin') return page({ status: 403, title: 'ไม่มีสิทธิ์', body: `${LOCK}<h1>หน้านี้สำหรับผู้ดูแลระบบ</h1><p>บัญชี ${esc(user.username || user.email)} ไม่มีสิทธิ์จัดการผู้ใช้</p><div class="links"><a href="/">← กลับหน้า SSM Work</a></div>` });
    if (path.startsWith('/admin/api/')) {
      try { return await adminApi(cfg, req, path); } catch { return json({ error: 'supabase' }, 502); }
    }
    return adminPage(cfg, live);
  }

  if (path.startsWith('/api/spare-part/')) {
    if (!signedIn) return json({ error: 'login required' }, 401);
    const live = await liveProfile(cfg, user);
    if (!live) return json({ error: 'login required' }, 401);
    if (!canOpen(live, 'spare-part')) return json({ error: 'no access' }, 403);
    try { return await sparePartApi(cfg, req, url, live); } catch { return json({ error: 'supabase' }, 502); }
  }

  if (path.startsWith('/api/manpower/')) {
    if (!signedIn) return json({ error: 'login required' }, 401);
    const live = await liveProfile(cfg, user);
    if (!live) return json({ error: 'login required' }, 401);
    if (!canOpen(live, 'manpower')) return json({ error: 'no access' }, 403);
    try { return await manpowerApi(cfg, req, url, live); } catch { return json({ error: 'supabase' }, 502); }
  }

  if (path.startsWith('/api/service-plan/')) {
    if (!signedIn) return json({ error: 'login required' }, 401);
    const live = await liveProfile(cfg, user);
    if (!live) return json({ error: 'login required' }, 401);
    if (!canOpen(live, 'service-plan')) return json({ error: 'no access' }, 403);
    try { return await servicePlanApi(cfg, req, url); } catch { return json({ error: 'supabase' }, 502); }
  }

  if (signedIn) {
    const menu = menuOfPath(path);
    const navigating = req.headers.get('sec-fetch-mode') === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
    let prof = user;
    if (navigating || menu !== null) { // tool files always check the live account
      prof = await liveProfile(cfg, user);
      if (!prof) return navigating ? signedOut('บัญชีนี้ถูกปิดใช้งานหรือถูกลบ ติดต่อผู้ดูแลระบบ') : json({ error: 'login required' }, 401);
    }
    if (canOpen(prof, menu)) return; // continue to the static file
    if (!navigating) return json({ error: 'no access' }, 403);
    const name = (MENUS.find((m) => m.id === menu) || { name: 'เครื่องมือนี้' }).name;
    return page({ status: 403, title: 'ไม่มีสิทธิ์', body: `${LOCK}<h1>ยังไม่มีสิทธิ์เข้าเมนู ${esc(name)}</h1><p>บัญชี ${esc(prof.username || prof.email)} ยังไม่ได้รับสิทธิ์เมนูนี้ ขอสิทธิ์ได้จากผู้ดูแลระบบ</p><div class="links"><a href="/">← กลับหน้า SSM Work</a></div>` });
  }

  const navigating = req.headers.get('sec-fetch-mode') === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (!navigating) return json({ error: 'login required' }, 401);
  return signInPage(cfg, path + url.search);
}
