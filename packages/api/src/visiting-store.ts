import { ORPCError } from "@orpc/server";

/** Who a request is, as far as a visiting Vet's Cases go. */
interface Caseload {
  roleUsed: string | null;
  visiting: boolean;
  caseAnimalIds: string[];
}

/** Whether this request is a visiting Vet's, narrowed to their Cases. */
export const onTheirCases = (context: Caseload): boolean =>
  context.roleUsed === "vet" && context.visiting;

/**
 * Refuses an animal that is not on a visiting Vet's open Cases — as not found, because to them she is not there.
 * Everyone else passes.
 */
export const assertOnTheirCases = (
  context: Caseload,
  animalId: string | null | undefined
) => {
  if (
    onTheirCases(context) &&
    !(animalId && context.caseAnimalIds.includes(animalId))
  ) {
    throw new ORPCError("NOT_FOUND", { message: "Not one of your cases" });
  }
};
