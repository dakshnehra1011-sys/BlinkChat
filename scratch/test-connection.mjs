// Using global WebSocket built into Node.js 22+

const BASE_URL = 'https://blinkchat-worker.blinkchat.workers.dev';
const WS_BASE_URL = 'wss://blinkchat-worker.blinkchat.workers.dev';

async function registerAndLogin(email, password) {
  console.log(`[Auth] Registering ${email}...`);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  console.log(`[Auth] Register response: ${regRes.status}`);

  console.log(`[Auth] Logging in ${email}...`);
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  console.log(`[Auth] Login response: ${loginRes.status}`);
  const data = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function runTest() {
  try {
    const ts = Date.now();
    const user1Data = await registerAndLogin(`singleuser_${ts}@gmail.com`, 'SecurePass123!@#');
    // Simulate user logging into their account on BOTH desktop and phone:
    const user2Data = user1Data;

    console.log(`User 1 ID: ${user1Data.user.id}, Token length: ${user1Data.token.length}`);
    console.log(`User 2 ID: ${user2Data.user.id}, Token length: ${user2Data.token.length}`);

    // Test 1: Matchmaking Queue with SAME user on 2 different devices/tabs
    console.log('\n--- Connecting to Matchmaker WS with SAME user on both devices ---');
    const ws1 = new WebSocket(`${WS_BASE_URL}/api/ws/match?token=${encodeURIComponent(user1Data.token)}&clientId=device_desktop_1`);
    const ws2 = new WebSocket(`${WS_BASE_URL}/api/ws/match?token=${encodeURIComponent(user2Data.token)}&clientId=device_mobile_2`);

    let match1 = null;
    let match2 = null;

    ws1.onopen = () => {
      console.log('WS1 connected to Matchmaker, sending queue.join');
      ws1.send(JSON.stringify({ type: 'queue.join' }));
    };

    ws1.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString());
      console.log('WS1 received:', msg);
      if (msg.type === 'match.found') match1 = msg;
    };

    ws1.onerror = (err) => console.error('WS1 error:', err);
    ws1.onclose = (e) => console.log('WS1 closed:', e.code, e.reason);

    ws2.onopen = () => {
      console.log('WS2 connected to Matchmaker, sending queue.join');
      ws2.send(JSON.stringify({ type: 'queue.join' }));
    };

    ws2.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString());
      console.log('WS2 received:', msg);
      if (msg.type === 'match.found') match2 = msg;
    };

    ws2.onerror = (err) => console.error('WS2 error:', err);
    ws2.onclose = (e) => console.log('WS2 closed:', e.code, e.reason);

    // Wait for match
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (match1 && match2) break;
    }

    if (!match1 || !match2) {
      console.error('FAILED: Matchmaker did not match both users in 15 seconds!');
      process.exit(1);
    }

    console.log('\nSUCCESS: Both users matched!', { match1, match2 });
    ws1.close();
    ws2.close();

    // Test 2: Signaling DO
    console.log('\n--- Connecting to Signaling WS ---');
    const sessionId = match1.sessionId;
    const sigWs1 = new WebSocket(`${WS_BASE_URL}/api/ws/session?token=${encodeURIComponent(user1Data.token)}&sessionId=${encodeURIComponent(sessionId)}&clientId=device_desktop_1`);
    const sigWs2 = new WebSocket(`${WS_BASE_URL}/api/ws/session?token=${encodeURIComponent(user2Data.token)}&sessionId=${encodeURIComponent(sessionId)}&clientId=device_mobile_2`);

    let peer2GotOffer = false;
    let peer1GotAnswer = false;
    let peer2GotIce = false;

    sigWs1.onopen = () => {
      console.log('SigWS1 connected (Initiator), sending offer...');
      sigWs1.send(JSON.stringify({
        type: 'signal.offer',
        sessionId,
        sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
      }));
    };

    sigWs1.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString());
      console.log('SigWS1 received:', msg);
      if (msg.type === 'signal.answer') peer1GotAnswer = true;
    };

    sigWs2.onopen = () => {
      console.log('SigWS2 connected (Receiver)');
    };

    sigWs2.onmessage = (event) => {
      const msg = JSON.parse(event.data.toString());
      console.log('SigWS2 received:', msg);
      if (msg.type === 'signal.offer') {
        peer2GotOffer = true;
        console.log('SigWS2 sending answer...');
        sigWs2.send(JSON.stringify({
          type: 'signal.answer',
          sessionId,
          sdp: 'v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n'
        }));
        console.log('SigWS2 sending ICE...');
        sigWs2.send(JSON.stringify({
          type: 'signal.ice',
          sessionId,
          candidate: {
            candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0
          }
        }));
      }
      if (msg.type === 'signal.ice') {
        peer2GotIce = true;
      }
    };

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (peer2GotOffer && peer1GotAnswer) break;
    }

    console.log('\nSignaling Results:');
    console.log('Peer 2 got Offer:', peer2GotOffer);
    console.log('Peer 1 got Answer:', peer1GotAnswer);

    sigWs1.close();
    sigWs2.close();
  } catch (err) {
    console.error('Test crashed:', err);
  }
}

runTest();
