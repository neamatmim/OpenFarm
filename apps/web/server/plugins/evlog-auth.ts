import { auth } from "@OpenFarm/auth";
import { createAuthIdentifier } from "evlog/better-auth";
import type { BetterAuthInstance } from "evlog/better-auth";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook(
    "request",
    createAuthIdentifier(auth as BetterAuthInstance, {
      exclude: ["/api/auth/**"],
      maskEmail: true,
    })
  );
});
