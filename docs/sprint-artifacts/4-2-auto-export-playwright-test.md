# Story 4.2: `autoqa run` 结束后自动导出 `@playwright/test` 用例到 `tests/autoqa/`

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA 工程师,
I want 在 `autoqa run` 成功跑通用例后自动导出可运行的 `@playwright/test` `.spec.ts` 文件到 `tests/autoqa/`，
so that 我可以把通过的用例沉淀为稳定的回归测试并接入 CI。

## Acceptance Criteria

1. **Given** `autoqa run` 完成执行且至少产生一条动作 IR（包含通过验证的 locator 候选）
   **When** Runner 结束本次 spec
   **Then** 系统应自动在 `tests/autoqa/` 生成对应的 `@playwright/test` 文件（按 spec 文件名或等效规则命名）

2. **Given** spec 中包含断言步骤
   **When** 生成 `@playwright/test` 代码
   **Then** 生成的 `expect(...)` 断言必须仅来源于 spec 的断言步骤
   **And** 禁止从运行时观察/页面内容“自动发明”断言

3. **Given** 导出的测试文件被执行
   **When** 使用 Playwright Test 运行该文件
   **Then** 测试应不依赖 Agent、不依赖会话内 `ref`，仅依赖导出的稳定 locator 与显式断言

4. **Given** 需要导出 `click/fill`（以及后续扩展的其它 element-targeting 动作）
   **When** 生成动作代码
   **Then** 必须使用 IR 中的 `chosenLocator` 生成定位代码（例如 `page.getByTestId('...')`）并在其上执行 `click()` / `fill()`
   **And** 若任一“关键动作”缺少 `chosenLocator`，则该 spec 的导出必须失败并输出清晰原因（不生成部分/不可运行文件）

5. **Given** `fill` 动作的敏感输入在 IR 中会被脱敏（仅保留长度/标记）
   **When** 导出 `fill` 代码
   **Then** 真实填充值必须来自 spec 文本（而不是 IR 的 `toolInput`）

6. **Given** 导出代码需要写入磁盘
   **When** 生成 `tests/autoqa/*.spec.ts`
   **Then** 文件命名必须可重复、可预测且具备基础路径安全（不得目录穿越）
   **And** 对外输出（stderr/结构化日志）不得泄露绝对路径

## Tasks / Subtasks

- [x] 导出触发点与主流程（AC: 1, 3, 6）
  - [x] 在 Runner 的 per-spec 生命周期结束位置集成导出触发（参考 `autoqa.spec.finished` 日志点位）
  - [x] 仅在 spec 执行成功（`ok: true`）且 IR 满足可导出条件时生成测试文件
  - [x] 导出失败不得导致整个 run 崩溃：应记录清晰原因并跳过该 spec 的文件生成

- [x] IR 读取与按 spec 聚合（AC: 1, 4, 5）
  - [x] 从 `.autoqa/runs/<runId>/ir.jsonl` 读取 ActionRecord（JSONL）
  - [x] 按 `specPath` 过滤出当前 spec 的动作记录（注意 IR 内 `specPath` 为绝对路径字符串）
  - [x] 仅把包含 `chosenLocator` 的动作视为“可导出动作”；缺失时给出失败原因

- [x] spec → 代码生成（动作）（AC: 1, 3, 4, 5）
  - [x] 解析 Markdown spec steps（复用现有 `parseMarkdownSpec` 的产出：steps + kind）
  - [x] 生成 `test(...)` 的动作序列：
    - [x] `navigate`：从 spec 的 `Navigate to /path` 解析并输出 `await page.goto(new URL(path, baseUrl).toString())`（或等效实现）
    - [x] `click`：使用 IR `chosenLocator.code` 并输出 `await <locator>.click()`
    - [x] `fill`：使用 IR `chosenLocator.code`，并从 spec 文本解析填充值，输出 `await <locator>.fill(<textFromSpec>)`
    - [x] （建议）`select_option`：为后续样例 spec 可导出，补齐 IR 记录与导出（见下一任务）

