---
title: "feat: Add text-cover pipeline mode for floating text watermarks"
type: feat
status: completed
date: 2026-03-31
---

# feat: Add text-cover pipeline mode for floating text watermarks

## Overview

在現有 VWRS inpainting pipeline 之外，新增一條「文字遮蓋」pipeline mode（`text-cover`）。

核心差異：現有 pipeline 需要使用者手動提供 ROI 或 mask video；新模式會**自動偵測**影片中的文字水印位置，再用遮蓋（blur / block）取代修復，適合快速批次處理品質要求中等的場景。

## Problem Frame

浮動文字水印（半透明、可能漂移的版權字幕）是最常見的水印類型，但現有 pipeline 有兩個摩擦點：

1. 使用者需要先知道水印位置（ROI），或自備 mask video
2. 完整 inpainting（LaMa/ZITS）對「只需遮蓋」的用例過重

新 pipeline mode 目標：零前置操作、自動偵測、秒級批次處理。

## Requirements Trace

- R1. 使用者只需提供輸入影片，系統自動偵測文字水印並遮蓋輸出
- R2. 偵測後端可選（PaddleOCR / EasyOCR），允許速度/精度切換
- R3. 遮蓋策略可選（gaussian_blur / solid），滿足快速批次處理需求（lama 策略不符合「秒級批次」目標，移除出本 mode）
- R4. 新模式透過 `--pipeline-mode text-cover` CLI flag 啟用，不破壞現有 `watermark` 模式
- R5. API 同步支援新欄位（`pipeline_mode`, `text_detect_backend`, `cover_strategy`）
- R6. 每個 feature-bearing 模組有獨立測試，可用合成帶文字影格驗證

## Scope Boundaries

- **不包含** SAM2 精確多邊形 mask（保留為 future enhancement）
- **不包含** `src/tasks/video.py:process_video` Celery task 的 signature 更新（task 目前是 stub；text-cover 僅透過 `api/worker/processor.py` worker path 支援，後續 Celery 整合需另行同步新參數）
- **不包含** 原始 `watermark` mode pipeline 的任何改動（tracking / temporal_ref / spatial_restore / integration）
- **不包含** 訓練或微調 OCR 模型
- **不包含** 即時（realtime）處理優化
- **不包含** `lama` cover strategy（LaMa 推理不符合「秒級批次處理」目標；需要 LaMa 修復的用例繼續使用現有 `watermark` mode + `restoration_backend=learned`）
- **不包含** delogo ffmpeg 整合（此版本不實作；後續 milestone 可追加 `--cover-strategy delogo` CLI shortcut）

## Context & Research

### Relevant Code and Patterns

- `src/pipeline.py` — `PipelineConfig` (dataclass) + `VideoPipeline.run()` 6-phase orchestrator
- `src/pipeline.py:_load_or_generate_masks()` — 新 text-cover 模式在此插入偵測邏輯
- `src/pipelines/spatial_restore.py` — `BaseRestorer` ABC + if/elif factory，新遮蓋策略跟隨此模式
- `src/pipelines/dl_inpainting.py` — `DLRestorationBackend` ABC，可選複用 LamaRestorer
- `api/schemas/pipeline.py` — `PipelineParams` Pydantic model，需新增欄位
- `api/services/pipeline_bridge.py` — `params_to_config()` 橋接函數，需傳遞新欄位
- `tests/` — pytest + 合成 frame pattern (`np.ones(...) * 100` + 手繪 mask)

### Institutional Learnings

- VWRS mask pipeline 視 mask 為黑盒：只要 `List[np.ndarray]` 格式正確，後續 phase 無需修改
- 任何新 backend 應從 ABC 繼承，保持 if/elif factory 風格（不引入 registry 框架）

### External References

