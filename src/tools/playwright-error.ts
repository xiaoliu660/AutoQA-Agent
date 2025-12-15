import type { ToolError } from './tool-result.js'

export type ToolErrorCode =
  | 'INVALID_INPUT'
  | 'ELEMENT_NOT_FOUND'
  | 'TIMEOUT'
  | 'NAVIGATION_FAILED'
  | 'PLAYWRIGHT_ERROR'

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && typeof err.message === 'string') return err.message
  if (typeof err === 'string') return err
  return String(err)
}

function getErrorName(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const anyErr = err as any
  return typeof anyErr.name === 'string' ? anyErr.name : undefined
}

function isTimeoutError(err: unknown): boolean {
  const name = getErrorName(err)
  if (name === 'TimeoutError') return true
  const msg = getErrorMessage(err).toLowerCase()
  return msg.includes('timeout') || msg.includes('timed out')
}

function toCauseString(err: unknown): string | undefined {
  if (err instanceof Error) {
    if (typeof err.stack === 'string' && err.stack.length > 0) return err.stack
    if (typeof err.message === 'string' && err.message.length > 0) return err.message
  }
  if (typeof err === 'string' && err.length > 0) return err
  if (!err) return undefined
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

export function toToolError(err: unknown, options?: { defaultCode?: ToolErrorCode }): ToolError {
  const code: ToolErrorCode = isTimeoutError(err) ? 'TIMEOUT' : (options?.defaultCode ?? 'PLAYWRIGHT_ERROR')

  const retriable = code === 'TIMEOUT' || code === 'NAVIGATION_FAILED' || code === 'PLAYWRIGHT_ERROR'

  return {
    code,
    message: getErrorMessage(err),
    retriable,
    cause: toCauseString(err),
  }
}
