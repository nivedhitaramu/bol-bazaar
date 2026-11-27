import "server-only";

/**
 * Split a PCM WAV into ≤ `seconds` chunks (Sarvam REST STT accepts ≤ 30 s per request).
 * Returns null if the input isn't a plain PCM WAV (e.g. a WebM fallback) — caller sends it whole.
 */
export function splitWav(buf: Buffer, seconds = 25): Buffer[] | null {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let pos = 12;
  let fmt: { channels: number; rate: number; bits: number; format: number } | null = null;
  let dataStart = -1;
  let dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(pos + 8),
        channels: buf.readUInt16LE(pos + 10),
        rate: buf.readUInt32LE(pos + 12),
        bits: buf.readUInt16LE(pos + 22),
      };
    } else if (id === "data") {
      dataStart = pos + 8;
      dataLen = Math.min(size, buf.length - dataStart);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || fmt.format !== 1 || dataStart < 0) return null;

  const frame = fmt.channels * (fmt.bits / 8);
  const chunkBytes = Math.floor((seconds * fmt.rate * frame) / frame) * frame;
  if (dataLen <= chunkBytes) return [buf];

  const out: Buffer[] = [];
  for (let off = 0; off < dataLen; off += chunkBytes) {
    const len = Math.min(chunkBytes, dataLen - off);
    if (len < fmt.rate * frame * 0.4) break; // skip a < 0.4 s tail
    const h = Buffer.alloc(44);
    h.write("RIFF", 0, "ascii");
    h.writeUInt32LE(36 + len, 4);
    h.write("WAVE", 8, "ascii");
    h.write("fmt ", 12, "ascii");
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(fmt.channels, 22);
    h.writeUInt32LE(fmt.rate, 24);
    h.writeUInt32LE(fmt.rate * frame, 28);
    h.writeUInt16LE(frame, 32);
    h.writeUInt16LE(fmt.bits, 34);
    h.write("data", 36, "ascii");
    h.writeUInt32LE(len, 40);
    out.push(Buffer.concat([h, buf.subarray(dataStart + off, dataStart + off + len)]));
  }
  return out;
}
