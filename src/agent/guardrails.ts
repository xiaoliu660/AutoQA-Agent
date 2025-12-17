export const GUARDRAIL_CODES = {
  MAX_TOOL_CALLS: 'GUARDRAIL_MAX_TOOL_CALLS',
  MAX_CONSECUTIVE_ERRORS: 'GUARDRAIL_MAX_CONSECUTIVE_ERRORS',
  MAX_RETRIES_PER_STEP: 'GUARDRAIL_MAX_RETRIES_PER_STEP',
} as const

export type GuardrailCode = (typeof GUARDRAIL_CODES)[keyof typeof GUARDRAIL_CODES]

export class GuardrailError extends Error {
  constructor(
    public readonly code: GuardrailCode,
    public readonly limit: number,
    public readonly actual: number,
    public readonly stepIndex?: number | null,
  ) {
    const stepInfo = stepIndex != null ? ` stepIndex=${stepIndex}` : ''
    super(`${code}: limit=${limit} actual=${actual}${stepInfo}`)
    this.name = 'GuardrailError'
  }
}

export type GuardrailCounters = {
  toolCalls: number
  consecutiveErrors: number
  retriesPerStep: Map<number, number>
}

export function createGuardrailCounters(): GuardrailCounters {
  return {
    toolCalls: 0,
    consecutiveErrors: 0,
    retriesPerStep: new Map(),
  }
}

export type GuardrailLimits = {
  maxToolCallsPerSpec: number
  maxConsecutiveErrors: number
  maxRetriesPerStep: number
}

export function checkGuardrails(
  counters: GuardrailCounters,
  limits: GuardrailLimits,
  currentStepIndex: number | null,
): GuardrailError | null {
  if (counters.toolCalls > limits.maxToolCallsPerSpec) {
    return new GuardrailError(
      GUARDRAIL_CODES.MAX_TOOL_CALLS,
      limits.maxToolCallsPerSpec,
      counters.toolCalls,
    )
  }

  if (counters.consecutiveErrors > limits.maxConsecutiveErrors) {
    return new GuardrailError(
      GUARDRAIL_CODES.MAX_CONSECUTIVE_ERRORS,
      limits.maxConsecutiveErrors,
      counters.consecutiveErrors,
    )
  }

  if (currentStepIndex != null) {
    const stepRetries = counters.retriesPerStep.get(currentStepIndex) ?? 0
    if (stepRetries > limits.maxRetriesPerStep) {
      return new GuardrailError(
        GUARDRAIL_CODES.MAX_RETRIES_PER_STEP,
        limits.maxRetriesPerStep,
        stepRetries,
        currentStepIndex,
      )
    }
  }

  return null
}

export function updateCountersOnToolCall(
  counters: GuardrailCounters,
): void {
  counters.toolCalls += 1
}

export function updateCountersOnToolResult(
  counters: GuardrailCounters,
  stepIndex: number | null,
  isError: boolean,
): void {
  if (isError) {
    counters.consecutiveErrors += 1
    if (stepIndex != null) {
      const current = counters.retriesPerStep.get(stepIndex) ?? 0
      counters.retriesPerStep.set(stepIndex, current + 1)
    }
  } else {
    counters.consecutiveErrors = 0
  }
}
