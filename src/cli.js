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
  createFlow,
  deleteFlow,
  getFlow,
  listFlows,
  loadJsonInput as loadPowerAutomateJsonInput,
  powerAutomateRequest,
  resolvePowerAutomateSettings,
  setFlowState,
  updateFlow
} from "./power-automate.js";

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
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
  graph-api power-automate flows list [--top 10] [--state on|off|suspended|all]
  graph-api power-automate flows get --id <workflow-id>
  graph-api power-automate flows create [--data-json '{"name":"..."}' | --input flow.json]
  graph-api power-automate flows update --id <workflow-id> [--data-json '{"description":"..."}' | --input patch.json]
  graph-api power-automate flows delete --id <workflow-id>
  graph-api power-automate flows on --id <workflow-id>
  graph-api power-automate flows off --id <workflow-id>
  graph-api power-automate request <method> <path> [--query key=value]... [--data-json '{"key":"value"}' | --input body.json]

Examples:
  graph-api auth login --client-id <app-client-id>
  graph-api me
  graph-api request GET /me
  graph-api request PUT /me/drive/root:/OpenClaw/notes.md:/content --input-raw ./notes.md
  graph-api power-automate auth login --client-id <app-client-id> --environment-url https://contoso.crm.dynamics.com
  graph-api power-automate flows list --state on
  graph-api power-automate request GET /workflows --query '$top=5'

Notes:
  - Power Automate flow management uses the Dataverse Web API, not the unsupported api.flow.microsoft.com endpoint
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

  if (subcommand === "list") {
    printJson(
      await listFlows({
        top: flags.top || 10,
        state: flags.state || "all",
        query: normalizeList(flags.query)
      })
    );
    return;
  }

  if (subcommand === "get") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await getFlow(id, normalizeList(flags.query)));
    return;
  }

  if (subcommand === "create") {
    const body = loadPowerAutomateJsonInput(flags);

    if (body === undefined) {
      throw new Error("Provide --data-json or --input with the workflow payload.");
    }

    printJson(await createFlow(body));
    return;
  }

  if (subcommand === "update") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    const body = loadPowerAutomateJsonInput(flags);

    if (body === undefined) {
      throw new Error("Provide --data-json or --input with the update payload.");
    }

    printJson(await updateFlow(id, body));
    return;
  }

  if (subcommand === "delete") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await deleteFlow(id));
    return;
  }

  if (subcommand === "on") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await setFlowState(id, 1));
    return;
  }

  if (subcommand === "off") {
    const id = requireFlag(flags, "id", "Provide the workflow id with --id");
    printJson(await setFlowState(id, 0));
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
      body: loadPowerAutomateJsonInput(flags)
    })
  );
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
