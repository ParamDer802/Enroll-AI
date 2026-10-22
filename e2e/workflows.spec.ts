import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
async function importStudents(page: Page, rows: string[][]) {
  await page.getByRole('button', { name: 'Import students', exact: true }).click();
  const sheet = XLSX.utils.aoa_to_sheet([['Enrollment Number', 'Student Name'], ...rows]),
    book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Students');
  await page.locator('input[type=file]').setInputFiles({
    name: 'students.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }),
  });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: `Import ${rows.length} students`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Students', exact: true })).toBeVisible({
    timeout: 30000,
  });
}
async function createSession(page: Page) {
  await page.getByRole('button', { name: 'Capture sessions', exact: true }).click();
  await page
    .locator('.page-heading')
    .getByRole('button', { name: 'Create session', exact: true })
    .click();
  await page.getByLabel('Session name').fill('TEST ONLY · BCA Semester 5');
  await page.getByLabel('Search roster').fill('Test Student');
  await page.getByRole('button', { name: /Select all matching/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create session', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'TEST ONLY · BCA Semester 5' })).toBeVisible({
    timeout: 30000,
  });
}
async function fakeCamera(page: Page) {
  const portrait = (await readFile('.local/fixtures/portrait.jpg')).toString('base64');
  await page.addInitScript(
    ({ portrait }) => {
      const state = { mode: 'portrait', stream: null as MediaStream | null };
      (window as any).__testCamera = state;
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 720;
        const ctx = canvas.getContext('2d')!,
          image = new Image();
        image.src = `data:image/jpeg;base64,${portrait}`;
        await image.decode();
        const draw = () => {
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, 960, 720);
          if (state.mode === 'portrait') ctx.drawImage(image, 0, 0, 820, 650, 0, 0, 960, 720);
        };
        draw();
        const timer = setInterval(draw, 66);
        const stream = canvas.captureStream(15);
        state.stream = stream;
        stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer));
        return stream;
      };
    },
    { portrait },
  );
}
test('desktop and mobile layouts show the requested roster without fabricated captures', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A better picture starts here.' })).toBeVisible();
  await expect(page.locator('.cohort-count strong')).toHaveText('79');
  await expect(
    page.locator('.stat-card').filter({ hasText: 'Completed' }).locator('strong'),
  ).toHaveText('0');
  await mkdir('.local/screenshots', { recursive: true });
  await page.screenshot({
    path: '.local/screenshots/dashboard-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: '.local/screenshots/dashboard-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Students', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Students', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('AIML roster spans 79 enrollments, supports name correction and exports honestly', async ({
  page,
}) => {
  await page.goto('/#students');
  await expect(page.getByText('79 students · Page 1 of 4')).toBeVisible();
  await expect(page.getByRole('cell', { name: '24012250910001', exact: true })).toBeVisible();
  await page.getByLabel('Search students').fill('24012250910079');
  await expect(page.getByRole('cell', { name: '24012250910079', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: '24012250910079' })).toContainText(
    'Param Panchal',
  );
  await page.getByRole('button', { name: 'Edit name for 24012250910079' }).click();
  await page.getByLabel('Student name', { exact: true }).fill('Test Confirmed Name');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByText('Test Confirmed Name', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('79 students · Page 1 of 4')).toBeVisible();
  await page.getByLabel('Search students').fill('24012250910079');
  await expect(page.getByText('Test Confirmed Name', { exact: true })).toBeVisible();
  await page.getByLabel('Search students').fill('');
  await page.screenshot({ path: '.local/screenshots/aiml-roster-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const downloaded = await downloadPromise;
  const csv = await readFile((await downloaded.path())!, 'utf8');
  const parsed = XLSX.utils.sheet_to_json(
    XLSX.read(csv.replace(/^\uFEFF/, ''), { type: 'string', raw: true }).Sheets.Sheet1,
  );
  expect(parsed).toHaveLength(79);
  expect(parsed[0]).toMatchObject({
    'Enrollment Number': '24012250910001',
    Branch: 'AIML',
    Semester: '5',
    'Name Source': 'Generated placeholder',
    Status: 'Pending',
  });
  expect(parsed[78]).toMatchObject({
    'Enrollment Number': '24012250910079',
    'Student Name': 'Test Confirmed Name',
    'Name Source': 'Roster / operator',
  });
});

test('500-row Excel import, persistence, session creation and CSV export', async ({ page }) => {
  await page.goto('/');
  const rows = Array.from({ length: 500 }, (_, i) => [
    String(i + 1).padStart(6, '0'),
    `Test Student ${i + 1}`,
  ]);
  await importStudents(page, rows);
  await expect(page.getByText('579 students · Page 1 of 24')).toBeVisible();
  await page.reload();
  await expect(page.getByText('579 students · Page 1 of 24')).toBeVisible();
  await createSession(page);
  await expect(page.getByText('500 pending')).toBeVisible();
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  await page.getByLabel('Export session').selectOption({ label: 'TEST ONLY · BCA Semester 5' });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await pending;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain('000001');
  expect(csv).toContain('Test Student 500');
  expect(csv.split('\n').length).toBeGreaterThanOrEqual(501);
});
test('real MediaPipe analysis drives automatic capture, next student and ZIP export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fakeCamera(page);
  await page.addInitScript(() => {
    (window as any).__folderFiles = [];
    (window as any).showDirectoryPicker = async function (this: Window) {
      if (this !== window) throw new TypeError('Illegal invocation');
      return {
        getDirectoryHandle: async () => ({
          getFileHandle: async (name: string) => ({
            createWritable: async () => ({
              write: async (blob: Blob) => {
                (window as any).__folderFiles.push({ name, size: blob.size });
              },
              close: async () => {},
            }),
          }),
        }),
      };
    };
  });
  await page.goto('/');
  await importStudents(page, [
    ['001', 'Test Student One'],
    ['002', 'Test Student Two'],
  ]);
  await createSession(page);
  await page
    .locator('.session-card')
    .filter({ hasText: 'TEST ONLY · BCA Semester 5' })
    .getByRole('button', { name: 'Start capture', exact: true })
    .click();
  await expect(
    page
      .locator('.current-student')
      .getByRole('heading', { name: 'Test Student One', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  await expect(page.getByText('LIVE CAMERA', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(
    page.locator('.camera-settings .hint').filter({ hasText: 'Analysis runs' }),
  ).toContainText('Last analysis:');
  console.log(
    'Measured CPU inference sample:',
    await page.locator('.camera-settings .hint').filter({ hasText: 'Analysis runs' }).innerText(),
  );
  await expect(page.getByText('Saved & verified', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(
    page
      .locator('.current-student')
      .getByRole('heading', { name: 'Test Student Two', exact: true }),
  ).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText('Let the previous student step out of frame')).toBeVisible();
  await page.evaluate(() => {
    (window as any).__testCamera.mode = 'blank';
  });
  await expect(page.getByText('Let the previous student step out of frame')).not.toBeVisible();
  await page.evaluate(() => {
    (window as any).__testCamera.mode = 'portrait';
  });
  await expect(page.getByText('Saved & verified', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('heading', { name: 'Queue complete.' })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole('button', { name: 'Back to sessions' }).click();
  await page.getByRole('button', { name: 'Capture history', exact: true }).click();
  await expect(page.locator('.photo-button')).toHaveCount(2);
  await page.locator('.photo-button').first().click();
  await expect(page.getByRole('dialog', { name: 'Saved photograph' }).locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  await page.getByLabel('Export session').selectOption({ label: 'TEST ONLY · BCA Semester 5' });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP' }).click();
  const downloaded = await pending;
  const zip = await JSZip.loadAsync(await readFile((await downloaded.path())!));
  expect(Object.keys(zip.files).sort()).toEqual(['001.jpg', '002.jpg', 'report.csv']);
  expect((await zip.file('001.jpg')!.async('uint8array')).length).toBeGreaterThan(10000);
  expect(await zip.file('report.csv')!.async('text')).toContain('All checks passed');
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click();
  await expect(page.getByText('2 photos exported to a new folder', { exact: true })).toBeVisible();
  const files = await page.evaluate(() => (window as any).__folderFiles);
  expect(files.map((file: { name: string }) => file.name).sort()).toEqual([
    '001.jpg',
    '002.jpg',
    'report.csv',
  ]);
  expect(files.every((file: { size: number }) => file.size > 100)).toBe(true);
  expect(errors).toEqual([]);
});

test('sheet and custom session rules require fresh operator review of each captured photo', async ({
  page,
}) => {
  await fakeCamera(page);
  await page.goto('/');
  await importStudents(page, [
    ['001', 'Test Student One'],
    ['002', 'Test Student Two'],
  ]);
  await createSession(page);
  const card = page.locator('.session-card').filter({ hasText: 'TEST ONLY · BCA Semester 5' });
  await card.getByRole('button', { name: 'Edit rules' }).click();
  await page.getByLabel('Require a sheet held with both hands').check();
  await page.getByLabel('Additional instructions').fill('Show the class code AIML5.');
  await page.getByRole('button', { name: 'Save rules', exact: true }).click();
  await expect(card.getByText('Sheet required · Operator review')).toBeVisible();
  await page.reload();
  await expect(card.getByText('Sheet required · Operator review')).toBeVisible();
  await card.getByRole('button', { name: 'Start capture', exact: true }).click();
  await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review session rules' });
  await expect(review).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('0 / 2 photos completed')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Confirm rules & save photo' })).toBeDisabled();
  await expect(review.getByRole('checkbox')).toHaveCount(4);
  await page.screenshot({
    path: '.local/screenshots/session-rule-review.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const checkbox of await review.getByRole('checkbox').all()) await checkbox.check();
  await review.getByRole('button', { name: 'Confirm rules & save photo' }).click();
  await expect(page.getByText('Saved & verified', { exact: true })).toBeVisible();
  await expect(page.locator('.current-student h2')).toHaveText('Test Student Two');
  await page.evaluate(() => {
    (window as any).__testCamera.mode = 'blank';
  });
  await expect(page.getByText('Let the previous student step out of frame')).not.toBeVisible();
  await page.evaluate(() => {
    (window as any).__testCamera.mode = 'portrait';
  });
  await expect(review).toBeVisible({ timeout: 30000 });
  await expect(review.getByRole('button', { name: 'Confirm rules & save photo' })).toBeDisabled();
  await expect(review.getByRole('checkbox').first()).not.toBeChecked();
  await review.getByRole('button', { name: 'Retake photo' }).click();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  await page.getByLabel('Export session').selectOption({ label: 'TEST ONLY · BCA Semester 5' });
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await readFile((await (await downloading).path())!, 'utf8');
  const rows = XLSX.utils.sheet_to_json(
    XLSX.read(csv.replace(/^\uFEFF/, ''), { type: 'string', raw: true }).Sheets.Sheet1,
  );
  expect(rows[0]).toMatchObject({
    'Session Rule Review': 'Confirmed by operator',
    'Sheet Required At Capture': 'Yes',
    'Rules Revision': '1',
  });
  expect(rows[1]).toMatchObject({
    Status: 'Pending',
    'Session Rule Review': 'Pending operator review',
  });
});

test('rules cannot be edited from another tab while a capture station owns the queue', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue capture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enable camera', exact: true })).toBeEnabled();
  const other = await context.newPage();
  await other.goto('/#sessions');
  await other.getByRole('button', { name: 'Edit rules', exact: true }).click();
  await other.getByLabel('Require a sheet held with both hands').check();
  await other.getByRole('button', { name: 'Save rules', exact: true }).click();
  await expect(
    other.getByText('Close the capture station before editing session rules.', { exact: true }),
  ).toBeVisible();
  await other.close();
});

test('an invalid replacement import clears the previously confirmed preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import students', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'valid.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Enrollment,Name\n90001,Test Student'),
    });
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Import 1 students', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('No roster') });
  await expect(
    page.getByText('The first worksheet needs a header and at least one student.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Import 1 students', exact: true }),
  ).not.toBeVisible();
});
test('camera permission failure is recoverable and never marks a student complete', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load demo roster' }).click();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await expect(page.getByText(/Camera permission was denied/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry camera' })).toBeVisible();
  await expect(page.getByText('0 / 5 photos completed')).toBeVisible();
});
test('cached app and model load offline', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A better picture starts here.' })).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const r = await fetch('/vision/blaze_face_short_range.tflite');
      return r.ok && (await r.arrayBuffer()).byteLength === 229746;
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Students', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Students', exact: true })).toBeVisible();
  await context.setOffline(false);
});
