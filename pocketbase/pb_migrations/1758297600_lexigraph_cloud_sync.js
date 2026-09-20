/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const githubClientId = $os.getenv('LEXIGRAPH_GITHUB_CLIENT_ID')
  const githubClientSecret = $os.getenv('LEXIGRAPH_GITHUB_CLIENT_SECRET')
  const githubEnabled = githubClientId !== '' && githubClientSecret !== ''
  const users = new Collection({
    type: 'auth',
    name: 'lexigraph_users',
    listRule: null,
    viewRule: null,
    createRule: '',
    updateRule: 'id = @request.auth.id',
    deleteRule: 'id = @request.auth.id',
    manageRule: null,
    authRule: 'verified = true',
    passwordAuth: { enabled: true, identityFields: ['email'] },
    oauth2: {
      enabled: githubEnabled,
      mappedFields: { id: '', name: 'name', username: '', avatarURL: '' },
      providers: githubEnabled ? [{ name: 'github', clientId: githubClientId, clientSecret: githubClientSecret, displayName: 'GitHub' }] : [],
    },
    verificationTemplate: {
      subject: 'Verify your Lexigraph email',
      body: '<p>Hello,</p><p>Confirm your email address to activate your Lexigraph workspace.</p><p><a class="btn" href="https://fabriceboyer.github.io/knowledge_builder/?verification={TOKEN}" target="_blank" rel="noopener">Verify email</a></p><p>If you did not create this account, you can ignore this message.</p><p>Thanks,<br/>Lexigraph</p>',
    },
    resetPasswordTemplate: {
      subject: 'Reset your Lexigraph password',
      body: '<p>Hello,</p><p>Use the button below to choose a new Lexigraph password.</p><p><a class="btn" href="https://fabriceboyer.github.io/knowledge_builder/?passwordReset={TOKEN}" target="_blank" rel="noopener">Reset password</a></p><p>If you did not request this, you can ignore this message.</p><p>Thanks,<br/>Lexigraph</p>',
    },
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
    updateRule: '@request.auth.id != "" && owner = @request.auth.id && @request.body.owner = @request.auth.id',
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
  const workspaces = app.findCollectionByNameOrId('lexigraph_workspaces')
  app.delete(workspaces)
  const users = app.findCollectionByNameOrId('lexigraph_users')
  app.delete(users)
})
