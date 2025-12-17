# Story 3.4: 失败产物与退出码（CI 友好）

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want 在失败时得到可定位问题的最小产物与稳定退出码，
so that AutoQA 可以可靠地作为 CI 的质量门禁。

## Acceptance Criteria

1. **Given** 本次 `autoqa run` 执行的所有 specs 都通过
   **When** 命令结束
   **Then** 进程必须以退出码 `0` 结束
   **And** stderr 必须输出 CI 可机器解析的通过汇总（至少包含 `runId`、`artifactRoot`、`specsPassed`、`specsFailed=0`、`durationMs`）。

2. **Given** 任一 spec 因断言失败、护栏触发或 Agent 最终 `is_error` 导致失败（属于“测试失败”语义）
   **When** `autoqa run` 结束
   **Then** 进程必须以退出码 `1` 结束
   **And** stderr 必须输出失败汇总（至少包含 `runId`、`artifactRoot`、失败 specPath、`failureSummary`）
   **And** 至少保留与失败相关的最小产物：
   - `.autoqa/runs/<runId>/run.log.jsonl`（结构化日志）
   - 至少一张失败相关截图（若 Playwright page 可用），并在输出中给出受控相对路径（不得泄露绝对路径）
   - 若 trace 产物生成成功：必须输出 `traceDir` 与至少一个 `tracePath`。

3. **Given** 发生用户输入/配置/文件结构错误（例如缺少 `--url`、spec 结构不合法、路径不可访问、配置文件 schema 校验失败、鉴权缺失）
   **When** `autoqa run` 结束
   **Then** 进程必须以退出码 `2` 结束
   **And** 不得误报为退出码 `1`（避免 CI 将其误判为“测试失败”而非“配置错误”）。

4. **Given** `autoqa run` 需要输出与产物相关的路径（`artifactRoot`/`traceDir`/`snapshotDir`/`screenshotsDir`/`logPath`/`tracePath`/`screenshotPath`）
   **When** 输出到 stderr 或写入结构化日志
   **Then** 所有产物路径必须是受控相对路径（以 `.autoqa/runs/<runId>/...` 为根），不得包含绝对本机路径
   **And** 路径拼装必须具备基础的路径安全处理（runId/specPath 等输入需要 sanitize，避免目录穿越）。

5. **Given** 用户通过环境变量控制产物策略
   **When** 设置 `AUTOQA_ARTIFACTS=all|fail|none` 与 `AUTOQA_TOOL_CONTEXT=screenshot|snapshot|none`
   **Then** 产物落盘行为必须与约定一致：
   - `AUTOQA_ARTIFACTS=all`：无论成功/失败都写盘
   - `AUTOQA_ARTIFACTS=fail`（默认行为）：仅失败写盘
   - `AUTOQA_ARTIFACTS=none`：不写盘
   **And** 即使写盘失败也不得导致 run 崩溃（仅记录可定位错误信息）。

6. **Given** 完成实现
   **When** 执行 `npm test`
   **Then** 必须新增/补齐单元测试覆盖：
   - 退出码 `0/1/2` 的语义与映射（至少覆盖 `SPEC_EXECUTION_FAILED → 1`，其余 runner failure code → 2）
   - 失败时 stderr 输出包含关键产物路径（`artifactRoot`、`logPath`、`snapshotDir`、`traceDir`，以及至少一个失败相关的 screenshot/trace 路径）
   - 输出中不得出现绝对路径（尤其是临时目录/CI workspace 的绝对路径）。

## Tasks / Subtasks

- [x] 统一并固化退出码语义（AC: 1-3）
  - [x] 复核 `src/cli/commands/run.ts`：确保退出码仅由“通过/测试失败/输入-配置错误”三类语义决定，避免默认 `commander` 行为引入非预期退出码
  - [x] 复核 `src/runner/run-specs.ts`：确保“spec 执行失败”始终归类为 `SPEC_EXECUTION_FAILED`（供 CLI 映射为 `exitCode=1`），其余 failure code 归类为 `exitCode=2`
  - [x] 补齐/修正 parse/校验类错误的退出码归类（应为 `2`），避免误判为 `1`

- [x] 失败产物最小集：保证 CI 可定位（AC: 2, 4, 5）
  - [x] 复用既有产物目录约定：`.autoqa/runs/<runId>/...`（不要引入新结构）
  - [x] 在 runner 层补齐“非工具失败”的兜底失败截图：当 spec 失败但 MCP tools 未产生失败截图时，尝试在关闭 page/context 前采集并写盘（不允许 throw）
  - [x] 确保结构化日志 `run.log.jsonl` 在退出前 `flush()`（避免 CI 丢最后一段日志）

- [x] CI 友好的 stderr 汇总输出（AC: 1-2, 4）
  - [x] 保持 stdout 仅输出 specPath 列表（避免破坏现有 CLI 行为与测试）
  - [x] 在 stderr 追加稳定的 key=value 汇总字段：`specsPassed`、`specsFailed`、`durationMs`、`logPath`、`screenshotsDir`（失败时可追加 `failureSummary`/`failedSpecPath`）
  - [x] 在失败时输出 `snapshotDir`/`traceDir` 并尽可能输出每个 `tracePath`（沿用现有逻辑）

- [x] 单元测试与回归（AC: 6）
  - [x] 扩展 `tests/unit/run-args-spec-discovery.test.ts` 或新增同类测试文件：覆盖退出码映射与 stderr 汇总输出
  - [x] 增加断言：stderr 不得包含绝对路径（尤其是 `tempDir`），产物路径必须以 `.autoqa/runs/<runId>/` 开头

## Dev Notes

