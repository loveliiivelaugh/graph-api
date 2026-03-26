# `graph-api-cli`

Minimal JavaScript CLI for authenticating with Microsoft Graph and making a few useful delegated-user requests from the terminal.

This first pass is intentionally narrow:

- OAuth 2.0 authorization code flow with PKCE for a desktop-style CLI
- local token storage and automatic access-token refresh
- signed-in user profile lookup
- OneDrive root lookup for the signed-in user
- starter mail listing for the signed-in user
- user lookup by id or UPN
- raw Microsoft Graph request escape hatch

## Official docs used

- [Microsoft Graph auth concepts](https://learn.microsoft.com/en-us/graph/auth/auth-concepts)
- [Microsoft identity platform authorization code flow](https://learn.microsoft.com/en-nz/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)
- [How to add a redirect URI to your application](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri)

## Setup

1. Create an app registration in Microsoft Entra ID.
2. Under `Authentication`, add the `Mobile and desktop applications` platform.
3. Under `Authentication`, prefer adding the `Mobile and desktop applications` platform for a CLI/public client.
4. Add a custom redirect URI such as:

```text
http://127.0.0.1:8787/callback
```

5. Copy the app's `Application (client) ID`.
6. Add delegated Microsoft Graph permissions that match what you want to do.

Good starter delegated permissions:

- `User.Read`
- `Files.Read`
- `Mail.Read`

The CLI default login scope is:

```text
openid profile offline_access User.Read
```

If you want drive or mail commands to work immediately, log in with broader scopes:

```text
openid profile offline_access User.Read Files.Read Mail.Read
```

## Install

```bash
cd ~/Projects/graph-api-cli
chmod +x ./bin/graph-api.js
npm run check
npm link
```

That exposes the `graph-api` command in your shell.

## Authenticate

```bash
export GRAPH_CLIENT_ID=...
export GRAPH_CLIENT_SECRET=...
export GRAPH_TENANT=common
export GRAPH_REDIRECT_URI=http://127.0.0.1:8787/callback
export GRAPH_SCOPES="openid profile offline_access User.Read Files.Read Mail.Read"

graph-api auth login
```

The CLI prints the authorization URL. Open it in your browser, complete consent, and the CLI will catch the callback locally.

Config is stored at:

```text
~/.config/graph-api-cli/config.json
```

## Commands

```bash
graph-api help
graph-api auth login --client-id <id>
graph-api auth login --client-id <id> --client-secret <secret>
graph-api auth status
graph-api auth refresh
graph-api auth logout
graph-api me
graph-api me drive
graph-api me messages --limit 10
graph-api users get --id user@contoso.com
graph-api request GET /me
graph-api request GET /me/events --query '$top=5'
graph-api request PATCH /me --data-json '{"city":"Chicago"}'
```

## Examples

Confirm auth and inspect the signed-in user:

```bash
graph-api me
```

Inspect the signed-in user's OneDrive root:

```bash
graph-api me drive
```

List a few recent messages:

```bash
graph-api me messages --limit 5
```

Fetch another user by UPN:

```bash
graph-api users get --id user@contoso.com
```

Run a raw Microsoft Graph request:

```bash
graph-api request GET /me/calendar/events --query '$top=10'
```

POST JSON from a file:

```bash
graph-api request POST /me/todo/lists --input ./examples/todo-list-create.json
```

## Notes

- Preferred setup: register the redirect URI under `Mobile and desktop applications` so Entra treats this as a public client and no client secret is needed.
- If the redirect URI is registered under `Web`, Entra treats the token exchange as confidential-client auth and you must provide a client secret.
- This CLI supports both modes, but the public-client desktop setup is the better fit for a local CLI.
- Access tokens expire quickly; the CLI refreshes them automatically when a refresh token is available.
- Refresh-token lifetime and tenant policies can still force you to re-run `graph-api auth login`.
- Some Microsoft Graph permissions require admin consent.
- The `request` command targets `https://graph.microsoft.com/v1.0` unless you pass a full URL.
