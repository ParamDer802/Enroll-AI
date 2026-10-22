# V1 acceptance criteria

Evidence is recorded in [PROGRESS.md](PROGRESS.md). Checked items refer to implemented behavior and the stated automated checks, not universal hardware certification.

## Foundation and local data

- [x] React/TypeScript/Vite, Tailwind, Lucide and restrained Framer Motion interface.
- [x] Responsive dashboard, student directory, sessions, history, exports, settings and privacy pages.
- [x] Local data stores with per-session student status, UTC timestamps, Asia/Kolkata display and migration receipts.
- [x] Opt-in, clearly labeled demo roster; no fabricated camera readings or operational counts.
- [x] Explicit schema migration preserves stored photos and adds indexed filename uniqueness.

## Enrollment and sessions

- [x] Per-session sheet and custom instructions, editable for new and existing sessions.
- [x] Operator review of each actual captured image, including manual captures, before saving/advancing.
- [x] Rule revision and confirmation evidence in history/reports; older photos preserved without retrospective approval.
- [x] Rules protected from concurrent capture edits; archived sessions must be restored before retakes.

- [x] User-requested 79-student AIML Semester 5 roster with exact string enrollments, generated-name labels and a pending capture session.
- [x] Atomic, idempotent roster installation preserves existing student data and survives concurrent starts.
- [x] Editable names with transactional audit logging; enrollment numbers and saved photographs preserved.
- [x] Dashboard class overview, directory branch/semester, and report name-source metadata.

- [x] XLSX/XLS/CSV parsing, column mapping, string enrollments and preview confirmation.
- [x] Whitespace, blank, length, duplicate, path and sanitized filename-collision validation.
- [x] Search, sorting, status/session filters and pagination.
- [x] Selected-student sessions with draft, active, paused, completed and archived statuses.
- [x] Persisted queue recovery and explicit archived-session restoration.

## Vision and capture

- [x] Official checksum-verified MediaPipe detector bundled locally, CPU inference only.
- [x] No face recognition, matching, identity inference, face embeddings or skin-color heuristics.
- [x] Measured face count, centering, normalized size, basic roll, ROI luminance, Laplacian sharpness and temporal stability.
- [x] Dedicated controller, continuous-quality countdown cancellation and immutable capture identity.
- [x] JPEG encoding/decoding, atomic verified save, completed status and audit entry.
- [x] Automatic acceptance and next-student progression with a clear-frame interlock.
- [x] Pause, skip/reason, replacement retake, manual override, bounded retry and camera selection.
- [x] Camera permission, startup, interrupted-frame and model-error recovery paths.
- [x] Actual connected-device label and persisted selection across session reentry; explicit missing-device recovery; optional audio cannot stall video.
- [x] Camera controls wait for queue initialization, and switching devices preserves a paused session.
- [x] Cross-tab capture lock and background-tab pause.

## Export, offline and verification

- [x] Enrollment-named JPEG download, ZIP archive, XLSX/CSV reports and folder export where supported.
- [x] Filename collision prevention and report formula-injection escaping.
- [x] Consistent photo/report export snapshots and reports included in folder exports.
- [x] Failed replacement imports clear stale previews; demo installation rolls back atomically.
- [x] Manifest, install icons, service worker, update prompt and model/WASM precache.
- [x] Automated 500-row import/session/report workflow.
- [x] Real MediaPipe fixture → countdown → save → next student → ZIP workflow.
- [x] Desktop/mobile layout and offline app/model checks.
- [ ] Physical front/rear/USB camera switching and disconnection on intended hardware.
- [ ] Android install and long-session battery/thermal testing.
- [ ] Consented real-world quality calibration and a complete 500-person capture-day trial.
