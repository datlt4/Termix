import { authApi, handleApiError } from "@/main-axios";

/** Flips Auto-Tmux for one host without round-tripping the whole editor form. */
export async function setHostAutoTmux(
  hostId: number,
  autoTmux: boolean,
): Promise<void> {
  try {
    await authApi.patch(`/host/db/host/${hostId}/terminal-config`, {
      autoTmux,
    });
  } catch (error) {
    throw handleApiError(error, "update host auto-tmux");
  }
}

/** Appearance fields the "apply to all hosts" action merges into a host. */
export interface HostTerminalAppearance {
  theme?: string;
  customThemeColors?: Record<string, string>;
  fontFamily?: string;
  fontSize?: number;
  cursorStyle?: string;
  cursorBlink?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
}

/** Merges terminal appearance fields into one host's terminalConfig. */
export async function updateHostTerminalAppearance(
  hostId: number,
  fields: HostTerminalAppearance,
): Promise<void> {
  try {
    await authApi.patch(`/host/db/host/${hostId}/terminal-config`, fields);
  } catch (error) {
    throw handleApiError(error, "update host terminal appearance");
  }
}
