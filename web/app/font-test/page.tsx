import {
  Bricolage_Grotesque,
  Geist,
  JetBrains_Mono,
  Fraunces,
  Instrument_Serif,
} from "next/font/google";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-test-bricolage",
});
const geistHeavy = Geist({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-test-geist-heavy",
});
const jbmBold = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-test-jbm",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-test-fraunces",
});
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-test-instrument",
});

const SAMPLES = [
  {
    key: "A",
    title: "Option A — Bricolage Grotesque",
    description: "Variable display sans, modern + technical, slightly squared.",
    fontClass: "font-[var(--font-test-bricolage)] font-extrabold not-italic",
  },
  {
    key: "B",
    title: "Option B — Geist (Heavy)",
    description: "Same family as the body. Heavy weight, ultra-clean, neutral.",
    fontClass: "font-[var(--font-test-geist-heavy)] font-black not-italic",
  },
  {
    key: "C",
    title: "Option C — JetBrains Mono (Bold)",
    description: "Monospace at hero scale. Full terminal / cockpit feel.",
    fontClass: "font-[var(--font-test-jbm)] font-bold not-italic",
  },
  {
    key: "D",
    title: "Option D — Fraunces",
    description: "Contemporary serif with character. Editorial but warmer than Instrument.",
    fontClass: "font-[var(--font-test-fraunces)] font-bold not-italic",
  },
  {
    key: "current",
    title: "Current — Instrument Serif (italic) — what you don't like",
    description: "Shown for reference so you can see what changed.",
    fontClass: "font-[var(--font-test-instrument)] font-normal italic",
  },
];

export default function FontTestPage() {
  return (
    <div
      className={`${bricolage.variable} ${geistHeavy.variable} ${jbmBold.variable} ${fraunces.variable} ${instrument.variable} min-h-screen p-8 sm:p-12`}
    >
      <div className="max-w-5xl mx-auto space-y-12">
        <header className="space-y-2">
          <p className="font-mono text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
            admin / font · test
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Display font comparison</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Same hero copy from the app rendered with each candidate. Pick the one you like &mdash; I&apos;ll wire it in
            and the rest of the design stays put.
          </p>
        </header>

        <div className="space-y-10">
          {SAMPLES.map((s) => (
            <section
              key={s.key}
              className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur-md overflow-hidden"
            >
              <div className="px-6 py-3 border-b border-border/60 bg-card/40 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
                <code className="font-mono text-[10px] text-muted-foreground tracking-wider">
                  [{s.key}]
                </code>
              </div>

              <div className="px-8 py-10 space-y-8">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-2">
                    Dashboard hero
                  </p>
                  <h2 className={`text-5xl tracking-tight leading-[1.05] ${s.fontClass}`}>
                    Mission Control
                  </h2>
                </div>

                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-2">
                    Chat empty state
                  </p>
                  <h2 className={`text-5xl tracking-tight leading-[1.05] ${s.fontClass}`}>
                    Ask Wingman
                  </h2>
                </div>

                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-2">
                    Page title
                  </p>
                  <h2 className={`text-4xl tracking-tight leading-[1.05] ${s.fontClass}`}>
                    GitHub Connection
                  </h2>
                </div>

                <div>
                  <p className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground mb-2">
                    Stat numerals (dashboard cards)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Connection", value: "Online" },
                      { label: "Plan", value: "Business" },
                      { label: "Models", value: "47" },
                      { label: "Premium", value: "12 / 300" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl border border-border/70 bg-card/60 px-4 py-4"
                      >
                        <p className="font-mono text-[9px] tracking-[0.18em] uppercase text-muted-foreground mb-2">
                          {stat.label}
                        </p>
                        <p className={`text-3xl leading-none ${s.fontClass}`}>
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <footer className="pt-4 pb-12 text-center">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground">
            Tell me &quot;A&quot;, &quot;B&quot;, &quot;C&quot;, or &quot;D&quot; and I&apos;ll wire it in across the app.
          </p>
        </footer>
      </div>
    </div>
  );
}
