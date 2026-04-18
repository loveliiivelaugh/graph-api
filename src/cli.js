import { parseArgs, normalizeList, requireFlag } from "./args.js";
import {
  getDefaultAuthSettings,
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
  graph-api auth status
  graph-api auth refresh
  graph-api auth logout
  graph-api me
  graph-api me drive
  graph-api me messages [--limit 10]
  graph-api users get --id <user-id-or-upn>
  graph-api request <method> <path> [--query key=value]... [--data-json '{"key":"value"}' | --input file.json | --input-raw file]
  graph-api power-automate auth login --environment-url <url> [--client-id <id>] [--client-secret <secret>] [--tenant <tenant>] [--redirect-uri ${graphDefaults.redirectUri}] [--scopes "<space-delimited scopes>"]
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

async function handleAuth(serviceName, subcommand, flags) {
  const config = loadConfig();
  const serviceConfig = getServiceConfig(config, serviceName);

  if (subcommand === "login") {
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

    const result = await loginWithOAuth({
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
    });

    console.log("Authenticated successfully.");
    printJson({
      service: serviceName,
      tenant: result.tenant,
      redirectUri: result.redirectUri,
      scopes: result.scopes,
      environmentUrl: result.environmentUrl || null,
      apiBaseUrl: result.apiBaseUrl || null,
      user: result.user,
      configPath: getConfigPath()
    });
    return;
  }

  if (subcommand === "status") {
    if (!serviceConfig.accessToken) {
      console.log(
        serviceName === "graph"
          ? "No Microsoft Graph auth is configured."
          : "No Power Automate auth is configured."
      );
      return;
    }

    printJson({
      authenticated: true,
      service: serviceName,
      tenant: serviceConfig.tenant,
      clientId: serviceConfig.clientId,
      clientSecretConfigured: Boolean(serviceConfig.clientSecret),
      redirectUri: serviceConfig.redirectUri,
      scopes: serviceConfig.scopes,
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
    const refreshed = await refreshAccessToken(config, { serviceName });
    printJson({
      service: serviceName,
      tenant: refreshed.tenant,
      scopes: refreshed.scopes,
      environmentUrl: refreshed.environmentUrl || null,
      apiBaseUrl: refreshed.apiBaseUrl || null,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
      user: refreshed.user || null
    });
    return;
  }

  if (subcommand === "logout") {
    logoutService(serviceName);
    console.log(`Deleted local ${serviceName === "graph" ? "Microsoft Graph" : "Power Automate"} auth from ${getConfigPath()}.`);
    return;
  }

  throw new Error(`Unknown ${getCommandPrefix(serviceName)} command "${subcommand}"`);
}

async function handleMe(args, flags) {
  const subcommand = args[0];

  if (!subcommand) {
    printJson(await getMe());
    return;
  }

  if (subcommand === "drive") {
    printJson(await getMyDriveRoot());
    return;
  }

  if (subcommand === "messages") {
    printJson(await listMyMessages(flags.limit || 10));
    return;
  }

  throw new Error(`Unknown me command "${subcommand}"`);
}

async function handleUsers(args, flags) {
  const subcommand = args[0];

  if (subcommand === "get") {
    const id = requireFlag(flags, "id", "Provide the user id or UPN with --id");
    printJson(await getUser(id));
    return;
  }

  throw new Error(`Unknown users command "${subcommand}"`);
}

async function handleRequest(args, flags) {
  const method = args[0];
  const pathname = args[1];

  if (!method || !pathname) {
    throw new Error("Usage: graph-api request <method> <path>");
  }

  const requestInput = loadRequestInput(flags);
  const result = await graphRequest({
    method,
    pathname,
    query: normalizeList(flags.query),
    ...requestInput
  });

  printJson(result);
}

async function handlePowerAutomateFlows(args, flags) {
  const subcommand = args[0];
  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "list") {
    printJson(
      await listFlows({
        top: flags.top || 10,
        state: flags.state || "all",
        query: normalizeList(flags.query),
        environment
      })
    );
    return;
  }

  if (subcommand === "get") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await getFlow(id, normalizeList(flags.query), { environment }));
    return;
  }

  if (subcommand === "doctor") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await diagnoseFlow(id, { query: normalizeList(flags.query), environment }));
    return;
  }

  if (subcommand === "triggers") {
    const nested = args[1];

    if (nested === "list") {
      printJson(
        await listFlowTriggers(requireFlag(flags, "id", "Provide the workflow id with --id"), {
          query: normalizeList(flags.query),
          environment
        })
      );
      return;
    }

    throw new Error(`Unknown power-automate flows triggers command "${nested}"`);
  }

  if (subcommand === "actions") {
    const nested = args[1];

    if (nested === "list") {
      printJson(
        await listFlowActions(requireFlag(flags, "id", "Provide the workflow id with --id"), {
          query: normalizeList(flags.query),
          environment
        })
      );
      return;
    }

    throw new Error(`Unknown power-automate flows actions command "${nested}"`);
  }

  if (subcommand === "dependencies") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await listFlowDependencies(id, { query: normalizeList(flags.query), environment }));
    return;
  }

  if (subcommand === "export") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(
      await exportFlow(id, {
        query: normalizeList(flags.query),
        environment,
        output: flags.output || null
      })
    );
    return;
  }

  if (subcommand === "diff") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    const body = loadPowerAutomateJsonInput(flags);

    if (body === undefined) {
      throw new Error("Provide --data-json or --input with the workflow payload.");
    }

    printJson(await diffFlow(id, body, { environment }));
    return;
  }

  if (subcommand === "import") {
    const body = loadPowerAutomateJsonInput(flags);

    if (body === undefined) {
      throw new Error("Provide --data-json or --input with the workflow payload.");
    }

    printJson(
      await importFlow(body, {
        id: flags.id || null,
        apply: Boolean(flags.apply),
        environment
      })
    );
    return;
  }

  if (subcommand === "create-scheduled") {
    printJson(
      await createTemplateBackedFlow(
        "scheduled-basic",
        {
          name: requireFlag(flags, "name", "Provide the flow name with --name"),
          schedule: requireFlag(flags, "schedule", "Provide the schedule with --schedule"),
          message: flags.message || null,
          description: flags.description || null
        },
        {
          apply: Boolean(flags.apply),
          environment,
          output: flags.output || null
        }
      )
    );
    return;
  }

  if (subcommand === "create-teams-alert") {
    printJson(
      await createTemplateBackedFlow(
        "teams-alert",
        {
          name: requireFlag(flags, "name", "Provide the flow name with --name"),
          channel: requireFlag(flags, "channel", "Provide the Teams channel id with --channel"),
          summary: flags.summary || null,
          description: flags.description || null,
          schedule: flags.schedule || null,
          teamId: flags["team-id"] || null
        },
        {
          apply: Boolean(flags.apply),
          environment,
          output: flags.output || null
        }
      )
    );
    return;
  }

  if (subcommand === "create-approval") {
    printJson(
      await createTemplateBackedFlow(
        "approval",
        {
          name: requireFlag(flags, "name", "Provide the flow name with --name"),
          approver: requireFlag(flags, "approver", "Provide the approver with --approver"),
          title: flags.title || null,
          details: flags.details || null,
          description: flags.description || null,
          schedule: flags.schedule || null
        },
        {
          apply: Boolean(flags.apply),
          environment,
          output: flags.output || null
        }
      )
    );
    return;
  }

  if (subcommand === "create") {
    const body = loadPowerAutomateJsonInput(flags);

    if (body === undefined) {
      throw new Error("Provide --data-json or --input with the workflow payload.");
    }

    printJson(await createFlow(body, { environment }));
    return;
  }

  if (subcommand === "update") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    const body = loadPowerAutomateJsonInput(flags);

    if (body === undefined) {
      throw new Error("Provide --data-json or --input with the update payload.");
    }

    printJson(await updateFlow(id, body, { environment }));
    return;
  }

  if (subcommand === "delete") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await deleteFlow(id, { environment }));
    return;
  }

  if (subcommand === "on") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await setFlowState(id, 1, { environment }));
    return;
  }

  if (subcommand === "off") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await setFlowState(id, 0, { environment }));
    return;
  }

  throw new Error(`Unknown power-automate flows command "${subcommand}"`);
}

