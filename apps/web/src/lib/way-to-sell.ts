import type { AnimalState, Side } from "@OpenFarm/domain";
import { isExitState } from "@OpenFarm/domain";

/**
 * The one honest way to sell her from where she stands. One being fattened is confirmed Ready for Sale first — that is
 * what raises her Pre-sale check, the Vet's certificate and the movement permit — so she is offered the confirming, not
 * the sale. One already Ready, or a Dairy animal going to a butcher (who is never Ready for Sale), is offered the Sale.
 * A bull still in Quarantine, or one who has left, neither.
 */
export const wayToSell = (her: {
  side: Side;
  state: AnimalState;
}): "sell" | "confirm_ready" | null => {
  if (isExitState(her.state) || her.state === "quarantine") {
    return null;
  }
  if (her.state === "fattening") {
    return "confirm_ready";
  }
  return her.state === "ready_for_sale" || her.side === "dairy" ? "sell" : null;
};

/** Whether selling her now skips her Pre-sale check: one being fattened, picked by her tag, never confirmed Ready. */
export const skipsThePreSaleCheck = (her: {
  side: Side;
  state: AnimalState;
}): boolean => wayToSell(her) === "confirm_ready";
