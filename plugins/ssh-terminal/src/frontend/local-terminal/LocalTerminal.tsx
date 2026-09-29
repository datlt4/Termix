import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { useXTerm } from "react-xtermjs";
import { toast } from "sonner";
import { ClipboardPaste, ImagePlus, Loader2 } from "lucide-react";
import { getMacLineNavigationSequence } from "../lib/mac-line-navigation";
import {
  handleTerminalClipboardKeyEvent,
  createTerminalContextMenuHandler,
} from "../terminal/terminal-clipboard";
import {
  buildImageUploadFormData,
  type TerminalImageUploadSource,
} from "../terminal/terminal-image-upload";
import { quoteTerminalImagePath } from "../terminal/terminal-image-path";
import { readNativeClipboardImage } from "../lib/clipboard-image";
import {
  useAppTheme as useTheme,
  resolveTermixThemeColors,
  DEFAULT_TERMINAL_CONFIG,
  TERMINAL_FONTS,
  ensureTerminalFontsLoaded,
  enableFastTerminalRenderer,
  RobustClipboardProvider,
  copyToClipboard,
  readFromClipboard,
  getLocalTerminalSettings,
  subscribeLocalTerminalSettings,
  type LocalTerminalSettings,
} from "@termix/plugin-sdk/ui";
import { usePluginApi, useTranslation } from "@termix/plugin-sdk/frontend";

const TOOLBAR_BUTTON =
  "inline-flex min-h-7 min-w-7 items-center justify-center rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40";

