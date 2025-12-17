import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ZodError } from 'zod'

import { autoqaConfigSchema, type AutoqaConfig, type Guardrails } from './schema.js'
import { defaultAutoqaConfig, DEFAULT_GUARDRAILS } from './defaults.js'
import { AUTOQA_CONFIG_FILE_NAME } from './init.js'

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly configPath: string,
    public readonly zodError?: ZodError,
  ) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

export type ReadConfigResult =
  | { ok: true; config: AutoqaConfig; source: 'file' | 'default' }
  | { ok: false; error: ConfigValidationError }

export function readConfig(cwd: string = process.cwd()): ReadConfigResult {
  const configPath = join(cwd, AUTOQA_CONFIG_FILE_NAME)

  if (!existsSync(configPath)) {
    return { ok: true, config: defaultAutoqaConfig, source: 'default' }
  }

  let rawContent: string
  try {
    rawContent = readFileSync(configPath, 'utf8')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: new ConfigValidationError(`Failed to read config file: ${message}`, configPath),
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: new ConfigValidationError(`Invalid JSON in config file: ${message}`, configPath),
    }
  }

  const result = autoqaConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    return {
      ok: false,
      error: new ConfigValidationError(
        `Invalid config file:\n${issues}`,
        configPath,
        result.error,
      ),
    }
  }

  return { ok: true, config: result.data, source: 'file' }
}

export function resolveGuardrails(config: AutoqaConfig): Required<Guardrails> {
  const userGuardrails = config.guardrails ?? {}
  return {
    maxToolCallsPerSpec: userGuardrails.maxToolCallsPerSpec ?? DEFAULT_GUARDRAILS.maxToolCallsPerSpec,
    maxConsecutiveErrors: userGuardrails.maxConsecutiveErrors ?? DEFAULT_GUARDRAILS.maxConsecutiveErrors,
    maxRetriesPerStep: userGuardrails.maxRetriesPerStep ?? DEFAULT_GUARDRAILS.maxRetriesPerStep,
  }
}
