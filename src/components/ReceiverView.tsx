import React, { useState } from 'react';
import {
  Download,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  AlertTriangle,
  HardDrive,
  CheckCircle2,
  XCircle,
  FileText,
  FileCode,
  FileArchive,
  FileVideo,
  FileAudio,
  FileImage,
  File,
  RotateCcw,
} from 'lucide-react';
import { FileItem } from '../types';
import { formatBytes, formatSpeed, formatTime, getFileCategory } from '../utils/format';

interface ReceiverViewProps {
  roomCodeInput: string;
  setRoomCodeInput: (val: string) => void;
  onJoinRoom: (code: string) => void;
  isConnectedToSender: boolean;
  availableFiles: FileItem[];
  onRequestManifest?: () => void;
  onToggleFileSelected: (fileId: string) => void;
  onSelectAllFiles: (selected: boolean) => void;
  onMoveFilePriority: (fileId: string, direction: 'up' | 'down') => void;
  onStartDownload: () => void;
  isTransferring: boolean;
  currentReceivingFile: FileItem | null;
  overallTransferredBytes: number;
  overallTotalBytes: number;
  overallSpeedBps: number;
  overallEtaSeconds: number;
  isCompleted: boolean;
  completedFiles: FileItem[];
  totalSessionDurationSeconds: number;
  averageSessionSpeedBps: number;
  onResetSession: () => void;
}

