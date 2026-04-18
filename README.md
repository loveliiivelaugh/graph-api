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
graph-api request PUT /me/drive/root:/OpenClaw/notes.md:/content --input-raw ./notes.md
```

### Power Automate

```bash
graph-api power-automate auth login --client-id <id> --environment-url https://contoso.crm.dynamics.com
graph-api power-automate auth status
graph-api power-automate auth refresh
graph-api power-automate auth logout
graph-api power-automate whoami
graph-api power-automate capability-report
graph-api power-automate plan "When I get an email from a VIP sender, post it to Teams"
graph-api power-automate questions --intent "Create a daily approval flow"
graph-api power-automate scaffold --intent-json '{"intent":"Create a daily approval flow","draftTemplate":"approval"}'
graph-api power-automate templates list
graph-api power-automate templates show --id scheduled-basic
graph-api power-automate templates instantiate --id scheduled-basic --params-json '{"name":"Daily digest"}'
graph-api power-automate connections list
graph-api power-automate connections get --id <connection-id>
graph-api power-automate connection-references list
graph-api power-automate connection-references get --id <reference-id>
graph-api power-automate connection-references bind --id <reference-id> --connection-id <connection-id>
graph-api power-automate validate --input ./flow-create.json
graph-api power-automate preflight --input ./flow-create.json --environment <environment-id-or-url>
graph-api power-automate environments list
graph-api power-automate environments get --id <environment-id>
graph-api power-automate environments resolve --url https://contoso.crm.dynamics.com
graph-api power-automate environments select --id <environment-id>
graph-api power-automate solutions list
graph-api power-automate solutions get --id <solution-id>
graph-api power-automate solutions flows list --solution-id <solution-id>
graph-api power-automate solutions add-flow --solution-id <solution-id> --flow-id <flow-id>
graph-api power-automate runs list --flow-id <workflow-id> --top 20
graph-api power-automate runs get --id <run-id>
graph-api power-automate flows list --top 10 --state on
graph-api power-automate flows list --environment <environment-id-or-url>
graph-api power-automate flows get --id <workflow-id>
graph-api power-automate flows doctor --id <workflow-id>
graph-api power-automate flows triggers list --id <workflow-id>
graph-api power-automate flows actions list --id <workflow-id>
graph-api power-automate flows dependencies --id <workflow-id>
graph-api power-automate flows export --id <workflow-id> --output ./flow.json
graph-api power-automate flows import --input ./flow.json
graph-api power-automate flows import --input ./flow.json --apply
graph-api power-automate flows diff --id <workflow-id> --input ./flow.json
graph-api power-automate flows create-scheduled --name "Daily digest" --schedule "0 9 * * *"
graph-api power-automate flows create-teams-alert --name "Ops alert" --channel <channel-id>
graph-api power-automate flows create-approval --name "Review request" --approver approver@contoso.com
graph-api power-automate flows create --input ./flow-create.json
graph-api power-automate flows update --id <workflow-id> --input ./flow-patch.json
graph-api power-automate flows delete --id <workflow-id>
graph-api power-automate flows on --id <workflow-id>
graph-api power-automate flows off --id <workflow-id>
graph-api power-automate request GET /workflows --query '$top=5'
```

## Power Automate Notes

- The supported API surface here is Dataverse Web API flow management, matching Microsoft Learn's `Work with cloud flows using code` guidance.
- Environment discovery uses the Power Platform API and can select a default environment for later flow commands.
- `whoami` uses the Dataverse `WhoAmI` function in the active environment to confirm the current principal context.
- Run history uses the Dataverse `flowruns` table, which Microsoft documents for solution-aware cloud flows.
- Connections are discovered through the Power Platform connectivity API.
- Connection references are discovered and updated through the Dataverse `connectionreferences` table.
- `validate` performs offline structural checks on a Dataverse workflow payload before create/update.
- `preflight` adds environment-aware checks for missing or unbound connection references when an environment is available.
- Solutions are discovered through the Dataverse `solution` table.
- `solutions add-flow` uses the Dataverse `AddSolutionComponent` action and only works with unmanaged solutions.
- `flows export` writes a reusable workflow payload for version control and later import.
- `flows import` is safe by default and only applies changes when `--apply` is passed.
- `flows diff` compares normalized trigger/action/reference structure between an existing flow and a local payload.
- `flows triggers list`, `flows actions list`, and `flows dependencies` expose a flow's structure in a stable agent-friendly shape.
- `templates` exposes reusable starter payloads for common flow patterns.
- `flows create-scheduled`, `flows create-teams-alert`, and `flows create-approval` are high-level builders that generate draft payloads and only apply when `--apply` is passed.
- `plan` converts natural language into a deterministic trigger/action/template recommendation.
- `questions` extracts the most important unanswered configuration questions from an intent.
- `scaffold` turns structured intent JSON into a starter payload, and stays dry-run unless `--apply` is passed.
- Connector-backed builders depend on the relevant connection references being available and bound in the target environment.
- `flows doctor` inspects the flow's `clientdata` connection references and highlights missing or unbound references.
- Flow commands now inherit the selected environment by default, and you can override it per command with `--environment` or `--environment-url`.
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

List environments and select a default one:

```bash
graph-api power-automate environments list
graph-api power-automate environments select --id Default-123456
```

Inspect the current Power Automate principal and capability surface:

```bash
graph-api power-automate whoami
graph-api power-automate capability-report
```

Inspect available connections and connection references:

```bash
graph-api power-automate connections list
graph-api power-automate connection-references list
```

Inspect and instantiate starter templates:

```bash
graph-api power-automate templates list
graph-api power-automate templates show --id scheduled-basic
graph-api power-automate templates instantiate \
  --id scheduled-basic \
  --params-json '{"name":"Daily digest","schedule":"0 9 * * *"}'
