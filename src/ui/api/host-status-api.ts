import { handleApiError, sshHostApi } from "@/main-axios";
import type { ServerStatus } from "@/main-axios";

// HOST STATUS
// ============================================================================

/**
 * FORK: host status checks are switched off. The app used to poll
 * /host/status (and the linked server's /sync/v2/host-status) every 30s,
 * which made the backend keep probing every host (TCP + SSH auth) only to
 * paint online / "reachable, not authenticated" / offline badges. No
 * request is sent, so the backend never starts those probes.
 */
export async function getAllServerStatuses(): Promise<
  Record<number, ServerStatus>
> {
  return {};
}

export async function getServerStatusById(id: number): Promise<ServerStatus> {
  try {
    const response = await sshHostApi.get(`/status/${id}`);
    return response.data;
  } catch (error) {
    handleApiError(error, "fetch server status");
    throw error;
  }
}

export async function refreshServerPolling(): Promise<void> {
  try {
    await sshHostApi.post("/status/refresh");
  } catch (error) {
    console.warn("Failed to refresh status checks:", error);
  }
}

export async function getStatusCheckSettings(): Promise<{
  statusCheckInterval: number;
}> {
  try {
    const response = await sshHostApi.get("/status/settings");
    return response.data;
  } catch (error) {
    handleApiError(error, "fetch status check settings");
  }
}

export async function updateStatusCheckSettings(settings: {
  statusCheckInterval: number;
}): Promise<void> {
  try {
    await sshHostApi.put("/status/settings", settings);
  } catch (error) {
    handleApiError(error, "update status check settings");
  }
}

// ============================================================================
