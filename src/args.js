export function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex >= 0) {
      const key = trimmed.slice(0, equalsIndex);
      const value = trimmed.slice(equalsIndex + 1);
      assignFlag(flags, key, value);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      assignFlag(flags, trimmed, true);
      continue;
    }

    assignFlag(flags, trimmed, next);
    index += 1;
  }

  return { positionals, flags };
}

function assignFlag(flags, key, value) {
  if (Object.prototype.hasOwnProperty.call(flags, key)) {
    const current = flags[key];
    flags[key] = Array.isArray(current) ? [...current, value] : [current, value];
    return;
  }

  flags[key] = value;
}

export function requireFlag(flags, name, message) {
  const value = flags[name];
  if (!value || value === true) {
    throw new Error(message || `Missing required flag --${name}`);
  }

  return value;
}

export function normalizeList(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
