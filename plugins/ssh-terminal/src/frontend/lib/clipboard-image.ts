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
