import { describe, expect, it, vi } from 'vitest'

import { click } from '../../src/tools/click.js'
import { fill } from '../../src/tools/fill.js'
import { navigate } from '../../src/tools/navigate.js'
import { scroll } from '../../src/tools/scroll.js'
import { wait } from '../../src/tools/wait.js'

function timeoutError(message = 'Timeout'): Error {
  const err = new Error(message)
  ;(err as any).name = 'TimeoutError'
  return err
}

function locatorMock(options?: {
  count?: number
  visibleNth?: number
  onClick?: () => unknown
  onFill?: (text: string) => unknown
}): any {
  const count = options?.count ?? 1
  const visibleNth = options?.visibleNth ?? 0

  const locator: any = {
    count: vi.fn(async () => count),
    first: vi.fn(() => locator),
    isVisible: vi.fn(async () => true),
    click: vi.fn(async () => {
      await options?.onClick?.()
    }),
    fill: vi.fn(async (text: string) => {
      await options?.onFill?.(text)
    }),
  }

  locator.nth = vi.fn((i: number) => {
    const isVisible = vi.fn(async () => i === visibleNth)
    return Object.assign({}, locator, { isVisible })
  })

  return locator
}

describe('tools (navigate/click/fill/scroll/wait) return ToolResult and never throw', () => {
  it('navigate success returns ok=true', async () => {
    const page: any = {
      goto: vi.fn(async () => {}),
    }

    const result = await navigate({ page, baseUrl: 'http://example.test', url: '/login' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.url).toBe('http://example.test/login')
    }

    expect(page.goto).toHaveBeenCalledTimes(1)
  })

  it('navigate invalid input returns INVALID_INPUT', async () => {
    const page: any = { goto: vi.fn(async () => {}) }

    const result = await navigate({ page, baseUrl: 'http://example.test', url: 'login' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT')
      expect(result.error.retriable).toBe(false)
    }
  })

  it('navigate timeout maps to TIMEOUT and does not throw', async () => {
    const page: any = {
      goto: vi.fn(async () => {
        throw timeoutError('Navigation timeout')
      }),
    }

    const result = await navigate({ page, baseUrl: 'http://example.test', url: '/' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('navigate non-timeout error maps to NAVIGATION_FAILED', async () => {
    const page: any = {
      goto: vi.fn(async () => {
        throw new Error('boom')
      }),
    }

    const result = await navigate({ page, baseUrl: 'http://example.test', url: '/' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NAVIGATION_FAILED')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('click supports semantic targetDescription (fallback strategy) and returns ok=true', async () => {
    const locator = locatorMock()

    const page: any = {
      getByRole: vi.fn(() => {
        throw new Error('role lookup failed')
      }),
      getByText: vi.fn(() => locator),
    }

    const result = await click({ page, targetDescription: '蓝色登录按钮' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.targetDescription).toBe('蓝色登录按钮')
    }

    expect(locator.click).toHaveBeenCalledTimes(1)
  })

  it('click element not found returns ELEMENT_NOT_FOUND', async () => {
    const locator = locatorMock({ count: 0 })

    const page: any = {
      getByRole: vi.fn(() => locator),
      getByText: vi.fn(() => locator),
    }

    const result = await click({ page, targetDescription: '不存在的按钮' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ELEMENT_NOT_FOUND')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('click timeout maps to TIMEOUT and does not throw', async () => {
    const locator = locatorMock({
      onClick: () => {
        throw timeoutError('timeout')
      },
    })

    const page: any = {
      getByRole: vi.fn(() => locator),
      getByText: vi.fn(() => locator),
    }

    const result = await click({ page, targetDescription: '登录' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('fill success returns ok=true and does not include raw text', async () => {
    const locator = locatorMock({
      onFill: () => {},
    })

    const page: any = {
      getByLabel: vi.fn(() => locator),
      getByPlaceholder: vi.fn(() => locator),
      getByRole: vi.fn(() => locator),
      getByText: vi.fn(() => locator),
    }

    const result = await fill({ page, targetDescription: '密码', text: 'super-secret' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.targetDescription).toBe('密码')
      expect(result.data.textLength).toBe('super-secret'.length)
      expect((result.data as any).text).toBeUndefined()
    }

    expect(locator.fill).toHaveBeenCalledTimes(1)
  })

  it('fill element not found returns ELEMENT_NOT_FOUND', async () => {
    const locator = locatorMock({ count: 0 })

    const page: any = {
      getByLabel: vi.fn(() => locator),
      getByPlaceholder: vi.fn(() => locator),
      getByRole: vi.fn(() => locator),
      getByText: vi.fn(() => locator),
    }

    const result = await fill({ page, targetDescription: '用户名', text: 'a' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ELEMENT_NOT_FOUND')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('fill timeout maps to TIMEOUT and does not throw', async () => {
    const locator = locatorMock({
      onFill: () => {
        throw timeoutError('timeout')
      },
    })

    const page: any = {
      getByLabel: vi.fn(() => locator),
      getByPlaceholder: vi.fn(() => locator),
      getByRole: vi.fn(() => locator),
      getByText: vi.fn(() => locator),
    }

    const result = await fill({ page, targetDescription: '用户名', text: 'a' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('scroll invalid input returns INVALID_INPUT', async () => {
    const page: any = {
      evaluate: vi.fn(async () => {}),
    }

    const result = await scroll({ page, direction: 'left' as any, amount: 10 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })

  it('scroll success calls page.evaluate with delta', async () => {
    const page: any = {
      evaluate: vi.fn(async () => {}),
    }

    const result = await scroll({ page, direction: 'down', amount: 120 })

    expect(result.ok).toBe(true)
    expect(page.evaluate).toHaveBeenCalledTimes(1)
    expect(page.evaluate.mock.calls[0]?.[1]).toBe(120)
  })

  it('scroll amount over max returns INVALID_INPUT', async () => {
    const page: any = {
      evaluate: vi.fn(async () => {}),
    }

    const result = await scroll({ page, direction: 'down', amount: 5001 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })

  it('scroll timeout maps to TIMEOUT and does not throw', async () => {
    const page: any = {
      evaluate: vi.fn(async () => {
        throw timeoutError('timeout')
      }),
    }

    const result = await scroll({ page, direction: 'down', amount: 120 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('wait success calls page.waitForTimeout', async () => {
    const page: any = {
      waitForTimeout: vi.fn(async () => {}),
    }

    const result = await wait({ page, seconds: 1.5 })

    expect(result.ok).toBe(true)
    expect(page.waitForTimeout).toHaveBeenCalledWith(1500)
  })

  it('wait timeout maps to TIMEOUT', async () => {
    const page: any = {
      waitForTimeout: vi.fn(async () => {
        throw timeoutError('timeout')
      }),
    }

    const result = await wait({ page, seconds: 1 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT')
      expect(result.error.retriable).toBe(true)
    }
  })

  it('wait seconds over max returns INVALID_INPUT', async () => {
    const page: any = {
      waitForTimeout: vi.fn(async () => {}),
    }

    const result = await wait({ page, seconds: 60.1 })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT')
      expect(result.error.retriable).toBe(false)
    }
  })

  it('all tools return INVALID_INPUT for non-object input (and never throw)', async () => {
    await expect(navigate(undefined as any)).resolves.toMatchObject({ ok: false })
    await expect(click(undefined as any)).resolves.toMatchObject({ ok: false })
    await expect(fill(undefined as any)).resolves.toMatchObject({ ok: false })
    await expect(scroll(undefined as any)).resolves.toMatchObject({ ok: false })
    await expect(wait(undefined as any)).resolves.toMatchObject({ ok: false })
  })
})
