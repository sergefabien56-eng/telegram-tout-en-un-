"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, SendHorizonal, UserRound } from "lucide-react";

type Message = {
  id: string;
  role: string;
  content: string;
  toolName?: string | null;
};

type Props = {
  shopId: string | null;
  initialConversationId: string | null;
  initialMessages: Message[];
};

/** Conversation MIMI : les réponses proviennent de l'orchestrateur serveur. */
export function MimiChat({ shopId, initialConversationId, initialMessages }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, role: "user", content: text },
    ]);
    setDraft("");

    try {
      const response = await fetch("/api/mimi/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, shopId, message: text }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { reply: string; conversationId: string; unavailable?: boolean };
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "MIMI n'a pas pu répondre.");
        return;
      }
      setConversationId(payload.data!.conversationId);
      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", content: payload.data!.reply },
      ]);
      if (payload.data!.unavailable) {
        setError("Aucune clé IA gratuite n'est configurée : MIMI ne peut pas calculer.");
      }
    } catch {
      setError("Erreur réseau pendant la conversation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex h-[540px] flex-col p-5">
      <div className="flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm text-muted">
            Posez une question factuelle, par exemple « quel est mon chiffre d&apos;affaires des 30
            derniers jours ? » ou « quels produits sont en stock faible ? ».
          </p>
        ) : (
          messages.map((message) =>
            message.role === "tool" ? null : (
              <div key={message.id} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    message.role === "assistant"
                      ? "bg-primary-50 text-primary-600"
                      : "bg-slate-100 text-night"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 text-sm text-night">
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  {message.toolName ? (
                    <p className="mt-1 text-xs text-muted">outil utilisé : {message.toolName}</p>
                  ) : null}
                </div>
              </div>
            ),
          )
        )}
        {busy ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            MIMI consulte les outils…
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-4 flex items-end gap-2">
        <label htmlFor="mimi-message" className="sr-only">
          Votre question
        </label>
        <textarea
          id="mimi-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          placeholder="Votre question sur vos données"
          className="focusable min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-night"
        />
        <button
          type="submit"
          disabled={busy || !shopId}
          title={shopId ? undefined : "Aucune boutique sélectionnée"}
          className="focusable inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <SendHorizonal className="h-4 w-4" aria-hidden="true" />
          Envoyer
        </button>
      </form>
      {!shopId ? (
        <p className="mt-2 text-xs text-muted">Sélectionnez une boutique pour interroger MIMI.</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
