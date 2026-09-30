import { isElectron } from "@termix/plugin-sdk/ui";

/**
 * The desktop app's native clipboard image, or null. Fallback for the
 * paste-image flow where navigator.clipboard.read() fails on Linux (Wayland
 * portals, no renderer session access) even though the main process can
 * still read the platform clipboard.
 */
export async function readNativeClipboardImage(): Promise<File | null> {
  if (!isElectron()) return null;
  const read = (
    window as Window & {
      electronAPI?: {
        readClipboardImage?: () => Promise<string | null>;
      };
    }
  ).electronAPI?.readClipboardImage;
  if (!read) return null;
  try {
    const dataUrl = await read();
    if (!dataUrl) return null;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return new File([blob], "clipboard-image.png", {
      type: blob.type || "image/png",
    });
  } catch {
    return null;
  }
}

/**
 * Rasterizes a clipboard image to PNG through a canvas, or null to keep the
 * original blob. Native PNG bytes are preserved untouched: some
 * browser/platform clipboard implementations decode transparent PNGs
 * incorrectly through canvas, producing an all-black/transparent
 * re-encode. Sharp validates the image server-side either way.
 */
async function rasterizeToPng(blob: Blob): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Clipboard image conversion failed"));
      }, "image/png");
    });
    return new File([png], "clipboard-image.png", { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

/**
 * The current clipboard image as a File, or null when there is none. Tries
 * the Web Clipboard API first (it also works on plain HTTP), falling back
 * to the desktop app's native clipboard when the API is unavailable or
 * fails.
 */
export async function readClipboardImageFile(): Promise<File | null> {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        try {
          if (imageType !== "image/png") {
            const rasterized = await rasterizeToPng(blob);
            if (rasterized) return rasterized;
          }
        } catch {
          // Fall back to the original clipboard blob.
        }
        return new File([blob], "clipboard-image.png", { type: imageType });
      }
    }
  } catch {
    // Web Clipboard API unavailable or rejected (e.g. Linux without session
    // access) — fall through to the native clipboard.
  }
  return readNativeClipboardImage();
}
