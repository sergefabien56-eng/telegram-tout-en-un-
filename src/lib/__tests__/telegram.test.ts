import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData, verifyWebhookSecret } from "@/lib/telegram";
import { generateLinkCode } from "@/lib/telegram-service";

const BOT_TOKEN = "123456:TEST-TOKEN-pour-les-tests-uniquement";

function buildInitData(params: Record<string, string>, botToken = BOT_TOKEN): string {
  const search = new URLSearchParams(params);
  const dataCheckString = [...search.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  search.set("hash", hash);
  return search.toString();
}

const USER = JSON.stringify({ id: 42, first_name: "Serge", username: "serge" });

describe("verifyInitData", () => {
  it("accepte un initData valide et frais", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "AAF",
      user: USER,
    });
    const result = verifyInitData(initData, BOT_TOKEN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe(42);
      expect(result.user.first_name).toBe("Serge");
    }
  });

  it("rejette une signature falsifiée", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: USER,
    });
    const tampered = initData.replace(/user=[^&]+/, "user=" + encodeURIComponent('{"id":999}'));
    expect(verifyInitData(tampered, BOT_TOKEN).ok).toBe(false);
  });

  it("rejette un initData expiré", () => {
    const initData = buildInitData({
      auth_date: String(Math.floor(Date.now() / 1000) - 7200),
      user: USER,
    });
    expect(verifyInitData(initData, BOT_TOKEN).ok).toBe(false);
  });

  it("rejette un mauvais token de bot", () => {
    const initData = buildInitData(
      { auth_date: String(Math.floor(Date.now() / 1000)), user: USER },
      "autre-token",
    );
    expect(verifyInitData(initData, BOT_TOKEN).ok).toBe(false);
  });

  it("rejette un hash manquant ou malformé", () => {
    expect(verifyInitData("auth_date=1&user=" + encodeURIComponent(USER), BOT_TOKEN).ok).toBe(
      false,
    );
    expect(verifyInitData("", BOT_TOKEN).ok).toBe(false);
  });
});

describe("verifyWebhookSecret", () => {
  it("accepte un secret identique", () => {
    expect(verifyWebhookSecret("mon-secret", "mon-secret")).toBe(true);
  });

  it("rejette un secret différent ou absent", () => {
    expect(verifyWebhookSecret("autre", "mon-secret")).toBe(false);
    expect(verifyWebhookSecret(null, "mon-secret")).toBe(false);
    expect(verifyWebhookSecret("mon-secret", "")).toBe(false);
  });
});

describe("generateLinkCode", () => {
  it("produit un code lisible et unique", () => {
    const code = generateLinkCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(generateLinkCode()).not.toBe(code);
  });
});
