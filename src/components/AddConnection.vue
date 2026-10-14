<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { REVIEW_THRESHOLD, type Proposal, type ProposalField } from '../../tools/jev/parseConnection'
import { useGraph } from '../composables/useGraph'
import {
  EDGE_RULES,
  NODE_TYPES,
  allowedEdgeTypes,
  type EdgeType,
  type GraphNode,
  type NodeType,
} from '../data/schema'

const props = defineProps<{ node: GraphNode }>()
const { nodeById, parseConnection, addConnection } = useGraph()

const text = ref('')
const sourceUrl = ref('')
const busy = ref(false)
const error = ref('')
const saved = ref('')
const proposal = ref<Proposal | null>(null)

// The proposal as the person may edit it before saving
const draft = reactive({
  otherId: '',
  type: 'family' as EdgeType,
  nodeIsSource: true,
  role: '',
  startYear: '',
  endYear: '',
  ongoing: false,
  // Used when the other party is a node that saving will create
  newName: '',
  newType: 'person' as NodeType,
})

const creating = computed(() => !!proposal.value?.newNode && draft.otherId === proposal.value.newNode.id)
const other = computed(() =>
  creating.value
    ? { id: draft.otherId, name: draft.newName.trim(), type: draft.newType }
    : nodeById.value.get(draft.otherId),
)
const source = computed(() => (draft.nodeIsSource ? props.node : other.value))
const target = computed(() => (draft.nodeIsSource ? other.value : props.node))
// Every type the rules allow between the two nodes, in either direction
const typeOptions = computed(() => {
  if (!other.value) return []
  return [
    ...new Set([
      ...allowedEdgeTypes(props.node.type, other.value.type),
      ...allowedEdgeTypes(other.value.type, props.node.type),
    ]),
  ]
})
const directionAllowed = computed(
  () => !!source.value && !!target.value && allowedEdgeTypes(source.value.type, target.value.type).includes(draft.type),
)
const yearsValid = computed(() =>
  [draft.startYear, draft.endYear].every((year) => year === '' || /^\d{4}$/.test(String(year))),
)

function unsure(field: ProposalField): boolean {
  const confidence = proposal.value?.confidence[field]
  return confidence !== undefined && confidence < REVIEW_THRESHOLD
}

