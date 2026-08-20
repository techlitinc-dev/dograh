"use client";

import {
  ArrowRight,
  AudioLines,
  BarChart3,
  Bot,
  Building2,
  FileText,
  KanbanSquare,
  Megaphone,
  Mic,
  PhoneCall,
  Play,
  Quote,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#analytics", label: "Analytics" },
  { href: "#results", label: "Results" },
];

const STATS = [
  { value: "12M+", label: "AI-handled calls" },
  { value: "380ms", label: "Median response latency" },
  { value: "41%", label: "More meetings booked" },
  { value: "99.99%", label: "Platform uptime" },
];

const FEATURES = [
  {
    icon: Bot,
    accent: "bg-violet-500/10 text-violet-400",
    title: "AI Voice Agents",
    description:
      "Human-sounding agents answer inbound calls and run outbound qualification, booking, and follow-ups — fully managed, no configuration required.",
  },
  {
    icon: KanbanSquare,
    accent: "bg-cyan-500/10 text-cyan-400",
    title: "Visual Pipelines",
    description:
      "Drag deals across kanban stages while your agents move them forward. Every conversation updates the pipeline in real time.",
  },
  {
    icon: Users,
    accent: "bg-fuchsia-500/10 text-fuchsia-400",
    title: "Contacts & Companies",
    description:
      "A complete CRM at the core: contacts, companies, notes, and tasks — automatically enriched by every call your agents make.",
  },
  {
    icon: Megaphone,
    accent: "bg-amber-500/10 text-amber-400",
    title: "Campaigns",
    description:
      "Launch outbound calling campaigns to thousands of leads with smart throttling, scheduling, and automatic retry logic.",
  },
  {
    icon: FileText,
    accent: "bg-emerald-500/10 text-emerald-400",
    title: "Call Recordings & Transcripts",
    description:
      "Every call is recorded, transcribed, and summarized by AI — searchable, shareable, and attached to the right contact.",
  },
  {
    icon: BarChart3,
    accent: "bg-sky-500/10 text-sky-400",
    title: "Analytics",
    description:
      "Conversion funnels, agent performance, and campaign ROI dashboards show exactly how voice drives your revenue.",
  },
];

const STEPS = [
  {
    step: "01",
    icon: Users,
    title: "Import your contacts",
    description:
      "Sync your existing leads or build lists natively in VoxCRM. Contacts, companies, and deals live in one place from day one.",
  },
  {
    step: "02",
    icon: AudioLines,
    title: "Launch a voice agent",
    description:
      "Describe your goal — qualify leads, book demos, follow up on quotes. VoxCRM's managed voice agents handle the rest.",
  },
  {
    step: "03",
    icon: TrendingUp,
    title: "Watch the pipeline move",
    description:
      "Calls are transcribed, summarized, and logged automatically. Deals advance, tasks are created, and you stay in control.",
  },
];