- [x] spec → 代码生成（断言）（AC: 2, 3）
  - [x] 仅将 `kind=assertion` 的步骤转为 `expect(...)`
  - [x] 若断言步骤无法从 spec 文本中确定性地产生可执行断言（例如缺少明确文本/目标），则导出失败并给出原因（避免“猜测式断言”）
  - [x] 断言实现需与现有工具语义一致（例如 text 可见性/元素可见性），但不得复用 Agent 或会话内 `ref`

- [x] 补齐 `select_option` 的 IR 与导出（建议项，用于提升样例可导出覆盖率）（AC: 1, 3, 4）
  - [x] 在 `src/agent/browser-tools-mcp.ts` 的 `select_option` 成功路径接入 IR 记录（与 click/fill 一致：preAction fingerprint + candidates + chosenLocator）
  - [x] 在导出器中生成 `await <locator>.selectOption({ label: <labelFromSpecOrToolInput> })`（或等效实现）

- [x] 文件命名、路径安全与输出（AC: 6）
  - [x] 设计确定性的文件命名规则（建议基于相对 specPath 的 sanitize，避免同名覆盖）
  - [x] `tests/autoqa/` 目录不存在时自动创建
  - [x] 输出导出结果/失败原因时仅使用受控相对路径，不输出绝对路径

- [x] 单元测试（覆盖 AC: 1-6）
  - [x] 新增 exporter 相关单测（输入：虚拟 spec + 对应 IR JSONL；输出：生成的 `.spec.ts` 内容与落盘行为）
  - [x] 覆盖导出失败条件：缺少 `chosenLocator`、断言无法确定性转换、路径不安全输入
  - [x] 覆盖安全：输出内容与日志不得包含绝对路径

## Dev Notes

