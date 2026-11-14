import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { exiftool } from 'exiftool-vendored';
import express from 'express';
import multer from 'multer';
import {
  createStoreZip,
  extractMp4VideoSamples,
  injectAppleLivePhotoExif,
  muxQuickTimeLivePhotoMov,
} from './src/utils/livePhotoBinary.ts';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const JOB_ROOT_DIR = path.join(os.tmpdir(), 'qr-tree-live-photo-jobs');
const JOB_TTL_MS = 15 * 60 * 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 2,
  },
});

function sanitizeStem(raw: unknown, direction: string): string {
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    if (cleaned.length > 0) return cleaned;
  }
  if (direction === 'tree-to-qr') return 'IMG_TREE_TO_QR';
  if (direction === 'qr-to-tree') return 'IMG_QR_TO_TREE';
  return 'IMG_LIVE_PHOTO';
}

async function cleanupExpiredJobs(): Promise<void> {
  try {
    await fs.mkdir(JOB_ROOT_DIR, { recursive: true });
    const entries = await fs.readdir(JOB_ROOT_DIR, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        const fullPath = path.join(JOB_ROOT_DIR, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          if (now - stat.mtimeMs > JOB_TTL_MS) {
            await fs.rm(fullPath, { recursive: true, force: true });
          }
        } catch {
          // ignore race condition
        }
      })
    );
  } catch {
    // ignore cleanup failures
  }
}

