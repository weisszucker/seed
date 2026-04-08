export type EditorScrollbarMetrics = {
  thumbTop: number
  thumbHeight: number
}

type EditorScrollbarMetricsInput = {
  scrollY: number
  scrollHeight: number
  viewportHeight: number
}

export function getEditorScrollbarMetrics({
  scrollY,
  scrollHeight,
  viewportHeight,
}: EditorScrollbarMetricsInput): EditorScrollbarMetrics | null {
  if (viewportHeight <= 0 || scrollHeight <= viewportHeight) {
    return null
  }

  const maxScroll = scrollHeight - viewportHeight
  const thumbHeight = Math.max(1, Math.ceil((viewportHeight / scrollHeight) * viewportHeight))
  const maxThumbTop = Math.max(0, viewportHeight - thumbHeight)
  const clampedScrollY = Math.min(Math.max(scrollY, 0), maxScroll)
  const thumbTop = maxScroll === 0 ? 0 : Math.round((clampedScrollY / maxScroll) * maxThumbTop)

  return {
    thumbTop,
    thumbHeight,
  }
}
