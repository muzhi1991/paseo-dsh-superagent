import { useState } from "react";
import { Text, View } from "react-native";
import { copyText, Icon } from "@getpaseo/plugin/client/ui";
import type { ActionCard, PresentedFile } from "../shared/cards";
import { Action, errorText, type Theme } from "./common";

export function PresentedFiles({
  files,
  theme,
  report,
}: {
  files: Map<string, PresentedFile>;
  theme: Theme;
  report: (s: string) => void;
}) {
  const [all, setAll] = useState(false);
  const c = theme.colors;
  const list = [...files.values()];
  return (
    <View style={{ gap: 6 }}>
      {(all ? list : list.slice(0, 4)).map((file) => {
        const name = file.path.split(/[\\/]/).pop() || file.path;
        return (
          <View
            key={file.path}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: c.surface1,
              borderColor: c.border,
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Icon name="FileText" size={20} color={c.foregroundMuted} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text
                selectable
                style={{ color: c.foreground, fontWeight: "600" }}
              >
                {name}
              </Text>
              {!!file.description && (
                <Text selectable style={{ color: c.foreground, fontSize: 13 }}>
                  {file.description}
                </Text>
              )}
              {file.path !== name && (
                <Text
                  selectable
                  numberOfLines={2}
                  style={{ color: c.foregroundMuted, fontSize: 12 }}
                >
                  {file.path}
                </Text>
              )}
            </View>
            <Action
              theme={theme}
              label={"复制路径 " + name}
              onPress={() => {
                copyText(file.path).catch((e) => report(errorText(e)));
              }}
            >
              <Icon name="Copy" size={15} color={c.foregroundMuted} />
            </Action>
          </View>
        );
      })}
      {list.length > 4 && (
        <Action theme={theme} onPress={() => setAll(!all)}>
          {all ? "收起文件" : "查看全部 " + list.length + " 个文件"}
        </Action>
      )}
    </View>
  );
}

export function ProposalCard({
  card,
  theme,
}: {
  card: ActionCard;
  theme: Theme;
}) {
  const c = theme.colors,
    [expanded, setExpanded] = useState(false);
  const long = card.brief.length > 130 || card.brief.split("\n").length > 3;
  const status =
    card.phase === "replaced"
      ? "已替换"
      : card.phase === "dismissed"
        ? "已忽略"
        : card.phase;
  return (
    <View
      style={{
        gap: 5,
        backgroundColor: c.surface1,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <Text style={{ color: c.foregroundMuted, fontSize: 12 }}>
        {status ? "操作建议 · " + status : "操作建议"}
      </Text>
      <Text selectable style={{ color: c.foreground, fontWeight: "600" }}>
        {card.title}
      </Text>
      <Text
        selectable
        numberOfLines={long && !expanded ? 3 : undefined}
        style={{ color: c.foreground, fontSize: 14, lineHeight: 21 }}
      >
        {card.brief}
      </Text>
      {long && (
        <Action theme={theme} onPress={() => setExpanded(!expanded)}>
          {expanded ? "收起说明" : "展开说明"}
        </Action>
      )}
    </View>
  );
}
