import React from "react";
import {
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix/plugin-sdk/frontend";
import { Button, Input, useConfirmation } from "@termix/plugin-sdk/ui";
import { getErrorMessage } from "../error-message";
import { useDockerApi } from "../docker-api";
import type { DockerImage } from "../types";

interface ImagesPanelProps {
  sessionId: string;
  search?: string;
  refreshKey?: number;
}

/**
 * Image management for the session's host: list, pull and remove (optionally
 * forced) images over SSH.
 */
export function ImagesPanel({
  sessionId,
  search = "",
  refreshKey = 0,
}: ImagesPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const docker = useDockerApi();
  const { confirmWithToast } = useConfirmation();
  const [images, setImages] = React.useState<DockerImage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [forceRemove, setForceRemove] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [pullRef, setPullRef] = React.useState("");
  const [pulling, setPulling] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setImages(await docker.listImages(sessionId));
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
    return images.filter(
      (img) =>
        img.repository.toLowerCase().includes(q) ||
        img.tag.toLowerCase().includes(q) ||
        img.id.toLowerCase().includes(q),
    );
  }, [images, search]);

  const imageLabel = (img: DockerImage): string =>
    img.repository === "<none>"
      ? t("docker.danglingImage")
      : `${img.repository}:${img.tag}`;

  const handlePull = async () => {
    const reference = pullRef.trim();
    if (!reference || pulling) return;
    setPulling(true);
    try {
      const result = await docker.pullImage(sessionId, reference);
      toast.success(result.message || t("docker.pullSuccess", { reference }));
      setPullRef("");
      await load();
    } catch (err) {
      toast.error(t("docker.pullFailed", { error: getErrorMessage(err) }));
    } finally {
      setPulling(false);
    }
  };

  const handleRemove = (img: DockerImage) => {
    const force = forceRemove.has(img.id);
    void confirmWithToast(
      {
        title: t("docker.removeImageTitle"),
        description: t("docker.removeImage", { name: imageLabel(img) }),
        confirmText: t("docker.remove"),
        cancelText: t("docker.cancel"),
        variant: "destructive",
      },
      async () => {
        setPendingId(img.id);
        try {
          const result = await docker.removeImage(sessionId, img.id, force);
          toast.success(
            result.message ||
              t("docker.imageRemoved", { name: imageLabel(img) }),
          );
          await load();
        } catch (err) {
          toast.error(
            t("docker.removeImageFailed", { error: getErrorMessage(err) }),
          );
        } finally {
          setPendingId(null);
        }
      },
    );
  };

  const toggleForce = (imageId: string) => {
    setForceRemove((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-40 py-20">
        <RefreshCw className="size-8 animate-spin mb-4" />
        <span className="text-sm font-semibold">
          {t("docker.loadingImages")}
        </span>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full opacity-20 py-20">
        <ImageIcon className="size-16 mb-4" />
        <span className="text-xl font-bold uppercase tracking-widest">
          {t("docker.noImagesFound")}
        </span>
        <span className="text-xs font-semibold">
          {t("docker.noImagesFoundHint")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Download className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder={t("docker.pullPlaceholder")}
            value={pullRef}
            onChange={(e) => setPullRef(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handlePull();
            }}
            className="pl-8 h-8"
          />
        </div>
        <Button
          size="sm"
          onClick={() => void handlePull()}
          disabled={!pullRef.trim() || pulling}
        >
          {pulling ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {t("docker.pull")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar border border-border bg-card">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.repository")}
              </th>
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.tag")}
              </th>
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.imageId")}
              </th>
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.size")}
              </th>
              <th className="px-3 py-2 text-left font-semibold">
                {t("docker.created")}
              </th>
              <th className="px-3 py-2 text-center font-semibold">
                {t("docker.force")}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t("docker.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((img) => (
              <tr
                key={img.id + img.repository + img.tag}
                className="border-b border-border last:border-0 hover:bg-muted/50"
              >
                <td className="px-3 py-2 font-mono">
                  {img.repository === "<none>"
                    ? t("docker.danglingImage")
                    : img.repository}
                </td>
                <td className="px-3 py-2 font-mono">{img.tag}</td>
                <td className="px-3 py-2 font-mono">{img.id.slice(0, 12)}</td>
                <td className="px-3 py-2">{img.size}</td>
                <td className="px-3 py-2">{img.createdSince}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={forceRemove.has(img.id)}
                    onChange={() => toggleForce(img.id)}
                    className="size-3.5 accent-[var(--accent-brand)]"
                    title={t("docker.force")}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(img)}
                    disabled={pendingId === img.id}
                    title={t("docker.remove")}
                  >
                    {pendingId === img.id ? (
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
