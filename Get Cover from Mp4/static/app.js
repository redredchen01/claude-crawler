const uploadArea = document.getElementById("uploadArea");
const videoInput = document.getElementById("videoInput");
const processBtn = document.getElementById("processBtn");
const fileNameDisplay = document.getElementById("fileName");

uploadArea.addEventListener("click", () => videoInput.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("active");
});
uploadArea.addEventListener("dragleave", () =>
  uploadArea.classList.remove("active"),
);
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("active");
  if (e.dataTransfer.files.length) {
    videoInput.files = e.dataTransfer.files;
    onFileSelected();
  }
});

videoInput.addEventListener("change", onFileSelected);

function onFileSelected() {
  if (videoInput.files.length > 0) {
    const fileName = videoInput.files[0].name;
    const size = (videoInput.files[0].size / 1024 / 1024).toFixed(1);
    fileNameDisplay.textContent = `已选择: ${fileName} (${size}MB)`;
    fileNameDisplay.style.display = "block";
    processBtn.style.display = "block";
  }
}

async function processVideo() {
  document.getElementById("error").classList.remove("show");
  document.getElementById("result").classList.remove("show");
  document.getElementById("progress").classList.add("show");
  processBtn.disabled = true;

  try {
    const file = videoInput.files[0];
    const formData = new FormData();
    formData.append("video", file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (e) => {
      const percent = Math.round((e.loaded / e.total) * 100);
      document.getElementById("progressFill").style.width = percent + "%";
      document.getElementById("progressText").innerHTML =
        `<strong>上传中...</strong> ${percent}% (${(e.loaded / 1024 / 1024).toFixed(1)}MB / ${(e.total / 1024 / 1024).toFixed(1)}MB)`;
    });

    xhr.addEventListener("loadstart", () => {
      document.getElementById("progressText").innerHTML =
        "<strong>连接中...</strong>";
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        try {
          const result = JSON.parse(xhr.responseText);
          displayResult(result);
        } catch (e) {
          throw new Error("响应格式错误: " + e.message);
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          throw new Error(err.error || "处理失败");
        } catch (e) {
          throw new Error("处理失败: " + xhr.status);
        }
      }
    });

    xhr.addEventListener("error", () => {
      throw new Error("网络错误");
    });

    xhr.addEventListener("timeout", () => {
      throw new Error("请求超时");
    });

    xhr.timeout = 600000; // 10分钟超时
    xhr.open("POST", "/api/process");
    document.getElementById("progressText").innerHTML =
      "<strong>准备上传...</strong>";
    xhr.send(formData);
  } catch (err) {
    document.getElementById("error").textContent = "❌ " + err.message;
    document.getElementById("error").classList.add("show");
    document.getElementById("progress").classList.remove("show");
    processBtn.disabled = false;
  }
}

function displayResult(result) {
  const report = result.report || result;
  let html = "";

  html +=
    '<div class="result-item"><div class="result-label">模式</div><div class="result-value">' +
    (report.mode === "triple" ? "✨ 三拼图模式" : "⚠️ 降级模式 (单图)") +
    "</div></div>";

  if (report.bottom_image) {
    html +=
      '<div class="result-item"><div class="result-label">底图</div><div class="result-value">帧 ' +
      report.bottom_image.frame_id +
      " @ " +
      report.bottom_image.timestamp_sec.toFixed(2) +
      "s (清晰度: " +
      report.bottom_image.blur_score.toFixed(1) +
      "/100)</div></div>";
  }

  if (report.zoom_images && report.zoom_images.length > 0) {
    const zoomText = report.zoom_images
      .map((z) => "帧 " + z.frame_id)
      .join(" + ");
    html +=
      '<div class="result-item"><div class="result-label">特写</div><div class="result-value">' +
      zoomText +
      "</div></div>";
  }

  if (report.summary) {
    html +=
      '<div class="result-item"><div class="result-label">统计</div><div class="result-value">总候选: ' +
      report.summary.total_candidates +
      " | 有效: " +
      report.summary.valid_candidates +
      "</div></div>";
  }

  document.getElementById("resultContent").innerHTML = html;
  document.getElementById("result").classList.add("show");
  document.getElementById("progress").classList.remove("show");

  if (result.final_cover) {
    const previewHtml =
      '<img src="/download?file=' +
      btoa(result.final_cover) + // Base64 encoding
      '" alt="封面" style="max-width: 100%; max-height: 400px; border-radius: 8px;">';
    document.getElementById("preview").innerHTML = previewHtml;
  }

  processBtn.disabled = false;
}
