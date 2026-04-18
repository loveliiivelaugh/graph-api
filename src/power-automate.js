import fs from "node:fs";
import {
  buildDataverseApiBaseUrl,
  getAccessTokenForScopes,
  normalizeEnvironmentUrl
} from "./auth.js";
import { loadConfig, saveConfig, setServiceConfig, getServiceConfig } from "./config.js";
import {
  getTemplate as getTemplateDefinition,
  instantiateTemplate,
  listTemplates as listTemplateDefinitions
} from "./power-automate-templates.js";
import {
  buildIntentPlan,
  buildIntentQuestions,
  buildScaffoldInput
} from "./power-automate-intents.js";

const DEFAULT_API_VERSION = "v9.2";
const POWER_PLATFORM_API_VERSION = "2022-03-01-preview";
const POWER_PLATFORM_BASE_URL = "https://api.powerplatform.com";
const POWER_PLATFORM_SCOPE = "https://api.powerplatform.com/.default";
const MODERN_FLOW_CATEGORY = 5;
const SOLUTION_COMPONENT_TYPE_WORKFLOW = 29;

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON for ${label}: ${error.message}`);
  }
}

function normalizeEnvironmentType(value) {
  return value ? String(value).toLowerCase() : null;
}

function buildEnvelope(payload = {}, environment = null) {
  return {
    ok: true,
    service: "power-automate",
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null,
    timestamp: new Date().toISOString(),
    ...payload
  };
}

function mapFlowRun(item = {}, environment = null) {
  return {
    id: item.flowrunid || item.name || null,
    flowId: item.workflowid || item._workflow_value || null,
    status: item.status || null,
    startedAt: item.starttime || item.createdon || null,
    endedAt: item.endtime || null,
    triggerName: item.triggertype || null,
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null,
    durationMs: item.duration ?? null,
    errorCode: item.errorcode || null,
    errorMessage: item.errormessage || null,
    parentRunId: item.parentrunid || null
  };
}

function mapConnector(item = {}, environment = null) {
  return {
    id: item.id || item.name || null,
    name: item.properties?.displayName || item.name || null,
    type: item.type || null,
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null,
    publisher: item.properties?.publisher || null,
    tier: item.properties?.tier || null,
    isCustom: Boolean(item.properties?.isCustomApi),
    capabilities: item.properties?.capabilities || []
  };
}

function mapConnection(item = {}, environment = null) {
  return {
    id: item.id || item.name || null,
    name: item.properties?.displayName || item.name || null,
    connectorId: item.properties?.apiId || item.properties?.connectorId || null,
    connectorName: item.properties?.apiName || null,
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null,
    status: item.properties?.statuses?.[0]?.status || item.properties?.overallStatus || null,
    createdAt: item.properties?.createdTime || null,
    changedAt: item.properties?.changedTime || null,
    owner: item.properties?.authenticatedUser || null
  };
}

function mapConnectionReference(item = {}, environment = null) {
  return {
    id: item.connectionreferenceid || null,
    logicalName: item.connectionreferencelogicalname || null,
    displayName: item.connectionreferencedisplayname || null,
    connectorId: item.connectorid || null,
    connectionId: item.connectionid || null,
    state: Number(item.statecode) === 0 ? "active" : "inactive",
    description: item.description || null,
    createdAt: item.createdon || null,
    modifiedAt: item.modifiedon || null,
    ownerId: item._ownerid_value || null,
    solutionId: item.solutionid || null,
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null
  };
}

function mapSolution(item = {}, environment = null) {
  return {
    id: item.solutionid || null,
    uniqueName: item.uniquename || null,
    name: item.friendlyname || item.uniquename || null,
    version: item.version || null,
    isManaged: Boolean(item.ismanaged),
    createdAt: item.createdon || null,
    modifiedAt: item.modifiedon || item.updatedon || null,
    description: item.description || null,
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null
  };
}

function mapFlow(item = {}, environment = null) {
  return {
    id: item.workflowid || item.workflowidunique || null,
    name: item.name || null,
    state: Number(item.statecode) === 1 ? "on" : "off",
    solutionId: item.solutionid || null,
    createdAt: item.createdon || null,
    modifiedAt: item.modifiedon || null,
    connectorRefs: extractFlowConnectionReferenceKeys(item),
    environmentId: environment?.id || null,
    environmentUrl: environment?.environmentUrl || null
  };
}

function normalizeFlowPayload(body = {}) {
  return {
    name: body.name || null,
    category: body.category ?? null,
    type: body.type ?? null,
    primaryentity: body.primaryentity || null,
    description: body.description || null,
    statecode: body.statecode ?? null,
    clientdata: body.clientdata || null
  };
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractFlowConnectionReferenceKeys(flow) {
  const clientdata = safeJsonParse(flow?.clientdata);
  const connectionReferences = clientdata?.properties?.connectionReferences || clientdata?.connectionReferences;

  if (!connectionReferences || typeof connectionReferences !== "object") {
    return [];
  }

  return Object.keys(connectionReferences);
}

function summarizeLikelyGaps(items) {
  return items.filter(Boolean);
}

function buildFinding(code, message, severity = "error", details = null) {
  return { code, message, severity, ...(details ? { details } : {}) };
}

function collectEnvironmentUrls(value, result = new Set()) {
  if (!value) {
    return result;
  }

  if (typeof value === "string") {
    const matches = value.match(/https:\/\/[a-z0-9.-]+\.crm\d*\.dynamics\.com/gi) || [];
    for (const match of matches) {
      result.add(normalizeEnvironmentUrl(match));
    }

    return result;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectEnvironmentUrls(item, result);
    }

    return result;
  }

  if (typeof value === "object") {
    for (const item of Object.values(value)) {
      collectEnvironmentUrls(item, result);
    }
  }

  return result;
}

function getClientDataDefinition(clientdata) {
  return (
    clientdata?.properties?.definition ||
    clientdata?.definition ||
    clientdata?.properties?.template ||
    clientdata?.template ||
    null
  );
}

function getClientDataConnectionReferences(clientdata) {
  return clientdata?.properties?.connectionReferences || clientdata?.connectionReferences || {};
}

function getDefinitionFromFlowLike(flow) {
  const clientdata =
    typeof flow?.clientdata === "string"
      ? safeJsonParse(flow.clientdata)
      : safeJsonParse(flow?.clientdata || null) || flow?.clientdata || null;

  return getClientDataDefinition(clientdata) || {};
}

function mapTriggerEntries(definition = {}) {
  return Object.entries(definition.triggers || {}).map(([key, value]) => ({
    name: key,
    type: value?.type || null,
    kind: value?.kind || null,
    operationId: value?.inputs?.operationId || null,
    connector: value?.inputs?.host?.connection?.referenceName || null
  }));
}

function mapActionEntries(definition = {}) {
  return Object.entries(definition.actions || {}).map(([key, value]) => ({
    name: key,
    type: value?.type || null,
    kind: value?.kind || null,
    runAfter: value?.runAfter || {},
    operationId: value?.inputs?.operationId || null,
    connector: value?.inputs?.host?.connection?.referenceName || null
  }));
}

function summarizeFlowPayload(body = {}) {
  const clientdata = safeJsonParse(body.clientdata);
  const definition = getClientDataDefinition(clientdata) || {};
  const connectionReferences = getClientDataConnectionReferences(clientdata);
  const triggerEntries = mapTriggerEntries(definition).map(({ name, type }) => ({ key: name, type }));
  const actionEntries = mapActionEntries(definition).map(({ name, type }) => ({ key: name, type }));

  return {
    name: body.name || null,
    category: body.category ?? null,
    type: body.type ?? null,
    primaryentity: body.primaryentity || null,
    description: body.description || null,
    statecode: body.statecode ?? null,
    triggerTypes: triggerEntries,
    actionTypes: actionEntries,
    connectionReferences: Object.keys(connectionReferences).sort()
  };
}

function diffArraysByJson(before = [], after = []) {
  const beforeKeys = new Set(before.map((item) => JSON.stringify(item)));
  const afterKeys = new Set(after.map((item) => JSON.stringify(item)));

  return {
    added: after.filter((item) => !beforeKeys.has(JSON.stringify(item))),
    removed: before.filter((item) => !afterKeys.has(JSON.stringify(item)))
  };
}

function diffFlowSummaries(current, incoming) {
  const fields = ["name", "category", "type", "primaryentity", "description", "statecode"];
  const changes = [];

  for (const field of fields) {
    if (current[field] !== incoming[field]) {
      changes.push({
        field,
        current: current[field],
        incoming: incoming[field]
      });
    }
  }

  const triggers = diffArraysByJson(current.triggerTypes, incoming.triggerTypes);
  const actions = diffArraysByJson(current.actionTypes, incoming.actionTypes);
  const connectionReferences = {
    added: incoming.connectionReferences.filter((item) => !current.connectionReferences.includes(item)),
    removed: current.connectionReferences.filter((item) => !incoming.connectionReferences.includes(item))
  };

  return {
    changes,
    triggers,
    actions,
    connectionReferences,
    hasChanges:
      changes.length > 0 ||
      triggers.added.length > 0 ||
      triggers.removed.length > 0 ||
      actions.added.length > 0 ||
      actions.removed.length > 0 ||
      connectionReferences.added.length > 0 ||
      connectionReferences.removed.length > 0
  };
}

function writeJsonFile(pathname, value) {
  fs.writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function dedupeFindings(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function loadFlowWithDefinition(id, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: `/workflows(${id})`,
    query: [
      "$select=workflowid,workflowidunique,name,category,type,primaryentity,description,clientdata,statecode,createdon,modifiedon,solutionid",
      ...(options.query || [])
    ],
    headers: {
      Prefer: 'odata.include-annotations="*"'
    },
    environment: activeEnvironment
  });

  return {
    environment: activeEnvironment,
    flow: response,
    definition: getDefinitionFromFlowLike(response),
    connectionReferences: getClientDataConnectionReferences(safeJsonParse(response.clientdata))
  };
}

function validateFlowPayloadBody(body, options = {}) {
  const errors = [];
  const warnings = [];
  const environment = options.environment || null;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    errors.push(buildFinding("InvalidPayload", "Flow payload must be a JSON object."));
    return { valid: false, errors, warnings, metadata: {} };
  }

  if (!body.name || typeof body.name !== "string") {
    errors.push(buildFinding("MissingName", "The flow payload must include a string `name` field."));
  }

  if (body.category === undefined || Number(body.category) !== MODERN_FLOW_CATEGORY) {
    errors.push(
      buildFinding(
        "InvalidCategory",
        "The flow payload must set `category` to 5 for solution-aware cloud flows."
      )
    );
  }

  if (body.type === undefined || body.type === null || body.type === "") {
    errors.push(buildFinding("MissingType", "The flow payload must include a `type` field."));
  }

  if (!body.primaryentity || typeof body.primaryentity !== "string") {
    warnings.push(
      buildFinding(
        "MissingPrimaryEntity",
        "The flow payload should include `primaryentity`; Dataverse workflow payloads typically require it.",
        "warning"
      )
    );
  }

  if (!body.clientdata || typeof body.clientdata !== "string") {
    errors.push(
      buildFinding("MissingClientData", "The flow payload must include stringified JSON in `clientdata`.")
    );
    return { valid: false, errors, warnings, metadata: {} };
  }

  const clientdata = safeJsonParse(body.clientdata);

  if (!clientdata) {
    errors.push(
      buildFinding("InvalidClientData", "The `clientdata` field must be valid JSON encoded as a string.")
    );
    return { valid: false, errors, warnings, metadata: {} };
  }

  const definition = getClientDataDefinition(clientdata);
  const connectionReferences = getClientDataConnectionReferences(clientdata);
  const connectionReferenceKeys = Object.keys(connectionReferences);

  if (!definition || typeof definition !== "object") {
    errors.push(
      buildFinding(
        "MissingDefinition",
        "The flow `clientdata` JSON should contain a workflow definition under `definition` or `properties.definition`."
      )
    );
  } else {
    if (!definition.triggers || typeof definition.triggers !== "object") {
      warnings.push(
        buildFinding(
          "MissingTriggers",
          "The workflow definition does not expose any triggers.",
          "warning"
        )
      );
    }

    if (!definition.actions || typeof definition.actions !== "object") {
      warnings.push(
        buildFinding(
          "MissingActions",
          "The workflow definition does not expose any actions.",
          "warning"
        )
      );
    }
  }

  if (connectionReferenceKeys.length === 0) {
    warnings.push(
      buildFinding(
        "NoConnectionReferencesFound",
        "No connection references were found in `clientdata`.",
        "warning"
      )
    );
  }

  const embeddedEnvironmentUrls = [...collectEnvironmentUrls(clientdata)];
  if (environment?.environmentUrl && embeddedEnvironmentUrls.length > 0) {
    const mismatchedUrls = embeddedEnvironmentUrls.filter(
      (value) => value.toLowerCase() !== environment.environmentUrl.toLowerCase()
    );

    if (mismatchedUrls.length > 0) {
      warnings.push(
        buildFinding(
          "EnvironmentMismatch",
          "The flow payload references a different Dataverse environment than the selected target environment.",
          "warning",
          {
            targetEnvironmentUrl: environment.environmentUrl,
            referencedEnvironmentUrls: mismatchedUrls
          }
        )
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      connectionReferenceKeys,
      embeddedEnvironmentUrls
    }
  };
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

function extractEnvironmentId(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/environments\/([^/?]+)/i);
  return match ? match[1] : String(value).split("/").filter(Boolean).at(-1);
}

function normalizeEnvironment(item = {}) {
  const rawType = item.type || item.properties?.environmentType || item.properties?.type || null;
  const environmentUrl =
    normalizeEnvironmentUrl(
      item.url ||
        item.properties?.linkedEnvironmentMetadata?.instanceUrl ||
        item.properties?.instanceUrl ||
        item.properties?.environmentUrl ||
        null
    ) || null;
  const normalizedType = normalizeEnvironmentType(rawType);

  return {
    id: extractEnvironmentId(item.id || item.name || item.environmentId),
    name: item.displayName || item.properties?.displayName || item.name || null,
    environmentUrl,
    region: item.azureRegion || item.geo || item.location || item.properties?.azureRegion || null,
    type: normalizedType,
    isDefault:
      normalizedType === "default" ||
      Boolean(item.isDefault || item.properties?.isDefault || item.defaultEnvironment)
  };
}

function ensurePowerAutomateUrl(pathname, environment) {
  if (!pathname) {
    throw new Error("A Power Automate Dataverse path is required.");
  }

  if (/^https?:\/\//i.test(pathname)) {
    return pathname;
  }

  if (!pathname.startsWith("/")) {
    throw new Error("Power Automate paths must start with '/'. Example: /workflows");
  }

  return `${buildDataverseApiBaseUrl(
    environment.environmentUrl,
    environment.apiVersion || DEFAULT_API_VERSION
  )}${pathname}`;
}

async function powerPlatformRequest({ method = "GET", pathname, query = [] }) {
  const config = loadConfig();
  const { accessToken } = await getAccessTokenForScopes(config, {
    serviceName: "powerAutomate",
    scopes: POWER_PLATFORM_SCOPE
  });
  const url = new URL(`${POWER_PLATFORM_BASE_URL}${pathname}`);

  if (!url.searchParams.has("api-version")) {
    url.searchParams.set("api-version", POWER_PLATFORM_API_VERSION);
  }

  for (const item of query) {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid --query value "${item}". Use key=value.`);
    }

    url.searchParams.append(item.slice(0, separatorIndex), item.slice(separatorIndex + 1));
  }

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });

  const text = await response.text();
  const parsed = parseResponseBody(text);

  if (!response.ok) {
    throw new Error(
      `Power Platform request failed (${response.status}): ${formatRequestError(response, parsed)}`
    );
  }

  return parsed;
}

