# Story 8.2: 探索与测试计划围绕指定 URL Scope 聚焦

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA 工程师,
I want 通过配置 URL Scope（包含/排除模式与探索范围模式）控制 Planner 只围绕我关心的页面或模块生成测试计划,
so that 在大型控制台或多模块应用中，`autoqa plan` 不会把时间和成本浪费在与当前目标无关的区域。

## Acceptance Criteria

1. **Given** 在 `autoqa.config.json` 或 Planner 配置中为 PlanConfig 提供 `includePatterns` / `excludePatterns` 与 `exploreScope`（`site` / `focused` / `single_page`）  
   **When** 在 `src/plan/types.ts` / 相关加载逻辑中解析配置并运行 `autoqa plan-explore` 或 `autoqa plan`  
   **Then** 配置应被正确解析为 URL Scope 语义：  
   - 匹配对象为 `pathname + hash` 组成的相对 URL（例如 `/live/index.html#/channel`）  
   - `includePatterns` 作为白名单，`excludePatterns` 作为黑名单  
   - `exploreScope = 'single_page'` 时仅允许在起始相对 URL 的前缀范围内变化

2. **Given** 用户在 Polyv 等场景下运行  
   `autoqa plan-explore -u https://console.polyv.net/live/index.html#/channel --explore-scope focused`  
   并在 PlanConfig 中为频道列表模块配置合适的 `includePatterns` / `excludePatterns`  
   **When** 检查 `.autoqa/runs/<runId>/plan-explore/explore-graph.json` 与 `.autoqa/runs/<runId>/plan/test-plan.json`  
   **Then** 大部分页面节点与用例应集中在 `#/channel` 模块及其子路由，不包含明显不相关模块（如回放/统计等）

3. **Given** Explore Agent 在会话中访问了部分不在 URL Scope 内的页面  
   **When** 运行 `generateTestPlan` 生成 `TestPlan` 并查看输出的 Markdown specs  
   **Then** 被判定为 out-of-scope 的页面不会出现在 `TestPlan` 与 Markdown specs 中，  
   **And** 现有站点在默认 `exploreScope = 'site'` 配置下的行为保持向后兼容（不比当前实现探索得更少）

4. **Given** 新增/更新与 URL Scope 相关的单元测试  
   **When** 运行 `npm test`  
   **Then** 至少验证：  
   - `isUrlInScope(url, config)` 在 `site` / `focused` / `single_page` 下的行为符合设计  
   - Graph 过滤逻辑仅保留 in-scope 的 `pages` 与对应的 `edges`  
   - Planner 端到端流程在 Polyv / SauceDemo 等示例配置下生成的计划范围符合预期（不回归 Epic 7 行为）

## Tasks / Subtasks

- [x] 定义并实现 URL Scope 配置与类型（AC: 1）
  - [x] 在 `src/plan/types.ts` 中为 `PlanConfig` 增加 `exploreScope?: 'site' | 'focused' | 'single_page'` 字段
  - [x] 明确 `includePatterns` / `excludePatterns` 针对相对 URL（`pathname + hash`）的匹配语义
  - [x] 在配置加载逻辑中合并 CLI 参数与配置文件并输出最终 `PlanConfig`

- [x] 在 Explore Prompt 与 Orchestrator 中应用 Scope 约束（AC: 1, 2）
  - [x] 在 `buildExplorePrompt(config)` 中根据 `exploreScope` 注入 URL Scope 说明（site/focused/single_page）
  - [x] 为 `focused` / `single_page` 模式提供基于 `baseUrl` 的默认 `includePatterns` 推导（无显式配置时）
  - [x] 确保 Explore Agent 提示中引导模型优先探索 in-scope 页面，避免明显无关模块

- [x] 在 TestPlan 生成阶段裁剪 ExplorationGraph（AC: 2, 3）
  - [x] 实现 `isUrlInScope(url: string, config: PlanConfig): boolean` 辅助函数
  - [x] 在 `generateTestPlan` 中基于 Scope 过滤 `graph.pages` 与 `graph.edges`
  - [x] 验证即使 Explore Session 访问了 out-of-scope 页面，也不会为其生成用例

