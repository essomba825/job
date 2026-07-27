import { io, Socket } from 'socket.io-client';
import {
  DataChannelMessage,
  EndFilePayload,
  FileItem,
  FileVerifiedPayload,
  ManifestFilePayload,
  StartFilePayload,
  UserRole,
} from '../types';
import { DirectDiskWriter } from '../utils/diskWriter';
import { computeFileSHA256, StreamingSHA256 } from '../utils/sha256';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

const CHUNK_SIZE = 64 * 1024; // 64 Ko
const BUFFER_THRESHOLD = 512 * 1024; // 512 Ko

export interface WebRTCEventHandlers {
  onConnectionStateChange?: (state: string) => void;
  onPeerConnected?: () => void;
  onPeerDisconnected?: () => void;
  onManifestReceived?: (files: ManifestFilePayload[]) => void;
  onSelectionReceived?: (selectedFileIds: string[], priorityOrder: string[]) => void;
  onFileStart?: (fileId: string, size: number, totalChunks: number, sha256: string) => void;
  onFileProgress?: (fileId: string, transferredBytes: number, totalBytes: number, speedBps: number, etaSeconds: number) => void;
  onFileCompleted?: (fileId: string, sha256Verified: boolean) => void;
  onSessionError?: (error: string) => void;
  onPauseChange?: (isPaused: boolean) => void;
}

export class P2PTransferEngine {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  public role: UserRole = null;
  public roomCode: string | null = null;
  public isConnected: boolean = false;
  public isPaused: boolean = false;
  private isCancelled: boolean = false;

  private handlers: WebRTCEventHandlers = {};

  // Traitement côté expéditeur
  private filesToSend: Map<string, { fileObj: File; item: FileItem }> = new Map();
  private lastManifestPayload: ManifestFilePayload[] | null = null;
  private isTransferring: boolean = false;

  // Traitement côté destinataire
  private activeDiskWriter: DirectDiskWriter | null = null;
  private activeHasher: StreamingSHA256 | null = null;
  private currentReceivingFileId: string | null = null;
  private currentReceivingFileSize: number = 0;
  private currentReceivingSha256: string = '';
  private receivedBytesForCurrentFile: number = 0;

  // Mesures de vitesse et ETA
  private speedWindowStartTime: number = 0;
  private speedWindowBytes: number = 0;
  private currentSpeedBps: number = 0;

  constructor(handlers: WebRTCEventHandlers) {
    this.handlers = handlers;
  }

