import type { ConsoleCommandContext } from '../console/types';
import { resolveBloomScriptCommand } from './bridge';
import { tokenizeBloomScriptLine } from './parser';
import type { BloomScriptCommandIndex, BloomScriptDiagnostic } from './types';

type MonacoApi = typeof import('monaco-editor');

type Rgb = { r: number; g: number; b: number };

type CompletionSources = {
  getCommandIndex: () => BloomScriptCommandIndex;
  getConsoleContext: () => ConsoleCommandContext;
  getVariables: () => string[];
};

export const BLOOM_SCRIPT_LANGUAGE_ID = 'bloomscript';
export const BLOOM_SCRIPT_THEME_ID = 'bloomscript-theme';

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(color: Rgb) {
  const toHex = (value: number) => clamp(value).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function parseHexColor(input: string): Rgb | null {
  const value = input.trim();
  if (!value.startsWith('#')) return null;
  if (value.length === 4) {
    return {
      r: Number.parseInt(value[1] + value[1], 16),
      g: Number.parseInt(value[2] + value[2], 16),
      b: Number.parseInt(value[3] + value[3], 16)
    };
  }
  if (value.length === 7) {
    return {
      r: Number.parseInt(value.slice(1, 3), 16),
      g: Number.parseInt(value.slice(3, 5), 16),
      b: Number.parseInt(value.slice(5, 7), 16)
    };
  }
  return null;
}

function parseRgbColor(input: string): Rgb | null {
  const match = input.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return null;
  return {
    r: clamp(Number(match[1])),
    g: clamp(Number(match[2])),
    b: clamp(Number(match[3]))
  };
}

function cssColorToRgb(input: string, fallback: Rgb): Rgb {
  if (!input) return fallback;
  const directHex = parseHexColor(input);
  if (directHex) return directHex;
  const directRgb = parseRgbColor(input);
  if (directRgb) return directRgb;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return fallback;

  context.fillStyle = '#000000';
  context.fillStyle = input;
  const normalized = context.fillStyle;

  const normalizedHex = parseHexColor(normalized);
  if (normalizedHex) return normalizedHex;

  const normalizedRgb = parseRgbColor(normalized);
  if (normalizedRgb) return normalizedRgb;

  return fallback;
}

function mix(a: Rgb, b: Rgb, ratio: number): Rgb {
  const clamped = Math.max(0, Math.min(1, ratio));
  return {
    r: clamp(a.r * (1 - clamped) + b.r * clamped),
    g: clamp(a.g * (1 - clamped) + b.g * clamped),
    b: clamp(a.b * (1 - clamped) + b.b * clamped)
  };
}

function luminance(color: Rgb) {
  const toLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function readCssVariable(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildPalette() {
  const accent = cssColorToRgb(readCssVariable('--g-accent'), { r: 154, g: 101, b: 255 });
  const text = cssColorToRgb(readCssVariable('--g-text'), { r: 241, g: 245, b: 252 });
  const textSoft = cssColorToRgb(readCssVariable('--g-text-soft'), { r: 170, g: 176, b: 190 });
  const surface = cssColorToRgb(readCssVariable('--g-surface-strong'), { r: 14, g: 18, b: 26 });
  const shell = cssColorToRgb(readCssVariable('--g-shell'), { r: 10, g: 14, b: 24 });

  const isLight = luminance(surface) > 0.45;
  const background = mix(shell, surface, 0.35);
  const foreground = mix(text, isLight ? { r: 12, g: 16, b: 28 } : { r: 250, g: 252, b: 255 }, isLight ? 0.18 : 0.1);
  const comment = mix(textSoft, background, isLight ? 0.25 : 0.35);
  const stringColor = mix(accent, { r: 255, g: 195, b: 110 }, 0.42);
  const numberColor = mix(accent, { r: 124, g: 214, b: 255 }, 0.45);
  const variableColor = mix(accent, { r: 128, g: 255, b: 196 }, 0.36);
  const commandColor = mix(accent, { r: 255, g: 128, b: 214 }, 0.28);

  return {
    isLight,
    accent: rgbToHex(accent),
    background: rgbToHex(background),
    foreground: rgbToHex(foreground),
    comment: rgbToHex(comment),
    stringColor: rgbToHex(stringColor),
    numberColor: rgbToHex(numberColor),
    variableColor: rgbToHex(variableColor),
    commandColor: rgbToHex(commandColor),
    cursor: rgbToHex(mix(accent, foreground, 0.2)),
    lineHighlight: rgbToHex(mix(background, accent, isLight ? 0.07 : 0.16)),
    selection: rgbToHex(mix(accent, background, isLight ? 0.65 : 0.72)),
    gutter: rgbToHex(mix(background, isLight ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, isLight ? 0.08 : 0.12))
  };
}

let languageRegistered = false;

export function ensureBloomScriptLanguage(monaco: MonacoApi) {
  if (languageRegistered) return;
  languageRegistered = true;

  monaco.languages.register({ id: BLOOM_SCRIPT_LANGUAGE_ID });
  monaco.languages.setLanguageConfiguration(BLOOM_SCRIPT_LANGUAGE_ID, {
    comments: {
      lineComment: '#'
    },
    brackets: [
      ['{', '}'],
      ['(', ')'],
      ['[', ']']
    ],
    autoClosingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '[', close: ']' }
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '(', close: ')' },
      { open: '{', close: '}' },
      { open: '[', close: ']' }
    ]
  });

  monaco.languages.setMonarchTokensProvider(BLOOM_SCRIPT_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\s+#.*$/, 'comment'],
        [/\s+\/\/.*$/, 'comment'],
        [/^#.*$/, 'comment'],
        [/^\/\/.*$/, 'comment'],
        [/\$[A-Za-z_][\w-]*/, 'variable'],
        [/("([^"\\]|\\.)*")|('([^'\\]|\\.)*')/, 'string'],
        [/\b-?\d+(?:\.\d+)?\b/, 'number'],
        [/\b(?:theme|appearance|ui|motion|module|instance|dev|about)\.[a-z][\w-]*\b/, 'keyword.flow'],
        [/\b(?:help|clear|version|about|echo|bloom|petals|whoami|print|sleep|run)\b/, 'keyword.control'],
        [/\b(?:let|true|false)\b/, 'keyword'],
        [/[=]/, 'operator'],
        [/[{}()[\]]/, 'delimiter.bracket'],
        [/[A-Za-z_][\w.-]*/, 'identifier']
      ]
    }
  });
}

