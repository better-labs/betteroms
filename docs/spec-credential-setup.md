# Polymarket API Credential Setup

BetterOMS supports **API-only signup** via the EOA (Externally Owned Account) path - no website interaction required.

## EOA Quickstart (API-Only, No Website)

```bash
# 1. Install dependencies
pnpm install

# 2. Generate API credentials (bootstraps your account)
pnpm run generate-creds
# → Signs EIP-712 message with your wallet
# → Sends to POST /auth/api-key endpoint
# → Outputs credentials for .env.local

# 3. (Phase 3+) Fund wallet & set allowances
pnpm run set-allowances
# → Approves USDC and CTF tokens on-chain

# 4. Start trading
pnpm run trade ./plans/my-trade.json
```

**What This Does:**
- ✅ Creates API credentials using only your private key (no website)
- ✅ Registers your wallet with Polymarket CLOB backend
- ✅ Your EOA address becomes the funder (holds funds + positions)
- ✅ L2 HMAC authentication for all trading requests (no wallet popups)

---

## Prerequisites
- Polygon wallet with private key (EOA)
- USDC on Polygon (for live trading in Phase 3+)
- No Polymarket.com account needed for API-only path

## EOA (Externally Owned Account) Approach

BetterOMS uses the **EOA path** exclusively:
- You control the private key directly (MetaMask, hardware wallet, etc.)
- No website signup required - API-only bootstrap
- Your wallet address holds funds and signs all transactions
- Requires one-time token approvals (USDC + conditional tokens)
- Full control over your wallet and funds

**Note:** Polymarket also supports proxy wallets (website-created multisigs), but BetterOMS does not use this approach.

---

## Step 1: Obtain Your Private Key

Use any Polygon-compatible wallet:
- **MetaMask**: Export private key from account details
- **Hardware wallet**: Ledger, Trezor, etc.
- **Programmatic**: Generate with `ethers` or web3 library
- Your private key = your signing key = your funder address

**Security Note:** This key controls your wallet funds - treat as highly sensitive. Never share or commit to version control.

## Step 2: Generate API Credentials (API-Only Signup)

This step **bootstraps your account** with Polymarket's backend using only your private key - no website signup required.

### Automated Setup (Recommended)

BetterOMS includes a built-in script to generate credentials:

```bash
# Install dependencies first
pnpm install

# Run the credential generation script (EOA signup)
pnpm run generate-creds
```

This script performs **API-only signup** by:
1. Reading your private key from `.env.local` (or prompting)
2. Signing an EIP-712 authentication message (L1 signature)
3. Sending signature to `POST /auth/api-key` endpoint
4. Receiving deterministic API credentials (key, secret, passphrase)
5. Outputting credentials to add to `.env.local`

**What Happens Under the Hood:**
- Your wallet signature is used "as a seed" to deterministically generate credentials
- Same private key always generates same API credentials
- This registers your wallet with Polymarket's CLOB backend
- No proxy wallet created - your EOA is the funder

### Manual Implementation

The credential generation uses the official TypeScript CLOB client:

```typescript
// scripts/generate-credentials.ts
import 'dotenv/config';
import { Wallet } from 'ethers';
import { ClobClient, type ApiKeyCreds } from '@polymarket/clob-client';

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon Mainnet
const SIGNATURE_TYPE = 2; // 0=browser wallet, 1=email/magic, 2=EOA

async function generateCredentials() {
  // Read private key from .env.local or prompt user
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Missing POLYMARKET_PRIVATE_KEY in .env.local');
  }

  // Create ethers wallet from private key (EOA)
  const wallet = new Wallet(privateKey);

  console.log(`\n🔑 Wallet Address: ${wallet.address}`);
  console.log('This address will be your funder (holds USDC and positions)\n');

  // Generate API credentials via L1 signature (API-only signup)
  // createOrDeriveApiKey() is idempotent - same key = same creds
  console.log('Signing EIP-712 message for API key generation...');
  const credsPromise: Promise<ApiKeyCreds> =
    new ClobClient(HOST, CHAIN_ID, wallet).createOrDeriveApiKey();

  const creds = await credsPromise;

  console.log('\n✅ API Credentials Generated (Account Bootstrapped)!\n');
  console.log('Add these to your .env.local file:\n');
  console.log(`POLYMARKET_PRIVATE_KEY=${privateKey}`);
  console.log(`POLYMARKET_API_KEY=${creds.apiKey}`);
  console.log(`POLYMARKET_API_SECRET=${creds.apiSecret}`);
  console.log(`POLYMARKET_API_PASSPHRASE=${creds.apiPassphrase}`);
  console.log(`POLYMARKET_SIGNATURE_TYPE=${SIGNATURE_TYPE}  # 2=EOA`);

  console.log('\n⚠️  Keep these credentials secure - never commit to git!\n');

  // Check access status (geo restrictions, etc.)
  console.log('Checking API access status...');
  const client = new ClobClient(
    HOST,
    CHAIN_ID,
    wallet,
    creds,
    SIGNATURE_TYPE
  );
  const access = await client.getAccessStatus();
  console.log('Access status:', access);

  console.log('\n📝 Next steps:');
  console.log(`   1. Fund ${wallet.address} with USDC on Polygon`);
  console.log(`   2. Set token allowances (run: pnpm run set-allowances)`);
  console.log(`   3. Start trading!\n`);
}

