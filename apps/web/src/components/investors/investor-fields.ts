import type { Investor } from "@/components/investors/investor-types";

type Kind = Investor["kind"];

/** Everything the record sheet holds, for either kind: what a person has, what an Organization and its Signatory have. */
export interface Draft {
  kind: Kind;
  name: string;
  phone: string;
  email: string;
  address: string;
  nid: string;
  bankAccount: string;
  tradeLicense: string;
  rjscNumber: string;
  tin: string;
  authority: string;
  authorityOn: string;
  signatoryName: string;
  signatoryNid: string;
  signatoryRole: string;
}

export const NOBODY_YET: Draft = {
  kind: "person",
  name: "",
  phone: "",
  email: "",
  address: "",
  nid: "",
  bankAccount: "",
  tradeLicense: "",
  rjscNumber: "",
  tin: "",
  authority: "",
  authorityOn: "",
  signatoryName: "",
  signatoryNid: "",
  signatoryRole: "",
};

/** The boxes the sheet asks a person, in the order it asks them — and the Investor Details Form prints them. */
export const PERSON_FIELDS = [
  "name",
  "phone",
  "email",
  "nid",
  "address",
  "bankAccount",
] as const satisfies readonly (keyof Draft)[];

/** The boxes the sheet asks an Organization and its Signatory, in the order it asks them. */
export const ORGANIZATION_FIELDS = [
  "name",
  "tradeLicense",
  "rjscNumber",
  "tin",
  "address",
  "signatoryName",
  "signatoryRole",
  "phone",
  "email",
  "signatoryNid",
  "authority",
  "authorityOn",
  "bankAccount",
] as const satisfies readonly (keyof Draft)[];