async function read() {
  error.value = saved.value = ''
  proposal.value = null
  busy.value = true
  try {
    const result = await parseConnection(text.value, props.node.id)
    proposal.value = result
    if (result.edge) {
      draft.nodeIsSource = result.edge.source === props.node.id
      draft.otherId = draft.nodeIsSource ? result.edge.target : result.edge.source
      draft.type = result.edge.type
      draft.role = result.edge.role ?? ''
      draft.startYear = String(result.edge.startYear ?? '')
      draft.endYear = String(result.edge.endYear ?? '')
      draft.ongoing = result.edge.ongoing === true
      draft.newName = result.newNode?.name ?? ''
      draft.newType = result.newNode?.type ?? 'person'
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function save() {
  if (!source.value || !target.value) return
  error.value = ''
  busy.value = true
  try {
    const added = await addConnection(
      {
        source: source.value.id,
        target: target.value.id,
        type: draft.type,
        ...(draft.role.trim() ? { role: draft.role.trim() } : {}),
        ...(draft.startYear ? { startYear: Number(draft.startYear) } : {}),
        ...(draft.endYear ? { endYear: Number(draft.endYear) } : {}),
        ...(draft.ongoing && !draft.endYear ? { ongoing: true } : {}),
      },
      creating.value ? { id: draft.otherId, name: draft.newName, type: draft.newType } : null,
      text.value,
      sourceUrl.value,
    )
    saved.value = added.node
      ? `Saved: new ${added.node.type} “${added.node.name}” and its connection, both unverified.`
      : `Saved as an unverified connection (${added.edge.id}).`
    proposal.value = null
    text.value = sourceUrl.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="add">
    <h3>Add new connection</h3>
    <form @submit.prevent="read">
      <textarea
        v-model="text"
        rows="2"
        :placeholder="`Say it in a sentence, e.g. “${node.name} founded …”`"
        aria-label="Describe the connection in a sentence"
      ></textarea>
      <input v-model="sourceUrl" type="url" placeholder="Source URL (optional)" aria-label="Source URL (optional)" />
      <button type="submit" :disabled="busy || !text.trim()">{{ busy && !proposal ? 'Reading…' : 'Read it' }}</button>
    </form>

    <ul v-if="proposal?.problems.length" class="add__messages" role="alert">
      <li v-for="problem in proposal.problems" :key="problem">{{ problem }}</li>
    </ul>

    <form v-if="proposal?.edge" class="add__preview" @submit.prevent="save">
      <p class="add__reading">
        <strong>{{ source?.name }}</strong>
        {{ ' ' + EDGE_RULES[draft.type].label + (draft.role ? ` (${draft.role})` : '') + ' ' }}
        <strong>{{ target?.name }}</strong>
      </p>
      <p class="add__model">
        {{
          proposal.model === 'jev'
            ? 'Read by Jev. Fields marked “check” were uncertain.'
            : 'Read by the stand-in keyword rules, not Jev. Check every field.'
        }}
      </p>

      <label :class="{ 'add__field--unsure': unsure('other') }">
        <span>Other party</span>
        <select v-model="draft.otherId">
          <option v-for="candidate in proposal.candidates" :key="candidate.id" :value="candidate.id">
            {{ candidate.id === proposal.newNode?.id ? `New: ${candidate.name}` : `${candidate.name} (${candidate.type})` }}
          </option>
        </select>
      </label>
      <template v-if="creating">
        <label>
          <span>New name</span>
          <input v-model="draft.newName" type="text" />
        </label>
        <label>
          <span>New type</span>
          <select v-model="draft.newType">
            <option v-for="type in NODE_TYPES" :key="type" :value="type">{{ type }}</option>
          </select>
        </label>
      </template>
      <label :class="{ 'add__field--unsure': unsure('type') }">
        <span>Connection</span>
        <select v-model="draft.type">
          <option v-for="type in typeOptions" :key="type" :value="type">{{ EDGE_RULES[type].label }}</option>
        </select>
      </label>
      <label :class="{ 'add__field--unsure': unsure('direction') }">
        <span>Direction</span>
        <button type="button" @click="draft.nodeIsSource = !draft.nodeIsSource">Swap the two</button>
      </label>
      <label :class="{ 'add__field--unsure': unsure('role') }">
        <span>Role</span>
        <input v-model="draft.role" type="text" placeholder="e.g. spouse, co-founder" />
      </label>
      <label :class="{ 'add__field--unsure': unsure('startYear') }">
        <span>From</span>
        <input v-model="draft.startYear" type="text" inputmode="numeric" placeholder="year" />
      </label>
      <label :class="{ 'add__field--unsure': unsure('endYear') }">
        <span>Until</span>
        <input v-model="draft.endYear" type="text" inputmode="numeric" placeholder="year" />
      </label>
      <label class="add__check">
        <input v-model="draft.ongoing" type="checkbox" :disabled="!!draft.endYear" />
        Still true today
      </label>

      <ul class="add__messages">
        <li v-for="warning in proposal.warnings" :key="warning">{{ warning }}</li>
        <li v-if="!directionAllowed">
          A {{ source?.type }} cannot be “{{ EDGE_RULES[draft.type].label }}” a {{ target?.type }}. Swap the two or
          change the connection.
        </li>
        <li v-if="!yearsValid">Years must be four digits.</li>
      </ul>

      <div class="add__actions">
        <button type="submit" :disabled="busy || !directionAllowed || !yearsValid || (creating && !draft.newName.trim())">
          {{ creating ? 'Save node and connection' : 'Save connection' }}
        </button>
        <button type="button" @click="proposal = null">Cancel</button>
      </div>
    </form>

    <p v-if="error" class="add__error" role="alert">{{ error }}</p>
    <p v-if="saved" class="add__saved" role="status">{{ saved }}</p>
  </section>
</template>

<style scoped>
.add {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
}

h3 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

p {
  margin: 0;
}

textarea,
input[type='text'],
input[type='url'],
select {
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  font: inherit;
}

textarea {
  resize: vertical;
}

button {
  align-self: flex-start;
  padding: 4px 12px;
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

.add__preview {
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.add__model,
.add__saved {
  color: var(--text-secondary);
  font-size: 12px;
}

label {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

label > span {
  color: var(--text-secondary);
}

.add__field--unsure > span::after {
  content: ' · check';
  color: var(--text-primary);
  font-weight: 600;
}

.add__check {
  display: flex;
}

.add__messages {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

.add__messages:empty {
  display: none;
}

.add__actions {
  display: flex;
  gap: 8px;
}

.add__error {
  color: var(--danger);
  font-size: 13px;
}
</style>
