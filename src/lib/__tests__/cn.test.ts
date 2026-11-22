import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("fusionne des classes simples", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("ignore les valeurs falsy", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("résout les conflits Tailwind (le dernier gagne)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
