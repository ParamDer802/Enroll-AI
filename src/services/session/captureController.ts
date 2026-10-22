import type {
  AppSettings,
  CaptureSnapshot,
  CaptureRecord,
  QualityMetrics,
  QueueStudent,
  SessionRules,
} from '../../types';
import { photoFilename } from '../../utils/filename';
import { defaultRules, needsRuleReview } from '../../database/rules';
export interface CaptureDependencies {
  rules?(): Promise<{ rules: SessionRules; revision: number }>;
  queue(): Promise<QueueStudent[]>;
  capture(): Promise<Blob>;
  save(record: CaptureRecord, student: QueueStudent, replace: boolean): Promise<void>;
  attempt(student: QueueStudent): Promise<void>;
  status(student: QueueStudent, status: 'Skipped' | 'Failed', reason: string): Promise<void>;
  session(status: 'Active' | 'Paused' | 'Completed'): Promise<void>;
  resetQuality(): void;
  time(): number;
}
const lockedStates = new Set(['CAPTURING', 'PROCESSING', 'SAVING', 'VERIFYING']);
export class CaptureController {
  private listeners = new Set<() => void>();
  private disposed = false;
  private countdownAt = 0;
  private advanceAt = 0;
  private clearAt: number | null = null;
  private busy = false;
  private replace = false;
  private failures = 0;
  private snapshot: CaptureSnapshot = {
    reviewPending: false,
    state: 'IDLE',
    student: null,
    quality: null,
    countdown: 0,
    preview: null,
    error: '',
    awaitingClear: false,
  };
  constructor(
    private deps: CaptureDependencies,
    public settings: AppSettings,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private patch(patch: Partial<CaptureSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  get locked() {
    return this.busy || lockedStates.has(this.snapshot.state);
  }
  async start() {
    this.patch({ state: 'INITIALIZING', error: '' });
    try {
      await this.deps.session('Active');
      await this.advance(false);
    } catch (e) {
      this.fail(e);
    }
  }
  cameraReady() {
    if (this.snapshot.student && !this.locked) {
      this.countdownAt = 0;
      this.deps.resetQuality();
      if (this.snapshot.preview && !this.snapshot.reviewPending)
        this.advanceAt = this.deps.time() + 1800;
      this.patch({
        state: this.snapshot.reviewPending
          ? 'REVIEW_REQUIRED'
          : this.snapshot.preview
            ? 'COMPLETED'
            : 'WAITING_FOR_FACE',
        quality: null,
        countdown: 0,
        error: '',
      });
    }
  }
  async advance(requireClear = true) {
    if (this.locked || this.disposed || this.snapshot.reviewPending) return;
    this.busy = true;
    this.advanceAt = 0;
    this.countdownAt = 0;
    this.replace = false;
    this.clearAt = null;
    this.failures = 0;
    this.patch({
      state: 'NEXT_STUDENT',
      preview: null,
      quality: null,
      countdown: 0,
      reviewPending: false,
    });
    this.deps.resetQuality();
    try {
      const next = (await this.deps.queue()).find((s) => s.membership.status === 'Pending');
      if (this.disposed) return;
      if (!next) {
        await this.deps.session('Completed');
        this.patch({ state: 'SESSION_COMPLETE', student: null, awaitingClear: false });
      } else this.patch({ state: 'WAITING_FOR_FACE', student: next, awaitingClear: requireClear });
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  frame(quality: QualityMetrics) {
    if (
      this.disposed ||
      this.locked ||
      [
        'PAUSED',
        'ERROR',
        'IDLE',
        'INITIALIZING',
        'SESSION_COMPLETE',
        'NEXT_STUDENT',
        'REVIEW_REQUIRED',
      ].includes(this.snapshot.state)
    )
      return;
    const time = this.deps.time();
    if (this.snapshot.state === 'COMPLETED') {
      if (this.settings.autoNext && time >= this.advanceAt) void this.advance();
      return;
    }
    this.patch({ quality });
    if (this.snapshot.awaitingClear) {
      if (quality.faceCount === 0) {
        this.clearAt ??= time;
        if (time - this.clearAt >= 500) {
          this.patch({ awaitingClear: false });
          this.deps.resetQuality();
        }
      } else this.clearAt = null;
      return;
    }
    if (!quality.ready) {
      this.countdownAt = 0;
      this.patch({
        state:
          quality.faceCount === 0
            ? 'WAITING_FOR_FACE'
            : quality.faceCount === 1 &&
                quality.faceCentered &&
                quality.faceSizeValid &&
                quality.headAngleValid &&
                quality.lightingValid &&
                quality.sharpnessValid
              ? 'STABILITY_CHECK'
              : 'NOT_READY',
        countdown: 0,
      });
      return;
    }
    if (!this.settings.autoCapture) {
      this.patch({ state: 'READY' });
      return;
    }
    if (this.snapshot.state !== 'COUNTDOWN') {
      this.countdownAt = time;
      this.patch({ state: 'COUNTDOWN', countdown: this.settings.countdownSeconds });
    }
    const remaining = this.settings.countdownSeconds * 1000 - (time - this.countdownAt);
    if (remaining <= 0) void this.capture(false);
    else this.patch({ countdown: Math.ceil(remaining / 1000) });
  }
  async capture(manual = false) {
    const s = this.snapshot;
    if (
      this.disposed ||
      this.locked ||
      !s.student ||
      s.reviewPending ||
      s.awaitingClear ||
      ['PAUSED', 'COMPLETED', 'ERROR', 'SESSION_COMPLETE'].includes(s.state) ||
      (!manual && (!s.quality?.ready || s.state !== 'COUNTDOWN'))
    )
      return;
    this.busy = true;
    // Freeze both identity and quality before any asynchronous image/storage work.
    const student = structuredClone(s.student),
      quality = s.quality ? structuredClone(s.quality) : null;
    this.patch({ state: 'CAPTURING', countdown: 0, error: '' });
    try {
      await this.deps.attempt(student);
      if (this.disposed) return;
      const ruleSet = (await this.deps.rules?.()) || { rules: defaultRules, revision: 0 };
      this.patch({ state: 'PROCESSING' });
      const imageBlob = await this.deps.capture();
      if (this.disposed) return;
      const record: CaptureRecord = {
        id: `${student.membership.sessionId}:${student.id}`,
        sessionId: student.membership.sessionId,
        studentId: student.id,
        enrollmentNumber: student.enrollmentNumber,
        filename: photoFilename(
          student.enrollmentNumber,
          this.settings.includeName ? student.name : undefined,
        ),
        imageBlob,
        capturedAt: new Date().toISOString(),
        quality,
        manual,
        ruleReview: {
          ...structuredClone(ruleSet),
          method: needsRuleReview(ruleSet.rules) ? 'operator' : 'not-required',
        },
      };
      if (needsRuleReview(ruleSet.rules)) {
        this.advanceAt = 0;
        this.patch({ state: 'REVIEW_REQUIRED', preview: record, reviewPending: true });
        return;
      }
      await this.persist(record, student);
    } catch (e) {
      await this.captureFailed(e, student);
    } finally {
      this.busy = false;
    }
  }
  async approveRules() {
    const s = this.snapshot;
    if (
      this.disposed ||
      this.locked ||
      !s.reviewPending ||
      !s.preview ||
      !s.student ||
      !['REVIEW_REQUIRED', 'PAUSED'].includes(s.state)
    )
      return;
    this.busy = true;
    const record = {
      ...s.preview,
      ruleReview: { ...s.preview.ruleReview!, confirmedAt: new Date().toISOString() },
    };
    try {
      await this.persist(record, s.student);
    } catch (e) {
      await this.captureFailed(e, s.student);
    } finally {
      this.busy = false;
    }
  }
  private async persist(record: CaptureRecord, student: QueueStudent) {
    this.patch({ state: 'SAVING' });
    await this.deps.save(record, student, this.replace);
    if (this.disposed) return;
    this.patch({ state: 'VERIFYING' });
    this.advanceAt = this.deps.time() + 1800;
    this.failures = 0;
    this.patch({
      state: 'COMPLETED',
      preview: record,
      reviewPending: false,
      student: { ...student, membership: { ...student.membership, status: 'Completed' } },
    });
  }
  private async captureFailed(e: unknown, student: QueueStudent) {
    this.patch({ preview: null, reviewPending: false });
    this.failures++;
    const reason = e instanceof Error ? e.message : 'Capture could not be saved.';
    try {
      await this.deps.status(student, 'Failed', reason);
    } catch {
      /* Preserve primary error; never claim a successful save. */
    }
    if (this.settings.autoRetry && this.failures < this.settings.maxAttempts && !this.disposed) {
      this.deps.resetQuality();
      this.patch({
        state: 'WAITING_FOR_FACE',
        quality: null,
        error: `Retry ${this.failures}/${this.settings.maxAttempts}: ${reason}`,
      });
    } else this.fail(e);
  }
  async skip(reason: string) {
    if (this.locked || !this.snapshot.student || this.snapshot.preview) return;
    this.busy = true;
    this.patch({ state: 'PAUSED', countdown: 0 });
    try {
      await this.deps.status(this.snapshot.student, 'Skipped', reason);
      this.busy = false;
      await this.advance();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  async pause() {
    if (this.locked || ['SESSION_COMPLETE', 'ERROR'].includes(this.snapshot.state)) return;
    this.patch({ state: 'PAUSED', countdown: 0 });
    this.countdownAt = 0;
    this.deps.resetQuality();
    try {
      await this.deps.session('Paused');
    } catch (e) {
      this.fail(e);
    }
  }
  async resume() {
    if (this.locked || !this.snapshot.student) return;
    try {
      await this.deps.session('Active');
      this.deps.resetQuality();
      this.patch({
        state: this.snapshot.reviewPending
          ? 'REVIEW_REQUIRED'
          : this.snapshot.preview
            ? 'COMPLETED'
            : 'WAITING_FOR_FACE',
        quality: null,
        error: '',
      });
      this.advanceAt = this.deps.time() + 1800;
    } catch (e) {
      this.fail(e);
    }
  }
  retake() {
    if (this.locked || !this.snapshot.preview) return;
    if (!this.snapshot.reviewPending) this.replace = true;
    this.advanceAt = 0;
    this.countdownAt = 0;
    this.deps.resetQuality();
    this.patch({
      state: 'WAITING_FOR_FACE',
      preview: null,
      quality: null,
      awaitingClear: false,
      reviewPending: false,
    });
  }
  async select(student: QueueStudent) {
    if (this.locked || this.snapshot.reviewPending) return;
    this.busy = true;
    this.advanceAt = 0;
    this.countdownAt = 0;
    this.replace = student.membership.status === 'Completed';
    this.deps.resetQuality();
    try {
      await this.deps.session('Active');
      this.patch({
        student,
        state: 'WAITING_FOR_FACE',
        preview: null,
        reviewPending: false,
        quality: null,
        countdown: 0,
        awaitingClear: false,
        error: '',
      });
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }
  confirmNextPresent() {
    if (!this.locked) {
      this.patch({ awaitingClear: false });
      this.deps.resetQuality();
    }
  }
  fail(error: unknown) {
    this.patch({
      state: 'ERROR',
      countdown: 0,
      error: error instanceof Error ? error.message : 'An unexpected error occurred.',
    });
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.countdownAt = 0;
    this.advanceAt = 0;
  }
}