- **PaddleOCR PP-OCRv5** — Mobile 模型 GPU 推理 6-11ms/幀，Python API: `PaddleOCR(use_gpu=True).ocr(frame)`，輸出多邊形 bbox
- **EasyOCR** — `reader.readtext(frame, batch_size=8)`，矩形 bbox，適合 CPU-only 或快速原型
- **RapidOCR** — PaddleOCR ONNX 版本，解決 PaddlePaddle + PyTorch CUDA 衝突問題
- **ffmpeg delogo** — `delogo=x=X:y=Y:w=W:h=H:band=4:show=0`，僅適合靜態固定位置

### Key Pitfall (from research)

- PaddleOCR + PyTorch（LaMa）共存可能有 CUDA 衝突 → 建議 `text-cover` 模式下先完成所有幀偵測，再釋放 OCR 模型
- OCR bbox 常略小於實際文字 → 所有 bbox 需 +4-8px padding
- 半透明水印 OCR 可能漏偵測 → 支援使用者手動設 `confidence_threshold`

## Key Technical Decisions

- **不新增新 pipeline class，text-cover 直接繞過 SpatialRestorer（不走 factory）**：`TextCoverRestorer` 為獨立 class，Unit 4 的 `_apply_cover()` 直接實例化，不透過 `SpatialRestorer.__init__` factory entry。原因：`SpatialRestorer.restore()` 返回 `(restored_frames, applied_masks)` tuple，其三步邏輯（複製參考幀→識別剩餘→inpainting）對遮蓋毫無意義；Unit 2 不需在 SpatialRestorer factory 加入 text-cover entry（避免死代碼）
- **text-cover 路徑跳過 tracking + temporal_ref + BoundaryBlender**：`VideoPipeline.run()` 加 mode guard：`text-cover` 模式直接從 `_load_or_generate_masks()` 跳到 `_apply_cover()`，跳過 Phase 2（tracking）、Phase 3（temporal_ref）、Phase 5（BoundaryBlender）。BoundaryBlender 不適合 cover 路徑（會把 blur 色塊滲出到周圍像素，產生暈圈）。僅保留 Phase 6（TemporalRefiner）防閃爍。`_apply_cover()` 明確返回純 `List[np.ndarray]`（非 tuple），與 `_integrate_and_blend()` 介面對齊
- **lama 策略不在本 mode 支援**：LaMa 推理（CPU 3-10s/幀）無法滿足「秒級批次處理」目標；需要 LaMa 文字遮蓋的用例使用現有 `watermark` mode + `restoration_backend=learned`
- **偵測間隔 + 線性插值（前提：勻速漂移水印）**：每 N 幀偵測一次（預設 N=10），中間幀 bbox 線性插值。前提：水印漂移為勻速；淡入淡出或間歇出現的水印需 `--detect-interval 1`。空 bbox 採樣點不參與插值（中間幀保持空）
- **PaddleOCR 為 primary，EasyOCR 為 fallback**：PP-OCRv5 支援傾斜/旋轉文字；EasyOCR 作為 CPU-only 降級選項
- **Optional extra 依賴**：新依賴加入 `pyproject.toml` `[text-cover]` extra group，不影響現有 install
- **`_spatial_restoration()` 現有 tuple return bug 不在本次範圍**：`pipeline.py:219` 的 SpatialRestorer 呼叫已有 method kwarg bug；text-cover 路徑完全繞過此路徑，不引入也不修復，但 Unit 4 驗證需確認現有 watermark 路徑 regression test 仍通過

## Open Questions

### Resolved During Planning

- **Q: 新增獨立 pipeline class 還是 branch？** → 使用 branch，mask 格式相同，不需複製 pipeline 邏輯
- **Q: ffmpeg delogo 是否整合到 Python pipeline？** → **此版本不實作**，列為 future milestone。delogo 作為 `--cover-strategy` 選項需要 subprocess ffmpeg 整合 + 版本相容性測試，超出本次範圍
- **Q: CUDA 衝突如何處理？** → 文件說明 + 建議 RapidOCR (ONNX) 替代；程式碼不強制處理，由使用者環境決定

### Deferred to Implementation

