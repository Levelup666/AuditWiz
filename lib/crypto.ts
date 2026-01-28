// Cryptographic utilities for content hashing and signature verification
// Uses Web Crypto API (built-in to Node.js 18+ and browsers)
// No external crypto package needed - uses native Web Crypto API

/**
 * Get the crypto object (Web Crypto API)
 * Available globally in Node.js 18+ and browsers
 */
function getCrypto(): Crypto {
  // In Node.js 18+, Web Crypto API is available globally
  // In browsers, it's also available globally
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto as Crypto;
  }
  // Fallback for older Node.js (shouldn't happen with Next.js 16+)
  throw new Error('Web Crypto API is not available');
}

/**
 * Generate SHA-256 hash of content
 * Used for content integrity verification and state hashing
 */
export async function generateHash(content: string | object): Promise<string> {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const crypto = getCrypto();
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate signature hash for electronic signatures
 * Combines record content, signer ID, intent, and timestamp
 */
export async function generateSignatureHash(
  recordId: string,
  recordVersion: number,
  signerId: string,
  intent: string,
  timestamp: string
): Promise<string> {
  const signatureData = {
    record_id: recordId,
    record_version: recordVersion,
    signer_id: signerId,
    intent,
    timestamp,
  };
  return generateHash(signatureData);
}

/**
 * Verify signature hash
 */
export async function verifySignature(
  signatureHash: string,
  recordId: string,
  recordVersion: number,
  signerId: string,
  intent: string,
  timestamp: string
): Promise<boolean> {
  const expectedHash = await generateSignatureHash(
    recordId,
    recordVersion,
    signerId,
    intent,
    timestamp
  );
  return signatureHash === expectedHash;
}
