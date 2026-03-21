import { parseConsoleInput, resolveConsoleCommand } from './parser';
import type {
  ConsoleArgSchema,
  ConsoleCommandContext,
  ConsoleCommandDefinition,
  ConsoleExecutionResult
} from './types';

function getUsageLine(command: ConsoleCommandDefinition) {
  return `Usage: ${command.usage}`;
}

function normalize(value: string) {
  return value.toLowerCase();
}

function validateArgsWithSchema(args: string[], schema: ConsoleArgSchema[] | undefined): string | null {
  if (!schema || schema.length === 0) return null;

  const requiredCount = schema.filter((item) => item.required !== false).length;
  const variadicIndex = schema.findIndex((item) => item.variadic);
  const maxCount = variadicIndex >= 0 ? Number.POSITIVE_INFINITY : schema.length;

  if (args.length < requiredCount) {
    const missingArg = schema[Math.min(args.length, schema.length - 1)]?.name ?? 'argument';
    return `Missing required argument: ${missingArg}`;
  }

  if (args.length > maxCount) {
    return 'Too many arguments.';
  }

  for (let index = 0; index < args.length; index += 1) {
    const item = schema[Math.min(index, schema.length - 1)];
    if (!item?.choices || item.choices.length === 0) continue;
    const arg = normalize(args[index]);
    const valid = item.choices.some((choice) => normalize(choice) === arg);
    if (!valid) {
      return `Invalid value for ${item.name}. Expected one of: ${item.choices.join(', ')}`;
    }
  }

  return null;
}

function findNearbyCommands(input: string, commands: ConsoleCommandDefinition[]) {
  const target = normalize(input);
  if (!target) return [];
  const allNames = commands.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
  return allNames
    .filter((name) => normalize(name).includes(target) || target.includes(normalize(name)))
    .slice(0, 4);
}

export async function executeConsoleInput(
  input: string,
  commands: ConsoleCommandDefinition[],
  context: ConsoleCommandContext
): Promise<ConsoleExecutionResult> {
  const parsed = parseConsoleInput(input);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }

  if (parsed.tokens.length === 0) {
    return { ok: false, message: 'Enter a command. Try `help`.' };
  }

  const resolved = resolveConsoleCommand(parsed.tokens, commands);
  if (!resolved) {
    const near = findNearbyCommands(parsed.tokens[0], commands);
    const suggestion = near.length > 0 ? ` Did you mean: ${near.join(', ')}?` : '';
    return { ok: false, message: `Unknown command: ${parsed.tokens.join(' ')}.${suggestion}` };
  }

  const schemaMessage = validateArgsWithSchema(resolved.args, resolved.definition.args);
  if (schemaMessage) {
    return { ok: false, message: schemaMessage, usage: getUsageLine(resolved.definition) };
  }

  const customValidation = resolved.definition.validate?.(resolved.args, context);
  if (customValidation) {
    return { ok: false, message: customValidation, usage: getUsageLine(resolved.definition) };
  }

  try {
    const rawResult = await resolved.definition.handler(resolved.args, context);
    return { ok: true, result: rawResult ?? {} };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message };
  }
}
