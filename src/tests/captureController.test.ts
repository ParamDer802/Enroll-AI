import { describe, it, expect, vi } from 'vitest';
import { CaptureController } from '../services/session/captureController';
import { defaults } from '../database/db';
import type { QualityMetrics, QueueStudent, StudentStatus } from '../types';
const ready = {
  faceDetected: true,
  faceCount: 1,
  faceCentered: true,
  faceSizeValid: true,
  headAngleValid: true,
  lightingValid: true,
  sharpnessValid: true,
  stable: true,
  ready: true,
  brightness: 120,
  sharpness: 200,
  stabilityMs: 2000,
  message: 'Ready',
  analysisMs: 10,
} satisfies QualityMetrics;
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function setup(autoNext = true, requireSheet = false) {
  let time = 100;
  const queue: QueueStudent[] = [1, 2].map((i) => ({
    id: `s${i}`,
    name: `Student ${i}`,
    enrollmentNumber: `00${i}`,
    createdAt: new Date().toISOString(),
    demo: false,
    membership: {
      id: `m${i}`,
      sessionId: 'session',
      studentId: `s${i}`,
      order: i,
      status: 'Pending',
      attempts: 0,
    },
  }));
  const save = vi.fn(async (_record: unknown, s: QueueStudent, _replace: boolean) => {
    queue.find((q) => q.id === s.id)!.membership.status = 'Completed';
  });
  const deps = {
    rules: async () => ({ rules: { requireSheet, instructions: '' }, revision: 2 }),
    queue: async () => structuredClone(queue),
    capture: vi.fn(async () => new Blob(['x'.repeat(150)], { type: 'image/jpeg' })),
    save,
    attempt: vi.fn(async () => {}),
    status: vi.fn(async (s: QueueStudent, status: 'Skipped' | 'Failed') => {
      queue.find((q) => q.id === s.id)!.membership.status = status;
    }),
    session: vi.fn(async () => {}),
    resetQuality: vi.fn(),
    time: () => time,
  };
  const controller = new CaptureController(deps, { ...defaults, autoNext });
  return {
    controller,
    queue,
    deps,
    setTime: (value: number) => {
      time = value;
    },
  };
}
describe('capture controller safety and advancement', () => {
  it('requires review of the captured image before manual or automatic save and advance', async () => {
    const { controller: c, deps, setTime, queue } = setup(true, true);
    await c.start();
    c.frame(ready);
    setTime(3100);
    c.frame(ready);
    await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'REVIEW_REQUIRED', reviewPending: true });
    expect(deps.save).not.toHaveBeenCalled();
    setTime(15000);
    c.frame(ready);
    await c.advance();
    await c.select(queue[1]);
    await c.capture(true);
    expect(c.getSnapshot().student?.id).toBe('s1');
    expect(deps.capture).toHaveBeenCalledTimes(1);
    c.cameraReady();
    expect(c.getSnapshot().state).toBe('REVIEW_REQUIRED');
    await c.pause();
    await c.resume();
    expect(c.getSnapshot().state).toBe('REVIEW_REQUIRED');
    await c.approveRules();
    expect(deps.save).toHaveBeenCalledTimes(1);
    expect(deps.save.mock.calls[0][0]).toMatchObject({
      ruleReview: {
        revision: 2,
        method: 'operator',
        confirmedAt: expect.any(String),
        rules: { requireSheet: true },
      },
    });
    await c.approveRules();
    expect(deps.save).toHaveBeenCalledTimes(1);
    await c.advance(false);
    await c.capture(true);
    expect(c.getSnapshot()).toMatchObject({ state: 'REVIEW_REQUIRED', student: { id: 's2' } });
    expect(deps.save).toHaveBeenCalledTimes(1);
  });
  it('retaking an unreviewed image does not save it or carry confirmation to the next attempt', async () => {
    const { controller: c, deps } = setup(false, true);
    await c.start();
    await c.capture(true);
    c.retake();
    expect(c.getSnapshot()).toMatchObject({ preview: null, reviewPending: false });
    await c.approveRules();
    expect(deps.save).not.toHaveBeenCalled();
    await c.capture(true);
    await c.approveRules();
    expect(deps.capture).toHaveBeenCalledTimes(2);
    expect(deps.save.mock.calls[0][2]).toBe(false);
  });
  it('does not mark reviewed photos complete when their final save fails', async () => {
    const { controller: c, deps } = setup(true, true);
    deps.save.mockRejectedValue(new Error('Rules changed'));
    await c.start();
    await c.capture(true);
    await c.approveRules();
    expect(c.getSnapshot()).toMatchObject({ state: 'ERROR', reviewPending: false, preview: null });
    expect(deps.status).toHaveBeenCalledWith(expect.anything(), 'Failed', 'Rules changed');
  });
  it('keeps a verified preview locked against recapture when the camera restarts', async () => {
    const { controller: c, deps, setTime } = setup(false);
    await c.start();
    await c.capture(true);
    c.cameraReady();
    setTime(9000);
    c.frame(ready);
    expect(c.getSnapshot().state).toBe('COMPLETED');
    expect(c.getSnapshot().preview?.filename).toBe('001.jpg');
    expect(deps.capture).toHaveBeenCalledTimes(1);
  });
  it('captures automatically once, binds enrollment, then advances after save', async () => {
    const { controller: c, deps, setTime } = setup();
    await c.start();
    c.frame(ready);
    expect(c.getSnapshot().countdown).toBe(3);
    setTime(3100);
    c.frame(ready);
    c.frame(ready);
    await flush();
    expect(deps.capture).toHaveBeenCalledTimes(1);
    expect(deps.save.mock.calls[0][0]).toMatchObject({
      studentId: 's1',
      filename: '001.jpg',
      enrollmentNumber: '001',
    });
    expect(c.getSnapshot().state).toBe('COMPLETED');
    setTime(5000);
    c.frame(ready);
    await flush();
    expect(c.getSnapshot()).toMatchObject({
      state: 'WAITING_FOR_FACE',
      preview: null,
      student: { id: 's2' },
      awaitingClear: true,
    });
  });
  it('cancels countdown on any invalid quality, including lighting', async () => {
    const { controller: c, deps, setTime } = setup();
    await c.start();
    c.frame(ready);
    setTime(2000);
    c.frame({ ...ready, ready: false, lightingValid: false });
    expect(c.getSnapshot().state).toBe('NOT_READY');
    setTime(3100);
    c.frame(ready);
    expect(c.getSnapshot().countdown).toBe(3);
    expect(deps.capture).not.toHaveBeenCalled();
  });
  it('locks the student against skip, select and double capture until save finishes', async () => {
    const { controller: c, deps, queue } = setup();
    let release!: () => void;
    deps.save.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    await c.start();
    const pending = c.capture(true);
    await flush();
    expect(c.locked).toBe(true);
    await c.skip('Absent');
    await c.select(queue[1]);
    await c.capture(true);
    expect(c.getSnapshot().student?.id).toBe('s1');
    expect(deps.capture).toHaveBeenCalledTimes(1);
    release();
    await pending;
    expect(c.locked).toBe(false);
  });
  it('does not advance or mark completed when saving fails', async () => {
    const { controller: c, deps, setTime } = setup();
    deps.save.mockRejectedValue(new Error('Storage full'));
    await c.start();
    await c.capture(true);
    setTime(10000);
    c.frame(ready);
    expect(c.getSnapshot()).toMatchObject({
      state: 'ERROR',
      student: { id: 's1' },
      preview: null,
      error: 'Storage full',
    });
    expect(deps.status).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1' }),
      'Failed',
      'Storage full',
    );
  });
  it('retakes replace the same record and cancel the pending advance', async () => {
    const { controller: c, deps, setTime } = setup();
    await c.start();
    await c.capture(true);
    c.retake();
    setTime(5000);
    expect(c.getSnapshot().preview).toBeNull();
    await c.capture(true);
    expect(deps.save.mock.calls[1][0]).toMatchObject({ id: 'session:s1', filename: '001.jpg' });
    expect(deps.save.mock.calls[1][2]).toBe(true);
  });
  it('pause cancels countdown and processing; resume starts fresh', async () => {
    const { controller: c, deps, setTime } = setup();
    await c.start();
    c.frame(ready);
    await c.pause();
    setTime(10000);
    c.frame(ready);
    expect(deps.capture).not.toHaveBeenCalled();
    await c.resume();
    c.frame(ready);
    expect(c.getSnapshot().countdown).toBe(3);
  });
  it('manual accept mode never advances on its own', async () => {
    const { controller: c, setTime } = setup(false);
    await c.start();
    await c.capture(true);
    setTime(99999);
    c.frame(ready);
    expect(c.getSnapshot().student?.id).toBe('s1');
    await c.advance();
    expect(c.getSnapshot().student?.id).toBe('s2');
  });
  it('requires a continuous clear frame before arming next capture', async () => {
    const { controller: c, setTime } = setup();
    await c.start();
    await c.capture(true);
    await c.advance();
    c.frame(ready);
    expect(c.getSnapshot().awaitingClear).toBe(true);
    setTime(1000);
    c.frame({ ...ready, faceCount: 0, ready: false });
    setTime(1550);
    c.frame({ ...ready, faceCount: 0, ready: false });
    expect(c.getSnapshot().awaitingClear).toBe(false);
  });
  it('skips, finishes a session, and recovers pending work on a new controller', async () => {
    const { controller: c, deps } = setup();
    await c.start();
    await c.skip('Absent');
    expect(c.getSnapshot().student?.id).toBe('s2');
    const resumed = new CaptureController(deps, defaults);
    await resumed.start();
    expect(resumed.getSnapshot().student?.id).toBe('s2');
    await resumed.skip('Absent');
    expect(resumed.getSnapshot().state).toBe('SESSION_COMPLETE');
    expect(deps.session).toHaveBeenLastCalledWith('Completed');
  });
  it('disposed controllers cannot save or capture new frames', async () => {
    const { controller: c, deps, setTime } = setup();
    await c.start();
    c.frame(ready);
    c.dispose();
    setTime(5000);
    c.frame(ready);
    await c.capture(true);
    expect(deps.capture).not.toHaveBeenCalled();
  });
});
