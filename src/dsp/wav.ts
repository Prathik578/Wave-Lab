/** Minimal WAV reader/writer: PCM 8/16/24/32-bit int and 32-bit float, mono/stereo/multi-channel. */

export interface WavData { data: Float64Array; fs: number; channels: number; frames: number }

export class WavError extends Error {}

export function parseWav(buf: ArrayBuffer): WavData {
  const v = new DataView(buf);
  if (buf.byteLength < 12) throw new WavError('File is too small to be a WAV file.');
  const riff = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (riff !== 'RIFF') throw new WavError('Not a RIFF/WAV file. Please upload a standard .wav file.');
  let pos = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataOffset = -1, dataLen = 0;
  while (pos + 8 <= buf.byteLength) {
    const id = String.fromCharCode(v.getUint8(pos), v.getUint8(pos + 1), v.getUint8(pos + 2), v.getUint8(pos + 3));
    const size = v.getUint32(pos + 4, true);
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        audioFormat: v.getUint16(pos + 8, true),
        channels: v.getUint16(pos + 10, true),
        sampleRate: v.getUint32(pos + 12, true),
        bits: v.getUint16(pos + 22, true),
      };
    } else if (id === 'data') {
      dataOffset = pos + 8;
      dataLen = Math.min(size, buf.byteLength - dataOffset);
    }
    pos += 8 + size + (size & 1);
  }
  if (!fmt) throw new WavError('The WAV file is missing its format chunk.');
  if (dataOffset < 0) throw new WavError('The WAV file has no audio data chunk.');
  const { audioFormat, channels, sampleRate, bits } = fmt;
  if (channels < 1 || channels > 8) throw new WavError(`Unsupported channel count: ${channels}.`);
  const bytesPer = bits >> 3;
  if (![8, 16, 24, 32].includes(bits) || (audioFormat !== 1 && audioFormat !== 3)) {
    throw new WavError(`Unsupported WAV encoding (format ${audioFormat}, ${bits}-bit). Use PCM 8/16/24/32-bit or IEEE float.`);
  }
  const isFloat = audioFormat === 3;
  const frames = Math.floor(dataLen / (bytesPer * channels));
  if (frames <= 0) throw new WavError('The WAV data chunk is empty.');
  const data = new Float64Array(frames);
  const step = bytesPer * channels;
  for (let i = 0; i < frames; i++) {
    const p = dataOffset + i * step;
    let s = 0;
    if (isFloat) s = v.getFloat32(p, true);
    else if (bits === 8) s = (v.getUint8(p) - 128) / 128;
    else if (bits === 16) s = v.getInt16(p, true) / 32768;
    else if (bits === 24) {
      const b0 = v.getUint8(p), b1 = v.getUint8(p + 1), b2 = v.getUint8(p + 2);
      let x = (b2 << 16) | (b1 << 8) | b0;
      if (x & 0x800000) x |= ~0xFFFFFF; // sign extend
      s = x / 8388608;
    } else if (bits === 32) s = v.getInt32(p, true) / 2147483648;
    data[i] = s;
  }
  return { data, fs: sampleRate, channels, frames };
}

/** Encode mono Float64 samples as 16-bit PCM WAV. Clipping applied via hard limiter warning upstream. */
export function encodeWav16(x: Float64Array, fs: number): Blob {
  const n = x.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE');
  wr(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wr(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Clamp a signal to [-1, 1] with a count of clipped samples. */
export function clampForExport(x: Float64Array): { out: Float64Array; clipped: number } {
  let clipped = 0;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v > 1) { out[i] = 1; clipped++; }
    else if (v < -1) { out[i] = -1; clipped++; }
    else out[i] = v;
  }
  return { out, clipped };
}
