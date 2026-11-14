/**
 * Pure-Frontend Browser Video & Apple Live Photo Pair Exporter
 * 1. Standard Video (.MP4 / .WebM): WebCodecs H.264 AVC -> ISO BMFF `.mp4` (with MediaRecorder fallback).
 * 2. Live Photo Pair (.JPG + .MOV): Cover JPEG with Apple iOS MakerNote ContentIdentifier (0x0011)
 *    + QuickTime `.MOV` with `mebx` still-image-time (-1) & `com.apple.quicktime.content.identifier`.
 */

export type VideoExportDirection = 'tree-to-qr' | 'qr-to-tree';
export type ExportOutputMode = 'mp4' | 'live-pair';

export interface PreparedMp4Bundle {
  kind: 'mp4';
  direction: VideoExportDirection;
  filename: string;
  mimeType: string;
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

export interface PreparedLivePairBundle {
  kind: 'live-pair';
  direction: VideoExportDirection;
  stem: string;
  uuid: string;
  jpgBlob: Blob;
  jpgFilename: string;
  movBlob: Blob;
  movFilename: string;
  zipBlob: Blob;
  zipFilename: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
}

export type PreparedExportBundle = PreparedMp4Bundle | PreparedLivePairBundle;

const textEncoder = new TextEncoder();

const H264_CODEC_CANDIDATES = [
  'avc1.64001f',
  'avc1.4d001f',
  'avc1.42001f',
  'avc1.42E01E',
];

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < arrays.length; i++) {
    total += arrays[i].length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < arrays.length; i++) {
    out.set(arrays[i], offset);
    offset += arrays[i].length;
  }
  return out;
}

function asciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function u16BE(v: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, false);
  return b;
}

function u32BE(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, false);
  return b;
}

function makeBox(type: string, ...children: Uint8Array[]): Uint8Array {
  const payload = concatBytes(...children);
  return concatBytes(u32BE(8 + payload.length), asciiBytes(type), payload);
}

function makeFullBox(
  type: string,
  version: number,
  flags: number,
  ...children: Uint8Array[]
): Uint8Array {
  const vf = new Uint8Array([
    version & 0xff,
    (flags >> 16) & 0xff,
    (flags >> 8) & 0xff,
    flags & 0xff,
  ]);
  return makeBox(type, vf, ...children);
}

function makeTiffEntry(tag: number, type: number, count: number, valueOrOffset: number): Uint8Array {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  v.setUint16(0, tag, false);
  v.setUint16(2, type, false);
  v.setUint32(4, count, false);
  v.setUint32(8, valueOrOffset >>> 0, false);
  return b;
}

function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toUpperCase();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Injects an Apple-compatible EXIF APP1 block right after JPEG SOI (0xFFD8):
 * - IFD0: Make="Apple", Model="iPhone", Orientation=1, ExifIFDPointer
 * - ExifIFD: ExifVersion="0232", MakerNote ("Apple iOS\0\0\x01MM" + Tag 0x0011 ContentIdentifier = UUID)
 */
