import PocketBase from 'pocketbase'
import { EventSource } from 'eventsource'
import * as Automerge from '@automerge/automerge'

globalThis.EventSource = EventSource

const url = process.env.VITE_POCKETBASE_URL || 'https://pocketbase.knowledge.ovh'
const email = process.env.PB_TEST_EMAIL
const password = process.env.PB_TEST_PASSWORD
if (!email || !password) throw new Error('PB_TEST_EMAIL and PB_TEST_PASSWORD are required.')

const writer = new PocketBase(url)
const reader = new PocketBase(url)
writer.autoCancellation(false)
reader.autoCancellation(false)

await writer.collection('lexigraph_users').authWithPassword(email, password)
await reader.collection('lexigraph_users').authWithPassword(email, password)
const owner = writer.authStore.record.id
const changeId = crypto.randomUUID()
const checkpointId = crypto.randomUUID()
let document = Automerge.from({ entries: {} })
document = Automerge.change(document, (draft) => { draft.entries['smoke/realtime'] = JSON.stringify({ passed: true }) })
const change = Automerge.getLastLocalChange(document)
if (!change) throw new Error('Automerge did not produce a smoke-test change.')
let receiveOperation
let rejectOperation
const received = new Promise((resolve, reject) => { receiveOperation = resolve; rejectOperation = reject })
const timeout = setTimeout(() => rejectOperation(new Error('Realtime operation was not received within 8 seconds.')), 8000)

try {
  await reader.collection('lexigraph_automerge_changes').subscribe('*', (event) => {
    if (event.action === 'create' && event.record.changeId === changeId) {
      clearTimeout(timeout)
      receiveOperation(event.record)
    }
  })
  const changeRecord = await writer.collection('lexigraph_automerge_changes').create({
    owner,
    changeId,
    payload: Buffer.from(change).toString('base64'),
  })
  const record = await received
  if (record.owner !== owner || record.payload !== Buffer.from(change).toString('base64')) throw new Error('Realtime change payload did not match.')
  const checkpointRecord = await writer.collection('lexigraph_automerge_checkpoints').create({
    owner,
    checkpointId,
    document: Buffer.from(Automerge.save(document)).toString('base64'),
    heads: Automerge.getHeads(document),
    changeCount: 1,
  })
  const restored = Automerge.load(Buffer.from(checkpointRecord.document, 'base64'))
  if (JSON.parse(restored.entries['smoke/realtime']).passed !== true) throw new Error('Automerge checkpoint did not restore correctly.')
  await writer.collection('lexigraph_automerge_changes').delete(changeRecord.id)
  await writer.collection('lexigraph_automerge_checkpoints').delete(checkpointRecord.id)
  console.log('PocketBase realtime Automerge change and checkpoint smoke test passed across two authenticated clients.')
} finally {
  clearTimeout(timeout)
  await reader.collection('lexigraph_automerge_changes').unsubscribe('*')
  if (process.env.PB_DELETE_USER === '1') await writer.collection('lexigraph_users').delete(owner)
}
