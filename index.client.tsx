import { useEffect, useRef, useState } from "react";
import type {
  PluginClientContext,
  PluginSidebarItemProps,
  PluginScreenProps,
} from "@getpaseo/plugin/client";
import { useSubscription } from "@getpaseo/plugin/client";
import { sidebarCounts, type SidebarSnapshot } from "./shared/api";
import { SidebarCounts } from "./client/sidebar-counts";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Panel } from "./client/panel";
import { ConnectionSettings } from "./client/settings";

function Sidebar(props: PluginSidebarItemProps) {
  const { currentScreen, openScreen, layout } = props;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const [snapshot, setSnapshot] = useState<SidebarSnapshot>(null);
  const subscription = useSubscription(sidebarCounts, {}, setSnapshot);
  const status = subscription.status === "live" && snapshot;

  return (
    <>
      <SidebarRow
        icon="Hammer"
        trailing={
          status && (status.running > 0 || status.needsAttention > 0) ? (
            <SidebarCounts {...status} theme={props.theme} />
          ) : undefined
        }
        active={open || currentScreen?.screenId === "superagent"}
        onPress={() =>
          layout.compact
            ? setOpen(true)
            : openScreen({ screenId: "superagent" })
        }
      />
      {open && (
        <Panel
          {...props}
          params={{}}
          closePanel={close}
          openLinkedAgent={(agentId) => {
            close();
            openScreen({ screenId: "superagent", params: { agentId } });
          }}
        />
      )}
    </>
  );
}

// Agent navigation is supplied to registered screens, including when entered from the sidebar panel.
function PanelScreen(props: PluginScreenProps) {
  const opened = useRef<string | undefined>(undefined);
  const agentId = props.params.agentId;
  useEffect(() => {
    if (agentId && opened.current !== agentId && props.navigation) {
      opened.current = agentId;
      props.navigation.openAgent({ serverId: props.host.id, agentId });
    }
  }, [agentId, props.host.id, props.navigation]);
  return <Panel {...props} />;
}
export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: "superagent",
    title: "DSH Superagent",
    Component: PanelScreen,
  });
  client.addSidebarHeaderItem({
    id: "superagent",
    title: "DSH Superagent",
    Component: (props) => <Sidebar key={props.host.id} {...props} />,
  });
  client.addSettingsScreen({
    id: "connection",
    title: "DSH 实例",
    icon: "Plug",
    Component: ConnectionSettings,
  });
  return () => {};
}
