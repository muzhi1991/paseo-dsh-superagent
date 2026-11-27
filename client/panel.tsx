import { useState } from "react";
import { Text, View, ScrollView, Pressable } from "react-native";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import * as api from "../shared/api";
import { Action, errorText, Notice } from "./common";
import { Router } from "./router";

const tabs = ["概览", "来源", "触发", "评估", "执行"] as const;
export function Panel(props: PluginScreenProps) {
  const { theme, host } = props,
    [tab, setTab] = useState<(typeof tabs)[number]>("概览"),
    [chat, setChat] = useState(false),
    [id, detail] = useState(""),
    [ended, setEnded] = useState(false);
  const read = useRpc(api.panel),
    page = id ? "工单" : tab;
  const data = useQuery({
    queryKey: ["dsh-panel", host.id, page, id, ended],
    queryFn: () => read({ page, id, ended }),
    enabled: !chat,
    refetchInterval: 10000,
    retry: false,
  });
  if (chat)
    return (
      <Router
        {...props}
        expected={data.data?.instance}
        back={() => setChat(false)}
      />
    );
  const color = theme.colors.foreground;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 10,
        }}
      >
        {id ? (
          <Action theme={theme} onPress={() => detail("")}>
            ‹ 返回工单列表
          </Action>
        ) : (
          <Text style={{ fontSize: 16, fontWeight: "600", color }}>
            DSH Superagent
          </Text>
        )}
        <Action theme={theme} onPress={() => setChat(true)}>
          主 Session ↗
        </Action>
      </View>
      {!id && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            paddingHorizontal: 5,
          }}
        >
          {tabs.map((t) => (
            <Action
              key={t}
              theme={theme}
              selected={t === tab}
              onPress={() => setTab(t)}
            >
              {t}
            </Action>
          ))}
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
      >
        {tab === "执行" && !id && (
          <View style={{ flexDirection: "row" }}>
            {["进行中", "已结束"].map((v, i) => (
              <Action
                key={v}
                theme={theme}
                selected={ended === !!i}
                onPress={() => setEnded(!!i)}
              >
                {v}
              </Action>
            ))}
          </View>
        )}
        <Notice
          theme={theme}
          text={
            data.error
              ? errorText(data.error)
              : data.isPending
                ? "正在读取…"
                : !data.data?.rows.length
                  ? "没有记录"
                  : ""
          }
        />
        {data.data?.rows.map((r) => (
          <Pressable
            key={r.id}
            disabled={!r.ticket}
            onPress={() => detail(r.id)}
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderColor: theme.colors.surface2,
            }}
          >
            <Text selectable={!r.ticket} style={{ color, fontWeight: "500" }}>
              {r.title}
              {r.ticket ? "　›" : ""}
            </Text>
            <Text
              selectable={!r.ticket}
              style={{
                color: theme.colors.foregroundMuted,
                fontSize: 12,
                marginTop: 2,
              }}
            >
              {r.detail}
            </Text>
          </Pressable>
        ))}
        {id && data.data?.agent && props.navigation && (
          <Action
            theme={theme}
            onPress={() =>
              props.navigation?.openAgent({
                agentId: data.data!.agent!,
                serverId: host.id,
              })
            }
          >
            打开执行 Agent ↗
          </Action>
        )}
      </ScrollView>
    </View>
  );
}
