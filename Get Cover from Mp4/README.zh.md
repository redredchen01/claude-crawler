# Cover Selector 🎬

从视频中智能提取完美的封面框架，生成丰富的三拼图合成。

**核心特性：**
- 🎯 基于规则的智能帧选择（无需 ML 模型）
- 🎨 三拼图合成（1 个全画幅底图 + 2 个多样化特写）
- 📊 场景检测和帧采样（30 帧/场景）
- ✨ 内容多样性优化（脸部 vs 身体特写）
- 🔄 可扩展的分析器管道
- 🌐 Web UI 交互式测试
- ⚡ CLI 批处理支持

## 工作原理

Cover Selector 分析视频并自动选择三个优化的帧用于封面合成：

1. **底图** — 全画幅、构图良好的场景（作为基础）
2. **特写 #1** — 第一个高质量特写（脸部或身体）
3. **特写 #2** — 第二个特写，内容不同（避免重复相似）

三个框架组合成 3 面板拼图封面图像。

## 安装

### 要求
- Python 3.9+
- FFmpeg

### 设置

```bash
# 克隆仓库
git clone https://github.com/redredchen01/cover-selector-mvp.git
cd cover-selector-mvp

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -e ".[dev]"

# 验证安装
cover-selector --help
```

## 快速开始

### Web UI

```bash
python app.py
# 在浏览器打开 http://localhost:8002
# 拖放视频文件开始使用
```

### 命令行

```bash
cover-selector /path/to/video.mp4 --output /path/to/output/
```

### Python API

```python
from cover_selector.config import CoverSelectorConfig
from cover_selector.core.complete_pipeline import VideoToTripleCollagePipeline
from pathlib import Path

config = CoverSelectorConfig()
pipeline = VideoToTripleCollagePipeline(config)
results = pipeline.run("video.mp4", Path("output"))

print(f"封面图像: {results['final_cover']}")
```

## 架构

### 管道阶段

```
视频输入
    ↓
阶段 1: 场景检测 (SceneDetector)
    ↓
阶段 2: 帧采样 (FrameSampler) - 30帧/场景
    ↓
阶段 3: 特征提取和评分 (Scorer)
    ↓
阶段 4: 排名 (Ranker)
    ↓
阶段 5: 合成分析 (ComposerAnalyzer)
         ├→ 底图选择 (质量 + 时间多样性)
         └→ 特写选择 (质量 + 内容多样性)
    ↓
阶段 6: 图像合成 (ImageCompositor)
    ↓
输出: 三拼图封面图像
```

### 核心组件

- **SceneDetector** — 使用帧相似度检测场景边界
- **FrameSampler** — 在场景中均匀提取候选框架
- **Scorer** — 在多个维度评估框架质量
- **Ranker** — 按加权分数对框架进行排名
- **ComposerAnalyzer** — 使用内容多样性选择帧进行合成
- **ImageCompositor** — 渲染最终的三拼图图像

## 内容多样性优化

**特写框架选择**算法确保两个叠加不显示相同内容：

### 内容类型分类
- **脸部** — `largest_face_ratio > 0.35`（脸部特写）
- **中等** — `0.2 < largest_face_ratio ≤ 0.35`（身体上半部分）
- **身体** — `largest_face_ratio ≤ 0.2`（全身或场景）

### 多样性评分
```
多样性 = 类型差异 × 0.50       (主要: 脸部 vs 身体)
       + 位置差异 × 0.25       (左 vs 右构图)
       + 亮度差异 × 0.15       (光线对比)
       + 边缘密度差异 × 0.10   (纹理复杂度)
```

**结果：** 特写框架被选择以最大化视觉差异，避免相似重复的特写。

## 配置

编辑 `src/cover_selector/config.py` 或通过环境变量传递选项：

```python
from cover_selector.config import CoverSelectorConfig

config = CoverSelectorConfig(
    scene_detection_threshold=25.0,  # 场景变化敏感度
    frame_samples_per_scene=30,      # 每场景提取的帧数
)
```

## 测试

运行测试套件：

```bash
# 所有测试
pytest tests/ -v

# 特定测试文件
pytest tests/test_composer_analyzer.py -v

# 带覆盖率
pytest tests/ --cov=src/cover_selector --cov-report=html
```

当前测试覆盖率：**81%** for composer 分析，**26%** overall（管道使用启发式方法，非所有代码路径在单元测试中完整测试）。

## 开发

### 代码风格

```bash
# Black 格式化
black src/ tests/

# isort 导入排序
isort src/ tests/

# mypy 类型检查
mypy src/

# flake8 代码检查
flake8 src/ tests/
```

### 添加新的分析器

在 `src/cover_selector/core/` 中扩展：

```python
# 示例：新分析器
from cover_selector.schemas.frame_features import FrameFeatures

class MyAnalyzer:
    def analyze(self, image) -> dict:
        """返回要合并到 FrameFeatures 的特征值字典"""
        return {"my_score": 0.8}
```

在 `complete_pipeline.py` 中集成到管道中。

## 限制

- **基于启发式：** 使用基于规则的视觉分析，无 ML 模型
- **无脸部检测：** 目前使用帧特征作为脸部检测的代理（无 MediaPipe）
- **仅本地：** 完全在本地运行，无云处理
- **视频格式：** 对现代编码器效果最佳（H.264, VP9）

## 性能

- **帧采样：** ~1-2 秒/视频（取决于场景数和时长）
- **特征提取：** ~30-50 毫秒/帧
- **合成：** ~100 毫秒最终渲染
- **总计：** 30 秒视频 → ~5-10 秒端到端

*在 MacBook Pro M1（2GB 候选框架缓存）上测试*

## 贡献

欢迎贡献！需要改进的领域：

- [ ] 真实脸部检测集成（ML 模型）
- [ ] 批处理改进
- [ ] 额外的合成模板
- [ ] 性能分析和优化
- [ ] 多语言 UI 支持

## 许可证

MIT 许可证 — 见 [LICENSE](LICENSE) 文件

## 致谢

使用了以下技术：
- OpenCV 用于图像处理
- Pydantic 用于数据验证
- Typer 用于 CLI 框架
- scene-detect 用于场景检测

## 支持

- 📖 [完整文档](README.md)

---

**快速导航：**
- 英文版 README: [README.md](README.md)
- GitHub: [redredchen01/cover-selector-mvp](https://github.com/redredchen01/cover-selector-mvp)

## 支持

如有问题或反馈：
- 访问 [GitHub 仓库](https://github.com/redredchen01/cover-selector-mvp)
- 查看现有代码和文档
