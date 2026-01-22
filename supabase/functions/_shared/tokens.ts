const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateToken(bytes = 16): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    out += ALPHABET[raw[i] % ALPHABET.length];
  }
  return out;
}

export function tokenPrefix(token: string, len = 6): string {
  return token.slice(0, len);
}

