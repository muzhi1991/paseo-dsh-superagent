import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
} from "react-native";
import type {
  PluginClientContext,
  PluginSidebarItemProps,
  PluginScreenProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Panel } from "./client/panel";
import { ConnectionSettings } from "./client/settings";

function Sidebar(props: PluginSidebarItemProps) {
  const { currentScreen, openScreen, layout, theme } = props;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <SidebarRow
        icon="Hammer"
        active={open || currentScreen?.screenId === "superagent"}
        onPress={() =>
          layout.compact
            ? setOpen(true)
            : openScreen({ screenId: "superagent" })
        }
      />
      {open && (
        <Modal visible presentationStyle="fullScreen" onRequestClose={close}>
          <SafeAreaView
            style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <Panel
                {...props}
                params={{}}
                closePanel={close}
                openLinkedAgent={(agentId) => {
                  close();
                  openScreen({ screenId: "superagent", params: { agentId } });
                }}
              />
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
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
    Component: Sidebar,
  });
  client.addSettingsScreen({
    id: "connection",
    title: "DSH 实例",
    icon: "Plug",
    Component: ConnectionSettings,
  });
  return () => {};
}
