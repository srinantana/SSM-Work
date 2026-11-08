// SSM Work login gate — Vercel Routing Middleware + Supabase Auth (email + password).
// Accounts are created by the super admin at /admin from the company email list. New accounts get
// DEFAULT_PASSWORD and must set their own password at first sign-in. Only ALLOWED_DOMAIN addresses can sign in.
// Env vars (Vercel → Project ssmwork → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY  – Supabase project URL and publishable (anon) key. Not secret.
//   SUPABASE_SERVICE_ROLE_KEY        – secret key (sb_secret_… or legacy service_role); /admin only. Never expose it.
//   SESSION_SECRET                   – long random string used to sign the session cookie
//   APP_URL                          – https://ssmwork.vercel.app
//   ALLOWED_DOMAIN                   – rak.co.th
//   SUPER_ADMIN                      – nantana.s@rak.co.th (always admin; cannot be disabled or deleted)
//   DEFAULT_PASSWORD                 – first-login password for new / reset accounts
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
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23c70404'/%3E%3Cpath d='M9 22V10h7a4 4 0 0 1 0 8h-7m7 0 5 4' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
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
input[type=email],input[type=password]{width:100%;font:inherit;border:1px solid #dce1e8;border-radius:10px;padding:11px 14px;color:var(--ink)}
input[type=email]:focus,input[type=password]:focus{outline:3px solid #f3c2c2;border-color:var(--rak)}
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
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function signInPage(cfg, next, { status = 401, heading = 'เข้าสู่ระบบ SSM Work', msg, error, notice, email = '', headers } = {}) {
  return page({
    status, title: 'เข้าสู่ระบบ', headers,
    body: `${LOCK}<h1>${esc(heading)}</h1><p>${msg || `สำหรับพนักงาน RAK Engineering ใช้อีเมล <b>@${esc(cfg.domain)}</b> ของคุณ`}</p>
${notice ? `<div class="ok">${notice}</div>` : ''}${error ? `<div class="err">${error}</div>` : ''}
<form method="post" action="${esc(cfg.app)}/auth/login">
<input type="hidden" name="next" value="${esc(next)}">
<label class="f">อีเมลบริษัท<input type="email" name="email" required autocomplete="username" inputmode="email" placeholder="name@${esc(cfg.domain)}" value="${esc(email)}"></label>
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
  return { email, name: meta.full_name || email.split('@')[0], role, mustChange: meta.must_change_password === true };
}

async function startSession(cfg, prof, next) {
  const token = await makeToken(cfg.secret, { email: prof.email, name: prof.name, role: prof.role, exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600 });
  const h = new Headers({ location: cfg.app + safeNext(next), 'cache-control': 'no-store' });
  h.append('set-cookie', setCookie(SESSION, token, SESSION_HOURS * 3600));
  h.append('set-cookie', setCookie(PENDING, '', 0));
  return new Response(null, { status: 302, headers: h });
}

function checkNewPassword(cfg, pw, confirm, email) {
  if (pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
  if (pw !== confirm) return 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน';
  if (pw === cfg.defaultPassword) return 'ห้ามใช้รหัสผ่านเริ่มต้น กรุณาตั้งรหัสใหม่';
  if (pw.toLowerCase() === email.split('@')[0]) return 'อย่าใช้ชื่ออีเมลเป็นรหัสผ่าน';
  return null;
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
      return { id: u.id, email: p.email, name: p.name, role: p.role, mustChange: p.mustChange, banned: !!(u.banned_until && new Date(u.banned_until) > new Date()), lastSignIn: u.last_sign_in_at || null, superAdmin: p.email === cfg.superAdmin };
    }).sort((a, b) => a.email.localeCompare(b.email)));
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const body = await req.json().catch(() => ({}));

  if (path === '/admin/api/import') {
    const merged = new Map();
    for (const row of Array.isArray(body.rows) ? body.rows.slice(0, 2000) : []) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email) || !email.endsWith('@' + cfg.domain)) continue;
      const m = merged.get(email) || { email, names: [], role: 'user' };
      const name = String(row.name || '').trim();
      if (name && !m.names.includes(name)) m.names.push(name);
      if (String(row.role || '').trim().toLowerCase() === 'admin') m.role = 'admin';
      merged.set(email, m);
    }
    const existing = new Map((await listUsers(cfg)).map((u) => [String(u.email).toLowerCase(), u]));
    const out = { created: [], updated: [], failed: [] };
    for (const m of merged.values()) {
      const full_name = m.names.join(' / ') || m.email.split('@')[0];
      const role = m.email === cfg.superAdmin ? 'admin' : m.role;
      const u = existing.get(m.email);
      const r = u
        ? await call(cfg, `/auth/v1/admin/users/${u.id}`, { method: 'PUT', admin: true, body: { user_metadata: { full_name }, app_metadata: { role } } })
        : await call(cfg, '/auth/v1/admin/users', { admin: true, body: { email: m.email, password: cfg.defaultPassword, email_confirm: true, user_metadata: { full_name, must_change_password: true }, app_metadata: { role } } });
      (r.ok ? (u ? out.updated : out.created) : out.failed).push(r.ok ? m.email : `${m.email} (${errText(r.data) || r.status})`);
    }
    return json(out);
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
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--rak:#c70404;--rak-dark:#a00303;--blush:#fff0f0;--blush-2:#ffd9d9;--ink:#22252b;--muted:#6d7582;--line:#e6e8ed;--bg:#f5f6f8;--amber:#946719;--amber-soft:#fff4da;--green:#188764;--green-soft:#e9f7f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 "IBM Plex Sans Thai","Leelawadee UI",Tahoma,sans-serif}
.bar{background:#121212;color:#fff}.bar .in{max-width:1180px;margin:0 auto;padding:10px 24px;display:flex;align-items:center;gap:16px}
.bar img{height:26px}.bar .ws{font-size:10px;letter-spacing:2px;color:#b7b7b7;border-left:1px solid #3a3a3a;padding-left:16px}
.bar a{margin-left:auto;color:#fff;text-decoration:none;background:#2a2a2a;border-radius:999px;padding:5px 14px;font-size:12.5px}.bar a:hover{background:var(--rak)}
main{max-width:1180px;margin:0 auto;padding:26px 24px 60px;display:grid;gap:18px}
h1{margin:0;font-size:24px;font-weight:600}.sub{color:var(--muted);margin:2px 0 0}
.cards{display:flex;flex-wrap:wrap;gap:12px}.stat{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 16px;min-width:110px}.stat b{display:block;font-size:22px;font-weight:600}.stat span{font-size:11.5px;color:var(--muted)}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;display:grid;gap:10px}
.panel h2{margin:0;font-size:15px;font-weight:600}.row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--ink)}.btn:hover{border-color:#f0b9b9;color:var(--rak)}
.btn.primary{background:var(--rak);border-color:var(--rak);color:#fff}.btn.primary:hover{background:var(--rak-dark)}
.btn:disabled{opacity:.45;cursor:not-allowed}
input[type=search]{border:1px solid #dce1e8;border-radius:8px;padding:7px 12px;font:inherit;min-width:260px}
.tbl{background:#fff;border:1px solid var(--line);border-radius:12px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:820px;font-size:13px}th{font-size:11px;font-weight:500;color:#8390a1;background:#f7f8fa;padding:10px 14px;text-align:left;border-bottom:1px solid var(--line)}
td{padding:10px 14px;border-bottom:1px solid #edf0f4;vertical-align:middle}tr:last-child td{border-bottom:0}
.pill{display:inline-block;font-size:11px;border-radius:999px;padding:1px 9px;font-weight:500}
.p-admin{background:var(--blush);color:var(--rak)}.p-user{background:#f1f3f6;color:#5d6673}.p-wait{background:var(--amber-soft);color:var(--amber)}.p-ok{background:var(--green-soft);color:var(--green)}.p-ban{background:#2a2a2a;color:#fff}
.acts{display:flex;gap:6px;flex-wrap:wrap}.msg{font-size:13px;border-radius:8px;padding:8px 12px;background:var(--green-soft);color:var(--green)}.msg.err{background:var(--blush);color:var(--rak)}
.muted{color:var(--muted);font-size:12px}
</style></head><body>
<header class="bar"><div class="in"><img src="/assets/rak-logo.svg" alt="RAK Engineering"><span class="ws">SSM WORK · ผู้ดูแลระบบ</span><a href="/">← กลับหน้า SSM Work</a></div></header>
<main>
<div><h1>ผู้ใช้งาน</h1><p class="sub">เข้าระบบในชื่อ ${esc(me.email)} · บัญชีใหม่และบัญชีที่รีเซ็ตจะใช้รหัสเริ่มต้น และต้องตั้งรหัสใหม่ตอนเข้าครั้งแรก</p></div>
<div class="cards" id="stats"></div>
<section class="panel"><h2>นำเข้ารายชื่อจาก Excel</h2>
<p class="muted">ไฟล์ต้องมีคอลัมน์อีเมล (หัวคอลัมน์มีคำว่า "อีเมล" หรือ "email") และจะใช้คอลัมน์ "ชื่อ" กับ "Role" ถ้ามี · อีเมลที่ซ้ำกันจะรวมเป็นบัญชีเดียว · บัญชีที่มีอยู่แล้วจะอัปเดตชื่อและ role เท่านั้น ไม่แตะรหัสผ่าน</p>
<div class="row"><input type="file" id="file" accept=".xlsx,.xls,.csv"><button class="btn primary" id="doImport" disabled>นำเข้า</button><span class="muted" id="preview"></span></div>
<div id="importMsg"></div></section>
<section class="panel"><h2>เพิ่มผู้ใช้ทีละคน</h2>
<div class="row"><input type="search" id="nEmail" placeholder="name@${esc(cfg.domain)}"><input type="search" id="nName" placeholder="ชื่อ (ชื่อเล่น)"><button class="btn primary" id="addOne">เพิ่ม</button></div></section>
<div class="row"><input type="search" id="q" placeholder="ค้นหาอีเมลหรือชื่อ…"><span class="muted" id="count"></span></div>
<div id="msg"></div>
<div class="tbl"><table><thead><tr><th>อีเมล</th><th>ชื่อ</th><th>สิทธิ์</th><th>สถานะ</th><th>เข้าล่าสุด</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="6" class="muted">กำลังโหลด…</td></tr></tbody></table></div>
</main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script>
"use strict";
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let USERS=[],PENDING_ROWS=[];
const post=(p,b)=>fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)}).then(r=>r.json().then(d=>({ok:r.ok,d})));
function say(t,err,el="msg"){document.getElementById(el).innerHTML=t?'<div class="msg'+(err?' err':'')+'">'+t+'</div>':"";}
async function load(){const r=await fetch("/admin/api/users",{cache:"no-store"});if(!r.ok){say("โหลดรายชื่อไม่สำเร็จ ("+r.status+")",1);return;}USERS=await r.json();draw();}
function draw(){
  const q=document.getElementById("q").value.trim().toLowerCase();
  const list=USERS.filter(u=>!q||(u.email+" "+u.name).toLowerCase().includes(q));
  const n=k=>USERS.filter(k).length;
  document.getElementById("stats").innerHTML=[["ทั้งหมด",USERS.length],["รอตั้งรหัสครั้งแรก",n(u=>u.mustChange&&!u.banned)],["ตั้งรหัสแล้ว",n(u=>!u.mustChange&&!u.banned)],["ปิดใช้งาน",n(u=>u.banned)],["ผู้ดูแล",n(u=>u.role==="admin")]].map(([l,v])=>'<div class="stat"><b>'+v+'</b><span>'+l+'</span></div>').join("");
  document.getElementById("count").textContent=list.length+" บัญชี";
  document.getElementById("rows").innerHTML=list.map(u=>{
    const st=u.banned?'<span class="pill p-ban">ปิดใช้งาน</span>':u.mustChange?'<span class="pill p-wait">รอตั้งรหัสครั้งแรก</span>':'<span class="pill p-ok">ใช้งานได้</span>';
    const last=u.lastSignIn?new Date(u.lastSignIn).toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short"}):"—";
    const dis=u.superAdmin?" disabled":"";
    return '<tr><td><b style="font-weight:600">'+esc(u.email)+'</b>'+(u.superAdmin?' <span class="pill p-admin">Super admin</span>':'')+'</td><td>'+esc(u.name)+'</td><td><span class="pill '+(u.role==="admin"?"p-admin":"p-user")+'">'+(u.role==="admin"?"ผู้ดูแล":"ผู้ใช้")+'</span></td><td>'+st+'</td><td class="muted">'+last+'</td><td><div class="acts">'
      +'<button class="btn" data-a="reset" data-id="'+u.id+'">รีเซ็ตรหัส</button>'
      +'<button class="btn" data-a="role" data-id="'+u.id+'" data-v="'+(u.role==="admin"?"user":"admin")+'"'+dis+'>'+(u.role==="admin"?"ถอดผู้ดูแล":"ตั้งเป็นผู้ดูแล")+'</button>'
      +'<button class="btn" data-a="ban" data-id="'+u.id+'" data-v="'+(u.banned?"0":"1")+'"'+dis+'>'+(u.banned?"เปิดใช้งาน":"ปิดใช้งาน")+'</button>'
      +'<button class="btn" data-a="delete" data-id="'+u.id+'"'+dis+'>ลบ</button></div></td></tr>';
  }).join("")||'<tr><td colspan="6" class="muted">ยังไม่มีผู้ใช้ นำเข้าจาก Excel ด้านบนได้เลย</td></tr>';
}
document.getElementById("q").addEventListener("input",draw);
document.getElementById("rows").addEventListener("click",async e=>{
  const b=e.target.closest("button[data-a]");if(!b)return;const u=USERS.find(x=>x.id===b.dataset.id);const a=b.dataset.a;
  const ask={reset:"รีเซ็ตรหัสของ "+u.email+" กลับเป็นรหัสเริ่มต้น และบังคับตั้งใหม่ตอนเข้าครั้งถัดไป?",delete:"ลบบัญชี "+u.email+" ถาวร? ย้อนกลับไม่ได้",ban:(b.dataset.v==="1"?"ปิด":"เปิด")+"การใช้งานบัญชี "+u.email+"?",role:(b.dataset.v==="admin"?"ตั้ง ":"ถอด ")+u.email+(b.dataset.v==="admin"?" เป็นผู้ดูแล?":" ออกจากผู้ดูแล?")}[a];
  if(!confirm(ask))return;b.disabled=true;
  const r=await post("/admin/api/"+a,{id:u.id,ban:b.dataset.v==="1",role:b.dataset.v});
  say(r.ok?"เรียบร้อย: "+esc(u.email):"ทำไม่สำเร็จ: "+esc(u.email),!r.ok);await load();
});
document.getElementById("file").addEventListener("change",async e=>{
  const f=e.target.files[0];PENDING_ROWS=[];document.getElementById("doImport").disabled=true;if(!f)return;
  const wb=XLSX.read(await f.arrayBuffer());const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:""});
  const h=(rows[0]||[]).map(x=>String(x).toLowerCase());
  const ci=k=>h.findIndex(x=>k.some(w=>x.includes(w)));
  const ie=ci(["อีเมล","email","e-mail"]),inm=ci(["ชื่อ","name"]),ir=ci(["role","สิทธิ์"]);
  if(ie<0){document.getElementById("preview").textContent="ไม่พบคอลัมน์อีเมลในแถวแรก";return;}
  PENDING_ROWS=rows.slice(1).map(r=>({email:String(r[ie]).trim(),name:inm>=0?String(r[inm]).trim():"",role:ir>=0?String(r[ir]).trim():""})).filter(r=>r.email.includes("@"));
  const uniq=new Set(PENDING_ROWS.map(r=>r.email.toLowerCase()));
  document.getElementById("preview").textContent=PENDING_ROWS.length+" แถว → "+uniq.size+" บัญชี (อีเมลซ้ำรวมเป็นบัญชีเดียว)";
  document.getElementById("doImport").disabled=!PENDING_ROWS.length;
});
document.getElementById("doImport").addEventListener("click",async e=>{
  e.target.disabled=true;say("กำลังนำเข้า…",0,"importMsg");
  const r=await post("/admin/api/import",{rows:PENDING_ROWS});
  if(!r.ok){say("นำเข้าไม่สำเร็จ",1,"importMsg");return;}
  const d=r.d;say("สร้างใหม่ "+d.created.length+" · อัปเดต "+d.updated.length+(d.failed.length?" · ไม่สำเร็จ "+d.failed.length+": "+esc(d.failed.join(", ")):""),d.failed.length>0,"importMsg");await load();
});
document.getElementById("addOne").addEventListener("click",async e=>{
  const email=document.getElementById("nEmail").value.trim(),name=document.getElementById("nName").value.trim();if(!email)return;
  e.target.disabled=true;const r=await post("/admin/api/import",{rows:[{email,name}]});e.target.disabled=false;
  const d=r.d||{};say(r.ok&&(d.created||[]).length?"เพิ่ม "+esc(email)+" แล้ว":r.ok&&(d.updated||[]).length?"มีบัญชีนี้อยู่แล้ว อัปเดตชื่อให้":"เพิ่มไม่สำเร็จ (ต้องเป็นอีเมล @${esc(cfg.domain)})",!(r.ok&&((d.created||[]).length||(d.updated||[]).length)));
  document.getElementById("nEmail").value="";document.getElementById("nName").value="";await load();
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

  // Forms post to APP_URL so every cookie lives on one host.
  if (req.method === 'POST' && url.origin !== cfg.app) return json({ error: 'wrong host' }, 400);
  if (req.method === 'POST') {
    const origin = req.headers.get('origin');
    if (origin && origin !== cfg.app) return json({ error: 'bad origin' }, 403);
  }

  if (path === '/auth/login') {
    if (req.method !== 'POST') return Response.redirect(cfg.app + '/', 302);
    const form = await req.formData().catch(() => null);
    const email = String(form?.get('email') || '').trim().toLowerCase();
    const password = String(form?.get('password') || '');
    const next = safeNext(String(form?.get('next') || '/'));
    const fail = (error, status = 401) => signInPage(cfg, next, { status, email, error });
    if (!EMAIL_RE.test(email) || !email.endsWith('@' + cfg.domain)) return fail(`ใช้ได้เฉพาะอีเมล <b>@${esc(cfg.domain)}</b> เท่านั้น`, 403);

    let r = await call(cfg, '/auth/v1/token?grant_type=password', { body: { email, password } });
    // First run: the super admin account is created on its first sign-in with the default password.
    if (!r.ok && email === cfg.superAdmin && password === cfg.defaultPassword) {
      const c = await call(cfg, '/auth/v1/admin/users', { admin: true, body: { email, password, email_confirm: true, user_metadata: { full_name: email.split('@')[0], must_change_password: true }, app_metadata: { role: 'admin' } } });
      if (c.ok) r = await call(cfg, '/auth/v1/token?grant_type=password', { body: { email, password } });
    }
    if (!r.ok) {
      if (r.status === 429) return fail('ลองเข้าระบบถี่เกินไป รอสักครู่แล้วลองใหม่', 429);
      if (errText(r.data).includes('banned')) return fail('บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ', 403);
      return fail('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    const prof = profileOf(cfg, r.data.user || {});
    if (!prof.email.endsWith('@' + cfg.domain)) return fail(`ใช้ได้เฉพาะอีเมล <b>@${esc(cfg.domain)}</b> เท่านั้น`, 403);
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
  const signedIn = user && String(user.email).endsWith('@' + cfg.domain);

  if (path === '/auth/password') {
    if (!pending && !signedIn) return signInPage(cfg, '/auth/password', { error: 'กรุณาเข้าสู่ระบบก่อน' });
    const first = !!pending;
    if (req.method !== 'POST') return passwordPage(cfg, { first });
    const form = await req.formData().catch(() => null);
    const pw = String(form?.get('password') || ''), confirm = String(form?.get('confirm') || '');
    const who = first ? pending : user;
    const bad = checkNewPassword(cfg, pw, confirm, who.email);
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
    const prof = { email: who.email, name: who.name, role: who.role };
    return startSession(cfg, prof, first ? pending.next : '/');
  }

  if (path === '/auth/me') {
    return json(signedIn ? { email: user.email, name: user.name, role: user.role } : {}, signedIn ? 200 : 401);
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!signedIn) return signInPage(cfg, '/admin');
    if (user.role !== 'admin' && user.email !== cfg.superAdmin) return page({ status: 403, title: 'ไม่มีสิทธิ์', body: `${LOCK}<h1>หน้านี้สำหรับผู้ดูแลระบบ</h1><p>บัญชี ${esc(user.email)} ไม่มีสิทธิ์จัดการผู้ใช้</p><div class="links"><a href="/">← กลับหน้า SSM Work</a></div>` });
    if (path.startsWith('/admin/api/')) {
      try { return await adminApi(cfg, req, path); } catch { return json({ error: 'supabase' }, 502); }
    }
    return adminPage(cfg, user);
  }

  if (signedIn) return; // continue to the static file

  const navigating = req.headers.get('sec-fetch-mode') === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (!navigating) return json({ error: 'login required' }, 401);
  return signInPage(cfg, path + url.search);
}
