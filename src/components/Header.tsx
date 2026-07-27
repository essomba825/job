import React from 'react';
import { ShieldCheck, Zap, HardDrive, Wifi, WifiOff, Send, Download } from 'lucide-react';
import { ConnectionStatus, UserRole } from '../types';

interface HeaderProps {
  role: UserRole;
  onSelectRole: (role: UserRole) => void;
  connectionStatus: ConnectionStatus;
  roomCode: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  role,
  onSelectRole,
  connectionStatus,
  roomCode,
}) => {
  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="badge-p2p inline-flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
            P2P Direct Connecté
          </span>
        );
      case 'connecting':
      case 'waiting_peer':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 backdrop-blur-md">
            <Wifi className="w-3.5 h-3.5 animate-spin text-amber-400" />
            En attente du pair...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400 border border-white/10 backdrop-blur-md">
            <WifiOff className="w-3.5 h-3.5" />
            Hors connexion
          </span>
        );
    }
  };

  return (
    <header className="border-b border-white/10 bg-slate-950/40 backdrop-blur-xl sticky top-0 z-40 shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        {/* Titre et Logo */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/20">
            <div className="w-full h-full bg-slate-950/90 backdrop-blur-md rounded-[14px] flex items-center justify-center">
              <Zap className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              AirStream<span className="text-blue-500">P2P</span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 font-mono border border-blue-500/20 backdrop-blur-sm">v2.4</span>
            </h1>
            <p className="text-xs text-slate-400">Transfert direct ultra-rapide sans serveur cloud</p>
          </div>
        </div>

        {/* Badges de sécurité et fonctionnalités */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] text-slate-300 text-xs border border-white/10 backdrop-blur-md" title="Chiffrement DTLS natif WebRTC de bout en bout">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Sécurité</div>
              <div className="font-semibold text-emerald-400 text-xs">Chiffré AES-256 (DTLS)</div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] text-slate-300 text-xs border border-white/10 backdrop-blur-md" title="Transfert direct navigateur à navigateur">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Stockage</div>
              <div className="font-semibold text-blue-300 text-xs">Écriture directe disque</div>
            </div>
          </div>
        </div>

        {/* Statut et Sélecteur de rôle */}
        <div className="flex items-center gap-3">
          {getStatusBadge()}

          <div className="p-1 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md flex items-center gap-1 shadow-inner">
            <button
              onClick={() => onSelectRole('sender')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                role === 'sender'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Expéditeur</span>
            </button>
            <button
              onClick={() => onSelectRole('receiver')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                role === 'receiver'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Destinataire</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
