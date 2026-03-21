import type { ConsoleArgSchema } from '../console/types';
import { resolveBloomScriptCommand } from './bridge';
import type {
  BloomScriptCommandIndex,
  BloomScriptDiagnostic,
  BloomScriptDiagnosticSeverity,
  BloomScriptProgram,
  BloomScriptStatement,
  BloomScriptToken
} from './types';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;

function pushDiagnostic(
  list: BloomScriptDiagnostic[],
  severity: BloomScriptDiagnosticSeverity,
  line: number,
  column: number,
  message: string,
  endColumn?: number
) {
  list.push({ severity, line, column, endColumn, message });
}

function isVariableReference(token: BloomScriptToken) {
  return token.value.startsWith('$') && token.value.length > 1;
}

export function tokenizeBloomScriptLine(line: string, lineNumber: number, diagnostics: BloomScriptDiagnostic[] = []): BloomScriptToken[] {
  const tokens: BloomScriptToken[] = [];

  let current = '';
  let tokenStartIndex = -1;
  let quote: '"' | "'" | null = null;
  let quoteStartIndex = -1;
  let escaped = false;

  const flushPlain = (lastIndexInclusive: number) => {
    if (current.length === 0 || tokenStartIndex < 0) return;
    const endColumn = Math.max(tokenStartIndex + 2, lastIndexInclusive + 2);
    tokens.push({
      value: current,
      quoted: false,
      column: tokenStartIndex + 1,
      endColumn
    });
    current = '';
    tokenStartIndex = -1;
  };

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) {
        tokens.push({
          value: current,
          quoted: true,
          column: quoteStartIndex + 1,
          endColumn: index + 2
        });
        current = '';
        quote = null;
        quoteStartIndex = -1;
        tokenStartIndex = -1;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '#' || (char === '/' && line[index + 1] === '/')) {
      flushPlain(index - 1);
      break;
    }

    if (/\s/.test(char)) {
      flushPlain(index - 1);
      continue;
    }

    if ((char === '"' || char === "'") && current.length === 0) {
      quote = char;
      quoteStartIndex = index;
      tokenStartIndex = index;
      continue;
    }

    if (tokenStartIndex < 0) tokenStartIndex = index;
    current += char;
  }

  if (quote) {
    pushDiagnostic(
      diagnostics,
      'error',
      lineNumber,
      quoteStartIndex + 1,
      'Unclosed quoted string.',
      line.length + 1
    );
    if (current.length > 0) {
      tokens.push({
        value: current,
        quoted: true,
        column: quoteStartIndex + 1,
        endColumn: line.length + 1
      });
    }
    return tokens;
  }

  if (escaped) {
    current += '\\';
  }

  flushPlain(line.length - 1);
  return tokens;
}

export function parseBloomScript(source: string): BloomScriptProgram {
  const statements: BloomScriptStatement[] = [];
  const diagnostics: BloomScriptDiagnostic[] = [];
  const variables = new Set<string>();

  const lines = source.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const raw = lines[lineIndex] ?? '';
    const tokens = tokenizeBloomScriptLine(raw, lineNumber, diagnostics);
    if (tokens.length === 0) continue;

    const first = tokens[0].value.toLowerCase();
    if (first === 'let') {
      if (tokens.length < 4) {
        pushDiagnostic(diagnostics, 'error', lineNumber, tokens[0].column, 'Expected: let <name> = <value>.', tokens[0].endColumn);
        continue;
      }

      const nameToken = tokens[1];
      if (!IDENTIFIER_PATTERN.test(nameToken.value)) {
        pushDiagnostic(diagnostics, 'error', lineNumber, nameToken.column, 'Invalid variable name.', nameToken.endColumn);
        continue;
      }

      const equalsToken = tokens[2];
      if (equalsToken.value !== '=') {
        pushDiagnostic(diagnostics, 'error', lineNumber, equalsToken.column, 'Expected `=` after variable name.', equalsToken.endColumn);
        continue;
      }

      const expression = tokens.slice(3);
      if (expression.length === 0) {
        pushDiagnostic(diagnostics, 'error', lineNumber, equalsToken.endColumn, 'Variable assignment requires a value.');
        continue;
      }

      variables.add(nameToken.value);
      statements.push({
        kind: 'let',
        line: lineNumber,
        raw,
        tokens,
        variable: nameToken.value,
        variableColumn: nameToken.column,
        expression
      });
      continue;
    }

    statements.push({ kind: 'command', line: lineNumber, raw, tokens });
  }

  return {
    statements,
    diagnostics,
    variables: Array.from(variables)
  };
}

function validateArgsAgainstSchema(
  args: BloomScriptToken[],
  schema: ConsoleArgSchema[] | undefined
): string | null {
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
    const arg = args[index];
    const schemaEntry = schema[Math.min(index, schema.length - 1)];
    if (!schemaEntry?.choices || schemaEntry.choices.length === 0) continue;
    if (isVariableReference(arg)) continue;

    const normalizedArg = arg.value.toLowerCase();
    const validChoice = schemaEntry.choices.some((choice) => choice.toLowerCase() === normalizedArg);
    if (!validChoice) {
      return `Invalid value for ${schemaEntry.name}. Expected one of: ${schemaEntry.choices.join(', ')}`;
    }
  }

  return null;
}

export function analyzeBloomScript(source: string, commandIndex: BloomScriptCommandIndex) {
  const program = parseBloomScript(source);
  const diagnostics: BloomScriptDiagnostic[] = [...program.diagnostics];
  const declared = new Set<string>();

  for (const statement of program.statements) {
    if (statement.kind === 'let') {
      for (const token of statement.expression) {
        if (!isVariableReference(token)) continue;
        const variableName = token.value.slice(1);
        if (!declared.has(variableName)) {
          pushDiagnostic(
            diagnostics,
            'warning',
            statement.line,
            token.column,
            `Variable \`${variableName}\` is not defined yet.`,
            token.endColumn
          );
        }
      }
      declared.add(statement.variable);
      continue;
    }

    const resolved = resolveBloomScriptCommand(statement.tokens, commandIndex);
    if (!resolved) {
      const commandToken = statement.tokens[0];
      pushDiagnostic(
        diagnostics,
        'error',
        statement.line,
        commandToken.column,
        `Unknown command \`${commandToken.value}\`.`,
        commandToken.endColumn
      );
      continue;
    }

    const argValidation = validateArgsAgainstSchema(resolved.argTokens, resolved.definition.args);
    if (argValidation) {
      const target = resolved.argTokens[0] ?? statement.tokens[0];
      pushDiagnostic(diagnostics, 'warning', statement.line, target.column, argValidation, target.endColumn);
    }

    for (const token of resolved.argTokens) {
      if (!isVariableReference(token)) continue;
      const variableName = token.value.slice(1);
      if (declared.has(variableName)) continue;
      pushDiagnostic(
        diagnostics,
        'warning',
        statement.line,
        token.column,
        `Variable \`${variableName}\` is not defined yet.`,
        token.endColumn
      );
    }
  }

  return {
    program,
    diagnostics: diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
  };
}

export function looksNumericToken(value: string) {
  return NUMERIC_PATTERN.test(value.trim());
}
