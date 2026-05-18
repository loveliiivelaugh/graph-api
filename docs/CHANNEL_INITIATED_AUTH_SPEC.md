# Channel-Initiated Auth Spec

## Goal

Make OAuth and reauthentication flows feel native inside chat and mobile-first channel UX.

The user should not need to:
- SSH into a box
- open a terminal
- run a CLI command manually
- rely on a localhost browser callback
- paste OAuth codes back into chat

The user should be able to:
- ask for a tool action in chat
- get a login button in that same chat
- tap it on phone or desktop
- complete auth in browser
- return to chat
- have the original action resume automatically

## Core product idea

Treat auth as a first-class runtime primitive in OpenClaw, not as a side effect of shelling into a CLI.

The agent owns:
- detecting missing or expired credentials
- starting an auth session
- presenting the login UX in-channel
- waiting for completion
- resuming the original action

The user owns:
- tapping a button
- authenticating with the provider

## What we proved with the Graph pilot

The Microsoft Graph pilot validated a reusable pattern:

1. agent/tool attempts action
2. tool detects missing or expired OAuth credential
3. tool/runtime starts a hosted auth session
4. chat receives a button card
5. user taps sign-in button on mobile
6. provider redirects to public callback
7. server exchanges code for token
8. auth session is marked complete
9. original task can continue without the user doing terminal work

This is the pattern to generalize.

## Terminology

### Auth session

A short-lived server-side object that tracks one authentication attempt.

Suggested fields:
- `id`
- `providerId`
- `channel`
- `accountId`
- `chatId` or conversation target
- `requestingSessionKey`
- `requestingTool`
- `requestIntentSummary`
- `status` (`pending|complete|error|expired|cancelled`)
- `createdAt`
- `expiresAt`
- `state`
- `pkceVerifier`
- `authorizeUrl`
- `callbackUrl`
- `scopes`
- `userHint` or account hint
- `resumePayload`
- `completionMessageSent`

### Auth provider adapter

A provider-specific implementation that knows how to:
- build auth URLs
- define scopes
- exchange code for token
- refresh token
- normalize identity info
- store credentials
- report credential health

Examples:
- Microsoft Graph
- Google
- GitHub
- Slack app installs
- custom OAuth-backed CLIs/tools

### Auth presentation adapter

A channel-specific presentation layer that knows how to render auth prompts:
- Teams Adaptive Card button
- Slack button/card
- Telegram inline button
- Web chat modal/button
- Control UI embedded auth card

## High-level architecture

### 1. Auth runtime in OpenClaw

OpenClaw should expose a native auth runtime with these responsibilities:
- create auth sessions
- persist auth session state
- generate secure callback URLs
- validate callback state
- complete token exchanges
- notify or resume sessions after completion
- expose auth status to tools and channels

### 2. Channel presentation

When auth is needed, the runtime asks the current channel to render the prompt.

Minimal prompt contract:
- title
- body text
- button label
- open URL
- expiry hint
- optional fallback plain link

### 3. Provider adapter contract

Each provider/tool integration should plug into a stable contract.

Suggested interface:

- `startAuth(context) -> authSessionDraft`
- `buildAuthorizeUrl(authSession)`
- `completeAuth({ session, code, state }) -> credentialResult`
- `refreshAuth(credential)`
- `getCredentialStatus(context)`
- `describeReauthReason(error)`

### 4. Resume behavior

When auth succeeds, OpenClaw should support one of these resume modes:

- `resume-original-tool-call`
- `notify-only`
- `resume-agent-run`
- `store-credential-and-wait`

Recommended default:
- resume original tool call when safe and idempotent
- otherwise send success and wait for next user action

## UX requirements

### Required UX properties

1. **In-channel initiation**
   - auth starts where the request happened

2. **Mobile-friendly**
   - button works from phone

3. **No manual shell work**
   - no SSH or terminal required

4. **Clear reauth reason**
   - tell the user why auth is needed
   - examples: token expired, first-time setup, missing scope

5. **Short-lived sessions**
   - sessions expire quickly, default 10-15 minutes

6. **Safe completion messaging**
   - send a compact success/failure message back to the same chat

7. **Provider-branded clarity**
   - say what is being authenticated and why
   - example: “Sign in to Microsoft Graph so I can access your OneDrive”

### Recommended UX flow

1. user asks for an action
2. assistant says briefly that sign-in is needed
3. assistant sends button card
4. user taps button
5. browser auth completes
6. browser shows success page
7. chat gets a success message
8. tool resumes or assistant continues

## Security model

### Must-have protections

1. **PKCE**
   - required for hosted browser flows

2. **State validation**
   - every callback validates state exactly

3. **Short auth TTL**
   - expire unused sessions quickly

4. **Conversation binding**
   - bind auth session to originating chat/session

5. **Scoped credential storage**
   - store tokens per provider, per user, per tool context as appropriate

6. **No secret leakage into chat**
   - never expose refresh tokens, raw access tokens, or client secrets

7. **Completion origin validation**
   - callback handler must verify provider response and expected session

8. **Auditability**
   - log auth start, complete, error, expiry
   - never log secrets

### Recommended protections

- one-time auth session ids
- callback host allowlist
- per-provider redirect allowlist
- replay protection
- explicit scope display when requesting elevated permissions
- policy for reauth on missing scopes

## Generic flow contract

### Auth start

