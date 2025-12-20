# Epic 7: Agent 驱动智能测试规划器（基于 snapshot 的自动化测试计划生成）- Tech Spec（Story 7.1–7.5）

Status: complete

## Goals

- 让 Planner 主要由 Claude Agent 驱动：探索逻辑、测试类型选择与覆盖策略尽量通过 Agent + 工具协议实现，而不是写死在 TypeScript 规则引擎中。
- 复用 `autoqa run` 现有的视觉感知与浏览器工具层（screenshot + AX/ARIA snapshot + `navigate/click/fill/scroll/wait`）。
- 在成本与 guardrail 约束下，自动生成一组可直接由 `autoqa run` 执行、并可进一步导出为 Playwright Test 的 Markdown 测试计划。

## Non-goals

- 不在本 Epic 内实现端到端的 CI 编排（例如自动将规划结果提交 PR 或接入特定 CI 平台）。
- 不在 TypeScript 中为每类页面/组件维护复杂的规则引擎（这部分交给 Agent 推理完成）。
- 不重新设计 Markdown spec 语法；Planner 输出必须兼容现有 `autoqa run` 期望的结构。

## User-facing Behavior

- `autoqa plan explore -u <url> [-d <depth>] [...options]`  
  - 触发 Story 7.1：Agent 驱动的探索 Session。  
  - 产物输出到 `.autoqa/runs/<runId>/plan-explore/*`。

- `autoqa plan -u <url> [--config <path>] [...options]`  
  - 触发 Story 7.3：顶层编排，顺序执行探索（7.1）和用例生成（7.2），并使用 Story 7.4 的配置策略。  
  - 在 `.autoqa/runs/<runId>/plan/` 下生成：  
    - `plan-summary.json`：规划摘要与 guardrail 信息  
    - `test-plan.json`：结构化测试计划（`TestPlan`）  
    - `specs/*.md`：可由 `autoqa run` 直接执行的 Markdown 测试用例

- `autoqa run <generated-spec-or-dir>`  
  - 复用现有执行管线与 Epic 4 的导出机制，对规划生成的 specs 无特殊分支。

## Architecture Overview

### 分层结构

- **CLI 层（`src/cli/commands/plan.ts`）**  
  - 解析 `autoqa plan` / `autoqa plan explore` 参数与环境。  
  - 调用 `PlanOrchestrator` 并处理退出码与日志。

- **Plan Orchestrator（`src/plan/orchestrator.ts`）**  
  - 暴露统一入口（例如 `runPlan(config)`、`runExplore(config)`）。  
  - 管理 runId、产物目录、与 Planner Agent 的对话循环。  
  - 执行 Story 7.3 的编排逻辑与 Story 7.4 的 guardrail 检查。

- **Planner Agent 集成层（`src/agent/*` 或新模块）**  
  - 定义 Planner Agent 的 system prompt、tool schema、超参数（如 temperature、max tokens）。  
  - 复用已有 Agent SDK 护栏（超时、最大工具调用次数等），并为 Planner 增加特定 guardrail。

- **Browser & Snapshot 层（`src/browser/*`, `src/agent/pre-action-screenshot.ts`）**  
  - 提供统一的 snapshot API：在需要时生成 screenshot + AX/ARIA snapshot + metadata。  
  - 提供基础浏览器动作工具：`navigate/click/fill/scroll/wait`。  
  - 由 Planner Agent 调用这些工具推进探索或验证页面假设。

- **Artifacts & Output 层（`src/plan/output.ts`）**  
  - 管理探索产物（ExplorationGraph）、测试计划（TestPlan）、以及 Markdown spec 的写入。  
  - 统一 runId 与目录布局：`.autoqa/runs/<runId>/plan-explore/*`、`.autoqa/runs/<runId>/plan/*`。

## Core Types & Data Models

建议在 `src/plan/types.ts` 中集中定义：

### PlanConfig（Story 7.4）

