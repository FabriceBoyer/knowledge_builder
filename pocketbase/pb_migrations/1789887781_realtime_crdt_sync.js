/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId('lexigraph_users')
  const operations = new Collection({
    type: 'base',
    name: 'lexigraph_sync_operations',
    listRule: '@request.auth.id != "" && owner = @request.auth.id',
    viewRule: '@request.auth.id != "" && owner = @request.auth.id',
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: 'opId', type: 'text', required: true, min: 30, max: 50 },
      { name: 'deviceId', type: 'text', required: true, min: 30, max: 50 },
      { name: 'clock', type: 'text', required: true, max: 90 },
      { name: 'entryKey', type: 'text', required: true, max: 500 },
      { name: 'deleted', type: 'bool' },
      { name: 'value', type: 'json', maxSize: 5000000 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_lexigraph_sync_op_id ON lexigraph_sync_operations (opId)',
      'CREATE INDEX idx_lexigraph_sync_owner_clock ON lexigraph_sync_operations (owner, clock)',
    ],
  })
  app.save(operations)
}, (app) => {
  const operations = app.findCollectionByNameOrId('lexigraph_sync_operations')
  app.delete(operations)
})