- **PaddleOCR API 版本差異**：PP-OCRv5 的 Python API 調用細節需實際安裝確認（`use_angle_cls` 參數在新版可能已更名）
- **EasyOCR bbox 格式轉換**：EasyOCR 返回四點格式，轉換到 `(x, y, w, h)` 的邊界確認需實測
- **合成帶文字影格的最佳 OCR 偵測閾值**：實際合成測試後再定 `ocr_confidence_threshold` 預設值（初始建議 0.5）
- **`SpatialRestorer.__init__` 現有 bug**：`pipeline.py:219` 傳 `method=self.config.restoration_method` 給 `SpatialRestorer`，但後者不接受 `method` kwarg（只有 `backend + radius`）——這是現有 bug，text-cover 路徑繞過 `SpatialRestorer`，不引入也不修復此 bug
- **OCR 信心閾值最佳值**：`ocr_confidence_threshold` 預設 0.5，實際合成測試後可能需調整；實作時以不同閾值對合成帶文字影格做一次 sweep，再定入預設值

## High-Level Technical Design

> *此圖說明預計的解決方案架構，為方向性指引，非實作規範。實作時以此為背景，不需逐字複現。*

```
CLI / API
    │
    ▼
PipelineConfig
  ├── pipeline_mode: "text-cover"
  ├── text_detect_backend: "paddleocr" | "easyocr"
  ├── cover_strategy: "gaussian_blur" | "solid"   ← lama 已移除
  ├── detect_interval: int (default=10)
  ├── bbox_padding: int (default=6)
  └── ocr_confidence_threshold: float (default=0.5)
    │
    ▼
VideoPipeline._load_or_generate_masks()
    │
    ├── [watermark mode] ── 現有完整 6-phase 流程（不改動）
    │
    └── [text-cover mode]
            │
            ▼
        TextDetector（新 ABC）
            ├── PaddleOCRDetector（primary）
            └── EasyOCRDetector（fallback）
                │
                ▼
            偵測採樣（每 detect_interval 幀，空 bbox 不插值）
            + bbox padding
            + 線性插值（僅非空採樣點之間）
                │
                ▼
            List[np.ndarray] masks
                │
                ▼ （跳過 Phase 2 tracking + Phase 3 temporal_ref + Phase 5 BoundaryBlender）
                │
            _apply_cover(frames, masks)
            → TextCoverRestorer（獨立 class，不走 SpatialRestorer factory）
              ├── gaussian_blur: GaussianBlur on mask region
              └── solid: fill mask region with color
                │
                ▼ （返回純 List[np.ndarray]，非 tuple）
                │
            Phase 6: TemporalRefiner 防閃爍（保留）
                │
                ▼
            VideoWriter output
```

## Implementation Units

### 依賴順序

```mermaid
graph TB
    U1[Unit 1: TextDetector + backends] --> U3[Unit 3: PipelineConfig extension]
    U2[Unit 2: TextCoverRestorer] --> U3
    U3 --> U4[Unit 4: VideoPipeline mode branch]
    U4 --> U5[Unit 5: API schema + bridge]
    U4 --> U6[Unit 6: CLI update]
```

---

- [x] **Unit 1: TextDetector ABC + PaddleOCR / EasyOCR 後端**

**Goal:** 實作文字偵測抽象層，提供兩個具體後端，輸出統一格式 bbox list

**Requirements:** R1, R2, R6

**Dependencies:** None

**Files:**
- Create: `src/pipelines/text_detect.py`
- Test: `tests/test_text_detect.py`

**Approach:**
- 定義 `TextDetector` ABC，核心方法 `detect(frame: np.ndarray) -> List[Tuple[int,int,int,int]]`，返回 `[(x, y, w, h)]`
- `PaddleOCRDetector(TextDetector)` — 懶加載 `PaddleOCR` 實例（避免 import 時初始化），只在 `confidence >= threshold` 時保留結果，多邊形 bbox 用 `cv2.boundingRect()` 轉矩形，並加 `bbox_padding`
- `EasyOCRDetector(TextDetector)` — 四點轉矩形相同邏輯，`batch_size` 作為初始化參數
- 工廠函數 `create_detector(backend: str, **kwargs) -> TextDetector`
- 偵測採樣邏輯與插值（`detect_interval`）放在 `TextDetectionSampler` helper class：`sample_all_frames(frames) -> List[List[Tuple]]`

