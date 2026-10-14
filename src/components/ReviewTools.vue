<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { Evidence } from '../../tools/check/edit'
import { useGraph } from '../composables/useGraph'
import Chevron from './Chevron.vue'
import type { GraphEdge, GraphNode } from '../data/schema'

// Review-mode extras for one record: Jev's verdict, the evidence it read, and for a
// connection the means to correct or remove it
// `label` names the record in button names, e.g. "founded by Susan Sokol Blosser", since a
// card repeats Evidence, Edit and Remove for every connection
const props = defineProps<{ kind: 'node' | 'edge'; record: GraphNode | GraphEdge; label: string }>()
const evidenceId = computed(() => `evidence-${props.kind}-${props.record.id}`)
const validYear = (year: string) => year === '' || /^\d{4}$/.test(year)
const { state, decisionFor, loadEvidence, removeEdge, updateEdge } = useGraph()

const decision = computed(() => decisionFor(props.kind, props.record))
const VERDICT_LABELS: Record<string, string> = {
  supported: 'Sources support it',
  partial: 'Partly supported',
  conflict: 'A source disagrees',
  unsupported: 'Sources do not support it',
  unchecked: 'Sources could not be read',
}
const DETAIL_LABELS: Record<string, string> = {
  startYear: 'start year',
  endYear: 'end year',
  firstHeld: 'first held',
  lastHeld: 'last held',
}
const failing = computed(() => decision.value?.failing.map((id) => DETAIL_LABELS[id] ?? id).join(', ') ?? '')

const evidence = ref<Evidence | null>(null)
const editing = ref(false)
const confirmingRemove = ref(false)
const busy = ref(false)
const form = reactive({ role: '', startYear: '', endYear: '', ongoing: false })

async function run(work: () => Promise<void>) {
  state.reviewError = null
  busy.value = true
  try {
    await work()
  } catch (cause) {
    state.reviewError = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

function toggleEvidence() {
  if (evidence.value) evidence.value = null
  else run(async () => void (evidence.value = await loadEvidence(props.kind, props.record.id)))
}

function startEditing() {
  const edge = props.record as GraphEdge
  Object.assign(form, {
    role: edge.role ?? '',
    startYear: String(edge.startYear ?? ''),
    endYear: String(edge.endYear ?? ''),
    ongoing: edge.ongoing === true,
  })
  editing.value = true
}

function save() {
  run(async () => {
    await updateEdge(props.record.id, {
      role: form.role.trim() || null,
      startYear: form.startYear ? Number(form.startYear) : null,
      endYear: form.endYear ? Number(form.endYear) : null,
      ongoing: form.ongoing && !form.endYear ? true : null,
    })
    editing.value = false
    evidence.value = null
  })
}
</script>

<template>
  <div class="tools">
    <p class="tools__row">
      <span v-if="record.verified && record.verifiedBy === 'jev'" class="tools__chip">verified by Jev</span>
      <span v-else-if="record.verified && record.verifiedBy === 'boundary'" class="tools__chip">verified by boundary</span>
      <span v-else-if="record.verified" class="tools__chip">verified</span>
      <span v-else-if="decision" class="tools__chip" :class="`tools__chip--${decision.verdict}`">
        {{ VERDICT_LABELS[decision.verdict] }}<template v-if="failing">: {{ failing }}</template>
      </span>
      <span v-else class="tools__chip">not checked</span>
      <button
        type="button"
        :aria-expanded="!!evidence"
        :aria-controls="evidenceId"
        :aria-label="`Evidence for ${label}`"
        :disabled="busy"
        @click="toggleEvidence"
      >
        Evidence<Chevron />
      </button>
      <template v-if="kind === 'edge'">
        <button
          type="button"
          :aria-expanded="editing"
          :aria-label="`Edit ${label}`"
          @click="editing ? (editing = false) : startEditing()"
        >
          Edit
        </button>
        <button v-if="!confirmingRemove" type="button" :aria-label="`Remove ${label}`" @click="confirmingRemove = true">
          Remove
        </button>
        <template v-else>
          <button type="button" :disabled="busy" @click="run(() => removeEdge(record.id))">Confirm remove</button>
          <button type="button" @click="confirmingRemove = false">Keep</button>
        </template>
      </template>
    </p>

    <form v-if="editing" class="tools__edit" @submit.prevent="save">
      <label>Role <input v-model="form.role" type="text" /></label>
      <label>
        From
        <input v-model="form.startYear" type="text" inputmode="numeric" placeholder="year" :aria-invalid="!validYear(form.startYear) || undefined" />
      </label>
      <label>
        Until
        <input v-model="form.endYear" type="text" inputmode="numeric" placeholder="year" :aria-invalid="!validYear(form.endYear) || undefined" />
      </label>
      <p v-if="!validYear(form.startYear) || !validYear(form.endYear)" class="tools__invalid" role="alert">Years must be four digits.</p>
      <label class="tools__check"><input v-model="form.ongoing" type="checkbox" :disabled="!!form.endYear" /> Still true</label>
      <button type="submit" :disabled="busy || !validYear(form.startYear) || !validYear(form.endYear)">
        {{ busy ? 'Saving…' : 'Save and re-check' }}
      </button>
    </form>

    <div v-if="evidence" :id="evidenceId" class="tools__evidence">
      <p><strong>Checked:</strong> {{ evidence.claims.main }}</p>
      <ul v-if="Object.keys(evidence.claims.details).length">
        <li v-for="(statement, id) in evidence.claims.details" :key="id">{{ statement }}</li>
      </ul>
      <section v-for="source in evidence.sources" :key="source.url">
        <p>
          <a :href="source.url" target="_blank" rel="noopener">
            {{ source.title }}<span class="visually-hidden"> (opens in a new tab)</span>
          </a>
          <span class="tools__status"> · {{ source.status }}</span>
        </p>
        <blockquote v-if="source.passage">{{ source.passage }}</blockquote>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tools {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.875rem;
}

.tools__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.tools__chip {
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-secondary);
}

.tools__chip--conflict,
.tools__chip--unsupported,
.tools__chip--partial {
  border-color: var(--text-primary);
  color: var(--text-primary);
  font-weight: 600;
}

button {
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.5;
}

.tools__edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.tools__edit label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tools__edit input[type='text'] {
  width: 9ch;
  padding: 2px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
}

.tools__edit label:first-child input {
  width: 18ch;
}

.tools__evidence {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.tools__evidence p,
.tools__evidence ul {
  margin: 0;
}

.tools__evidence ul {
  padding-left: 16px;
}

.tools__invalid {
  flex-basis: 100%;
  margin: 0;
  color: var(--danger);
}

.tools__status {
  color: var(--text-secondary);
}

blockquote {
  max-height: 220px;
  margin: 4px 0 0;
  padding: 6px 8px;
  overflow-y: auto;
  border-left: 2px solid var(--border-strong);
  color: var(--text-secondary);
  white-space: pre-wrap;
}

a {
  color: var(--link);
}
</style>
