import { imageMediaType, type ImageMediaType } from "../shared/image";
import { Platform } from "react-native";
type FileLike = { name: string; size: number; type: string };
interface Input {
  type: string;
  multiple: boolean;
  files: ArrayLike<FileLike> | null;
  onchange: (() => void) | null;
  oncancel: (() => void) | null;
  click(): void;
}
declare const document: { createElement(tag: "input"): Input };
declare const FileReader: {
  new (): {
    readAsDataURL(file: FileLike): void;
    result: string | null;
    onload: (() => void) | null;
    onerror: (() => void) | null;
  };
};
export async function pickFiles(): Promise<
  { name: string; data: string; mediaType?: ImageMediaType }[]
> {
  if (Platform.OS !== "web")
    throw Error("当前 Paseo 原生插件 SDK 尚未提供设备文件选择器。");
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  const files = await new Promise<FileLike[]>((resolve) => {
    input.onchange = () => resolve(Array.from(input.files || []));
    input.oncancel = () => resolve([]);
    input.click();
  });
  if (files.length > 12 || files.some((f) => f.size > 2 * 1024 * 1024))
    throw Error("每次最多 12 个附件，每个最多 2 MiB");
  return Promise.all(
    files.map(async (f) => {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] || "");
        r.onerror = () => reject(Error("读取文件失败"));
        r.readAsDataURL(f);
      });
      const mime = imageMediaType.safeParse(f.type);
      return {
        name: f.name,
        data,
        ...(mime.success ? { mediaType: mime.data } : {}),
      };
    }),
  );
}
