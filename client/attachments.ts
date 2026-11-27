import { imageMediaType, type ImageMediaType } from "../shared/image.ts";

export type AttachmentAction = "image" | "paste" | "file";
export type Attachment = {
  name: string;
  data: string;
  mediaType?: ImageMediaType;
};
export const byteLimit = 2 * 1024 * 1024;

export function checkCount(count: number, remaining: number) {
  if (count > remaining) throw Error("每条消息最多 12 个附件");
}

export function checkSize(size: number) {
  if (size > byteLimit) throw Error("每个附件最多 2 MiB");
}

export function attachment(
  name: string,
  data: string,
  type?: string,
): Attachment {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  checkSize((data.length * 3) / 4 - padding);
  const mime = imageMediaType.safeParse(type);
  return { name, data, ...(mime.success ? { mediaType: mime.data } : {}) };
}
