import { expect, test } from '@playwright/test';

test.describe('BlinkChat E2E Suite', () => {
  test('renders landing page with headline and start button', async ({ page }) => {
    await page.goto('/');

    // Check branding
    await expect(page.locator('text=BlinkChat')).toBeVisible();

    // Check Start Video Chat button
    const startBtn = page.getByRole('button', { name: /start video chat/i });
    await expect(startBtn).toBeVisible();
  });

  test('opens auth modal when clicking Start Video Chat', async ({ page }) => {
    await page.goto('/');

    const startBtn = page.getByRole('button', { name: /start video chat/i });
    await startBtn.click();

    // Modal should appear with Sign In / Create Account
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /register/i })).toBeVisible();
  });
});
