import { crc32, deflateSync } from "node:zlib";

// The picture the seed's Investor sends with a Pay-in Note: a pale slip with a stamp-colored header and a few ruled
// lines, drawn here as a PNG so the Owner's photo dialog shows a picture of a slip rather than a single pixel.

const WIDTH = 240;
const HEIGHT = 150;
const HEADER_ROWS = 22;
const LINE_EVERY = 18;
const MARGIN = 16;

const PAPER = [250, 248, 240] as const;
const HEADER = [226, 0, 116] as const;
const RULE = [190, 190, 196] as const;

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const named = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(named));
  return Buffer.concat([length, named, check]);
};

/** The color of one pixel of the slip. */
const colorAt = (x: number, y: number): readonly number[] => {
  if (y < HEADER_ROWS) {
    return HEADER;
  }
  const ruled =
    (y - HEADER_ROWS) % LINE_EVERY === LINE_EVERY - 1 &&
    x > MARGIN &&
    x < WIDTH - MARGIN;
  return ruled ? RULE : PAPER;
};

const drawSlip = (): string => {
  const rows: Buffer[] = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    const row = Buffer.alloc(1 + WIDTH * 3);
    for (let x = 0; x < WIDTH; x += 1) {
      const [r = 0, g = 0, b = 0] = colorAt(x, y);
      row.writeUInt8(r, 1 + x * 3);
      row.writeUInt8(g, 2 + x * 3);
      row.writeUInt8(b, 3 + x * 3);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  // Eight bits a channel, color without alpha.
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png.toString("base64");
};

/** The slip's photo, as a phone would send it once shrunk. */
export const A_SLIP_PHOTO = {
  contentType: "image/png" as const,
  data: drawSlip(),
};
