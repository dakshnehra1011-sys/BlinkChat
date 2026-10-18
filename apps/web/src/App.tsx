import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthModal } from './components/AuthModal.js';
import { InCallView } from './components/InCallView.js';
import { LandingView } from './components/LandingView.js';
import { Navbar } from './components/Navbar.js';
import { PreviewStage } from './components/PreviewStage.js';
import { ReportModal } from './components/ReportModal.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import './styles/theme.css';

import { getApiUrl } from './lib/api';

export function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('blinkchat_token'));
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'home' | 'stage'>('stage');
  const queryClient = useQueryClient();

  // TanStack Query for authenticated user session
  const { data: user = null } = useQuery<{
    id: string;
    email: string;
    emailVerified: boolean;
  } | null>({
    queryKey: ['currentUser', token],
    queryFn: async () => {
      if (!token) return null;
      const res = await fetch(getApiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem('blinkchat_token');
        setToken(null);
        return null;
      }
      return res.json();
    },
    enabled: !!token,
  });

  const {
    callState,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoDisabled,
    peerId,
    isDirectConnection,
    messages,
    statusMessage,
    startPreview,
    findStranger,
    nextStranger,
    leaveCall,
    cancelQueue,
    stopCamera,
    sendMessage,
    toggleAudio,
    toggleVideo,
  } = useWebRTC(token, user?.id || null);

  const handleAuthSuccess = (
    newToken: string,
    newUser: { id: string; email: string; emailVerified: boolean }
  ) => {
    setToken(newToken);
    localStorage.setItem('blinkchat_token', newToken);
    queryClient.setQueryData(['currentUser', newToken], newUser);
    setViewMode('stage');
  };

  const handleLogout = () => {
    leaveCall();
    stopCamera();
    setToken(null);
    localStorage.removeItem('blinkchat_token');
    queryClient.setQueryData(['currentUser', null], null);
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    setViewMode('home');
  };

  const handleNavigateHome = () => {
    leaveCall();
    stopCamera();
    setViewMode('home');
  };

  const handleNavigateStage = () => {
    setViewMode('stage');
  };

  const isInCall = callState === 'connecting' || callState === 'connected' || callState === 'ended';

  return (
    <>
      <Navbar
        user={user}
        isDirectConnection={isDirectConnection}
        activeView={user ? viewMode : 'home'}
        onNavigateHome={handleNavigateHome}
        onNavigateStage={handleNavigateStage}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: !user || viewMode === 'home' ? 'auto' : 'hidden',
          position: 'relative',
        }}
      >
        {!user || viewMode === 'home' ? (
          <LandingView
            isLoggedIn={!!user}
            onStart={() => (user ? handleNavigateStage() : setIsAuthOpen(true))}
          />
        ) : isInCall ? (
          <InCallView
            callState={callState}
            localStream={localStream}
            remoteStream={remoteStream}
            isAudioMuted={isAudioMuted}
            isVideoDisabled={isVideoDisabled}
            statusMessage={statusMessage}
            messages={messages}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
            onNextStranger={nextStranger}
            onLeaveCall={leaveCall}
            onOpenReport={() => setIsReportOpen(true)}
            onSendMessage={sendMessage}
          />
        ) : (
          <PreviewStage
            callState={callState}
            localStream={localStream}
            isAudioMuted={isAudioMuted}
            isVideoDisabled={isVideoDisabled}
            statusMessage={statusMessage}
            onStartPreview={startPreview}
            onFindStranger={findStranger}
            onCancelQueue={cancelQueue}
            onBackHome={handleNavigateHome}
            onToggleAudio={toggleAudio}
            onToggleVideo={toggleVideo}
          />
        )}
      </main>

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      <ReportModal
        isOpen={isReportOpen}
        reportedUserId={peerId}
        token={token}
        onClose={() => setIsReportOpen(false)}
        onReported={() => {
          nextStranger();
        }}
      />
    </>
  );
}

export default App;
