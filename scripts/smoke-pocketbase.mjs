import PocketBase from 'pocketbase'

const url = process.env.VITE_POCKETBASE_URL || 'https://pocketbase.knowledge.ovh'
const pb = new PocketBase(url)
pb.autoCancellation(false)
const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
const email = process.env.PB_TEST_EMAIL || `lexigraph-smoke-${unique}@example.com`
const password = process.env.PB_TEST_PASSWORD || `Smoke-${crypto.randomUUID()}!`
const keepAccount = process.env.PB_SMOKE_KEEP === '1'
let userId = ''

try {
  if (process.env.PB_VERIFY_REQUIRED === '1') {
    const user = await pb.collection('lexigraph_users').create({
      email, password, passwordConfirm: password, name: 'Verification smoke test',
    })
    await pb.collection('lexigraph_users').requestVerification(email)
    let rejected = false
    try {
      await pb.collection('lexigraph_users').authWithPassword(email, password)
    } catch (error) {
      rejected = error?.status === 400 || error?.status === 403
    }
    if (!rejected) throw new Error('Unverified password authentication was not blocked.')
    console.log(JSON.stringify({ message: 'Email verification requirement passed.', userId: user.id, email }))
    process.exit(0)
  }
  if (process.env.PB_DELETE_USER === '1') {
    const auth = await pb.collection('lexigraph_users').authWithPassword(email, password)
    await pb.collection('lexigraph_users').delete(auth.record.id)
    console.log('PocketBase temporary test account deleted.')
    process.exit(0)
  }
  if (process.env.PB_SYNC_EXISTING === '1') {
    await pb.collection('lexigraph_users').authWithPassword(email, password)
    const result = await pb.collection('lexigraph_workspaces').getList(1, 1)
    if (!result.items[0]) throw new Error('The authenticated test account has no workspace.')
    const record = result.items[0]
    await pb.collection('lexigraph_workspaces').update(record.id, {
      owner: pb.authStore.record.id,
      data: record.data,
      clientUpdatedAt: new Date().toISOString(),
      schemaVersion: 1,
    })
    console.log('Existing PocketBase account sync passed.')
    process.exit(0)
  }
  if (process.env.PB_INSPECT_EXISTING === '1') {
    await pb.collection('lexigraph_users').authWithPassword(email, password)
    const result = await pb.collection('lexigraph_workspaces').getList(1, 1)
    const record = result.items[0]
    if (!record) throw new Error('The authenticated test account has no workspace.')
    console.log(JSON.stringify({
      clientUpdatedAt: record.clientUpdatedAt,
      senses: record.data?.senses?.length ?? 0,
      graphs: record.data?.graphs?.map((graph) => ({ name: graph.name, nodes: graph.nodes?.length ?? 0, edges: graph.edges?.length ?? 0 })) ?? [],
    }))
    process.exit(0)
  }
  const unauthenticated = new PocketBase(url)
  let blocked = false
  try {
    await unauthenticated.collection('lexigraph_workspaces').create({
      owner: 'invalidownerid', data: {}, clientUpdatedAt: new Date().toISOString(), schemaVersion: 1,
    })
  } catch (error) {
    blocked = error?.status === 400 || error?.status === 403
  }
  if (!blocked) throw new Error('Unauthenticated workspace creation was not blocked.')

  const user = await pb.collection('lexigraph_users').create({
    email, password, passwordConfirm: password, name: 'Smoke test',
  })
  userId = user.id
  await pb.collection('lexigraph_users').authWithPassword(email, password)
  const now = Date.now()
  const graphId = crypto.randomUUID()
  const workspace = await pb.collection('lexigraph_workspaces').create({
    owner: userId,
    data: { senses: [], graphs: [{ id: graphId, name: 'Smoke test graph', nodes: [], edges: [], createdAt: now, updatedAt: now }], activeGraphId: graphId },
    clientUpdatedAt: new Date().toISOString(),
    schemaVersion: 1,
  })
  const fetched = await pb.collection('lexigraph_workspaces').getOne(workspace.id)
  if (fetched.owner !== userId) throw new Error('Workspace owner rule returned an unexpected record.')
  await pb.collection('lexigraph_workspaces').update(workspace.id, { ...fetched, clientUpdatedAt: new Date().toISOString() })
  console.log('PocketBase smoke test passed: registration, authentication, owner-only create, read, and update.')
} finally {
  if (userId && pb.authStore.isValid && !keepAccount) {
    await pb.collection('lexigraph_users').delete(userId)
  }
}
