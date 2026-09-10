import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { LANGUAGES, resolveLanguage } from "@OpenFarm/i18n";
import { z } from "zod";

import { protectedProcedure } from "../index";

/** A person's UI language. Stored on the user; Bangla when unset. */
export const languageRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    const row = await context.db.query.user.findFirst({
      where: { id: context.session.user.id },
      columns: { language: true },
    });
    return { language: resolveLanguage(row) };
  }),
  set: protectedProcedure
    .input(z.object({ language: z.enum(LANGUAGES) }))
    .handler(async ({ context, input }) => {
      await context.db
        .update(user)
        .set({ language: input.language, updatedAt: context.clock.now() })
        .where(eq(user.id, context.session.user.id));
      return { language: input.language };
    }),
};
