import { useCallback, useEffect, useState } from 'react';
import { readThumbnail } from '../engine/fileFormat';
import { listRecent } from '../state/actions';
import { setApp } from '../state/store';
import { isNative, listProjects, storageLabel, type DeviceProject } from '../platform/native';
import { Modal } from './ui';
import ProjectFinder, { type RecentProjectItem } from './ProjectFinder';

export default function MyIllustrationsDialog() {
  const [recent, setRecent] = useState<RecentProjectItem[]>([]);
  const [device, setDevice] = useState<DeviceProject[]>([]);
  const [storage, setStorage] = useState(storageLabel());
  const [loading, setLoading] = useState(true);
  const native = isNative();

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [saved, projects] = await Promise.all([
        listRecent(),
        native ? listProjects() : Promise.resolve([] as DeviceProject[]),
      ]);
      setRecent(saved.map((x) => ({
        key: x.key,
        name: x.value.name,
        savedAt: x.value.savedAt,
        size: x.value.size,
        w: x.value.w,
        h: x.value.h,
        thumb: readThumbnail(x.value.bytes),
      })));
      setDevice(projects);
      setStorage(storageLabel());
    } finally {
      setLoading(false);
    }
  }, [native]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <Modal title="My Illustrations" onClose={() => setApp({ dialog: null })} width={900}>
      <div className="space-y-4">
        <p className="text-[11px] leading-relaxed text-neutral-500">
          Open a project or go directly to its Drawing Replay and recording controls. Browser-local recents and Android device files are listed separately; this is not a Windows filesystem scan.
        </p>
        {loading && !recent.length && !device.length && <p role="status" className="text-xs text-neutral-500">Loading local projects…</p>}
        <ProjectFinder
          recent={recent}
          device={device}
          native={native}
          storage={storage}
          reload={() => { void reload(); }}
          onProjectOpen={() => setApp({ dialog: null })}
        />
        {!loading && !recent.length && !device.length && (
          <p className="text-[10px] text-neutral-600">No projects are currently listed. Use File → Open to choose a .carbon file from another location.</p>
        )}
      </div>
    </Modal>
  );
}
