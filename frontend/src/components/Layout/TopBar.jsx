import React from 'react';
import { useStore } from '../../store';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import Dropdown from '../Common/Dropdown';

export default function TopBar({ builds = [] }) {
  const {
    target, version, build,
    setVersion, setBuild,
    testsFilter, setTestsFilter,
    buildsFilter, setBuildsFilter,
  } = useStore();

  const { data: versions = [], isLoading: vLoading } = useQuery({
    queryKey: ['versions', target],
    queryFn: () => api.getVersions(target),
    enabled: !!target,
  });

  return (
    <header
      className="relative z-40 flex items-center gap-3 px-6 py-3 flex-wrap
                 bg-white/85 border-b border-gray-200/80
                 dark:bg-white/[0.02] dark:border-white/[0.06]"
      style={{ backdropFilter: 'blur(18px)' }}
    >
      <Dropdown
        value={version}
        onChange={setVersion}
        options={versions.map(v => ({ value: v, label: v }))}
        placeholder="Version"
        loading={vLoading}
      />

      <Dropdown
        value={build || ''}
        onChange={setBuild}
        options={builds.map(b => ({ value: b.build, label: b.build }))}
        placeholder={builds.length ? 'Build' : 'No builds'}
      />

      <Dropdown
        value={String(testsFilter)}
        onChange={v => setTestsFilter(Number(v))}
        options={[
          { value: '0',    label: 'All tests' },
          { value: '2000', label: '≥ 2000 tests' },
          { value: '5000', label: '≥ 5000 tests' },
        ]}
        placeholder="Tests filter"
      />

      <Dropdown
        value={String(buildsFilter)}
        onChange={v => setBuildsFilter(Number(v))}
        options={[
          { value: '5',   label: 'Last 5 builds' },
          { value: '10',  label: 'Last 10 builds' },
          { value: '25',  label: 'Last 25 builds' },
          { value: '100', label: 'Last 100 builds' },
        ]}
        placeholder="Builds"
      />
    </header>
  );
}