async function handlePowerAutomateRequest(args, flags) {
  const method = args[0];
  const pathname = args[1];

  if (!method || !pathname) {
    throw new Error("Usage: graph-api power-automate request <method> <path>");
  }

  printJson(
    await powerAutomateRequest({
      method,
      pathname,
      query: normalizeList(flags.query),
      body: loadPowerAutomateJsonInput(flags),
      environment: flags.environment || flags["environment-url"] || null
    })
  );
}

async function handlePowerAutomateEnvironments(args, flags) {
  const subcommand = args[0];

  if (subcommand === "list") {
    printJson(await listEnvironments({ query: normalizeList(flags.query) }));
    return;
  }

  if (subcommand === "get") {
    const id = requireFlag(flags, "id", "Provide the environment id with --id");
    printJson(await getEnvironment(id, { query: normalizeList(flags.query) }));
    return;
  }

  if (subcommand === "resolve") {
    const url = requireFlag(flags, "url", "Provide the environment URL with --url");
    const environment = await resolveEnvironmentByUrl(url, { query: normalizeList(flags.query) });
    printJson({
      ok: true,
      service: "power-automate",
      environmentId: environment.id,
      environmentUrl: environment.environmentUrl,
      timestamp: new Date().toISOString(),
      item: environment
    });
    return;
  }

  if (subcommand === "select") {
    let environment = null;

    if (flags.id) {
      environment = await resolveActiveEnvironment(flags.id);
    } else if (flags.url) {
      environment = await resolveEnvironmentByUrl(flags.url, { query: normalizeList(flags.query) });
    } else {
      throw new Error("Provide --id or --url to choose the default Power Automate environment.");
    }

    printJson(selectEnvironment(environment));
    return;
  }

  throw new Error(`Unknown power-automate environments command "${subcommand}"`);
}

