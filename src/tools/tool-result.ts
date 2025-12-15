import type { ToolErrorCode } from './playwright-error.js'

export type ToolScreenshot = {
  mimeType: string
  path?: string
  width?: number
  height?: number
}

export type ToolError = {
  code: ToolErrorCode
  message: string
  retriable: boolean
  cause?: string
}

export type ToolResult<TData = unknown> =
  | { ok: true; data: TData; screenshot?: ToolScreenshot }
  | { ok: false; error: ToolError; screenshot?: ToolScreenshot }

export function ok<TData>(data: TData, screenshot?: ToolScreenshot): ToolResult<TData> {
  return screenshot ? { ok: true, data, screenshot } : { ok: true, data }
}

export function fail(
  error: ToolError,
  screenshot?: ToolScreenshot,
): ToolResult<never> {
  return screenshot ? { ok: false, error, screenshot } : { ok: false, error }
}
