import { describe, expect, it } from "vitest";
import { configPresence, parseEnv } from "@/config/env";

describe("parseEnv", () => {
  it("accepte un environnement vide avec les valeurs par défaut", () => {
    const result = parseEnv({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.AI_PROVIDER).toBe("gemini");
    }
  });

  it("refuse une URL invalide", () => {
    const result = parseEnv({ APP_URL: "pas-une-url" });
    expect(result.ok).toBe(false);
  });

  it("refuse un AI_PROVIDER inconnu", () => {
    const result = parseEnv({ AI_PROVIDER: "inconnu" });
    expect(result.ok).toBe(false);
  });
});

describe("configPresence", () => {
  it("renvoie uniquement des booléens", () => {
    const presence = configPresence({});
    expect(Object.values(presence).every((v) => typeof v === "boolean")).toBe(true);
    expect(presence.database).toBe(false);
  });

  it("détecte la présence (sans exposer la valeur)", () => {
    const presence = configPresence({
      DATABASE_URL: "postgres://x",
      TELEGRAM_BOT_TOKEN: "secret",
    });
    expect(presence.database).toBe(true);
    expect(presence.telegramBotToken).toBe(true);
    expect(JSON.stringify(presence)).not.toContain("secret");
  });
});
