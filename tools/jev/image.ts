// Prepares an image file for Jev, which rejects rather than resizes anything outside its
// limits: each side 280–1568 pixels and 78,400–2,458,624 pixels in all.
import sharp from 'sharp'
import type { ImageAsset } from './model'

const MIN_SIDE = 280
const MAX_SIDE = 1568
const MAX_PIXELS = 2_458_624

export async function imageAsset(path: string): Promise<ImageAsset> {
  // Some filed label images are slightly damaged; read what can be read rather than fail
  const image = sharp(path, { failOn: 'none' }).flatten({ background: '#ffffff' })
  const { width = 0, height = 0 } = await image.metadata()
  let scale = Math.min(1, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_PIXELS / (width * height)))
  // Small labels are enlarged, but never past the maximum on the other side
  scale = Math.max(scale, Math.min(MIN_SIDE / Math.min(width, height), MAX_SIDE / Math.max(width, height)))
  const [w, h] = [Math.round(width * scale), Math.round(height * scale)]
  const resized = scale === 1 ? image : image.resize(w, h)
  // A very long, thin label still falls short on one side: pad it with white
  const padX = Math.max(0, Math.ceil((MIN_SIDE - w) / 2))
  const padY = Math.max(0, Math.ceil((MIN_SIDE - h) / 2))
  const padded =
    padX || padY ? resized.extend({ left: padX, right: padX, top: padY, bottom: padY, background: '#ffffff' }) : resized
  const data = await padded.jpeg({ quality: 88 }).toBuffer()
  return { type: 'image', format: 'jpg', data_base64: data.toString('base64') }
}
