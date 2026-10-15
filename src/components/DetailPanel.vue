<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { nodeYears, reviewing, SINGULAR_TYPE, useGraph, type Connection } from '../composables/useGraph'
import { EDGE_CATEGORY_LABELS, type GraphNode } from '../data/schema'
import AddConnection from './AddConnection.vue'
import NodeGlyph from './NodeGlyph.vue'
import NodePreview from './NodePreview.vue'
import ReviewTools from './ReviewTools.vue'
import FlagButton from './FlagButton.vue'
import FlagNotes from './FlagNotes.vue'
import VerificationSummary from './VerificationSummary.vue'
import { pickInvite } from '../graph/busyPhrases'
import { factsOf } from '../services/facts'
import { flagsAvailable } from '../services/flags'

const {
  state,
  selectedNode,
  connectionsOf,
  select,
  unverified,
  setVerified,
  approveCard,
  selectNextUnverified,
  reviewQueue,
  selectNextWithVerdict,
  nearby,
  avasOf,
  nodeById,
  openFlags,
  selectNextFlagged,
} = useGraph()

// The empty panel's random button: a new label from the cellar each time the panel empties
const invite = ref(pickInvite())
watch(
  () => !selectedNode.value,
  (empty) => empty && (invite.value = pickInvite(invite.value)),
)

// The empty panel's "Recently viewed": the last few records viewed in this browser, kept
// across visits (state.recent), skipping any no longer in the data
const RECENT_SHOWN = 4
const recent = computed(() =>
  state.recent
    .map((id) => nodeById.value.get(id))
    .filter((node): node is GraphNode => node !== undefined)
    .slice(0, RECENT_SHOWN),
)

// A winery's or vineyard's AVAs, by name
const avaNames = computed(() =>
  selectedNode.value ? avasOf(selectedNode.value.id).map((id) => nodeById.value.get(id)?.name.replace(/ AVA$/, '') ?? id) : [],
)