async function handlePowerAutomateConnections(args, flags) {
  const subcommand = args[0];
  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "list") {
    printJson(await listConnections({ environment, query: normalizeList(flags.query) }));
    return;
  }

  if (subcommand === "get") {
    const id = requireFlag(flags, "id", "Provide the connection id with --id");
    printJson(await getConnection(id, { environment, query: normalizeList(flags.query) }));
    return;
  }

  throw new Error(`Unknown power-automate connections command "${subcommand}"`);
}

async function handlePowerAutomateConnectionReferences(args, flags) {
  const subcommand = args[0];
  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "list") {
    printJson(await listConnectionReferences({ environment, query: normalizeList(flags.query) }));
    return;
  }

  if (subcommand === "get") {
    const id = requireFlag(flags, "id", "Provide the connection reference id with --id");
    printJson(await getConnectionReference(id, { environment, query: normalizeList(flags.query) }));
    return;
  }

  if (subcommand === "bind") {
    const id = requireFlag(flags, "id", "Provide the connection reference id with --id");
    const connectionId = requireFlag(
      flags,
      "connection-id",
      "Provide the connection id with --connection-id"
    );
    printJson(await bindConnectionReference(id, connectionId, { environment }));
    return;
  }

  throw new Error(`Unknown power-automate connection-references command "${subcommand}"`);
}

async function handlePowerAutomateRuns(args, flags) {
  const subcommand = args[0];
  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "list") {
    printJson(
      await listRuns({
        flowId: requireFlag(flags, "flow-id", "Provide the workflow id with --flow-id"),
        top: flags.top || 20,
        query: normalizeList(flags.query),
        environment
      })
    );
    return;
  }

  if (subcommand === "get") {
    printJson(
      await getRun(requireFlag(flags, "id", "Provide the run id with --id"), {
        query: normalizeList(flags.query),
        environment
      })
    );
    return;
  }

  throw new Error(`Unknown power-automate runs command "${subcommand}"`);
}

async function handlePowerAutomateSolutions(args, flags) {
  const subcommand = args[0];
  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "list") {
    printJson(await listSolutions({ environment, query: normalizeList(flags.query) }));
    return;
  }

  if (subcommand === "get") {
    printJson(
      await getSolution(requireFlag(flags, "id", "Provide the solution id with --id"), {
        environment,
        query: normalizeList(flags.query)
      })
    );
    return;
  }

  if (subcommand === "flows") {
    const nested = args[1];

    if (nested === "list") {
      printJson(
        await listSolutionFlows(
          requireFlag(flags, "solution-id", "Provide the solution id with --solution-id"),
          {
            environment,
            query: normalizeList(flags.query)
          }
        )
      );
      return;
    }

    throw new Error(`Unknown power-automate solutions flows command "${nested}"`);
  }

  if (subcommand === "add-flow") {
    printJson(
      await addFlowToSolution(
        requireFlag(flags, "solution-id", "Provide the solution id with --solution-id"),
        requireFlag(flags, "flow-id", "Provide the flow id with --flow-id"),
        { environment }
      )
    );
    return;
  }

  throw new Error(`Unknown power-automate solutions command "${subcommand}"`);
}

async function handlePowerAutomateValidation(subcommand, flags) {
  const body = loadPowerAutomateJsonInput(flags);

  if (body === undefined) {
    throw new Error("Provide --data-json or --input with the workflow payload.");
  }

  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "validate") {
    printJson(await validateFlowPayload(body, { environment }));
    return;
  }

  if (subcommand === "preflight") {
    printJson(await preflightFlowPayload(body, { environment }));
    return;
  }

  throw new Error(`Unknown power-automate validation command "${subcommand}"`);
}

