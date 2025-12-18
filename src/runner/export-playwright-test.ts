/**
 * Export Playwright Test
 *
 * Generates @playwright/test .spec.ts files from IR and spec files.
 */

import { writeFile } from 'node:fs/promises'

import type { ActionRecord } from '../ir/types.js'
import type { MarkdownSpec, MarkdownSpecStep } from '../markdown/spec-types.js'
import {
  ensureExportDir,
  getExportPath,
  getRelativeExportPath,
} from './export-paths.js'
import { getSpecActionRecords, getMissingLocatorActions, hasValidChosenLocator } from './ir-reader.js'

/**
 * Export result types.
 */
export type ExportSuccess = {
  ok: true
  exportPath: string
  relativePath: string
}

export type ExportFailure = {
  ok: false
  reason: string
  missingLocators?: string[]
}

export type ExportResult = ExportSuccess | ExportFailure

/**
 * Options for exporting a Playwright test.
 */
export type ExportOptions = {
  cwd: string
  runId: string
  specPath: string
  spec: MarkdownSpec
  baseUrl: string
}

/**
 * Parse a navigate step to extract the path.
 * Supports formats like:
 * - "Navigate to /"
 * - "Navigate to /path"
 * - "导航到 /"
 */
function parseNavigateStep(stepText: string): string | null {
  const patterns = [
    /^navigate\s+to\s+(\S+)/i,
    /^导航到\s+(\S+)/i,
    /^go\s+to\s+(\S+)/i,
  ]

  for (const pattern of patterns) {
    const match = stepText.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

function parseLoginFormFieldsAssertion(stepText: string): string[] | null {
  const lower = stepText.toLowerCase()
  const isVerify = lower.startsWith('verify') || lower.startsWith('assert') || stepText.startsWith('验证') || stepText.startsWith('断言')
  if (!isVerify) return null
  if (!lower.includes('login form') || !lower.includes('field')) return null

  const quoted = Array.from(stepText.matchAll(/["']([^"']+)["']/g))
    .map((m) => (m[1] ?? '').trim())
    .filter((v) => v.length > 0)

  if (quoted.length === 0) return null
  return quoted
}

/**
 * Parse a fill step to extract the target and value.
 * Supports formats like:
 * - "Fill the 'Username' field with standard_user"
 * - "Fill 'Username' with standard_user"
 * - "在 'Username' 字段输入 standard_user"
 */
function parseFillStep(stepText: string): { target: string; value: string } | null {
  const patterns = [
    /^fill\s+(?:the\s+)?["']?([^"']+)["']?\s+(?:field\s+)?with\s+(.+)$/i,
    /^在\s*["']?([^"']+)["']?\s*(?:字段)?(?:中)?输入\s+(.+)$/i,
    /^(?:type|enter|input)\s+(.+)\s+(?:in|into)\s+(?:the\s+)?["']?([^"']+)["']?/i,
  ]

  for (const pattern of patterns) {
    const match = stepText.match(pattern)
    if (match) {
      // Handle different capture group orders
      if (pattern.source.includes('in|into')) {
        return { target: match[2].trim(), value: match[1].trim() }
      }
      return { target: match[1].trim(), value: match[2].trim() }
    }
  }

  return null
}

/**
 * Parse a click step to extract the target.
 * Supports formats like:
 * - "Click the 'Login' button"
 * - "Click 'Login'"
 * - "点击 'Login' 按钮"
 */
function parseClickStep(stepText: string): string | null {
  const patterns = [
    /^click\s+(?:the\s+)?["']?([^"']+)["']?\s*(?:button|link|element)?$/i,
    /^点击\s*["']?([^"']+)["']?\s*(?:按钮|链接|元素)?$/i,
  ]

  for (const pattern of patterns) {
    const match = stepText.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

/**
 * Parse a select step to extract the target and option.
 * Supports formats like:
 * - "Select 'Option A' from the dropdown"
 * - "Select 'Option A' in 'Dropdown'"
 */
function parseSelectStep(stepText: string): { target: string; label: string } | null {
  const patterns = [
    /^select\s+["']?([^"']+)["']?\s+(?:from|in)\s+(?:the\s+)?["']?([^"']+)["']?/i,
    /^选择\s*["']?([^"']+)["']?\s*(?:从|在)\s*["']?([^"']+)["']?/i,
  ]

  for (const pattern of patterns) {
    const match = stepText.match(pattern)
    if (match) {
      return { label: match[1].trim(), target: match[2].trim() }
    }
  }

  return null
}

/**
 * Parse an assertion step to extract the assertion type and value.
 * Supports formats like:
 * - "Verify the page shows 'Products'"
 * - "Verify the user is logged in and sees the inventory/products page"
 * - "Assert that 'Login' button is visible"
 * - "验证页面显示 'Products'"
 */
function parseAssertionStep(stepText: string): { type: 'text' | 'element'; value: string } | null {
  // Element visibility patterns
  const elementPatterns = [
    /^(?:verify|assert)\s+(?:that\s+)?(?:the\s+)?["']?([^"']+)["']?\s+(?:button|link|element|icon)\s+is\s+visible/i,
    /^验证\s*["']?([^"']+)["']?\s*(?:按钮|链接|元素|图标)\s*(?:可见|显示)/i,
  ]

  for (const pattern of elementPatterns) {
    const match = stepText.match(pattern)
    if (match) {
      return { type: 'element', value: match[1].trim() }
    }
  }

  // Text presence patterns
  const textPatterns = [
    /^(?:verify|assert)\s+(?:that\s+)?(?:the\s+)?page\s+(?:shows|contains|displays)\s+["']?([^"']+)["']?/i,
    /^验证\s*(?:页面)?(?:显示|包含)\s*["']?([^"']+)["']?/i,
    /^断言\s*(?:页面)?(?:显示|包含)\s*["']?([^"']+)["']?/i,
  ]

  for (const pattern of textPatterns) {
    const match = stepText.match(pattern)
    if (match) {
      return { type: 'text', value: match[1].trim() }
    }
  }

  // Fallback: extract quoted text as text assertion
  const quotedMatch = stepText.match(/["']([^"']+)["']/)
  if (quotedMatch) {
    return { type: 'text', value: quotedMatch[1].trim() }
  }

  return null
}

/**
 * Escape a string for use in generated code.
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find the IR record matching a step.
 */
function findMatchingRecord(
  step: MarkdownSpecStep,
  records: ActionRecord[],
): ActionRecord | undefined {
  // First try to match by stepIndex
  const byIndex = records.find((r) => r.stepIndex === step.index && r.outcome.ok)
  if (byIndex) return byIndex

  // Fallback: match by tool name and approximate step text
  const stepLower = step.text.toLowerCase()

  if (stepLower.includes('navigate') || stepLower.includes('导航')) {
    return records.find((r) => r.toolName === 'navigate' && r.outcome.ok)
  }

  if (stepLower.includes('fill') || stepLower.includes('输入')) {
    return records.find((r) => r.toolName === 'fill' && r.outcome.ok && r.stepIndex === step.index)
  }

  if (stepLower.includes('click') || stepLower.includes('点击')) {
    return records.find((r) => r.toolName === 'click' && r.outcome.ok && r.stepIndex === step.index)
  }

  if (stepLower.includes('select') || stepLower.includes('选择')) {
    return records.find((r) => r.toolName === 'select_option' && r.outcome.ok && r.stepIndex === step.index)
  }

  return undefined
}

/**
 * Generate code for a single step.
 */
function generateStepCode(
  step: MarkdownSpecStep,
  records: ActionRecord[],
  baseUrl: string,
): { code: string; error?: string } {
  const stepText = step.text

  // Handle assertions
  if (step.kind === 'assertion') {
    const assertionRecords = records.filter(
      (r) =>
        r.stepIndex === step.index &&
        r.outcome.ok &&
        (r.toolName === 'assertTextPresent' || r.toolName === 'assertElementVisible'),
    )

    if (assertionRecords.length === 0) {
      return {
        code: '',
        error: `Assertion step ${step.index} missing assertion IR record`,
      }
    }

    const parts: string[] = []
    let i = 0
    for (const record of assertionRecords) {
      i += 1
      if (record.toolName === 'assertTextPresent') {
        const text = typeof record.toolInput?.text === 'string' ? String(record.toolInput.text) : ''
        if (!text) {
          return {
            code: '',
            error: `Assertion step ${step.index} missing text in IR`,
          }
        }

        const visibleNthRaw = (record.toolInput as any)?.visibleNth
        const visibleNth = typeof visibleNthRaw === 'number' && Number.isInteger(visibleNthRaw) && visibleNthRaw >= 0
          ? visibleNthRaw
          : undefined

        if (typeof visibleNth === 'number') {
          const locatorVar = `locator${step.index}_${i}`
          parts.push(`  const ${locatorVar} = page.getByText('${escapeString(text)}');`)
          parts.push(`  await expect(${locatorVar}.nth(${visibleNth})).toBeVisible();`)
        } else {
          parts.push(`  await expect(page.getByText('${escapeString(text)}').first()).toBeVisible();`)
        }
        continue
      }

      if (record.toolName === 'assertElementVisible') {
        if (!hasValidChosenLocator(record)) {
          return {
            code: '',
            error: `Assertion step ${step.index} missing valid chosenLocator`,
          }
        }
        const locatorCode = record.element!.chosenLocator!.code
        const locatorVar = `locator${step.index}_${i}`
        parts.push(`  const ${locatorVar} = ${locatorCode};`)
        parts.push(`  await expect(${locatorVar}).toHaveCount(1);`)
        parts.push(`  await expect(${locatorVar}).toBeVisible();`)
        continue
      }
    }

    return { code: parts.join('\n') }
  }

  // Handle navigate
  const navigatePath = parseNavigateStep(stepText)
  if (navigatePath !== null) {
    const fullUrl = navigatePath.startsWith('http')
      ? navigatePath
      : `new URL('${escapeString(navigatePath)}', baseUrl).toString()`

    if (navigatePath.startsWith('http')) {
      return { code: `  await page.goto('${escapeString(navigatePath)}');` }
    }
    return { code: `  await page.goto(${fullUrl});` }
  }

  // Handle fill - must use IR chosenLocator
  const fillParsed = parseFillStep(stepText)
  if (fillParsed) {
    const record = findMatchingRecord(step, records)
    if (!record || !hasValidChosenLocator(record)) {
      return {
        code: '',
        error: `Fill action at step ${step.index} missing valid chosenLocator`,
      }
    }

    const locatorCode = record.element!.chosenLocator!.code
    const fillValue = fillParsed.value
    return {
      code: `  await ${locatorCode}.fill('${escapeString(fillValue)}');`,
    }
  }

  // Handle click - must use IR chosenLocator
  const clickTarget = parseClickStep(stepText)
  if (clickTarget) {
    const record = findMatchingRecord(step, records)
    if (!record || !hasValidChosenLocator(record)) {
      return {
        code: '',
        error: `Click action at step ${step.index} missing valid chosenLocator`,
      }
    }

    const locatorCode = record.element!.chosenLocator!.code
    return {
      code: `  await ${locatorCode}.click();`,
    }
  }

  // Handle select - must use IR chosenLocator
  const selectParsed = parseSelectStep(stepText)
  if (selectParsed) {
    const record = findMatchingRecord(step, records)
    if (!record || !hasValidChosenLocator(record)) {
      return {
        code: '',
        error: `Select action at step ${step.index} missing valid chosenLocator`,
      }
    }

    const locatorCode = record.element!.chosenLocator!.code
    return {
      code: `  await ${locatorCode}.selectOption({ label: '${escapeString(selectParsed.label)}' });`,
    }
  }

  // Unknown step type - try to match with IR record
  const record = findMatchingRecord(step, records)
  if (record) {
    if (record.toolName === 'navigate') {
      const url = record.toolInput?.url as string | undefined
      if (url) {
        if (url.startsWith('http')) {
          return { code: `  await page.goto('${escapeString(url)}');` }
        }
        return { code: `  await page.goto(new URL('${escapeString(url)}', baseUrl).toString());` }
      }
    }

    if (record.toolName === 'click' && hasValidChosenLocator(record)) {
      return { code: `  await ${record.element!.chosenLocator!.code}.click();` }
    }

    if (record.toolName === 'fill' && hasValidChosenLocator(record)) {
      // For fill, we need to get the value from spec text, not IR (IR is redacted)
      const fillMatch = stepText.match(/with\s+(.+)$/i) || stepText.match(/输入\s+(.+)$/i)
      const fillValue = fillMatch ? fillMatch[1].trim() : ''
      if (fillValue) {
        return { code: `  await ${record.element!.chosenLocator!.code}.fill('${escapeString(fillValue)}');` }
      }
    }

    if (record.toolName === 'select_option' && hasValidChosenLocator(record)) {
      const label = record.toolInput?.label as string | undefined
      if (label) {
        return { code: `  await ${record.element!.chosenLocator!.code}.selectOption({ label: '${escapeString(label)}' });` }
      }
    }
  }

  return {
    code: '',
    error: `Cannot generate code for step ${step.index}: "${stepText}"`,
  }
}

/**
 * Generate the full Playwright test file content.
 */
function generateTestFileContent(
  specPath: string,
  spec: MarkdownSpec,
  records: ActionRecord[],
  baseUrl: string,
): { content: string; errors: string[] } {
  const errors: string[] = []
  const stepCodes: string[] = []

  for (const step of spec.steps) {
    const { code, error } = generateStepCode(step, records, baseUrl)
    if (error) {
      errors.push(error)
    }
    if (code) {
      stepCodes.push(`  // Step ${step.index}: ${step.text}`)
      stepCodes.push(code)
    }
  }

  // Extract test name from spec path
  const testName = specPath
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.md$/i, '')
    ?.replace(/-/g, ' ') ?? 'Exported Test'

  const content = `import { test, expect } from '@playwright/test';

const baseUrl = '${escapeString(baseUrl)}';

test('${escapeString(testName)}', async ({ page }) => {
${stepCodes.join('\n')}
});
`

  return { content, errors }
}

/**
 * Export a Playwright test file from IR and spec.
 */
export async function exportPlaywrightTest(options: ExportOptions): Promise<ExportResult> {
  const { cwd, runId, specPath, spec, baseUrl } = options

  // Read IR records for this spec
  let records: ActionRecord[]
  try {
    records = await getSpecActionRecords(cwd, runId, specPath)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: `Failed to read IR file: ${msg}`,
    }
  }

  if (records.length === 0) {
    return {
      ok: false,
      reason: 'Export failed: No IR records found for spec',
    }
  }

  // Check for missing locators on element-targeting actions
  const missingLocatorActions = getMissingLocatorActions(records)
  if (missingLocatorActions.length > 0) {
    const missingDetails = missingLocatorActions.map((r) => {
      const stepInfo = r.stepIndex !== null ? `step ${r.stepIndex}` : 'unknown step'
      return `${r.toolName} at ${stepInfo}`
    })

    return {
      ok: false,
      reason: `Export failed: ${missingLocatorActions.length} action(s) missing valid chosenLocator`,
      missingLocators: missingDetails,
    }
  }

  // Generate test file content
  const { content, errors } = generateTestFileContent(specPath, spec, records, baseUrl)

  if (errors.length > 0) {
    return {
      ok: false,
      reason: `Export failed: ${errors.join('; ')}`,
    }
  }

  // Ensure export directory exists
  try {
    await ensureExportDir(cwd)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: `Failed to create export directory: ${msg}`,
    }
  }

  // Write the test file
  const exportPath = getExportPath(cwd, specPath)
  const relativePath = getRelativeExportPath(cwd, specPath)

  try {
    await writeFile(exportPath, content, 'utf-8')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: `Failed to write export file: ${msg}`,
    }
  }

  return {
    ok: true,
    exportPath,
    relativePath,
  }
}

/**
 * Check if a spec is exportable (has IR records with valid locators).
 */
export async function isSpecExportable(
  cwd: string,
  runId: string,
  specPath: string,
): Promise<{ exportable: boolean; reason?: string }> {
  try {
    const records = await getSpecActionRecords(cwd, runId, specPath)

    if (records.length === 0) {
      return { exportable: false, reason: 'No IR records found for spec' }
    }

    const missingLocatorActions = getMissingLocatorActions(records)
    if (missingLocatorActions.length > 0) {
      return {
        exportable: false,
        reason: `${missingLocatorActions.length} action(s) missing valid chosenLocator`,
      }
    }

    return { exportable: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { exportable: false, reason: `Failed to check exportability: ${msg}` }
  }
}