generateCredentials().catch(console.error);
```

**Dependencies:**
```json
{
  "dependencies": {
    "@polymarket/clob-client": "^latest",
    "ethers": "^6.x",
    "dotenv": "^latest"
  }
}
```

**How It Works:**
- API credentials are deterministically derived from your private key signature
- Same private key always generates same credentials
- Credentials grant access to trading APIs without exposing private key in every request
- See [Polymarket Authentication Docs](https://docs.polymarket.com/developers/CLOB/authentication) for details

## Step 3: Fund Your Wallet & Set Allowances (Phase 3+ Only)

**For Phase 1 (Paper Trading):** Skip this step - no funding required.

**For Phase 3+ (Live Trading):** EOA wallets must be funded and approve token transfers.

### 3a. Fund Wallet with USDC
```bash
# Send USDC to your wallet address on Polygon
# You can bridge from Ethereum or buy directly on Polygon
# Address: (output from generate-creds script)
```

### 3b. Set Token Allowances (One-Time Setup)

EOA wallets must approve two token types:
1. **USDC** - For placing buy orders
2. **Conditional Tokens (CTF)** - For placing sell orders (received from fills)

BetterOMS will include a helper script:
```bash
# Approve USDC and CTF tokens to Polymarket exchange contracts
pnpm run set-allowances

# This sends on-chain transactions:
# - USDC.approve(exchangeAddress, MAX_UINT256)
# - CTF.setApprovalForAll(exchangeAddress, true)
```

**Why Required:**
- Proxy wallet users don't need this (handled by smart contract)
- EOA users must explicitly approve contracts to spend tokens
- One-time setup - approvals persist until revoked

**Contracts to Approve:**
- Exchange: `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` (Polygon)
- CTF: `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (Polygon)

---

## Step 4: Configure BetterOMS

Create `.env.local` file in project root:
```bash
# Polygon wallet private key (REQUIRED for Phase 3+, optional for Phase 1)
POLYMARKET_PRIVATE_KEY=your_private_key_without_0x_prefix

# API credentials (REQUIRED for Phase 3+, optional for Phase 1)
# Generate these by running: pnpm run generate-creds
POLYMARKET_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
POLYMARKET_API_SECRET=your_api_secret_here
POLYMARKET_API_PASSPHRASE=your_api_passphrase_here
POLYMARKET_SIGNATURE_TYPE=2  # 0=browser, 1=email/magic, 2=EOA

# Database connection (REQUIRED)
DATABASE_URL=postgresql://user:password@localhost:5432/betteroms
```

## Security Best Practices
1. **Never commit `.env.local` file** - verify it's in `.gitignore`
2. **Use dedicated trading wallet** with limited funds for testing
3. **Rotate credentials** if compromised (re-run `pnpm run generate-creds`)
4. **Phase 6 upgrade path**: Implement delegated signer contract to avoid handling raw private keys
5. **Store production secrets** in secure secret manager (Vercel Env Vars, AWS Secrets Manager, etc.)
6. **Why `.env.local`**: Follows Next.js/Vercel convention - never committed, local-only secrets

## Phase 1 vs Phase 3 Requirements

| Feature | Phase 1 (Paper Mode) | Phase 3+ (Live Trading) |
|---------|----------------------|-------------------------|
| Private Key | Optional* | **Required** |
| API Credentials | Optional* | **Required** |
| Market Data Access | Public endpoints | Authenticated endpoints |
| Order Placement | Simulated (no API calls) | Live (CLOB API) |

*Phase 1 can use public market data APIs that don't require authentication, but having credentials configured enables testing the full authentication flow.
