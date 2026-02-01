import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

test.describe('Transcript Viewer E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should display the main transcript viewer', async ({ page }) => {
    // Assert
    await expect(page.getByTestId('transcript-viewer')).toBeVisible();
  });

  test('should load and display sample main transcript', async ({ page }) => {
    // Arrange
    const fixtureData = await fs.readFile(
      path.join(process.cwd(), 'fixtures/sample-main-transcript.json'),
      'utf-8'
    );
    const transcript = JSON.parse(fixtureData);

    // Mock API response
    await page.route('**/api/transcripts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureData,
      });
    });

    // Act
    await page.goto(`/transcript/${transcript.id}`);

    // Assert
    await expect(page.getByText(/Can you help me analyze this dataset/i)).toBeVisible();
    await expect(page.getByText(/claude-sonnet-4-5/i)).toBeVisible();
  });

  test('should display subagent sections', async ({ page }) => {
    // Arrange
    const fixtureData = await fs.readFile(
      path.join(process.cwd(), 'fixtures/sample-main-transcript.json'),
      'utf-8'
    );

    await page.route('**/api/transcripts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureData,
      });
    });

    // Act
    await page.goto('/transcript/transcript-20260201-001');

    // Assert
    await expect(page.getByText('Data Analyzer Subagent')).toBeVisible();
    await expect(page.getByText('Visualization Subagent')).toBeVisible();
  });

  test('should expand subagent transcript when clicked', async ({ page }) => {
    // Arrange
    const mainFixture = await fs.readFile(
      path.join(process.cwd(), 'fixtures/sample-main-transcript.json'),
      'utf-8'
    );
    const subagentFixture = await fs.readFile(
      path.join(process.cwd(), 'fixtures/subagent-data-analyzer-20260201-001.json'),
      'utf-8'
    );

    await page.route('**/api/transcripts/transcript-20260201-001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mainFixture,
      });
    });

    await page.route('**/api/transcripts/subagent-data-analyzer-20260201-001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: subagentFixture,
      });
    });

    await page.goto('/transcript/transcript-20260201-001');

    // Act
    await page.getByText('Data Analyzer Subagent').click();

    // Assert
    await expect(page.getByText(/Starting data analysis/i)).toBeVisible();
    await expect(page.getByText(/Found 1,000 rows/i)).toBeVisible();
  });

  test('should display metadata and statistics', async ({ page }) => {
    // Arrange
    const fixtureData = await fs.readFile(
      path.join(process.cwd(), 'fixtures/sample-main-transcript.json'),
      'utf-8'
    );

    await page.route('**/api/transcripts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureData,
      });
    });

    // Act
    await page.goto('/transcript/transcript-20260201-001');

    // Assert
    await expect(page.getByText(/1234.*tokens/i)).toBeVisible();
    await expect(page.getByText(/5432.*ms/i)).toBeVisible();
  });

  test('should handle missing transcript gracefully', async ({ page }) => {
    // Arrange
    await page.route('**/api/transcripts/non-existent', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Transcript not found' }),
      });
    });

    // Act
    await page.goto('/transcript/non-existent');

    // Assert
    await expect(page.getByText(/transcript not found/i)).toBeVisible();
  });

  test('should display tools used in transcript', async ({ page }) => {
    // Arrange
    const fixtureData = await fs.readFile(
      path.join(process.cwd(), 'fixtures/sample-main-transcript.json'),
      'utf-8'
    );

    await page.route('**/api/transcripts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: fixtureData,
      });
    });

    // Act
    await page.goto('/transcript/transcript-20260201-001');

    // Assert
    await expect(page.getByText(/file_reader/i)).toBeVisible();
    await expect(page.getByText(/data_analyzer/i)).toBeVisible();
  });
});