export function applyBloomScriptTheme(monaco: MonacoApi) {
  const palette = buildPalette();

  monaco.editor.defineTheme(BLOOM_SCRIPT_THEME_ID, {
    base: palette.isLight ? 'vs' : 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: palette.comment.slice(1), fontStyle: 'italic' },
      { token: 'keyword', foreground: palette.accent.slice(1), fontStyle: 'bold' },
      { token: 'keyword.control', foreground: palette.commandColor.slice(1), fontStyle: 'bold' },
      { token: 'keyword.flow', foreground: palette.commandColor.slice(1), fontStyle: 'bold' },
      { token: 'variable', foreground: palette.variableColor.slice(1), fontStyle: 'bold' },
      { token: 'string', foreground: palette.stringColor.slice(1) },
      { token: 'number', foreground: palette.numberColor.slice(1) },
      { token: 'identifier', foreground: palette.foreground.slice(1) },
      { token: 'operator', foreground: palette.accent.slice(1) }
    ],
    colors: {
      'editor.background': palette.background,
      'editor.foreground': palette.foreground,
      'editor.lineHighlightBackground': palette.lineHighlight,
      'editorLineNumber.foreground': palette.comment,
      'editorLineNumber.activeForeground': palette.foreground,
      'editorCursor.foreground': palette.cursor,
      'editor.selectionBackground': palette.selection,
      'editor.inactiveSelectionBackground': palette.selection,
      'editorGutter.background': palette.gutter,
      'editorIndentGuide.background1': palette.lineHighlight,
      'editorIndentGuide.activeBackground1': palette.accent,
      'editorBracketHighlight.foreground1': palette.accent,
      'editorBracketHighlight.foreground2': palette.numberColor,
      'editorBracketHighlight.foreground3': palette.stringColor,
      'editorSuggestWidget.background': palette.gutter,
      'editorSuggestWidget.border': palette.lineHighlight,
      'editorSuggestWidget.foreground': palette.foreground,
      'editorSuggestWidget.selectedBackground': palette.lineHighlight
    }
  });

  monaco.editor.setTheme(BLOOM_SCRIPT_THEME_ID);
}

