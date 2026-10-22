import { db, log, now } from './db';
import type { CaptureRecord, QueueStudent } from '../types';
import { photoFilename } from '../utils/filename';
import { needsRuleReview, normalizeRules } from './rules';
export async function saveCapture(record: CaptureRecord, student: QueueStudent, replace = false) {
  if (
    record.studentId !== student.id ||
    record.enrollmentNumber !== student.enrollmentNumber ||
    record.sessionId !== student.membership.sessionId
  )
    throw new Error('Capture identity mismatch. Nothing was saved.');
  if (
    record.id !== `${record.sessionId}:${record.studentId}` ||
    ![
      photoFilename(student.enrollmentNumber),
      photoFilename(student.enrollmentNumber, student.name),
    ].includes(record.filename)
  )
    throw new Error('Capture filename or record key does not match the enrollment.');
  if (record.imageBlob.size < 100 || record.imageBlob.type !== 'image/jpeg')
    throw new Error('The captured JPEG is empty or invalid.');
  await db.transaction('rw', [db.captures, db.sessionStudents, db.sessions, db.logs], async () => {
    const row = await db.sessionStudents.get(student.membership.id);
    if (!row || row.studentId !== student.id || row.sessionId !== record.sessionId)
      throw new Error('Queue changed during capture.');
    const session = await db.sessions.get(record.sessionId);
    if (!session || session.status === 'Archived')
      throw new Error('The session is unavailable or archived.');
    const rules = normalizeRules(session.rules),
      review = record.ruleReview;
    if (
      review &&
      (review.revision !== (session.rulesRevision || 0) ||
        JSON.stringify(review.rules) !== JSON.stringify(rules))
    )
      throw new Error('Session rules changed. Retake the photo using the current rules.');
    if (
      needsRuleReview(rules) &&
      (!review ||
        review.method !== 'operator' ||
        !review.confirmedAt ||
        !Number.isFinite(Date.parse(review.confirmedAt)))
    )
      throw new Error('Review and confirm the session rules before saving this photo.');
    const existing = await db.captures.get(record.id);
    if (existing && !replace)
      throw new Error('A photo already exists. Choose Retake to replace it.');
    const collision = await db.captures
      .where('[sessionId+filenameKey]')
      .equals([record.sessionId, record.filename.toLowerCase()])
      .first();
    if (collision && collision.studentId !== student.id)
      throw new Error(
        'This filename conflicts with another enrollment. Correct the roster before capture.',
      );
    await db.captures.put({ ...record, filenameKey: record.filename.toLowerCase() });
    const verified = await db.captures.get(record.id);
    if (
      !verified ||
      verified.imageBlob.size !== record.imageBlob.size ||
      verified.filename !== record.filename ||
      verified.studentId !== student.id
    )
      throw new Error('Saved photo verification failed.');
    await db.sessionStudents.update(row.id, {
      status: 'Completed',
      capturedAt: record.capturedAt,
      reason: '',
    });
    await log(
      'CAPTURE_VERIFIED',
      replace ? 'Replacement photo saved and verified' : 'Photo saved and verified',
      record.sessionId,
      record.studentId,
    );
    if (review?.method === 'operator')
      await log(
        'SESSION_RULES_CONFIRMED',
        `Operator reviewed the captured photo against session rules revision ${review.revision}.`,
        record.sessionId,
        record.studentId,
      );
  });
}
export async function recordAttempt(student: QueueStudent) {
  await db.transaction('rw', [db.sessionStudents, db.logs], async () => {
    const row = await db.sessionStudents.get(student.membership.id);
    if (!row) throw new Error('Queue record missing.');
    await db.sessionStudents.update(row.id, { attempts: row.attempts + 1 });
    await log('CAPTURE_ATTEMPT', `Attempt ${row.attempts + 1}`, row.sessionId, row.studentId);
  });
}
export async function recoverSessions() {
  await db.sessions.where('status').equals('Active').modify({ status: 'Paused', updatedAt: now() });
}
export type CaptureMetadata = Omit<CaptureRecord, 'imageBlob'> & { imageBytes: number };
export async function getCaptureMetadata(sessionId?: string): Promise<CaptureMetadata[]> {
  const result: CaptureMetadata[] = [];
  const collection = sessionId
    ? db.captures.where('sessionId').equals(sessionId)
    : db.captures.toCollection();
  await collection.each(({ imageBlob, ...metadata }) => {
    result.push({ ...metadata, imageBytes: imageBlob.size });
  });
  return result;
}
