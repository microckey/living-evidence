// integrity.js — deterministic content addressing for Living Evidence.
//
// This module intentionally has no DOM or network dependency. It provides:
//   - canonical JSON (object keys sorted recursively), and
//   - synchronous SHA-256 for content ids and hash-chained audit entries.
//
// Web Crypto is still used by living-evidence.js for signatures. Keeping the
// digest synchronous lets every existing analysis remain a synchronous tool and
// ensures a ledger entry is sealed before the tool returns.

function canonicalize(value, stack) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON cannot encode a non-finite number');
    return value;
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
    throw new TypeError(`canonical JSON cannot encode ${typeof value}`);
  }
  if (stack.has(value)) throw new TypeError('canonical JSON cannot encode a cycle');
  stack.add(value);
  let out;
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonical JSON cannot encode symbol keys');
    for (let index = 0; index < value.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new TypeError('canonical JSON cannot encode a sparse array');
    }
    const ownNames = Object.getOwnPropertyNames(value);
    const expectedNames = Array.from({ length: value.length }, (_, index) => String(index)).concat('length');
    if (ownNames.length !== expectedNames.length || ownNames.some((name, index) => name !== expectedNames[index])) {
      throw new TypeError('canonical JSON cannot encode non-JSON array properties');
    }
    out = [];
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor)) throw new TypeError('canonical JSON cannot encode accessors');
      if (descriptor.value === undefined) throw new TypeError('canonical JSON cannot encode undefined');
      out.push(canonicalize(descriptor.value, stack));
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('canonical JSON can encode only plain objects');
    }
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonical JSON cannot encode symbol keys');
    if (Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
      throw new TypeError('canonical JSON cannot encode non-enumerable properties');
    }
    // Preserve hostile-but-valid JSON keys such as "__proto__" as data. Assigning
    // that key to a normal object mutates its prototype and creates hash collisions.
    out = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new TypeError('canonical JSON cannot encode accessors');
      if (descriptor.value === undefined) throw new TypeError('canonical JSON cannot encode undefined');
      out[key] = canonicalize(descriptor.value, stack);
    }
  }
  stack.delete(value);
  return out;
}

/** Deterministic JSON for hashes, signatures, diffs and portable receipts. */
export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value, new Set()));
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/** SHA-256 over UTF-8 text, returned as 64 lowercase hexadecimal characters. */
export function sha256Hex(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : null;
  if (!bytes) throw new TypeError('sha256Hex input must be a string, ArrayBuffer, or typed-array view');
  const bitLength = BigInt(bytes.length) * 8n;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Number((bitLength >> 32n) & 0xffffffffn), false);
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0')).join('');
}

export function sha256Object(value) {
  return `sha256:${sha256Hex(canonicalStringify(value))}`;
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Strict unpadded Base64url. Invalid alphabets, impossible lengths and non-zero
 * trailing padding bits are rejected instead of being normalised silently. */
export function decodeBase64url(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new TypeError('value is not canonical unpadded base64url');
  }
  const out = [];
  let accumulator = 0;
  let bits = 0;
  for (const character of value) {
    const digit = BASE64URL_ALPHABET.indexOf(character);
    if (digit < 0) throw new TypeError('value is not canonical unpadded base64url');
    accumulator = accumulator * 64 + digit;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      out.push(Math.floor(accumulator / (2 ** bits)) & 0xff);
      accumulator %= 2 ** bits;
    }
  }
  if (bits && accumulator !== 0) throw new TypeError('base64url has non-zero padding bits');
  return Uint8Array.from(out);
}