- `baseUrl: string`
- `maxDepth: number` （最大探索深度）
- `maxPages: number` （最大页面数量）
- `includePatterns: string[]` （URL 包含模式，glob/regex 按实际选型）
- `excludePatterns: string[]` （URL 排除模式）
- `testTypes: ('functional' | 'form' | 'navigation' | 'responsive' | 'boundary' | 'security')[]`
- `guardrails: { maxAgentTurnsPerRun?: number; maxSnapshotsPerRun?: number; maxTokenPerRun?: number }`
- `auth?: { loginUrl?: string; usernameVar?: string; passwordVar?: string; extra?: Record<string, unknown> }`

### ExplorationGraph（Story 7.1）

- `pages: PageNode[]`
- `edges: NavigationEdge[]`

`PageNode`（与现有探索引擎模型对齐/超集）：

- `id: string`
- `url: string`
- `title?: string`
- `depth: number`
- `snapshotRef?: string`（指向 snapshot 文件路径）
- `elementSummary: ElementSummary[]`

`ElementSummary`：

- `id: string`
- `kind: 'button' | 'link' | 'input' | 'textarea' | 'select' | 'form' | 'other'`
- `text?: string`
- `role?: string`
- `locatorCandidates?: LocatorCandidate[]`（可与 Epic 4 中定义复用/对齐）

### TestPlan & TestCasePlan（Story 7.2）

- `TestPlan`：
  - `runId: string`
  - `generatedAt: string`
  - `configSnapshot: PlanConfig`（最终生效的配置）
  - `flows: FlowPlan[]`
  - `cases: TestCasePlan[]`

- `TestCasePlan`：
  - `id: string`
  - `name: string`
  - `type: 'functional' | 'form' | 'navigation' | 'responsive' | 'boundary' | 'security'`
  - `priority: 'p0' | 'p1' | 'p2'`
  - `relatedPageIds: string[]`
  - `markdownPath: string`（相对 `.autoqa/runs/<runId>/plan/specs/`）

## Planner Agent Design

### System Prompt（要点）

- 角色：资深 QA / 测试架构师，熟悉 Web 应用常见模式与质量风险。
- 职责：
  - 利用有限的探索预算识别应用的主要用户旅程与高风险区域。
  - 设计覆盖合理的测试计划，而不是穷举所有组合。
  - 严格输出结构化的建议（通过工具返回的 JSON），由 TypeScript 渲染为最终 Markdown。

### Planner 工具（抽象协议）

这些是对 Agent 暴露的“虚拟工具”，实现层可组合现有浏览器与存储逻辑：

- `open_url(url: string)`  
  - 行为：打开指定 URL，返回 snapshot 引用与简要结构化描述（标题、主区域、交互元素统计等）。

- `observe_current_page()`  
  - 行为：在当前页面生成 snapshot 并返回解析后的结构（与 `open_url` 输出类似）。

- `list_known_pages()` / `get_page(pageId: string)`  
  - 行为：基于当前 `ExplorationGraph` 返回已发现页面的信息。

- `propose_test_cases_for_page(input: { pageId: string; config: PlanConfig })`  
  - 行为：针对单个页面输出一组候选 `TestCasePlan` 片段（尚未绑定 markdownPath）。

- `finalize_test_plan(input: { partialCases: Partial<TestCasePlan>[]; graphSummary: ... })`  
  - 行为：对整体测试计划做去重、优先级排序与补全，输出最终 `TestPlan`。

> 实际实现时，可通过“单一工具 + 模式字段”简化为一个多态工具，关键是保持输入输出结构在 tech-spec 中清晰定义。

## Execution Flow

### Phase 1：Exploration Session（Story 7.1）

1. Orchestrator 初始化：创建 runId、产物目录、PlanConfig。  
2. 启动浏览器与 Planner Agent。  
3. Agent 通过 `open_url` / `observe_current_page` / 浏览器动作工具执行多轮探索：
   - 每次动作前后由浏览器层生成 snapshot 并落盘。  
   - 更新 `ExplorationGraph` 与 transcript。  
4. 当 Agent 判定“探索足够”或触发 guardrail 时，结束 Phase 1。

### Phase 2：Test Plan Generation（Story 7.2）

1. Orchestrator 汇总 `ExplorationGraph` 与关键 snapshot（可按启发式挑选）。  
2. 调用 Planner Agent 的规划工具：
   - 针对重点页面调用 `propose_test_cases_for_page`。  
   - 汇总并通过 `finalize_test_plan` 生成 `TestPlan`。  
