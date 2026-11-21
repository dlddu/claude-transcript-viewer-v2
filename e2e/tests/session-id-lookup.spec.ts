import { test, expect } from '@playwright/test';

test.describe('Session ID Lookup (LK-AC2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // count() rather than isVisible(): no auto-waiting, so this check does not shift timing for the loading-state test.
    const sessionIdTab = page.getByRole('tab', { name: 'Session ID' });
    if ((await sessionIdTab.count()) > 0) {
      await sessionIdTab.click();
    }
  });

  test('should display session ID input field and lookup button', async ({ page }) => {
    await expect(page.getByTestId('session-id-input')).toBeVisible();

    await expect(page.getByTestId('session-id-lookup-button')).toBeVisible();

    await expect(page.getByTestId('session-id-input')).toHaveAttribute(
      'placeholder',
      /session.*id/i
    );
  });

  test('should load transcript when valid session ID is entered and button clicked', async ({ page }) => {
    const testSessionId = 'session-abc123';

    const sessionInput = page.getByTestId('session-id-input');
    await sessionInput.fill(testSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();

    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();

    await expect(page.getByTestId('session-id-display')).toBeVisible();
    await expect(page.getByTestId('session-id-display')).toContainText('session-abc123');
  });

  test('should show loading state while fetching transcript', async ({ page }) => {
    const testSessionId = 'session-abc123';

    await page.getByTestId('session-id-input').fill(testSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByText(/loading/i)).toBeVisible();
  });

  test('should validate session ID format before lookup', async ({ page }) => {
    const invalidFormat = '';

    await page.getByTestId('session-id-input').fill(invalidFormat);

    await expect(page.getByTestId('session-id-lookup-button')).toBeDisabled();
  });

  test('should display metadata and subagent sections after successful lookup', async ({ page }) => {
    const testSessionId = 'session-abc123';

    await page.getByTestId('session-id-input').fill(testSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();

    await expect(page.getByTestId('model-display')).toBeVisible();
    await expect(page.getByTestId('model-display')).toContainText('claude-sonnet-4-5');

    // Use .first() to handle multiple occurrences (subagent-label, subagent-header, etc.)
    await expect(page.getByText('agent-a1b2c3d').first()).toBeVisible();
  });

  test('should allow searching for a different session ID after initial lookup', async ({ page }) => {
    const firstSessionId = 'session-abc123';
    const secondSessionId = 'session-xyz789';

    await page.getByTestId('session-id-input').fill(firstSessionId);
    await page.getByTestId('session-id-lookup-button').click();
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();

    await page.getByTestId('session-id-input').clear();
    await page.getByTestId('session-id-input').fill(secondSessionId);
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should support keyboard interaction (Enter key to submit)', async ({ page }) => {
    const testSessionId = 'session-abc123';

    const sessionInput = page.getByTestId('session-id-input');
    await sessionInput.fill(testSessionId);
    await sessionInput.press('Enter');

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });

  test('should trim whitespace from session ID input', async ({ page }) => {
    const sessionIdWithSpaces = '  session-abc123  ';

    await page.getByTestId('session-id-input').fill(sessionIdWithSpaces);
    await page.getByTestId('session-id-lookup-button').click();

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
  });
});
