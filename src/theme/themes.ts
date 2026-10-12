export type ThemeMode = 'dark' | 'light';
export type ThemeCategory = 'Classic' | 'Ocean & Nature' | 'Vibrant' | 'Soft & Minimal' | 'Professional Studio' | 'Accessibility' | 'Custom';
export type ThemeDensity = 'comfortable' | 'compact';

/** UI-only tokens. Artwork pixels, document backgrounds and saved color values never consume these. */
export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  canvasSurround: string;
  toolbar: string;
  popover: string;
  tooltip: string;
  text: string;
  muted: string;
  subtleText: string;
  disabledText: string;
  border: string;
  divider: string;
  accent: string;
  accentSecondary: string;
  onAccent: string;
  selection: string;
  selectionText: string;
  focus: string;
  interactiveHover: string;
  interactivePressed: string;
  success: string;
  warning: string;
  danger: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  category: ThemeCategory;
  mode: ThemeMode;
  description: string;
  tokens: ThemeTokens;
}

export interface ThemeSpec {
  name: string;
  description: string;
  mode: ThemeMode;
  tokens: ThemeTokens;
}

export const DEFAULT_THEME_ID = 'carbon-prime';
export const THEME_BUNDLE_FORMAT = 'carbon-theme-studio';
export const THEME_BUNDLE_VERSION = 2;
export const MAX_THEME_NAME_LENGTH = 40;
export const MAX_THEME_DESCRIPTION_LENGTH = 120;
export const MAX_CUSTOM_THEMES = 50;
export const MAX_IMPORTED_THEMES = MAX_CUSTOM_THEMES;
export const MAX_THEME_BUNDLE_BYTES = 65_536;

export const THEME_TOKEN_KEYS = [
  'background', 'surface', 'surfaceRaised', 'surfaceSunken', 'canvasSurround', 'toolbar', 'popover', 'tooltip',
  'text', 'muted', 'subtleText', 'disabledText', 'border', 'divider', 'accent', 'accentSecondary', 'onAccent',
  'selection', 'selectionText', 'focus', 'interactiveHover', 'interactivePressed', 'success', 'warning', 'danger',
] as const satisfies readonly (keyof ThemeTokens)[];

export const LEGACY_THEME_TOKEN_KEYS = [
  'background', 'surface', 'surfaceRaised', 'text', 'muted', 'border', 'accent', 'onAccent', 'focus', 'success', 'warning', 'danger',
] as const;

export const THEME_TOKEN_LABELS: Record<keyof ThemeTokens, string> = {
  background: 'Main background',
  surface: 'Panel surface',
  surfaceRaised: 'Raised surface',
  surfaceSunken: 'Recessed surface',
  canvasSurround: 'Canvas surround',
  toolbar: 'Toolbar',
  popover: 'Menu and popover',
  tooltip: 'Tooltip surface',
  text: 'Primary text',
  muted: 'Secondary text',
  subtleText: 'Subtle text',
  disabledText: 'Disabled text',
  border: 'Borders',
  divider: 'Dividers',
  accent: 'Primary accent',
  accentSecondary: 'Secondary accent',
  onAccent: 'Text on accent',
  selection: 'Selection fill',
  selectionText: 'Text on selection',
  focus: 'Keyboard focus',
  interactiveHover: 'Hover state',
  interactivePressed: 'Pressed state',
  success: 'Success status',
  warning: 'Warning status',
  danger: 'Error status',
};

const type = (id: string, name: string, category: ThemeCategory, mode: ThemeMode, description: string, colors: CoreColors): ThemeDefinition => ({
  id, name, category, mode, description, tokens: expandCoreColors(colors),
});

type CoreColors = readonly [
  background: string, surface: string, surfaceRaised: string, text: string, muted: string, border: string,
  accent: string, onAccent: string, focus: string, success: string, warning: string, danger: string,
];

