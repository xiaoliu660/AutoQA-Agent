import type { Page } from 'playwright'

import type { ToolResult, ToolScreenshot } from '../tools/tool-result.js'
import { captureJpegScreenshot, writeRunScreenshot, type WriteScreenshotOptions } from '../browser/screenshot.js'

export type ImageContentBlock = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: 'image/jpeg'
    data: string
  }
}

export type TextContentBlock = {
  type: 'text'
  text: string
}

export type ContentBlock = ImageContentBlock | TextContentBlock

export type PreActionScreenshotMeta = {
  captured: boolean
  error?: string
  screenshot?: ToolScreenshot
  imageBlock?: ImageContentBlock
}

export type RunWithPreActionScreenshotOptions<TData> = {
  page: Page
  runId: string
  debug: boolean
  cwd?: string
  fileBaseName: string
  action: () => Promise<ToolResult<TData>>
  quality?: number
  writeScreenshot?: (options: WriteScreenshotOptions) => Promise<string>
}

type ArtifactMode = 'all' | 'fail' | 'none'
type ToolContextMode = 'screenshot' | 'snapshot' | 'none'
type ScreenshotTiming = 'pre' | 'post'

function getArtifactMode(): ArtifactMode | undefined {
  const raw = (process.env.AUTOQA_ARTIFACTS ?? '').trim().toLowerCase()
  if (raw === 'all' || raw === 'fail' || raw === 'none') return raw
  return undefined
}

function shouldWriteArtifacts(debug: boolean, toolOk: boolean): boolean {
  const mode = getArtifactMode()
  if (mode === 'all') return true
  if (mode === 'none') return false
  if (mode === 'fail') return !toolOk
  return !toolOk
}

function getToolContextMode(): ToolContextMode {
  const raw = (process.env.AUTOQA_TOOL_CONTEXT ?? '').trim().toLowerCase()
  if (raw === 'screenshot' || raw === 'snapshot' || raw === 'none') return raw
  return 'screenshot'
}

function getScreenshotTiming(): ScreenshotTiming {
  const raw = (process.env.AUTOQA_SCREENSHOT_TIMING ?? '').trim().toLowerCase()
  if (raw === 'pre' || raw === 'post') return raw
  return 'pre'
}

function attachScreenshot<TData>(result: ToolResult<TData>, screenshot: ToolScreenshot | undefined): ToolResult<TData> {
  if (!screenshot) return result
  return result.ok
    ? { ok: true, data: result.data, screenshot }
    : { ok: false, error: result.error, screenshot }
}

export async function runWithPreActionScreenshot<TData>(
  options: RunWithPreActionScreenshotOptions<TData>,
): Promise<{ result: ToolResult<TData>; meta: PreActionScreenshotMeta }> {
  const contextMode = getToolContextMode()
  const timing = getScreenshotTiming()

  const artifactMode = getArtifactMode()

  const canDecideBeforeAction = artifactMode === 'all'
  const shouldCaptureBeforeAction = contextMode === 'screenshot' && canDecideBeforeAction && timing === 'pre'

  const preCapture = shouldCaptureBeforeAction
    ? await captureJpegScreenshot(options.page, { quality: options.quality })
    : undefined

  const toolResult = await options.action()

  const shouldCapture = contextMode === 'screenshot' && shouldWriteArtifacts(options.debug, toolResult.ok)

  const finalCapture = shouldCapture
    ? (timing === 'pre' && preCapture ? preCapture : await captureJpegScreenshot(options.page, { quality: options.quality }))
    : undefined

  let screenshot: ToolScreenshot | undefined
  let imageBlock: ImageContentBlock | undefined
  let error: string | undefined

  if (finalCapture?.ok) {
    const base64 = finalCapture.value.buffer.toString('base64')
    imageBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64,
      },
    }

    screenshot = {
      mimeType: finalCapture.value.mimeType,
      width: finalCapture.value.width,
      height: finalCapture.value.height,
    }
  } else if (contextMode === 'screenshot' && finalCapture && !finalCapture.ok) {
    error = finalCapture.message
  }

  const shouldWrite = Boolean(finalCapture?.ok && shouldWriteArtifacts(options.debug, toolResult.ok))

  if (shouldWrite && finalCapture?.ok) {
    const writeFn = options.writeScreenshot ?? writeRunScreenshot
    try {
      const path = await writeFn({
        cwd: options.cwd,
        runId: options.runId,
        fileBaseName: options.fileBaseName,
        buffer: finalCapture.value.buffer,
      })
      screenshot = screenshot ? { ...screenshot, path } : { mimeType: 'image/jpeg', path }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      error = error ? `${error}; Failed to write screenshot: ${msg}` : `Failed to write screenshot: ${msg}`
    }
  }

  return {
    result: attachScreenshot(toolResult, screenshot),
    meta: {
      captured: Boolean(finalCapture?.ok),
      error,
      screenshot,
      imageBlock,
    },
  }
}
