import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function jobKey(j) {
  return `${j.os}|${j.component}|${j.name}|${j.build_id}`;
}

function applyPatch(old, patch) {
  if (!Array.isArray(old)) return old;
  const map = new Map(old.map(j => [jobKey(j), j]));
  for (const k of patch.removes || []) map.delete(k);
  for (const j of patch.upserts || []) map.set(jobKey(j), j);
  return [...map.values()];
}

export function useLiveJobs(build, target, onChangedKeys) {
  const qc = useQueryClient();
  const cbRef = useRef(onChangedKeys);
  cbRef.current = onChangedKeys;

  useEffect(() => {
    if (!build || !target) return;

    const es = new EventSource(`/api/stream/${build}/${target}`);

    es.addEventListener('patch', (e) => {
      try {
        const patch = JSON.parse(e.data);
        qc.setQueryData(['jobs', build, target], (old) => applyPatch(old, patch));
        const changed = new Set([
          ...(patch.upserts || []).map(jobKey),
          ...(patch.removes || []),
        ]);
        if (changed.size) cbRef.current?.(changed);
      } catch (_) {}
    });

    es.addEventListener('resync', () => {
      qc.invalidateQueries({ queryKey: ['jobs', build, target] });
    });

    es.addEventListener('builds-changed', () => {
      qc.invalidateQueries({ queryKey: ['builds'] });
    });

    return () => es.close();
  }, [build, target, qc]);
}
