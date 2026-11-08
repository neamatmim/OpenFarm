import { createRouterClient } from "@orpc/server";

import { buildContext } from "../context";
import { appRouter } from "../routers/index";
import type { SmsMessage, SmsTransport } from "../sms";
import type { Happening } from "./history";
import { addDays } from "./runtime";
import { A_SLIP_PHOTO } from "./slip-photo";
import type { Farm } from "./standing";

// Applications by link (ADR 0034), so the Owner's Investors page and the applicant's page each have something to show:
// one link still out, one Application waiting for her answer, and one she declined. The farm sends no texts while it
// is seeded, so these steps keep theirs in memory, where the applicant reads the code from, as a phone would.

/** The texts the seed's applicants are sent, by number, latest last. */
const texts = new Map<string, SmsMessage[]>();

/** A gateway that keeps what it was given and sends nothing. */
const keptTexts: SmsTransport = {
  sends: true,
  send: (to, message) => {
    texts.set(to, [...(texts.get(to) ?? []), message]);
    return Promise.resolve({ delivered: true });
  },
};

/** The six-digit code in the latest text to a mobile, written as the farm sends to it. */
const codeTextedTo = (mobile: string): string => {
  const said = [...texts.entries()].find(([to]) =>
    to.endsWith(mobile.replaceAll(/\D/gu, "").slice(1))
  )?.[1];
  const code = said?.at(-1)?.text.match(/\b\d{6}\b/u)?.[0];
  if (!code) {
    throw new Error(`No code was texted to ${mobile}`);
  }
  return code;
};

/** The Owner, and somebody signed in to nothing, on the farm's clock, texting through the kept gateway. */
const clientsOf = async (f: Farm) => ({
  owner: createRouterClient(appRouter, {
    context: await buildContext({
      session: f.accounts.owner.session,
      clock: f.clock,
      db: f.db,
      sms: keptTexts,
    }),
  }),
  nobody: createRouterClient(appRouter, {
    context: await buildContext({
      session: null,
      clock: f.clock,
      db: f.db,
      sms: keptTexts,
    }),
  }),
});

/** People the Owner knows, each on a mobile of their own. */
const LINK_STILL_OUT = {
  name: "রফিকুল ইসলাম",
  phone: "01914-000101",
  email: "rafiqul@example.com",
};
const WAITING = {
  name: "নাসরিন আক্তার",
  phone: "01914-000102",
  email: "nasrin@example.com",
};
const DECLINED = {
  name: "জাহিদ হাসান",
  phone: "01914-000103",
  email: "zahid@example.com",
};

/** A link made for somebody, and the secret in its address. */
const aLinkFor = async (
  f: Farm,
  who: { name: string; phone: string; email: string }
) => {
  const { owner } = await clientsOf(f);
  const made = await owner.investors.applications.makeLink({
    kind: "person",
    ...who,
  });
  return made.address.split("/portal/apply/")[1] ?? "";
};

/** Somebody opening their link, filling it in and agreeing the consent with the codes texted to them. */
const applyWith = async (
  f: Farm,
  token: string,
  who: { name: string; phone: string; email: string },
  details: { nid: string; address: string; bankAccount: string }
) => {
  const { nobody } = await clientsOf(f);
  await nobody.portal.applying.sendCode({
    token,
    purpose: "open",
    language: "bn",
  });
  const { key } = await nobody.portal.applying.unlock({
    token,
    code: codeTextedTo(who.phone),
  });
  const form = {
    token,
    key,
    language: "bn" as const,
    record: {
      kind: "person" as const,
      name: who.name,
      email: who.email,
      ...details,
    },
    nominees: [],
  };
  const read = await nobody.portal.applying.consent(form);
  await nobody.portal.applying.send({
    ...form,
    photos: { nid_front: A_SLIP_PHOTO, nid_back: A_SLIP_PHOTO },
    laidAt: read.laidAt,
    paperHash: read.paperHash,
    agreed: true,
  });
};

/**
 * The days Applications are made on: the switch turned on a week ago, one sent and declined that week, one waiting
 * since two days ago, and a link sent last evening that nobody has opened yet.
 */
export const applyByLink = (
  farm: Farm,
  on: (day: string, time: string, what: string, run: Happening["run"]) => void
): void => {
  const { today } = farm;
  on(
    addDays(today, -6),
    "10:00",
    "the Owner sends somebody she knows a link to apply",
    async (f) => {
      await f.as.owner.investors.setPortalOpen({ open: true });
      await f.as.owner.investors.setApplicationsOpen({ shown: true });
      const token = await aLinkFor(f, DECLINED);
      await applyWith(f, token, DECLINED, {
        nid: "19887612345678",
        address: "কেরানীগঞ্জ, ঢাকা",
        bankAccount: "জাহিদ হাসান\nডাচ-বাংলা ব্যাংক · 112 233 4455\nকেরানীগঞ্জ শাখা",
      });
    }
  );
  on(
    addDays(today, -5),
    "11:00",
    "the Owner declines an Application",
    async (f) => {
      const { owner } = await clientsOf(f);
      const applications = await owner.investors.applications.list();
      const declining = applications.find(
        (one) => one.name === DECLINED.name && one.state === "waiting"
      );
      if (!declining) {
        throw new Error("No Application to decline");
      }
      await owner.investors.applications.decline({
        id: declining.id,
        line: "এবারের ভেঞ্চারে জায়গা নেই; পরেরটায় আবার কথা হবে।",
      });
    }
  );
  on(
    addDays(today, -2),
    "18:00",
    "somebody the Owner knows applies by link",
    async (f) => {
      const token = await aLinkFor(f, WAITING);
      await applyWith(f, token, WAITING, {
        nid: "19924455667788",
        address: "আশুলিয়া, সাভার, ঢাকা",
        bankAccount: "নাসরিন আক্তার\nব্র্যাক ব্যাংক · 1501 2020 3344\nসাভার শাখা",
      });
    }
  );
  on(addDays(today, -1), "20:00", "a link sent last evening", async (f) => {
    await aLinkFor(f, LINK_STILL_OUT);
  });
};
