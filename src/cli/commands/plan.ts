/**
 * Plan CLI Commands
 * Implements `autoqa plan explore` command
 * Based on Tech Spec: ts-7-agent-based-intelligent-planner.md
 */
import { Command } from 'commander'
import { randomUUID } from 'node:crypto'

import { createBrowser } from '../../browser/create-browser.js'
import { readConfig, loadPlanConfig } from '../../config/read.js'
import { createLogger } from '../../logging/index.js'
import { explore } from '../../plan/explore.js'
import { writeExplorationResult, writePlanSummary } from '../../plan/output.js'
import { generateTestPlan } from '../../plan/orchestrator.js'
import type { PlanConfig } from '../../plan/types.js'

const GUARDRAIL_EXIT_CODE = 10
const CONFIG_ERROR_EXIT_CODE = 2
const RUNTIME_ERROR_EXIT_CODE = 1

function validateDepth(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 0 || parsed > 10) {
    throw new Error('Depth must be a number between 0 and 10')
  }
  return parsed
}

function validatePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1) {
    throw new Error('Value must be a positive integer')
  }
  return parsed
}

function validateUrl(value: string): string {
  try {
    new URL(value)
    return value
  } catch {
    throw new Error(`Invalid URL: ${value}`)
  }
}

function validateExploreScope(value: string): 'site' | 'focused' | 'single_page' {
  const validScopes = ['site', 'focused', 'single_page'] as const
  if (!validScopes.includes(value as any)) {
    throw new Error(`Invalid explore scope: ${value}. Valid values: ${validScopes.join(', ')}`)
  }
  return value as 'site' | 'focused' | 'single_page'
}


function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/password[=:]\s*[^\s&]+/gi, 'password=***')
    .replace(/token[=:]\s*[^\s&]+/gi, 'token=***')
    .replace(/api[_-]?key[=:]\s*[^\s&]+/gi, 'apikey=***')
    .replace(/secret[=:]\s*[^\s&]+/gi, 'secret=***')
    .replace(/auth[=:]\s*[^\s&]+/gi, 'auth=***')
    .replace(/credential[s]?[=:]\s*[^\s&]+/gi, 'credentials=***')
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'bearer ***')
}

type ConfigResult = { ok: true; config: PlanConfig } | { ok: false; exitCode: number }

function loadAndMergeConfig(cwd: string, options: any): ConfigResult {
  const configResult = readConfig(cwd)
  if (!configResult.ok) {
    console.error(`❌ Configuration error: ${configResult.error.message}`)
    return { ok: false, exitCode: CONFIG_ERROR_EXIT_CODE }
  }

  try {
    const config = loadPlanConfig(configResult.config, options)
    // Debug-style visibility of effective configuration and CLI overrides
    const overridden: string[] = []
    if (options.url) overridden.push('url')
    if (options.depth !== undefined) overridden.push('depth')
    if (options.maxPages !== undefined) overridden.push('maxPages')
    if (options.maxAgentTurns !== undefined) overridden.push('maxAgentTurns')
    if (options.maxSnapshots !== undefined) overridden.push('maxSnapshots')
    if (options.testTypes) overridden.push('testTypes')
    if (options.loginUrl) overridden.push('loginUrl')
    if (options.username) overridden.push('username')
    if (options.password) overridden.push('password')

    if (overridden.length > 0) {
      // Use console.debug so it only appears when user enables debug output
      console.debug(
        '[autoqa.plan] CLI options overriding config file values:',
        overridden.join(', '),
      )
    }
    return { ok: true, config }
  } catch (error) {
    console.error(`❌ ${sanitizeErrorMessage(error)}`)
    return { ok: false, exitCode: CONFIG_ERROR_EXIT_CODE }
  }
}

async function closeBrowserSafely(browserResult: any): Promise<void> {
  if (!browserResult) return
  
  const closeOperations = []
  if (browserResult.persistentContext) {
    closeOperations.push(
      browserResult.persistentContext.close().catch((err: any) => {
        console.error(`Warning: Failed to close persistent context: ${err.message}`)
      })
    )
  }
  if (browserResult.browser) {
    closeOperations.push(
      browserResult.browser.close().catch((err: any) => {
        console.error(`Warning: Failed to close browser: ${err.message}`)
      })
    )
  }
  
  await Promise.allSettled(closeOperations)
}

