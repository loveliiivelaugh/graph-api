import fs from "node:fs";
import path from "node:path";
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

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error.message}`);
  }
}

function inferContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".md" || extension === ".txt") {
    return "text/plain; charset=utf-8";
  }

  if (extension === ".json") {
    return "application/json";
  }

  return "application/octet-stream";
}

export function loadRequestInput(flags) {
  const hasJson = Boolean(flags["data-json"]);
  const hasJsonFile = Boolean(flags.input);
  const hasRawFile = Boolean(flags["input-raw"]);

  const selectedCount = [hasJson, hasJsonFile, hasRawFile].filter(Boolean).length;
  if (selectedCount > 1) {
    throw new Error("Provide only one of --data-json, --input, or --input-raw.");
  }

  if (hasJson) {
    return {
      body: parseJson(flags["data-json"], "--data-json"),
      contentType: "application/json"
    };
  }

  if (hasJsonFile) {
    const raw = fs.readFileSync(String(flags.input), "utf8");
    return {
      body: parseJson(raw, "--input"),
      contentType: "application/json"
    };
  }

  if (hasRawFile) {
    const filePath = String(flags["input-raw"]);
    return {
      body: fs.readFileSync(filePath),
      contentType: inferContentType(filePath)
    };
  }

  return { body: undefined, contentType: undefined };
}

export async function graphRequest({ method = "GET", pathname, query = [], body, contentType }) {
  const config = await ensureValidAccessToken(loadConfig(), { serviceName: "graph" });
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
      ...(body === undefined ? {} : { "content-type": contentType || "application/json" })
    },
    body:
      body === undefined
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : contentType && contentType !== "application/json"
            ? body
            : JSON.stringify(body)
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