**Execution note:** 先寫失敗的單元測試，再實作。

**Patterns to follow:**
- `src/pipelines/spatial_restore.py` — ABC + factory 風格
- `src/pipelines/dl_inpainting.py` — 懶加載模型 pattern

**Test scenarios:**
- Happy path: 合成帶白色文字的 BGR frame（用 `cv2.putText`）送入 `EasyOCRDetector`，回傳非空 bbox list，bbox 涵蓋文字區域
- Happy path: `TextDetectionSampler` 對 30 幀序列（每 10 幀一個新 bbox），插值後所有 30 幀都有非空 bbox
- Edge case: 純黑 frame（無文字）→ 返回空 list，不拋例外
- Edge case: `confidence_threshold=1.0`（極高閾值）→ 可能返回空 list，不拋例外
- Edge case: bbox_padding 使 bbox 超出 frame 邊界 → 自動 clamp 到 frame 尺寸
- Error path: OCR 後端未安裝（ImportError）→ `create_detector` 拋 `RuntimeError` 並附明確提示訊息

**Verification:**
- `pytest tests/test_text_detect.py` 全部通過
- `EasyOCRDetector` 不需要 GPU 即可在 CI 通過
- EasyOCR CI mock 策略：使用 `unittest.mock.patch` 替換 `easyocr.Reader` 實際推理（避免 CI 下載 ~100MB 模型），mock 返回固定 bbox 結果；實際模型推理僅在 integration test 標記（`@pytest.mark.integration`）中執行

---

- [x] **Unit 2: TextCoverRestorer（遮蓋策略）**

**Goal:** 實作遮蓋 restorer，支援 gaussian_blur 和 solid 策略，遵循現有 `BaseRestorer` 介面

**Requirements:** R3, R6

**Dependencies:** None（可並行於 Unit 1）

**Files:**
- Modify: `src/pipelines/spatial_restore.py`（新增 `TextCoverRestorer` class + factory if/elif）
- Test: `tests/test_text_cover_restorer.py`

**Approach:**
- `TextCoverRestorer` 為**獨立 class，不繼承 BaseRestorer，不加入 SpatialRestorer factory**（避免死代碼；text-cover 路徑直接實例化，不走 factory）
- 接受 `cover_strategy: str`（"gaussian_blur" | "solid"）和 `blur_ksize: int`（預設 51，必須為奇數）
- `gaussian_blur`：對每個 mask 非零區域取 ROI，套用 `cv2.GaussianBlur`
- `solid`：對 mask 非零區域填充指定 BGR color（預設純黑 `(0,0,0)`）
- 核心方法：`cover(frames: List[np.ndarray], masks: List[np.ndarray]) -> List[np.ndarray]`，返回純 list（非 tuple）

**Patterns to follow:**
- `src/pipelines/spatial_restore.py:TeleaRestorer` — 同介面

**Test scenarios:**
- Happy path: 帶矩形 mask 的 frame + gaussian_blur → mask 區域已被模糊，非 mask 區域像素不變
- Happy path: solid strategy → mask 區域像素值等於指定顏色
- Edge case: 空 mask（全零）→ frame 不變
- Edge case: mask 覆蓋整個 frame → 整幀模糊/填色，不拋例外
- Edge case: `blur_ksize=53`（奇數）→ 正常；`blur_ksize=52`（偶數）→ 自動調整為 53 或拋 ValueError（選其一並文件化）

**Verification:**
- `pytest tests/test_text_cover_restorer.py` 全部通過
- `TextCoverRestorer` 通過 `BaseRestorer` ABC 合規性測試（如有）

---

- [x] **Unit 3: PipelineConfig 新增 text-cover 欄位**

**Goal:** 在 `PipelineConfig` dataclass 加入新模式所需的配置欄位，有合理預設值

**Requirements:** R4

