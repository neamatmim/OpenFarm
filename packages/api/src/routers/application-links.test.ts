import { auditEvent } from "@OpenFarm/db/schema/audit";
import { FakeClock, scratchDb } from "@OpenFarm/test-harness";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { hashOfLinkToken } from "../application-links";
import type { EmailMessage, EmailTransport } from "../email";
import { silentSms } from "../sms";
import type { SmsTransport } from "../sms";
import { createTestClient } from "../test/client";
import { textsKept, textsTo } from "../test/portal-client";
import { appRouter } from "./index";

// An Application Link: the Owner's invitation to one person they know to fill in their own details online, emailed to
// them (ADR 0034). Behind the farm's switch, off until the Owner turns it on, and only while the portal is open and the
// farm can text the code that opens a link.

const suffix = `${Date.now()}`.slice(-6);
const JANUARY = "2098-01-01T04:00:00.000Z";
const A_MINUTE_LATER = "2098-01-01T04:01:00.000Z";

let phones = 0;
/** A mobile of this file's own: eleven digits, a count, and the run's six. */
const aMobile = () => {
  phones += 1;
  return `016${String(phones).padStart(2, "0")}${suffix}`;
};

/** A mail account that keeps what it was given. */
const anOutbox = () => {
  const sent: { to: string; message: EmailMessage }[] = [];
  const transport: EmailTransport = {
    sends: true,
    send: (to, message) => {
      sent.push({ to, message });
      return Promise.resolve({ delivered: true });
    },
  };
  return { sent, transport };
};

const as = async (
  role: "owner" | "manager",
  {
    at = JANUARY,
    sms = textsKept,
    email,
  }: { at?: string; sms?: SmsTransport; email?: EmailTransport } = {}
) => {
  const { client } = await createTestClient(appRouter, {
    as: role,
    clock: new FakeClock(at),
    sms,
    email,
  });
  return client;
};

/** Sets the farm's switches as the Owner, each by a fresh client, as a fresh request would. */
const turnApplications = async (shown: boolean) => {
  const owner = await as("owner");
  await owner.investors.setApplicationsOpen({ shown });
};
const turnPortal = async (open: boolean) => {
  const owner = await as("owner");
  await owner.investors.setPortalOpen({ open });
};

const refusalOf = async (act: Promise<unknown>) => {
  try {
    await act;
  } catch (error) {
    return (error as { data?: { refusal?: string } }).data?.refusal;
  }
  throw new Error("expected a refusal");
};

/** The link's secret, out of the address the Owner was shown. */
const tokenOf = (address: string) => address.split("/portal/apply/")[1] ?? "";

const someone = (name = "রহিম") => ({
  kind: "person" as const,
  name: `${name} ${suffix}`,
  phone: aMobile(),
  email: `rahim.${suffix}.${phones}@example.com`,
});

