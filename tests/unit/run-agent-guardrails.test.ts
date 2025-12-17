import { describe, expect, it, vi } from 'vitest'

import type { Logger } from '../../src/logging/index.js'

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

import { runAgent } from '../../src/agent/run-agent.js'
import { GuardrailError } from '../../src/agent/guardrails.js'

function createAsyncIterable(messages: any[]): AsyncIterable<any> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const m of messages) yield m
    },
  }
}

const loggerMock: Logger = {
  log: vi.fn() as any,
  flush: vi.fn(async () => {}),
}

describe('runAgent guardrails (integration with query stream)', () => {
  it('throws GUARDRAIL_MAX_TOOL_CALLS when tool_use count exceeds limit', async () => {
    const messages: any[] = [
      {
        type: 'assistant',
        content: [
          { type: 'tool_use', id: 't1', name: 'mcp__browser__snapshot', input: { stepIndex: 1 } },
          { type: 'tool_use', id: 't2', name: 'mcp__browser__snapshot', input: { stepIndex: 1 } },
          { type: 'tool_use', id: 't3', name: 'mcp__browser__snapshot', input: { stepIndex: 1 } },
        ],
      },
    ]

    mockQuery.mockReturnValue(createAsyncIterable(messages))

    await expect(
      runAgent({
        runId: 'run-1',
        baseUrl: 'http://example.test',
        debug: false,
        specPath: '/specs/a.md',
        spec: { preconditions: [], steps: [] },
        page: {} as any,
        logger: loggerMock,
        guardrails: {
          maxToolCallsPerSpec: 2,
          maxConsecutiveErrors: 100,
          maxRetriesPerStep: 100,
        },
      }),
    ).rejects.toMatchObject({ code: 'GUARDRAIL_MAX_TOOL_CALLS' })
  })

  it('throws GUARDRAIL_MAX_CONSECUTIVE_ERRORS when tool_result errors exceed limit', async () => {
    const messages: any[] = [
      {
        type: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'mcp__browser__click', input: { stepIndex: 1 } }],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'fail' }],
        },
      },
      {
        type: 'assistant',
        content: [{ type: 'tool_use', id: 't2', name: 'mcp__browser__click', input: { stepIndex: 1 } }],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'fail' }],
        },
      },
    ]

    mockQuery.mockReturnValue(createAsyncIterable(messages))

    await expect(
      runAgent({
        runId: 'run-2',
        baseUrl: 'http://example.test',
        debug: false,
        specPath: '/specs/a.md',
        spec: { preconditions: [], steps: [] },
        page: {} as any,
        logger: loggerMock,
        guardrails: {
          maxToolCallsPerSpec: 100,
          maxConsecutiveErrors: 1,
          maxRetriesPerStep: 100,
        },
      }),
    ).rejects.toMatchObject({ code: 'GUARDRAIL_MAX_CONSECUTIVE_ERRORS' })
  })

  it('throws GUARDRAIL_MAX_RETRIES_PER_STEP when same stepIndex error retries exceed limit', async () => {
    const messages: any[] = [
      {
        type: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'mcp__browser__click', input: { stepIndex: 3 } }],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'fail' }],
        },
      },
      {
        type: 'assistant',
        content: [{ type: 'tool_use', id: 't2', name: 'mcp__browser__click', input: { stepIndex: 3 } }],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'fail' }],
        },
      },
    ]

    mockQuery.mockReturnValue(createAsyncIterable(messages))

    await expect(
      runAgent({
        runId: 'run-3',
        baseUrl: 'http://example.test',
        debug: false,
        specPath: '/specs/a.md',
        spec: { preconditions: [], steps: [] },
        page: {} as any,
        logger: loggerMock,
        guardrails: {
          maxToolCallsPerSpec: 100,
          maxConsecutiveErrors: 100,
          maxRetriesPerStep: 1,
        },
      }),
    ).rejects.toBeInstanceOf(GuardrailError)

    await expect(
      runAgent({
        runId: 'run-3b',
        baseUrl: 'http://example.test',
        debug: false,
        specPath: '/specs/a.md',
        spec: { preconditions: [], steps: [] },
        page: {} as any,
        logger: loggerMock,
        guardrails: {
          maxToolCallsPerSpec: 100,
          maxConsecutiveErrors: 100,
          maxRetriesPerStep: 1,
        },
      }),
    ).rejects.toMatchObject({ code: 'GUARDRAIL_MAX_RETRIES_PER_STEP', stepIndex: 3 })
  })

  it('does not attribute retriesPerStep when stepIndex is missing', async () => {
    const messages: any[] = [
      {
        type: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'mcp__browser__click', input: {} }],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'fail' }],
        },
      },
      {
        type: 'assistant',
        content: [{ type: 'tool_use', id: 't2', name: 'mcp__browser__click', input: {} }],
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 't2', is_error: true, content: 'fail' }],
        },
      },
    ]

    mockQuery.mockReturnValue(createAsyncIterable(messages))

    // even with maxRetriesPerStep=0, missing stepIndex should not trip that guardrail
    await expect(
      runAgent({
        runId: 'run-4',
        baseUrl: 'http://example.test',
        debug: false,
        specPath: '/specs/a.md',
        spec: { preconditions: [], steps: [] },
        page: {} as any,
        logger: loggerMock,
        guardrails: {
          maxToolCallsPerSpec: 100,
          maxConsecutiveErrors: 100,
          maxRetriesPerStep: 0,
        },
      }),
    ).rejects.not.toMatchObject({ code: 'GUARDRAIL_MAX_RETRIES_PER_STEP' })
  })
})
