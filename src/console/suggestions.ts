import { resolveConsoleCommand } from './parser';
import type { ConsoleCommandContext, ConsoleCommandDefinition, ConsoleSuggestion } from './types';

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function tokenizeLoose(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
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

  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function getVisibleCommands(commands: ConsoleCommandDefinition[], showInternal: boolean) {
  return commands.filter((command) => showInternal || command.visibility !== 'internal');
}

function mapCommandSuggestions(
  commands: ConsoleCommandDefinition[],
  rawInput: string
): ConsoleSuggestion[] {
  const normalizedInput = normalize(rawInput);

  const list = commands.flatMap((command) => {
    const names = [command.name, ...(command.aliases ?? [])];
    return names.map((name) => ({
      value: name,
      description: command.description,
      category: command.category
    }));
  });

  const filtered = normalizedInput.length === 0
    ? list
    : list.filter((item) => {
      const normalizedName = normalize(item.value);
      return normalizedName.startsWith(normalizedInput) || normalizedName.includes(normalizedInput);
    });

  const seen = new Set<string>();
  return filtered
    .filter((item) => {
      const key = normalize(item.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 7);
}

export async function buildConsoleSuggestions(
  rawInput: string,
  commands: ConsoleCommandDefinition[],
  context: ConsoleCommandContext
): Promise<ConsoleSuggestion[]> {
  const visibleCommands = getVisibleCommands(commands, context.showInternalCommands);
  const endsWithWhitespace = /\s$/.test(rawInput);
  const tokens = tokenizeLoose(rawInput);

  const lookupTokens = endsWithWhitespace ? tokens : tokens.slice(0, -1);
  const currentToken = endsWithWhitespace ? '' : (tokens[tokens.length - 1] ?? '');

  const resolved = resolveConsoleCommand(lookupTokens, visibleCommands);
  if (!resolved) {
    return mapCommandSuggestions(visibleCommands, rawInput);
  }

  const argSuggestions = resolved.definition.autocomplete
    ? await resolved.definition.autocomplete(resolved.args, context)
    : [];

  if (!argSuggestions || argSuggestions.length === 0) {
    return [];
  }

  const filtered = currentToken.length === 0
    ? argSuggestions
    : argSuggestions.filter((value) => normalize(value).startsWith(normalize(currentToken)));

  return filtered.slice(0, 7).map((value) => ({
    value,
    description: `Argument for ${resolved.definition.name}`,
    category: resolved.definition.category
  }));
}
