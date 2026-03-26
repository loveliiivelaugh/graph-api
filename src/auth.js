import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url";
import { loadConfig, saveConfig } from "./config.js";

const DEFAULT_TENANT = "common";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8787/callback";
const DEFAULT_SCOPES = "openid profile offline_access User.Read";

function randomState() {
  return crypto.randomBytes(24).toString("hex");
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

function waitForCallback({ redirectUri, expectedState, timeoutMs = 300000 }) {
  return new Promise((resolve, reject) => {
    const redirectUrl = new URL(redirectUri);

    if (!["127.0.0.1", "localhost"].includes(redirectUrl.hostname)) {
      reject(
        new Error(
          "Automatic login currently supports localhost redirect URIs only. Use --redirect-uri http://127.0.0.1:8787/callback."
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

export function getDefaultAuthSettings() {
  return {
    tenant: DEFAULT_TENANT,
    redirectUri: DEFAULT_REDIRECT_URI,
    scopes: DEFAULT_SCOPES
  };
}

export function buildAuthorizeUrl({
  clientId,
  tenant = DEFAULT_TENANT,
  redirectUri = DEFAULT_REDIRECT_URI,
  scopes = DEFAULT_SCOPES,
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

export async function loginWithOAuth(options) {
  const tenant = options.tenant || DEFAULT_TENANT;
  const redirectUri = options.redirectUri || DEFAULT_REDIRECT_URI;
  const scopes = options.scopes || DEFAULT_SCOPES;
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

  console.log("Open this URL in your browser and authorize the app:");
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

  const claims = decodeJwtClaims(token.id_token);
  const config = loadConfig();
  const nextConfig = {
    ...config,
    tenant,
    redirectUri,
    scopes,
    clientId: options.clientId,
    clientSecret: options.clientSecret || config.clientSecret || null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token || null,
    tokenType: token.token_type || "Bearer",
    accessTokenExpiresAt: buildTokenExpiry(token.expires_in),
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? buildTokenExpiry(token.refresh_token_expires_in)
      : config.refreshTokenExpiresAt || null,
    user: claims
      ? {
          tenantId: claims.tid || null,
          userId: claims.oid || claims.sub || null,
          username: claims.preferred_username || claims.upn || null,
          name: claims.name || null
        }
      : config.user || null
  };

  saveConfig(nextConfig);

  return {
    tenant,
    redirectUri,
    scopes,
    user: nextConfig.user
  };
}

export async function refreshAccessToken(config) {
  if (!config.clientId || !config.refreshToken) {
    throw new Error("Missing client ID or refresh token. Run `graph-api auth login` again.");
  }

  const token = await tokenRequest(config.tenant || DEFAULT_TENANT, {
    grant_type: "refresh_token",
    client_id: config.clientId,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    refresh_token: config.refreshToken,
    scope: config.scopes || DEFAULT_SCOPES
  });

  const claims = decodeJwtClaims(token.id_token || config.idToken);
  const nextConfig = {
    ...config,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || config.refreshToken,
    idToken: token.id_token || config.idToken || null,
    tokenType: token.token_type || config.tokenType || "Bearer",
    accessTokenExpiresAt: buildTokenExpiry(token.expires_in),
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? buildTokenExpiry(token.refresh_token_expires_in)
      : config.refreshTokenExpiresAt || null,
    user: claims
      ? {
          tenantId: claims.tid || null,
          userId: claims.oid || claims.sub || null,
          username: claims.preferred_username || claims.upn || null,
          name: claims.name || null
        }
      : config.user || null
  };

  saveConfig(nextConfig);
  return nextConfig;
}

export async function ensureValidAccessToken(config) {
  if (!config.accessToken) {
    throw new Error("No Microsoft Graph access token found. Run `graph-api auth login` first.");
  }

  const expiresAt = config.accessTokenExpiresAt ? new Date(config.accessTokenExpiresAt).getTime() : 0;
  const threshold = Date.now() + 60000;

  if (!expiresAt || expiresAt <= threshold) {
    return await refreshAccessToken(config);
  }

  return config;
}
