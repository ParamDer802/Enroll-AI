import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getRoster } from '../database/students';
import { createSession } from '../database/sessions';
import { Modal, Button, useToast } from './ui';
import { defaultRules } from '../database/rules';
import { SessionRulesFields } from './SessionRulesEditor';
export function CreateSessionModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (id: string) => void;
}) {
  const students = useLiveQuery(getRoster, []) || [],
    toast = useToast();
  const [name, setName] = useState(''),
    [rules, setRules] = useState(defaultRules),
    [department, setDepartment] = useState(''),
    [semester, setSemester] = useState(''),
    [batch, setBatch] = useState(String(new Date().getFullYear())),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState('');
  const filtered = students.filter((s) =>
    `${s.name} ${s.enrollmentNumber}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function create() {
    setBusy(true);
    try {
      const roster = students.filter((s) => selected.has(s.id));
      if (roster.some((s) => s.demo) && roster.some((s) => !s.demo))
        throw new Error('Keep demo students and real students in separate sessions.');
      const session = await createSession(
        { name, department, semester, batch, rules },
        roster.map((s) => s.id),
        roster.every((s) => s.demo),
      );
      toast('Session created');
      onDone(session.id);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Create a capture session" onClose={() => !busy && onClose()} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label>
          Session name
          <input
            required
            maxLength={120}
            placeholder="e.g. BCA Semester 5 — 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-grid three">
          <label>
            Department
            <input
              maxLength={100}
              placeholder="Computer Applications"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </label>
          <label>
            Semester
            <input
              maxLength={20}
              placeholder="5"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
          </label>
          <label>
            Batch
            <input maxLength={20} value={batch} onChange={(e) => setBatch(e.target.value)} />
          </label>
        </div>
        <SessionRulesFields value={rules} onChange={setRules} />
        <div className="section-title">
          <h3>Select students</h3>
          <span className="muted">{selected.size} selected</span>
        </div>
        <input
          aria-label="Search roster"
          placeholder="Search name or enrollment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="selection-actions">
          <Button variant="ghost" onClick={() => setSelected(new Set(filtered.map((s) => s.id)))}>
            Select all matching ({filtered.length})
          </Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
        <div className="student-picker">
          {filtered.slice(0, 200).map((s) => (
            <label className="checkbox-label" key={s.id}>
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={(e) =>
                  setSelected((old) => {
                    const next = new Set(old);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    return next;
                  })
                }
              />
              <span>
                {s.name}
                <small className="mono">
                  {s.enrollmentNumber}
                  {s.demo ? ' · DEMO DATA' : ''}
                  {s.generatedName ? ' · GENERATED NAME' : ''}
                </small>
              </span>
            </label>
          ))}
          {!students.length && (
            <p className="muted">Import a roster first, then create your session.</p>
          )}
        </div>
        {filtered.length > 200 && (
          <p className="hint">First 200 shown. Select all includes every matching student.</p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy} disabled={!selected.size || !name.trim()}>
            Create session
          </Button>
        </div>
      </form>
    </Modal>
  );
}