export function registerPlanCommand(program: Command): void {
  // Register "plan" command (full exploration + generation)
  program
    .command('plan')
    .description('Run full test planning: exploration + test case generation')
    .option('--config <path>', 'Path to autoqa.config.json (default: ./autoqa.config.json)')
    .option('-u, --url <url>', 'Target application URL (optional, can be loaded from config)', validateUrl)
    .option('-d, --depth <number>', 'Maximum exploration depth (0-10)', validateDepth)
    .option('--max-pages <number>', 'Maximum pages to visit', validatePositiveInt)
    .option('--max-agent-turns <number>', 'Maximum agent tool calls (guardrail)', validatePositiveInt)
    .option('--max-snapshots <number>', 'Maximum snapshots to capture (guardrail)', validatePositiveInt)
    .option('--explore-scope <mode>', 'Exploration scope mode: site, focused, or single_page', validateExploreScope)
    .option('--test-types <types>', 'Comma-separated list of test types')
    .option('--login-url <url>', 'Login page URL (optional)', validateUrl)
    .option('--username <username>', 'Login username (optional)')
    .option('--password <password>', 'Login password (optional)')
    .option('--headless', 'Run browser in headless mode', false)
    .action(async (options) => {
      await runFullPlanCommand(options)
    })

  // Register "plan-explore" command (exploration only)
  program
    .command('plan-explore')
    .description('Explore a web application and generate page structure (exploration only)')
    .option('--config <path>', 'Path to autoqa.config.json (default: ./autoqa.config.json)')
    .requiredOption('-u, --url <url>', 'Target application URL', validateUrl)
    .option('-d, --depth <number>', 'Maximum exploration depth (0-10)', validateDepth)
    .option('--max-pages <number>', 'Maximum pages to visit', validatePositiveInt)
    .option('--max-agent-turns <number>', 'Maximum agent tool calls (guardrail)', validatePositiveInt)
    .option('--max-snapshots <number>', 'Maximum snapshots to capture (guardrail)', validatePositiveInt)
    .option('--explore-scope <mode>', 'Exploration scope mode: site, focused, or single_page', validateExploreScope)
    .option('--login-url <url>', 'Login page URL (optional)', validateUrl)
    .option('--username <username>', 'Login username (optional)')
    .option('--password <password>', 'Login password (optional)')
    .option('--headless', 'Run browser in headless mode', false)
    .action(async (options) => {
      await runExploreCommand(options)
    })

  // Register "plan-generate" command (generation only)
  program
    .command('plan-generate')
    .description('Generate test plan and Markdown specs from exploration artifacts')
    .option('--config <path>', 'Path to autoqa.config.json (default: ./autoqa.config.json)')
    .requiredOption('--run-id <runId>', 'Exploration run ID to generate tests from')
    .option('-u, --url <url>', 'Target application URL (optional, used for config context)', validateUrl)
    .option('--test-types <types>', 'Comma-separated list of test types (functional,form,navigation,responsive,boundary,security)')
    .option('--max-agent-turns <number>', 'Maximum agent turns for planning', validatePositiveInt)
    .action(async (options) => {
      await runGenerateCommand(options)
    })
}


async function runExploreCommand(options: any): Promise<void> {
  const runId = randomUUID()
  const cwd = process.cwd()
  const logger = createLogger({ runId, cwd, debug: false, writeToFile: true })

  const configLoad = loadAndMergeConfig(cwd, options)
  if (!configLoad.ok) {
    process.exit(configLoad.exitCode)
  }
  const config = configLoad.config

  let browserResult = null
  try {
    browserResult = await createBrowser({ headless: options.headless })

    const result = await explore({
      config,
      browser: browserResult.browser,
      logger,
      runId,
      cwd: process.cwd(),
    })

    const writeOutput = await writeExplorationResult(result, { runId, cwd: process.cwd() })

    if (writeOutput.errors.length > 0) {
      console.error(`Errors writing exploration results:`)
      writeOutput.errors.forEach((e) => console.error(`  - ${e}`))
    }

    // Report results
    console.log(`\n✅ Exploration completed for runId: ${runId}`)
    console.log(`📊 Pages visited: ${result.stats.pagesVisited}`)
    console.log(`📄 Max depth reached: ${result.stats.maxDepthReached}`)
    console.log(`📁 Results written to: .autoqa/runs/${runId}/plan-explore/`)

    if (writeOutput.errors.length > 0) {
      console.error(`\n⚠️ Errors occurred:`)
      writeOutput.errors.forEach((e) => console.error(`  - ${e}`))
    }
    // Write plan-summary.json for explore-only runs (no test plan yet)
    await writePlanSummary({
      runId,
      cwd: process.cwd(),
      exploration: result,
      exitCode: 0,
    })
  } catch (error) {
    logger.log({ event: 'autoqa.plan.explore.failed', runId, error: sanitizeErrorMessage(error) })
    console.error(`❌ Exploration failed: ${sanitizeErrorMessage(error)}`)
    process.exit(RUNTIME_ERROR_EXIT_CODE)
  } finally {
    await closeBrowserSafely(browserResult)
  }
}

