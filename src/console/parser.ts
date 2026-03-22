import type { ConsoleCommandDefinition, ConsoleParseResult, ConsoleResolvedCommand } from './types';

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[`"'“”‘’([{<]+/, '')
    .replace(/[`"'“”‘’)\]}>.,!?;:]+$/, '');
}

export function parseConsoleInput(input: string): ConsoleParseResult {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  if (quote) {
    return { ok: false, message: 'Unclosed quoted string. Add a matching quote and run again.' };
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return { ok: true, tokens };
}

function collectAliases(definition: ConsoleCommandDefinition): string[] {
  return [definition.name, ...(definition.aliases ?? [])];
}

export function resolveConsoleCommand(
  inputTokens: string[],
  commands: ConsoleCommandDefinition[]
): ConsoleResolvedCommand | null {
  if (inputTokens.length === 0) return null;

  const normalizedInput = inputTokens.map(normalizeToken);
  let bestMatch: { definition: ConsoleCommandDefinition; alias: string; length: number } | null = null;

  for (const definition of commands) {
    for (const alias of collectAliases(definition)) {
      const aliasTokens = alias
        .split(/\s+/)
        .map(normalizeToken)
        .filter(Boolean);

      if (aliasTokens.length === 0 || aliasTokens.length > normalizedInput.length) continue;

      const matches = aliasTokens.every((token, index) => token === normalizedInput[index]);
      if (!matches) continue;

      if (!bestMatch || aliasTokens.length > bestMatch.length) {
        bestMatch = { definition, alias, length: aliasTokens.length };
      }
    }
  }

  if (!bestMatch) return null;

  return {
    definition: bestMatch.definition,
    aliasUsed: bestMatch.alias,
    args: inputTokens.slice(bestMatch.length)
  };
}
