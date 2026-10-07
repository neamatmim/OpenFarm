import { describe, expect, it } from "vitest";
import webpush from "web-push";

import { pushKeysProblem } from "./push-web";

// The farm's push keys are checked as the server starts: a mistake used to turn pushes off without a word while every
// phone still agreed to be told.

const keys = webpush.generateVAPIDKeys();

describe("the farm's push keys", () => {
  it("do for a farm that pushes, and for one that does not push at all", () => {
    expect(pushKeysProblem({})).toBeNull();
    expect(
      pushKeysProblem({
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
        VAPID_SUBJECT: "mailto:owner@example.com",
      })
    ).toBeNull();
  });

  it("are refused with the subject written without mailto:", () => {
    expect(
      pushKeysProblem({
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: keys.privateKey,
        VAPID_SUBJECT: "owner@example.com",
      })
    ).toContain("VAPID_SUBJECT");
  });

  it("are refused half given, or with a private key the library will not read", () => {
    expect(
      pushKeysProblem({
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_SUBJECT: "mailto:owner@example.com",
      })
    ).not.toBeNull();
    expect(
      pushKeysProblem({
        VAPID_PUBLIC_KEY: keys.publicKey,
        VAPID_PRIVATE_KEY: "garbled",
        VAPID_SUBJECT: "mailto:owner@example.com",
      })
    ).not.toBeNull();
  });
});
