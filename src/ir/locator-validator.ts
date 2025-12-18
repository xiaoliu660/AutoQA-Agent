/**
 * Locator Candidate Validator
 *
 * Validates locator candidates using no-side-effect operations only.
 * Validation checks: uniqueness, visibility, enabled/editable state, fingerprint match.
 */

import type { Page, Locator } from 'playwright'

import type { ElementFingerprint, LocatorCandidate, LocatorValidation } from './types.js'
import { extractFingerprint } from './fingerprint.js'
import { fingerprintsMatch } from './fingerprint.js'

/**
 * Action type for validation context.
 * Different actions have different validation requirements.
 */
export type ActionType = 'click' | 'fill' | 'select_option' | 'assertElementVisible'

/**
 * Validation options.
 */
export type ValidateOptions = {
  page: Page
  actionType: ActionType
  originalFingerprint: ElementFingerprint
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 2000

/**
 * Build a Playwright locator from a candidate.
 */
function buildLocator(page: Page, candidate: LocatorCandidate): Locator | null {
  try {
    switch (candidate.kind) {
      case 'getByTestId':
        return page.getByTestId(candidate.value)

      case 'getByRole': {
        const [role, name] = candidate.value.split(':', 2)
        if (!role) return null
        return name
          ? page.getByRole(role as any, { name })
          : page.getByRole(role as any)
      }

      case 'getByLabel':
        return page.getByLabel(candidate.value)

      case 'getByPlaceholder':
        return page.getByPlaceholder(candidate.value)

      case 'cssId':
        return page.locator(`#${candidate.value}`)

      case 'cssAttr': {
        const [attr, val] = candidate.value.split('=', 2)
        if (!attr || !val) return null
        return page.locator(`[${attr}="${val}"]`)
      }

      case 'text':
        return page.getByText(candidate.value)

      default:
        return null
    }
  } catch {
    return null
  }
}

/**
 * Validate a single locator candidate.
 * All operations are read-only (no clicks, fills, or submissions).
 */
export async function validateCandidate(
  candidate: LocatorCandidate,
  options: ValidateOptions,
): Promise<LocatorCandidate> {
  const { page, actionType, originalFingerprint, timeoutMs = DEFAULT_TIMEOUT_MS } = options

  const validation: LocatorValidation = {
    unique: false,
  }

  const locator = buildLocator(page, candidate)
  if (!locator) {
    validation.error = 'Failed to build locator'
    return { ...candidate, validation }
  }

  try {
    const count = await locator.count()
    validation.unique = count === 1

    if (!validation.unique) {
      validation.error = count === 0 ? 'No elements found' : `Multiple elements found: ${count}`
      return { ...candidate, validation }
    }

    try {
      validation.visible = await locator.isVisible({ timeout: timeoutMs })
    } catch {
      validation.visible = false
    }

    if (validation.visible === false) {
      validation.error = validation.error ?? 'Element not visible'
      return { ...candidate, validation }
    }

    if (actionType === 'click') {
      try {
        validation.enabled = await locator.isEnabled({ timeout: timeoutMs })
      } catch {
        validation.enabled = undefined
      }

      if (validation.enabled === false) {
        validation.error = validation.error ?? 'Element not enabled'
        return { ...candidate, validation }
      }
    }

    if (actionType === 'fill') {
      try {
        validation.editable = await locator.isEditable({ timeout: timeoutMs })
      } catch {
        validation.editable = undefined
      }

      if (validation.editable === false) {
        validation.error = validation.error ?? 'Element not editable'
        return { ...candidate, validation }
      }
    }

    try {
      const elementHandle = await locator.elementHandle({ timeout: timeoutMs })
      if (elementHandle) {
        const candidateFingerprint = await extractFingerprint(elementHandle)
        validation.fingerprintMatch = fingerprintsMatch(originalFingerprint, candidateFingerprint)
        await elementHandle.dispose()
      }
    } catch {
      validation.fingerprintMatch = undefined
    }

  } catch (err) {
    validation.error = err instanceof Error ? err.message : String(err)
  }

  return { ...candidate, validation }
}

/**
 * Validate all candidates and return only those that pass validation.
 * Validation is performed in parallel for efficiency.
 */
export async function validateCandidates(
  candidates: LocatorCandidate[],
  options: ValidateOptions,
): Promise<LocatorCandidate[]> {
  if (candidates.length === 0) return []

  const results = await Promise.all(
    candidates.map((c) => validateCandidate(c, options)),
  )

  return results
}

/**
 * Filter candidates to only those that passed validation.
 */
export function filterValidCandidates(candidates: LocatorCandidate[]): LocatorCandidate[] {
  return filterValidCandidatesByAction(candidates)
}

export function filterValidCandidatesByAction(
  candidates: LocatorCandidate[],
  actionType?: ActionType,
): LocatorCandidate[] {
  return candidates.filter((c) => {
    if (!c.validation.unique) return false

    if (c.validation.visible === false) return false

    if (actionType === 'click' && c.validation.enabled === false) return false

    if (actionType === 'fill' && c.validation.editable === false) return false

    if (c.validation.fingerprintMatch === false) return false

    return true
  })
}

/**
 * Get a summary of validation failures for debugging.
 */
export function getValidationFailureSummary(candidates: LocatorCandidate[]): string {
  const failures = candidates.filter((c) => {
    if (!c.validation.unique) return true
    if (c.validation.visible === false) return true
    if (c.validation.enabled === false) return true
    if (c.validation.editable === false) return true
    if (c.validation.fingerprintMatch === false) return true
    return false
  })

  if (failures.length === 0) return ''

  const summaries = failures.map((c) => {
    const reasons: string[] = []
    if (!c.validation.unique) reasons.push('not unique')
    if (c.validation.visible === false) reasons.push('not visible')
    if (c.validation.enabled === false) reasons.push('not enabled')
    if (c.validation.editable === false) reasons.push('not editable')
    if (c.validation.fingerprintMatch === false) reasons.push('fingerprint mismatch')
    if (c.validation.error) reasons.push(c.validation.error)
    return `${c.kind}(${c.value.slice(0, 30)}): ${reasons.join(', ')}`
  })

  return summaries.join('; ')
}
