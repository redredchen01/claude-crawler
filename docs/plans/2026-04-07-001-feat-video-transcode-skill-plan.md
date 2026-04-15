---
title: Implement video-transcode-skill v0.1.0
type: feat
status: active
date: 2026-04-07
depth: Standard
---

# Implement video-transcode-skill v0.1.0

## Overview

Build a quality-first video transcode Skill for the YD 2026 workspace. The tool provides a CLI + MCP interface with a fixed probe → plan → execute → validate flow. Core strategy: prefer passthrough, then remux, only transcode when necessary. Targets four presets (passthrough, mezzanine_h264_high, delivery_web_high, archive_lossless) with structured JSON output and unified error handling.

## Problem Frame

YD 2026 needs agent-friendly video preprocessing for workflows that require:
- Video standardization before watermark removal (VWRS)
- Intermediate mezzanine masters for detection/OCR pipelines
- Quality-first transcoding strategy (don't waste compute on unnecessary reencoding)
- Structured output for downstream agent orchestration
- No exposure of raw ffmpeg parameters to callers

## Requirements Trace

- **R1.** CLI with four subcommands: `probe`, `plan`, `run`, `validate`
- **R2.** Four presets: `passthrough_if_possible`, `mezzanine_h264_high`, `delivery_web_high`, `archive_lossless`
- **R3.** Fixed flow: probe (inspect) → plan (decide strategy) → execute (transcode/remux/copy) → validate (verify output)
- **R4.** Quality-first strategy: copy > remux > transcode > archive, never reencoding when not needed
- **R5.** Structured JSON output on all commands (--json flag)
- **R6.** Unified error code system with `ok`, `warnings`, `errors` in every response
- **R7.** Preset-driven, no raw ffmpeg args exposed to callers
- **R8.** Agent-friendly: every output parseable, every input validated, every error recoverable
- **R9.** Support thumbnail generation and output validation as optional post-processing
- **R10.** Timeout handling (default 7200s for 2h of footage)

## Scope Boundaries

- **Out of scope:** Real-time streaming, live transcoding, multi-GPU orchestration, custom filter graphs
- **Out of scope:** WebRTC/HLS muxing, DASH packaging (delivery-web preset outputs mp4 only, not adaptive streaming)
- **Out of scope:** Audio mixing, subtitle manipulation, metadata rewriting (passthrough preserves all metadata)
- **Out of scope:** Cloud storage integration (local files + directories only)

## Context & Research

### Relevant Code and Patterns

From workspace research:

- **VWRS** (`projects/production/video-watermark-removal-system/`) — mature 6-layer video pipeline with ffmpeg integration for chunking, duration probing, and frame I/O. Teaches: modular pipeline architecture, error recovery in multi-step flows, ffmpeg subprocess management.
- **TG Bot** (`projects/production/claude_code_telegram_bot/`) — 67 modules, Node.js ES Module + CLI structure, structured logging, JSON status files. Teaches: CLI tool design in Node.js, JSON serialization, error handling with retries.
- **YD-Utility-Kit** (`projects/production/yd-utility-kit/`) — 15 subcommands using Click framework. Teaches: multi-command CLI design (though this skill is TypeScript, the pattern applies).

### ffmpeg Integration Decisions

From VWRS and WM-Tool learnings:
- **Duration probing:** `ffprobe -v error -print_format json` (non-blocking, informational only)
- **Streaming copy:** `-c copy` (fastest, preserves codec/container mismatches)
- **Remuxing:** `-c copy` + container rewrite (fast, safe for standardization)
- **Transcoding:** preset-specific encoder args (`-c:v libx264 -preset slow -crf 17` for mezzanine)
- **Timeout handling:** per-job timeout with SIGTERM fallback
- **Subprocess safety:** `execa` with `timeout`, `stderr` pipe, no shell execution

### Institutional Learnings

- **Quality-first strategy** confirmed in VWRS: "don't reprocess if you don't have to" (saves compute, preserves original quality when possible)
- **Preset-driven design** validates against VWRS modular approach (config-driven, not parameter-explosions)
- **JSON output** established in TG Bot (every tool returns `ok`, `warnings`, `errors`)
- **Error codes** as constants (not magic strings), example: `ERROR_CODES = { INPUT_NOT_FOUND, PROBE_FAILED, TRANSCODE_FAILED, ... }`

### External References

- **ffmpeg documentation:** official codec guidelines (H.264 slow preset for mezzanine, H.264 fast for web delivery, FFV1+FLAC for archive)
- **Node.js best practices:** ES Module, `tsx` for dev, `tsup` for build, `vitest` for testing
- **Commander.js:** CLI arg parsing with subcommands, --json flags

## Key Technical Decisions

- **Language:** TypeScript (matches TG Bot + Skill ecosystem; ES Module for consistency)
- **Subprocess:** `execa` (more ergonomic than child_process, built-in timeout, stdio capture)
- **Error handling:** structured `ErrorItem` + `WarningItem` objects (not exceptions thrown from CLI)
- **Presets:** hardcoded in `presets/index.ts`, never parameterized (no raw ffmpeg args)
- **Strategy detection:** automatic (plan reads probe, decides copy vs remux vs transcode based on preset semantics)
- **Timeout default:** 7200s (2h), covers 4K 60fps slow-preset transcode (~1h real time + overhead)
- **Thumbnail:** optional, uses `ffmpeg -vf thumbnail` (1 I-frame per video, separate jpg)
- **Validation:** post-execution probe (verify output has video stream, is readable)

## Open Questions

### Resolved During Planning

- **Q: How to detect if passthrough is possible?** → Plan logic: if preset allows `copy` video codec and `copy` audio codec and no container rewrite needed, passthrough is optimal. `executePlan` will blindly succeed or fail; let execution discover runtime issues.
- **Q: Should we support input validation (file exists, readable)?** → Yes: `assertReadable()` in `fs.ts` before probe, fail fast with `INPUT_NOT_READABLE` error.
- **Q: How to handle no audio stream?** → Transcode audio with fallback codec (aac), mark action as `audio_action: "transcode"` in plan even if preset says copy.

### Deferred to Implementation

- **Exact ffmpeg encoder parameters for "slow" H.264 preset** — determined at implementation time based on testing actual output quality and encode times. Plan specifies "H.264, slow preset, high quality" — implementer chooses `-crf 17` or `-crf 18` based on validation.
- **Thumbnail extraction frame selection** — plan says "1 I-frame", implementation will test whether `thumbnail` filter or manual keyframe detection is faster.
- **GPU acceleration fallback logic** — defer to implementation (plan specifies `backend: auto` default, actual detection of NVIDIA/Intel/Apple happens at runtime).

## High-Level Technical Design

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Layer (Commander)               │
│  probe / plan / run / validate commands                 │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │  PROBE   │   │  PLAN    │   │ EXECUTE  │
    │ (ffprobe)│   │(decision)│   │(ffmpeg)  │
    └──────────┘   └──────────┘   └──────────┘
        │               │               │
        └───────────────┼───────────────┘
                        ▼
                   ┌──────────────┐
                   │  VALIDATE    │
                   │  (probe out) │
                   └──────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
   ┌─────────────┐            ┌──────────────────┐
   │  Thumbnail  │            │  JSON → stdout   │
   │  (optional) │            │  Errors → stderr │
   └─────────────┘            └──────────────────┘
```

**Flow:** Every CLI command follows the same pattern:
1. Parse args (Commander)
2. Validate inputs (fs checks)
3. Call core logic (probe/plan/execute/validate)
4. Serialize result to JSON
5. Exit with code (0=ok, 1=error)

**Adaptors separate ffmpeg from business logic:**
- `adapters/ffprobe.ts` — runs ffprobe, parses JSON
- `adapters/ffmpeg.ts` — runs ffmpeg with timeout, captures stderr
- `utils/fs.ts` — file existence and permission checks
- `utils/job.ts` — generates job IDs

**Presets are pure data:**
```typescript
const PRESETS: Record<PresetName, PresetDefinition> = {
  passthrough_if_possible: { videoCodec: "copy", audioCodec: "copy", ... },
  mezzanine_h264_high: { videoCodec: "h264", audioCodec: "aac", ... },
  ...
}
```

**Plan outputs a decision, not a command:**
- Strategy: `passthrough | remux | transcode | archive`
- Actions: which streams copy/transcode, container keep/rewrite
- Target: what the output should be
- Fallbacks: if execution fails, try these alternatives

## Implementation Units

- [ ] **Unit 1: Type System & Presets**

**Goal:** Define all TypeScript types and preset configurations so other units have a solid contract.

**Requirements:** R2, R5, R6

**Dependencies:** None

**Files:**
- Create: `src/types/common.ts` (BaseResult, Mode, Backend, Strategy, WarningItem, ErrorItem)
- Create: `src/types/probe.ts` (ProbeResult, VideoStreamInfo, AudioStreamInfo, SubtitleStreamInfo)
- Create: `src/types/plan.ts` (PlanResult, PlanActions, PlanTarget)
- Create: `src/types/job.ts` (RunRequest, RunOptions, VideoOptions, AudioOptions, TrimOptions)
- Create: `src/types/preset.ts` (PresetName, PresetDefinition)
- Create: `src/types/error.ts` (ERROR_CODES constant)
- Create: `src/presets/index.ts` (PRESETS map + getPreset function)
- Test: `src/presets/presets.test.ts`

**Approach:**
- Export all types as pure TypeScript (no runtime logic)
- Error codes as const enum or object keys (no magic strings)
- Presets are immutable maps, validated at build time
- Use strict type definitions (`readonly`, branded types where needed)

**Patterns to follow:**
- TG Bot: JSON response structure with `ok | errors | warnings`
- VWRS: Pydantic-like config validation (schema-first)

**Test scenarios:**
- Happy path: all preset names are valid and have all required fields
- Edge case: attempting to get non-existent preset throws or returns undefined
- Error path: invalid Mode or Backend values rejected by TypeScript

**Verification:**
- `npm run lint` passes with no type errors
- All exported types are used downstream (no unused types)

---

- [ ] **Unit 2: Utility & Adaptor Layers**

**Goal:** Isolate ffmpeg/ffprobe subprocess calls, file I/O, and JSON serialization from business logic.

**Requirements:** R7 (no raw ffmpeg params), R5 (JSON output)

**Dependencies:** Unit 1

**Files:**
- Create: `src/utils/fs.ts` (ensureDir, assertReadable, assertWritable)
- Create: `src/utils/job.ts` (createJobId)
- Create: `src/utils/json.ts` (printJson, stdout/stderr control)
- Create: `src/adapters/ffprobe.ts` (runFfprobe function, ffprobe invocation only)
- Create: `src/adapters/ffmpeg.ts` (runFfmpeg function, ffmpeg invocation only)
- Create: `src/adapters/logger.ts` (logEvent, structured logging to stderr)
- Test: `src/adapters/adapters.test.ts`

**Approach:**
- `ffprobe.ts` and `ffmpeg.ts` are the **only** files that invoke `execa("ffmpeg"/ffprobe")`
- No command construction in these files — callers pass ready-built arg arrays
- All subprocess errors caught and propagated as `{ ok: false, errors: [...] }`
- Logging uses JSON format on stderr for agent parsing: `{ timestamp, event, details }`

**Patterns to follow:**
- TG Bot: structured logging to JSON
- VWRS: error propagation with context (stage, retryable flag)

**Test scenarios:**
- Happy path: ffprobe succeeds, returns valid JSON with streams
- Happy path: ffmpeg copy operation completes
- Error path: ffprobe timeout (file unreadable or malformed)
- Error path: ffmpeg fails mid-transcode (missing codec)
- Integration: timeout causes SIGTERM → stderr captured → error in result

**Verification:**
- No `execa` calls outside these two files
- All file operations use async/await (no blocking I/O)
- Errors include both errno and user-friendly message

---

- [ ] **Unit 3: Probe Core**

**Goal:** Inspect input media and extract codec/resolution/fps/duration info.

**Requirements:** R1 (probe subcommand), R5, R6, R9 (thumbnail dependency)

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `src/core/probe.ts` (probeMedia function)
- Modify: `src/adapters/ffprobe.ts` (ensure runFfprobe is called correctly)
- Test: `src/core/probe.test.ts`

**Approach:**
- Call `ffprobe -v error -print_format json` on input path
- Parse streams array, categorize by codec_type (video/audio/subtitle)
- Extract: resolution, codec, fps (r_frame_rate), bit depth, color range/space
- Graceful degradation: missing fields → null (not error, still usable)
- Errors: INPUT_NOT_FOUND, INPUT_NOT_READABLE, PROBE_FAILED

**Patterns to follow:**
- VWRS: fps parsing from fraction string (`"24/1"` → 24 fps)
- TG Bot: error objects with `code`, `message`, optional `retryable`

**Test scenarios:**
- Happy path: valid MP4 with H.264 + AAC → correct streams extracted
- Happy path: valid MKV with H.265 + FLAC + subtitles → all streams detected
- Edge case: video with no audio stream → `audio_streams: []`
- Edge case: missing fps info → `fps: null` (still succeeds)
- Error path: file not found → ENOENT caught, error returned
- Error path: permission denied → EACCES caught, error returned
- Error path: invalid file format → ffprobe fails, caught and returned

**Verification:**
- `video_streams.length > 0` for valid video
- All parsed properties are correct type (number, string, or null)
- Error messages are helpful (mention specific ffprobe output if available)

---

- [ ] **Unit 4: Plan Core**

**Goal:** Decide transcoding strategy based on preset and probe result.

**Requirements:** R2 (four presets), R3 (fixed flow), R4 (quality-first strategy), R6

**Dependencies:** Unit 1, Unit 3

**Files:**
- Create: `src/core/plan.ts` (buildPlan function)
- Test: `src/core/plan.test.ts`

**Approach:**
- Read preset definition (target codec, container, allowResize, etc.)
- Read probe result (current codec, container, resolution)
- Decide strategy:
  - **Passthrough:** videoCodec=copy AND audioCodec=copy AND no container rewrite
  - **Remux:** videoCodec=copy AND (audioCodec=copy OR audio missing) AND container rewrite
  - **Transcode:** at least one codec needs transcoding
  - **Archive:** preset specifies `archive: true` (FFV1+FLAC)
- Build PlanTarget: what the output will be (codec, resolution, fps)
- List fallbacks: if primary strategy fails, what to try next
- Estimate risk: low (copy/remux), medium (standard transcode), high (archive or unusual codec)

**Patterns to follow:**
- Decision matrix: inputs (preset, probe) → strategy (pure function, no side effects)

**Test scenarios:**
- Happy path: passthrough-possible preset + matching codec → strategy=passthrough
- Happy path: mezzanine preset + H.265 input → strategy=transcode with H.264 target
- Happy path: archive preset + any input → strategy=archive, ffv1 target
- Edge case: probe fails → plan returns ok=false with error
- Edge case: no video stream → plan returns ok=false with error (can't proceed)
- Edge case: audio missing but preset requires audio → audio_action=transcode fallback
- Integration: plan output feeds directly into execute (actions tell ffmpeg what to do)

**Verification:**
- `strategy` is one of {passthrough, remux, transcode, archive}
- Fallbacks list is appropriate for strategy (copy fails → try remux)
- Risk estimate correlates with strategy (passthrough=low, archive=medium)

---

- [ ] **Unit 5: Execute Core**

**Goal:** Run ffmpeg with the planned strategy and produce output file.

**Requirements:** R1 (run subcommand), R3 (fixed flow), R4 (quality-first), R6, R10 (timeout)

**Dependencies:** Unit 1, Unit 2, Unit 4

**Files:**
- Create: `src/core/execute.ts` (executePlan function, ffmpeg arg builder)
- Test: `src/core/execute.test.ts`

**Approach:**
- Based on plan.strategy, build ffmpeg arg array:
  - **Passthrough/Remux:** `-c copy`
  - **Transcode:** preset-specific args (libx264, libfdk_aac, etc.)
  - **Archive:** FFV1 + FLAC
- Add container controls: `-movflags +faststart` for web mp4
- Call `runFfmpeg(args, timeout_sec)` from adaptor
- Capture stderr, extract summary from ffmpeg progress
- On success: return output path + metadata (duration, stderr excerpt for debugging)
- On failure: return error with stderr excerpt + suggested fallback

**Patterns to follow:**
- VWRS: modular argument construction
- Timeout-driven: `execa` timeout in adaptor, propagate ETIMEDOUT → TIMEOUT error code

**Test scenarios:**
- Happy path: H.264 input, copy strategy → `-c copy` succeeds in <1s
- Happy path: H.264 input, transcode to H.264 → slow preset, takes time, completes
- Error path: missing output directory → create it (ensureDir)
- Error path: output file exists, no --overwrite → EEXIST handled gracefully
- Error path: ffmpeg timeout (encoding hangs) → SIGTERM sent, error returned
- Error path: unknown codec in preset → ffmpeg fails, stderr captured
- Integration: output file appears on disk, is readable by validate stage

**Verification:**
- Output file exists and is > 1MB (not empty)
- Command exit code is 0 (ffmpeg succeeded)
- Stderr does not contain "error" (heuristic check)

---

- [ ] **Unit 6: Validate & Thumbnail**

**Goal:** Verify output is valid and optionally generate thumbnail.

**Requirements:** R6, R9 (optional thumbnail), R1 (validate subcommand)

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Create: `src/core/validate.ts` (validateOutput function)
- Create: `src/core/thumbnail.ts` (generateThumbnail function)
- Test: `src/core/validate.test.ts`, `src/core/thumbnail.test.ts`

**Approach:**

*Validate:*
- Re-probe output file (same logic as Unit 3)
- Check: `video_streams.length > 0`, file is readable, no ffprobe errors
- Return checks map: `{ probe_success, has_video, is_readable }`

*Thumbnail:*
- Extract single I-frame using `ffmpeg -vf thumbnail -frames:v 1 output.jpg`
- On success: return path to thumb.jpg
- On failure: return null (non-fatal, best-effort)

**Patterns to follow:**
- Validation is a probe-then-check pattern (idempotent)
- Thumbnail generation is independent of core flow (can be skipped)

**Test scenarios:**
- Happy path: valid output file → probe succeeds, has_video=true
- Happy path: thumbnail extraction → jpg file created
- Error path: output file corrupted or 0 bytes → probe fails, caught
- Error path: output deleted before validation → caught, error returned
- Error path: thumbnail generation timeout → handled gracefully, ignored

**Verification:**
- Validation always safe to call (no mutations)
- Thumbnail path is correct if generated, null otherwise

---

- [ ] **Unit 7: Run Orchestration**

**Goal:** Tie together probe → plan → execute → validate into a single runJob flow.

**Requirements:** R3 (fixed flow), R6, all Rs

**Dependencies:** Unit 1, Unit 3, Unit 4, Unit 5, Unit 6

**Files:**
- Create: `src/core/run.ts` (runJob function, main orchestration)
- Test: `src/core/run.test.ts` (integration test, mocked ffmpeg)

**Approach:**
- Accept RunRequest with all options
- Ensure output dir exists
- Call probe → plan → execute → validate → thumbnail in sequence
- Aggregate all warnings/errors from all stages
- Return composite result with all intermediate artifacts (probe, plan, execution, validation)
- Overall `ok: true` only if execution succeeds AND validation passes

**Patterns to follow:**
- Linear, deterministic flow (no branching, all steps recorded)
- Error propagation: if probe fails, later stages are skipped but recorded

**Test scenarios:**
- Happy path: full flow succeeds, thumbnail generated, all artifacts present
- Happy path: full flow succeeds, no thumbnail requested → thumbnail_path=null
- Error path: probe fails → plan still runs (tries to recover), execute skipped
- Integration: with mocked ffmpeg, verify command sequences

**Verification:**
- Result has probe, plan, execution, validation, and artifacts sections
- ok=true only if execution.ok && validation.valid
- All errors/warnings are accumulated in result.errors/warnings

---

- [ ] **Unit 8: CLI & Main Export**

**Goal:** Expose probe, plan, run, validate commands via CLI; export library functions.

**Requirements:** R1, R5, R6, R10

**Dependencies:** Unit 1–7

**Files:**
- Create: `src/cli.ts` (Commander-based CLI, four subcommands)
- Create: `src/index.ts` (library exports)
- Modify: `package.json` → `bin.video-transcode: dist/cli.js`

**Approach:**

*CLI (Commander):*
```
video-transcode probe --input PATH [--json]
video-transcode plan --input PATH --preset NAME [--json]
video-transcode run --input PATH --output-dir DIR --preset NAME [--mode MODE] [--generate-thumbnail] [--validate] [--json]
video-transcode validate --input PATH [--json]
```

*Library:*
- Export: probeMedia, buildPlan, executePlan, validateOutput, generateThumbnail, runJob, PRESETS, getPreset
- Types: all type exports for downstream consumers

**Patterns to follow:**
- Commander for subcommands + options
- `--json` flag (not default) for structured output
- Exit codes: 0=success, 1=error (validation ok=false)
- Errors to stderr, results to stdout

**Test scenarios:**
- CLI: `probe --input /tmp/test.mp4 --json` outputs valid JSON
- CLI: `plan --input /tmp/test.mp4 --preset mezzanine_h264_high` outputs plan
- CLI: `run --input /tmp/test.mp4 --output-dir /tmp/out --preset passthrough_if_possible` produces output file
- CLI: `validate --input /tmp/output.mp4` validates file
- CLI: missing required arg → helpful error message
- Library: `import { probeMedia, PRESETS } from 'video-transcode-skill'` works

**Verification:**
- `npm run build` produces dist/cli.js with correct shebang
- `npm run dev` allows local testing
- All exports are typed and documented

---

- [ ] **Unit 9: Testing & Build**

**Goal:** Ensure all features work end-to-end, build is clean, types are sound.

**Requirements:** All Rs (quality gate)

**Dependencies:** Unit 1–8 complete

**Files:**
- Create: `vitest.config.ts` (test configuration)
- Create: `tests/integration.test.ts` (e2e flow with mock ffmpeg)
- Modify: `package.json` → build, test, lint scripts

**Approach:**
- Unit tests: each core function mocked ffmpeg (unit8 logic tests)
- Integration tests: full flow with mock ffmpeg subprocess
- Linting: `tsc --noEmit` (type check)
- Build: `tsup src/index.ts src/cli.ts` → dist with ESM + types
- Pre-commit: lint, type-check, test

**Patterns to follow:**
- vitest for fast, concurrent testing
- Mock ffmpeg via execa stub in tests
- Coverage target: 80%+ for core modules

**Test scenarios:**
- Unit: each function tested in isolation (probe, plan, execute, validate)
- Integration: full runJob with H.264 → H.264 copy → validate passes
- Integration: full runJob with H.264 → H.265 transcode fails gracefully
- Linting: no type errors, no eslint violations
- Build: dist/cli.js is executable with correct shebangs

**Verification:**
- `npm test` passes all tests
- `npm run lint` reports no errors
- `npm run build` produces working dist/cli.js + dist/index.d.ts
- `npm run dev` allows local testing without build

---

## System-Wide Impact

- **Integration points:** MCP tool registration (will be added in future phase, not in v0.1.0)
- **Callback/observer patterns:** None in v0.1.0 (stateless tool)
- **Data lifecycle:** Input file untouched, output file created in specified directory, temporary ffmpeg artifacts cleaned by subprocess
- **Error propagation:** ffmpeg stderr → plan.errors (structured), CLI → exit code 1
- **Unchanged invariants:** Input file is never modified; original codec/quality preserved in passthrough/remux modes

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| ffmpeg not installed on user system | Detect at runtime (ffprobe fails → error message suggests installation) |
| ffmpeg timeout on large files (4K, slow preset) | Default 7200s (2h) covers typical cases; user can override --timeout-sec |
| Codec unavailability (H.265 not compiled into ffmpeg) | Error returned with stderr excerpt; plan includes fallbacks list for retry |
| Output directory is read-only or full disk | `ensureDir` and `runFfmpeg` catch EACCES/ENOSPC, error returned |
| Mezzanine preset quality too high/low | Tune -crf and -preset during implementation phase (17 or 18 CRF tested) |

## Documentation / Operational Notes

- **README:** Install ffmpeg + ffprobe, Node.js 20+; show example commands
- **Error codes:** document each code in types/error.ts (user-facing reference)
- **Preset guide:** explain when to use each preset (copy for passthrough, mezzanine for archive, web for delivery)
- **Performance notes:** mention that "slow" preset on 4K can take 2h; suggest "balanced" for faster throughput

## Sources & References

- **Origin:** User feature request (video-transcode-skill README + types + skeleton)
- **Workspace patterns:** VWRS (video pipeline), TG Bot (CLI + JSON), YD-Utility-Kit (Click patterns)
- **Related projects:** VWRS v1.0.0 for video I/O, WM-Tool for ffmpeg integration decisions
