import { isCommonPassword } from "@OpenFarm/auth/common-passwords";
import { ORPCError } from "@orpc/server";

/**
 * Refuses a password everybody uses (ASVS 6.2.4), wherever the farm's own procedures let somebody choose one: taking
 * up a portal invitation, setting one with the farm's code. One refusal, said once, so the two can never word it
 * differently. Better Auth's own endpoints are refused by the door (`@OpenFarm/auth`).
 */
export const refuseCommonPassword = (password: string): void => {
  if (isCommonPassword(password)) {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "That password is one of the most common, and anybody could guess it",
      data: { refusal: "password_too_common" },
    });
  }
};
