// React Native Image accepts a data URI. Encode only after the binary RPC has arrived.
export function imageUri(bytes: Uint8Array) {
  const mime = { 0x89: "png", 0xff: "jpeg", 0x47: "gif", 0x52: "webp" }[
    bytes[0]
  ];
  if (!mime) throw Error("图片格式无法预览");
  const prefix = "data:image/" + mime + ";base64,";
  const native = bytes as Uint8Array & { toBase64?: () => string };
  if (native.toBase64) return prefix + native.toBase64();

  // Older Hermes versions have no typed-array Base64 encoder.
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 12_288) {
    let chunk = "";
    const end = Math.min(offset + 12_288, bytes.length);
    for (let i = offset; i < end; i += 3) {
      const a = bytes[i],
        b = bytes[i + 1] ?? 0,
        c = bytes[i + 2] ?? 0;
      chunk +=
        alphabet[a >> 2] +
        alphabet[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < end ? alphabet[((b & 15) << 2) | (c >> 6)] : "=") +
        (i + 2 < end ? alphabet[c & 63] : "=");
    }
    chunks.push(chunk);
  }
  return prefix + chunks.join("");
}
