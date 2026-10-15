// Which built file answers a guide address: /guides/<guide> is its own page; with a record
// open, /guides/<guide>/<id>, the record's page at /<id>. Anything deeper is left as asked,
// for the single-page fallback
export function guideAsset(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 3 && segments[0] === 'guides' ? `/${segments[2]}` : pathname
}
