import { eq } from "@OpenFarm/db/operators";
import { wageDraw } from "@OpenFarm/db/schema/money";
import { farmDayOf } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { Tx } from "../audit";
import { counterpartyNamed } from "../counterparty-store";
import { farmDay } from "../farm-clock";
import { enteredOn } from "../money-by-hand-store";
import {
  counterpartyInput,
  farmAccountChange,
  noteInput,
  paymentMethodChange,
} from "../money-inputs";
import {
  accountSaid,
  bookingOf,
  bookMoney,
  farmAccountShownOf,
  paymentMethodOf,
} from "../money-store";
import { lockTheFarm } from "../venture-store";
import { readWageDraw, takenOffDraw } from "../wage-draw-store";
import type { CorrectionKind } from "./correction";
import { changeOf, correctionInput, somethingChanged } from "./correction";

const loadDraw = (tx: Tx, farmId: string, id: string) =>
  tx.query.wageDraw.findFirst({
    where: { id, farmId },
    with: { person: { columns: { name: true } } },
  });

/**
 * What putting a Wage Draw right may change: how much — nothing takes it back whole — who drew it, the day, how it was
 * paid, and the note.
 */
export const wageDrawCorrectionInput = correctionInput({
  amountMoney: changeOf(z.number().min(0).max(100_000_000), z.number()),
  counterparty: changeOf(counterpartyInput, z.string()),
  drawnOn: changeOf(farmDay, z.string()),
  paymentMethod: paymentMethodChange,
  /** Which Farm Account bKash or bank money names, and its transaction ID. */
  farmAccount: farmAccountChange,
  note: changeOf(noteInput.nullable(), z.string().nullable()),
});

const refusedTaken = (takenMoney: number, message: string) =>
  new ORPCError("BAD_REQUEST", {
    message,
    data: { refusal: "draw_already_taken", takenMoney },
  });

/**
 * A Wage Draw put right — and with it its Money Event, rather than a second one. What a payday has already taken off it
 * stays taken: the draw is never put below that, and a draw a payday took from is not moved to somebody else.
 */
export const wageDrawCorrection: CorrectionKind<
  NonNullable<Awaited<ReturnType<typeof loadDraw>>>,
  z.infer<typeof wageDrawCorrectionInput>["changes"]
> = {
  entity: "wage_draw",
  table: wageDraw,
  roles: ["owner", "manager"],
  // The same lock a payday takes before it reads what is owed.
  lock: lockTheFarm,
  missing: "No such wage draw",
  load: loadDraw,
  entry: (row) => ({ enteredAt: row.recordedAt, enteredBy: row.recordedBy }),
  shown: async (tx, row) => ({
    farmAccount: await farmAccountShownOf(tx, row.farmId, "wage_draw", row.id),
    amountMoney: row.amountMoney,
    counterparty: row.person.name,
    drawnOn: farmDayOf(row.drawnAt),
    paymentMethod: await paymentMethodOf(tx, row.farmId, "wage_draw", row.id),
    note: row.note,
  }),
  shownAs: { counterparty: (to) => to.name },
  trail: (tx, row) => readWageDraw(tx, row.id),
  apply: async (tx, row, to, { context, now }) => {
    const takenMoney = await takenOffDraw(tx, row.id);
    if (to.amountMoney !== undefined && to.amountMoney < takenMoney) {
      throw refusedTaken(
        takenMoney,
        "A payday has already taken more of this draw than that"
      );
    }
    if (to.counterparty !== undefined && takenMoney > 0) {
      throw refusedTaken(
        takenMoney,
        "A payday has already taken some of this draw; it stays that person's"
      );
    }
    const counterpartyId =
      to.counterparty === undefined
        ? row.counterpartyId
        : await counterpartyNamed(tx, row.farmId, to.counterparty, now);
    const drawnAt =
      to.drawnOn === undefined ? row.drawnAt : enteredOn(to.drawnOn, now);
    const amountMoney = to.amountMoney ?? row.amountMoney;
    const putRight = {
      ...(to.amountMoney === undefined ? {} : { amountMoney }),
      ...(to.counterparty === undefined ? {} : { counterpartyId }),
      ...(to.drawnOn === undefined ? {} : { drawnAt }),
      ...(to.note === undefined ? {} : { note: to.note }),
    };
    if (somethingChanged(putRight)) {
      await tx.update(wageDraw).set(putRight).where(eq(wageDraw.id, row.id));
    }
    await bookMoney(
      tx,
      bookingOf(
        context,
        context.roleUsed,
        now,
        to.farmAccount ? accountSaid(["wage_draw"], to.farmAccount) : undefined
      ),
      {
        source: "wage_draw",
        sourceId: row.id,
        categoryKey: "wages",
        amountMoney,
        occurredAt: drawnAt,
        counterpartyId,
        paymentMethod: to.paymentMethod,
      }
    );
  },
};
