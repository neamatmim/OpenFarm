import type { TemplateContent } from "@OpenFarm/domain";
import {
  STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS,
  STANDARD_TEMPLATES,
} from "@OpenFarm/domain";
import { FakeClock } from "@OpenFarm/test-harness";
import { describe, expect, it } from "vitest";

import { createTestClient } from "../test/client";
import { caughtUpFrom } from "../test/standard-wording";
import { appRouter } from "./index";

// A Version saved before the code moved to American English (007bcab3, 2026-10-08) holds its conditions in the old
// spelling, "an_organisation". Saved Versions are never rewritten, so the farm reads them as today's: the Owner can
// open and preview the wording, and a farm still on such a standard is caught up as any other.

const AT = "2078-01-05T04:00:00.000Z";

const asOwner = async () => {
  const { client } = await createTestClient(appRouter, {
    as: "owner",
    clock: new FakeClock(AT),
  });
  return client;
};

/** Wording as a Version saved before 2026-10-08 holds it: every condition in the old spelling. */
const savedInTheOldSpelling = (content: TemplateContent) =>
  JSON.parse(
    JSON.stringify(content).replaceAll('"an_organization"', '"an_organisation"')
  ) as TemplateContent;

describe("a Version saved in the old spelling", () => {
  it("is shown, and previewed, as today's", async () => {
    const owner = await asOwner();
    const old = savedInTheOldSpelling(STANDARD_TEMPLATES.portal_consent);
    expect(JSON.stringify(old)).toContain("an_organisation");

    const { caughtUp } = await caughtUpFrom(owner, "portal_consent", old);
    const templates = await owner.templates.list();
    const listed = templates.find((one) => one.kind === "portal_consent");

    expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(
      "an_organisation"
    );
    expect(JSON.stringify(listed?.current.content)).not.toContain(
      "an_organisation"
    );
    // What the Owner's screen sends back to preview is what it was shown, which the wire takes.
    await expect(
      owner.templates.preview({
        kind: "portal_consent",
        content: listed?.current.content ?? old,
      })
    ).resolves.toBeDefined();
  });

  it("is caught up to the standard after it, as the same words in today's spelling are", async () => {
    const owner = await asOwner();

    const { before, caughtUp } = await caughtUpFrom(
      owner,
      "investment_agreement",
      savedInTheOldSpelling(STANDARD_AGREEMENT_BEFORE_ENGLISH_FACTS)
    );

    expect(caughtUp?.currentVersionId).not.toBe(before);
    // The standard after it: its facts said in English too.
    expect(JSON.stringify(caughtUp?.currentVersion?.content)).toContain(
      "{unitPrice} taka"
    );
  });
});
