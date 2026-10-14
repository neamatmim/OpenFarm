/**
 * What a paper reads of the Vet who prescribed or diagnosed: their name, and the BVC registration number on their Vet
 * Role here — revoked or not, since the papers they signed while they worked here still name it.
 */
export const vetForPaper = (farmId: string) =>
  ({
    columns: { name: true },
    with: {
      roles: {
        where: { farmId, role: "vet" },
        columns: { bvcNumber: true },
      },
    },
  }) as const;

/** The BVC number a Vet read by `vetForPaper` has on this farm, or nothing. */
export const bvcOf = (
  vet: { roles?: readonly { bvcNumber: string | null }[] } | null | undefined
): string | null => vet?.roles?.[0]?.bvcNumber ?? null;