3. Orchestrator 将 `TestPlan` 渲染为 Markdown specs 并写入磁盘。

### Phase 3：Summary & Integration（Story 7.3 / 7.5）

1. 生成 `plan-summary.json`，包含：页数、用例数、类型覆盖、guardrail 触发情况等。  
2. 输出 CLI 总结日志（成功/失败、产物路径）。  
3. 用户可直接对生成的 specs 运行 `autoqa run` 并通过 Epic 4 导出 Playwright Test。

## Guardrails & Failure Semantics

- `maxAgentTurnsPerRun`：Agent 工具调用总次数上限。  
- `maxSnapshotsPerRun`：snapshot 生成次数上限，用于控制视觉成本。  
- `maxTokenPerRun`（可选）：对 Planner 整体 token 消耗设定预算。

触发任一 guardrail 时：

- Orchestrator 应中断当前 Phase，标记本次 run 被 guardrail 截断。  
- `plan-summary.json` 中记录具体触发的 guardrail 与当时的计数。  
- CLI 退出码为 `1`，并在日志中给出可理解提示。

## Security & Cost Notes

- 不在 Planner 层持久化任何 API Key 或敏感凭据；登录相关凭据通过环境变量与占位符机制传入。  
- snapshot 复用现有压缩策略（宽度约 1024px、JPEG 等），避免 Planner 成本显著高于 `autoqa run`。  
- 规划日志与产物中应避免记录明文密码等敏感信息，仅记录占位符或脱敏摘要。

## References

