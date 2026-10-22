export type StudentStatus = 'Pending' | 'Completed' | 'Skipped' | 'Failed';
export interface Student {
  generatedName?: boolean;
  branch?: string;
  semester?: string;
  rosterOrder?: number;
  id: string;
  enrollmentNumber: string;
  name: string;
  createdAt: string;
  demo: boolean;
}
export interface SessionRules {
  requireSheet: boolean;
  instructions: string;
}
export interface RuleReview {
  rules: SessionRules;
  revision: number;
  method: 'operator' | 'not-required';
  confirmedAt?: string;
}
export interface Session {
  rules?: SessionRules;
  rulesRevision?: number;
  id: string;
  name: string;
  department: string;
  semester: string;
  batch: string;
  status: 'Draft' | 'Active' | 'Paused' | 'Completed' | 'Archived';
  createdAt: string;
  updatedAt: string;
  demo: boolean;
}
export interface SessionStudent {
  id: string;
  sessionId: string;
  studentId: string;
  order: number;
  status: StudentStatus;
  attempts: number;
  capturedAt?: string;
  reason?: string;
}
export interface CaptureRecord {
  ruleReview?: RuleReview;
  filenameKey?: string;
  id: string;
  sessionId: string;
  studentId: string;
  enrollmentNumber: string;
  filename: string;
  imageBlob: Blob;
  capturedAt: string;
  quality: QualityMetrics | null;
  manual: boolean;
}
export interface Log {
  id?: number;
  sessionId?: string;
  studentId?: string;
  event: string;
  message: string;
  timestamp: string;
}
export interface Face {
  x: number;
  y: number;
  width: number;
  height: number;
  roll: number | null;
}
export interface QualityMetrics {
  faceDetected: boolean;
  faceCount: number;
  faceCentered: boolean;
  faceSizeValid: boolean;
  headAngleValid: boolean;
  lightingValid: boolean;
  sharpnessValid: boolean;
  stable: boolean;
  ready: boolean;
  brightness: number;
  sharpness: number;
  stabilityMs: number;
  message: string;
  face?: Face;
  analysisMs: number;
}
export interface AppSettings {
  cameraId: string;
  resolution: number;
  mirror: boolean;
  countdownSeconds: number;
  blurThreshold: number;
  faceSizeMin: number;
  faceSizeMax: number;
  centerTolerance: number;
  headAngleMax: number;
  stabilityMs: number;
  movementTolerance: number;
  lightingMin: number;
  lightingMax: number;
  autoCapture: boolean;
  autoNext: boolean;
  autoRetry: boolean;
  maxAttempts: number;
  jpegQuality: number;
  includeName: boolean;
  sound: boolean;
}
export type CaptureState =
  | 'REVIEW_REQUIRED'
  | 'IDLE'
  | 'INITIALIZING'
  | 'CAMERA_READY'
  | 'WAITING_FOR_FACE'
  | 'FACE_DETECTED'
  | 'QUALITY_CHECK'
  | 'NOT_READY'
  | 'READY'
  | 'STABILITY_CHECK'
  | 'COUNTDOWN'
  | 'CAPTURING'
  | 'PROCESSING'
  | 'SAVING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'NEXT_STUDENT'
  | 'PAUSED'
  | 'ERROR'
  | 'SESSION_COMPLETE';
export interface QueueStudent extends Student {
  membership: SessionStudent;
}
export interface CaptureSnapshot {
  reviewPending: boolean;
  state: CaptureState;
  student: QueueStudent | null;
  quality: QualityMetrics | null;
  countdown: number;
  preview: CaptureRecord | null;
  error: string;
  awaitingClear: boolean;
}
