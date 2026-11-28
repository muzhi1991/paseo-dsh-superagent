import { z } from "zod";

export const imageMediaType = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export type ImageMediaType = z.infer<typeof imageMediaType>;

export const previewEdge = 512;

export function fitsPreview(file: {
  bytes?: number;
  width?: number;
  height?: number;
}) {
  return (
    file.bytes !== undefined &&
    file.bytes <= 64 * 1024 &&
    file.width !== undefined &&
    file.width <= previewEdge &&
    file.height !== undefined &&
    file.height <= previewEdge
  );
}
