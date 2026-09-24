import type { Language, MessageKey } from "@OpenFarm/i18n";
import { translate } from "@OpenFarm/i18n";
import { describe, expect, it } from "vitest";

import { ALERT_KINDS } from "./alerts";
import type { NoticeFacts } from "./notice-facts";
import { hoursLate, noticeFilling } from "./notice-words";
import { SAYS } from "./notify";

// What a Notice says is filled from the facts it was raised with. A placeholder nobody fills prints itself —
// "{sopBn} — নতুন সংস্করণ {number}" sat in the farm's own list for every SOP's second Version — so every kind's
// words are filled here from facts of its own shape, in both languages, and nothing may be left in braces.

/** One of every kind, as the farm raises it. Typed on every kind, so a new one cannot be left out of this test. */
const EXAMPLE: NoticeFacts = {
  instance_overdue: {
    sopBn: "সকালের দোহন",
    sopEn: "Morning milking",
    pen: "দোহন পেন ১",
    dueAt: "2038-03-01T00:30:00.000Z",
    minutesOverdue: 95,
  },
  instance_escalated: {
    sopBn: "সকালের দোহন",
    sopEn: "Morning milking",
    pen: "দোহন পেন ১",
    dueAt: "2038-03-01T00:30:00.000Z",
    minutesOverdue: 200,
  },
  instance_sent_back: {
    sopBn: "খাবার দেওয়া",
    sopEn: "Feeding",
    pen: "বাছুর পেন",
    dueAt: "2038-03-01T02:00:00.000Z",
    reason: "ছবি নেই",
  },
  needs_review: {
    reason: "late_entry",
    sopBn: "খাবার দেওয়া",
    sopEn: "Feeding",
    pen: "বাছুর পেন",
  },
  sop_published: { sopBn: "খাবার দেওয়া", sopEn: "Feeding", number: 2 },
  sop_proposed: { sopBn: "খাবার দেওয়া", sopEn: "Feeding" },
  sop_retired: {
    sopBn: "খাবার দেওয়া",
    sopEn: "Feeding",
    definitionId: "sop-1",
  },
  sop_restored: {
    sopBn: "খাবার দেওয়া",
    sopEn: "Feeding",
    definitionId: "sop-1",
  },
  withdrawal_ending: {
    tag: "BD-0142",
    animalId: "animal-1",
    until: "2038-03-04",
  },
  withdrawal_changed: { tag: "BD-0142", until: "2038-03-06" },
  notifiable_diagnosis: { tag: "BD-0142", disease: "অ্যানথ্রাক্স" },
  low_stock: {
    feedItemId: "feed-1",
    nameBn: "গমের ভুসি",
    unit: "kg",
    onHand: 40,
    threshold: 100,
  },
  money_awaiting_approval: {
    moneyEventId: "money-1",
    amountBdt: 120_000,
    categoryBn: "খাদ্য",
    categoryEn: "Feed",
  },
  registration_renewal_due: { expiresOn: "2038-06-30" },
  investor_statement_due: {
    ventureId: "venture-1",
    venture: "কোরবানি ২০৩৮",
    investors: 3,
    occasion: "কেনা শেষ",
  },
  entry_rejected: { count: 2, reason: "পশুটি আর খামারে নেই" },
  day_not_turning: { since: "2038-03-01T00:00:00.000Z" },
  backup_overdue: { since: "2038-03-01T00:00:00.000Z" },
  lot_expiring: {
    what: "medicine",
    itemId: "drug-1",
    name: "অক্সিটেট্রাসাইক্লিন",
    unit: null,
    lotNumber: "DEMO-LOT-1",
    expiresOn: "2038-04-01",
    left: 34,
  },
  lot_expired: {
    what: "feed",
    itemId: "feed-1",
    name: "গমের ভুসি",
    unit: "kg",
    lotNumber: null,
    expiresOn: "2038-02-28",
    left: 12.5,
  },
  medicine_low_stock: {
    productId: "drug-1",
    name: "অক্সিটেট্রাসাইক্লিন",
    onHand: 4,
    threshold: 10,
  },
  expired_dose_given: {
    tag: "BD-0142",
    name: "অক্সিটেট্রাসাইক্লিন",
    lotNumber: "DEMO-LOT-1",
    expiresOn: "2038-02-28",
  },
};

const LANGUAGES: readonly Language[] = ["bn", "en"];

/** Every sentence a kind is said in, one person at a time: in the list, in a pocket and by text. The evening's post
 *  counts rather than names, and is filled with its count where it is carried. */
const sentencesOf = (kind: (typeof ALERT_KINDS)[number]): MessageKey[] => {
  const says = SAYS[kind];
  return [says.app, says.push?.title, says.push?.body, says.sms].filter(
    (key): key is MessageKey => key !== undefined
  );
};

describe("what a Notice's words are filled with", () => {
  it("leaves no placeholder unfilled in any kind, in either language", () => {
    const unfilled = ALERT_KINDS.flatMap((kind) =>
      LANGUAGES.flatMap((language) =>
        sentencesOf(kind)
          .map((key) => ({
            kind,
            language,
            said: translate(
              language,
              key,
              noticeFilling(kind, EXAMPLE[kind], language)
            ),
          }))
          .filter(({ said }) => said.includes("{"))
      )
    );
    expect(unfilled).toEqual([]);
  });

  it("names a new Version of an SOP, in the reader's language", () => {
    const params = (language: Language) =>
      noticeFilling("sop_published", EXAMPLE.sop_published, language);
    expect(translate("bn", "alerts.sopPublished", params("bn"))).toBe(
      "খাবার দেওয়া — নতুন সংস্করণ ২"
    );
    expect(translate("en", "alerts.sopPublished", params("en"))).toBe(
      "Feeding — new version 2"
    );
  });

  it("names it in Bangla to everyone for a Notice raised before the English was kept", () => {
    // What the seeded farm holds: raised with only the Bangla name.
    const older = { sopBn: "খাবার দেওয়া", number: 2 };
    expect(
      translate(
        "en",
        "alerts.sopPublished",
        noticeFilling("sop_published", older, "en")
      )
    ).toBe("খাবার দেওয়া — new version 2");
  });

  it("says the whole farm for work that stands in no Pen, in a pocket as in the list", () => {
    const renewal = { ...EXAMPLE.instance_overdue, pen: null };
    expect(noticeFilling("instance_overdue", renewal, "en").pen).toBe(
      translate("en", "work.wholeFarm")
    );
  });

  it("says a fact an older Notice was raised without as nothing, not as its own placeholder", () => {
    expect(
      translate(
        "en",
        "alerts.withdrawalChanged",
        noticeFilling("withdrawal_changed", {}, "en")
      )
    ).not.toContain("{");
  });

  it("fills nothing for a kind this build has never heard of", () => {
    expect(noticeFilling("a_kind_from_the_future", { tag: "x" }, "bn")).toEqual(
      {}
    );
  });

  it("counts a Lot of medicine in doses and a Lot of feed in its own unit", () => {
    expect(noticeFilling("lot_expiring", EXAMPLE.lot_expiring, "en").left).toBe(
      "34 doses"
    );
    expect(noticeFilling("lot_expired", EXAMPLE.lot_expired, "en").left).toBe(
      "12.5 kg"
    );
  });
});

describe("how late something is, in hours", () => {
  it("is never less than one, and rounds to the nearest hour", () => {
    expect(hoursLate(0)).toBe(1);
    expect(hoursLate(89)).toBe(1);
    expect(hoursLate(90)).toBe(2);
    expect(hoursLate(200)).toBe(3);
  });
});
