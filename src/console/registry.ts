import type { Instance } from '../services/tauri';
import type { ConsoleCommandContext, ConsoleCommandDefinition } from './types';
import { HOST_SERVERS_SECRET_PHRASE } from '../constants/hostServerAccess';
import { isCurrentUserOwner, setOwnWalletBalance, setUserRole, setUserWalletBalance } from '../services/cosmetics';

export const CONSOLE_THEMES = [
  { id: 'dark', label: 'Dark' },
  { id: 'gray', label: 'Gray' },
  { id: 'true-dark', label: 'True Dark' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'paper', label: 'Paper' },
  { id: 'crt', label: 'CRT' },
  { id: 'synthwave', label: 'Synthwave' },
  { id: 'sandstone', label: 'Sandstone' },
  { id: 'minecraft', label: 'Minecraft' },
  { id: 'cartoon', label: 'Cartoon' },
  { id: 'strength-smp', label: 'Strength SMP' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'holo-grid', label: 'Holo Grid' },
  { id: 'lavaforge', label: 'Lavaforge' },
  { id: 'candy-pop', label: 'Candy Pop' },
  { id: 'mono-ink', label: 'Mono Ink' }
] as const;

export const CONSOLE_MODULES = [
  { id: 'widget-docker', description: 'Widget docking controls across widget pages.' },
  { id: 'games-section', description: 'Games tab visibility in Bloom navigation.' },
  { id: 'route-animations', description: 'Animated transitions for route/tab changes.' },
  { id: 'startup-scene', description: 'Bloom startup scene playback on app open.' }
] as const;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function quoteIfNeeded(value: string) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function parseBooleanWord(value: string): boolean | null {
  const normalized = normalize(value);
  if (normalized === 'on' || normalized === 'true' || normalized === '1') return true;
  if (normalized === 'off' || normalized === 'false' || normalized === '0') return false;
  return null;
}

function byNameOrId(instances: Instance[], query: string): Instance | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  const exact = instances.filter((instance) => {
    const nameMatch = normalize(instance.name) === normalizedQuery;
    const idMatch = normalize(instance.id) === normalizedQuery;
    return nameMatch || idMatch;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(`Multiple instances matched "${query}". Use the instance id.`);
  }

  const partial = instances.filter((instance) => normalize(instance.name).includes(normalizedQuery));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`"${query}" matched multiple instances. Be more specific.`);
  }
  return null;
}

function instanceNames(context: ConsoleCommandContext) {
  return context.instances
    .map((instance) => instance.name)
    .sort((a, b) => a.localeCompare(b));
}

function moduleNames(context: ConsoleCommandContext) {
  return context.modules.map((module) => module.id);
}

async function resolveInstanceFromContext(context: ConsoleCommandContext, query: string) {
  const instances = await context.listInstances();
  return byNameOrId(instances, query);
}

function formatInstance(instance: Instance) {
  return `${instance.name} (${instance.loader} ${instance.mcVersion}) [${instance.id}]`;
}

async function requireOwnerAccess() {
  const owner = await isCurrentUserOwner();
  if (!owner) {
    throw new Error('Owner only command.');
  }
}

function helpForCommand(commands: ConsoleCommandDefinition[], requested: string, includeInternal: boolean) {
  const target = normalize(requested);
  const command = commands.find((item) => {
    if (!includeInternal && item.visibility === 'internal') return false;
    const aliases = [item.name, ...(item.aliases ?? [])];
    return aliases.some((alias) => normalize(alias) === target);
  });
  if (!command) return null;
  const lines: string[] = [
    `${command.name} - ${command.description}`,
    `Usage: ${command.usage}`
  ];
  if (command.aliases && command.aliases.length > 0) {
    lines.push(`Aliases: ${command.aliases.join(', ')}`);
  }
  return lines;
}

