export type ShopRarityKey =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic'
  | 'unique'
  | 'featured'
  | 'partner'
  | 'custom';

export type ShopRarityColors = {
  start: string;
  end: string;
  glow: string;
};

export type ShopRarityPresetId =
  | 'default'
  | 'grayscale'
  | 'rainbow'
  | 'blue'
  | 'yellow'
  | 'red'
  | 'green'
  | 'pink'
  | 'purple'
  | 'orange'
  | 'custom';

export type ShopRarityThemeSettings = {
  presetId: ShopRarityPresetId;
  custom: Record<ShopRarityKey, ShopRarityColors>;
};

export const SHOP_RARITY_THEME_STORAGE_KEY = 'bloom_shop_rarity_theme_v1';
export const SHOP_RARITY_THEME_CHANGE_EVENT = 'bloom-shop-rarity-theme-change';

export const SHOP_RARITY_ORDER: ShopRarityKey[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique', 'featured', 'partner', 'custom'];

const BASE_DEFAULTS: Record<ShopRarityKey, ShopRarityColors> = {
  common: { start: 'rgba(126, 132, 146, 0.42)', end: 'rgba(42, 47, 56, 0.92)', glow: 'rgba(126, 132, 146, 0.32)' },
  uncommon: { start: 'rgba(78, 191, 119, 0.42)', end: 'rgba(21, 69, 41, 0.92)', glow: 'rgba(78, 191, 119, 0.34)' },
  rare: { start: 'rgba(87, 148, 255, 0.42)', end: 'rgba(22, 52, 118, 0.92)', glow: 'rgba(87, 148, 255, 0.34)' },
  epic: { start: 'rgba(169, 121, 255, 0.42)', end: 'rgba(58, 31, 104, 0.92)', glow: 'rgba(169, 121, 255, 0.34)' },
  legendary: { start: 'rgba(255, 184, 76, 0.42)', end: 'rgba(111, 60, 9, 0.92)', glow: 'rgba(255, 184, 76, 0.36)' },
  mythic: { start: 'rgba(255, 84, 116, 0.42)', end: 'rgba(97, 13, 48, 0.92)', glow: 'rgba(255, 84, 116, 0.34)' },
  unique: { start: 'rgba(68, 225, 217, 0.42)', end: 'rgba(11, 78, 88, 0.92)', glow: 'rgba(68, 225, 217, 0.35)' },
  featured: { start: 'rgba(255, 122, 64, 0.42)', end: 'rgba(111, 38, 7, 0.92)', glow: 'rgba(255, 122, 64, 0.35)' },
  partner: { start: 'rgba(255, 103, 189, 0.42)', end: 'rgba(103, 18, 72, 0.92)', glow: 'rgba(255, 103, 189, 0.35)' },
  custom: { start: 'rgba(198, 120, 255, 0.42)', end: 'rgba(78, 32, 127, 0.92)', glow: 'rgba(198, 120, 255, 0.35)' }
};

function makeMonoPalette(hues: Array<[ShopRarityKey, string, string, string]>): Record<ShopRarityKey, ShopRarityColors> {
  return Object.fromEntries(hues.map(([key, start, end, glow]) => [key, { start, end, glow }])) as Record<ShopRarityKey, ShopRarityColors>;
}

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgba(r: number, g: number, b: number, a: number) {
  return `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${a})`;
}

function makeSingleHueRamp(base: {
  light: [number, number, number];
  dark: [number, number, number];
  glow: [number, number, number];
}): Record<ShopRarityKey, ShopRarityColors> {
  const weights: Record<ShopRarityKey, number> = {
    common: 0.18,
    uncommon: 0.28,
    rare: 0.38,
    epic: 0.5,
    legendary: 0.64,
    mythic: 0.76,
    unique: 0.86,
    featured: 0.92,
    partner: 1,
    custom: 0.58
  };

  const mix = (from: [number, number, number], to: [number, number, number], t: number): [number, number, number] => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ];

  return Object.fromEntries(
    SHOP_RARITY_ORDER.map((key) => {
      const t = weights[key];
      const start = mix(base.light, base.dark, Math.max(0, t - 0.08));
      const end = mix(base.dark, [12, 8, 18], 0.14);
      const glow = mix(base.glow, base.dark, Math.max(0, t - 0.18));
      return [
        key,
        {
          start: rgba(start[0], start[1], start[2], 0.48),
          end: rgba(end[0], end[1], end[2], 0.94),
          glow: rgba(glow[0], glow[1], glow[2], 0.36)
        }
      ];
    })
  ) as Record<ShopRarityKey, ShopRarityColors>;
}

