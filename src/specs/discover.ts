import { readdirSync, statSync, type Dirent } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'

export type DiscoverSpecsResult =
  | { ok: true; specs: string[] }
  | { ok: false; error: { code: string; message: string; cause?: unknown } }

function compareDeterministic(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

function normalizePathForSort(pathStr: string): string {
  return pathStr.split(sep).join('/')
}

function isMdFilePath(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.md'
}

function formatFsErrorSuffix(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  const anyErr = err as any

  const code = anyErr?.code
  const codePart = typeof code === 'string' ? ` (${code})` : ''

  const message = anyErr?.message
  const messagePart = typeof message === 'string' && message.length > 0 ? `: ${message}` : ''

  return `${codePart}${messagePart}`
}

function collectMarkdownFilesIterative(rootDir: string): DiscoverSpecsResult {
  const results: string[] = []
  const stack: string[] = [rootDir]

  while (stack.length > 0) {
    const dirPath = stack.pop() as string

    let entries: Array<Dirent<string>>

    try {
      entries = readdirSync(dirPath, { withFileTypes: true, encoding: 'utf8' })
    } catch (err: unknown) {
      return {
        ok: false,
        error: {
          code: 'FAILED_TO_READ_DIRECTORY',
          message: `Failed to read directory: ${dirPath}${formatFsErrorSuffix(err)}`,
          cause: err,
        },
      }
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      if (entry.isSymbolicLink()) {
        let st: ReturnType<typeof statSync>
        try {
          st = statSync(fullPath)
        } catch {
          continue
        }

        if (st.isDirectory()) {
          continue
        }

        if (st.isFile() && isMdFilePath(fullPath)) {
          results.push(fullPath)
        }

        continue
      }

      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (entry.isFile() && isMdFilePath(fullPath)) {
        results.push(fullPath)
      }
    }
  }

  return { ok: true, specs: results }
}

export function discoverMarkdownSpecs(fileOrDir: string): DiscoverSpecsResult {
  const inputPath = resolve(fileOrDir)

  let stats: ReturnType<typeof statSync>

  try {
    stats = statSync(inputPath)
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: 'INVALID_SPEC_PATH',
        message: `Invalid spec path: ${inputPath}${formatFsErrorSuffix(err)}`,
        cause: err,
      },
    }
  }

  if (stats.isFile()) {
    if (!isMdFilePath(inputPath)) {
      return {
        ok: false,
        error: {
          code: 'SPEC_FILE_NOT_MARKDOWN',
          message: `Spec file must be a Markdown (.md) file: ${inputPath}`,
        },
      }
    }

    return { ok: true, specs: [inputPath] }
  }

  if (stats.isDirectory()) {
    const collected = collectMarkdownFilesIterative(inputPath)
    if (!collected.ok) return collected

    if (collected.specs.length === 0) {
      return {
        ok: false,
        error: {
          code: 'NO_SPECS_FOUND',
          message: `No Markdown spec files found under directory: ${inputPath}`,
        },
      }
    }

    const sorted = [...collected.specs].sort((a, b) => {
      const ak = normalizePathForSort(relative(inputPath, a))
      const bk = normalizePathForSort(relative(inputPath, b))
      return compareDeterministic(ak, bk)
    })

    return { ok: true, specs: sorted }
  }

  return {
    ok: false,
    error: {
      code: 'INVALID_SPEC_PATH_TYPE',
      message: `Invalid spec path (must be a file or directory): ${inputPath}`,
    },
  }
}