**Dependencies:** Unit 1, Unit 2（需先知道欄位名稱）

**Files:**
- Modify: `src/pipeline.py` — `PipelineConfig` dataclass

**Approach:**
新增以下 optional fields（均有預設值，不破壞現有程式碼）：
```
pipeline_mode: str = "watermark"             # "watermark" | "text-cover"
text_detect_backend: str = "easyocr"         # "paddleocr" | "easyocr"
cover_strategy: str = "gaussian_blur"        # "gaussian_blur" | "solid"
detect_interval: int = 10                    # 偵測採樣間隔（幀數）
bbox_padding: int = 6                        # bbox 擴展像素
ocr_confidence_threshold: float = 0.5       # OCR 信心度閾值（避免與 Tracker.confidence_threshold 衝突）
blur_ksize: int = 51                         # gaussian blur 核大小
```

**Test scenarios:**
- Happy path: 現有 `PipelineConfig()` 無新參數 → 所有新欄位使用預設值，`pipeline_mode == "watermark"`
- Edge case: 直接從 dict 構建 config（測試 dataclass 向後相容性）

**Verification:**
- 現有所有 `PipelineConfig` 相關測試繼續通過（無 regression）

---

- [x] **Unit 4: VideoPipeline 加入 text-cover mode branch**

**Goal:** 在 `_load_or_generate_masks()` 加入 text-cover 分支，在 `run()` 加 mode guard 跳過 tracking/temporal_ref/BoundaryBlender，並新增 `_apply_cover()` 私有方法

**Requirements:** R1, R3

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `src/pipeline.py` — `VideoPipeline._load_or_generate_masks()` + `run()`（加 mode guard + `_apply_cover()`）
- Test: `tests/test_pipeline_text_cover.py`

**Approach:**
- `_load_or_generate_masks()` 加 branch：`if self.config.pipeline_mode == "text-cover": masks = self._detect_text_regions(frames)`
- 新私有方法 `_detect_text_regions(frames) -> List[np.ndarray]`：初始化 `TextDetector`，呼叫 `TextDetectionSampler`，將 bbox list 轉為 mask ndarray
- `VideoPipeline.run()` 加 mode guard：`pipeline_mode == "text-cover"` 時，**跳過** Phase 2（`_track_and_stabilize()`）、Phase 3（`_fetch_temporal_references()`）、Phase 5（`BoundaryBlender`），直接呼叫新私有方法 `_apply_cover(frames, masks)`，再進入 Phase 6（`TemporalRefiner`）
- `_apply_cover(frames, masks) -> List[np.ndarray]`：直接實例化 `TextCoverRestorer`，呼叫 `cover(frames, masks)`，**明確返回純 `List[np.ndarray]`（非 tuple）**；不呼叫 lama（lama 不在本 mode 範圍）
- BoundaryBlender **不執行**於 text-cover 路徑（blur/solid cover 下 BoundaryBlender 會把遮蓋色滲出到周圍像素，產生暈圈 artifact）
- 現有 `watermark` mode 路徑：**不改動任何邏輯**

**Patterns to follow:**
- `src/pipeline.py:_load_or_generate_masks()` — 現有 ROI/mask_video if/elif 結構
- `src/pipeline.py` — 懶加載 `self._restorer`

**Test scenarios:**
- Happy path: 合成 3 幀帶文字影片（用 `cv2.putText`），`pipeline_mode="text-cover"`, `cover_strategy="gaussian_blur"` → pipeline run 成功，輸出影片帶文字區域被模糊；mask 邊界外一圈像素與原始幀相同（pixel-level assertion）
- BoundaryBlender bypass: text-cover mode 下驗證 `BoundaryBlender` 未被呼叫（`unittest.mock.patch` 斷言零呼叫次數）
- Integration: `pipeline_mode="watermark"`（現有模式）在加入新 branch 後繼續正常執行 → regression test
- Error path: `pipeline_mode="text-cover"` 且 OCR 後端未安裝 → pipeline 在 `_detect_text_regions` 階段 fail fast 並拋有意義的錯誤，不等到後續 phase 才 crash
- Edge case: 偵測結果為空（影片無文字）→ masks 全零，pipeline 繼續執行，輸出影片與輸入相同

