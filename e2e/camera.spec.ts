import { test, expect, type Page } from '@playwright/test';

// Test-only blank streams: never access a physical camera or capture a person.
async function cameraDevices(page: Page) {
  await page.addInitScript(() => {
    const state = { missing: '', requests: [] as string[] };
    (window as any).__cameraDevices = state;
    const options = [
      { deviceId: 'virtual-test', label: 'Test virtual camera' },
      { deviceId: 'laptop-test', label: 'Test laptop webcam' },
    ];
    navigator.mediaDevices.enumerateDevices = async () =>
      options.map((device) => ({
        ...device,
        groupId: device.deviceId,
        kind: 'videoinput',
        toJSON: () => device,
      })) as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const settings = constraints?.video as MediaTrackConstraints;
      const id =
        ((settings.deviceId as ConstrainDOMStringParameters)?.exact as string) || 'virtual-test';
      state.requests.push(id);
      if (state.missing === id) throw new DOMException('Camera unplugged', 'OverconstrainedError');
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext('2d')!;
      const draw = () => {
        context.fillStyle = '#808080';
        context.fillRect(0, 0, 640, 480);
      };
      draw();
      const timer = setInterval(draw, 100);
      const stream = canvas.captureStream(10);
      const track = stream.getVideoTracks()[0];
      const originalSettings = track.getSettings.bind(track),
        originalStop = track.stop.bind(track);
      track.getSettings = () => ({ ...originalSettings(), deviceId: id });
      track.stop = () => {
        clearInterval(timer);
        originalStop();
      };
      Object.defineProperty(track, 'label', {
        value: options.find((device) => device.deviceId === id)!.label,
      });
      return stream;
    };
    // Simulate an embedded browser that never resumes optional audio.
    AudioContext.prototype.resume = () => new Promise<void>(() => {});
  });
}

async function reopen(page: Page) {
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page
    .locator('.session-card')
    .filter({ hasText: 'AIML · Semester 5' })
    .getByRole('button', { name: 'Resume session', exact: true })
    .click();
}

test('actual camera is identified, switching preserves pause, and laptop choice survives session reentry', async ({
  page,
}) => {
  await cameraDevices(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue capture', exact: true }).click();
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.getByText('LIVE CAMERA', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel('Select camera')).toHaveValue('virtual-test');
  await expect(page.getByText(/Connected: Test virtual camera/)).toBeVisible();
  await page.getByLabel('Select camera').selectOption('laptop-test');
  await expect(page.getByText(/Connected: Test laptop webcam/)).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByLabel('Select camera').selectOption('virtual-test');
  await expect(page.getByRole('heading', { name: 'Session paused', exact: true })).toBeVisible();
  await page.getByLabel('Select camera').selectOption('laptop-test');
  await expect(page.getByText(/Connected: Test laptop webcam/)).toBeVisible();
  await reopen(page);
  await expect(page.getByLabel('Select camera')).toHaveValue('laptop-test');
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.getByText(/Connected: Test laptop webcam/)).toBeVisible();
  await expect(page.getByText('0 / 79 photos completed')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__cameraDevices.requests)).toEqual([
    'virtual-test',
    'laptop-test',
    'virtual-test',
    'laptop-test',
    'laptop-test',
  ]);
});

test('an unavailable saved camera offers explicit default-camera recovery', async ({ page }) => {
  await cameraDevices(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue capture', exact: true }).click();
  await page.getByLabel('Select camera').selectOption('laptop-test');
  await expect(page.getByText(/Connected: Test laptop webcam/)).toBeVisible({ timeout: 30000 });
  await reopen(page);
  await page.evaluate(() => {
    (window as any).__cameraDevices.missing = 'laptop-test';
  });
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.getByText(/The saved camera is unavailable/)).toBeVisible();
  await page.getByRole('button', { name: 'Try browser default camera', exact: true }).click();
  await expect(page.getByText(/Connected: Test virtual camera/)).toBeVisible();
  await expect(page.getByLabel('Select camera')).toHaveValue('virtual-test');
  await expect(page.getByText('0 / 79 photos completed')).toBeVisible();
});