async function runGenerateCommand(options: any): Promise<void> {
  const runId = options.runId
  const cwd = process.cwd()
  const logger = createLogger({ runId, cwd, debug: false, writeToFile: true })

  // For generate command, URL is now required for subcommand
  const configLoad = loadAndMergeConfig(cwd, { ...options, skipUrlValidation: !options.url })
  if (!configLoad.ok) {
    process.exit(configLoad.exitCode)
  }
  const config = configLoad.config

  try {
    const result = await generateTestPlan({
      runId,
      config,
      logger,
      cwd: process.cwd(),
    })

    console.log(`\n✅ Test plan generated for runId: ${runId}`)
    console.log(`📋 Test cases created: ${result.plan.cases.length}`)
    console.log(`📁 Test specs written to: .autoqa/runs/${runId}/plan/specs/`)

    if (result.output.errors.length > 0) {
      console.error(`\n⚠️ Errors occurred:`)
      result.output.errors.forEach((e) => console.error(`  - ${e}`))
    }
  } catch (error) {
    logger.log({ event: 'autoqa.plan.generate.failed', runId, error: sanitizeErrorMessage(error) })
    console.error(`❌ Test plan generation failed: ${sanitizeErrorMessage(error)}`)
    process.exit(RUNTIME_ERROR_EXIT_CODE)
  }
}

async function runFullPlanCommand(options: any): Promise<void> {
  const runId = randomUUID()
  const cwd = process.cwd()
  const logger = createLogger({ runId, cwd, debug: false, writeToFile: true })

  // Allow URL to be loaded from config file when not provided via CLI
  const configLoad = loadAndMergeConfig(cwd, { ...options, skipUrlValidation: !options.url })
  if (!configLoad.ok) {
    process.exit(configLoad.exitCode)
  }
  const config = configLoad.config

  let browserResult = null

  try {
    // Step 1: Exploration
    console.log(`🔍 Starting exploration...`)
    browserResult = await createBrowser({ headless: options.headless })

    const explorationResult = await explore({
      config,
      browser: browserResult.browser,
      logger,
      runId,
      cwd: process.cwd(),
    })

    const explorationOutput = await writeExplorationResult(explorationResult, { runId, cwd: process.cwd() })

    if (explorationOutput.errors.length > 0) {
      console.error(`\n⚠️ Exploration errors:`)
      explorationOutput.errors.forEach((e) => console.error(`  - ${e}`))
    }

    console.log(`\n✅ Exploration completed`)
    console.log(`📊 Pages visited: ${explorationResult.stats.pagesVisited}`)
    console.log(`📁 Exploration results: .autoqa/runs/${runId}/plan-explore/`)

    // Step 2: Generate test cases
    console.log(`\n📋 Generating test cases...`)
    const testPlanResult = await generateTestPlan({
      runId,
      config,
      logger,
      cwd: process.cwd(),
    })

    console.log(`\n✅ Test plan generated`)
    console.log(`📝 Test cases created: ${testPlanResult.plan.cases.length}`)
    console.log(`📁 Test specs: .autoqa/runs/${runId}/plan/specs/`)

    if (testPlanResult.output.errors.length > 0) {
      console.error(`\n⚠️ Test plan errors:`)
      testPlanResult.output.errors.forEach((e) => console.error(`  - ${e}`))
    }

    console.log(`\n🎉 Plan command completed successfully!`)
    console.log(`Run ID: ${runId}`)
    console.log(`Total artifacts:`)
    if (explorationOutput.graphPath) console.log(`  - Exploration graph: ${explorationOutput.graphPath}`)
    if (explorationOutput.elementsPath) console.log(`  - Elements: ${explorationOutput.elementsPath}`)
    if (explorationOutput.transcriptPath) console.log(`  - Transcript: ${explorationOutput.transcriptPath}`)
    console.log(`  - Test plan: .autoqa/runs/${runId}/plan/test-plan.json`)
    console.log(`  - Test specs: ${testPlanResult.output.specPaths.length} files`)

  } catch (error) {
    logger.log({ event: 'autoqa.plan.failed', runId, error: sanitizeErrorMessage(error) })
    console.error(`❌ Plan command failed: ${sanitizeErrorMessage(error)}`)
    process.exit(RUNTIME_ERROR_EXIT_CODE)
  } finally {
    await closeBrowserSafely(browserResult)
  }
}