function injectAppleLivePhotoExif(jpegBytes: Uint8Array, uuid: string): Uint8Array {
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    throw new Error('无效的封面 JPEG 数据');
  }

  const view = new DataView(jpegBytes.buffer, jpegBytes.byteOffset, jpegBytes.byteLength);
  const restChunks: Uint8Array[] = [];
  let offset = 2;

  while (offset + 4 <= jpegBytes.length) {
    if (jpegBytes[offset] !== 0xff) {
      restChunks.push(jpegBytes.subarray(offset));
      break;
    }
    const marker = jpegBytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      restChunks.push(jpegBytes.subarray(offset));
      break;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      restChunks.push(jpegBytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const segLen = view.getUint16(offset + 2, false);
    const segEnd = offset + 2 + segLen;
    if (marker !== 0xe1) {
      restChunks.push(jpegBytes.subarray(offset, segEnd));
    }
    offset = segEnd;
  }

  const uuidBytes = asciiBytes(`${uuid}\0`);
  const makerHeader = new Uint8Array([
    0x41, 0x70, 0x70, 0x6c, 0x65, 0x20, 0x69, 0x4f, 0x53, 0x00,
    0x00, 0x01,
    0x4d, 0x4d,
  ]);
  const makerValueOffset = 14 + 2 + 12 + 4;
  const makerIfdEntry = makeTiffEntry(0x0011, 2, uuidBytes.length, makerValueOffset);
  const makerNote = concatBytes(
    makerHeader,
    u16BE(1),
    makerIfdEntry,
    new Uint8Array(4),
    uuidBytes
  );

  const tiffHeader = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
  const makeBytes = asciiBytes('Apple\0');
  const modelBytes = asciiBytes('iPhone\0\0');

  const makeOffset = 8 + 54;
  const modelOffset = makeOffset + makeBytes.length;
  const exifIfdOffset = modelOffset + modelBytes.length;

  const ifd0 = concatBytes(
    u16BE(4),
    makeTiffEntry(0x010f, 2, makeBytes.length, makeOffset),
    makeTiffEntry(0x0110, 2, 7, modelOffset),
    makeTiffEntry(0x0112, 3, 1, 0x00010000),
    makeTiffEntry(0x8769, 4, 1, exifIfdOffset),
    new Uint8Array(4)
  );

  const makerNoteOffset = exifIfdOffset + 30;
  const exifIfd = concatBytes(
    u16BE(2),
    makeTiffEntry(0x9000, 7, 4, 0x30323332),
    makeTiffEntry(0x927c, 7, makerNote.length, makerNoteOffset),
    new Uint8Array(4)
  );

  const app1Payload = concatBytes(
    asciiBytes('Exif\0\0'),
    tiffHeader,
    ifd0,
    makeBytes,
    modelBytes,
    exifIfd,
    makerNote
  );
  const app1Header = concatBytes(new Uint8Array([0xff, 0xe1]), u16BE(app1Payload.length + 2));

  return concatBytes(jpegBytes.subarray(0, 2), app1Header, app1Payload, ...restChunks);
}

function convertAnnexBToAvcc(sample: Uint8Array): {
  avccData: Uint8Array;
  sps?: Uint8Array;
  pps?: Uint8Array;
} {
  const nalus: Uint8Array[] = [];
  let sps: Uint8Array | undefined;
  let pps: Uint8Array | undefined;

  const findStartCode = (pos: number): number => {
    for (let k = pos; k + 3 <= sample.length; k++) {
      if (sample[k] === 0 && sample[k + 1] === 0) {
        if (sample[k + 2] === 1) return k;
        if (k + 4 <= sample.length && sample[k + 2] === 0 && sample[k + 3] === 1) return k;
      }
    }
    return -1;
  };

  let sc = findStartCode(0);
  while (sc >= 0) {
    const startLen = sample[sc + 2] === 1 ? 3 : 4;
    const naluStart = sc + startLen;
    const nextSc = findStartCode(naluStart);
    const naluEnd = nextSc >= 0 ? nextSc : sample.length;
    const nalu = sample.subarray(naluStart, naluEnd);
    if (nalu.length > 0) {
      const naluType = nalu[0] & 0x1f;
      if (naluType === 7 && !sps) sps = nalu;
      else if (naluType === 8 && !pps) pps = nalu;
      else nalus.push(nalu);
    }
    sc = nextSc;
  }

  if (nalus.length === 0) {
    return { avccData: sample, sps, pps };
  }

  const prefixed = nalus.map((n) => concatBytes(u32BE(n.length), n));
  return { avccData: concatBytes(...prefixed), sps, pps };
}

function buildAvcCDecoderConfig(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  return concatBytes(
    new Uint8Array([
      1,
      sps[1] ?? 0x42,
      sps[2] ?? 0x00,
      sps[3] ?? 0x1f,
      0xff,
      0xe1,
    ]),
    u16BE(sps.length),
    sps,
    new Uint8Array([1]),
    u16BE(pps.length),
    pps
  );
}

