import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, now } from '../database/db';
import { AIML_SESSION_ID, aimlRoster, installAimlRoster } from '../database/starterRoster';
import { getQueue, createSession } from '../database/sessions';
import { updateStudentName } from '../database/students';
import { saveCapture } from '../database/captures';
import { reportRows } from '../services/export/exportService';

beforeEach(async () => {
  await db.open();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await db.delete();
});

describe('requested AIML Semester 5 roster', () => {
  it('installs exactly the requested contiguous string enrollments and an ordered pending queue', async () => {
    await installAimlRoster();
    const queue = await getQueue(AIML_SESSION_ID);
    expect(queue).toHaveLength(79);
    expect(queue.map((student) => student.enrollmentNumber)).toEqual(
      Array.from({ length: 79 }, (_, i) => String(24012250910001n + BigInt(i))),
    );
    expect(new Set(queue.map((student) => student.name)).size).toBe(79);
    expect(
      queue.every(
        (student) =>
          student.generatedName &&
          student.branch === 'AIML' &&
          student.semester === '5' &&
          student.membership.status === 'Pending' &&
          student.membership.attempts === 0,
      ),
    ).toBe(true);
    expect(await db.captures.count()).toBe(0);
    expect(await db.sessions.get(AIML_SESSION_ID)).toMatchObject({
      department: 'AIML',
      semester: '5',
    });
    expect((await reportRows(AIML_SESSION_ID))[0]).toMatchObject({
      'Name Source': 'Generated placeholder',
      Branch: 'AIML',
      Semester: '5',
      'Photo Filename': '',
    });
  });

  it('is idempotent under repeated and concurrent startup calls, preserving edits and progress', async () => {
    await Promise.all([installAimlRoster(), installAimlRoster()]);
    const [first] = await getQueue(AIML_SESSION_ID);
    await updateStudentName(first.id, 'Confirmed Student');
    await db.sessionStudents.update(first.membership.id, { status: 'Skipped', reason: 'Absent' });
    await installAimlRoster();
    expect(await db.students.count()).toBe(79);
    expect(await db.sessions.count()).toBe(1);
    expect(await db.sessionStudents.count()).toBe(79);
    expect(await db.students.get(first.id)).toMatchObject({
      name: 'Confirmed Student',
      generatedName: false,
    });
    expect(await db.sessionStudents.get(first.membership.id)).toMatchObject({
      status: 'Skipped',
      reason: 'Absent',
    });
    expect(await db.migrations.count()).toBe(1);
  });

  it('preserves existing enrollment identities, captured blobs and names during install and editing', async () => {
    await db.students.add({
      id: 'existing',
      enrollmentNumber: aimlRoster[0].enrollmentNumber,
      name: 'Existing Name',
      demo: false,
      createdAt: now(),
    });
    const session = await createSession(
      { name: 'Existing class', department: 'AIML', semester: '5', batch: '2026' },
      ['existing'],
    );
    const record = {
      id: `${session.id}:existing`,
      sessionId: session.id,
      studentId: 'existing',
      enrollmentNumber: aimlRoster[0].enrollmentNumber,
      filename: `${aimlRoster[0].enrollmentNumber}.jpg`,
      imageBlob: new Blob(['x'.repeat(150)], { type: 'image/jpeg' }),
      capturedAt: now(),
      quality: null,
      manual: true,
    };
    await saveCapture(record, (await getQueue(session.id))[0]);
    await installAimlRoster();
    expect((await getQueue(AIML_SESSION_ID))[0]).toMatchObject({
      id: 'existing',
      name: 'Existing Name',
    });
    await updateStudentName('existing', ' Corrected   Name ');
    expect(await db.students.get('existing')).toMatchObject({
      name: 'Corrected Name',
      enrollmentNumber: aimlRoster[0].enrollmentNumber,
    });
    expect((await db.captures.get(record.id))?.imageBlob.size).toBe(150);
    expect((await db.captures.get(record.id))?.filename).toBe(record.filename);
    expect((await getQueue(session.id))[0].membership.status).toBe('Completed');
  });

  it('rolls the entire installation back on audit failure and retries cleanly', async () => {
    const audit = vi.spyOn(db.logs, 'add').mockRejectedValueOnce(new Error('Storage full'));
    await expect(installAimlRoster()).rejects.toThrow('Storage full');
    expect(await db.students.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sessionStudents.count()).toBe(0);
    expect(await db.migrations.count()).toBe(0);
    audit.mockRestore();
    await installAimlRoster();
    expect(await db.students.count()).toBe(79);
  });

  it('rejects invalid edits without changing the generated-name marker', async () => {
    await installAimlRoster();
    const [first] = await getQueue(AIML_SESSION_ID);
    await expect(updateStudentName(first.id, '  ')).rejects.toThrow();
    await expect(updateStudentName(first.id, 'A'.repeat(121))).rejects.toThrow();
    expect((await db.students.get(first.id))?.generatedName).toBe(true);
  });
});
