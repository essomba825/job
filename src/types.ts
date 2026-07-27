/**
 * Structure de données et types pour l'application de transfert P2P
 */

export type UserRole = 'sender' | 'receiver' | null;

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'waiting_peer'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type FileTransferStatus =
  | 'pending'
  | 'calculating_hash'
  | 'ready'
  | 'selected'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'hash_mismatch';

export interface FileItem {
  id: string;
  name: string;
  relativePath: string; // ex: "documents/projets/rapport.pdf"
  size: number;
  type: string;
  sha256?: string;
  fileObj?: File; // Présent côté expéditeur uniquement
  status: FileTransferStatus;
  selected: boolean; // Pour la sélection côté destinataire
  priority: number; // Ordre de priorité de téléchargement
  transferredBytes: number;
  speedBps: number;
  etaSeconds: number;
  receivedHash?: string;
  hashVerified?: boolean;
  errorMessage?: string;
}

export interface SessionStats {
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentSpeedBps: number;
  averageSpeedBps: number;
  startTime?: number;
  endTime?: number;
}

// Protocole des messages envoyés sur le WebRTC DataChannel
export type DataChannelMessageType =
  | 'MANIFEST'
  | 'REQUEST_MANIFEST'
  | 'SELECTION_REQUEST'
  | 'START_FILE'
  | 'END_FILE'
  | 'FILE_VERIFIED'
  | 'PAUSE'
  | 'RESUME'
  | 'CANCEL'
  | 'RETRY_FILE'
  | 'HEARTBEAT';

export interface DataChannelMessage {
  type: DataChannelMessageType;
  payload?: any;
}

export interface ManifestFilePayload {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  type: string;
  sha256?: string;
}

export interface StartFilePayload {
  fileId: string;
  name: string;
  size: number;
  sha256: string;
  chunkSize: number;
  totalChunks: number;
}

export interface EndFilePayload {
  fileId: string;
  sha256: string;
}

export interface FileVerifiedPayload {
  fileId: string;
  success: boolean;
  computedHash?: string;
}
