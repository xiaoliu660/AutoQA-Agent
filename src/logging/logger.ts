import { mkdir, writeFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Writable } from 'node:stream'

import pino from 'pino'

import type { LogEvent } from './types.js'

export type LoggerOptions = {
  runId: string
  cwd?: string
  debug?: boolean
  writeToFile?: boolean
}

export type Logger = {
  log: (event: LogEvent) => void
  flush: () => Promise<void>
  logPath?: string
  logInitError?: string
  persistToFile?: () => Promise<{ ok: true; logPath: string } | { ok: false; error: string }>
}

function sanitizePathSegment(value: string): string {
  const cleaned = (value ?? '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  if (cleaned === '.' || cleaned === '..') return 'unknown'
  return cleaned.length > 0 ? cleaned : 'unknown'
}

function getArtifactRoot(_cwd: string, runId: string): string {
  const safeRunId = sanitizePathSegment(runId)
  return `.autoqa/runs/${safeRunId}`
}

function getLogFilePath(cwd: string, runId: string): string {
  const safeRunId = sanitizePathSegment(runId)
  return resolve(cwd, '.autoqa', 'runs', safeRunId, 'run.log.jsonl')
}

function ensureLogDir(cwd: string, runId: string): void {
  const safeRunId = sanitizePathSegment(runId)
  const dir = resolve(cwd, '.autoqa', 'runs', safeRunId)
  mkdirSync(dir, { recursive: true })
}

export function createLogger(options: LoggerOptions): Logger {
  const cwd = options.cwd ?? process.cwd()
  const runId = options.runId
  const debug = options.debug ?? false
  const writeToFile = options.writeToFile ?? true

  let fileDestination: any | undefined
  let closed = false
  const logger: Logger = {
    log: () => {},
    flush: async () => {},
  }

  const buffer: string[] = []
  let bufferBytes = 0
  const MAX_BUFFER_BYTES = 5 * 1024 * 1024

  const memoryDestination = new Writable({
    write(chunk, _encoding, callback) {
      try {
        const str = typeof chunk === 'string' ? chunk : chunk.toString()
        buffer.push(str)
        bufferBytes += Buffer.byteLength(str)

        while (bufferBytes > MAX_BUFFER_BYTES && buffer.length > 0) {
          const removed = buffer.shift() as string
          bufferBytes -= Buffer.byteLength(removed)
        }
      } catch {
        // ignore
      }
      callback()
    },
  })

  if (writeToFile) {
    try {
      ensureLogDir(cwd, runId)
      const absLogPath = getLogFilePath(cwd, runId)
      fileDestination = pino.destination({ dest: absLogPath, sync: false })
      logger.logPath = getRelativeLogPath(runId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.logInitError = message
      fileDestination = undefined
    }
  }

  const streams: Array<{ stream: any }> = [{ stream: memoryDestination }]
  if (fileDestination) streams.push({ stream: fileDestination })
  if (debug) streams.push({ stream: pino.destination({ dest: 2, sync: true }) })

  const destination = streams.length === 1 ? streams[0].stream : pino.multistream(streams)

  const pinoLogger = pino(
    {
      base: undefined,
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    },
    destination,
  )

  const log = (event: LogEvent): void => {
    try {
      pinoLogger.info(event)
    } catch {
      // ignore logging errors - logging should not break the run
    }
  }

  const flush = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      try {
        pinoLogger.flush(() => resolve())
      } catch {
        resolve()
      }
    })

    if (!closed && fileDestination?.end) {
      closed = true
      try {
        fileDestination.end()
      } catch {
        // ignore close errors
      }
    }
  }

  const persistToFile = async (): Promise<{ ok: true; logPath: string } | { ok: false; error: string }> => {
    if (logger.logPath) return { ok: true, logPath: logger.logPath }

    try {
      ensureLogDir(cwd, runId)
      const absLogPath = getLogFilePath(cwd, runId)
      await writeFile(absLogPath, buffer.join(''), { mode: 0o600 })
      const relativeLogPath = getRelativeLogPath(runId)
      logger.logPath = relativeLogPath
      return { ok: true, logPath: relativeLogPath }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.logInitError = message
      return { ok: false, error: message }
    }
  }

  logger.log = log
  logger.flush = flush
  logger.persistToFile = persistToFile

  return logger
}

export function getArtifactRootPath(cwd: string, runId: string): string {
  return getArtifactRoot(cwd, runId)
}

export function getRelativeLogPath(runId: string): string {
  const safeRunId = sanitizePathSegment(runId)
  return `.autoqa/runs/${safeRunId}/run.log.jsonl`
}

export async function ensureArtifactDir(cwd: string, runId: string): Promise<string> {
  const artifactRoot = getArtifactRoot(cwd, runId)
  const absPath = resolve(cwd, artifactRoot)
  await mkdir(absPath, { recursive: true })
  return artifactRoot
}
