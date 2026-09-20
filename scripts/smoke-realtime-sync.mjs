import PocketBase from 'pocketbase'
import { EventSource } from 'eventsource'

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
const opId = crypto.randomUUID()
let receiveOperation
let rejectOperation
const received = new Promise((resolve, reject) => { receiveOperation = resolve; rejectOperation = reject })
const timeout = setTimeout(() => rejectOperation(new Error('Realtime operation was not received within 8 seconds.')), 8000)

try {
  await reader.collection('lexigraph_sync_operations').subscribe('*', (event) => {
    if (event.action === 'create' && event.record.opId === opId) {
      clearTimeout(timeout)
      receiveOperation(event.record)
    }
  })
  await writer.collection('lexigraph_sync_operations').create({
    owner,
    opId,
    deviceId: crypto.randomUUID(),
    clock: `${Date.now()}:0000000001:smoke`,
    entryKey: 'smoke/realtime',
    deleted: false,
    value: { passed: true },
  })
  const record = await received
  if (record.owner !== owner || record.value?.passed !== true) throw new Error('Realtime operation payload did not match.')
  console.log('PocketBase realtime CRDT smoke test passed across two authenticated clients.')
} finally {
  clearTimeout(timeout)
  await reader.collection('lexigraph_sync_operations').unsubscribe('*')
  if (process.env.PB_DELETE_USER === '1') await writer.collection('lexigraph_users').delete(owner)
}
