import { db, now, uid } from './db';
import type { Student } from '../types';

// Requested class roster. Names are invented placeholders, never verified identities.
export const AIML_ROSTER_KEY = 'requested-aiml-sem5-24012250910001-079-v1';
export const AIML_SESSION_ID = 'aiml-semester-5-2026';
const names = [
  'Aarav Patel',
  'Aditi Shah',
  'Akash Mehta',
  'Ananya Desai',
  'Arjun Trivedi',
  'Avni Joshi',
  'Bhavya Parmar',
  'Chirag Solanki',
  'Dev Shah',
  'Devanshi Patel',
  'Dhruv Mehta',
  'Diya Pandya',
  'Esha Vyas',
  'Harsh Patel',
  'Heer Desai',
  'Het Shah',
  'Hiral Joshi',
  'Ishan Trivedi',
  'Jainil Patel',
  'Jiya Shah',
  'Karan Mehta',
  'Kavya Desai',
  'Keyur Parmar',
  'Khushi Patel',
  'Krish Vyas',
  'Krisha Shah',
  'Kunal Joshi',
  'Mahi Trivedi',
  'Manav Patel',
  'Mansi Mehta',
  'Meet Desai',
  'Mihir Shah',
  'Mira Pandya',
  'Naitik Patel',
  'Nandini Joshi',
  'Neel Mehta',
  'Nidhi Desai',
  'Nirav Shah',
  'Nishtha Trivedi',
  'Om Patel',
  'Parth Joshi',
  'Pooja Mehta',
  'Pranav Desai',
  'Prisha Shah',
  'Raghav Patel',
  'Riddhi Vyas',
  'Rishi Mehta',
  'Riya Desai',
  'Rohan Trivedi',
  'Rudra Shah',
  'Saanvi Patel',
  'Sahil Joshi',
  'Sakshi Mehta',
  'Samarth Desai',
  'Sanjana Shah',
  'Shaurya Patel',
  'Shivani Trivedi',
  'Shlok Joshi',
  'Shreya Mehta',
  'Siddharth Desai',
  'Sneha Shah',
  'Soham Patel',
  'Tanvi Pandya',
  'Tejas Joshi',
  'Trisha Mehta',
  'Uday Desai',
  'Urvi Shah',
  'Ved Patel',
  'Vidhi Trivedi',
  'Vihaan Joshi',
  'Vishva Mehta',
  'Vivaan Desai',
  'Yash Shah',
  'Yashvi Patel',
  'Yug Trivedi',
  'Zara Mehta',
  'Aaryan Rana',
  'Disha Bhatt',
  'Param Panchal',
] as const;

export const aimlRoster = names.map((name, index) => ({
  enrollmentNumber: `2401225091${String(index + 1).padStart(4, '0')}`,
  name,
}));

/** One atomic, idempotent data migration, including under concurrent tabs. */
export async function installAimlRoster() {
  await db.transaction(
    'rw',
    [db.migrations, db.students, db.sessions, db.sessionStudents, db.logs],
    async () => {
      if (await db.migrations.get(AIML_ROSTER_KEY)) return;
      const timestamp = now();
      const existing = await db.students.toArray();
      const byEnrollment = new Map(existing.map((student) => [student.enrollmentNumber, student]));
      const orderStart =
        existing.reduce((max, student) => Math.max(max, student.rosterOrder ?? -1), -1) + 1;
      const additions: Student[] = [];
      const roster = aimlRoster.map((row, index) => {
        const saved = byEnrollment.get(row.enrollmentNumber);
        if (saved) return saved; // Preserve names, IDs, metadata and all existing photo associations.
        const student: Student = {
          ...row,
          id: uid(),
          createdAt: timestamp,
          demo: false,
          generatedName: true,
          branch: 'AIML',
          semester: '5',
          rosterOrder: orderStart + index,
        };
        additions.push(student);
        return student;
      });
      await db.students.bulkAdd(additions);
      if (!(await db.sessions.get(AIML_SESSION_ID))) {
        await db.sessions.add({
          id: AIML_SESSION_ID,
          name: 'AIML · Semester 5',
          department: 'AIML',
          semester: '5',
          batch: '2026',
          status: 'Draft',
          demo: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        await db.sessionStudents.bulkAdd(
          roster.map((student, order) => ({
            id: uid(),
            sessionId: AIML_SESSION_ID,
            studentId: student.id,
            order,
            status: 'Pending' as const,
            attempts: 0,
          })),
        );
      }
      await db.logs.add({
        event: 'REQUESTED_ROSTER_ADDED',
        sessionId: AIML_SESSION_ID,
        timestamp,
        message: `AIML Semester 5: ${additions.length} generated-name students added; ${79 - additions.length} existing records preserved.`,
      });
      await db.migrations.add({ key: AIML_ROSTER_KEY, appliedAt: timestamp });
    },
  );
}
