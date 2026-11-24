import { z } from "zod";

/**
 * Fournisseurs IA gratuits (budget 0 FCFA).
 *
 * Le fournisseur est branchable : `AiProvider` n'impose que deux méthodes.
 * Aucune clé payante ; sans clé configurée, MIMI déclare simplement
 * l'indisponibilité au lieu de fabriquer des chiffres (R1).
 */

export const AI_PROVIDERS = ["gemini", "groq"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const aiProviderConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export type AiProviderConfig = z.infer<typeof aiProviderConfigSchema>;

/** Un outil exposé au modèle : nom, description et arguments typés. */
export const aiToolSchemaSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.unknown()),
});
export type AiToolDefinition = z.infer<typeof aiToolSchemaSchema>;

export type AiMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiReply = {
  content: string;
  /** Appels d'outils demandés par le modèle (tour suivant). */
  toolCalls?: { name: string; arguments: Record<string, unknown> }[];
  usage?: { promptTokens: number; completionTokens: number };
};

export interface AiProvider {
  readonly name: AiProviderName;
  readonly model: string;
  complete(input: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDefinition[];
  }): Promise<AiReply>;
}

/**
 * Délai d'attente entre deux tentatives (backoff simple, plafonné).
 * L'offre gratuite de Gemini répond souvent 503 « forte demande » : on
 * réessaie plusieurs fois plutôt que de répondre à l'utilisateur qu'il n'y a
 * aucune donnée.
 */
const AI_MAX_ATTEMPTS = 4;
function aiRetryDelay(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 12_000);
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function envKey(name: string): string | undefined {
  return process.env[name] && process.env[name]!.length > 0 ? process.env[name] : undefined;
}

/** Configuration active : `AI_PROVIDER` + la clé correspondante. */
export function readAiConfig(): AiProviderConfig | null {
  const provider = (process.env.AI_PROVIDER ?? "gemini") as AiProviderName;
  if (!AI_PROVIDERS.includes(provider)) return null;
  const apiKey = provider === "gemini" ? envKey("GEMINI_API_KEY") : envKey("GROQ_API_KEY");
  if (!apiKey) return null;
  const model =
    process.env.AI_MODEL ??
    (provider === "gemini" ? "gemini-flash-lite-latest" : "llama-3.3-70b-versatile");
  return { provider, apiKey, model };
}

/** Gemini API (HTTPS directe, sans dépendance supplémentaire). */
/** Modèles de repli : l'offre gratuite renvoie souvent 503 « forte demande ». */
const GEMINI_FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-3.8-flash"];

class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;

  private async requestWithRetry(url: string, body: Record<string, unknown>): Promise<Response> {
    let lastError = "Gemini injoignable.";
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
      let response: Response | null = null;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        lastError = "Fournisseur IA injoignable après plusieurs tentatives.";
        if (attempt < AI_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, aiRetryDelay(attempt)));
          continue;
        }
        throw new Error(lastError);
      }
      if (!isRetryable(response.status)) {
        if (!response.ok) {
          lastError =
            response.status === 404
              ? `Modèle « ${this.model} » indisponible sur ce compte.`
              : `Gemini a répondu HTTP ${response.status}.`;
        } else {
          return response;
        }
      } else {
        lastError = `Gemini a répondu HTTP ${response.status}.`;
      }
      if (attempt < AI_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, aiRetryDelay(attempt)));
      }
    }
    throw new Error(lastError);
  }

  /** Appel avec bascule de modèle si le premier est saturé ou retiré. */
  private async completeWithFallback(input: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDefinition[];
    urlFor: (model: string) => string;
    bodyFor: (
      system: string,
      messages: AiMessage[],
      tools: AiToolDefinition[],
    ) => Record<string, unknown>;
  }): Promise<{ response: Response; model: string }> {
    const candidates = [this.model, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== this.model)];
    let lastError = "Gemini injoignable.";
    for (const model of candidates) {
      try {
        const response = await this.requestWithRetry(
          input.urlFor(model),
          input.bodyFor(input.system, input.messages, input.tools),
        );
        return { response, model };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    throw new Error(lastError);
  }
  /** Dernier modèle ayant répondu (l'offre gratuite change souvent). */
  model: string;

  constructor(
    private readonly apiKey: string,
    model: string,
  ) {
    this.model = model;
  }

  async complete(input: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDefinition[];
  }): Promise<AiReply> {
    const bodyFor = (
      system: string,
      messages: AiMessage[],
      tools: AiToolDefinition[],
    ): Record<string, unknown> => {
      const contents = messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: system }] },
        contents,
      };
      if (tools.length > 0) {
        body.tools = [
          {
            functionDeclarations: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              // `parameters` est la table des propriétés ; le schéma objet est
              // construit ici pour rester valide côté Gemini.
              parameters: {
                type: "OBJECT",
                properties: tool.parameters,
                required: Object.keys(tool.parameters),
              },
            })),
          },
        ];
      }
      return body;
    };

    const { response, model } = await this.completeWithFallback({
      system: input.system,
      messages: input.messages,
      tools: input.tools,
      urlFor: (candidate) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      bodyFor,
    });
    this.model = model;
    const json = (await response.json()) as {
      candidates?: {
        content?: {
          parts?: {
            text?: string;
            functionCall?: { name: string; args: Record<string, unknown> };
          }[];
        };
      }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    const toolCalls = parts
      .filter((part) => part.functionCall)
      .map((part) => ({
        name: part.functionCall!.name,
        arguments: part.functionCall!.args ?? {},
      }));

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

/** Groq API (OpenAI-compatible, HTTPS directe). */
class GroqProvider implements AiProvider {
  readonly name = "groq" as const;
  /** Dernier modèle ayant répondu (l'offre gratuite change souvent). */
  model: string;

  constructor(
    private readonly apiKey: string,
    model: string,
  ) {
    this.model = model;
  }

  async complete(input: {
    system: string;
    tools: AiToolDefinition[];
    messages: AiMessage[];
  }): Promise<AiReply> {
    const messages: Record<string, unknown>[] = [
      { role: "system", content: input.system },
      ...input.messages.map((message) => ({ role: message.role, content: message.content })),
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.3,
    };
    if (input.tools.length > 0) {
      body.tools = input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties: tool.parameters,
            required: [],
          },
        },
      }));
      body.tool_choice = "auto";
    }

    let response: Response | null = null;
    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
      try {
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        if (attempt < AI_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, aiRetryDelay(attempt)));
          continue;
        }
        throw new Error("Fournisseur IA injoignable après plusieurs tentatives.");
      }
      if (!isRetryable(response.status)) break;
      if (attempt < AI_MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, aiRetryDelay(attempt)));
        continue;
      }
    }
    if (!response) throw new Error("Fournisseur IA injoignable.");
    if (!response.ok) {
      throw new Error(`Groq a répondu HTTP ${response.status}.`);
    }
    const json = (await response.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { function?: { name: string; arguments: string } }[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const message = json.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? [])
      .map((call) => {
        try {
          return {
            name: call.function!.name,
            arguments: JSON.parse(call.function!.arguments ?? "{}"),
          };
        } catch {
          return null;
        }
      })
      .filter(
        (call): call is { name: string; arguments: Record<string, unknown> } => call !== null,
      );

    return {
      content: (message?.content ?? "").trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}

export function createAiProvider(config: AiProviderConfig): AiProvider {
  return config.provider === "gemini"
    ? new GeminiProvider(config.apiKey, config.model)
    : new GroqProvider(config.apiKey, config.model);
}
