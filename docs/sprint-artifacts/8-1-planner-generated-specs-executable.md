# Story 8.1: 规划生成的 Markdown 用例可直接执行

Status: done

## Story

As a QA 工程师,
I want `autoqa plan` / `autoqa plan-explore` + `autoqa plan-generate` 生成的 Markdown 用例在结构和风格上与手写示例保持一致,
so that 我可以直接用 `autoqa run` 执行这些用例而无需手工重写。

## Acceptance Criteria

1. **Given** 使用 `autoqa plan` 或 `autoqa plan-explore` + `autoqa plan-generate` 为类似 SauceDemo / Polyv 场景生成测试计划  
   **When** 直接对生成目录 `.autoqa/runs/<runId>/plan/specs/` 运行 `autoqa run`  
   **Then** `autoqa run` 不应因为 Markdown 结构或模板变量错误而失败（例如缺少 `## Preconditions` / `## Steps`、有序列表格式、未知模板变量等）

2. **Given** Planner 基于 ExplorationGraph 生成 `TestPlan` 与 Markdown specs  
   **When** 查看单个生成的 spec  
   **Then** 其结构应满足：  
   - 顶部有清晰标题 `# <系统> - <功能描述>（自动生成）`  
   - 包含 `## Preconditions` 段，使用 `{{BASE_URL}}`、`{{LOGIN_BASE_URL}}` 等模板变量描述关键 URL 与登录前提  
   - 包含 `## Steps` 段，有序列表步骤（1. 2. ...），导航步骤使用具体 URL（基于模板变量），验证步骤紧跟 `- Expected: ...` 断言行

3. **Given** Planner 生成的 Markdown specs 将被 Epic 5/6 的环境与登录态机制消费  
   **When** 在 spec 中使用 URL / 模板变量  
   **Then** 所有属于 `config.baseUrl` 域的导航步骤必须采用 `{{BASE_URL}}/path` 或 `{{LOGIN_BASE_URL}}/path` 形式，不允许写死完整域名  
   **And** 不得在 spec 中直接写入账号/密码等敏感信息

4. **Given** 对 Planner 输出增加基础单元测试覆盖  
   **When** 运行相关单元测试  
   **Then** 至少验证：  
   - 通过 mock 的 `TestPlan` 生成的 Markdown 满足 `parseMarkdownSpec` 的最小结构约束  
   - 使用包含模板变量的示例 spec 渲染后仍可被 `autoqa run` 链路正常消费

## Tasks / Subtasks

- [x] 对 Planner 输出结构施加约束（AC: 1, 2, 3）
  - [x] 在 `plan-agent` prompt 中补充“Markdown 结构规范”与 URL 写法要求（参考 ts-8-1-8-3 第 4.2–4.4 节）
  - [x] 确保 `TestCasePlan.preconditions` 明确列出关键 URL 与登录/权限假设，并使用模板变量而非硬编码域名
  - [x] 约束 `TestCasePlan.steps[].description` 使用可执行语义（Navigate / Click / Fill / Verify），并在导航步骤中包含具体 URL 与模板变量
  - [x] 约束 `TestCasePlan.steps[].expectedResult` 为非空且可验证的断言描述

- [x] 将 ExplorationGraph URL 映射为模板化写法（AC: 2, 3）
  - [x] 在 orchestrator 或辅助函数中实现 URL → 模板 URL 转换规则：  
        例如 `https://console.polyv.net/live/index.html#/channel` → `{{BASE_URL}}/live/index.html#/channel`
  - [x] 为 `config.baseUrl` 域内的页面统一应用该转换，并在 prompt 中通过示例明确说明
  - [x] 确保生成的 Markdown 中不出现站点的硬编码绝对 URL

- [x] 与 `autoqa run` 解析链路对齐（AC: 1, 2, 4）
  - [x] 复用现有 `parseMarkdownSpec` / 模板变量渲染逻辑，不修改 CLI 行为与语法约定
  - [x] 增加最小单元测试：对 Planner 生成的 Markdown 片段调用 `parseMarkdownSpec`，验证结构正确且能展开 `include:` 步骤库
  - [x] 在需要时补充 docs 示例（例如在 Polyv/SauceDemo 场景下的 Planner 输出样本）

- [x] 回归与文档（AC: 1, 4）
  - [x] 扩展现有 Planner 相关测试，覆盖“从探索产物到 Markdown spec 再到 autoqa run”的端到端 happy path
  - [x] 在 `ts-8-1-8-3-plan-scope-and-executable-specs.md` 中标记已实现的 W2 相关条目
  - [x] 更新 README / docs 里对 Planner 输出可执行性的说明

