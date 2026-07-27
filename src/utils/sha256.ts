/**
 * Calculateur SHA-256 en flux continu (Streaming SHA-256)
 * Permet de calculer le hash SHA-256 de fichiers de plusieurs dizaines de gigaoctets (ex: 50 Go+)
 * sans charger le fichier en mémoire vive.
 */

export class StreamingSHA256 {
  private h: Uint32Array;
  private buffer: Uint8Array;
  private bufferLength: number;
  private bytesHashed: number;
  private k: Uint32Array;

  constructor() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);

    this.k = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
      0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
      0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
      0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
      0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
      0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
      0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
      0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
      0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);

    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0;
  }

  private rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  private transform(chunk: Uint8Array, offset: number) {
    const w = new Uint32Array(64);

    for (let i = 0; i < 16; i++) {
      const idx = offset + i * 4;
      w[i] =
        (chunk[idx] << 24) |
        (chunk[idx + 1] << 16) |
        (chunk[idx + 2] << 8) |
        chunk[idx + 3];
    }

    for (let i = 16; i < 64; i++) {
      const s0 =
        this.rightRotate(w[i - 15], 7) ^
        this.rightRotate(w[i - 15], 18) ^
        (w[i - 15] >>> 3);
      const s1 =
        this.rightRotate(w[i - 2], 17) ^
        this.rightRotate(w[i - 2], 19) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    let f = this.h[5];
    let g = this.h[6];
    let hVal = this.h[7];

    for (let i = 0; i < 64; i++) {
      const S1 =
        this.rightRotate(e, 6) ^
        this.rightRotate(e, 11) ^
        this.rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hVal + S1 + ch + this.k[i] + w[i]) | 0;
      const S0 =
        this.rightRotate(a, 2) ^
        this.rightRotate(a, 13) ^
        this.rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      hVal = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + b) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
    this.h[5] = (this.h[5] + f) | 0;
    this.h[6] = (this.h[6] + g) | 0;
    this.h[7] = (this.h[7] + hVal) | 0;
  }

  public update(data: Uint8Array | ArrayBuffer) {
    const input = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.bytesHashed += input.length;

    let offset = 0;
    while (offset < input.length) {
      if (this.bufferLength === 0 && input.length - offset >= 64) {
        this.transform(input, offset);
        offset += 64;
      } else {
        const toCopy = Math.min(64 - this.bufferLength, input.length - offset);
        this.buffer.set(input.subarray(offset, offset + toCopy), this.bufferLength);
        this.bufferLength += toCopy;
        offset += toCopy;

        if (this.bufferLength === 64) {
          this.transform(this.buffer, 0);
          this.bufferLength = 0;
        }
      }
    }
  }

  public digestHex(): string {
    const totalBits = this.bytesHashed * 8;

    // Ajouter le bit 1 (0x80)
    this.buffer[this.bufferLength++] = 0x80;

    // Si pas assez de place pour la longueur de 64 bits, remplir de 0 et traiter le bloc
    if (this.bufferLength > 56) {
      while (this.bufferLength < 64) {
        this.buffer[this.bufferLength++] = 0;
      }
      this.transform(this.buffer, 0);
      this.bufferLength = 0;
    }

    // Remplir de 0 jusqu'au bit 56
    while (this.bufferLength < 56) {
      this.buffer[this.bufferLength++] = 0;
    }

    // Écrire la longueur totale en bits (big-endian 64-bit)
    const highBits = Math.floor(totalBits / 0x100000000);
    const lowBits = totalBits % 0x100000000;

    this.buffer[56] = (highBits >>> 24) & 0xff;
    this.buffer[57] = (highBits >>> 16) & 0xff;
    this.buffer[58] = (highBits >>> 8) & 0xff;
    this.buffer[59] = highBits & 0xff;

    this.buffer[60] = (lowBits >>> 24) & 0xff;
    this.buffer[61] = (lowBits >>> 16) & 0xff;
    this.buffer[62] = (lowBits >>> 8) & 0xff;
    this.buffer[63] = lowBits & 0xff;

    this.transform(this.buffer, 0);

    // Convertir les registres h en chaîne hexadécimale
    let hex = '';
    for (let i = 0; i < 8; i++) {
      hex += this.h[i].toString(16).padStart(8, '0');
    }
    return hex;
  }
}

/**
 * Helper asynchrone pour calculer l'empreinte SHA-256 d'un objet File par morceaux de 2 Mo
 */
export async function computeFileSHA256(
  file: File,
  onProgress?: (progressPercent: number) => void
): Promise<string> {
  const hasher = new StreamingSHA256();
  const chunkSize = 2 * 1024 * 1024; // Morceaux de 2 Mo pour le calcul
  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize);
    const buffer = await slice.arrayBuffer();
    hasher.update(buffer);
    offset += slice.size;

    if (onProgress && file.size > 0) {
      onProgress(Math.min(100, Math.round((offset / file.size) * 100)));
    }
  }

  return hasher.digestHex();
}
