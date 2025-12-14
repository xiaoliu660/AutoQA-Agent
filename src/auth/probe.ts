import { query } from '@anthropic-ai/claude-agent-sdk'

export type AgentSdkAuthProbeResult =
  | { kind: 'available' }
  | { kind: 'authentication_failed' }
  | { kind: 'unknown' }

function isAuthenticationFailed(code: unknown): boolean {
  return code === 'AUTHENTICATION_FAILED' || code === 'authentication_failed'
}

function getErrorCode(err: unknown): unknown {
  if (!err || typeof err !== 'object') return undefined

  const anyErr = err as any

  return (
    anyErr.code ??
    anyErr.error?.code ??
    anyErr.error?.type ??
    anyErr.cause?.code ??
    anyErr.cause?.error?.code
  )
}

function errorTextIndicatesAuthenticationFailed(text: string): boolean {
  const lower = text.toLowerCase()
  return lower.includes('authentication_failed') || lower.includes('authentication failed')
}

export async function probeAgentSdkAuth(): Promise<AgentSdkAuthProbeResult> {
  try {
    const response = query({
      prompt: 'ping',
      options: {
        maxTurns: 1,
        maxBudgetUsd: 0.01,
        tools: [],
        persistSession: false,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: undefined,
        },
      },
    })

    for await (const message of response) {
      if (message.type === 'assistant') {
        if (!message.error) continue
        if (isAuthenticationFailed(message.error)) return { kind: 'authentication_failed' }
        return { kind: 'unknown' }
      }

      if (message.type === 'result') {
        if (message.subtype === 'success') {
          if (!message.is_error) return { kind: 'available' }
          return { kind: 'unknown' }
        }

        if (message.errors.some(errorTextIndicatesAuthenticationFailed)) {
          return { kind: 'authentication_failed' }
        }

        return { kind: 'unknown' }
      }
    }

    return { kind: 'unknown' }
  } catch (err: unknown) {
    const code = getErrorCode(err)
    if (isAuthenticationFailed(code)) return { kind: 'authentication_failed' }
    return { kind: 'unknown' }
  }
}
