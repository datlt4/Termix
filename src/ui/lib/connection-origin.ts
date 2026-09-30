import { websocketAuthProtocols } from "@/lib/ws-auth";

export type ConnectionOrigin = "local" | "remote";

interface OriginResolvableHost {
  connectionOrigin?: ConnectionOrigin | null;
}

/**
 * FORK: interactive connections (SSH, Docker console, RDP/VNC/Telnet,
 * file manager, ...) are ALWAYS initiated from this machine, the same way
 * Termius connects from the device itself.
 *
 * The linked server is used for data sync only -- it must never originate
 * connections on the user's behalf: a relay server often has no network
 * path to the user's hosts (LAN, VPN subnets), and routing through it
 * breaks connections that would work locally.
 */
export async function resolveConnectionOrigin(
  _host: OriginResolvableHost,
  _options: { defaultRemote?: boolean } = {},
): Promise<ConnectionOrigin> {
  return "local";
}

/**
 * FORK: builds the base WebSocket URL for an interactive connection
 * protocol. "remote" was retired (see resolveConnectionOrigin), so every
 * target is the embedded local backend. The signature keeps its original
 * shape so existing callers (plugin transport, plugin SDK) compile
 * unchanged.
 */
export interface WebSocketConnectionTarget {
  url: string;
  protocols: string[];
}

export async function buildOriginWsUrl({
  localPort,
  localPath,
  includeJwt = true,
}: {
  origin?: ConnectionOrigin;
  localPort: number;
  localPath: string;
  remotePath?: string;
  includeJwt?: boolean;
}): Promise<WebSocketConnectionTarget> {
  const token = includeJwt ? localStorage.getItem("jwt") : null;
  return {
    url: `ws://127.0.0.1:${localPort}${localPath}`,
    protocols: websocketAuthProtocols(token),
  };
}
