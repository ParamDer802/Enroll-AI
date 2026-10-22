# AIML Group no. 3 — ENROLL-AI V1

Automated Student Photo Capture — Simple, Fast & Accurate.

A responsive, local-first React/TypeScript PWA for importing enrollment rosters, running capture sessions, checking photo quality, saving enrollment-named JPEGs and exporting results. There is **no face recognition or identity inference**. The operator verifies the student; identity always comes from the selected enrollment record.

## Run locally

Requirements: Node.js 22.12+ (tested with Node 24), npm, and a current browser with camera, IndexedDB and Web Locks support.

```powershell
git clone https://github.com/ParamDer802/Enroll-AI.git
cd Enroll-AI
npm ci
npm run setup:vision
npm run dev
```

The development server binds only to `127.0.0.1`. Open its printed URL. For a production/offline preview:

```powershell
npm run build
npm run preview
```

`setup:vision` verifies the model against the committed SHA-256 and copies the pinned MediaPipe WASM runtime into public assets. The model and runtime are already included in this checkout. The production build refuses to proceed without these offline assets. No model download happens during capture.

## Capture workflow

This workspace includes the requested **79-student AIML, Semester 5 roster**, from `24012250910001` to `24012250910079`, and its ready-to-start session. Names are generated placeholders, labeled throughout the directory, capture screen and reports. Use the pencil in Students to replace them with confirmed names. All new capture statuses start Pending; no photos or quality results are seeded.

The roster is installed once per browser database in an atomic migration. Reopening or updating the app does not duplicate it or overwrite existing enrollments, names, photos or progress. Other browser profiles have their own local records.

1. Import an `.xlsx`, `.xls` or `.csv` roster. Select the enrollment and name columns, review validation, and confirm the import. Only the first worksheet is read. Use text-formatted enrollment cells; zeros already discarded by a numeric spreadsheet cannot be restored.
2. Create a session and choose its students. Demo data is opt-in and explicitly labeled; it cannot be mixed with real roster data in a session.
3. Start capture and enable the camera. Verify the displayed enrollment belongs to the student in front of the camera.
4. The detector checks one face, position, size and basic head roll. Pixel analysis measures brightness and Laplacian sharpness. A stable, acceptable frame starts a three-second countdown. Any failed quality criterion cancels that countdown.
5. Capture uses the full camera resolution. The JPEG is decoded, saved, read back and verified before the student’s status and audit entry commit in the same IndexedDB transaction.
6. Auto-next accepts a verified photo after 1.8 seconds. The frame must be clear for 500 ms before the next student is armed. An explicit operator confirmation can release this interlock if the next student is already in place.
7. Review results in Capture history. Download individual photos, a ZIP with JPEGs and a CSV report, or Excel/CSV reports. Folder export is available where the browser supports it.

Pause, skip with a reason, retry, explicit replacement/retake and manual capture are available. Manual capture requires confirmation and is recorded as a quality override. Browser visibility changes pause analysis. A Web Lock prevents two tabs from capturing into the same local database concurrently.

## Configuration

### Rules for each session

Use **Capture sessions → Edit rules** (or set rules when creating a session). Enable **Require a sheet held with both hands** to require the entire sheet below the face, both hands holding it, and an uncovered face. Optional instructions can add other requirements.

Photos in a session with rules stop at **Review session rules** before storage. The operator inspects the actual captured image, checks every requirement, then chooses **Confirm rules & save photo** or **Retake photo**. This applies to automatic and manual capture. The face detector does not detect paper, hands or text; rule confirmation is explicitly human review. Approval does not carry to another photo, student or retake. Leaving or refreshing with an unreviewed image discards that unsaved image.

Rules cannot be edited while any capture station is open. Changes apply to subsequent captures and retakes; they do not retrospectively certify older photographs. History and reports retain the rules revision, rule text and operator-confirmation timestamp for each new capture. Older photographs remain intact and are labeled as having no recorded rule review.

