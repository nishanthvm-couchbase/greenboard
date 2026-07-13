import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../api';
import { useStore } from '../store';
import { useLiveJobs } from '../hooks/useLiveJobs';

import Sidebar        from '../components/Layout/Sidebar';
import TopBar         from '../components/Layout/TopBar';
import BuildTimeline  from '../components/Dashboard/BuildTimeline';
import JobsTable      from '../components/Dashboard/JobsTable';
import FilterPanel    from '../components/Dashboard/FilterPanel';
import InsightPanel   from '../components/Dashboard/InsightPanel';
import RunsModal      from '../components/Modals/RunsModal';
import TrendModal     from '../components/Modals/TrendModal';
import AIReportModal  from '../components/Modals/AIReportModal';
import AnalysisModal  from '../components/Modals/AnalysisModal';
import ViewsModal     from '../components/Modals/ViewsModal';

const matchesSearch = (j, q) =>
  (j.displayName || j.name || '').toLowerCase().includes(q) ||
  (j.component || '').toLowerCase().includes(q) ||
  (j.os || '').toLowerCase().includes(q);

export default function Dashboard() {
  const { target: pTarget, version: pVersion, build: pBuild } = useParams();
  const nav = useNavigate();

  const {
    target, version, build,
    setTarget, setVersion, setBuild,
    enabledPlatforms, enabledFeatures,
    testsFilter, buildsFilter,
    stabilityView,
    searchQuery,
  } = useStore();

  useEffect(() => { if (pTarget  && pTarget  !== target)  setTarget(pTarget);  }, [pTarget]);
  useEffect(() => { if (pVersion && pVersion !== version) setVersion(pVersion); }, [pVersion]);
  useEffect(() => {
    if (!pBuild) return;
    const full = (pVersion && !pBuild.startsWith(pVersion + '-')) ? `${pVersion}-${pBuild}` : pBuild;
    if (full !== build) setBuild(full);
  }, [pBuild, pVersion]);

  useEffect(() => {
    const t = target, v = version || 'latest', b = build;
    const shortB = (b && v && b.startsWith(v + '-')) ? b.slice(v.length + 1) : b;
    const path = shortB ? `/${t}/${v}/${shortB}` : `/${t}/${v}`;
    if (window.location.pathname !== path) nav(path, { replace: true });
  }, [target, version, build]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('view');
    if (code) useStore.getState().decodeAndApplyView(code);
    const st = params.get('stability');
    if (['good', 'bad', 'all'].includes(st)) useStore.getState().setStabilityView(st);
  }, []);

  const { data: builds = [], isLoading: buildsLoading } = useQuery({
    queryKey: ['builds', target, version, buildsFilter],
    queryFn:  () => api.getBuilds(target, version || '8.1.0', buildsFilter,
                                  { platforms: enabledPlatforms, features: enabledFeatures }),
    enabled:  !!(target && version),
    staleTime: 60_000,
  });

  const { data: dfltBuild } = useQuery({
    queryKey: ['defaultbuild', target, version],
    queryFn:  () => api.getDefaultBuild(target, version || '8.1.0'),
    enabled:  !!(target && version),
    refetchInterval: (q) => (q.state.data?.ready ? false : 600),
    staleTime: 0,
  });
  const pickedRef = useRef(false);
  useEffect(() => { pickedRef.current = false; }, [version, target]);
  useEffect(() => {
    if (pickedRef.current || builds.length === 0 || build) return;
    if (dfltBuild?.ready) {
      const hint = dfltBuild.build && builds.some(b => b.build === dfltBuild.build) ? dfltBuild.build : builds[0].build;
      setBuild(hint);
      pickedRef.current = true;
    }
  }, [builds, dfltBuild, build]);
  useEffect(() => {
    if (builds.length === 0 || build || pickedRef.current) return;
    const t = setTimeout(() => {
      if (!pickedRef.current && !build) { setBuild(builds[0].build); pickedRef.current = true; }
    }, 2500);
    return () => clearTimeout(t);
  }, [builds, build]);

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', build, target],
    queryFn:  () => api.getJobs(build, target),
    enabled:  !!(build && target),
  });

  const { data: stability } = useQuery({
    queryKey: ['stability', target, version],
    queryFn:  () => api.getStability(target, version || '8.1.0'),
    enabled:  !!(target && version),
    refetchInterval: (q) => (q.state.data?.ready ? 120_000 : 5000),
    staleTime: 0,
  });
  const stabilityReady = !!stability?.ready;
  const badSet = useMemo(() => {
    const s = new Set();
    (stability?.badKeys || []).forEach(k => s.add(`${k.os}|${k.component}|${k.name}`));
    return s;
  }, [stability]);
  const isBad = (j) => badSet.has(`${j.os}|${j.component}|${j.name}`);

  const [changedKeys, setChangedKeys] = useState(() => new Set());
  const pulseTimer = useRef(null);
  useLiveJobs(build, target, (keys) => {
    setChangedKeys(keys);
    clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setChangedKeys(new Set()), 2500);
  });

  const claimMut = useMutation({
    mutationFn: ({ job, type, claim }) =>
      api.saveClaim(target, job.name, job.build_id, { type, claim, os: job.os, comp: job.component, build: job.build }),
  });

  const rerunMut = useMutation({
    mutationFn: (job) => api.rerunJob({ jobUrl: `${job.url}${job.build_id}` }),
  });

  const [runsJob,      setRunsJob]     = useState(null);
  const [trendJob,     setTrendJob]    = useState(null);
  const [analysisJob,  setAnalysisJob] = useState(null);
  const [aiVersion,    setAiVersion]   = useState(null);
  const [aiComponent,  setAiComponent] = useState(null);
  const [viewsMode,    setViewsMode]   = useState(null);

  const handleClaim = async (job, type, claim) => {
    await claimMut.mutateAsync({ job, type, claim });
  };

  const handleRerun = (job) => {
    if (window.confirm(`Rerun ${job.displayName || job.name}?`)) {
      rerunMut.mutate(job);
    }
  };

  const openAIReport = (component, ver) => {
    setAiVersion(ver || build || null);
    setAiComponent(component);
  };

  const liveJobs = useMemo(
    () => jobs.filter(j => !j.olderBuild && !j.deleted),
    [jobs]
  );

  const stableJobs = useMemo(() => {
    if (!stabilityReady || stabilityView === 'all') return liveJobs;
    return stabilityView === 'bad' ? liveJobs.filter(isBad) : liveJobs.filter(j => !isBad(j));
  }, [liveJobs, stabilityView, stabilityReady, badSet]);

  const filteredJobs = useMemo(() => {
    let list = stableJobs;
    if (enabledPlatforms.length) list = list.filter(j => enabledPlatforms.includes(j.os));
    if (enabledFeatures.length)  list = list.filter(j => enabledFeatures.includes(j.component));
    return list;
  }, [stableJobs, enabledPlatforms, enabledFeatures]);

  const q = (searchQuery || '').toLowerCase().trim();
  const searchedStable   = useMemo(() => q ? stableJobs.filter(j => matchesSearch(j, q))   : stableJobs,
                                    [stableJobs, q]);
  const searchedFiltered = useMemo(() => q ? filteredJobs.filter(j => matchesSearch(j, q)) : filteredJobs,
                                    [filteredJobs, q]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        onSaveView={()  => setViewsMode('save')}
        onShareView={()  => setViewsMode('share')}
        onImportView={()  => setViewsMode('import')}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar builds={builds} />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <FilterPanel jobs={searchedStable} build={build} onOpenAIReport={openAIReport} />

          <main className="flex-1 overflow-y-auto p-5 space-y-4 min-w-0">
            <InsightPanel jobs={searchedFiltered} />

            <BuildTimeline
              builds={builds}
              loading={buildsLoading}
              activeJobStats={stableJobs.length > 0 ? {
                build,
                totalCount: stableJobs.reduce((s, j) => s + (j.totalCount || 0), 0),
                failCount:  stableJobs.reduce((s, j) => s + (j.failCount  || 0), 0),
              } : null}
            />

            <JobsTable
              jobs={searchedFiltered}
              loading={jobsLoading}
              target={target}
              changedKeys={changedKeys}
              onOpenRuns={setRunsJob}
              onOpenTrend={setTrendJob}
              onOpenAIReport={openAIReport}
              onOpenTestAnalysis={setAnalysisJob}
              onClaim={handleClaim}
              onRerun={handleRerun}
            />
          </main>
        </div>
      </div>

      {runsJob     && <RunsModal     job={runsJob}  target={target} onClose={() => setRunsJob(null)} />}
      {trendJob    && <TrendModal    job={trendJob}                 onClose={() => setTrendJob(null)} />}
      {analysisJob && <AnalysisModal job={analysisJob}              onClose={() => setAnalysisJob(null)} />}
      {aiComponent && (
        <AIReportModal build={aiVersion} component={aiComponent} onClose={() => { setAiVersion(null); setAiComponent(null); }} />
      )}
      {viewsMode  && <ViewsModal   mode={viewsMode}               onClose={() => setViewsMode(null)} />}
    </div>
  );
}
