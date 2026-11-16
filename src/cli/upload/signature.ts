import { createHash, createPrivateKey, sign } from 'node:crypto'

// The org creator key (J60, J69): Ed25519 over the raw 32 bytes of the
// tarball's SHA-256, never the compressed bytes. The private key is PKCS#8
// DER in base64, as `api-server keygen` prints it.

interface UploadIdentity {
  /** Lowercase hex: the shardfile's identity. */
  readonly hash: string
  /** Base64: the `x-wildshard-signature` header. */
  readonly signature?: string
}

interface SignedShardfile extends UploadIdentity {
  readonly signature: string
}

/** Account-only uploads retain the same byte identity without a creator signature. */
function hashTarball(tarball: Readonly<Uint8Array>): UploadIdentity {
  return { hash: createHash('sha256').update(tarball).digest('hex') }
}

function signTarball(
  privateKey: string,
  tarball: Readonly<Uint8Array>,
): SignedShardfile {
  const key = createPrivateKey({
    key: Buffer.from(privateKey, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })
  const digest = createHash('sha256').update(tarball).digest()
  return {
    hash: digest.toString('hex'),
    signature: sign(undefined, digest, key).toString('base64'),
  }
}

export { type UploadIdentity, type SignedShardfile, hashTarball, signTarball }
