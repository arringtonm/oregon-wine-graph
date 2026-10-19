// What an approval's file names and fanciful name suggest about the wine, before anyone
// looks at the label: "Audeant_Stardance_750ml_3x3_front.jpg" suggests a wine named for
// Stardance. Used to decide which labels are worth reading and to offer Jev likely
// vineyards to choose from. Hints only narrow the search; the label itself is the evidence.
import type { GraphNode } from '../../src/data/schema'
import { normalise } from '../discover/owhaMatch'
import type { ColaForm } from './registry'

// Words in label file names and fanciful names that say nothing about where the fruit grew
const NOISE = new Set(
  `front back final label labels neck strip collar keg capsule rev revised version new old copy print proof
  approved cola ttb ml l oz in inch inches x mm cm jpg jpeg png pdf tif tiff gif and the of a de la le du des
  wine wines red white rose rosé blush sparkling brut extra dry sec demi doux bubbles still dessert port late harvest ice
  bottle magnum half size small large mag cmyk rgb web hi res high low lowres hires outline outlined fold
  pinot noir gris grigio blanc chardonnay riesling gewurztraminer gewürztraminer syrah viognier tempranillo
  cabernet sauvignon franc merlot malbec grenache gamay mourvedre zinfandel sangiovese barbera nebbiolo auxerrois
  melon muscat dolcetto teroldego lagrein marechal foch albarino albariño blend cuvee cuvée reserve reserva
  vintage nv estate vineyard vineyards vyd vyds block blocks clone clones selection single
  willamette valley oregon or dundee hills eola amity chehalem mountains ribbon ridge yamhill carlton mcminnville
  van duzer corridor tualatin laurelwood district southern rogue applegate umpqua elkton columbia gorge walla
  rocks milton freewater douglas county red hill lower long tom mt pisgah polk`.split(/\s+/),
)

// Words that make a vineyard more likely to be named on the label
const VINEYARD_WORDS = /\b(vineyards?|vyds?|block|clone|estate|single)\b/

const words = (text: string) =>
  normalise(text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\.\w{3,4}$/, ''))
    .split(' ')
    .filter(Boolean)

export interface Hints {
  // Distinctive words left once brand, sizes, varieties, places and file jargon are removed
  words: string[]
  // A vineyard word appears in a file name or the fanciful name
  vineyardWord: boolean
  // Existing vineyards whose distinctive name appears in the hints
  vineyards: string[]
}

// The distinctive part of a vineyard's name: "Luminous Hills Vineyard" -> "luminous hills"
export function vineyardKey(name: string): string {
  return normalise(name.replace(/\(.*?\)/g, ''))
    .split(' ')
    .filter((word) => !['the', 'vineyard', 'vineyards', 'estate', 'vyd'].includes(word))
    .join(' ')
}

export function hintsFor(form: ColaForm, brandNames: string[], vineyards: GraphNode[]): Hints {
  const brandWords = new Set(brandNames.flatMap(words))
  const sources = [form.fanciful, ...form.images.map((image) => image.filename)]
  const all = sources.flatMap(words)
  const text = ` ${all.join(' ')} `
  const distinctive = [
    ...new Set(all.filter((word) => !NOISE.has(word) && !brandWords.has(word) && !/\d/.test(word) && word.length > 1)),
  ]
  return {
    words: distinctive,
    vineyardWord: sources.some((source) => VINEYARD_WORDS.test(words(source).join(' '))),
    vineyards: vineyards
      .filter((vineyard) => {
        const key = vineyardKey(vineyard.name)
        // Only a hint: Jev still confirms the label names it
        return key.length >= 4 && text.includes(` ${key} `)
      })
      .map((vineyard) => vineyard.id),
  }
}

// Reading order: labels that name a known vineyard, then ones with a vineyard word, then ones
// with some other distinctive word (often a vineyard or a wine's own name); plain labels last
export function priority(hints: Hints): 1 | 2 | 3 | 4 {
  if (hints.vineyards.length > 0) return 1
  if (hints.vineyardWord && hints.words.length > 0) return 2
  if (hints.words.length > 0) return 3
  return 4
}

// Approvals of the same wine in different years share their distinctive words
export function wineSignature(form: ColaForm, hints: Hints): string {
  return [normalise(form.classDesc), normalise(form.appellation), ...[...hints.words].sort()].join('|')
}
