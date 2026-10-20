// A cited label approval as the record check sees it: the form's fields as text, and the
// label images, which Jev reads directly (the vineyard is usually named only on the label).
import type { CachedSource } from '../check/fetchSources'
import { hasForm, Registry, ttbIdOf, type ColaForm } from './registry'

export function formText(form: ColaForm, withImages = true): string {
  const lines = [
    `US federal certificate of label approval (TTB COLA ${form.ttbId}), issued ${form.issued}. Status: ${form.status}.`,
    `Brand name: ${form.brand}.`,
    form.fanciful && `Fanciful name: ${form.fanciful}.`,
    form.varietals && `Grape varietals: ${form.varietals}.`,
    form.appellation && `Wine appellation: ${form.appellation}.`,
    form.vintage && `Vintage: ${form.vintage}.`,
    `Class: ${form.classDesc}.`,
    `Filed by the permit holder: ${form.applicant}.`,
    withImages && 'The approved label images are attached.',
  ]
  return lines.filter(Boolean).join('\n')
}

let registry: Registry | null = null

export async function fetchColaSource(url: string): Promise<CachedSource> {
  const result = (status: CachedSource['status'], text = '', images?: string[], detail?: string): CachedSource => ({
    url,
    status,
    fetchedAt: new Date().toISOString(),
    ...(detail ? { detail } : {}),
    text,
    ...(images ? { images } : {}),
  })
  const ttbId = ttbIdOf(url)
  // Paper filings and older records have no form or label images
  if (!ttbId || !hasForm(ttbId)) return result('not-text', '', undefined, 'no printable form')
  registry ??= new Registry()
  try {
    const form = await registry.form(ttbId)
    // Labels read by cola:read are already on disk; an approval cited only for its form (an
    // AVA from the appellation box) is checked on the form's text, with no images to fetch
    const images = registry.cachedImages(ttbId, form)
    return result('ok', formText(form, images.length > 0), images.length > 0 ? images : undefined)
  } catch (error) {
    return result('error', '', undefined, error instanceof Error ? error.message : String(error))
  }
}
