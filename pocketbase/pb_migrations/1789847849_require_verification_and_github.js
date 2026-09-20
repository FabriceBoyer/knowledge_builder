/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId('lexigraph_users')
  const githubClientId = $os.getenv('LEXIGRAPH_GITHUB_CLIENT_ID')
  const githubClientSecret = $os.getenv('LEXIGRAPH_GITHUB_CLIENT_SECRET')
  const githubEnabled = githubClientId !== '' && githubClientSecret !== ''

  users.authRule = 'verified = true'
  users.oauth2 = {
    enabled: githubEnabled,
    mappedFields: { id: '', name: 'name', username: '', avatarURL: '' },
    providers: githubEnabled ? [{ name: 'github', clientId: githubClientId, clientSecret: githubClientSecret, displayName: 'GitHub' }] : [],
  }
  users.verificationTemplate = {
    subject: 'Verify your Lexigraph email',
    body: '<p>Hello,</p><p>Confirm your email address to activate your Lexigraph workspace.</p><p><a class="btn" href="https://fabriceboyer.github.io/knowledge_builder/?verification={TOKEN}" target="_blank" rel="noopener">Verify email</a></p><p>If you did not create this account, you can ignore this message.</p><p>Thanks,<br/>Lexigraph</p>',
  }
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId('lexigraph_users')
  users.authRule = ''
  users.oauth2 = {
    enabled: false,
    mappedFields: { id: '', name: '', username: '', avatarURL: '' },
    providers: [],
  }
  users.verificationTemplate = {
    subject: 'Verify your {APP_NAME} email',
    body: '<p>Hello,</p><p>Thank you for joining us at {APP_NAME}.</p><p>Click on the button below to verify your email address.</p><p><a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify</a></p><p><i>If you didn\'t recently register, please ignore this email.</i></p><p>Thanks,<br/>{APP_NAME} team</p>',
  }
  app.save(users)
})