function expandCoreColors(c: CoreColors): ThemeTokens {
  return {
    background: c[0], surface: c[1], surfaceRaised: c[2],
    surfaceSunken: c[0], canvasSurround: c[0], toolbar: c[1], popover: c[2], tooltip: c[1],
    text: c[3], muted: c[4], subtleText: c[4], disabledText: c[4], border: c[5], divider: c[5],
    accent: c[6], accentSecondary: c[8], onAccent: c[7], selection: c[6], selectionText: c[7], focus: c[8],
    interactiveHover: c[2], interactivePressed: c[0], success: c[9], warning: c[10], danger: c[11],
  };
}

/** Each palette is a composed studio identity, not a hue filter over one base theme. */
export const BUILT_IN_THEMES: readonly ThemeDefinition[] = [
  type('carbon-prime', 'Carbon Prime', 'Classic', 'dark', 'The Carbon identity: charcoal, graphite surfaces and the Ember accent.', [
    '#141416', '#1b1b1f', '#27272c', '#f4f3ef', '#c1c0c6', '#626168', '#e8913a', '#161311', '#ffd27a', '#8de3ae', '#ffd166', '#ff8a80',
  ]),
  type('carbon-dark', 'Carbon Dark', 'Classic', 'dark', 'Cool graphite panels and a quiet mineral-blue highlight.', [
    '#0f1418', '#172127', '#24313a', '#eef6fa', '#bdcbd3', '#60727d', '#8cb8d4', '#102733', '#b1dfff', '#84d6ab', '#f1cf76', '#ff9292',
  ]),
  type('carbon-light', 'Carbon Light', 'Classic', 'light', 'A crisp, bright studio with warm umber actions and dark labels.', [
    '#f4f5f7', '#ffffff', '#e8ebf0', '#18191c', '#515760', '#6b7078', '#8b3d00', '#ffffff', '#763900', '#136b39', '#6a4600', '#9b1c24',
  ]),
  type('midnight', 'Midnight', 'Classic', 'dark', 'Inky indigo surfaces, soft periwinkle text and violet focus.', [
    '#0b0e1d', '#151a30', '#242a45', '#f1f3ff', '#bec7e8', '#505b84', '#9c8cff', '#1c1430', '#c3b8ff', '#88dda9', '#f7d27a', '#ff9ca7',
  ]),
  type('graphite', 'Graphite', 'Classic', 'dark', 'Balanced cool greys, a silver accent and precise neutral contrast.', [
    '#131517', '#202326', '#30353a', '#f1f4f7', '#c1c6cc', '#666d74', '#c6cdd4', '#171a1d', '#f5f7fa', '#8ee1ae', '#ffd166', '#ff8b84',
  ]),
  type('slate', 'Slate', 'Classic', 'dark', 'Blue-grey panels with a muted steel-blue accent for long sessions.', [
    '#202833', '#2a3542', '#374454', '#edf2f7', '#bcc7d3', '#68788a', '#90b4d0', '#172736', '#c3e0f5', '#91dbb1', '#f2d17e', '#ff9a90',
  ]),
  type('monochrome', 'Monochrome', 'Classic', 'dark', 'A strict black-and-white workspace with no chromatic accent.', [
    '#070707', '#161616', '#262626', '#ffffff', '#dddddd', '#6d6d6d', '#ffffff', '#111111', '#f0f0f0', '#9be2ae', '#ffe080', '#ff9595',
  ]),

  type('ocean-depth', 'Deep Ocean', 'Ocean & Nature', 'dark', 'A midnight sea palette with sea-glass cyan and deep-blue structure.', [
    '#081a25', '#102b3b', '#1a3b4e', '#eaf7fc', '#bcd4df', '#547184', '#68ddf2', '#06232a', '#8cebff', '#71dba1', '#ffd37a', '#ff9791',
  ]),
  type('arctic-blue', 'Arctic Blue', 'Ocean & Nature', 'dark', 'Glacial navy, ice-blue highlights and cool neutral text.', [
    '#0b1825', '#132b42', '#203b58', '#ecf7ff', '#bfd5e8', '#59728a', '#7ec8ff', '#09233c', '#a9dcff', '#76d6ac', '#f2d17d', '#ff9ba4',
  ]),
  type('sea-glass', 'Sea Glass', 'Ocean & Nature', 'dark', 'Muted jade depths, translucent teal surfaces and a mint accent.', [
    '#10211e', '#19332f', '#274841', '#ebfaf6', '#bdddd3', '#567b72', '#79d6bd', '#122c26', '#a3edda', '#79ddb0', '#e9cf79', '#ff9a91',
  ]),
  type('tropical-lagoon', 'Tropical Lagoon', 'Ocean & Nature', 'dark', 'Lagoon green, warm shoreline warnings and a bright aqua selection.', [
    '#06231f', '#0d3832', '#16534b', '#ebfffa', '#bce9dc', '#4b9584', '#55e0bc', '#062b24', '#8ff5d8', '#68dda0', '#f3d264', '#ff9694',
  ]),
  type('forest', 'Forest', 'Ocean & Nature', 'dark', 'Evergreen panels, clear leaf-green actions and calm cream text.', [
    '#101a14', '#1a2a20', '#263b2d', '#edf8ee', '#c0d8c2', '#5d7a62', '#8be0a8', '#0a2415', '#b0f4c2', '#8be0a8', '#ffda83', '#ff9893',
  ]),
  type('moss', 'Moss', 'Ocean & Nature', 'dark', 'Olive shadows and a lichen-lime accent with warm, legible neutrals.', [
    '#182016', '#272f20', '#39452f', '#f3f7e8', '#cbd6b7', '#73815d', '#c5d76c', '#252c16', '#e4f197', '#a7d779', '#efd47b', '#ff9b86',
  ]),
  type('sakura', 'Sakura', 'Ocean & Nature', 'dark', 'Deep plum surfaces with restrained cherry-blossom pink highlights.', [
    '#2a1722', '#3b2030', '#512b3f', '#fff0f5', '#e1bdcd', '#805368', '#f1a3c4', '#311c27', '#ffc7dc', '#9ae0b0', '#f4d080', '#ff94a5',
  ]),
  type('autumn', 'Autumn', 'Ocean & Nature', 'dark', 'Burnished bark, leaf-amber accents and parchment secondary text.', [
    '#27180f', '#382318', '#503323', '#fff3e8', '#e4c7ad', '#80634c', '#e9994f', '#2b170d', '#ffc987', '#8ce0a0', '#ffd479', '#ff9b8e',
  ]),
  type('desert-sand', 'Desert Sand', 'Ocean & Nature', 'light', 'Warm dune paper, clay actions and deep readable desert-ink text.', [
    '#f1e7d4', '#fff9ed', '#e5d5b8', '#30271b', '#685840', '#877556', '#8f4e26', '#ffffff', '#65351a', '#256346', '#6a4600', '#992f32',
  ]),

  type('neon-pulse', 'Neon Pulse', 'Vibrant', 'dark', 'Near-black panels with electric lime and fuchsia control states.', [
    '#080910', '#121520', '#202536', '#f5f8ff', '#c1cbe3', '#47526b', '#c8ff33', '#121706', '#ff54d8', '#67f0b5', '#ffd166', '#ff7592',
  ]),
  type('electric-violet', 'Electric Violet', 'Vibrant', 'dark', 'Royal violet surfaces, lilac actions and a soft lavender focus ring.', [
    '#110c22', '#1d1538', '#2c2050', '#f8f2ff', '#d4c5ef', '#6e5b91', '#c5a6ff', '#25123b', '#e0cfff', '#91e7bc', '#f5d17d', '#ff98ae',
  ]),
  type('cyberpunk', 'Cyberpunk', 'Vibrant', 'dark', 'Black-plum panels, neon magenta selection and acid-green focus.', [
    '#0a0711', '#17101f', '#28192d', '#fff5ff', '#d3bfd9', '#76566d', '#ff4fd8', '#310d29', '#b6ff42', '#72e6a4', '#ffe066', '#ff6e91',
  ]),
  type('synthwave', 'Synthwave', 'Vibrant', 'dark', 'Night-drive violet surfaces with a vivid rose accent and blue focus.', [
    '#17102e', '#24193f', '#362554', '#fff0ff', '#d4c5f1', '#705d96', '#ff70c4', '#35123a', '#9d9bff', '#87dfb2', '#f8d078', '#ff8ca8',
  ]),
  type('aurora', 'Aurora', 'Vibrant', 'dark', 'Northern-green light against blue spruce surfaces and a pale mint focus.', [
    '#091b20', '#102b30', '#1d4044', '#e9fbf7', '#bfdbd5', '#587a74', '#74e3c2', '#0d302c', '#a6f4df', '#76dfa5', '#f4d279', '#ff9c98',
  ]),
  type('solar-flare', 'Solar Flare', 'Vibrant', 'dark', 'Smoked umber surfaces, molten amber accents and bright solar focus.', [
    '#281407', '#3b1e08', '#562c0d', '#fff5e8', '#e6c5a0', '#8c6035', '#ffb548', '#2f1a07', '#ffe09b', '#94dfa0', '#ffd56c', '#ff9280',
  ]),
  type('crimson', 'Crimson', 'Vibrant', 'dark', 'Oxblood panels, rose-red controls and high-contrast blush text.', [
    '#260d16', '#3b1321', '#541b2e', '#fff1f5', '#e7bdcb', '#8a5065', '#ff728d', '#370f20', '#ffc0ce', '#8fe0ac', '#f3d17d', '#ff8c95',
  ]),
  type('emerald', 'Emerald', 'Vibrant', 'dark', 'Deep green enamel, clear emerald actions and soft silver-green text.', [
    '#071d18', '#0d3025', '#184635', '#ecfcf3', '#bbddc9', '#4b8065', '#71d99a', '#0c2c1a', '#a7f0bd', '#70e1a1', '#f2d077', '#ff9994',
  ]),
  type('cobalt', 'Cobalt', 'Vibrant', 'dark', 'Cobalt panels, bright blue selections and pale blue canvas controls.', [
    '#09172a', '#122646', '#1d3962', '#eff5ff', '#bfd1f0', '#526f9b', '#72aaff', '#0c2248', '#b1caff', '#82dfb2', '#f2d17a', '#ff969f',
  ]),
  type('ember', 'Ember', 'Vibrant', 'dark', 'Warm umber surfaces, a bright Ember accent and familiar Carbon warmth.', [
    '#21150f', '#302016', '#452c1d', '#fff1e5', '#dec4ae', '#80604a', '#ff9a48', '#241309', '#ffd09a', '#8ce0a0', '#ffd479', '#ff9b8e',
  ]),

  type('lavender', 'Lavender Mist', 'Soft & Minimal', 'light', 'Pale lilac paper, muted orchid controls and dark plum typography.', [
    '#f3effa', '#fcfaff', '#e8e0f2', '#261f30', '#5d5268', '#80718c', '#754db8', '#ffffff', '#5c3c93', '#246346', '#725000', '#9b334d',
  ]),
  type('rose-quartz', 'Rose Quartz', 'Soft & Minimal', 'light', 'Soft rose surfaces with a restrained berry accent and ink text.', [
    '#f8edf0', '#fff8f9', '#eedde3', '#322229', '#63515b', '#8a7480', '#9a4768', '#fff9fb', '#7b3853', '#236546', '#705000', '#9d2d37',
  ]),
  type('pastel-dreams', 'Pastel Dreams', 'Soft & Minimal', 'light', 'Powder-lilac surfaces and a calm indigo accent—not washed-out text.', [
    '#f1f0f8', '#fbfbff', '#e4e4f1', '#29273a', '#5a5970', '#7a798f', '#5850a0', '#ffffff', '#493f90', '#216342', '#6b4900', '#963246',
  ]),
  type('cloud', 'Cloud', 'Soft & Minimal', 'light', 'Cool white and mist-grey panels with slate-blue controls.', [
    '#eef2f5', '#fbfdff', '#e2e9ee', '#1f2b36', '#53616c', '#74848f', '#38657d', '#ffffff', '#25495f', '#216345', '#654500', '#98303c',
  ]),
  type('warm-cream', 'Warm Cream', 'Soft & Minimal', 'light', 'Cream paper, toasted-cocoa text and a grounded terracotta accent.', [
    '#f5eedf', '#fffaf0', '#e9dcc5', '#30281e', '#665847', '#88775f', '#86512a', '#ffffff', '#6e411f', '#246247', '#714900', '#9c3036',
  ]),
  type('soft-sage', 'Soft Sage', 'Soft & Minimal', 'light', 'Light sage panels, forest text and understated botanical controls.', [
    '#edf3eb', '#fafff8', '#dde8da', '#243128', '#536858', '#748779', '#387353', '#ffffff', '#28583f', '#22633f', '#6c4b00', '#96353d',
  ]),
  type('minimal-paper', 'Minimal Paper', 'Soft & Minimal', 'light', 'Uncoated white paper, charcoal ink and minimal ornament.', [
    '#ffffff', '#ffffff', '#f1f1f1', '#101010', '#333333', '#707070', '#222222', '#ffffff', '#000000', '#005a00', '#643d00', '#b00020',
  ]),

  type('studio-neutral', 'Studio Neutral', 'Professional Studio', 'dark', 'Neutral editing bays, soft graphite type and a restrained brass action.', [
    '#202225', '#2b2e32', '#393d42', '#f2f2ef', '#c2c5c8', '#666b71', '#c2a47a', '#251c12', '#e0c29a', '#8de0b0', '#f4d183', '#ff928b',
  ]),
  type('blueprint', 'Blueprint', 'Professional Studio', 'dark', 'Technical navy surfaces with blueprint-blue focus and selection.', [
    '#091c31', '#102b49', '#193d62', '#eef6ff', '#bdd1e5', '#587a99', '#6bb5ff', '#09203c', '#a6d4ff', '#79daa9', '#f3d07e', '#ff949d',
  ]),
  type('ink-and-paper', 'Ink and Paper', 'Professional Studio', 'light', 'Warm archival paper, deep blue-black ink and restrained indigo controls.', [
    '#f0eadf', '#faf6ed', '#e5dccd', '#211e1a', '#5e5549', '#817566', '#1b2b40', '#ffffff', '#0f3c52', '#246247', '#664600', '#9b3036',
  ]),
  type('warm-charcoal', 'Warm Charcoal', 'Professional Studio', 'dark', 'A softly warmed darkroom palette with one deliberate amber action.', [
    '#201914', '#30251f', '#44362e', '#f8eee4', '#d5c0ad', '#7b6455', '#db9861', '#2b1b0f', '#ffc18d', '#8bd9a3', '#efce75', '#ff9387',
  ]),
  type('precision-blue', 'Precision Blue', 'Professional Studio', 'dark', 'Neutral blue-black surfaces and crisp cyan-blue control states.', [
    '#101d2b', '#1c2d40', '#2c425a', '#f0f6fc', '#c0d1df', '#667f96', '#65b6d9', '#082331', '#a1e4ff', '#78dca7', '#f2d17a', '#ff999b',
  ]),
  type('high-contrast-light', 'High Contrast', 'Professional Studio', 'light', 'Maximum light-mode contrast with hard-edged black borders and clear focus.', [
    '#ffffff', '#ffffff', '#f2f2f2', '#000000', '#1a1a1a', '#000000', '#0000ee', '#ffffff', '#880000', '#005a00', '#643d00', '#b00020',
  ]),
  type('high-contrast-dark', 'High Contrast Dark', 'Accessibility', 'dark', 'High contrast for dark rooms with unmistakable focus and state colors.', [
    '#000000', '#000000', '#111111', '#ffffff', '#f0f0f0', '#ffffff', '#ffff00', '#000000', '#00ffff', '#00ff00', '#ffff00', '#ff6464',
  ]),
];

