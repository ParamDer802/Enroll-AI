import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect } from 'vitest';
import { db, now } from '../database/db';
import { createSession, getQueue, setSessionStatus, loadDemo } from '../database/sessions';
import { updateSessionRules } from '../database/rules';
import { saveCapture } from '../database/captures';
import { exportSnapshot, reportRows } from '../services/export/exportService';
import type { CaptureRecord } from '../types';
beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  await db.delete();
});
async function fixture(requireSheet = true) {
  await db.students.add({
    id: 'one',
    name: 'Student One',
    enrollmentNumber: '001',
    demo: false,
    createdAt: now(),
  });
  const session = await createSession(
    {
      name: 'Rules test',
      department: 'AIML',
      semester: '5',
      batch: '2026',
      rules: { requireSheet, instructions: '' },
    },
    ['one'],
  );
  const [student] = await getQueue(session.id);
  const record: CaptureRecord = {
    id: `${session.id}:one`,
    sessionId: session.id,
    studentId: 'one',
    enrollmentNumber: '001',
    filename: '001.jpg',
    imageBlob: new Blob(['x'.repeat(150)], { type: 'image/jpeg' }),
    capturedAt: now(),
    quality: null,
    manual: true,
  };
  return { session, student, record };
}
it('rejects unconfirmed rule captures even with manual override, then persists operator evidence atomically', async () => {
  const { session, student, record } = await fixture();
  await expect(saveCapture(record, student)).rejects.toThrow('Review and confirm');
  expect(await db.captures.count()).toBe(0);
  expect((await getQueue(session.id))[0].membership.status).toBe('Pending');
  record.ruleReview = {
    rules: session.rules!,
    revision: 0,
    method: 'operator',
    confirmedAt: now(),
  };
  await saveCapture(record, student);
  expect((await reportRows(session.id))[0]).toMatchObject({
    'Sheet Required At Capture': 'Yes',
    'Session Rule Review': 'Confirmed by operator',
  });
  expect(await db.logs.filter((log) => log.event === 'SESSION_RULES_CONFIRMED').count()).toBe(1);
});
it('rejects stale rule revisions and conflicting edits without relabeling older photographs', async () => {
  const { session, student, record } = await fixture(false);
  await saveCapture(record, student);
  await updateSessionRules(session.id, { requireSheet: true, instructions: 'Show class code' }, 0);
  await expect(
    updateSessionRules(session.id, { requireSheet: false, instructions: '' }, 0),
  ).rejects.toThrow('changed in another tab');
  expect((await reportRows(session.id))[0]['Session Rule Review']).toBe(
    'Not recorded (older photo)',
  );
  record.ruleReview = { rules: session.rules!, revision: 0, method: 'not-required' };
  await expect(saveCapture(record, student, true)).rejects.toThrow('Session rules changed');
  expect((await db.captures.get(record.id))?.ruleReview).toBeUndefined();
});
it('requires a restored session for history retakes and rejects foreign membership records', async () => {
  const { session, student, record } = await fixture(false);
  await setSessionStatus(session.id, 'Archived');
  await expect(setSessionStatus(session.id, 'Active')).rejects.toThrow('Restore');
  await expect(saveCapture(record, student)).rejects.toThrow('archived');
  await setSessionStatus(session.id, 'Paused');
  await db.sessionStudents.update(student.membership.id, { sessionId: 'wrong' });
  await expect(saveCapture(record, student)).rejects.toThrow('Queue changed');
});
it('keeps an export snapshot internally consistent when names and photos change afterward', async () => {
  const { session, student, record } = await fixture(false);
  await saveCapture(record, student);
  const snapshot = await exportSnapshot(session.id);
  await db.students.update('one', { name: 'Updated Name' });
  await saveCapture(
    { ...record, imageBlob: new Blob(['y'.repeat(200)], { type: 'image/jpeg' }) },
    student,
    true,
  );
  expect(snapshot.captures[0].imageBlob.size).toBe(150);
  expect(snapshot.rows[0]['Student Name']).toBe('Student One');
  expect((await db.captures.get(record.id))?.imageBlob.size).toBe(200);
});
it('rolls back demo students as well as sessions when session creation fails', async () => {
  const reject = (_key: unknown, value: { event: string }) => {
    if (value.event === 'SESSION_CREATED') throw new Error('Audit failed');
  };
  db.logs.hook('creating', reject);
  await expect(loadDemo()).rejects.toThrow('Audit failed');
  db.logs.hook('creating').unsubscribe(reject);
  expect(await db.students.count()).toBe(0);
  expect(await db.sessions.count()).toBe(0);
  await loadDemo();
  expect(await db.students.count()).toBe(5);
});