export function createConsoleRegistry(): ConsoleCommandDefinition[] {
  const commands: ConsoleCommandDefinition[] = [];

  const register = (definition: ConsoleCommandDefinition) => {
    commands.push(definition);
  };

  register({
    name: 'help',
    aliases: ['?'],
    category: 'General',
    description: 'List commands or show usage for one command.',
    usage: 'help [command|category|--dev]',
    args: [{ name: 'query', required: false }],
    autocomplete: () => {
      const categories = Array.from(new Set(commands.map((item) => item.category)));
      const names = commands.flatMap((item) => [item.name, ...(item.aliases ?? [])]);
      return [...categories, ...names, '--dev'];
    },
    handler: (args, context) => {
      const query = args[0];
      const includeInternal = context.showInternalCommands || normalize(query ?? '') === '--dev';
      const visible = commands.filter((item) => includeInternal || item.visibility !== 'internal');

      if (!query || normalize(query) === '--dev') {
        const byCategory = new Map<string, ConsoleCommandDefinition[]>();
        for (const command of visible) {
          const list = byCategory.get(command.category) ?? [];
          list.push(command);
          byCategory.set(command.category, list);
        }
        const lines: string[] = ['Bloom Console command index:'];
        for (const [category, items] of byCategory.entries()) {
          lines.push(`${category}:`);
          for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`  ${item.name} - ${item.description}`);
          }
        }
        if (!context.showInternalCommands) {
          lines.push('Tip: enable "Show dev commands in help" in Settings to include internal commands.');
        }
        return { kind: 'info', lines };
      }

      const maybeCommandHelp = helpForCommand(visible, query, includeInternal);
      if (maybeCommandHelp) {
        return { kind: 'info', lines: maybeCommandHelp };
      }

      const normalizedQuery = normalize(query);
      const categoryLines = visible
        .filter((item) => normalize(item.category) === normalizedQuery)
        .map((item) => `${item.name} - ${item.description}`);

      if (categoryLines.length > 0) {
        return { kind: 'info', lines: [`${query} commands:`, ...categoryLines] };
      }

      return { kind: 'warn', lines: [`No help target found for "${query}".`] };
    }
  });

  register({
    name: 'clear',
    category: 'General',
    description: 'Clear the current console output buffer.',
    usage: 'clear',
    handler: () => ({ clearOutput: true })
  });

  register({
    name: 'version',
    category: 'General',
    description: 'Show the current Bloom launcher version.',
    usage: 'version',
    handler: (_args, context) => ({ kind: 'info', lines: [`Bloom Client v${context.appVersion}`] })
  });

  register({
    name: 'about',
    category: 'General',
    description: 'Show short Bloom client information.',
    usage: 'about',
    handler: (_args, context) => ({
      kind: 'info',
      lines: [
        `Bloom Client v${context.appVersion}`,
        'Desktop Minecraft launcher powered by Tauri + React.',
        'Use `help` to explore command categories.'
      ]
    })
  });

  register({
    name: 'about bloom',
    aliases: ['about-bloom'],
    category: 'Bloom',
    description: 'Show Bloom identity details.',
    usage: 'about bloom',
    handler: (_args, context) => ({
      kind: 'info',
      lines: [
        `Bloom v${context.appVersion}`,
        'Instance management, launcher settings, and Bloom console workflows.'
      ]
    })
  });

  register({
    name: 'echo',
    category: 'General',
    description: 'Print arbitrary text.',
    usage: 'echo <text>',
    args: [{ name: 'text', variadic: true }],
    validate: (args) => (args.length === 0 ? 'Provide text to echo.' : null),
    handler: (args) => ({ kind: 'info', lines: [args.join(' ')] })
  });

  register({
    name: 'setbal',
    aliases: ['/setbal'],
    category: 'Commerce',
    description: 'Set your own Bloom Bucks balance.',
    usage: 'setbal <balance>',
    args: [{ name: 'balance' }],
    validate: (args) => {
      const value = Number(args[0]);
      if (!Number.isFinite(value)) return 'Balance must be a number.';
      if (value < 0) return 'Balance must be 0 or higher.';
      return null;
    },
    handler: async (args) => {
      await requireOwnerAccess();
      const target = Math.floor(Number(args[0]));
      const wallet = await setOwnWalletBalance(target);
      const current = wallet?.balance_bb ?? target;
      return {
        kind: 'success',
        lines: [`Your balance is now ${current.toLocaleString()} BB.`]
      };
    }
  });

  register({
    name: 'setuserbal',
    aliases: ['/setuserbal'],
    category: 'Commerce',
    description: 'Set another user balance by username.',
    usage: 'setuserbal <username> <balance>',
    args: [{ name: 'username' }, { name: 'balance' }],
    validate: (args) => {
      const username = args[0]?.trim();
      if (!username) return 'Username is required.';
      const value = Number(args[1]);
      if (!Number.isFinite(value)) return 'Balance must be a number.';
      if (value < 0) return 'Balance must be 0 or higher.';
      return null;
    },
    handler: async (args) => {
      await requireOwnerAccess();
      const username = args[0].trim();
      const target = Math.floor(Number(args[1]));
      const wallet = await setUserWalletBalance(username, target);
      const current = wallet?.balance_bb ?? target;
      return {
        kind: 'success',
        lines: [`${username} balance is now ${current.toLocaleString()} BB.`]
      };
    }
  });

  register({
    name: 'setrole',
    aliases: ['/setrole'],
    category: 'Commerce',
    description: 'Set a user role by username.',
    usage: 'setrole <username> <role>',
    args: [{ name: 'username' }, { name: 'role', choices: ['user', 'owner'] }],
    validate: (args) => {
      const username = args[0]?.trim();
      if (!username) return 'Username is required.';
      const role = args[1]?.trim().toLowerCase();
      if (role !== 'user' && role !== 'owner') return 'Role must be user or owner.';
      return null;
    },
    handler: async (args) => {
      await requireOwnerAccess();
      const username = args[0].trim();
      const role = (args[1].trim().toLowerCase() === 'owner' ? 'owner' : 'user') as 'user' | 'owner';
      const profile = await setUserRole(username, role);
      return {
        kind: 'success',
        lines: [`${profile.username ?? username} role is now ${profile.role}.`]
      };
    }
  });

  register({
    name: 'theme list',
    category: 'Appearance',
    description: 'List available Bloom themes.',
    usage: 'theme list',
    handler: (_args, context) => ({
      kind: 'info',
      lines: ['Available themes:', ...context.themes.map((theme) => `  ${theme.id} (${theme.label})`)]
    })
  });

  register({
    name: 'theme set',
    category: 'Appearance',
    description: 'Switch active theme.',
    usage: 'theme set <themeName>',
    args: [{ name: 'themeName' }],
    autocomplete: (_args, context) => context.themes.map((theme) => theme.id),
    handler: (args, context) => {
      const requested = normalize(args[0]);
      const match = context.themes.find((theme) => normalize(theme.id) === requested);
      if (!match) {
        return {
          kind: 'error',
          lines: [`Unknown theme "${args[0]}". Run \`theme list\` for valid values.`]
        };
      }
      context.setTheme(match.id);
      return { kind: 'success', lines: [`Theme set to ${match.label}.`] };
    }
  });

  register({
    name: 'appearance show',
    category: 'Appearance',
    description: 'Show current appearance state snapshot.',
    usage: 'appearance show',
    handler: (_args, context) => {
      const snapshot = context.getAppearanceSnapshot();
      const lines = Object.entries(snapshot).map(([key, value]) => `${key}: ${value}`);
      return { kind: 'info', lines };
    }
  });

  register({
    name: 'ui scale',
    category: 'Appearance',
    description: 'Set UI scale (mapped to Bloom density mode).',
    usage: 'ui scale <value>',
    args: [{ name: 'value' }],
    handler: (args, context) => {
      const numeric = Number(args[0]);
      if (!Number.isFinite(numeric)) {
        return { kind: 'error', lines: ['Scale must be a number, for example: ui scale 1.05'] };
      }
      const clamped = Math.max(0.8, Math.min(1.2, Number(numeric.toFixed(2))));
      const result = context.setUiScale(clamped);
      return {
        kind: 'success',
        lines: [`UI scale set to ${clamped.toFixed(2)} (density mapped to ${result.mappedDensity}).`]
      };
    }
  });

  register({
    name: 'motion reduce',
    category: 'Appearance',
    description: 'Toggle reduced motion behavior.',
    usage: 'motion reduce <on|off>',
    args: [{ name: 'state', choices: ['on', 'off'] }],
    handler: (args, context) => {
      const parsed = parseBooleanWord(args[0]);
      if (parsed === null) {
        return { kind: 'error', lines: ['Use `on` or `off`.'] };
      }
      context.setReducedMotion(parsed);
      return { kind: 'success', lines: [parsed ? 'Reduced motion enabled.' : 'Reduced motion disabled.'] };
    }
  });

  register({
    name: 'module list',
    category: 'Modules',
    description: 'Show Bloom modules and their enabled states.',
    usage: 'module list',
    handler: (_args, context) => {
      const lines = context.modules.map((module) => {
        const enabled = context.getModuleEnabled(module.id);
        return `${module.id}: ${enabled ? 'enabled' : 'disabled'} - ${module.description}`;
      });
      return { kind: 'info', lines };
    }
  });

  register({
    name: 'module enable',
    category: 'Modules',
    description: 'Enable a Bloom module.',
    usage: 'module enable <name>',
    args: [{ name: 'name' }],
    autocomplete: (_args, context) => moduleNames(context),
    handler: (args, context) => {
      const target = normalize(args[0]);
      const module = context.modules.find((item) => normalize(item.id) === target);
      if (!module) return { kind: 'error', lines: [`Unknown module "${args[0]}".`] };
      context.setModuleEnabled(module.id, true);
      return { kind: 'success', lines: [`Module enabled: ${module.id}`] };
    }
  });

  register({
    name: 'module disable',
    category: 'Modules',
    description: 'Disable a Bloom module.',
    usage: 'module disable <name>',
    args: [{ name: 'name' }],
    autocomplete: (_args, context) => moduleNames(context),
    handler: (args, context) => {
      const target = normalize(args[0]);
      const module = context.modules.find((item) => normalize(item.id) === target);
      if (!module) return { kind: 'error', lines: [`Unknown module "${args[0]}".`] };
      context.setModuleEnabled(module.id, false);
      return { kind: 'success', lines: [`Module disabled: ${module.id}`] };
    }
  });

  register({
    name: 'module toggle',
    category: 'Modules',
    description: 'Toggle a Bloom module.',
    usage: 'module toggle <name>',
    args: [{ name: 'name' }],
    autocomplete: (_args, context) => moduleNames(context),
    handler: (args, context) => {
      const target = normalize(args[0]);
      const module = context.modules.find((item) => normalize(item.id) === target);
      if (!module) return { kind: 'error', lines: [`Unknown module "${args[0]}".`] };
      const next = !context.getModuleEnabled(module.id);
      context.setModuleEnabled(module.id, next);
      return { kind: 'success', lines: [`Module ${module.id} is now ${next ? 'enabled' : 'disabled'}.`] };
    }
  });

  register({
    name: 'instance list',
    aliases: ['ls', 'lsinc', 'insts'],
    category: 'Instances',
    description: 'List current instances.',
    usage: 'instance list',
    handler: async (_args, context) => {
      const instances = await context.listInstances();
      if (instances.length === 0) {
        return { kind: 'warn', lines: ['No instances found.'] };
      }
      return {
        kind: 'info',
        lines: [`Found ${instances.length} instance(s):`, ...instances.map((instance) => `  ${formatInstance(instance)}`)]
      };
    }
  });

  register({
    name: 'instance mkdir',
    aliases: ['instance mk', 'mkinc'],
    category: 'Instances',
    description: 'Alias for instance creation.',
    usage: 'instance mkdir <name>',
    args: [{ name: 'name', variadic: true }],
    validate: (args) => (args.length === 0 ? 'Instance name is required.' : null),
    handler: async (args, context) => {
      const created = await context.createInstance(args.join(' '));
      return { kind: 'success', lines: [`Created instance ${formatInstance(created)}.`] };
    }
  });

  register({
    name: 'instance create',
    aliases: ['instance new', 'newinc'],
    category: 'Instances',
    description: 'Create a new instance with Bloom defaults.',
    usage: 'instance create <name>',
    args: [{ name: 'name', variadic: true }],
    validate: (args) => (args.length === 0 ? 'Instance name is required.' : null),
    handler: async (args, context) => {
      const created = await context.createInstance(args.join(' '));
      return { kind: 'success', lines: [`Created instance ${formatInstance(created)}.`] };
    }
  });

  register({
    name: 'instance remove',
    aliases: ['instance rm', 'instance delete', 'rminc', 'delinc'],
    category: 'Instances',
    description: 'Delete an instance by name or id.',
    usage: 'instance remove <name>',
    args: [{ name: 'name', variadic: true }],
    autocomplete: (_args, context) => instanceNames(context),
    validate: (args) => (args.length === 0 ? 'Provide the target instance name.' : null),
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args.join(' '));
      if (!target) return { kind: 'error', lines: [`Instance "${args.join(' ')}" not found.`] };
      await context.removeInstance(target.id);
      return { kind: 'success', lines: [`Removed instance ${target.name}.`] };
    }
  });

  register({
    name: 'instance rename',
    aliases: ['reninc'],
    category: 'Instances',
    description: 'Rename an existing instance.',
    usage: 'instance rename <old> <new>',
    args: [{ name: 'old' }, { name: 'new', variadic: true }],
    autocomplete: (args, context) => (args.length <= 1 ? instanceNames(context) : []),
    handler: async (args, context) => {
      const oldName = args[0];
      const nextName = args.slice(1).join(' ');
      if (!nextName.trim()) return { kind: 'error', lines: ['New instance name is required.'] };
      const target = await resolveInstanceFromContext(context, oldName);
      if (!target) return { kind: 'error', lines: [`Instance "${oldName}" not found.`] };
      const updated = await context.renameInstance(target.id, nextName);
      return { kind: 'success', lines: [`Renamed instance to ${updated.name}.`] };
    }
  });

  register({
    name: 'instance launch',
    aliases: ['runinc', 'playinc'],
    category: 'Instances',
    description: 'Launch an instance.',
    usage: 'instance launch <name>',
    args: [{ name: 'name', variadic: true }],
    autocomplete: (_args, context) => instanceNames(context),
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args.join(' '));
      if (!target) return { kind: 'error', lines: [`Instance "${args.join(' ')}" not found.`] };
      await context.launchInstance(target.id);
      return { kind: 'success', lines: [`Launching ${target.name}...`] };
    }
  });

  register({
    name: 'instance open',
    aliases: ['opinc'],
    category: 'Instances',
    description: 'Open instance editor for an instance.',
    usage: 'instance open <name>',
    args: [{ name: 'name', variadic: true }],
    autocomplete: (_args, context) => instanceNames(context),
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args.join(' '));
      if (!target) return { kind: 'error', lines: [`Instance "${args.join(' ')}" not found.`] };
      context.openInstance(target.id);
      return { kind: 'info', lines: [`Opened ${target.name} in instance editor.`] };
    }
  });

  register({
    name: 'instance clone',
    aliases: ['cpinc'],
    category: 'Instances',
    description: 'Clone an instance to a new instance name.',
    usage: 'instance clone <source> <target>',
    args: [{ name: 'source' }, { name: 'target', variadic: true }],
    autocomplete: (args, context) => (args.length <= 1 ? instanceNames(context) : []),
    handler: async (args, context) => {
      const source = args[0];
      const targetName = args.slice(1).join(' ');
      if (!targetName.trim()) return { kind: 'error', lines: ['Target instance name is required.'] };
      const sourceInstance = await resolveInstanceFromContext(context, source);
      if (!sourceInstance) return { kind: 'error', lines: [`Instance "${source}" not found.`] };
      const cloned = await context.cloneInstance(sourceInstance.id, targetName);
      return { kind: 'success', lines: [`Cloned ${sourceInstance.name} to ${cloned.name}.`] };
    }
  });

  register({
    name: 'instance config',
    aliases: ['cfginc'],
    category: 'Instances',
    description: 'Open instance settings page for an instance.',
    usage: 'instance config <name>',
    args: [{ name: 'name', variadic: true }],
    autocomplete: (_args, context) => instanceNames(context),
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args.join(' '));
      if (!target) return { kind: 'error', lines: [`Instance "${args.join(' ')}" not found.`] };
      context.openInstanceConfig(target.id);
      return { kind: 'info', lines: [`Opened config for ${target.name}.`] };
    }
  });

  register({
    name: 'instance set-version',
    aliases: ['incver'],
    category: 'Instances',
    description: 'Set instance Minecraft version.',
    usage: 'instance set-version <name> <version>',
    args: [{ name: 'name' }, { name: 'version' }],
    autocomplete: (args, context) => (args.length <= 1 ? instanceNames(context) : []),
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args[0]);
      if (!target) return { kind: 'error', lines: [`Instance "${args[0]}" not found.`] };
      const updated = await context.updateInstanceVersion(target.id, args[1]);
      return { kind: 'success', lines: [`${updated.name} now targets Minecraft ${updated.mcVersion}.`] };
    }
  });

  register({
    name: 'instance set-loader',
    aliases: ['incldr'],
    category: 'Instances',
    description: 'Set instance loader to vanilla or fabric.',
    usage: 'instance set-loader <name> <loader>',
    args: [{ name: 'name' }, { name: 'loader', choices: ['vanilla', 'fabric'] }],
    autocomplete: (args, context) => {
      if (args.length <= 1) return instanceNames(context);
      if (args.length === 2) return ['vanilla', 'fabric'];
      return [];
    },
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args[0]);
      if (!target) return { kind: 'error', lines: [`Instance "${args[0]}" not found.`] };
      const loader = normalize(args[1]) as 'vanilla' | 'fabric';
      const updated = await context.updateInstanceLoader(target.id, loader);
      return { kind: 'success', lines: [`${updated.name} loader updated to ${updated.loader}.`] };
    }
  });

  register({
    name: 'instance path',
    aliases: ['incpath'],
    category: 'Instances',
    description: 'Show absolute path for an instance directory.',
    usage: 'instance path <name>',
    args: [{ name: 'name', variadic: true }],
    autocomplete: (_args, context) => instanceNames(context),
    handler: async (args, context) => {
      const target = await resolveInstanceFromContext(context, args.join(' '));
      if (!target) return { kind: 'error', lines: [`Instance "${args.join(' ')}" not found.`] };
      const path = await context.getInstancePath(target.id);
      return { kind: 'info', lines: [path] };
    }
  });

  register({
    name: 'mod search',
    category: 'Mods',
    description: 'Search mod marketplace entries by query.',
    usage: 'mod search <query>',
    args: [{ name: 'query', variadic: true }],
    validate: (args) => (args.length === 0 ? 'Provide a search query.' : null),
    handler: async (args, context) => {
      const query = args.join(' ').trim();
      const results = await context.searchMarketplaceMods(query, 'all');
      if (results.length === 0) {
        return { kind: 'warn', lines: [`No mods found for "${query}".`] };
      }
      const lines = [`Top results for "${query}":`];
      for (const [index, item] of results.slice(0, 8).entries()) {
        lines.push(`  ${index + 1}. ${item.title} [${item.source}] (${item.id})`);
      }
      return { kind: 'info', lines };
    }
  });

  register({
    name: 'mod install',
    aliases: ['mod add'],
    category: 'Mods',
    description: 'Search and install a mod to an instance by mod name query.',
    usage: 'mod install <instance> <modName>',
    args: [{ name: 'instance' }, { name: 'modName', variadic: true }],
    autocomplete: (args, context) => (args.length <= 1 ? instanceNames(context) : []),
    validate: (args) => {
      if (args.length === 0) return 'Provide target instance name.';
      if (args.length === 1) return 'Provide a mod name to install.';
      return null;
    },
    handler: async (args, context) => {
      const instanceQuery = args[0];
      const modQuery = args.slice(1).join(' ').trim();
      const target = await resolveInstanceFromContext(context, instanceQuery);
      if (!target) return { kind: 'error', lines: [`Instance "${instanceQuery}" not found.`] };

      const results = await context.searchMarketplaceMods(modQuery, 'all', target.loader, target.mcVersion);
      if (results.length === 0) {
        return {
          kind: 'error',
          lines: [`No mods found for "${modQuery}" compatible with ${target.loader} ${target.mcVersion}.`]
        };
      }

      const exact = results.find((item) => normalize(item.title) === normalize(modQuery));
      const candidate = exact ?? results[0];
      const installResult = await context.installMarketplaceMod(target.id, candidate.source, candidate.id);
      const lines = [
        installResult.dependenciesInstalled > 0
          ? `Installed ${candidate.title} (${candidate.source}) + ${installResult.dependenciesInstalled} dependencies into ${target.name}.`
          : `Installed ${candidate.title} (${candidate.source}) into ${target.name}.`,
        installResult.fileName
      ];
      if (!exact && results.length > 1) {
        lines.push(`Tip: multiple matches found; installed top result "${candidate.title}".`);
      }
      return { kind: 'success', lines };
    }
  });

  register({
    name: 'mod install-fabric-api',
    aliases: ['mod fabric-api'],
    category: 'Mods',
    description: 'Install Fabric API into a Fabric instance.',
    usage: 'mod install-fabric-api <instance>',
    args: [{ name: 'instance', variadic: true }],
    autocomplete: (_args, context) => instanceNames(context),
    validate: (args) => (args.length === 0 ? 'Provide target instance name.' : null),
    handler: async (args, context) => {
      const instanceQuery = args.join(' ');
      const target = await resolveInstanceFromContext(context, instanceQuery);
      if (!target) return { kind: 'error', lines: [`Instance "${instanceQuery}" not found.`] };
      if (target.loader !== 'fabric') {
        return { kind: 'error', lines: [`${target.name} is not set to Fabric. Run \`instance set-loader "${target.name}" fabric\`.`] };
      }
      const result = await context.installFabricApi(target.id);
      return { kind: 'success', lines: [result || `Installed Fabric API into ${target.name}.`] };
    }
  });

  register({
    name: 'dev.reload',
    category: 'Developer',
    description: 'Reload the Bloom UI.',
    usage: 'dev.reload',
    visibility: 'internal',
    handler: (_args, context) => {
      context.reloadApp();
      return { kind: 'info', lines: ['Reloading Bloom...'] };
    }
  });

  register({
    name: 'dev.dump-config',
    category: 'Developer',
    description: 'Dump bloom_* local config values.',
    usage: 'dev.dump-config',
    visibility: 'internal',
    handler: (_args, context) => {
      const config = context.dumpConfig();
      const lines = Object.entries(config).map(([key, value]) => `${key}=${value}`);
      return { kind: 'info', lines: lines.length > 0 ? lines : ['No bloom_* config keys found.'] };
    }
  });

  register({
    name: 'dev.reset-layout',
    category: 'Developer',
    description: 'Reset Bloom widget/layout placement keys.',
    usage: 'dev.reset-layout',
    visibility: 'internal',
    handler: (_args, context) => {
      context.resetLayout();
      return { kind: 'success', lines: ['Layout keys reset to defaults.'] };
    }
  });

  register({
    name: 'dev.mock-notification',
    category: 'Developer',
    description: 'Show a mock notification inside Bloom.',
    usage: 'dev.mock-notification',
    visibility: 'internal',
    handler: (_args, context) => {
      context.mockNotification();
      return { kind: 'success', lines: ['Mock notification triggered.'] };
    }
  });

  register({
    name: 'dev.log-level',
    category: 'Developer',
    description: 'Set console logging verbosity.',
    usage: 'dev.log-level <error|warn|info|debug>',
    visibility: 'internal',
    args: [{ name: 'level', choices: ['error', 'warn', 'info', 'debug'] }],
    autocomplete: () => ['error', 'warn', 'info', 'debug'],
    handler: (args, context) => {
      const next = normalize(args[0]) as typeof context.logLevel;
      context.setLogLevel(next);
      return { kind: 'success', lines: [`Console log level set to ${next}.`] };
    }
  });

  register({
    name: 'dev.inspect-theme',
    category: 'Developer',
    description: 'Inspect active theme CSS variables.',
    usage: 'dev.inspect-theme',
    visibility: 'internal',
    handler: (_args, context) => {
      const snapshot = context.inspectTheme();
      const lines = Object.entries(snapshot).map(([key, value]) => `${key}: ${value}`);
      return { kind: 'info', lines };
    }
  });

  register({
    name: HOST_SERVERS_SECRET_PHRASE,
    category: 'Bloom',
    description: 'Unlock hidden host server tools.',
    usage: HOST_SERVERS_SECRET_PHRASE,
    visibility: 'internal',
    handler: (_args, context) => {
      context.setHostServersUnlocked(true);
      return {
        kind: 'success',
        lines: [
          context.hostServersUnlocked
            ? 'Host Server tools are already unlocked.'
            : 'Host Server tools unlocked. The Host tab is now visible.'
        ]
      };
    }
  });

  register({
    name: 'server lock',
    category: 'Bloom',
    description: 'Hide host server tools again.',
    usage: 'server lock',
    visibility: 'internal',
    handler: (_args, context) => {
      context.setHostServersUnlocked(false);
      return { kind: 'info', lines: ['Host Server tools hidden. Run the secret phrase to unlock again.'] };
    }
  });

  register({
    name: 'modmenu',
    aliases: ['/modmenu'],
    category: 'Bloom',
    description: 'Open the hidden cosmetics owner mod menu prompt.',
    usage: '/modmenu',
    handler: (_args, context) => {
      context.openCosmeticsModMenu();
      return {
        kind: 'info',
        lines: [
          'Opening Cosmetic Locker mod menu prompt...',
          'Enter the owner phrase in the prompt to continue.'
        ]
      };
    }
  });

  register({
    name: 'bloom',
    category: 'Bloom',
    description: 'Show a Bloom easter-egg line.',
    usage: 'bloom',
    handler: () => ({
      kind: 'info',
      lines: ['Bloom Console online. Petals loaded. Type `help` for command clusters.']
    })
  });

  register({
    name: 'petals',
    category: 'Bloom',
    description: 'Show a tiny Bloom status pulse.',
    usage: 'petals',
    handler: () => ({
      kind: 'info',
      lines: ['* petals swirl quietly around your launcher shell *']
    })
  });

  register({
    name: 'whoami',
    category: 'Bloom',
    description: 'Show current account identity.',
    usage: 'whoami',
    handler: (_args, context) => {
      if (!context.authName) {
        return { kind: 'warn', lines: ['Not signed in.'] };
      }
      return {
        kind: 'info',
        lines: [
          `User: ${context.authName}`,
          context.authUuid ? `UUID: ${context.authUuid}` : 'UUID: unavailable'
        ]
      };
    }
  });

  return commands;
}

export function toCommandPreview(command: string, args: string[]) {
  if (args.length === 0) return command;
  return `${command} ${args.map(quoteIfNeeded).join(' ')}`;
}
