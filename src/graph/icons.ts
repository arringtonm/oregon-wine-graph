import type { NodeType } from '../data/schema'

// One silhouette per node type, drawn for this project in a 24 by 24 box. The same shapes
// are the nodes on the graph (as images) and the glyphs in the legend, lists and history,
// so a shape learned in one place reads the same everywhere.
export const ICONS: Record<NodeType, string> = {
  // Head and shoulders
  person: '<circle cx="12" cy="7.2" r="4.6"/><path d="M3.2 22c0-5.2 3.9-8.8 8.8-8.8s8.8 3.6 8.8 8.8z"/>',
  // Wine glass
  winery:
    '<path d="M6.6 2h10.8l.7 5.4c.5 3.7-2.2 6.8-5.7 7.2V19h3.8v2.6H7.8V19h3.8v-4.4C8.1 14.2 5.4 11.1 5.9 7.4z"/>',
  // Grape cluster with its stem and a leaf
  vineyard:
    '<path d="M12 6.2V2.2M12 4.4c1.6-2.2 4.6-2.8 7-1.6-1.8 2.1-4.6 2.6-7 1.6z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
    '<circle cx="7.2" cy="9.4" r="2.7"/><circle cx="12" cy="9.4" r="2.7"/><circle cx="16.8" cy="9.4" r="2.7"/>' +
    '<circle cx="9.6" cy="13.6" r="2.7"/><circle cx="14.4" cy="13.6" r="2.7"/><circle cx="12" cy="17.8" r="2.7"/>',
  // Building with windows and a door
  organization:
    '<path fill-rule="evenodd" d="M4 22V5.4L12 2l8 3.4V22zM7 8h2.4v2.4H7zm3.8 0h2.4v2.4h-2.4zm3.8 0H17v2.4h-2.4zM7 12.4h2.4v2.4H7zm3.8 0h2.4v2.4h-2.4zm3.8 0H17v2.4h-2.4zM10.3 22v-4.2h3.4V22z"/>',
  // Calendar page with a star
  event:
    '<path fill-rule="evenodd" d="M4.2 4.6h15.6c.7 0 1.2.5 1.2 1.2v15c0 .7-.5 1.2-1.2 1.2H4.2c-.7 0-1.2-.5-1.2-1.2v-15c0-.7.5-1.2 1.2-1.2zM12 9.6l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"/>' +
    '<rect x="6.6" y="2" width="2.2" height="4.6" rx="1"/><rect x="15.2" y="2" width="2.2" height="4.6" rx="1"/>',
  // Map pin
  ava: '<path fill-rule="evenodd" d="M12 1.8a7.4 7.4 0 0 0-7.4 7.4c0 5.4 7.4 13 7.4 13s7.4-7.6 7.4-13A7.4 7.4 0 0 0 12 1.8zm0 4.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>',
}

// The silhouette as an image for the graph, in the given colour. People and places outside
// Oregon get a dashed ring around a slightly smaller silhouette, where an outline used to be.
// The image declares a large size because Cytoscape rasterises it at that size.
export function iconDataUri(type: NodeType, colour: string, { outside = false } = {}): string {
  const shape = ICONS[type]
  const body = outside
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${colour}" stroke-width="1.1" stroke-dasharray="2.4 1.8"/>` +
      `<g transform="translate(12 12) scale(0.68) translate(-12 -12)">${shape}</g>`
    : shape
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256" fill="${colour}" color="${colour}">${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
