import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
// A fresh server-confirmed user record is required, including after logout/revocation.
export const currentUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || data.user?.is_anonymous || !data.user?.email_confirmed_at ? null : data.user;
});
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
