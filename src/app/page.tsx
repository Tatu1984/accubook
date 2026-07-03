import Link from "next/link";
import { Button } from "@/frontend/components/ui/button";
import { Card, CardContent } from "@/frontend/components/ui/card";
import {
  ArrowRight,
  Receipt,
  FileSpreadsheet,
  Building2,
  ShieldCheck,
  Wallet,
  RefreshCw,
  CircleCheck,
} from "lucide-react";
import { AuroraBackground } from "@/frontend/components/landing/aurora-background";
import { BlurText } from "@/frontend/components/landing/blur-text";
import { TiltedCard } from "@/frontend/components/landing/tilted-card";
import { Magnetic } from "@/frontend/components/landing/magnetic-button";

// Same-domain login. The landing page serves at the deployment root
// (e.g. https://accubook.infinititechpartners.com/) and the existing
// NextAuth flow lives at /login on the same domain.
const LOGIN_URL = "/login";

const FEATURES = [
  {
    icon: Receipt,
    title: "GST returns end-to-end",
    blurb:
      "GSTR-1 and GSTR-3B compute every section the GSTN portal accepts — B2B, B2CL, B2CS, CDNR/CDNUR, exports, NIL, HSN summary. Download portal-ready JSON in one click.",
  },
  {
    icon: FileSpreadsheet,
    title: "E-invoicing + e-way bill",
    blurb:
      "Pre-validated NIC payloads with strict GSTIN + HSN checks. Catch field issues before submission, not after a rejected upload at filing time.",
  },
  {
    icon: Building2,
    title: "Tally migration in minutes",
    blurb:
      "Upload your Tally All-Masters XML — ledger groups, ledgers, parties, stock items import idempotently with two-pass parent resolution.",
  },
  {
    icon: Wallet,
    title: "Bank reconciliation",
    blurb:
      "Statement import for HDFC, ICICI, SBI, Axis (CSV) plus a layered matcher that auto-reconciles high-confidence matches and surfaces ambiguous ones for review.",
  },
  {
    icon: ShieldCheck,
    title: "Built-for-India compliance",
    blurb:
      "TDS & TCS rates per section (194C/J/I/H/Q + 206C). Indian payroll: PF, ESI, Professional Tax, TDS on salary. Place-of-supply-aware GST split everywhere.",
  },
  {
    icon: RefreshCw,
    title: "Multi-org, multi-branch",
    blurb:
      "Tenant isolation enforced at the framework layer — every API path proves org membership before touching data. Approval workflows, role-based permissions, structured audit log on every mutation.",
  },
];

const STATS = [
  { value: "200+", label: "tests covering accounting math" },
  { value: "9 / 9", label: "GSTR-1 sections supported" },
  { value: "4", label: "banks ready for statement import" },
  { value: "0", label: "JS-float bugs (Decimal end-to-end)" },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-white text-slate-900 dark:from-slate-950 dark:to-black dark:text-slate-100">
      {/* Top nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500" />
          <span className="text-lg tracking-tight">accubook</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex dark:text-slate-300">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white">
            Features
          </a>
          <a href="#stats" className="hover:text-slate-900 dark:hover:text-white">
            Why us
          </a>
        </nav>
        <Magnetic>
          <Button asChild className="rounded-full px-6">
            <a href={LOGIN_URL}>
              Sign in
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </a>
          </Button>
        </Magnetic>
      </header>

      {/* Hero */}
      <section className="relative">
        <AuroraBackground />
        <div className="relative z-10 mx-auto max-w-5xl px-6 pt-16 pb-24 text-center md:pt-28 md:pb-32">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/60 px-4 py-1.5 text-xs font-medium text-slate-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Built for Indian businesses · GST · TDS · E-invoicing · Tally migration
          </div>

          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            <BlurText text="Modern accounting" />
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-rose-500 bg-clip-text text-transparent">
              <BlurText text="for India's businesses." delay={300} />
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-balance text-lg text-slate-600 dark:text-slate-300">
            <BlurText
              text="Multi-org books, GST returns, e-invoicing, e-way bill, TDS, payroll, bank reconciliation, and Tally migration — all in one place. Decimal-precise. Tested. Yours."
              delay={700}
              step={40}
            />
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Magnetic>
              <Button
                asChild
                size="lg"
                className="rounded-full bg-slate-900 px-8 text-base shadow-lg hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <a href={LOGIN_URL}>
                  <span>Sign in to portal</span>
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
            </Magnetic>
            <Button asChild variant="outline" size="lg" className="rounded-full px-8 text-base">
              <a href="#features">See the features</a>
            </Button>
          </div>

          <p className="mt-8 text-sm text-slate-500 dark:text-slate-400">
            New here? Sign in screen has a Sign-up link.
          </p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y border-slate-200/70 bg-white/40 backdrop-blur dark:border-white/5 dark:bg-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 py-8 text-sm text-slate-500 dark:text-slate-400">
          {[
            "GSTN portal-ready JSON",
            "NIC e-invoice payload",
            "NIC e-way bill ≥ ₹50k",
            "Tally All-Masters XML",
            "PF · ESI · PT · TDS",
            "HDFC · ICICI · SBI · Axis",
          ].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <CircleCheck className="h-4 w-4 text-emerald-500" />
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-16 text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            <BlurText text="Everything an Indian SMB books needs." />
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600 dark:text-slate-300">
            One platform. Each module passes accountant scrutiny — and the build
            tests that prove it.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <TiltedCard key={f.title}>
              <Card className="group h-full border-slate-200 bg-white/70 backdrop-blur transition-shadow hover:shadow-xl dark:border-white/10 dark:bg-white/[0.03]">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 text-indigo-600 group-hover:from-indigo-500/20 group-hover:to-fuchsia-500/20 dark:text-indigo-400">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {f.blurb}
                  </p>
                </CardContent>
              </Card>
            </TiltedCard>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section
        id="stats"
        className="border-t border-slate-200/70 bg-gradient-to-b from-transparent to-slate-50 dark:border-white/5 dark:to-black"
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight md:text-4xl">
            Receipts and proofs, not promises.
          </h2>
          <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className="text-center opacity-0"
                style={{
                  animation: "float-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div className="bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-5xl font-semibold text-transparent dark:from-white dark:to-slate-400 md:text-6xl">
                  {s.value}
                </div>
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden">
        <AuroraBackground className="opacity-60" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 py-24 text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Ready to clean up your books?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">
            Sign in to start running your books on accubook. Migrate from Tally
            in your first session.
          </p>
          <Magnetic>
            <Button
              asChild
              size="lg"
              className="mt-8 rounded-full bg-slate-900 px-10 py-6 text-base shadow-xl hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <a href={LOGIN_URL}>
                Sign in to portal
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </Magnetic>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 dark:border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="inline-block h-5 w-5 rounded-md bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-rose-500" />
            <span>© {new Date().getFullYear()} accubook</span>
          </div>
          <div className="flex items-center gap-6">
            <a href={LOGIN_URL} className="hover:text-slate-700 dark:hover:text-slate-200">
              Sign in
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