async function listConnectorsForEnvironment(environmentId, options = {}) {
  const response = await powerPlatformRequest({
    pathname: `/connectivity/environments/${encodeURIComponent(environmentId)}/connectors`,
    query: options.query || []
  });

  return response?.value || [];
}

async function listConnectionsForEnvironment(environmentId, options = {}) {
  const response = await powerPlatformRequest({
    pathname: `/connectivity/environments/${encodeURIComponent(environmentId)}/connections`,
    query: options.query || []
  });

  return response?.value || [];
}

async function getConnectionForEnvironment(environmentId, connectionId, options = {}) {
  return await powerPlatformRequest({
    pathname: `/connectivity/environments/${encodeURIComponent(environmentId)}/connections/${encodeURIComponent(connectionId)}`,
    query: options.query || []
  });
}

async function getEnvironmentByReference(reference, options = {}) {
  if (!reference) {
    return null;
  }

  const normalizedUrl = /^https?:\/\//i.test(reference) ? normalizeEnvironmentUrl(reference) : null;

  if (normalizedUrl) {
    return await resolveEnvironmentByUrl(normalizedUrl, options);
  }

  const response = await powerPlatformRequest({
    pathname: `/environmentmanagement/environments/${encodeURIComponent(reference)}`,
    query: options.query || []
  });

  return normalizeEnvironment(response);
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

export function resolvePowerAutomateSettings(flags, config) {
  const serviceConfig = getServiceConfig(config, "powerAutomate");
  const selectedEnvironment = serviceConfig.selectedEnvironment || null;
  const rawEnvironmentUrl =
    flags["environment-url"] ||
    process.env.POWER_AUTOMATE_ENVIRONMENT_URL ||
    selectedEnvironment?.environmentUrl ||
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
    apiBaseUrl: environmentUrl ? buildDataverseApiBaseUrl(environmentUrl, apiVersion) : null,
    selectedEnvironment
  };
}

