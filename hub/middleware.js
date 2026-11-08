// SSM Work login gate — Vercel Routing Middleware.
// Every request must carry a signed session cookie for a Google account in ALLOWED_DOMAIN (default rak.co.th).
// Env vars (Vercel → Project ssmwork → Settings → Environment Variables):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  – OAuth client (Google Cloud → Credentials, type "Web application")
//   SESSION_SECRET                          – long random string used to sign the session cookie
//   APP_URL                                 – https://ssmwork.vercel.app (must match the OAuth redirect URI host)
//   ALLOWED_DOMAIN                          – rak.co.th
// If any required value is missing the site stays locked (fails closed).

export const config = { matcher: ['/((?!favicon\\.ico).*)'] };

const SESSION = 'ssm_session';
const STATE = 'ssm_oauth';
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
code{background:var(--blush);color:var(--rak);border-radius:4px;padding:1px 6px}
</style></head><body><main class="card">
<div class="brand"><img src="/assets/rak-logo.svg" alt="RAK Engineering" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><span class="word"><b>RAK</b> ENGINEERING</span><span class="ws">SSM WORK</span></div>
<div class="in">${body}</div></main></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

const LOCK = `<span class="ic"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="#ffd9d9"/><rect x="5" y="10.5" width="14" height="10" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10.3" cy="14.6" r=".9" fill="currentColor"/><circle cx="13.7" cy="14.6" r=".9" fill="currentColor"/><path d="M10.4 17a2.2 2.2 0 0 0 3.2 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>`;
const G = `<span class="g"><svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg></span>`;

function signInPage(next, domain, { status = 401, title = 'เข้าสู่ระบบ', heading = 'เข้าสู่ระบบ SSM Work', msg, headers } = {}) {
  const href = '/auth/login?next=' + encodeURIComponent(next);
  return page({
    status, title, headers,
    body: `${LOCK}<h1>${esc(heading)}</h1><p>${msg || `สำหรับพนักงาน RAK Engineering ใช้บัญชี Google <b>@${esc(domain)}</b> เท่านั้น`}</p>
<a class="btn" href="${esc(href)}">${G}เข้าสู่ระบบด้วย Google</a>
<div class="note">ปัญหาการเข้าใช้งาน ติดต่อทีม SSM</div>`,
  });
}

export default async function middleware(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const env = (typeof process !== 'undefined' && process.env) || {};
  const clientId = env.GOOGLE_CLIENT_ID, clientSecret = env.GOOGLE_CLIENT_SECRET, secret = env.SESSION_SECRET;
  const domain = (env.ALLOWED_DOMAIN || 'rak.co.th').toLowerCase().replace(/^@/, '');
  const app = (env.APP_URL || url.origin).replace(/\/$/, '');

  // Logo on the sign-in page is public; nothing else is.
  if (path === '/assets/rak-logo.svg') return;

  if (!clientId || !clientSecret || !secret || secret.length < 32) {
    return page({ status: 503, title: 'กำลังตั้งค่า', body: `${LOCK}<h1>ระบบ login กำลังตั้งค่า</h1><p>ผู้ดูแลยังตั้งค่า Google sign-in ไม่ครบ เว็บจึงปิดไว้ก่อนเพื่อความปลอดภัย</p><div class="note">ผู้ดูแล: ใส่ <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> และ <code>SESSION_SECRET</code> (32 ตัวอักษรขึ้นไป) ใน Vercel แล้ว redeploy</div>` });
  }

  if (path === '/auth/login') {
    // Start every login on APP_URL so the state cookie and the callback share one host.
    if (url.origin !== app) return Response.redirect(app + path + url.search, 302);
    const next = safeNext(url.searchParams.get('next'));
    const state = b64u(crypto.getRandomValues(new Uint8Array(24)));
    const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    g.search = new URLSearchParams({
      client_id: clientId, redirect_uri: app + '/auth/callback', response_type: 'code',
      scope: 'openid email profile', hd: domain, prompt: 'select_account', state,
    });
    return new Response(null, { status: 302, headers: { location: g.toString(), 'set-cookie': setCookie(STATE, state + '|' + next, 600), 'cache-control': 'no-store' } });
  }

  if (path === '/auth/callback') {
    const saved = getCookie(req, STATE) || '';
    const [state, next = '/'] = saved.split('|');
    const clearState = setCookie(STATE, '', 0);
    const retry = (heading, msg) => signInPage('/', domain, { status: 403, title: 'เข้าไม่ได้', heading, msg, headers: { 'set-cookie': clearState } });
    if (url.searchParams.get('error')) return retry('ยกเลิกการเข้าสู่ระบบ', 'ลองเข้าสู่ระบบใหม่อีกครั้ง');
    if (!state || state !== url.searchParams.get('state')) return retry('เซสชันหมดอายุ', 'ลิงก์เข้าสู่ระบบหมดอายุหรือถูกเปิดจากหน้าอื่น ลองใหม่อีกครั้ง');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: clientId, client_secret: clientSecret, redirect_uri: app + '/auth/callback', grant_type: 'authorization_code' }),
    });
    if (!res.ok) return retry('เข้าสู่ระบบไม่สำเร็จ', 'Google ไม่ยืนยันการเข้าสู่ระบบ ลองใหม่อีกครั้ง');
    const tok = await res.json();
    let claims = {};
    // id_token came straight from Google's token endpoint over TLS, so its payload can be trusted without re-verifying the signature.
    try { claims = JSON.parse(unb64u(String(tok.id_token).split('.')[1])); } catch {}
    const email = String(claims.email || '').toLowerCase();
    const okIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!okIssuer || claims.aud !== clientId || claims.email_verified !== true || !email.endsWith('@' + domain) || String(claims.hd || '').toLowerCase() !== domain) {
      return retry('บัญชีนี้ใช้ไม่ได้', `${email ? `<b>${esc(email)}</b> ไม่ใช่บัญชี @${esc(domain)} ` : ''}กรุณาเข้าสู่ระบบด้วยบัญชี Google ของบริษัท (@${esc(domain)})`);
    }
    const session = await makeToken(secret, { email, name: claims.name || email, exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600 });
    const h = new Headers({ location: app + safeNext(next), 'cache-control': 'no-store' });
    h.append('set-cookie', setCookie(SESSION, session, SESSION_HOURS * 3600));
    h.append('set-cookie', clearState);
    return new Response(null, { status: 302, headers: h });
  }

  if (path === '/auth/logout') {
    return signInPage('/', domain, { status: 200, title: 'ออกจากระบบแล้ว', heading: 'ออกจากระบบแล้ว', msg: 'แล้วพบกันใหม่ 👋 เข้าสู่ระบบอีกครั้งด้วยบัญชี @' + esc(domain), headers: { 'set-cookie': setCookie(SESSION, '', 0) } });
  }

  const user = await readToken(secret, getCookie(req, SESSION));
  const signedIn = user && String(user.email).endsWith('@' + domain);

  if (path === '/auth/me') {
    return new Response(JSON.stringify(signedIn ? { email: user.email, name: user.name } : {}), { status: signedIn ? 200 : 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  }
  if (signedIn) return; // continue to the static file

  const navigating = req.headers.get('sec-fetch-mode') === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (!navigating) return new Response(JSON.stringify({ error: 'login required' }), { status: 401, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  return signInPage(path + url.search, domain);
}