export const SHOP_RARITY_PRESETS: Array<{ id: ShopRarityPresetId; label: string; description: string; colors?: Record<ShopRarityKey, ShopRarityColors> }> = [
  { id: 'default', label: 'Default', description: 'Use item rarity colors from the shop data.' },
  {
    id: 'grayscale',
    label: 'Gray Scaled',
    description: 'Neutral monochrome rarity styling.',
    colors: makeMonoPalette([
      ['common', 'rgba(178,178,178,0.42)', 'rgba(58,58,58,0.92)', 'rgba(178,178,178,0.30)'],
      ['uncommon', 'rgba(194,194,194,0.42)', 'rgba(66,66,66,0.92)', 'rgba(194,194,194,0.30)'],
      ['rare', 'rgba(210,210,210,0.42)', 'rgba(74,74,74,0.92)', 'rgba(210,210,210,0.30)'],
      ['epic', 'rgba(224,224,224,0.42)', 'rgba(84,84,84,0.92)', 'rgba(224,224,224,0.30)'],
      ['legendary', 'rgba(236,236,236,0.42)', 'rgba(94,94,94,0.92)', 'rgba(236,236,236,0.30)'],
      ['mythic', 'rgba(245,245,245,0.42)', 'rgba(106,106,106,0.92)', 'rgba(245,245,245,0.30)'],
      ['unique', 'rgba(228,228,228,0.42)', 'rgba(88,88,88,0.92)', 'rgba(228,228,228,0.30)'],
      ['featured', 'rgba(236,236,236,0.42)', 'rgba(98,98,98,0.92)', 'rgba(236,236,236,0.30)'],
      ['partner', 'rgba(222,222,222,0.42)', 'rgba(82,82,82,0.92)', 'rgba(222,222,222,0.30)'],
      ['custom', 'rgba(204,204,204,0.42)', 'rgba(72,72,72,0.92)', 'rgba(204,204,204,0.30)']
    ])
  },
  {
    id: 'rainbow',
    label: 'Rainbow',
    description: 'Split rarities across a full spectrum.',
    colors: makeMonoPalette([
      ['common', 'rgba(255,99,99,0.42)', 'rgba(105,18,18,0.92)', 'rgba(255,99,99,0.34)'],
      ['uncommon', 'rgba(255,166,77,0.42)', 'rgba(120,51,8,0.92)', 'rgba(255,166,77,0.34)'],
      ['rare', 'rgba(255,228,84,0.42)', 'rgba(107,92,9,0.92)', 'rgba(255,228,84,0.34)'],
      ['epic', 'rgba(102,224,116,0.42)', 'rgba(20,88,32,0.92)', 'rgba(102,224,116,0.34)'],
      ['legendary', 'rgba(83,210,255,0.42)', 'rgba(11,72,95,0.92)', 'rgba(83,210,255,0.34)'],
      ['mythic', 'rgba(102,143,255,0.42)', 'rgba(20,41,112,0.92)', 'rgba(102,143,255,0.34)'],
      ['unique', 'rgba(164,109,255,0.42)', 'rgba(54,24,120,0.92)', 'rgba(164,109,255,0.34)'],
      ['featured', 'rgba(255,106,214,0.42)', 'rgba(112,18,82,0.92)', 'rgba(255,106,214,0.34)'],
      ['partner', 'rgba(255,90,150,0.42)', 'rgba(108,14,54,0.92)', 'rgba(255,90,150,0.34)'],
      ['custom', 'rgba(87,235,223,0.42)', 'rgba(15,96,90,0.92)', 'rgba(87,235,223,0.34)']
    ])
  },
  { id: 'blue', label: 'Blue', description: 'Cool blue rarity treatment.', colors: makeSingleHueRamp({ light: [158, 205, 255], dark: [44, 92, 182], glow: [116, 178, 255] }) },
  { id: 'yellow', label: 'Yellow', description: 'Gold-forward rarity treatment.', colors: makeSingleHueRamp({ light: [255, 226, 150], dark: [176, 122, 28], glow: [255, 206, 104] }) },
  { id: 'red', label: 'Red', description: 'Aggressive crimson rarity treatment.', colors: makeSingleHueRamp({ light: [255, 170, 176], dark: [174, 42, 66], glow: [255, 112, 136] }) },
  { id: 'green', label: 'Green', description: 'Forest and emerald rarity treatment.', colors: makeSingleHueRamp({ light: [170, 238, 184], dark: [38, 132, 74], glow: [118, 220, 148] }) },
  { id: 'pink', label: 'Pink', description: 'Candy pink rarity treatment.', colors: makeSingleHueRamp({ light: [255, 205, 228], dark: [156, 46, 114], glow: [255, 132, 196] }) },
  { id: 'purple', label: 'Purple', description: 'Violet rarity treatment.', colors: makeSingleHueRamp({ light: [220, 194, 255], dark: [104, 58, 176], glow: [184, 132, 255] }) },
  { id: 'orange', label: 'Orange', description: 'Burnt orange rarity treatment.', colors: makeSingleHueRamp({ light: [255, 208, 164], dark: [188, 92, 34], glow: [255, 154, 86] }) },
  { id: 'custom', label: 'Custom', description: 'Set every rarity to your own colors.' }
];