export const THEME_CATEGORIES: readonly ('All' | ThemeCategory)[] = [
  'All', 'Classic', 'Ocean & Nature', 'Vibrant', 'Soft & Minimal', 'Professional Studio', 'Accessibility', 'Custom',
];

export const DEFAULT_THEME = BUILT_IN_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID)!;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []) {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}

function contrastChannel(channel: number) {
  const linear = channel / 255;
  return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  if (!/^#[\da-f]{6}$/i.test(hex)) return 0;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * contrastChannel(r) + 0.7152 * contrastChannel(g) + 0.0722 * contrastChannel(b);
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export type ThemeValidation<T> = { ok: true; value: T } | { ok: false; error: string };

function validPlainText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum && !/[<>\u0000-\u001f\u007f]/.test(value);
}

function isSixDigitHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

function completeLegacyTokens(value: Record<string, unknown>): ThemeTokens | null {
  if (!exactKeys(value, LEGACY_THEME_TOKEN_KEYS) || !LEGACY_THEME_TOKEN_KEYS.every((key) => isSixDigitHex(value[key]))) return null;
  const c = Object.fromEntries(LEGACY_THEME_TOKEN_KEYS.map((key) => [key, (value[key] as string).toLowerCase()])) as Record<typeof LEGACY_THEME_TOKEN_KEYS[number], string>;
  return {
    background: c.background, surface: c.surface, surfaceRaised: c.surfaceRaised,
    surfaceSunken: c.background, canvasSurround: c.background, toolbar: c.surface, popover: c.surfaceRaised, tooltip: c.surface,
    text: c.text, muted: c.muted, subtleText: c.muted, disabledText: c.muted,
    border: c.border, divider: c.border, accent: c.accent, accentSecondary: c.focus, onAccent: c.onAccent,
    selection: c.accent, selectionText: c.onAccent, focus: c.focus,
    interactiveHover: c.surfaceRaised, interactivePressed: c.background,
    success: c.success, warning: c.warning, danger: c.danger,
  };
}

export function validateThemeTokens(value: unknown): ThemeValidation<ThemeTokens> {
  if (!isRecord(value)) return { ok: false, error: 'Theme colors must be a supported token object.' };
  const tokens: ThemeTokens = {} as ThemeTokens;
  if (exactKeys(value, LEGACY_THEME_TOKEN_KEYS)) {
    const migrated = completeLegacyTokens(value);
    if (!migrated) return { ok: false, error: 'Legacy theme colors must all be six-digit HEX values.' };
    Object.assign(tokens, migrated);
  } else {
    if (!exactKeys(value, THEME_TOKEN_KEYS)) return { ok: false, error: 'Theme colors must contain exactly the supported token set.' };
    for (const key of THEME_TOKEN_KEYS) {
      const color = value[key];
      if (!isSixDigitHex(color)) return { ok: false, error: `${THEME_TOKEN_LABELS[key]} must be a six-digit HEX color.` };
      tokens[key] = color.toLowerCase();
    }
  }

  const surfaces = [
    tokens.background, tokens.surface, tokens.surfaceRaised, tokens.surfaceSunken,
    tokens.canvasSurround, tokens.toolbar, tokens.popover, tokens.tooltip,
  ];
  const textPairs: [string, string, string[]][] = [
    ['Primary text', tokens.text, surfaces],
    ['Secondary text', tokens.muted, surfaces],
  ];
  for (const [label, foreground, backgrounds] of textPairs) {
    if (backgrounds.some((background) => contrastRatio(foreground, background) < 4.5)) {
      return { ok: false, error: `${label} needs at least 4.5:1 contrast on all interface surfaces.` };
    }
  }
  for (const key of ['subtleText', 'disabledText'] as const) {
    if (surfaces.some((surface) => contrastRatio(tokens[key], surface) < 3)) {
      return { ok: false, error: `${THEME_TOKEN_LABELS[key]} needs at least 3:1 contrast on all interface surfaces.` };
    }
  }
  if (contrastRatio(tokens.onAccent, tokens.accent) < 4.5 || contrastRatio(tokens.selectionText, tokens.selection) < 4.5) {
    return { ok: false, error: 'Text on accent and selection fills needs at least 4.5:1 contrast.' };
  }
  if (surfaces.some((surface) => contrastRatio(tokens.accent, surface) < 3 || contrastRatio(tokens.selection, surface) < 3)) {
    return { ok: false, error: 'Accent and selection fills need at least 3:1 contrast on all interface surfaces.' };
  }
  if (surfaces.some((surface) => contrastRatio(tokens.focus, surface) < 3)) {
    return { ok: false, error: 'Keyboard focus needs at least 3:1 contrast on every interface surface.' };
  }
  if (surfaces.some((surface) => contrastRatio(tokens.border, surface) < 1.5 || contrastRatio(tokens.divider, surface) < 1.5)) {
    return { ok: false, error: 'Borders and dividers need at least 1.5:1 contrast on every interface surface.' };
  }
  if (surfaces.some((surface) => contrastRatio(tokens.accentSecondary, surface) < 3)) {
    return { ok: false, error: 'Secondary accent needs at least 3:1 contrast on every interface surface.' };
  }
  for (const key of ['success', 'warning', 'danger'] as const) {
    if (surfaces.some((surface) => contrastRatio(tokens[key], surface) < 3)) {
      return { ok: false, error: `${THEME_TOKEN_LABELS[key]} needs at least 3:1 contrast on every interface surface.` };
    }
  }
  return { ok: true, value: tokens };
}

export function validateThemeSpec(value: unknown): ThemeValidation<ThemeSpec> {
  const required = ['name', 'mode', 'tokens'];
  if (!isRecord(value) || !exactKeys(value, required, ['description'])) return { ok: false, error: 'Theme data has unsupported or missing fields.' };
  const name = value.name;
  if (!validPlainText(name, MAX_THEME_NAME_LENGTH) || !name.trim()) {
    return { ok: false, error: `Theme name must be 1–${MAX_THEME_NAME_LENGTH} plain-text characters.` };
  }
  const description: unknown = value.description === undefined ? '' : value.description;
  if (!validPlainText(description, MAX_THEME_DESCRIPTION_LENGTH)) {
    return { ok: false, error: `Theme description must be plain text under ${MAX_THEME_DESCRIPTION_LENGTH + 1} characters.` };
  }
  if (value.mode !== 'dark' && value.mode !== 'light') return { ok: false, error: 'Theme mode must be dark or light.' };
  const colors = validateThemeTokens(value.tokens);
  if (!colors.ok) return colors;
  return { ok: true, value: { name: name.trim(), description: description.trim(), mode: value.mode, tokens: colors.value } };
}

function safeCustomId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 96 && /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function validateCustomTheme(value: unknown): ThemeValidation<ThemeDefinition> {
  const required = ['id', 'name', 'category', 'mode', 'description', 'tokens'];
  if (!isRecord(value) || !exactKeys(value, required) || !safeCustomId(value.id) || value.category !== 'Custom') {
    return { ok: false, error: 'Saved custom theme metadata is invalid.' };
  }
  const spec = validateThemeSpec({ name: value.name, description: value.description, mode: value.mode, tokens: value.tokens });
  if (!spec.ok) return spec;
  return { ok: true, value: { id: value.id, category: 'Custom', ...spec.value } };
}

export interface ThemePreferencesData {
  activeThemeId: string;
  customThemes: ThemeDefinition[];
}

export function sanitizeThemePreferences(value: unknown): ThemePreferencesData {
  if (!isRecord(value)) return { activeThemeId: DEFAULT_THEME_ID, customThemes: [] };
  const customThemes: ThemeDefinition[] = [];
  const ids = new Set(BUILT_IN_THEMES.map((theme) => theme.id));
  const candidates = Array.isArray(value.customThemes) ? value.customThemes.slice(0, MAX_CUSTOM_THEMES) : [];
  for (const candidate of candidates) {
    const checked = validateCustomTheme(candidate);
    if (!checked.ok || ids.has(checked.value.id)) continue;
    ids.add(checked.value.id);
    customThemes.push(checked.value);
  }
  const activeThemeId = typeof value.activeThemeId === 'string' && ids.has(value.activeThemeId)
    ? value.activeThemeId
    : DEFAULT_THEME_ID;
  return { activeThemeId, customThemes };
}

export function findTheme(id: string, customThemes: readonly ThemeDefinition[] = []): ThemeDefinition {
  return customThemes.find((theme) => theme.id === id) || BUILT_IN_THEMES.find((theme) => theme.id === id) || DEFAULT_THEME;
}

export function themeToSpec(theme: ThemeDefinition): ThemeSpec {
  return { name: theme.name, description: theme.description, mode: theme.mode, tokens: { ...theme.tokens } };
}

function themeSlug(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'theme';
}

export function createCustomTheme(spec: ThemeSpec, existingIds: Iterable<string> = []): ThemeDefinition {
  const ids = new Set(existingIds);
  const prefix = `custom-${themeSlug(spec.name)}`;
  let id = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    const random = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10).toLowerCase()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    id = `${prefix}-${random}`;
    if (!ids.has(id)) break;
  }
  return { id, category: 'Custom', ...spec, tokens: { ...spec.tokens } };
}

