import { describe, expect, it } from "vitest";
import { isRole, roleHasPermission, ROLES } from "@/lib/permissions";

describe("permissions par rôle", () => {
  it("owner a tous les droits", () => {
    expect(roleHasPermission("owner", "finance:write")).toBe(true);
    expect(roleHasPermission("owner", "members:write")).toBe(true);
  });

  it("manager gère les membres et les écritures courantes", () => {
    expect(roleHasPermission("manager", "members:write")).toBe(true);
    expect(roleHasPermission("manager", "inventory:write")).toBe(true);
    expect(roleHasPermission("manager", "finance:write")).toBe(false);
  });

  it("stock touche aux stocks mais pas aux finances", () => {
    expect(roleHasPermission("stock", "inventory:write")).toBe(true);
    expect(roleHasPermission("stock", "orders:write")).toBe(false);
    expect(roleHasPermission("stock", "finance:read")).toBe(false);
  });

  it("assistant est en lecture seule", () => {
    expect(roleHasPermission("assistant", "orders:read")).toBe(true);
    expect(roleHasPermission("assistant", "inventory:write")).toBe(false);
  });

  it("valide les rôles", () => {
    expect(ROLES).toContain("accountant");
    expect(isRole("manager")).toBe(true);
    expect(isRole("admin")).toBe(false);
  });
});
