import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { useXTerm } from "react-xtermjs";
import { toast } from "sonner";
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
import { TerminalToolbar } from "../terminal/TerminalToolbar";
import { readClipboardImageFile } from "../lib/clipboard-image";
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
  // The local terminal is Electron-only and its shell runs on this machine,
  // so image uploads always target the embedded local backend.
  const api = usePluginApi();
  // Mirrors the SSH terminal's toolbar: the floating bar dims when the
  // terminal isn't focused, so we track xterm's focus/blur.
  const [isTerminalFocused, setIsTerminalFocused] = useState(false);
  const [isLocalConnected, setIsLocalConnected] = useState(false);

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
  // The toolbar's paste button: an image from the clipboard (Web Clipboard
  // API first, native clipboard as fallback). Plain text stays with
  // Ctrl/Cmd+V and the context menu.
  async function handlePasteImage() {
    const imageFile = await readClipboardImageFile();
    if (imageFile) {
      await handleImageUpload(imageFile, "clipboard");
      return;
    }
    toast.error(tRef.current("terminal.clipboardReadFailed"));
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
      const imageFile = await readClipboardImageFile();
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
    // xterm exposes no focus events on the Terminal API; its inner textarea
    // is what actually receives focus, so track the DOM instead.
    const focusTarget = xtermRef.current;
    const handleFocusIn = () => setIsTerminalFocused(true);
    const handleFocusOut = (event: FocusEvent) => {
      // Focus moving inside the terminal (e.g. to an inner widget) keeps it
      // "focused" for toolbar dimming purposes.
      if (focusTarget?.contains(event.relatedTarget as Node | null)) return;
      setIsTerminalFocused(false);
    };
    focusTarget?.addEventListener("focusin", handleFocusIn);
    focusTarget?.addEventListener("focusout", handleFocusOut);

    window.electronAPI
      .startLocalTerminal({ cols: terminal.cols, rows: terminal.rows, shell })
      .then(({ sessionId }) => {
        if (disposed) {
          window.electronAPI.closeLocalTerminal(sessionId);
          return;
        }
        sessionIdRef.current = sessionId;
        setIsLocalConnected(true);
        removeData = window.electronAPI.onLocalTerminalData(sessionId, (data) =>
          terminal.write(data),
        );
        removeExit = window.electronAPI.onLocalTerminalExit(
          sessionId,
          (exitCode) => {
            sessionIdRef.current = null;
            setIsLocalConnected(false);
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
      focusTarget?.removeEventListener("focusin", handleFocusIn);
      focusTarget?.removeEventListener("focusout", handleFocusOut);
      removeData();
      removeExit();
      element?.removeEventListener("contextmenu", handleContextMenu);
      clipboardProvider.dispose();
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      setIsLocalConnected(false);
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
      {isWindows && (
        <div className="flex justify-end border-b border-border px-2 py-1">
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
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={xtermRef} className="h-full w-full p-2" />
        {/* Same floating toolbar as the SSH terminal. No host is bound, so
            only the image actions apply; uploads go to this machine's
            backend. */}
        <TerminalToolbar
          terminalIdentity={instanceId}
          isConnected={isLocalConnected}
          isTmuxAttached={false}
          onTmuxDetach={() => {}}
          isImageUploading={isImageUploading}
          imageUploadProgress={imageUploadProgress}
          onUploadImage={(file) => void handleImageUpload(file, "file")}
          onPasteImage={() => void handlePasteImage()}
          isFocused={isTerminalFocused}
          actionsEnabled={false}
        />
      </div>
    </div>
  );
}