export interface ThemeBundle {
  format: typeof THEME_BUNDLE_FORMAT;
  version: typeof THEME_BUNDLE_VERSION;
  themes: ThemeSpec[];
}

export function exportThemeBundle(themes: readonly ThemeDefinition[]): string {
  const bundle: ThemeBundle = { format: THEME_BUNDLE_FORMAT, version: THEME_BUNDLE_VERSION, themes: themes.map(themeToSpec) };
  return JSON.stringify(bundle, null, 2);
}

export function parseThemeBundleText(text: string): ThemeValidation<ThemeSpec[]> {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_THEME_BUNDLE_BYTES) {
    return { ok: false, error: `Theme JSON must be smaller than ${MAX_THEME_BUNDLE_BYTES / 1024} KB.` };
  }
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { ok: false, error: 'The selected file is not valid JSON.' }; }
  if (!isRecord(value) || !exactKeys(value, ['format', 'version', 'themes']) || value.format !== THEME_BUNDLE_FORMAT || (value.version !== 1 && value.version !== THEME_BUNDLE_VERSION)) {
    return { ok: false, error: 'This is not a supported Carbon Theme Studio JSON file.' };
  }
  if (!Array.isArray(value.themes) || value.themes.length < 1 || value.themes.length > MAX_IMPORTED_THEMES) {
    return { ok: false, error: `A theme file must contain between 1 and ${MAX_IMPORTED_THEMES} themes.` };
  }
  const themes: ThemeSpec[] = [];
  for (let index = 0; index < value.themes.length; index++) {
    const checked = validateThemeSpec(value.themes[index]);
    if (!checked.ok) return { ok: false, error: `Theme ${index + 1}: ${checked.error}` };
    themes.push(checked.value);
  }
  return { ok: true, value: themes };
}
