/**
 * URL Scope utilities for filtering exploration results
 * Based on Tech Spec: ts-8-1-8-3-plan-scope-and-executable-specs.md#5
 */

import type { PlanConfig, ExplorationGraph } from './types.js'

/**
 * Extract relative URL (pathname + hash) from a full URL
 * Example: "https://console.polyv.net/live/index.html#/channel" → "/live/index.html#/channel"
 */
export function extractRelativeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.pathname + parsed.hash
  } catch {
    // Return the original URL if it's already relative or malformed
    // This allows relative URLs like "/path" to pass through
    return url
  }
}

/**
 * Check if a pattern matches a URL using prefix matching
 * Supports wildcard suffix (e.g., "/path*" matches "/path/anything")
 */
function matchesPattern(relativeUrl: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return relativeUrl.startsWith(prefix)
  }
  return relativeUrl === pattern
}

/**
 * Determine if a URL is in scope based on PlanConfig
 * 
 * @param url - Full URL to check
 * @param config - PlanConfig with exploreScope, includePatterns, excludePatterns
 * @returns true if URL is in scope, false otherwise
 */
export function isUrlInScope(url: string, config: PlanConfig): boolean {
  const exploreScope = config.exploreScope ?? 'site'
  
  // Validate exploreScope value
  if (exploreScope !== 'site' && exploreScope !== 'focused' && exploreScope !== 'single_page') {
    console.warn(`[url-scope] Invalid exploreScope value: ${exploreScope}, falling back to 'site'`)
    // Fall back to site mode for invalid values
  }
  
  const relativeUrl = extractRelativeUrl(url)
  const includePatterns = config.includePatterns ?? []
  const excludePatterns = config.excludePatterns ?? []

  // Domain check: ensure URL is from the same domain as baseUrl
  try {
    const urlObj = new URL(url)
    const baseUrlObj = new URL(config.baseUrl)
    if (urlObj.host !== baseUrlObj.host) {
      return false
    }
  } catch {
    // If URL parsing fails, fall through to relative URL matching
  }

  // Check exclude patterns first (blacklist) - applies to all modes
  if (excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (matchesPattern(relativeUrl, pattern)) {
        return false
      }
    }
  }

  // In 'site' mode with include patterns, apply them as additional filters
  if (exploreScope === 'site') {
    // If include patterns are specified, use them even in site mode
    if (includePatterns.length > 0) {
      for (const pattern of includePatterns) {
        if (matchesPattern(relativeUrl, pattern)) {
          return true
        }
      }
      // No include pattern matched
      return false
    }
    // No include patterns: allow all URLs from same domain
    return true
  }

  // For 'focused' and 'single_page' modes, check include patterns
  if (exploreScope === 'focused' || exploreScope === 'single_page') {
    // If no include patterns specified, derive from baseUrl
    if (includePatterns.length === 0) {
      const baseRelativeUrl = extractRelativeUrl(config.baseUrl)
      // Auto-derive: allow URLs with the same prefix as baseUrl
      return relativeUrl.startsWith(baseRelativeUrl)
    }

    // Check if URL matches at least one include pattern
    for (const pattern of includePatterns) {
      if (matchesPattern(relativeUrl, pattern)) {
        return true
      }
    }

    // No include pattern matched
    return false
  }

  // Default: in scope (should not reach here with valid exploreScope)
  return true
}

/**
 * Filter ExplorationGraph to only include in-scope pages and edges
 * 
 * @param graph - Original exploration graph
 * @param config - PlanConfig with URL scope settings
 * @returns Filtered graph with only in-scope pages and related edges
 */
export function filterGraphByScope(graph: ExplorationGraph, config: PlanConfig): ExplorationGraph {
  // Filter pages to only in-scope URLs
  const inScopePages = graph.pages.filter(page => isUrlInScope(page.url, config))
  
  // Build set of in-scope page IDs for efficient lookup
  const inScopePageIds = new Set(inScopePages.map(p => p.id))
  
  // Filter edges to only those connecting in-scope pages
  const inScopeEdges = graph.edges.filter(edge => 
    inScopePageIds.has(edge.from) && inScopePageIds.has(edge.to)
  )
  
  return {
    pages: inScopePages,
    edges: inScopeEdges,
  }
}
