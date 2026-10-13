"use client";
import { useActionState } from "react";
import { login } from "./actions";
export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: null });
  return <form action={action} className="login-form">
    <label htmlFor="email">อีเมล</label>
    <input id="email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="name@company.com" aria-describedby={state.error ? "login-error" : undefined} />
    <label htmlFor="password">รหัสผ่าน</label>
    <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} aria-describedby={state.error ? "login-error" : undefined} />
    {state.error ? <p id="login-error" className="error" role="alert">{state.error}</p> : null}
    <button disabled={pending} type="submit">{pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
  </form>;
}
