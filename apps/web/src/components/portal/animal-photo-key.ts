/**
 * The key an animal's photograph is asked under in a portal, the Investor's own or the Owner's Preview of it. Written
 * out rather than taken from the client, because it carries when the photograph was taken as well — so a replaced one
 * is asked for again and an unchanged one never is. The procedure's path comes first, as the client's own keys have
 * it, since that is what keeps an Investor's answers off their phone (`keptOnDevice`).
 */
export const animalPhotoKey = ({
  previewing,
  input,
  photoAt,
}: {
  previewing: boolean;
  input: { agreementId: string; tagNumber: string; investorId?: string };
  photoAt: Date | string;
}) =>
  [
    previewing ? ["portalPreview", "animalPhoto"] : ["portal", "animalPhoto"],
    { input, photoAt: String(photoAt) },
  ] as const;
