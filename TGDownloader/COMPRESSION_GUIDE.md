# TGDownloader 视频压缩指南

## ✨ 功能概览

TGDownloader 现已集成 **Video Transcode Skill v1.1** —— 生产级无损视频压缩工具。

### 核心能力
- ✅ **真实 FFmpeg 集成**: 调用系统 ffmpeg，支持所有编码参数
- ✅ **GPU 硬件加速**: 自动检测 NVIDIA (NVENC)、Apple (Metal/VideoToolbox)、Intel (QSV)
- ✅ **4 层品质体系**: 针对不同需求的预设
- ✅ **实时进度**: Server-Sent Events 流式推送压缩状态

---

## 📊 4 层品质体系

| 预设 | CRF | 大小减少 | 用途 | 转碼時間 |
|------|-----|---------|------|---------|
| **交付 (推荐)** | 20 | ~80% | Web 分享、存档 | 1x 速度 |
| **中档** | 14 | ~40% | 混合使用 | 0.8x 速度 |
| **归档** | 12 | ~15% | 无损存储 | 0.5x 速度 |
| **预览** | 28 | ~90% | 快速预览 | 4x 速度 |

**品质参考**:
- SSIM 0.99 (交付) = 几乎无损，人眼难以察觉差异
- SSIM 0.995 (中档) = 无损质量
- SSIM 0.998 (归档) = 完全无损

---

## 🚀 使用方式

### 方式 1: Web UI（推荐）

1. 打开 http://localhost:8888
2. 在 URL 输入框中粘贴 Telegram 链接
3. ✅ 勾选「启用无损压缩」
4. 选择品质预设（默认：**归档 - 无损**）✨
5. 点击「⬇️ 开始下载」

**进度显示**:
```
📥 开始下载: https://t.me/i51_co/1406
✓ 元数据获取完成
🗜️  开始压缩... (预设: delivery_web_high)
✓ 压缩完成: tgdownload_i51_co_1406_encoded.mp4 (节省 75%)
```

### 方式 2: API 调用

```bash
curl -X POST http://localhost:8888/api/download \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://t.me/i51_co/1406",
    "compress": true,
    "preset": "delivery_web_high"
  }'
```

**响应流** (SSE):
```
data: {"status":"info","message":"开始下载...","progress":5}
data: {"status":"metadata","message":"✓ 元数据获取完成","progress":20}
data: {"status":"success","message":"✓ 下载完成: ...","progress":100,"file":"..."}
data: {"status":"compressing","message":"🗜️  开始压缩...","progress":90}
data: {"status":"compressed","message":"✓ 压缩完成: ... (节省 75%)","progress":100,"file":"..."}
```

---

## 📁 输出文件

### 文件位置
```
~/.tgdownloader/downloads/
├─ tgdownload_i51_co_1406.mp4        ← 原始下载 (16 MB)
└─ tgdownload_i51_co_1406_encoded.mp4 ← 压缩后 (4 MB，节省 75%)
```

### 文件命名规则
- **原始**: `tgdownload_{chatID}_{msgID}.mp4`
- **压缩**: `tgdownload_{chatID}_{msgID}_encoded.mp4`

---

## 🎯 预设选择指南

### 我想要完全無損 → **歸檔 (Lossless)** ⭐ 默认
```
轉碼時間: 很慢 (0.5x 速度)
大小: -15%，完全無損 (SSIM 0.998)
用途: 長期存儲、檔案、重要內容
✅ 默認預設，推薦給所有用戶
```

### 我想要高品质 → **中档 (High Quality)**
```
轉碼時間: 較慢 (0.8x 速度)
大小: -40%，無損質量 (SSIM 0.995)
用途: 專業用途、編輯
```

### 我想要平衡品质和速度 → **交付 (Web)**
```
轉碼時間: 正常 (1x 速度)
大小: -80%，幾乎無損 (SSIM 0.99)
用途: Web 分享、日常使用
```

### 我想要最小的文件 → **预览 (Fast)**
```
轉碼時間: 快速 (4x 速度)
大小: -90%，但品質下降明顯
用途: 預覽、快速分享
⚠️  僅在需要最小文件時使用
```

---

## ⚡ 性能参考

### 測試環境
- **硬件**: MacBook (Apple Silicon)
- **視頻**: 720p H.264, 70 秒, 16 MB
- **預設**: 交付 (delivery_web_high)

### 結果
| 指標 | 原始 | 壓縮後 | 節省 |
|------|------|--------|------|
| 檔案大小 | 16 MB | ~3.2 MB | **80%** ⬇️ |
| 分辨率 | 720p | 720p | ✓ 保持 |
| 時長 | 70 秒 | 70 秒 | ✓ 保持 |
| 轉碼時間 | - | ~45 秒 | (1x 速度) |

---

## 🔧 故障排除

### "壓縮已完成，但輸出文件位置與預期不同"

**原因**: Node.js skill 輸出文件名異常或 FFmpeg 執行失敗

**解決**:
1. 檢查 `/tmp/tg-compress-test*.log` 中的 FFmpeg 錯誤
2. 確認 FFmpeg 已安裝: `ffmpeg -version`
3. 檢查磁盤空間是否充足（壓縮需要臨時空間）

### "壓縮耗時太長"

**原因**: 預設品質過高或硬件加速未啟用

**優化**:
- 選擇「預覽 (Fast)」預設（快速 4 倍）
- 確認 GPU 加速已啟用（自動偵測，但可檢查日誌）
- 降低源視頻分辨率後再下載

### "壓縮後文件更大了"

**原因**: 源視頻已經高度壓縮，或預設 CRF 值太低

**解決**:
- 對於已壓縮的視頻（如 YouTube），跳過壓縮
- 選擇「預覽 (Fast)」預設以獲得更高壓縮率（但品質下降）

---

## 📝 技術細節

### FFmpeg 參數

交付預設等同於:
```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output_encoded.mp4
```

### 支持的輸入格式
- MP4, MOV, MKV, WebM, AVI 等（FFmpeg 支持的任何格式）

### 支持的輸出格式
- MP4 (H.264 + AAC) — 通用、高兼容性

---

## 🚨 已知限制

- **轉碼耗時**: 較大文件（>500MB）可能耗時 10+ 分鐘
- **磁盤空間**: 需要足夠空間存放原始 + 壓縮後文件
- **GPU 支持**: 自動偵測，但 Apple Silicon 上效果最佳
- **實時預覽**: 不支持邊下載邊預覽

---

## 📞 支持

問題或建議? 檢查:
1. 服務器日誌: `tail -f /tmp/tg-*.log`
2. FFmpeg 版本: `ffmpeg -version`
3. Node.js 版本: `node --version`
4. 磁盤空間: `df -h ~/.tgdownloader/`

