import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { Copy, useSurface } from "./surface";

export function SourceLink({ url, label }: { url?: string; label: string }) {
  const {
    theme: { colors },
  } = useSurface();
  const [failedUrl, setFailedUrl] = useState("");
  if (!url || !/^https?:\/\/[^/\s@?#\\]+(?:[/?#][^\s\\]*)?$/i.test(url))
    return null;
  return (
    <View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onPress={async () => {
          try {
            await openExternalUrl(url);
            setFailedUrl("");
          } catch {
            setFailedUrl(url);
          }
        }}
        style={{ alignSelf: "flex-start", paddingVertical: 6 }}
      >
        <Text style={{ color: colors.accent, fontSize: 13 }}>{label} ↗</Text>
      </Pressable>
      {failedUrl === url && <Copy quiet>无法打开链接，可复制地址：{url}</Copy>}
    </View>
  );
}

export function GitHubRepositoryLink({ repository }: { repository?: string }) {
  if (
    typeof repository !== "string" ||
    !/^[a-z\d-]+\/[a-z\d._-]+$/i.test(repository) ||
    ["..", "."].includes(repository.split("/")[1])
  )
    return null;
  return (
    <SourceLink url={"https://github.com/" + repository} label={repository} />
  );
}
