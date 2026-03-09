import { ExternalLink, FolderOpen, HelpCircle, RefreshCcw, Settings2, Wrench } from 'lucide-react';

const ORACLE_JAVA_25_URL = 'https://www.oracle.com/java/technologies/downloads/#jdk25-windows';

const quickFixes = [
  {
    title: 'Pack says Java 21+ or Java 22+ is required',
    icon: Wrench,
    steps: [
      'Install a newer Java version first. Java 25 works for these packs too.',
      'Open the instance, go into its settings, and change Java from an old preset like `java17` to `java`, `java21`, or a direct Java path.',
      'Launch again after saving the instance settings.'
    ],
    ctaLabel: 'Oracle Java Download',
    ctaHref: ORACLE_JAVA_25_URL
  },
  {
    title: 'Game closes right after clicking launch',
    icon: RefreshCcw,
    steps: [
      'Open the instance and reinstall it if the install looked too fast or skipped downloads.',
      'If it is still broken, delete that instance and install it fresh so the libraries and natives are rebuilt cleanly.',
      'Try launch again before adding extra mods.'
    ]
  },
  {
    title: 'Mods are incompatible with the Minecraft version',
    icon: Settings2,
    steps: [
      'Read the first mismatch in the crash text. Usually it tells you the exact Minecraft version the pack wants.',
      'Delete the broken instance and reinstall the modpack so Bloom can rebuild it with the correct version.',
      'Do not mix extra mods from other versions into the same instance.'
    ]
  },
  {
    title: 'Custom Java path works on one PC but not another',
    icon: FolderOpen,
    steps: [
      'Open the instance settings and check the Java path field.',
      'If the path points to a missing folder, set it to `java` or browse to the installed `javaw.exe` / `java.exe`.',
      'Restart Bloom after changing Java if the old path keeps being reused.'
    ]
  }
];

const guideCards = [
  {
    eyebrow: 'Fix Java',
    title: 'How to change Java for one instance',
    bullets: [
      'Open `Instances`.',
      'Pick the broken instance.',
      'Open its settings/editor.',
      'Find the Java runtime field.',
      'Set it to `java`, `java21`, `java25`, or a direct path.',
      'Save and launch again.'
    ]
  },
  {
    eyebrow: 'Fresh Reinstall',
    title: 'How to rebuild a broken instance cleanly',
    bullets: [
      'Delete the broken instance from Bloom.',
      'Reinstall the modpack or create the instance again.',
      'Launch it once before adding extra mods, shaders, or resource packs.',
      'If it works clean, then add custom files after that.'
    ]
  },
  {
    eyebrow: 'Logs',
    title: 'What to send when you need support',
    bullets: [
      'Send the first real error block, not just “Minecraft crashed”.',
      'Include the Minecraft version, loader, and Java version.',
      'Say whether it is vanilla, Fabric, or a modpack instance.',
      'Mention if changing the instance Java path fixed it.'
    ]
  }
];

export function Help() {
  return (
    <div className="mx-auto max-w-[1280px] min-h-full px-4 py-6">
      <div className="g-panel-strong overflow-hidden p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[52rem]">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] g-accent-text">Help</p>
            <h1 className="mt-2 text-4xl font-black text-white md:text-5xl">Fix the common stuff fast</h1>
            <p className="mt-3 max-w-[44rem] text-sm text-white/62">
              This page is for user-fixable problems: wrong Java, broken instance settings, reinstall steps, and what to send if the issue still
              needs support.
            </p>
          </div>
          <div className="g-panel max-w-[22rem] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">Best first check</p>
            <p className="mt-2 text-sm font-bold text-white">If a pack mentions Java in the error, fix the instance Java setting first.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-4">
          {quickFixes.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="g-panel border p-5">
                <div className="flex items-start gap-4">
                  <div
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center border"
                    style={{
                      borderRadius: 'calc(16px * var(--g-roundness-mult))',
                      borderColor: 'color-mix(in srgb, var(--g-accent) 34%, transparent)',
                      background: 'color-mix(in srgb, var(--g-accent) 14%, transparent)'
                    }}
                  >
                    <Icon size={18} className="g-accent-text" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-black text-white">{item.title}</h2>
                    <ol className="mt-3 space-y-2 text-sm text-white/68">
                      {item.steps.map((step, index) => (
                        <li key={step} className="flex gap-3">
                          <span className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-black text-white/75">
                            {index + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                    {item.ctaHref && item.ctaLabel && (
                      <a
                        href={item.ctaHref}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex h-10 items-center gap-2 border px-4 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:opacity-90"
                        style={{
                          borderRadius: 'calc(12px * var(--g-roundness-mult))',
                          borderColor: 'color-mix(in srgb, var(--g-accent) 36%, transparent)',
                          background: 'var(--g-accent-gradient)'
                        }}
                      >
                        {item.ctaLabel}
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="space-y-4">
          <section className="g-panel border p-5">
            <div className="flex items-center gap-3">
              <div
                className="inline-flex h-10 w-10 items-center justify-center border"
                style={{
                  borderRadius: 'calc(14px * var(--g-roundness-mult))',
                  borderColor: 'color-mix(in srgb, var(--g-accent) 30%, transparent)',
                  background: 'color-mix(in srgb, var(--g-accent) 12%, transparent)'
                }}
              >
                <HelpCircle size={18} className="g-accent-text" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Quick Rule</p>
                <p className="text-sm font-bold text-white">Do not keep forcing old Java presets on newer packs.</p>
              </div>
            </div>
          </section>

          {guideCards.map((card) => (
            <section key={card.title} className="g-panel border p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] g-accent-text">{card.eyebrow}</p>
              <h3 className="mt-2 text-lg font-black text-white">{card.title}</h3>
              <div className="mt-4 space-y-2">
                {card.bullets.map((bullet) => (
                  <div key={bullet} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/66">
                    {bullet}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}