export function encodeBase64url(input) {
  const bytes = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : null;
  if (!bytes) throw new TypeError('encodeBase64url input must be an ArrayBuffer or typed-array view');
  let output = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const remaining = bytes.length - offset;
    const block = (bytes[offset] << 16)
      | ((remaining > 1 ? bytes[offset + 1] : 0) << 8)
      | (remaining > 2 ? bytes[offset + 2] : 0);
    output += BASE64URL_ALPHABET[(block >>> 18) & 63];
    output += BASE64URL_ALPHABET[(block >>> 12) & 63];
    if (remaining > 1) output += BASE64URL_ALPHABET[(block >>> 6) & 63];
    if (remaining > 2) output += BASE64URL_ALPHABET[block & 63];
  }
  return output;
}

/** RFC 7638-style public-key identity: optional JWK metadata cannot change the
 * identity, while private material is never accepted at the receipt boundary. */
export function normalizeP256PublicJwk(jwk) {
  if (!jwk || typeof jwk !== 'object' || Array.isArray(jwk)) throw new TypeError('public key JWK must be an object');
  if (Object.prototype.hasOwnProperty.call(jwk, 'd')) throw new TypeError('public key JWK must not contain private key material');
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') throw new TypeError('public key JWK must be an EC P-256 key');
  for (const coordinate of ['x', 'y']) {
    const bytes = decodeBase64url(jwk[coordinate]);
    if (bytes.length !== 32 || encodeBase64url(bytes) !== jwk[coordinate]) {
      throw new TypeError(`public key JWK ${coordinate} must be a canonical 32-byte base64url coordinate`);
    }
  }
  return { crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y };
}

export function p256JwkThumbprint(jwk) {
  return sha256Object(normalizeP256PublicJwk(jwk));
}

export const RECEIPT_PAYLOAD_KEYS = Object.freeze([
  'receipt_version', 'created_at', 'document_version', 'scientific_state_sha256',
  'runtime_sha256', 'artifact_sha256', 'evidence_version', 'audit_head',
  'covers_through_run', 'signer_key_fingerprint', 'signer_scope', 'assurance',
  'not_assured', 'note',
]);

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    const missing = wanted.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !wanted.includes(key));
    throw new TypeError(`${label} fields are invalid${missing.length ? `; missing: ${missing.join(', ')}` : ''}${extra.length ? `; unknown: ${extra.join(', ')}` : ''}`);
  }
}

const SHA256_ID = /^sha256:[0-9a-f]{64}$/;

