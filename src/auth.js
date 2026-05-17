import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { URL } from "node:url";
import {
  clearServiceConfig,
  getServiceConfig,
  deleteConfig,
  loadConfig,
  saveConfig,
  setServiceConfig
} from "./config.js";

const DEFAULT_TENANT = "common";
const DEFAULT_REDIRECT_URI = "http://localhost:8787/callback";
const GRAPH_DEFAULT_SCOPES = "openid profile offline_access User.Read";
const AUTH_SESSION_DIR = path.join(os.homedir(), ".config", "graph-api-cli", "auth-sessions");
const AUTH_SESSION_TTL_MS = 15 * 60 * 1000;

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

function randomSessionId() {
  return crypto.randomBytes(18).toString("hex");
}

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function buildTokenExpiry(expiresInSeconds) {
  return new Date(Date.now() + Number(expiresInSeconds || 0) * 1000).toISOString();
}

function getAuthorityBase(tenant = DEFAULT_TENANT) {
  return `https://login.microsoftonline.com/${tenant}`;
}

export function normalizeEnvironmentUrl(environmentUrl) {
  if (!environmentUrl) {
    return null;
  }

  const normalized = new URL(environmentUrl);
  return normalized.origin;
}

export function buildDataverseApiBaseUrl(environmentUrl, apiVersion = "v9.2") {
  const normalizedEnvironmentUrl = normalizeEnvironmentUrl(environmentUrl);

  if (!normalizedEnvironmentUrl) {
    throw new Error(
      "Power Automate requires --environment-url (or POWER_AUTOMATE_ENVIRONMENT_URL) set to your Dataverse environment URL."
    );
  }

  return `${normalizedEnvironmentUrl}/api/data/${apiVersion}`;
}

function getDefaultScopes(serviceName, options = {}) {
  if (serviceName === "powerAutomate") {
    const normalizedEnvironmentUrl = normalizeEnvironmentUrl(options.environmentUrl);

    if (!normalizedEnvironmentUrl) {
      throw new Error(
        "Power Automate login requires --environment-url so the CLI can request the Dataverse user_impersonation scope."
      );
    }

    return `openid profile offline_access ${normalizedEnvironmentUrl}/user_impersonation`;
  }

  return GRAPH_DEFAULT_SCOPES;
}

