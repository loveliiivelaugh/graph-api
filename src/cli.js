import { parseArgs, normalizeList, requireFlag } from "./args.js";
import {
  completeHostedAuthSession,
  createHostedAuthSession,
  getDefaultAuthSettings,
  getHostedAuthSessionStatus,
  loginWithOAuth,
  logoutService,
  refreshAccessToken
} from "./auth.js";
import { getConfigPath, loadConfig, maskToken, resolveSetting, getServiceConfig } from "./config.js";
import {
  getMe,
  getMyDriveRoot,
  getUser,
  graphRequest,
  listMyMessages,
  loadRequestInput
} from "./graph-api.js";
import {
  bindConnectionReference,
  capabilityReport,
  createTemplateBackedFlow,
  createFlow,
  deleteFlow,
  diagnoseFlow,
  getTemplate,
  listFlowActions,
  listFlowDependencies,
  listFlowTriggers,
  addFlowToSolution,
  diffFlow,
  exportFlow,
  getConnection,
  getConnectionReference,
  getEnvironment,
  getFlow,
  getRun,
  getSolution,
  listConnectionReferences,
  listConnections,
  listFlows,
  listEnvironments,
  listRuns,
  listSolutionFlows,
  listSolutions,
  listIntentQuestions,
  listTemplates,
  importFlow,
  instantiateTemplatePayload,
  loadJsonInput as loadPowerAutomateJsonInput,
  planIntent,
  preflightFlowPayload,
  powerAutomateRequest,
  resolveActiveEnvironment,
  resolveEnvironmentByUrl,
  resolvePowerAutomateSettings,
  scaffoldIntent,
  selectEnvironment,
  setFlowState,
  updateFlow,
  validateFlowPayload,
  whoAmI
} from "./power-automate.js";

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function parseJsonFlag(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error.message}`);
  }
}

function printHelp() {
  const graphDefaults = getDefaultAuthSettings("graph");

  console.log(`
graph-api

