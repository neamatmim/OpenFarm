/**
 * Which lines "How to pay" says under its figures on a Venture paid by the month: that they may pay ahead; that they
 * tell the farm the transfer's day and reference — only where the portal takes a Pay-in Note from them, or there is
 * nowhere to tell it (ADR 0018); and the Cattle Part's decision date — only while the Venture still gathers, since the
 * buying it waits for has started once it leaves Open. None of them on a Venture paid before buying.
 */
export const howToPayLines = ({
  monthly,
  mayTell,
  gathering,
}: {
  monthly: boolean;
  /** Whether the portal offers them a Pay-in Note on this Agreement. */
  mayTell: boolean;
  /** Whether the Venture is still Open, gathering its capital. */
  gathering: boolean;
}) => ({
  early: monthly,
  tellTheTransfer: monthly && mayTell,
  cattleDeadline: monthly && gathering,
});
