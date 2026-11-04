import { getCurrentUser } from "@/lib/auth/dal";
import { getNotices } from "@/lib/notifications";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401 });
  const notices = await getNotices(user);
  return Response.json({ notices }, { headers: { "Cache-Control": "no-store" } });
}