export async function listEnvironments(options = {}) {
  const response = await powerPlatformRequest({
    pathname: "/environmentmanagement/environments",
    query: options.query || []
  });
  const items = (response?.value || []).map(normalizeEnvironment);

  return buildEnvelope({ items });
}

export async function getEnvironment(id, options = {}) {
  const environment = await getEnvironmentByReference(id, options);
  return buildEnvelope({ item: environment }, environment);
}

export async function resolveEnvironmentByUrl(environmentUrl, options = {}) {
  const normalizedUrl = normalizeEnvironmentUrl(environmentUrl);
  const response = await listEnvironments(options);
  const environment = response.items.find(
    (item) => item.environmentUrl && item.environmentUrl.toLowerCase() === normalizedUrl.toLowerCase()
  );

  if (!environment) {
    throw new Error(`No Power Automate environment matched ${normalizedUrl}.`);
  }

  return environment;
}

export function selectEnvironment(environment) {
  const config = loadConfig();
  const serviceConfig = getServiceConfig(config, "powerAutomate");
  const nextServiceConfig = {
    ...serviceConfig,
    selectedEnvironment: environment
  };

  saveConfig(setServiceConfig(config, "powerAutomate", nextServiceConfig));

  return buildEnvelope({ item: environment }, environment);
}

