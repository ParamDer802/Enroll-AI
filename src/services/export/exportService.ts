import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { db } from '../../database/db';
import { getQueue } from '../../database/sessions';
import { getCaptureMetadata } from '../../database/captures';
import { safeStem } from '../../utils/filename';
import { needsRuleReview, SHEET_RULE } from '../../database/rules';
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const spreadsheetSafe = (text: string) => (/^[=+@\-\t\r]/.test(text) ? `'${text}` : text);
export async function reportRows(sessionId: string) {
  return db.transaction(
    'r',
    [db.sessions, db.students, db.sessionStudents, db.captures],
    async () => {
      const [queue, captures, session] = await Promise.all([
        getQueue(sessionId),
        getCaptureMetadata(sessionId),
        db.sessions.get(sessionId),
      ]);
      const byStudent = new Map(captures.map((c) => [c.studentId, c]));
      return queue.map((s) => {
        const c = byStudent.get(s.id);
        return {
          'Enrollment Number': spreadsheetSafe(s.enrollmentNumber),
          'Student Name': spreadsheetSafe(s.name),
          'Name Source': s.generatedName
            ? 'Generated placeholder'
            : s.demo
              ? 'Demo'
              : 'Roster / operator',
          Branch: spreadsheetSafe(session?.department || s.branch || ''),
          Semester: spreadsheetSafe(session?.semester || s.semester || ''),
          Status: s.membership.status,
          'Photo Filename': c?.filename || '',
          'Captured At (UTC)': c?.capturedAt || '',
          'Quality Result': c
            ? c.manual
              ? 'Manual override'
              : c.quality?.ready
                ? 'All checks passed'
                : 'Not evaluated'
            : '',
          'Session Rule Review': c
            ? !c.ruleReview
              ? 'Not recorded (older photo)'
              : c.ruleReview.method === 'operator' && c.ruleReview.confirmedAt
                ? 'Confirmed by operator'
                : 'No additional rules at capture'
            : needsRuleReview(session?.rules)
              ? 'Pending operator review'
              : '',
          'Sheet Required At Capture': c?.ruleReview
            ? c.ruleReview.rules.requireSheet
              ? 'Yes'
              : 'No'
            : '',
          'Rules At Capture': c?.ruleReview
            ? spreadsheetSafe(
                [c.ruleReview.rules.requireSheet ? SHEET_RULE : '', c.ruleReview.rules.instructions]
                  .filter(Boolean)
                  .join(' '),
              )
            : '',
          'Rules Revision': c?.ruleReview?.revision ?? '',
          'Rules Confirmed At (UTC)': c?.ruleReview?.confirmedAt || '',
          Sharpness: c?.quality ? Math.round(c.quality.sharpness) : '',
          Brightness: c?.quality ? Math.round(c.quality.brightness) : '',
          Attempts: s.membership.attempts,
          Session: spreadsheetSafe(session?.name || ''),
          Reason: spreadsheetSafe(s.membership.reason || ''),
        };
      });
    },
  );
}
export async function exportSnapshot(sessionId: string) {
  return db.transaction(
    'r',
    [db.sessions, db.students, db.sessionStudents, db.captures],
    async () => {
      const session = await db.sessions.get(sessionId);
      if (!session) throw new Error('Session not found.');
      const captures = await db.captures.where('sessionId').equals(sessionId).toArray();
      const rows = await reportRows(sessionId);
      return { session, captures, rows };
    },
  );
}
export async function exportReport(sessionId: string, format: 'xlsx' | 'csv') {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error('Session not found.');
  const sheet = XLSX.utils.json_to_sheet(await reportRows(sessionId));
  if (format === 'csv')
    download(
      new Blob(['\ufeff', XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv;charset=utf-8' }),
      `${safeStem(session.name)}_Report.csv`,
    );
  else {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Capture report');
    download(
      new Blob([XLSX.write(book, { bookType: 'xlsx', type: 'array' })], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${safeStem(session.name)}_Report.xlsx`,
    );
  }
}
export async function exportZip(sessionId: string, progress: (value: number) => void) {
  const { session, captures, rows } = await exportSnapshot(sessionId);
  if (!captures.length) throw new Error('Capture a photo before downloading a ZIP.');
  const size = captures.reduce((n, c) => n + c.imageBlob.size, 0);
  if (size > 500 * 1024 * 1024)
    throw new Error(
      'This archive exceeds 500 MB. Export to a folder or download individual photos.',
    );
  const zip = new JSZip(),
    seen = new Set<string>();
  for (const capture of captures) {
    const key = capture.filename.toLowerCase();
    if (seen.has(key))
      throw new Error('Duplicate filenames found. Export aborted to protect photos.');
    seen.add(key);
    zip.file(capture.filename, await capture.imageBlob.arrayBuffer());
  }
  zip.file('report.csv', '\ufeff' + XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (meta) =>
    progress(meta.percent),
  );
  download(blob, `${safeStem(session.name)}_Photos.zip`);
}
export async function exportFolder(sessionId: string) {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: () => Promise<{
        getDirectoryHandle: (n: string, o: { create: boolean }) => Promise<any>;
      }>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error('Folder export is not supported here. Use ZIP download instead.');
  const folder = await picker.call(window);
  const { captures, rows } = await exportSnapshot(sessionId);
  if (!captures.length) throw new Error('Capture a photo before exporting a folder.');
  // A new folder per export preserves existing files; filenames inside stay enrollment-based.
  const target = await folder.getDirectoryHandle(
    `ENROLL-AI_${new Date().toISOString().replace(/[:.]/g, '-')}`,
    { create: true },
  );
  for (const capture of captures) {
    const handle = await target.getFileHandle(capture.filename, { create: true });
    const writer = await handle.createWritable();
    await writer.write(capture.imageBlob);
    await writer.close();
  }
  const report = await target.getFileHandle('report.csv', { create: true });
  const writer = await report.createWritable();
  await writer.write(
    new Blob(['\ufeff', XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  await writer.close();
  return captures.length;
}
