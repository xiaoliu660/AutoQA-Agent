# Story 2.5: 实现 Playwright 动作工具（`navigate/click/fill/scroll/wait`）并返回 ToolResult
 
 Status: review
 
 ## Story
 
 As a QA 工程师,
I want Agent 能通过标准工具调用驱动浏览器完成操作，
so that 流程可以由模型“观察-思考-行动”循环自动推进。

## Acceptance Criteria

1. **Given** Agent 调用 `navigate/click/fill/scroll/wait` 任一工具
   **When** 底层 Playwright 操作成功
   **Then** 工具应返回 `{ ok: true, data: ... }` 的 ToolResult
   **And** 工具不得抛出未捕获异常导致进程中断

2. **Given** Agent 调用 `navigate/click/fill/scroll/wait` 任一工具
   **When** 底层 Playwright 抛出错误
   **Then** 工具不得 `throw` 终止进程，而应返回 `{ ok: false, error: { code, message, retriable } }` 的 ToolResult
   **And** `error.code` 必须稳定且可机器处理（用于后续统计/护栏/重试策略）

3. **Given** Agent 调用 `click` 或 `fill` 且 `targetDescription` 为语义描述（例如“蓝色登录按钮”）
   **When** 工具执行元素定位并尝试完成点击/填表
   **Then** 工具应支持基于语义描述定位目标元素并完成对应操作（无需用户提供 CSS/XPath）
   **And** 当无法定位目标元素时应返回 `{ ok: false, error: { code, message, retriable } }` 且 `error.code` 可机器处理

4. **Given** 工具返回 ToolResult
   **When** ToolResult 为失败
   **Then** ToolResult 结构必须符合项目内部契约：
   - `ok: boolean`
   - `data?: any`（成功时）
   - `error?: { code: string; message: string; retriable: boolean; cause?: string }`（失败时）
   - `screenshot?: { mimeType: string; path?: string; width?: number; height?: number }`
   **And** 本 story 不要求实现截图注入，但 ToolResult 类型必须为后续 Story 2.6 预留 `screenshot?`

5. **Given** 当前分层边界为强约束
   **When** 实现浏览器动作工具
   **Then** 所有 Playwright 动作封装必须位于 `src/tools/**`
   **And** `src/cli/**` 与 `src/runner/**` 不得直接调用 `page.*` / `browser.*`

6. **Given** 工具实现完成
   **When** 执行 `npm test`
   **Then** 应新增单元测试覆盖：成功路径、失败路径（错误码映射）、以及“工具不抛异常”的行为

## Tasks / Subtasks

- [x] 定义 ToolResult 类型与共享错误映射（AC: 1, 2, 4）
  - [x] 新增 `src/tools/tool-result.ts`：定义 `ToolResult`、`ToolError`、`ToolScreenshot` 类型
  - [x] 新增 `src/tools/playwright-error.ts`（或等价命名）：将 Playwright 错误映射为 `{ code, message, retriable, cause? }`
  - [x] 新增 `src/tools/index.ts`：统一导出动作工具（供后续 agent 注册）

- [x] 实现 Playwright 动作工具（AC: 1-5）
  - [x] `src/tools/navigate.ts`：
    - [x] 支持绝对 URL 或以 `/` 开头的相对路径（相对路径需与 `baseUrl` 拼接）
    - [x] Playwright 导航失败时返回 `NAVIGATION_FAILED` 或 `TIMEOUT`（按错误类型映射）
  - [x] `src/tools/click.ts`：
    - [x] 输入 `targetDescription: string`，用 role/text/label 等启发式策略定位目标并点击
    - [x] 找不到元素返回 `ELEMENT_NOT_FOUND`（retriable: true）
  - [x] `src/tools/fill.ts`：
    - [x] 输入 `targetDescription: string` 与 `text: string`，用 label/placeholder/role 等启发式策略定位目标并填充
    - [x] 为避免泄露 secrets，ToolResult `data` 不应回传原始 `text`（建议只返回 `textLength`）
  - [x] `src/tools/scroll.ts`：
    - [x] 输入 `direction: 'up' | 'down'` 与 `amount: number`，对页面执行滚动
  - [x] `src/tools/wait.ts`：
    - [x] 输入 `seconds: number`，执行等待（`page.waitForTimeout`）

- [x] 单元测试（AC: 6）
  - [x] 新增 `tests/unit/tools-action-tools.test.ts`（或拆分多个文件）
  - [x] 通过 mock `Page` 对象的方法（如 `goto`/`getByRole`/`locator`/`waitForTimeout` 等）覆盖成功与失败分支
  - [x] 覆盖错误码映射至少包含：`INVALID_INPUT`、`ELEMENT_NOT_FOUND`、`TIMEOUT`、`NAVIGATION_FAILED`

## Dev Notes

- 分层边界（强约束）：
  - `src/tools/**` 负责封装 Playwright 操作；`src/cli/**` 与 `src/runner/**` 禁止直接调用 Playwright API。

- ToolResult 一致性（核心）：
  - 工具失败不得抛异常终止。
  - 错误码必须稳定、可机器处理；同类错误在不同工具中应复用相同 `error.code`（避免“每个工具发明一套错误码”）。

- 语义定位策略（MVP）：
  - `targetDescription` 不是 selector；优先尝试 Playwright 的可访问性定位（role/label/placeholder/text），必要时回退到 `locator('text=...')`。
  - 当存在多匹配时，优先选择可见元素；无法稳定选择时返回可重试错误，交由后续自愈闭环处理。

- 安全：
  - `fill` 不应把敏感输入（如密码）明文写入日志或 ToolResult。

- 工程约定：
  - 保持 ESM import 风格（跨文件导入使用 `.js` 后缀，与现有代码一致）。
  - 依赖版本以 `package.json` 为准（Playwright `1.57.0`，Vitest `4.0.15`）。

### Project Structure Notes

- 本 story 预计新增主要落点：
  - `src/tools/**`：新增工具类型与动作工具实现
  - `tests/unit/**`：新增工具单元测试

### References

- [Source: docs/epics.md#Story 2.5]
- [Source: docs/architecture.md#Format Patterns（数据契约/返回格式）]
- [Source: docs/architecture.md#Structure Patterns（结构与边界规范）]
- [Source: docs/project_context.md#4. ToolResult / 错误处理契约]

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Cascade

### Debug Log References

- `npm test`
- `npm run build`

### Completion Notes List

- Implemented ToolResult contract and shared Playwright error mapping
- Implemented navigate/click/fill/scroll/wait tools under src/tools/** (no Playwright calls from cli/runner)
- Added unit tests covering success/failure paths and stable error codes; verified `npm test` and `npm run build` pass

### File List

- `docs/sprint-artifacts/2-5-playwright-action-tools-toolresult.md`
- `src/tools/tool-result.ts`
- `src/tools/playwright-error.ts`
- `src/tools/navigate.ts`
- `src/tools/click.ts`
- `src/tools/fill.ts`
- `src/tools/scroll.ts`
- `src/tools/wait.ts`
- `src/tools/index.ts`
- `tests/unit/tools-action-tools.test.ts`
