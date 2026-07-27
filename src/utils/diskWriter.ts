/**
 * Module d'écriture directe sur le disque local (Direct Disk Streaming)
 * Utilise l'API File System Access (showSaveFilePicker) pour écrire directement
 * les morceaux (chunks) de données sur le disque sans passer par la mémoire RAM.
 */

export interface DiskWriterOptions {
  fileName: string;
  fileSize: number;
  mimeType: string;
  onMethodDetermined?: (methodName: 'filesystem_api' | 'blob_stream_fallback') => void;
}

export class DirectDiskWriter {
  private fileHandle: any | null = null;
  private writableStream: any | null = null;
  private isFileSystemAccessAvailable: boolean = false;

  // Fallback en mémoire
  private fallbackChunks: ArrayBuffer[] = [];
  private fallbackBlobUrl: string | null = null;

  constructor(private options: DiskWriterOptions) {
    this.isFileSystemAccessAvailable =
      typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }

  /**
   * Initialise le flux d'écriture avant la réception du premier morceau.
   * Demande la confirmation/destination à l'utilisateur si File System Access API est supporté.
   */
  public async prepare(): Promise<boolean> {
    if (this.isFileSystemAccessAvailable) {
      try {
        const pickerOptions = {
          suggestedName: this.options.fileName,
          types: [
            {
              description: 'Fichier téléchargé',
              accept: {
                [this.options.mimeType || 'application/octet-stream']: [
                  `.${this.options.fileName.split('.').pop() || 'bin'}`,
                ],
              },
            },
          ],
        };

        this.fileHandle = await (window as any).showSaveFilePicker(pickerOptions);
        this.writableStream = await this.fileHandle.createWritable();

        if (this.options.onMethodDetermined) {
          this.options.onMethodDetermined('filesystem_api');
        }
        return true;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // L'utilisateur a annulé la sélection du fichier
          throw new Error('L\'utilisateur a annulé le choix de l\'emplacement du fichier.');
        }
        console.warn('File System Access API échoué, bascule sur le mode repli:', err);
      }
    }

    // Mode de repli (Blob stream)
    this.writableStream = null;
    this.fallbackChunks = [];
    if (this.options.onMethodDetermined) {
      this.options.onMethodDetermined('blob_stream_fallback');
    }
    return true;
  }

  /**
   * Écrit un morceau binaire (ArrayBuffer/Uint8Array) directement dans le flux du disque.
   */
  public async writeChunk(chunk: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.writableStream) {
      await this.writableStream.write(chunk);
    } else {
      const buffer = chunk instanceof ArrayBuffer ? chunk : chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
      this.fallbackChunks.push(buffer as ArrayBuffer);
    }
  }

  /**
   * Finalise l'écriture et ferme le flux de données.
   * Déclenche le téléchargement automatique dans le cas du mode de repli.
   */
  public async finalize(): Promise<{ downloadUrl?: string; isFallback: boolean }> {
    if (this.writableStream) {
      await this.writableStream.close();
      this.writableStream = null;
      return { isFallback: false };
    }

    // Traitement du mode de repli (Création du Blob)
    const blob = new Blob(this.fallbackChunks, {
      type: this.options.mimeType || 'application/octet-stream',
    });
    this.fallbackBlobUrl = URL.createObjectURL(blob);

    // Déclenchement du téléchargement automatique
    const a = document.createElement('a');
    a.href = this.fallbackBlobUrl;
    a.download = this.options.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    this.fallbackChunks = [];
    return { downloadUrl: this.fallbackBlobUrl, isFallback: true };
  }

  /**
   * Nettoie les ressources si la réception est annulée ou échoue.
   */
  public async abort(): Promise<void> {
    if (this.writableStream) {
      try {
        await this.writableStream.abort();
      } catch (e) {
        // Ignorer les erreurs d'annulation
      }
      this.writableStream = null;
    }
    this.fallbackChunks = [];
    if (this.fallbackBlobUrl) {
      URL.revokeObjectURL(this.fallbackBlobUrl);
      this.fallbackBlobUrl = null;
    }
  }
}