If the preview is blank, use **Camera** in the capture station to choose your laptop/USB webcam explicitly. A virtual camera may be the browser default. The station displays the connected device name, remembers its actual ID, and refreshes the list when devices change. If a saved device is unavailable, use **Try browser default camera** or choose another device. Switching cameras while paused keeps capture paused. Optional countdown audio does not block camera startup.

Settings expose resolution, mirrored preview, JPEG quality, countdown, auto-capture, auto-next, bounded retries, sound, safe filenames and all quality thresholds. The preview may be mirrored; saved photos are not. Defaults require two seconds of stability and three seconds of countdown. Thresholds need calibration with the actual camera and lighting; they are not guarantees of ID-photo compliance.

## Storage and privacy

The Dexie database `enroll-ai-v1` contains students, sessions, sessionStudents, captures (JPEG Blobs), settings, logs and migration receipts. Capture status is per session so the same student can participate in multiple sessions. Counts are computed from stored data; no operational data is fabricated.

Photos and rosters stay in the browser profile. There are no accounts, server-side student APIs, cloud sync, face embeddings or recognition templates. Use an institution-managed device/profile. Export backups regularly; browser storage may be cleared or evicted. Request persistent storage in Settings where supported. Export is not a full application-state backup/restore.

After the first production load, wait for **Offline ready**. The service worker caches the app, all code chunks, the detector model and both WASM variants. Update prompts are suppressed during capture. Camera use requires HTTPS or localhost; opening files directly or using an insecure LAN address will not provide camera access.

## Main AI project files

- `src/vision/faceDetector.ts`: MediaPipe BlazeFace inference returns normalized face bounds and a basic roll estimate. It never receives student data.
- `src/vision/qualityEngine.ts`: combines measured image features and spatial/temporal rules. Supporting files implement Laplacian variance, luminance and anchored motion stability.
- `src/services/session/captureController.ts`: perception-to-action state machine; countdown, capture locks, save verification, replacement, recovery and queue progression.

See [the AI pipeline](docs/AI_PIPELINE.md), [database schema](docs/SCHEMA.md), [acceptance criteria](docs/TASKS.md) and [verification record](docs/PROGRESS.md).

## Tests

```powershell
npm test
npm run build
npm run test:e2e
```

Unit/integration tests use `fake-indexeddb` and disposable storage. The Windows runner creates a distinct temporary directory to avoid sandbox rename conflicts. Browser tests use an isolated Chrome profile and never access a physical camera. The real-inference test expects the official MediaPipe portrait fixture at `.local/fixtures/portrait.jpg`; download it with `node scripts/setup-test-fixture.mjs`. This test-only file is ignored by Git and not deployed. Chrome must be installed; adjust `channel` in `playwright.config.ts` if needed. The test server binds to loopback on port 4174.

## Known operational limits

- Detection is not recognition, liveness verification, a proof of identity, or a certified photo-compliance assessment. Only basic roll is estimated; full yaw/pitch is not claimed.
- Inference runs synchronously on small frames at up to 8 Hz using the CPU. The UI reports measured analysis time. Device-specific responsiveness and thermal behavior require testing on the intended phones/webcams.
- ZIP export holds the archive in memory; exports over 500 MB are refused with a folder/individual-photo alternative. Export large sessions in an environment with enough storage/memory.
- Sessions retain their persisted queue after refresh. A previously active session can be resumed; the app never discards saved photos on startup. No backend authentication or shared multi-device database is included because this version is browser-local.
- Physical USB switching/disconnection, Android installation and the actual 500-person capture day still require target-device acceptance testing. Automated fixtures are not evidence of field accuracy.

## Upstream references

Implementation follows the [MediaPipe Face Detector web guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js). The official versioned model source and checksum are recorded in `model-manifest.json`; MediaPipe is Apache-2.0. SheetJS 0.20.3 is pinned from the [official SheetJS distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). npm packages are pinned and the lockfile is committed.
