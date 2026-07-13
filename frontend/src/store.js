import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useStore = create(
  persist(
    (set, get) => ({
      target:  'server',
      version: '8.1.0',
      build:   null,

      setTarget:  (t) => set({ target: t, version: 'latest', build: null }),
      setVersion: (v) => set({ version: v, build: null }),
      setBuild:   (b) => set({ build: b }),

      enabledPlatforms:  [],
      enabledFeatures:   [],
      searchQuery:       '',
      testsFilter:       2000,
      buildsFilter:      10,

      togglePlatform: (p, allPlatforms) => set(s => {
        if (s.enabledPlatforms.length === 0) return { enabledPlatforms: [p] };
        if (s.enabledPlatforms.includes(p)) {
          const next = s.enabledPlatforms.filter(x => x !== p);
          return { enabledPlatforms: next.length === allPlatforms.length ? [] : next };
        }
        const next = [...s.enabledPlatforms, p];
        return { enabledPlatforms: next.length === allPlatforms.length ? [] : next };
      }),
      toggleFeature: (f, allFeatures) => set(s => {
        if (s.enabledFeatures.length === 0) return { enabledFeatures: [f] };
        if (s.enabledFeatures.includes(f)) {
          const next = s.enabledFeatures.filter(x => x !== f);
          return { enabledFeatures: next.length === allFeatures.length ? [] : next };
        }
        const next = [...s.enabledFeatures, f];
        return { enabledFeatures: next.length === allFeatures.length ? [] : next };
      }),
      setEnabledPlatforms:  (p) => set({ enabledPlatforms: p }),
      setEnabledFeatures:   (f) => set({ enabledFeatures: f }),
      setSearchQuery:       (q) => set({ searchQuery: q }),
      setTestsFilter:       (n) => set({ testsFilter: n }),
      setBuildsFilter:      (n) => set({ buildsFilter: n }),

      darkMode:      true,
      jobsPerPage:   50,
      activeTab:     'all',
      // read at store creation, before the router drops the ?stability= query string
      stabilityView: (() => {
        try {
          const v = new URLSearchParams(window.location.search).get('stability');
          return ['good', 'bad', 'all'].includes(v) ? v : 'good';
        } catch { return 'good'; }
      })(),

      toggleDark:    () => set(s => ({ darkMode: !s.darkMode })),
      setJobsPerPage:(n) => set({ jobsPerPage: n }),
      setActiveTab:  (t) => set({ activeTab: t }),
      setStabilityView: (v) => set({ stabilityView: v }),

      savedViews: [],
      saveView: (name) => {
        const s = get();
        const view = {
          id:        Date.now().toString(),
          name,
          target:    s.target,
          version:   s.version,
          build:     s.build,
          platforms: s.enabledPlatforms,
          features:  s.enabledFeatures,
          darkMode:  s.darkMode,
          createdAt: new Date().toISOString(),
        };
        set(s => ({ savedViews: [...s.savedViews, view] }));
        return view;
      },
      deleteView: (id) => set(s => ({ savedViews: s.savedViews.filter(v => v.id !== id) })),
      applyView: (view) => set({
        target:           view.target,
        version:          view.version,
        build:            view.build,
        enabledPlatforms: view.platforms || [],
        enabledFeatures:  view.features  || [],
        darkMode:         view.darkMode  ?? false,
      }),

      encodeView: () => {
        const s = get();
        return btoa(JSON.stringify({
          n: 'view', t: s.target, v: s.version, b: s.build,
          p: s.enabledPlatforms, f: s.enabledFeatures, d: s.darkMode,
        }));
      },
      decodeAndApplyView: (code) => {
        try {
          const v = JSON.parse(atob(code));
          get().applyView({ target: v.t, version: v.v, build: v.b, platforms: v.p, features: v.f, darkMode: v.d });
          return true;
        } catch { return false; }
      },
    }),
    {
      name: 'greenboard-v2',
      partialize: s => ({
        darkMode:    s.darkMode,
        savedViews:  s.savedViews,
        jobsPerPage: s.jobsPerPage,
        testsFilter: s.testsFilter,
        buildsFilter:s.buildsFilter,
      }),
    }
  )
);

export function filterJobs(jobs, store) {
  let list = jobs || [];
  const { enabledPlatforms, enabledFeatures, searchQuery, activeTab } = store;

  if (enabledPlatforms.length)
    list = list.filter(j => enabledPlatforms.includes(j.os));
  if (enabledFeatures.length)
    list = list.filter(j => enabledFeatures.includes(j.component));

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(j =>
      (j.displayName || j.name || '').toLowerCase().includes(q) ||
      (j.claim || '').toLowerCase().includes(q) ||
      (j.bugs || []).join(' ').toLowerCase().includes(q) ||
      (j.triage || '').toLowerCase().includes(q)
    );
  }

  if (activeTab !== 'all') {
    const tabMap = {
      success:   j => j.result === 'SUCCESS',
      failure:   j => j.result === 'FAILURE',
      unstable:  j => j.result === 'UNSTABLE',
      aborted:   j => j.result === 'ABORTED',
      pending:   j => j.result === 'PENDING',
      inst_fail: j => j.result === 'INST_FAIL',
      skipped:   j => (j.skipCount || 0) > 0,
    };
    if (tabMap[activeTab]) list = list.filter(tabMap[activeTab]);
  }

  return list;
}
