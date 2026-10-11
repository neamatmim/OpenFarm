import type { PaperDocument } from "@OpenFarm/domain";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { audited } from "./audit";
import { exportedPaper } from "./export-store";
import type { PaperMaking } from "./investor-papers";
import { stillAsKept } from "./kept-paper";
import { nominationsOf } from "./nomination-store";
import type { PortalReader } from "./portal-reads";
import { requireTheirs } from "./portal-store";

export const documentAsked = z.object({
  kind: z.enum(["agreement", "amendment", "nomination"]),
  id: z.string().min(1),
});

type DocumentAsked = z.infer<typeof documentAsked>;
export interface SavedDocument extends DocumentAsked {
  signedOn: string;
  ventureName: string | null;
  source: "photo" | "in_app" | null;
  current: boolean | null;
  carriedOver: boolean;
  nominees: { name: string; sharePercent: number }[];
}

const approved = {
  approvedAt: { isNotNull: true },
  withdrawnAt: { isNull: true },
} as const;

/** Only metadata is read here. Large photos and original papers are fetched when opened. */
export const theirDocuments = async ({ db, farm, investor }: PortalReader) => {
  const [agreements, nominations] = await Promise.all([
    db.query.investmentAgreement.findMany({
      where: {
        farmId: farm.id,
        investorId: investor.id,
        stampKind: { ne: "farm_own" },
      },
      columns: { id: true, ventureId: true, signedOn: true },
    }),
    nominationsOf(db, farm.id, investor.id),
  ]);
  const ids = agreements.map((one) => one.id);
  const [ventures, photos, offers, amendments, nominationOffers] =
    await Promise.all([
      db.query.venture.findMany({
        where: {
          farmId: farm.id,
          id: { in: agreements.map((one) => one.ventureId) },
        },
        columns: { id: true, name: true },
      }),
      db.query.agreementPaper.findMany({
        where: { farmId: farm.id, agreementId: { in: ids } },
        columns: { agreementId: true },
      }),
      db.query.agreementOffer.findMany({
        where: {
          farmId: farm.id,
          investorId: investor.id,
          agreementId: { in: ids },
          agreedAt: { isNotNull: true },
          ...approved,
        },
        columns: { agreementId: true },
      }),
      db.query.agreementAmendment.findMany({
        where: { farmId: farm.id, agreementId: { in: ids } },
        columns: {
          id: true,
          agreementId: true,
          amendedId: true,
          signedOn: true,
        },
      }),
      db.query.nominationOffer.findMany({
        where: {
          farmId: farm.id,
          investorId: investor.id,
          nominationId: { isNotNull: true },
          agreedAt: { isNotNull: true },
          ...approved,
        },
        columns: { nominationId: true },
      }),
    ]);
  const amendedIds = amendments.map((one) => one.amendedId);
  const [amendmentPhotos, amendmentOffers] = await Promise.all([
    db.query.amendmentPaper.findMany({
      where: { farmId: farm.id, amendedId: { in: amendedIds } },
      columns: { amendedId: true },
    }),
    db.query.amendmentOffer.findMany({
      where: { farmId: farm.id, amendedId: { in: amendedIds }, ...approved },
      columns: { amendedId: true },
    }),
  ]);
  const names = new Map(ventures.map((one) => [one.id, one.name]));
  const hasPhoto = new Set(photos.map((one) => one.agreementId));
  const inApp = new Set(offers.map((one) => one.agreementId));
  const sourceOf = (id: string): SavedDocument["source"] => {
    if (inApp.has(id)) {
      return "in_app";
    }
    return hasPhoto.has(id) ? "photo" : null;
  };
  const ventureOf = new Map(
    agreements.map((one) => [one.id, names.get(one.ventureId) ?? null])
  );
  const amendmentPhotoIds = new Set(
    amendmentPhotos.map((one) => one.amendedId)
  );
  const amendmentOfferIds = new Set(
    amendmentOffers.map((one) => one.amendedId)
  );
  const nominationOfferIds = new Set(
    nominationOffers.map((one) => one.nominationId)
  );
  const documents: SavedDocument[] = agreements.map((one) => ({
    kind: "agreement",
    id: one.id,
    signedOn: one.signedOn,
    ventureName: ventureOf.get(one.id) ?? null,
    source: sourceOf(one.id),
    current: null,
    carriedOver: false,
    nominees: [],
  }));
  for (const one of amendments) {
    let source: SavedDocument["source"] = null;
    if (amendmentOfferIds.has(one.amendedId)) {
      source = "in_app";
    } else if (amendmentPhotoIds.has(one.amendedId)) {
      source = "photo";
    }
    documents.push({
      kind: "amendment",
      id: one.id,
      signedOn: one.signedOn,
      ventureName: ventureOf.get(one.agreementId) ?? null,
      source,
      current: null,
      carriedOver: false,
      nominees: [],
    });
  }
  for (const one of nominations) {
    let source: SavedDocument["source"] = null;
    if (one.how === "agreement" && one.agreementId) {
      source = sourceOf(one.agreementId);
    } else if (nominationOfferIds.has(one.id)) {
      source = "in_app";
    } else if (one.how !== "carried_over" && one.hasPhoto) {
      source = "photo";
    }
    documents.push({
      kind: "nomination",
      id: one.id,
      signedOn: one.signedOn,
      ventureName: one.ventureName,
      source,
      current: one.id === nominations[0]?.id,
      carriedOver: one.how === "carried_over",
      nominees: one.nominees.map(({ name, sharePercent }) => ({
        name,
        sharePercent,
      })),
    });
  }
  return documents.toSorted(
    (one, other) =>
      other.signedOn.localeCompare(one.signedOn) ||
      other.id.localeCompare(one.id)
  );
};