/** Validate the exact v1 receipt boundary before hashing or importing its key. */
export function validateReceiptV1(receipt) {
  assertExactKeys(receipt, [...RECEIPT_PAYLOAD_KEYS, 'signature'], 'receipt');
  if (receipt.receipt_version !== 'living-evidence-receipt/1') throw new TypeError('unsupported receipt_version');
  if (typeof receipt.created_at !== 'string' || Number.isNaN(Date.parse(receipt.created_at))
    || new Date(receipt.created_at).toISOString() !== receipt.created_at) throw new TypeError('created_at must be a canonical ISO timestamp');
  for (const field of ['document_version', 'scientific_state_sha256', 'signer_key_fingerprint']) {
    if (!SHA256_ID.test(receipt[field])) throw new TypeError(`${field} must be a SHA-256 identifier`);
  }
  if (receipt.document_version !== receipt.scientific_state_sha256) throw new TypeError('document_version must equal scientific_state_sha256');
  for (const field of ['runtime_sha256', 'artifact_sha256', 'audit_head']) {
    if (receipt[field] !== null && !SHA256_ID.test(receipt[field])) throw new TypeError(`${field} must be null or a SHA-256 identifier`);
  }
  if (!Number.isSafeInteger(receipt.evidence_version) || receipt.evidence_version < 1) throw new TypeError('evidence_version must be a positive safe integer');
  if (!Number.isSafeInteger(receipt.covers_through_run) || receipt.covers_through_run < 0) throw new TypeError('covers_through_run must be a non-negative safe integer');
  if ((receipt.covers_through_run === 0) !== (receipt.audit_head === null)) throw new TypeError('audit_head nullability must match covers_through_run');
  if (receipt.artifact_sha256 !== null && receipt.runtime_sha256 === null) throw new TypeError('an artifact receipt must identify its runtime');
  for (const field of ['signer_scope', 'assurance', 'note']) {
    if (typeof receipt[field] !== 'string' || !receipt[field].trim()) throw new TypeError(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(receipt.not_assured) || !receipt.not_assured.length
    || receipt.not_assured.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError('not_assured must be a non-empty array of non-empty strings');
  }
  assertExactKeys(receipt.signature, ['algorithm', 'value', 'public_key_jwk'], 'receipt.signature');
  if (receipt.signature.algorithm !== 'ECDSA-P256-SHA256') throw new TypeError('unsupported signature algorithm');
  const signatureBytes = decodeBase64url(receipt.signature.value);
  if (signatureBytes.length !== 64 || encodeBase64url(signatureBytes) !== receipt.signature.value) {
    throw new TypeError('signature value must be canonical raw 64-byte P-256 base64url');
  }
  assertExactKeys(receipt.signature.public_key_jwk, ['crv', 'kty', 'x', 'y'], 'receipt.signature.public_key_jwk');
  const publicKey = normalizeP256PublicJwk(receipt.signature.public_key_jwk);
  if (p256JwkThumbprint(publicKey) !== receipt.signer_key_fingerprint) throw new TypeError('signer_key_fingerprint does not match the public key');
  return { publicKey, signatureBytes, payload: Object.fromEntries(RECEIPT_PAYLOAD_KEYS.map((key) => [key, receipt[key]])) };
}

/** Dependency-free strict JSON parser used at signature/import boundaries. It
 * follows JSON syntax and rejects duplicate object keys before materialisation. */
export function parseJsonRejectDuplicates(input) {
  if (typeof input !== 'string') throw new TypeError('JSON input must be a string');
  let index = 0;
  const fail = (message) => { throw new SyntaxError(`${message} at offset ${index}`); };
  const whitespace = () => { while (/[\x20\t\r\n]/.test(input[index] || '')) index += 1; };
  const string = () => {
    if (input[index] !== '"') fail('expected a JSON string');
    const start = index++;
    while (index < input.length) {
      const character = input[index++];
      if (character === '"') return JSON.parse(input.slice(start, index));
      if (character === '\\') {
        const escape = input[index++];
        if (!'"\\/bfnrtu'.includes(escape || '')) fail('invalid string escape');
        if (escape === 'u') {
          const digits = input.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail('invalid unicode escape');
          index += 4;
        }
      } else if (character.charCodeAt(0) < 0x20) fail('unescaped control character');
    }
    fail('unterminated JSON string');
  };
  const value = () => {
    whitespace();
    const character = input[index];
    if (character === '"') return string();
    if (character === '{') {
      index += 1;
      whitespace();
      const object = Object.create(null);
      const seen = new Set();
      if (input[index] === '}') { index += 1; return object; }
      while (index < input.length) {
        whitespace();
        const key = string();
        if (seen.has(key)) fail(`duplicate JSON key ${JSON.stringify(key)}`);
        seen.add(key);
        whitespace();
        if (input[index++] !== ':') fail('expected colon');
        object[key] = value();
        whitespace();
        const delimiter = input[index++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') fail('expected comma or closing brace');
      }
      fail('unterminated JSON object');
    }
    if (character === '[') {
      index += 1;
      whitespace();
      const array = [];
      if (input[index] === ']') { index += 1; return array; }
      while (index < input.length) {
        array.push(value());
        whitespace();
        const delimiter = input[index++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') fail('expected comma or closing bracket');
      }
      fail('unterminated JSON array');
    }
    for (const [literal, parsed] of [['true', true], ['false', false], ['null', null]]) {
      if (input.startsWith(literal, index)) { index += literal.length; return parsed; }
    }
    const number = input.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) { index += number[0].length; return Number(number[0]); }
    fail('expected a JSON value');
  };
  const parsed = value();
  whitespace();
  if (index !== input.length) fail('unexpected trailing input');
  return parsed;
}
