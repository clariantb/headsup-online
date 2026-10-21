import { MAX_IMAGE_BYTES } from '../../shared/protocol.ts';

const MAX_SIDE = 512;

/** Downscale an image file/blob in the browser and return a compact data URL. */
export async function imageToDataUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) throw new Error('That file is not an image.');
  const bitmap = await createImageBitmap(blob).catch(() => {
    throw new Error("Couldn't read that image.");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // flatten transparency so JPEG fallback looks right
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.5]) {
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_IMAGE_BYTES) return url;
  }
  throw new Error('That image is too big, even after shrinking it.');
}

/** Pull an image out of a paste event: an image blob, or an image URL as text. */
export async function imageFromClipboard(data: DataTransfer): Promise<Blob | null> {
  for (const item of data.items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  const text = data.getData('text/plain').trim();
  if (/^https?:\/\/\S+$/i.test(text)) {
    // Only works when the image host allows cross-origin reads; many don't.
    const res = await fetch(text, { mode: 'cors' }).catch(() => null);
    const blob = res?.ok ? await res.blob() : null;
    if (blob?.type.startsWith('image/')) return blob;
    throw new Error('That site blocks copying by link. Right-click the image and choose "Copy image" instead.');
  }
  return null;
}
