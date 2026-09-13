/** Where a piece of work is, as a list says it: the shed and the Pen, or the whole farm for work that is in
 *  no Pen — the Registration's renewal, say. */
export const placeOfWork = (
  pen: { name: string; shed: { name: string } } | null,
  wholeFarm: string
): string => (pen ? `${pen.shed.name} · ${pen.name}` : wholeFarm);