const BAR_HEIGHTS = [32, 48, 40, 62, 55, 74, 68, 88, 80, 96, 90, 100];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background font-sans text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Ambient background glows */}
      <div className="ambient-glow -top-48 -left-48 h-[600px] w-[600px] bg-violet-600/20" />
      <div className="ambient-glow top-[40rem] -right-64 h-[700px] w-[700px] bg-cyan-500/15" />
      <div className="ambient-glow bottom-48 left-1/3 h-[500px] w-[500px] bg-fuchsia-600/10" />

      {/* Sticky Glass Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 glass-panel px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-10">
            <Link href="/" aria-label="VoxCRM home">
              <BrandLogo className="text-xl" />
            </Link>
            <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button variant="ghost" size="sm" className="text-xs font-semibold">
                Sign in
              </Button>
            </Link>
            <Link href="/auth/signup">
              <Button
                size="sm"
                className="rounded-xl bg-primary text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
              >
                Get started
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-7xl space-y-8 px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 glass-button px-4 py-1.5 text-xs font-semibold text-primary shadow-sm">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Voice-first CRM for modern revenue teams</span>
        </div>

        <h1 className="mx-auto max-w-5xl font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
          The CRM that <span className="gradient-text">makes the calls</span> for you
        </h1>

        <p className="mx-auto max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          VoxCRM combines a full customer-relationship platform with AI voice agents that
          answer, qualify, book, and follow up — every call recorded, transcribed, and
          logged to your pipeline automatically.
        </p>

        <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
          <Link href="/auth/signup">
            <Button
              size="lg"
              className="h-12 gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/25 hover:bg-primary/90"
            >
              <Mic className="h-4 w-4" />
              Start free — no credit card
            </Button>
          </Link>
          <a href="#how-it-works">
            <Button
              size="lg"
              variant="outline"
              className="h-12 gap-2 rounded-xl border-white/15 glass-button px-8 text-sm font-semibold"
            >
              <Play className="h-4 w-4 text-primary" />
              See how it works
            </Button>
          </a>
        </div>

        {/* Hero centerpiece — glass dashboard mock */}
        <div className="mx-auto max-w-4xl pt-12">
          <div className="relative rounded-3xl border border-white/15 glass-card p-6 text-left shadow-2xl sm:p-8">
            {/* Mock window chrome */}
            <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-semibold text-foreground">Live call — AI agent</span>
                <span className="hidden font-mono sm:inline">Acme Corp · Sarah Chen</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  Fully managed
                </span>
                <span className="font-mono">02:34</span>
              </div>
            </div>

            {/* Waveform visualizer */}
            <div className="my-4 flex h-16 items-center justify-center gap-1.5">
              {[24, 40, 16, 56, 32, 64, 48, 80, 52, 38, 70, 45, 90, 60, 30, 48, 65, 82, 40, 55, 30, 75, 42, 20].map(
                (h, i) => (
                  <div
                    key={i}
                    className="w-1.5 animate-pulse rounded-full bg-gradient-to-t from-violet-500/70 to-cyan-400"
                    style={{ height: `${h}%`, animationDelay: `${i * 75}ms` }}
                  />
                )
              )}
            </div>

            {/* Mock transcript + CRM actions */}
            <div className="grid grid-cols-1 gap-4 pt-4 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
                  Live transcript
                </span>
                <span className="mt-1 block font-medium text-foreground">
                  “Yes, Thursday at 2 PM works — send the invite.”
                </span>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
                  Pipeline updated
                </span>
                <span className="mt-1 block font-bold text-primary">
                  Deal moved → Meeting booked
                </span>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/5 p-3">
                <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
                  Task created
                </span>
                <span className="text-glow mt-1 block font-bold">
                  Send calendar invite — 2:00 PM Thu
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="border-y border-white/10 glass-panel px-6 py-10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 text-center md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="space-y-1">
              <div className="font-display text-3xl font-bold sm:text-4xl">
                <span className="gradient-text">{stat.value}</span>
              </div>
              <div className="text-xs font-medium text-muted-foreground sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-24 space-y-12 px-6 py-24">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            CRM, voice agents, and campaigns —{" "}
            <span className="gradient-text">one platform</span>
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            Stop stitching together dialers, CRMs, and transcription tools. VoxCRM runs the
            entire voice-driven revenue motion end to end.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="space-y-3 rounded-2xl border border-white/10 glass-card p-6 transition-all hover:border-primary/40"
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${feature.accent}`}
              >
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 space-y-12 px-6 py-24">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Live in <span className="gradient-text">three steps</span>
          </h2>
          <p className="text-sm text-muted-foreground sm:text-base">
            No telephony setup, no model tuning, no infrastructure. VoxCRM is fully managed —
            you bring the leads.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step, idx) => (
            <div
              key={step.step}
              className="relative space-y-4 rounded-2xl border border-white/10 glass-card p-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <span className="font-display text-4xl font-bold text-white/10">
                  {step.step}
                </span>
              </div>
              <h3 className="font-display text-lg font-bold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
              {idx < STEPS.length - 1 && (
                <ArrowRight className="absolute top-1/2 -right-4 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground/40 md:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Analytics Highlight Band */}
      <section id="analytics" className="scroll-mt-24 border-y border-white/10 glass-panel px-6 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 glass-button px-3 py-1 text-xs font-semibold text-primary">
              <BarChart3 className="h-3.5 w-3.5" />
              Built-in analytics
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Know exactly what every call is{" "}
              <span className="gradient-text">worth</span>
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Track connect rates, qualification outcomes, and pipeline generated per
              campaign. VoxCRM turns thousands of conversations into clear, actionable
              revenue signal.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-center gap-3">
                <PhoneCall className="h-4 w-4 shrink-0 text-primary" />
                Real-time call volume and outcome tracking
              </li>
              <li className="flex items-center gap-3">
                <TrendingUp className="h-4 w-4 shrink-0 text-primary" />
                Conversion funnels from dial to closed deal
              </li>
              <li className="flex items-center gap-3">
                <Building2 className="h-4 w-4 shrink-0 text-primary" />
                Per-team and per-campaign performance breakdowns
              </li>
            </ul>
          </div>

          {/* CSS analytics visual */}
          <div className="rounded-3xl border border-white/15 glass-card p-6 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Campaign performance</span>
              <span className="font-mono">Last 12 weeks</span>
            </div>

            <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-end">
              {/* Bar chart */}
              <div className="flex h-40 flex-1 items-end gap-1.5">
                {BAR_HEIGHTS.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md bg-gradient-to-t from-violet-600/60 to-cyan-400/80"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              {/* Donut */}
              <div className="flex flex-col items-center gap-3">
                <div
                  className="relative h-32 w-32 rounded-full"
                  style={{
                    background:
                      "conic-gradient(#8b5cf6 0 62%, #22d3ee 62% 84%, rgba(255,255,255,0.08) 84% 100%)",
                  }}
                >
                  <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-background">
                    <span className="font-display text-2xl font-bold">62%</span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      Qualified
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-violet-500" /> Qualified leads
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" /> Meetings booked
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-white/20" /> Follow-up needed
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial / Metrics */}
      <section id="results" className="mx-auto max-w-5xl scroll-mt-24 space-y-12 px-6 py-24">
        <div className="rounded-3xl border border-white/15 glass-card p-8 text-center shadow-2xl sm:p-12">
          <Quote className="mx-auto h-8 w-8 text-primary/60" />
          <blockquote className="mx-auto mt-6 max-w-3xl font-display text-xl font-medium leading-relaxed sm:text-2xl">
            “VoxCRM replaced our dialer, our CRM, and half our SDR workload. The voice agents
            booked{" "}
            <span className="gradient-text">312 qualified meetings</span> in the first
            quarter — and every single one was already logged, transcribed, and staged in
            the pipeline.”
          </blockquote>
          <div className="mt-8">
            <div className="font-semibold text-foreground">Maya Rodriguez</div>
            <div className="text-sm text-muted-foreground">
              VP of Revenue Operations, Northwind Logistics
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 border-t border-white/10 pt-8 sm:grid-cols-3">
            <div>
              <div className="font-display text-2xl font-bold text-primary">3.2×</div>
              <div className="text-xs text-muted-foreground">More qualified pipeline</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold text-primary">−68%</div>
              <div className="text-xs text-muted-foreground">Cost per booked meeting</div>
            </div>
            <div>
              <div className="font-display text-2xl font-bold text-primary">24/7</div>
              <div className="text-xs text-muted-foreground">Inbound coverage, zero staffing</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Band */}
      <section className="px-6 pb-24">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-primary/20 glass-card p-10 text-center shadow-2xl sm:p-16">
          <div className="ambient-glow -top-24 left-1/2 h-[300px] w-[500px] -translate-x-1/2 bg-violet-600/30" />
          <div className="relative space-y-6">
            {/* Breathing waveform accent */}
            <div className="auth-waveform mx-auto justify-center">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} />
              ))}
            </div>
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-5xl">
              Your next deal starts with a <span className="gradient-text">conversation</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground sm:text-base">
              Put AI voice agents to work on your pipeline today. Set up in minutes — VoxCRM
              manages the telephony, the models, and the infrastructure.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row">
              <Link href="/auth/signup">
                <Button
                  size="lg"
                  className="h-12 gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/25 hover:bg-primary/90"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-xl border-white/15 glass-button px-8 text-sm font-semibold"
                >
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 glass-panel px-6 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <BrandLogo className="text-lg" />
            <span className="text-xs text-muted-foreground">
              © 2026 VoxCRM. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#" className="transition-colors hover:text-foreground">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Terms
            </a>
            <a href="#" className="transition-colors hover:text-foreground">
              Security
            </a>
            <Link
              href="/auth/login"
              className="font-semibold transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
