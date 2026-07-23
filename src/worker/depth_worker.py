"""Local video-to-depth worker. It communicates with Electron via JSON lines."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
# The app-specific endpoint avoids overriding a developer's general HF setup.
if os.environ.get("DEPTH_VIDEO_HF_ENDPOINT"):
    os.environ["HF_ENDPOINT"] = os.environ["DEPTH_VIDEO_HF_ENDPOINT"]


def emit(event_type: str, **payload: object) -> None:
    print(json.dumps({"type": event_type, **payload}, ensure_ascii=False), flush=True)


def probe() -> int:
    try:
        import cv2  # noqa: F401
        import torch
        import transformers  # noqa: F401
    except ImportError as error:
        emit("probe", ok=False, message=f"缺少 Python 依赖：{error.name}")
        return 1

    cuda = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if cuda else ""
    emit("probe", ok=True, cuda=cuda, gpuName=gpu_name, ffmpeg=shutil.which("ffmpeg") is not None)
    return 0


def target_size(width: int, height: int, preset: str) -> tuple[int, int]:
    if preset == "1080p":
        return 1920, 1080
    if preset == "720p":
        return 1280, 720
    return width, height


def unique_output_path(directory: Path, source: Path) -> Path:
    base = directory / f"{source.stem}_depth.mp4"
    if not base.exists():
        return base
    number = 2
    while True:
        candidate = directory / f"{source.stem}_depth_{number}.mp4"
        if not candidate.exists():
            return candidate
        number += 1


def depth_frame(frame, processor, model, device, output_size, style, bounds):
    import cv2
    import numpy as np
    import torch
    from PIL import Image

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(rgb)
    inputs = processor(images=image, return_tensors="pt")
    inputs = {name: value.to(device) for name, value in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs)
    post_processed = processor.post_process_depth_estimation(
        outputs, target_sizes=[(output_size[1], output_size[0])]
    )
    depth = post_processed[0]["predicted_depth"].squeeze().float().cpu().numpy()

    # Smooth percentile endpoints to reduce per-frame brightness flicker.
    current_low, current_high = np.percentile(depth, (2, 98))
    if bounds[0] is None:
        bounds[0], bounds[1] = current_low, current_high
    else:
        bounds[0] = bounds[0] * 0.88 + current_low * 0.12
        bounds[1] = bounds[1] * 0.88 + current_high * 0.12
    normalized = np.clip((depth - bounds[0]) / max(bounds[1] - bounds[0], 1e-6), 0, 1)
    grayscale = (normalized * 255).astype(np.uint8)

    if style == "inverse":
        grayscale = 255 - grayscale
    if style == "false-color":
        return cv2.applyColorMap(grayscale, cv2.COLORMAP_TURBO)
    return cv2.cvtColor(grayscale, cv2.COLOR_GRAY2BGR)


def process(config: dict[str, str]) -> int:
    import cv2
    import torch
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    source = Path(config["inputPath"])
    output_directory = Path(config["outputDirectory"])
    if not source.is_file():
        raise RuntimeError("找不到输入视频。")
    if not output_directory.is_dir():
        raise RuntimeError("输出目录不存在。")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("未找到 FFmpeg。请在系统 PATH 中安装 FFmpeg。")

    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise RuntimeError("无法读取这个视频文件。")
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    if width <= 0 or height <= 0:
        raise RuntimeError("视频不包含有效画面。")
    output_size = target_size(width, height, config.get("resolution", "source"))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    emit("progress", percent=0, message=f"正在加载 Depth Anything V2（{device.upper()}）")

    checkpoint = "depth-anything/Depth-Anything-V2-Small-hf"
    try:
        processor = AutoImageProcessor.from_pretrained(checkpoint)
        model = AutoModelForDepthEstimation.from_pretrained(checkpoint).to(device).eval()
    except OSError as error:
        raise RuntimeError(
            "无法下载 Depth Anything V2 模型。请检查网络；如需使用可访问的 Hugging Face 镜像，"
            "请设置 DEPTH_VIDEO_HF_ENDPOINT 后重试。"
        ) from error

    output_path = unique_output_path(output_directory, source)
    temp_directory = Path(tempfile.mkdtemp(prefix="depth-video-"))
    raw_output = temp_directory / "depth_raw.mp4"
    writer = cv2.VideoWriter(
        str(raw_output), cv2.VideoWriter_fourcc(*"mp4v"), fps, output_size
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError("无法创建临时输出视频。")

    bounds = [None, None]
    processed = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            writer.write(depth_frame(frame, processor, model, device, output_size, config["style"], bounds))
            processed += 1
            if processed == 1 or processed % 5 == 0 or processed == frame_count:
                percent = min(96, int(processed / max(frame_count, 1) * 96))
                emit("progress", percent=percent, message=f"正在估计深度：第 {processed} / {frame_count or '?'} 帧")
    finally:
        capture.release()
        writer.release()

    emit("progress", percent=97, message="正在编码 H.264 并保留原始音轨")
    ffmpeg = [
        "ffmpeg", "-y", "-i", str(raw_output), "-i", str(source),
        "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-movflags", "+faststart", str(output_path)
    ]
    result = subprocess.run(ffmpeg, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        output_path.unlink(missing_ok=True)
        shutil.move(str(raw_output), str(output_path))
    shutil.rmtree(temp_directory, ignore_errors=True)
    emit("completed", percent=100, message="深度视频生成完成", outputPath=str(output_path))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--config")
    args = parser.parse_args()
    if args.probe:
        return probe()
    if not args.config:
        parser.error("--config is required")
    try:
        return process(json.loads(args.config))
    except Exception as error:
        emit("error", message=str(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