- [Source: docs/epics.md#Epic-7-Agent-驱动智能测试规划器（基于-snapshot-的自动化测试计划生成）]  
- [Source: docs/epics.md#Story-7.1-Agent-驱动的应用探索-Session（autoqa-plan-explore）]  
- [Source: docs/epics.md#Story-7.2-Agent-驱动的智能测试用例生成器]  
- [Source: docs/epics.md#Story-7.3-autoqa-plan-命令编排（探索-规划-用例生成）]  
- [Source: docs/epics.md#Story-7.4-配置化探索与生成策略]  
- [Source: docs/epics.md#Story-7.5-与现有执行导出工具链的集成]  
- [Source: docs/architecture.md#Core Architectural Decisions（核心架构决策）]  
- [Source: docs/prd.md#Functional Requirements]

## Implementation Status (Story 7.2)

### Completed Features

1. **Data Models** ✅
   - All types defined in `src/plan/types.ts`
   - PlanConfig, TestPlan, TestCasePlan, FlowPlan implemented
   - ExplorationGraph and supporting types ready

2. **MCP Tools** ✅
   - `list_known_pages`: Returns discovered pages with metadata
   - `get_page_snapshot`: Retrieves page details and elements
   - `propose_test_cases_for_page`: Provides page context for test design

3. **Agent Integration** ✅
   - Claude Agent SDK integration in `src/plan/plan-agent.ts`
   - Structured prompt with clear output requirements
   - JSON parsing and validation

4. **Markdown Rendering** ✅
   - `buildMarkdownForTestCase` in `src/plan/output.ts`
   - Supports Preconditions and ordered steps
   - Placeholder usage for sensitive data

5. **CLI Commands** ✅
   - `autoqa plan explore` - Application exploration
   - `autoqa plan generate` - Test case generation (needs run ID)
   - `autoqa plan run` - Combined workflow

### CLI Usage Examples

```bash
# Explore application
autoqa plan explore -u https://example.com -d 3

# Generate test cases from exploration
autoqa plan generate --run-id <uuid>

# Combined workflow
autoqa plan run -u https://example.com -d 3 --test-types functional,form,security
```

### Output Structure

```
.autoqa/runs/<runId>/
├── plan-explore/
│   ├── explore-graph.json
│   ├── explore-elements.json
│   └── explore-transcript.jsonl
└── plan/
    ├── test-plan.json
    └── specs/
        ├── functional-p0-login.md
        ├── form-p1-search.md
        └── security-p0-xss.md
```

### Implementation Notes

- Agent decides test types dynamically based on page analysis
- TypeScript only provides context and tools, no hardcoded rules
- All outputs use placeholders for sensitive data
- Guardrails implemented to control resource usage

## MCP Tools 输入输出结构详细约定

### 工具概述

Planner Agent 通过 MCP (Model Context Protocol) 工具与探索结果交互。所有工具在 `src/plan/planner-tools-mcp.ts` 中实现，使用 `@anthropic-ai/claude-agent-sdk` 暴露。

### 工具 1: `list_known_pages`

**功能**: 列出探索阶段发现的所有页面

**输入参数**: 无

**输出结构**:
```typescript
{
  pages: Array<{
    id: string           // 页面唯一标识符
    url: string          // 页面完整 URL
    title?: string       // 页面标题（从 document.title 获取）
    depth: number        // 探索深度（从起始页面开始计数）
    snapshotRef?: string // snapshot 文件引用路径
  }>
}
```

**使用场景**: Agent 在规划测试用例前，先了解整体应用结构和已发现的页面

**实现示例**:
```typescript
tool(
  'list_known_pages',
  'List pages discovered during exploration.',
  {},
  async () => {
    const pages = graph.pages.map((page) => ({
      id: page.id,
      url: page.url,
      title: page.title,
      depth: page.depth,
      snapshotRef: page.snapshotRef,
    }))
    return { pages }
  }
)
```

### 工具 2: `get_page_snapshot`

**功能**: 获取指定页面的详细信息和 snapshot 引用

**输入参数**:
```typescript
{
  pageId: string  // 页面 ID（从 list_known_pages 获取）
}
```

**输出结构**:
```typescript
{
  ok: boolean
  error?: string  // 当 ok=false 时提供错误信息
  page?: {
    id: string
    url: string
    title?: string
    depth: number
    snapshotRef?: string
  }
}
```

**错误处理**:
- 当 `pageId` 不存在时，返回 `{ ok: false, error: "Page not found: <pageId>" }`
- 成功时返回 `{ ok: true, page: {...} }`

**使用场景**: Agent 需要查看特定页面的详细信息以决定测试策略

**实现示例**:
```typescript
tool(
  'get_page_snapshot',
  'Get snapshot reference and basic info for a given page id.',
  { pageId: z.string() },
  async (args) => {
    const page = graph.pages.find((p) => p.id === args.pageId)
    if (!page) {
      return { ok: false, error: `Page not found: ${args.pageId}` }
    }
    return {
      ok: true,
      page: {
        id: page.id,
        url: page.url,
        title: page.title,
        depth: page.depth,
        snapshotRef: page.snapshotRef,
      },
    }
  }
)
```

### 工具 3: `propose_test_cases_for_page`

**功能**: 返回页面信息和可选的备注，帮助 Agent 设计测试用例。此工具本身不创建 TestCasePlan 对象，仅提供上下文信息

**输入参数**:
```typescript
{
  pageId: string      // 页面 ID
  notes?: string      // 可选的备注或推理说明
}
```

**输出结构**:
```typescript
{
  ok: boolean
  error?: string  // 当 ok=false 时提供错误信息
  page?: {
    id: string
    url: string
    title?: string
    depth: number
    snapshotRef?: string
  }
  notes?: string  // 回显输入的备注
}
```

**使用场景**: Agent 针对特定页面进行测试用例设计时，获取页面上下文。Agent 在调用此工具后，会在自己的输出中生成 TestCasePlan 结构

**实现示例**:
```typescript
tool(
  'propose_test_cases_for_page',
  'Return page info and optional notes to help you design test cases.',
  {
    pageId: z.string(),
    notes: z.string().optional(),
  },
  async (args) => {
    const page = graph.pages.find((p) => p.id === args.pageId)
    if (!page) {
      return { ok: false, error: `Page not found: ${args.pageId}` }
    }
    return {
      ok: true,
      page: {
        id: page.id,
        url: page.url,
        title: page.title,
        depth: page.depth,
        snapshotRef: page.snapshotRef,
      },
      notes: args.notes,
    }
  }
)
```

## Agent 输出结构约定

### 输出方式

Agent 不通过工具返回 TestPlan，而是在完成所有工具调用后，直接输出 JSON 格式的测试计划。

### 输出格式

```json
{
  "flows": [
    {
      "id": "flow-id",
      "name": "Flow Name",
      "description": "Flow description",
      "pagePath": ["page-id-1", "page-id-2"]
    }
  ],
  "cases": [
    {
      "id": "case-id",
      "name": "Test case name",
      "type": "functional",
      "priority": "p0",
      "relatedPageIds": ["page-id-1", "page-id-2"],
      "markdownPath": "relative/path/to/spec.md",
      "preconditions": ["Precondition 1", "Precondition 2"],
      "steps": [
        {
          "description": "Step description",
          "expectedResult": "Expected outcome"
        }
      ]
    }
  ]
}
```

### 字段详细说明

#### `flows` 数组（可选）

测试流程分组，用于组织相关的测试用例：

- `id` (string, 必需): 流程唯一标识符
- `name` (string, 必需): 流程名称
- `description` (string, 可选): 流程描述
- `pagePath` (string[], 可选): 流程涉及的页面 ID 序列

#### `cases` 数组（必需）

测试用例列表，至少包含一个用例：

- `id` (string, 必需): 用例唯一标识符
- `name` (string, 必需): 用例名称
- `type` (string, 必需): 测试类型，必须是以下之一：
  - `"functional"` - 功能测试
  - `"form"` - 表单测试
  - `"navigation"` - 导航测试
  - `"responsive"` - 响应式测试
  - `"boundary"` - 边界条件测试
  - `"security"` - 安全性测试
- `priority` (string, 必需): 优先级，必须是以下之一：
  - `"p0"` - 最高优先级（关键功能）
  - `"p1"` - 中等优先级（重要功能）
  - `"p2"` - 较低优先级（次要功能）
- `relatedPageIds` (string[], 必需): 相关页面 ID 列表
- `markdownPath` (string, 必需): 生成的 Markdown 文件相对路径（相对于 `.autoqa/runs/<runId>/plan/specs/`）
- `preconditions` (string[], 可选): 前置条件列表
- `steps` (array, 可选但推荐): 测试步骤列表
  - `description` (string): 步骤描述
  - `expectedResult` (string): 预期结果

### 解析与验证流程

TypeScript 代码负责解析和验证 Agent 输出：

1. **提取 JSON** (`extractJsonFromOutput` 函数)
   - 支持 ```json 代码块格式
   - 支持裸 JSON 格式
   - 使用括号深度匹配算法精确提取

2. **解析 JSON** (`parseTestPlanOutput` 函数)
   - 使用 `JSON.parse` 解析字符串
   - 验证基本结构（flows 和 cases 数组）

3. **规范化数据** 
   - `normalizeFlow`: 规范化流程数据，提供默认值
   - `normalizeCase`: 规范化测试用例数据，验证类型和优先级

4. **验证规则**
   - 至少包含一个测试用例
   - 类型必须是六种预定义类型之一
   - 优先级必须是 p0/p1/p2 之一
   - 如果字段缺失或无效，使用合理的默认值

### 占位符约定

**敏感数据处理**:
- 使用双花括号占位符：`{{USERNAME}}`、`{{PASSWORD}}`、`{{API_KEY}}`
- 在 Markdown 渲染时保留占位符，不替换为实际值
- 执行时通过环境变量或配置文件提供实际值

**示例**:
```markdown
## Preconditions
- User has valid credentials: {{USERNAME}} / {{PASSWORD}}

## Steps
1. Navigate to login page
2. Enter username: {{USERNAME}}
3. Enter password: {{PASSWORD}}
4. Click "Login" button
   - Expected: User is redirected to dashboard
```

### 错误处理

如果 Agent 输出不符合预期，TypeScript 代码会抛出明确的错误信息：

- `"Failed to extract JSON TestPlan from planner output"` - 无法提取 JSON
- `"Failed to parse TestPlan JSON: <error>"` - JSON 解析失败
- `"Planner Agent returned no test cases in TestPlan"` - 没有生成任何测试用例

这些错误会被 orchestrator 捕获并记录到日志中。
