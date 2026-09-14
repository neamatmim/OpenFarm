import { redirect } from "@tanstack/react-router";

import type { Audience, Role } from "@/components/shell/navigation";
import { isFor } from "@/components/shell/navigation";

/**
 * A screen's door: somebody whose Roles it is not for goes to their own landing instead of meeting a screen that can
 * only fail. The same audiences as the menu, so a destination that is offered is one that opens — the procedures
 * behind it still check.
 */
export const onlyFor =
  (audience: Audience, { visitors = true }: { visitors?: boolean } = {}) =>
  ({
    context,
  }: {
    context: { me: { roles: readonly string[]; visiting?: boolean } };
  }) => {
    // A vet called in for a visit holds the Vet role but not the whole farm's view: a screen about the farm at
    // large is not theirs, unless another Role they hold opens it.
    const withoutTheVisit = context.me.roles.filter(
      (role) => role !== "vet"
    ) as readonly Role[];
    const onlyAsVisitor =
      context.me.visiting === true && !isFor(audience, withoutTheVisit);
    if (
      !isFor(audience, context.me.roles as readonly Role[]) ||
      (!visitors && onlyAsVisitor)
    ) {
      throw redirect({ to: "/dashboard" });
    }
  };