- 分层边界（强约束）
  - 导出触发点在 Runner（`src/runner/**`）侧；CLI 不直接调用 Playwright；导出器本身应是纯“读 IR + 生成代码 + 写文件”。[Source: docs/architecture.md#Structure Patterns（结构与边界规范）][Source: docs/project_context.md#2. 分层边界（强约束）]

- IR 与导出输入的事实约束
  - IR 当前由 Agent 层在工具成功后写入（至少 `click/fill` 已接入）。[Source: src/agent/browser-tools-mcp.ts][Source: src/ir/recorder.ts]
  - IR 写盘路径为 `.autoqa/runs/<runId>/ir.jsonl`（注意与 tech spec 中旧的 `.autoqa/<runId>/` 表述区分，以现有实现为准）。[Source: src/ir/writer.ts][Source: docs/sprint-artifacts/4-1-runtime-locator-validation-ir.md]
  - `fill` 的输入在 IR 与日志中会脱敏（无法从 IR 恢复明文），导出必须从 spec 文本获取填充值。[Source: src/ir/writer.ts][Source: src/logging/redact.ts]

- 断言“只来自 spec”
  - `parseMarkdownSpec` 将以 `Verify/Assert/验证/断言` 开头的步骤标记为 assertion；导出器应以此作为唯一断言来源。[Source: src/markdown/parse-markdown-spec.ts][Source: docs/epics.md#Story 4.2]

- 版本与 API
  - Playwright 与 `@playwright/test` 版本固定为 `1.57.0`，导出的代码应与该版本 API 兼容。[Source: package.json]

### Project Structure Notes

- 预计修改：
  - `src/runner/run-specs.ts`：在 spec 完成后触发导出（并与现有 `autoqa.spec.finished` 生命周期对齐）。[Source: src/runner/run-specs.ts]
  - `src/agent/browser-tools-mcp.ts`：（建议）补齐 `select_option` 成功后的 IR 记录，以提升可导出覆盖率。[Source: src/agent/browser-tools-mcp.ts][Source: src/ir/types.ts]

- 建议新增（示例路径，供 Dev 最终确认）：
  - `src/runner/export-playwright-test.ts`（或等价命名）：读取 IR + 结合 spec 生成 `.spec.ts`
  - `src/runner/export-paths.ts`（或等价命名）：文件命名与 sanitize（可参考 `src/runner/trace-paths.ts` 的路径安全做法）
  - `tests/unit/export-playwright-test.test.ts`：导出器单元测试

### References

- [Source: docs/epics.md#Story 4.2]
- [Source: docs/sprint-artifacts/ts-4-1-4-2-runtime-locator-validation-ir-auto-export-playwright-test.md]
- [Source: docs/sprint-artifacts/4-1-runtime-locator-validation-ir.md]
- [Source: docs/architecture.md#Structure Patterns（结构与边界规范）]
- [Source: docs/project_context.md#2. 分层边界（强约束）]
- [Source: docs/project_context.md#4. ToolResult / 错误处理契约（核心一致性点）]
- [Source: src/runner/run-specs.ts]
- [Source: src/agent/browser-tools-mcp.ts]
- [Source: src/ir/recorder.ts]
- [Source: src/ir/writer.ts]
- [Source: src/markdown/parse-markdown-spec.ts]
- [Source: src/logging/redact.ts]
- [Source: package.json]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Cascade

### Debug Log References

- `npm test`
- `npm run build`

### Completion Notes List

- 实现了完整的 Playwright 测试导出功能，在 spec 成功执行后自动生成 `.spec.ts` 文件
- 导出器从 IR JSONL 读取动作记录，使用 `chosenLocator.code` 生成稳定的定位器代码
- 断言仅来源于 spec 文本中标记为 `kind=assertion` 的步骤，不会自动发明断言
- `fill` 动作的填充值从 spec 文本解析，而非使用 IR 中的脱敏值
- 为 `select_option` 工具添加了 IR 记录支持，与 click/fill 一致
- 文件命名使用确定性规则，基于相对 specPath 的 sanitize
- 所有输出和日志仅使用相对路径，不泄露绝对路径
- 导出失败不会导致整个 run 崩溃，会记录清晰原因并继续
- 新增并更新单元测试覆盖所有 AC

### Change Log

- 2025-12-18: 实现 Story 4.2 - 自动导出 Playwright 测试功能
- 2025-12-18: Senior Developer Review (AI) - 修复导出边界条件、断言确定性与 IR 匹配鲁棒性

### File List

**新增文件：**
- src/runner/export-paths.ts - 文件命名与路径安全
- src/runner/export-playwright-test.ts - 导出器核心逻辑
- src/runner/ir-reader.ts - IR JSONL 读取与过滤
- tests/unit/export-paths.test.ts - 路径安全单元测试
- tests/unit/ir-reader.test.ts - IR 读取单元测试
- tests/unit/export-playwright-test.test.ts - 导出器单元测试

**修改文件：**
- src/runner/run-specs.ts - 集成导出触发点，在 spec 成功后调用导出
- src/agent/browser-tools-mcp.ts - 为 select_option 添加 IR 记录

## Senior Developer Review (AI)

### Review Summary

- 发现并修复导出器与 IR 过滤逻辑中的边界条件问题，确保满足 AC
- 提升断言导出确定性：优先生成更语义化的 locator（role/label），并对“元素可见性”断言加入唯一性校验
- 复跑测试与构建通过

### Issues Found (Fixed)

- **[HIGH] AC1 边界条件**：当 spec 无任何 IR 记录时仍会生成导出文件（已修复：无 IR 时导出失败）
- **[HIGH] 断言语义/确定性**：元素可见性断言与文本断言混淆、且可能产生歧义 locator（已修复：元素断言生成 role/label 优先 + `toHaveCount(1)` + `toBeVisible()`）
- **[MEDIUM] IR 匹配鲁棒性**：`filterBySpecPath` 在 basename-only 输入下存在误匹配风险（已修复：basename-only 不参与 ending match；basename fallback 仅在不歧义时生效）
- **[MEDIUM] 单一事实来源**：element-targeting tool 集合避免手写（已修复：复用 `isElementTargetingTool`）
- **[MEDIUM] Runner 小问题**：去除无用 import，成功导出时使用 `exportResult.relativePath`

### Validation

- `npm test`
- `npm run build`
