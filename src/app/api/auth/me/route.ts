import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  return ok({ id: user.id, email: user.email, fullName: user.fullName });
}