describe("the switch", () => {
  it("is off until the Owner turns it on, and the Owner's alone", async () => {
    const switchedOn = async () => {
      const owner = await as("owner");
      const listed = await owner.investors.list();
      return listed.applicationsOpen;
    };
    expect(await switchedOn()).toBe(false);
    await turnApplications(true);
    expect(await switchedOn()).toBe(true);
    await turnApplications(false);
    expect(await switchedOn()).toBe(false);
    const manager = await as("manager");
    await expect(
      manager.investors.setApplicationsOpen({ shown: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("a link", () => {
  beforeAll(async () => {
    const owner = await as("owner");
    await owner.farm.setIdentity({
      address: `সাভার, ঢাকা ${suffix}`,
      phone: "+8801711000097",
      registrationNumber: `DLS/SAV/2098/${suffix}`,
      registrationOffice: "উপজেলা প্রাণিসম্পদ দপ্তর, সাভার",
      registrationExpiresOn: "2100-03-31",
    });
    await turnPortal(true);
    await turnApplications(true);
  });

  it("is refused while the switch is off", async () => {
    await turnApplications(false);
    try {
      const owner = await as("owner");
      expect(
        await refusalOf(owner.investors.applications.makeLink(someone()))
      ).toBe("applications_off");
    } finally {
      await turnApplications(true);
    }
  });

  it("is refused while the portal is shut", async () => {
    await turnPortal(false);
    try {
      const owner = await as("owner");
      expect(
        await refusalOf(owner.investors.applications.makeLink(someone()))
      ).toBe("portal_closed");
    } finally {
      await turnPortal(true);
    }
  });

  it("is refused when the farm cannot text, since the code that opens it goes by text", async () => {
    const owner = await as("owner", { sms: silentSms });
    expect(
      await refusalOf(owner.investors.applications.makeLink(someone()))
    ).toBe("farm_cannot_text");
  });

  it("is the Owner's alone", async () => {
    const manager = await as("manager");
    await expect(
      manager.investors.applications.makeLink(someone())
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("is emailed to the address on it and no other, the address opening the portal's apply page", async () => {
    const outbox = anOutbox();
    const owner = await as("owner", { email: outbox.transport });
    const them = someone();
    const made = await owner.investors.applications.makeLink(them);
    expect(made.address).toContain("/portal/apply/");
    expect(made.sent?.byEmail).not.toBeNull();
    expect(outbox.sent.map((one) => one.to)).toEqual([them.email]);
    const [mail] = outbox.sent;
    expect(mail?.message.text).toContain(made.address);
    expect(mail?.message.text).toContain(them.name);
    // Nothing went by text: the Owner chose email.
    expect(textsTo(them.phone)).toEqual([]);
  });

  it("is not emailed when the Owner says not to, and stands to be copied", async () => {
    const outbox = anOutbox();
    const owner = await as("owner", { email: outbox.transport });
    const made = await owner.investors.applications.makeLink({
      ...someone(),
      send: false,
    });
    expect(made.sent).toBeNull();
    expect(outbox.sent).toEqual([]);
    const listed = await owner.investors.applications.links();
    expect(listed.find((one) => one.id === made.id)?.standing).toBe("open");
  });

  it("stands made when the farm cannot email, and is refused by email after", async () => {
    const owner = await as("owner");
    const made = await owner.investors.applications.makeLink(someone());
    expect(made.sent).toBeNull();
    const later = await as("owner", { at: A_MINUTE_LATER });
    expect(
      await refusalOf(
        later.investors.applications.sendLink({ id: made.id, by: "email" })
      )
    ).toBe("farm_cannot_email");
  });

  it("keeps its secret out of the trail and the list", async () => {
    const owner = await as("owner");
    const made = await owner.investors.applications.makeLink({
      ...someone(),
      send: false,
    });
    const token = tokenOf(made.address);
    const events = await scratchDb()
      .select()
      .from(auditEvent)
      .where(eq(auditEvent.entityId, made.id));
    expect(events.length).toBeGreaterThan(0);
    const said = JSON.stringify(events);
    expect(said).not.toContain(token);
    expect(said).not.toContain(await hashOfLinkToken(token));
    expect(
      JSON.stringify(await owner.investors.applications.links())
    ).not.toContain(await hashOfLinkToken(token));
  });

  it("is refused for a mobile that is already an Investor's", async () => {
    const owner = await as("owner");
    const them = someone();
    await owner.investors.record({ name: them.name, phone: them.phone });
    // Written another way, it is the same mobile.
    const typed = `+88${them.phone}`;
    expect(
      await refusalOf(
        owner.investors.applications.makeLink({ ...them, phone: typed })
      )
    ).toBe("already_an_investor");
  });

  it("is one open at a time for a mobile, and another may be made once it is withdrawn", async () => {
    const owner = await as("owner");
    const them = someone();
    const first = await owner.investors.applications.makeLink({
      ...them,
      send: false,
    });
    expect(
      await refusalOf(
        owner.investors.applications.makeLink({ ...them, send: false })
      )
    ).toBe("link_open_for_mobile");
    await owner.investors.applications.withdrawLink({ id: first.id });
    const second = await owner.investors.applications.makeLink({
      ...them,
      send: false,
    });
    expect(second.id).not.toBe(first.id);
  });

  it("is withdrawn once, and refuses to be sent once withdrawn", async () => {
    const owner = await as("owner");
    const made = await owner.investors.applications.makeLink({
      ...someone(),
      send: false,
    });
    await owner.investors.applications.withdrawLink({ id: made.id });
    expect(
      await refusalOf(
        owner.investors.applications.withdrawLink({ id: made.id })
      )
    ).toBe("link_withdrawn");
    expect(
      await refusalOf(
        owner.investors.applications.sendLink({ id: made.id, by: "sms" })
      )
    ).toBe("link_withdrawn");
  });

  it("is refused once it has run out", async () => {
    const owner = await as("owner");
    const made = await owner.investors.applications.makeLink({
      ...someone(),
      send: false,
    });
    const aWeekOn = await as("owner", { at: "2098-01-08T04:00:00.000Z" });
    expect(
      await refusalOf(
        aWeekOn.investors.applications.sendLink({ id: made.id, by: "sms" })
      )
    ).toBe("link_ran_out");
  });

  it("sent again goes under a new secret: the address sent before opens nothing", async () => {
    const outbox = anOutbox();
    const owner = await as("owner", { email: outbox.transport });
    const them = someone();
    const made = await owner.investors.applications.makeLink(them);
    expect(
      await refusalOf(
        owner.investors.applications.sendLink({ id: made.id, by: "sms" })
      )
    ).toBe("link_sent_just_now");
    const later = await as("owner", {
      at: A_MINUTE_LATER,
      email: outbox.transport,
    });
    const sent = await later.investors.applications.sendLink({
      id: made.id,
      by: "sms",
    });
    expect(sent.bySms).not.toBeNull();
    const texted = textsTo(them.phone).at(-1)?.text ?? "";
    const newToken =
      texted.match(/\/portal\/apply\/(?<token>[\w-]+)/u)?.groups?.token ?? "";
    expect(newToken).not.toBe("");
    expect(newToken).not.toBe(tokenOf(made.address));
    const kept = await scratchDb().query.applicationLink.findFirst({
      where: { id: made.id },
      columns: { tokenHash: true },
    });
    expect(kept?.tokenHash).toBe(await hashOfLinkToken(newToken));
  });
});
