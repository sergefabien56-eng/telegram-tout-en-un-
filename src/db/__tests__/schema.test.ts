import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

describe("schéma Phase 1", () => {
  it("définit les tables essentielles", () => {
    const tables = Object.keys(schema).filter((k) =>
      ["users", "sessions", "shops", "shopMembers", "auditLogs", "jobs", "notifications"].includes(k),
    );
    expect(tables.length).toBe(7);
  });

  it("les tables métier portent un shop_id", () => {
    expect("shopId" in schema.shopMembers).toBe(true);
    expect("shopId" in schema.jobs).toBe(true);
    expect("shopId" in schema.notifications).toBe(true);
  });
});