## Dev Notes

- 本故事聚焦 **Planner 输出的 Markdown 用例可执行性**，不改变 `autoqa run` 的执行模型与 CLI 约定。  
  - **来源:** [Source: docs/sprint-artifacts/ts-8-1-8-3-plan-scope-and-executable-specs.md#1-背景与目标]
- URL 与模板变量写法必须与 Epic 5/6 中的环境与登录态方案对齐，避免 Planner 生成的用例与手写用例在行为上出现不一致。  
  - **来源:** [Source: docs/epics.md#Epic-5-环境与测试数据配置（多环境-登录凭据等敏感配置）]  
  - **来源:** [Source: docs/epics.md#Epic-6-导出用例的登录态复用与执行加速-Playwright-Test-Suite-Optimization]
- Planner 不负责引入新的 Markdown 语法；所有输出必须兼容现有 `parseMarkdownSpec` 与 `autoqa run` 的最小结构要求。  
  - **来源:** [Source: docs/epics.md#Story-2.3-解析-Markdown-spec（Preconditions-步骤-断言语句）]

### Project Structure Notes

- 保持现有分层：  
  - CLI：`src/cli/commands/plan.ts` 仅做参数解析与 orchestrator 调用。  
  - Orchestrator 与 Planner：`src/plan/*` 负责探索、规划与 Markdown 生成。  
  - 禁止在 Planner 直接操作 Playwright / Browser 实例。  
  - **来源:** [Source: docs/architecture.md#Project-Structure-&-Boundaries（项目结构与边界）]
- 规划与执行产物仍落在 `.autoqa/runs/<runId>/plan/*` 路径下，保持与 Epic 7 一致的 run 布局。  
  - **来源:** [Source: docs/sprint-artifacts/ts-7-agent-based-intelligent-planner.md]

### References

- [Source: docs/epics.md#Story-8.1-规划生成的-Markdown-用例可直接执行]  
- [Source: docs/epics.md#Epic-8-Planner-输出质量与-URL-Scope-控制]  
- [Source: docs/sprint-artifacts/ts-8-1-8-3-plan-scope-and-executable-specs.md#4-设计详细-w2---markdown-spec-输出规范化（可执行性优先）]  
- [Source: docs/sprint-artifacts/7-3-plan-command-implementation.md]  
- [Source: docs/sprint-artifacts/2-3-parse-markdown-spec-preconditions-steps-assertions.md]

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

- 所有单元测试通过：`npm test` 执行成功（500 个测试全部通过）
- 新增测试文件：`tests/unit/plan-markdown-output.test.ts`（9 个测试用例）

### Completion Notes List

- ✅ 增强了 `plan-agent` 的 prompt，添加详细的 Markdown 结构规范和 URL 模板变量使用要求
- ✅ 实现了 `generateUrlMappingExamples` 函数，从探索的页面自动生成 URL 映射示例
- ✅ 更新了 `buildMarkdownForTestCase` 函数，确保默认使用 `{{BASE_URL}}` 模板变量
- ✅ 添加了标题后缀 "(Auto-generated)" 以区分自动生成的用例
- ✅ 创建了全面的单元测试套件，验证生成的 Markdown 满足 `parseMarkdownSpec` 要求
- ✅ 所有测试通过，包括新增测试和现有回归测试

### Code Review Fixes Applied (2025-12-21)

- ✅ 修复了文档不完整问题：在 File List 中添加了 `sprint-status.yaml` 的修改记录
- ✅ 增强了 URL 模板化逻辑：`generateUrlMappingExamples` 现在能自动识别登录页面并使用 `{{LOGIN_BASE_URL}}`
- ✅ 扩展了测试覆盖：添加了包含查询参数和 hash 的 URL 测试用例，以及 `LOGIN_BASE_URL` 与 `BASE_URL` 不同时的场景
- ✅ 所有测试继续通过（11 个测试用例）

### File List

- `src/plan/plan-agent.ts` - 增强 prompt，添加 URL 映射示例生成函数
- `src/plan/output.ts` - 更新 Markdown 生成函数，使用模板变量
- `tests/unit/plan-markdown-output.test.ts` - 新增单元测试文件（9 个测试）
- `tests/unit/plan-output.test.ts` - 更新现有测试以匹配新的默认值
- `tests/unit/plan-integration-with-run.test.ts` - 更新现有测试以匹配新的默认值
- `docs/sprint-artifacts/sprint-status.yaml` - 更新故事状态为 "review"
