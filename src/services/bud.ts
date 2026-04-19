type BudAction = {
  label: string;
  route?: string;
  note?: string;
};

export type BudContext = {
  currentRoute: string;
  selectedInstance?: {
    id: string;
    name: string;
    mcVersion: string;
    loader: string;
    fabricLoaderVersion?: string;
  } | null;
  activeDownload?: {
    id: string;
    status: string;
    progress: number;
    remediation?: string;
  } | null;
};

export type BudResponse = {
  id: string;
  title: string;
  body: string;
  actions?: BudAction[];
};

type BudTopic = BudResponse & {
  keywords: string[];
  prompts: string[];
};

const PROMPT_PREFIXES = [
  'how do i',
  'how can i',
  'where do i',
  'what do i press to',
  'can you help me',
  'show me how to',
  'how to',
  'i need help with'
];

const PROMPT_SUFFIXES = [
  '',
  ' in bloom',
  ' in bloom client',
  ' on bloom client'
];

function expandPrompts(basePrompts: string[]): string[] {
  const expanded = new Set<string>();
  for (const base of basePrompts) {
    const trimmed = base.trim().toLowerCase();
    expanded.add(trimmed);
    for (const prefix of PROMPT_PREFIXES) {
      for (const suffix of PROMPT_SUFFIXES) {
        expanded.add(`${prefix} ${trimmed}${suffix}`.trim());
      }
    }
  }
  return Array.from(expanded);
}

