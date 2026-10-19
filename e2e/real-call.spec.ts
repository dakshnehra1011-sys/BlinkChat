import { type Browser, expect, type Page, test } from '@playwright/test';

const api = 'http://localhost:8787';

async function createAccount(email: string) {
  const password = 'BlinkChat-e2e-Password-42!';
  const register = await fetch(`${api}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ email, password }),
  });
  expect(register.status, `register ${email}`).toBe(201);
  const registration = await register.json();
  expect(registration.devToken).toBeUndefined();
  expect(registration.message).toContain('log in');

  const login = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(login.ok, `login ${email}`).toBeTruthy();
  return (await login.json()).token as string;
}

async function openPeer(
  browser: Browser,
  token: string
): Promise<{ page: Page; context: Awaited<ReturnType<Browser['newContext']>> }> {
  const context = await browser.newContext({
    permissions: ['camera', 'microphone'],
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await page.addInitScript((authToken) => {
    localStorage.setItem('blinkchat_token', authToken);
    const NativePeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = new Proxy(NativePeerConnection, {
      construct(target, args) {
        const pc = Reflect.construct(target, args);
        Object.defineProperty(window, '__blinkchatPeerConnection', {
          value: pc,
          configurable: true,
        });
        return pc;
      },
    });
  }, token);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Find Stranger' })).toBeVisible();
  await page.getByRole('button', { name: 'Find Stranger' }).click();
  return { page, context };
}

async function expectConnectedMedia(page: Page) {
  await expect(page.getByText('Stranger Connected', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(
      () => page.locator('.remote-video').evaluate((video: HTMLVideoElement) => video.videoWidth),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);
  const dimensions = await page
    .locator('.remote-video')
    .evaluate(async (video: HTMLVideoElement) => {
      const stream = video.srcObject as MediaStream | null;
      const pc = (window as any).__blinkchatPeerConnection as RTCPeerConnection | undefined;
      const reports = pc ? await pc.getStats() : null;
      return {
        ready: video.readyState,
        width: video.videoWidth,
        height: video.videoHeight,
        paused: video.paused,
        tracks:
          stream
            ?.getTracks()
            .map((track) => ({ kind: track.kind, state: track.readyState, muted: track.muted })) ??
          [],
        pcState: pc?.connectionState,
        inbound: reports
          ? [...reports.values()]
              .filter((entry: any) => entry.type === 'inbound-rtp')
              .map((entry: any) => ({
                kind: entry.kind ?? entry.mediaType,
                bytes: entry.bytesReceived ?? 0,
                frames: entry.framesDecoded ?? 0,
              }))
          : [],
      };
    });
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  expect(dimensions.ready).toBeGreaterThanOrEqual(2);
}

test.describe('real WebRTC sessions through the local Cloudflare Worker', () => {
  test('connects four accounts as two independent calls with video, audio, and data-channel chat', async ({
    browser,
  }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tokens = await Promise.all(
      ['a', 'b', 'c', 'd'].map((suffix) => createAccount(`e2e-${stamp}-${suffix}@example.com`))
    );
    const peers: Awaited<ReturnType<typeof openPeer>>[] = [];
    try {
      // Alternate queue entry so the two sessions exercise repeated DO pairing.
      peers.push(await openPeer(browser, tokens[0]!));
      peers.push(await openPeer(browser, tokens[1]!));
      peers.push(await openPeer(browser, tokens[2]!));
      peers.push(await openPeer(browser, tokens[3]!));

      await Promise.all(peers.map(({ page }) => expectConnectedMedia(page)));

      // Each matched pair can exchange chat over its WebRTC RTCDataChannel.
      for (const [left, right] of [
        [0, 1],
        [2, 3],
      ] as const) {
        const sender = peers[left]!.page;
        const receiver = peers[right]!.page;
        const message = `p2p-${stamp}-${left}`;
        await sender.locator('.chat-input').fill(message);
        await sender.locator('.chat-input').press('Enter');
        await expect(receiver.locator('.chat-messages')).toContainText(message, {
          timeout: 10_000,
        });
      }

      // Ensure the selected media senders are live and produce RTP packets.
      for (const { page } of peers) {
        const stats = await page
          .locator('.remote-video')
          .evaluate(async (video: HTMLVideoElement) => {
            const receiver = (video.srcObject as MediaStream | null)?.getTracks() ?? [];
            const pc = (window as any).__blinkchatPeerConnection as RTCPeerConnection | undefined;
            const reports = pc ? await pc.getStats() : null;
            return {
              audioTrack: receiver.some((track) => track.kind === 'audio'),
              videoTrack: receiver.some((track) => track.kind === 'video'),
              inbound: reports
                ? [...reports.values()]
                    .filter((entry: any) => entry.type === 'inbound-rtp' && !entry.isRemote)
                    .map((entry: any) => ({
                      kind: entry.kind ?? entry.mediaType,
                      bytes: entry.bytesReceived ?? 0,
                    }))
                : [],
            };
          });
        expect(stats.audioTrack).toBe(true);
        expect(stats.videoTrack).toBe(true);
        expect(
          stats.inbound.some(
            (entry: { kind: string; bytes: number }) => entry.kind === 'video' && entry.bytes > 0
          )
        ).toBe(true);
        expect(
          stats.inbound.some(
            (entry: { kind: string; bytes: number }) => entry.kind === 'audio' && entry.bytes > 0
          )
        ).toBe(true);
      }
    } finally {
      await Promise.all(peers.map(({ context }) => context.close()));
    }
  });
});
