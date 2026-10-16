import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import net from "node:net";

let server, base;
let output = "";
before(async () => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: process.env });
  server.stdout.on("data", data => { output += data; });
  server.stderr.on("data", data => { output += data; });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(output);
    try { const r = await fetch(`${base}/login`); if (r.ok) return; } catch {}
    await setTimeout(200);
  }
  throw new Error(`Server did not start: ${output}`);
});
after(async () => {
  if (!server || server.exitCode !== null) return;
  const exited = new Promise(resolve => server.once("exit", resolve));
  server.kill("SIGTERM");
  await exited;
});

test("login page is public and has accessible email/password fields", async () => {
  const response = await fetch(`${base}/login`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const html = await response.text();
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.match(html, /autoComplete="current-password"/);
});

test("anonymous page requests, including asset-like paths, are redirected", async () => {
  for (const path of ["/", "/dashboard", "/dashboard/export.csv", "/dashboard/private.png"]) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.equal(response.status, 307, path);
    assert.equal(new URL(response.headers.get("location"), base).pathname, "/login", path);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("anonymous direct API requests return 401 rather than HTML or user data", async () => {
  const response = await fetch(`${base}/api/me`, { redirect: "manual" });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
});

test("forged Supabase session cannot unlock pages or APIs", async () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now()/1000);
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "11111111-1111-1111-1111-111111111111", role: "authenticated", exp: now + 3600, aud: "authenticated", iss: "https://otsidhsoazlznniqyamo.supabase.co/auth/v1" })}.forged`;
  const session = { access_token: token, refresh_token: "invalid", token_type: "bearer", expires_in: 3600, expires_at: now + 3600, user: { id: "11111111-1111-1111-1111-111111111111" } };
  const cookie = `sb-otsidhsoazlznniqyamo-auth-token=base64-${encode(session)}`;
  const page = await fetch(`${base}/dashboard`, { headers: { cookie }, redirect: "manual" });
  assert.equal(page.status, 307);
  const api = await fetch(`${base}/api/me`, { headers: { cookie }, redirect: "manual" });
  assert.equal(api.status, 401);
});

test("signup and password recovery entry points are public", async () => {
 for(const path of ["/signup","/forgot-password"]){
  const response=await fetch(`${base}${path}`);
  assert.equal(response.status,200,path);
  assert.match(await response.text(),/name="email"/);
 }
});
test("pending and reset pages require verified authentication", async () => {
 for(const path of ["/pending","/reset-password"]){
  const response=await fetch(`${base}${path}`,{redirect:"manual"});
  assert.equal(response.status,307,path);
  assert.equal(new URL(response.headers.get("location"),base).pathname,"/login");
 }
});
test("trial data and calculator reject anonymous callers", async () => {
 const response=await fetch(`${base}/api/trial`,{redirect:"manual"});
 assert.equal(response.status,401);
 assert.deepEqual(await response.json(),{error:"Unauthorized"});
 const calculated=await fetch(`${base}/api/trial/calculate`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rateKey:"LEG-ALL-76",quantity:5,periods:6,trialAck:true}),redirect:"manual"});
 assert.equal(calculated.status,401);
});
test("invalid email callback stays on the app and never follows external next",async()=>{
 const response=await fetch(`${base}/auth/confirm?next=https://example.com`,{redirect:"manual"});
 assert.equal(response.status,307);
 const target=new URL(response.headers.get("location"),base);
 assert.ok(["127.0.0.1","localhost"].includes(target.hostname));
 assert.equal(target.port,new URL(base).port);assert.equal(target.pathname,"/login");
});
