import React, { useRef, useState } from 'react';
import {
  Bird,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Download,
  Eye,
  Film,
  Image as ImageIcon,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Trees,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WindLevelId } from '../scene/leafMorphSystem';
import { CameraViewId, SceneMode } from '../scene/QrTreeScene';
import { SeasonId, TreeSpeciesId } from '../scene/treeGenerator';
import { WeatherModeId } from '../scene/weatherSystem';

interface ControlDockProps {
  mode: SceneMode;
  cameraView: CameraViewId;
  morphProgress: number;
  species: TreeSpeciesId;
  season: SeasonId;
  weather: WeatherModeId;
  windLevel: WindLevelId;
  butterfliesEnabled: boolean;
  birdsEnabled: boolean;
  muted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onToggleMode: () => void;
  onCameraViewChange: (view: CameraViewId) => void;
  onScrubProgress: (value: number) => void;
  onSpeciesChange: (species: TreeSpeciesId) => void;
  onSeasonChange: (season: SeasonId) => void;
  onWeatherChange: (weather: WeatherModeId) => void;
  onWindChange: (wind: WindLevelId) => void;
  onToggleButterflies: () => void;
  onToggleBirds: () => void;
  onToggleMute: () => void;
  onUploadQr: (url: string) => void;
  onExportQr: () => void;
  onOpenVideoExport: () => void;
}

const SPECIES_OPTIONS: Array<{ id: TreeSpeciesId; label: string; fullLabel: string; swatch: string }> = [
  { id: 'evergreen', label: '常青', fullLabel: '常青树', swatch: '#357446' },
  { id: 'peach', label: '桃花', fullLabel: '桃花树', swatch: '#f48fb1' },
  { id: 'maple', label: '枫树', fullLabel: '红枫树', swatch: '#d93c1e' },
  { id: 'plum', label: '梅花', fullLabel: '红梅树', swatch: '#d93860' },
];

const SEASON_OPTIONS: Array<{ id: SeasonId; label: string; swatch: string }> = [
  { id: 'spring', label: '春', swatch: '#7bc069' },
  { id: 'summer', label: '夏', swatch: '#295f3a' },
  { id: 'autumn', label: '秋', swatch: '#dd812b' },
  { id: 'winter', label: '冬', swatch: '#8fa19d' },
];

const WEATHER_OPTIONS: Array<{ id: WeatherModeId; label: string; icon: 'sun' | 'rain' | 'snow' }> = [
  { id: 'clear', label: '晴', icon: 'sun' },
  { id: 'rain', label: '细雨', icon: 'rain' },
  { id: 'snow', label: '细雪', icon: 'snow' },
];

const WIND_OPTIONS: Array<{ id: WindLevelId; label: string }> = [
  { id: 'gentle', label: '微风' },
  { id: 'natural', label: '自然' },
  { id: 'breeze', label: '落英' },
];

const ButterflyIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5 shrink-0' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 7v11" />
    <path d="M12 9C9.5 4.5 4 4.5 3.5 8.5c-.4 3 2.5 4.5 5.5 4.5-3 .8-4.5 3.2-3 5.3 1.4 2 4.8.8 6-2.8" />
    <path d="M12 9c2.5-4.5 8-4.5 8.5-.5.4 3-2.5 4.5-5.5 4.5 3 .8 4.5 3.2 3 5.3-1.4 2-4.8.8-6-2.8" />
  </svg>
);

