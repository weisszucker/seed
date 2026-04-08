import { RGBA, Renderable, type RenderContext, type RenderableOptions, type TextareaRenderable } from "@opentui/core"
import { extend } from "@opentui/react"

import { uiColors, uiLayout } from "../../theme"
import { getEditorScrollbarMetrics } from "./editorScrollbar"

type TextareaRefLike = {
  current: TextareaRenderable | null
}

type EditorScrollbarRenderableOptions = RenderableOptions<EditorScrollbarRenderable> & {
  targetRef: TextareaRefLike
}

const SCROLLBAR_GLYPH = "█"
// const SCROLLBAR_COLOR = RGBA.fromHex(uiColors.textPrimary)
const SCROLLBAR_COLOR = RGBA.fromHex(uiColors.scrollBar)

export class EditorScrollbarRenderable extends Renderable {
  private _targetRef: TextareaRefLike
  private _lastKnownScrollY = 0
  private _visibleUntil = 0
  private _hideTimer: ReturnType<typeof setTimeout> | null = null

  constructor(ctx: RenderContext, options: EditorScrollbarRenderableOptions) {
    super(ctx, options)
    this._targetRef = options.targetRef
  }

  set targetRef(value: TextareaRefLike) {
    this._targetRef = value
    this.requestRender()
  }

  onRemove(): void {
    this.clearHideTimer()
  }

  private clearHideTimer(): void {
    if (this._hideTimer !== null) {
      clearTimeout(this._hideTimer)
      this._hideTimer = null
    }
  }

  private scheduleHideRender(): void {
    this.clearHideTimer()

    const delayMs = Math.max(0, this._visibleUntil - Date.now())
    this._hideTimer = setTimeout(() => {
      this._hideTimer = null
      this.requestRender()
    }, delayMs)
  }

  private revealScrollbar(scrollY: number): void {
    this._lastKnownScrollY = scrollY
    this._visibleUntil = Date.now() + uiLayout.editorScrollbarHideDelayMs
    this.scheduleHideRender()
  }

  renderSelf(buffer: Parameters<Renderable["render"]>[0]): void {
    const target = this._targetRef.current
    if (!target) {
      this._lastKnownScrollY = 0
      this._visibleUntil = 0
      this.clearHideTimer()
      return
    }

    const scrollHeight = Math.max(target.lineCount, target.lineInfo?.lineSources.length ?? 0)
    const metrics = getEditorScrollbarMetrics({
      scrollY: target.scrollY,
      scrollHeight,
      viewportHeight: target.height,
    })

    if (!metrics || target.scrollY <= 0) {
      this._lastKnownScrollY = target.scrollY
      this._visibleUntil = 0
      this.clearHideTimer()
      return
    }

    if (target.scrollY !== this._lastKnownScrollY) {
      this.revealScrollbar(target.scrollY)
    }

    if (Date.now() >= this._visibleUntil) {
      return
    }

    for (let index = 0; index < metrics.thumbHeight; index += 1) {
      buffer.drawText(
        SCROLLBAR_GLYPH,
        this.x,
        this.y + metrics.thumbTop + index,
        SCROLLBAR_COLOR,
      )
    }
  }
}

extend({
  "editor-scrollbar": EditorScrollbarRenderable,
})
