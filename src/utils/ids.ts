const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomId() {
  const cryptoObj = globalThis.crypto as Crypto & { randomBytes?: (size: number) => Uint8Array };
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint8Array(16);
    cryptoObj.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  if (typeof cryptoObj?.randomBytes === 'function') {
    const buf = cryptoObj.randomBytes(16);
    return Array.from(buf as unknown as Uint8Array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function pickChar() {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return CODE_CHARS[buf[0] % CODE_CHARS.length];
  }
  return CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
}

export function makeRoomCode(length = 6, existing?: Set<string> | string[]) {
  const existingSet = existing ? (existing instanceof Set ? existing : new Set(existing)) : new Set<string>();
  let attempt = '';
  do {
    attempt = '';
    for (let i = 0; i < length; i++) {
      attempt += pickChar();
    }
  } while (existingSet.has(attempt));
  existingSet.add(attempt);
  return attempt;
}
