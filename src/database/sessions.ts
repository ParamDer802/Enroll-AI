import { db, uid, now, log } from './db';
import type { Session, QueueStudent, StudentStatus } from '../types';
import { normalizeRules } from './rules';
export async function createSession(
  input: Pick<Session, 'name' | 'department' | 'semester' | 'batch' | 'rules'>,
  ids: string[],
  demo = false,
) {
  if (!input.name.trim() || !ids.length)
    throw new Error('Add a session name and at least one student.');
  const session: Session = {
    ...input,
    name: input.name.trim(),
    id: uid(),
    status: 'Draft',
    createdAt: now(),
    updatedAt: now(),
    demo,
    rules: normalizeRules(input.rules),
    rulesRevision: 0,
  };
  await db.transaction('rw', [db.sessions, db.sessionStudents, db.students, db.logs], async () => {
    if (new Set(ids).size !== ids.length || (await db.students.bulkGet(ids)).some((s) => !s))
      throw new Error('The selected roster has changed.');
    await db.sessions.add(session);
    await db.sessionStudents.bulkAdd(
      ids.map((studentId, order) => ({
        id: uid(),
        sessionId: session.id,
        studentId,
        order,
        status: 'Pending' as const,
        attempts: 0,
      })),
    );
    await log('SESSION_CREATED', `Created a session with ${ids.length} students`, session.id);
  });
  return session;
}
export async function getQueue(sessionId: string): Promise<QueueStudent[]> {
  const rows = (await db.sessionStudents.where('sessionId').equals(sessionId).toArray()).sort(
    (a, b) => a.order - b.order,
  );
  const students = await db.students.bulkGet(rows.map((r) => r.studentId));
  return rows.flatMap((membership, i) => (students[i] ? [{ ...students[i]!, membership }] : []));
}
export async function setSessionStatus(id: string, status: Session['status']) {
  await db.transaction('rw', [db.sessions, db.logs], async () => {
    const session = await db.sessions.get(id);
    if (!session) throw new Error('Session no longer exists.');
    if (session.status === 'Archived' && status !== 'Paused' && status !== 'Archived')
      throw new Error('Restore the archived session before capturing.');
    await db.sessions.update(id, { status, updatedAt: now() });
    await log('SESSION_STATUS', status, id);
  });
}
export async function setStudentStatus(id: string, status: StudentStatus, reason = '') {
  await db.transaction('rw', [db.sessionStudents, db.logs], async () => {
    const row = await db.sessionStudents.get(id);
    if (!row) throw new Error('Student queue record missing.');
    await db.sessionStudents.update(id, { status, reason });
    await log(`STUDENT_${status.toUpperCase()}`, reason, row.sessionId, row.studentId);
  });
}
export async function loadDemo() {
  return db.transaction('rw', [db.students, db.sessions, db.sessionStudents, db.logs], async () => {
    const names = ['Rahul Patel', 'Jay Shah', 'Priya Patel', 'Neha Shah', 'Aarav Shah'];
    const students = names.map((name, i) => ({
      id: uid(),
      enrollmentNumber: `24010100${i + 1}`,
      name,
      createdAt: now(),
      demo: true,
    }));
    const existing = await db.students
      .where('enrollmentNumber')
      .anyOf(students.map((s) => s.enrollmentNumber))
      .toArray();
    if (existing.length)
      throw new Error(
        'These sample enrollments already exist. Use the existing roster to create a session.',
      );
    await db.students.bulkAdd(students);
    return createSession(
      {
        name: 'Demo · BCA Semester 5',
        department: 'Computer Applications',
        semester: '5',
        batch: '2026',
      },
      students.map((s) => s.id),
      true,
    );
  });
}
