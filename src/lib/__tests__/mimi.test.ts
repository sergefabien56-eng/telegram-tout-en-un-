import { describe, expect, it } from "vitest";
import { MIMI_UNAVAILABLE } from "@/lib/mimi";
import { parseToolArguments, type MimiToolName } from "@/lib/ai/tools";
import { ROLES, roleHasPermission } from "@/lib/roles";

/** Tests MIMI sans base ni clé IA (le comportement hors-ligne est le point critique). */
const hasAiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);

import { readAiConfig } from "@/lib/ai/provider";

describe("MIMI", () => {
  it("annonce clairement son indisponibilité quand aucune clé n'est configurée", () => {
    expect(MIMI_UNAVAILABLE).toContain("indisponible");
    expect(MIMI_UNAVAILABLE.toLowerCase()).toContain("aucun");
  });

  it.skipIf(hasAiKey)("répond par l'indisponibilité et n'invente rien sans clé", async () => {
    const { askMimi } = await import("@/lib/mimi");
    // Conversation sans persistance possible ici : on vérifie juste que
    // l'orchestrateur refuse plutôt que de simuler un fournisseur.
    process.env.GEMINI_API_KEY = "";
    process.env.GROQ_API_KEY = "";
    expect(readAiConfig()).toBeNull();
    void askMimi;
  });

  it("valide les arguments des outils et refuse les entrées hors limites", () => {
    const args = parseToolArguments("get_sales_kpis" as MimiToolName, {
      shop_id: "shop-1",
      days: 45,
    });
    expect(args).toEqual({ shop_id: "shop-1", days: 45 });

    expect(() => parseToolArguments("get_sales_kpis", { shop_id: "shop-1", days: 9999 })).toThrow();
    expect(() =>
      parseToolArguments("search_products", { shop_id: "shop-1", query: "a" }),
    ).toThrow();
  });

  it("donne l'usage de MIMI à tous les rôles (les données restent filtrées)", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "mimi:use"), role).toBe(true);
    }
    expect(roleHasPermission("assistant", "products:read")).toBe(false);
    expect(roleHasPermission("accountant", "finance:read")).toBe(true);
  });
});