export function LocalTerminal({
  instanceId,
  isVisible,
}: {
  instanceId: string;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  // Read via a ref inside the session-lifecycle effect below so a language
  // change (which gives react-i18next a new `t` identity) doesn't tear down
  // the running local shell and spawn a new session.
  const tRef = useRef(t);
  tRef.current = t;
  const { theme: appTheme } = useTheme();
  const { instance: terminal, ref: xtermRef } = useXTerm();
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [isWindows, setIsWindows] = useState(false);
  const [shell, setShell] = useState<"default" | "wsl">("default");
  const [localSettings, setLocalSettings] = useState<LocalTerminalSettings>(
    () => getLocalTerminalSettings(),
  );
  const [isImageUploading, setIsImageUploading] = useState(false);
  // 0-100 while an upload is in flight, null when unknown (indeterminate).
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(
    null,
  );
  const imageUploadingRef = useRef(false);
  const terminalRef = useRef(terminal);
  terminalRef.current = terminal;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // The local terminal is Electron-only and its shell runs on this machine,
  // so image uploads always target the embedded local backend.
  const api = usePluginApi();

  /**
   * Stores the image in this backend's local image storage and pastes the
   * resulting path into the shell, so image-aware CLIs can read it.
   */
  async function handleImageUpload(
    file: File,
    source: TerminalImageUploadSource,
  ) {
    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (imageUploadingRef.current) return;
    imageUploadingRef.current = true;
    setIsImageUploading(true);
    setImageUploadProgress(null);
    try {
      const form = buildImageUploadFormData(file, "", source);
      form.append("localTerminal", "true");
      const response = await api.post("/image-upload", form, {
        headers: { "Content-Type": undefined },
        onUploadProgress: (event: { loaded?: number; total?: number }) => {
          if (event.total && event.total > 0) {
            setImageUploadProgress(
              Math.min(100, Math.round((event.loaded / event.total) * 100)),
            );
          }
        },
      });
      const { shellPath } = response.data as { shellPath: string };
      terminalRef.current?.paste(quoteTerminalImagePath(shellPath));
      toast.success(`Image uploaded: ${shellPath}`);
    } catch (error) {
      const data = (
        error as {
          response?: {
            data?: { code?: string; error?: string; message?: string };
          };
        }
      )?.response?.data;
      const message = data?.error || data?.message || "Image upload failed";
      toast.error(data?.code ? `${message} (${data.code})` : message);
    } finally {
      imageUploadingRef.current = false;
      setIsImageUploading(false);
      setImageUploadProgress(null);
    }
  }
  // Latest-ref so the (rarely re-run) session effect always calls the
  // current handler without depending on its identity.
  const handleImageUploadRef = useRef(handleImageUpload);
  handleImageUploadRef.current = handleImageUpload;

  // The User Profile's Terminal section writes these (Apply to all hosts),
  // so follow changes live without tearing the shell down.
  useEffect(() => subscribeLocalTerminalSettings(setLocalSettings), []);

  const terminalConfig = { ...DEFAULT_TERMINAL_CONFIG, ...localSettings };

  useEffect(() => {
    window.electronAPI?.getPlatform().then((platform) => {
      setIsWindows(platform === "win32");
    });
  }, []);

  const fit = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    const sessionId = sessionIdRef.current;
    if (!terminal || !fitAddon) return;
    fitAddon.fit();
    if (sessionId) {
      window.electronAPI.resizeLocalTerminal(
        sessionId,
        terminal.cols,
        terminal.rows,
      );
    }
  }, [terminal]);

  useEffect(() => {
    if (!terminal) return;
    const colors = resolveTermixThemeColors(
      terminalConfig.theme,
      appTheme,
      terminalConfig.customThemeColors,
    );
    const font = TERMINAL_FONTS.find(
      (item) => item.value === terminalConfig.fontFamily,
    );
    ensureTerminalFontsLoaded(font?.value ?? TERMINAL_FONTS[0].value);
    terminal.options.theme = colors;
    terminal.options.fontFamily = font?.fallback ?? TERMINAL_FONTS[0].fallback;
    terminal.options.fontSize = terminalConfig.fontSize;
    terminal.options.cursorStyle = terminalConfig.cursorStyle;
    terminal.options.cursorBlink = terminalConfig.cursorBlink;
    terminal.options.letterSpacing = terminalConfig.letterSpacing;
    terminal.options.lineHeight = terminalConfig.lineHeight;
  }, [appTheme, terminal, terminalConfig]);

  useEffect(() => {
    if (!terminal || !window.electronAPI?.isElectron) return;
    const fitAddon = new FitAddon();
    const clipboardProvider = new RobustClipboardProvider();
    const clipboardAddon = new ClipboardAddon(undefined, clipboardProvider);
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(clipboardAddon);
    enableFastTerminalRenderer(terminal);
    fitAddon.fit();

    async function writeTextToClipboard(text: string): Promise<boolean> {
      const ok = await copyToClipboard(text);
      if (!ok) toast.error(tRef.current("terminal.clipboardWriteFailed"));
      return ok;
    }

    async function readTextFromClipboard(): Promise<string> {
      const text = await readFromClipboard();
      if (text) return text;
      // An image-only clipboard has no text: upload the image to this
      // machine's local image storage and paste the file path into the
      // shell, mirroring the SSH terminal's Ctrl+V behavior.
      const imageFile = await readNativeClipboardImage();
      if (imageFile) {
        void handleImageUploadRef.current(imageFile, "clipboard");
        return "";
      }
      toast.error(tRef.current("terminal.clipboardReadFailed"));
      return "";
    }

    const clipboardActions = { writeTextToClipboard, readTextFromClipboard };

    terminal.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
      if (e.type !== "keydown") return true;
      const sequence = getMacLineNavigationSequence(e);
      if (sequence) {
        e.preventDefault();
        e.stopPropagation();
        terminal.input(sequence, true);
        return false;
      }
      // No native "paste" event listener here (unlike the SSH terminal), so
      // plain Ctrl/Cmd+V reads the clipboard explicitly rather than relying
      // on the browser's own paste event.
      return handleTerminalClipboardKeyEvent(e, terminal, clipboardActions, {
        plainPasteMode: "explicit",
      });
    });

    const handleContextMenu = createTerminalContextMenuHandler(
      terminal,
      clipboardActions,
    );
    const element = xtermRef.current;
    element?.addEventListener("contextmenu", handleContextMenu);

    let disposed = false;
    let removeData = () => {};
    let removeExit = () => {};
    const input = terminal.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (sessionId) window.electronAPI.writeLocalTerminal(sessionId, data);
    });

    window.electronAPI
      .startLocalTerminal({ cols: terminal.cols, rows: terminal.rows, shell })
      .then(({ sessionId }) => {
        if (disposed) {
          window.electronAPI.closeLocalTerminal(sessionId);
          return;
        }
        sessionIdRef.current = sessionId;
        removeData = window.electronAPI.onLocalTerminalData(sessionId, (data) =>
          terminal.write(data),
        );
        removeExit = window.electronAPI.onLocalTerminalExit(
          sessionId,
          (exitCode) => {
            sessionIdRef.current = null;
            terminal.write(
              `\r\n\x1b[33mProcess exited (${exitCode})\x1b[0m\r\n`,
            );
          },
        );
        return window.electronAPI.readyLocalTerminal(sessionId);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        terminal.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
      });

    const observer = new ResizeObserver(() => fit());
    if (xtermRef.current) observer.observe(xtermRef.current);
    return () => {
      disposed = true;
      terminal.attachCustomKeyEventHandler(() => true);
      observer.disconnect();
      input.dispose();
      removeData();
      removeExit();
      element?.removeEventListener("contextmenu", handleContextMenu);
      clipboardProvider.dispose();
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) window.electronAPI.closeLocalTerminal(sessionId);
      fitAddonRef.current = null;
      fitAddon.dispose();
    };
  }, [fit, instanceId, shell, terminal, xtermRef]);

  useEffect(() => {
    if (isVisible) requestAnimationFrame(fit);
  }, [fit, isVisible]);

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={isImageUploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleImageUpload(file, "file");
          }}
        />
        <button
          type="button"
          className={TOOLBAR_BUTTON}
          aria-label={t("terminalToolbar.uploadImage")}
          title={t("terminalToolbar.uploadImage")}
          disabled={isImageUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
        </button>
        <button
          type="button"
          className={TOOLBAR_BUTTON}
          aria-label={t("terminalToolbar.pasteImage")}
          title={t("terminalToolbar.pasteImage")}
          disabled={isImageUploading}
          onClick={() => {
            void (async () => {
              const text = await readFromClipboard();
              if (text) {
                terminalRef.current?.paste(text);
                return;
              }
              const imageFile = await readNativeClipboardImage();
              if (imageFile) {
                void handleImageUpload(imageFile, "clipboard");
                return;
              }
              toast.error(tRef.current("terminal.clipboardReadFailed"));
            })();
          }}
        >
          <ClipboardPaste className="size-4" />
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {isImageUploading ? t("terminalToolbar.uploadingImage") : ""}
        </span>
        {isImageUploading && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span className="whitespace-nowrap">
              {t("terminalToolbar.uploadingImage")}
              {typeof imageUploadProgress === "number"
                ? ` ${imageUploadProgress}%`
                : ""}
            </span>
            <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <span
                className={
                  "block h-full rounded-full bg-accent-brand transition-[width] duration-150" +
                  (imageUploadProgress == null
                    ? " w-1/3 animate-pulse transition-none"
                    : "")
                }
                style={
                  imageUploadProgress != null
                    ? { width: `${imageUploadProgress}%` }
                    : undefined
                }
              />
            </span>
          </span>
        )}
        <div className="min-w-2 flex-1" />
        {isWindows && (
          <select
            aria-label="Local terminal shell"
            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
            value={shell}
            onChange={(event) =>
              setShell(event.target.value === "wsl" ? "wsl" : "default")
            }
          >
            <option value="default">PowerShell</option>
            <option value="wsl">WSL</option>
          </select>
        )}
      </div>
      <div ref={xtermRef} className="min-h-0 flex-1 p-2" />
    </div>
  );
}
