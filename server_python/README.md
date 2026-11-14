# AIGC LivePhoto Maker (Python Engine)

基于开源项目 [hacoresapling/AIGC-LivePhoto-Maker](https://github.com/hacoresapling/AIGC-LivePhoto-Maker) 拆解并针对前端生成的 `jpg` 与 `mov` 优化的高性能实况照片服务端。

## ✨ 特性

1. **Apple iOS Live Photo 原生兼容**：
   - 生成 36 位统一 UUID（`ContentIdentifier`）。
   - 注入真正的苹果专有 EXIF MakerNotes 结构（Tag `0x0011`），适配 iOS 相册实况识别协议。
   - 使用 FFmpeg 将短视频重整为 AVFoundation 规范的 H.264 4:2:0 MOV 格式（含 QuickTime 元数据原子轨道与 ExifTool 标签增强）。
   - 支持标准 `.zip` 配对包与 `.pvt` 原生实况相册包。
2. **Android 动态照片 (Motion Photo) 原生兼容**：
   - 遵循 Google Camera (GCamera) MicroVideo 标准。
   - 注入 XMP 命名空间标签并完成二进制尾部嵌流。
3. **基于 `uv` 极速管理**：开箱即用，秒级启动。
4. **支持局域网手机调试**：启动时自动打印本机 IP，同一局域网手机可直接扫码/访问与测试。

---

## 🚀 快速启动

在项目根目录下或 `server_python` 目录下运行：

```bash
cd server_python

# 使用 uv 启动开发服务（监听 0.0.0.0:8000）
uv run python main.py
```

或者使用 uvicorn 命令启动：

```bash
cd server_python
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

启动后控制台会输出：
```text
============================================================
🚀 AIGC LivePhoto Maker (Python Engine) Started!
👉 Local:   http://localhost:8000
📱 Mobile:  http://192.168.x.x:8000 (在同一局域网/WiFi下手机可访问)
📄 Docs:    http://localhost:8000/docs
============================================================
```

---

## 📡 核心 API 说明

### 1. 健康检查与网络状态
- **GET** `/api/health`
- 返回当前服务状态、FFmpeg、ExifTool 检测情况与局域网手机可访问的 IP 列表。

### 2. 生成实况照片
- **POST** `/api/live-photo`
- **请求格式**：`multipart/form-data`
- **参数说明**：
  - `jpg`（文件，必填）：封面静态图片
  - `mov`（文件，必填）：配套动效视频（.mov 或 .mp4）
  - `stem`（字符串，选填）：输出文件名主干，如 `IMG_TREE_TO_QR`
  - `direction`（字符串，选填）：过渡方向，如 `tree-to-qr` 或 `qr-to-tree`
  - `platform`（字符串，选填）：`apple`（默认）或 `android`
  - `bundle_format`（字符串，选填）：`zip`（默认）或 `pvt`
  - `direct_download`（Query 参数，选填）：如果为 `true` 则直接返回文件下载流。

**调用示例 (cURL)**：
```bash
curl -X POST "http://localhost:8000/api/live-photo" \
  -F "jpg=@sample.jpg" \
  -F "mov=@sample.mov" \
  -F "stem=IMG_TREE_TO_QR" \
  -F "direction=tree-to-qr" \
  -F "platform=apple"
```

响应示例：
```json
{
  "ok": true,
  "jobId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "platform": "apple",
  "uuid": "4FE24B6D-55D4-4328-917C-80A045EB6609",
  "stem": "IMG_TREE_TO_QR",
  "jpgFilename": "IMG_TREE_TO_QR.JPG",
  "movFilename": "IMG_TREE_TO_QR.MOV",
  "zipFilename": "IMG_TREE_TO_QR_LivePhoto.zip",
  "jpgUrl": "/api/live-photo/download/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/IMG_TREE_TO_QR.JPG",
  "movUrl": "/api/live-photo/download/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/IMG_TREE_TO_QR.MOV",
  "zipUrl": "/api/live-photo/download/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/IMG_TREE_TO_QR_LivePhoto.zip"
}
```

---

## 📱 手机导入指南

1. **iPhone / iPad**：
   - 下载生成的 `.zip` 并解压，得到配对的 `<STEM>.JPG` 和 `<STEM>.MOV`。
   - 使用 Mac **隔空投送 (AirDrop)** 同时将这两个文件发送到 iPhone；或者在 Mac 上将包含两个文件的文件夹后缀重命名为 `.pvt` 再发送。
   - iPhone 相册接收后会自动将其识别为单一 **“实况照片”**，相册左上角显示“实况”，长按即可触发动效。
2. **Android**：
   - 选择 `platform=android` 生成单张 `_MotionPhoto.jpg`。
   - 直接保存到手机相册（Google 相册 / 三星相册等），长按即可播放动态微视频。

