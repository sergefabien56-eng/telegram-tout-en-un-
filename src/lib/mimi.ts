import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createAiProvider, readAiConfig, type AiMessage, type AiProvider } from "@/lib/ai/provider";
import { mimiToolsFor, parseToolArguments, type MimiToolName } from "@/lib/ai/tools";

/**
 * Orchestrateur MIMI.
 *
 * Règles anti-hallucination : le modèle n'a accès qu'aux outils typés de
 * `mimiToolsFor` ; chaque réponse chiffrée doit citer sa source et sa période.
 * Sans clé IA configurée, on déclare l'indisponibilité au lieu de répondre.
 */

export const MIMI_UNAVAILABLE =
  "Fonctionnalité temporairement indisponible : aucune clé IA gratuite n'est configurée sur ce serveur. Aucun chiffre n'a été inventé.";

export const MIMI_SYSTEM_PROMPT = [
  "Tu es MIMI, l'assistante commerciale de TOUT EN UN, un outil pour boutiques Jumia.",
  "Réponds en français, de façon concise et factuelle.",
  "",
  "RÈGLES NON NÉGOCIABLES :",
  "1. Tu n'as accès aux données que par les outils mis à ta disposition. N'invente JAMAIS un chiffre, un produit, une commande ou un montant.",
  "2. Quand tu cites un chiffre, indique la boutique et la période, et dis de quel outil il vient (commandes, stocks ou relevés Jumia).",
  "3. Si un outil renvoie vide ou si tu n'as pas d'outil adapté, réponds « donnée indisponible » ou « je ne peux pas le dire avec les données enregistrées ». Ne comble jamais par une estimation.",
  "4. N'affirme rien sur les marges, commissions ou prix de revient si aucun coût d'achat n'est enregistré.",
  "5. Les modifications de prix et de stock sont humaines : contente-toi de les signaler, ne promets jamais de les appliquer.",
  "6. Signale la fraîcheur des données si tu la connais (date de dernière synchronisation fournie par l'utilisateur).",
  "",
  "Format : phrases courtes, éventuellement une liste à puces. Pas de tableau HTML, pas d'émojis publicitaires.",
].join("\n");

const MAX_TOOL_ROUNDS = 3;
const HISTORY_LIMIT = 10;

async function logUsage(input: {
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  toolName: string | null;
  latencyMs: number;
}) {
  try {
    await getDb().insert(schema.aiUsage).values({
      userId: input.userId,
      provider: input.provider,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      toolName: input.toolName,
      latencyMs: input.latencyMs,
    });
  } catch {
    // Le journal de consommation ne doit jamais faire échouer une réponse.
  }
}

async function saveMessage(input: {
  conversationId: string;
  role: string;
  content: string;
  toolName?: string | null;
  toolArgs?: unknown;
}) {
  await getDb()
    .insert(schema.aiMessages)
    .values({
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      toolName: input.toolName ?? null,
      toolArgs: input.toolArgs ?? null,
    });
}

/** Crée une conversation et journalise le premier message. */
export async function startConversation(userId: string, shopId: string | null, message: string) {
  const db = getDb();
  const [conversation] = await db
    .insert(schema.aiConversations)
    .values({ userId, shopId })
    .returning({ id: schema.aiConversations.id });
  if (!conversation) throw new Error("Impossible d'ouvrir la conversation.");
  await saveMessage({ conversationId: conversation.id, role: "user", content: message });
  return conversation.id;
}

/** Vérifie que la conversation appartient bien à l'utilisateur. */
export async function getConversation(userId: string, conversationId: string) {
  const [conversation] = await getDb()
    .select()
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.id, conversationId));
  if (!conversation || conversation.userId !== userId) return null;
  return conversation;
}

export async function listConversations(userId: string) {
  return getDb()
    .select()
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.userId, userId))
    .orderBy(desc(schema.aiConversations.updatedAt))
    .limit(20);
}

export async function listMessages(conversationId: string) {
  return getDb()
    .select()
    .from(schema.aiMessages)
    .where(eq(schema.aiMessages.conversationId, conversationId))
    .orderBy(schema.aiMessages.createdAt)
    .limit(HISTORY_LIMIT);
}

export type MimiResult =
  | { ok: true; reply: string; unavailable?: false; toolCalls: string[] }
  | { ok: false; unavailable: true; reply: string; toolCalls: [] };

/** Envoie un message à MIMI et persiste l'échange. */
export async function askMimi(input: {
  userId: string;
  shopId: string | null;
  conversationId: string;
  message: string;
}): Promise<MimiResult> {
  const config = readAiConfig();
  if (!config) {
    return { ok: false, unavailable: true, reply: MIMI_UNAVAILABLE, toolCalls: [] };
  }

  const provider: AiProvider = createAiProvider(config);
  const tools = mimiToolsFor({ userId: input.userId, shopId: input.shopId });
  const historyRows = await listMessages(input.conversationId);

  const messages: AiMessage[] = historyRows
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));

  const toolCallsUsed: string[] = [];
  let reply = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const started = Date.now();
    let answer;
    try {
      answer = await provider.complete({
        system: MIMI_SYSTEM_PROMPT,
        messages,
        tools: tools.map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "fournisseur injoignable";
      await logUsage({
        userId: input.userId,
        provider: config.provider,
        model: config.model,
        promptTokens: 0,
        completionTokens: 0,
        toolName: null,
        latencyMs: Date.now() - started,
      });
      await saveMessage({ conversationId: input.conversationId, role: "assistant", content: "" });
      return {
        ok: false,
        unavailable: true,
        reply: `MIMI est momentanément indisponible (${message}). Aucune donnée n'a été inventée.`,
        toolCalls: [],
      };
    }

    await logUsage({
      userId: input.userId,
      provider: config.provider,
      model: config.model,
      promptTokens: answer.usage?.promptTokens ?? 0,
      completionTokens: answer.usage?.completionTokens ?? 0,
      toolName: answer.toolCalls?.[0]?.name ?? null,
      latencyMs: Date.now() - started,
    });

    if (!answer.toolCalls || answer.toolCalls.length === 0) {
      reply = answer.content || MIMI_UNAVAILABLE;
      break;
    }

    // Exécution des outils demandés : chaque résultat revient au modèle.
    for (const call of answer.toolCalls) {
      const definition = tools.find((tool) => tool.name === call.name);
      if (!definition) continue;
      toolCallsUsed.push(definition.name);
      let result: Record<string, unknown>;
      try {
        const args = parseToolArguments(definition.name as MimiToolName, call.arguments);
        result = await definition.run(args);
        await saveMessage({
          conversationId: input.conversationId,
          role: "tool",
          content: JSON.stringify(result),
          toolName: definition.name,
          toolArgs: call.arguments,
        });
      } catch (error) {
        result = { erreur: error instanceof Error ? error.message : "outil indisponible" };
        await saveMessage({
          conversationId: input.conversationId,
          role: "tool",
          content: JSON.stringify(result),
          toolName: definition.name,
        });
      }
      messages.push({
        role: "user",
        content: `Résultat de ${definition.name} : ${JSON.stringify(result)}`,
      });
    }
  }

  await saveMessage({ conversationId: input.conversationId, role: "assistant", content: reply });
  await getDb()
    .update(schema.aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.aiConversations.id, input.conversationId));

  return { ok: true, reply, toolCalls: toolCallsUsed };
}
