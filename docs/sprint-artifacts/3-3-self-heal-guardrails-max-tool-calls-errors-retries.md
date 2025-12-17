# Story 3.3: 自愈护栏（maxToolCalls/maxConsecutiveErrors/maxRetriesPerStep）

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want 为自愈与重试设置硬上限（`maxToolCallsPerSpec` / `maxConsecutiveErrors` / `maxRetriesPerStep`），
so that CI 不会因为无限重试而卡死或成本失控。

## Acceptance Criteria

1. **Given** 单个 spec 正在运行且 Agent 正在调用 MCP browser tools
   **When** 工具调用次数超过 `maxToolCallsPerSpec`
   **Then** 必须立即终止该 spec 的 Agent 执行并将 spec 标记为失败（退出码语义为“测试失败”）
   **And** 失败信息必须包含可机器处理的护栏标识（例如 `GUARDRAIL_MAX_TOOL_CALLS`）
   **And** 失败信息必须包含 `limit` 与 `actual`（便于 CI 诊断与调参）

2. **Given** MCP tool result 回流到 SDK 时可能出现 `tool_result.is_error = true`
   **When** 连续错误次数超过 `maxConsecutiveErrors`
   **Then** 必须立即终止该 spec 的 Agent 执行并将 spec 标记为失败
   **And** 失败信息必须包含可机器处理的护栏标识（例如 `GUARDRAIL_MAX_CONSECUTIVE_ERRORS`）

3. **Given** spec 包含 N 个步骤（Markdown steps）且 Agent 必须按序执行
   **When** 同一个 step 的失败重试次数超过 `maxRetriesPerStep`
   **Then** 必须立即终止该 spec 的 Agent 执行并将 spec 标记为失败
   **And** 失败信息必须包含可机器处理的护栏标识（例如 `GUARDRAIL_MAX_RETRIES_PER_STEP`）与 `stepIndex`

4. **Given** 用户通过 `autoqa.config.json` 配置护栏参数
   **When** `autoqa run` 启动并加载配置
   **Then** 护栏参数必须通过 `zod` 校验（正整数）并具备默认值
   **And** 当配置文件存在但不合法时，必须以退出码 `2` 失败并输出可理解的错误信息

5. **Given** 护栏触发导致 spec 失败
   **When** 结构化日志与 CLI 汇总输出生成
   **Then** 必须能从失败原因中明确识别触发的护栏类型（至少在 `autoqa.spec.finished.failureReason` 中体现）

## Tasks / Subtasks

- [x] 配置契约：加入护栏字段并提供默认值（AC: 4）
  - [x] 更新 `src/config/schema.ts`：新增并校验 `maxToolCallsPerSpec` / `maxConsecutiveErrors` / `maxRetriesPerStep`（正整数；可选但必须有默认值）
  - [x] 更新 `src/config/defaults.ts`：提供合理默认值（建议先偏保守：例如 `maxToolCallsPerSpec=200`、`maxConsecutiveErrors=8`、`maxRetriesPerStep=5`，最终以实际跑通成本/稳定性调优）
  - [x] 确保 `autoqa init` 生成的新配置文件包含上述字段（通过 `src/config/init.ts` 写入默认配置）

- [x] 配置加载：在 `autoqa run` 中读取并传递护栏配置（AC: 4）
  - [x] 新增 `src/config/read.ts`（或等价模块）：从 `process.cwd()` 读取 `autoqa.config.json` 并用 `autoqaConfigSchema` 解析（建议：文件不存在时使用默认配置；文件存在但不合法则退出码 `2`）
  - [x] 在 `src/cli/commands/run.ts` 中加载配置，并将 guardrails 透传到 Agent 层（例如 `runAgent({ ..., guardrails })`）