```

Plan and scaffold a flow from natural language intent:

```bash
graph-api power-automate plan \
  "When I get an email from a VIP sender, summarize it, post it to Teams, and create a Planner task if urgent"

graph-api power-automate questions \
  --intent "When I get an email from a VIP sender, summarize it, post it to Teams, and create a Planner task if urgent"

graph-api power-automate scaffold \
  --intent-json '{"intent":"When I get an email from a VIP sender, summarize it, post it to Teams, and create a Planner task if urgent","draftTemplate":"teams-alert"}'
```

Bind a connection reference to a concrete connection:

```bash
graph-api power-automate connection-references bind \
  --id 00000000-0000-0000-0000-000000000000 \
  --connection-id /providers/Microsoft.PowerApps/apis/shared_office365/connections/shared-office365-123
```

Validate a flow payload before applying it:

```bash
graph-api power-automate validate --input ./flow-create.json
graph-api power-automate preflight --input ./flow-create.json --environment Default-123456
```

Inspect solutions and list the flows inside a solution:

```bash
graph-api power-automate solutions list
graph-api power-automate solutions flows list --solution-id 00000000-0000-0000-0000-000000000000
```

Attach a flow to an unmanaged solution:

```bash
graph-api power-automate solutions add-flow \
  --solution-id 00000000-0000-0000-0000-000000000000 \
  --flow-id 11111111-1111-1111-1111-111111111111
```

Export, diff, and safely import a flow payload:

```bash
graph-api power-automate flows export \
  --id 00000000-0000-0000-0000-000000000000 \
  --output ./flow.json

graph-api power-automate flows diff \
  --id 00000000-0000-0000-0000-000000000000 \
  --input ./flow.json

graph-api power-automate flows import --input ./flow.json
graph-api power-automate flows import --input ./flow.json --apply
```

Generate high-level flow drafts from ergonomic flags:

```bash
graph-api power-automate flows create-scheduled \
  --name "Daily digest" \
  --schedule "0 9 * * *"

graph-api power-automate flows create-teams-alert \
  --name "Ops alert" \
  --channel <channel-id>

graph-api power-automate flows create-approval \
  --name "Review request" \
  --approver approver@contoso.com
```

Inspect a flow's triggers, actions, and connector dependencies:

```bash
graph-api power-automate flows triggers list \
  --id 00000000-0000-0000-0000-000000000000

graph-api power-automate flows actions list \
  --id 00000000-0000-0000-0000-000000000000

graph-api power-automate flows dependencies \
  --id 00000000-0000-0000-0000-000000000000
```

Inspect recent runs for a solution-aware cloud flow:

```bash
graph-api power-automate runs list --flow-id 00000000-0000-0000-0000-000000000000 --top 10
```

Diagnose whether a flow has missing or unbound connection references:

```bash
graph-api power-automate flows doctor --id 00000000-0000-0000-0000-000000000000
```

Fetch a specific cloud flow:

```bash
graph-api power-automate flows get --id 00000000-0000-0000-0000-000000000000
```

Run a raw Dataverse Web API request against workflows:

```bash
graph-api power-automate request GET /workflows --query '$select=name,workflowid,statecode' --query '$top=5'
```

Upload a markdown file into OneDrive:

```bash
graph-api request PUT /me/drive/root:/OpenClaw/notes.md:/content --input-raw ./notes.md
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
