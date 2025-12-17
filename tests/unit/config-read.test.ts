import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { readConfig, resolveGuardrails, ConfigValidationError } from '../../src/config/read.js'
import { DEFAULT_GUARDRAILS } from '../../src/config/defaults.js'

describe('readConfig', () => {
  it('returns default config when file does not exist', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-config-'))

    try {
      const result = readConfig(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.source).toBe('default')
        expect(result.config.schemaVersion).toBe(1)
        expect(result.config.guardrails).toEqual(DEFAULT_GUARDRAILS)
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('reads and parses valid config file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-config-'))

    try {
      const configPath = join(tempDir, 'autoqa.config.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          schemaVersion: 1,
          guardrails: {
            maxToolCallsPerSpec: 100,
            maxConsecutiveErrors: 5,
            maxRetriesPerStep: 3,
          },
        }),
        'utf8',
      )

      const result = readConfig(tempDir)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.source).toBe('file')
        expect(result.config.guardrails?.maxToolCallsPerSpec).toBe(100)
        expect(result.config.guardrails?.maxConsecutiveErrors).toBe(5)
        expect(result.config.guardrails?.maxRetriesPerStep).toBe(3)
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns error for invalid JSON', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-config-'))

    try {
      const configPath = join(tempDir, 'autoqa.config.json')
      writeFileSync(configPath, '{ invalid json }', 'utf8')

      const result = readConfig(tempDir)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigValidationError)
        expect(result.error.message).toContain('Invalid JSON')
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns error for invalid schema (negative maxToolCallsPerSpec)', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-config-'))

    try {
      const configPath = join(tempDir, 'autoqa.config.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          schemaVersion: 1,
          guardrails: {
            maxToolCallsPerSpec: -1,
          },
        }),
        'utf8',
      )

      const result = readConfig(tempDir)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigValidationError)
        expect(result.error.message).toContain('guardrails.maxToolCallsPerSpec')
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns error for invalid schema (zero maxConsecutiveErrors)', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-config-'))

    try {
      const configPath = join(tempDir, 'autoqa.config.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          schemaVersion: 1,
          guardrails: {
            maxConsecutiveErrors: 0,
          },
        }),
        'utf8',
      )

      const result = readConfig(tempDir)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigValidationError)
        expect(result.error.message).toContain('guardrails.maxConsecutiveErrors')
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('returns error for unknown fields (strict mode)', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'autoqa-config-'))

    try {
      const configPath = join(tempDir, 'autoqa.config.json')
      writeFileSync(
        configPath,
        JSON.stringify({
          schemaVersion: 1,
          unknownField: 'value',
        }),
        'utf8',
      )

      const result = readConfig(tempDir)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ConfigValidationError)
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('resolveGuardrails', () => {
  it('uses defaults when guardrails not specified', () => {
    const result = resolveGuardrails({ schemaVersion: 1 })

    expect(result).toEqual(DEFAULT_GUARDRAILS)
  })

  it('uses defaults for missing fields', () => {
    const result = resolveGuardrails({
      schemaVersion: 1,
      guardrails: {
        maxToolCallsPerSpec: 50,
      },
    })

    expect(result.maxToolCallsPerSpec).toBe(50)
    expect(result.maxConsecutiveErrors).toBe(DEFAULT_GUARDRAILS.maxConsecutiveErrors)
    expect(result.maxRetriesPerStep).toBe(DEFAULT_GUARDRAILS.maxRetriesPerStep)
  })

  it('uses all user-specified values', () => {
    const result = resolveGuardrails({
      schemaVersion: 1,
      guardrails: {
        maxToolCallsPerSpec: 100,
        maxConsecutiveErrors: 10,
        maxRetriesPerStep: 8,
      },
    })

    expect(result.maxToolCallsPerSpec).toBe(100)
    expect(result.maxConsecutiveErrors).toBe(10)
    expect(result.maxRetriesPerStep).toBe(8)
  })
})
