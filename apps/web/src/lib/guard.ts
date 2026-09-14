import { redirect } from "@tanstack/react-router";

import type { Audience, Role } from "@/components/shell/navigation";
import { isFor } from "@/components/shell/navigation";

/**
 * A screen's door: somebody whose Roles it is not for goes to their own landing instead of meeting a screen that can
 * only fail. The same audiences as the menu, so a destination that is offered is one that opens — the procedures
 * behind it still check.
 */
export const onlyFor =
  (audience: Audience) =>
  ({ context }: { context: { me: { roles: readonly string[] } } }) => {
    if (!isFor(audience, context.me.roles as readonly Role[])) {
      throw redirect({ to: "/dashboard" });
    }
  };
