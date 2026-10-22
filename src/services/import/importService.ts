import * as XLSX from 'xlsx';
import { db, now, uid, log } from '../../database/db';
import { photoFilename } from '../../utils/filename';
export interface ImportRow {
  row: number;
  enrollmentNumber: string;
  name: string;
  status: 'Valid' | 'Duplicate' | 'Invalid';
  issue: string;
}
export async function readRoster(
  file: File,
): Promise<{ headers: string[]; rows: string[][]; sheets: string[] }> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name))
    throw new Error('Choose an Excel (.xlsx, .xls) or CSV file.');
  if (file.size > 15 * 1024 * 1024)
    throw new Error('Please split files larger than 15 MB before importing.');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, cellText: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('This file has no readable worksheets.');
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  if (data.length < 2)
    throw new Error('The first worksheet needs a header and at least one student.');
  if (data.length > 50001) throw new Error('Import up to 50,000 rows at a time.');
  return {
    headers: data[0].map((s, i) => String(s || `Column ${i + 1}`)),
    rows: data.slice(1).map((row) => row.map(String)),
    sheets: book.SheetNames,
  };
}
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ');
export function validateRows(
  rows: string[][],
  enrollmentIndex: number,
  nameIndex: number,
  existing: { enrollmentNumber: string }[] = [],
): ImportRow[] {
  const seen = new Set(existing.map((s) => s.enrollmentNumber.toLocaleLowerCase()));
  const filenames = new Set(
    existing.map((s) => photoFilename(s.enrollmentNumber).toLocaleLowerCase()),
  );
  return rows.map((row, i) => {
    const enrollmentNumber = normalize(row[enrollmentIndex] || ''),
      name = normalize(row[nameIndex] || '');
    let status: ImportRow['status'] = 'Valid',
      issue = 'Ready to import';
    if (
      enrollmentIndex === nameIndex ||
      !enrollmentNumber ||
      !name ||
      enrollmentNumber.length > 80 ||
      name.length > 120 ||
      /[\x00-\x1f<>:"|?*\\]/.test(enrollmentNumber) ||
      enrollmentNumber.includes('..') ||
      /[\x00-\x1f]/.test(name)
    ) {
      status = 'Invalid';
      issue = 'Missing, unsafe or overly long enrollment/name';
    } else {
      try {
        const key = enrollmentNumber.toLocaleLowerCase(),
          filename = photoFilename(enrollmentNumber).toLocaleLowerCase();
        if (seen.has(key) || filenames.has(filename)) {
          status = 'Duplicate';
          issue = 'Enrollment or photo filename already exists';
        } else {
          seen.add(key);
          filenames.add(filename);
        }
      } catch {
        status = 'Invalid';
        issue = 'Enrollment cannot be used as a filename';
      }
    }
    return { row: i + 2, enrollmentNumber, name, status, issue };
  });
}
export async function importRows(preview: ImportRow[]) {
  const selected = preview.filter((r) => r.status === 'Valid');
  if (!selected.length) throw new Error('No valid students to import.');
  return db.transaction('rw', [db.students, db.logs], async () => {
    const existing = await db.students.toArray();
    const checked = validateRows(
      selected.map((r) => [r.enrollmentNumber, r.name]),
      0,
      1,
      existing,
    );
    if (checked.some((r) => r.status !== 'Valid'))
      throw new Error('The roster changed. Refresh your import preview.');
    const baseOrder = existing.reduce(
      (n, s) => Math.max(n, (s.rosterOrder ?? 0) + 1),
      existing.length,
    );
    const students = selected.map((r, index) => ({
      rosterOrder: baseOrder + index,
      id: uid(),
      enrollmentNumber: r.enrollmentNumber,
      name: r.name,
      createdAt: now(),
      demo: false,
    }));
    await db.students.bulkAdd(students);
    await log('ROSTER_IMPORTED', `Imported ${students.length} students`);
    return students;
  });
}