function muxStandardMp4(input: {
  width: number;
  height: number;
  fps: number;
  avcC: Uint8Array;
  samples: Array<{ data: Uint8Array; isKey: boolean }>;
}): Uint8Array {
  const { width, height, fps, avcC, samples } = input;
  const frameCount = samples.length;
  const safeFps = Math.max(1, Math.round(fps));
  const movieTimescale = 1000;
  const movieDuration = Math.max(1, Math.round((frameCount / safeFps) * movieTimescale));
  const videoTimescale = safeFps * 1000;
  const videoSampleDuration = 1000;
  const videoTotalDuration = frameCount * videoSampleDuration;

  const ftyp = makeBox(
    'ftyp',
    asciiBytes('isom'),
    u32BE(512),
    asciiBytes('isom'),
    asciiBytes('iso2'),
    asciiBytes('avc1'),
    asciiBytes('mp41')
  );

  const mdatHeaderSize = 8;
  let runningOffset = ftyp.length + mdatHeaderSize;
  const videoOffsets: number[] = [];
  const videoSizes: number[] = [];
  const keyFrameIndices: number[] = [];

  for (let i = 0; i < frameCount; i++) {
    const s = samples[i];
    videoOffsets.push(runningOffset);
    videoSizes.push(s.data.length);
    if (s.isKey) {
      keyFrameIndices.push(i + 1);
    }
    runningOffset += s.data.length;
  }

  const mdat = makeBox('mdat', ...samples.map((s) => s.data));

  const mvhdPayload = new Uint8Array(96);
  const mvhdView = new DataView(mvhdPayload.buffer);
  mvhdView.setUint32(8, movieTimescale, false);
  mvhdView.setUint32(12, movieDuration, false);
  mvhdView.setUint32(16, 0x00010000, false);
  mvhdView.setUint16(20, 0x0100, false);
  mvhdView.setUint32(32, 0x00010000, false);
  mvhdView.setUint32(48, 0x00010000, false);
  mvhdView.setUint32(64, 0x40000000, false);
  mvhdView.setUint32(92, 2, false);
  const mvhd = makeFullBox('mvhd', 0, 0, mvhdPayload);

  const tkhdPayload = new Uint8Array(80);
  const tkhdView = new DataView(tkhdPayload.buffer);
  tkhdView.setUint32(8, 1, false);
  tkhdView.setUint32(16, movieDuration, false);
  tkhdView.setUint32(36, 0x00010000, false);
  tkhdView.setUint32(52, 0x00010000, false);
  tkhdView.setUint32(68, 0x40000000, false);
  tkhdView.setUint32(72, (width << 16) >>> 0, false);
  tkhdView.setUint32(76, (height << 16) >>> 0, false);
  const tkhd = makeFullBox('tkhd', 0, 0x000003, tkhdPayload);

  const mdhdPayload = new Uint8Array(20);
  const mdhdView = new DataView(mdhdPayload.buffer);
  mdhdView.setUint32(8, videoTimescale, false);
  mdhdView.setUint32(12, videoTotalDuration, false);
  mdhdView.setUint16(16, 0x55c4, false);
  const mdhd = makeFullBox('mdhd', 0, 0, mdhdPayload);

  const hdlrPayload = new Uint8Array(20);
  hdlrPayload.set(asciiBytes('vide'), 4);
  const hdlr = makeFullBox('hdlr', 0, 0, hdlrPayload, asciiBytes('VideoHandler\0'));

  const vmhd = makeFullBox('vmhd', 0, 1, new Uint8Array(8));
  const urlBox = makeFullBox('url ', 0, 1);
  const dref = makeFullBox('dref', 0, 0, u32BE(1), urlBox);
  const dinf = makeBox('dinf', dref);

  const avc1Header = new Uint8Array(78);
  const avc1View = new DataView(avc1Header.buffer);
  avc1View.setUint16(6, 1, false);
  avc1View.setUint16(24, width, false);
  avc1View.setUint16(26, height, false);
  avc1View.setUint32(28, 0x00480000, false);
  avc1View.setUint32(32, 0x00480000, false);
  avc1View.setUint16(40, 1, false);
  avc1View.setUint16(74, 0x0018, false);
  avc1View.setInt16(76, -1, false);

  const avcCBox = makeBox('avcC', avcC);
  const paspBox = makeBox('pasp', u32BE(1), u32BE(1));
  const avc1Entry = makeBox('avc1', avc1Header, avcCBox, paspBox);
  const stsd = makeFullBox('stsd', 0, 0, u32BE(1), avc1Entry);

  const stts = makeFullBox('stts', 0, 0, u32BE(1), u32BE(frameCount), u32BE(videoSampleDuration));
  const stssEntries = keyFrameIndices.length > 0 ? keyFrameIndices : [1];
  const stss = makeFullBox(
    'stss',
    0,
    0,
    u32BE(stssEntries.length),
    ...stssEntries.map((idx) => u32BE(idx))
  );
  const stsc = makeFullBox('stsc', 0, 0, u32BE(1), u32BE(1), u32BE(1), u32BE(1));
  const stsz = makeFullBox(
    'stsz',
    0,
    0,
    u32BE(0),
    u32BE(frameCount),
    ...videoSizes.map((sz) => u32BE(sz))
  );
  const stco = makeFullBox(
    'stco',
    0,
    0,
    u32BE(frameCount),
    ...videoOffsets.map((off) => u32BE(off))
  );

  const stbl = makeBox('stbl', stsd, stts, stss, stsc, stsz, stco);
  const minf = makeBox('minf', vmhd, dinf, stbl);
  const mdia = makeBox('mdia', mdhd, hdlr, minf);
  const trak = makeBox('trak', tkhd, mdia);
  const moov = makeBox('moov', mvhd, trak);

  return concatBytes(ftyp, mdat, moov);
}