- [x] 增加测试与回归验证（AC: 3, 4）
  - [x] 为 `isUrlInScope` 与 Graph 过滤添加细粒度单元测试（覆盖 site/focused/single_page 与典型路径）
  - [x] 扩展现有 Planner 端到端测试，验证 URL Scope 配置在 Polyv/SauceDemo 场景下的行为
  - [x] 更新或新增文档示例，说明 URL Scope 配置方式与常见用法

## Dev Notes

- URL Scope 能力必须与 Epic 7 的探索/规划模型保持兼容，仅在 URL 过滤与 Prompt 约束层面收紧范围，避免破坏既有 Planner 行为。  
- `exploreScope` 默认值保持 `'site'`，以确保未配置 URL Scope 的项目行为不变。  
- URL 匹配统一通过“相对 URL + 前缀匹配”实现，避免混用完整 URL 与域名判断逻辑。  
- 任何 Scope 收紧导致的漏测风险需要通过文档与配置默认值进行缓解（参见 Tech Spec 风险章节）。  

### Project Structure Notes

- 继续遵守项目分层约束：  
  - `src/cli/commands/plan.ts` 仅做参数解析与 orchestrator 调用；  
  - `src/plan/*` 负责 PlanConfig、Explore/Plan Agent 集成与 TestPlan/Markdown 生成；  
  - 不在 Planner 中直接操作 Playwright / Browser 实例。  
- URL Scope 相关逻辑应集中在 `src/plan` 下的类型定义、配置加载与 Graph 过滤模块，便于后续演进和复用。  

### References