export function registerBloomScriptCompletionProvider(monaco: MonacoApi, sources: CompletionSources) {
  return monaco.languages.registerCompletionItemProvider(BLOOM_SCRIPT_LANGUAGE_ID, {
    triggerCharacters: ['.', '$', '-', '_', '"', "'", ' '],
    provideCompletionItems: async (model, position) => {
      const line = model.getLineContent(position.lineNumber);
      const linePrefix = line.slice(0, position.column - 1);
      const endsWithSpace = /\s$/.test(linePrefix);
      const prefixMatch = linePrefix.match(/[\$A-Za-z0-9_.-]*$/);
      const prefix = prefixMatch?.[0] ?? '';
      const normalizedPrefix = prefix.toLowerCase();
      const startColumn = Math.max(1, position.column - prefix.length);

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn,
        endColumn: position.column
      };

      const commandIndex = sources.getCommandIndex();
      const consoleContext = sources.getConsoleContext();
      const variableNames = Array.from(new Set(sources.getVariables())).sort((a, b) => a.localeCompare(b));

      const items: import('monaco-editor').languages.CompletionItem[] = [];
      const seen = new Set<string>();

      const pushItem = (
        label: string,
        insertText: string,
        kind: import('monaco-editor').languages.CompletionItemKind,
        detail: string,
        documentation?: string
      ) => {
        const key = `${label}-${insertText}-${kind}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          label,
          insertText,
          kind,
          detail,
          documentation,
          range
        });
      };

      const pushCommandMatches = (commandPrefix: string) => {
        const filtered = commandIndex.allCommandNames.filter((name) => name.startsWith(commandPrefix));
        for (const commandName of filtered) {
          const definition = commandIndex.scriptToDefinition[commandName];
          pushItem(
            commandName,
            commandName,
            monaco.languages.CompletionItemKind.Function,
            definition ? `${definition.category} command` : 'Command'
          );
        }
      };

      const tokens = tokenizeBloomScriptLine(linePrefix, position.lineNumber);

      if (normalizedPrefix.startsWith('$')) {
        const variablePrefix = normalizedPrefix.slice(1);
        for (const variableName of variableNames) {
          if (variablePrefix && !variableName.toLowerCase().startsWith(variablePrefix)) continue;
          pushItem(`$${variableName}`, `$${variableName}`, monaco.languages.CompletionItemKind.Variable, 'Variable reference');
        }
        return { suggestions: items };
      }

      if (tokens.length === 0) {
        pushCommandMatches(normalizedPrefix);
        pushItem('let', 'let name = "value"', monaco.languages.CompletionItemKind.Snippet, 'Variable assignment');
        pushItem('print', 'print "message"', monaco.languages.CompletionItemKind.Snippet, 'Print output');
        pushItem('run', 'run "help"', monaco.languages.CompletionItemKind.Snippet, 'Execute a raw Bloom command string');
        return { suggestions: items };
      }

      const firstToken = tokens[0].value.toLowerCase();
      if (firstToken === 'let') {
        if (tokens.length <= 1) {
          pushItem('let template', 'let name = "value"', monaco.languages.CompletionItemKind.Snippet, 'Create a variable');
          return { suggestions: items };
        }

        const hasEquals = tokens.some((token) => token.value === '=');
        if (!hasEquals) {
          pushItem('=', '=', monaco.languages.CompletionItemKind.Operator, 'Assignment operator');
          return { suggestions: items };
        }

        for (const variableName of variableNames) {
          pushItem(`$${variableName}`, `$${variableName}`, monaco.languages.CompletionItemKind.Variable, 'Variable reference');
        }
        return { suggestions: items };
      }

      if (tokens.length === 1 && !endsWithSpace) {
        pushCommandMatches(normalizedPrefix);
        return { suggestions: items };
      }

      const resolved = resolveBloomScriptCommand(tokens, commandIndex);
      if (!resolved) {
        if (tokens.length >= 1) {
          const commandPrefix = endsWithSpace ? `${firstToken}.` : firstToken;
          pushCommandMatches(commandPrefix);
        }
        return { suggestions: items };
      }

      const rawArgs = resolved.argTokens.map((token) => token.value);
      if (resolved.definition.autocomplete) {
        const dynamic = await Promise.resolve(resolved.definition.autocomplete(rawArgs, consoleContext));
        for (const value of dynamic) {
          const insertText = /\s/.test(value) ? `"${value}"` : value;
          pushItem(value, insertText, monaco.languages.CompletionItemKind.Value, 'Suggested value');
        }
      }

      if (resolved.definition.args && resolved.definition.args.length > 0) {
        const argIndex = Math.min(rawArgs.length, resolved.definition.args.length - 1);
        const schema = resolved.definition.args[argIndex];
        if (schema?.choices) {
          for (const choice of schema.choices) {
            pushItem(choice, choice, monaco.languages.CompletionItemKind.EnumMember, `Choice for ${schema.name}`);
          }
        }
      }

      for (const variableName of variableNames) {
        pushItem(`$${variableName}`, `$${variableName}`, monaco.languages.CompletionItemKind.Variable, 'Variable reference');
      }

      return { suggestions: items };
    }
  });
}

export function toMonacoMarkers(monaco: MonacoApi, diagnostics: BloomScriptDiagnostic[]) {
  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message,
    severity: diagnostic.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
    startLineNumber: diagnostic.line,
    endLineNumber: diagnostic.line,
    startColumn: Math.max(1, diagnostic.column),
    endColumn: Math.max(diagnostic.column + 1, diagnostic.endColumn ?? diagnostic.column + 1)
  }));
}
