#!/usr/bin/env node
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  canonicalStringify, parseJsonRejectDuplicates, sha256Object, validateReceiptV1,
} from '../lib/integrity.js';

const rawArgs = process.argv.slice(2);
const signatureOnly = rawArgs.includes('--signature-only');
const positional = rawArgs.filter((arg) => arg !== '--signature-only');
const unknownFlags = positional.filter((arg) => arg.startsWith('-'));
const [receiptArg, artifactArg, ...extra] = positional;

if (!receiptArg || receiptArg === '--help' || extra.length || unknownFlags.length) {
  console.log('Usage: node scripts/verify-receipt.mjs RECEIPT.json [ARTIFACT.html]\n       node scripts/verify-receipt.mjs --signature-only RECEIPT.json');
  process.exit(receiptArg === '--help' ? 0 : 1);
}
if (signatureOnly && artifactArg) throw new Error('--signature-only cannot be combined with an artifact');

function parseStrictJson(text, label) {
  try { return parseJsonRejectDuplicates(text); }
  catch (error) { throw new Error(`${label} is not strict JSON: ${error.message}`); }
}

async function verifySignature(receipt) {
  const { publicKey, signatureBytes, payload } = validateReceiptV1(receipt);
  const key = await webcrypto.subtle.importKey(
    'jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
  return webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, signatureBytes,
    new TextEncoder().encode(canonicalStringify(payload)),
  );
}

function extractElementText(html, tag, id) {
  const prefix = `<${tag} id="${id}"`;
  const start = html.indexOf(prefix);
  if (start < 0 || html.indexOf(prefix, start + prefix.length) >= 0) throw new Error(`artifact needs exactly one ${tag}#${id}`);
  const contentStart = html.indexOf('>', start);
  const closing = `</${tag}>`;
  const end = html.indexOf(closing, contentStart + 1);
  if (contentStart < 0 || end < 0) throw new Error(`artifact has malformed ${tag}#${id}`);
  return html.slice(contentStart + 1, end);
}

function extractRuntimeJs(html) {
  const startMarker = '/*__LIVING_EVIDENCE_RUNTIME_START__*/';
  const endMarker = '/*__LIVING_EVIDENCE_RUNTIME_END__*/';
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start < 0 || end < start || html.indexOf(startMarker, start + 1) >= 0 || html.indexOf(endMarker, end + 1) >= 0) {
    throw new Error('artifact runtime markers are missing, duplicated, or out of order');
  }
  return html.slice(start + startMarker.length, end);
}

const receiptText = await readFile(resolve(receiptArg), 'utf8');
const receipt = parseStrictJson(receiptText, 'receipt');
validateReceiptV1(receipt);
const signatureValid = await verifySignature(receipt);

if (receipt.artifact_sha256 !== null && !artifactArg && !signatureOnly) {
  throw new Error('this receipt claims an artifact_sha256; provide the artifact, or explicitly use --signature-only for partial verification');
}

let artifactChecked = false;
let artifactValid = null;
let observedArtifactSha256 = null;
let embeddedReceiptSignatureValid = null;
let embeddedScienceValid = null;
let embeddedRuntimeValid = null;
let detachedEmbeddedLinkValid = null;

if (artifactArg) {
  const bytes = await readFile(resolve(artifactArg));
  observedArtifactSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  artifactChecked = true;
  artifactValid = observedArtifactSha256 === receipt.artifact_sha256;

  const html = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const embeddedReceipt = parseStrictJson(extractElementText(html, 'script', 'le-release-receipt'), 'embedded receipt');
  const embeddedScience = parseStrictJson(extractElementText(html, 'script', 'le-scientific-state'), 'embedded scientific state');
  const runtimeCss = extractElementText(html, 'style', 'le-runtime-css');
  const runtimeJs = extractRuntimeJs(html);

  validateReceiptV1(embeddedReceipt);
  embeddedReceiptSignatureValid = await verifySignature(embeddedReceipt);
  embeddedScienceValid = sha256Object(embeddedScience) === embeddedReceipt.scientific_state_sha256
    && embeddedReceipt.document_version === embeddedReceipt.scientific_state_sha256
    && receipt.scientific_state_sha256 === embeddedReceipt.scientific_state_sha256;
  const observedRuntimeSha256 = sha256Object({ css: runtimeCss, js: runtimeJs });
  embeddedRuntimeValid = observedRuntimeSha256 === embeddedReceipt.runtime_sha256
    && observedRuntimeSha256 === receipt.runtime_sha256;
  detachedEmbeddedLinkValid = embeddedReceipt.artifact_sha256 === null
    && receipt.artifact_sha256 !== null
    && receipt.evidence_version === embeddedReceipt.evidence_version
    && receipt.audit_head === embeddedReceipt.audit_head
    && receipt.covers_through_run === embeddedReceipt.covers_through_run
    && receipt.signer_key_fingerprint === embeddedReceipt.signer_key_fingerprint;
}

const complete = artifactChecked;
const result = {
  verification_scope: complete
    ? 'complete generated-artifact verification: detached signature, exact bytes, embedded scientific state, embedded runtime components, and detached↔embedded linkage'
    : 'partial signature-only verification; no artifact bytes or embedded components were checked',
  signature_valid: signatureValid,
  signer_key_fingerprint_valid: true,
  artifact_checked: artifactChecked,
  artifact_valid: artifactValid,
  embedded_receipt_signature_valid: embeddedReceiptSignatureValid,
  embedded_scientific_state_valid: embeddedScienceValid,
  embedded_runtime_valid: embeddedRuntimeValid,
  detached_embedded_link_valid: detachedEmbeddedLinkValid,
  observed_artifact_sha256: observedArtifactSha256,
  claimed_artifact_sha256: receipt.artifact_sha256,
  signer_key_fingerprint: receipt.signer_key_fingerprint,
  limitations: 'Integrity is relative to this public key. It does not identify who controlled the key, provide a trusted timestamp, verify source extraction, assess study quality, or preserve the artifact. Check the fingerprint against an independent trusted publication.',
};
console.log(JSON.stringify(result, null, 2));
const completeChecksValid = !complete || [
  artifactValid, embeddedReceiptSignatureValid, embeddedScienceValid,
  embeddedRuntimeValid, detachedEmbeddedLinkValid,
].every(Boolean);
if (!signatureValid || !completeChecksValid) process.exitCode = 1;