export async function resolveActiveEnvironment(reference = null) {
  const config = loadConfig();
  const serviceConfig = getServiceConfig(config, "powerAutomate");
  const selectedEnvironment = serviceConfig.selectedEnvironment || null;
  const apiVersion = serviceConfig.apiVersion || DEFAULT_API_VERSION;

  if (reference) {
    const resolved = await getEnvironmentByReference(reference);
    return {
      ...resolved,
      apiVersion
    };
  }

  if (selectedEnvironment?.environmentUrl) {
    return {
      ...selectedEnvironment,
      apiVersion
    };
  }

  if (serviceConfig.environmentUrl) {
    return {
      id: null,
      name: null,
      environmentUrl: normalizeEnvironmentUrl(serviceConfig.environmentUrl),
      region: null,
      type: null,
      isDefault: false,
      apiVersion
    };
  }

  throw new Error(
    "No Power Automate environment is selected. Run `graph-api power-automate environments select --id <environment-id>` or pass --environment/--environment-url."
  );
}

export async function powerAutomateRequest({
  method = "GET",
  pathname,
  query = [],
  body,
  headers = {},
  environment
}) {
  const config = loadConfig();
  const activeEnvironment = await resolveActiveEnvironment(environment);
  const { accessToken } = await getAccessTokenForScopes(config, {
    serviceName: "powerAutomate",
    scopes: `${activeEnvironment.environmentUrl}/user_impersonation`
  });
  const url = new URL(ensurePowerAutomateUrl(pathname, activeEnvironment));

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
      authorization: `Bearer ${accessToken}`,
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
  return buildEnvelope(
    {
      status: response.status,
      entityId,
      workflowId: extractWorkflowId(entityId)
    },
    activeEnvironment
  );
}

export async function dataverseFunction(functionName, options = {}) {
  return await powerAutomateRequest({
    method: "GET",
    pathname: `/${functionName}`,
    query: options.query || [],
    environment: options.environment
  });
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

export async function listFlows({ top = 10, state, query = [], environment } = {}) {
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
    },
    environment
  });
}

export async function getFlow(id, query = [], options = {}) {
  return await powerAutomateRequest({
    pathname: `/workflows(${id})`,
    query,
    headers: {
      Prefer: 'odata.include-annotations="*"'
    },
    environment: options.environment
  });
}