function isRarityKey(value: unknown): value is ShopRarityKey {
  return typeof value === 'string' && SHOP_RARITY_ORDER.includes(value as ShopRarityKey);
}

function isPresetId(value: unknown): value is ShopRarityPresetId {
  return typeof value === 'string' && SHOP_RARITY_PRESETS.some((preset) => preset.id === value);
}

function isColorSet(value: unknown): value is ShopRarityColors {
  return typeof value === 'object' && value !== null
    && typeof (value as ShopRarityColors).start === 'string'
    && typeof (value as ShopRarityColors).end === 'string'
    && typeof (value as ShopRarityColors).glow === 'string';
}

export function getDefaultShopRarityCustomColors(): Record<ShopRarityKey, ShopRarityColors> {
  return structuredClone(BASE_DEFAULTS);
}

export function readShopRarityThemeSettings(): ShopRarityThemeSettings {
  try {
    const raw = localStorage.getItem(SHOP_RARITY_THEME_STORAGE_KEY);
    if (!raw) {
      return { presetId: 'default', custom: getDefaultShopRarityCustomColors() };
    }
    const parsed = JSON.parse(raw) as Partial<ShopRarityThemeSettings>;
    const custom = getDefaultShopRarityCustomColors();
    const parsedCustom = parsed.custom as Record<string, unknown> | undefined;
    if (parsedCustom && typeof parsedCustom === 'object') {
      for (const [key, value] of Object.entries(parsedCustom)) {
        if (isRarityKey(key) && isColorSet(value)) {
          custom[key] = { ...value };
        }
      }
    }
    return {
      presetId: isPresetId(parsed.presetId) ? parsed.presetId : 'default',
      custom
    };
  } catch {
    return { presetId: 'default', custom: getDefaultShopRarityCustomColors() };
  }
}

export function writeShopRarityThemeSettings(settings: ShopRarityThemeSettings) {
  localStorage.setItem(SHOP_RARITY_THEME_STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(SHOP_RARITY_THEME_CHANGE_EVENT, { detail: settings }));
}

export function resolveShopRarityColors(rarity: string, fallback: ShopRarityColors, settings: ShopRarityThemeSettings): ShopRarityColors {
  const normalized = (rarity || 'common').trim().toLowerCase() as ShopRarityKey;
  const key = SHOP_RARITY_ORDER.includes(normalized) ? normalized : 'custom';
  if (settings.presetId === 'default') {
    return fallback;
  }
  if (settings.presetId === 'custom') {
    return settings.custom[key] ?? fallback;
  }
  const preset = SHOP_RARITY_PRESETS.find((entry) => entry.id === settings.presetId);
  return preset?.colors?.[key] ?? fallback;
}
