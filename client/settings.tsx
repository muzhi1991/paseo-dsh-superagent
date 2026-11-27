import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import * as api from "../shared/api";
import { Action, errorText, Notice } from "./common";

export function ConnectionSettings({ theme, host }: PluginSurfaceProps) {
  const read = useRpc(api.connection),
    verify = useRpc(api.verify);
  const current = useQuery({
    queryKey: ["dsh-config", host.id],
    queryFn: () => read({}),
  });
  const [edited, address] = useState<string | null>(null),
    [token, setToken] = useState(""),
    [result, report] = useState(""),
    [busy, lock] = useState(false);
  const url = edited ?? current.data?.url ?? "";
  const field = {
    borderWidth: 1,
    borderColor: theme.colors.surface2,
    borderRadius: 8,
    color: theme.colors.foreground,
    padding: 10,
  };
  async function check(save: boolean) {
    lock(true);
    report("");
    try {
      const r = await verify({ url: url.trim(), token: token.trim(), save });
      report(
        [
          `地址可达　${r.reachable ? "✓" : "×"}`,
          `已安装 Superagent　${r.superagent ? "✓" : "×"}`,
          `可访问 Router　${r.router ? "✓" : "×"}`,
          r.detail + (r.saved ? " · 已保存" : ""),
        ].join("\n"),
      );
      if (r.saved) {
        await current.refetch();
        setToken("");
      }
    } catch (e) {
      report(errorText(e));
    } finally {
      lock(false);
    }
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{
        padding: 16,
        gap: 10,
        maxWidth: 720,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "600",
          color: theme.colors.foreground,
        }}
      >
        DSH 实例
      </Text>
      <Text style={{ color: theme.colors.foreground }}>
        填写这台 Paseo daemon 能访问的地址。远端 DSH 可通过 SSH 转发到本机端口。
      </Text>
      <TextInput
        accessibilityLabel="DSH 实例地址"
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        style={field}
        value={url}
        onChangeText={(v) => {
          address(v);
          report("");
        }}
        placeholder="http://127.0.0.1:3083"
      />
      <Text style={{ color: theme.colors.foreground }}>
        DSH Web 登录令牌（可选）
      </Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        只查看面板可留空。要连接需要登录的 Router，请在 DSH Web
        启动终端或当前实例的启动日志中找到登录链接，复制 token 参数的值。
      </Text>
      <TextInput
        accessibilityLabel="DSH Web 登录令牌"
        secureTextEntry
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        style={field}
        value={token}
        placeholder={
          current.data?.authenticated && url === current.data.url
            ? "已配置，留空沿用"
            : "登录链接中 token 的值"
        }
        onChangeText={(v) => {
          setToken(v);
          report("");
        }}
      />
      <View style={{ flexDirection: "row" }}>
        <Action
          theme={theme}
          disabled={busy || !url}
          onPress={() => check(false)}
        >
          测试连接
        </Action>
        <Action
          theme={theme}
          selected
          disabled={busy || !url}
          onPress={() => check(true)}
        >
          验证并保存
        </Action>
      </View>
      <Notice
        theme={theme}
        text={busy ? "正在验证…" : result || errorText(current.error || "")}
      />
    </ScrollView>
  );
}