export async function createFlow(body, options = {}) {
  return await powerAutomateRequest({
    method: "POST",
    pathname: "/workflows",
    body,
    environment: options.environment
  });
}

export async function updateFlow(id, body, options = {}) {
  return await powerAutomateRequest({
    method: "PATCH",
    pathname: `/workflows(${id})`,
    body,
    headers: {
      "if-match": "*"
    },
    environment: options.environment
  });
}

export async function deleteFlow(id, options = {}) {
  return await powerAutomateRequest({
    method: "DELETE",
    pathname: `/workflows(${id})`,
    environment: options.environment
  });
}

export async function setFlowState(id, statecode, options = {}) {
  return await updateFlow(id, { statecode }, options);
}

export async function listRuns({ flowId, top = 20, query = [], environment } = {}) {
  if (!flowId) {
    throw new Error("Provide the workflow id with --flow-id.");
  }

  const activeEnvironment = await resolveActiveEnvironment(environment);
  const response = await powerAutomateRequest({
    pathname: "/flowruns",
    query: [
      `$filter=workflowid eq '${flowId}'`,
      "$select=flowrunid,name,workflowid,status,starttime,endtime,triggertype,duration,errorcode,errormessage,parentrunid,createdon",
      "$orderby=starttime desc",
      `$top=${Number(top) || 20}`,
      ...query
    ],
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      items: (response?.value || []).map((item) => mapFlowRun(item, activeEnvironment))
    },
    activeEnvironment
  );
}

export async function getRun(id, options = {}) {
  if (!id) {
    throw new Error("Provide the run id with --id.");
  }

  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: `/flowruns(${id})`,
    query: [
      "$select=flowrunid,name,workflowid,status,starttime,endtime,triggertype,duration,errorcode,errormessage,parentrunid,createdon",
      ...(options.query || [])
    ],
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      item: mapFlowRun(response, activeEnvironment)
    },
    activeEnvironment
  );
}

export async function whoAmI(options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const config = loadConfig();
  const serviceConfig = getServiceConfig(config, "powerAutomate");
  const whoAmIResponse = await dataverseFunction("WhoAmI", {
    environment: activeEnvironment,
    query: options.query || []
  });

  return buildEnvelope(
    {
      item: {
        tenantId: serviceConfig.user?.tenantId || null,
        userId: whoAmIResponse?.UserId || null,
        businessUnitId: whoAmIResponse?.BusinessUnitId || null,
        organizationId: whoAmIResponse?.OrganizationId || null,
        username: serviceConfig.user?.username || null,
        name: serviceConfig.user?.name || null
      }
    },
    activeEnvironment
  );
}

export async function capabilityReport(options = {}) {
  const config = loadConfig();
  const serviceConfig = getServiceConfig(config, "powerAutomate");
  const environmentsResponse = await listEnvironments();
  const selectedEnvironment =
    options.environment ? await resolveActiveEnvironment(options.environment) : serviceConfig.selectedEnvironment || null;
  let connectorItems = [];
  let connectorError = null;

  if (selectedEnvironment?.id) {
    try {
      connectorItems = (await listConnectorsForEnvironment(selectedEnvironment.id, options)).map((item) =>
        mapConnector(item, selectedEnvironment)
      );
    } catch (error) {
      connectorError = error.message;
    }
  }

  return buildEnvelope(
    {
      item: {
        principal: {
          tenantId: serviceConfig.user?.tenantId || null,
          userId: serviceConfig.user?.userId || null,
          username: serviceConfig.user?.username || null,
          name: serviceConfig.user?.name || null
        },
        authenticated: Boolean(serviceConfig.accessToken && serviceConfig.refreshToken),
        selectedEnvironment: selectedEnvironment
          ? {
              id: selectedEnvironment.id || null,
              name: selectedEnvironment.name || null,
              environmentUrl: selectedEnvironment.environmentUrl || null,
              region: selectedEnvironment.region || null,
              type: selectedEnvironment.type || null
            }
          : null,
        environmentCount: environmentsResponse.items.length,
        connectors: {
          count: connectorItems.length,
          items: connectorItems,
          warning: connectorError
        },
        likelyGaps: [
          ...(serviceConfig.accessToken ? [] : ["NotAuthenticated"]),
          ...(selectedEnvironment ? [] : ["NoEnvironmentSelected"]),
          ...(selectedEnvironment?.id || !selectedEnvironment ? [] : ["SelectedEnvironmentMissingId"]),
          ...(connectorError ? ["ConnectorDiscoveryUnavailable"] : [])
        ]
      }
    },
    selectedEnvironment
  );
}

export async function listConnections(options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);

  if (!activeEnvironment.id) {
    throw new Error("Connection discovery requires an environment id. Select an environment discovered by `power-automate environments list`.");
  }

  const items = (await listConnectionsForEnvironment(activeEnvironment.id, options)).map((item) =>
    mapConnection(item, activeEnvironment)
  );

  return buildEnvelope({ items }, activeEnvironment);
}

export async function getConnection(id, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);

  if (!activeEnvironment.id) {
    throw new Error("Connection discovery requires an environment id. Select an environment discovered by `power-automate environments list`.");
  }

  const item = mapConnection(
    await getConnectionForEnvironment(activeEnvironment.id, id, options),
    activeEnvironment
  );

  return buildEnvelope({ item }, activeEnvironment);
}

