import { describe, it, expect } from 'vitest'

import {
  filterBySpecPath,
  hasValidChosenLocator,
  getMissingLocatorActions,
} from '../../src/runner/ir-reader.js'
import type { ActionRecord } from '../../src/ir/types.js'

function createMockRecord(overrides: Partial<ActionRecord> = {}): ActionRecord {
  return {
    runId: 'test-run',
    specPath: '/project/specs/test.md',
    stepIndex: 1,
    toolName: 'click',
    toolInput: {},
    outcome: { ok: true },
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('ir-reader', () => {
  describe('filterBySpecPath', () => {
    it('filters by exact match', () => {
      const records = [
        createMockRecord({ specPath: '/project/specs/test.md' }),
        createMockRecord({ specPath: '/project/specs/other.md' }),
      ]

      const filtered = filterBySpecPath(records, '/project/specs/test.md')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].specPath).toBe('/project/specs/test.md')
    })

    it('filters by ending match (absolute vs relative)', () => {
      const records = [
        createMockRecord({ specPath: '/project/specs/test.md' }),
        createMockRecord({ specPath: '/project/specs/other.md' }),
      ]

      const filtered = filterBySpecPath(records, 'specs/test.md')
      expect(filtered).toHaveLength(1)
    })

    it('filters by basename match when unambiguous', () => {
      const records = [
        createMockRecord({ specPath: '/project/specs/test.md' }),
        createMockRecord({ specPath: '/project/specs/other.md' }),
      ]

      const filtered = filterBySpecPath(records, 'test.md')
      expect(filtered).toHaveLength(1)
    })

    it('returns empty array for ambiguous basename matches', () => {
      const records = [
        createMockRecord({ specPath: '/project/specs/a/test.md' }),
        createMockRecord({ specPath: '/project/specs/b/test.md' }),
      ]

      const filtered = filterBySpecPath(records, 'test.md')
      expect(filtered).toHaveLength(0)
    })

    it('returns empty array when no match', () => {
      const records = [createMockRecord({ specPath: '/project/specs/test.md' })]

      const filtered = filterBySpecPath(records, 'nonexistent.md')
      expect(filtered).toHaveLength(0)
    })
  })

  describe('hasValidChosenLocator', () => {
    it('returns true for record with valid chosenLocator', () => {
      const record = createMockRecord({
        element: {
          fingerprint: { tagName: 'button' },
          locatorCandidates: [],
          chosenLocator: {
            kind: 'getByTestId',
            value: 'login-btn',
            code: "page.getByTestId('login-btn')",
            validation: { unique: true },
          },
        },
      })

      expect(hasValidChosenLocator(record)).toBe(true)
    })

    it('returns false for record without element', () => {
      const record = createMockRecord()
      expect(hasValidChosenLocator(record)).toBe(false)
    })

    it('returns false for record without chosenLocator', () => {
      const record = createMockRecord({
        element: {
          fingerprint: { tagName: 'button' },
          locatorCandidates: [],
        },
      })

      expect(hasValidChosenLocator(record)).toBe(false)
    })

    it('returns false for non-unique chosenLocator', () => {
      const record = createMockRecord({
        element: {
          fingerprint: { tagName: 'button' },
          locatorCandidates: [],
          chosenLocator: {
            kind: 'getByTestId',
            value: 'login-btn',
            code: "page.getByTestId('login-btn')",
            validation: { unique: false },
          },
        },
      })

      expect(hasValidChosenLocator(record)).toBe(false)
    })

    it('returns false for chosenLocator without code', () => {
      const record = createMockRecord({
        element: {
          fingerprint: { tagName: 'button' },
          locatorCandidates: [],
          chosenLocator: {
            kind: 'getByTestId',
            value: 'login-btn',
            code: '',
            validation: { unique: true },
          },
        },
      })

      expect(hasValidChosenLocator(record)).toBe(false)
    })
  })

  describe('getMissingLocatorActions', () => {
    it('returns element-targeting actions without valid chosenLocator', () => {
      const records = [
        createMockRecord({ toolName: 'click', outcome: { ok: true } }),
        createMockRecord({
          toolName: 'fill',
          outcome: { ok: true },
          element: {
            fingerprint: { tagName: 'input' },
            locatorCandidates: [],
            chosenLocator: {
              kind: 'getByTestId',
              value: 'username',
              code: "page.getByTestId('username')",
              validation: { unique: true },
            },
          },
        }),
      ]

      const missing = getMissingLocatorActions(records)
      expect(missing).toHaveLength(1)
      expect(missing[0].toolName).toBe('click')
    })

    it('ignores non-element-targeting tools', () => {
      const records = [
        createMockRecord({ toolName: 'navigate', outcome: { ok: true } }),
        createMockRecord({ toolName: 'scroll', outcome: { ok: true } }),
      ]

      const missing = getMissingLocatorActions(records)
      expect(missing).toHaveLength(0)
    })

    it('ignores failed actions', () => {
      const records = [
        createMockRecord({ toolName: 'click', outcome: { ok: false, errorCode: 'ELEMENT_NOT_FOUND' } }),
      ]

      const missing = getMissingLocatorActions(records)
      expect(missing).toHaveLength(0)
    })

    it('includes select_option without chosenLocator', () => {
      const records = [
        createMockRecord({ toolName: 'select_option', outcome: { ok: true } }),
      ]

      const missing = getMissingLocatorActions(records)
      expect(missing).toHaveLength(1)
      expect(missing[0].toolName).toBe('select_option')
    })
  })
})
