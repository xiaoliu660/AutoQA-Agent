import { describe, expect, it } from 'vitest'

import {
  GuardrailError,
  GUARDRAIL_CODES,
  createGuardrailCounters,
  checkGuardrails,
  updateCountersOnToolCall,
  updateCountersOnToolResult,
} from '../../src/agent/guardrails.js'

describe('GuardrailError', () => {
  it('creates error with correct properties for MAX_TOOL_CALLS', () => {
    const error = new GuardrailError(GUARDRAIL_CODES.MAX_TOOL_CALLS, 100, 101)

    expect(error.code).toBe('GUARDRAIL_MAX_TOOL_CALLS')
    expect(error.limit).toBe(100)
    expect(error.actual).toBe(101)
    expect(error.stepIndex).toBeUndefined()
    expect(error.message).toBe('GUARDRAIL_MAX_TOOL_CALLS: limit=100 actual=101')
    expect(error.name).toBe('GuardrailError')
  })

  it('creates error with stepIndex for MAX_RETRIES_PER_STEP', () => {
    const error = new GuardrailError(GUARDRAIL_CODES.MAX_RETRIES_PER_STEP, 5, 6, 3)

    expect(error.code).toBe('GUARDRAIL_MAX_RETRIES_PER_STEP')
    expect(error.limit).toBe(5)
    expect(error.actual).toBe(6)
    expect(error.stepIndex).toBe(3)
    expect(error.message).toBe('GUARDRAIL_MAX_RETRIES_PER_STEP: limit=5 actual=6 stepIndex=3')
  })
})

describe('createGuardrailCounters', () => {
  it('initializes counters to zero', () => {
    const counters = createGuardrailCounters()

    expect(counters.toolCalls).toBe(0)
    expect(counters.consecutiveErrors).toBe(0)
    expect(counters.retriesPerStep.size).toBe(0)
  })
})

describe('updateCountersOnToolCall', () => {
  it('increments toolCalls on each call', () => {
    const counters = createGuardrailCounters()

    updateCountersOnToolCall(counters)
    expect(counters.toolCalls).toBe(1)

    updateCountersOnToolCall(counters)
    expect(counters.toolCalls).toBe(2)
  })
})

describe('updateCountersOnToolResult', () => {
  it('increments consecutiveErrors on error and resets on success', () => {
    const counters = createGuardrailCounters()

    updateCountersOnToolResult(counters, null, true)
    expect(counters.consecutiveErrors).toBe(1)

    updateCountersOnToolResult(counters, null, true)
    expect(counters.consecutiveErrors).toBe(2)

    updateCountersOnToolResult(counters, null, false)
    expect(counters.consecutiveErrors).toBe(0)
  })

  it('tracks retries per step when stepIndex is provided (on error)', () => {
    const counters = createGuardrailCounters()

    updateCountersOnToolResult(counters, 1, true)
    expect(counters.retriesPerStep.get(1)).toBe(1)

    updateCountersOnToolResult(counters, 1, true)
    expect(counters.retriesPerStep.get(1)).toBe(2)

    updateCountersOnToolResult(counters, 2, true)
    expect(counters.retriesPerStep.get(2)).toBe(1)
    expect(counters.retriesPerStep.get(1)).toBe(2)
  })

  it('does not track retries when stepIndex is null', () => {
    const counters = createGuardrailCounters()

    updateCountersOnToolResult(counters, null, true)
    expect(counters.retriesPerStep.size).toBe(0)
  })

  it('does not increment retries on success', () => {
    const counters = createGuardrailCounters()

    updateCountersOnToolResult(counters, 1, false)
    expect(counters.retriesPerStep.get(1)).toBeUndefined()
  })
})

