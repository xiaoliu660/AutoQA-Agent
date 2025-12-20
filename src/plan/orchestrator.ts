import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Logger } from '../logging/index.js'
import type { PlanConfig, ExplorationGraph, TestPlan } from './types.js'
import { writeTestPlan, type WriteTestPlanOutput } from './output.js'
import { runPlanAgent, type PlanAgentOptions } from './plan-agent.js'

export type GenerateTestPlanOptions = {
  runId: string
  config: PlanConfig
  cwd?: string
  logger: Logger
  debug?: boolean
}

export type GenerateTestPlanResult = {
  plan: TestPlan
  output: WriteTestPlanOutput
}

function sanitizeRunId(value: string): string {
  const cleaned = (value ?? '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
  if (cleaned === '.' || cleaned === '..') return 'unknown'
  return cleaned.length > 0 ? cleaned : 'unknown'
}

async function readExplorationGraph(cwd: string, runId: string): Promise<ExplorationGraph> {
  const safeRunId = sanitizeRunId(runId)
  const dir = resolve(cwd, '.autoqa', 'runs', safeRunId, 'plan-explore')
  const graphPath = resolve(dir, 'explore-graph.json')
  let raw: string
  try {
    raw = await readFile(graphPath, 'utf-8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read exploration graph from ${graphPath}: ${msg}`)
  }

  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse exploration graph JSON: ${msg}`)
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pages) || !Array.isArray(parsed.edges)) {
    throw new Error('Invalid ExplorationGraph structure in explore-graph.json')
  }

  return parsed as ExplorationGraph
}

export async function generateTestPlan(options: GenerateTestPlanOptions): Promise<GenerateTestPlanResult> {
  const { runId, config, logger } = options
  const cwd = options.cwd ?? process.cwd()
  const debug = options.debug === true

  const graph = await readExplorationGraph(cwd, runId)

  logger.log({
    event: 'autoqa.plan.generate.orchestrator.started',
    runId,
    pageCount: graph.pages.length,
  })

  const planAgentOptions: PlanAgentOptions = {
    runId,
    config,
    graph,
    cwd,
    logger,
    debug,
  }

  const plan = await runPlanAgent(planAgentOptions)
  const output = await writeTestPlan(plan, { cwd, runId })

  if (output.errors.length > 0) {
    logger.log({
      event: 'autoqa.plan.generate.orchestrator.output_errors',
      runId,
      errors: output.errors,
    })
  }

  logger.log({
    event: 'autoqa.plan.generate.orchestrator.finished',
    runId,
    caseCount: plan.cases.length,
    specCount: output.specPaths.length,
  })

  return { plan, output }
}
