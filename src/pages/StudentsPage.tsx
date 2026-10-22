import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Upload, Users, ArrowUpDown, Pencil } from 'lucide-react';
import type { Student } from '../types';
import { EditStudentModal } from '../components/EditStudentModal';
import { db } from '../database/db';
import { PageHeading, Button, Badge, Empty } from '../components/ui';
export function StudentsPage({ onImport }: { onImport: () => void }) {
  const data = useLiveQuery(
    async () => ({
      students: await db.students.toArray(),
      members: await db.sessionStudents.toArray(),
      sessions: await db.sessions.toArray(),
    }),
    [],
  );
  const [query, setQuery] = useState(''),
    [editing, setEditing] = useState<Student | null>(null),
    [status, setStatus] = useState('All'),
    [session, setSession] = useState('All'),
    [page, setPage] = useState(0),
    [sort, setSort] = useState<'name' | 'enrollmentNumber'>('enrollmentNumber');
  if (!data) return <p>Loading students…</p>;
  const rows = data.students
    .map((s) => {
      const memberships = data.members.filter(
        (m) => m.studentId === s.id && (session === 'All' || m.sessionId === session),
      );
      const status = memberships.some((m) => m.status === 'Pending')
        ? 'Pending'
        : memberships.some((m) => m.status === 'Failed')
          ? 'Failed'
          : memberships.some((m) => m.status === 'Skipped')
            ? 'Skipped'
            : memberships.length
              ? 'Completed'
              : 'Unassigned';
      return { ...s, status, memberships };
    })
    .filter(
      (s) =>
        (session === 'All' || s.memberships.length) &&
        `${s.name} ${s.enrollmentNumber}`.toLowerCase().includes(query.toLowerCase()) &&
        (status === 'All' || s.status === status),
    )
    .sort((a, b) => a[sort].localeCompare(b[sort], undefined, { numeric: true }));
  const lastPage = Math.max(0, Math.ceil(rows.length / 25) - 1),
    current = Math.min(page, lastPage);
  return (
    <>
      <PageHeading
        eyebrow="ENROLLMENT ROSTER"
        title="Students"
        description="The source of truth for every name, enrollment and photograph."
      >
        <Button onClick={onImport}>
          <Upload size={17} />
          Import students
        </Button>
      </PageHeading>
      {data.students.some((student) => student.generatedName) && (
        <div className="roster-notice">
          <Users size={20} />
          <div>
            <strong>Your AIML roster is ready</strong>
            <p>
              Semester 5 · Enrollment 24012250910001–24012250910079. Generated names are
              placeholders; use the pencil to confirm each student’s name.
            </p>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="search-field">
            <Search size={18} />
            <input
              aria-label="Search students"
              placeholder="Search by name or enrollment…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <select
            aria-label="Filter by session"
            value={session}
            onChange={(e) => {
              setSession(e.target.value);
              setPage(0);
            }}
          >
            <option value="All">All sessions</option>
            {data.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            {['All', 'Pending', 'Completed', 'Skipped', 'Failed', 'Unassigned'].map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        </div>
        {data.students.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button onClick={() => setSort('enrollmentNumber')}>
                        Enrollment
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th>
                      <button onClick={() => setSort('name')}>
                        Student name
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th>Status</th>
                    <th>Branch / Sem</th>
                    <th>Sessions</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(current * 25, current * 25 + 25).map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.enrollmentNumber}</td>
                      <td>
                        <div className="student-cell">
                          <span className="avatar">
                            {s.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}
                          </span>
                          <span>
                            {s.name}
                            {s.demo && <small>DEMO DATA</small>}
                            {s.generatedName && <small>GENERATED NAME</small>}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Badge
                          kind={
                            s.status === 'Completed'
                              ? 'success'
                              : s.status === 'Failed'
                                ? 'danger'
                                : s.status === 'Skipped'
                                  ? 'warning'
                                  : 'neutral'
                          }
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td>{s.branch ? `${s.branch} · Sem ${s.semester || '—'}` : '—'}</td>
                      <td>{s.memberships.length}</td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Edit name for ${s.enrollmentNumber}`}
                          onClick={() => setEditing(s)}
                        >
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={6}>No students match these filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {rows.length.toLocaleString()} students · Page {current + 1} of {lastPage + 1}
              </span>
              <div>
                <Button
                  variant="secondary"
                  disabled={current === 0}
                  onClick={() => setPage(current - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={current >= lastPage}
                  onClick={() => setPage(current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            title="A place for every student"
            description="Import your first roster to see students here."
            action={
              <Button onClick={onImport}>
                <Users size={17} />
                Import your roster
              </Button>
            }
          />
        )}
      </section>
      <p className="hint">
        Across sessions, the status shown prioritizes pending, failed and skipped work. Filter to a
        session for its exact status.
      </p>
      {editing && <EditStudentModal student={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