const notFound = () =>
  new ORPCError("NOT_FOUND", {
    message: "No saved document for this Investor",
    data: { refusal: "no_saved_document" },
  });

type SavedCopy =
  | { format: "photo"; contentType: string; data: string }
  | {
      format: "document";
      document: PaperDocument;
      agreedAt: Date | null;
      approvedAt: Date | null;
    };

const keptCopy = (offer: {
  paper: unknown;
  paperHash: string;
  agreedAt?: Date | null;
  approvedAt: Date | null;
}): SavedCopy => {
  if (!stillAsKept(offer)) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "The saved document has changed",
      data: { refusal: "saved_document_changed" },
    });
  }
  return {
    format: "document",
    document: offer.paper as PaperDocument,
    agreedAt: offer.agreedAt ?? null,
    approvedAt: offer.approvedAt,
  };
};

const agreementCopy = async (
  reader: PortalReader,
  agreementId: string
): Promise<SavedCopy> => {
  const { db, farm, investor } = reader;
  await requireTheirs(db, farm.id, investor.id, agreementId);
  const offer = await db.query.agreementOffer.findFirst({
    where: {
      farmId: farm.id,
      investorId: investor.id,
      agreementId,
      agreedAt: { isNotNull: true },
      ...approved,
    },
    columns: { paper: true, paperHash: true, agreedAt: true, approvedAt: true },
  });
  if (offer) {
    return keptCopy(offer);
  }
  const photo = await db.query.agreementPaper.findFirst({
    where: { farmId: farm.id, agreementId },
    columns: { contentType: true, data: true },
  });
  if (!photo) {
    throw notFound();
  }
  return { format: "photo", ...photo };
};

/** Authorization uses the actual Agreement/Amendment/Nomination on file, including historical membership. */
export const theirDocument = async (
  context: PaperMaking,
  investor: PortalReader["investor"],
  asked: DocumentAsked
) => {
  const reader: PortalReader = { ...context, investor };
  const documents = await theirDocuments(reader);
  const meta = documents.find(
    (one) => one.kind === asked.kind && one.id === asked.id
  );
  if (!meta?.source) {
    throw notFound();
  }
  const { db, farm } = context;
  let copy: SavedCopy;
  let entityId = asked.id;
  if (asked.kind === "agreement") {
    copy = await agreementCopy(reader, asked.id);
  } else if (asked.kind === "amendment") {
    const amendment = await db.query.agreementAmendment.findFirst({
      where: { id: asked.id, farmId: farm.id },
    });
    if (!amendment) {
      throw notFound();
    }
    await requireTheirs(db, farm.id, investor.id, amendment.agreementId);
    entityId = amendment.agreementId;
    const offer = await db.query.amendmentOffer.findFirst({
      where: { farmId: farm.id, amendedId: amendment.amendedId, ...approved },
      columns: { id: true, paper: true, paperHash: true, approvedAt: true },
    });
    if (offer) {
      const answer = await db.query.amendmentOfferAnswer.findFirst({
        where: {
          farmId: farm.id,
          offerId: offer.id,
          agreementId: amendment.agreementId,
        },
        columns: { agreedAt: true },
      });
      if (!answer) {
        throw notFound();
      }
      copy = keptCopy({ ...offer, agreedAt: answer.agreedAt });
    } else {
      const photo = await db.query.amendmentPaper.findFirst({
        where: { farmId: farm.id, amendedId: amendment.amendedId },
        columns: { contentType: true, data: true },
      });
      if (!photo) {
        throw notFound();
      }
      copy = { format: "photo", ...photo };
    }
  } else {
    const nomination = await db.query.nomination.findFirst({
      where: { id: asked.id, farmId: farm.id, investorId: investor.id },
    });
    if (!nomination) {
      throw notFound();
    }
    if (nomination.how === "agreement" && nomination.agreementId) {
      copy = await agreementCopy(reader, nomination.agreementId);
    } else {
      const offer = await db.query.nominationOffer.findFirst({
        where: {
          farmId: farm.id,
          investorId: investor.id,
          nominationId: asked.id,
          agreedAt: { isNotNull: true },
          ...approved,
        },
        columns: {
          paper: true,
          paperHash: true,
          agreedAt: true,
          approvedAt: true,
        },
      });
      if (offer) {
        copy = keptCopy(offer);
      } else {
        const photo = await db.query.nominationPaper.findFirst({
          where: { farmId: farm.id, nominationId: asked.id },
          columns: { contentType: true, data: true },
        });
        if (!photo) {
          throw notFound();
        }
        copy = { format: "photo", ...photo };
      }
    }
  }
  await audited(context).write(
    {
      entity:
        asked.kind === "nomination" ? "nomination" : "investment_agreement",
      entityId,
      action: "export",
      after: exportedPaper(
        farm,
        asked.kind === "nomination" ? "nomination" : "agreement_copy",
        {
          investorId: investor.id,
          documentKind: asked.kind,
          documentId: asked.id,
          savedCopy: true,
          ...(context.inPreviewOf ? { inPreviewOf: context.inPreviewOf } : {}),
        }
      ),
    },
    () => Promise.resolve()
  );
  return { ...copy, meta };
};
