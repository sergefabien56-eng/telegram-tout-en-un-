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
    (provider === "gemini" ? "gemini-2.0-flash" : "llama-3.3-70b-versatile");
  return { provider, apiKey, model };
}

/** Gemini API (HTTPS directe, sans dépendance supplémentaire). */
class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async complete(input: {
    system: string;
    messages: AiMessage[];
    tools: AiToolDefinition[];
  }): Promise<AiReply> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const contents = input.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: input.system }] },
      contents,
    };
    if (input.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: {
              type: "OBJECT",
              properties: Object.fromEntries(
                Object.entries(tool.parameters).map(([key, value]) => [
                  key,
                  typeof value === "object" && value !== null
                    ? (value as Record<string, unknown>)
                    : { type: "STRING" },
                ]),
              ),
              required: [],
            },
          })),
        },
      ];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`Gemini a répondu HTTP ${response.status}.`);
    }
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
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

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

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
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
