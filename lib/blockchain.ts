// Blockchain anchoring for finalized approvals
// Uses Alchemy RPC and viem when ALCHEMY_RPC_URL and ANCHOR_PRIVATE_KEY are set

import type { BlockchainAnchor } from './types'

export interface AnchorResult {
  transaction_hash: string | null
  block_number: number | null
}

/**
 * Anchor a finalized record approval to the blockchain.
 * When ALCHEMY_RPC_URL and ANCHOR_PRIVATE_KEY are set, sends the content hash
 * in a transaction (data field); otherwise returns null tx hash (anchor recorded in DB only).
 */
export async function anchorRecordToBlockchain(
  recordId: string,
  recordVersion: number,
  contentHash: string
): Promise<AnchorResult> {
  const rpcUrl = process.env.ALCHEMY_RPC_URL
  const privateKey = process.env.ANCHOR_PRIVATE_KEY

  if (!rpcUrl || !privateKey) {
    return { transaction_hash: null, block_number: null }
  }

  try {
    const { createWalletClient, http } = await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const { base, mainnet } = await import('viem/chains')
    const chainId = process.env.ANCHOR_CHAIN_ID === '1' ? mainnet : base

    const account = privateKeyToAccount(
      privateKey.startsWith('0x') ? (privateKey as `0x${string}`) : (`0x${privateKey}` as `0x${string}`)
    )

    const client = createWalletClient({
      account,
      chain: chainId,
      transport: http(rpcUrl),
    })

    const hashHex =
      contentHash.length === 64 && /^[a-fA-F0-9]+$/.test(contentHash)
        ? contentHash
        : Buffer.from(contentHash, 'utf8').toString('hex').padStart(64, '0').slice(0, 64)
    const hashBytes = (`0x${hashHex}` as `0x${string}`)

    const hash = await client.sendTransaction({
      to: account.address,
      value: 0n,
      data: hashBytes,
      gas: 100000n,
    })

    const { createPublicClient } = await import('viem')
    const publicClient = createPublicClient({
      chain: chainId,
      transport: http(rpcUrl),
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    return {
      transaction_hash: receipt.transactionHash,
      block_number: receipt.blockNumber ? Number(receipt.blockNumber) : null,
    }
  } catch (err) {
    console.error('Blockchain anchor error:', err)
    return { transaction_hash: null, block_number: null }
  }
}

/**
 * Verify a record's blockchain anchor (checks transaction exists and matches).
 * Stub: when transaction_hash is set, could query chain; for now returns true if hash present.
 */
export async function verifyBlockchainAnchor(
  anchor: BlockchainAnchor
): Promise<boolean> {
  if (!anchor.transaction_hash) return false
  const rpcUrl = process.env.ALCHEMY_RPC_URL
  if (!rpcUrl) return false
  try {
    const { createPublicClient, http } = await import('viem')
    const { base, mainnet } = await import('viem/chains')
    const chainId = process.env.ANCHOR_CHAIN_ID === '1' ? mainnet : base
    const publicClient = createPublicClient({
      chain: chainId,
      transport: http(rpcUrl),
    })
    const tx = await publicClient.getTransaction({
      hash: anchor.transaction_hash as `0x${string}`,
    })
    return !!tx
  } catch {
    return false
  }
}