// Oral history interviews from the Oregon Wine History Archive, labelled for the panel:
// "Interview, August 2007 · 37 min", or the collection's own name for a winery
const interviews = computed(() => {
  const node = selectedNode.value
  const list = node && 'interviews' in node ? (node.interviews ?? []) : []
  return list.map((interview) => {
    const when = interview.date
      ? new Date(`${interview.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : ''
    const what = interview.url.includes('/interviews/') ? 'Interview' : interview.title
    return {
      url: interview.url,
      label: [what, when].filter(Boolean).join(', ') + (interview.minutes ? ` · ${interview.minutes} min` : ''),
    }
  })
})

const neighbours = computed(() => (selectedNode.value ? nearby(selectedNode.value.id) : []))
const address = computed(() =>
  selectedNode.value && 'address' in selectedNode.value ? selectedNode.value.address : undefined,
)

const QUEUE_LABELS: Record<string, string> = {
  conflict: 'Source disagrees',
  partial: 'Partly supported',
  unsupported: 'Unsupported',
  unchecked: 'Unreadable source',
  supported: 'Supported',
  'not checked': 'Not checked',
}

// When a record closes (Escape, ×, a tap on the graph), focus that was in the panel, or was
// lost with it, moves to the empty panel's heading; on smaller screens, where the panel
// hides, to the graph
const panel = ref<HTMLElement>()
const emptyHeading = ref<HTMLHeadingElement>()
watch(
  () => !selectedNode.value,
  async (closed) => {
    if (!closed) return
    await nextTick()
    const focus = document.activeElement
    if (focus && focus !== document.body && !panel.value?.contains(focus)) return
    const target = panel.value?.offsetParent ? emptyHeading.value : document.querySelector<HTMLElement>('.graph-canvas__stage')
    target?.focus({ preventScroll: true })
  },
)

// Selections made from a list, a link or search move keyboard focus to the node's heading,
// so a screen reader reads the new details from the top
const heading = ref<HTMLHeadingElement>()
watch(
  () => state.focusDetailsRequest,
  async () => {
    await nextTick()
    heading.value?.focus()
  },
)

const groups = computed(() => (selectedNode.value ? connectionsOf(selectedNode.value.id) : []))

// Within a section, each connection leads with the other record's name and follows it with
// the verb: "Adelsheim Vineyard (founded)". A verb shared by three or more connections is
// written once instead, as a subheading over them ("Supplies fruit to", then the wineries);
// those lists come after the single connections, so subheadings never sit between them
const VERB_HEADING_MIN = 3
interface ConnectionBlock {
  heading?: string
  connections: Connection[]
}
// What follows the name, in brackets: the verb (unless a subheading gives it), the edge's
// own detail and its years. "founded, from 1971"; "employed: vineyard manager, 1999–present"
function aboutConnection(block: ConnectionBlock, verb: string, detail?: string, years?: string): string {
  const what = block.heading ? detail : [verb, detail].filter(Boolean).join(': ')
  return [what, years].filter(Boolean).join(', ')
}

function blocksOf(connections: Connection[]): ConnectionBlock[] {
  const byVerb = new Map<string, Connection[]>()
  for (const connection of connections) byVerb.set(connection.verb, [...(byVerb.get(connection.verb) ?? []), connection])
  const single: Connection[] = []
  const headed: ConnectionBlock[] = []
  for (const [verb, list] of byVerb) {
    if (list.length >= VERB_HEADING_MIN) headed.push({ heading: verb.charAt(0).toUpperCase() + verb.slice(1), connections: list })
    else single.push(...list)
  }
  return [...(single.length ? [{ connections: single }] : []), ...headed]
}
const unverifiedOnCard = computed(
  () =>
    (selectedNode.value && !selectedNode.value.verified ? 1 : 0) +
    groups.value.flatMap((group) => group.connections).filter(({ edge }) => !edge.verified).length,
)
const facts = computed(() =>
  selectedNode.value
    ? [nodeYears(selectedNode.value), selectedNode.value.place, selectedNode.value.outsideOregon && 'outside Oregon']
        .filter(Boolean)
        .join(' · ')
    : '',
)
// Every fact on the card, for its verification note and its flag
const cardFacts = computed(() => (selectedNode.value ? factsOf(selectedNode.value, groups.value) : []))

// Flagging needs somewhere to send flags: Firestore, or the dev server's local file
const canFlag = flagsAvailable()
</script>

<template>
  <section id="details" ref="panel" class="detail" :class="{ 'detail--empty': !selectedNode }" aria-label="Details" tabindex="-1">
    <div v-if="reviewing" class="detail__review">
      <p>
        <strong>Review</strong>
        {{ unverified.nodes }} nodes and {{ unverified.edges }} connections unverified
      </p>
      <button
        type="button"
        :disabled="unverified.nodes + unverified.edges === 0"
        @click="selectNextUnverified"
      >
        Next unverified
      </button>
      <button
        v-for="group in reviewQueue"
        :key="group.verdict"
        type="button"
        @click="selectNextWithVerdict(group.verdict)"
      >
        {{ QUEUE_LABELS[group.verdict] }} {{ group.nodeIds.length }}
      </button>
      <button v-if="openFlags.length" type="button" class="detail__flagged" @click="selectNextFlagged">
        Flagged {{ openFlags.length }}
      </button>
      <button v-if="selectedNode && unverifiedOnCard > 0" type="button" @click="approveCard(selectedNode)">
        Approve all {{ unverifiedOnCard }} on this card
      </button>
      <p v-if="state.reviewError" class="detail__error" role="alert">{{ state.reviewError }}</p>
    </div>

    <template v-if="selectedNode">
      <!-- The type's icon, the name (wrapping if long) and the close button. A direct child of
           the panel so it can stay pinned to the top of the sheet on phones and tablets -->
      <div class="detail__title">
        <NodeGlyph :type="selectedNode.type" />
        <!-- The icon shows the type; screen readers hear it after the name -->
        <h2 ref="heading" tabindex="-1">
          {{ selectedNode.name }}<span class="visually-hidden">, {{ SINGULAR_TYPE[selectedNode.type] }}</span>
        </h2>
        <button type="button" class="detail__close" aria-label="Close details" @click="select(null)">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <header>
        <p v-if="selectedNode.aka" class="detail__aka">Also known as {{ selectedNode.aka.join(', ') }}</p>
        <p v-if="facts" class="detail__facts">{{ facts }}</p>
        <p v-if="avaNames.length" class="detail__facts">
          {{ selectedNode.type === 'winery' ? 'Wine from' : 'In' }}: {{ avaNames.join(', ') }}
        </p>
        <p v-if="address" class="detail__facts">Visit: {{ address }}</p>
      </header>

      <p>{{ selectedNode.summary }}</p>
      <p v-if="reviewing" class="detail__status">
        <span v-if="!selectedNode.verified" class="detail__badge">Unverified draft</span>
        <button
          v-if="reviewing"
          type="button"
          class="detail__approve"
          :aria-label="`${selectedNode.verified ? 'Undo approval of' : 'Approve'} ${selectedNode.name}`"
          @click="setVerified('node', selectedNode, !selectedNode.verified)"
        >
          {{ selectedNode.verified ? 'Undo' : 'Approve' }}
        </button>
      </p>
      <FlagNotes v-if="reviewing" kind="node" :id="selectedNode.id" />
      <ReviewTools v-if="reviewing" :key="selectedNode.id" kind="node" :record="selectedNode" :label="selectedNode.name" />

      <section v-for="group in groups" :key="group.category">
        <h3>{{ EDGE_CATEGORY_LABELS[group.category] }}</h3>
        <template v-for="block in blocksOf(group.connections)" :key="block.heading ?? ''">
          <h4 v-if="block.heading" class="detail__verb">{{ block.heading }}</h4>
          <ul>
            <li v-for="{ edge, other, label, verb, detail, years } in block.connections" :key="edge.id">
              <!-- The name and what follows it read as one line of text, wrapping as a sentence does -->
              <span class="detail__entry">
                <NodePreview :node="other">
                  <!-- No space between icon and name: the icon's margin makes the gap, so the
                       underline starts at the name -->
                  <button type="button" class="detail__link" @click="select(other.id, { focusDetails: true })">
                    <NodeGlyph :type="other.type" />{{ other.name }}
                  </button>
                </NodePreview>
                <span v-if="aboutConnection(block, verb, detail, years)" class="detail__role">
                  ({{ aboutConnection(block, verb, detail, years) }})
                </span>
              </span>
              <!-- Viewers find each connection's sources in the verification note at the foot -->
              <span v-if="reviewing" class="detail__refs">
                <template v-for="(source, index) in edge.sources" :key="source.title">
                  <a v-if="source.url" :href="source.url" :title="source.title" target="_blank" rel="noopener">
                    <span aria-hidden="true">[{{ index + 1 }}]</span>
                    <span class="visually-hidden">Source {{ index + 1 }}: {{ source.title }} (opens in a new tab)</span>
                  </a>
                  <span v-else :title="source.title">
                    <span aria-hidden="true">[{{ index + 1 }}]</span>
                    <span class="visually-hidden">Source {{ index + 1 }}: {{ source.title }}</span>
                  </span>
                </template>
              </span>
              <button
                v-if="reviewing"
                type="button"
                class="detail__approve"
                :aria-label="`${edge.verified ? 'Undo approval of' : 'Approve'} ${label} ${other.name}`"
                @click="setVerified('edge', edge, !edge.verified)"
              >
                {{ edge.verified ? 'Undo' : 'Approve' }}
              </button>
              <span v-if="edge.note" class="detail__note">{{ edge.note }}</span>
              <FlagNotes v-if="reviewing" kind="edge" :id="edge.id" />
              <ReviewTools v-if="reviewing" :key="edge.id" kind="edge" :record="edge" :label="`${label} ${other.name}`" />
            </li>
          </ul>
        </template>
      </section>
      <p v-if="groups.length === 0" class="detail__facts">No connections recorded yet.</p>

      <section v-if="interviews.length">
        <h3>Oral history</h3>
        <ul>
          <li v-for="interview in interviews" :key="interview.url">
            <a :href="interview.url" target="_blank" rel="noopener">
              {{ interview.label }}<span class="visually-hidden"> (Oregon Wine History Archive, opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </section>

      <section v-if="neighbours.length">
        <h3>Nearby tasting rooms</h3>
        <ul>
          <li v-for="{ node, km } in neighbours" :key="node.id">
            <NodePreview :node="node">
              <button type="button" class="detail__link" @click="select(node.id, { focusDetails: true })">
                <NodeGlyph :type="node.type" />
                {{ node.name }}
              </button>
            </NodePreview>
            <span class="detail__years">{{ (km * 0.621371).toFixed(1) }} mi</span>
          </li>
        </ul>
      </section>

      <AddConnection v-if="reviewing" :key="selectedNode.id" :node="selectedNode" />

      <section>
        <h3>Sources</h3>
        <ul>
          <li v-for="source in selectedNode.sources" :key="source.title">
            <a v-if="source.url" :href="source.url" target="_blank" rel="noopener">
              {{ source.title }}<span class="visually-hidden"> (opens in a new tab)</span>
            </a>
            <span v-else>{{ source.title }}</span>
          </li>
        </ul>
      </section>

      <footer class="detail__checks">
        <VerificationSummary :facts="cardFacts" :name="selectedNode.name" />
        <FlagButton v-if="canFlag" :facts="cardFacts" />
      </footer>
    </template>

    <template v-else>
      <h2 ref="emptyHeading" tabindex="-1">Oregon wine, connected</h2>
      <p>
        The people, wineries and vineyards of Oregon wine: who founded what, who made the wine, where
        the fruit came from and how its people are related.
      </p>
      <h3>Ways to explore</h3>
      <ul class="detail__ways">
        <li><strong>Click</strong> a person or place on the graph to open it.</li>
        <li><strong>Search</strong> for a name you know, like Eyrie or David Lett.</li>
        <li><strong>Ask</strong> a question, such as “Who founded Adelsheim Vineyard?”</li>
        <li><strong>Filter</strong> by people, wineries, kinds of connection or AVA.</li>
        <li><strong>List view</strong> shows everything by name, for reading rather than roaming.</li>
      </ul>
      <p class="detail__facts">
        Scroll with two fingers to move around and pinch to zoom. Press ? for all the controls.
      </p>
      <p class="detail__random-lead">Or pick one at random:</p>
      <!-- Its name starts with what it shows, so speech control can say the label -->
      <button
        type="button"
        class="detail__random"
        :aria-label="`${invite}: a random person, winery, vineyard or organization`"
        @click="state.randomRequest++"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="3" width="14" height="14" rx="3.2" />
          <circle cx="7" cy="7" r="1.25" />
          <circle cx="13" cy="7" r="1.25" />
          <circle cx="10" cy="10" r="1.25" />
          <circle cx="7" cy="13" r="1.25" />
          <circle cx="13" cy="13" r="1.25" />
        </svg>
        {{ invite }}
      </button>

      <!-- The last few records viewed, at the foot of the panel -->
      <section v-if="recent.length" class="detail__recent">
        <h3>Recently viewed</h3>
        <ul>
          <li v-for="node in recent" :key="node.id">
            <NodePreview :node="node">
              <button type="button" class="detail__link" @click="select(node.id, { focusDetails: true })">
                <NodeGlyph :type="node.type" />
                {{ node.name }}
              </button>
            </NodePreview>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  /* Scrolls up and down only. Where the system shows scrollbars all the time, room is kept
     for one, so the content doesn't jump sideways when a long record needs it */
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-gutter: stable;
  border-left: 1px solid var(--border);
  /* A little of the graph shows through, blurred, so the panel reads as floating over it */
  background: var(--frost);
  -webkit-backdrop-filter: var(--frost-blur);
  backdrop-filter: var(--frost-blur);
}

/* Tablet and smaller: a sheet over the bottom of the graph, only when a node is selected */
@media (max-width: 1024px) {
  .detail {
    position: absolute;
    z-index: 2;
    right: 0;
    bottom: 0;
    left: 0;
    max-height: 45%;
    border-top: 1px solid var(--border);
    border-left: 0;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
  }

  .detail--empty {
    display: none;
  }

  /* The name and close button stay pinned to the top of the sheet while the rest scrolls
     under them: full bleed over the panel's padding, and opaque so text below doesn't
     show through */
  .detail__title {
    position: sticky;
    z-index: 1;
    top: -16px;
    /* Takes in the panel's gap above when the review tools come first */
    margin: -12px -16px 0;
    padding: 16px 16px 8px;
    background: var(--surface-raised);
    /* The shadow above fills the sliver that rounding can leave between the row and the
       sheet's top edge, so scrolled text never peeks over it */
    box-shadow:
      0 -4px 0 var(--surface-raised),
      0 1px 0 var(--border);
  }

  .detail__title:first-child {
    margin-top: -16px;
  }
}

/* The icon, name and close button share the first row; the name wraps beside them */
.detail__title {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.5rem;
}

/* Centred on the name's first line */
.detail__title .node-glyph {
  width: 20px;
  height: 20px;
  margin-top: calc((1.75rem - 20px) / 2);
}

/* Tuck the lines about the record up under the name, against the panel's own gap */
.detail__title + header {
  margin-top: calc(0.2rem - 12px);
}

h2 {
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.25;
}

/* A record's name, in the header title's serif (App.vue) */
.detail__title h2 {
  font-family: 'Fraunces Variable', Georgia, serif;
  font-weight: 650;
  font-optical-sizing: auto;
  letter-spacing: -0.005em;
}

/* Each section stands apart: 26px above its heading (the panel's 12px gap and this) */
h3 {
  margin: 14px 0 6px;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

p {
  margin: 0;
}

ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
}

.detail__close {
  width: 28px;
  height: 28px;
  margin: calc((1.75rem - 28px) / 2) -4px 0 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text-secondary);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.detail__close:hover {
  background: var(--wash);
}

.detail__aka,
.detail__facts,
.detail__verb,
.detail__years {
  color: var(--text-secondary);
}

/* The verb a list of connections shares, under the section's heading */
.detail__verb {
  margin: 0.4rem 0 0.3rem;
  font-size: 0.9375rem;
  font-weight: 600;
}

/* A subheaded list after other connections stands a little apart from them */
ul + .detail__verb {
  margin-top: 1.2rem;
}

/* What follows a connection's name: "(founded, from 1971)" */
/* Inline text rather than a flex row, so the brackets follow the name and wrap under it */
.detail__entry {
  flex: 0 1 auto;
  min-width: 0;
}

/* Lined up on the name's text, not its icon, so the brackets share the name's baseline */
.detail__entry .detail__link {
  display: inline-block;
}

.detail__entry .detail__link .node-glyph {
  display: inline-block;
  margin-right: 6px;
  vertical-align: -0.15em;
}

/* Secondary, so no larger than the note beneath */
.detail__role {
  margin-left: 0.3em;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.detail__aka,
.detail__facts {
  margin-top: 2px;
  font-size: 0.9375rem;
}

.detail__years {
  font-variant-numeric: tabular-nums;
}

.detail__note {
  flex-basis: 100%;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.detail__review {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  font-size: 0.9375rem;
}

.detail__review p {
  flex-basis: 100%;
}

.detail__review button,
.detail__approve {
  padding: 3px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  cursor: pointer;
}

.detail__review button:disabled {
  cursor: default;
  opacity: 0.5;
}

.detail__error {
  color: var(--danger);
}

.detail__status {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* The empty panel's ways to start: a short list, each led by its action */
.detail__ways {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 1.1rem;
  list-style: disc;
}

.detail__ways li {
  display: list-item;
}

.detail__ways strong {
  font-weight: 600;
}

.detail__random-lead {
  margin-top: 0.4rem;
}

/* The empty panel's invitation to roll a random record: the panel's full width, the dice
   large beside a short label */
.detail__random {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  font-size: 1.0625rem;
  text-align: left;
  cursor: pointer;
}

.detail__random:hover {
  background: var(--wash);
}

.detail__random svg {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}

.detail__random circle {
  fill: currentColor;
  stroke: none;
}

/* Recently viewed sits at the foot of the empty panel */
.detail__recent {
  margin-top: auto;
}

.detail__checks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  margin: 0 -0.4rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.detail__refs {
  display: inline-flex;
  gap: 4px;
  font-size: 0.875rem;
}

.detail__badge {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.detail__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-primary);
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-decoration: underline;
  text-decoration-color: var(--border-strong);
  text-underline-offset: 3px;
  cursor: pointer;
}

.detail__link:hover {
  text-decoration-color: currentColor;
}

a {
  color: var(--accent);
}
</style>
