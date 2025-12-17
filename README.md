# AutoQA-Agent

[![GitHub Repo stars](https://img.shields.io/github/stars/terryso/AutoQA-Agent?style=flat-square)](https://github.com/terryso/AutoQA-Agent/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/terryso/AutoQA-Agent?style=flat-square)](https://github.com/terryso/AutoQA-Agent/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/terryso/AutoQA-Agent?style=flat-square)](https://github.com/terryso/AutoQA-Agent/pulls)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/terryso/AutoQA-Agent/pulls)
[![GitHub last commit](https://img.shields.io/github/last-commit/terryso/AutoQA-Agent?style=flat-square)](https://github.com/terryso/AutoQA-Agent/commits)
[![License](https://img.shields.io/github/license/terryso/AutoQA-Agent?style=flat-square)](https://github.com/terryso/AutoQA-Agent)
[![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)

基于 Claude Agent SDK + Playwright 的"文档即测试"（Docs-as-Tests）自动化验收测试 CLI 工具。

> **当前状态**：Epic 1/2 的执行闭环已完成，示例用例可以稳定运行。断言/自愈护栏与"导出 Playwright Test"功能正在开发中。

## 📖 目录

- [概述](#概述)
- [快速开始](#快速开始)
- [工作原理](#工作原理)
- [已实现功能](#已实现功能)
- [使用指南](#使用指南)
- [配置](#配置)
- [运行产物](#运行产物)
- [开发指南](#开发指南)
- [路线图](#路线图)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

## 概述

AutoQA-Agent 是一个创新的自动化测试工具，让 QA 和产品经理能够用自然语言 Markdown 编写验收测试，直接转换为可执行的测试流程。

![AutoQA-Agent 总览图](https://i.v2ex.co/hr3K8E93l.png)

更详细的架构边界与约束说明请参考 [`docs/architecture.md`](docs/architecture.md)。

### 核心目标

- **消除脚本脆弱性**：通过智能定位策略，减少 UI 微小变动导致的测试维护成本
- **文档即测试**：用 Markdown 编写测试用例，让非技术人员也能参与测试编写
- **轻量级 Agent 架构**：依托 Claude Agent SDK 管理推理循环，专注优化浏览器工具质量

## 快速开始

### 环境要求

- Node.js >= 20
- npm 或 yarn
- Anthropic API Key

### 安装

```bash
# 克隆仓库
git clone https://github.com/terryso/AutoQA-Agent.git
cd AutoQA-Agent

# 安装依赖
npm install

# 构建项目
npm run build

# 全局安装（可选）
npm link
```

### 初始化项目

```bash
# 初始化配置
autoqa init

# 这将创建：
# - autoqa.config.json - 配置文件
# - specs/ - 测试用例目录（含示例）
```

### 运行第一个测试

```bash
# 运行单个测试
autoqa run specs/login-example.md

# 运行目录下所有测试
autoqa run specs/

# 指定基础 URL
autoqa run specs/ --url https://www.saucedemo.com/

# 调试模式（显示浏览器界面）
autoqa run specs/ --debug
```

## 工作原理

```mermaid
flowchart TD
    A["Markdown 测试用例"] --> B["解析器<br/>提取 Preconditions & Steps"]
    B --> C["Claude Agent SDK<br/>ReAct 循环执行"]
    C --> D["MCP 浏览器工具<br/>snapshot/navigate/click/fill"]
    D --> E["Playwright 引擎<br/>实际浏览器操作"]
    E --> F["执行结果<br/>截图/日志/Trace"]

    style A fill:#e3f2fd,stroke:#2196f3,color:#0d47a1
    style B fill:#f3e5f5,stroke:#9c27b0,color:#4a148c
    style C fill:#e8eaf6,stroke:#3f51b5,color:#1a237e
    style D fill:#fff3e0,stroke:#ff9800,color:#e65100
    style E fill:#e8f5e9,stroke:#4caf50,color:#1b5e20
    style F fill:#fce4ec,stroke:#e91e63,color:#880e4f
```

### 执行流程

1. **Markdown 解析**：提取前置条件和测试步骤
2. **Agent 执行**：Claude Agent SDK 管理"观察-思考-行动"循环
3. **智能定位**：优先使用稳定的 ref 引用，失败时回退到语义描述
4. **结果收集**：自动记录截图、快照和执行日志

## 已实现功能

### CLI 命令

- **`autoqa init`** - 初始化项目配置
- **`autoqa run <path>`** - 执行测试用例
- **`autoqa run --debug`** - 调试模式运行
- **`autoqa run --headless`** - 无头模式运行（默认）

### 浏览器工具

| 工具 | 功能描述 | 参数 |
|------|---------|------|
| `snapshot` | 采集可访问性快照 | - |
| `navigate` | 导航到指定页面 | url |
| `click` | 点击元素 | ref, targetDescription |
| `fill` | 填充输入框 | ref, targetDescription, text |
| `select_option` | 选择下拉选项 | ref, label |
| `scroll` | 滚动页面 | direction, amount |
| `wait` | 显式等待 | seconds |

## 使用指南

### 编写测试用例

测试用例使用 Markdown 格式，需要包含以下结构：

```markdown
# 测试用例标题

## Preconditions

- Base URL: https://example.com
- 测试账号已创建
- 浏览器支持 JavaScript

## Steps

1. Navigate to /login
2. Verify the login form is visible
3. Fill the username field with testuser
4. Fill the password field with password123
5. Click the "Login" button
6. Verify the user is redirected to dashboard
```

### 断言语句

使用以下开头的步骤会被识别为断言：

- `Verify` / `Assert`
- `验证` / `断言`

### 最佳实践

1. **保持步骤独立**：每个步骤应该是一个独立的操作
2. **使用明确的描述**：避免模糊的操作描述
3. **合理使用断言**：在关键验证点添加断言
4. **管理测试数据**：使用 Preconditions 声明所需的测试数据

## 配置

`autoqa.config.json` 配置文件：

```json
{
  "schemaVersion": 1,
  "defaults": {
    "baseUrl": "https://example.com",
    "timeout": 30000,
    "headless": true
  },
  "artifacts": {
    "screenshots": true,
    "snapshots": true,
    "traces": true
  }
}
```

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `ANTHROPIC_API_KEY` | Claude API 密钥 | - |
| `AUTOQA_ARTIFACTS` | 产物目录路径 | `.autoqa/runs` |
| `AUTOQA_TOOL_CONTEXT` | 工具上下文级别 | `info` |

## 运行产物

执行完成后，测试产物保存在 `.autoqa/runs/<runId>/` 目录：

```
.autoqa/runs/2024-01-01T12-00-00/
├── run.log.jsonl    # 结构化执行日志
├── screenshots/     # 页面截图
├── snapshots/       # 可访问性快照
└── traces/          # Playwright Trace 文件
```

## 开发指南

### 项目结构

```
src/
├── cli.ts           # CLI 入口
├── runner/          # 测试运行器
├── agent/           # Agent 相关
├── tools/           # 浏览器工具
├── markdown/        # Markdown 解析
└── specs/           # 测试发现
```

### 构建和测试

```bash
# 开发模式
npm run dev

# 运行测试
npm test

# 构建生产版本
npm run build
```

## 路线图

### Epic 3：验收判定与自愈闭环

- [ ] 断言工具实现
- [ ] 失败重试机制
- [ ] 执行护栏和限制
- [ ] CI/CD 友好的错误报告

### Epic 4：导出 Playwright Test

- [ ] 动作 IR 记录
- [ ] 稳定定位符生成
- [ ] 自动导出 @playwright/test 兼容代码

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=terryso/AutoQA-Agent&type=date&legend=top-left)](https://www.star-history.com/#terryso/AutoQA-Agent&type=date&legend=top-left)

## 贡献指南

我们欢迎所有形式的贡献！

### 提交 Issue

- 使用 Issue 模板报告 Bug 或提出功能建议
- 提供详细的复现步骤和环境信息

### 提交 Pull Request

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

### 开发规范

- 遵循现有代码风格
- 添加适当的测试
- 更新相关文档

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 致谢

- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) - Agent 框架
- [Playwright](https://playwright.dev/) - 浏览器自动化
- [Mermaid](https://mermaid.js.org/) - 图表支持

---

## 常见问题

<details>
<summary>如何调试失败的测试？</summary>

使用 `--debug` 参数运行测试，可以看到浏览器界面。查看 `.autoqa/runs/<runId>/run.log.jsonl` 获取详细执行日志。
</details>

<details>
<summary>是否支持 CI/CD 集成？</summary>

是的，可以通过 `--headless` 参数在 CI 环境中运行。退出码约定：0=成功，1=测试失败，2=配置错误。
</details>

<details>
<summary>如何处理动态内容？</summary>

Agent 会自动重试失败的操作。建议使用 `wait` 工具等待动态内容加载完成。
</details>

---

如有任何问题，请提交 [Issue](https://github.com/terryso/AutoQA-Agent/issues) 或加入我们的讨论。