import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";
export type Theme = PluginHostProps["theme"];
export function Action({
  theme,
  children,
  onPress,
  disabled,
  selected,
  label,
}: {
  theme: Theme;
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        opacity: disabled ? 0.45 : 1,
        minHeight: 40,
        paddingHorizontal: 9,
        justifyContent: "center",
        borderRadius: 7,
        backgroundColor: selected ? theme.colors.surface2 : "transparent",
      }}
    >
      {typeof children === "string" ? (
        <Text
          style={{
            fontSize: 14,
            color: selected ? theme.colors.accent : theme.colors.foreground,
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
export function Notice({ theme, text }: { theme: Theme; text: string }) {
  return text ? (
    <View accessibilityLiveRegion="polite" style={{ paddingVertical: 6 }}>
      <Text selectable style={{ color: theme.colors.foreground, fontSize: 13 }}>
        {text}
      </Text>
    </View>
  ) : null;
}
export function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