export async function listConnectionReferences(options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: "/connectionreferences",
    query: [
      "$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,description,statecode,createdon,modifiedon,_ownerid_value,solutionid",
      "$orderby=modifiedon desc",
      ...(options.query || [])
    ],
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      items: (response?.value || []).map((item) => mapConnectionReference(item, activeEnvironment))
    },
    activeEnvironment
  );
}

export async function getConnectionReference(id, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: `/connectionreferences(${id})`,
    query: [
      "$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,description,statecode,createdon,modifiedon,_ownerid_value,solutionid",
      ...(options.query || [])
    ],
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      item: mapConnectionReference(response, activeEnvironment)
    },
    activeEnvironment
  );
}

export async function bindConnectionReference(id, connectionId, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  await powerAutomateRequest({
    method: "PATCH",
    pathname: `/connectionreferences(${id})`,
    body: {
      connectionid: connectionId
    },
    headers: {
      "if-match": "*"
    },
    environment: activeEnvironment
  });

  return await getConnectionReference(id, options);
}

export async function validateFlowPayload(body, options = {}) {
  const activeEnvironment = options.environment
    ? await resolveActiveEnvironment(options.environment)
    : null;
  const result = validateFlowPayloadBody(body, { environment: activeEnvironment });

  return buildEnvelope(
    {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      summary: {
        connectionReferenceCount: result.metadata.connectionReferenceKeys?.length || 0,
        referencedEnvironmentUrls: result.metadata.embeddedEnvironmentUrls || []
      }
    },
    activeEnvironment
  );
}

export async function preflightFlowPayload(body, options = {}) {
  let activeEnvironment = null;

  try {
    activeEnvironment = options.environment
      ? await resolveActiveEnvironment(options.environment)
      : await resolveActiveEnvironment();
  } catch {
    activeEnvironment = null;
  }

  const validation = validateFlowPayloadBody(body, { environment: activeEnvironment });
  const errors = [...validation.errors];
  const warnings = [...validation.warnings];
  const info = [];
  let availableConnectionReferences = [];

  if (!activeEnvironment) {
    warnings.push(
      buildFinding(
        "PreflightWithoutEnvironment",
        "No Power Automate environment is selected, so environment-specific checks were skipped.",
        "warning"
      )
    );
  } else if (validation.metadata.connectionReferenceKeys?.length > 0) {
    try {
      availableConnectionReferences = (await listConnectionReferences({ environment: activeEnvironment })).items;

      for (const logicalName of validation.metadata.connectionReferenceKeys) {
        const matched = availableConnectionReferences.find((item) => item.logicalName === logicalName);

        if (!matched) {
          errors.push(
            buildFinding(
              "MissingConnectionReference",
              `Connection reference '${logicalName}' was not found in the target environment.`,
              "error"
            )
          );
          continue;
        }

        if (!matched.connectionId) {
          warnings.push(
            buildFinding(
              "UnboundConnectionReference",
              `Connection reference '${logicalName}' exists but is not bound to a connection.`,
              "warning",
              { connectionReferenceId: matched.id }
            )
          );
        }
      }

      info.push({
        code: "AvailableConnectionReferences",
        count: availableConnectionReferences.length
      });
    } catch (error) {
      warnings.push(
        buildFinding(
          "ConnectionReferenceDiscoveryFailed",
          "The CLI could not verify connection references in the target environment.",
          "warning",
          { message: error.message }
        )
      );
    }
  }

  return buildEnvelope(
    {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
      summary: {
        connectionReferenceCount: validation.metadata.connectionReferenceKeys?.length || 0,
        referencedEnvironmentUrls: validation.metadata.embeddedEnvironmentUrls || []
      }
    },
    activeEnvironment
  );
}

export async function diagnoseFlow(id, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const flowResponse = await powerAutomateRequest({
    pathname: `/workflows(${id})`,
    query: [
      "$select=workflowid,name,clientdata,category,statecode,createdon,modifiedon,description",
      ...(options.query || [])
    ],
    headers: {
      Prefer: 'odata.include-annotations="*"'
    },
    environment: activeEnvironment
  });
  const flow = flowResponse;
  const flowConnectionReferenceKeys = extractFlowConnectionReferenceKeys(flow);
  const offlineValidation = validateFlowPayloadBody(flow, { environment: activeEnvironment });
  const connectionReferencesResponse = await listConnectionReferences({ environment: activeEnvironment });
  const connectionReferences = connectionReferencesResponse.items;
  const relevantReferences = flowConnectionReferenceKeys.map((key) => {
    const matched = connectionReferences.find((item) => item.logicalName === key);
    return {
      logicalName: key,
      bound: Boolean(matched?.connectionId),
      exists: Boolean(matched),
      connectionReferenceId: matched?.id || null,
      connectionId: matched?.connectionId || null,
      connectorId: matched?.connectorId || null,
      state: matched?.state || null
    };
  });
  const likelyGaps = summarizeLikelyGaps([
    flowConnectionReferenceKeys.length === 0 ? "NoConnectionReferencesFoundInClientData" : null,
    relevantReferences.some((item) => !item.exists) ? "MissingConnectionReference" : null,
    relevantReferences.some((item) => item.exists && !item.bound) ? "UnboundConnectionReference" : null,
    offlineValidation.warnings.some((item) => item.code === "EnvironmentMismatch")
      ? "EnvironmentMismatch"
      : null,
    !activeEnvironment.id ? "EnvironmentMissingId" : null
  ]);

  return buildEnvelope(
    {
      item: {
        flow: {
          id: flow.workflowid || id,
          name: flow.name || null,
          state: Number(flow.statecode) === 1 ? "on" : "off",
          createdAt: flow.createdon || null,
          modifiedAt: flow.modifiedon || null
        },
        connectionReferences: relevantReferences,
        valid: likelyGaps.length === 0 && offlineValidation.errors.length === 0,
        errors: offlineValidation.errors,
        warnings: [
          ...offlineValidation.warnings,
          ...likelyGaps.map((code) => ({
            code,
            message:
              code === "MissingConnectionReference"
                ? "One or more connection references used by the flow were not found in Dataverse."
                : code === "UnboundConnectionReference"
                  ? "One or more connection references exist but are not currently bound to a connection."
                  : code === "EnvironmentMismatch"
                    ? "The flow definition references a different Dataverse environment than the selected environment."
                    : code === "EnvironmentMissingId"
                      ? "The active environment does not expose an environment id, so connector lookups may be incomplete."
                      : "The flow clientdata did not expose any connection references."
          }))
        ]
      }
    },
    activeEnvironment
  );
}

