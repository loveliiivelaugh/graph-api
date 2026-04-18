import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_DIR = path.join(os.homedir(), ".config", "graph-api-cli");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const GRAPH_AUTH_FIELDS = [
  "tenant",
  "redirectUri",
  "scopes",
  "clientId",
  "clientSecret",
  "accessToken",
  "refreshToken",
  "idToken",
  "tokenType",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "user"
];

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function getConfigPath() {
  return CONFIG_PATH;
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

export function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
}

export function deleteConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
}

export function resolveSetting(flagsValue, envValue, configValue, fallback = null) {
  return flagsValue || envValue || configValue || fallback;
}

export function maskToken(token = "") {
  if (!token) {
    return "<none>";
  }

  if (token.length <= 8) {
    return "********";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function pickFields(source, fields) {
  return fields.reduce((result, field) => {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }

    return result;
  }, {});
}

export function getServiceConfig(config, serviceName) {
  const services = config.services || {};
  const serviceConfig = services[serviceName];

  if (serviceConfig) {
    return serviceConfig;
  }

  if (serviceName === "graph") {
    return pickFields(config, GRAPH_AUTH_FIELDS);
  }

  return {};
}

export function setServiceConfig(config, serviceName, serviceConfig) {
  const nextConfig = {
    ...config,
    services: {
      ...(config.services || {}),
      [serviceName]: serviceConfig
    }
  };

  if (serviceName === "graph") {
    for (const field of GRAPH_AUTH_FIELDS) {
      if (serviceConfig[field] === undefined) {
        delete nextConfig[field];
        continue;
      }

      nextConfig[field] = serviceConfig[field];
    }
  }

  return nextConfig;
}

export function clearServiceConfig(config, serviceName) {
  const nextConfig = { ...config };
  const services = { ...(config.services || {}) };

  delete services[serviceName];

  if (Object.keys(services).length > 0) {
    nextConfig.services = services;
  } else {
    delete nextConfig.services;
  }

  if (serviceName === "graph") {
    for (const field of GRAPH_AUTH_FIELDS) {
      delete nextConfig[field];
    }
  }

  return nextConfig;
}
