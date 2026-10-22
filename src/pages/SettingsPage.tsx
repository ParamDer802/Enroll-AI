import { useState } from 'react';
import { Camera, SlidersHorizontal, Zap, FileImage, Save, RotateCcw } from 'lucide-react';
import type { AppSettings } from '../types';
import { defaults, saveSettings } from '../database/db';
import { PageHeading, Button, useToast } from '../components/ui';
export function SettingsPage({
  settings,
  onSaved,
}: {
  settings: AppSettings;
  onSaved: (s: AppSettings) => void;
}) {
  const [draft, setDraft] = useState(settings),
    [busy, setBusy] = useState(false),
    toast = useToast();
  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((s) => ({ ...s, [key]: value }));
  }
  function number(
    key: keyof AppSettings,
    label: string,
    min: number,
    max: number,
    step = 1,
    help?: string,
  ) {
    return (
      <label key={key}>
        {label}
        <input
          type="number"
          required
          min={min}
          max={max}
          step={step}
          value={Number(draft[key])}
          onChange={(e) => update(key, e.target.valueAsNumber)}
        />
        {help && <small>{help}</small>}
      </label>
    );
  }
  function toggle(key: keyof AppSettings, label: string, help: string) {
    return (
      <label className="toggle-row" key={key}>
        <span>
          {label}
          <small>{help}</small>
        </span>
        <input
          type="checkbox"
          checked={Boolean(draft[key])}
          onChange={(e) => update(key, e.target.checked)}
        />
      </label>
    );
  }
  async function save() {
    if (draft.faceSizeMin >= draft.faceSizeMax || draft.lightingMin >= draft.lightingMax) {
      toast('Minimum thresholds must be below maximum thresholds.', true);
      return;
    }
    setBusy(true);
    try {
      await saveSettings(draft);
      onSaved(draft);
      toast('Capture settings saved');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PageHeading
        eyebrow="MAKE IT WORK FOR YOUR SETUP"
        title="Settings"
        description="Tune the capture station for your camera and lighting conditions."
      >
        <Button variant="secondary" onClick={() => setDraft({ ...defaults })}>
          <RotateCcw size={16} />
          Reset form
        </Button>
        <Button type="submit" busy={busy}>
          <Save size={17} />
          Save settings
        </Button>
      </PageHeading>
      <div className="settings-grid">
        <section className="panel settings-card">
          <h2>
            <Camera size={20} />
            Camera & image
          </h2>
          <label>
            Preferred resolution
            <select
              value={draft.resolution}
              onChange={(e) => update('resolution', +e.target.value)}
            >
              <option value={1280}>1280 px · HD</option>
              <option value={1920}>1920 px · Full HD</option>
              <option value={2560}>2560 px · High resolution</option>
            </select>
            <small>Your camera may provide its closest supported resolution.</small>
          </label>
          {toggle('mirror', 'Mirror camera preview', 'Saved photos are always unmirrored.')}
          {number('jpegQuality', 'JPEG quality', 0.5, 1, 0.01)}
          <Button variant="secondary" onClick={() => update('cameraId', '')}>
            Use default front camera
          </Button>
        </section>
        <section className="panel settings-card">
          <h2>
            <Zap size={20} />
            Automation
          </h2>
          {toggle(
            'autoCapture',
            'Automatic capture',
            'Start the countdown after all quality checks pass.',
          )}
          {toggle(
            'autoNext',
            'Automatic next student',
            'Accept the verified photo and move on after 1.8 seconds.',
          )}
          {toggle('autoRetry', 'Retry failed captures', 'Retry only up to the configured maximum.')}
          {toggle('sound', 'Countdown sound', 'Play a short tone at each countdown step.')}
          <div className="form-grid">
            {number('countdownSeconds', 'Countdown (seconds)', 1, 10)}
            {number('maxAttempts', 'Maximum retry attempts', 1, 10)}
          </div>
        </section>
        <section className="panel settings-card">
          <h2>
            <SlidersHorizontal size={20} />
            Photo quality thresholds
          </h2>
          <p className="hint">
            These are practical heuristics, not a certification of ID-photo compliance. Calibrate
            with your actual camera.
          </p>
          <div className="form-grid">
            {number(
              'blurThreshold',
              'Minimum sharpness',
              1,
              2000,
              1,
              'Laplacian variance on the face region.',
            )}
            {number('stabilityMs', 'Stability duration (ms)', 500, 10000, 100)}
            {number('faceSizeMin', 'Minimum face height', 0.1, 0.8, 0.01)}
            {number('faceSizeMax', 'Maximum face height', 0.2, 0.95, 0.01)}
            {number('centerTolerance', 'Center tolerance', 0.03, 0.35, 0.01)}
            {number('movementTolerance', 'Movement tolerance', 0.005, 0.1, 0.005)}
            {number('headAngleMax', 'Maximum roll angle (°)', 5, 40)}
            {number('lightingMin', 'Minimum brightness', 15, 180)}
            {number('lightingMax', 'Maximum brightness', 100, 245)}
          </div>
        </section>
        <section className="panel settings-card">
          <h2>
            <FileImage size={20} />
            Filename & storage
          </h2>
          {toggle(
            'includeName',
            'Include student name',
            'Use Enrollment_Name.jpg instead of Enrollment.jpg.',
          )}
          <div className="filename-example">
            <span>Example filename</span>
            <code>{draft.includeName ? '240101001_Rahul_Patel.jpg' : '240101001.jpg'}</code>
          </div>
          <p className="muted">
            Photographs are stored in this browser’s IndexedDB. Export regularly: clearing browser
            data removes local records.
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const persisted = await navigator.storage?.persist?.();
                toast(
                  persisted
                    ? 'Persistent storage granted'
                    : 'Your browser did not grant persistent storage. Keep exported backups.',
                );
              } catch {
                toast('Storage permission could not be requested', true);
              }
            }}
          >
            Request persistent storage
          </Button>
        </section>
      </div>
    </form>
  );
}
