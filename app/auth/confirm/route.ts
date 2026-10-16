import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams, supabase = await createClient();
  const code = q.get("code"), hash = q.get("token_hash"), type = q.get("type");
  let success = false;
  if (code) { const { error } = await supabase.auth.exchangeCodeForSession(code); success = !error; }
  else if (hash && (type === "signup" || type === "email" || type === "recovery")) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type }); success = !error;
  }
  const target = success ? (q.get("flow") === "recovery" || type === "recovery" ? "/reset-password" : "/dashboard") : "/login?authError=1";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("Cache-Control", "private, no-store"); return response;
}
