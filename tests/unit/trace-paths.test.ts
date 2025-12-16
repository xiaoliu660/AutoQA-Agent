import { describe, expect, it } from 'vitest'

import {
  sanitizePathSegment,
  generateTraceName,
  getTraceDir,
  getTracePath,
  getRelativeTracePath,
  getRelativeTraceDir,
  toRelativePath,
} from '../../src/runner/trace-paths.js'

describe('trace-paths/sanitizePathSegment', () => {
  it('removes unsafe characters', () => {
    expect(sanitizePathSegment('file<>:"|?*name')).toBe('file_______name')
  })

  it('removes path traversal sequences', () => {
    expect(sanitizePathSegment('../../../etc/passwd')).toBe('______etc_passwd')
  })

  it('removes multiple slashes', () => {
    expect(sanitizePathSegment('a//b///c')).toBe('a_b_c')
  })

  it('removes leading and trailing slashes', () => {
    expect(sanitizePathSegment('/foo/bar/')).toBe('_foo_bar_')
  })

  it('treats backslashes as path separators', () => {
    expect(sanitizePathSegment('a\\b\\c')).toBe('a_b_c')
  })

  it('truncates long segments to 200 chars', () => {
    const longName = 'a'.repeat(300)
    expect(sanitizePathSegment(longName).length).toBe(200)
  })
})

describe('trace-paths/generateTraceName', () => {
  it('generates padded index with sanitized spec path', () => {
    const result = generateTraceName(0, '/cwd/specs/login.md', '/cwd')
    expect(result).toBe('000-specs-login')
  })

  it('handles nested spec paths', () => {
    const result = generateTraceName(5, '/cwd/specs/auth/login.md', '/cwd')
    expect(result).toBe('005-specs-auth-login')
  })

  it('handles mixed slashes in spec path', () => {
    const result = generateTraceName(2, '/cwd/specs\\auth/login.md', '/cwd')
    expect(result).toBe('002-specs-auth-login')
  })

  it('uses basename when spec path does not start with cwd', () => {
    const result = generateTraceName(10, '/other/path/test.md', '/cwd')
    expect(result).toBe('010-test')
  })

  it('pads index to 3 digits', () => {
    expect(generateTraceName(1, '/cwd/a.md', '/cwd')).toMatch(/^001-/)
    expect(generateTraceName(99, '/cwd/a.md', '/cwd')).toMatch(/^099-/)
    expect(generateTraceName(100, '/cwd/a.md', '/cwd')).toMatch(/^100-/)
  })
})

describe('trace-paths/getTraceDir', () => {
  it('returns absolute path to traces directory', () => {
    const result = getTraceDir('/home/user/project', 'run-123')
    expect(result).toBe('/home/user/project/.autoqa/runs/run-123/traces')
  })

  it('sanitizes runId', () => {
    const result = getTraceDir('/home/user/project', '../../../etc')
    expect(result).not.toContain('../')
  })
})

describe('trace-paths/getTracePath', () => {
  it('returns absolute path to trace zip file', () => {
    const result = getTracePath('/home/user/project', 'run-123', '000-login')
    expect(result).toBe('/home/user/project/.autoqa/runs/run-123/traces/000-login.zip')
  })

  it('sanitizes trace name', () => {
    const result = getTracePath('/home/user/project', 'run-123', '../../../etc')
    expect(result).not.toContain('../')
  })
})

describe('trace-paths/getRelativeTracePath', () => {
  it('returns relative path to trace zip file', () => {
    const result = getRelativeTracePath('/home/user/project', 'run-123', '000-login')
    expect(result).toBe('.autoqa/runs/run-123/traces/000-login.zip')
  })

  it('does not include absolute path prefix', () => {
    const result = getRelativeTracePath('/home/user/project', 'run-123', '000-login')
    expect(result).not.toMatch(/^\//)
  })
})

describe('trace-paths/getRelativeTraceDir', () => {
  it('returns relative path to traces directory', () => {
    const result = getRelativeTraceDir('run-123')
    expect(result).toBe('.autoqa/runs/run-123/traces')
  })

  it('sanitizes runId', () => {
    const result = getRelativeTraceDir('../../../etc')
    expect(result).not.toContain('../')
  })
})

describe('trace-paths/toRelativePath', () => {
  it('converts absolute path to relative when under cwd', () => {
    const result = toRelativePath('/home/user/project/.autoqa/runs/run-123/traces/test.zip', '/home/user/project')
    expect(result).toBe('.autoqa/runs/run-123/traces/test.zip')
  })

  it('handles cwd with trailing slash', () => {
    const result = toRelativePath('/home/user/project/.autoqa/runs/run-123/traces/test.zip', '/home/user/project/')
    expect(result).toBe('.autoqa/runs/run-123/traces/test.zip')
  })

  it('extracts .autoqa path when not under cwd', () => {
    const result = toRelativePath('/other/path/.autoqa/runs/run-123/traces/test.zip', '/home/user/project')
    expect(result).toBe('.autoqa/runs/run-123/traces/test.zip')
  })

  it('returns redacted placeholder for unrecognized paths', () => {
    const result = toRelativePath('/completely/different/path.zip', '/home/user/project')
    expect(result).toBe('[path-redacted]')
  })
})