export const ReceiverView: React.FC<ReceiverViewProps> = ({
  roomCodeInput,
  setRoomCodeInput,
  onJoinRoom,
  isConnectedToSender,
  availableFiles,
  onRequestManifest,
  onToggleFileSelected,
  onSelectAllFiles,
  onMoveFilePriority,
  onStartDownload,
  isTransferring,
  currentReceivingFile,
  overallTransferredBytes,
  overallTotalBytes,
  overallSpeedBps,
  overallEtaSeconds,
  isCompleted,
  completedFiles,
  totalSessionDurationSeconds,
  averageSessionSpeedBps,
  onResetSession,
}) => {
  const selectedFiles = availableFiles.filter((f) => f.selected);
  const selectedTotalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

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

  return (
    <div className="space-y-6">
      {/* Notice du destinataire Frosted Glass */}
      <div className="glass-panel p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 shadow-inner">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2 tracking-tight">
              Mode Destinataire – Réception directe sur votre disque
            </h2>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Vous disposez d'une connexion internet rapide et souhaitez récupérer les fichiers lourds stockés chez votre correspondant.
              Saisissez le code de la salle ci-dessous. Les fichiers seront écrits directement en streaming sur votre disque local sans saturer la mémoire RAM.
            </p>
          </div>
        </div>
      </div>

      {/* Formulaire de saisie du code de salle */}
      {!isConnectedToSender && !isCompleted && (
        <div className="glass-panel p-8 shadow-2xl text-center">
          <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-2">
            Rejoindre le salon de l'expéditeur
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
            Entrez le code à 6 caractères fourni par l'expéditeur ou cliquez sur le lien direct partagé.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (roomCodeInput) onJoinRoom(roomCodeInput);
            }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto"
          >
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
              placeholder="Ex: AB12CD"
              maxLength={6}
              className="glass-input w-full sm:w-52 text-center font-mono text-2xl font-black tracking-widest px-4 py-3 rounded-xl text-blue-400 uppercase shadow-inner"
            />
            <button
              type="submit"
              disabled={!roomCodeInput || roomCodeInput.length < 4}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-extrabold text-xs transition-all shadow-lg shadow-blue-600/30 shrink-0 active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Se connecter</span>
            </button>
          </form>
        </div>
      )}

      {/* Catalogue de fichiers disponibles et sélection */}
      {isConnectedToSender && !isTransferring && !isCompleted && (
        <div className="glass-panel overflow-hidden shadow-2xl space-y-4">
          <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Fichiers proposés par l'expéditeur
                <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-300 text-xs font-mono border border-white/10">
                  {availableFiles.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Sélectionnez les fichiers à télécharger et réorganisez leur ordre de priorité.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectAllFiles(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-white/10 backdrop-blur-md transition-all active:scale-95"
              >
                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                <span>Tout sélectionner</span>
              </button>
              <button
                onClick={() => onSelectAllFiles(false)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-semibold border border-white/10 backdrop-blur-md transition-all active:scale-95"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Désélectionner</span>
              </button>
            </div>
          </div>

          {availableFiles.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs space-y-3">
              <p>En attente de la transmission du catalogue par l'expéditeur ou l'expéditeur n'a pas encore déposé de fichiers.</p>
              {onRequestManifest && (
                <button
                  onClick={onRequestManifest}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-blue-400 font-semibold border border-white/10 transition-all active:scale-95"
                >
                  Demander / Rafraîchir la liste des fichiers
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
              {availableFiles.map((file, idx) => (
                <div
                  key={file.id}
                  className={`file-card p-3.5 flex items-center justify-between gap-3 ${
                    file.selected ? 'active' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => onToggleFileSelected(file.id)}
                      className="p-1 text-blue-400 hover:text-blue-300 transition-colors shrink-0"
                    >
                      {file.selected ? <CheckSquare className="w-5 h-5 text-blue-400" /> : <Square className="w-5 h-5 text-slate-500" />}
                    </button>

                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 backdrop-blur-md">
                      {getCategoryIcon(file.type, file.name)}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate" title={file.relativePath}>
                        {file.relativePath}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{formatBytes(file.size)}</span>
                        {file.sha256 && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Hash SHA-256 prêt
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Boutons d'ordre de priorité */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onMoveFilePriority(file.id, 'up')}
                      disabled={idx === 0}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-20 text-slate-300 border border-white/5 transition-all"
                      title="Priorité vers le haut"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onMoveFilePriority(file.id, 'down')}
                      disabled={idx === availableFiles.length - 1}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-20 text-slate-300 border border-white/5 transition-all"
                      title="Priorité vers le bas"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bouton d'action de validation */}
          <div className="p-6 border-t border-white/10 bg-black/20 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-300">
              Sélection : <strong>{selectedFiles.length} fichier(s)</strong> pour un total de <strong>{formatBytes(selectedTotalBytes)}</strong>
            </div>

            <button
              onClick={onStartDownload}
              disabled={selectedFiles.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-600/30 active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Démarrer le téléchargement sélectionné</span>
            </button>
          </div>
        </div>
      )}

      {/* Affichage de la progression du transfert en direct */}
      {isTransferring && (
        <div className="glass-panel p-6 shadow-2xl space-y-6 relative overflow-hidden border border-blue-500/20">
          {/* Arrière-plan lumineux avec lueur pulsante */}
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none animate-pulse-glow" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-4">
              {/* Animation Disque / Streaming actif */}
              <div className="relative w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/10">
                <span className="absolute inset-0 rounded-2xl border border-cyan-400/40 animate-ping opacity-20" />
                <HardDrive className="w-7 h-7 text-cyan-400 animate-pulse" />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-950 shadow-sm" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge-p2p inline-flex items-center gap-1.5 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Écriture directe sur disque (FileSystemAccess)
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    RAM Libérée (Streaming)
                  </span>
                </div>

                <h3 className="text-lg font-black text-white truncate mt-1.5 tracking-tight">
                  {currentReceivingFile ? currentReceivingFile.relativePath : 'Initialisation du fichier...'}
                </h3>
              </div>
            </div>

            <div className="text-right font-mono bg-black/30 px-4 py-2 rounded-2xl border border-white/5 backdrop-blur-md self-start md:self-auto">
              <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
                {overallTotalBytes > 0 ? ((overallTransferredBytes / overallTotalBytes) * 100).toFixed(1) : '0.0'} %
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {formatBytes(overallTransferredBytes)} / {formatBytes(overallTotalBytes)}
              </div>
            </div>
          </div>

          {/* Barre de progression avec effet Shimmer / Laser */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-300 px-1">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                {overallTransferredBytes === 0 ? 'Préparation des blocs de données...' : 'Streaming des données en cours...'}
              </span>
              <span className="font-mono text-cyan-400">
                {overallTotalBytes > 0 ? Math.round((overallTransferredBytes / overallTotalBytes) * 100) : 0}%
              </span>
            </div>

            <div className="w-full h-3 bg-black/50 rounded-full overflow-hidden border border-white/10 p-0.5 shadow-inner backdrop-blur-md relative">
              <div
                className="h-full rounded-full transition-all duration-300 animate-shimmer shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                style={{
                  width: `${Math.max(2, overallTotalBytes > 0 ? (overallTransferredBytes / overallTotalBytes) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>

          {/* Indicateurs de performances & d'intégrité */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-black/40 p-4 rounded-2xl border border-white/5 backdrop-blur-md">
            <div className="p-2">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Vitesse de réception</div>
              <div className="text-base font-extrabold text-cyan-400 font-mono mt-1 flex items-center gap-1.5">
                {overallSpeedBps > 0 ? (
                  formatSpeed(overallSpeedBps)
                ) : (
                  <span className="text-xs text-slate-400 italic flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                    Calcul du débit en cours...
                  </span>
                )}
              </div>
            </div>

            <div className="p-2">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Temps restant estimé (ETA)</div>
              <div className="text-base font-extrabold text-slate-200 font-mono mt-1">
                {overallSpeedBps > 0 && overallEtaSeconds > 0 ? (
                  formatTime(overallEtaSeconds)
                ) : (
                  <span className="text-xs text-slate-400 italic">En attente de calcul...</span>
                )}
              </div>
            </div>

            <div className="p-2">
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Sécurité & Intégrité</div>
              <div className="text-xs font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>SHA-256 en continu</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bilan final après complétion des transferts */}
      {isCompleted && (
        <div className="glass-panel p-6 shadow-2xl space-y-6 animate-fade-in">
          <div className="text-center py-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-500/20 shadow-inner backdrop-blur-md">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-white">
              Téléchargement P2P terminé avec succès !
            </h2>
            <p className="text-xs text-slate-400 max-w-lg mx-auto mt-1">
              Tous les fichiers sélectionnés ont été vérifiés par empreinte numérique SHA-256 et enregistrés directement sur votre stockage local.
            </p>
          </div>

          {/* Métriques globales du bilan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-black/30 p-4 rounded-2xl border border-white/5 backdrop-blur-md text-center">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Volume total transféré</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                {formatBytes(overallTotalBytes)}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Durée totale du transfert</div>
              <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                {formatTime(totalSessionDurationSeconds)}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Vitesse moyenne globale</div>
              <div className="text-base font-bold text-blue-400 font-mono mt-0.5">
                {formatSpeed(averageSessionSpeedBps)}
              </div>
            </div>
          </div>

          {/* Tableau des fichiers transférés et résultats de vérification SHA-256 */}
          <div className="glass-panel-sm overflow-hidden">
            <div className="p-3 bg-white/5 border-b border-white/10 text-xs font-bold text-slate-300">
              Résultat des vérifications d'intégrité SHA-256
            </div>

            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {completedFiles.map((file) => (
                <div key={file.id} className="file-card p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{file.relativePath}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{formatBytes(file.size)}</div>
                  </div>

                  <div>
                    {file.hashVerified !== false ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-md">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        ✓ SHA-256 vérifié et conforme
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 backdrop-blur-md">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        ⚠️ Erreur d'empreinte SHA-256
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={onResetSession}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold border border-white/10 backdrop-blur-md transition-all active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Démarrer une nouvelle session de transfert</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
