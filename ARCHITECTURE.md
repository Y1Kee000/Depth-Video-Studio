# 架构说明

## 进程边界

```text
Electron 渲染进程（界面）
  -> 受限的 contextBridge API
Electron preload（不承载业务逻辑）
  -> 具名 IPC 调用
Electron 主进程（文件选择、作业控制、进度转发）
  -> JSON Lines 标准输入/输出协议
Python 工作进程（FFmpeg、OpenCV、PyTorch、Depth Anything V2）
```

渲染进程没有 Node.js 权限，也不能任意调用 IPC。每一项本地能力都必须同时在 `src/preload.js` 和 `src/main.js` 中显式定义。

## 当前转换流程

1. Electron 主进程验证源视频和输出目录。
2. Python 工作进程使用 OpenCV 读取视频帧。
3. `Depth Anything V2 Small` 为每一帧生成相对深度图；有 CUDA 时模型在 GPU 上执行。
4. 工作者以指数移动平均平滑 2% / 98% 深度分位数，避免逐帧独立归一化造成的剧烈闪烁。
5. OpenCV 生成临时视频，FFmpeg 转码为 H.264 MP4 并映射可用音轨。
6. 工作者通过 JSON Lines 报告进度、完成文件路径或错误；主进程只转发已定义的消息。

## 分发前需要完成的工作

1. 使用 PyInstaller 或 Nuitka 打包 Python 工作进程及其依赖，避免最终用户安装 Python。
2. 将 FFmpeg 可执行文件作为受版本控制的应用资源随安装包分发。
3. 实现模型下载器：校验哈希、显示首次下载进度、允许用户指定模型缓存位置。
4. 用 `electron-builder` 创建签名的 Windows 安装程序，并添加更新策略。
5. 为任务中断、磁盘空间不足、损坏视频、CUDA 失败与 FFmpeg 编码失败补齐用户可理解的错误提示和测试。
6. 对长视频实现分段、可恢复任务与更强的时序深度稳定策略。
