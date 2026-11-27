import { z } from "zod";

export const imageMediaType = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export type ImageMediaType = z.infer<typeof imageMediaType>;
