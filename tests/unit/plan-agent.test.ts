import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { Logger } from '../../src/logging/index.js'
import type { PlanConfig, ExplorationGraph } from '../../src/plan/types.js'

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', async () => {
  const actual = await vi.importActual<any>('@anthropic-ai/claude-agent-sdk')
  return {
    ...actual,
    query: mockQuery,
  }
})

import { runPlanAgent } from '../../src/plan/plan-agent.js'

function createAsyncIterable(messages: any[]): AsyncIterable<any> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const m of messages) yield m
    },
  }
}

const createLogger = (): Logger => ({
  log: vi.fn(),
  flush: vi.fn(async () => {}),
})

const createGraph = (): ExplorationGraph => ({
  pages: [
    {
      id: 'p1',
      url: 'https://example.test/',
      title: 'Home',
      depth: 0,
      visitedAt: '2025-01-01T00:00:00.000Z',
      snapshotRef: 'e1',
      elementSummary: [],
      forms: [],
      links: [],
    },
  ],
  edges: [],
})

describe('plan/plan-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses planner JSON and returns normalized TestPlan', async () => {
    const payload = {
      flows: [
        {
          id: '',
          name: '',
          description: 'Login flow',
          pagePath: ['p1'],
        },
      ],
      cases: [
        {
          id: '',
          name: '',
          type: 'form',
          priority: 'p0',
          relatedPageIds: ['p1', 123, null],
          markdownPath: 'auth/login.md',
          preconditions: ['User exists', 1],
          steps: [
            {
              description: 'Open login page',
            },
            {
              description: '',
            },
          ],
        },
      ],
    }

    const messages: any[] = [
      {
        type: 'assistant',
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload),
          },
        ],
      },
    ]

    mockQuery.mockReturnValue(createAsyncIterable(messages))

    const config: PlanConfig = {
      baseUrl: 'https://example.test',
      maxDepth: 2,
      guardrails: {
        maxAgentTurnsPerRun: 10,
      },
    }

    const logger = createLogger()
    const graph = createGraph()

    const plan = await runPlanAgent({
      runId: 'run-1',
      config,
      graph,
      cwd: '/tmp',
      logger,
      debug: false,
    })

    // Ensure query called with guardrail-based maxTurns and planner tools enabled
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          maxTurns: 10,
          allowedTools: expect.arrayContaining([
            'mcp__planner__list_known_pages',
            'mcp__planner__get_page_snapshot',
            'mcp__planner__propose_test_cases_for_page',
          ]),
        }),
      }),
    )

    // Logger events
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'autoqa.plan.generate.started', runId: 'run-1' }),
    )
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'autoqa.plan.generate.finished', runId: 'run-1', caseCount: 1 }),
    )

    expect(plan.runId).toBe('run-1')
    expect(plan.cases).toHaveLength(1)
    expect(plan.flows).toHaveLength(1)

    const flow = plan.flows[0]
    expect(flow.id).toBe('flow-1')
    expect(flow.name).toBe('flow-1')
    expect(flow.pagePath).toEqual(['p1'])

    const testCase = plan.cases[0]
    expect(testCase.id).toBe('case-1')
    expect(testCase.name).toBe('case-1')
    expect(testCase.type).toBe('form')
    expect(testCase.priority).toBe('p0')
    expect(testCase.relatedPageIds).toEqual(['p1'])
    expect(testCase.markdownPath).toBe('auth/login.md')
    expect(testCase.preconditions).toEqual(['User exists'])
    expect(testCase.steps).toHaveLength(1)
    expect(testCase.steps?.[0]).toEqual({
      description: 'Open login page',
    })
  })

  it('throws when planner JSON contains no cases', async () => {
    const payload = {
      flows: [],
      cases: [],
    }

    const messages: any[] = [
      {
        type: 'assistant',
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload),
          },
        ],
      },
    ]

    mockQuery.mockReturnValue(createAsyncIterable(messages))

    const config: PlanConfig = {
      baseUrl: 'https://example.test',
      maxDepth: 1,
    }

    const logger = createLogger()
    const graph = createGraph()

    await expect(
      runPlanAgent({
        runId: 'run-empty',
        config,
        graph,
        cwd: '/tmp',
        logger,
        debug: false,
      }),
    ).rejects.toThrow(/no test cases/i)
  })
})
