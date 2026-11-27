import type { ReactNode } from "react";
import {
  Modal as NativeModal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Icon, Modal } from "@getpaseo/plugin/client/ui";
import { Action } from "./common";
import { useSurface } from "./surface";

// A host-owned sheet would open beneath the sidebar's full-screen native modal.
export function PanelDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { theme, fullscreen } = useSurface();
  if (!fullscreen)
    return (
      <Modal
        title={title}
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Modal.Content>{children}</Modal.Content>
      </Modal>
    );
  return (
    <NativeModal
      visible
      transparent
      onRequestClose={onClose}
      animationType="fade"
    >
      <SafeAreaView
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.4)",
        }}
      >
        <Pressable accessible={false} onPress={onClose} style={{ flex: 1 }} />
        <View
          style={{
            maxHeight: "82%",
            backgroundColor: theme.colors.surface1,
            padding: 16,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              accessibilityRole="header"
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.foreground,
              }}
            >
              {title}
            </Text>
            <Action theme={theme} onPress={onClose} label="关闭">
              <Icon name="X" size={17} color={theme.colors.foreground} />
            </Action>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 12 }}
          >
            {children}
          </ScrollView>
        </View>
      </SafeAreaView>
    </NativeModal>
  );
}
