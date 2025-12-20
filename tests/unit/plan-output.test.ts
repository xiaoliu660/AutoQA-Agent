import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rm, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { writeExplorationResult, writeTestPlan, buildMarkdownForTestCase } from '../../src/plan/output.js'
import type { ExplorationResult, TestPlan, TestCasePlan } from '../../src/plan/types.js'

describe('plan/output', () => {
  const testCwd = resolve(process.cwd(), 'tests', 'fixtures', 'plan-output-test')
  const testRunId = 'test-run-123'

  beforeEach(async () => {
    await rm(testCwd, { recursive: true, force: true })
  })

  afterEach(async () => {
    await rm(testCwd, { recursive: true, force: true })
  })

  function createTestResult(): ExplorationResult {
    return {
      runId: testRunId,
      startUrl: 'https://example.com',
      startedAt: '2025-01-01T00:00:00.000Z',
      finishedAt: '2025-01-01T00:01:00.000Z',
      stats: {
        pagesVisited: 1,
        elementsFound: 10,
        formsFound: 1,
        linksFound: 5,
        maxDepthReached: 0,
        configuredDepth: 2,
      },
      graph: {
        pages: [
          {
            id: 'p1',
            url: 'https://example.com',
            title: 'Example',
            visitedAt: '2025-01-01T00:00:00.000Z',
            depth: 0,
            elementSummary: [
              { id: 'e1', kind: 'button', text: 'Click me' },
            ],
            forms: [],
            links: [{ text: 'About', href: 'https://example.com/about', external: false }],
          },
        ],
        edges: [],
      },
      transcript: [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          runId: testRunId,
          type: 'tool_call',
          toolName: 'open_url',
          toolInput: { url: 'https://example.com' },
        },
      ],
    }
  }

  describe('writeExplorationResult', () => {
    it('should write three artifact files', async () => {
      const result = createTestResult()

      const output = await writeExplorationResult(result, {
        cwd: testCwd,
        runId: testRunId,
      })

      expect(output.errors).toHaveLength(0)
      expect(output.graphPath).toBe('.autoqa/runs/test-run-123/plan-explore/explore-graph.json')
      expect(output.elementsPath).toBe('.autoqa/runs/test-run-123/plan-explore/explore-elements.json')
      expect(output.transcriptPath).toBe('.autoqa/runs/test-run-123/plan-explore/explore-transcript.jsonl')
    })

    it('should write explore-graph.json with pages and edges', async () => {
      const result = createTestResult()

      await writeExplorationResult(result, {
        cwd: testCwd,
        runId: testRunId,
      })

      const absPath = resolve(testCwd, '.autoqa', 'runs', testRunId, 'plan-explore', 'explore-graph.json')
      const content = await readFile(absPath, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.pages).toHaveLength(1)
      expect(parsed.pages[0].url).toBe('https://example.com')
      expect(parsed.edges).toEqual([])
    })

    it('should write explore-elements.json with elements per page', async () => {
      const result = createTestResult()

      await writeExplorationResult(result, {
        cwd: testCwd,
        runId: testRunId,
      })

      const absPath = resolve(testCwd, '.autoqa', 'runs', testRunId, 'plan-explore', 'explore-elements.json')
      const content = await readFile(absPath, 'utf-8')
      const parsed = JSON.parse(content)

      expect(parsed.runId).toBe(testRunId)
      expect(parsed.pages).toHaveLength(1)
      expect(parsed.pages[0].pageUrl).toBe('https://example.com')
      expect(parsed.pages[0].elements).toHaveLength(1)
      expect(parsed.pages[0].elements[0].kind).toBe('button')
    })

    it('should write explore-transcript.jsonl with one JSON per line', async () => {
      const result = createTestResult()

      await writeExplorationResult(result, {
        cwd: testCwd,
        runId: testRunId,
      })

      const absPath = resolve(testCwd, '.autoqa', 'runs', testRunId, 'plan-explore', 'explore-transcript.jsonl')
      const content = await readFile(absPath, 'utf-8')
      const lines = content.trim().split('\n')

      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0])
      expect(entry.type).toBe('tool_call')
      expect(entry.toolName).toBe('open_url')
    })

    it('should sanitize runId in paths', async () => {
      const result = createTestResult()
      result.runId = 'test/../../../etc/passwd'

      const output = await writeExplorationResult(result, {
        cwd: testCwd,
        runId: 'test/../../../etc/passwd',
      })

      expect(output.errors).toHaveLength(0)
      expect(output.graphPath).toContain('test_______etc_passwd')
      expect(output.graphPath).not.toContain('..')
    })

    it('should handle write errors gracefully', async () => {
      const result = createTestResult()

      const output = await writeExplorationResult(result, {
        cwd: '/invalid/path/that/does/not/exist',
        runId: testRunId,
      })

      expect(output.errors.length).toBeGreaterThan(0)
      expect(output.graphPath).toBeUndefined()
    })

    it('should include error information in result when exploration failed', async () => {
      const result = createTestResult()
      result.error = {
        message: 'Navigation failed',
        stage: 'navigation',
        pageUrl: 'https://example.com',
      }

      const output = await writeExplorationResult(result, {
        cwd: testCwd,
        runId: testRunId,
      })

      expect(output.errors).toHaveLength(0)
      expect(output.graphPath).toBeDefined()
    })

    it('should include guardrail trigger in transcript', async () => {
      const result = createTestResult()
      result.guardrailTriggered = {
        code: 'MAX_PAGES',
        limit: 10,
        actual: 10,
        triggeredAt: '2025-01-01T00:00:30.000Z',
      }
      result.transcript.push({
        timestamp: '2025-01-01T00:00:30.000Z',
        runId: testRunId,
        type: 'guardrail_triggered',
        guardrail: result.guardrailTriggered,
      })

      const output = await writeExplorationResult(result, {
        cwd: testCwd,
        runId: testRunId,
      })

      const absPath = resolve(testCwd, '.autoqa', 'runs', testRunId, 'plan-explore', 'explore-transcript.jsonl')
      const content = await readFile(absPath, 'utf-8')
      const lines = content.trim().split('\n')

      expect(lines).toHaveLength(2)
      const lastEntry = JSON.parse(lines[1])
      expect(lastEntry.type).toBe('guardrail_triggered')
      expect(lastEntry.guardrail.code).toBe('MAX_PAGES')
    })
  })

  describe('buildMarkdownForTestCase', () => {
    it('should generate markdown with Preconditions and ordered Steps including Expected', () => {
      const testCase: TestCasePlan = {
        id: 'case-1',
        name: 'Login with valid credentials',
        type: 'form',
        priority: 'p0',
        relatedPageIds: ['login', 'dashboard'],
        markdownPath: 'login/case-1.md',
        preconditions: ['User has a valid account', 'Application base URL is reachable'],
        steps: [
          {
            description: 'Open the login page',
            expectedResult: 'Login form is visible',
          },
          {
            description: 'Fill username {{USERNAME}} and password {{PASSWORD}} and submit',
            expectedResult: 'User is redirected to dashboard',
          },
        ],
      }

      const markdown = buildMarkdownForTestCase(testCase)

      expect(markdown).toContain('# Login with valid credentials')
      expect(markdown).toContain('## Preconditions')
      expect(markdown).toContain('- User has a valid account')
      expect(markdown).toContain('## Steps')
      expect(markdown).toMatch(/1\. Open the login page/)
      expect(markdown).toMatch(/- Expected: Login form is visible/)
      expect(markdown).toMatch(/2\. Fill username \{\{USERNAME}} and password \{\{PASSWORD}} and submit/)
      expect(markdown).toMatch(/- Expected: User is redirected to dashboard/)
    })

    it('should provide default preconditions and steps when missing', () => {
      const testCase: TestCasePlan = {
        id: 'case-2',
        name: 'Generic functional check',
        type: 'functional',
        priority: 'p1',
        relatedPageIds: ['home'],
        markdownPath: 'case-2.md',
      }

      const markdown = buildMarkdownForTestCase(testCase)

      expect(markdown).toContain('## Preconditions')
      expect(markdown).toContain('Environment is prepared and application is reachable.')
      expect(markdown).toContain('## Steps')
      expect(markdown).toContain('1. Execute the main user journey for this test case.')
      expect(markdown).toContain('Expected: The application behaves as described in the test case name and type.')
    })
  })

  describe('writeTestPlan', () => {
    it('should write test-plan.json and markdown specs for cases', async () => {
      const plan: TestPlan = {
        runId: testRunId,
        generatedAt: '2025-01-01T00:00:00.000Z',
        configSnapshot: {
          baseUrl: 'https://example.com',
          maxDepth: 2,
        },
        flows: [],
        cases: [
          {
            id: 'case-1',
            name: 'Login with valid credentials',
            type: 'form',
            priority: 'p0',
            relatedPageIds: ['login', 'dashboard'],
            markdownPath: 'auth/login-success.md',
            preconditions: ['User has a valid account'],
            steps: [
              {
                description: 'Open login page and submit valid credentials',
                expectedResult: 'User is redirected to dashboard',
              },
            ],
          },
        ],
      }

      const output = await writeTestPlan(plan, {
        cwd: testCwd,
        runId: testRunId,
      })

      expect(output.errors).toHaveLength(0)
      expect(output.planPath).toBe('.autoqa/runs/test-run-123/plan/test-plan.json')
      expect(output.specPaths).toHaveLength(1)
      expect(output.specPaths[0]).toBe('.autoqa/runs/test-run-123/plan/specs/auth/login-success.md')

      const planJsonPath = resolve(testCwd, '.autoqa', 'runs', testRunId, 'plan', 'test-plan.json')
      const planContent = await readFile(planJsonPath, 'utf-8')
      const parsedPlan = JSON.parse(planContent)

      expect(parsedPlan.runId).toBe(testRunId)
      expect(parsedPlan.cases).toHaveLength(1)
      expect(parsedPlan.cases[0].name).toBe('Login with valid credentials')

      const specAbsPath = resolve(testCwd, '.autoqa', 'runs', testRunId, 'plan', 'specs', 'auth', 'login-success.md')
      const specContent = await readFile(specAbsPath, 'utf-8')
      expect(specContent).toContain('# Login with valid credentials')
      expect(specContent).toContain('## Preconditions')
      expect(specContent).toContain('## Steps')
    })

    it('should prevent directory traversal in markdownPath', async () => {
      const plan: TestPlan = {
        runId: testRunId,
        generatedAt: '2025-01-01T00:00:00.000Z',
        configSnapshot: {
          baseUrl: 'https://example.com',
          maxDepth: 2,
        },
        flows: [],
        cases: [
          {
            id: 'case-1',
            name: 'Invalid path case',
            type: 'functional',
            priority: 'p2',
            relatedPageIds: ['home'],
            markdownPath: '../escape.md',
          },
        ],
      }

      const output = await writeTestPlan(plan, {
        cwd: testCwd,
        runId: testRunId,
      })

      expect(output.errors.length).toBeGreaterThan(0)
      expect(output.specPaths).toHaveLength(0)
    })

    it('should sanitize runId for plan output similar to exploration output', async () => {
      const plan: TestPlan = {
        runId: 'test/../../../etc/passwd',
        generatedAt: '2025-01-01T00:00:00.000Z',
        configSnapshot: {
          baseUrl: 'https://example.com',
          maxDepth: 2,
        },
        flows: [],
        cases: [
          {
            id: 'case-1',
            name: 'Sanitized run id case',
            type: 'functional',
            priority: 'p2',
            relatedPageIds: ['home'],
            markdownPath: 'case-1.md',
          },
        ],
      }

      const unsafeRunId = 'test/../../../etc/passwd'
      const output = await writeTestPlan(plan, {
        cwd: testCwd,
        runId: unsafeRunId,
      })

      expect(output.errors).toHaveLength(0)
      expect(output.planPath).toContain('test_______etc_passwd')
      expect(output.planPath).not.toContain('..')
      expect(output.specPaths[0]).toContain('test_______etc_passwd')
    })
  })
})
