import { describe, expect, it } from "vitest";

import { afterNaming, buyerCalled, NOBODY_PICKED } from "./milk-buyer-terms";
import { NO_RECEIVABLE } from "./receivable";

const center = {
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
const buyers = [center, sweetShop];
const blank = { buyerName: "", buyerAddress: "", buyerPhone: "", price: "" };
const opened = { ...NOBODY_PICKED, form: blank };
const ALL_ON_CREDIT = { owed: true, paidNow: "0", promisedBy: "" };

describe("a milk buyer named on the Dispatch sheet", () => {
  it("is found as the farm compares names: any capitals, any spaces", () => {
    expect(buyerCalled(buyers, "  mishti   GHAR ")).toBe(sweetShop);
    expect(buyerCalled(buyers, "Mishti")).toBeNull();
  });

  it("fills in his price, address and phone, and books a center that takes it on credit as all on credit", () => {
    expect(afterNaming(opened, "সংগ্রহ কেন্দ্র", buyers)).toEqual({
      form: {
        buyerName: "সংগ্রহ কেন্দ্র",
        buyerAddress: "চৌরাস্তা",
        buyerPhone: "01711000000",
        price: "55",
      },
      receivable: ALL_ON_CREDIT,
      filledFrom: center,
      priceToFollow: false,
    });
  });

  it("never writes over what was typed before he was named", () => {
    const typed = { ...opened, form: { ...blank, price: "57" } };
    expect(afterNaming(typed, "Mishti Ghar", buyers).form.price).toBe("57");
  });

  it("takes the last buyer's terms back out when another is named, his credit with them", () => {
    const filled = afterNaming(opened, "সংগ্রহ কেন্দ্র", buyers);
    expect(afterNaming(filled, "Mishti Ghar", buyers)).toEqual({
      form: {
        buyerName: "Mishti Ghar",
        buyerAddress: "",
        buyerPhone: "",
        price: "62",
      },
      receivable: NO_RECEIVABLE,
      filledFrom: sweetShop,
      priceToFollow: false,
    });
  });

  it("takes them back out when the name is changed to one the farm does not know, so a new buyer never takes the old one's credit", () => {
    const filled = afterNaming(opened, "সংগ্রহ কেন্দ্র", buyers);
    expect(afterNaming(filled, "নতুন ক্রেতা", buyers)).toEqual({
      form: { ...blank, buyerName: "নতুন ক্রেতা" },
      receivable: NO_RECEIVABLE,
      filledFrom: null,
      priceToFollow: false,
    });
  });

  it("leaves what was said of the money alone once somebody changed it", () => {
    const filled = afterNaming(opened, "সংগ্রহ কেন্দ্র", buyers);
    const paidSome = {
      ...filled,
      receivable: { owed: true, paidNow: "500", promisedBy: "" },
    };
    expect(afterNaming(paidSome, "Mishti Ghar", buyers).receivable).toBe(
      paidSome.receivable
    );
  });

  it("fills in a name typed before the farm's buyers had answered, once they do, and only the boxes nobody typed in", () => {
    const typedEarly = afterNaming(
      { ...opened, form: { ...blank, buyerPhone: "01700000000" } },
      "সংগ্রহ কেন্দ্র",
      []
    );
    expect(typedEarly.filledFrom).toBeNull();
    expect(
      afterNaming(typedEarly, typedEarly.form.buyerName, buyers)
    ).toMatchObject({
      form: { buyerPhone: "01700000000", price: "55" },
      filledFrom: center,
      priceToFollow: false,
    });
  });

  it("sends a centre whose last milk went with the price to follow so again, with no price in the box", () => {
    const milkVita = {
      name: "Milk Vita",
      address: null,
      phone: null,
      pricePerLiterMoney: null,
      paysLater: true,
      priceToFollow: true,
    };
    const named = afterNaming(opened, "milk vita", [...buyers, milkVita]);

    expect(named).toMatchObject({
      form: { price: "" },
      receivable: ALL_ON_CREDIT,
      priceToFollow: true,
    });
    // Named otherwise, the price to follow goes back out with his other terms.
    expect(
      afterNaming(named, "Mishti Ghar", [...buyers, milkVita])
    ).toMatchObject({ form: { price: "62" }, priceToFollow: false });
  });

  it("leaves the price to follow alone once somebody ticked it", () => {
    const ticked = { ...opened, priceToFollow: true };

    expect(afterNaming(ticked, "Mishti Ghar", buyers).priceToFollow).toBe(true);
  });

  it("reads a buyer from an answer kept before the farm said who takes it on credit as paying at the gate", () => {
    const { paysLater: _, ...kept } = center;
    expect(afterNaming(opened, kept.name, [kept]).receivable).toBe(
      NO_RECEIVABLE
    );
  });
});