/**
 * Pure TypeScript Apple-native QuickTime (.MOV) Live Photo muxer:
 * - ftyp ('qt  ')
 * - mdat (H.264 AVCC frames + 9-byte mebx still-image-time sample)
 * - moov (mvhd + H.264 vide trak + Apple mebx metadata trak + QuickTime moov/meta ContentIdentifier)
 */
function muxQuickTimeLivePhotoMov(input: {
  width: number;
  height: number;
  fps: number;
  avcC: Uint8Array;
  samples: Array<{ data: Uint8Array; isKey: boolean }>;
  uuid: string;
}): Uint8Array {
  const { width, height, fps, avcC, samples, uuid } = input;
  const frameCount = samples.length;
  const safeFps = Math.max(1, Math.round(fps));
  const movieTimescale = 1000;
  const movieDuration = Math.max(1, Math.round((frameCount / safeFps) * movieTimescale));
  const videoTimescale = safeFps * 1000;
  const videoSampleDuration = 1000;
  const videoTotalDuration = frameCount * videoSampleDuration;

  const ftyp = makeBox('ftyp', asciiBytes('qt  '), u32BE(512), asciiBytes('qt  '));

  const stillSamplePayload = new Uint8Array(9);
  const stillSampleView = new DataView(stillSamplePayload.buffer);
  stillSampleView.setUint32(0, 9, false);
  stillSampleView.setUint32(4, 1, false);
  stillSampleView.setInt8(8, -1);

  const mdatHeaderSize = 8;
  let runningOffset = ftyp.length + mdatHeaderSize;
  const videoOffsets: number[] = [];
  const videoSizes: number[] = [];
  const keyFrameIndices: number[] = [];

  for (let i = 0; i < frameCount; i++) {
    const s = samples[i];
    videoOffsets.push(runningOffset);
    videoSizes.push(s.data.length);
    if (s.isKey) {
      keyFrameIndices.push(i + 1);
    }
    runningOffset += s.data.length;
  }

  const stillSampleOffset = runningOffset;
  const mdatChunks: Uint8Array[] = samples.map((s) => s.data);
  mdatChunks.push(stillSamplePayload);
  const mdat = makeBox('mdat', ...mdatChunks);

  const mvhdPayload = new Uint8Array(96);
  const mvhdView = new DataView(mvhdPayload.buffer);
  mvhdView.setUint32(8, movieTimescale, false);
  mvhdView.setUint32(12, movieDuration, false);
  mvhdView.setUint32(16, 0x00010000, false);
  mvhdView.setUint16(20, 0x0100, false);
  mvhdView.setUint32(32, 0x00010000, false);
  mvhdView.setUint32(48, 0x00010000, false);
  mvhdView.setUint32(64, 0x40000000, false);
  mvhdView.setUint32(92, 3, false);
  const mvhd = makeFullBox('mvhd', 0, 0, mvhdPayload);

  // Track 1: H.264 Video
  const tkhd1Payload = new Uint8Array(80);
  const tkhd1View = new DataView(tkhd1Payload.buffer);
  tkhd1View.setUint32(8, 1, false);
  tkhd1View.setUint32(16, movieDuration, false);
  tkhd1View.setUint32(36, 0x00010000, false);
  tkhd1View.setUint32(52, 0x00010000, false);
  tkhd1View.setUint32(68, 0x40000000, false);
  tkhd1View.setUint32(72, (width << 16) >>> 0, false);
  tkhd1View.setUint32(76, (height << 16) >>> 0, false);
  const tkhd1 = makeFullBox('tkhd', 0, 0x00000f, tkhd1Payload);

  const mdhd1Payload = new Uint8Array(20);
  const mdhd1View = new DataView(mdhd1Payload.buffer);
  mdhd1View.setUint32(8, videoTimescale, false);
  mdhd1View.setUint32(12, videoTotalDuration, false);
  mdhd1View.setUint16(16, 0x55c4, false);
  const mdhd1 = makeFullBox('mdhd', 0, 0, mdhd1Payload);

  const hdlr1Payload = new Uint8Array(20);
  hdlr1Payload.set(asciiBytes('mhlr'), 0);
  hdlr1Payload.set(asciiBytes('vide'), 4);
  hdlr1Payload.set(asciiBytes('appl'), 8);
  const hdlr1 = makeFullBox('hdlr', 0, 0, hdlr1Payload, asciiBytes('Core Media Video\0'));

  const vmhd = makeFullBox('vmhd', 0, 1, new Uint8Array(8));
  const urlBox1 = makeFullBox('url ', 0, 1);
  const dref1 = makeFullBox('dref', 0, 0, u32BE(1), urlBox1);
  const dinf1 = makeBox('dinf', dref1);

  const avc1Header = new Uint8Array(78);
  const avc1View = new DataView(avc1Header.buffer);
  avc1View.setUint16(6, 1, false);
  avc1View.setUint16(24, width, false);
  avc1View.setUint16(26, height, false);
  avc1View.setUint32(28, 0x00480000, false);
  avc1View.setUint32(32, 0x00480000, false);
  avc1View.setUint16(40, 1, false);
  const compressorName = asciiBytes('H.264');
  avc1Header[42] = compressorName.length;
  avc1Header.set(compressorName, 43);
  avc1View.setUint16(74, 0x0018, false);
  avc1View.setInt16(76, -1, false);

  const avcCBox = makeBox('avcC', avcC);
  const colrBox = makeBox('colr', asciiBytes('nclc'), u16BE(1), u16BE(1), u16BE(1));
  const paspBox = makeBox('pasp', u32BE(1), u32BE(1));
  const avc1Entry = makeBox('avc1', avc1Header, avcCBox, colrBox, paspBox);
  const stsd1 = makeFullBox('stsd', 0, 0, u32BE(1), avc1Entry);

  const stts1 = makeFullBox('stts', 0, 0, u32BE(1), u32BE(frameCount), u32BE(videoSampleDuration));
  const stssEntries = keyFrameIndices.length > 0 ? keyFrameIndices : [1];
  const stss1 = makeFullBox(
    'stss',
    0,
    0,
    u32BE(stssEntries.length),
    ...stssEntries.map((idx) => u32BE(idx))
  );
  const stsc1 = makeFullBox('stsc', 0, 0, u32BE(1), u32BE(1), u32BE(1), u32BE(1));
  const stsz1 = makeFullBox(
    'stsz',
    0,
    0,
    u32BE(0),
    u32BE(frameCount),
    ...videoSizes.map((sz) => u32BE(sz))
  );
  const stco1 = makeFullBox(
    'stco',
    0,
    0,
    u32BE(frameCount),
    ...videoOffsets.map((off) => u32BE(off))
  );

  const makeEdts = (duration: number): Uint8Array => {
    const elst = makeFullBox(
      'elst',
      0,
      0,
      u32BE(1),
      u32BE(duration),
      u32BE(0),
      u32BE(0x00010000)
    );
    return makeBox('edts', elst);
  };

  const stbl1 = makeBox('stbl', stsd1, stts1, stss1, stsc1, stsz1, stco1);
  const minf1 = makeBox('minf', vmhd, dinf1, stbl1);
  const mdia1 = makeBox('mdia', mdhd1, hdlr1, minf1);
  const videoTrak = makeBox('trak', tkhd1, makeEdts(movieDuration), mdia1);

  // Track 2: Apple CoreMedia `mebx` Timed Metadata (`still-image-time`)
  const tkhd2Payload = new Uint8Array(80);
  const tkhd2View = new DataView(tkhd2Payload.buffer);
  tkhd2View.setUint32(8, 2, false);
  tkhd2View.setUint32(16, movieDuration, false);
  tkhd2View.setUint32(36, 0x00010000, false);
  tkhd2View.setUint32(52, 0x00010000, false);
  tkhd2View.setUint32(68, 0x40000000, false);
  const tkhd2 = makeFullBox('tkhd', 0, 0x000001, tkhd2Payload);

  const mdhd2Payload = new Uint8Array(20);
  const mdhd2View = new DataView(mdhd2Payload.buffer);
  mdhd2View.setUint32(8, movieTimescale, false);
  mdhd2View.setUint32(12, movieDuration, false);
  mdhd2View.setUint16(16, 0x55c4, false);
  const mdhd2 = makeFullBox('mdhd', 0, 0, mdhd2Payload);

  const hdlr2Payload = new Uint8Array(20);
  hdlr2Payload.set(asciiBytes('mhlr'), 0);
  hdlr2Payload.set(asciiBytes('meta'), 4);
  hdlr2Payload.set(asciiBytes('appl'), 8);
  const hdlr2 = makeFullBox('hdlr', 0, 0, hdlr2Payload, asciiBytes('Core Media Metadata\0'));

  const nmhd = makeFullBox('nmhd', 0, 0);
  const urlBox2 = makeFullBox('url ', 0, 1);
  const dref2 = makeFullBox('dref', 0, 0, u32BE(1), urlBox2);
  const dinf2 = makeBox('dinf', dref2);

  const stillKeyName = asciiBytes('com.apple.quicktime.still-image-time');
  const keydBox = makeBox('keyd', asciiBytes('mdta'), stillKeyName);
  const dtypBox = makeBox('dtyp', u32BE(0), u32BE(65));
  const keyEntryPayload = concatBytes(keydBox, dtypBox);
  const localKeyAtom = concatBytes(u32BE(8 + keyEntryPayload.length), u32BE(1), keyEntryPayload);
  const mebxKeys = makeBox('keys', localKeyAtom);

  const mebxHeader = new Uint8Array(8);
  new DataView(mebxHeader.buffer).setUint16(6, 1, false);
  const mebxEntry = makeBox('mebx', mebxHeader, mebxKeys);
  const stsd2 = makeFullBox('stsd', 0, 0, u32BE(1), mebxEntry);

  const stts2 = makeFullBox('stts', 0, 0, u32BE(1), u32BE(1), u32BE(movieDuration));
  const stsc2 = makeFullBox('stsc', 0, 0, u32BE(1), u32BE(1), u32BE(1), u32BE(1));
  const stsz2 = makeFullBox('stsz', 0, 0, u32BE(0), u32BE(1), u32BE(stillSamplePayload.length));
  const stco2 = makeFullBox('stco', 0, 0, u32BE(1), u32BE(stillSampleOffset));

  const stbl2 = makeBox('stbl', stsd2, stts2, stsc2, stsz2, stco2);
  const minf2 = makeBox('minf', nmhd, dinf2, stbl2);
  const mdia2 = makeBox('mdia', mdhd2, hdlr2, minf2);
  const tref2 = makeBox('tref', makeBox('cdsc', u32BE(1)));
  const metaTrak = makeBox('trak', tkhd2, tref2, makeEdts(movieDuration), mdia2);

  // QuickTime `moov/meta` plain atom (no FullBox version/flags prefix)
  const metaHdlrPayload = new Uint8Array(21);
  metaHdlrPayload.set(asciiBytes('mdta'), 4);
  const metaHdlr = makeFullBox('hdlr', 0, 0, metaHdlrPayload);

  const contentIdKey = asciiBytes('com.apple.quicktime.content.identifier');
  const contentIdKeyBox = concatBytes(
    u32BE(8 + contentIdKey.length),
    asciiBytes('mdta'),
    contentIdKey
  );
  const metaKeys = makeFullBox('keys', 0, 0, u32BE(1), contentIdKeyBox);

  const uuidDataBox = makeBox('data', u32BE(1), u32BE(0), textEncoder.encode(uuid));
  const ilstItem = concatBytes(u32BE(8 + uuidDataBox.length), u32BE(1), uuidDataBox);
  const metaIlst = makeBox('ilst', ilstItem);

  const moovMeta = makeBox('meta', metaHdlr, metaKeys, metaIlst);
  const moov = makeBox('moov', mvhd, videoTrak, metaTrak, moovMeta);

  return concatBytes(ftyp, mdat, moov);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createStoreZip(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const nameBytes = textEncoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lfh.set(nameBytes, 30);

    localParts.push(lfh, entry.data);

    const cdh = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cdh.set(nameBytes, 46);

    centralParts.push(cdh);
    offset += lfh.length + size;
  }

  const centralDir = concatBytes(...centralParts);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDir.length, true);
  ev.setUint32(16, offset, true);

  return concatBytes(...localParts, centralDir, eocd);
}

