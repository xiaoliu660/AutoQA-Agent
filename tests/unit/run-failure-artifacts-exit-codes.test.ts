import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const runSpecsMock = vi.fn(async (_options: any): Promise<any> => ({ ok: true, specsPassed: 1, specsFailed: 0, traces: [] }))
vi.mock('../../src/runner/run-specs.js', () => ({
  runSpecs: runSpecsMock,
}))

const probeAgentSdkAuthMock = vi.fn(async (): Promise<any> => ({ kind: 'available' }))
vi.mock('../../src/auth/probe.js', () => ({
  probeAgentSdkAuth: probeAgentSdkAuthMock,
}))

const validMarkdownSpec = `# Spec\n\n## Preconditions\n- ready\n\n## Steps\n1. Navigate to /\n`

beforeEach(() => {
  runSpecsMock.mockClear()
  probeAgentSdkAuthMock.mockClear()
  delete (process.env as any).ANTHROPIC_API_KEY
})

describe('autoqa run (failure artifacts & exit codes)', () => {
  it('exits with code 1 when SPEC_EXECUTION_FAILED and outputs CI summary fields', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      runSpecsMock.mockImplementationOnce(async (options: any) => {
        const runId = options.runId
        return {
          ok: false,
          code: 'SPEC_EXECUTION_FAILED',
          message: 'Assertion failed: expected text not found',
          specsPassed: 0,
          specsFailed: 1,
          failedSpecPath: 'single.md',
          failureScreenshotPath: `.autoqa/runs/${runId}/screenshots/failure-000-single.jpg`,
          traces: [{ specPath, tracePath: `.autoqa/runs/${runId}/traces/000-single.zip` }],
        }
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })
      program.exitOverride()

      let exitCode: number | undefined

      try {
        await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      } catch (err: any) {
        exitCode = err.exitCode
      }

      expect(exitCode).toBe(1)

      expect(errOutput).toContain('specsPassed=0')
      expect(errOutput).toContain('specsFailed=1')
      expect(errOutput).toMatch(/durationMs=\d+/)
      expect(errOutput).toMatch(/logPath=\.autoqa\/runs\/[^/]+\/run\.log\.jsonl/)
      expect(errOutput).toMatch(/snapshotDir=\.autoqa\/runs\/[^/]+\/snapshots/)
      expect(errOutput).toMatch(/traceDir=\.autoqa\/runs\/[^/]+\/traces/)
      expect(errOutput).toContain('failedSpecPath=single.md')
      const runIdMatch = errOutput.match(/runId=([a-f0-9-]+)/)
      expect(runIdMatch).not.toBeNull()
      const runId = runIdMatch![1]

      expect(errOutput).toContain(`screenshotsDir=.autoqa/runs/${runId}/screenshots`)
      expect(errOutput).toContain(`screenshotPath=.autoqa/runs/${runId}/screenshots/failure-000-single.jpg`)
      expect(errOutput).toContain(`tracePath=.autoqa/runs/${runId}/traces/000-single.zip`)
      expect(errOutput).toContain('failureSummary=Assertion failed: expected text not found')

      expect(errOutput).not.toContain(tempDir)
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('exits with code 2 when BROWSER_LAUNCH_FAILED (not SPEC_EXECUTION_FAILED)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      runSpecsMock.mockResolvedValueOnce({
        ok: false,
        code: 'BROWSER_LAUNCH_FAILED',
        message: 'Failed to launch browser',
        specsPassed: 0,
        specsFailed: 0,
        traces: [],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })
      program.exitOverride()

      let exitCode: number | undefined

      try {
        await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      } catch (err: any) {
        exitCode = err.exitCode
      }

      expect(exitCode).toBe(2)
      expect(errOutput).toContain('Failed to launch browser')
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('exits with code 2 when CONTEXT_CREATE_FAILED', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      runSpecsMock.mockResolvedValueOnce({
        ok: false,
        code: 'CONTEXT_CREATE_FAILED',
        message: 'Failed to create browser context',
        specsPassed: 0,
        specsFailed: 1,
        traces: [],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })
      program.exitOverride()

      let exitCode: number | undefined

      try {
        await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      } catch (err: any) {
        exitCode = err.exitCode
      }

      expect(exitCode).toBe(2)
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('exits with code 2 when spec parse throws an exception', async () => {
    vi.resetModules()

    vi.doMock('../../src/markdown/parse-markdown-spec.js', () => ({
      parseMarkdownSpec: () => {
        throw new Error('Unexpected parse error')
      },
    }))

    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })
      program.exitOverride()

      let exitCode: number | undefined

      try {
        await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      } catch (err: any) {
        exitCode = err.exitCode
      }

      expect(exitCode).toBe(2)
      expect(errOutput).toContain('Failed to parse spec')
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
      vi.doUnmock('../../src/markdown/parse-markdown-spec.js')
      vi.resetModules()
    }
  })

  it('outputs CI summary fields on success (exit code 0)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      runSpecsMock.mockResolvedValueOnce({
        ok: true,
        specsPassed: 1,
        specsFailed: 0,
        traces: [{ specPath, tracePath: '.autoqa/runs/test-run/traces/000-single.zip' }],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      let stdOutput = ''
      program.configureOutput({
        writeOut: (str: string) => {
          stdOutput += str
        },
        writeErr: (str: string) => {
          errOutput += str
        },
      })

      await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })

      expect(errOutput).toContain('specsPassed=1')
      expect(errOutput).toContain('specsFailed=0')
      expect(errOutput).toMatch(/durationMs=\d+/)
      expect(errOutput).not.toMatch(/logPath=\.autoqa\/runs\/[^/]+\/run\.log\.jsonl/)
      expect(errOutput).not.toMatch(/traceDir=\.autoqa\/runs\/[^/]+\/traces/)
      expect(errOutput).not.toContain('tracePath=.autoqa/runs/test-run/traces/000-single.zip')

      expect(errOutput).not.toContain(tempDir)

      expect(stdOutput).toContain(specPath)
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('stderr output does not contain absolute paths (tempDir)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      runSpecsMock.mockResolvedValueOnce({
        ok: false,
        code: 'SPEC_EXECUTION_FAILED',
        message: 'Test failed',
        specsPassed: 0,
        specsFailed: 1,
        traces: [],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })
      program.exitOverride()

      try {
        await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      } catch {
      }

      const artifactLines = errOutput
        .split('\n')
        .filter((line) =>
          line.startsWith('artifactRoot=') ||
          line.startsWith('logPath=') ||
          line.startsWith('screenshotsDir=') ||
          line.startsWith('snapshotDir=') ||
          line.startsWith('traceDir=') ||
          line.startsWith('tracePath=') ||
          line.startsWith('screenshotPath=')
        )

      for (const line of artifactLines) {
        const value = line.split('=')[1]
        expect(value).toMatch(/^\.autoqa\/runs\//)
        expect(value).not.toContain(tmpdir())
      }
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('artifact paths start with .autoqa/runs/<runId>/', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)

      runSpecsMock.mockResolvedValueOnce({
        ok: true,
        specsPassed: 1,
        specsFailed: 0,
        traces: [],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })

      await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })

      const runIdMatch = errOutput.match(/runId=([a-f0-9-]+)/)
      expect(runIdMatch).not.toBeNull()
      const runId = runIdMatch![1]

      expect(errOutput).toContain(`artifactRoot=.autoqa/runs/${runId}`)
      expect(errOutput).not.toContain(`logPath=.autoqa/runs/${runId}/run.log.jsonl`)
      expect(errOutput).not.toContain(`traceDir=.autoqa/runs/${runId}/traces`)
    } finally {
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('outputs logPath on success when AUTOQA_ARTIFACTS=all', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)
      process.env.AUTOQA_ARTIFACTS = 'all'

      runSpecsMock.mockResolvedValueOnce({
        ok: true,
        specsPassed: 1,
        specsFailed: 0,
        traces: [],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })

      await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      expect(errOutput).toMatch(/logPath=\.autoqa\/runs\/[^/]+\/run\.log\.jsonl/)
    } finally {
      delete process.env.AUTOQA_ARTIFACTS
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('does not output artifact paths when AUTOQA_ARTIFACTS=none', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-run-'))
    const originalCwd = process.cwd()

    try {
      const specPath = join(tempDir, 'single.md')
      writeFileSync(specPath, validMarkdownSpec, 'utf8')

      process.chdir(tempDir)
      process.env.AUTOQA_ARTIFACTS = 'none'

      runSpecsMock.mockResolvedValueOnce({
        ok: false,
        code: 'SPEC_EXECUTION_FAILED',
        message: 'Test failed',
        specsPassed: 0,
        specsFailed: 1,
        failedSpecPath: 'single.md',
        failureScreenshotPath: '.autoqa/runs/test-run/screenshots/failure-000-single.jpg',
        traces: [{ specPath, tracePath: '.autoqa/runs/test-run/traces/000-single.zip' }],
      })

      const { createProgram } = await import('../../src/cli/program.js')
      const program = createProgram()

      let errOutput = ''
      program.configureOutput({
        writeOut: () => {},
        writeErr: (str: string) => {
          errOutput += str
        },
      })
      program.exitOverride()

      try {
        await program.parseAsync(['run', specPath, '--url', 'http://example.test'], { from: 'user' })
      } catch {
      }

      expect(errOutput).toContain('failedSpecPath=single.md')
      expect(errOutput).not.toContain('logPath=')
      expect(errOutput).not.toContain('snapshotDir=')
      expect(errOutput).not.toContain('screenshotsDir=')
      expect(errOutput).not.toContain('screenshotPath=')
      expect(errOutput).not.toContain('traceDir=')
      expect(errOutput).not.toContain('tracePath=')
    } finally {
      delete process.env.AUTOQA_ARTIFACTS
      process.chdir(originalCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('getRelativeLogPath', () => {
  it('returns relative path format', async () => {
    const { getRelativeLogPath } = await import('../../src/logging/logger.js')
    const runId = 'test-run-id'
    const logPath = getRelativeLogPath(runId)
    expect(logPath).toBe('.autoqa/runs/test-run-id/run.log.jsonl')
  })
})
