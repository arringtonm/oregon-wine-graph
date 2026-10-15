// The site's public version, from package.json's: "1.0.0" reads "v1.00", "1.12.0" "v1.12".
// Releases bump the minor number; see docs/DEVELOPMENT.md, "Versions"
export function siteVersion(packageVersion: string): string {
  const [major, minor] = packageVersion.split('.').map(Number)
  if (!Number.isInteger(major) || !Number.isInteger(minor)) throw new Error(`Not a version: ${packageVersion}`)
  return `v${major}.${String(minor).padStart(2, '0')}`
}
