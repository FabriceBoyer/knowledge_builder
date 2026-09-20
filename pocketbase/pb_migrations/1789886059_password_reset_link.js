/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const users = app.findCollectionByNameOrId('lexigraph_users')
  users.resetPasswordTemplate = {
    subject: 'Reset your Lexigraph password',
    body: '<p>Hello,</p><p>Use the button below to choose a new Lexigraph password.</p><p><a class="btn" href="https://fabriceboyer.github.io/knowledge_builder/?passwordReset={TOKEN}" target="_blank" rel="noopener">Reset password</a></p><p>If you did not request this, you can ignore this message.</p><p>Thanks,<br/>Lexigraph</p>',
  }
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId('lexigraph_users')
  users.resetPasswordTemplate = {
    subject: 'Reset your {APP_NAME} password',
    body: '<p>Hello,</p><p>Click on the button below to reset your password.</p><p><a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a></p><p><i>If you didn\'t ask to reset your password, please ignore this email.</i></p><p>Thanks,<br/>{APP_NAME} team</p>',
  }
  app.save(users)
})
