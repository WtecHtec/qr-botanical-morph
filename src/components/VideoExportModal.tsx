import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  Download,
  Film,
  Image as ImageIcon,
  Share2,
  Smartphone,
  Trees,
  X,
} from 'lucide-react';
import {
  canShareExportFiles,
  ExportOutputMode,
  PreparedExportBundle,
  VideoExportDirection,
} from '../utils/videoExportClient';

export interface VideoExportState {
  phase: 'idle' | 'capturing' | 'encoding' | 'ready' | 'error';
  progress: number;
  bundle?: PreparedExportBundle;
  message?: string;
}

interface VideoExportModalProps {
  open: boolean;
  exportState: VideoExportState;
  onClose: () => void;
  onGenerate: (direction: VideoExportDirection, outputMode: ExportOutputMode) => void;
  onDownloadBlob: (blob: Blob, filename: string) => void;
  onShareBundle: (bundle: PreparedExportBundle) => void;
}

export const VideoExportModal: React.FC<VideoExportModalProps> = ({
  open,
  exportState,
  onClose,
  onGenerate,
  onDownloadBlob,
  onShareBundle,
}) => {
  const [direction, setDirection] = useState<VideoExportDirection>('tree-to-qr');
  const [outputMode, setOutputMode] = useState<ExportOutputMode>('live-pair');
  const shareSupported = useMemo(() => canShareExportFiles(), []);

  if (!open) return null;

  const isBusy = exportState.phase === 'capturing' || exportState.phase === 'encoding';
  const bundle = exportState.bundle;
  const bundleMatchesSelection = Boolean(
    bundle && bundle.direction === direction && bundle.kind === outputMode
  );

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-export-modal-title"
    >
      <div className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-2xl sm:rounded-xl bg-[#faf9f6] border border-[#d8d4ca] shadow-[0_20px_50px_-12px_rgba(24,26,24,0.28)] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-[#e8e5dd]">
          <div className="flex items-center gap-2.5">
            <Film className="w-4 h-4 text-[#1f4031]" />
            <h2 id="video-export-modal-title" className="text-sm font-semibold text-[#181a18]">
              导出过渡动画
            </h2>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-md text-[#595d57] hover:text-[#181a18] hover:bg-[#efede7] disabled:opacity-40 cursor-pointer transition-colors"
            aria-label="关闭弹窗"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4">
          {/* Step 1: Direction */}
          <div>
            <div className="text-xs font-medium text-[#4a4e49] mb-2">选择方向</div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setDirection('tree-to-qr')}
                className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                  direction === 'tree-to-qr'
                    ? 'bg-[#eef4ef] border-[#1f4031] text-[#181a18]'
                    : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49] hover:border-[#c8c3b6]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1f4031]">
                  <Trees className="w-3.5 h-3.5 shrink-0" />
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>树转二维码</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#595d57]">
                  生命树收拢为二维码
                </p>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => setDirection('qr-to-tree')}
                className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                  direction === 'qr-to-tree'
                    ? 'bg-[#eef4ef] border-[#1f4031] text-[#181a18]'
                    : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49] hover:border-[#c8c3b6]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1f4031]">
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  <Trees className="w-3.5 h-3.5 shrink-0" />
                  <span>二维码转树</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#595d57]">
                  二维码生长为生命树
                </p>
              </button>
            </div>
          </div>

          {/* Step 2: Format Switch */}
          <div>
            <div className="text-xs font-medium text-[#4a4e49] mb-2">导出格式</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setOutputMode('live-pair')}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                  outputMode === 'live-pair'
                    ? 'bg-[#eef4ef] border-[#1f4031] text-[#181a18]'
                    : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49] hover:border-[#c8c3b6]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1f4031]">
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span>实况压缩包 (.ZIP)</span>
                </div>
                <span className="text-[11px] text-[#595d57]">含封面图与动态视频</span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => setOutputMode('mp4')}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-60 ${
                  outputMode === 'mp4'
                    ? 'bg-[#eef4ef] border-[#1f4031] text-[#181a18]'
                    : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49] hover:border-[#c8c3b6]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1f4031]">
                  <Film className="w-3.5 h-3.5 shrink-0" />
                  <span>标准视频 (.MP4)</span>
                </div>
                <span className="text-[11px] text-[#595d57]">可直接播放或存相册</span>
              </button>
            </div>
          </div>

          {/* Progress / Status */}
          {exportState.phase !== 'idle' && (
            <div className="rounded-lg bg-[#f2efe8] border border-[#e2dfd7] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-medium text-[#2c2f2b] inline-flex items-center gap-1.5">
                  {exportState.phase === 'ready' && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#1f4031] shrink-0" />
                  )}
                  <span>
                    {exportState.phase === 'capturing' && '正在生成动画...'}
                    {exportState.phase === 'encoding' &&
                      (outputMode === 'live-pair' ? '正在打包实况文件...' : '正在导出视频文件...')}
                    {exportState.phase === 'ready' && (exportState.message || '已生成并开始保存')}
                    {exportState.phase === 'error' && (exportState.message || '导出失败，请重试。')}
                  </span>
                </span>
                {exportState.phase === 'capturing' && (
                  <span className="font-mono-tabular text-[#1f4031] font-semibold shrink-0">
                    {exportState.progress}%
                  </span>
                )}
              </div>
              {isBusy && (
                <div className="h-1.5 w-full rounded-full bg-[#dfdacf] overflow-hidden">
                  <div
                    className="h-full bg-[#1f4031] transition-all duration-150"
                    style={{
                      width: `${exportState.phase === 'capturing' ? exportState.progress : 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Output Actions & Preview */}
          {bundleMatchesSelection && bundle?.kind === 'mp4' && (
            <div className="space-y-2.5">
              <div className="overflow-hidden rounded-lg border border-[#d8d4ca] bg-[#181a18]">
                <video
                  src={bundle.objectUrl}
                  controls
                  playsInline
                  autoPlay
                  loop
                  muted
                  className="w-full max-h-52 object-contain block mx-auto"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onDownloadBlob(bundle.blob, bundle.filename)}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#1f4031] hover:bg-[#173226] text-[#faf9f6] text-xs font-medium cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>保存视频</span>
                </button>

                {shareSupported && (
                  <button
                    type="button"
                    onClick={() => onShareBundle(bundle)}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-[#d8d4ca] bg-[#faf9f6] hover:bg-[#efede7] text-[#181a18] text-xs font-medium cursor-pointer transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span>系统分享</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {bundleMatchesSelection && bundle?.kind === 'live-pair' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onDownloadBlob(bundle.jpgBlob, bundle.jpgFilename)}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f4031] hover:bg-[#173226] text-xs font-medium text-[#faf9f6] cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span>保存封面 (.JPG)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDownloadBlob(bundle.movBlob, bundle.movFilename)}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f4031] hover:bg-[#173226] text-xs font-medium text-[#faf9f6] cursor-pointer transition-colors"
                >
                  <Film className="w-3.5 h-3.5 shrink-0" />
                  <span>保存视频 (.MOV)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onDownloadBlob(bundle.zipBlob, bundle.zipFilename)}
                  className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d8d4ca] bg-[#faf9f6] hover:bg-[#efede7] text-xs font-medium text-[#181a18] cursor-pointer transition-colors"
                >
                  <Archive className="w-3.5 h-3.5 shrink-0" />
                  <span>下载压缩包 (.ZIP)</span>
                </button>
                {shareSupported && (
                  <button
                    type="button"
                    onClick={() => onShareBundle(bundle)}
                    className="min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d8d4ca] bg-[#faf9f6] hover:bg-[#efede7] text-xs font-medium text-[#181a18] cursor-pointer transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span>系统分享</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {outputMode === 'live-pair' && (
            <div className="rounded-lg bg-[#f4f2ec] border border-[#e5e2d9] px-3.5 py-2.5 text-[11px] leading-relaxed text-[#4a4e49] space-y-1.5">
              <div className="font-semibold text-[#181a18]">实况图使用步骤</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>生成后将下载一个压缩包，内含配套的封面图（.JPG）与动态视频（.MOV）。</li>
                <li>
                  <span className="font-medium text-[#181a18]">手机端：</span>
                  {shareSupported
                    ? '可直接点击「系统分享」同时存入相册；或在“文件”App 解压后，同时选中两项文件存储到相册。'
                    : '在手机“文件”App 解压后，同时选中 .JPG 与 .MOV 两个文件，点击分享并选择存储到相册。'}
                </li>
                <li>
                  <span className="font-medium text-[#181a18]">电脑端：</span>
                  解压后将 .JPG 与 .MOV 一起拖入 Mac「照片」App 即可识别为实况照片，再同步至手机。
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 sm:px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:py-3.5 bg-[#f4f2ec] border-t border-[#e8e5dd]">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="min-h-[44px] sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-lg border border-[#d8d4ca] bg-[#faf9f6] hover:bg-[#efede7] text-xs font-medium text-[#4a4e49] disabled:opacity-50 cursor-pointer transition-colors"
          >
            关闭
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onGenerate(direction, outputMode)}
            className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 sm:py-1.5 rounded-lg bg-[#1f4031] hover:bg-[#173226] text-[#faf9f6] text-xs font-medium disabled:opacity-50 cursor-pointer transition-colors"
          >
            {outputMode === 'live-pair' ? (
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Film className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {isBusy
                ? '正在生成...'
                : bundleMatchesSelection
                ? '重新生成'
                : outputMode === 'live-pair'
                ? '生成并保存压缩包'
                : '生成并保存视频'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
