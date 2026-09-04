function textAt(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function hasExpectedMediaSignature(mimeType: string, bytes: Uint8Array) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes[0] === 0x89 && textAt(bytes, 1, 3) === "PNG";
  if (mimeType === "image/gif") {
    const signature = textAt(bytes, 0, 6);
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (mimeType === "image/webp") return textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WEBP";
  if (mimeType === "image/avif") return textAt(bytes, 4, 4) === "ftyp" && /avif|avis/.test(textAt(bytes, 8, 56));
  if (mimeType === "video/webm") {
    return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return textAt(bytes, 4, 4) === "ftyp";
  }
  return false;
}

export async function fileHasExpectedMediaSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return hasExpectedMediaSignature(file.type, bytes);
}