const TOPICS: BudTopic[] = [
  {
    id: 'install-modpacks',
    title: 'Install modpacks',
    body: 'Open Marketplace, switch to the Modpacks view, choose the pack you want, then click install. If you want the built-in Bloom featured pack, use the featured install card or search the pack name there.',
    keywords: ['modpack', 'marketplace', 'install pack', 'featured pack', 'mrpack'],
    prompts: expandPrompts(['install modpacks', 'install a modpack', 'add a modpack', 'download modpacks']),
    actions: [{ label: 'Open Marketplace', route: '/marketplace' }]
  },
  {
    id: 'install-mods',
    title: 'Install mods',
    body: 'Go to Marketplace to search and install mods directly, or open an instance and drop `.jar` files into its mods folder. For per-instance management, use the instance editor.',
    keywords: ['mods', 'mod', 'jar', 'instance editor'],
    prompts: expandPrompts(['install mods', 'add mods', 'download mods', 'put mods in an instance']),
    actions: [{ label: 'Open Marketplace', route: '/marketplace' }, { label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'install-resourcepacks',
    title: 'Install resource packs',
    body: 'Use Marketplace to search resource packs, or open the instance resourcepacks folder and place the pack there manually. Then launch the instance and enable it inside Minecraft.',
    keywords: ['resource pack', 'resourcepack', 'texture pack'],
    prompts: expandPrompts(['install resource packs', 'add a resource pack', 'download texture packs', 'use a resource pack']),
    actions: [{ label: 'Open Marketplace', route: '/marketplace' }]
  },
  {
    id: 'install-shaders',
    title: 'Install shaders',
    body: 'Search shader packs in Marketplace or place shader zip files into the instance shaderpacks folder. You still need Iris or another compatible shader loader in the instance for them to show up.',
    keywords: ['shader', 'shaderpack', 'iris'],
    prompts: expandPrompts(['install shaders', 'add shaders', 'shader packs', 'use shaders']),
    actions: [{ label: 'Open Marketplace', route: '/marketplace' }]
  },
  {
    id: 'fabric-loader',
    title: 'Change Fabric loader version',
    body: 'Open the instance editor, switch the loader to Fabric if needed, then choose the Fabric loader version and save it. Bloom now persists the actual loader version instead of only changing the dropdown visually.',
    keywords: ['fabric', 'loader version', 'fabric loader', 'save loader'],
    prompts: expandPrompts(['change fabric loader version', 'set fabric version', 'fabric loader not saving', 'save fabric loader']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'fabric-api',
    title: 'Install Fabric API',
    body: 'Open a Fabric instance and use the install Fabric API action from the instance tools or console. If the instance is not Fabric, switch the loader first.',
    keywords: ['fabric api', 'api', 'fabric instance'],
    prompts: expandPrompts(['install fabric api', 'add fabric api', 'get fabric api']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'create-instance',
    title: 'Create a new instance',
    body: 'Open Instances and use the create flow. Pick the Minecraft version, loader type, memory, and name, then save it. After that you can install mods or launch it.',
    keywords: ['instance', 'create', 'new profile'],
    prompts: expandPrompts(['create an instance', 'make a new instance', 'new instance', 'add a profile']),
    actions: [{ label: 'Open Instances', route: '/instances?action=create' }]
  },
  {
    id: 'launch-instance',
    title: 'Launch an instance',
    body: 'Go to Instances and press launch on the profile you want. If Bloom needs to install files first, let the downloader finish, then launch again.',
    keywords: ['launch', 'play', 'start game'],
    prompts: expandPrompts(['launch an instance', 'start minecraft', 'open an instance', 'play a profile']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'downloads-errors',
    title: 'Fix library or asset download errors',
    body: 'If install errors mention libraries or assets failing to download, retry the install first. Bloom now retries downloads automatically, but if it still fails, it is usually a CDN/network issue or a blocked connection. Re-running the install after a minute is the right first move.',
    keywords: ['assets', 'libraries', 'download failed', 'minecraft.net', 'cdn'],
    prompts: expandPrompts(['installation failed assets could not be downloaded', 'libraries could not be downloaded', 'download errors', 'minecraft net failed to download']),
    actions: [{ label: 'Open Help', route: '/help' }, { label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'java-version',
    title: 'Java version problems',
    body: 'If Minecraft exits immediately or a mod says it needs a newer Java version, use a newer Java runtime for that instance. Bloom detects common Java requirement issues and can use managed Java where supported, but older modpacks may still need Java 17 while newer ones may need Java 21.',
    keywords: ['java', 'java 17', 'java 21', 'runtime', 'launch failed'],
    prompts: expandPrompts(['java version issue', 'minecraft needs java 21', 'minecraft needs java 17', 'java runtime error']),
    actions: [{ label: 'Open Help', route: '/help' }]
  },
  {
    id: 'invalid-mods',
    title: 'Invalid mod jar files',
    body: 'If launch fails because of invalid mods, remove zero-byte or broken jars from the instance mods folder and reinstall them. Bloom checks for broken jars before launch, but it cannot repair a corrupted file for you automatically.',
    keywords: ['invalid mod', 'corrupt jar', 'broken mod', 'zip exception'],
    prompts: expandPrompts(['invalid mod files', 'broken mod jar', 'corrupt jar', 'zip exception on launch']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'modpacks-local',
    title: 'Import a local modpack file',
    body: 'Use the Importer or Downloads area to select a local `.mrpack` or supported pack file. Bloom will create a new instance from it.',
    keywords: ['import', 'mrpack', 'local modpack', 'add pack file'],
    prompts: expandPrompts(['import a modpack', 'use a local mrpack', 'open a local modpack file', 'install mrpack file']),
    actions: [{ label: 'Open Importer', route: '/importer' }]
  },
  {
    id: 'marketplace-tab',
    title: 'Use Marketplace',
    body: 'Marketplace is the fastest path for installing mods, modpacks, resource packs, and shaders. Search there first before doing manual file imports.',
    keywords: ['marketplace', 'downloads tab', 'install tab'],
    prompts: expandPrompts(['where is marketplace', 'what tab do i use for downloads', 'find modpacks tab', 'find marketplace']),
    actions: [{ label: 'Open Marketplace', route: '/marketplace' }]
  },
  {
    id: 'instance-editor',
    title: 'Open instance settings',
    body: 'Go to Instances, select the profile you want, and open its editor. That is where you change memory, resolution, loader, installed mods, resource packs, and shaders.',
    keywords: ['instance settings', 'profile settings', 'instance editor'],
    prompts: expandPrompts(['open instance settings', 'edit an instance', 'change profile settings', 'instance editor']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'memory',
    title: 'Change memory allocation',
    body: 'Open the instance editor and raise or lower the memory value for that profile. More is not always better; oversized memory can hurt stability on some packs.',
    keywords: ['memory', 'ram', 'allocate ram', 'xmx'],
    prompts: expandPrompts(['change ram', 'allocate memory', 'set memory for minecraft', 'increase ram']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'open-folders',
    title: 'Open mods, shaderpacks, or resourcepacks folders',
    body: 'Use the folder actions inside the instance editor to open the exact profile folder you need. That is safer than guessing the path manually.',
    keywords: ['open folder', 'mods folder', 'shaderpacks folder', 'resourcepacks folder'],
    prompts: expandPrompts(['open mods folder', 'open shaderpacks folder', 'open resourcepacks folder', 'where are my mod files']),
    actions: [{ label: 'Open Instances', route: '/instances' }]
  },
  {
    id: 'console',
    title: 'Open the Bloom console',
    body: 'Use the configured console shortcut or open it from the launcher shell. The console can help with instance actions, diagnostics, and quick commands.',
    keywords: ['console', 'dev console', 'commands'],
    prompts: expandPrompts(['open console', 'developer console', 'bloom console', 'commands panel']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'custom-cape',
    title: 'Custom cape tools',
    body: 'Use the Custom Cape page for user cape work and the Cosmetics/owner tools for granting or managing cape-related items. Some actions require owner access.',
    keywords: ['cape', 'custom cape', 'cosmetics'],
    prompts: expandPrompts(['custom cape', 'use a custom cape', 'cape tools', 'manage capes']),
    actions: [{ label: 'Open Custom Cape', route: '/custom-cape' }, { label: 'Open Cosmetics', route: '/cosmetics' }]
  },
  {
    id: 'cosmetics',
    title: 'Cosmetics and tags',
    body: 'Open Cosmetics to manage cosmetic-related launcher features. Client-side badge, tag, and cosmetic rendering behavior is handled there or by the associated injected mods.',
    keywords: ['cosmetics', 'tag', 'badge', 'logo'],
    prompts: expandPrompts(['open cosmetics', 'manage cosmetics', 'client tags', 'name tag cosmetics']),
    actions: [{ label: 'Open Cosmetics', route: '/cosmetics' }]
  },
  {
    id: 'updates',
    title: 'Launcher updates',
    body: 'Use Settings > Updates to check, install, or publish launcher updates. Bloom reads the update manifest from Supabase storage using the current update JSON flow.',
    keywords: ['update', 'latest json', 'supabase update', 'launcher version'],
    prompts: expandPrompts(['check for updates', 'publish an update', 'latest json', 'launcher update flow']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'website',
    title: 'Website and downloads page',
    body: 'The standalone website in this repo reads the same latest manifest format and can be deployed separately. If you need release downloads or news on the web side, that lives in the `website` folder, not the launcher pages.',
    keywords: ['website', 'downloads page', 'news page', 'latest manifest'],
    prompts: expandPrompts(['website downloads', 'website news', 'standalone website', 'download page on website']),
    actions: [{ label: 'Open Downloads', route: '/importer' }]
  },
  {
    id: 'widgets',
    title: 'Widgets',
    body: 'Use the Widgets page for launcher widgets and the widget docker setting if you want the dock visible. Empty slots can be hidden in Settings.',
    keywords: ['widgets', 'widget docker', 'dock'],
    prompts: expandPrompts(['open widgets', 'widget docker', 'show widget dock', 'launcher widgets']),
    actions: [{ label: 'Open Widgets', route: '/widgets' }, { label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'host-server',
    title: 'Host Server',
    body: 'Use Host Server for built-in hosted server actions. If the tab is hidden, enable host server access or unlock it first.',
    keywords: ['host server', 'server hosting', 'local server'],
    prompts: expandPrompts(['host a server', 'open host server', 'run a minecraft server', 'server tab']),
    actions: [{ label: 'Open Host Server', route: '/host-server' }, { label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'script-studio',
    title: 'Script Studio',
    body: 'Script Studio is for advanced workflow and scripted launcher actions. If the tab is hidden, enable it from the tab visibility controls in Settings.',
    keywords: ['script studio', 'scripts', 'automation'],
    prompts: expandPrompts(['open script studio', 'use scripts', 'scripting tab', 'advanced scripts']),
    actions: [{ label: 'Open Script Studio', route: '/script-studio' }, { label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'help-page',
    title: 'Help and troubleshooting',
    body: 'Open the Help page for launcher guidance, install troubleshooting, and common issue flow. Use that first before changing random files by hand.',
    keywords: ['help', 'troubleshooting', 'support'],
    prompts: expandPrompts(['open help', 'troubleshooting', 'where is support', 'fix launcher issue']),
    actions: [{ label: 'Open Help', route: '/help' }]
  },
  {
    id: 'search',
    title: 'Search the launcher',
    body: 'Use the global search shortcut to jump between pages faster. It is the quickest way to open settings, instances, marketplace, or other top-level routes.',
    keywords: ['search', 'global search', 'shortcut'],
    prompts: expandPrompts(['use search', 'global search', 'find pages quickly', 'search shortcut']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'background-theme',
    title: 'Theme and background customization',
    body: 'Use Settings > Appearance to change theme, accent, background mode, glass amount, roundness, and other shell styling controls.',
    keywords: ['theme', 'accent', 'background', 'appearance'],
    prompts: expandPrompts(['change theme', 'change accent color', 'background mode', 'appearance settings']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'sidebar-tabs',
    title: 'Show or hide sidebar tabs',
    body: 'Use Settings to control sidebar tab visibility. Hidden routes like Chat, Script Studio, Host Server, or Games can be turned back on there.',
    keywords: ['sidebar', 'tabs', 'hide tabs', 'show tabs'],
    prompts: expandPrompts(['show sidebar tabs', 'hide sidebar tabs', 'where did my tab go', 'enable marketplace tab']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'route-animations',
    title: 'Tab and route animations',
    body: 'Use Settings if you want tab change animations enabled or disabled. They are off by default for smoother navigation in some setups.',
    keywords: ['animations', 'tab animations', 'route animations'],
    prompts: expandPrompts(['turn on tab animations', 'disable route animations', 'page animation settings', 'animate tab changes']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'owner-utility',
    title: 'Owner utility tools',
    body: 'Owner-only utilities for member economy, cape grants, partner forms, and update publishing live in Settings under Owner Utility. Those controls are hidden unless the current account has owner access.',
    keywords: ['owner utility', 'owner tools', 'grant capes', 'member economy'],
    prompts: expandPrompts(['open owner utility', 'owner tools', 'grant capes', 'partner application editor']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'notifications',
    title: 'Notifications and update checks',
    body: 'Launcher update checks and update notifications are controlled from Settings > Updates. You can turn them on or off there.',
    keywords: ['notifications', 'update notifications', 'auto check'],
    prompts: expandPrompts(['turn off notifications', 'automatic update checks', 'update notification setting', 'notification settings']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'games',
    title: 'Games section',
    body: 'The Games tab is optional. If it is missing, enable Show Games Section in Settings.',
    keywords: ['games', 'games section', 'show games'],
    prompts: expandPrompts(['where is games', 'enable games tab', 'show games section', 'games page missing']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'chat-tab',
    title: 'Chat tab',
    body: 'If the Chat tab is missing, re-enable it through the sidebar tab visibility settings. Some routes are intentionally hidden until you turn them on.',
    keywords: ['chat', 'chat tab', 'missing tab'],
    prompts: expandPrompts(['where is chat', 'chat tab missing', 'enable chat page', 'show chat tab']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'account-login',
    title: 'Account sign-in',
    body: 'Use the account controls in the launcher shell to sign in. Some features like cosmetics, ownership, or account-specific flows depend on being authenticated first.',
    keywords: ['login', 'sign in', 'account'],
    prompts: expandPrompts(['sign in', 'log in', 'account login', 'authenticate account']),
    actions: [{ label: 'Open Home', route: '/' }]
  },
  {
    id: 'performance',
    title: 'Improve performance',
    body: 'For client performance, use a lighter instance, avoid broken or bloated mod stacks, keep Java appropriate for the pack, and allocate sensible memory instead of maxing it out blindly.',
    keywords: ['performance', 'lag', 'fps', 'slow'],
    prompts: expandPrompts(['improve performance', 'reduce lag', 'make bloom faster', 'increase fps']),
    actions: [{ label: 'Open Instances', route: '/instances' }, { label: 'Open Help', route: '/help' }]
  },
  {
    id: 'launcher-background-video',
    title: 'Custom launcher background',
    body: 'Background image and video controls live in Settings > Appearance. Use those controls instead of replacing launcher assets manually.',
    keywords: ['background video', 'custom background', 'launcher wallpaper'],
    prompts: expandPrompts(['set custom background', 'background video', 'launcher wallpaper', 'change launcher background']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  },
  {
    id: 'bloom-bud',
    title: 'About BUD',
    body: 'BUD is the built-in Bloom assistant. It answers common launcher questions locally and can jump you to the right page when there is a clear next step.',
    keywords: ['bud', 'assistant', 'help bot'],
    prompts: expandPrompts(['what is bud', 'how does bud work', 'assistant bot', 'bloom assistant']),
    actions: [{ label: 'Open Settings', route: '/settings' }]
  }
];

const KNOWLEDGE_BASE = TOPICS.flatMap((topic) =>
  topic.prompts.map((prompt) => ({
    prompt,
    topic
  }))
);

export const BUD_KNOWLEDGE_VARIATION_COUNT = KNOWLEDGE_BASE.length;

function scorePrompt(query: string, prompt: string, keywords: string[]): number {
  let score = 0;
  if (query === prompt) score += 1000;
  if (prompt.includes(query)) score += 140;
  if (query.includes(prompt)) score += 120;

  const queryTokens = query.split(/[^a-z0-9]+/g).filter(Boolean);
  for (const token of queryTokens) {
    if (prompt.includes(token)) score += 8;
  }
  for (const keyword of keywords) {
    const lowered = keyword.toLowerCase();
    if (query.includes(lowered)) score += 36;
    if (prompt.includes(lowered)) score += 10;
  }
  return score;
}

function buildContextLead(context?: BudContext): string | null {
  if (!context) return null;

  if (context.activeDownload?.status) {
    const lowered = context.activeDownload.status.toLowerCase();
    if (lowered.includes('error:')) {
      return `I can see an active install/launch error on ${context.selectedInstance?.name ?? 'the current instance'}: ${context.activeDownload.status}.`;
    }
    if (lowered.includes('downloading') || lowered.includes('installing') || lowered.includes('launching')) {
      return `${context.selectedInstance?.name ?? 'The current instance'} is currently busy: ${context.activeDownload.status}.`;
    }
  }

  if (context.selectedInstance) {
    return `Current instance: ${context.selectedInstance.name} (${context.selectedInstance.loader} ${context.selectedInstance.mcVersion}).`;
  }

  return null;
}

function buildRouteAction(context?: BudContext): BudAction[] | undefined {
  if (!context) return undefined;

  if (context.currentRoute === '/instance-editor' && context.selectedInstance) {
    return [{ label: `Open ${context.selectedInstance.name}`, route: `/instance-editor?id=${encodeURIComponent(context.selectedInstance.id)}` }];
  }
  if (context.currentRoute === '/settings') {
    return [{ label: 'Stay in Settings', route: '/settings' }];
  }
  return undefined;
}

export function getBudResponse(input: string, context?: BudContext): BudResponse {
  const query = input.trim().toLowerCase();
  if (!query) {
    return {
      id: 'empty',
      title: 'Ask BUD anything',
      body: `Try a launcher question like "how do I install modpacks" or "why is Fabric failing to download assets". I currently match against ${BUD_KNOWLEDGE_VARIATION_COUNT} local question variations.`,
      actions: buildRouteAction(context) ?? [{ label: 'Open Marketplace', route: '/marketplace' }, { label: 'Open Help', route: '/help' }]
    };
  }

  let best = KNOWLEDGE_BASE[0];
  let bestScore = -1;
  for (const entry of KNOWLEDGE_BASE) {
    const score = scorePrompt(query, entry.prompt, entry.topic.keywords);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  if (bestScore < 18) {
    const lead = buildContextLead(context);
    return {
      id: 'fallback',
      title: 'No exact BUD answer yet',
      body: `${lead ? `${lead} ` : ''}I do not have a confident local answer for that yet. Try asking in simpler terms, or open Help/Settings/Marketplace depending on whether this is a troubleshooting, configuration, or install question.`,
      actions: [
        { label: 'Open Help', route: '/help' },
        { label: 'Open Settings', route: '/settings' },
        { label: 'Open Marketplace', route: '/marketplace' }
      ]
    };
  }

  const lead = buildContextLead(context);
  const routeActions = buildRouteAction(context);

  return {
    ...best.topic,
    body: lead ? `${lead} ${best.topic.body}` : best.topic.body,
    actions: routeActions ? [...routeActions, ...(best.topic.actions ?? [])] : best.topic.actions
  };
}
