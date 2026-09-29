import type { ComponentType } from "react";
import { Box } from "lucide-react";
import type {
  HomepageWidgetContribution,
  PanelProps,
  StandaloneViewProps,
  TabProps,
  TermixApp,
} from "@termix/plugin-sdk/frontend";
import { useTranslation } from "@termix/plugin-sdk/frontend";
import { DockerManager } from "./DockerManager";
import DockerApp from "./DockerApp";
import { dockerWidget } from "./DockerWidget";
import { dockerEnabled, toDockerHost } from "./types";

function DockerTab({ host, sshHost, label, isVisible }: TabProps) {
  const record = (host ?? sshHost) as Record<string, unknown> | undefined;
  return (
    <DockerManager
      host={record ? toDockerHost(record) : undefined}
      title={label}
      isVisible={isVisible}
      isTopbarOpen={false}
      embedded={true}
    />
  );
}

function DockerStandalone({ hostId }: StandaloneViewProps) {
  return <DockerApp hostId={hostId} />;
}

/**
 * Right-dock replacement for the (removed) session-logs panel: manages the
 * Docker of whichever host the active terminal session is on. The shell
 * passes the active command-target tab; switching hosts reconnects the
 * manager, which keeps its own SSH session per host.
 */
function DockerRightDockPanel({ targetTab, active }: PanelProps) {
  const { t } = useTranslation();
  const record = targetTab?.host as Record<string, unknown> | undefined;

  if (!record) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
        <div className="size-10 bg-muted/40 flex items-center justify-center">
          <Box className="size-5 text-muted-foreground/30" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-muted-foreground/60">
            {t("docker.noHostSelected")}
          </span>
          <span className="text-xs text-muted-foreground/40">
            {t("docker.noHostSelectedDesc")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <DockerManager
      host={toDockerHost(record)}
      title={record.name as string}
      isVisible={active}
      isTopbarOpen={false}
      embedded={true}
    />
  );
}

export function activate(app: TermixApp): void {
  // Host actions filter synchronously, so the permission is read once here.
  let canUse = true;
  void app.hasPermission("use").then((allowed) => {
    canUse = allowed;
  });

  app.registerTab("docker", DockerTab, {
    icon: Box,
    titleKey: "nav.docker",
    requiresHost: true,
    noHostMessageKey: "docker.noHostSelected",
    persistent: true,
    activityTypes: ["docker"],
    standalone: DockerStandalone,
    preload: () => import("./DockerManager"),
  });

  // The right dock is this panel's home in the fork: toggling the right
  // sidebar opens the Docker manager for the active host. It is the only
  // rightDockable view (core reference panels dropped that flag), so it is
  // the right dock's default. It also appears on the left rail.
  app.registerRailItem({
    id: "docker",
    icon: Box,
    titleKey: "nav.docker",
    kind: "panel",
    rightDockable: true,
    permission: "use",
  });

  app.registerPanel("docker", DockerRightDockPanel);

  app.registerHostAction({
    id: "docker",
    titleKey: "nav.docker",
    icon: Box,
    kind: "open",
    order: 30,
    tabType: "docker",
    copyUrlView: "docker",
    when: (host) => canUse && !!host.enableSsh && dockerEnabled(host),
  });

  app.registerHomepageWidget(
    dockerWidget as unknown as HomepageWidgetContribution,
  );

  app.registerSlotContribution("onboarding.features", {
    actionId: "docker.feature",
    titleKey: "onboarding.feature_docker",
    descriptionKey: "onboarding.feature_docker_desc",
    icon: Box as ComponentType<{ className?: string }>,
  });
}
