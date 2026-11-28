import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Text,
  View,
} from "react-native";
import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import type { sidebarCounts } from "../shared/api";

type Counts = NonNullable<RpcOutput<typeof sidebarCounts>>;

const blue = "#499aeb";
const mark = {
  width: 14,
  height: 14,
  alignItems: "center",
  justifyContent: "center",
} as const;

function RunningRing() {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (Platform.OS === "web") return; // The web ActivityIndicator spins in CSS.
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [turn]);
  return (
    <View style={mark}>
      {Platform.OS === "web" ? (
        <ActivityIndicator size={12} color={blue} />
      ) : (
        <Animated.View
          style={{
            width: 12,
            height: 12,
            borderWidth: 1.5,
            borderRadius: 6,
            borderColor: "rgba(73,154,235,0.35)",
            borderRightColor: blue,
            transform: [
              {
                rotate: turn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "360deg"],
                }),
              },
            ],
          }}
        />
      )}
      <View
        style={{
          position: "absolute",
          width: 5,
          height: 5,
          borderRadius: 3,
          backgroundColor: blue,
        }}
      />
    </View>
  );
}
export function SidebarCounts({
  running,
  needsAttention,
  theme,
}: Counts & Pick<PluginSidebarItemProps, "theme">) {
  const { colors } = theme;
  const anchor = useRef<View>(null);
  const label = [
    running > 0 && `执行中 ${running}`,
    needsAttention > 0 && `待你处理 ${needsAttention}`,
  ]
    .filter(Boolean)
    .join("，");
  useEffect(() => {
    if (Platform.OS === "web")
      (
        anchor.current as unknown as {
          setAttribute(name: string, value: string): void;
        } | null
      )?.setAttribute("title", label);
  }, [label]);

  const pair = { flexDirection: "row", alignItems: "center", gap: 3 } as const;
  const number = {
    color: colors.foregroundMuted,
    fontSize: 13,
    fontVariant: ["tabular-nums" as const],
  };
  return (
    <View
      ref={anchor}
      accessible
      accessibilityLabel={label}
      style={{ ...pair, gap: 8 }}
    >
      {running > 0 && (
        <View style={pair}>
          <RunningRing />
          <Text style={number}>{running}</Text>
        </View>
      )}
      {needsAttention > 0 && (
        <View style={pair}>
          <View style={mark}>
            <View
              style={{
                width: 11,
                height: 11,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: colors.statusWarning,
              }}
            />
          </View>
          <Text
            style={{
              ...number,
              color: colors.statusWarning,
              fontWeight: "600",
            }}
          >
            {needsAttention}
          </Text>
        </View>
      )}
    </View>
  );
}