async function tokenRequest(tenant, params) {
  const response = await fetch(`${getAuthorityBase(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body?.error_description || body?.error || `Token request failed with status ${response.status}`
    );
  }

  return body;
}

function ensureAuthSessionDir() {
  if (!fs.existsSync(AUTH_SESSION_DIR)) {
    fs.mkdirSync(AUTH_SESSION_DIR, { recursive: true, mode: 0o700 });
  }
}

function getAuthSessionPath(sessionId) {
  return path.join(AUTH_SESSION_DIR, `${sessionId}.json`);
}

function saveAuthSession(session) {
  ensureAuthSessionDir();
  fs.writeFileSync(getAuthSessionPath(session.id), `${JSON.stringify(session, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

function loadAuthSession(sessionId) {
  const filePath = getAuthSessionPath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function deleteAuthSession(sessionId) {
  const filePath = getAuthSessionPath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function cleanupExpiredAuthSessions(now = Date.now()) {
  if (!fs.existsSync(AUTH_SESSION_DIR)) {
    return;
  }

  for (const name of fs.readdirSync(AUTH_SESSION_DIR)) {
    if (!name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(AUTH_SESSION_DIR, name);
    try {
      const session = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const createdAt = Date.parse(session.createdAt || 0);
      const expiresAt = Date.parse(session.expiresAt || 0);
      if ((expiresAt && expiresAt < now) || (createdAt && now - createdAt > AUTH_SESSION_TTL_MS * 4)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      fs.unlinkSync(filePath);
    }
  }
}

function isLocalhostRedirectUri(redirectUri) {
  const redirectUrl = new URL(redirectUri);
  return ["127.0.0.1", "localhost"].includes(redirectUrl.hostname);
}

function waitForCallback({ redirectUri, expectedState, timeoutMs = 300000 }) {
  return new Promise((resolve, reject) => {
    const redirectUrl = new URL(redirectUri);

    if (!isLocalhostRedirectUri(redirectUri)) {
      reject(
        new Error(
          "Automatic login currently supports localhost redirect URIs only. Use --redirect-uri http://localhost:8787/callback or start a hosted auth session."
        )
      );
      return;
    }

    const server = http.createServer((request, response) => {
      const requestUrl = new URL(request.url, `${redirectUrl.protocol}//${request.headers.host}`);

      if (requestUrl.pathname !== redirectUrl.pathname) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }

      const state = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");
      const errorDescription = requestUrl.searchParams.get("error_description");

      if (error) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end(`Microsoft login failed: ${error}`);
        cleanup(new Error(errorDescription || error));
        return;
      }

      if (state !== expectedState) {
        response.writeHead(400, { "content-type": "text/plain" });
        response.end("State mismatch");
        cleanup(new Error("OAuth state mismatch"));
        return;
      }

      response.writeHead(200, { "content-type": "text/plain" });
      response.end("Graph API CLI authentication complete. You can close this tab.");
      cleanup(null, { code });
    });

    const timeout = setTimeout(() => {
      cleanup(new Error("Timed out waiting for the Microsoft OAuth callback"));
    }, timeoutMs);

    function cleanup(error, result) {
      clearTimeout(timeout);
      server.close(() => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      });
    }

    server.listen(Number(redirectUrl.port), redirectUrl.hostname);
  });
}

function decodeJwtClaims(token) {
  if (!token) {
    return null;
  }

  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function getServiceLabel(serviceName) {
  return serviceName === "powerAutomate" ? "Power Automate" : "Microsoft Graph";
}

function buildUserClaims(tokenClaims, fallbackUser) {
  if (!tokenClaims) {
    return fallbackUser || null;
  }

  return {
    tenantId: tokenClaims.tid || null,
    userId: tokenClaims.oid || tokenClaims.sub || null,
    username: tokenClaims.preferred_username || tokenClaims.upn || null,
    name: tokenClaims.name || null
  };
}

function buildStoredServiceConfig(serviceName, options, token, existingServiceConfig) {
  const claims = decodeJwtClaims(token.id_token || existingServiceConfig.idToken);
  const nextServiceConfig = {
    ...existingServiceConfig,
    tenant: options.tenant,
    redirectUri: callbackUrl.toString(),
    scopes: options.scopes,
    clientId: options.clientId,
    clientSecret: options.clientSecret || existingServiceConfig.clientSecret || null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || existingServiceConfig.refreshToken,
    idToken: token.id_token || existingServiceConfig.idToken || null,
    tokenType: token.token_type || existingServiceConfig.tokenType || "Bearer",
    accessTokenExpiresAt: buildTokenExpiry(token.expires_in),
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? buildTokenExpiry(token.refresh_token_expires_in)
      : existingServiceConfig.refreshTokenExpiresAt || null,
    user: buildUserClaims(claims, existingServiceConfig.user)
  };

  if (serviceName === "powerAutomate") {
    nextServiceConfig.environmentUrl = normalizeEnvironmentUrl(options.environmentUrl);
    nextServiceConfig.apiVersion = options.apiVersion || existingServiceConfig.apiVersion || "v9.2";
    nextServiceConfig.apiBaseUrl = buildDataverseApiBaseUrl(
      options.environmentUrl,
      nextServiceConfig.apiVersion
    );
  }

  return nextServiceConfig;
}

function storeOAuthResult(serviceName, options, token) {
  const config = loadConfig();
  const existingServiceConfig = getServiceConfig(config, serviceName);
  const nextServiceConfig = buildStoredServiceConfig(serviceName, options, token, existingServiceConfig);
  saveConfig(setServiceConfig(config, serviceName, nextServiceConfig));
  return nextServiceConfig;
}

export function getDefaultAuthSettings(serviceName = "graph", options = {}) {
  return {
    tenant: DEFAULT_TENANT,
    redirectUri: DEFAULT_REDIRECT_URI,
    scopes: getDefaultScopes(serviceName, options)
  };
}

export function buildAuthorizeUrl({
  clientId,
  tenant = DEFAULT_TENANT,
  redirectUri = DEFAULT_REDIRECT_URI,
  scopes = GRAPH_DEFAULT_SCOPES,
  state,
  codeChallenge
}) {
  const url = new URL(`${getAuthorityBase(tenant)}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function createHostedAuthSession(options) {
  cleanupExpiredAuthSessions();

  if (!options.redirectUri || isLocalhostRedirectUri(options.redirectUri)) {
    throw new Error(
      "Hosted auth sessions require a public callback URL. Pass --redirect-uri https://<your-host>/callback or set GRAPH_REDIRECT_URI / POWER_AUTOMATE_REDIRECT_URI accordingly."
    );
  }

  const serviceName = options.serviceName || "graph";
  const tenant = options.tenant || DEFAULT_TENANT;
  const scopes = options.scopes || getDefaultScopes(serviceName, options);
  const state = randomState();
  const pkce = createPkcePair();
  const sessionId = randomSessionId();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_MS).toISOString();
  const callbackUrl = new URL(options.redirectUri);
  callbackUrl.searchParams.set("session_id", sessionId);
  const authorizeUrl = buildAuthorizeUrl({
    clientId: options.clientId,
    tenant,
    redirectUri: callbackUrl.toString(),
    scopes,
    state,
    codeChallenge: pkce.challenge
  });

  const session = {
    id: sessionId,
    createdAt,
    expiresAt,
    status: "pending",
    serviceName,
    tenant,
    redirectUri: options.redirectUri,
    scopes,
    clientId: options.clientId,
    clientSecret: options.clientSecret || null,
    environmentUrl: options.environmentUrl || null,
    apiVersion: options.apiVersion || null,
    state,
    pkceVerifier: pkce.verifier,
    authorizeUrl,
    label: getServiceLabel(serviceName)
  };

  saveAuthSession(session);
  return {
    ...session,
    teamsCard: {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "TextBlock",
          size: "Medium",
          weight: "Bolder",
          text: `Sign in to ${session.label}`
        },
        {
          type: "TextBlock",
          wrap: true,
          text: `Tap below to authenticate ${session.label}. This login session expires in 15 minutes.`
        }
      ],
      actions: [
        {
          type: "Action.OpenUrl",
          title: `Sign in to ${session.label}`,
          url: authorizeUrl
        }
      ]
    }
  };
}

export async function completeHostedAuthSession({ sessionId, state, code, error, errorDescription }) {
  cleanupExpiredAuthSessions();
  const session = loadAuthSession(sessionId);

  if (!session) {
    throw new Error("Auth session not found or already completed.");
  }

  if (Date.parse(session.expiresAt) < Date.now()) {
    deleteAuthSession(sessionId);
    throw new Error("Auth session expired. Start login again.");
  }

  if (error) {
    session.status = "error";
    session.error = errorDescription || error;
    session.completedAt = new Date().toISOString();
    saveAuthSession(session);
    throw new Error(errorDescription || error);
  }

  if (state !== session.state) {
    throw new Error("OAuth state mismatch");
  }

  const token = await tokenRequest(session.tenant || DEFAULT_TENANT, {
    grant_type: "authorization_code",
    client_id: session.clientId,
    ...(session.clientSecret ? { client_secret: session.clientSecret } : {}),
    code,
    redirect_uri: session.redirectUri,
    code_verifier: session.pkceVerifier,
    scope: session.scopes
  });

  const nextServiceConfig = storeOAuthResult(
    session.serviceName,
    {
      serviceName: session.serviceName,
      tenant: session.tenant,
      redirectUri: session.redirectUri,
      scopes: session.scopes,
      clientId: session.clientId,
      clientSecret: session.clientSecret,
      environmentUrl: session.environmentUrl,
      apiVersion: session.apiVersion
    },
    token
  );

  session.status = "complete";
  session.completedAt = new Date().toISOString();
  session.user = nextServiceConfig.user || null;
  saveAuthSession(session);

  return {
    ok: true,
    sessionId,
    service: session.serviceName,
    user: nextServiceConfig.user || null,
    accessTokenExpiresAt: nextServiceConfig.accessTokenExpiresAt || null,
    configPath: path.join(os.homedir(), ".config", "graph-api-cli", "config.json")
  };
}

export function getHostedAuthSessionStatus(sessionId) {
  cleanupExpiredAuthSessions();
  const session = loadAuthSession(sessionId);
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: session.status,
    serviceName: session.serviceName,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    completedAt: session.completedAt || null,
    error: session.error || null,
    user: session.user || null,
    authorizeUrl: session.authorizeUrl
  };
}

export async function loginWithOAuth(options) {
  const serviceName = options.serviceName || "graph";
  const tenant = options.tenant || DEFAULT_TENANT;
  const redirectUri = options.redirectUri || DEFAULT_REDIRECT_URI;
  const scopes = options.scopes || getDefaultScopes(serviceName, options);
  const state = randomState();
  const pkce = createPkcePair();
  const authorizeUrl = buildAuthorizeUrl({
    clientId: options.clientId,
    tenant,
    redirectUri,
    scopes,
    state,
    codeChallenge: pkce.challenge
  });

  console.log(`Open this URL in your browser and authorize the ${getServiceLabel(serviceName)} app:`);
  console.log(authorizeUrl);
  console.log("");
  console.log("Waiting for the OAuth callback...");

  const callback = await waitForCallback({ redirectUri, expectedState: state });
  const token = await tokenRequest(tenant, {
    grant_type: "authorization_code",
    client_id: options.clientId,
    ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
    code: callback.code,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
    scope: scopes
  });

  return storeOAuthResult(
    serviceName,
    {
      ...options,
      tenant,
      redirectUri,
      scopes
    },
    token
  );
}

export async function getAccessTokenForScopes(config, options = {}) {
  const serviceName = options.serviceName || "graph";
  const scopes = options.scopes || null;
  const nextConfig = await ensureValidAccessToken(config, { serviceName });
  if (!scopes) {
    return nextConfig.accessToken;
  }

  const granted = new Set(String(nextConfig.scopes || "").split(/\s+/).filter(Boolean));
  const needed = String(scopes).split(/\s+/).filter(Boolean);
  const missing = needed.filter((scope) => !granted.has(scope));
  if (missing.length > 0) {
    throw new Error(
      `Stored ${getServiceLabel(serviceName)} token is missing required scopes: ${missing.join(", ")}. Run login again with broader scopes.`
    );
  }

  return nextConfig.accessToken;
}

export async function refreshAccessToken(config, options = {}) {
  const serviceName = options.serviceName || "graph";
  const serviceConfig = getServiceConfig(config, serviceName);

  if (!serviceConfig.clientId || !serviceConfig.refreshToken) {
    throw new Error(
      `Missing client ID or refresh token for ${getServiceLabel(serviceName)}. Run \`graph-api ${serviceName === "graph" ? "auth" : "power-automate auth"} login\` again.`
    );
  }

  const token = await tokenRequest(serviceConfig.tenant || DEFAULT_TENANT, {
    grant_type: "refresh_token",
    client_id: serviceConfig.clientId,
    ...(serviceConfig.clientSecret ? { client_secret: serviceConfig.clientSecret } : {}),
    refresh_token: serviceConfig.refreshToken,
    ...(serviceConfig.scopes ? { scope: serviceConfig.scopes } : {})
  });

  const nextServiceConfig = {
    ...serviceConfig,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || serviceConfig.refreshToken,
    idToken: token.id_token || serviceConfig.idToken || null,
    tokenType: token.token_type || serviceConfig.tokenType || "Bearer",
    accessTokenExpiresAt: buildTokenExpiry(token.expires_in),
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? buildTokenExpiry(token.refresh_token_expires_in)
      : serviceConfig.refreshTokenExpiresAt || null
  };

  const nextConfig = setServiceConfig(config, serviceName, nextServiceConfig);
  saveConfig(nextConfig);
  return nextServiceConfig;
}

export async function ensureValidAccessToken(config, options = {}) {
  const serviceName = options.serviceName || "graph";
  const serviceConfig = getServiceConfig(config, serviceName);

  if (!serviceConfig.accessToken) {
    throw new Error(
      `No access token stored for ${getServiceLabel(serviceName)}. Run \`graph-api ${serviceName === "graph" ? "auth" : "power-automate auth"} login\`.`
    );
  }

  const expiresAt = serviceConfig.accessTokenExpiresAt
    ? Date.parse(serviceConfig.accessTokenExpiresAt)
    : null;

  if (expiresAt && expiresAt - Date.now() > 60_000) {
    return serviceConfig;
  }

  return await refreshAccessToken(config, { serviceName });
}

export function logoutService(serviceName = "graph") {
  const config = loadConfig();
  const nextConfig = clearServiceConfig(config, serviceName);

  if (Object.keys(nextConfig).length === 0) {
    deleteConfig();
    return;
  }

  saveConfig(nextConfig);
}
