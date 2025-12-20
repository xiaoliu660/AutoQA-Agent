import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import type { Logger } from '../logging/index.js'
import type { ExplorationGraph } from './types.js'

export type CreatePlannerToolsMcpServerOptions = {
  graph: ExplorationGraph
  cwd: string
  runId: string
  logger: Logger
}

export function createPlannerToolsMcpServer(options: CreatePlannerToolsMcpServerOptions) {
  const { graph } = options

  return createSdkMcpServer({
    name: 'autoqa-planner-tools',
    version: '0.0.0',
    tools: [
      tool(
        'list_known_pages',
        'List pages discovered during exploration.',
        {},
        async () => {
          const pages = graph.pages.map((page) => ({
            id: page.id,
            url: page.url,
            title: page.title,
            depth: page.depth,
            snapshotRef: page.snapshotRef,
          }))
          return { pages }
        },
      ),
      tool(
        'get_page_snapshot',
        'Get snapshot reference and basic info for a given page id.',
        {
          pageId: z.string(),
        },
        async (args) => {
          const page = graph.pages.find((p) => p.id === args.pageId)
          if (!page) {
            return { ok: false, error: `Page not found: ${args.pageId}` }
          }

          return {
            ok: true,
            page: {
              id: page.id,
              url: page.url,
              title: page.title,
              depth: page.depth,
              snapshotRef: page.snapshotRef,
            },
          }
        },
      ),
      tool(
        'propose_test_cases_for_page',
        'Return page info and optional notes to help you design test cases. This tool does not itself decide or create TestCasePlan objects.',
        {
          pageId: z.string(),
          notes: z.string().optional(),
        },
        async (args) => {
          const page = graph.pages.find((p) => p.id === args.pageId)

          if (!page) {
            return {
              ok: false,
              error: `Page not found: ${args.pageId}`,
            }
          }

          return {
            ok: true,
            page: {
              id: page.id,
              url: page.url,
              title: page.title,
              depth: page.depth,
              snapshotRef: page.snapshotRef,
            },
            notes: args.notes,
          }
        },
      ),
    ],
  })
}
