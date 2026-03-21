import { executeConsoleInput } from '../console/executor';
import { resolveBloomScriptCommand } from './bridge';
import { parseBloomScript, looksNumericToken } from './parser';
import type {
  BloomScriptExecutionContext,
  BloomScriptExecutionResult,
  BloomScriptOutputKind,
  BloomScriptOutputLine,
  BloomScriptToken,
  BloomScriptValue
} from './types';

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDisplayValue(value: BloomScriptValue) {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function parseTokenValue(token: BloomScriptToken, variables: Map<string, BloomScriptValue>): BloomScriptValue {
  if (token.value.startsWith('$')) {
    const variableName = token.value.slice(1);
    if (!variableName) {
      throw new Error('Variable reference cannot be empty.');
    }
    if (!variables.has(variableName)) {
      throw new Error(`Unknown variable: ${variableName}`);
    }
    return variables.get(variableName)!;
  }

  if (token.quoted) return token.value;

  const normalized = token.value.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (looksNumericToken(token.value)) return Number(token.value);

  if (variables.has(token.value)) {
    return variables.get(token.value)!;
  }

  return token.value;
}

function evaluateTokens(tokens: BloomScriptToken[], variables: Map<string, BloomScriptValue>): BloomScriptValue {
  if (tokens.length === 0) {
    throw new Error('Missing expression value.');
  }

  const values = tokens.map((token) => parseTokenValue(token, variables));
  if (values.length === 1) return values[0];
  return values.map(toDisplayValue).join(' ');
}

function quoteArgument(value: BloomScriptValue) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value.length === 0) return '""';
  if (!/[\s"'\\]/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function pushOutput(
  lines: BloomScriptOutputLine[],
  kind: BloomScriptOutputKind,
  text: string,
  line: number | null
) {
  lines.push({
    id: nowId(),
    kind,
    text,
    line,
    atMs: Date.now()
  });
}

export async function executeBloomScript(source: string, runtime: BloomScriptExecutionContext): Promise<BloomScriptExecutionResult> {
  const startedAt = performance.now();
  const parsed = parseBloomScript(source);
  const outputs: BloomScriptOutputLine[] = [];
  const diagnostics = [...parsed.diagnostics];

  if (parsed.diagnostics.some((item) => item.severity === 'error')) {
    return {
      ok: false,
      outputs,
      diagnostics,
      durationMs: Math.round(performance.now() - startedAt),
      executedStatements: 0
    };
  }

  const variables = new Map<string, BloomScriptValue>();
  const stopOnError = runtime.stopOnError !== false;
  let executedStatements = 0;

  for (const statement of parsed.statements) {
    try {
      if (statement.kind === 'let') {
        const assignedValue = evaluateTokens(statement.expression, variables);
        variables.set(statement.variable, assignedValue);
        pushOutput(outputs, 'info', `set $${statement.variable} = ${toDisplayValue(assignedValue)}`, statement.line);
        executedStatements += 1;
        continue;
      }

      const resolved = resolveBloomScriptCommand(statement.tokens, runtime.commandIndex);
      if (!resolved) {
        const unknown = statement.tokens[0]?.value || 'command';
        const message = `Unknown command: ${unknown}`;
        pushOutput(outputs, 'error', message, statement.line);
        diagnostics.push({
          severity: 'error',
          line: statement.line,
          column: statement.tokens[0]?.column ?? 1,
          endColumn: statement.tokens[0]?.endColumn,
          message
        });
        if (stopOnError) break;
        executedStatements += 1;
        continue;
      }

      const values = resolved.argTokens.map((token) => parseTokenValue(token, variables));
      const scriptCommand = resolved.scriptName;

      if (scriptCommand === 'print') {
        const text = values.map(toDisplayValue).join(' ');
        pushOutput(outputs, 'info', text.length > 0 ? text : '(empty)', statement.line);
        executedStatements += 1;
        continue;
      }

      if (scriptCommand === 'sleep') {
        if (values.length === 0 || typeof values[0] !== 'number' || !Number.isFinite(values[0])) {
          throw new Error('sleep requires a numeric value in milliseconds.');
        }
        const ms = Math.max(0, Math.min(10000, Math.round(values[0])));
        pushOutput(outputs, 'info', `sleeping for ${ms}ms...`, statement.line);
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, ms);
        });
        executedStatements += 1;
        continue;
      }

      const consoleInput = scriptCommand === 'run'
        ? values.map(toDisplayValue).join(' ')
        : [resolved.consoleAlias, ...values.map(quoteArgument)].join(' ');

      if (!consoleInput.trim()) {
        throw new Error('No command provided.');
      }

      pushOutput(outputs, 'command', `> ${consoleInput}`, statement.line);
      const execution = await executeConsoleInput(consoleInput, runtime.commands, runtime.consoleContext);

      if (!execution.ok) {
        pushOutput(outputs, 'error', execution.message, statement.line);
        if (execution.usage) {
          pushOutput(outputs, 'info', execution.usage, statement.line);
        }
        diagnostics.push({
          severity: 'error',
          line: statement.line,
          column: statement.tokens[0]?.column ?? 1,
          endColumn: statement.tokens[0]?.endColumn,
          message: execution.message
        });
        executedStatements += 1;
        if (stopOnError) break;
        continue;
      }

      if (execution.result.clearOutput) {
        outputs.splice(0, outputs.length);
        pushOutput(outputs, 'info', 'Output cleared.', statement.line);
      }

      if (execution.result.lines && execution.result.lines.length > 0) {
        const outputKind = execution.result.kind ?? 'info';
        for (const line of execution.result.lines) {
          pushOutput(outputs, outputKind, line, statement.line);
        }
      }

      executedStatements += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushOutput(outputs, 'error', message, statement.line);
      diagnostics.push({
        severity: 'error',
        line: statement.line,
        column: statement.tokens[0]?.column ?? 1,
        endColumn: statement.tokens[0]?.endColumn,
        message
      });
      executedStatements += 1;
      if (stopOnError) break;
    }
  }

  const ok = diagnostics.every((item) => item.severity !== 'error');
  return {
    ok,
    outputs,
    diagnostics,
    durationMs: Math.round(performance.now() - startedAt),
    executedStatements
  };
}
