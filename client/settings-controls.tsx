import { useId, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { PanelDialog } from "./panel-dialog";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useSurface } from "./surface";

type ChoiceProps = {
  label: string;
  items: Record<string, string>;
  active: string;
  choose: (value: string) => void;
};
type NavigationProps = ChoiceProps & {
  appearance: "underline" | "segments";
  panelId?: string;
  maxWidth?: number;
};

/** Subpages sit on a baseline. Form choices sit inside one segmented track. */
export function ChoiceBar({
  label,
  items,
  active,
  choose,
  appearance,
  panelId,
  maxWidth = 420,
}: NavigationProps) {
  const {
      theme: { colors },
    } = useSurface(),
    line = appearance === "underline";
  const values = Object.keys(items);
  // React Native Web forwards key events and tabIndex to the focusable element.
  const keyboard =
    Platform.OS === "web"
      ? {
          onKeyDown: (e: {
            key: string;
            preventDefault(): void;
            currentTarget: {
              querySelectorAll: (s: string) => ArrayLike<{ focus(): void }>;
            };
          }) => {
            const i = values.indexOf(active),
              n = values.length;
            const positions: Record<string, number> = {
              ArrowRight: (i + 1) % n,
              ArrowLeft: (i + n - 1) % n,
              Home: 0,
              End: n - 1,
            };
            const next = positions[e.key];
            if (next === undefined || !n) return;
            e.preventDefault();
            e.currentTarget.querySelectorAll('[role="tab"]')[next]?.focus();
            if (values[next] !== active) choose(values[next]);
          },
        }
      : {};
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      {...keyboard}
      style={
        line
          ? {
              flexDirection: "row",
              flexWrap: "wrap",
              columnGap: 16,
              borderBottomWidth: 0.5,
              borderColor: colors.border,
            }
          : {
              alignSelf: "flex-start",
              width: "100%",
              maxWidth,
              flexDirection: "row",
              padding: 3,
              gap: 2,
              borderRadius: 9,
              backgroundColor: colors.surface2,
            }
      }
    >
      {Object.entries(items).map(([key, title]) => {
        const selected = key === active;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected }}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            nativeID={panelId ? panelId + "-" + key : undefined}
            aria-controls={panelId}
            onPress={() => {
              if (!selected) choose(key);
            }}
            style={
              line
                ? {
                    justifyContent: "flex-end",
                    minHeight: 26,
                    paddingBottom: 5,
                    borderBottomWidth: 1.5,
                    borderColor: selected ? colors.foreground : "transparent",
                  }
                : {
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: 28,
                    paddingHorizontal: 5,
                    paddingVertical: 3,
                    borderRadius: 7,
                    backgroundColor: selected ? colors.surface0 : "transparent",
                  }
            }
          >
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                fontWeight: selected ? "500" : "400",
                textAlign: line ? "left" : "center",
                color: selected ? colors.foreground : colors.foregroundMuted,
              }}
            >
              {title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceField({ label, items, active, choose }: ChoiceProps) {
  const {
      theme: { colors },
    } = useSurface(),
    [open, setOpen] = useState(false);
  if (Platform.OS === "web")
    return (
      <select
        aria-label={label}
        value={active}
        onChange={(e) =>
          choose((e.currentTarget as unknown as { value: string }).value)
        }
        style={{
          boxSizing: "border-box",
          width: "100%",
          minWidth: 0,
          height: 32,
          paddingInline: 8,
          borderRadius: 8,
          border: "1px solid " + colors.border,
          color: colors.foreground,
          backgroundColor: colors.surface0,
          font: "inherit",
          fontSize: 13,
        }}
      >
        {Object.entries(items).map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label + "，" + (items[active] ?? active)}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 36,
          paddingHorizontal: 8,
          gap: 4,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flex: 1, color: colors.foreground, fontSize: 13 }}
        >
          {items[active] ?? active}
        </Text>
        <Icon name="ChevronDown" size={14} color={colors.foregroundMuted} />
      </Pressable>
      {open && (
        <PanelDialog title={label} onClose={() => setOpen(false)}>
          {Object.entries(items).map(([id, title]) => (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityState={{ checked: id === active }}
              onPress={() => {
                setOpen(false);
                if (id !== active) choose(id);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: 42,
                gap: 8,
              }}
            >
              <Text style={{ flex: 1, color: colors.foreground }}>{title}</Text>
              {id === active && (
                <Icon name="Check" size={16} color={colors.foreground} />
              )}
            </Pressable>
          ))}
        </PanelDialog>
      )}
    </>
  );
}

export function SuggestedInput({ label, items, active, choose }: ChoiceProps) {
  const id = useId(),
    {
      theme: { colors },
    } = useSurface();
  if (Platform.OS === "web")
    return (
      <>
        <input
          aria-label={label}
          list={id}
          value={active}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) =>
            choose((e.currentTarget as unknown as { value: string }).value)
          }
          style={{
            boxSizing: "border-box",
            width: "100%",
            height: 32,
            minWidth: 0,
            paddingInline: 8,
            border: "1px solid " + colors.border,
            borderRadius: 8,
            backgroundColor: colors.surface0,
            color: colors.foreground,
            font: "inherit",
            fontSize: 13,
          }}
        />
        <datalist id={id}>
          {Object.entries(items).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </datalist>
      </>
    );
  return (
    <View style={{ gap: 4 }}>
      <TextInput
        value={active}
        accessibilityLabel={label}
        autoCorrect={false}
        autoCapitalize="none"
        onChangeText={choose}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          minHeight: 35,
          color: colors.foreground,
          paddingHorizontal: 8,
        }}
      />
      {!!Object.keys(items).length && (
        <ChoiceField
          label={"选择" + label}
          items={{
            "": "选择" + label,
            ...items,
            ...(active && !Object.hasOwn(items, active)
              ? { [active]: active }
              : {}),
          }}
          active={active}
          choose={choose}
        />
      )}
    </View>
  );
}
