import fs from "node:fs";
import {
  buildDataverseApiBaseUrl,
  ensureValidAccessToken,
  normalizeEnvironmentUrl
} from "./auth.js";
import { loadConfig } from "./config.js";

const DEFAULT_API_VERSION = "v9.2";
const MODERN_FLOW_CATEGORY = 5;

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error.message}`);
  }
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

function ensurePowerAutomateUrl(pathname, config) {
  if (!pathname) {
    throw new Error("A Power Automate Dataverse path is required.");
  }

  if (/^https?:\/\//i.test(pathname)) {
    return pathname;
  }

  if (!pathname.startsWith("/")) {
    throw new Error("Power Automate paths must start with '/'. Example: /workflows");
  }

  const apiBaseUrl =
    config.apiBaseUrl ||
    buildDataverseApiBaseUrl(config.environmentUrl, config.apiVersion || DEFAULT_API_VERSION);
  return `${apiBaseUrl}${pathname}`;
}

function parseResponseBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatRequestError(response, parsed) {
  if (typeof parsed === "string") {
    return parsed;
  }

  return (
    parsed?.error?.message ||
    parsed?.error?.["message"] ||
    parsed?.error_description ||
    JSON.stringify(parsed, null, 2) ||
    `Request failed with status ${response.status}`
  );
}

function extractWorkflowId(entityId) {
  const match = entityId?.match(/\(([^)]+)\)$/);
  return match ? match[1] : null;
}

export async function powerAutomateRequest({
  method = "GET",
  pathname,
  query = [],
  body,
  headers = {}
}) {
  const config = await ensureValidAccessToken(loadConfig(), { serviceName: "powerAutomate" });
  const url = new URL(ensurePowerAutomateUrl(pathname, config));

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
      "odata-maxversion": "4.0",
      "odata-version": "4.0",
      ...headers,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const parsed = parseResponseBody(text);

  if (!response.ok) {
    throw new Error(
      `Power Automate request failed (${response.status}): ${formatRequestError(response, parsed)}`
    );
  }

  if (parsed !== null) {
    return parsed;
  }

  const entityId = response.headers.get("odata-entityid");
  return {
    ok: true,
    status: response.status,
    entityId,
    workflowId: extractWorkflowId(entityId)
  };
}

function buildStateFilter(state) {
  if (!state || state === "all") {
    return null;
  }

  const normalized = String(state).toLowerCase();
  const map = {
    on: 1,
    active: 1,
    off: 0,
    draft: 0,
    suspended: 2
  };

  if (!(normalized in map)) {
    throw new Error("Invalid --state. Use on, off, suspended, or all.");
  }

  return `statecode eq ${map[normalized]}`;
}

export function resolvePowerAutomateSettings(flags, config) {
  const serviceConfig = config.services?.powerAutomate || {};
  const rawEnvironmentUrl =
    flags["environment-url"] ||
    process.env.POWER_AUTOMATE_ENVIRONMENT_URL ||
    serviceConfig.environmentUrl ||
    null;
  const environmentUrl = rawEnvironmentUrl ? normalizeEnvironmentUrl(rawEnvironmentUrl) : null;
  const apiVersion =
    flags["api-version"] ||
    process.env.POWER_AUTOMATE_API_VERSION ||
    serviceConfig.apiVersion ||
    DEFAULT_API_VERSION;

  return {
    environmentUrl,
    apiVersion,
    apiBaseUrl: environmentUrl ? buildDataverseApiBaseUrl(environmentUrl, apiVersion) : null
  };
}

export async function listFlows({ top = 10, state, query = [] } = {}) {
  const filters = [`category eq ${MODERN_FLOW_CATEGORY}`];
  const stateFilter = buildStateFilter(state);

  if (stateFilter) {
    filters.push(stateFilter);
  }

  return await powerAutomateRequest({
    pathname: "/workflows",
    query: [
      `$filter=${filters.join(" and ")}`,
      "$select=category,clientdata,createdon,description,ismanaged,modifiedon,name,statecode,type,workflowid,workflowidunique",
      "$orderby=modifiedon desc",
      `$top=${Number(top) || 10}`,
      ...query
    ],
    headers: {
      Prefer: 'odata.include-annotations="*"'
    }
  });
}

export async function getFlow(id, query = []) {
  return await powerAutomateRequest({
    pathname: `/workflows(${id})`,
    query,
    headers: {
      Prefer: 'odata.include-annotations="*"'
    }
  });
}

export async function createFlow(body) {
  return await powerAutomateRequest({
    method: "POST",
    pathname: "/workflows",
    body
  });
}

export async function updateFlow(id, body) {
  return await powerAutomateRequest({
    method: "PATCH",
    pathname: `/workflows(${id})`,
    body,
    headers: {
      "if-match": "*"
    }
  });
}

export async function deleteFlow(id) {
  return await powerAutomateRequest({
    method: "DELETE",
    pathname: `/workflows(${id})`
  });
}

export async function setFlowState(id, statecode) {
  return await updateFlow(id, { statecode });
}
