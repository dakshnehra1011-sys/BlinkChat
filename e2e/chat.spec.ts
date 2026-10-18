import { expect, test } from '@playwright/test';

test.describe('BlinkChat E2E Suite', () => {
  test('renders landing page with headline and start button', async ({ page }) => {
    await page.goto('/');

    // Check branding
    await expect(page.getByRole('button', { name: 'BlinkChat' })).toBeVisible();

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
    await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
  });

  test('keeps landing and sign-in modal within common viewport widths', async ({ page }) => {
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('button', { name: /start video chat/i })).toBeVisible();

      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(pageWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width);

      if (width <= 390) {
        await page.getByRole('button', { name: /sign in or register/i }).click();
        const modal = page.locator('.modal-content');
        await expect(modal).toBeVisible();
        const bounds = await modal.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      }
    }
  });

  test('keeps the call layout inside portrait and landscape phone and desktop screens', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 320, height: 844 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 640, height: 360 },
      { width: 844, height: 390 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.evaluate(() => {
        document.body.innerHTML = `
          <nav class="navbar"><span>BlinkChat</span></nav>
          <main class="call-layout">
            <section class="video-container">
              <div class="video-stage-topbar"><span class="video-stage-pill">Connected</span><button class="video-stage-leave-btn">Back to Stage</button></div>
              <video class="remote-video"></video>
              <div class="local-video-card"><video class="local-video-preview"></video></div>
              <div class="call-controls-overlay">
                <button class="dock-btn">Mic</button><button class="dock-btn">Camera</button>
                <button class="dock-btn-next">Next</button><button class="dock-btn-leave">End</button>
                <button class="dock-btn">Chat</button><button class="dock-btn">Report</button>
              </div>
            </section>
            <aside class="chat-panel"><div class="chat-header">Direct Chat</div><div class="chat-messages"></div><div class="quick-emoji-bar">Reactions</div><form class="chat-input-area"><input class="chat-input" /></form></aside>
          </main>`;
      });

      const layout = await page.locator('.call-layout').boundingBox();
      const video = await page.locator('.video-container').boundingBox();
      const remoteVideo = await page.locator('.remote-video').boundingBox();
      const chat = await page.locator('.chat-panel').boundingBox();
      expect(layout, `call layout missing at ${viewport.width}x${viewport.height}`).not.toBeNull();
      expect(video, `video stage missing at ${viewport.width}x${viewport.height}`).not.toBeNull();
      expect(chat, `chat panel missing at ${viewport.width}x${viewport.height}`).not.toBeNull();
      expect(video!.x).toBeGreaterThanOrEqual(0);
      expect(video!.x).toBe(0);
      expect(video!.x + video!.width).toBeLessThanOrEqual(viewport.width);
      expect(remoteVideo?.x).toBe(video!.x);
      expect(remoteVideo?.width).toBe(video!.width);
      expect(chat!.x).toBeGreaterThanOrEqual(0);
      expect(chat!.x + chat!.width).toBeLessThanOrEqual(viewport.width);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(
        documentWidth,
        `call layout overflows at ${viewport.width}x${viewport.height}`
      ).toBeLessThanOrEqual(viewport.width);
    }
  });

  test('keeps camera preview and controls usable on narrow phones', async ({ page }) => {
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mobile-test',
          email: 'mobile@example.com',
          emailVerified: true,
        }),
      })
    );
    await page.addInitScript(() => {
      localStorage.setItem('blinkchat_token', 'mobile-test-token');
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => {
            const canvas = document.createElement('canvas');
            return canvas.captureStream(15);
          },
        },
      });
    });

    for (const width of [320, 360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Find Stranger' })).toBeVisible();
      const card = await page.locator('.preview-card').boundingBox();
      expect(card).not.toBeNull();
      expect(card!.x).toBeGreaterThanOrEqual(0);
      expect(card!.x + card!.width).toBeLessThanOrEqual(width);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth, `preview overflows at ${width}px`).toBeLessThanOrEqual(width);
      const cameraToggle = page.getByRole('button', { name: 'Disable Camera' });
      await expect(cameraToggle).toBeVisible();
      await cameraToggle.click();
      await expect(page.getByRole('button', { name: 'Enable Camera' })).toBeVisible();
    }
  });
});