export function canShareExportFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const dummy = new File([new Uint8Array([1])], 'preview.mp4', { type: 'video/mp4' });
    return navigator.canShare({ files: [dummy] });
  } catch {
    return false;
  }
}

export interface BrowserVideoEncoderCapabilities {
  mode: 'webcodecs' | 'mediarecorder';
  codec?: string;
  useAnnexB?: boolean;
  mimeType?: string;
}

export async function probeExportSupport(
  outputMode: ExportOutputMode,
  width = 768,
  height = 768,
  fps = 30
): Promise<BrowserVideoEncoderCapabilities> {
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    for (const codec of H264_CODEC_CANDIDATES) {
      try {
        const avcRes = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: 4_800_000,
          framerate: fps,
          latencyMode: 'realtime',
          avc: { format: 'avc' },
        });
        if (avcRes.supported) {
          return { mode: 'webcodecs', codec, useAnnexB: false };
        }
        const annexRes = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate: 4_800_000,
          framerate: fps,
          latencyMode: 'realtime',
          avc: { format: 'annexb' },
        });
        if (annexRes.supported) {
          return { mode: 'webcodecs', codec, useAnnexB: true };
        }
      } catch {
        // try next H.264 profile
      }
    }
  }

  if (outputMode === 'live-pair') {
    throw new Error('生成实况 .JPG + .MOV 需要浏览器支持 WebCodecs H.264 编码（请使用 Chrome、Edge 或 Safari 16.4+）。');
  }

  if (typeof MediaRecorder !== 'undefined') {
    const candidates = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return { mode: 'mediarecorder', mimeType: mime };
      }
    }
  }

  throw new Error('当前浏览器不支持视频导出，请使用最新版 Chrome、Edge 或 Safari。');
}

