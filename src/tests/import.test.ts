import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { validateRows, readRoster } from '../services/import/importService';
import { safeStem, photoFilename } from '../utils/filename';
describe('roster validation', () => {
  it('preserves leading zeros, alphanumeric IDs and normalizes whitespace', () => {
    const rows = validateRows(
      [
        [' 001 ', '  Priya   Patel '],
        ['24CE001', 'Jay Shah'],
      ],
      0,
      1,
    );
    expect(rows[0]).toMatchObject({
      enrollmentNumber: '001',
      name: 'Priya Patel',
      status: 'Valid',
    });
    expect(rows[1].status).toBe('Valid');
  });
  it('rejects duplicates, filename collisions, blanks and unsafe paths', () => {
    const rows = validateRows(
      [
        ['24/001', 'A'],
        ['24_001', 'B'],
        ['24/001', 'C'],
        ['', 'D'],
        ['../x', 'E'],
        ['existing', 'F'],
        ['OK', ''],
      ],
      0,
      1,
      [{ enrollmentNumber: 'EXISTING' }],
    );
    expect(rows.map((r) => r.status)).toEqual([
      'Valid',
      'Duplicate',
      'Duplicate',
      'Invalid',
      'Invalid',
      'Duplicate',
      'Invalid',
    ]);
  });
  it('validates excessively long values and same-column mapping', () => {
    expect(validateRows([['a'.repeat(81), 'Name']], 0, 1)[0].status).toBe('Invalid');
    expect(validateRows([['001', 'Name']], 0, 0)[0].status).toBe('Invalid');
  });
  it('reads CSV identifiers as strings', async () => {
    const file = new File(['Enrollment,Name\n001,Jay Shah\n24CE001,Priya Patel'], 'students.csv');
    const result = await readRoster(file);
    expect(result.rows[0][0]).toBe('001');
  });
  it('reads actual XLSX with text and formatted zero-padded enrollments', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Enrollment', 'Name'],
      ['001', 'Jay Shah'],
      [2, 'Priya Patel'],
    ]);
    sheet.A3.z = '000';
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Roster');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const result = await readRoster(new File([bytes], 'students.xlsx'));
    expect(result.rows.map((r) => r[0])).toEqual(['001', '002']);
  });
  it('rejects invalid file types and spreadsheets without students', async () => {
    await expect(readRoster(new File(['broken'], 'roster.pdf'))).rejects.toThrow('Choose an Excel');
    await expect(readRoster(new File(['Enrollment,Name'], 'students.csv'))).rejects.toThrow(
      'at least one',
    );
  });
  it('generates safe deterministic filenames', () => {
    expect(photoFilename('24/0101/001')).toBe('24_0101_001.jpg');
    expect(safeStem('../001')).toBe('001');
    expect(photoFilename('CON')).toBe('_CON.jpg');
    expect(photoFilename('001', 'Rahul Patel')).toBe('001_Rahul_Patel.jpg');
  });
});