- 现有实现可复用（避免重复造轮子）
  - 退出码区分已具备基本框架：`src/cli/commands/run.ts` 将 `SPEC_EXECUTION_FAILED` 映射为 `exitCode=1`，其余 runner failure code 映射为 `exitCode=2`。[Source: src/cli/commands/run.ts]
  - 结构化日志写盘：`src/logging/logger.ts` 默认写入 `.autoqa/runs/<runId>/run.log.jsonl`，debug 模式额外输出到 stderr。[Source: src/logging/logger.ts]
  - trace 录制与路径安全：`src/runner/run-specs.ts` + `src/runner/trace-paths.ts`（仅输出相对路径）。[Source: src/runner/run-specs.ts][Source: src/runner/trace-paths.ts]
  - 截图写盘：`src/browser/screenshot.ts`（写入 `.autoqa/runs/<runId>/screenshots/**`，权限 0o600）。[Source: src/browser/screenshot.ts]
  - snapshot 写盘：`src/browser/snapshot.ts`（写入 `.autoqa/runs/<runId>/snapshots/**`）。[Source: src/browser/snapshot.ts]

- 失败产物策略（与现有约束保持一致）
  - 写盘策略由 `AUTOQA_ARTIFACTS` 控制（默认行为应等价于 `fail`），上下文采集类型由 `AUTOQA_TOOL_CONTEXT` 控制（默认 `screenshot`）。[Source: src/agent/pre-action-screenshot.ts][Source: src/agent/browser-tools-mcp.ts]
  - 新增/补齐“兜底失败截图”时，优先放在 Runner 生命周期的 `finally` / 错误分支中，并确保不会破坏分层边界：Runner 可调用 `src/browser/*`，但不要在 CLI 层直接调用 Playwright API。[Source: docs/project_context.md#2. 分层边界（强约束）]

- 不要破坏 stdout 契约
  - `tests/unit/run-args-spec-discovery.test.ts` 依赖 stdout 仅输出 specPath 列表；所有新增汇总/产物路径输出都应写到 stderr。[Source: tests/unit/run-args-spec-discovery.test.ts]

### Project Structure Notes

- 预计修改：
  - `src/cli/commands/run.ts`（stderr 汇总字段与退出码归类兜底）
  - `src/runner/run-specs.ts`（spec 失败兜底产物：可选的最终 screenshot/snapshot 捕获 + 结构化日志补充）
  - （可能）`src/logging/logger.ts`（如需暴露 `logPath` 供 CLI 输出；避免重复拼路径）

- 预计新增（可选）：
  - `tests/unit/run-failure-artifacts-exit-codes.test.ts`（聚焦退出码 + 失败产物输出）

### References

- [Source: docs/epics.md#Story 3.4]
- [Source: docs/architecture.md#Infrastructure & Deployment（交付与 CI）]
- [Source: docs/project_context.md#6. 自愈护栏（必须有上限）]
- [Source: docs/project_context.md#7. 可观测性（结构化日志 + 事件流）]
- [Source: src/cli/commands/run.ts]
- [Source: src/runner/run-specs.ts]
- [Source: src/runner/trace-paths.ts]
- [Source: src/browser/screenshot.ts]
- [Source: src/browser/snapshot.ts]
- [Source: src/logging/logger.ts]
- [Source: tests/unit/run-args-spec-discovery.test.ts]

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

### Completion Notes List

- 修复了 `src/cli/commands/run.ts` 中解析异常的退出码：从 `1` 改为 `2`（配置/结构错误应使用退出码 2）
- 在 `src/runner/run-specs.ts` 中添加了兜底失败截图功能：当 spec 执行失败时，如果 page 仍然可用，尝试捕获并写入一张失败截图
- 增强了 stderr 输出，添加 CI 友好的汇总字段：`specsPassed`、`specsFailed`、`durationMs`、`logPath`、`screenshotsDir`、`snapshotDir`、`traceDir`、`tracePath`、`failureSummary`
- 新增 `getRelativeLogPath()` 函数用于获取相对路径格式的日志文件路径
- 新增 `SpecFailureScreenshotEvent` 日志事件类型
- 新增测试文件 `tests/unit/run-failure-artifacts-exit-codes.test.ts`，包含 8 个测试用例覆盖退出码映射与 stderr 汇总输出
- 所有 187 个测试通过，无回归

### File List

- src/cli/commands/run.ts (modified)
- src/runner/run-specs.ts (modified)
- src/logging/logger.ts (modified)
- src/logging/index.ts (modified)
- src/logging/types.ts (modified)
- tests/unit/run-failure-artifacts-exit-codes.test.ts (new)
- tests/unit/runner-spec-lifecycle.test.ts (modified)
- docs/sprint-artifacts/sprint-status.yaml (modified)

## Change Log

- 2025-12-17: 实现 Story 3.4 - 失败产物与退出码（CI 友好）
- 2025-12-17: Code Review 修复 - 补齐 AC2/AC4/AC5：失败时输出 failedSpecPath/screenshotPath，产物落盘遵守 AUTOQA_ARTIFACTS，成功默认不写盘并避免输出未落盘路径，修复 logPath 真实性并统一 sanitize

## Senior Developer Review (AI)

### Review Outcome

Approved (after fixes)

### Findings Summary

- 修复了 AC2：失败时 stderr 增加稳定字段 `failedSpecPath` 与 `screenshotPath`（并保持路径为受控相对路径）
- 修复了 AC5：Runner 的兜底失败截图与 trace/log 的持久化遵守 `AUTOQA_ARTIFACTS=all|fail|none`
- 修复了 AC4：所有产物路径统一为 `.autoqa/runs/<runId>/...`，并对 `runId` 做 sanitize；`failureSummary` 输出做单行化
- 修复了 logPath 真实性：仅在真实写盘后才输出 `logPath`
- 补齐了单测覆盖，并确保 `npm test` 全量通过
