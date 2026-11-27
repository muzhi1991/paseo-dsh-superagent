import { createContext, useContext, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { Route, Command } from "../shared/supervision";
import type { Theme } from "./common";

export const Surface = createContext<{
  theme: Theme;
  compact: boolean;
  fullscreen: boolean;
  instance?: string;
  drafts: Map<string, unknown>;
  go: (r: Route) => void;
  confirm: (title: string, command: Command, after?: () => void) => void;
} | null>(null);
export const useSurface = () => useContext(Surface)!;
/** Preserve edits while moving between pages on the same host and DSH instance. */
export function useSettingsDraft<T>(block: string) {
  const { drafts, instance } = useSurface(),
    key = JSON.stringify([instance, block]);
  const [draft, setLocal] = useState<T | null>(
    () => (drafts.get(key) as T) ?? null,
  );
  function setDraft(update: T | null | ((previous: T | null) => T | null)) {
    const previous = (drafts.get(key) as T) ?? null;
    const next =
      typeof update === "function"
        ? (update as (old: T | null) => T | null)(previous)
        : update;
    if (next === null) drafts.delete(key);
    else drafts.set(key, next);
    setLocal(next);
  }
  return [draft, setDraft] as const;
}
export function Copy({
  children,
  quiet = false,
  bold = false,
}: {
  children: ReactNode;
  quiet?: boolean;
  bold?: boolean;
}) {
  const {
    theme: { colors },
  } = useSurface();
  return (
    <Text
      selectable
      style={{
        color: quiet ? colors.foregroundMuted : colors.foreground,
        fontSize: quiet ? 12 : 14,
        lineHeight: quiet ? 18 : 21,
        fontWeight: bold ? "600" : "400",
      }}
    >
      {children}
    </Text>
  );
}
export function Link({
  children,
  onPress,
}: {
  children: string;
  onPress: () => void;
}) {
  const {
    theme: { colors },
  } = useSurface();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingVertical: 6, paddingHorizontal: 3 }}
    >
      <Text style={{ color: colors.accent, fontSize: 13 }}>{children}</Text>
    </Pressable>
  );
}
export function Section({
  name,
  count,
  extra,
  children,
}: {
  name: string;
  count?: number;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 6, marginBottom: 17 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <TextLabel title={name} count={count} />
        {extra}
      </View>
      {children}
    </View>
  );
}
function TextLabel({ title, count }: { title: string; count?: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        flexShrink: 1,
      }}
    >
      <Copy bold>{title}</Copy>
      {count !== undefined && <Copy quiet>{count}</Copy>}
    </View>
  );
}
export function FilterPills({
  items,
  active,
  choose,
}: {
  items: Record<string, string>;
  active: string;
  choose: (k: string) => void;
}) {
  const {
    theme: { colors },
  } = useSurface();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 5,
        marginVertical: 7,
      }}
    >
      {Object.entries(items).map(([k, v]) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityState={{ selected: active === k }}
          onPress={() => choose(k)}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            minHeight: 24,
            justifyContent: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: active === k ? colors.border : "transparent",
            backgroundColor: active === k ? colors.surface2 : colors.surface1,
          }}
        >
          <Text
            style={{
              color: active === k ? colors.foreground : colors.foregroundMuted,
              fontSize: 12,
            }}
          >
            {v}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Fold({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, set] = useState(false);
  return (
    <View>
      <Link onPress={() => set(!open)}>{(open ? "▾ " : "› ") + label}</Link>
      {open && <View style={{ paddingLeft: 10, gap: 5 }}>{children}</View>}
    </View>
  );
}
export function RecordLine({
  title,
  meta,
  body,
  icon,
  stage,
  onPress,
}: {
  title: string;
  meta?: string;
  body?: string;
  icon?: string;
  stage?: string;
  onPress?: () => void;
}) {
  const {
    theme: { colors },
    compact,
  } = useSurface();
  const mark = icon && (
    <Icon name={icon} size={14} color={colors.foregroundMuted} />
  );
  const inner = (
    <>
      {!!stage && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            width: compact ? undefined : 108,
            borderRightWidth: compact ? 0 : 0.5,
            borderColor: colors.border,
          }}
        >
          {mark}
          <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>
            {stage}
          </Text>
        </View>
      )}
      <View
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: compact ? "auto" : 0,
          minWidth: 0,
          gap: 3,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {!stage && mark}
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: "500",
              color: colors.foreground,
            }}
          >
            {title || "—"}
          </Text>
        </View>
        {!!body && (
          <Text
            selectable={!onPress}
            numberOfLines={onPress ? 2 : undefined}
            style={{ fontSize: 13, lineHeight: 19, color: colors.foreground }}
          >
            {body}
          </Text>
        )}
        {!!meta && <Copy quiet>{meta}</Copy>}
      </View>
    </>
  );
  const style = {
    paddingVertical: stage ? 10 : 7,
    paddingHorizontal: 5,
    gap: compact ? 4 : 12,
    flexDirection: compact ? ("column" as const) : ("row" as const),
    borderBottomWidth: 0.5,
    borderColor: colors.surface2,
  };
  return onPress ? (
    <Pressable style={style} onPress={onPress} accessibilityRole="button">
      {inner}
    </Pressable>
  ) : (
    <View style={style}>{inner}</View>
  );
}
