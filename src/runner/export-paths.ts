/**
 * Export Paths
 *
 * Handles file naming and path safety for Playwright test export.
 */

import { resolve, relative, basename, dirname } from 'node:path'
import { mkdir } from 'node:fs/promises'

const UNSAFE_PATH_CHARS = /[<>:"|?*\x00-\x1f]/g
const PATH_TRAVERSAL = /\.\./g
const MULTIPLE_SLASHES = /[\\/]+/g
const LEADING_TRAILING_UNDERSCORES = /^_+|_+$/g

/**
 * Sanitize a path segment to prevent directory traversal and invalid characters.
 */
export function sanitizePathSegment(segment: string): string {
  return segment
    .replace(UNSAFE_PATH_CHARS, '_')
    .replace(PATH_TRAVERSAL, '_')
    .replace(MULTIPLE_SLASHES, '_')
    .replace(LEADING_TRAILING_UNDERSCORES, '')
    .slice(0, 200)
}

/**
 * Generate a deterministic export file name from a spec path.
 * Converts the relative spec path to a safe .spec.ts filename.
 *
 * Example: specs/saucedemo-01-login.md -> saucedemo-01-login.spec.ts
 */
export function generateExportFileName(specPath: string, cwd: string): string {
  const relativePath = specPath.startsWith(cwd)
    ? relative(cwd, specPath)
    : basename(specPath)

  const sanitized = sanitizePathSegment(
    relativePath.replace(/\.md$/i, '').replace(/[\\/]/g, '-'),
  )

  return `${sanitized}.spec.ts`
}

/**
 * Get the export directory path (tests/autoqa/).
 */
export function getExportDir(cwd: string): string {
  return resolve(cwd, 'tests', 'autoqa')
}

/**
 * Get the full export file path.
 */
export function getExportPath(cwd: string, specPath: string): string {
  const exportDir = getExportDir(cwd)
  const fileName = generateExportFileName(specPath, cwd)
  return resolve(exportDir, fileName)
}

/**
 * Get the relative export path (safe for logging, no absolute paths).
 */
export function getRelativeExportPath(cwd: string, specPath: string): string {
  const fileName = generateExportFileName(specPath, cwd)
  return `tests/autoqa/${fileName}`
}

/**
 * Ensure the export directory exists.
 */
export async function ensureExportDir(cwd: string): Promise<string> {
  const exportDir = getExportDir(cwd)
  await mkdir(exportDir, { recursive: true })
  return exportDir
}

/**
 * Convert an absolute path to a safe relative path for output.
 * Never exposes absolute paths in logs or errors.
 */
export function toSafeRelativePath(absolutePath: string, cwd: string): string {
  const cwdNormalized = cwd.endsWith('/') ? cwd : cwd + '/'

  if (absolutePath.startsWith(cwdNormalized)) {
    return absolutePath.slice(cwdNormalized.length)
  }

  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length + 1)
  }

  const match = absolutePath.match(/tests\/autoqa\/[^/]+\.spec\.ts$/)
  if (match) {
    return match[0]
  }

  return 'tests/autoqa/[redacted].spec.ts'
}