export const ControlDock: React.FC<ControlDockProps> = ({
  mode,
  cameraView,
  morphProgress,
  species,
  season,
  weather,
  windLevel,
  butterfliesEnabled,
  birdsEnabled,
  muted,
  collapsed,
  onToggleCollapse,
  onToggleMode,
  onCameraViewChange,
  onScrubProgress,
  onSpeciesChange,
  onSeasonChange,
  onWeatherChange,
  onWindChange,
  onToggleButterflies,
  onToggleBirds,
  onToggleMute,
  onUploadQr,
  onExportQr,
  onOpenVideoExport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    onUploadQr(objectUrl);
    e.target.value = '';
  };

  const pct = Math.round(morphProgress * 100);
  const isTopView = mode === 'tree' && cameraView === 'top';

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Desktop / Tablet Dock (md and up) */}
      <div
        className="hidden md:flex fixed bottom-4 left-1/2 z-20 -translate-x-1/2 flex-col items-center pointer-events-none"
        style={{ maxWidth: 'min(1040px, 96vw)', width: 'max-content' }}
      >
        {/* Collapse / Expand Handle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-t-md bg-[#faf9f6] border border-b-0 border-[#d8d4ca] text-xs font-medium text-[#4a4e49] hover:text-[#181a18] shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#1f4031]"
          title="切换控制栏显示 (快捷键 H)"
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>{collapsed ? '展开控制栏' : '收起控制栏'}</span>
        </button>

        {/* Unified Compact Bottom Control Bar */}
        <div
          className={`pointer-events-auto w-full bg-[#faf9f6] border border-[#d8d4ca] rounded-xl shadow-[0_10px_30px_-10px_rgba(24,26,24,0.14)] px-4 py-2.5 transition-transform duration-300 ease-out ${
            collapsed ? 'translate-y-[calc(100%+24px)] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
          }`}
        >
          <div className="flex flex-col gap-2">
            {/* Row 1: Mode, Top-Down / Side View, Morph Scrubber, Quick Actions */}
            <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-2">
              <button
                type="button"
                onClick={onToggleMode}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#1f4031] hover:bg-[#173226] text-[#faf9f6] text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f4031]"
              >
                {mode === 'tree' ? (
                  <>
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>转换为 2D 图片</span>
                  </>
                ) : (
                  <>
                    <Trees className="w-3.5 h-3.5" />
                    <span>生长为 3D 树</span>
                  </>
                )}
              </button>

              {/* Camera View Switch */}
              <div className="flex items-center gap-1 p-0.5 bg-[#efede7] rounded-lg border border-[#e2dfd7]">
                <button
                  type="button"
                  onClick={() => onCameraViewChange('side')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === 'tree' && cameraView === 'side'
                      ? 'bg-[#faf9f6] text-[#181a18] shadow-xs'
                      : 'text-[#595d57] hover:text-[#181a18]'
                  }`}
                >
                  <Trees className="w-3 h-3" />
                  <span>3D 侧视</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCameraViewChange('top')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isTopView
                      ? 'bg-[#faf9f6] text-[#181a18] shadow-xs'
                      : 'text-[#595d57] hover:text-[#181a18]'
                  }`}
                  title="俯视树冠：树叶与枝干对齐底部二维码轮廓"
                >
                  <Eye className="w-3 h-3" />
                  <span>俯视树冠</span>
                </button>
              </div>

              {/* Morph Scrubber */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#595d57] whitespace-nowrap">生长</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) => onScrubProgress(Number(e.target.value) / 100)}
                  aria-label="形态变换进度"
                  className="morph-slider w-20 lg:w-24"
                />
                <span className="font-mono-tabular text-xs text-[#2b2e2a] w-8 text-right">{pct}%</span>
              </div>

              <div className="h-4 w-px bg-[#e2dfd7]" aria-hidden="true" />

              {/* File Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#dad6cc] bg-[#faf9f6] hover:bg-[#efede7] text-xs font-medium text-[#2c2f2b] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="上传自定义二维码图片"
                >
                  <Upload className="w-3 h-3" />
                  <span>换图</span>
                </button>
                <button
                  type="button"
                  onClick={onExportQr}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#dad6cc] bg-[#faf9f6] hover:bg-[#efede7] text-xs font-medium text-[#2c2f2b] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="导出 2D 二维码图片"
                >
                  <Download className="w-3 h-3" />
                  <span>导出 2D</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenVideoExport}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#b8cbbd] bg-[#eef4ef] hover:bg-[#e1ebe3] text-xs font-medium text-[#1f4031] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="导出实况压缩包或视频"
                >
                  <Film className="w-3 h-3" />
                  <span>导出实况/视频</span>
                </button>
              </div>
            </div>

            <div className="h-px w-full bg-[#e8e5dd]" aria-hidden="true" />

            {/* Row 2: Tree Species, Seasons, Weather, Wildlife, Audio, Wind */}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              {/* Tree Species */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#595d57] whitespace-nowrap">树种</span>
                <div className="flex items-center gap-1 p-0.5 bg-[#efede7] rounded-lg border border-[#e2dfd7]">
                  {SPECIES_OPTIONS.map((opt) => {
                    const active = species === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSpeciesChange(opt.id)}
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#faf9f6] text-[#181a18] shadow-xs'
                            : 'text-[#595d57] hover:text-[#181a18]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs border border-black/15 shrink-0"
                          style={{ backgroundColor: opt.swatch }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Seasons */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#595d57] whitespace-nowrap">四季</span>
                <div className="flex items-center gap-1 p-0.5 bg-[#efede7] rounded-lg border border-[#e2dfd7]">
                  {SEASON_OPTIONS.map((opt) => {
                    const active = season === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSeasonChange(opt.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#faf9f6] text-[#181a18] shadow-xs'
                            : 'text-[#595d57] hover:text-[#181a18]'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-xs border border-black/15 shrink-0"
                          style={{ backgroundColor: opt.swatch }}
                        />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Weather */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#595d57] whitespace-nowrap">气象</span>
                <div className="flex items-center gap-1 p-0.5 bg-[#efede7] rounded-lg border border-[#e2dfd7]">
                  {WEATHER_OPTIONS.map((opt) => {
                    const active = weather === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onWeatherChange(opt.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#faf9f6] text-[#181a18] shadow-xs'
                            : 'text-[#595d57] hover:text-[#181a18]'
                        }`}
                      >
                        {opt.icon === 'sun' && <Sun className="w-3 h-3" />}
                        {opt.icon === 'rain' && <CloudRain className="w-3 h-3" />}
                        {opt.icon === 'snow' && <Snowflake className="w-3 h-3" />}
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Butterflies & Birds */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleButterflies}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    butterfliesEnabled
                      ? 'bg-[#eef4ef] border-[#b8cbbd] text-[#1f4031]'
                      : 'bg-[#faf9f6] border-[#dad6cc] text-[#595d57] hover:text-[#181a18]'
                  }`}
                  title="显示或隐藏树下彩色蝴蝶"
                >
                  <ButterflyIcon />
                  <span>蝴蝶</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleBirds}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    birdsEnabled
                      ? 'bg-[#eef4ef] border-[#b8cbbd] text-[#1f4031]'
                      : 'bg-[#faf9f6] border-[#dad6cc] text-[#595d57] hover:text-[#181a18]'
                  }`}
                  title="显示或隐藏空中飞鸟与鸟鸣声"
                >
                  <Bird className="w-3.5 h-3.5" />
                  <span>小鸟</span>
                </button>
              </div>

              {/* Audio */}
              <button
                type="button"
                onClick={onToggleMute}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !muted
                    ? 'bg-[#eef4ef] border-[#b8cbbd] text-[#1f4031]'
                    : 'bg-[#faf9f6] border-[#dad6cc] text-[#595d57] hover:text-[#181a18]'
                }`}
                title="开启或关闭鸟鸣与细雨声效"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{muted ? '静音' : '音效'}</span>
              </button>

              {/* Wind */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#595d57] whitespace-nowrap">飘落</span>
                <div className="flex items-center gap-1 p-0.5 bg-[#efede7] rounded-lg border border-[#e2dfd7]">
                  {WIND_OPTIONS.map((opt) => {
                    const active = windLevel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onWindChange(opt.id)}
                        className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#faf9f6] text-[#181a18] shadow-xs'
                            : 'text-[#595d57] hover:text-[#181a18]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Thumb Bar + Expandable Drawer (< md) */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 pointer-events-none">
        {collapsed ? (
          <div className="flex justify-center pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="pointer-events-auto inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-xl bg-[#faf9f6] border border-[#d8d4ca] text-xs font-medium text-[#181a18] shadow-md cursor-pointer"
            >
              <ChevronUp className="w-4 h-4 text-[#1f4031]" />
              <span>展开控制</span>
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto flex flex-col">
            {/* Expandable Settings Drawer */}
            {mobileDrawerOpen && (
              <div className="bg-[#faf9f6] border-t border-[#d8d4ca] rounded-t-2xl shadow-[0_-12px_32px_-12px_rgba(24,26,24,0.2)] max-h-[52dvh] overflow-y-auto overscroll-contain px-4 py-3.5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#181a18]">树种与环境调节</span>
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen(false)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#efede7] text-xs font-medium text-[#4a4e49] cursor-pointer"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>收起面板</span>
                  </button>
                </div>

                {/* Species */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-[#595d57]">树种形态</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SPECIES_OPTIONS.map((opt) => {
                      const active = species === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onSpeciesChange(opt.id)}
                          className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                              : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49]'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs border border-black/15 shrink-0"
                            style={{ backgroundColor: opt.swatch }}
                          />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Morph Scrubber */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#595d57]">形态生长进度</span>
                    <span className="font-mono-tabular font-semibold text-[#1f4031]">{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={pct}
                    onChange={(e) => onScrubProgress(Number(e.target.value) / 100)}
                    aria-label="形态变换进度"
                    className="morph-slider w-full py-2"
                  />
                </div>

                {/* Seasons */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-[#595d57]">四季时令</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SEASON_OPTIONS.map((opt) => {
                      const active = season === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onSeasonChange(opt.id)}
                          className={`min-h-[42px] inline-flex items-center justify-center gap-1.5 px-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                              : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49]'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs border border-black/15 shrink-0"
                            style={{ backgroundColor: opt.swatch }}
                          />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Weather & Wind */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-[#595d57]">气象</div>
                    <div className="grid grid-cols-3 gap-1">
                      {WEATHER_OPTIONS.map((opt) => {
                        const active = weather === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onWeatherChange(opt.id)}
                            className={`min-h-[40px] inline-flex flex-col items-center justify-center gap-0.5 px-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                              active
                                ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                                : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49]'
                            }`}
                          >
                            {opt.icon === 'sun' && <Sun className="w-3.5 h-3.5" />}
                            {opt.icon === 'rain' && <CloudRain className="w-3.5 h-3.5" />}
                            {opt.icon === 'snow' && <Snowflake className="w-3.5 h-3.5" />}
                            <span>{opt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-[#595d57]">飘落风力</div>
                    <div className="grid grid-cols-3 gap-1">
                      {WIND_OPTIONS.map((opt) => {
                        const active = windLevel === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onWindChange(opt.id)}
                            className={`min-h-[40px] inline-flex items-center justify-center px-1 rounded-lg border text-[11px] font-medium cursor-pointer ${
                              active
                                ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                                : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#4a4e49]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Wildlife, Audio & File Tools */}
                <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={onToggleButterflies}
                    className={`min-h-[42px] inline-flex flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      butterfliesEnabled
                        ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                        : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#595d57]'
                    }`}
                  >
                    <ButterflyIcon />
                    <span>蝴蝶</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleBirds}
                    className={`min-h-[42px] inline-flex flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      birdsEnabled
                        ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                        : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#595d57]'
                    }`}
                  >
                    <Bird className="w-3.5 h-3.5" />
                    <span>小鸟</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className={`min-h-[42px] inline-flex flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] font-medium cursor-pointer ${
                      !muted
                        ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                        : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#595d57]'
                    }`}
                  >
                    {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{muted ? '静音' : '音效'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[42px] inline-flex flex-col items-center justify-center gap-0.5 rounded-lg border border-[#dad6cc] bg-[#faf9f6] text-[11px] font-medium text-[#2c2f2b] cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>换图</span>
                  </button>
                  <button
                    type="button"
                    onClick={onExportQr}
                    className="min-h-[42px] inline-flex flex-col items-center justify-center gap-0.5 rounded-lg border border-[#dad6cc] bg-[#faf9f6] text-[11px] font-medium text-[#2c2f2b] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>2D图</span>
                  </button>
                </div>
              </div>
            )}

            {/* Slim Mobile Thumb Bar (<= ~10% viewport height) */}
            <div className="bg-[#faf9f6] border-t border-[#d8d4ca] px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="grid grid-cols-5 gap-1.5 items-center">
                <button
                  type="button"
                  onClick={onToggleMode}
                  className="col-span-2 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-2.5 rounded-lg bg-[#1f4031] active:bg-[#173226] text-[#faf9f6] text-xs font-medium cursor-pointer"
                >
                  {mode === 'tree' ? (
                    <>
                      <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>转 2D 图</span>
                    </>
                  ) : (
                    <>
                      <Trees className="w-3.5 h-3.5 shrink-0" />
                      <span>长成 3D 树</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onCameraViewChange(isTopView ? 'side' : 'top')}
                  className={`min-h-[42px] inline-flex items-center justify-center gap-1 px-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                    isTopView
                      ? 'bg-[#eef4ef] border-[#1f4031] text-[#1f4031]'
                      : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#2c2f2b]'
                  }`}
                >
                  {isTopView ? <Trees className="w-3.5 h-3.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 shrink-0" />}
                  <span>{isTopView ? '侧视' : '俯视'}</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenVideoExport}
                  className="min-h-[42px] inline-flex items-center justify-center gap-1 px-1.5 rounded-lg border border-[#b8cbbd] bg-[#eef4ef] text-xs font-medium text-[#1f4031] cursor-pointer"
                >
                  <Film className="w-3.5 h-3.5 shrink-0" />
                  <span>导出</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setMobileDrawerOpen((o) => !o)}
                    className={`flex-1 min-h-[42px] inline-flex items-center justify-center gap-1 px-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      mobileDrawerOpen
                        ? 'bg-[#181a18] border-[#181a18] text-[#faf9f6]'
                        : 'bg-[#f4f2ec] border-[#e2dfd7] text-[#2c2f2b]'
                    }`}
                    aria-expanded={mobileDrawerOpen}
                    aria-label="展开树种与环境设置"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                    <span>调节</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      onToggleCollapse();
                    }}
                    className="min-h-[42px] px-1.5 inline-flex items-center justify-center rounded-lg border border-[#e2dfd7] bg-[#faf9f6] text-[#595d57] cursor-pointer"
                    aria-label="隐藏控制栏"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
