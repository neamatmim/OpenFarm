import { z } from "zod";

// What the farm writes down about one Investor, as the Owner types it on the record sheet and as somebody sent an
// Application Link fills it in themselves (ADR 0034): a person, or an Organization with its Signatory (ADR 0020).

/** An email as the Owner types it: kept lowercased, so the same address is never two. */
export const emailInput = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

export const personInput = z.object({
  /** Left out by every caller written before an Investor could be an Organization: a person. */
  kind: z.literal("person").optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().max(200).optional(),
  /** The number on their National ID, as the agreement asks for it. */
  nid: z.string().trim().max(40).optional(),
  /** Bank channels only, so the account is how they are paid. Written out as the bank would want it — the
   *  name on the account, its number, the bank and the branch — often on a line each. */
  bankAccount: z.string().trim().max(300).optional(),
  /** Their own email, optional: the farm sends a signing code there beside the phone once they confirm it (ADR 0022). */
  email: emailInput.optional(),
});

/** An Organization (ADR 0020): its own name, address, papers and bank account, and the one Signatory it acts through,
 *  whose mobile is the record's phone. */
export const organizationInput = z.object({
  kind: z.literal("organization"),
  name: z.string().trim().min(1).max(120),
  /** The Signatory's mobile: the farm reaches the Organization on it, and the Signatory signs in to the portal with it. */
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().max(200).optional(),
  bankAccount: z.string().trim().max(300).optional(),
  tradeLicense: z.string().trim().max(40).optional(),
  rjscNumber: z.string().trim().max(40).optional(),
  tin: z.string().trim().max(40).optional(),
  /** The paper that names the Signatory — a board resolution, a letter — as the Owner describes it, and its date. */
  authority: z.string().trim().min(1).max(200),
  authorityOn: z.iso.date().optional(),
  signatoryName: z.string().trim().min(1).max(120),
  signatoryNid: z.string().trim().max(40).optional(),
  signatoryRole: z.string().trim().max(80).optional(),
  /** The Signatory's own email, optional, as a person's is. */
  email: emailInput.optional(),
});

/** A person or an Organization, as the Owner writes them down. */
export const investorInput = z.union([organizationInput, personInput]);

/** One Investor as a form sends them. */
export type InvestorInput = z.infer<typeof investorInput>;

/** Everything written down about one Investor, as a correction replaces it: a field left out is a field cleared, since
 *  the form sends the whole record as it now stands. The other kind's columns are always empty. */
export const theRecord = (input: InvestorInput) =>
  input.kind === "organization"
    ? {
        kind: input.kind,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        nid: null,
        bankAccount: input.bankAccount ?? null,
        tradeLicense: input.tradeLicense ?? null,
        rjscNumber: input.rjscNumber ?? null,
        tin: input.tin ?? null,
        authority: input.authority,
        authorityOn: input.authorityOn ?? null,
        signatoryName: input.signatoryName,
        signatoryNid: input.signatoryNid ?? null,
        signatoryRole: input.signatoryRole ?? null,
      }
    : {
        kind: "person" as const,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
        nid: input.nid ?? null,
        bankAccount: input.bankAccount ?? null,
        tradeLicense: null,
        rjscNumber: null,
        tin: null,
        authority: null,
        authorityOn: null,
        signatoryName: null,
        signatoryNid: null,
        signatoryRole: null,
      };
