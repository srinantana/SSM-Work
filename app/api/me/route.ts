import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  return Response.json({ id: user.id, email: user.email }, { headers });
}
