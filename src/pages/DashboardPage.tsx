import {
  Users,
  CheckCircle2,
  Clock3,
  SkipForward,
  ArrowUpRight,
  ArrowRight,
  Upload,
  Plus,
  Camera,
  ShieldCheck,
  CircleHelp,
  ScanFace,
  AlertCircle,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { loadDemo } from '../database/sessions';
import { AIML_SESSION_ID } from '../database/starterRoster';
import {
  Button,
  Badge,
  Progress,
  Empty,
  PageHeading,
  useToast,
  displayDate,
} from '../components/ui';
export function DashboardPage({
  onImport,
  onCreate,
  onCapture,
  onNavigate,
}: {
  onImport: () => void;
  onCreate: () => void;
  onCapture: (id: string) => void;
  onNavigate: (page: string) => void;
}) {
  const data = useLiveQuery(
    async () => ({
      students: await db.students.count(),
      sessions: await db.sessions.orderBy('createdAt').reverse().toArray(),
      members: await db.sessionStudents.toArray(),
    }),
    [],
  );
  const toast = useToast();
  if (!data) return <p className="muted">Loading your workspace…</p>;
  const { students, sessions, members } = data,
    completed = members.filter((s) => s.status === 'Completed').length,
    pending = members.filter((s) => s.status === 'Pending').length,
    skipped = members.filter((s) => s.status === 'Skipped').length,
    failed = members.filter((s) => s.status === 'Failed').length;
  const active = sessions.find((s) => ['Active', 'Paused', 'Draft'].includes(s.status)),
    progress = members.length ? (completed / members.length) * 100 : 0;
  async function demo() {
    try {
      const s = await loadDemo();
      toast('Demo roster and session added — all results will come from your camera.');
      onCapture(s.id);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE, AT A GLANCE"
        title="A better picture starts here."
        description="From enrollment list to ready-to-use photos. All in one place."
      >
        <Button variant="secondary" onClick={onImport}>
          <Upload size={17} />
          Import students
        </Button>
        <Button onClick={onCreate}>
          <Plus size={18} />
          Create session
        </Button>
      </PageHeading>
      <section className="welcome-panel">
        <div>
          <Badge kind="soft">STUDENT PHOTO AUTOMATION</Badge>
          <h2>
            Less clicking.
            <br />
            More capturing.
          </h2>
          <p>
            Bring your roster. Set up your camera.
            <br />
            Let photo quality guide the perfect capture.
          </p>
          <Button onClick={() => (active ? onCapture(active.id) : onImport)}>
            {active ? 'Continue capture' : 'Get started'}
            <ArrowRight size={17} />
          </Button>
          <div className="hero-foot">
            <ShieldCheck size={15} /> On-device processing <span>·</span> No face recognition
          </div>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="scan-card back" />
          <div className="scan-card">
            <div className="scan-card-head">
              <span className="mini-logo">
                <ScanFace size={16} />
              </span>
              <span>ENROLL-AI</span>
              <span className="mini-dot" />
            </div>
            <div className="portrait-illustration">
              <svg viewBox="0 0 180 175">
                <path d="M35 170q0-57 55-57t55 57" fill="#b4c7ba" />
                <path d="M35 170q0-57 55-57t55 57" fill="none" stroke="#36594b" strokeWidth="2" />
                <ellipse
                  cx="90"
                  cy="68"
                  rx="36"
                  ry="45"
                  fill="#dce8d7"
                  stroke="#36594b"
                  strokeWidth="2"
                />
                <path d="M54 65q-6-49 38-49t34 52q-9-8-15-31-20 24-57 18" fill="#36594b" />
                <path d="M78 89q12 9 24 0" stroke="#36594b" strokeWidth="2" fill="none" />
                <path d="M73 68h5m24 0h5" stroke="#36594b" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="corner tl" />
              <span className="corner tr" />
              <span className="corner bl" />
              <span className="corner br" />
            </div>
            <div className="illustration-lines">
              <span />
              <span />
            </div>
          </div>
          <div className="floating-check">
            <CheckCircle2 size={22} />
            <div>
              Quality comes first<small>Automatic, when it’s ready</small>
            </div>
          </div>
          <span className="illustration-label">A simpler capture workflow</span>
        </div>
      </section>
      <div className="stat-grid">
        {[
          {
            label: 'Total students',
            value: students,
            icon: Users,
            hint: 'In your enrollment roster',
            className: '',
          },
          {
            label: 'Completed',
            value: completed,
            icon: CheckCircle2,
            hint: 'Photos saved & verified',
            className: 'green',
          },
          {
            label: 'Pending',
            value: pending,
            icon: Clock3,
            hint: 'Ready for their moment',
            className: 'amber',
          },
          {
            label: 'Needs attention',
            value: skipped + failed,
            icon: AlertCircle,
            hint: `${skipped} skipped · ${failed} failed`,
            className: 'rose',
          },
        ].map((s) => (
          <article className="stat-card" key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={19} className={s.className} />
            </div>
            <strong>{s.value.toLocaleString()}</strong>
            <small>{s.hint}</small>
          </article>
        ))}
      </div>
      {sessions.some((session) => session.id === AIML_SESSION_ID) && (
        <section className="cohort-panel">
          <div className="cohort-icon">
            <Users size={28} />
          </div>
          <div className="cohort-copy">
            <div className="eyebrow">YOUR CLASS ROSTER</div>
            <h2>
              AIML <span>· Semester 5</span>
            </h2>
            <p className="mono">24012250910001 – 24012250910079</p>
            <small>Generated names can be updated in Students.</small>
          </div>
          <div className="cohort-count">
            <strong>
              {members.filter((member) => member.sessionId === AIML_SESSION_ID).length}
            </strong>
            <span>enrolled students</span>
          </div>
          <Button variant="secondary" onClick={() => onNavigate('students')}>
            View roster
            <ArrowUpRight size={17} />
          </Button>
        </section>
      )}
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Capture sessions</h2>
              <p>Pick up right where you left off.</p>
            </div>
            <Button variant="ghost" onClick={() => onNavigate('sessions')}>
              View all
              <ArrowUpRight size={16} />
            </Button>
          </div>
          {sessions.length ? (
            <div className="session-list">
              {sessions.slice(0, 3).map((s) => {
                const rows = members.filter((r) => r.sessionId === s.id),
                  done = rows.filter((r) => r.status === 'Completed').length;
                return (
                  <div className="session-row" key={s.id}>
                    <span className="session-icon">
                      <Camera size={21} />
                    </span>
                    <div className="session-detail">
                      <div>
                        <strong>{s.name}</strong>
                        <Badge kind={s.status === 'Completed' ? 'success' : 'neutral'}>
                          {s.status}
                        </Badge>
                      </div>
                      <small>
                        {s.demo ? 'DEMO DATA · ' : ''}
                        {s.department || 'Capture session'} · {done} / {rows.length} photos
                      </small>
                      <Progress value={rows.length ? (done / rows.length) * 100 : 0} />
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Open ${s.name}`}
                      onClick={() => onCapture(s.id)}
                    >
                      <ArrowRight size={19} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Your first session is waiting"
              description="Import a student list and create a session to start capturing."
              action={
                <Button variant="secondary" onClick={onCreate}>
                  <Plus size={16} />
                  Create your first session
                </Button>
              }
            />
          )}
          <div className="panel-footer">
            <span>
              <span className="online-dot" /> Progress saves automatically
            </span>
            <span>Stored on this device</span>
          </div>
        </section>
        <aside className="panel getting-started">
          <div className="panel-heading">
            <div>
              <h2>Your capture checklist</h2>
              <p>Three steps. One smooth workflow.</p>
            </div>
          </div>
          {[
            {
              n: '01',
              title: 'Bring your student list',
              body: 'Import an Excel or CSV roster.',
              done: students > 0,
              action: onImport,
            },
            {
              n: '02',
              title: 'Set up a session',
              body: 'Choose the students to capture.',
              done: sessions.length > 0,
              action: onCreate,
            },
            {
              n: '03',
              title: 'Let the camera do its thing',
              body: 'Quality checked. Automatically saved.',
              done: completed > 0,
              action: () => (active ? onCapture(active.id) : onCreate()),
            },
          ].map((s) => (
            <button className="checklist-step" key={s.n} onClick={s.action}>
              <span className={s.done ? 'done' : ''}>
                {s.done ? <CheckCircle2 size={17} /> : s.n}
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.body}</small>
              </div>
            </button>
          ))}
          <div className="demo-callout">
            <CircleHelp size={19} />
            <div>
              <strong>Just exploring?</strong>
              <p>Try a clearly labeled 5-student demo.</p>
              <button onClick={() => void demo()}>
                Load demo roster
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="summary-strip">
        <span>
          <ShieldCheck size={19} />
          <strong>Your students. Your device. Your data.</strong>
        </span>
        <p>Photos stay here unless you export them.</p>
        <button onClick={() => onNavigate('privacy')}>
          Our privacy approach
          <ArrowUpRight size={16} />
        </button>
      </div>
      {members.length > 0 && (
        <div className="overall-progress">
          <span>
            Across all sessions · {completed} / {members.length} completed ({progress.toFixed(1)}%)
          </span>
          <Progress value={progress} />
        </div>
      )}
    </>
  );
}
