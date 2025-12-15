import type { Locator, Page } from 'playwright'

import type { ToolResult } from './tool-result.js'
import { fail, ok } from './tool-result.js'
import { toToolError } from './playwright-error.js'

export type FillInput = {
  page: Page
  targetDescription: string
  text: string
}

export type FillData = {
  targetDescription: string
  textLength: number
}

async function pickFirstMatch(locator: Locator): Promise<Locator | undefined> {
  try {
    const count = await locator.count()
    if (count <= 0) return undefined

    const limit = Math.min(count, 5)
    for (let i = 0; i < limit; i++) {
      const candidate = locator.nth(i)
      try {
        if (await candidate.isVisible()) return candidate
      } catch {}
    }

    return locator.first()
  } catch {
    return undefined
  }
}

async function resolveFillTarget(page: Page, targetDescription: string): Promise<Locator | undefined> {
  const candidates: Locator[] = []

  try {
    candidates.push(page.getByLabel(targetDescription))
  } catch {}

  try {
    candidates.push(page.getByPlaceholder(targetDescription))
  } catch {}

  try {
    candidates.push(page.getByRole('textbox', { name: targetDescription }))
  } catch {}

  try {
    candidates.push(page.getByText(targetDescription))
  } catch {}

  for (const candidate of candidates) {
    const picked = await pickFirstMatch(candidate)
    if (picked) return picked
  }

  return undefined
}

export async function fill(input: FillInput): Promise<ToolResult<FillData>> {
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

  const targetDescription = typeof anyInput.targetDescription === 'string' ? anyInput.targetDescription.trim() : ''
  if (!targetDescription) {
    return fail({
      code: 'INVALID_INPUT',
      message: 'targetDescription is required',
      retriable: false,
      cause: undefined,
    })
  }

  if (typeof anyInput.text !== 'string') {
    return fail({
      code: 'INVALID_INPUT',
      message: 'text must be a string',
      retriable: false,
      cause: undefined,
    })
  }

  const locator = await resolveFillTarget(page, targetDescription)
  if (!locator) {
    return fail({
      code: 'ELEMENT_NOT_FOUND',
      message: `Element not found: ${targetDescription}`,
      retriable: true,
      cause: undefined,
    })
  }

  try {
    await locator.fill(anyInput.text)
    return ok({ targetDescription, textLength: anyInput.text.length })
  } catch (err: unknown) {
    const toolError = toToolError(err)
    return fail(toolError)
  }
}
