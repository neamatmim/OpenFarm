/** The longest side a shed photo needs. Big enough to see an udder or read an ear tag on a
 *  phone screen; small enough that a morning of them syncs over one bar of signal. */
const MAX_EDGE = 1280;
/** JPEG quality. Above this the file grows faster than the picture improves. */
const QUALITY = 0.7;
/** What a downscaled photo may still weigh, as base64. */
const MAX_BYTES = 2_000_000;

export interface Photo {
  contentType: "image/jpeg";
  data: string;
}

const asBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

/**
 * Shrinks a camera photo to something a phone on one bar can actually send.
 *
 * A modern phone camera makes three or four megabytes; a morning's worth would sit in the
 * Outbox for hours and time out on every attempt. The picture only has to show what it is
 * evidence of, so it is scaled to fit and re-encoded — on the device, before anything says
 * the Step is done.
 */
export const shrink = async (file: File): Promise<Photo> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This device cannot prepare a photo");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: QUALITY,
  });
  const data = asBase64(new Uint8Array(await blob.arrayBuffer()));
  if (data.length > MAX_BYTES) {
    throw new Error("That photo is too large to send");
  }
  return { contentType: "image/jpeg", data };
};
