import type { Page } from 'playwright'

import type { ToolResult } from './tool-result.js'
import { fail, ok } from './tool-result.js'
import { toToolError } from './playwright-error.js'

export type WaitInput = {
  page: Page
  seconds: number
}

export type WaitData = {
  seconds: number
}

const MAX_WAIT_SECONDS = 60

export async function wait(input: WaitInput): Promise<ToolResult<WaitData>> {
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

  const seconds = anyInput.seconds

  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_WAIT_SECONDS) {
    return fail({
      code: 'INVALID_INPUT',
      message: `Invalid seconds: ${String(seconds)}`,
      retriable: false,
      cause: undefined,
    })
  }

  try {
    await page.waitForTimeout(seconds * 1000)
    return ok({ seconds })
  } catch (err: unknown) {
    const toolError = toToolError(err)
    return fail(toolError)
  }
}
