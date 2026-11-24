import { fail, ok, requestIp, requestUserAgent } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { deleteJumiaAccount } from "@/lib/jumia/accounts";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** DELETE /api/jumia/accounts/:id — supprime un compte (owner uniquement). */
export async function DELETE(request: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");
  const { id } = await params;

  const result = await deleteJumiaAccount(user.id, id);
  if (!result.ok) {
    await audit({
      action: "jumia.account_removed",
      result: "blocked",
      userId: user.id,
      entityType: "jumia_account",
      entityId: id,
      ip: requestIp(request),
      userAgent: requestUserAgent(request),
      metadata: { reason: result.error?.slice(0, 200) },
    });
    return fail(409, result.error ?? "Suppression impossible.");
  }

  return ok({ deleted: true });
}