- [x] Step 关联：让 tool 调用与错误能够归因到 step（为 maxRetriesPerStep 提供可靠输入）（AC: 3, 5）
  - [x] 更新 `src/agent/run-agent.ts` 的 prompt 规则：要求 Agent 在每次工具调用时携带 `stepIndex`（与 Markdown steps 的编号一致）
  - [x] 更新 `src/agent/browser-tools-mcp.ts`：为各 MCP tools schema 增加可选 `stepIndex?: number`（或统一的 string→number 兼容策略）
  - [x] 在 `logToolCall` / `logToolResult` 中填充 `stepIndex`（当前为 `null`），以便从 `.autoqa/runs/<runId>/run.log.jsonl` 追踪"哪个 step 在疯狂重试"
  - [x] 明确降级策略：当 stepIndex 缺失/不合法时，不得 crash；按 `null` 记录，并且 per-step 护栏可选择回退到全局护栏（但必须有清晰日志提示）

- [x] 护栏核心实现：在 Agent 层强制终止无限循环（AC: 1-3, 5）
  - [x] 在 `src/agent/run-agent.ts` 为每个 spec 维护运行时计数器：
    - [x] `toolCalls`：统计 `tool_use` 的次数（建议包含 `snapshot`，避免成本失控；如需排除需在 story 内注明并保持一致）
    - [x] `consecutiveErrors`：统计连续 `tool_result.is_error=true`
    - [x] `retriesPerStep`：按 `stepIndex` 统计失败次数
  - [x] 当任一护栏触发时：
    - [x] 立刻停止继续消费/等待 Agent 输出，并以可机器处理的 error.code 终止（建议抛出带 `code` 的 Error；必要时研究 Agent SDK 是否提供 `abort()` 并优先使用）
    - [x] 输出清晰的失败摘要（至少包含 guardrail 名称、limit、actual、stepIndex（如有））
    - [x] 确保该失败被 runner 视为"测试失败"而非"用户输入错误"（最终 `autoqa run` 退出码应为 `1`）

- [x] 单元测试（覆盖护栏行为与配置加载）（AC: 1-5）
  - [x] 新增 `tests/unit/agent-guardrails.test.ts`：mock `@anthropic-ai/claude-agent-sdk` 的 `query()`，构造可控的 message stream，断言：
    - [x] 工具调用次数超过阈值时抛出 `GUARDRAIL_MAX_TOOL_CALLS`
    - [x] 连续错误超过阈值时抛出 `GUARDRAIL_MAX_CONSECUTIVE_ERRORS`
    - [x] 同 stepIndex 的错误超过阈值时抛出 `GUARDRAIL_MAX_RETRIES_PER_STEP`
  - [x] 新增/补齐 config 解析测试：缺失字段走默认值；非法值导致退出码 `2`

## Dev Notes

- 分层边界（强约束）
  - 护栏属于 Agent 运行策略，应落在 `src/agent/**`（参见 `docs/architecture.md` 与 `docs/project_context.md`）。
  - `src/runner/**` 只负责 per-spec 生命周期与隔离；`src/cli/**` 只做参数解析与错误映射。

- 现状与切入点（避免重复造轮子）
  - 当前已存在“粗护栏”：`src/agent/run-agent.ts` 固定 `maxTurns: 50`。
  - MCP tools 已能把失败映射为 `isError: true`（`src/agent/browser-tools-mcp.ts` 的 `return { ..., isError: !result.ok }`），这是实现 `maxConsecutiveErrors` 的信号源。
  - 结构化日志类型已包含 `stepIndex` 字段（`src/logging/types.ts`），但 MCP 目前写入为 `null`；本 story 需把它用起来。

- 退出码语义（必须一致）
  - 护栏触发属于“测试失败”，应最终映射为退出码 `1`（当前 `src/cli/commands/run.ts` 会把 `SPEC_EXECUTION_FAILED` 映射为 `1`）。
  - 配置文件不合法属于“用户输入/配置错误”，必须退出码 `2`。

- Token 成本与隐私
  - 禁止在护栏错误信息或 debug 输出中回传/打印敏感的 `text`/表单值；如需输出上下文，优先输出长度/计数与 error.code。

### Project Structure Notes

