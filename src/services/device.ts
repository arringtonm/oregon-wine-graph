// The device in hand, so instructions name the controls it has: touch gestures and taps on a
// phone or tablet, mouse, trackpad and keys on a computer, with ⌘ or Ctrl to match the
// system. Read once: none of it changes while the page is open. Used by the Controls guide,
// the tour and the start panel.

const query = (media: string) => window.matchMedia?.(media).matches ?? false

// No mouse or trackpad at all (a phone, or a tablet without one)
export const touchOnly = query('(pointer: coarse)') && !query('(any-pointer: fine)')

const platform =
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
export const mac = /mac|iphone|ipad/i.test(platform)

// The key that, with the scroll wheel, zooms
export const modifier = mac ? '⌘' : 'Ctrl'

// What pressing on something is called here
export const click = touchOnly ? 'tap' : 'click'
export const Click = touchOnly ? 'Tap' : 'Click'

export const deviceName = touchOnly ? 'Phone or tablet' : mac ? 'Mac' : 'Windows or Linux'