export async function listSolutions(options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: "/solutions",
    query: [
      "$select=solutionid,uniquename,friendlyname,version,ismanaged,createdon,modifiedon,updatedon,description",
      "$orderby=modifiedon desc",
      ...(options.query || [])
    ],
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      items: (response?.value || []).map((item) => mapSolution(item, activeEnvironment))
    },
    activeEnvironment
  );
}

export async function getSolution(id, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: `/solutions(${id})`,
    query: [
      "$select=solutionid,uniquename,friendlyname,version,ismanaged,createdon,modifiedon,updatedon,description",
      ...(options.query || [])
    ],
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      item: mapSolution(response, activeEnvironment)
    },
    activeEnvironment
  );
}

export async function listSolutionFlows(solutionId, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const componentsResponse = await powerAutomateRequest({
    pathname: "/solutioncomponents",
    query: [
      `$filter=_solutionid_value eq guid'${solutionId}' and componenttype eq ${SOLUTION_COMPONENT_TYPE_WORKFLOW}`,
      "$select=objectid,componenttype",
      ...(options.query || [])
    ],
    environment: activeEnvironment
  });
  const workflowIds = [...new Set((componentsResponse?.value || []).map((item) => item.objectid).filter(Boolean))];

  if (workflowIds.length === 0) {
    return buildEnvelope({ items: [] }, activeEnvironment);
  }

  const response = await powerAutomateRequest({
    pathname: "/workflows",
    query: [
      `$filter=${workflowIds.map((id) => `workflowid eq guid'${id}'`).join(" or ")}`,
      "$select=workflowid,workflowidunique,name,statecode,solutionid,createdon,modifiedon,clientdata",
      ...(options.flowQuery || [])
    ],
    headers: {
      Prefer: 'odata.include-annotations="*"'
    },
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      items: (response?.value || []).map((item) => mapFlow(item, activeEnvironment))
    },
    activeEnvironment
  );
}

export async function addFlowToSolution(solutionId, flowId, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const solutionResponse = await getSolution(solutionId, { environment: activeEnvironment });
  const solution = solutionResponse.item;

  if (solution.isManaged) {
    throw new Error("Cannot add a flow to a managed solution. Choose an unmanaged solution.");
  }

  await powerAutomateRequest({
    method: "POST",
    pathname: "/AddSolutionComponent",
    body: {
      ComponentId: flowId,
      ComponentType: SOLUTION_COMPONENT_TYPE_WORKFLOW,
      SolutionUniqueName: solution.uniqueName,
      AddRequiredComponents: true,
      DoNotIncludeSubcomponents: false,
      IncludedComponentSettingsValues: []
    },
    environment: activeEnvironment
  });

  return buildEnvelope(
    {
      item: {
        solutionId: solution.id,
        solutionUniqueName: solution.uniqueName,
        flowId
      }
    },
    activeEnvironment
  );
}

export async function exportFlow(id, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const response = await powerAutomateRequest({
    pathname: `/workflows(${id})`,
    query: [
      "$select=workflowid,name,category,type,primaryentity,description,clientdata,statecode,createdon,modifiedon",
      ...(options.query || [])
    ],
    headers: {
      Prefer: 'odata.include-annotations="*"'
    },
    environment: activeEnvironment
  });
  const payload = normalizeFlowPayload(response);

  if (options.output) {
    writeJsonFile(options.output, payload);
  }

  return buildEnvelope(
    {
      item: {
        id: response.workflowid || id,
        name: response.name || null,
        output: options.output || null,
        payload
      }
    },
    activeEnvironment
  );
}

export async function diffFlow(id, incomingPayload, options = {}) {
  const activeEnvironment = await resolveActiveEnvironment(options.environment);
  const currentFlow = await exportFlow(id, { environment: activeEnvironment });
  const currentPayload = currentFlow.item.payload;
  const currentSummary = summarizeFlowPayload(currentPayload);
  const incomingSummary = summarizeFlowPayload(normalizeFlowPayload(incomingPayload));
  const diff = diffFlowSummaries(currentSummary, incomingSummary);

  return buildEnvelope(
    {
      item: {
        id,
        hasChanges: diff.hasChanges,
        changes: diff.changes,
        triggers: diff.triggers,
        actions: diff.actions,
        connectionReferences: diff.connectionReferences
      }
    },
    activeEnvironment
  );
}

