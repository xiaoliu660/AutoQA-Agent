import { resolve, relative, basename } from 'node:path'
import { mkdir } from 'node:fs/promises'

const UNSAFE_PATH_CHARS = /[<>:"|?*\x00-\x1f]/g
const PATH_TRAVERSAL = /\.\./g
const MULTIPLE_SLASHES = /[\\/]+/g
const LEADING_TRAILING_SLASHES = /^[\\/]+|[\\/]+$/g

export function sanitizePathSegment(segment: string): string {
  return segment
    .replace(UNSAFE_PATH_CHARS, '_')
    .replace(PATH_TRAVERSAL, '_')
    .replace(MULTIPLE_SLASHES, '_')
    .replace(LEADING_TRAILING_SLASHES, '')
    .slice(0, 200)
}

export function generateTraceName(specIndex: number, specPath: string, cwd: string): string {
  const relativePath = specPath.startsWith(cwd)
    ? relative(cwd, specPath)
    : basename(specPath)

  const sanitized = sanitizePathSegment(
    relativePath.replace(/\.md$/i, '').replace(/[\\/]/g, '-'),
  )

  const paddedIndex = String(specIndex).padStart(3, '0')
  return `${paddedIndex}-${sanitized}`
}

export function getTraceDir(cwd: string, runId: string): string {
  const sanitizedRunId = sanitizePathSegment(runId)
  return resolve(cwd, '.autoqa', 'runs', sanitizedRunId, 'traces')
}

export function getTracePath(cwd: string, runId: string, traceName: string): string {
  const traceDir = getTraceDir(cwd, runId)
  const sanitizedName = sanitizePathSegment(traceName)
  return resolve(traceDir, `${sanitizedName}.zip`)
}

export function getRelativeTracePath(_cwd: string, runId: string, traceName: string): string {
  const sanitizedRunId = sanitizePathSegment(runId)
  const sanitizedName = sanitizePathSegment(traceName)
  return `.autoqa/runs/${sanitizedRunId}/traces/${sanitizedName}.zip`
}

export function getRelativeTraceDir(runId: string): string {
  const sanitizedRunId = sanitizePathSegment(runId)
  return `.autoqa/runs/${sanitizedRunId}/traces`
}

export async function ensureTraceDir(cwd: string, runId: string): Promise<string> {
  const traceDir = getTraceDir(cwd, runId)
  await mkdir(traceDir, { recursive: true })
  return traceDir
}

export function toRelativePath(absolutePath: string, cwd: string): string {
  const cwdNormalized = cwd.endsWith('/') ? cwd : cwd + '/'
  if (absolutePath.startsWith(cwdNormalized)) {
    return absolutePath.slice(cwdNormalized.length)
  }
  if (absolutePath.startsWith(cwd)) {
    return absolutePath.slice(cwd.length + 1)
  }
  const match = absolutePath.match(/\.autoqa\/runs\/[^/]+\/traces\/.*$/)
  if (match) {
    return match[0]
  }
  return '[path-redacted]'
}
