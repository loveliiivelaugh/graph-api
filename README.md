# `graph-api-cli`

Minimal JavaScript CLI for authenticating with Microsoft Graph and extending the same app registration/auth flow to Microsoft Power Automate cloud-flow management through the Dataverse Web API.

This project now supports two Microsoft API surfaces:

- Microsoft Graph delegated-user auth and requests
- Power Automate cloud-flow management through Dataverse Web API endpoints

## Official docs used

- [Microsoft Graph auth concepts](https://learn.microsoft.com/en-us/graph/auth/auth-concepts)
- [Microsoft identity platform authorization code flow](https://learn.microsoft.com/en-nz/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Register an application with the Microsoft identity platform](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)
- [How to add a redirect URI to your application](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri)
- [Work with cloud flows using code](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code?tabs=webapi)
- [Use OAuth authentication with Microsoft Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/authenticate-oauth)
- [View developer resources](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/view-download-developer-resources)

## Setup

1. Create an app registration in Microsoft Entra ID.
2. Under `Authentication`, add the `Mobile and desktop applications` platform.
3. Add a localhost redirect URI such as:

```text
http://localhost:8787/callback
```

4. Copy the app's `Application (client) ID`.
5. Add delegated Microsoft Graph permissions that match what you want to do.
6. For Power Automate, identify your Dataverse environment URL from `Power Apps -> Settings -> Developer resources`.

Example Dataverse environment URL:

```text
https://contoso.crm.dynamics.com
```

Good starter Microsoft Graph delegated permissions:

- `User.Read`
- `Files.Read`
- `Mail.Read`

The default Graph login scope is:

```text
openid profile offline_access User.Read
```

The default Power Automate login scope is computed from your environment URL and follows the Dataverse docs:

```text
openid profile offline_access https://contoso.crm.dynamics.com/user_impersonation
```

## Install

```bash
cd ~/Projects/graph-api-cli
chmod +x ./bin/graph-api.js
npm run check
npm link
```

That exposes the `graph-api` command in your shell.

## Authenticate With Microsoft Graph

```bash
export GRAPH_CLIENT_ID=...
export GRAPH_CLIENT_SECRET=...
export GRAPH_TENANT=common
export GRAPH_REDIRECT_URI=http://localhost:8787/callback
export GRAPH_SCOPES="openid profile offline_access User.Read Files.Read Mail.Read"

graph-api auth login
```

## Authenticate With Power Automate

You can reuse the same Entra app/client ID. Power Automate auth is stored separately from Graph auth in the same config file.

```bash
export POWER_AUTOMATE_CLIENT_ID=...
export POWER_AUTOMATE_TENANT=common
export POWER_AUTOMATE_REDIRECT_URI=http://localhost:8787/callback
export POWER_AUTOMATE_ENVIRONMENT_URL=https://contoso.crm.dynamics.com

graph-api power-automate auth login
```

You can also pass the environment URL directly:

```bash
graph-api power-automate auth login \
  --client-id ... \
  --environment-url https://contoso.crm.dynamics.com
```

Config is stored at:

```text
~/.config/graph-api-cli/config.json
```

## Commands

### Graph

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

### Power Automate

```bash
graph-api power-automate auth login --client-id <id> --environment-url https://contoso.crm.dynamics.com
graph-api power-automate auth status
graph-api power-automate auth refresh
graph-api power-automate auth logout
graph-api power-automate flows list --top 10 --state on
graph-api power-automate flows get --id <workflow-id>
graph-api power-automate flows create --input ./flow-create.json
graph-api power-automate flows update --id <workflow-id> --input ./flow-patch.json
graph-api power-automate flows delete --id <workflow-id>
graph-api power-automate flows on --id <workflow-id>
graph-api power-automate flows off --id <workflow-id>
graph-api power-automate request GET /workflows --query '$top=5'
```

## Power Automate Notes

- The supported API surface here is Dataverse Web API flow management, matching Microsoft Learn's `Work with cloud flows using code` guidance.
- This targets solution-aware cloud flows stored in Dataverse.
- Microsoft explicitly notes that `api.flow.microsoft.com` is unsupported for customers and subject to breaking change.
- Managing `My Flows` with code is not supported by the Microsoft Learn article this CLI is based on.
- Creating flows requires a valid Dataverse `workflow` payload, including fields like `category`, `name`, `type`, `primaryentity`, and `clientdata`.
- The `clientdata` field is the string-encoded JSON flow definition plus connection references from the Dataverse docs.

## Examples

Confirm Graph auth and inspect the signed-in user:

```bash
graph-api me
```

List active Power Automate cloud flows:

```bash
graph-api power-automate flows list --state on
```

Fetch a specific cloud flow:

```bash
graph-api power-automate flows get --id 00000000-0000-0000-0000-000000000000
```

Run a raw Dataverse Web API request against workflows:

```bash
graph-api power-automate request GET /workflows --query '$select=name,workflowid,statecode' --query '$top=5'
```

## Notes

- Preferred setup: register the redirect URI under `Mobile and desktop applications` so Entra treats this as a public client and no client secret is needed.
- If the redirect URI is registered under `Web`, Entra treats the token exchange as confidential-client auth and you must provide a client secret.
- The CLI supports both modes.
- Access tokens expire quickly; the CLI refreshes access tokens automatically when a refresh token is available.
- Refresh-token lifetime and tenant policies can still force you to re-run login.
- Some Graph permissions and Dataverse permissions require admin consent.
- Graph requests target `https://graph.microsoft.com/v1.0` unless you pass a full URL.
- Power Automate requests target `<environment-url>/api/data/v9.2` unless you pass a full URL.