async function startServer(): Promise<void> {
  await fs.mkdir(JOB_ROOT_DIR, { recursive: true });

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, pipeline: 'ffmpeg + mebx + exiftool-vendored' });
  });

  app.post(
    '/api/live-photo',
    upload.fields([
      { name: 'jpg', maxCount: 1 },
      { name: 'mov', maxCount: 1 },
    ]),
    async (req, res) => {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const jpgFile = files?.jpg?.[0];
      const movFile = files?.mov?.[0];

      if (!jpgFile || !movFile) {
        res.status(400).json({ error: '请同时上传封面图片 (.JPG) 和动画视频 (.MOV/.MP4)。' });
        return;
      }

      const jobId = crypto.randomUUID();
      const jobDir = path.join(JOB_ROOT_DIR, jobId);
      const direction = typeof req.body?.direction === 'string' ? req.body.direction : 'custom';
      const stem = sanitizeStem(req.body?.stem, direction);
      const uuid = crypto.randomUUID().toUpperCase();

      const jpgFilename = `${stem}.JPG`;
      const movFilename = `${stem}.MOV`;
      const zipFilename =
        direction === 'tree-to-qr'
          ? 'LivePhoto_TreeToQR.zip'
          : direction === 'qr-to-tree'
            ? 'LivePhoto_QRToTree.zip'
            : `${stem}_LivePhoto.zip`;

      try {
        await fs.mkdir(jobDir, { recursive: true });

        const rawImgPath = path.join(jobDir, 'upload_img.bin');
        const cleanJpgPath = path.join(jobDir, 'clean.jpg');
        const rawVidPath = path.join(jobDir, 'upload_vid.bin');
        const cleanMp4Path = path.join(jobDir, 'clean.mp4');
        const finalJpgPath = path.join(jobDir, jpgFilename);
        const finalMovPath = path.join(jobDir, movFilename);
        const finalZipPath = path.join(jobDir, zipFilename);

        await Promise.all([
          fs.writeFile(rawImgPath, jpgFile.buffer),
          fs.writeFile(rawVidPath, movFile.buffer),
        ]);

        // 1. Normalize cover image via FFmpeg & inject Apple iOS MakerNote + ExifTool verification
        await execFileAsync(
          'ffmpeg',
          ['-y', '-i', rawImgPath, '-frames:v', '1', '-q:v', '2', '-pix_fmt', 'yuvj420p', cleanJpgPath],
          { timeout: 30_000 }
        );
        const cleanJpgBytes = new Uint8Array(await fs.readFile(cleanJpgPath));
        const jpgWithAppleMakerNote = injectAppleLivePhotoExif(cleanJpgBytes, uuid);
        await fs.writeFile(finalJpgPath, jpgWithAppleMakerNote);

        await exiftool.write(
          finalJpgPath,
          {},
          {
            writeArgs: [
              '-overwrite_original',
              '-Make=Apple',
              '-Model=iPhone',
              `-MakerApple:ContentIdentifier=${uuid}`,
            ],
          }
        );

        // 2. Normalize video via FFmpeg (H.264 yuv420p, no B-frames for deterministic DTS=PTS)
        //    then mux Apple QuickTime `.MOV` with `mebx` `still-image-time` track,
        //    and finalize Apple ContentIdentifier tags with ExifTool (AIGC-LivePhoto-Maker pattern).
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            rawVidPath,
            '-an',
            '-c:v',
            'libx264',
            '-profile:v',
            'high',
            '-level',
            '4.0',
            '-pix_fmt',
            'yuv420p',
            '-vf',
            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-bf',
            '0',
            '-g',
            '30',
            '-movflags',
            '+faststart',
            '-f',
            'mp4',
            cleanMp4Path,
          ],
          { timeout: 60_000 }
        );

        const cleanMp4Bytes = new Uint8Array(await fs.readFile(cleanMp4Path));
        const parsedVideo = extractMp4VideoSamples(cleanMp4Bytes);
        const movWithMebx = muxQuickTimeLivePhotoMov({
          width: parsedVideo.width,
          height: parsedVideo.height,
          fps: parsedVideo.fps,
          avcC: parsedVideo.avcC,
          samples: parsedVideo.samples,
          uuid,
        });
        await fs.writeFile(finalMovPath, movWithMebx);

        await exiftool.write(
          finalMovPath,
          {},
          {
            writeArgs: [
              '-overwrite_original',
              '-Keys:Make=Apple',
              '-Keys:Model=iPhone',
              `-Keys:ContentIdentifier=${uuid}`,
              `-QuickTime:ContentIdentifier=${uuid}`,
              `-UserData:ContentIdentifier=${uuid}`,
            ],
          }
        );

        // 3. Read back metadata via ExifTool to confirm integrity
        const [jpgTags, movTags] = await Promise.all([
          exiftool.read(finalJpgPath),
          exiftool.read(finalMovPath, ['-ee']),
        ]);

        const [finalJpgBytes, finalMovBytes] = await Promise.all([
          fs.readFile(finalJpgPath),
          fs.readFile(finalMovPath),
        ]);
        const zipBytes = createStoreZip([
          { name: jpgFilename, data: new Uint8Array(finalJpgBytes) },
          { name: movFilename, data: new Uint8Array(finalMovBytes) },
        ]);
        await fs.writeFile(finalZipPath, zipBytes);

        // Clean intermediate raw files immediately
        await Promise.allSettled([
          fs.rm(rawImgPath, { force: true }),
          fs.rm(cleanJpgPath, { force: true }),
          fs.rm(rawVidPath, { force: true }),
          fs.rm(cleanMp4Path, { force: true }),
        ]);

        void cleanupExpiredJobs();

        res.json({
          jobId,
          uuid,
          stem,
          jpgFilename,
          movFilename,
          zipFilename,
          jpgUrl: `/api/live-photo/download/${jobId}/${encodeURIComponent(jpgFilename)}`,
          movUrl: `/api/live-photo/download/${jobId}/${encodeURIComponent(movFilename)}`,
          zipUrl: `/api/live-photo/download/${jobId}/${encodeURIComponent(zipFilename)}`,
          verifiedTags: {
            jpgContentId: String(jpgTags.ContentIdentifier || ''),
            movContentId: String(movTags.ContentIdentifier || ''),
            stillImageTime: (movTags as Record<string, unknown>).StillImageTime as
              | number
              | string
              | undefined,
          },
        });
      } catch (err) {
        await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
        const msg = err instanceof Error ? err.message : '服务端实况处理失败';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.get('/api/live-photo/download/:jobId/:filename', async (req, res) => {
    const { jobId, filename } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
      res.status(400).json({ error: '无效的任务 ID' });
      return;
    }

    const safeName = path.basename(filename);
    const filePath = path.join(JOB_ROOT_DIR, jobId, safeName);

    try {
      await fs.access(filePath);
    } catch {
      res.status(404).json({ error: '文件已过期或不存在，请重新生成' });
      return;
    }

    const lower = safeName.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (lower.endsWith('.mov')) {
      res.setHeader('Content-Type', 'video/quicktime');
    } else if (lower.endsWith('.zip')) {
      res.setHeader('Content-Type', 'application/zip');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.sendFile(filePath);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const interfaces = os.networkInterfaces();

    console.log(`Server listening on port ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);

    Object.values(interfaces).flat().forEach((item) => {
      if (item && item.family === 'IPv4' && !item.internal) {
        console.log(`Network: http://${item.address}:${PORT}`);
      }
    });
  });

  const shutdown = async () => {
    server.close();
    await exiftool.end().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void startServer();