Usage:
  graph-api help
  graph-api auth login [--client-id <id>] [--client-secret <secret>] [--tenant common|organizations|consumers|<tenant-id>] [--redirect-uri ${graphDefaults.redirectUri}] [--scopes "${graphDefaults.scopes}"]
  graph-api auth login start [--client-id <id>] [--client-secret <secret>] [--tenant common|organizations|consumers|<tenant-id>] [--redirect-uri https://your.host/callback] [--scopes "${graphDefaults.scopes}"] [--format json|text]
  graph-api auth login complete --session-id <id> --state <state> --code <code>
  graph-api auth login status --session-id <id>
  graph-api auth status
  graph-api auth refresh
  graph-api auth logout
  graph-api me
  graph-api me drive
  graph-api me messages [--limit 10]
  graph-api users get --id <user-id-or-upn>
  graph-api request <method> <path> [--query key=value]... [--data-json '{"key":"value"}' | --input file.json | --input-raw file]
  graph-api power-automate auth login --environment-url <url> [--client-id <id>] [--client-secret <secret>] [--tenant <tenant>] [--redirect-uri ${graphDefaults.redirectUri}] [--scopes "<space-delimited scopes>"]
  graph-api power-automate auth login start --environment-url <url> [--client-id <id>] [--redirect-uri https://your.host/callback]
  graph-api power-automate auth login complete --session-id <id> --state <state> --code <code>
  graph-api power-automate auth login status --session-id <id>
  graph-api power-automate auth status
  graph-api power-automate auth refresh
  graph-api power-automate auth logout
  graph-api power-automate whoami [--environment <id|url>]
  graph-api power-automate capability-report [--environment <id|url>]
  graph-api power-automate plan "<intent>"
  graph-api power-automate questions --intent "<intent>"
  graph-api power-automate scaffold --intent-json '{...}' [--apply] [--output flow.json] [--environment <id|url>]
  graph-api power-automate templates list
  graph-api power-automate templates show --id <template-id>
  graph-api power-automate templates instantiate --id <template-id> [--params-json '{"name":"..."}'] [--output flow.json]
  graph-api power-automate connections list [--environment <id|url>]
  graph-api power-automate connections get --id <connection-id> [--environment <id|url>]
  graph-api power-automate connection-references list [--environment <id|url>]
  graph-api power-automate connection-references get --id <reference-id> [--environment <id|url>]
  graph-api power-automate connection-references bind --id <reference-id> --connection-id <connection-id> [--environment <id|url>]
  graph-api power-automate validate --input flow.json [--environment <id|url>]
  graph-api power-automate preflight --input flow.json [--environment <id|url>]
  graph-api power-automate environments list
  graph-api power-automate environments get --id <environment-id>
  graph-api power-automate environments resolve --url <environment-url>
  graph-api power-automate environments select --id <environment-id>
  graph-api power-automate solutions list [--environment <id|url>]
  graph-api power-automate solutions get --id <solution-id> [--environment <id|url>]
  graph-api power-automate solutions flows list --solution-id <solution-id> [--environment <id|url>]
  graph-api power-automate solutions add-flow --solution-id <solution-id> --flow-id <flow-id> [--environment <id|url>]
  graph-api power-automate runs list --flow-id <workflow-id> [--top 20] [--environment <id|url>]
  graph-api power-automate runs get --id <run-id> [--environment <id|url>]
  graph-api power-automate flows list [--top 10] [--state on|off|suspended|all] [--environment <id|url>]
  graph-api power-automate flows get --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows doctor --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows triggers list --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows actions list --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows dependencies --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows export --id <workflow-id> [--output flow.json] [--environment <id|url>]
  graph-api power-automate flows import --input flow.json [--id <workflow-id>] [--apply] [--environment <id|url>]
  graph-api power-automate flows diff --id <workflow-id> --input flow.json [--environment <id|url>]
  graph-api power-automate flows create-scheduled --name <name> --schedule "0 9 * * *" [--message <text>] [--apply] [--output flow.json] [--environment <id|url>]
  graph-api power-automate flows create-teams-alert --name <name> --channel <channel-id> [--summary <text>] [--apply] [--output flow.json] [--environment <id|url>]
  graph-api power-automate flows create-approval --name <name> --approver <email> [--title <title>] [--details <text>] [--apply] [--output flow.json] [--environment <id|url>]
  graph-api power-automate flows create [--data-json '{"name":"..."}' | --input flow.json] [--environment <id|url>]
  graph-api power-automate flows update --id <workflow-id> [--data-json '{"description":"..."}' | --input patch.json] [--environment <id|url>]
  graph-api power-automate flows delete --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows on --id <workflow-id> [--environment <id|url>]
  graph-api power-automate flows off --id <workflow-id> [--environment <id|url>]
  graph-api power-automate request <method> <path> [--query key=value]... [--data-json '{"key":"value"}' | --input body.json] [--environment <id|url>]

Examples:
  graph-api auth login --client-id <app-client-id>
  graph-api auth login start --client-id <app-client-id> --redirect-uri https://bot.example.com/hooks/graph/callback --format json
  graph-api auth login complete --session-id <session-id> --state <state> --code <code>
  graph-api me
  graph-api request GET /me
  graph-api request PUT /me/drive/root:/OpenClaw/notes.md:/content --input-raw ./notes.md
  graph-api power-automate auth login --client-id <app-client-id> --environment-url https://contoso.crm.dynamics.com
  graph-api power-automate whoami
  graph-api power-automate capability-report
  graph-api power-automate plan "When I get an email from a VIP sender, post it to Teams"
  graph-api power-automate questions --intent "Create a daily approval flow"
  graph-api power-automate templates list
  graph-api power-automate scaffold --intent-json '{"intent":"Create a daily approval flow","draftTemplate":"approval"}'
  graph-api power-automate templates instantiate --id scheduled-basic --params-json '{"name":"Daily digest"}'
  graph-api power-automate environments list
  graph-api power-automate environments select --id Default-123456
  graph-api power-automate connections list
  graph-api power-automate connection-references list
  graph-api power-automate validate --input ./flow-create.json
  graph-api power-automate preflight --input ./flow-create.json --environment Default-123456
  graph-api power-automate solutions list
  graph-api power-automate solutions flows list --solution-id 00000000-0000-0000-0000-000000000000
  graph-api power-automate runs list --flow-id 00000000-0000-0000-0000-000000000000
  graph-api power-automate flows doctor --id 00000000-0000-0000-0000-000000000000
  graph-api power-automate flows triggers list --id 00000000-0000-0000-0000-000000000000
  graph-api power-automate flows actions list --id 00000000-0000-0000-0000-000000000000
  graph-api power-automate flows dependencies --id 00000000-0000-0000-0000-000000000000
  graph-api power-automate flows export --id 00000000-0000-0000-0000-000000000000 --output ./flow.json
  graph-api power-automate flows diff --id 00000000-0000-0000-0000-000000000000 --input ./flow.json
  graph-api power-automate flows import --input ./flow.json --apply
  graph-api power-automate flows create-scheduled --name "Daily digest" --schedule "0 9 * * *"
  graph-api power-automate flows create-teams-alert --name "Ops alert" --channel <channel-id>
  graph-api power-automate flows create-approval --name "Review request" --approver approver@contoso.com
  graph-api power-automate flows list --state on
  graph-api power-automate flows list --environment https://contoso.crm.dynamics.com
  graph-api power-automate request GET /workflows --query '$top=5' --environment Default-123456

Notes:
  - Power Automate flow management uses the Dataverse Web API, not the unsupported api.flow.microsoft.com endpoint
  - environment discovery uses the Power Platform API and flow operations use the selected environment unless you override it with --environment or --environment-url
  - Power Automate commands currently target solution-aware cloud flows stored in Dataverse (the same scope covered by Microsoft Learn's "Work with cloud flows using code" article)
  - pass your Dataverse environment URL as --environment-url, for example https://contoso.crm.dynamics.com
  - default Power Automate login scopes are computed from the environment URL and request <environment-url>/user_impersonation
  - the CLI stores service tokens at ~/.config/graph-api-cli/config.json and keeps Graph and Power Automate credentials separately
  - hosted auth sessions are stored under ~/.config/graph-api-cli/auth-sessions and are designed for chat or remote-device sign-in flows
`.trim());
}

function getCommandPrefix(serviceName) {
  return serviceName === "graph" ? "auth" : "power-automate auth";
}

function resolveAuthEnv(serviceName, key) {
  const powerAutomateEnv = {
    clientId: process.env.POWER_AUTOMATE_CLIENT_ID,
    clientSecret: process.env.POWER_AUTOMATE_CLIENT_SECRET,
    tenant: process.env.POWER_AUTOMATE_TENANT,
    redirectUri: process.env.POWER_AUTOMATE_REDIRECT_URI,
    scopes: process.env.POWER_AUTOMATE_SCOPES
  };
  const graphEnv = {
    clientId: process.env.GRAPH_CLIENT_ID,
    clientSecret: process.env.GRAPH_CLIENT_SECRET,
    tenant: process.env.GRAPH_TENANT,
    redirectUri: process.env.GRAPH_REDIRECT_URI,
    scopes: process.env.GRAPH_SCOPES
  };

  if (serviceName === "powerAutomate") {
    if (key === "scopes") {
      return powerAutomateEnv[key] || null;
    }

    return powerAutomateEnv[key] || graphEnv[key] || null;
  }

  return graphEnv[key] || null;
}

async function handleAuth(serviceName, subcommand, flags, positionals = []) {
  const config = loadConfig();
  const serviceConfig = getServiceConfig(config, serviceName);

  if (subcommand === "login") {
    const nested = positionals[0] || null;
    const clientId = resolveSetting(
      flags["client-id"],
      resolveAuthEnv(serviceName, "clientId"),
      serviceConfig.clientId
    );

    if (!clientId) {
      throw new Error("Provide --client-id or set GRAPH_CLIENT_ID.");
    }

    const powerAutomateSettings =
      serviceName === "powerAutomate" ? resolvePowerAutomateSettings(flags, config) : {};
    const defaults = getDefaultAuthSettings(serviceName, powerAutomateSettings);
    const commonOptions = {
      serviceName,
      clientId,
      clientSecret: resolveSetting(
        flags["client-secret"],
        resolveAuthEnv(serviceName, "clientSecret"),
        serviceConfig.clientSecret
      ),
      tenant: resolveSetting(
        flags.tenant,
        resolveAuthEnv(serviceName, "tenant"),
        serviceConfig.tenant,
        defaults.tenant
      ),
      redirectUri: resolveSetting(
        flags["redirect-uri"],
        resolveAuthEnv(serviceName, "redirectUri"),
        serviceConfig.redirectUri,
        defaults.redirectUri
      ),
      scopes: resolveSetting(
        flags.scopes,
        resolveAuthEnv(serviceName, "scopes"),
        serviceConfig.scopes,
        defaults.scopes
      ),
      ...powerAutomateSettings
    };

    if (nested === "start") {
      const result = createHostedAuthSession(commonOptions);
      if ((flags.format || "text") === "json") {
        printJson(result);
        return;
      }

      console.log(`Started hosted ${result.label} auth session.`);
      console.log(`Session ID: ${result.id}`);
      console.log(`Authorize URL: ${result.authorizeUrl}`);
      console.log(`Expires at: ${result.expiresAt}`);
      console.log("Teams Adaptive Card JSON:");
      printJson(result.teamsCard);
      return;
    }

    if (nested === "complete") {
      const sessionId = requireFlag(flags, "session-id");
      const state = requireFlag(flags, "state");
      const code = requireFlag(flags, "code");
      const result = await completeHostedAuthSession({
        sessionId,
        state,
        code,
        error: flags.error || null,
        errorDescription: flags["error-description"] || null
      });
      printJson(result);
      return;
    }

    if (nested === "status") {
      const sessionId = requireFlag(flags, "session-id");
      const status = getHostedAuthSessionStatus(sessionId);
      if (!status) {
        throw new Error(`No auth session found for ${sessionId}`);
      }
      printJson(status);
      return;
    }

    const result = await loginWithOAuth(commonOptions);
    printJson(result);
    return;
  }

  if (subcommand === "status") {
    printJson({
      authenticated: Boolean(serviceConfig.accessToken),
      service: serviceName,
      tenant: serviceConfig.tenant || null,
      clientId: serviceConfig.clientId || null,
      clientSecretConfigured: Boolean(serviceConfig.clientSecret),
      redirectUri: serviceConfig.redirectUri || null,
      scopes: serviceConfig.scopes || null,
      environmentUrl: serviceConfig.environmentUrl || null,
      apiBaseUrl: serviceConfig.apiBaseUrl || null,
      accessToken: maskToken(serviceConfig.accessToken),
      refreshToken: maskToken(serviceConfig.refreshToken),
      accessTokenExpiresAt: serviceConfig.accessTokenExpiresAt || null,
      refreshTokenExpiresAt: serviceConfig.refreshTokenExpiresAt || null,
      user: serviceConfig.user || null,
      configPath: getConfigPath()
    });
    return;
  }

  if (subcommand === "refresh") {
    const result = await refreshAccessToken(config, { serviceName });
    printJson(result);
    return;
  }

  if (subcommand === "logout") {
    logoutService(serviceName);
    console.log(`Logged out ${serviceName}.`);
    return;
  }

  throw new Error(`Unknown ${getCommandPrefix(serviceName)} subcommand: ${subcommand}`);
}

async function handleGraphMe() {
  printJson(await getMe(loadConfig()));
}

async function handleGraphDrive() {
  printJson(await getMyDriveRoot(loadConfig()));
}

async function handleGraphMessages(flags) {
  const limit = flags.limit ? Number(flags.limit) : 10;
  printJson(await listMyMessages(loadConfig(), { top: limit }));
}

async function handleGetUser(flags) {
  const id = requireFlag(flags, "id");
  printJson(await getUser(loadConfig(), id));
}

function parseQueryFlags(flags) {
  return normalizeList(flags.query).map((entry) => {
    const [key, ...rest] = entry.split("=");
    return [key, rest.join("=")];
  });
}

async function handleGraphRequest(positionals, flags) {
  const method = positionals[0];
  const requestPath = positionals[1];

  if (!method || !requestPath) {
    throw new Error("Usage: graph-api request <method> <path>");
  }

  const body = await loadRequestInput({
    dataJson: flags["data-json"],
    inputPath: flags.input,
    inputRawPath: flags["input-raw"]
  });

  const queryEntries = parseQueryFlags(flags);
  printJson(
    await graphRequest(loadConfig(), {
      method,
      path: requestPath,
      queryEntries,
      body,
      headers: body && typeof body !== "string" ? { "content-type": "application/json" } : {}
    })
  );
}

function resolveEnvironmentOverride(flags) {
  return flags.environment || flags["environment-url"] || null;
}

async function handlePowerAutomateWhoAmI(flags, config) {
  printJson(await whoAmI(config, { environment: resolveEnvironmentOverride(flags) }));
}

async function handlePowerAutomateCapabilityReport(flags, config) {
  printJson(await capabilityReport(config, { environment: resolveEnvironmentOverride(flags) }));
}

async function handlePowerAutomateQuestions(flags) {
  const intent = requireFlag(flags, "intent");
  printJson(listIntentQuestions(intent));
}

async function handlePowerAutomatePlan(positionals) {
  const intent = positionals.join(" ").trim();

  if (!intent) {
    throw new Error('Usage: graph-api power-automate plan "<intent>"');
  }

  printJson(planIntent(intent));
}

async function handlePowerAutomateScaffold(flags, config) {
  const intentJson = requireFlag(flags, "intent-json");
  const structuredIntent = parseJsonFlag(intentJson, "--intent-json");
  const environment = resolveEnvironmentOverride(flags);
  const payload = scaffoldIntent(structuredIntent);
  const outputPath = flags.output;

  if (outputPath) {
    await Bun.write(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  }

  if (flags.apply) {
    printJson(await createFlow(config, payload, { environment }));
    return;
  }

  printJson({ apply: false, environment, payload, output: outputPath || null });
}

async function handlePowerAutomateTemplates(positionals, flags) {
  const subcommand = positionals[0];

  if (subcommand === "list") {
    printJson(listTemplates());
    return;
  }

  if (subcommand === "show") {
    printJson(getTemplate(requireFlag(flags, "id")));
    return;
  }

  if (subcommand === "instantiate") {
    const templateId = requireFlag(flags, "id");
    const params = flags["params-json"] ? parseJsonFlag(flags["params-json"], "--params-json") : {};
    const payload = instantiateTemplatePayload(templateId, params);
    if (flags.output) {
      await Bun.write(flags.output, `${JSON.stringify(payload, null, 2)}\n`);
    }
    printJson(payload);
    return;
  }

  throw new Error(`Unknown power-automate templates subcommand: ${subcommand}`);
}

async function handlePowerAutomateEnvironments(positionals, flags, config) {
  const subcommand = positionals[0];

  if (subcommand === "list") {
    printJson(await listEnvironments(config));
    return;
  }

  if (subcommand === "get") {
    printJson(await getEnvironment(config, requireFlag(flags, "id")));
    return;
  }

  if (subcommand === "resolve") {
    printJson(await resolveEnvironmentByUrl(config, requireFlag(flags, "url")));
    return;
  }

  if (subcommand === "select") {
    printJson(selectEnvironment(config, requireFlag(flags, "id")));
    return;
  }

  throw new Error(`Unknown power-automate environments subcommand: ${subcommand}`);
}

async function handlePowerAutomateConnections(positionals, flags, config) {
  const subcommand = positionals[0];
  const environment = resolveEnvironmentOverride(flags);

  if (subcommand === "list") {
    printJson(await listConnections(config, { environment }));
    return;
  }

  if (subcommand === "get") {
    printJson(await getConnection(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  throw new Error(`Unknown power-automate connections subcommand: ${subcommand}`);
}

async function handlePowerAutomateConnectionReferences(positionals, flags, config) {
  const subcommand = positionals[0];
  const environment = resolveEnvironmentOverride(flags);

  if (subcommand === "list") {
    printJson(await listConnectionReferences(config, { environment }));
    return;
  }

  if (subcommand === "get") {
    printJson(await getConnectionReference(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "bind") {
    printJson(
      await bindConnectionReference(config, {
        id: requireFlag(flags, "id"),
        connectionId: requireFlag(flags, "connection-id"),
        environment
      })
    );
    return;
  }

  throw new Error(`Unknown power-automate connection-references subcommand: ${subcommand}`);
}

async function handlePowerAutomateSolutions(positionals, flags, config) {
  const subcommand = positionals[0];
  const environment = resolveEnvironmentOverride(flags);

  if (subcommand === "list") {
    printJson(await listSolutions(config, { environment }));
    return;
  }

  if (subcommand === "get") {
    printJson(await getSolution(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "flows") {
    const nested = positionals[1];
    if (nested === "list") {
      printJson(
        await listSolutionFlows(config, requireFlag(flags, "solution-id"), { environment })
      );
      return;
    }
  }

  if (subcommand === "add-flow") {
    printJson(
      await addFlowToSolution(config, {
        solutionId: requireFlag(flags, "solution-id"),
        flowId: requireFlag(flags, "flow-id"),
        environment
      })
    );
    return;
  }

  throw new Error(`Unknown power-automate solutions subcommand: ${subcommand}`);
}

async function handlePowerAutomateRuns(positionals, flags, config) {
  const subcommand = positionals[0];
  const environment = resolveEnvironmentOverride(flags);

  if (subcommand === "list") {
    printJson(
      await listRuns(config, requireFlag(flags, "flow-id"), {
        top: flags.top ? Number(flags.top) : 20,
        environment
      })
    );
    return;
  }

  if (subcommand === "get") {
    printJson(await getRun(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  throw new Error(`Unknown power-automate runs subcommand: ${subcommand}`);
}

async function handlePowerAutomateFlows(positionals, flags, config) {
  const subcommand = positionals[0];
  const environment = resolveEnvironmentOverride(flags);

  if (subcommand === "list") {
    printJson(
      await listFlows(config, {
        top: flags.top ? Number(flags.top) : 10,
        state: flags.state || "all",
        environment
      })
    );
    return;
  }

  if (subcommand === "get") {
    printJson(await getFlow(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "doctor") {
    printJson(await diagnoseFlow(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "triggers") {
    printJson(await listFlowTriggers(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "actions") {
    printJson(await listFlowActions(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "dependencies") {
    printJson(await listFlowDependencies(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "export") {
    const payload = await exportFlow(config, requireFlag(flags, "id"), { environment });
    if (flags.output) {
      await Bun.write(flags.output, `${JSON.stringify(payload, null, 2)}\n`);
    }
    printJson(payload);
    return;
  }

  if (subcommand === "import") {
    const payload = await loadPowerAutomateJsonInput(flags.input);
    const result = await importFlow(config, payload, {
      id: flags.id || null,
      apply: Boolean(flags.apply),
      environment
    });
    printJson(result);
    return;
  }

  if (subcommand === "diff") {
    const payload = await loadPowerAutomateJsonInput(flags.input);
    printJson(await diffFlow(config, requireFlag(flags, "id"), payload, { environment }));
    return;
  }

  if (subcommand === "create-scheduled") {
    const result = await createTemplateBackedFlow(config, {
      templateId: "scheduled-basic",
      params: {
        name: requireFlag(flags, "name"),
        schedule: requireFlag(flags, "schedule"),
        message: flags.message || null
      },
      apply: Boolean(flags.apply),
      output: flags.output || null,
      environment
    });
    printJson(result);
    return;
  }

  if (subcommand === "create-teams-alert") {
    const result = await createTemplateBackedFlow(config, {
      templateId: "teams-alert",
      params: {
        name: requireFlag(flags, "name"),
        channel: requireFlag(flags, "channel"),
        summary: flags.summary || null
      },
      apply: Boolean(flags.apply),
      output: flags.output || null,
      environment
    });
    printJson(result);
    return;
  }

  if (subcommand === "create-approval") {
    const result = await createTemplateBackedFlow(config, {
      templateId: "approval",
      params: {
        name: requireFlag(flags, "name"),
        approver: requireFlag(flags, "approver"),
        title: flags.title || null,
        details: flags.details || null
      },
      apply: Boolean(flags.apply),
      output: flags.output || null,
      environment
    });
    printJson(result);
    return;
  }

  if (subcommand === "create") {
    const payload = flags["data-json"]
      ? parseJsonFlag(flags["data-json"], "--data-json")
      : await loadPowerAutomateJsonInput(flags.input);
    printJson(await createFlow(config, payload, { environment }));
    return;
  }

  if (subcommand === "update") {
    const payload = flags["data-json"]
      ? parseJsonFlag(flags["data-json"], "--data-json")
      : await loadPowerAutomateJsonInput(flags.input);
    printJson(await updateFlow(config, requireFlag(flags, "id"), payload, { environment }));
    return;
  }

  if (subcommand === "delete") {
    printJson(await deleteFlow(config, requireFlag(flags, "id"), { environment }));
    return;
  }

  if (subcommand === "on") {
    printJson(await setFlowState(config, requireFlag(flags, "id"), "on", { environment }));
    return;
  }

  if (subcommand === "off") {
    printJson(await setFlowState(config, requireFlag(flags, "id"), "off", { environment }));
    return;
  }

  throw new Error(`Unknown power-automate flows subcommand: ${subcommand}`);
}

async function handlePowerAutomateValidate(flags, config) {
  const payload = await loadPowerAutomateJsonInput(flags.input);
  printJson(validateFlowPayload(payload, { environment: resolveEnvironmentOverride(flags), config }));
}

async function handlePowerAutomatePreflight(flags, config) {
  const payload = await loadPowerAutomateJsonInput(flags.input);
  printJson(
    await preflightFlowPayload(config, payload, { environment: resolveEnvironmentOverride(flags) })
  );
}

async function handlePowerAutomateRequest(positionals, flags, config) {
  const method = positionals[0];
  const requestPath = positionals[1];

  if (!method || !requestPath) {
    throw new Error("Usage: graph-api power-automate request <method> <path>");
  }

  const body = flags["data-json"]
    ? parseJsonFlag(flags["data-json"], "--data-json")
    : flags.input
      ? await loadPowerAutomateJsonInput(flags.input)
      : null;

  printJson(
    await powerAutomateRequest(config, {
      method,
      path: requestPath,
      environment: resolveEnvironmentOverride(flags),
      queryEntries: parseQueryFlags(flags),
      body
    })
  );
}

async function handlePowerAutomate(positionals, flags) {
  const config = loadConfig();
  const subcommand = positionals[0];

  if (!subcommand) {
    throw new Error("Usage: graph-api power-automate <command>");
  }

  if (subcommand === "auth") {
    await handleAuth("powerAutomate", positionals[1], flags, positionals.slice(2));
    return;
  }

  if (subcommand === "whoami") {
    await handlePowerAutomateWhoAmI(flags, config);
    return;
  }

  if (subcommand === "capability-report") {
    await handlePowerAutomateCapabilityReport(flags, config);
    return;
  }

  if (subcommand === "plan") {
    await handlePowerAutomatePlan(positionals.slice(1));
    return;
  }

  if (subcommand === "questions") {
    await handlePowerAutomateQuestions(flags);
    return;
  }

  if (subcommand === "scaffold") {
    await handlePowerAutomateScaffold(flags, config);
    return;
  }

  if (subcommand === "templates") {
    await handlePowerAutomateTemplates(positionals.slice(1), flags);
    return;
  }

  if (subcommand === "environments") {
    await handlePowerAutomateEnvironments(positionals.slice(1), flags, config);
    return;
  }

  if (subcommand === "connections") {
    await handlePowerAutomateConnections(positionals.slice(1), flags, config);
    return;
  }

  if (subcommand === "connection-references") {
    await handlePowerAutomateConnectionReferences(positionals.slice(1), flags, config);
    return;
  }

  if (subcommand === "solutions") {
    await handlePowerAutomateSolutions(positionals.slice(1), flags, config);
    return;
  }

  if (subcommand === "runs") {
    await handlePowerAutomateRuns(positionals.slice(1), flags, config);
    return;
  }

  if (subcommand === "flows") {
    await handlePowerAutomateFlows(positionals.slice(1), flags, config);
    return;
  }

  if (subcommand === "validate") {
    await handlePowerAutomateValidate(flags, config);
    return;
  }

  if (subcommand === "preflight") {
    await handlePowerAutomatePreflight(flags, config);
    return;
  }

  if (subcommand === "request") {
    await handlePowerAutomateRequest(positionals.slice(1), flags, config);
    return;
  }

  throw new Error(`Unknown power-automate subcommand: ${subcommand}`);
}

export async function runCli(argv) {
  const { positionals, flags } = parseArgs(argv);
  const [command, subcommand, ...rest] = positionals;

  if (!command || command === "help" || flags.help) {
    printHelp();
    return;
  }

  if (command === "auth") {
    await handleAuth("graph", subcommand, flags, rest);
    return;
  }

  if (command === "me") {
    if (!subcommand) {
      await handleGraphMe();
      return;
    }

    if (subcommand === "drive") {
      await handleGraphDrive();
      return;
    }

    if (subcommand === "messages") {
      await handleGraphMessages(flags);
      return;
    }
  }

  if (command === "users" && subcommand === "get") {
    await handleGetUser(flags);
    return;
  }

  if (command === "request") {
    await handleGraphRequest([subcommand, ...rest], flags);
    return;
  }

  if (command === "power-automate") {
    await handlePowerAutomate([subcommand, ...rest], flags);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
