import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

test.describe('Subagent Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Setup mock responses
    const mainFixture = await fs.readFile(
      path.join(process.cwd(), 'fixtures/sample-main-transcript.json'),
      'utf-8'
    );
    const analyzerFixture = await fs.readFile(
      path.join(process.cwd(), 'fixtures/subagent-data-analyzer-20260201-001.json'),
      'utf-8'
    );
    const visualizerFixture = await fs.readFile(
      path.join(process.cwd(), 'fixtures/subagent-visualizer-20260201-001.json'),
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
        body: analyzerFixture,
      });
    });

    await page.route('**/api/transcripts/subagent-visualizer-20260201-001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: visualizerFixture,
      });
    });

    await page.goto('/transcript/transcript-20260201-001');
  });

  test('should navigate to data analyzer subagent', async ({ page }) => {
    // Act
    await page.getByText('Data Analyzer Subagent').click();

    // Assert
    await expect(page.getByText(/Starting data analysis/i)).toBeVisible();
    await expect(page.getByText(/1,000 rows/i)).toBeVisible();
    await expect(page.getByText(/15 columns/i)).toBeVisible();
  });

  test('should navigate to visualizer subagent', async ({ page }) => {
    // Act
    await page.getByText('Visualization Subagent').click();

    // Assert
    await expect(page.getByText(/Creating visualizations/i)).toBeVisible();
    await expect(page.getByText(/sales_distribution.png/i)).toBeVisible();
  });

  test('should collapse subagent when clicked again', async ({ page }) => {
    // Arrange
    await page.getByText('Data Analyzer Subagent').click();
    await expect(page.getByText(/Starting data analysis/i)).toBeVisible();

    // Act
    await page.getByText('Data Analyzer Subagent').click();

    // Assert
    await expect(page.getByText(/Starting data analysis/i)).not.toBeVisible();
  });

  test('should display subagent metadata', async ({ page }) => {
    // Act
    await page.getByText('Data Analyzer Subagent').click();

    // Assert
    await expect(page.getByText(/456.*tokens/i)).toBeVisible();
    await expect(page.getByText(/2100.*ms/i)).toBeVisible();
  });

  test('should show visualization results', async ({ page }) => {
    // Act
    await page.getByText('Visualization Subagent').click();

    // Assert
    await expect(page.getByText(/histogram/i)).toBeVisible();
    await expect(page.getByText(/line_chart/i)).toBeVisible();
    await expect(page.getByText(/heatmap/i)).toBeVisible();
  });
});
