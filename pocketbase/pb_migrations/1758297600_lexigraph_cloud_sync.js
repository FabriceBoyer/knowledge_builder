/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = new Collection({
    type: 'auth',
    name: 'lexigraph_users',
    listRule: null,
    viewRule: null,
    createRule: '',
    updateRule: 'id = @request.auth.id',
    deleteRule: 'id = @request.auth.id',
    manageRule: null,
    authRule: '',
    passwordAuth: { enabled: true, identityFields: ['email'] },
    fields: [
      { name: 'name', type: 'text', max: 120 },
    ],
  })
  app.save(users)

  const workspaces = new Collection({
    type: 'base',
    name: 'lexigraph_workspaces',
    listRule: '@request.auth.id != "" && owner = @request.auth.id',
    viewRule: '@request.auth.id != "" && owner = @request.auth.id',
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    updateRule: '@request.auth.id != "" && owner = @request.auth.id && @request.body.owner:changed = false',
    deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
    fields: [
      { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { name: 'data', type: 'json', required: true, maxSize: 5000000 },
      { name: 'clientUpdatedAt', type: 'text', required: true, max: 40 },
      { name: 'schemaVersion', type: 'number', required: true, min: 1, onlyInt: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_lexigraph_workspaces_owner ON lexigraph_workspaces (owner)',
    ],
  })
  app.save(workspaces)
}, (app) => {
  const workspaces = app.findCollectionByNameOrId('lexigraph_workspaces')
  app.delete(workspaces)
  const users = app.findCollectionByNameOrId('lexigraph_users')
  app.delete(users)
})
