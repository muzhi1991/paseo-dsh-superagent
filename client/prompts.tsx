import { useState } from "react";
import { TextInput, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { previewPrompts, promptVersions } from "../shared/supervision";
import {
  Chips,
  Copy,
  Fold,
  Link,
  RecordLine,
  Section,
  useSurface,
  useSettingsDraft,
} from "./surface";
import { errorText } from "./common";
import { when } from "./records";
const sections: Record<string, string> = {
  communication: "沟通方式",
  scope: "工单范围",
  delivery: "交付要求",
};
const partNames: Record<string, string> = {
  "runtime/shared": "共享约定",
  "runtime/orchestrator": "主 Session 角色",
  "runtime/worker": "执行器角色",
  "runtime/subscriptions": "订阅",
  "runtime/replies": "回复与确认",
  "runtime/dispatch": "路由",
  "runtime/work": "执行",
  "runtime/admission": "主 Session 接单约束",
  "runtime/handoff/orchestrator": "工单交付与人工确认（主 Session）",
  "runtime/handoff/worker": "工单交付与人工确认（执行器）",
  "runtime/environment": "执行环境",
  "runtime/policy": "策略与启用的规则",
  "runtime/policy/none": "策略（没有启用的规则时）",
  "skill/feishu": "飞书技能",
  "skill/wecom": "企业微信技能",
  "skill/forgejo": "Forgejo 技能",
  "skill/github": "GitHub 技能",
};
function diffText(before: string, after: string) {
  const a = before.split("\n"),
    b = after.split("\n");
  let start = 0,
    end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return [
    ...(start ? ["… " + start + " 行相同"] : []),
    ...a.slice(start, a.length - end).map((x) => "− " + x),
    ...b.slice(start, b.length - end).map((x) => "+ " + x),
    ...(end ? ["… " + end + " 行相同"] : []),
  ].join("\n");
}
type Config = Record<string, any>;
export function Prompts({ v, instance }: { v: any; instance: string }) {
  const {
    theme: { colors },
    compact,
    confirm,
  } = useSurface();
  const [tab, setTab] = useState("edit"),
    [key, setKey] = useState("communication"),
    [role, setRole] = useState("orchestrator");
  const [draft, setDraft] = useSettingsDraft<{
    config: Config;
    revision: number;
  }>("prompts");
  const config = draft?.config ?? v.current.config,
    rev = draft?.revision ?? v.current.revision;
  const edit = (next: Config) => setDraft({ config: next, revision: rev });
  const read = useRpc(previewPrompts),
    preview = useQuery({
      queryKey: ["superagent-prompt-preview", instance, config],
      queryFn: () => read({ instance, config }),
      enabled: tab === "full",
      retry: false,
    });
  const part = v.parts.find((p: any) => p.key === key),
    team = Object.hasOwn(sections, key),
    skill = key.slice(5);
  const value = team
    ? config[key]
    : part
      ? (config.overrides?.[key]?.text ?? part.text)
      : (config.skills[skill] ?? "");
  const putText = (text: string) => {
    if (team) {
      edit({ ...config, [key]: text });
      return;
    }
    if (part) {
      edit({
        ...config,
        overrides: {
          ...config.overrides,
          [key]: { text, base: config.overrides?.[key]?.base ?? part.base },
        },
      });
      return;
    }
    edit({ ...config, skills: { ...config.skills, [skill]: text } });
  };
  const drop = () => {
    const field = part ? "overrides" : "skills",
      items = { ...config[field] };
    delete items[part ? key : skill];
    edit({ ...config, [field]: items });
    if (!part) setKey("communication");
  };
  const [newSkill, setNewSkill] = useState(""),
    [error, setError] = useState("");
  function add() {
    const name = newSkill.trim();
    if (
      !name ||
      !new RegExp(v.skillName).test(name) ||
      v.builtin.includes(name) ||
      Object.hasOwn(config.skills, name)
    ) {
      setError("请使用有效且未被占用的技能名称。");
      return;
    }
    edit({ ...config, skills: { ...config.skills, [name]: "" } });
    setKey("user/" + name);
    setNewSkill("");
    setError("");
  }
  const versions = useRpc(promptVersions),
    [older, setOlder] = useState<any[]>([]),
    [offset, setOffset] = useState<number | null | undefined>(),
    [loading, setLoading] = useState(false);
  const [compare, setCompare] = useState("full");
  const shownName = sections[key] || partNames[key] || part?.key || skill;
  const select = (k: string) => {
    setKey(k);
    setTab("edit");
  };
  async function loadVersion(n: number) {
    setLoading(true);
    setError("");
    try {
      const h = await versions({ instance, revision: n });
      edit(h.current.config);
      select("communication");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function more() {
    setLoading(true);
    setError("");
    try {
      const h = await versions({ instance, offset: offset ?? v.next_offset });
      setOlder((prev) => [...prev, ...h.revisions]);
      setOffset(h.next_offset);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  const inputStyle = {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.foreground,
    padding: 9,
    fontSize: 13,
  };
  const nav = (
    <View style={{ gap: 3 }}>
      <Copy bold>团队约定</Copy>
      {Object.entries(sections).map(([id, name]) => (
        <Link key={id} onPress={() => select(id)}>
          {(id === key ? "▸ " : "") + name}
        </Link>
      ))}
      <Copy bold>内置段落</Copy>
      {v.parts.map((p: any) => (
        <Link key={p.key} onPress={() => select(p.key)}>
          {(key === p.key ? "▸ " : "") + (partNames[p.key] || p.key)}
        </Link>
      ))}
      <Copy bold>技能</Copy>
      {Object.keys(config.skills).map((k) => (
        <Link key={k} onPress={() => select("user/" + k)}>
          {k}
        </Link>
      ))}
      <TextInput
        accessibilityLabel="新技能名称"
        placeholder="新技能名称"
        placeholderTextColor={colors.foregroundMuted}
        value={newSkill}
        onChangeText={setNewSkill}
        style={inputStyle}
      />
      <Link onPress={add}>添加技能</Link>
    </View>
  );
  return (
    <Section name="提示词">
      <Copy quiet>{"团队提示词 · 版本 " + rev}</Copy>
      <Chips
        items={{ edit: "编辑", full: "完整提示词", history: "历史" }}
        active={tab}
        choose={setTab}
      />
      {tab === "edit" && (
        <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
          {compact ? (
            <Fold key={key} label={"选择段落 · " + shownName}>
              {nav}
            </Fold>
          ) : (
            <View style={{ width: 155 }}>{nav}</View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Copy bold>{shownName}</Copy>
            <Copy quiet>
              {part?.roles?.length === 1
                ? part.roles[0] === "worker"
                  ? "执行器读取"
                  : "主 Session 读取"
                : !team && !part
                  ? "按需载入此技能"
                  : "主 Session 和执行器读取"}
            </Copy>
            {!!part?.placeholders?.length && (
              <Copy quiet>{"模板占位符：" + part.placeholders.join("、")}</Copy>
            )}
            {team && value !== v.defaults[key] && (
              <Link onPress={() => putText(v.defaults[key])}>恢复默认段落</Link>
            )}
            <TextInput
              accessibilityLabel="提示词正文"
              value={value}
              onChangeText={putText}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
              style={{ ...inputStyle, minHeight: 175, maxHeight: 330 }}
            />
            {part && config.overrides?.[key] && (
              <Link onPress={drop}>恢复内置文本</Link>
            )}
            {!part && !team && <Link onPress={drop}>移除技能</Link>}
          </View>
        </View>
      )}
      {tab === "full" && (
        <>
          {preview.error ? (
            <Copy>{errorText(preview.error)}</Copy>
          ) : !preview.data ? (
            <Copy quiet>正在生成预览…</Copy>
          ) : (
            <>
              <Chips
                items={{
                  orchestrator: "主 Session",
                  worker: "执行器",
                  ...Object.fromEntries(
                    Object.keys(preview.data.skills).map((k) => [
                      "skill/" + k,
                      k,
                    ]),
                  ),
                }}
                active={role}
                choose={setRole}
              />
              <Chips
                items={{
                  full: "全文",
                  saved: "与已保存版本比较",
                  defaults: "与默认版本比较",
                }}
                active={compare}
                choose={setCompare}
              />
              {(role === "orchestrator" || role === "worker"
                ? preview.data.parts?.[role] || [
                    {
                      name: role,
                      text: preview.data[role],
                      kind: "generated",
                      key: undefined,
                      heading: undefined,
                    },
                  ]
                : [
                    {
                      name: role,
                      text: preview.data.skills[role.slice(5)] || "",
                      kind: "skill",
                      key: role,
                      heading: undefined,
                    },
                  ]
              ).map((p) => {
                const source = p.key || p.name,
                  label = sections[source] || partNames[source] || source,
                  entry = v.parts.find((x: any) => x.key === source),
                  baseline =
                    compare === "saved" ? v.current.config : v.defaults;
                const base =
                  p.kind === "generated"
                    ? undefined
                    : entry
                      ? (baseline.overrides?.[source]?.text ?? entry.text)
                      : p.kind === "skill"
                        ? baseline.skills[source.slice(5)] || ""
                        : p.heading && baseline[p.name]
                          ? p.heading + "\n" + baseline[p.name]
                          : baseline[p.name] || "";
                return (
                  <View key={p.name} style={{ gap: 3 }}>
                    <Copy bold>{label}</Copy>
                    <Copy>
                      {compare === "full" || base === undefined
                        ? p.text
                        : base === p.text
                          ? "内容相同"
                          : diffText(base, p.text)}
                    </Copy>
                    {(entry || sections[p.name] || p.kind === "skill") && (
                      <Link
                        onPress={() =>
                          select(
                            entry
                              ? entry.key
                              : p.kind === "skill"
                                ? "user/" + p.name.slice(5)
                                : p.name,
                          )
                        }
                      >
                        编辑来源
                      </Link>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </>
      )}
      {tab === "history" && (
        <>
          <Copy quiet>载入历史版本会替换当前草稿，保存后生效。</Copy>
          {[...v.revisions, ...older].map((r: any) => (
            <View key={r.revision}>
              <RecordLine
                title={"版本 " + r.revision}
                body={r.changed
                  ?.map((k: string) => sections[k] || partNames[k] || k)
                  .join("、")}
                meta={when(r.savedAt)}
              />
              {!loading && (
                <Link onPress={() => void loadVersion(r.revision)}>
                  载入此版本
                </Link>
              )}
            </View>
          ))}
          {!loading &&
            (offset === undefined ? v.next_offset : offset) != null && (
              <Link onPress={() => void more()}>更早的版本</Link>
            )}
          <Link
            onPress={() => {
              edit(v.defaults);
              select("communication");
            }}
          >
            载入默认配置
          </Link>
          <Copy bold>Session 最近使用的版本</Copy>
          {v.sessions?.map((x: any) => (
            <Copy key={x.sessionId} quiet>
              {x.sessionId + " · 版本 " + x.revision}
            </Copy>
          ))}
        </>
      )}
      {!!error && <Copy>{error}</Copy>}
      {draft && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Link
            onPress={() =>
              confirm(
                "保存团队提示词？",
                { kind: "prompts", revision: rev, value: config },
                () => setDraft(null),
              )
            }
          >
            保存修改
          </Link>
          <Link
            onPress={() => {
              setDraft(null);
              setKey("communication");
            }}
          >
            放弃更改
          </Link>
        </View>
      )}
    </Section>
  );
}
