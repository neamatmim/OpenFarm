import { canTransition } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";

import type { Tx } from "../audit";
import type { EffectInput, EffectResult } from "../effects";
import { entersState, loadLiveAnimal } from "../herd-store";
import type { EffectKind } from "./effect";

type DryOffFacts = Pick<
  EffectInput,
  "instance" | "animalId" | "skipped" | "recordedAt" | "now"
>;

/**
 * Dries her off: a milking cow is Dry from the moment this Step says, and her Lactation ends there
 * without being forgotten.
 *
 * Keyed on the cow rather than a row of its own, because Dry is her State and the State is the
 * record: a phone replaying the entry finds her Dry already and dries nobody twice. What it will not
 * do is put her back in milk when the entry is corrected to a skip. What she was before, and since
 * when, matters to every State-triggered procedure — a cow put back in Milking from here would look
 * freshly calved — so she stays Dry and a person is asked (Needs Review, irreversible effect).
 */
const dryHerOff = async (tx: Tx, input: DryOffFacts): Promise<EffectResult> => {
  if (!input.animalId) {
    throw new ORPCError("BAD_REQUEST", {
      message: "This step dries off a cow, and it was not recorded against one",
    });
  }
  const her = await tx.query.animal.findFirst({
    where: { id: input.animalId, farmId: input.instance.farmId },
    columns: { tagNumber: true },
  });
  if (!her) {
    throw new ORPCError("NOT_FOUND", { message: "No such animal" });
  }
  // A cow who has left the farm cannot be dried off, whoever is asking.
  const live = await loadLiveAnimal(tx, input.instance.farmId, her.tagNumber);
  if (input.skipped) {
    // Only an entry that dried her has anything to undo: she went Dry at the moment it was recorded.
    // A cow already Dry when this entry came asks nobody anything.
    const driedByThisEntry =
      live.state === "dry" &&
      live.stateChangedAt.getTime() === input.recordedAt.getTime();
    return driedByThisEntry
      ? {
          kind: "dry_off",
          dried: false,
          standsAside: { because: "cannot_return_to_milk" },
        }
      : null;
  }
  if (live.state === "dry") {
    return { kind: "dry_off", dried: false, standsAside: null };
  }
  if (!canTransition(live.state, "dry")) {
    throw new ORPCError("BAD_REQUEST", {
      message: "Only a cow in milk is dried off",
      data: { refusal: "dry_off_of_a_cow_not_in_milk" },
    });
  }
  await entersState(tx, input.instance.farmId, live, {
    state: "dry",
    at: input.recordedAt,
    now: input.now,
  });
  return { kind: "dry_off", dried: true, standsAside: null };
};

/** A Step that dries a cow off. */
export const dryOffEffect: EffectKind<DryOffFacts> = {
  kind: "dry_off",
  apply: dryHerOff,
};