export async function importFlow(body, options = {}) {
  const payload = normalizeFlowPayload(body);
  const validation = await validateFlowPayload(payload, { environment: options.environment || null });
  const preflight = await preflightFlowPayload(payload, { environment: options.environment || null });
  const apply = Boolean(options.apply);
  const flowId = options.id || null;
  const operation = flowId ? "update" : "create";

  if (!apply) {
    return {
      ...buildEnvelope(
        {
          item: {
            operation,
            dryRun: true,
            flowId,
            payload
          },
          valid: validation.valid && preflight.valid,
          errors: [...validation.errors, ...preflight.errors],
          warnings: dedupeFindings([...validation.warnings, ...preflight.warnings]),
          info: preflight.info || []
        },
        preflight.environmentId || validation.environmentId ? { id: preflight.environmentId, environmentUrl: preflight.environmentUrl } : null
      )
    };
  }

  if (!validation.valid || !preflight.valid) {
    return {
      ...buildEnvelope(
        {
          item: {
            operation,
            dryRun: false,
            flowId,
            payload
          },
          valid: false,
          errors: [...validation.errors, ...preflight.errors],
          warnings: dedupeFindings([...validation.warnings, ...preflight.warnings]),
          info: preflight.info || []
        },
        null
      )
    };
  }

  const result = flowId
    ? await updateFlow(flowId, payload, { environment: options.environment || null })
    : await createFlow(payload, { environment: options.environment || null });

  return buildEnvelope(
    {
      item: {
        operation,
        dryRun: false,
        flowId: flowId || result.workflowId || result.item?.id || null,
        payload
      },
      valid: true,
      errors: [],
      warnings: dedupeFindings([...validation.warnings, ...preflight.warnings]),
      info: preflight.info || [],
      result
    },
    null
  );
}

export async function listFlowTriggers(id, options = {}) {
  const { environment, flow, definition } = await loadFlowWithDefinition(id, options);

  return buildEnvelope(
    {
      item: {
        flowId: flow.workflowid || id,
        flowName: flow.name || null,
        items: mapTriggerEntries(definition)
      }
    },
    environment
  );
}

export async function listFlowActions(id, options = {}) {
  const { environment, flow, definition } = await loadFlowWithDefinition(id, options);

  return buildEnvelope(
    {
      item: {
        flowId: flow.workflowid || id,
        flowName: flow.name || null,
        items: mapActionEntries(definition)
      }
    },
    environment
  );
}

export async function listFlowDependencies(id, options = {}) {
  const { environment, flow, definition, connectionReferences } = await loadFlowWithDefinition(
    id,
    options
  );
  const triggerItems = mapTriggerEntries(definition);
  const actionItems = mapActionEntries(definition);
  const referenceNames = Object.keys(connectionReferences || {});
  const dependencyMap = referenceNames.map((referenceName) => ({
    referenceName,
    connectorId: connectionReferences[referenceName]?.api?.id || null,
    connectorName:
      connectionReferences[referenceName]?.api?.name ||
      connectionReferences[referenceName]?.displayName ||
      null,
    sourceTriggers: triggerItems.filter((item) => item.connector === referenceName).map((item) => item.name),
    sourceActions: actionItems.filter((item) => item.connector === referenceName).map((item) => item.name)
  }));

  return buildEnvelope(
    {
      item: {
        flowId: flow.workflowid || id,
        flowName: flow.name || null,
        items: dependencyMap
      }
    },
    environment
  );
}

export function listTemplates() {
  return buildEnvelope({
    items: listTemplateDefinitions()
  });
}

export function getTemplate(id) {
  return buildEnvelope({
    item: getTemplateDefinition(id)
  });
}

export function instantiateTemplatePayload(id, params = {}, options = {}) {
  const payload = instantiateTemplate(id, params);

  if (options.output) {
    writeJsonFile(options.output, payload);
  }

  return buildEnvelope({
    item: {
      templateId: id,
      output: options.output || null,
      payload
    }
  });
}

export async function createTemplateBackedFlow(templateId, params = {}, options = {}) {
  const payload = instantiateTemplate(templateId, params);

  if (options.output) {
    writeJsonFile(options.output, payload);
  }

  return await importFlow(payload, {
    id: options.id || null,
    apply: Boolean(options.apply),
    environment: options.environment || null
  });
}

export function planIntent(intent) {
  return buildEnvelope({
    item: buildIntentPlan(intent)
  });
}

export function listIntentQuestions(intent) {
  return buildEnvelope({
    item: buildIntentQuestions(intent)
  });
}

export async function scaffoldIntent(intentPlan, options = {}) {
  const scaffold = buildScaffoldInput(intentPlan);
  const payloadEnvelope = instantiateTemplatePayload(scaffold.templateId, scaffold.params, {
    output: options.output || null
  });

  if (!options.apply) {
    return buildEnvelope({
      item: {
        intent: intentPlan.intent,
        templateId: scaffold.templateId,
        params: scaffold.params,
        payload: payloadEnvelope.item.payload,
        dryRun: true
      }
    });
  }

  const result = await createTemplateBackedFlow(scaffold.templateId, scaffold.params, {
    apply: true,
    environment: options.environment || null,
    output: options.output || null
  });

  return buildEnvelope({
    item: {
      intent: intentPlan.intent,
      templateId: scaffold.templateId,
      params: scaffold.params,
      dryRun: false
    },
    result
  });
}
