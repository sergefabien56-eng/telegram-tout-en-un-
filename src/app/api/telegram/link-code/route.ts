import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { createLinkCode } from "@/lib/telegram-service";
import { audit } from "@/lib/audit";

/** Génère un code de liaison pour l'utilisateur connecté (web → Telegram). */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  const { code, expiresAt } = await createLinkCode(user.id);

  await audit({
    action: "auth.telegram_link_code",
    result: "success",
    userId: user.id,
    entityType: "telegram",
  });

  return ok({ code, expiresAt: expiresAt.toISOString() }, { status: 201 });
}
