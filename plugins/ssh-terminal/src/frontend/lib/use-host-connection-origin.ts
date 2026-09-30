import { useEffect, useState } from "react";
import { resolveConnectionOrigin } from "@termix/plugin-sdk/ui";
import {
  usePluginApiFor,
  type PluginApiClient,
} from "@termix/plugin-sdk/frontend";

export type HostConnectionOrigin = "local" | "remote";

/**
 * Resolves which backend owns this host's interactive connections and
 * per-host data: the desktop app's embedded backend, or the server it is
 * linked to. Follows the same rules as the terminal's WebSocket connection
 * (host override, then the desktop-wide default). Null until resolved.
 */
export function useHostConnectionOrigin(
  connectionOrigin: HostConnectionOrigin | null | undefined,
): HostConnectionOrigin | null {
  const [origin, setOrigin] = useState<HostConnectionOrigin | null>(null);
  useEffect(() => {
    let cancelled = false;
    setOrigin(null);
    void resolveConnectionOrigin({ connectionOrigin }).then((resolved) => {
      if (!cancelled) setOrigin(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [connectionOrigin]);
  return origin;
}

/**
 * This plugin's API client for the backend a host's connection resolves to.
 * Per-host calls (image uploads, command history) must reach the same backend
 * as the host's terminal session; a local-only client cannot find a
 * remote-origin host's sessions and fails them (503 on image upload).
 * Outside the desktop app, or while the origin is still resolving, this is
 * the ordinary local client.
 */
export function useHostApi(
  connectionOrigin: HostConnectionOrigin | null | undefined,
): PluginApiClient {
  const origin = useHostConnectionOrigin(connectionOrigin);
  return usePluginApiFor(origin);
}
