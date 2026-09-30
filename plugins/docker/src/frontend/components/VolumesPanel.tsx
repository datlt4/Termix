import React from "react";
import { FolderArchive, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix/plugin-sdk/frontend";
import { Button, Input, useConfirmation } from "@termix/plugin-sdk/ui";
import { getErrorMessage } from "../error-message";
import { useDockerApi } from "../docker-api";
import type { DockerVolume } from "../types";

interface VolumesPanelProps {
  sessionId: string;
  search?: string;
  refreshKey?: number;
}

/**
 * Volume management for the session's host: list, create and remove volumes
 * over SSH.
 */
export function VolumesPanel({
  sessionId,
  search = "",
  refreshKey = 0,
}: VolumesPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const docker = useDockerApi();
  const { confirmWithToast } = useConfirmation();
  const [volumes, setVolumes] = React.useState<DockerVolume[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pendingName, setPendingName] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setVolumes(await docker.listVolumes(sessionId));
    } catch {
      // the next refresh tries again
    } finally {
      setLoading(false);
    }
  }, [sessionId, docker]);

  React.useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return volumes.filter(
      (v) =>
        v.name.toLowerCase().includes(q) || v.driver.toLowerCase().includes(q),
    );
  }, [volumes, search]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const result = await docker.createVolume(sessionId, name);
      toast.success(result.message || t("docker.volumeCreated", { name }));
      setNewName("");
      await load();
    } catch (err) {
      toast.error(
        t("docker.createVolumeFailed", { error: getErrorMessage(err) }),
      );
    } finally {
      setCreating(false);
    }
  };

  const handleRemove = (volume: DockerVolume) => {
    void confirmWithToast(
      {
        title: t("docker.removeVolumeTitle"),
        description: t("docker.removeVolume", { name: volume.name }),
        confirmText: t("docker.remove"),
        cancelText: t("docker.cancel"),
        variant: "destructive",
      },
      async () => {
        setPendingName(volume.name);
        try {
          const result = await docker.removeVolume(sessionId, volume.name);
          toast.success(
            result.message || t("docker.volumeRemoved", { name: volume.name }),
          );
          await load();
        } catch (err) {
          toast.error(
            t("docker.removeVolumeFailed", { error: getErrorMessage(err) }),
          );
        } finally {
          setPendingName(null);
        }
      },
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-40 py-20">
        <RefreshCw className="size-8 animate-spin mb-4" />
        <span className="text-sm font-semibold">
          {t("docker.loadingVolumes")}
        </span>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
        <FolderArchive className="size-16 mb-4" />
        <span className="text-xl font-bold uppercase tracking-widest">
          {t("docker.noVolumesFound")}
        </span>
        <span className="text-xs font-semibold">
          {t("docker.noVolumesFoundHint")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Input
            placeholder={t("docker.volumeNamePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            className="h-8"
          />
        </div>
        <Button
          size="sm"
          onClick={() => void handleCreate()}
          disabled={!newName.trim() || creating}
        >
          {creating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          {t("docker.create")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar border border-border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.name")}
              </th>
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.driver")}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t("docker.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((volume) => (
              <tr
                key={volume.name}
                className="border-b border-border last:border-0 hover:bg-muted/50"
              >
                <td className="px-3 py-2 font-mono">{volume.name}</td>
                <td className="px-3 py-2">{volume.driver}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(volume)}
                    disabled={pendingName === volume.name}
                    title={t("docker.remove")}
                  >
                    {pendingName === volume.name ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
