import { eq } from "@OpenFarm/db/operators";
import { user } from "@OpenFarm/db/schema/auth";
import { LANGUAGES, resolveLanguage } from "@OpenFarm/i18n";
import { z } from "zod";

import type { Tx } from "../audit";
import { audited } from "../audit";
import { protectedProcedure } from "../index";

const languageOf = (userId: string) => async (tx: Tx) => {
  const row = await tx.query.user.findFirst({
    where: { id: userId },
    columns: { language: true },
  });
  return { language: row?.language ?? null };
};

/** A person's UI language. Stored on the user; Bangla when unset. Works before a Farm exists. */
export const languageRouter = {
  get: protectedProcedure.handler(async ({ context }) => {
    const row = await context.db.query.user.findFirst({
      where: { id: context.actor.id },
      columns: { language: true },
    });
    return { language: resolveLanguage(row) };
  }),
  set: protectedProcedure
    .input(z.object({ language: z.enum(LANGUAGES) }))
    .handler(async ({ context, input }) => {
      const userId = context.actor.id;
      await audited(context).write(
        {
          entity: "user",
          entityId: userId,
          action: "update",
          before: languageOf(userId),
          after: { language: input.language },
        },
        (tx) =>
          tx
            .update(user)
            .set({ language: input.language, updatedAt: context.clock.now() })
            .where(eq(user.id, userId))
      );
      return { language: input.language };
    }),
};
