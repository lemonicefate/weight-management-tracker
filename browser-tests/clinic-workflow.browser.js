import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { startTestServer } from '../tests/helpers.js';

async function signIn(page, baseUrl) {
  await page.goto(baseUrl);
  await page.getByLabel('Username').fill('fictional-admin');
  await page.getByLabel('Password').fill('Fictional-Admin-Password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Patients' }).waitFor();
}

test('login failure is shown and one submit sends one request', { timeout: 30_000 }, async (t) => {
  const app = await startTestServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let loginRequests = 0;
  await page.route('**/api/auth/login', async (route) => {
    loginRequests += 1;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Fictional login failure.' } })
    });
  });

  await page.goto(app.baseUrl);
  await page.getByLabel('Username').fill('fictional-admin');
  await page.getByLabel('Password').fill('Fictional-Admin-Password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('alert').getByText('Fictional login failure.').waitFor();
  await page.waitForLoadState('networkidle');

  assert.equal(loginRequests, 1, 'one Sign in action should send one login request');
});

test('successful login hides sign-in fields while the patient app is visible', { timeout: 30_000 }, async (t) => {
  const app = await startTestServer(t);
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();

  await signIn(page, app.baseUrl);

  assert.equal(await page.locator('#login-view').isVisible(), false, 'sign-in fields should be hidden after login');
  assert.equal(await page.locator('#app-view').isVisible(), true, 'patient app should be visible after login');
});

test('browser supports patient search, offline draft retry, medication tracking, completion and trends', {
  timeout: 60_000
}, async (t) => {
  const app = await startTestServer(t);
  const doctor = await app.createUser({
    username: 'fictional-doctor',
    displayName: 'Fictional Doctor',
    role: 'doctor',
    password: 'Fictional-Doctor-Password-123'
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();

  await signIn(page, app.baseUrl);

  await page.getByRole('button', { name: 'Add Patient' }).click();
  await page.getByLabel('MRN').fill('000E2E-001');
  await page.getByLabel('Name', { exact: true }).fill('Fictional Browser Patient');
  await page.getByLabel('Phone').fill('TEST-E2E-001');
  await page.getByRole('button', { name: 'Create Patient' }).click();
  await page.getByRole('heading', { name: 'Fictional Browser Patient' }).waitFor();

  await page.getByRole('button', { name: 'Start Episode' }).click();
  await page.getByRole('button', { name: 'New Encounter' }).waitFor();
  await page.getByRole('button', { name: 'New Encounter' }).click();
  const encounterCard = page.locator('[data-encounter-card]').first();
  const saveStatus = encounterCard.locator('.save-status');
  const weight = encounterCard.locator('[data-draft-field="weightKg"]');
  await weight.waitFor();
  await weight.fill('123.4');
  await page.waitForFunction(() => [...document.querySelectorAll('.save-status')]
    .some((node) => node.textContent.includes('Saved ·')));

  await context.setOffline(true);
  await page.waitForFunction(() => !navigator.onLine);
  await encounterCard.locator('[data-draft-field="waistCm"]').fill('89.2');
  await page.waitForFunction(() => [...document.querySelectorAll('.save-status')]
    .some((node) => node.textContent.includes('Offline · changes not saved')));
  await context.setOffline(false);
  await page.waitForFunction(() => navigator.onLine);
  await page.waitForFunction(() => [...document.querySelectorAll('.save-status')]
    .some((node) => node.textContent.includes('Saved ·')));

  await encounterCard.locator('[data-change-type]').selectOption('change');
  await page.getByRole('button', { name: 'Add medication' }).click();
  const medicationRow = encounterCard.locator('[data-medication-row]').first();
  await medicationRow.locator('[data-medication-code]').selectOption('wegovy');
  await medicationRow.locator('[data-dose-mode]').selectOption('1.7');
  await page.waitForFunction(() => [...document.querySelectorAll('.save-status')]
    .some((node) => node.textContent.includes('Medication record saved')));
  await page.getByRole('button', { name: 'Refresh history' }).click();

  const trendPoints = await page.locator('.summary-trends canvas').first().getAttribute('data-points');
  assert.ok(JSON.parse(trendPoints).some((point) => point.value === 123.4));
  assert.match(await page.locator('#medication-timeline-content').innerText(), /Wegovy 1\.7 mg/);

  await encounterCard.locator('summary').click();
  await page.locator('[id^="physician-"]').selectOption(String(doctor.id));
  await page.getByRole('button', { name: 'Complete Encounter' }).click();
  await page.locator('[data-encounter-card] .badge.completed').waitFor();

  await page.getByRole('button', { name: '← Patient list' }).click();
  await page.getByLabel('Search').fill('000E2E-001');
  const patientRow = page.getByRole('row').filter({ hasText: '000E2E-001' });
  await patientRow.waitFor();
  assert.match(await patientRow.innerText(), /Fictional Browser Patient/);

  await context.close();
});

test('browser conflict reloads the latest Encounter without saving stale edits over it', {
  timeout: 60_000
}, async (t) => {
  const app = await startTestServer(t);
  const seed = app.client();
  assert.equal((await seed.login()).status, 200);
  const patientResult = await seed.request('/api/patients', {
    method: 'POST',
    json: { mrn: '000E2E-002', name: 'Fictional Conflict Patient', phone: 'TEST-E2E-002' }
  });
  const patientId = patientResult.data.patient.id;
  await seed.request('/api/patients/' + patientId + '/episodes', { method: 'POST', json: {} });
  await seed.request('/api/patients/' + patientId + '/encounters', { method: 'POST', json: {} });

  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const firstPage = await firstContext.newPage();
  const secondPage = await secondContext.newPage();
  await Promise.all([signIn(firstPage, app.baseUrl), signIn(secondPage, app.baseUrl)]);
  await Promise.all([firstPage, secondPage].map((page) =>
    page.getByRole('button', { name: 'Fictional Conflict Patient', exact: true }).click()));

  const firstCard = firstPage.locator('[data-encounter-card]').first();
  const secondCard = secondPage.locator('[data-encounter-card]').first();
  await Promise.all([firstCard, secondCard].map((card) => card.locator('summary').click()));
  const firstWeight = firstCard.locator('[data-draft-field="weightKg"]');
  const secondWeight = secondCard.locator('[data-draft-field="weightKg"]');
  await firstWeight.fill('100');
  await firstPage.waitForFunction(() => [...document.querySelectorAll('.save-status')]
    .some((node) => node.textContent.includes('Saved ·')));

  await secondWeight.fill('98');
  const secondStatus = secondCard.locator('.save-status');
  await secondStatus.getByText('Reload Encounter').waitFor();
  assert.match(await secondStatus.innerText(), /Conflict/);
  assert.equal(await secondWeight.isDisabled(), true);

  await secondStatus.getByRole('button', { name: 'Reload Encounter' }).click();
  await secondPage.waitForFunction(() =>
    document.querySelector('[data-encounter-card] [data-draft-field="weightKg"]')?.value === '100');
  const reloadedWeight = secondPage.locator('[data-encounter-card] [data-draft-field="weightKg"]');
  assert.equal(await reloadedWeight.inputValue(), '100');
  await secondContext.close();
  await firstContext.close();
});
