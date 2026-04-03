# Recipe Pathfinder 🌐

## 这是什么？

这是一个专门适配 **GregTech Modern (GTCEu)** 制作的配方树搜索与可视化系统。它包含一个 Python 寻路算法后端，以及一个基于 React 的动态前端展示界面。你可以输入目标产物和原材料，它会自动为你寻找和渲染相关的动态配方树。

  **声明：本项目大部分由 AI 编写，质量参差不齐**

## 项目使用

本系统需要真实的配方数据作为基础支撑。请使用配套的 **Minecraft 模组** 提取最新的配方 JSON 文件。
目前适配GregTech Odyssey整合包格雷配方

🔗 配套模组提取工具：[0]

## 系统架构

- **后端 (`recipe_pathfinder_backend`)**：Python (FastAPI 等)，负责读取海量 JSON 配方数据，并通过算法计算最佳合成路线。
- **前端 (`recipe_pathfinder_frontend`)**：React + TypeScript，接收后端的数据，渲染出炫酷的节点式交互图（Flow Nodes）。

## 如何运行 (Run)

系统已配置好本地一键启动脚本。

1. 双击根目录下的 `start.bat`。
2. 脚本会自动为你打通前后端服务，并提供本地访问链接。

## 许可协议 (License)

本项目采用 [MIT License](LICENSE) 协议开源。