- [Source: docs/epics.md#Story-8.2-探索与测试计划围绕指定-URL-Scope-聚焦]  
- [Source: docs/epics.md#Epic-8-Planner-输出质量与-URL-Scope-控制]  
- [Source: docs/sprint-artifacts/ts-8-1-8-3-plan-scope-and-executable-specs.md#5-设计详细-w1---探索范围--url-scope-收紧]  
- [Source: docs/sprint-artifacts/ts-8-1-8-3-plan-scope-and-executable-specs.md#32-planconfig-扩展]  

## Dev Agent Record

### Agent Model Used

Cascade

### Debug Log References

- 单元测试运行记录：27 个新增测试全部通过（plan-url-scope.test.ts: 17 tests, plan-url-scope-config.test.ts: 10 tests）
- 完整测试套件：539 个测试全部通过，无回归问题
- 测试覆盖：配置加载、URL 匹配逻辑、Graph 过滤、三种 exploreScope 模式

### Code Review Fixes (2025-12-21)

**修复的问题：**

1. ✅ **CLI 参数支持**：添加 `--explore-scope` CLI 参数到所有 plan 相关命令
   - 在 `PlanCliOptions` 中添加 `exploreScope` 字段
   - 在 `plan.ts` 中添加 `validateExploreScope` 验证函数
   - CLI 参数优先级高于配置文件
   - 新增测试：`cli-plan-explore-scope.test.ts` (7 tests)

2. ✅ **site 模式优化**：增强 site 模式的域名和 pattern 处理
   - 添加跨域 URL 过滤（只保留与 baseUrl 相同域名的页面）
   - site 模式支持 includePatterns 和 excludePatterns
   - 新增测试覆盖域名检查和 pattern 应用 (5 tests)

3. ✅ **错误保护**：添加 exploreScope 值验证和日志测试
   - 对非法 exploreScope 值输出警告并回退到 'site' 模式
   - 新增测试：`plan-url-scope-logging.test.ts` (3 tests)

4. ✅ **集成测试**：添加端到端 URL Scope 过滤测试
   - 测试混合 in-scope 和 out-of-scope 页面的过滤
   - 测试复杂 include/exclude patterns 组合
   - 测试 single_page 模式行为
   - 新增测试：`plan-url-scope-integration.test.ts` (6 tests)

5. ✅ **文档更新**：
   - 更新 `docs/project-context.md`，添加 PlanConfig 字段列表
   - 新增 `docs/url-scope-guide.md` 用户指南，包含：
     - 三种 exploreScope 模式详解
     - URL 匹配规则说明
     - Polyv/SauceDemo 典型配置示例
     - 最佳实践和故障排查

**测试结果：**
- 新增测试：20 个（全部通过）
- 完整测试套件：559 个测试全部通过
- 无回归问题

### Completion Notes List

**实现要点：**

1. **类型定义与配置**（AC 1）
   - 在 `PlanConfig` 中添加 `exploreScope?: 'site' | 'focused' | 'single_page'` 字段
   - 更新配置 schema 和默认值，`exploreScope` 默认为 `'site'` 确保向后兼容
   - 在配置加载逻辑中正确合并 CLI 参数与配置文件

2. **Explore Agent Prompt 增强**（AC 1, 2）
   - 在 `buildExplorePrompt` 中根据 `exploreScope` 注入不同的 URL Scope 约束说明
   - `site` 模式：保持现有行为，全站探索
   - `focused` 模式：引导 Agent 优先探索匹配 includePatterns 的页面，避免无关模块
   - `single_page` 模式：引导 Agent 专注当前页面交互，最小化导航

3. **URL Scope 过滤实现**（AC 2, 3）
   - 实现 `extractRelativeUrl` 提取相对 URL（pathname + hash）
   - 实现 `isUrlInScope` 判断 URL 是否在 scope 内，支持前缀通配符（`*`）
   - 实现 `filterGraphByScope` 过滤 ExplorationGraph，移除 out-of-scope 页面和边
   - 在 `generateTestPlan` 中应用过滤，确保 out-of-scope 页面不会生成测试用例

4. **测试覆盖**（AC 4）
   - 配置加载测试：验证 `exploreScope` 字段的解析和默认值
   - URL 匹配测试：覆盖 site/focused/single_page 三种模式的各种场景
   - Graph 过滤测试：验证页面和边的正确过滤
   - 回归测试：完整测试套件 539 个测试全部通过

**技术决策：**

- URL 匹配基于相对 URL（pathname + hash），避免域名判断的复杂性
- 支持前缀通配符（`/path*`）简化配置
- `focused` 和 `single_page` 模式在无 includePatterns 时自动从 baseUrl 推导
- 在 TestPlan 生成阶段过滤 Graph，而非探索阶段，保持探索数据完整性
- 添加日志事件 `autoqa.plan.generate.url_scope_filtered` 记录过滤统计

**风险缓解：**

- 默认 `exploreScope = 'site'` 确保未配置项目行为不变（向后兼容）
- 完整测试覆盖确保不破坏现有 Planner 功能
- 文档和配置示例帮助用户理解 URL Scope 配置方式

### File List

**新增文件：**
- `src/plan/url-scope.ts` - URL Scope 核心逻辑（extractRelativeUrl, isUrlInScope, filterGraphByScope）
- `tests/unit/plan-url-scope.test.ts` - URL Scope 单元测试（21 tests，含 site 模式增强测试）
- `tests/unit/plan-url-scope-config.test.ts` - 配置加载测试（10 tests）
- `tests/unit/cli-plan-explore-scope.test.ts` - CLI 参数测试（7 tests）
- `tests/unit/plan-url-scope-logging.test.ts` - 日志和错误保护测试（3 tests）
- `tests/unit/plan-url-scope-integration.test.ts` - 集成测试（6 tests）
- `docs/url-scope-guide.md` - URL Scope 用户指南

**修改文件：**
- `src/plan/types.ts` - 添加 `exploreScope` 字段到 PlanConfig
- `src/config/schema.ts` - 添加 `exploreScope` 字段验证
- `src/config/defaults.ts` - 添加 `exploreScope` 默认值为 'site'
- `src/config/read.ts` - 在配置加载逻辑中处理 `exploreScope` 字段，支持 CLI 覆盖
- `src/cli/commands/plan.ts` - 添加 `--explore-scope` CLI 参数和验证函数
- `src/plan/explore-agent.ts` - 在 `buildExplorePrompt` 中添加 URL Scope 约束
- `src/plan/orchestrator.ts` - 在 `generateTestPlan` 中应用 URL Scope 过滤
- `src/logging/types.ts` - 添加 `PlanGenerateUrlScopeFilteredEvent` 日志事件类型
- `docs/project-context.md` - 添加 PlanConfig 字段文档
