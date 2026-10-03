import { agreementsProcedures } from "./ventures/agreements";
import { booksProcedures } from "./ventures/books";
import { capitalProcedures } from "./ventures/capital";
import { lifecycleProcedures } from "./ventures/lifecycle";
import { settlementProcedures } from "./ventures/settlement";
import { tradingProcedures } from "./ventures/trading";

/**
 * Everything done with a Venture, in its parts: its life and plan, its Agreements, its capital and Floats, animals moved
 * between purses, its Settlement, and its books. Each part is a file of its own under ./ventures; what they share —
 * inputs, refusals, the acts more than one does — is ./ventures/shared.
 */
export const venturesRouter = {
  ...lifecycleProcedures,
  ...agreementsProcedures,
  ...capitalProcedures,
  ...tradingProcedures,
  ...settlementProcedures,
  ...booksProcedures,
};
