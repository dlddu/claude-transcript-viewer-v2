import { test, expect } from '@playwright/test';

// The UUID that e2e/fixtures/f47ac10b-58cc-4372-a567-0e02b2c3d479.jsonl is keyed by.
const KNOWN_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const MESSAGE_WITH_UUID =
  `Here is the conversation reference you asked for: ${KNOWN_UUID}. ` +
  `Please look it up and show me the full transcript.`;

test.describe('Message UUID Lookup (LK-AC3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show textarea and "Extract & Search" button when "Message UUID" tab is active', async ({ page }) => {
    const messageUuidTab = page.getByRole('tab', { name: 'Message UUID' });
    await expect(messageUuidTab).toHaveAttribute('aria-selected', 'true');

    await expect(page.getByRole('textbox')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Extract & Search' })).toBeVisible();
  });

  test('should display a placeholder hint in the textarea', async ({ page }) => {
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible();

    const placeholder = await textarea.getAttribute('placeholder');
    expect(placeholder).toBeTruthy();
    expect(placeholder!.length).toBeGreaterThan(0);
  });

  test('should disable "Extract & Search" button when textarea is empty', async ({ page }) => {
    const textarea = page.getByRole('textbox');
    await expect(textarea).toBeVisible();
    await textarea.clear();

    await expect(page.getByRole('button', { name: 'Extract & Search' })).toBeDisabled();
  });

  test('should extract UUID from pasted message, show green badge, and load transcript', async ({ page }) => {
    const textarea = page.getByRole('textbox');
    await textarea.fill(MESSAGE_WITH_UUID);

    await page.getByRole('button', { name: 'Extract & Search' }).click();

    const uuidBadge = page.getByTestId('extracted-uuid-badge');
    await expect(uuidBadge).toBeVisible();
    await expect(uuidBadge).toContainText(KNOWN_UUID);

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should trigger extraction and search with Ctrl+Enter keyboard shortcut', async ({ page }) => {
    const textarea = page.getByRole('textbox');
    await textarea.fill(MESSAGE_WITH_UUID);

    await textarea.press('Control+Enter');

    const uuidBadge = page.getByTestId('extracted-uuid-badge');
    await expect(uuidBadge).toBeVisible();
    await expect(uuidBadge).toContainText(KNOWN_UUID);

    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });
});
