import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FolderOpen,
  HelpCircle,
  RefreshCcw,
  Settings2,
  Sparkles,
  Wrench
} from 'lucide-react';

const ORACLE_JAVA_25_URL = 'https://www.oracle.com/java/technologies/downloads/#jdk25-windows';
const BLOOM_APPDATA_PATH = 'C:\\Users\\<YourUser>\\AppData\\Roaming\\com.bloomunit.client\\instances\\<instance-id>\\natives';

type HelpSection = {
  id: string;
  title: string;
  body?: string;
  bullets?: string[];
  steps?: string[];
  callout?: string;
};

type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  icon: typeof HelpCircle;
  ctaLabel?: string;
  ctaHref?: string;
  sections: HelpSection[];
};

type HelpGroup = {
  id: string;
  title: string;
  icon: typeof HelpCircle;
  articles: HelpArticle[];
};

const HELP_GROUPS: HelpGroup[] = [
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: AlertTriangle,
    articles: [
      {
        id: 'native-dll-lock',
        title: 'Native DLL lock fix',
        summary:
          'Fix the Windows error where Bloom cannot write glfw.dll, lwjgl.dll, or another native file because another process still has it open.',
        icon: AlertTriangle,
        sections: [
          {
            id: 'what-it-means',
            title: 'What this means',
            body:
              'This error usually appears after Windows keeps a DLL in use from a previous Minecraft or Java process. Bloom then tries to prepare the next launch and Windows blocks the overwrite.'
          },
          {
            id: 'first-fix',
            title: 'What to do first',
            steps: [
              'Fully close Bloom and Minecraft.',
              'Open Task Manager and end any leftover java.exe, javaw.exe, or bloom-client.exe process.',
              'Open the affected instance natives folder and delete it.',
              `The folder usually looks like: ${BLOOM_APPDATA_PATH}`,
              'Launch the instance again.'
            ],
            callout: 'Do not keep clicking Launch repeatedly while the first launch is still starting.'
          },
          {
            id: 'why-bloom-now-handles-it-better',
            title: 'What Bloom does now',
            bullets: [
              'Bloom now extracts native DLLs into a fresh launch folder each time instead of reusing one locked DLL path.',
              'Old temporary native folders are cleaned up automatically after they get stale.',
              'This prevents the most common OS error 32 relaunch failure.'
            ]
          },
          {
            id: 'if-it-keeps-happening',
            title: 'If it still keeps happening',
            steps: [
              'Restart Windows once to clear any hidden file lock.',
              'Temporarily exclude the Bloom app data folder from Windows Defender if Defender is scanning the DLL during launch.',
              'Try a clean reinstall of that instance so the libraries and natives rebuild from scratch.',
              'If it still fails, send the exact error line and the instance type to support.'
            ]
          }
        ]
      },
      {
        id: 'game-closes-on-launch',
        title: 'Game closes right after launch',
        summary: 'Use this when Minecraft opens briefly or closes immediately after the Play button changes to Running.',
        icon: RefreshCcw,
        sections: [
          {
            id: 'quick-rebuild',
            title: 'Quick rebuild steps',
            steps: [
              'Open the broken instance and reinstall it if the install looked too fast or incomplete.',
              'If it is still broken, delete the instance and install it fresh so Bloom rebuilds libraries, assets, and natives.',
              'Launch once before adding extra mods, shaders, or resource packs.'
            ]
          },
          {
            id: 'what-to-check',
            title: 'What to check',
            bullets: [
              'Wrong Java version for the pack',
              'Broken or half-downloaded libraries',
              'A mod added manually that does not belong in that pack',
              'An old process or file lock from a prior launch'
            ]
          }
        ]
      },
      {
        id: 'mod-version-mismatch',
        title: 'Mods do not match the Minecraft version',
        summary: 'Use this when the error text says a mod wants another loader or Minecraft version.',
        icon: Settings2,
        sections: [
          {
            id: 'how-to-read-it',
            title: 'How to read the error',
            body:
              'Most mismatch errors already tell you the exact version that failed. Read the first dependency mismatch instead of only the final crash line.'
          },
          {
            id: 'fix-steps',
            title: 'How to fix it',
            steps: [
              'Delete the broken instance and reinstall the pack with the correct version.',
              'Do not mix extra mods from another Minecraft version into the same instance.',
              'If you imported a pack, verify the loader and Minecraft version before launch.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'java',
    title: 'Java and Setup',
    icon: Wrench,
    articles: [
      {
        id: 'java-21-required',
        title: 'Pack says Java 21+ is required',
        summary: 'Fix packs that refuse to launch because the current instance is still pinned to an older Java preset.',
        icon: Wrench,
        ctaLabel: 'Oracle Java Download',
        ctaHref: ORACLE_JAVA_25_URL,
        sections: [
          {
            id: 'install-java',
            title: 'Install a newer Java version',
            body:
              'If the error mentions Java 21 or Java 22, install a newer Java runtime first. Java 25 also works for packs that require Java 21+.'
          },
          {
            id: 'change-instance-java',
            title: 'Change Java for the instance',
            steps: [
              'Open Instances.',
              'Open the broken instance settings or editor.',
              'Find the Java runtime field.',
              'Set it to java, java21, java25, or a direct javaw.exe path.',
              'Save and launch again.'
            ]
          }
        ]
      },
      {
        id: 'custom-java-path',
        title: 'Custom Java path works on one PC but not another',
        summary: "Use this when a copied instance points to a Java path that only exists on someone else's computer.",
        icon: FolderOpen,
        sections: [
          {
            id: 'fix-path',
            title: 'Fix the path',
            steps: [
              'Open the instance settings.',
              'Check the Java path field.',
              'If it points to a missing folder, set it to java or browse to java.exe or javaw.exe.',
              'Restart Bloom if the old path keeps being reused.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'support',
    title: 'Support',
    icon: HelpCircle,
    articles: [
      {
        id: 'what-to-send',
        title: 'What to send when you need help',
        summary: 'Send the details support needs to diagnose the issue quickly.',
        icon: HelpCircle,
        sections: [
          {
            id: 'send-these',
            title: 'Send these details',
            bullets: [
              'The first real error block, not just Minecraft crashed.',
              'Minecraft version, loader, and Java version.',
              'Whether it is vanilla, Fabric, Forge, or a modpack import.',
              'What changed right before it broke.',
              'Whether changing Java or reinstalling the instance changed anything.'
            ]
          }
        ]
      }
    ]
  }
];

function findArticle(articleId: string) {
  for (const group of HELP_GROUPS) {
    const article = group.articles.find((entry) => entry.id === articleId);
    if (article) return { article, group };
  }
  return null;
}

export function Help() {
  const [activeArticleId, setActiveArticleId] = useState<string>('native-dll-lock');

  const active = useMemo(() => {
    return findArticle(activeArticleId) ?? findArticle('native-dll-lock')!;
  }, [activeArticleId]);

  const { article, group } = active;

  return (
    <div className="mx-auto max-w-[1400px] min-h-full px-4 py-6">
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_220px]">
        <aside className="g-panel-strong overflow-hidden border px-3 py-4">
          <div className="border-b border-white/8 px-2 pb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] g-accent-text">Help</p>
            <p className="mt-2 text-lg font-black text-white">Support guides</p>
            <p className="mt-2 text-sm text-white/54">Open a topic, follow the steps, and only escalate when the exact fix still fails.</p>
          </div>

          <div className="mt-4 space-y-5">
            {HELP_GROUPS.map((helpGroup) => {
              const GroupIcon = helpGroup.icon;
              return (
                <section key={helpGroup.id}>
                  <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/42">
                    <GroupIcon size={13} className="g-accent-text" />
                    <span>{helpGroup.title}</span>
                  </div>
                  <div className="space-y-1">
                    {helpGroup.articles.map((entry) => {
                      const isActive = entry.id === article.id;
                      return (
                        <button
                          key={entry.id}
                          onClick={() => setActiveArticleId(entry.id)}
                          className="w-full rounded-xl border px-3 py-2 text-left transition"
                          style={{
                            borderColor: isActive ? 'color-mix(in srgb, var(--g-accent) 38%, transparent)' : 'transparent',
                            background: isActive ? 'color-mix(in srgb, var(--g-accent) 12%, transparent)' : 'transparent'
                          }}
                        >
                          <p className={isActive ? 'text-sm font-bold text-white' : 'text-sm font-medium text-white/62'}>{entry.title}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </aside>

        <main className="g-panel-strong overflow-hidden border px-6 py-7 md:px-8">
          <div className="border-b border-white/8 pb-6">
            <div className="flex items-center gap-3">
              <div
                className="inline-flex h-11 w-11 items-center justify-center border"
                style={{
                  borderRadius: 'calc(16px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-accent) 34%, transparent)',
                  background: 'color-mix(in srgb, var(--g-accent) 14%, transparent)'
                }}
              >
                <article.icon size={20} className="g-accent-text" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{group.title}</p>
                <h1 className="mt-1 text-4xl font-black text-white md:text-5xl">{article.title}</h1>
              </div>
            </div>
            <p className="mt-4 max-w-[52rem] text-sm text-white/62">{article.summary}</p>
            {article.ctaHref && article.ctaLabel && (
              <a
                href={article.ctaHref}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex h-10 items-center gap-2 border px-4 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:opacity-90"
                style={{
                  borderRadius: 'calc(12px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-accent) 36%, transparent)',
                  background: 'var(--g-accent-gradient)'
                }}
              >
                {article.ctaLabel}
                <ExternalLink size={13} />
              </a>
            )}
          </div>

          <div className="py-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/42">Sections</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {article.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/70 transition hover:border-white/18 hover:bg-white/[0.05]"
                >
                  <Sparkles size={13} className="g-accent-text" />
                  <span>{section.title}</span>
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-8 border-t border-white/8 pt-6">
            {article.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-2xl font-black text-white">{section.title}</h2>
                {section.body && <p className="mt-3 max-w-[52rem] text-sm leading-7 text-white/66">{section.body}</p>}
                {section.callout && (
                  <div className="mt-4 rounded-2xl border border-amber-300/18 bg-amber-300/[0.08] px-4 py-3 text-sm text-amber-100/88">
                    {section.callout}
                  </div>
                )}
                {section.steps && (
                  <ol className="mt-4 space-y-3">
                    {section.steps.map((step, index) => (
                      <li key={step} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] text-[10px] font-black text-white/76">
                          {index + 1}
                        </span>
                        <span className="text-sm leading-6 text-white/70">{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {section.bullets && (
                  <div className="mt-4 space-y-3">
                    {section.bullets.map((bullet) => (
                      <div key={bullet} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-white/68">
                        {bullet}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </main>

        <aside className="g-panel border px-4 py-5 h-fit">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/42">On this page</p>
          <div className="mt-4 space-y-2">
            {article.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="flex items-start gap-2 text-sm text-white/62 transition hover:text-white">
                <Sparkles size={13} className="mt-1 g-accent-text" />
                <span>{section.title}</span>
              </a>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Best first move</p>
            <p className="mt-2 text-sm font-bold text-white">If the error mentions Java, fix Java first. If it mentions a locked DLL, close Java and clear the natives folder.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
