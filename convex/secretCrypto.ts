// AES-GCM encryption for secrets stored in the database (session refresh
// material, source credentials) and a SHA-256 helper.
//
// The key derivation seed is fixed: it must stay byte-identical so values
// encrypted before this module existed still decrypt.

const utf8Encoder = new TextEncoder();
let encryptionKeyPromise: Promise<CryptoKey> | null = null;

function readRequiredEnv(name: string): string {
  const value = String((globalThis as any)?.process?.env?.[name] ?? "").trim();
  if (!value) throw new Error(`${name}_required`);
  return value;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const value of bytes) {
    out += value.toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = String(hex ?? "").trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0 || /[^0-9a-f]/.test(normalized)) {
    throw new Error("invalid_hex");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

async function loadEncryptionKey(): Promise<CryptoKey> {
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = (async () => {
      const dbKey = readRequiredEnv("ARX_DB_KEY");
      const seed = utf8Encoder.encode(`arx:user-provider-connections:v1:${dbKey}`);
      const digest = await crypto.subtle.digest("SHA-256", seed);
      return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })();
  }
  return await encryptionKeyPromise;
}

export async function sha256HexText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function encryptSecret(secret: string): Promise<{
  encryptedSecretHex: string;
  secretIvHex: string;
  secretVersion: number;
}> {
  const key = await loadEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    utf8Encoder.encode(secret),
  );
  return {
    encryptedSecretHex: bytesToHex(new Uint8Array(encrypted)),
    secretIvHex: bytesToHex(iv),
    secretVersion: 1,
  };
}

export async function decryptStoredSecret(row: {
  encryptedSecretHex: string;
  secretIvHex: string;
}): Promise<string> {
  const key = await loadEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(hexToBytes(row.secretIvHex)),
    },
    key,
    toArrayBuffer(hexToBytes(row.encryptedSecretHex)),
  );
  return new TextDecoder().decode(plaintext).trim();
}