**Verification:**
- `pytest tests/test_pipeline_text_cover.py` 全部通過
- `pytest tests/` 無 regression（現有測試套件通過率不低於當前基準）

---

- [x] **Unit 5: API schema + bridge 更新**

**Goal:** 讓 REST API 支援 `text-cover` 模式的三個新參數

**Requirements:** R5

**Dependencies:** Unit 3

**Files:**
- Modify: `api/schemas/pipeline.py` — `PipelineParams` 新增欄位
- Modify: `api/services/pipeline_bridge.py` — `params_to_config()` 傳遞新欄位
- Test: `tests_api/test_pipeline_schema.py`（如不存在則新建）

**Approach:**
- `PipelineParams` 加入：
  - `pipeline_mode: str = Field(default="watermark", pattern="^(watermark|text-cover)$")`
  - `text_detect_backend: str = Field(default="easyocr", pattern="^(paddleocr|easyocr)$")`
  - `cover_strategy: str = Field(default="gaussian_blur", pattern="^(gaussian_blur|solid)$")`
  - `detect_interval: int = Field(default=10, ge=1, le=100)`
  - `bbox_padding: int = Field(default=6, ge=0, le=30)`
  - `ocr_confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)`
  - `blur_ksize: int = Field(default=51, ge=1)`
- `params_to_config()` 透傳新欄位到 `PipelineConfig`（一對一映射，無額外邏輯）

**Test scenarios:**
- Happy path: `PipelineParams(pipeline_mode="text-cover", cover_strategy="gaussian_blur")` → Pydantic validation 通過
- Error path: `pipeline_mode="invalid"` → Pydantic `ValidationError`
- Error path: `detect_interval=0` → `ValidationError`（ge=1 constraint）
- Integration: `params_to_config(PipelineParams(pipeline_mode="text-cover"))` → 返回 `PipelineConfig` 且 `pipeline_mode == "text-cover"`

**Verification:**
- `pytest tests_api/` 無 regression
- OpenAPI schema（`/docs`）顯示新欄位及其 enum 值

---

- [x] **Unit 6: CLI 更新**

**Goal:** 在 `vwrs.py` 的 `process` subcommand 加入 `--pipeline-mode` 等新 flag

**Requirements:** R4

**Dependencies:** Unit 3

**Files:**
- Modify: `src/vwrs.py` — `_add_process_args()` 函數

**Approach:**
- 加入 `--pipeline-mode choices=["watermark", "text-cover"] default="watermark"`
- 加入 `--text-detect-backend choices=["paddleocr", "easyocr"] default="easyocr"`
- 加入 `--cover-strategy choices=["gaussian_blur", "solid"] default="gaussian_blur"`
- 加入 `--detect-interval type=int default=10`
- 加入 `--bbox-padding type=int default=6`
- 加入 `--blur-ksize type=int default=51`
- 更新 `epilog` 範例 docstring 加入 `text-cover` 使用範例
- 在 `main()` 的 `PipelineConfig` 構建處傳遞新 args

**Test scenarios:**
- Happy path: `python -m vwrs process --input x.mp4 --pipeline-mode text-cover --output y.mp4` → 解析成功
- Error path: `--pipeline-mode unknown` → argparse error，提示有效選項
- Test expectation: none for output format — CLI parsing can be verified via `parse_known_args` in unit test

**Verification:**
- `python -m vwrs process --help` 顯示新 flag 及說明

---

## System-Wide Impact

