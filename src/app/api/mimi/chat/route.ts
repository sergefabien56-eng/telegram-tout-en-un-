import { fail, ok } from "@/lib/http";
import { getSessionUser } from "@/lib/session";
import { askMimi, getConversation, startConversation } from "@/lib/mimi";

type Params = { params: Promise<Record<string, never>> };

/**
 * POST /api/mimi/chat — un tour de conversation.
 *
 * Sans clé IA gratuite configurée, la réponse est un message d'indisponibilité
 * honnête : jamais de chiffre inventé.
 */
export async function POST(request: Request, _ctx: Params) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Non authentifié.");

  let body: { conversationId?: unknown; shopId?: unknown; message?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(400, "Corps JSON attendu.");
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) return fail(400, "Message vide.");

  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  if (conversationId) {
    const owned = await getConversation(user.id, conversationId);
    if (!owned) return fail(404, "Conversation introuvable.");
    if (owned.shopId !== null && typeof body.shopId === "string" && body.shopId !== owned.shopId) {
      return fail(400, "Boutique incompatible avec la conversation.");
    }
  } else {
    const shopId = typeof body.shopId === "string" && body.shopId.length > 0 ? body.shopId : null;
    conversationId = await startConversation(user.id, shopId, message);
  }

  const result = await askMimi({
    userId: user.id,
    shopId:
      typeof body.shopId === "string" && body.shopId.length > 0
        ? body.shopId
        : ((await getConversation(user.id, conversationId))?.shopId ?? null),
    conversationId,
    message,
  });

  return ok({ ...result, conversationId });
}
