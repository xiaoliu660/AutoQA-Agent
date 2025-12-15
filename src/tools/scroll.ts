import type { Page } from 'playwright'

import type { ToolResult } from './tool-result.js'
import { fail, ok } from './tool-result.js'
import { toToolError } from './playwright-error.js'

export type ScrollInput = {
  page: Page
  direction: 'up' | 'down'
  amount: number
}

export type ScrollData = {
  direction: 'up' | 'down'
  amount: number
}

const MAX_SCROLL_AMOUNT = 5000

export async function scroll(input: ScrollInput): Promise<ToolResult<ScrollData>> {
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

  const direction = anyInput.direction
  const amount = anyInput.amount

  if (direction !== 'up' && direction !== 'down') {
    return fail({
      code: 'INVALID_INPUT',
      message: `Invalid direction: ${String(direction)}`,
      retriable: false,
      cause: undefined,
    })
  }

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_SCROLL_AMOUNT) {
    return fail({
      code: 'INVALID_INPUT',
      message: `Invalid amount: ${String(amount)}`,
      retriable: false,
      cause: undefined,
    })
  }

  const delta = direction === 'down' ? amount : -amount

  try {
    await page.evaluate((dy) => {
      window.scrollBy(0, dy)
    }, delta)
    return ok({ direction, amount })
  } catch (err: unknown) {
    const toolError = toToolError(err)
    return fail(toolError)
  }
}
