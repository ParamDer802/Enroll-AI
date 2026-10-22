import { useMemo, useState } from 'react';
import { FileSpreadsheet, Upload, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../database/db';
import { readRoster, validateRows, importRows } from '../services/import/importService';
import { Modal, Button, Badge, useToast } from './ui';
export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast(),
    students = useLiveQuery(() => db.students.toArray(), []) || [];
  const [data, setData] = useState<Awaited<ReturnType<typeof readRoster>> | null>(null),
    [filename, setFilename] = useState(''),
    [enrollment, setEnrollment] = useState(0),
    [name, setName] = useState(1),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const preview = useMemo(
    () => (data ? validateRows(data.rows, enrollment, name, students) : []),
    [data, enrollment, name, students],
  );
  const valid = preview.filter((r) => r.status === 'Valid').length;
  async function read(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setData(null);
    setFilename(file.name);
    setConfirmed(false);
    try {
      const parsed = await readRoster(file);
      setData(parsed);
      setFilename(file.name);
      setEnrollment(
        Math.max(
          0,
          parsed.headers.findIndex((h) => /enroll|roll|student.?id/i.test(h)),
        ),
      );
      setName(
        Math.max(
          0,
          parsed.headers.findIndex((h) => /name/i.test(h)),
        ),
      );
      setConfirmed(false);
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      await importRows(preview);
      toast(`${valid} students imported successfully`);
      onDone();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Import students" onClose={() => !busy && onClose()} wide>
      <p className="muted">Bring your enrollment list. We’ll check every row before saving.</p>
      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void read(e.dataTransfer.files[0]);
        }}
      >
        <Upload size={28} />
        <strong>{filename || 'Drop your spreadsheet here'}</strong>
        <span>or click to browse · XLSX, XLS, CSV · up to 15 MB</span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => void read(e.target.files?.[0])}
          disabled={busy}
        />
      </label>
      {data && (
        <>
          <div className="form-grid">
            <label>
              Enrollment column
              <select
                value={enrollment}
                onChange={(e) => {
                  setEnrollment(+e.target.value);
                  setConfirmed(false);
                }}
              >
                {data.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Student name column
              <select
                value={name}
                onChange={(e) => {
                  setName(+e.target.value);
                  setConfirmed(false);
                }}
              >
                {data.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint">
            Reads the first worksheet ({data.sheets[0]}). Format enrollment cells as text to
            preserve leading zeros. Zeros already lost in a numeric source cannot be recovered.
          </p>
          <div className="import-counts">
            <span>
              <strong>{preview.length}</strong> Total rows
            </span>
            <span>
              <strong>{valid}</strong> Valid
            </span>
            <span>
              <strong>{preview.filter((r) => r.status === 'Duplicate').length}</strong> Duplicate
            </span>
            <span>
              <strong>{preview.filter((r) => r.status === 'Invalid').length}</strong> Invalid
            </span>
          </div>
          <div className="table-scroll preview-table">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Enrollment</th>
                  <th>Student name</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td className="mono">{row.enrollmentNumber || '—'}</td>
                    <td>{row.name || '—'}</td>
                    <td title={row.issue}>
                      <Badge kind={row.status === 'Valid' ? 'success' : 'warning'}>
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Showing the first {Math.min(100, preview.length)} rows. All {preview.length} rows are
            validated. Duplicate and invalid rows will be excluded.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I have reviewed the mapping and approve importing {valid} valid students.
          </label>
        </>
      )}
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button busy={busy} disabled={!valid || !confirmed} onClick={() => void save()}>
          <FileSpreadsheet size={17} />
          Import {valid || ''} students
          <ArrowRight size={16} />
        </Button>
      </div>
      {!data && (
        <div className="privacy-note">
          <CheckCircle2 size={15} /> Your file is processed on this device.
        </div>
      )}
    </Modal>
  );
}
