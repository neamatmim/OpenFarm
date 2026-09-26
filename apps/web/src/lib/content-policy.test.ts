import { describe, expect, it } from "vitest";

import { FARM_POLICY, portalPolicy } from "./content-policy";

// The Investor address is an origin of its own, so its policy can be strict where a policy per path on the farm's
// could not (ADR 0009): a script runs there only from the portal itself or with the answer's own nonce.

/** One directive of a policy, by its name. */
const directive = (policy: string, name: string) =>
  policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));

describe("the Investor address's policy", () => {
  it("runs only its own scripts and those carrying this answer's nonce, and talks to nothing else", () => {
    const policy = portalPolicy("abc123");

    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'nonce-abc123'"
    );
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'none'");
    expect(policy).not.toContain("unsafe-eval");
    expect(directive(policy, "script-src")).not.toContain("unsafe-inline");
  });
});

describe("the farm's policy", () => {
  it("is unchanged by the portal having an address of its own: no nonce, and scripts left alone", () => {
    expect(FARM_POLICY).not.toContain("nonce");
    expect(directive(FARM_POLICY, "script-src")).toBeUndefined();
    expect(directive(FARM_POLICY, "frame-ancestors")).toBe(
      "frame-ancestors 'none'"
    );
  });
});