async function handlePowerAutomateIntent(subcommand, args, flags) {
  const environment = flags.environment || flags["environment-url"] || null;

  if (subcommand === "plan") {
    const intent = args.join(" ").trim();

    if (!intent) {
      throw new Error('Usage: graph-api power-automate plan "<intent>"');
    }

    printJson(planIntent(intent));
    return;
  }

  if (subcommand === "questions") {
    const intent = requireFlag(flags, "intent", "Provide the intent text with --intent");
    printJson(listIntentQuestions(intent));
    return;
  }

  if (subcommand === "scaffold") {
    const intentJson = requireFlag(flags, "intent-json", "Provide the intent JSON with --intent-json");
    printJson(
      await scaffoldIntent(parseJsonFlag(intentJson, "--intent-json"), {
        apply: Boolean(flags.apply),
        output: flags.output || null,
        environment
      })
    );
    return;
  }

  throw new Error(`Unknown power-automate intent command "${subcommand}"`);
}

async function handlePowerAutomateTemplates(args, flags) {
  const subcommand = args[0];

  if (subcommand === "list") {
    printJson(listTemplates());
    return;
  }

  if (subcommand === "show") {
    printJson(getTemplate(requireFlag(flags, "id", "Provide the template id with --id")));
    return;
  }

  if (subcommand === "instantiate") {
    const params = flags["params-json"] ? parseJsonFlag(flags["params-json"], "--params-json") : {};
    printJson(
      instantiateTemplatePayload(
        requireFlag(flags, "id", "Provide the template id with --id"),
        params,
        { output: flags.output || null }
      )
    );
    return;
  }

  throw new Error(`Unknown power-automate templates command "${subcommand}"`);
}

async function handlePowerAutomate(args, flags) {
  const subcommand = args[0];

  if (subcommand === "auth") {
    await handleAuth("powerAutomate", args[1], flags);
    return;
  }

  if (subcommand === "flows") {
    await handlePowerAutomateFlows(args.slice(1), flags);
    return;
  }

  if (subcommand === "environments") {
    await handlePowerAutomateEnvironments(args.slice(1), flags);
    return;
  }

  if (subcommand === "connections") {
    await handlePowerAutomateConnections(args.slice(1), flags);
    return;
  }

  if (subcommand === "templates") {
    await handlePowerAutomateTemplates(args.slice(1), flags);
    return;
  }

  if (subcommand === "plan" || subcommand === "questions" || subcommand === "scaffold") {
    await handlePowerAutomateIntent(subcommand, args.slice(1), flags);
    return;
  }

  if (subcommand === "connection-references") {
    await handlePowerAutomateConnectionReferences(args.slice(1), flags);
    return;
  }

  if (subcommand === "runs") {
    await handlePowerAutomateRuns(args.slice(1), flags);
    return;
  }

  if (subcommand === "solutions") {
    await handlePowerAutomateSolutions(args.slice(1), flags);
    return;
  }

  if (subcommand === "validate" || subcommand === "preflight") {
    await handlePowerAutomateValidation(subcommand, flags);
    return;
  }

  if (subcommand === "whoami") {
    printJson(await whoAmI({ environment: flags.environment || flags["environment-url"] || null }));
    return;
  }

  if (subcommand === "capability-report") {
    printJson(
      await capabilityReport({ environment: flags.environment || flags["environment-url"] || null })
    );
    return;
  }

  if (subcommand === "request") {
    await handlePowerAutomateRequest(args.slice(1), flags);
    return;
  }

  throw new Error(`Unknown power-automate command "${subcommand}"`);
}

export async function runCli(argv) {
  const { positionals, flags } = parseArgs(argv);
  const command = positionals[0];

  if (!command || command === "help" || flags.help) {
    printHelp();
    return;
  }

  try {
    if (command === "auth") {
      await handleAuth("graph", positionals[1], flags);
      return;
    }

    if (command === "me") {
      await handleMe(positionals.slice(1), flags);
      return;
    }

    if (command === "users") {
      await handleUsers(positionals.slice(1), flags);
      return;
    }

    if (command === "request") {
      await handleRequest(positionals.slice(1), flags);
      return;
    }

    if (command === "power-automate") {
      await handlePowerAutomate(positionals.slice(1), flags);
      return;
    }

    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
