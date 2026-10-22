import Dexie, { type Table } from 'dexie';
import type { Student, Session, SessionStudent, CaptureRecord, Log, AppSettings } from '../types';
export class EnrollDatabase extends Dexie {
  students!: Table<Student, string>;
  sessions!: Table<Session, string>;
  sessionStudents!: Table<SessionStudent, string>;
  captures!: Table<CaptureRecord, string>;
  settings!: Table<{ key: string; value: AppSettings }, string>;
  logs!: Table<Log, number>;
  migrations!: Table<{ key: string; appliedAt: string }, string>;
  constructor(name = 'enroll-ai-v1') {
    super(name);
    this.version(1).stores({
      students: 'id,&enrollmentNumber,name,demo',
      sessions: 'id,status,createdAt',
      sessionStudents: 'id,&[sessionId+studentId],sessionId,studentId,[sessionId+status]',
      captures: 'id,&[sessionId+studentId],sessionId,studentId',
      settings: 'key',
      logs: '++id,sessionId,timestamp',
    });
    this.version(2)
      .stores({
        captures: 'id,&[sessionId+studentId],&[sessionId+filenameKey],sessionId,studentId',
      })
      .upgrade((tx) =>
        tx
          .table('captures')
          .toCollection()
          .modify((record) => {
            record.filenameKey = record.filename.toLowerCase();
          }),
      );
    this.version(3).stores({ migrations: 'key' });
    this.version(4)
      .stores({})
      .upgrade((tx) =>
        tx
          .table('sessions')
          .toCollection()
          .modify((session) => {
            session.rules ??= { requireSheet: false, instructions: '' };
            session.rulesRevision ??= 0;
          }),
      );
  }
}
export const db = new EnrollDatabase();
export const defaults: AppSettings = {
  cameraId: '',
  resolution: 1920,
  mirror: true,
  countdownSeconds: 3,
  blurThreshold: 70,
  faceSizeMin: 0.18,
  faceSizeMax: 0.62,
  centerTolerance: 0.17,
  headAngleMax: 15,
  stabilityMs: 2000,
  movementTolerance: 0.035,
  lightingMin: 55,
  lightingMax: 210,
  autoCapture: true,
  autoNext: true,
  autoRetry: false,
  maxAttempts: 3,
  jpegQuality: 0.92,
  includeName: false,
  sound: true,
};
export async function getSettings(): Promise<AppSettings> {
  return { ...defaults, ...(await db.settings.get('app'))?.value };
}
export function saveSettings(value: AppSettings) {
  return db.settings.put({ key: 'app', value });
}
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export async function log(event: string, message: string, sessionId?: string, studentId?: string) {
  await db.logs.add({ event, message, sessionId, studentId, timestamp: now() });
}
