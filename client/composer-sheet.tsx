import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Action, type Theme } from "./common";

type EscapeKey = {
  key: string;
  preventDefault(): void;
  stopPropagation(): void;
};
declare const document: {
  addEventListener(
    type: "keydown",
    listener: (e: EscapeKey) => void,
    capture: boolean,
  ): void;
  removeEventListener(
    type: "keydown",
    listener: (e: EscapeKey) => void,
    capture: boolean,
  ): void;
};

export function ComposerSheet({
  title,
  theme,
  compact,
  close,
  children,
}: {
  title: string;
  theme: Theme;
  compact: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const { colors } = theme;
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(slide, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [slide]);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const escape = (event: EscapeKey) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [close]);
  const sheet = (
    <View
      style={[
        StyleSheet.absoluteFill,
        { justifyContent: "flex-end", alignItems: "center" },
      ]}
      accessibilityViewIsModal
    >
      <Pressable
        accessible={false}
        onPress={close}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.36)" },
        ]}
      />
      <Animated.View
        style={{
          width: "100%",
          maxWidth: compact ? undefined : 500,
          maxHeight: "78%",
          backgroundColor: colors.surface1,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: compact ? 14 : 12,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [180, 0],
              }),
            },
          ],
          opacity: slide,
        }}
      >
        <View
          style={{
            alignSelf: "center",
            width: 32,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: 10,
            marginVertical: 4,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              fontSize: 16,
              fontWeight: "600",
              color: colors.foreground,
            }}
          >
            {title}
          </Text>
          <Action theme={theme} onPress={close}>
            取消
          </Action>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </Animated.View>
    </View>
  );
  // Native Router already lives in a full-screen modal. Keep this sheet in
  // that view so the system image/file picker can present on it immediately.
  return Platform.OS === "web" ? (
    <Modal visible transparent onRequestClose={close}>
      {sheet}
    </Modal>
  ) : (
    sheet
  );
}
