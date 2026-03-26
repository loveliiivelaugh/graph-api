import { parseArgs, normalizeList, requireFlag } from "./args.js";
import {
  getDefaultAuthSettings,
  loginWithOAuth,
  refreshAccessToken
} from "./auth.js";
import {
  deleteConfig,
  getConfigPath,
  loadConfig,
  maskToken,
  resolveSetting
} from "./config.js";
import {
  getMe,
  getMyDriveRoot,
  getUser,
  graphRequest,
  listMyMessages,
  loadJsonInput
} from "./graph-api.js";

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  const defaults = getDefaultAuthSettings();

  console.log(`
graph-api

Usage:
  graph-api help
  graph-api auth login [--client-id <id>] [--client-secret <secret>] [--tenant common|organizations|consumers|<tenant-id>] [--redirect-uri ${defaults.redirectUri}] [--scopes "${defaults.scopes}"]
  graph-api auth status
  graph-api auth refresh
  graph-api auth logout
  graph-api me
  graph-api me drive
  graph-api me messages [--limit 10]
  graph-api users get --id <user-id-or-upn>
  graph-api request <method> <path> [--query key=value]... [--data-json '{"key":"value"}' | --input file.json]

Examples:
  graph-api auth login --client-id <app-client-id>
  graph-api me
  graph-api me drive
  graph-api me messages --limit 5
  graph-api users get --id user@contoso.com
  graph-api request GET /me
  graph-api request GET /me/events --query '$top=5'

Notes:
  - register the app in Microsoft Entra ID first and add a desktop/mobile redirect URI
  - for a system-browser desktop flow, Microsoft recommends http://localhost style redirects
  - if your app registration is configured as a web/confidential client, pass --client-secret or set GRAPH_CLIENT_SECRET
  - the CLI stores tokens at ~/.config/graph-api-cli/config.json and refreshes access tokens automatically
  - default scopes are delegated scopes for a signed-in user flow; add more as needed on login
`.trim());
}

async function handleAuth(subcommand, flags) {
  const defaults = getDefaultAuthSettings();
  const config = loadConfig();

  if (subcommand === "login") {
    const clientId = resolveSetting(flags["client-id"], process.env.GRAPH_CLIENT_ID, config.clientId);

    if (!clientId) {
      throw new Error("Provide --client-id or set GRAPH_CLIENT_ID.");
    }

    const result = await loginWithOAuth({
      clientId,
      clientSecret: resolveSetting(
        flags["client-secret"],
        process.env.GRAPH_CLIENT_SECRET,
        config.clientSecret
      ),
      tenant: resolveSetting(flags.tenant, process.env.GRAPH_TENANT, config.tenant, defaults.tenant),
      redirectUri: resolveSetting(
        flags["redirect-uri"],
        process.env.GRAPH_REDIRECT_URI,
        config.redirectUri,
        defaults.redirectUri
      ),
      scopes: resolveSetting(flags.scopes, process.env.GRAPH_SCOPES, config.scopes, defaults.scopes)
    });

    console.log("Authenticated successfully.");
    printJson({
      tenant: result.tenant,
      redirectUri: result.redirectUri,
      scopes: result.scopes,
      user: result.user,
      configPath: getConfigPath()
    });
    return;
  }

  if (subcommand === "status") {
    if (!config.accessToken) {
      console.log("No Microsoft Graph auth is configured.");
      return;
    }

    printJson({
      authenticated: true,
      tenant: config.tenant,
      clientId: config.clientId,
      clientSecretConfigured: Boolean(config.clientSecret),
      redirectUri: config.redirectUri,
      scopes: config.scopes,
      accessToken: maskToken(config.accessToken),
      refreshToken: maskToken(config.refreshToken),
      accessTokenExpiresAt: config.accessTokenExpiresAt || null,
      refreshTokenExpiresAt: config.refreshTokenExpiresAt || null,
      user: config.user || null,
      configPath: getConfigPath()
    });
    return;
  }

  if (subcommand === "refresh") {
    const refreshed = await refreshAccessToken(config);
    printJson({
      tenant: refreshed.tenant,
      scopes: refreshed.scopes,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
      user: refreshed.user || null
    });
    return;
  }

  if (subcommand === "logout") {
    deleteConfig();
    console.log("Deleted local Graph API CLI config.");
    return;
  }

  throw new Error(`Unknown auth command "${subcommand}"`);
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

  const result = await graphRequest({
    method,
    pathname,
    query: normalizeList(flags.query),
    body: loadJsonInput(flags)
  });

  printJson(result);
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
      await handleAuth(positionals[1], flags);
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

    throw new Error(`Unknown command "${command}"`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