- **Interaction graph:** text-cover mode 完全跳過 Phase 2（`_track_and_stabilize()`）、Phase 3（`_fetch_temporal_references()`）、Phase 5（`BoundaryBlender`）；`BoundaryBlender` 不執行於 text-cover 路徑（對 blur/solid cover 會產生暈圈 artifact）。僅保留 Phase 6（`TemporalRefiner`）防閃爍。現有 `watermark` mode 路徑完整 6-phase 不變
- **Celery task gap（已知）：** `src/tasks/video.py:process_video` task signature 目前是 stub（模擬 300 幀），不呼叫 `VideoPipeline`；新參數 `pipeline_mode` 等未反映在 task 層。本計劃範圍是 API + worker processor path（`api/worker/processor.py` 走 `VideoPipeline`），Celery task 路徑不在範圍內，但需在 Scope Boundaries 標記為後續同步需求
- **Error propagation:** OCR 後端載入失敗在 `_detect_text_regions()` 即 fail fast；`detect_interval=0` 需在 `TextDetectionSampler` 入口驗證（dataclass 不做 validation）
- **State lifecycle risks:** `PaddleOCR` / `EasyOCR` 模型懶加載，每次 job 新建實例；`api/worker/processor.py` `max_concurrent=2` 情境下，兩個並發 text-cover job 各自持有一份 OCR 模型 + 完整 frames list，peak memory 較現有模式高，需在 README 標注
- **API surface parity:** `PipelineParams.pipeline_mode` pattern 必須與 `PipelineConfig` 允許值同步（建議共用 literal constant）
- **Integration coverage:** Unit 4 integration test 需驗證 text-cover → 遮蓋輸出的端到端 frame diff（mask 區域像素被改變，非 mask 區域不變）
- **Unchanged invariants:** 現有 `pipeline_mode="watermark"` 路徑、所有 `PipelineConfig` 欄位預設值、`pipeline_bridge.params_to_config()` 現有映射均不改動

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| PaddleOCR + PyTorch CUDA 版本衝突 | 預設後端為 EasyOCR（無 PaddlePaddle 依賴）；文件說明 PaddleOCR 需獨立 conda env 或 RapidOCR (ONNX) |
| 半透明水印 OCR 漏偵測 | 暴露 `ocr_confidence_threshold` 給使用者調整；文件說明 CLAHE 前處理技巧（進階 FAQ） |
| `detect_interval` 插值誤差（水印快速漂移） | 預設 N=10 保守；使用者可設 `--detect-interval 1` 強制逐幀偵測 |
| EasyOCR 在無 GPU 機器速度過慢 | README 標注 EasyOCR CPU 適用 < 5min 影片；GPU 建議 PaddleOCR |
| 新 `optional [text-cover]` extra 破壞現有 install | 新依賴放入 `pyproject.toml` optional extras，不加入 base requirements |
| Celery task 靜默忽略新參數（未來風險） | Scope 已明確排除；Celery task 整合時需同步更新 `process_video` signature |
| 兩個並發 text-cover job 的 peak memory | Worker `max_concurrent=2` 情境下，兩個 OCR 模型實例 + 完整 frames list 共存；README 標注建議單並發用於長影片 |
| `detect_interval=0` 除零（dataclass 無 validation） | `TextDetectionSampler.__init__` 加 `assert detect_interval >= 1` guard |

## Documentation / Operational Notes

- `requirements.txt` 或 `pyproject.toml` 新增 `[text-cover]` extra：`paddleocr>=2.8`, `easyocr>=1.7`
- README 新增 `text-cover` 使用範例段落，說明安裝、典型命令、與現有 mode 的差異
- API OpenAPI schema 自動更新（Pydantic + FastAPI 自動生成，無需手動維護）

## Sources & References

- Related code: `src/pipeline.py`, `src/pipelines/spatial_restore.py`, `src/pipelines/dl_inpainting.py`
- External: [PaddleOCR PP-OCRv5](https://github.com/PaddlePaddle/PaddleOCR), [EasyOCR](https://github.com/JaidedAI/EasyOCR)
- Related art: [YaoFANGUK/video-subtitle-remover](https://github.com/YaoFANGUK/video-subtitle-remover), [hjunior29/video-text-remover](https://github.com/hjunior29/video-text-remover)
- ffmpeg delogo filter: https://ffmpeg.org/ffmpeg-filters.html#delogo
