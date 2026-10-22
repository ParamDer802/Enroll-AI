import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Camera,
  CameraOff,
  Pause,
  Play,
  SkipForward,
  ArrowLeft,
  ListOrdered,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { AppSettings, QueueStudent } from '../types';
import { db, getSettings, saveSettings } from '../database/db';
import { getQueue, setStudentStatus, setSessionStatus } from '../database/sessions';
import { saveCapture, recordAttempt } from '../database/captures';
import { CaptureController } from '../services/session/captureController';
import { openCamera, stopCamera, cameras } from '../services/camera/cameraService';
import { PhotoFaceDetector } from '../vision/faceDetector';
import { getSessionRules, needsRuleReview, SHEET_RULE } from '../database/rules';
import { RuleReviewModal } from '../components/RuleReviewModal';
import { QualityEngine } from '../vision/qualityEngine';
import { captureJpeg } from '../utils/image';
import { Button, Badge, CheckRow, Modal, Photo, Progress, useToast, Empty } from '../components/ui';
export function CapturePage({
  sessionId,
  retakeStudentId,
  settings,
  onExit,
}: {
  sessionId: string;
  retakeStudentId?: string;
  settings: AppSettings;
  onExit: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    detector = useRef<PhotoFaceDetector | null>(null),
    engine = useRef(new QualityEngine()),
    mounted = useRef(true),
    generation = useRef(0),
    audio = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false),
    [initializing, setInitializing] = useState(false),
    [startupStage, setStartupStage] = useState(''),
    [cameraLabel, setCameraLabel] = useState(''),
    [cameraError, setCameraError] = useState(''),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [cameraId, setCameraId] = useState(settings.cameraId),
    [skip, setSkip] = useState(false),
    [reason, setReason] = useState(''),
    [queueOpen, setQueueOpen] = useState(false),
    [ownsLock, setOwnsLock] = useState(false),
    [cameraVersion, setCameraVersion] = useState(0),
    toast = useToast();
  const data = useLiveQuery(
    async () => ({ session: await db.sessions.get(sessionId), queue: await getQueue(sessionId) }),
    [sessionId],
  );
  const controller = useMemo(
    () =>
      new CaptureController(
        {
          rules: () => getSessionRules(sessionId),
          queue: () => getQueue(sessionId),
          capture: () => captureJpeg(video.current!, settings.jpegQuality),
          save: saveCapture,
          attempt: recordAttempt,
          status: (s, status, why) => setStudentStatus(s.membership.id, status, why),
          session: (status) => setSessionStatus(sessionId, status),
          resetQuality: () => engine.current.reset(),
          time: () => performance.now(),
        },
        settings,
      ),
    [sessionId, settings],
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot),
    q = snapshot.quality;
  const locked = controller.locked,
    paused = snapshot.state === 'PAUSED',
    done = snapshot.state === 'SESSION_COMPLETE',
    completed = data?.queue.filter((s) => s.membership.status === 'Completed').length || 0,
    total = data?.queue.length || 0;
  useEffect(() => {
    mounted.current = true;
    let release: (() => void) | undefined,
      cancelled = false;
    if (!navigator.locks) {
      setCameraError(
        'This browser cannot safely lock the capture queue. Use a current Chrome, Edge, Firefox or Safari browser.',
      );
      return;
    }
    void navigator.locks
      .request(`enroll-ai-capture`, { ifAvailable: true }, async (lock) => {
        if (cancelled) return;
        if (!lock) {
          setCameraError(
            'A capture station is already open in another tab. Close it and reopen this session.',
          );
          return;
        }
        await controller.start();
        if (retakeStudentId) {
          const student = (await getQueue(sessionId)).find((s) => s.id === retakeStudentId);
          if (student) await controller.select(student);
        }
        if (cancelled) return;
        // Do not enable controls while the controller is still loading its queue.
        setOwnsLock(true);
        await new Promise<void>((resolve) => {
          release = resolve;
          if (cancelled) resolve();
        });
      })
      .catch((e) => {
        if (!cancelled) setCameraError(e.message);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      generation.current++;
      release?.();
      controller.dispose();
      stopCamera(stream.current);
      detector.current?.close();
      detector.current = null;
      void audio.current?.close().catch(() => {});
    };
  }, [controller, sessionId, retakeStudentId]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const available = await cameras();
        if (!cancelled) setDevices(available);
      } catch {
        // Enumeration is optional: a permitted default stream may still work.
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) void controller.pause();
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (controller.locked || controller.getSnapshot().reviewPending) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [controller]);
  async function enable(selected = cameraId) {
    if (initializing || locked || !ownsLock) return;
    const wasPaused = controller.getSnapshot().state === 'PAUSED';
    const token = ++generation.current;
    setInitializing(true);
    setStartupStage('Opening camera… Allow camera access if your browser asks.');
    setCameraId(selected);
    setCameraError('');
    setEnabled(false);
    stopCamera(stream.current);
    detector.current?.close();
    detector.current = null;
    let acquired: MediaStream | null = null,
      vision: PhotoFaceDetector | null = null;
    try {
      acquired = await openCamera({ ...settings, cameraId: selected });
      if (!mounted.current || token !== generation.current) {
        stopCamera(acquired);
        return;
      }
      stream.current = acquired;
      const element = video.current!;
      element.srcObject = acquired;
      element.muted = true;
      await element.play();
      setStartupStage('Camera connected. Loading photo-quality checks…');
      vision = new PhotoFaceDetector();
      await vision.initialize();
      if (!mounted.current || token !== generation.current) {
        stopCamera(acquired);
        vision.close();
        return;
      }
      detector.current = vision;
      const track = acquired.getVideoTracks()[0];
      const actualId = track.getSettings().deviceId || selected;
      setCameraLabel(track.label || 'Connected camera');
      setCameraId(actualId);
      try {
        setDevices(await cameras());
      } catch {
        /* Keep the working stream. */
      }
      await saveSettings({ ...(await getSettings()), cameraId: actualId });
      acquired.getVideoTracks()[0].addEventListener('ended', () => {
        if (mounted.current) {
          setEnabled(false);
          setCameraError('Camera disconnected. Reconnect it and choose Retry camera.');
          controller.fail(new Error('Camera disconnected. Your saved photos are safe.'));
        }
      });
      if (settings.sound) {
        try {
          audio.current ??= new AudioContext();
          // Some embedded browsers suspend audio. Sound must never block video.
          void audio.current.resume().catch(() => {});
        } catch {
          /* Countdown sound is optional. */
        }
      }
      engine.current.reset();
      controller.cameraReady();
      if (wasPaused) await controller.pause();
      setEnabled(true);
      setCameraVersion((v) => v + 1);
    } catch (e) {
      stopCamera(acquired);
      vision?.close();
      if (mounted.current) {
        setCameraError(
          (e as Error).message.includes('Camera')
            ? (e as Error).message
            : `Camera or AI initialization failed: ${(e as Error).message}. Check that offline assets are available, then retry.`,
        );
      }
    } finally {
      if (mounted.current) setInitializing(false);
    }
  }
  useEffect(() => {
    if (!enabled) return;
    let handle = 0,
      previous = 0,
      videoTime = -1,
      staleAt = performance.now();
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    function tick(time: number) {
      handle = requestAnimationFrame(tick);
      if (
        controller.getSnapshot().state === 'PAUSED' ||
        controller.locked ||
        !video.current ||
        !detector.current
      )
        return;
      const v = video.current;
      if (v.currentTime === videoTime) {
        if (time - staleAt > 5000) {
          controller.fail(new Error('Camera frames stopped. Retry camera to continue.'));
          stopCamera(stream.current);
          setEnabled(false);
        }
        return;
      }
      staleAt = time;
      if (time - previous < 125 || v.readyState < 2 || !v.videoWidth) return;
      previous = time;
      videoTime = v.currentTime;
      try {
        const started = performance.now();
        canvas.width = 480;
        canvas.height = Math.round((480 * v.videoHeight) / v.videoWidth);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const faces = detector.current.detect(canvas, time),
          face = faces.length === 1 ? faces[0] : undefined;
        const x = face
            ? Math.max(0, Math.min(canvas.width - 1, Math.floor(face.x * canvas.width)))
            : 0,
          y = face
            ? Math.max(0, Math.min(canvas.height - 1, Math.floor(face.y * canvas.height)))
            : 0;
        const width = face
            ? Math.max(1, Math.min(canvas.width - x, Math.floor(face.width * canvas.width)))
            : canvas.width,
          height = face
            ? Math.max(1, Math.min(canvas.height - y, Math.floor(face.height * canvas.height)))
            : canvas.height;
        const metrics = engine.current.evaluate(
          faces,
          ctx.getImageData(x, y, width, height),
          settings,
          time,
          performance.now() - started,
        );
        controller.frame(metrics);
      } catch (e) {
        controller.fail(e);
        stopCamera(stream.current);
        setEnabled(false);
      }
    }
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [enabled, cameraVersion, controller, settings]);
  useEffect(() => {
    if (!snapshot.countdown || !settings.sound || !audio.current) return;
    try {
      const context = audio.current,
        osc = context.createOscillator(),
        gain = context.createGain();
      osc.frequency.value = snapshot.countdown === 1 ? 880 : 660;
      gain.gain.setValueAtTime(0.04, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      osc.connect(gain).connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.13);
    } catch {
      /* Audio is optional. */
    }
  }, [snapshot.countdown, settings.sound]);
  const manual = useCallback(() => {
    if (
      enabled &&
      !locked &&
      !snapshot.awaitingClear &&
      !paused &&
      !snapshot.preview &&
      window.confirm(
        'Capture manually for the displayed student? This overrides the automatic photo-quality checks and will be recorded as a manual capture.',
      )
    )
      void controller.capture(true);
  }, [enabled, locked, snapshot.awaitingClear, paused, snapshot.preview, controller]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches('input,select,textarea,button') ||
        document.querySelector('dialog[open]')
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        manual();
      }
      if (e.key.toLowerCase() === 'r' && snapshot.preview) controller.retake();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [manual, controller, snapshot.preview]);
  function exit() {
    if (locked) return;
    if (
      snapshot.reviewPending &&
      !window.confirm('Discard this unreviewed photo? The student will remain uncaptured.')
    )
      return;
    void controller.pause().then(onExit);
  }
  function pick(s: QueueStudent) {
    if (
      s.membership.status === 'Completed' &&
      !window.confirm(`Replace the saved photo for ${s.enrollmentNumber} — ${s.name}?`)
    )
      return;
    void controller.select(s);
    setQueueOpen(false);
  }
  if (data?.session?.status === 'Archived')
    return (
      <Empty
        title="This session is archived"
        description="Restore it in Capture sessions before taking or replacing a photograph."
        action={<Button onClick={onExit}>Back to sessions</Button>}
      />
    );
  return (
    <>
      <div className="capture-heading">
        <Button variant="ghost" onClick={exit} disabled={locked}>
          <ArrowLeft size={17} />
          Sessions
        </Button>
        <div>
          <h1>{data?.session?.name || 'Capture station'}</h1>
          <span>
            {data?.session?.demo ? 'DEMO DATA · ' : ''}
            {completed} / {total} photos completed
          </span>
        </div>
        <Button
          variant="secondary"
          disabled={locked}
          onClick={() => {
            void controller.pause();
            setQueueOpen(true);
          }}
        >
          <ListOrdered size={18} />
          Student queue
        </Button>
      </div>
      <Progress value={total ? (completed / total) * 100 : 0} />
      {done ? (
        <section className="panel session-complete">
          <CheckCircle2 size={52} />
          <h2>Queue complete.</h2>
          <p>
            {completed} of {total} students have verified photos. Review skipped or failed students
            in the queue.
          </p>
          <Button onClick={() => setQueueOpen(true)}>Review student queue</Button>
          <Button variant="secondary" onClick={onExit}>
            Back to sessions
          </Button>
        </section>
      ) : null}
      {needsRuleReview(data?.session?.rules) && (
        <div className="roster-notice">
          <ShieldCheck size={20} />
          <div>
            <strong>Session rules · Operator review required</strong>
            {data?.session?.rules?.requireSheet && <p>{SHEET_RULE}</p>}
            {data?.session?.rules?.instructions && <p>{data.session.rules.instructions}</p>}
            <p>
              Each captured photo must be reviewed before saving or advancing. AI checks photo
              quality only.
            </p>
          </div>
        </div>
      )}
      <div className={`capture-layout ${done ? 'capture-finished' : ''}`}>
        <section className="capture-stage">
          <div className="current-student">
            <div>
              <span className="eyebrow">CURRENT STUDENT · FROM ENROLLMENT LIST</span>
              <h2>{snapshot.student?.name || 'Loading student…'}</h2>
              {snapshot.student?.generatedName && (
                <p className="hint">Generated name — confirm against your class roster.</p>
              )}
              <span className="mono enrollment">{snapshot.student?.enrollmentNumber || '—'}</span>
            </div>
            <Badge kind={settings.autoCapture ? 'success' : 'neutral'}>
              {settings.autoCapture ? 'Auto mode' : 'Manual mode'}
            </Badge>
          </div>
          <div className="camera-view">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              style={{ transform: settings.mirror ? 'scaleX(-1)' : 'none' }}
            />
            <div className="camera-top">
              <span className="camera-label">
                <span className={enabled ? 'online-dot' : 'status-dot'} />
                {enabled ? 'LIVE CAMERA' : 'CAPTURE STATION'}
              </span>
              {enabled && (
                <span className="camera-label">
                  {video.current?.videoWidth} × {video.current?.videoHeight}
                </span>
              )}
            </div>
            {enabled && !snapshot.preview && (
              <>
                <div className={`face-guide ${q?.ready ? 'ready' : ''}`}>
                  <span className="corner tl" />
                  <span className="corner tr" />
                  <span className="corner bl" />
                  <span className="corner br" />
                  <svg viewBox="0 0 200 260" aria-hidden="true">
                    <ellipse cx="100" cy="100" rx="57" ry="76" />
                    <path d="M5 255Q5 183 67 178M195 255Q195 183 133 178" />
                  </svg>
                </div>
                <div className="camera-guidance" role="status">
                  {snapshot.awaitingClear
                    ? 'Let the previous student step out of frame'
                    : paused
                      ? 'Session paused'
                      : q?.message || 'Waiting for a camera frame…'}
                </div>
              </>
            )}
            {snapshot.state === 'COUNTDOWN' && (
              <div className="countdown" aria-live="assertive">
                {snapshot.countdown}
              </div>
            )}
            {(!enabled || initializing) && (
              <div className="camera-permission">
                <span>
                  <Camera size={36} />
                </span>
                <h2>
                  {initializing
                    ? 'Connecting your camera…'
                    : cameraError
                      ? 'Let’s reconnect your camera'
                      : 'Ready when you are.'}
                </h2>
                <p>
                  {(initializing ? startupStage : cameraError) ||
                    'Enable your camera to begin. Photo quality is analyzed locally on this device.'}
                </p>
                <Button
                  busy={initializing}
                  disabled={!ownsLock || done}
                  onClick={() => void enable()}
                >
                  <Camera size={17} />
                  {cameraError ? 'Retry camera' : 'Enable camera'}
                </Button>
                {cameraError && cameraId && (
                  <Button
                    variant="secondary"
                    disabled={initializing || !ownsLock || done}
                    onClick={() => void enable('')}
                  >
                    Try browser default camera
                  </Button>
                )}
                <small>
                  <ShieldCheck size={14} /> No photos are sent to an AI service
                </small>
              </div>
            )}
            {paused && enabled && (
              <div className="pause-overlay">
                <Pause size={36} />
                <h2>Session paused</h2>
                <p>Your progress has been saved.</p>
                <Button onClick={() => void controller.resume()}>
                  <Play size={17} />
                  Resume session
                </Button>
              </div>
            )}
            {snapshot.preview && !snapshot.reviewPending && (
              <div className="captured-overlay">
                <Photo blob={snapshot.preview.imageBlob} className="captured-photo" />
                <div>
                  <Badge kind="success">Saved & verified</Badge>
                  <h3>{snapshot.student?.name}</h3>
                  <p className="mono">{snapshot.preview.filename}</p>
                  <div className="inline-actions">
                    <Button variant="secondary" onClick={() => controller.retake()}>
                      <RotateCcw size={16} />
                      Retake
                    </Button>
                    <Button onClick={() => void controller.advance()}>Next student</Button>
                  </div>
                  <small>
                    {settings.autoNext
                      ? 'Moving to the next student automatically…'
                      : 'Accept this photo to continue.'}
                  </small>
                </div>
              </div>
            )}
          </div>
          <div className="camera-controls">
            <Button
              variant="secondary"
              onClick={() => (paused ? void controller.resume() : void controller.pause())}
              disabled={!enabled || locked || done}
            >
              {paused ? <Play size={17} /> : <Pause size={17} />} {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              className="capture-button"
              disabled={
                !enabled ||
                locked ||
                paused ||
                !!snapshot.preview ||
                snapshot.awaitingClear ||
                done ||
                snapshot.state === 'ERROR'
              }
              onClick={manual}
            >
              <Camera size={20} />
              Capture manually
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void controller.pause();
                setSkip(true);
              }}
              disabled={!enabled || locked || !!snapshot.preview || done}
            >
              <SkipForward size={17} />
              Skip
            </Button>
          </div>
          <p className="capture-disclaimer">
            <ShieldCheck size={14} /> Confirm the displayed student before capture. AI checks photo
            quality only.
          </p>
        </section>
        <aside className="quality-panel panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ON-DEVICE ANALYSIS</span>
              <h2>Photo quality</h2>
            </div>
            <ScanIndicator ready={!!q?.ready} />
          </div>
          <div className="quality-checks">
            <CheckRow
              pass={q?.faceDetected}
              label="Face detected"
              detail={
                q
                  ? `${q.faceCount} face${q.faceCount === 1 ? '' : 's'} visible`
                  : 'Waiting for camera'
              }
            />
            <CheckRow pass={q ? q.faceCount === 1 : undefined} label="One student in frame" />
            <CheckRow pass={q?.faceCentered} label="Face centered" />
            <CheckRow pass={q?.faceSizeValid} label="Good distance" />
            <CheckRow
              pass={q?.headAngleValid}
              label="Head held straight"
              detail="Basic roll estimate from eye points"
            />
            <CheckRow
              pass={q?.lightingValid}
              label="Even lighting"
              detail={q ? `Brightness ${Math.round(q.brightness)} / 255` : undefined}
            />
            <CheckRow
              pass={q?.sharpnessValid}
              label="Image is sharp"
              detail={
                q
                  ? `Sharpness ${Math.round(q.sharpness)} · minimum ${settings.blurThreshold}`
                  : undefined
              }
            />
            <CheckRow
              pass={q?.stable}
              label="Holding still"
              detail={
                q
                  ? `${(Math.min(q.stabilityMs, settings.stabilityMs) / 1000).toFixed(1)} / ${settings.stabilityMs / 1000} seconds`
                  : undefined
              }
            />
          </div>
          <div className={`quality-status ${q?.ready ? 'ready' : ''}`}>
            <strong>{snapshot.state.replaceAll('_', ' ')}</strong>
            <p>
              {snapshot.awaitingClear
                ? 'Waiting for the frame to clear between students.'
                : snapshot.error || 'Every check must pass before automatic capture.'}
            </p>
          </div>
          {snapshot.awaitingClear && (
            <Button
              variant="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    'Have you verified that the next displayed student is now in front of the camera?',
                  )
                )
                  controller.confirmNextPresent();
              }}
            >
              I’ve verified the next student
            </Button>
          )}
          {snapshot.state === 'ERROR' && (
            <Button onClick={() => void controller.resume()}>Retry current student</Button>
          )}
          <div className="camera-settings">
            <label>
              Camera
              <select
                aria-label="Select camera"
                disabled={locked || initializing || !ownsLock}
                value={cameraId}
                onChange={(e) => void enable(e.target.value)}
              >
                <option value="">Browser default camera</option>
                {cameraId && !devices.some((device) => device.deviceId === cameraId) && (
                  <option value={cameraId}>
                    {cameraLabel || 'Saved camera (reconnect or choose another)'}
                  </option>
                )}
                {devices.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">
              {enabled ? `Connected: ${cameraLabel}. ` : ''}If the picture is blank, choose your
              laptop or USB webcam here. Virtual cameras such as DroidCam need their companion app
              connected.
            </p>
            <p className="hint">
              Analysis runs at up to 8 frames/sec.{' '}
              {q ? `Last analysis: ${Math.round(q.analysisMs)} ms.` : ''}
            </p>
          </div>
        </aside>
      </div>
      {snapshot.reviewPending && snapshot.preview && (
        <RuleReviewModal
          key={snapshot.preview.capturedAt}
          record={snapshot.preview}
          busy={locked}
          onApprove={() => void controller.approveRules()}
          onRetake={() => controller.retake()}
        />
      )}
      {skip && (
        <Modal
          title="Skip this student?"
          onClose={() => {
            setSkip(false);
            void controller.resume();
          }}
        >
          <h3>{snapshot.student?.name}</h3>
          <p className="mono">{snapshot.student?.enrollmentNumber}</p>
          <label>
            Reason (optional)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="e.g. Absent today"
            />
          </label>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setSkip(false);
                void controller.resume();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setSkip(false);
                void controller.skip(reason);
                setReason('');
              }}
            >
              Skip student
            </Button>
          </div>
        </Modal>
      )}
      {queueOpen && (
        <Modal title="Student queue" onClose={() => setQueueOpen(false)}>
          <p className="muted">
            Choose a pending or skipped student to continue. Selecting a completed student requests
            a replacement photo.
          </p>
          <div className="student-picker queue-picker">
            {data?.queue.map((s) => (
              <button key={s.id} onClick={() => pick(s)} disabled={locked}>
                <span>
                  {s.name}
                  <small className="mono">{s.enrollmentNumber}</small>
                </span>
                <Badge kind={s.membership.status === 'Completed' ? 'success' : 'neutral'}>
                  {s.membership.status}
                </Badge>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function ScanIndicator({ ready }: { ready: boolean }) {
  return (
    <span className={`analysis-indicator ${ready ? 'ready' : ''}`}>
      <Camera size={21} />
    </span>
  );
}
