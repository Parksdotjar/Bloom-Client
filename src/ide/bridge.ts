import type { ConsoleCommandDefinition } from '../console/types';
import type { BloomScriptCommandIndex, BloomScriptResolvedCommand, BloomScriptToken } from './types';

function normalizeSpaces(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeScriptName(value: string) {
  return normalizeSpaces(value).replace(/\s+/g, '.');
}

function normalizeTokenValue(value: string) {
  return value.trim().toLowerCase();
}

function isCommandToken(token: BloomScriptToken) {
  return !token.quoted && !token.value.startsWith('$');
}

const SCRIPT_BUILTINS: ConsoleCommandDefinition[] = [
  {
    name: 'print',
    category: 'Script',
    description: 'Print values into the Script Studio output panel.',
    usage: 'print <value...>',
    args: [{ name: 'value', variadic: true, required: false }],
    handler: () => ({})
  },
  {
    name: 'sleep',
    category: 'Script',
    description: 'Pause script execution for a number of milliseconds.',
    usage: 'sleep <milliseconds>',
    args: [{ name: 'milliseconds' }],
    handler: () => ({})
  },
  {
    name: 'run',
    category: 'Script',
    description: 'Run a raw Bloom command string.',
    usage: 'run <command...>',
    args: [{ name: 'command', variadic: true }],
    handler: () => ({})
  }
];

export function createBloomScriptCommandIndex(commands: ConsoleCommandDefinition[]): BloomScriptCommandIndex {
  const scriptToConsole: Record<string, string> = {};
  const scriptToDefinition: Record<string, ConsoleCommandDefinition> = {};

  const remember = (scriptName: string, consoleAlias: string, definition: ConsoleCommandDefinition) => {
    if (!scriptName || scriptToConsole[scriptName]) return;
    scriptToConsole[scriptName] = consoleAlias;
    scriptToDefinition[scriptName] = definition;
  };

  for (const definition of [...commands, ...SCRIPT_BUILTINS]) {
    const aliases = [definition.name, ...(definition.aliases ?? [])];
    for (const alias of aliases) {
      const normalizedConsoleAlias = normalizeSpaces(alias);
      const scriptAlias = normalizeScriptName(alias);
      remember(scriptAlias, normalizedConsoleAlias, definition);
    }
  }

  const allCommandNames = Object.keys(scriptToConsole).sort((a, b) => a.localeCompare(b));
  return { allCommandNames, scriptToConsole, scriptToDefinition };
}

export function resolveBloomScriptCommand(tokens: BloomScriptToken[], index: BloomScriptCommandIndex): BloomScriptResolvedCommand | null {
  if (tokens.length === 0) return null;

  const maxParts = Math.min(3, tokens.length);
  for (let parts = maxParts; parts >= 1; parts -= 1) {
    const commandTokens = tokens.slice(0, parts);
    if (!commandTokens.every(isCommandToken)) continue;

    const scriptName = commandTokens.map((token) => normalizeTokenValue(token.value)).join('.');
    const consoleAlias = index.scriptToConsole[scriptName];
    const definition = index.scriptToDefinition[scriptName];
    if (!consoleAlias || !definition) continue;

    return {
      scriptName,
      consoleAlias,
      definition,
      argTokens: tokens.slice(parts)
    };
  }

  return null;
}
