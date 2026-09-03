import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  canonicalStringify, decodeBase64url, encodeBase64url, normalizeP256PublicJwk,
  p256JwkThumbprint, parseJsonRejectDuplicates, sha256Hex, sha256Object,
} from '../lib/integrity.js';

const vectors = ['', 'abc', 'Living Evidence', '科学を加速する'];
for (const input of vectors) {
  assert.equal(sha256Hex(input), createHash('sha256').update(input).digest('hex'));
}

const raw = new Uint8Array([0, 255, 128, 10, 13]);
assert.equal(sha256Hex(raw), createHash('sha256').update(raw).digest('hex'));
assert.equal(sha256Hex(raw.buffer), createHash('sha256').update(raw).digest('hex'));

assert.equal(
  canonicalStringify({ z: 1, a: { y: [3, 2, 1], x: true } }),
  '{"a":{"x":true,"y":[3,2,1]},"z":1}',
);
assert.equal(sha256Object({ b: 2, a: 1 }), sha256Object({ a: 1, b: 2 }));
assert.match(sha256Object({ evidence: 'portable' }), /^sha256:[0-9a-f]{64}$/);
const dangerous = JSON.parse('{"__proto__":{"polluted":true},"a":1}');
assert.equal(canonicalStringify(dangerous), '{"__proto__":{"polluted":true},"a":1}');
assert.notEqual(sha256Object(dangerous), sha256Object({ a: 1 }));
assert.throws(() => sha256Object(new Date(0)), /plain objects/);
assert.throws(() => sha256Object(new Array(1)), /sparse array/);
assert.throws(() => sha256Object([undefined]), /undefined/);
assert.throws(() => sha256Object({ a: 1, b: undefined }), /undefined/);
assert.throws(() => sha256Hex({ toString: () => 'abc' }), /string, ArrayBuffer, or typed-array view/);
assert.throws(() => sha256Object(Object.defineProperty({}, 'hidden', { value: 1 })), /non-enumerable/);
assert.throws(() => sha256Object(Object.defineProperty({}, 'value', { get: () => 1, enumerable: true })), /accessors/);
assert.throws(() => sha256Object({ [Symbol('hidden')]: 1 }), /symbol keys/);
const arrayWithProperty = [1];
arrayWithProperty.extra = 2;
assert.throws(() => sha256Object(arrayWithProperty), /non-JSON array properties/);

const strictParsed = parseJsonRejectDuplicates('{"a":1,"nested":{"b":2}}');
assert.equal(strictParsed.a, 1);
assert.equal(strictParsed.nested.b, 2);
assert.throws(() => parseJsonRejectDuplicates('{"a":1,"a":2}'), /duplicate JSON key/);
assert.throws(() => parseJsonRejectDuplicates('{"signature":{"value":"a","value":"b"}}'), /duplicate JSON key/);
assert.throws(() => parseJsonRejectDuplicates('{"a":1}\u00a0'), /trailing input/);

const coordinate = encodeBase64url(new Uint8Array(32));
assert.equal(decodeBase64url(coordinate).length, 32);
const jwk = { kty: 'EC', crv: 'P-256', x: coordinate, y: coordinate };
assert.deepEqual(normalizeP256PublicJwk({ ...jwk, alg: 'ES256', ext: true }), jwk);
assert.equal(p256JwkThumbprint(jwk), p256JwkThumbprint({ ...jwk, key_ops: ['verify'] }));
assert.throws(() => normalizeP256PublicJwk({ ...jwk, d: coordinate }), /private key/);
assert.throws(() => decodeBase64url(`${coordinate}=`), /canonical/);

console.log('integrity.test.mjs: all green');
