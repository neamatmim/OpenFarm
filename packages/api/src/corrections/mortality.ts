import { mortality } from "@OpenFarm/db/schema/herd";
import { DISPOSALS, MORTALITY_KINDS } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { correctMortality, readMortality } from "../mortality-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, herVenturesAround } from "./correction";

const loadMortality = (tx: Tx, farmId: string, id: string) =>
  tx.query.mortality.findFirst({ where: { id, farmId } });

const kind = z.enum(MORTALITY_KINDS);
const disposal = z.enum(DISPOSALS);

/**
 * What putting a mortality right may change: whether she died or was culled, the cause the farm learned afterwards,
 * the disposal written down wrong, and the morning it actually happened. Asked about by her Tag Number, as the screen
 * knows her.
 */
export const mortalityCorrectionInput = correctionInput({
  kind: changeOf(kind, kind),
  cause: changeOf(z.string().trim().min(1).max(300), z.string()),
  disposal: changeOf(disposal, disposal.nullable()),
  disposalNote: changeOf(z.string().trim().max(300), z.string().nullable()),
  happenedAt: changeOf(z.coerce.date(), z.coerce.date()),
})
  .omit({ id: true })
  .extend({ tagNumber: z.string().trim().min(1).max(32) });

/**
 * A mortality put right. Whether she died or was culled is her exit State as well as this row, so both move together:
 * a death written up as a cull by somebody in a hurry is a mistake the farm can correct rather than live with.
 */
export const mortalityCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadMortality>>>,
  z.infer<typeof mortalityCorrectionInput>["changes"]
> = {
  entity: "mortality",
  table: mortality,
  roles: ["owner", "manager"],
  // How she left decides whether her Venture ever sold her, and so what its Settlement counted.
  // How she left, and when — which is what decides whether her Venture ever sold her at all.
  venturesOf: herVenturesAround((row) => row.happenedAt),
  missing: "No such death or cull",
  load: loadMortality,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: (_tx, row) =>
    Promise.resolve({
      kind: row.kind,
      cause: row.cause,
      disposal: row.disposal,
      disposalNote: row.disposalNote,
      happenedAt: row.happenedAt,
    }),
  trail: (tx, row) => readMortality(tx, row.id),
  apply: async (tx, row, to, { now }) => {
    if (to.happenedAt && to.happenedAt > now) {
      throw new ORPCError("BAD_REQUEST", {
        message: "An animal cannot have died in the future",
      });
    }
    await correctMortality(
      tx,
      row.farmId,
      row.id,
      { id: row.animalId },
      to,
      now
    );
  },
};
