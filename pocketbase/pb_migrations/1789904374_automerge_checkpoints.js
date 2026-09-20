/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId('lexigraph_users')
  const changes = new Collection({
    type: 'base', name: 'lexigraph_automerge_changes',
    listRule: '@request.auth.id != "" && owner = @request.auth.id', viewRule: '@request.auth.id != "" && owner = @request.auth.id',
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id', updateRule: null, deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
    fields: [
      { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: 'changeId', type: 'text', required: true, min: 30, max: 50 },
      { name: 'payload', type: 'text', required: true, max: 20000000 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_lexigraph_automerge_change_id ON lexigraph_automerge_changes (changeId)', 'CREATE INDEX idx_lexigraph_automerge_owner_change ON lexigraph_automerge_changes (owner, changeId)'],
  })
  app.save(changes)

  const checkpoints = new Collection({
    type: 'base', name: 'lexigraph_automerge_checkpoints',
    listRule: '@request.auth.id != "" && owner = @request.auth.id', viewRule: '@request.auth.id != "" && owner = @request.auth.id',
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id', updateRule: null, deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
    fields: [
      { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: 'checkpointId', type: 'text', required: true, min: 30, max: 50 },
      { name: 'document', type: 'text', required: true, max: 20000000 },
      { name: 'heads', type: 'json', required: true, maxSize: 1000000 },
      { name: 'changeCount', type: 'number', min: 0, onlyInt: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_lexigraph_automerge_checkpoint_id ON lexigraph_automerge_checkpoints (checkpointId)', 'CREATE INDEX idx_lexigraph_automerge_owner_checkpoint ON lexigraph_automerge_checkpoints (owner, checkpointId)'],
  })
  app.save(checkpoints)
}, (app) => {
  app.delete(app.findCollectionByNameOrId('lexigraph_automerge_checkpoints'))
  app.delete(app.findCollectionByNameOrId('lexigraph_automerge_changes'))
})
