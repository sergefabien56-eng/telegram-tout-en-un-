import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { listConversations } from "@/lib/mimi";

/** GET /api/mimi/conversations — conversations de l'utilisateur. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const rows = await listConversations(user.id);
  return ok({ conversations: rows });
}
