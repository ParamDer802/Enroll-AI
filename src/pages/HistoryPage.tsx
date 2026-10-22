import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Search, Camera } from 'lucide-react';
import { db } from '../database/db';
import { getCaptureMetadata } from '../database/captures';
import { download } from '../services/export/exportService';
import {
  PageHeading,
  Button,
  Badge,
  Empty,
  Photo,
  Modal,
  displayDate,
  useToast,
} from '../components/ui';
import type { CaptureRecord } from '../types';
export function HistoryPage({
  onRetake,
}: {
  onRetake: (sessionId: string, studentId: string) => void;
}) {
  const [session, setSession] = useState('All'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [preview, setPreview] = useState<CaptureRecord | null>(null),
    [audit, setAudit] = useState(false);
  const data = useLiveQuery(
    async () => ({
      captures: await getCaptureMetadata(),
      students: await db.students.toArray(),
      sessions: await db.sessions.toArray(),
      members: await db.sessionStudents.toArray(),
      logs: await db.logs.orderBy('timestamp').reverse().limit(100).toArray(),
    }),
    [],
  );
  const names = new Map(data?.students.map((s) => [s.id, s.name])),
    rows = (data?.captures || [])
      .filter(
        (c) =>
          (session === 'All' || c.sessionId === session) &&
          `${c.enrollmentNumber} ${names.get(c.studentId)}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const last = Math.max(0, Math.ceil(rows.length / 20) - 1),
    current = Math.min(page, last);
  const toast = useToast();
  async function openPhoto(id: string, save = false) {
    try {
      const record = await db.captures.get(id);
      if (!record) throw new Error('This photo is no longer available.');
      if (save) download(record.imageBlob, record.filename);
      else setPreview(record);
    } catch (error) {
      toast((error as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="SAVED & VERIFIED"
        title="Capture history"
        description="Inspect saved photos, download a portrait or arrange a retake."
      >
        <Button variant="secondary" onClick={() => setAudit(!audit)}>
          {audit ? 'Show photos' : 'View activity log'}
        </Button>
      </PageHeading>
      <section className="panel">
        {audit ? (
          <div className="activity-list">
            {data?.logs.length ? (
              data.logs.map((l) => (
                <div key={l.id}>
                  <Badge>{l.event.replaceAll('_', ' ')}</Badge>
                  <p>{l.message}</p>
                  <small>{displayDate(l.timestamp)}</small>
                </div>
              ))
            ) : (
              <Empty
                title="No activity yet"
                description="Import and capture events will appear here."
              />
            )}
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search captures"
                  placeholder="Search name or enrollment…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <select
                aria-label="History session"
                value={session}
                onChange={(e) => {
                  setSession(e.target.value);
                  setPage(0);
                }}
              >
                <option>All</option>
                {data?.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            {rows.length ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Filename</th>
                        <th>Captured</th>
                        <th>Quality</th>
                        <th>Attempts</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(current * 20, current * 20 + 20).map((c) => (
                        <tr key={c.id}>
                          <td>
                            <button
                              className="student-cell photo-button"
                              onClick={() => void openPhoto(c.id)}
                            >
                              <StoredThumbnail id={c.id} />
                              <span>
                                {names.get(c.studentId)}
                                <small className="mono">{c.enrollmentNumber}</small>
                              </span>
                            </button>
                          </td>
                          <td className="mono">{c.filename}</td>
                          <td>{displayDate(c.capturedAt)}</td>
                          <td>
                            <Badge kind={c.manual ? 'warning' : 'success'}>
                              {c.manual
                                ? 'Manual override'
                                : c.quality?.ready
                                  ? 'Checks passed'
                                  : 'Not evaluated'}
                            </Badge>
                          </td>
                          <td>
                            {data?.members.find(
                              (m) => m.sessionId === c.sessionId && m.studentId === c.studentId,
                            )?.attempts || 1}
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`Download ${c.filename}`}
                              onClick={() => void openPhoto(c.id, true)}
                            >
                              <Download size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <span>{rows.length} saved photos</span>
                  <div>
                    <Button
                      variant="secondary"
                      disabled={!current}
                      onClick={() => setPage(current - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={current >= last}
                      onClick={() => setPage(current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <Empty
                title="Your captures will appear here"
                description="Every saved photograph stays linked to its enrollment and session."
              />
            )}
          </>
        )}
      </section>
      {preview && (
        <Modal title="Saved photograph" onClose={() => setPreview(null)}>
          <Photo blob={preview.imageBlob} className="preview-photo" />
          <h3>{names.get(preview.studentId)}</h3>
          <p className="mono">{preview.filename}</p>
          <p className="muted">
            {displayDate(preview.capturedAt)} ·{' '}
            {preview.manual
              ? 'Manual override'
              : preview.quality?.ready
                ? 'All quality checks passed'
                : 'Quality not evaluated'}
          </p>
          <p className="hint">
            Session rules:{' '}
            {!preview.ruleReview
              ? 'Not recorded for this older photo.'
              : preview.ruleReview.method === 'operator' && preview.ruleReview.confirmedAt
                ? `Confirmed by operator on ${displayDate(preview.ruleReview.confirmedAt)} (revision ${preview.ruleReview.revision}).`
                : 'No additional rules were set at capture.'}
          </p>
          {preview.ruleReview?.rules.requireSheet && (
            <p className="hint">
              Sheet required: below the face, held with both hands, face uncovered.
            </p>
          )}
          {preview.ruleReview?.rules.instructions && (
            <p className="hint">{preview.ruleReview.rules.instructions}</p>
          )}
          {preview.quality && (
            <p className="hint">
              Sharpness {Math.round(preview.quality.sharpness)} · Brightness{' '}
              {Math.round(preview.quality.brightness)} · Stable for{' '}
              {(preview.quality.stabilityMs / 1000).toFixed(1)}s
            </p>
          )}
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                if (window.confirm('Replace this student’s saved photo with a new capture?'))
                  onRetake(preview.sessionId, preview.studentId);
              }}
            >
              <Camera size={17} />
              Retake
            </Button>
            <Button onClick={() => download(preview.imageBlob, preview.filename)}>
              <Download size={17} />
              Download photo
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function StoredThumbnail({ id }: { id: string }) {
  const record = useLiveQuery(() => db.captures.get(id), [id]);
  return record ? (
    <Photo blob={record.imageBlob} className="photo-thumb" />
  ) : (
    <span className="photo-thumb" />
  );
}