export interface VideoExportSession {
  pushFrame: (canvas: HTMLCanvasElement, frameIndex: number, captureCover: boolean) => Promise<void>;
  finalize: (direction: VideoExportDirection) => Promise<PreparedExportBundle>;
  abort: () => void;
}

export function createBrowserExportSession(
  caps: BrowserVideoEncoderCapabilities,
  outputMode: ExportOutputMode,
  canvas: HTMLCanvasElement,
  options: { width: number; height: number; fps: number }
): VideoExportSession {
  const { width, height, fps } = options;

  if (caps.mode === 'webcodecs' && caps.codec) {
    const samples: Array<{ data: Uint8Array; isKey: boolean }> = [];
    let avcC: Uint8Array | null = null;
    let extractedSps: Uint8Array | undefined;
    let extractedPps: Uint8Array | undefined;
    let encoderError: Error | null = null;
    let coverJpegBytes: Uint8Array | null = null;
    const useAnnexB = Boolean(caps.useAnnexB);

    const encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        const raw = new Uint8Array(chunk.byteLength);
        chunk.copyTo(raw);

        if (metadata?.decoderConfig?.description && !avcC) {
          const desc = metadata.decoderConfig.description;
          avcC =
            desc instanceof ArrayBuffer
              ? new Uint8Array(desc.slice(0))
              : new Uint8Array(
                  (desc as ArrayBufferView).buffer.slice(
                    (desc as ArrayBufferView).byteOffset,
                    (desc as ArrayBufferView).byteOffset + (desc as ArrayBufferView).byteLength
                  )
                );
        }

        let sampleData: Uint8Array = raw;
        if (useAnnexB || !avcC) {
          const looksAnnexB =
            raw.length >= 4 &&
            raw[0] === 0 &&
            raw[1] === 0 &&
            (raw[2] === 1 || (raw[2] === 0 && raw[3] === 1));
          if (looksAnnexB) {
            const parsed = convertAnnexBToAvcc(raw);
            sampleData = parsed.avccData;
            if (parsed.sps) extractedSps = parsed.sps;
            if (parsed.pps) extractedPps = parsed.pps;
          }
        }

        samples.push({ data: sampleData, isKey: chunk.type === 'key' });
      },
      error: (err) => {
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });

    encoder.configure({
      codec: caps.codec,
      width,
      height,
      bitrate: 4_800_000,
      framerate: fps,
      latencyMode: 'realtime',
      avc: { format: useAnnexB ? 'annexb' : 'avc' },
    });

    return {
      pushFrame: async (srcCanvas, frameIndex, captureCover) => {
        if (encoderError) throw encoderError;

        if (captureCover && !coverJpegBytes) {
          const dataUrl = srcCanvas.toDataURL('image/jpeg', 0.92);
          const b64 = dataUrl.split(',')[1] || '';
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) {
            bytes[k] = bin.charCodeAt(k);
          }
          coverJpegBytes = bytes;
        }

        const frameDurationUs = Math.round(1_000_000 / fps);
        const videoFrame = new VideoFrame(srcCanvas, {
          timestamp: frameIndex * frameDurationUs,
          duration: frameDurationUs,
        });
        try {
          encoder.encode(videoFrame, { keyFrame: frameIndex % 30 === 0 });
        } finally {
          videoFrame.close();
        }
        if (encoder.encodeQueueSize > 8) {
          await encoder.flush();
        }
      },
      finalize: async (direction) => {
        await encoder.flush();
        encoder.close();
        if (encoderError) throw encoderError;

        if (!avcC && extractedSps && extractedPps) {
          avcC = buildAvcCDecoderConfig(extractedSps, extractedPps);
        }
        if (!avcC || samples.length === 0) {
          throw new Error('浏览器未输出有效的 H.264 视频码流，请重试。');
        }

        const durationSec = Number((samples.length / fps).toFixed(1));

        if (outputMode === 'live-pair') {
          if (!coverJpegBytes) {
            throw new Error('缺少实况封面 JPG 图像。');
          }
          const uuid = generateUuidV4();
          const stem = direction === 'tree-to-qr' ? 'IMG_TREE_TO_QR' : 'IMG_QR_TO_TREE';
          const jpgWithExif = injectAppleLivePhotoExif(coverJpegBytes, uuid);
          const movWithMebx = muxQuickTimeLivePhotoMov({
            width,
            height,
            fps,
            avcC,
            samples,
            uuid,
          });
          const zipBytes = createStoreZip([
            { name: `${stem}.JPG`, data: jpgWithExif },
            { name: `${stem}.MOV`, data: movWithMebx },
          ]);
          const zipFilename =
            direction === 'tree-to-qr' ? 'LivePhoto_TreeToQR.zip' : 'LivePhoto_QRToTree.zip';

          return {
            kind: 'live-pair',
            direction,
            stem,
            uuid,
            jpgBlob: new Blob([jpgWithExif.slice()], { type: 'image/jpeg' }),
            jpgFilename: `${stem}.JPG`,
            movBlob: new Blob([movWithMebx.slice()], { type: 'video/quicktime' }),
            movFilename: `${stem}.MOV`,
            zipBlob: new Blob([zipBytes.slice()], { type: 'application/zip' }),
            zipFilename,
            width,
            height,
            fps,
            durationSec,
          };
        }

        const mp4Bytes = muxStandardMp4({ width, height, fps, avcC, samples });
        const blob = new Blob([mp4Bytes.slice()], { type: 'video/mp4' });
        const filename = direction === 'tree-to-qr' ? 'TreeToQR.mp4' : 'QRToTree.mp4';
        return {
          kind: 'mp4',
          direction,
          filename,
          mimeType: 'video/mp4',
          blob,
          objectUrl: URL.createObjectURL(blob),
          width,
          height,
          fps,
          durationSec,
        };
      },
      abort: () => {
        try {
          if (encoder.state !== 'closed') encoder.close();
        } catch {
          // ignore
        }
      },
    };
  }

  // MediaRecorder fallback (MP4 / WebM)
  const mimeType = caps.mimeType || 'video/webm';
  const stream = canvas.captureStream(fps);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_800_000,
  });
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  const stoppedPromise = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('浏览器视频录制失败'));
  });
  recorder.start();

  let totalFrames = 0;
  return {
    pushFrame: async (_srcCanvas, frameIndex) => {
      totalFrames = Math.max(totalFrames, frameIndex + 1);
      await new Promise<void>((resolve) => window.setTimeout(resolve, Math.round(1000 / fps)));
    },
    finalize: async (direction) => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      await stoppedPromise;
      stream.getTracks().forEach((t) => t.stop());

      const isMp4 = mimeType.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      const filename = direction === 'tree-to-qr' ? `TreeToQR.${ext}` : `QRToTree.${ext}`;
      return {
        kind: 'mp4',
        direction,
        filename,
        mimeType,
        blob,
        objectUrl: URL.createObjectURL(blob),
        width,
        height,
        fps,
        durationSec: Number((Math.max(1, totalFrames) / fps).toFixed(1)),
      };
    },
    abort: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
    },
  };
}