  /**
   * Connexion au serveur de signalement Socket.IO
   */
  public connectSignalingServer(serverUrl?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = serverUrl || window.location.origin;
      this.socket = io(url, {
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        // En cas de reconnexion automatique du socket WebRTC, réintégrer la salle sans perte d'état
        if (this.roomCode && this.role) {
          this.socket?.emit('join-room', { roomCode: this.roomCode, role: this.role }, (res: any) => {
            if (res && res.success) {
              if (this.role === 'sender' && this.lastManifestPayload) {
                this.sendControlMessage('MANIFEST', this.lastManifestPayload);
              } else if (this.role === 'receiver') {
                this.requestManifest();
              }
            }
          });
        }
        resolve();
      });

      this.socket.on('connect_error', (err) => {
        if (this.handlers.onSessionError) {
          this.handlers.onSessionError(`Erreur de connexion au serveur de signalement : ${err.message}`);
        }
        reject(err);
      });

      this.setupSignalingListeners();
    });
  }

  /**
   * Écouteurs d'événements de signalement
   */
  private setupSignalingListeners() {
    if (!this.socket) return;

    this.socket.on('peer-joined', async ({ peerId }) => {
      if (this.handlers.onPeerConnected) {
        this.handlers.onPeerConnected();
      }
      if (this.role === 'sender') {
        await this.createOffer(peerId);
      }
    });

    this.socket.on('offer', async ({ sender, offer }) => {
      await this.handleOffer(sender, offer);
    });

    this.socket.on('answer', async ({ answer }) => {
      await this.handleAnswer(answer);
    });

    this.socket.on('ice-candidate', async ({ candidate }) => {
      await this.handleIceCandidate(candidate);
    });

    this.socket.on('ice-restart', async ({ sender }) => {
      if (this.role === 'sender') {
        await this.createOffer(sender, { iceRestart: true });
      }
    });

    this.socket.on('peer-disconnected', () => {
      this.isConnected = false;
      if (this.handlers.onPeerDisconnected) {
        this.handlers.onPeerDisconnected();
      }
    });
  }

  /**
   * Créer une salle (Mode Expéditeur)
   */
  public async createRoom(): Promise<string> {
    this.role = 'sender';
    if (!this.socket) await this.connectSignalingServer();

    return new Promise((resolve, reject) => {
      this.socket!.emit('create-room', (response: { success: boolean; roomCode: string; error?: string }) => {
        if (response && response.success) {
          this.roomCode = response.roomCode;
          this.setupPeerConnection();
          resolve(response.roomCode);
        } else {
          reject(new Error(response?.error || 'Échec de création de la salle'));
        }
      });
    });
  }

  /**
   * Rejoindre une salle (Mode Destinataire)
   */
  public async joinRoom(code: string): Promise<string> {
    this.role = 'receiver';
    if (!this.socket) await this.connectSignalingServer();

    const formattedCode = code.toUpperCase().trim();
    return new Promise((resolve, reject) => {
      this.socket!.emit('join-room', { roomCode: formattedCode }, (response: { success: boolean; roomCode: string; error?: string }) => {
        if (response && response.success) {
          this.roomCode = response.roomCode;
          this.setupPeerConnection();
          resolve(response.roomCode);
        } else {
          reject(new Error(response?.error || 'Code de salle invalide ou inexistant.'));
        }
      });
    });
  }

  /**
   * Initialise l'objet RTCPeerConnection
   */
  private setupPeerConnection() {
    this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.roomCode) {
        this.socket.emit('ice-candidate', { candidate: event.candidate });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState || 'unknown';
      if (this.handlers.onConnectionStateChange) {
        this.handlers.onConnectionStateChange(state);
      }
      if (state === 'connected') {
        this.isConnected = true;
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.isConnected = false;
      }
    };

    if (this.role === 'sender') {
      // L'expéditeur crée le DataChannel
      this.dataChannel = this.peerConnection.createDataChannel('p2p-file-transfer', {
        ordered: true,
      });
      this.setupDataChannelListeners(this.dataChannel);
    } else {
      // Le destinataire écoute l'arrivée du DataChannel
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannelListeners(this.dataChannel);
      };
    }
  }

  /**
   * Configure les écouteurs du canal de données WebRTC (DataChannel)
   */
  private setupDataChannelListeners(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;

    channel.onopen = () => {
      this.isConnected = true;
      if (this.role === 'sender' && this.lastManifestPayload) {
        this.sendControlMessage('MANIFEST', this.lastManifestPayload);
      } else if (this.role === 'receiver') {
        this.sendControlMessage('REQUEST_MANIFEST');
      }
      if (this.handlers.onPeerConnected) {
        this.handlers.onPeerConnected();
      }
    };

    channel.onclose = () => {
      this.isConnected = false;
      if (this.handlers.onPeerDisconnected) {
        this.handlers.onPeerDisconnected();
      }
    };

    channel.onerror = (err) => {
      console.error('Erreur du canal de données WebRTC:', err);
      if (this.handlers.onSessionError) {
        this.handlers.onSessionError('Erreur de communication sur le canal WebRTC.');
      }
    };

    channel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        // Message de contrôle JSON
        try {
          const msg: DataChannelMessage = JSON.parse(event.data);
          await this.handleControlMessage(msg);
        } catch (e) {
          console.error('Erreur d\'analyse du message de contrôle:', e);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Morceau de fichier binaire
        await this.handleBinaryChunk(event.data);
      }
    };
  }

  /**
   * Traite les messages de contrôle JSON
   */
  private async handleControlMessage(msg: DataChannelMessage) {
    switch (msg.type) {
      case 'MANIFEST':
        if (this.handlers.onManifestReceived) {
          this.handlers.onManifestReceived(msg.payload as ManifestFilePayload[]);
        }
        break;

      case 'REQUEST_MANIFEST':
        if (this.role === 'sender' && this.lastManifestPayload) {
          this.sendControlMessage('MANIFEST', this.lastManifestPayload);
        }
        break;

      case 'SELECTION_REQUEST':
        const { selectedFileIds, priorityOrder } = msg.payload;
        if (this.handlers.onSelectionReceived) {
          this.handlers.onSelectionReceived(selectedFileIds, priorityOrder);
        }
        break;

      case 'START_FILE':
        const startPayload: StartFilePayload = msg.payload;
        this.currentReceivingFileId = startPayload.fileId;
        this.currentReceivingFileSize = startPayload.size;
        this.currentReceivingSha256 = startPayload.sha256;
        this.receivedBytesForCurrentFile = 0;
        this.speedWindowStartTime = Date.now();
        this.speedWindowBytes = 0;
        this.activeHasher = new StreamingSHA256();

        // Initialiser le disk writer
        this.activeDiskWriter = new DirectDiskWriter({
          fileName: startPayload.name,
          fileSize: startPayload.size,
          mimeType: 'application/octet-stream',
        });

        try {
          await this.activeDiskWriter.prepare();
        } catch (err: any) {
          console.error('Erreur préparation disque:', err);
          this.sendControlMessage('CANCEL', { error: err.message });
          return;
        }

        if (this.handlers.onFileStart) {
          this.handlers.onFileStart(startPayload.fileId, startPayload.size, startPayload.totalChunks, startPayload.sha256);
        }
        break;

      case 'END_FILE':
        const endPayload: EndFilePayload = msg.payload;
        await this.finalizeReceivedFile(endPayload.sha256);
        break;

      case 'FILE_VERIFIED':
        const verPayload: FileVerifiedPayload = msg.payload;
        if (this.handlers.onFileCompleted) {
          this.handlers.onFileCompleted(verPayload.fileId, verPayload.success);
        }
        break;

      case 'PAUSE':
        this.isPaused = true;
        if (this.handlers.onPauseChange) this.handlers.onPauseChange(true);
        break;

      case 'RESUME':
        this.isPaused = false;
        if (this.handlers.onPauseChange) this.handlers.onPauseChange(false);
        break;

      case 'CANCEL':
        this.isCancelled = true;
        this.isTransferring = false;
        if (this.activeDiskWriter) {
          await this.activeDiskWriter.abort();
          this.activeDiskWriter = null;
        }
        if (this.handlers.onSessionError) {
          this.handlers.onSessionError(msg.payload?.error || 'Le transfert a été annulé par le pair.');
        }
        break;
    }
  }

  /**
   * Traite la réception d'un morceau binaire côté Destinataire
   */
  private async handleBinaryChunk(buffer: ArrayBuffer) {
    if (buffer.byteLength < 12 || !this.activeDiskWriter) return;

    // Entête de 12 octets: [4 octets fileIndex] [4 octets chunkIndex] [4 octets payloadSize]
    const view = new DataView(buffer);
    const payloadSize = view.getUint32(8);

    const chunkData = new Uint8Array(buffer, 12, payloadSize);

    // Mettre à jour le hash SHA-256 en continu
    if (this.activeHasher) {
      this.activeHasher.update(chunkData);
    }

    // Écriture directe sur le disque
    await this.activeDiskWriter.writeChunk(chunkData);

    this.receivedBytesForCurrentFile += payloadSize;
    this.speedWindowBytes += payloadSize;

    // Calcul de vitesse et ETA
    const now = Date.now();
    const elapsed = (now - this.speedWindowStartTime) / 1000;
    if (elapsed >= 0.5) {
      this.currentSpeedBps = this.speedWindowBytes / elapsed;
      this.speedWindowStartTime = now;
      this.speedWindowBytes = 0;
    }

    const remainingBytes = this.currentReceivingFileSize - this.receivedBytesForCurrentFile;
    const eta = this.currentSpeedBps > 0 ? remainingBytes / this.currentSpeedBps : 0;

    if (this.handlers.onFileProgress && this.currentReceivingFileId) {
      this.handlers.onFileProgress(
        this.currentReceivingFileId,
        this.receivedBytesForCurrentFile,
        this.currentReceivingFileSize,
        this.currentSpeedBps,
        eta
      );
    }
  }

  /**
   * Finalise la réception du fichier et vérifie le hash SHA-256
   */
  private async finalizeReceivedFile(expectedSha256: string) {
    let computedHash = '';
    if (this.activeHasher) {
      computedHash = this.activeHasher.digestHex();
      this.activeHasher = null;
    }

    if (this.activeDiskWriter) {
      await this.activeDiskWriter.finalize();
      this.activeDiskWriter = null;
    }

    const success = computedHash.toLowerCase() === expectedSha256.toLowerCase();

    // Notifier l'expéditeur de la vérification
    this.sendControlMessage('FILE_VERIFIED', {
      fileId: this.currentReceivingFileId,
      success,
      computedHash,
    });

    if (this.handlers.onFileCompleted && this.currentReceivingFileId) {
      this.handlers.onFileCompleted(this.currentReceivingFileId, success);
    }

    this.currentReceivingFileId = null;
  }

  /**
   * Envoi du catalogue de fichiers (Manifeste) aux destinataires (Côté Expéditeur)
   */
  public sendManifest(files: { fileObj: File; item: FileItem }[]) {
    this.filesToSend.clear();
    const manifestPayload: ManifestFilePayload[] = [];

    for (const entry of files) {
      this.filesToSend.set(entry.item.id, entry);
      manifestPayload.push({
        id: entry.item.id,
        name: entry.item.name,
        relativePath: entry.item.relativePath,
        size: entry.item.size,
        type: entry.item.type,
        sha256: entry.item.sha256,
      });
    }

    this.lastManifestPayload = manifestPayload;

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.sendControlMessage('MANIFEST', manifestPayload);
    }
  }

  public requestManifest() {
    if (this.role === 'receiver') {
      this.sendControlMessage('REQUEST_MANIFEST');
    }
  }

  /**
   * Envoi des choix de téléchargement et priorité (Côté Destinataire)
   */
  public sendSelectionRequest(selectedFileIds: string[], priorityOrder: string[]) {
    this.sendControlMessage('SELECTION_REQUEST', {
      selectedFileIds,
      priorityOrder,
    });
  }

  /**
   * Lancement du processus d'émission des fichiers en séquence (Côté Expéditeur)
   */
  public async startSendingSequence(
    fileIdsInOrder: string[],
    onProgressUpdate?: (fileId: string, progressPercent: number, speedBps: number, etaSeconds: number) => void
  ) {
    if (this.isTransferring) return;
    this.isTransferring = true;
    this.isCancelled = false;

    for (const fileId of fileIdsInOrder) {
      if (this.isCancelled) break;

      const entry = this.filesToSend.get(fileId);
      if (!entry) continue;

      const { fileObj, item } = entry;

      // Calculer le hash SHA-256 si absent
      let sha256 = item.sha256;
      if (!sha256) {
        sha256 = await computeFileSHA256(fileObj);
        item.sha256 = sha256;
      }

      const totalChunks = Math.ceil(fileObj.size / CHUNK_SIZE);

      // Notifier le début d'envoi du fichier
      this.sendControlMessage('START_FILE', {
        fileId: item.id,
        name: item.name,
        size: fileObj.size,
        sha256,
        chunkSize: CHUNK_SIZE,
        totalChunks,
      } as StartFilePayload);

      // Émission par morceaux avec gestion du backpressure WebRTC
      let offset = 0;
      let chunkIndex = 0;
      let windowStartTime = Date.now();
      let windowBytes = 0;
      let currentSpeed = 0;

      while (offset < fileObj.size && !this.isCancelled) {
        // Attendre en cas de pause
        while (this.isPaused && !this.isCancelled) {
          await new Promise((r) => setTimeout(r, 200));
        }

        // Contrôle de flux du buffer WebRTC (Backpressure)
        if (
          this.dataChannel &&
          this.dataChannel.bufferedAmount > this.dataChannel.bufferedAmountLowThreshold
        ) {
          await this.waitForBufferLow();
        }

        const slice = fileObj.slice(offset, offset + CHUNK_SIZE);
        const chunkBuffer = await slice.arrayBuffer();

        // Création du paquet binaire avec entête 12 octets
        const packet = new ArrayBuffer(12 + chunkBuffer.byteLength);
        const view = new DataView(packet);
        const fileIdxInt = parseInt(fileId.replace(/\D/g, '').slice(-4) || '0', 10);
        view.setUint32(0, fileIdxInt);
        view.setUint32(4, chunkIndex);
        view.setUint32(8, chunkBuffer.byteLength);

        const uint8Packet = new Uint8Array(packet);
        uint8Packet.set(new Uint8Array(chunkBuffer), 12);

        this.dataChannel?.send(packet);

        offset += chunkBuffer.byteLength;
        chunkIndex++;
        windowBytes += chunkBuffer.byteLength;

        // Calcul vitesse
        const now = Date.now();
        const elapsed = (now - windowStartTime) / 1000;
        if (elapsed >= 0.5) {
          currentSpeed = windowBytes / elapsed;
          windowStartTime = now;
          windowBytes = 0;
        }

        const remainingBytes = fileObj.size - offset;
        const eta = currentSpeed > 0 ? remainingBytes / currentSpeed : 0;

        if (onProgressUpdate) {
          const percent = Math.min(100, Math.round((offset / fileObj.size) * 100));
          onProgressUpdate(fileId, percent, currentSpeed, eta);
        }

        if (this.handlers.onFileProgress) {
          this.handlers.onFileProgress(fileId, offset, fileObj.size, currentSpeed, eta);
        }
      }

      if (!this.isCancelled) {
        this.sendControlMessage('END_FILE', { fileId: item.id, sha256 });
        // Attendre confirmation de vérification du destinataire
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    this.isTransferring = false;
  }

  /**
   * Pause / Reprise
   */
  public togglePause(): boolean {
    this.isPaused = !this.isPaused;
    this.sendControlMessage(this.isPaused ? 'PAUSE' : 'RESUME');
    if (this.handlers.onPauseChange) this.handlers.onPauseChange(this.isPaused);
    return this.isPaused;
  }

  /**
   * Annulation de session
   */
  public cancelTransfer() {
    this.isCancelled = true;
    this.isTransferring = false;
    this.sendControlMessage('CANCEL');
  }

  /**
   * Envoie un message de contrôle JSON sur le canal WebRTC
   */
  private sendControlMessage(type: DataChannelMessage['type'], payload?: any) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const msg: DataChannelMessage = { type, payload };
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  /**
   * Attend la libération du tampon de données WebRTC
   */
  private waitForBufferLow(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.dataChannel) return resolve();

      const onLow = () => {
        if (this.dataChannel) {
          this.dataChannel.onbufferedamountlow = null;
        }
        resolve();
      };

      this.dataChannel.onbufferedamountlow = onLow;
      setTimeout(resolve, 100);
    });
  }

  // --- Gestion SDP WebRTC ---

  private async createOffer(targetPeerId: string, options?: RTCOfferOptions) {
    if (!this.peerConnection) return;
    const offer = await this.peerConnection.createOffer(options);
    await this.peerConnection.setLocalDescription(offer);
    this.socket?.emit('offer', { target: targetPeerId, offer });
  }

  private async handleOffer(senderPeerId: string, offer: RTCSessionDescriptionInit) {
    if (!this.peerConnection) this.setupPeerConnection();
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    this.socket?.emit('answer', { target: senderPeerId, answer });
  }

  private async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (this.peerConnection && this.peerConnection.signalingState !== 'stable') {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  /**
   * Déconnexion complète
   */
  public disconnect() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
  }
}
