# Story 2.9: Runner 按 spec 生命周期录制 Playwright trace 并保留

Status: done

## Story

As a 开发者,
I want Runner 在 spec 生命周期内录制 Playwright trace 并将其作为运行产物保留，
so that 我可以回放整个执行过程来复现与定位问题，并提升导出与自愈阶段的可调试性。

## Acceptance Criteria

1. **Given** Runner 开始执行一个 spec
   **When** 启用 trace 录制
   **Then** 应在 spec 生命周期内开始/停止 trace，并生成 trace 产物文件与本次 run 绑定落盘（例如归档到 `.autoqa/runs/<runId>/traces/<traceName>.zip`）

2. **Given** spec 执行结束
   **When** `autoqa run` 输出汇总
   **Then** CLI 应输出 trace 产物路径（若生成成功）
   **And** trace 产物应可用 Playwright Trace Viewer 打开进行回放

3. **Given** trace 录制/写盘过程中发生错误
   **When** spec 继续执行或结束
   **Then** 该错误不得导致 spec 主流程中断（不得 throw 终止），但必须记录可定位错误信息（建议写入结构化日志）

## Tasks / Subtasks

- [x] Runner 集成 trace 录制（AC: 1, 3）
  - [x] 在 `src/runner/run-specs.ts` 的 per-spec 生命周期内调用：
    - `context.tracing.start({ screenshots: true, snapshots: true, sources: true })`
    - `context.tracing.stop({ path: <absPath> })`
  - [x] `tracing.start` 必须发生在 Context 创建成功之后，并在任何页面动作发生前
  - [x] `tracing.stop` 必须发生在关闭 `context` 之前（保证 zip 落盘），并放在 `finally` 中确保即使 spec 失败也会尝试 stop
  - [x] 在 stop 前确保 traces 目录存在：`.autoqa/runs/<runId>/traces/`
  - [x] 所有 tracing 相关异常必须捕获并转换为日志/可观测字段，禁止冒泡导致 spec 失败

- [x] 产物命名与路径安全（AC: 1, 2）
  - [x] 生成 `traceName` 必须稳定、可预测、且避免同名覆盖（目录执行多 spec 时）
    - 建议：`<specIndex>-<sanitizedSpecId>` 或 `<sanitizedRelativeSpecPath>`（避免仅使用 basename）
  - [x] 路径必须防目录穿越（sanitize runId/spec id），并且对外输出只允许相对路径（不得输出绝对路径）
  - [x] 产物根目录必须与现有约定一致：`.autoqa/runs/<runId>/`（不要引入 `.autoqa/<runId>/` 新结构）

- [x] CLI 可发现性（AC: 2）
  - [x] 在 `src/cli/commands/run.ts` 的 run 汇总输出中（stderr），输出 trace 产物路径信息（至少包含 trace 目录；若可得则输出每个 spec 的 trace 文件路径）
  - [x] 失败时与现有 `snapshotDir=...` 输出对齐：保持 stdout 干净，仅在 stderr 输出 `traceDir=...` / `tracePath=...`

- [x] 单元测试（覆盖 AC: 1-3）
  - [x] 在 `tests/unit/runner-spec-lifecycle.test.ts` 或新增测试中，mock `context.tracing.start/stop`，断言：
    - 每个 spec 调用一次 `start`
    - 每个 spec 在结束前调用一次 `stop` 且 `path` 指向 `.autoqa/runs/<runId>/traces/...zip`
    - 当 `start/stop` 抛错时，`runSpecs` 不应失败（仍应关闭 page/context/browser）
  - [x] 覆盖路径安全：输出/日志中不得出现绝对路径

## Dev Notes

- Playwright 版本与 API
  - Playwright 版本固定为 `playwright@1.57.0`，trace API 以 `context.tracing` 为准。

- 录制策略
  - 按 tech spec：在 Runner 的 spec 生命周期内 start/stop，并保留 zip 产物。

- 分层与边界（强约束）
  - Trace 的 start/stop 应由 Runner 负责（`src/runner/**`），不要把控制分散到 tools/agent 中。
  - CLI 只做参数与输出，不直接调用 Playwright API。

- 失败语义（必须）
  - tracing 失败不得中断主流程；只能作为可观测信息输出（debug/结构化日志）。

- 安全与隐私
  - `.autoqa/` 已在仓库 `.gitignore` 中忽略；trace/快照可能包含敏感信息，日志中不得泄露绝对路径或敏感内容。

### Project Structure Notes

- 预计修改：
  - `src/runner/run-specs.ts`（spec 生命周期中 start/stop tracing）
  - `src/cli/commands/run.ts`（run 汇总输出 trace 产物路径，stderr）
  - 可能：`src/logging/types.ts`（如要在 `autoqa.spec.finished` 中追加 trace 路径字段；注意向后兼容）

- 建议新增（可选）：
  - `src/runner/trace-paths.ts`：集中实现 trace 文件命名/路径拼装与 sanitize，供 runner 与 CLI 复用，避免两处逻辑漂移

### References

- [Source: docs/epics.md#Story 2.9]
- [Source: docs/sprint-artifacts/ts-2-8-2-9-ax-aria-snapshot-playwright-trace.md]
- [Source: docs/architecture.md#文件系统产物与状态（.autoqa/runs/<runId>）]
- [Source: src/runner/run-specs.ts]
- [Source: src/cli/commands/run.ts]
- [Source: src/browser/screenshot.ts]
- [Source: src/browser/snapshot.ts]
- [Source: .gitignore]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Cascade

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- 实现了 Playwright trace 录制功能，在每个 spec 生命周期内自动 start/stop tracing
- 创建了 `src/runner/trace-paths.ts` 模块，集中处理 trace 文件命名、路径拼装与 sanitize
- 更新了 `src/runner/run-specs.ts`，添加了 `safeTracingStart` 和 `safeTracingStop` 函数，确保 tracing 异常不会中断主流程
- 更新了 `src/cli/commands/run.ts`，在 stderr 输出 `traceDir=...` 和 `tracePath=...`
- 更新了 `src/logging/types.ts`，在 `SpecFinishedEvent` 中添加了 `tracePath` 和 `tracingError` 字段
- 添加了 4 个 trace 相关的单元测试到 `tests/unit/runner-spec-lifecycle.test.ts`
- 创建了 `tests/unit/trace-paths.test.ts`，包含 21 个测试用例覆盖路径安全和命名逻辑
- 修复 tracing 相关的结构化日志语义：避免重复写入 `autoqa.spec.finished`，并确保 `tracePath` 仅在 tracing.stop 成功后输出
- 加强路径安全：同时处理 Windows `\\` 分隔符，避免目录分隔符残留
- 所有 131 个测试通过

### Change Log

- 2025-12-16: 实现 Story 2.9 - Playwright trace 录制与保留功能

### File List

- src/runner/trace-paths.ts (新增)
- src/runner/run-specs.ts (修改)
- src/cli/commands/run.ts (修改)
- src/logging/types.ts (修改)
- tests/unit/runner-spec-lifecycle.test.ts (修改)
- tests/unit/trace-paths.test.ts (新增)
