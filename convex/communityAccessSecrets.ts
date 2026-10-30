// The access webhook signing secret is the one integration secret Polynet must
// read back (it signs every delivery), so it is encrypted at rest with a key
// derived from ARX_DB_KEY, the same way provider connections keep theirs.
// API keys and license keys are only ever hashed.

const utf8 = new TextEncoder();
let keyPromise: Promise<CryptoKey> | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const value = String(hex ?? "").trim().toLowerCase();
  if (!value || value.length % 2 !== 0 || /[^0-9a-f]/.test(value)) throw new Error("invalid_hex");
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) bytes[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  return bytes;
}

async function loadKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const dbKey = String(process.env.ARX_DB_KEY ?? "").trim();
      if (!dbKey) throw new Error("access_secret_key_unconfigured");
      const digest = await crypto.subtle.digest("SHA-256", utf8.encode(`arx:community-access-integrations:v1:${dbKey}`));
      return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    })().catch((error) => {
      keyPromise = null;
      throw error;
    });
  }
  return await keyPromise;
}

export async function encryptCommunityAccessSecret(secret: string): Promise<{ encryptedHex: string; ivHex: string }> {
  const key = await loadKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8.encode(secret));
  return { encryptedHex: bytesToHex(new Uint8Array(encrypted)), ivHex: bytesToHex(iv) };
}

export async function decryptCommunityAccessSecret(row: { encryptedHex: string; ivHex: string }): Promise<string> {
  const key = await loadKey();
  const iv = hexToBytes(row.ivHex);
  const data = hexToBytes(row.encryptedHex);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    key,
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}
