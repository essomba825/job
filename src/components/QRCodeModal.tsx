import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  shareUrl: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  shareUrl,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (shareUrl && isOpen) {
      QRCode.toDataURL(shareUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Erreur génération QR code:', err));
    }
  }, [shareUrl, isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-fade-in">
      <div className="glass-panel max-w-md w-full p-6 shadow-2xl relative border border-white/10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto mb-3 border border-blue-500/20 backdrop-blur-md">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Scannez pour rejoindre la salle</h3>
          <p className="text-xs text-slate-400 mt-1">
            Scannez ce QR code avec un smartphone ou une tablette pour démarrer le transfert P2P.
          </p>
        </div>

        {qrDataUrl && (
          <div className="bg-white p-4 rounded-2xl mx-auto shadow-2xl border border-white/20 mb-6 flex justify-center w-fit">
            <img src={qrDataUrl} alt="QR Code de partage P2P" className="w-60 h-60 rounded-lg" />
          </div>
        )}

        <div className="glass-panel-sm p-3.5 flex items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Code de salle</div>
            <div className="font-mono font-black text-blue-400 text-xl tracking-widest">{roomCode}</div>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md active:scale-95"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Lien copié !' : 'Copier le lien'}</span>
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center leading-normal">
          🔒 Ce canal est chiffré de bout en bout via WebRTC. Vos données sont transmises directement entre vos deux appareils.
        </p>
      </div>
    </div>
  );
};
