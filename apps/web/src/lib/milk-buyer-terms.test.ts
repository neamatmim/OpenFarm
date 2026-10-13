import { describe, expect, it } from "vitest";

import { buyerCalled, withBuyerTerms } from "./milk-buyer-terms";
import { NO_RECEIVABLE } from "./receivable";

const centre = {
  name: "সংগ্রহ কেন্দ্র",
  address: "চৌরাস্তা",
  phone: "01711000000",
  pricePerLiterMoney: 55,
  paysLater: true,
};
const sweetShop = {
  name: "Mishti Ghar",
  address: null,
  phone: null,
  pricePerLiterMoney: 62,
  paysLater: false,
};
const blank = { buyerAddress: "", buyerPhone: "", price: "" };

describe("a milk buyer picked on the Dispatch sheet", () => {
  it("is found however his name is capitalized or spaced", () => {
    expect(buyerCalled([centre, sweetShop], " mishti ghar ")).toBe(sweetShop);
    expect(buyerCalled([centre, sweetShop], "Mishti")).toBeNull();
  });

  it("fills in his price, address and phone, and books a centre that pays on its round as owing", () => {
    expect(withBuyerTerms(blank, NO_RECEIVABLE, centre, null)).toEqual({
      form: { buyerAddress: "চৌরাস্তা", buyerPhone: "01711000000", price: "55" },
      receivable: { owed: true, paidNow: "0", promisedBy: "" },
    });
  });

  it("never writes over what was typed before he was picked", () => {
    const typed = { buyerAddress: "", buyerPhone: "", price: "57" };
    expect(withBuyerTerms(typed, NO_RECEIVABLE, sweetShop, null).form).toEqual(
      typed
    );
  });

  it("takes back the last buyer's terms when another is picked, and his paying later with them", () => {
    const filled = withBuyerTerms(blank, NO_RECEIVABLE, centre, null);
    expect(
      withBuyerTerms(filled.form, filled.receivable, sweetShop, centre)
    ).toEqual({
      form: { buyerAddress: "", buyerPhone: "", price: "62" },
      receivable: NO_RECEIVABLE,
    });
  });

  it("leaves what was said of the money alone once somebody changed it", () => {
    const filled = withBuyerTerms(blank, NO_RECEIVABLE, centre, null);
    const paidSome = { owed: true, paidNow: "500", promisedBy: "" };
    expect(
      withBuyerTerms(filled.form, paidSome, sweetShop, centre).receivable
    ).toBe(paidSome);
  });
});
