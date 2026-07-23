# Depth Video Studio

把任意视频转换为深度图视频的本地桌面应用。源视频、推理过程和结果文件均保留在用户电脑上。

> 当前版本是开发中的 Windows 第一版：已具备真实的视频逐帧深度估计闭环，尚未提供正式安装包、模型内置下载页或签名更新机制。

## 已实现

- 选择或拖入 MP4、MOV、MKV、AVI、WEBM 等视频。
- 使用 `Depth Anything V2 Small` 在本机逐帧进行单目深度估计。
- 自动使用 NVIDIA CUDA；没有可用 GPU 时回退到 CPU。
- 输出中性灰度、伪彩深度或反相灰度的 MP4 视频。
- 使用 FFmpeg 编码为 H.264，并尽可能保留源视频音轨。
- 用平滑的 2% / 98% 深度分位数降低相邻帧亮度闪烁。

## 开发运行

### 前置条件

- Node.js 22 或更高版本。
- Python 3.11（可通过 `DEPTH_VIDEO_PYTHON` 指向其他 Python 可执行文件）。
- 系统 PATH 中的 FFmpeg。
- Python 环境包含 `torch`、`transformers`、`opencv-python`、`Pillow` 和 `numpy`。
- 使用 GPU 时，需要支持 CUDA 的 PyTorch 与已正确安装的 NVIDIA 驱动。

模型会在第一次处理时由 Hugging Face 下载并缓存到当前用户的模型缓存目录；它不会被提交到 Git 仓库。

如果网络无法访问 Hugging Face，可在启动应用前设置一个可信的镜像端点，例如：

```powershell
$env:DEPTH_VIDEO_HF_ENDPOINT = 'https://hf-mirror.com'
npm run start
```

该变量会被 Hugging Face 客户端读取；生产版应将模型下载源与校验哈希固化到应用设置中，而不是依赖用户手动配置。

```powershell
npm install
npm run start
```

静态语法检查：

```powershell
npm run check
```

仅检查本机深度引擎依赖：

```powershell
python src/worker/depth_worker.py --probe
```

## 使用说明

1. 点击“选择源视频”或把视频拖进窗口。
2. 选择质量、分辨率和深度图样式；初版的质量选项会预留给后续模型/帧采样策略。
3. 可选地选择输出文件夹；未选时，结果保存在源视频旁边。
4. 点击“生成深度视频”，等待界面进度完成。

输出文件名为 `<原文件名>_depth.mp4`。若同名文件已存在，应用会自动添加数字后缀，而不会覆盖已有结果。

## 已知边界

- 单目深度是相对深度，不是激光雷达或双目相机产生的真实米制距离。
- 第一次运行需要网络下载模型；之后可离线处理。
- 4K、长视频和高帧率素材会占用大量处理时间。建议先以 720p 或短视频验证效果。
- 当前时序稳定采用轻量的亮度归一化平滑；复杂快速运动场景后续可升级为光流约束或视频深度模型。

完整的进程边界和下一阶段计划见 [ARCHITECTURE.md](ARCHITECTURE.md)。
