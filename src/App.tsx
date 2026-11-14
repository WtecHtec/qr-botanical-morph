import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { VideoExportModal, VideoExportState } from './components/VideoExportModal';
import { WindLevelId } from './scene/leafMorphSystem';
import { DEFAULT_QR_IMAGE_URL, QrSampleResult } from './scene/qrSampler';
import { CameraViewId, ExportOutputMode, QrTreeScene, SceneMode, VideoExportDirection } from './scene/QrTreeScene';
import { SeasonId, TreeSpeciesId } from './scene/treeGenerator';
import { WeatherModeId } from './scene/weatherSystem';
import { PreparedExportBundle } from './utils/videoExportClient';

const SPECIES_LABEL: Record<TreeSpeciesId, string> = {
  evergreen: '常青树',
  peach: '桃花树',
  maple: '红枫树',
  plum: '红梅树',
};

const SEASON_LABEL: Record<SeasonId, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<QrTreeScene | null>(null);
  const customUrlRef = useRef<string | null>(null);

  const [mode, setMode] = useState<SceneMode>('tree');
  const [cameraView, setCameraView] = useState<CameraViewId>('side');
  const [morphProgress, setMorphProgress] = useState<number>(0);
  const [species, setSpecies] = useState<TreeSpeciesId>('evergreen');
  const [season, setSeason] = useState<SeasonId>('spring');
  const [weather, setWeather] = useState<WeatherModeId>('clear');
  const [windLevel, setWindLevel] = useState<WindLevelId>('natural');
  const [butterfliesEnabled, setButterfliesEnabled] = useState<boolean>(true);
  const [birdsEnabled, setBirdsEnabled] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState<boolean>(false);
  const [videoExportState, setVideoExportState] = useState<VideoExportState>({
    phase: 'idle',
    progress: 0,
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new QrTreeScene(container, {
      onMorphProgress: (progress) => setMorphProgress(progress),
      onModeChange: (nextMode) => setMode(nextMode),
      onCameraViewChange: (nextView) => setCameraView(nextView),
      onReady: (_res: QrSampleResult) => {
        setErrorMsg(null);
      },
      onError: (msg) => setErrorMsg(msg),
      onContextLost: (lost) => setContextLost(lost),
    });

    sceneRef.current = scene;

    // Unlock Web Audio cleanly on the user's first pointer or keyboard interaction
    const unlockOnce = () => {
      scene.unlockAudio();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
      scene.dispose();
      sceneRef.current = null;
      if (customUrlRef.current) {
        URL.revokeObjectURL(customUrlRef.current);
        customUrlRef.current = null;
      }
      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setCollapsed((prev) => !prev);
      } else if (e.code === 'Space') {
        e.preventDefault();
        sceneRef.current?.toggleMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleToggleMode = useCallback(() => {
    sceneRef.current?.toggleMode();
  }, []);

  const handleCameraViewChange = useCallback((view: CameraViewId) => {
    setCameraView(view);
    sceneRef.current?.setCameraView(view);
  }, []);

  const handleScrubProgress = useCallback((value: number) => {
    setMorphProgress(value);
    sceneRef.current?.setScrubProgress(value);
  }, []);

  const handleSpeciesChange = useCallback((nextSpecies: TreeSpeciesId) => {
    setSpecies(nextSpecies);
    sceneRef.current?.setSpecies(nextSpecies);

    // Pair each signature species with its iconic blooming/foliage season on switch
    const signatureSeason: SeasonId | null =
      nextSpecies === 'peach'
        ? 'spring'
        : nextSpecies === 'maple'
        ? 'autumn'
        : nextSpecies === 'plum'
        ? 'winter'
        : null;

    if (signatureSeason) {
      setSeason(signatureSeason);
      sceneRef.current?.setSeason(signatureSeason);
      // Keep sky crisp & sunlit so blossoms/maple leaves stand out clearly; user can still toggle rain/snow manually
      setWeather('clear');
      sceneRef.current?.setWeather('clear');
    }
  }, []);

  const handleSeasonChange = useCallback((nextSeason: SeasonId) => {
    setSeason(nextSeason);
    sceneRef.current?.setSeason(nextSeason);

    const defaultWeather: WeatherModeId =
      nextSeason === 'winter' ? 'snow' : nextSeason === 'spring' ? 'rain' : 'clear';
    setWeather(defaultWeather);
    sceneRef.current?.setWeather(defaultWeather);
  }, []);

  const handleWeatherChange = useCallback((nextWeather: WeatherModeId) => {
    setWeather(nextWeather);
    sceneRef.current?.setWeather(nextWeather);
  }, []);

  const handleWindChange = useCallback((next: WindLevelId) => {
    setWindLevel(next);
    sceneRef.current?.setWindLevel(next);
  }, []);

  const handleToggleButterflies = useCallback(() => {
    setButterfliesEnabled((prev) => {
      const next = !prev;
      sceneRef.current?.setButterfliesEnabled(next);
      return next;
    });
  }, []);

  const handleToggleBirds = useCallback(() => {
    setBirdsEnabled((prev) => {
      const next = !prev;
      sceneRef.current?.setBirdsEnabled(next);
      return next;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      sceneRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleUploadQr = useCallback((objectUrl: string) => {
    if (customUrlRef.current) {
      URL.revokeObjectURL(customUrlRef.current);
    }
    customUrlRef.current = objectUrl;
    sceneRef.current?.loadQrImage(objectUrl);
  }, []);

  const handleExportQr = useCallback(() => {
    sceneRef.current?.exportQrPng();
  }, []);

  const handleOpenVideoExport = useCallback(() => {
    setVideoExportState((prev) =>
      prev.phase === 'ready' && prev.bundle ? prev : { phase: 'idle', progress: 0 }
    );
    setVideoModalOpen(true);
  }, []);

  const handleDownloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const handleGenerateVideo = useCallback(
    async (direction: VideoExportDirection, outputMode: ExportOutputMode) => {
      const scene = sceneRef.current;
      if (!scene) return;

      try {
        setVideoExportState({ phase: 'capturing', progress: 0 });
        const bundle = await scene.exportVideoClient(direction, outputMode, (stage, pct) => {
          setVideoExportState({ phase: stage, progress: pct });
        });

        if (videoUrlRef.current) {
          URL.revokeObjectURL(videoUrlRef.current);
          videoUrlRef.current = null;
        }
        if (bundle.kind === 'mp4') {
          videoUrlRef.current = bundle.objectUrl;
        }

        const savedFilename = bundle.kind === 'mp4' ? bundle.filename : bundle.zipFilename;
        setVideoExportState({
          phase: 'ready',
          progress: 100,
          bundle,
          message:
            bundle.kind === 'mp4' ? '视频已生成并开始保存' : '实况压缩包已生成并开始保存',
        });

        handleDownloadBlob(bundle.kind === 'mp4' ? bundle.blob : bundle.zipBlob, savedFilename);
      } catch (err) {
        const message = err instanceof Error ? err.message : '导出失败';
        setVideoExportState({
          phase: 'error',
          progress: 0,
          message,
        });
      }
    },
    [handleDownloadBlob]
  );

  const handleShareBundle = useCallback(async (bundle: PreparedExportBundle) => {
    try {
      if (bundle.kind === 'mp4') {
        const videoFile = new File([bundle.blob], bundle.filename, { type: bundle.mimeType });
        await navigator.share({
          files: [videoFile],
          title: bundle.direction === 'tree-to-qr' ? '生命树转二维码视频' : '二维码转生命树视频',
        });
      } else {
        const jpgFile = new File([bundle.jpgBlob], bundle.jpgFilename, { type: 'image/jpeg' });
        const movFile = new File([bundle.movBlob], bundle.movFilename, { type: 'video/quicktime' });
        await navigator.share({
          files: [jpgFile, movFile],
          title: bundle.direction === 'tree-to-qr' ? '生命树转二维码实况素材' : '二维码转生命树实况素材',
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setVideoExportState((prev) => ({
        ...prev,
        phase: 'error',
        message: '系统分享未能唤起，请点击下方按钮直接下载文件。',
      }));
    }
  }, []);

  const isDarkSky = weather === 'rain' || weather === 'snow';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#ecf0e7] select-none">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="fixed inset-0 w-full h-full touch-none" />

      {/* Minimal Top-Left Header with responsive safe-area & high-contrast sky adaptation */}
      <header className="fixed top-[max(0.875rem,env(safe-area-inset-top))] left-4 right-4 sm:top-5 sm:left-6 sm:right-auto z-10 pointer-events-none sm:max-w-[85vw]">
        <h1
          className={`text-base sm:text-xl font-semibold tracking-tight text-balance transition-colors duration-500 ${
            isDarkSky ? 'text-[#f4f7fa]' : 'text-[#181a18]'
          }`}
        >
          二维码像素生命树
        </h1>
        <p
          className={`mt-0.5 sm:mt-1 flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[11px] sm:text-xs transition-colors duration-500 ${
            isDarkSky ? 'text-[#cfd8e2]' : 'text-[#595d57]'
          }`}
        >
          <span>{mode === 'tree' ? (cameraView === 'top' ? '俯视轮廓' : SPECIES_LABEL[species]) : '2D 二维码'}</span>
          <span aria-hidden="true">·</span>
          <span>{SEASON_LABEL[season]}</span>
        </p>
      </header>

      {errorMsg && (
        <div className="fixed top-20 left-4 right-4 sm:left-6 sm:right-auto z-20 px-3.5 py-2 rounded-lg bg-[#faf9f6] border border-[#d6c2bc] text-xs text-[#7c2d12] shadow-sm">
          {errorMsg}
        </div>
      )}

      {contextLost && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-[#eceae4] p-6 text-center">
          <img
            src={DEFAULT_QR_IMAGE_URL}
            alt="二维码参考图"
            referrerPolicy="no-referrer"
            className="w-52 h-52 object-contain bg-white p-4 rounded-xl border border-[#d8d4ca] shadow-sm mb-4"
          />
          <p className="text-sm font-medium text-[#181a18]">WebGL 渲染上下文已暂停</p>
          <p className="mt-1 text-xs text-[#595d57]">请刷新页面或恢复浏览器硬件加速以继续查看 3D 动画</p>
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock (Desktop Dock + Mobile Thumb Bar & Drawer) */}
      <ControlDock
        mode={mode}
        cameraView={cameraView}
        morphProgress={morphProgress}
        species={species}
        season={season}
        weather={weather}
        windLevel={windLevel}
        butterfliesEnabled={butterfliesEnabled}
        birdsEnabled={birdsEnabled}
        muted={muted}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onToggleMode={handleToggleMode}
        onCameraViewChange={handleCameraViewChange}
        onScrubProgress={handleScrubProgress}
        onSpeciesChange={handleSpeciesChange}
        onSeasonChange={handleSeasonChange}
        onWeatherChange={handleWeatherChange}
        onWindChange={handleWindChange}
        onToggleButterflies={handleToggleButterflies}
        onToggleBirds={handleToggleBirds}
        onToggleMute={handleToggleMute}
        onUploadQr={handleUploadQr}
        onExportQr={handleExportQr}
        onOpenVideoExport={handleOpenVideoExport}
      />

      <VideoExportModal
        open={videoModalOpen}
        exportState={videoExportState}
        onClose={() => setVideoModalOpen(false)}
        onGenerate={handleGenerateVideo}
        onDownloadBlob={handleDownloadBlob}
        onShareBundle={handleShareBundle}
      />
    </div>
  );
}
