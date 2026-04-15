#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cover Selector MVP Web Application - Optimized."""

import json
import os
import sys
import tempfile
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
import io

sys.path.insert(0, str(Path(__file__).parent / "src"))
os.chdir(Path(__file__).parent)

HTML = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Cover Selector MVP</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .container { background: white; max-width: 900px; width: 100%; padding: 40px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
        .subtitle { color: #666; margin-bottom: 30px; font-size: 14px; }
        .upload-area { border: 2px dashed #667eea; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.3s; background: #f8f9ff; }
        .upload-area:hover { background: #f0f2ff; border-color: #764ba2; }
        .upload-area.active { background: #e8ebff; border-color: #764ba2; }
        .upload-area input { display: none; }
        .upload-icon { font-size: 48px; margin-bottom: 10px; }
        .upload-text { color: #666; margin-bottom: 5px; }
        .upload-hint { color: #999; font-size: 12px; }
        .button { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 30px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; width: 100%; margin-top: 15px; transition: all 0.3s; }
        .button:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3); }
        .button:disabled { opacity: 0.5; cursor: not-allowed; }
        .result { background: #f0f7ff; border: 1px solid #b3d9ff; border-radius: 6px; padding: 20px; margin-top: 20px; display: none; }
        .result.show { display: block; animation: slideIn 0.3s; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; } }
        .error { background: #fee; color: #c33; padding: 15px; border-radius: 6px; margin-top: 15px; display: none; }
        .error.show { display: block; }
        .result-item { background: white; padding: 12px; border-radius: 4px; margin-bottom: 10px; border-left: 4px solid #667eea; }
        .result-label { color: #666; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .result-value { color: #333; font-size: 14px; margin-top: 4px; }
        .preview { margin-top: 15px; text-align: center; }
        .preview img { max-width: 100%; max-height: 300px; border-radius: 6px; }
        .progress { display: none; margin-top: 15px; }
        .progress.show { display: block; }
        .progress-bar { background: #e0e0e0; border-radius: 4px; overflow: hidden; height: 8px; }
        .progress-fill { background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: 0%; transition: width 0.3s; }
        .file-name { color: #666; font-size: 13px; margin-top: 10px; }
        .status-text { color: #666; font-size: 12px; margin-top: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Cover Selector MVP</h1>
        <p class="subtitle">Extract perfect video cover frames with triple-collage composition</p>

        <div class="upload-area" id="uploadArea">
            <div class="upload-icon">📹</div>
            <div class="upload-text">Drag & drop your video file here or click to select</div>
            <div class="upload-hint">Supported: MP4, WebM, MKV, MOV, AVI, FLV, M4V</div>
            <input type="file" id="videoInput" accept="video/*">
        </div>

        <div class="file-name" id="fileName" style="display: none;"></div>

        <div class="progress" id="progress">
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill"></div>
            </div>
            <div class="status-text">
                <div id="progressText">等待处理...</div>
            </div>
        </div>

        <button class="button" id="processBtn" onclick="processVideo()" style="display: none;">🚀 开始处理</button>

        <div class="result" id="result">
            <h2>✅ 处理完成</h2>
            <div id="resultContent"></div>
            <div class="preview" id="preview"></div>
        </div>

        <div class="error" id="error"></div>
    </div>

    <script>
        const uploadArea = document.getElementById('uploadArea');
        const videoInput = document.getElementById('videoInput');
        const processBtn = document.getElementById('processBtn');
        const fileNameDisplay = document.getElementById('fileName');

        uploadArea.addEventListener('click', () => videoInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('active');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('active'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('active');
            if (e.dataTransfer.files.length) {
                videoInput.files = e.dataTransfer.files;
                onFileSelected();
            }
        });

        videoInput.addEventListener('change', onFileSelected);

        function onFileSelected() {
            if (videoInput.files.length > 0) {
                const fileName = videoInput.files[0].name;
                const size = (videoInput.files[0].size / 1024 / 1024).toFixed(1);
                fileNameDisplay.textContent = `已选择: ${fileName} (${size}MB)`;
                fileNameDisplay.style.display = 'block';
                processBtn.style.display = 'block';
            }
        }

        async function processVideo() {
            document.getElementById('error').classList.remove('show');
            document.getElementById('result').classList.remove('show');
            document.getElementById('progress').classList.add('show');
            processBtn.disabled = true;

            try {
                const file = videoInput.files[0];
                const formData = new FormData();
                formData.append('video', file);

                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (e) => {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    document.getElementById('progressFill').style.width = percent + '%';
                    document.getElementById('progressText').innerHTML = 
                        `<strong>上传中...</strong> ${percent}% (${(e.loaded/1024/1024).toFixed(1)}MB / ${(e.total/1024/1024).toFixed(1)}MB)`;
                });

                xhr.addEventListener('loadstart', () => {
                    document.getElementById('progressText').innerHTML = '<strong>连接中...</strong>';
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        try {
                            const result = JSON.parse(xhr.responseText);
                            displayResult(result);
                        } catch (e) {
                            throw new Error('响应格式错误: ' + e.message);
                        }
                    } else {
                        try {
                            const err = JSON.parse(xhr.responseText);
                            throw new Error(err.error || '处理失败');
                        } catch (e) {
                            throw new Error('处理失败: ' + xhr.status);
                        }
                    }
                });

                xhr.addEventListener('error', () => {
                    throw new Error('网络错误');
                });

                xhr.addEventListener('timeout', () => {
                    throw new Error('请求超时');
                });

                xhr.timeout = 600000; // 10分钟超时
                xhr.open('POST', '/api/process');
                document.getElementById('progressText').innerHTML = '<strong>准备上传...</strong>';
                xhr.send(formData);
            } catch (err) {
                document.getElementById('error').textContent = '❌ ' + err.message;
                document.getElementById('error').classList.add('show');
                document.getElementById('progress').classList.remove('show');
                processBtn.disabled = false;
            }
        }

        function displayResult(result) {
            const report = result.report || result;
            let html = '';

            html += '<div class="result-item"><div class="result-label">模式</div><div class="result-value">' +
                    (report.mode === 'triple' ? '✨ 三拼图模式' : '⚠️ 降级模式 (单图)') + '</div></div>';

            if (report.bottom_image) {
                html += '<div class="result-item"><div class="result-label">底图</div><div class="result-value">帧 ' +
                        report.bottom_image.frame_id + ' @ ' + report.bottom_image.timestamp_sec.toFixed(2) + 's (清晰度: ' +
                        report.bottom_image.blur_score.toFixed(1) + '/100)</div></div>';
            }

            if (report.zoom_images && report.zoom_images.length > 0) {
                const zoomText = report.zoom_images.map(z => '帧 ' + z.frame_id).join(' + ');
                html += '<div class="result-item"><div class="result-label">特写</div><div class="result-value">' + zoomText + '</div></div>';
            }

            if (report.summary) {
                html += '<div class="result-item"><div class="result-label">统计</div><div class="result-value">总候选: ' +
                        report.summary.total_candidates + ' | 有效: ' + report.summary.valid_candidates + '</div></div>';
            }

            document.getElementById('resultContent').innerHTML = html;
            document.getElementById('result').classList.add('show');
            document.getElementById('progress').classList.remove('show');

            if (result.final_cover) {
                const previewHtml = '<img src="/download?file=' + btoa(result.final_cover) + '" alt="封面" style="max-width: 100%; max-height: 400px; border-radius: 8px; margin-top: 15px;">';
                document.getElementById('preview').innerHTML = previewHtml;
            }

            processBtn.disabled = false;
        }
    </script>
</body>
</html>"""


class CoverSelectorHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "":
            self.send_response(200)
            self.send_header("Content-type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode('utf-8'))
        elif self.path == "/api/clear-cache":
            # Clear analyzer cache endpoint
            try:
                from cover_selector.core.analyzer_cache import clear_cache, get_cache_stats
                print(f"[INFO] Cache clear requested", file=sys.stderr)
                stats_before = get_cache_stats()
                clear_cache()
                self.send_response(200)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                response = {
                    "status": "success",
                    "message": "Analyzer cache cleared",
                    "cached_before": stats_before["cached_analyzers"]
                }
                self.wfile.write(json.dumps(response).encode('utf-8'))
            except Exception as e:
                print(f"[ERROR] Cache clear failed: {e}", file=sys.stderr)
                self.send_response(500)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        elif self.path.startswith("/download"):
            try:
                import base64
                from urllib.parse import unquote
                file_path = self.path.split("file=")[1]
                # Try Base64 decode first
                try:
                    file_path = base64.b64decode(file_path).decode('utf-8')
                except:
                    # Fallback to URL decode
                    file_path = unquote(file_path)
                file_path = Path(file_path)
                print(f"[DEBUG] Download request: {file_path}, exists={file_path.exists()}", file=sys.stderr)
                if file_path.exists():
                    self.send_response(200)
                    self.send_header("Content-type", "image/jpeg")
                    self.send_header("Content-Disposition", f'inline; filename="{file_path.name}"')
                    self.end_headers()
                    with open(file_path, "rb") as f:
                        self.wfile.write(f.read())
                else:
                    print(f"[ERROR] File not found: {file_path}", file=sys.stderr)
                    self.send_error(404)
            except Exception as e:
                print(f"[ERROR] Download: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                self.send_error(500)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/api/process":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                content_type = self.headers.get("Content-Type", "")
                
                print(f"[INFO] Processing request: {content_length} bytes", file=sys.stderr)

                # Parse multipart form data
                if "boundary=" not in content_type:
                    raise ValueError("Invalid multipart data")

                boundary = content_type.split("boundary=")[1].split(";")[0].encode()
                body = self.rfile.read(content_length)
                
                # Simple multipart parser
                video_data = None
                parts = body.split(b"--" + boundary)
                
                for part in parts:
                    if b"filename=" in part and b"video" in part:
                        # Find the end of headers
                        double_crlf = b"\r\n\r\n"
                        header_end = part.find(double_crlf)
                        if header_end != -1:
                            # Extract data between headers and next boundary
                            data_start = header_end + len(double_crlf)
                            data_end = part.rfind(b"\r\n")
                            video_data = part[data_start:data_end]
                            break

                if not video_data:
                    raise ValueError("No video data found")

                print(f"[INFO] Video data size: {len(video_data)} bytes", file=sys.stderr)

                # Save video to temp file
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                    tmp.write(video_data)
                    video_path = tmp.name
                
                print(f"[INFO] Video saved to: {video_path}", file=sys.stderr)

                # Create output directory
                output_dir = Path(__file__).parent / "output" / "covers"
                output_dir.mkdir(parents=True, exist_ok=True)

                # Run pipeline
                print(f"[INFO] Starting pipeline...", file=sys.stderr)
                from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
                from cover_selector.core.analyzer_cache import clear_cache
                from cover_selector.config import CoverSelectorConfig

                # Clear analyzer cache to avoid mixing results from previous videos
                clear_cache()
                print(f"[INFO] Analyzer cache cleared for fresh processing", file=sys.stderr)

                config = CoverSelectorConfig()
                pipeline = VideoToTripleCollagePipeline(config)
                results = pipeline.run(video_path=video_path, output_dir=output_dir)

                # Clean up temp video
                try:
                    Path(video_path).unlink()
                except:
                    pass

                print(f"[INFO] Pipeline complete: {results['cover_mode']} mode", file=sys.stderr)

                self.send_response(200)
                self.send_header("Content-type", "application/json; charset=utf-8")
                self.end_headers()

                # Build report with composition details for frontend
                composition = results.get("composition", {})
                report = {
                    "mode": results["cover_mode"],
                    "summary": {
                        "total_candidates": results["candidates_count"],
                        "valid_candidates": results["candidates_count"]
                    }
                }

                # Add frame details to report for frontend display
                if "bottom_image" in composition:
                    report["bottom_image"] = composition["bottom_image"]
                if "zoom_images" in composition:
                    report["zoom_images"] = composition["zoom_images"]

                response = {
                    "status": "success",
                    "scenes_count": results["scenes_count"],
                    "candidates_count": results["candidates_count"],
                    "cover_mode": results["cover_mode"],
                    "final_cover": results["final_cover"],
                    "composition": composition,
                    "report": report
                }
                self.wfile.write(json.dumps(response, default=str).encode('utf-8'))

            except Exception as e:
                print(f"[ERROR] {e}", file=sys.stderr)
                import traceback
                traceback.print_exc(file=sys.stderr)
                
                self.send_response(400)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        print(f"[HTTP] {format % args}", file=sys.stderr)


if __name__ == "__main__":
    port = 8002
    print("\n" + "="*60)
    print("🎬 Cover Selector MVP")
    print("="*60)
    print(f"✅ 打开浏览器: http://localhost:{port}")
    print("="*60 + "\n")

    server = HTTPServer(("", port), CoverSelectorHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n✋ 服务器已停止")
        server.server_close()
