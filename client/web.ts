import { Platform } from "react-native";
import {
  attachment,
  checkCount,
  checkSize,
  type AttachmentAction,
} from "./attachments";
import { pickNative } from "./native-attachments";
import { imageMediaType } from "../shared/image";

type FileLike = { size: number; type: string };
type NamedFile = FileLike & { name: string };
interface Input {
  type: string;
  accept: string;
  multiple: boolean;
  files: ArrayLike<NamedFile> | null;
  onchange: (() => void) | null;
  oncancel: (() => void) | null;
  click(): void;
}
declare const document: { createElement(tag: "input"): Input };
declare const navigator: {
  clipboard?: {
    read?(): Promise<
      { types: string[]; getType(type: string): Promise<FileLike> }[]
    >;
  };
};
declare const FileReader: {
  new (): {
    readAsDataURL(file: FileLike): void;
    result: string | null;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  };
};
async function readFile(file: FileLike, name: string) {
  checkSize(file.size);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
  return attachment(name, data, file.type);
}

export async function pickAttachments(
  action: AttachmentAction,
  remaining: number,
) {
  checkCount(1, remaining);
  if (Platform.OS !== "web") return pickNative(action, remaining);
  if (action === "paste") {
    if (!navigator.clipboard?.read)
      throw Error("当前浏览器无法读取剪贴板图片，请使用「添加图片」。");
    const items = await navigator.clipboard.read().catch(() => {
      throw Error("无法读取剪贴板，请允许粘贴后重试。");
    });
    for (const item of items) {
      const type = item.types.find((t) => imageMediaType.safeParse(t).success);
      if (type)
        return [
          await readFile(
            await item.getType(type),
            "clipboard." + type.split("/")[1],
          ),
        ];
    }
    throw Error("剪贴板里没有可粘贴的图片");
  }
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = remaining > 1;
  if (action === "image") input.accept = imageMediaType.options.join(",");
  const files = await new Promise<NamedFile[]>((resolve) => {
    input.onchange = () => resolve(Array.from(input.files || []));
    input.oncancel = () => resolve([]);
    input.click();
  });
  checkCount(files.length, remaining);
  return Promise.all(files.map((f) => readFile(f, f.name)));
}
