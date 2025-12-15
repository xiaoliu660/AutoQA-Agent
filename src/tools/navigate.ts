import type { Page } from 'playwright'

import type { ToolResult } from './tool-result.js'
import { fail, ok } from './tool-result.js'
import { toToolError } from './playwright-error.js'

export type NavigateInput = {
  page: Page
  baseUrl: string
  url: string
}

export type NavigateData = {
  url: string
}

function isAbsoluteUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function resolveNavigateUrl(baseUrl: string, url: string): { ok: true; url: string } | { ok: false } {
  if (isAbsoluteUrl(url)) return { ok: true, url }

  if (!url.startsWith('/')) return { ok: false }

  try {
    const resolved = new URL(url, baseUrl)
    return { ok: true, url: resolved.toString() }
  } catch {
    return { ok: false }
  }
}

export async function navigate(input: NavigateInput): Promise<ToolResult<NavigateData>> {
  const anyInput = input as any
  if (!anyInput || typeof anyInput !== 'object') {
    return fail({
      code: 'INVALID_INPUT',
      message: 'input must be an object',
      retriable: false,
      cause: undefined,
    })
  }

  const page = anyInput.page as Page | undefined
  if (!page) {
    return fail({
      code: 'INVALID_INPUT',
      message: 'page is required',
      retriable: false,
      cause: undefined,
    })
  }

  const baseUrl = typeof anyInput.baseUrl === 'string' ? anyInput.baseUrl : ''
  const url = typeof anyInput.url === 'string' ? anyInput.url.trim() : ''

  if (!baseUrl) {
    return fail({
      code: 'INVALID_INPUT',
      message: 'baseUrl is required',
      retriable: false,
      cause: undefined,
    })
  }

  if (!url) {
    return fail({
      code: 'INVALID_INPUT',
      message: 'url is required',
      retriable: false,
      cause: undefined,
    })
  }

  const resolved = resolveNavigateUrl(baseUrl, url)
  if (!resolved.ok) {
    return fail({
      code: 'INVALID_INPUT',
      message: `Invalid navigate url: ${url}`,
      retriable: false,
      cause: undefined,
    })
  }

  try {
    await page.goto(resolved.url)
    return ok({ url: resolved.url })
  } catch (err: unknown) {
    const toolError = toToolError(err, { defaultCode: 'NAVIGATION_FAILED' })
    if (toolError.code === 'PLAYWRIGHT_ERROR') toolError.code = 'NAVIGATION_FAILED'
    return fail(toolError)
  }
}
