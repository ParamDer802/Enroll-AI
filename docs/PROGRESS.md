# Verification record

Implementation and local checks performed on 22 October 2026. No real student records or physical camera were used for automated tests.

## Verified behavior

- TypeScript checks and Vite production build succeed. The build requires the pinned model, local WASM runtime and install icons. Workbox precaches approximately 23 MB including both WASM variants.
- Unit/integration suite covers import validation, string enrollment preservation, actual pixel algorithms, temporal stability, countdown cancellation, immutable capture identity, concurrent-event exclusion, save failures, retakes, pause/resume, clear-frame gating, session recovery and disposal.
- IndexedDB tests cover actual Blob persistence, wrong-student/filename rejection, explicit replacement, transactional rollback when an audit write fails, duplicate import protection, report metadata, schema migration preserving photos and metadata-only list state.
- Browser checks use installed Chrome in isolated disposable profiles: desktop/mobile rendering, 500-student XLSX import, refresh persistence, session assignment, CSV export, camera permission denial and offline app/model retrieval.
- The real-inference browser scenario uses Google’s public MediaPipe portrait in a test-only canvas stream. Actual MediaPipe detection and quality rules trigger two automatic captures, require the frame to clear between them, and produce `001.jpg`, `002.jpg` and `report.csv` in a ZIP. Captured history and previews are checked. No fake analysis values or app test backdoors are used.
- An observed CPU analysis sample was 51 ms on the host machine with a 480-pixel-wide analysis canvas. This is a single fixture observation, not a benchmark or an accuracy claim. The camera UI reports current measured latency.

## Testing notes

### Whole-app review and per-session sheet rules

Added optional sheet requirements and custom instructions to session creation and editing. Both automatic and manual captures now stop for operator review of the actual JPEG when rules apply. Each photo needs fresh confirmations; retakes discard the unsaved review. Rule revisions and confirmation timestamps are stored with the photo and included in history and reports. This is operator verification, not automatic sheet/hand detection. Schema revision 4 preserves existing records and does not claim that older photos were reviewed.

Fixed stale confirmed import previews after a replacement file fails to read; demo creation now rolls back its entire roster/session transaction on failure. Archived sessions cannot be reopened implicitly through capture/history, capture saves validate membership session identity, and rule changes are protected against conflicting edits and an open capture station. Camera tracks are released after stalled frames or analysis failure. History no longer labels unevaluated captures as passing quality checks.

ZIP and folder exports use one consistent database snapshot for photos and report rows. Folder export binds the browser picker correctly and includes the CSV report. Existing saved photos are retained through rule changes.

Updated pinned development tooling to Vite 7.3.7 and Vitest 4.1.12, with an esbuild 0.28.1 override for the Windows development-server advisory. The complete npm dependency audit reports zero known vulnerabilities as of this check; this is not a guarantee against unknown vulnerabilities.

Validation: 45 unit/integration tests passed, the production build passed with local model/WASM checks, and all 11 Chrome browser workflows passed in 2.3 minutes. New browser checks cover per-photo rule confirmations, retakes, rule persistence, cross-tab editing protection and stale import recovery. The real MediaPipe capture workflow verifies ZIP and folder exports with both JPEGs and a CSV. Browser tests run in isolated profiles with synthetic streams and a public portrait fixture; operator confirmations in these tests exercise the workflow and do not assert that the fixture meets the sheet rule. The rule-review screenshot was inspected. Physical disconnects, phone cameras and sustained full-class capture remain target-device checks.

### Camera selection and startup correction

The user's live browser reported a working XiaoMi USB 2.0 Webcam stream at 1280 × 720 with a detected face after selecting that device. The default selection had not identified the actual device; DroidCam was also available. No claim is made about its connection state. Capture was paused for troubleshooting, and existing photos were preserved.

Fixed stale parent settings after leaving capture, stored the stream's actual device ID, exposed the connected label and refreshed device choices on entry/device changes. Unavailable saved cameras now have an explicit default-camera recovery button. Camera switching respects pause, and optional audio resume can no longer hold startup indefinitely. A regression test exposed an additional race: controls were enabled before queue loading finished, so an early Enable camera click could be ignored. Controls now become available after controller startup completes.

Validation: production build and all 37 unit/integration tests passed. Four focused browser workflows passed in 52.6 seconds: actual device identification/selection/reentry with permanently suspended audio, unavailable saved-device recovery, real MediaPipe automatic capture/next student/ZIP export, and denied camera permission. Device-selection tests use blank synthetic streams in isolated profiles. The first new reentry test reproduced the startup race, then passed after the fix. These checks do not replace physical unplug/reconnect or phone-camera testing.

### Requested AIML roster update

Added the explicitly requested 79 enrollments (`24012250910001`–`24012250910079`) with generated placeholder names, AIML branch, Semester 5 and a ready-to-start session. Schema revision 3 adds installation receipts; a single transaction protects the roster, membership queue and audit event. Existing enrollment records, captured blobs and session progress are preserved. New records have no fabricated photos, completed states or quality readings.

The dashboard now highlights the class, the directory displays branch/semester and allows audited name corrections, and exports include branch, semester and name source. Generated-name indicators appear in the directory, student picker, capture screen and reports.

Verification: production build passed; 37 unit/integration tests passed, including contiguous enrollment boundaries, concurrent startup deduplication, rollback/retry after an audit failure, existing-photo preservation and invalid edits. All six browser scenarios passed across the main run and focused reruns. The new scenario verifies the first and last enrollment, a name correction across reload, exactly 79 CSV rows and honest source/status metadata. The 500-row import works alongside the existing roster (579 total students). The MediaPipe-to-JPEG/next-student/ZIP workflow also passed; an observed analysis sample was 35 ms. Desktop/mobile screenshots were inspected. The initial new test needed its text locator to allow the visible generated-name label and its CSV parser to strip the UTF-8 BOM; no production changes were required for those test corrections.

A repeated real-inference run exposed a genuine queue-order defect: selecting the whole roster originally inherited random primary-key order. Imports now persist row positions, session creation uses the ordered roster, and a regression test checks deliberately unsorted enrollment numbers across multiple imports. Existing session snapshots are preserved.

The Windows sandbox initially rejected Vitest’s temporary-file rename. The repository test runner now uses a unique workspace-local temporary directory; the tests run successfully there. Local browser preview also required running the loopback server outside the sandbox’s isolated network.

The first browser test run exposed an ambiguous test selector for two legitimate Create Session buttons, and its 10-second assertion expired during the 500-row workflow. The selector now targets the page heading, and the large-data assertions allow 30 seconds. The 500-row browser workflow subsequently passed in 34.5 seconds on this host, including import, reload, session creation and export.

## Remaining target-device checks

Real webcam/phone capture, physical disconnection, rear/USB switching, install prompts on Android, long-running storage pressure and representative quality calibration require testing on the intended hardware. No universal photo-compliance, demographic accuracy, liveness or identity claim is made.

Private hosted deployment and final aggregate test counts are recorded in the delivery response. Student data remains browser-local regardless of hosting; localhost and the hosted URL are separate browser storage origins.
