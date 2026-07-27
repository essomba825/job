import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  File,
  FolderPlus,
  Trash2,
  Copy,
  Check,
  QrCode,
  Pause,
  Play,
  XCircle,
  FileText,
  FileCode,
  FileArchive,
  FileVideo,
  FileAudio,
  FileImage,
  ShieldCheck,
  Send,
  Zap,
} from 'lucide-react';
import { FileItem } from '../types';
import { formatBytes, formatSpeed, formatTime, getFileCategory } from '../utils/format';
import { extractFilesFromDataTransfer } from '../utils/folderReader';
import { computeFileSHA256 } from '../utils/sha256';

interface SenderViewProps {
  roomCode: string | null;
  files: { fileObj: File; item: FileItem }[];
  onAddFiles: (newFiles: { fileObj: File; item: FileItem }[]) => void;
  onRemoveFile: (fileId: string) => void;
  onClearFiles: () => void;
  isPeerConnected: boolean;
  isTransferring: boolean;
  currentFileTransferring: FileItem | null;
  overallTransferredBytes: number;
  overallTotalBytes: number;
  overallSpeedBps: number;
  overallEtaSeconds: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onCancelTransfer: () => void;
  onOpenQRCode: () => void;
}

export const SenderView: React.FC<SenderViewProps> = ({
  roomCode,
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  isPeerConnected,
  isTransferring,
  currentFileTransferring,
  overallTransferredBytes,
  overallTotalBytes,
  overallSpeedBps,
  overallEtaSeconds,
  isPaused,
  onTogglePause,
  onCancelTransfer,
  onOpenQRCode,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [calculatingHashId, setCalculatingHashId] = useState<string | null>(null);

  // Traitement du glisser-déposer
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.items) {
      const extracted = await extractFilesFromDataTransfer(e.dataTransfer.items);
      addExtractedFiles(extracted);
    } else if (e.dataTransfer.files) {
      const fileList = Array.from(e.dataTransfer.files) as File[];
      const array = fileList.map((f: File) => ({
        file: f,
        relativePath: f.name,
      }));
      addExtractedFiles(array);
    }
  };

  const addExtractedFiles = (extracted: { file: File; relativePath: string }[]) => {
    const newEntries = extracted.map(({ file, relativePath }) => {
      const id = `f_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const item: FileItem = {
        id,
        name: file.name,
        relativePath: relativePath || file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        status: 'ready',
        selected: true,
        priority: 0,
        transferredBytes: 0,
        speedBps: 0,
        etaSeconds: 0,
        fileObj: file,
      };
      return { fileObj: file, item };
    });

    onAddFiles(newEntries);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileList = Array.from(e.target.files) as File[];
      const array = fileList.map((f: File) => ({
        file: f,
        relativePath: (f as any).webkitRelativePath || f.name,
      }));
      addExtractedFiles(array);
    }
  };

  const handleCalculateHash = async (fileObj: File, item: FileItem) => {
    setCalculatingHashId(item.id);
    const hash = await computeFileSHA256(fileObj);
    item.sha256 = hash;
    setCalculatingHashId(null);
  };

  const shareUrl = roomCode
    ? `${window.location.origin}${window.location.pathname}?room=${roomCode}`
    : '';

  const copyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const copyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const getCategoryIcon = (mimeType: string, filename: string) => {
    const category = getFileCategory(mimeType, filename);
    switch (category) {
      case 'image':
        return <FileImage className="w-4 h-4 text-emerald-400" />;
      case 'video':
        return <FileVideo className="w-4 h-4 text-purple-400" />;
      case 'audio':
        return <FileAudio className="w-4 h-4 text-pink-400" />;
      case 'archive':
        return <FileArchive className="w-4 h-4 text-amber-400" />;
      case 'code':
        return <FileCode className="w-4 h-4 text-cyan-400" />;
      case 'document':
        return <FileText className="w-4 h-4 text-blue-400" />;
      default:
        return <File className="w-4 h-4 text-slate-400" />;
    }
  };

  const totalBytes = files.reduce((acc, f) => acc + f.item.size, 0);

  return (
    <div className="space-y-6">
      {/* Notice d'utilisation Frosted Glass */}
      <div className="glass-panel p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-inner">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
              Mode Expéditeur – Partage de gros fichiers
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Vous possédez des fichiers volumineux (plusieurs Go à 50 Go+) et souhaitez les envoyer directement à votre correspondant.
              Glissez vos fichiers ou dossiers ci-dessous. Ils seront transmis en <strong>stricte liaison P2P directe</strong> dès que le destinataire validera sa sélection. Aucun fichier ne transite par un cloud.
            </p>
          </div>
        </div>
      </div>

      {/* Code de salle et boutons de partage */}
      <div className="glass-panel p-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-widest font-bold">
              Code de salon P2P
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <div className="room-code-box">
                <span className="font-mono text-2xl font-black text-blue-400 tracking-widest">
                  {roomCode || '******'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {isPeerConnected ? (
                  <span className="badge-p2p flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    Destinataire connecté
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 backdrop-blur-md">
                    En attente du destinataire...
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={copyCode}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-white/10 backdrop-blur-md transition-all active:scale-95"
            >
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-blue-400" />}
              <span>{copiedCode ? 'Code copié' : 'Copier le code'}</span>
            </button>

            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 active:scale-95"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLink ? 'Lien copié' : 'Copier le lien direct'}</span>
            </button>

            <button
              onClick={onOpenQRCode}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-blue-400 text-xs font-semibold border border-white/10 backdrop-blur-md transition-all active:scale-95"
              title="Afficher le QR code pour connexion mobile"
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </button>
          </div>
        </div>
      </div>

      {/* Zone de Glisser-Déposer de Fichiers & Dossiers */}
      {!isTransferring && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`glass-panel p-10 text-center transition-all cursor-pointer relative ${
            isDragOver
              ? 'border-blue-400/60 bg-blue-500/10 shadow-2xl shadow-blue-500/20 scale-[1.01]'
              : 'hover:border-white/20 hover:bg-white/[0.05]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={handleFileInputChange}
          />

          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-4 shadow-inner backdrop-blur-md">
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-lg font-bold text-white mb-1">
            Glissez-déposez vos fichiers ou dossiers ici
          </h3>
          <p className="text-xs text-slate-400 max-w-lg mx-auto mb-6">
            Supporte les fichiers très volumineux (plus de 50 Go) et l'arborescence complète des dossiers.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/30 active:scale-95"
            >
              <File className="w-4 h-4" />
              <span>Parcourir des fichiers</span>
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-semibold text-xs border border-white/10 backdrop-blur-md transition-all active:scale-95"
            >
              <FolderPlus className="w-4 h-4 text-blue-400" />
              <span>Ajouter un dossier entier</span>
            </button>
          </div>
        </div>
      )}

      {/* Panneau de progression du transfert en cours */}
      {isTransferring && (
        <div className="glass-panel p-6 shadow-2xl relative overflow-hidden space-y-5">
          <div className="absolute top-0 left-0 right-0 h-2 bg-black/40">
            <div
              className="h-full animate-shimmer shadow-[0_0_15px_rgba(6,182,212,0.6)]"
              style={{
                width: `${Math.max(2, overallTotalBytes > 0 ? (overallTransferredBytes / overallTotalBytes) * 100 : 0)}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 pt-1 flex-wrap">
            <div>
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Transfert P2P Direct & Chiffré en cours
              </span>
              <h3 className="text-lg font-extrabold text-white truncate mt-0.5">
                {currentFileTransferring ? currentFileTransferring.relativePath : 'Envoi des morceaux de fichiers...'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onTogglePause}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-white/10 backdrop-blur-md transition-all active:scale-95"
              >
                {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                <span>{isPaused ? 'Reprendre' : 'Pause'}</span>
              </button>
              <button
                onClick={onCancelTransfer}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 backdrop-blur-md transition-all active:scale-95"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Annuler</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/40 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Vitesse d'émission</div>
              <div className="text-base font-extrabold text-cyan-400 font-mono mt-0.5">
                {overallSpeedBps > 0 ? formatSpeed(overallSpeedBps) : 'Calcul du débit...'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Temps restant (ETA)</div>
              <div className="text-base font-extrabold text-slate-200 font-mono mt-0.5">
                {overallSpeedBps > 0 && overallEtaSeconds > 0 ? formatTime(overallEtaSeconds) : 'En attente...'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Volume transmis</div>
              <div className="text-base font-bold text-slate-300 font-mono mt-0.5">
                {formatBytes(overallTransferredBytes)} / {formatBytes(overallTotalBytes)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Progression globale</div>
              <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                {overallTotalBytes > 0 ? ((overallTransferredBytes / overallTotalBytes) * 100).toFixed(1) : '0.0'} %
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Liste des fichiers prêts à envoyer */}
      {files.length > 0 && (
        <div className="glass-panel overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/10 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Fichiers préparés</span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-xs font-mono border border-white/10">
                  {files.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Taille totale : <strong>{formatBytes(totalBytes)}</strong>
              </p>
            </div>

            {!isTransferring && (
              <button
                onClick={onClearFiles}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-white/5 text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Tout supprimer</span>
              </button>
            )}
          </div>

          <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
            {files.map(({ fileObj, item }) => (
              <div
                key={item.id}
                className={`file-card p-3.5 flex items-center justify-between gap-3 ${
                  currentFileTransferring?.id === item.id ? 'active' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 backdrop-blur-md">
                    {getCategoryIcon(item.type, item.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate" title={item.relativePath}>
                      {item.relativePath}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{formatBytes(item.size)}</span>
                      <span>•</span>
                      {item.sha256 ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-mono text-[10px]">
                          <ShieldCheck className="w-3 h-3" /> SHA-256 : {item.sha256.substring(0, 10)}...
                        </span>
                      ) : (
                        <button
                          onClick={() => handleCalculateHash(fileObj, item)}
                          disabled={calculatingHashId === item.id}
                          className="text-blue-400 hover:underline text-[10px] font-medium"
                        >
                          {calculatingHashId === item.id ? 'Calcul de l\'empreinte...' : 'Calculer l\'empreinte SHA-256'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!isTransferring && (
                  <button
                    onClick={() => onRemoveFile(item.id)}
                    className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors"
                    title="Retirer ce fichier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
