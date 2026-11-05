import Link from "next/link";

const FEATURES = [
  {
    title: "Real-time sync",
    description:
      "Every card, comment, and label appears instantly across all windows. No refresh, no lag.",
  },
  {
    title: "Optimistic updates",
    description:
      "Changes apply locally first, then sync. Feels instant even on slow connections.",
  },
  {
    title: "Conflict resolution",
    description:
      "Concurrent edits are merged automatically. Last-write-wins with full audit trail.",
  },
  {
    title: "Presence indicators",
    description:
      "See who is editing which card in real time. Never step on each other's work.",
  },
  {
    title: "Activity history",
    description:
      "Every action is logged. Trace who changed what, when, and why. Full accountability.",
  },
  {
    title: "Workspace permissions",
    description:
      "Role-based access at the workspace level. Owners, admins, members, viewers.",
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden border-b-4 border-border bg-primary px-6 py-24 text-primary-foreground">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-sm font-bold uppercase tracking-widest opacity-80">
            Real-time collaborative kanban
          </p>
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight sm:text-7xl">
            Teammate
          </h1>
          <p className="mt-6 max-w-2xl text-xl font-medium opacity-90">
            A polished workspace where engineering teams plan, track, and ship
            together. Built for speed. Designed for collaboration.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/auth/sign-in"
              className="inline-flex items-center rounded-xl border-2 border-border bg-background px-6 py-3 text-sm font-extrabold text-foreground shadow-brutal transition-all hover:-translate-y-0.5 hover:shadow-brutal-sm active:translate-y-0.5 active:shadow-none"
            >
              Get started
            </Link>
            <Link
              href="/auth/sign-in"
              className="inline-flex items-center rounded-xl border-2 border-border bg-surface px-6 py-3 text-sm font-extrabold text-surface-foreground shadow-brutal transition-all hover:-translate-y-0.5 hover:shadow-brutal-sm active:translate-y-0.5 active:shadow-none"
            >
              View demo
            </Link>
          </div>
        </div>
        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rotate-12 rounded-3xl border-4 border-border bg-accent opacity-20" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 -rotate-6 rounded-3xl border-4 border-border bg-surface opacity-30" />
      </section>

      {/* Features */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything your team needs
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Built for engineering teams who ship fast and collaborate hard.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border-2 border-border bg-surface p-6 shadow-brutal transition-all hover:-translate-y-1 hover:shadow-brutal-sm"
              >
                <h3 className="text-lg font-extrabold tracking-tight text-surface-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm text-muted">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t-4 border-border bg-surface px-6 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Start collaborating today
          </h2>
          <p className="mt-4 text-lg text-muted">
            Free to start. No credit card required.
          </p>
          <Link
            href="/auth/sign-in"
            className="mt-8 inline-flex items-center rounded-xl border-2 border-border bg-primary px-8 py-4 text-base font-extrabold text-primary-foreground shadow-brutal transition-all hover:-translate-y-0.5 hover:shadow-brutal-sm active:translate-y-0.5 active:shadow-none"
          >
            Create your first board
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-4 border-border px-6 py-8">
        <div className="mx-auto max-w-5xl text-center text-sm text-muted">
          <p>Teammate — Real-time collaborative kanban for engineering teams</p>
        </div>
      </footer>
    </main>
  );
}
