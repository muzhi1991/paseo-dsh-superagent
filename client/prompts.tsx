import { useState } from "react";
import { TextInput, View } from "react-native";
import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { previewPrompts } from "../shared/supervision";
import {
  Chips,
  Copy,
  Fold,
  Link,
  RecordLine,
  Section,
  useSurface,
} from "./surface";
import { errorText } from "./common";
import { when } from "./records";
const sections: Record<string, string> = {
  communication: "沟通",
  scope: "范围",
  delivery: "交付",
};
type Config = Record<string, any>;
export function Prompts({ v, instance }: { v: any; instance: string }) {
  const {
    theme: { colors },
    confirm,
  } = useSurface();
  const [tab, setTab] = useState("edit"),
    [key, setKey] = useState("communication"),
    [role, setRole] = useState("orchestrator");
  const [draft, setDraft] = useState<{
    config: Config;
    revision: number;
  } | null>(null);
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
  const inputStyle = {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.foreground,
    padding: 9,
    fontSize: 13,
  };
  return (
    <Section name="提示词">
      <Copy quiet>{"团队提示词 · 版本 " + rev}</Copy>
      <Chips
        items={{ edit: "编辑", full: "完整提示词", history: "历史" }}
        active={tab}
        choose={setTab}
      />
      {tab === "edit" && (
        <>
          <Copy bold>团队约定</Copy>
          <Chips items={sections} active={key} choose={setKey} />
          <Fold label="内置段落">
            {v.parts.map((p: any) => (
              <Link key={p.key} onPress={() => setKey(p.key)}>
                {p.key}
              </Link>
            ))}
          </Fold>
          <Fold label="技能">
            {Object.keys(config.skills).map((k) => (
              <Link key={k} onPress={() => setKey("user/" + k)}>
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
            {!!error && <Copy>{error}</Copy>}
          </Fold>
          <Copy bold>{sections[key] || part?.key || skill}</Copy>
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
        </>
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
              <Copy>
                {role === "orchestrator"
                  ? preview.data.orchestrator
                  : role === "worker"
                    ? preview.data.worker
                    : preview.data.skills[role.slice(5)]}
              </Copy>
            </>
          )}
        </>
      )}
      {tab === "history" &&
        v.revisions.map((r: any) => (
          <RecordLine
            key={r.revision}
            title={"版本 " + r.revision}
            body={r.changed?.map((k: string) => sections[k] || k).join("、")}
            meta={when(r.savedAt)}
          />
        ))}
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
