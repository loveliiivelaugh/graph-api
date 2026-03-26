import fs from "node:fs";
import { ensureValidAccessToken } from "./auth.js";
import { loadConfig } from "./config.js";

const GRAPH_BASE_URL = "https://graph.microsoft.com";
const DEFAULT_API_VERSION = "v1.0";

function ensureGraphPath(pathname) {
  if (!pathname) {
    throw new Error("A Microsoft Graph path is required.");
  }

  if (/^https?:\/\//i.test(pathname)) {
    return pathname;
  }

  if (!pathname.startsWith("/")) {
    throw new Error("Graph paths must start with '/'. Example: /me or /users");
  }

  return `${GRAPH_BASE_URL}/${DEFAULT_API_VERSION}${pathname}`;
}

export function loadJsonInput(flags) {
  if (flags["data-json"] && flags.input) {
    throw new Error("Provide either --data-json or --input, not both.");
  }

  if (flags["data-json"]) {
    return parseJson(flags["data-json"], "--data-json");
  }

  if (flags.input) {
    const raw = fs.readFileSync(String(flags.input), "utf8");
    return parseJson(raw, "--input");
  }

  return undefined;
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error.message}`);
  }
}

export async function graphRequest({ method = "GET", pathname, query = [], body }) {
  const config = await ensureValidAccessToken(loadConfig());
  const url = new URL(ensureGraphPath(pathname));

  for (const item of query) {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid --query value "${item}". Use key=value.`);
    }

    const key = item.slice(0, separatorIndex);
    const value = item.slice(separatorIndex + 1);
    url.searchParams.append(key, value);
  }

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${config.accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let parsed;

  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const details =
      typeof parsed === "string"
        ? parsed
        : parsed?.error?.message || parsed?.error_description || JSON.stringify(parsed, null, 2);
    throw new Error(`Microsoft Graph request failed (${response.status}): ${details}`);
  }

  return parsed;
}

export async function getMe() {
  return await graphRequest({ pathname: "/me" });
}

export async function getMyDriveRoot() {
  return await graphRequest({ pathname: "/me/drive/root" });
}

export async function listMyMessages(limit = 10) {
  return await graphRequest({
    pathname: "/me/messages",
    query: [`$top=${Number(limit) || 10}`, "$select=id,subject,from,receivedDateTime,isRead,webLink"]
  });
}

export async function getUser(id) {
  return await graphRequest({ pathname: `/users/${encodeURIComponent(id)}` });
}
