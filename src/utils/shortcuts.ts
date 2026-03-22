const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const;

const SHIFTED_SYMBOL_TO_DIGIT: Record<string, string> = {
  '!': '1',
  '@': '2',
  '#': '3',
  '$': '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0'
};

const KEY_ALIASES: Record<string, string> = {
  control: 'ctrl',
  command: 'meta',
  cmd: 'meta',
  win: 'meta',
  super: 'meta',
  option: 'alt',
  esc: 'escape',
  return: 'enter',
  spacebar: 'space'
};

const CODE_TOKEN_MAP: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'space',
  NumpadEnter: 'enter',
  NumpadDecimal: '.',
  NumpadSubtract: '-',
  NumpadMultiply: '*',
  NumpadDivide: '/',
  NumpadAdd: 'numpadadd'
};

function normalizeKeyToken(token: string): string {
  if (!token) return '';
  let out = token.trim().toLowerCase();
  if (!out) return '';

  out = KEY_ALIASES[out] ?? out;
  out = SHIFTED_SYMBOL_TO_DIGIT[out] ?? out;

  if (/^key[a-z]$/.test(out)) return out.slice(3);
  if (/^digit[0-9]$/.test(out)) return out.slice(5);
  if (/^numpad[0-9]$/.test(out)) return out.slice(6);

  return out;
}

function resolveKeyFromEvent(event: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^Numpad[0-9]$/.test(event.code)) return event.code.slice(6);
  if (CODE_TOKEN_MAP[event.code]) return CODE_TOKEN_MAP[event.code];
  if (event.key === ' ') return 'space';
  return normalizeKeyToken(event.key);
}

export function normalizeShortcut(text: string): string {
  const rawParts = text
    .split('+')
    .map((part) => normalizeKeyToken(part))
    .filter(Boolean);

  const modifiers = new Set<string>();
  const keys: string[] = [];

  for (const part of rawParts) {
    if (MODIFIER_ORDER.includes(part as (typeof MODIFIER_ORDER)[number])) {
      modifiers.add(part);
    } else {
      keys.push(part);
    }
  }

  const ordered: string[] = [];
  for (const modifier of MODIFIER_ORDER) {
    if (modifiers.has(modifier)) ordered.push(modifier);
  }
  if (keys.length > 0) ordered.push(keys[keys.length - 1]);
  return ordered.join('+');
}

export function eventToNormalizedShortcut(event: KeyboardEvent): string {
  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey) modifiers.push('shift');
  if (event.metaKey) modifiers.push('meta');

  const key = resolveKeyFromEvent(event);
  if (!key || MODIFIER_ORDER.includes(key as (typeof MODIFIER_ORDER)[number])) {
    return '';
  }

  return normalizeShortcut([...modifiers, key].join('+'));
}

function toDisplayPart(part: string): string {
  if (part === 'ctrl') return 'Ctrl';
  if (part === 'alt') return 'Alt';
  if (part === 'shift') return 'Shift';
  if (part === 'meta') return 'Meta';
  if (part === 'space') return 'Space';
  if (part === 'escape') return 'Escape';
  if (part === 'enter') return 'Enter';
  if (part === 'tab') return 'Tab';
  if (part === 'backspace') return 'Backspace';
  if (part === 'delete') return 'Delete';
  if (part === 'arrowup') return 'ArrowUp';
  if (part === 'arrowdown') return 'ArrowDown';
  if (part === 'arrowleft') return 'ArrowLeft';
  if (part === 'arrowright') return 'ArrowRight';
  if (part === 'numpadadd') return 'NumpadAdd';
  if (/^[a-z]$/.test(part)) return part.toUpperCase();
  return part;
}

export function normalizedShortcutToDisplay(shortcut: string): string {
  const normalized = normalizeShortcut(shortcut);
  if (!normalized) return '';
  return normalized.split('+').map(toDisplayPart).join('+');
}

export function eventToDisplayShortcut(event: KeyboardEvent): string {
  const normalized = eventToNormalizedShortcut(event);
  return normalizedShortcutToDisplay(normalized);
}
