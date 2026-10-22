import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive,
  FileSpreadsheet,
  FileText,
  FolderDown,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { db } from '../database/db';
import { getCaptureMetadata } from '../database/captures';
import { exportReport, exportZip, exportFolder } from '../services/export/exportService';
import { PageHeading, Button, Progress, useToast } from '../components/ui';
export function ExportPage() {
  const data = useLiveQuery(
      async () => ({
        sessions: await db.sessions.toArray(),
        captures: await getCaptureMetadata(),
      }),
      [],
    ),
    [session, setSession] = useState(''),
    [busy, setBusy] = useState(''),
    [progress, setProgress] = useState(0),
    toast = useToast();
  const selected = session || data?.sessions[0]?.id || '',
    count = data?.captures.filter((c) => c.sessionId === selected).length || 0;
  async function run(type: string) {
    setBusy(type);
    setProgress(0);
    try {
      if (type === 'zip') await exportZip(selected, setProgress);
      else if (type === 'folder') {
        const n = await exportFolder(selected);
        toast(`${n} photos exported to a new folder`);
      } else await exportReport(selected, type as 'xlsx' | 'csv');
      if (type !== 'folder') toast('Your download is ready');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast((e as Error).message, true);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="READY FOR THE NEXT STEP"
        title="Export your results"
        description="Enrollment-named photos and clear reports, ready to use anywhere."
      />
      <section className="panel export-selection">
        <div>
          <h2>Choose a session</h2>
          <p className="muted">Your original records and photos stay safely on this device.</p>
        </div>
        <select
          aria-label="Export session"
          value={selected}
          onChange={(e) => setSession(e.target.value)}
          disabled={!!busy}
        >
          <option value="" disabled>
            Select session
          </option>
          {data?.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <BadgeCount count={count} />
      </section>
      <div className="export-grid">
        {[
          {
            id: 'zip',
            title: 'Photo archive',
            icon: Archive,
            description:
              'All captured JPEGs, named by enrollment number, with a CSV report in one ZIP.',
            label: 'Download ZIP',
            tag: '.ZIP',
          },
          {
            id: 'xlsx',
            title: 'Excel report',
            icon: FileSpreadsheet,
            description:
              'Student status, filenames, timestamps, quality results and capture attempts.',
            label: 'Export Excel',
            tag: '.XLSX',
          },
          {
            id: 'csv',
            title: 'CSV report',
            icon: FileText,
            description:
              'A portable capture report for student systems and spreadsheet applications.',
            label: 'Export CSV',
            tag: '.CSV',
          },
          {
            id: 'folder',
            title: 'Save to a folder',
            icon: FolderDown,
            description:
              'Write photographs to a new folder on your computer. Available in supported browsers.',
            label: 'Choose folder',
            tag: 'LOCAL',
          },
        ].map((c) => (
          <section className="panel export-card" key={c.id}>
            <div>
              <span className="export-icon">
                <c.icon size={27} />
              </span>
              <span className="file-tag">{c.tag}</span>
            </div>
            <h2>{c.title}</h2>
            <p>{c.description}</p>
            <Button
              variant={c.id === 'zip' ? 'primary' : 'secondary'}
              busy={busy === c.id}
              disabled={
                !selected ||
                !!busy ||
                ((c.id === 'zip' || c.id === 'folder') && !count) ||
                (c.id === 'folder' && !('showDirectoryPicker' in window))
              }
              onClick={() => void run(c.id)}
            >
              <Download size={17} />
              {c.label}
            </Button>
          </section>
        ))}
      </div>
      {busy === 'zip' && (
        <div className="panel export-progress">
          <p role="status">Preparing archive… {Math.round(progress)}%</p>
          <Progress value={progress} />
        </div>
      )}
      <div className="info-banner">
        <ShieldCheck size={22} />
        <p>
          Export only to destinations your institution approves. ENROLL-AI never uploads student
          photos automatically.
        </p>
      </div>
    </>
  );
}
function BadgeCount({ count }: { count: number }) {
  return <span className="badge success">{count} saved photos</span>;
}
