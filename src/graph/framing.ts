// Framing a selection: the camera shows the selected record with everything it connects to.
// Their names and lines are drawn at a fixed size on screen, so they read at any zoom, and
// a hub whose connections reach across the map is framed far out. Only past the graph's own
// minimum zoom is it centred on the record instead.

export const FRAME_MIN_ZOOM = 0.08
export const FRAME_MAX_ZOOM = 1.6
export const FRAME_PADDING = 60

export interface Box {
  x1: number
  y1: number
  w: number
  h: number
}

export interface Area {
  left: number
  top: number
  width: number
  height: number
}

// The zoom and pan that frame `box` (the neighbourhood, in graph units) in `area` (the
// visible part of the canvas, in rendered pixels), and whether all of it fits.
// `focus` is the selected record's position, the centre when it doesn't fit
export function frame(box: Box, focus: { x: number; y: number }, area: Area) {
  const fitZoom = Math.min(
    (area.width - 2 * FRAME_PADDING) / Math.max(box.w, 1),
    (area.height - 2 * FRAME_PADDING) / Math.max(box.h, 1),
  )
  const zoom = Math.min(FRAME_MAX_ZOOM, Math.max(FRAME_MIN_ZOOM, fitZoom))
  const whole = fitZoom >= FRAME_MIN_ZOOM
  const centre = whole ? { x: box.x1 + box.w / 2, y: box.y1 + box.h / 2 } : focus
  return {
    zoom,
    whole,
    pan: { x: area.left + area.width / 2 - centre.x * zoom, y: area.top + area.height / 2 - centre.y * zoom },
  }
}
