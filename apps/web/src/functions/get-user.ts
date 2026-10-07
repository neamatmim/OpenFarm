import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

/**
 * Who is signed in, and until when — or nobody. Never the session itself: its token, the address it was made from and
 * the browser are what the HttpOnly cookie keeps from the page's own scripts, and handing them back would undo it.
 */
export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) =>
    context.session
      ? {
          user: {
            id: context.session.user.id,
            name: context.session.user.name,
            email: context.session.user.email,
          },
          expiresAt: context.session.session.expiresAt,
        }
      : null
  );
