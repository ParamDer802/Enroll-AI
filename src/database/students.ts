import { db, log } from './db';
export async function updateStudentName(id: string, name: string) {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 120 || /[\x00-\x1f\x7f]/.test(cleaned))
    throw new Error('Enter a name between 1 and 120 characters without control characters.');
  await db.transaction('rw', [db.students, db.logs], async () => {
    if (!(await db.students.get(id))) throw new Error('Student record no longer exists.');
    await db.students.update(id, { name: cleaned, generatedName: false });
    await log(
      'STUDENT_NAME_UPDATED',
      'Student name updated by operator; enrollment and saved photos preserved.',
      undefined,
      id,
    );
  });
}
export async function getRoster() {
  const students = await db.students.toArray();
  return students.sort(
    (a, b) =>
      (a.rosterOrder ?? Number.MAX_SAFE_INTEGER) - (b.rosterOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.enrollmentNumber.localeCompare(b.enrollmentNumber, undefined, { numeric: true }),
  );
}
