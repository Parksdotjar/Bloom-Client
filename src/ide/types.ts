import type { ConsoleCommandContext, ConsoleCommandDefinition, ConsoleOutputKind } from '../console/types';

export type BloomScriptValue = string | number | boolean;

export type BloomScriptToken = {
  value: string;
  quoted: boolean;
  column: number;
  endColumn: number;
};

export type BloomScriptDiagnosticSeverity = 'error' | 'warning';

export type BloomScriptDiagnostic = {
  line: number;
  column: number;
  endColumn?: number;
  message: string;
  severity: BloomScriptDiagnosticSeverity;
};

type BaseStatement = {
  kind: 'let' | 'command';
  line: number;
  raw: string;
  tokens: BloomScriptToken[];
};

export type BloomScriptLetStatement = BaseStatement & {
  kind: 'let';
  variable: string;
  variableColumn: number;
  expression: BloomScriptToken[];
};

export type BloomScriptCommandStatement = BaseStatement & {
  kind: 'command';
};

export type BloomScriptStatement = BloomScriptLetStatement | BloomScriptCommandStatement;

export type BloomScriptProgram = {
  statements: BloomScriptStatement[];
  diagnostics: BloomScriptDiagnostic[];
  variables: string[];
};

export type BloomScriptCommandIndex = {
  allCommandNames: string[];
  scriptToConsole: Record<string, string>;
  scriptToDefinition: Record<string, ConsoleCommandDefinition>;
};

export type BloomScriptResolvedCommand = {
  scriptName: string;
  consoleAlias: string;
  definition: ConsoleCommandDefinition;
  argTokens: BloomScriptToken[];
};

export type BloomScriptOutputKind = ConsoleOutputKind;

export type BloomScriptOutputLine = {
  id: string;
  kind: BloomScriptOutputKind;
  text: string;
  line: number | null;
  atMs: number;
};

export type BloomScriptExecutionContext = {
  commandIndex: BloomScriptCommandIndex;
  commands: ConsoleCommandDefinition[];
  consoleContext: ConsoleCommandContext;
  stopOnError?: boolean;
};

export type BloomScriptExecutionResult = {
  ok: boolean;
  outputs: BloomScriptOutputLine[];
  diagnostics: BloomScriptDiagnostic[];
  durationMs: number;
  executedStatements: number;
};
