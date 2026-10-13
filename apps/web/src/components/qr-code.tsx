import { encode } from "uqr";

/** A QR code, drawn square by square: black on white whatever the page, so any phone's camera reads it. Hidden from a
 *  screen reader, which reads the same address or code printed beside it. */
export const QrCode = ({ value, size }: { value: string; size: string }) => {
  const { data } = encode(value, { border: 1 });
  const across = data.length;
  let squares = "";
  for (const [y, row] of data.entries()) {
    for (const [x, on] of row.entries()) {
      if (on) {
        squares += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  return (
    <svg
      aria-hidden
      className="shrink-0"
      style={{ width: size, height: size }}
      viewBox={`0 0 ${across} ${across}`}
    >
      <rect fill="#fff" height={across} width={across} />
      <path d={squares} fill="#000" />
    </svg>
  );
};