describe('checkGuardrails', () => {
  const defaultLimits = {
    maxToolCallsPerSpec: 10,
    maxConsecutiveErrors: 3,
    maxRetriesPerStep: 2,
  }

  it('returns null when all counters are within limits', () => {
    const counters = createGuardrailCounters()
    counters.toolCalls = 5
    counters.consecutiveErrors = 1

    const result = checkGuardrails(counters, defaultLimits, null)
    expect(result).toBeNull()
  })

  it('returns GUARDRAIL_MAX_TOOL_CALLS when toolCalls exceeds limit', () => {
    const counters = createGuardrailCounters()
    counters.toolCalls = 11

    const result = checkGuardrails(counters, defaultLimits, null)

    expect(result).toBeInstanceOf(GuardrailError)
    expect(result?.code).toBe('GUARDRAIL_MAX_TOOL_CALLS')
    expect(result?.limit).toBe(10)
    expect(result?.actual).toBe(11)
  })

  it('returns GUARDRAIL_MAX_CONSECUTIVE_ERRORS when consecutiveErrors exceeds limit', () => {
    const counters = createGuardrailCounters()
    counters.consecutiveErrors = 4

    const result = checkGuardrails(counters, defaultLimits, null)

    expect(result).toBeInstanceOf(GuardrailError)
    expect(result?.code).toBe('GUARDRAIL_MAX_CONSECUTIVE_ERRORS')
    expect(result?.limit).toBe(3)
    expect(result?.actual).toBe(4)
  })

  it('returns GUARDRAIL_MAX_RETRIES_PER_STEP when step retries exceed limit', () => {
    const counters = createGuardrailCounters()
    counters.retriesPerStep.set(2, 3)

    const result = checkGuardrails(counters, defaultLimits, 2)

    expect(result).toBeInstanceOf(GuardrailError)
    expect(result?.code).toBe('GUARDRAIL_MAX_RETRIES_PER_STEP')
    expect(result?.limit).toBe(2)
    expect(result?.actual).toBe(3)
    expect(result?.stepIndex).toBe(2)
  })

  it('does not check step retries when stepIndex is null', () => {
    const counters = createGuardrailCounters()
    counters.retriesPerStep.set(2, 10)

    const result = checkGuardrails(counters, defaultLimits, null)
    expect(result).toBeNull()
  })

  it('prioritizes MAX_TOOL_CALLS over other violations', () => {
    const counters = createGuardrailCounters()
    counters.toolCalls = 11
    counters.consecutiveErrors = 4
    counters.retriesPerStep.set(1, 3)

    const result = checkGuardrails(counters, defaultLimits, 1)

    expect(result?.code).toBe('GUARDRAIL_MAX_TOOL_CALLS')
  })

  it('prioritizes MAX_CONSECUTIVE_ERRORS over MAX_RETRIES_PER_STEP', () => {
    const counters = createGuardrailCounters()
    counters.toolCalls = 5
    counters.consecutiveErrors = 4
    counters.retriesPerStep.set(1, 3)

    const result = checkGuardrails(counters, defaultLimits, 1)

    expect(result?.code).toBe('GUARDRAIL_MAX_CONSECUTIVE_ERRORS')
  })
})

describe('guardrail integration scenarios', () => {
  it('simulates agent hitting max tool calls', () => {
    const counters = createGuardrailCounters()
    const limits = { maxToolCallsPerSpec: 5, maxConsecutiveErrors: 10, maxRetriesPerStep: 10 }

    for (let i = 0; i < 5; i++) {
      updateCountersOnToolCall(counters)
      expect(checkGuardrails(counters, limits, 1)).toBeNull()
    }

    updateCountersOnToolCall(counters)
    const violation = checkGuardrails(counters, limits, 1)

    expect(violation?.code).toBe('GUARDRAIL_MAX_TOOL_CALLS')
    expect(violation?.actual).toBe(6)
  })

  it('simulates agent hitting max consecutive errors', () => {
    const counters = createGuardrailCounters()
    const limits = { maxToolCallsPerSpec: 100, maxConsecutiveErrors: 3, maxRetriesPerStep: 10 }

    for (let i = 0; i < 3; i++) {
      updateCountersOnToolResult(counters, 1, true)
      expect(checkGuardrails(counters, limits, 1)).toBeNull()
    }

    updateCountersOnToolResult(counters, 1, true)
    const violation = checkGuardrails(counters, limits, 1)

    expect(violation?.code).toBe('GUARDRAIL_MAX_CONSECUTIVE_ERRORS')
    expect(violation?.actual).toBe(4)
  })

  it('simulates agent hitting max retries per step', () => {
    const counters = createGuardrailCounters()
    const limits = { maxToolCallsPerSpec: 100, maxConsecutiveErrors: 10, maxRetriesPerStep: 2 }

    updateCountersOnToolResult(counters, 1, true)
    expect(checkGuardrails(counters, limits, 1)).toBeNull()

    updateCountersOnToolResult(counters, 1, false)
    expect(checkGuardrails(counters, limits, 1)).toBeNull()

    updateCountersOnToolResult(counters, 1, true)
    expect(checkGuardrails(counters, limits, 1)).toBeNull()

    updateCountersOnToolResult(counters, 1, true)
    const violation = checkGuardrails(counters, limits, 1)

    expect(violation?.code).toBe('GUARDRAIL_MAX_RETRIES_PER_STEP')
    expect(violation?.actual).toBe(3)
    expect(violation?.stepIndex).toBe(1)
  })

  it('consecutive errors reset on success', () => {
    const counters = createGuardrailCounters()
    const limits = { maxToolCallsPerSpec: 100, maxConsecutiveErrors: 3, maxRetriesPerStep: 10 }

    updateCountersOnToolResult(counters, 1, true)
    updateCountersOnToolResult(counters, 1, true)
    expect(counters.consecutiveErrors).toBe(2)

    updateCountersOnToolResult(counters, 1, false)
    expect(counters.consecutiveErrors).toBe(0)

    updateCountersOnToolResult(counters, 1, true)
    updateCountersOnToolResult(counters, 1, true)
    updateCountersOnToolResult(counters, 1, true)
    expect(checkGuardrails(counters, limits, 1)).toBeNull()

    updateCountersOnToolResult(counters, 1, true)
    expect(checkGuardrails(counters, limits, 1)?.code).toBe('GUARDRAIL_MAX_CONSECUTIVE_ERRORS')
  })
})
