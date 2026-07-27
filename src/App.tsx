import React, { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { SenderView } from './components/SenderView';
import { ReceiverView } from './components/ReceiverView';
import { QRCodeModal } from './components/QRCodeModal';
import { PWAInstaller } from './components/PWAInstaller';
import { ConnectionStatus, FileItem, ManifestFilePayload, UserRole } from './types';
import { P2PTransferEngine } from './services/webrtc';
import { AlertCircle, ShieldCheck, Zap } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<UserRole>('sender');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);

  // Fichiers côté expéditeur
  const [senderFiles, setSenderFiles] = useState<{ fileObj: File; item: FileItem }[]>([]);

  // Fichiers côté destinataire (reçus par le manifeste)
  const [receiverFiles, setReceiverFiles] = useState<FileItem[]>([]);

  // État du transfert actif
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [currentTransferringFile, setCurrentTransferringFile] = useState<FileItem | null>(null);
  const [overallTransferredBytes, setOverallTransferredBytes] = useState<number>(0);
  const [overallTotalBytes, setOverallTotalBytes] = useState<number>(0);
  const [overallSpeedBps, setOverallSpeedBps] = useState<number>(0);
  const [overallEtaSeconds, setOverallEtaSeconds] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Bilan final
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [completedFiles, setCompletedFiles] = useState<FileItem[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number | undefined>();
  const [sessionEndTime, setSessionEndTime] = useState<number | undefined>();

  // Modales et notifications
  const [isQRCodeOpen, setIsQRCodeOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const engineRef = useRef<P2PTransferEngine | null>(null);
  const senderFilesRef = useRef<{ fileObj: File; item: FileItem }[]>([]);
  const receiverFilesRef = useRef<FileItem[]>([]);

  useEffect(() => {
    senderFilesRef.current = senderFiles;
  }, [senderFiles]);

  useEffect(() => {
    receiverFilesRef.current = receiverFiles;
  }, [receiverFiles]);

  // Initialisation du moteur WebRTC et détection de paramètre d'URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');

    const engine = new P2PTransferEngine({
      onConnectionStateChange: (state) => {
        if (state === 'connected') {
          setConnectionStatus('connected');
          setIsPeerConnected(true);
        } else if (state === 'connecting') {
          setConnectionStatus('connecting');
        } else {
          setConnectionStatus('disconnected');
          setIsPeerConnected(false);
        }
      },
      onPeerConnected: () => {
        setIsPeerConnected(true);
        setConnectionStatus('connected');
        if (engineRef.current && senderFilesRef.current.length > 0) {
          engineRef.current.sendManifest(senderFilesRef.current);
        }
      },
      onPeerDisconnected: () => {
        setIsPeerConnected(false);
        setConnectionStatus('disconnected');
      },
      onManifestReceived: (manifest: ManifestFilePayload[]) => {
        const items: FileItem[] = manifest.map((m, idx) => ({
          id: m.id,
          name: m.name,
          relativePath: m.relativePath || m.name,
          size: m.size,
          type: m.type,
          sha256: m.sha256,
          status: 'ready',
          selected: true,
          priority: idx,
          transferredBytes: 0,
          speedBps: 0,
          etaSeconds: 0,
        }));
        setReceiverFiles(items);
      },
      onSelectionReceived: async (selectedIds, priorityOrder) => {
        // L'expéditeur reçoit la demande de sélection et démarre l'émission
        setIsTransferring(true);
        setIsCompleted(false);
        setSessionStartTime(Date.now());

        const filesToTransfer = senderFilesRef.current.filter((f) => selectedIds.includes(f.item.id));
        const totalSize = filesToTransfer.reduce((acc, f) => acc + f.item.size, 0);
        setOverallTotalBytes(totalSize);
        setOverallTransferredBytes(0);

        await engine.startSendingSequence(priorityOrder, (fileId, progress, speed, eta) => {
          setOverallSpeedBps(speed);
          setOverallEtaSeconds(eta);
        });
      },
      onFileStart: (fileId, size) => {
        setIsTransferring(true);
        if (!sessionStartTime) setSessionStartTime(Date.now());

        const target = receiverFilesRef.current.find((f) => f.id === fileId);
        if (target) {
          setCurrentTransferringFile(target);
        }
      },
      onFileProgress: (_fileId, transferred, _total, speed, eta) => {
        setOverallTransferredBytes((prev) => Math.max(prev, transferred));
        setOverallSpeedBps(speed);
        setOverallEtaSeconds(eta);
      },
      onFileCompleted: (fileId, sha256Verified) => {
        setReceiverFiles((prev) =>
          prev.map((f) =>
            f.id === fileId
              ? { ...f, status: 'completed', hashVerified: sha256Verified }
              : f
          )
        );

        setCompletedFiles((prev) => {
          const file = receiverFilesRef.current.find((f) => f.id === fileId);
          if (file && !prev.some((p) => p.id === fileId)) {
            return [...prev, { ...file, hashVerified: sha256Verified }];
          }
          return prev;
        });

        // Vérifier si tous les fichiers sélectionnés sont terminés
        setTimeout(() => {
          setReceiverFiles((currentFiles) => {
            const selected = currentFiles.filter((f) => f.selected);
            const allDone = selected.every((f) => f.status === 'completed');
            if (allDone && selected.length > 0) {
              setIsTransferring(false);
              setIsCompleted(true);
              setSessionEndTime(Date.now());
            }
            return currentFiles;
          });
        }, 500);
      },
      onSessionError: (err) => {
        setErrorMessage(err);
        setIsTransferring(false);
      },
      onPauseChange: (paused) => {
        setIsPaused(paused);
      },
    });

    engineRef.current = engine;

    if (roomFromUrl) {
      setRole('receiver');
      setRoomCodeInput(roomFromUrl.toUpperCase());
    } else {
      // Création automatique de la salle côté expéditeur
      engine.createRoom().then((code) => {
        setRoomCode(code);
        setConnectionStatus('waiting_peer');
      }).catch(console.error);
    }

    return () => {
      engine.disconnect();
    };
  }, []);

  // Changement manuel de rôle (Expéditeur / Destinataire)
  const handleSelectRole = async (newRole: UserRole) => {
    if (!newRole || newRole === role) return;
    setRole(newRole);
    setErrorMessage(null);

    if (engineRef.current) {
      if (newRole === 'sender') {
        try {
          const code = await engineRef.current.createRoom();
          setRoomCode(code);
          setConnectionStatus('waiting_peer');
        } catch (err: any) {
          setErrorMessage(err.message);
        }
      } else {
        setConnectionStatus('disconnected');
      }
    }
  };

  // Gestionnaires Expéditeur
  const handleAddFiles = (newEntries: { fileObj: File; item: FileItem }[]) => {
    const updated = [...senderFiles, ...newEntries];
    setSenderFiles(updated);
    senderFilesRef.current = updated;

    if (engineRef.current) {
      engineRef.current.sendManifest(updated);
    }
  };

  const handleRemoveFile = (fileId: string) => {
    const updated = senderFiles.filter((f) => f.item.id !== fileId);
    setSenderFiles(updated);
    senderFilesRef.current = updated;

    if (engineRef.current) {
      engineRef.current.sendManifest(updated);
    }
  };

  const handleClearFiles = () => {
    setSenderFiles([]);
    senderFilesRef.current = [];
    if (engineRef.current) {
      engineRef.current.sendManifest([]);
    }
  };

  // Gestionnaires Destinataire
  const handleJoinRoom = async (code: string) => {
    if (!engineRef.current) return;
    setErrorMessage(null);
    setConnectionStatus('connecting');

    try {
      const joinedCode = await engineRef.current.joinRoom(code);
      setRoomCode(joinedCode);
      setConnectionStatus('waiting_peer');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur lors de la tentative d\'accès à la salle.');
      setConnectionStatus('error');
    }
  };

  const handleToggleFileSelected = (fileId: string) => {
    setReceiverFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, selected: !f.selected } : f))
    );
  };

  const handleSelectAllFiles = (selected: boolean) => {
    setReceiverFiles((prev) => prev.map((f) => ({ ...f, selected })));
  };

  const handleMoveFilePriority = (fileId: string, direction: 'up' | 'down') => {
    setReceiverFiles((prev) => {
      const idx = prev.findIndex((f) => f.id === fileId);
      if (idx === -1) return prev;

      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;

      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(newIdx, 0, moved);
      return copy;
    });
  };

  const handleStartDownload = () => {
    if (!engineRef.current) return;

    const selected = receiverFiles.filter((f) => f.selected);
    if (selected.length === 0) return;

    const selectedIds = selected.map((f) => f.id);
    const priorityOrder = receiverFiles.filter((f) => f.selected).map((f) => f.id);

    const totalSize = selected.reduce((acc, f) => acc + f.size, 0);
    setOverallTotalBytes(totalSize);
    setOverallTransferredBytes(0);
    setIsTransferring(true);
    setIsCompleted(false);
    setSessionStartTime(Date.now());

    engineRef.current.sendSelectionRequest(selectedIds, priorityOrder);
  };

  const handleTogglePause = () => {
    if (engineRef.current) {
      const newPaused = engineRef.current.togglePause();
      setIsPaused(newPaused);
    }
  };

  const handleCancelTransfer = () => {
    if (engineRef.current) {
      engineRef.current.cancelTransfer();
      setIsTransferring(false);
    }
  };

  const handleResetSession = () => {
    setIsCompleted(false);
    setIsTransferring(false);
    setCompletedFiles([]);
    setOverallTransferredBytes(0);
    setOverallTotalBytes(0);
  };

  // Calculs de durée et vitesse moyenne de session
  const totalDurationSeconds =
    sessionStartTime && sessionEndTime
      ? (sessionEndTime - sessionStartTime) / 1000
      : 1;

  const averageSessionSpeedBps =
    totalDurationSeconds > 0 ? overallTotalBytes / totalDurationSeconds : 0;

  const shareUrl = roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  return (
    <div className="min-h-screen app-gradient-bg text-slate-100 flex flex-col font-sans selection:bg-blue-500/30 selection:text-blue-200">
      <PWAInstaller />

      <Header
        role={role}
        onSelectRole={handleSelectRole}
        connectionStatus={connectionStatus}
        roomCode={roomCode}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Alerte d'erreur */}
        {errorMessage && (
          <div className="glass-panel-sm p-4 border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-slate-400 hover:text-white underline text-xs transition-colors"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Vue Expéditeur vs Destinataire */}
        {role === 'sender' ? (
          <SenderView
            roomCode={roomCode}
            files={senderFiles}
            onAddFiles={handleAddFiles}
            onRemoveFile={handleRemoveFile}
            onClearFiles={handleClearFiles}
            isPeerConnected={isPeerConnected}
            isTransferring={isTransferring}
            currentFileTransferring={currentTransferringFile}
            overallTransferredBytes={overallTransferredBytes}
            overallTotalBytes={overallTotalBytes}
            overallSpeedBps={overallSpeedBps}
            overallEtaSeconds={overallEtaSeconds}
            isPaused={isPaused}
            onTogglePause={handleTogglePause}
            onCancelTransfer={handleCancelTransfer}
            onOpenQRCode={() => setIsQRCodeOpen(true)}
          />
        ) : (
          <ReceiverView
            roomCodeInput={roomCodeInput}
            setRoomCodeInput={setRoomCodeInput}
            onJoinRoom={handleJoinRoom}
            isConnectedToSender={isPeerConnected}
            availableFiles={receiverFiles}
            onRequestManifest={() => engineRef.current?.requestManifest()}
            onToggleFileSelected={handleToggleFileSelected}
            onSelectAllFiles={handleSelectAllFiles}
            onMoveFilePriority={handleMoveFilePriority}
            onStartDownload={handleStartDownload}
            isTransferring={isTransferring}
            currentReceivingFile={currentTransferringFile}
            overallTransferredBytes={overallTransferredBytes}
            overallTotalBytes={overallTotalBytes}
            overallSpeedBps={overallSpeedBps}
            overallEtaSeconds={overallEtaSeconds}
            isCompleted={isCompleted}
            completedFiles={completedFiles}
            totalSessionDurationSeconds={totalDurationSeconds}
            averageSessionSpeedBps={averageSessionSpeedBps}
            onResetSession={handleResetSession}
          />
        )}
      </main>

      {/* Modale QR Code */}
      <QRCodeModal
        isOpen={isQRCodeOpen}
        onClose={() => setIsQRCodeOpen(false)}
        roomCode={roomCode || ''}
        shareUrl={shareUrl}
      />

      {/* Pied de page */}
      <footer className="border-t border-white/10 bg-black/20 backdrop-blur-md py-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Transferts WebRTC chiffrés de bout en bout (DTLS) • Direct Navigateur à Navigateur</span>
          </div>
          <div>
            <span className="opacity-75">AirStream P2P • Sans serveur de stockage cloud</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
