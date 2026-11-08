// SSM Work login gate — Vercel Routing Middleware + Supabase email sign-in link (PKCE).
// Only addresses in ALLOWED_DOMAIN (default rak.co.th) can sign in; every other request needs a signed session cookie.
// Env vars (Vercel → Project ssmwork → Settings → Environment Variables):
//   SUPABASE_URL, SUPABASE_ANON_KEY – Supabase project (Settings → API). The anon/publishable key is not a secret.
//   SESSION_SECRET                  – long random string used to sign the session cookie
//   APP_URL                         – https://ssmwork.vercel.app (add APP_URL/auth/callback to Supabase Auth → URL Configuration → Redirect URLs)
//   ALLOWED_DOMAIN                  – rak.co.th
// If a required value is missing the site stays locked (fails closed).

export const config = { matcher: ['/((?!favicon\\.ico).*)'] };

const SESSION = 'ssm_session';
const PKCE = 'ssm_pkce';
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
input[type=email]{width:100%;font:inherit;border:1px solid #dce1e8;border-radius:10px;padding:11px 14px;color:var(--ink)}
input[type=email]:focus{outline:3px solid #f3c2c2;border-color:var(--rak)}
button.btn{border:0;cursor:pointer;font:inherit;justify-content:center}
.err{color:var(--rak);background:var(--blush);border-radius:8px;padding:8px 12px;font-size:13px;width:100%}
code{background:var(--blush);color:var(--rak);border-radius:4px;padding:1px 6px}
</style></head><body><main class="card">
<div class="brand"><img src="/assets/rak-logo.svg" alt="RAK Engineering" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="word"><b>RAK</b> ENGINEERING</span><span class="ws">SSM WORK</span></div>
<div class="in">${body}</div></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

const LOCK = `<span class="ic"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="#ffd9d9"/><rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10.3" cy="14.6" r=".9" fill="currentColor"/><circle cx="13.7" cy="14.6" r=".9" fill="currentColor"/><path d="M10.4 17a2.2 2.2 0 0 0 3.2 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>`;
const MAIL = `<span class="ic"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="13" rx="2.6" fill="#ffd9d9"/><rect x="3.5" y="6" width="17" height="13" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 3.2l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z" fill="currentColor"/></svg></span>`;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+$/;

function signInPage(app, next, domain, { status = 401, heading = 'เข้าสู่ระบบ SSM Work', msg, error, email = '', headers } = {}) {
  return page({
    status, title: 'เข้าสู่ระบบ', headers,
    body: `${LOCK}<h1>${esc(heading)}</h1><p>${msg || `สำหรับพนักงาน RAK Engineering ใส่อีเมล <b>@${esc(domain)}</b> แล้วกดลิงก์ที่ส่งไปในอีเมล`}</p>
${error ? `<div class="err">${error}</div>` : ''}
<form method="post" action="${esc(app)}/auth/login">
<input type="hidden" name="next" value="${esc(next)}">
<input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="name@${esc(domain)}" value="${esc(email)}" aria-label="อีเมลบริษัท">
<button class="btn" type="submit">ส่งลิงก์เข้าสู่ระบบ →</button>
</form>
<div class="note">ลิงก์ใช้ได้ครั้งเดียว · เปิดลิงก์ในเบราว์เซอร์เดียวกับที่ขอ · ปัญหาการเข้าใช้งาน ติดต่อทีม SSM</div>`,
  });
}

async function supa(env, path, body) {
  const res = await fetch(env.url + path, {
    method: 'POST',
    headers: { apikey: env.key, authorization: 'Bearer ' + env.key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const env = (typeof process !== 'undefined' && process.env) || {};
  const sb = { url: (env.SUPABASE_URL || '').replace(/\/$/, ''), key: env.SUPABASE_ANON_KEY };
  const secret = env.SESSION_SECRET;
  const domain = (env.ALLOWED_DOMAIN || 'rak.co.th').toLowerCase().replace(/^@/, '');
  const app = (env.APP_URL || url.origin).replace(/\/$/, '');

  // Logo on the sign-in page is public; nothing else is.
  if (path === '/assets/rak-logo.svg') return;

  if (!sb.url || !sb.key || !secret || secret.length < 32) {
    return page({ status: 503, title: 'กำลังตั้งค่า', body: `${LOCK}<h1>ระบบ login กำลังตั้งค่า</h1><p>ผู้ดูแลยังตั้งค่าการเข้าสู่ระบบไม่ครบ เว็บจึงปิดไว้ก่อนเพื่อความปลอดภัย</p><div class="note">ผู้ดูแล: ใส่ <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code> และ <code>SESSION_SECRET</code> ใน Vercel แล้ว redeploy</div>` });
  }

  if (path === '/auth/login') {
    if (req.method !== 'POST') return Response.redirect(app + '/', 302);
    const form = await req.formData().catch(() => null);
    const email = String(form?.get('email') || '').trim().toLowerCase();
    const next = safeNext(String(form?.get('next') || '/'));
    if (!EMAIL_RE.test(email) || !email.endsWith('@' + domain)) {
      return signInPage(app, next, domain, { status: 403, email, error: `ใช้ได้เฉพาะอีเมล <b>@${esc(domain)}</b> เท่านั้น` });
    }
    const verifier = b64u(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64u(await crypto.subtle.digest('SHA-256', te.encode(verifier)));
    const r = await supa(sb, '/auth/v1/otp?redirect_to=' + encodeURIComponent(app + '/auth/callback'), {
      email, create_user: true, code_challenge: challenge, code_challenge_method: 's256',
    });
    if (!r.ok) {
      const tooMany = r.status === 429;
      return signInPage(app, next, domain, { status: tooMany ? 429 : 502, email, error: tooMany ? 'ขอลิงก์ถี่เกินไป รอสักครู่แล้วลองใหม่' : 'ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง' });
    }
    return page({
      title: 'เช็คอีเมล', headers: { 'set-cookie': setCookie(PKCE, verifier + '|' + next, 3600) },
      body: `${MAIL}<h1>เช็คอีเมลได้เลย ✨</h1><p>ส่งลิงก์เข้าสู่ระบบไปที่ <b>${esc(email)}</b> แล้ว เปิดลิงก์จากอีเมลในเบราว์เซอร์นี้ภายใน 1 ชั่วโมง</p><div class="note">ไม่เจออีเมล? ดูในโฟลเดอร์ Spam หรือ <a href="${esc(app)}/">ขอลิงก์ใหม่</a></div>`,
    });
  }

  if (path === '/auth/callback') {
    const saved = getCookie(req, PKCE) || '';
    const [verifier, next = '/'] = saved.split('|');
    const clear = setCookie(PKCE, '', 0);
    const fail = (error) => signInPage(app, '/', domain, { status: 403, error, headers: { 'set-cookie': clear } });
    if (url.searchParams.get('error_description')) return fail('ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว ขอลิงก์ใหม่ได้เลย');
    let r;
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    if (code) {
      if (!verifier) return fail('เปิดลิงก์คนละเบราว์เซอร์กับที่ขอไว้ ขอลิงก์ใหม่ในเบราว์เซอร์นี้ได้เลย');
      r = await supa(sb, '/auth/v1/token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
    } else if (tokenHash) {
      r = await supa(sb, '/auth/v1/verify', { type: url.searchParams.get('type') || 'email', token_hash: tokenHash });
    } else {
      return fail('ลิงก์ไม่ครบ ขอลิงก์ใหม่ได้เลย');
    }
    const user = r.ok ? r.data.user || {} : {};
    const email = String(user.email || '').toLowerCase();
    if (!r.ok || !email.endsWith('@' + domain) || !(user.email_confirmed_at || user.confirmed_at)) {
      return fail(r.ok ? `ใช้ได้เฉพาะอีเมล @${esc(domain)} เท่านั้น` : 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว ขอลิงก์ใหม่ได้เลย');
    }
    const name = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || email.split('@')[0];
    const session = await makeToken(secret, { email, name, exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600 });
    const h = new Headers({ location: app + safeNext(next), 'cache-control': 'no-store' });
    h.append('set-cookie', setCookie(SESSION, session, SESSION_HOURS * 3600));
    h.append('set-cookie', clear);
    return new Response(null, { status: 302, headers: h });
  }

  if (path === '/auth/logout') {
    return signInPage(app, '/', domain, { status: 200, heading: 'ออกจากระบบแล้ว', msg: 'แล้วพบกันใหม่ 👋 เข้าสู่ระบบอีกครั้งด้วยอีเมล @' + esc(domain), headers: { 'set-cookie': setCookie(SESSION, '', 0) } });
  }

  const user = await readToken(secret, getCookie(req, SESSION));
  const signedIn = user && String(user.email).endsWith('@' + domain);

  if (path === '/auth/me') {
    return new Response(JSON.stringify(signedIn ? { email: user.email, name: user.name } : {}), { status: signedIn ? 200 : 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (signedIn) return; // continue to the static file

  const navigating = req.headers.get('sec-fetch-mode') === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (!navigating) return new Response(JSON.stringify({ error: 'login required' }), { status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return signInPage(app, path + url.search, domain);
}