- 预计修改：
  - `src/agent/run-agent.ts`（护栏计数与强制终止）
  - `src/agent/browser-tools-mcp.ts`（stepIndex 透传与日志）
  - `src/config/schema.ts`、`src/config/defaults.ts`、`src/config/init.ts`（护栏配置契约与默认值）
  - `src/cli/commands/run.ts`（读取配置并传递到 agent）

- 预计新增：
  - `src/config/read.ts`（读取并校验配置）
  - `tests/unit/agent-guardrails.test.ts`（护栏回归）

### References

- [Source: docs/epics.md#Story 3.3]
- [Source: docs/architecture.md#Process Patterns（流程与护栏）]
- [Source: docs/project_context.md#6. 自愈护栏（必须有上限）]
- [Source: src/agent/run-agent.ts]
- [Source: src/agent/browser-tools-mcp.ts]
- [Source: src/cli/commands/run.ts]
- [Source: src/runner/run-specs.ts]
- [Source: src/logging/types.ts]

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

### Completion Notes List

- 实现了护栏配置契约：在 `schema.ts` 中添加 `guardrailsSchema`，在 `defaults.ts` 中提供默认值 (maxToolCallsPerSpec=200, maxConsecutiveErrors=8, maxRetriesPerStep=5)
- 新增 `src/config/read.ts` 用于读取和校验配置文件，支持文件不存在时使用默认值，文件无效时退出码 2
- 在 `run.ts` 中集成配置加载，将护栏参数传递给 `runAgent`
- 为所有 MCP 工具添加 `stepIndex` 可选参数，支持步骤级别的错误追踪
- 新增 `src/agent/guardrails.ts` 实现护栏核心逻辑：计数器、检查函数、`GuardrailError` 类
- 在 `run-agent.ts` 中集成护栏检查：基于 message stream 的 `tool_use/tool_result` 计数与 `tool_use_id`→`stepIndex` 关联，违规时抛出 `GuardrailError` 并写结构化事件 `autoqa.guardrail.triggered`
- 新增护栏单元测试 (`agent-guardrails.test.ts`) 与 `runAgent` 护栏集成测试 (`run-agent-guardrails.test.ts`)，并新增配置读取测试 (`config-read.test.ts`)
- 全量测试通过（当前为 179 个）

### File List

- src/config/schema.ts (modified)
- src/config/defaults.ts (modified)
- src/config/read.ts (new)
- src/cli/commands/run.ts (modified)
- src/agent/run-agent.ts (modified)
- src/agent/browser-tools-mcp.ts (modified)
- src/agent/guardrails.ts (new)
- tests/unit/agent-guardrails.test.ts (new)
- tests/unit/config-read.test.ts (new)
- tests/unit/run-agent-guardrails.test.ts (new)
- tests/unit/init.test.ts (modified)

## Senior Developer Review (AI)

### Review Summary

- 修复了 `stepIndex` 的 string→number 兼容：工具 schema 现在允许字符串数字并在内部统一解析
- 护栏统计口径修正：`toolCalls` 现在按 `tool_use` 计数（更贴合 AC 与成本控制）；错误/重试按 `tool_result` 计数，并通过 `tool_use_id` 关联 `stepIndex`
- 新增结构化日志事件 `autoqa.guardrail.triggered`，用于 CI 机器可读地定位触发的护栏、limit/actual 与 stepIndex
- 补齐 `runAgent` 集成测试：mock `query()` 的 async stream，直接断言三类护栏会抛出 `GuardrailError`
- 全量测试通过（当前为 179 tests）

### Findings Addressed

- [HIGH] 原先未实现的 `runAgent` 护栏集成测试已补齐
- [HIGH] `stepIndex` schema 之前不支持 string，已修复
- [MEDIUM] 护栏触发时仅 stderr 输出，已补齐结构化事件

## Change Log

- 2025-12-17: code-review 自动修复与补齐测试（stepIndex 兼容、护栏统计口径、结构化事件、runAgent 集成测试）
