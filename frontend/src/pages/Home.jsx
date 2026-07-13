import React from 'react';
import { Rocket, PlayCircle, ExternalLink, Wrench, Activity } from 'lucide-react';
import Sidebar from '../components/Layout/Sidebar';
import JiraInsights from '../components/Dashboard/JiraInsights';
import ReadinessCards from '../components/Dashboard/ReadinessCards';

const QUICK_LINKS = [
  {
    key: 'dispatcher',
    title: 'Test Suite Dispatcher',
    desc: 'Kick off and queue test suites across the executor fleet.',
    icon: Rocket,
    accent: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    links: [
      { label: 'qa.sc',       url: 'http://qa.sc.couchbase.com/job/test_suite_dispatcher/' },
      { label: 'qe-jenkins1', url: 'http://qe-jenkins1.sc.couchbase.com/job/test_suite_dispatcher/' },
    ],
  },
  {
    key: 'executor',
    title: 'Test Suite Executor',
    desc: 'Inspect and run individual test-suite executions.',
    icon: PlayCircle,
    accent: 'linear-gradient(135deg, #10b981, #06b6d4)',
    links: [
      { label: 'qa.sc',       url: 'http://qa.sc.couchbase.com/job/test_suite_executor/' },
      { label: 'qe-jenkins1', url: 'http://qe-jenkins1.sc.couchbase.com/job/test_suite_executor/' },
    ],
  },
];


function QuickCard({ title, desc, icon: Icon, accent, links }) {
  return (
    <div className="card p-5 flex flex-col transition-transform hover:-translate-y-0.5">
      <div className="flex items-start gap-3.5">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accent, boxShadow: '0 6px 18px -6px rgba(99,102,241,0.5)' }}
        >
          <Icon size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 leading-tight">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.06]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Open in</p>
        <div className="flex gap-2">
          {links.map(l => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost flex-1 justify-center border border-gray-200 dark:border-white/10 font-mono text-xs"
            >
              {l.label}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}


export default function Home() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-12">
          <div className="mb-10">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Jump straight to the tools you use most — pick a target on the left to open its board.
            </p>
          </div>

          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={15} className="text-brand-500" />
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                Release Readiness · Server
              </h2>
            </div>
            <ReadinessCards />
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <Wrench size={15} className="text-brand-500" />
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                Quick Access · Jenkins
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {QUICK_LINKS.map(card => <QuickCard key={card.key} {...card} />)}
            </div>
          </section>

          <section className="mt-10">
            <JiraInsights />
          </section>
        </div>
      </main>
    </div>
  );
}