Input:
- provider id
- requesting session key
- channel
- chat target
- desired scopes
- reason
- resume mode

Output:
- auth session record
- authorize URL
- presentation payload for current channel

### Auth callback

Input:
- session id
- provider callback params

Output:
- completed credential record or structured error
- optional resume event queued to originating session

### Auth completion event

Emitted to originating session/channel with:
- provider id
- success or failure
- identity summary
- whether original action resumed
- next step if not resumed

## Channel presentation contract

### Minimal renderable auth card

Fields:
- `title`
- `body`
- `buttonLabel`
- `url`
- `expiresAt`
- `providerLabel`
- `fallbackUrl` optional

### Teams example

Use Adaptive Card with:
- headline text block
- brief explanation
- `Action.OpenUrl`

### Slack example

Use Block Kit with:
- section text
- button accessory or actions block

### Telegram example

Use inline keyboard button with URL

### Web chat example

Use primary CTA button and optional modal explanation

## Tool integration patterns

### Pattern A: native OpenClaw-integrated providers

Best case.

Tool/provider directly asks OpenClaw auth runtime for credentials.
If credentials are missing or stale, OpenClaw handles auth natively.

Use for:
- bundled providers
- plugin providers
- OpenClaw-managed integrations

### Pattern B: wrapped external CLI tools

Good bridge pattern.

External CLI exposes:
- `auth login start`
- `auth login complete`
- `auth login status`

OpenClaw wraps those as an auth adapter.

Use for:
- existing local custom tools
- legacy CLIs
- migration path before full native integration

### Pattern C: device-code fallback

For providers where callback hosting is awkward or unsupported.

Flow:
- assistant sends code plus button URL
- user signs in on another surface
- runtime polls completion

Use when:
- device code is supported
- callback route cannot be hosted
- provider does not allow desired redirect topology

## Reauthentication patterns

This system should handle not just first auth, but reauth too.

Examples:
- refresh token expired
- password changed
- session revoked
- scopes insufficient
- admin consent changed

Recommended agent phrasing:
- “Your Microsoft sign-in expired. Tap below to reconnect OneDrive.”
- “I need one additional permission to continue. Tap below to reauthenticate.”

## Failure states

OpenClaw should treat these as first-class outcomes:
- user cancelled auth
- auth session expired
- state mismatch
- callback path misconfigured
- redirect URI mismatch in provider app config
- scope denied
- token exchange failed
- credential stored but still insufficient

For each, return:
- short user-facing explanation
- operator/developer diagnostic detail in logs
- suggested next step

## Proposed OpenClaw primitives

These could exist as core methods or plugin SDK surfaces.

### Runtime methods

- `auth.session.start`
- `auth.session.status`
- `auth.session.complete`
- `auth.session.cancel`
- `auth.providers.list`
- `auth.credentials.status`
- `auth.credentials.refresh`

### Plugin SDK hooks

- `registerAuthProvider(...)`
- `requestAuthSession(...)`
- `onAuthSessionCompleted(...)`
- `renderAuthPrompt(...)`

### Agent/tool behavior

Tool result should be able to say:
- `requiresAuth: true`
- `providerId`
- `reason`
- `scopes`
- `resumeMode`

Then core runtime should take over.

## Suggested implementation phases

### Phase 1: formalize the bridge pattern

Goal:
- standardize the CLI-backed hosted auth session pattern

Deliverables:
- documented CLI contract
- documented callback contract
- channel card rendering helpers
- common auth session schema

### Phase 2: OpenClaw native auth runtime

Goal:
- move session orchestration out of ad hoc plugins and scripts

Deliverables:
- auth session store in core
- provider adapter interface
- channel presentation interface
- resume events

### Phase 3: provider generalization

Targets:
- Microsoft Graph
- Google OAuth tools
- GitHub OAuth-backed tools
- Slack/Discord app install or reconnect flows
- custom workspace tools

### Phase 4: auto-resume and approval integration

Goal:
- auth and approvals feel like one coherent UX system

Deliverables:
- auth prompt cards
- approval cards
- resume original action after success
- unified event and audit model

## Practical guidance for future tool authors

If you are building a tool that needs OAuth, prefer this contract:

1. expose a non-interactive status command
2. expose hosted auth start/complete/status commands or native adapter hooks
3. support public callback URLs
4. store credentials server-side
5. never require the user to manually run terminal auth
6. separate auth orchestration from business action logic

Good:
- `tool auth login start`
- `tool auth login complete`
- `tool auth login status`

Bad:
- “run this on localhost and copy the browser URL from the terminal”

## What the Graph pilot specifically taught us

1. The user experience win is massive.
2. Headless CLI auth is not acceptable as a default UX.
3. Teams mobile button UX is enough to make OAuth feel normal.
4. Callback + session binding is the essential backbone.
5. Once one tool supports this pattern, users will expect all tools to.

## Recommendation

OpenClaw should adopt channel-initiated auth as a core pattern.

Principle:

> If an agent can notice that auth is needed, it should be able to trigger a safe, mobile-friendly sign-in flow inside the current channel.

That should become the default expectation for OAuth-backed tools and reauthentication flows.

## Immediate next steps

1. turn the Graph pilot contract into a reusable adapter template
2. add a common auth session schema and helper library
3. add channel render helpers for Teams, Slack, Telegram, and web chat
4. define resume semantics in core
5. migrate future OAuth-backed tools to this pattern by default
