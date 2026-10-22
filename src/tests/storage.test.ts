import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { db, now, uid, EnrollDatabase } from '../database/db';
import { createSession, getQueue } from '../database/sessions';
import { getRoster } from '../database/students';
import { recordAttempt, saveCapture, getCaptureMetadata } from '../database/captures';
import { importRows, validateRows } from '../services/import/importService';
import { reportRows } from '../services/export/exportService';
import type { CaptureRecord } from '../types';
beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  await db.delete();
});
async function fixture() {
  const students = await importRows(
    validateRows(
      [
        ['001', 'Rahul Patel'],
        ['002', 'Jay Shah'],
      ],
      0,
      1,
    ),
  );
  const session = await createSession(
    { name: 'BCA Semester 5', department: 'BCA', semester: '5', batch: '2026' },
    students.map((s) => s.id),
  );
  const queue = await getQueue(session.id);
  const record: CaptureRecord = {
    id: `${session.id}:${students[0].id}`,
    sessionId: session.id,
    studentId: students[0].id,
    enrollmentNumber: '001',
    filename: '001.jpg',
    imageBlob: new Blob(['x'.repeat(150)], { type: 'image/jpeg' }),
    capturedAt: now(),
    quality: null,
    manual: true,
  };
  return { students, session, queue, record };
}
describe('IndexedDB integrity and persistence', () => {
  it('preserves spreadsheet row order rather than random database primary-key order', async () => {
    await importRows(
      validateRows(
        [
          ['090', 'First row'],
          ['001', 'Second row'],
          ['050', 'Third row'],
        ],
        0,
        1,
      ),
    );
    await importRows(validateRows([['002', 'Next import']], 0, 1));
    const roster = await getRoster();
    expect(roster.map((s) => s.enrollmentNumber)).toEqual(['090', '001', '050', '002']);
    const session = await createSession(
      { name: 'Ordered roster', department: '', semester: '', batch: '' },
      roster.map((s) => s.id),
    );
    expect((await getQueue(session.id)).map((s) => s.enrollmentNumber)).toEqual([
      '090',
      '001',
      '050',
      '002',
    ]);
  });
  it('upgrades an existing database without losing captured photo blobs', async () => {
    const name = `migration-test-${uid()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      students: 'id,&enrollmentNumber,name,demo',
      sessions: 'id,status,createdAt',
      sessionStudents: 'id,&[sessionId+studentId],sessionId,studentId,[sessionId+status]',
      captures: 'id,&[sessionId+studentId],sessionId,studentId',
      settings: 'key',
      logs: '++id,sessionId,timestamp',
    });
    await old.open();
    await old.table('captures').add({
      id: 'session:student',
      sessionId: 'session',
      studentId: 'student',
      filename: '001.jpg',
      imageBlob: new Blob(['x'.repeat(150)], { type: 'image/jpeg' }),
    });
    old.close();
    const upgraded = new EnrollDatabase(name);
    try {
      await upgraded.open();
      const photo = await upgraded.captures
        .where('[sessionId+filenameKey]')
        .equals(['session', '001.jpg'])
        .first();
      expect(photo?.imageBlob.size).toBe(150);
      expect(await upgraded.captures.count()).toBe(1);
    } finally {
      await upgraded.delete();
    }
  });
  it('returns metadata without retaining images in large list state', async () => {
    const { record, queue } = await fixture();
    await saveCapture(record, queue[0]);
    const metadata = await getCaptureMetadata(record.sessionId);
    expect(metadata[0]).toMatchObject({ filename: '001.jpg', imageBytes: 150 });
    expect(metadata[0]).not.toHaveProperty('imageBlob');
  });
  it('stores verified photo and completed status atomically, then survives reopening', async () => {
    const { record, queue } = await fixture();
    await recordAttempt(queue[0]);
    await saveCapture(record, queue[0]);
    db.close();
    await db.open();
    expect((await db.captures.get(record.id))?.imageBlob.size).toBe(150);
    expect(await db.sessionStudents.get(queue[0].membership.id)).toMatchObject({
      status: 'Completed',
      attempts: 1,
    });
    expect(await db.logs.where('sessionId').equals(record.sessionId).count()).toBe(3);
  });
  it('rejects wrong student association and filenames without updating status', async () => {
    const { record, queue } = await fixture();
    await expect(saveCapture({ ...record, studentId: queue[1].id }, queue[0])).rejects.toThrow(
      'identity mismatch',
    );
    await expect(saveCapture({ ...record, filename: 'wrong.jpg' }, queue[0])).rejects.toThrow(
      'filename',
    );
    expect(await db.captures.count()).toBe(0);
    expect((await db.sessionStudents.get(queue[0].membership.id))?.status).toBe('Pending');
  });
  it('prevents silent replacement but allows an explicit retake', async () => {
    const { record, queue } = await fixture();
    await saveCapture(record, queue[0]);
    await expect(saveCapture(record, queue[0])).rejects.toThrow('already exists');
    const replacement = {
      ...record,
      imageBlob: new Blob(['y'.repeat(200)], { type: 'image/jpeg' }),
    };
    await saveCapture(replacement, queue[0], true);
    expect(await db.captures.count()).toBe(1);
    expect((await db.captures.get(record.id))?.imageBlob.size).toBe(200);
  });
  it('rolls photo and status back when the audit write fails', async () => {
    const { record, queue } = await fixture();
    const fail = () => {
      throw new Error('Storage write failure');
    };
    db.logs.hook('creating', fail);
    await expect(saveCapture(record, queue[0])).rejects.toThrow('Storage write failure');
    db.logs.hook('creating').unsubscribe(fail);
    expect(await db.captures.count()).toBe(0);
    expect((await db.sessionStudents.get(queue[0].membership.id))?.status).toBe('Pending');
  });
  it('revalidates import at commit and prevents duplicate session membership', async () => {
    const preview = validateRows([['001', 'Name']], 0, 1);
    const students = await importRows(preview);
    await expect(importRows(preview)).rejects.toThrow('roster changed');
    await expect(
      createSession({ name: 'Test', department: '', semester: '', batch: '' }, [
        students[0].id,
        students[0].id,
      ]),
    ).rejects.toThrow('roster has changed');
    expect(await db.sessions.count()).toBe(0);
  });
  it('reports actual saved metadata while preserving enrollment strings', async () => {
    const { record, queue, session } = await fixture();
    await recordAttempt(queue[0]);
    await saveCapture(record, queue[0]);
    const rows = await reportRows(session.id);
    expect(rows[0]).toMatchObject({
      'Enrollment Number': '001',
      'Photo Filename': '001.jpg',
      Status: 'Completed',
      'Quality Result': 'Manual override',
      Attempts: 1,
    });
    expect(rows[1]).toMatchObject({ Status: 'Pending', 'Photo Filename': '' });
  });
});
