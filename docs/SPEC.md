# Build prompt: "Tap" — Android Solana wallet with real phone-to-phone NFC tap (Hack The Nest 2026, 2nd entry)

> Paste into Claude Code in a **new, empty repo**. Copy tooling from the games repo where noted.
> Goal: **minimal, stable, Android-only native app** (Capacitor + one custom Kotlin NFC plugin).
> Targets MLH **Best Use of Solana** + **Best Use of Gemini API** (+ MongoDB Atlas, GoDaddy domain). If the stretch Breez balance (section 5a) is done, it can also be entered for the Breez **06 Everyday Wallet** bounty.

---

## 0. How to work

### ⚡ SPEED IS THE TOP PRIORITY
We have only a few hours. **Move as fast as possible and cut corners wherever it doesn't hurt stability.**
- **Keep (stability):** the app must not crash, money must never move without a confirm tap, transfers must show real success/failure, keys stay secret, and every phase ends with an APK that installs and runs.
- **Cut freely:** docs (a short README at the end is enough; skip `docs/` guides, keep `CLAUDE.md` to a few lines), polish, animations, edge-case UI, refactoring, abstractions beyond what's needed, and most tests. **Only write tests for the code that can lose or misdirect money:** payload/Solana Pay URL parsing, amount conversions, and (if built) the exchange state machine. Skip E2E, Kotlin unit tests and coverage targets unless they're quick. CI can be just lint + typecheck + unit tests + APK build; drop anything that slows it down.
- Prefer the simplest working approach and well-known libraries over custom code. Don't gold-plate. If a section of this spec would take long for little demo value, say so and propose a shortcut instead of building it.
- Keep plans and status updates very short. Don't ask for confirmation on small decisions; just make a sensible choice and note it.
- Sections 7 (tests) and the later phases below are **upper bounds, not requirements**: trim them according to this rule.

### Workflow
- Plan first: read this whole file, reply with a **brief** plan + repo layout + anything I must install, then wait for approval.
- **Time-boxed: hacking ends Sunday 12:00 PM Eastern.** Ship phases in order; each phase leaves a working, installable APK. Never leave `main` broken.
- Verify Capacitor, Android NFC/HCE, Solana and Gemini APIs against current docs; don't invent method names.
- Commit after every working step (short Conventional Commit messages). Never commit secrets, keystores or private keys.
- Create a minimal `CLAUDE.md` (build/install commands, key decisions). Keep this file as `docs/SPEC.md`.
- I'm on **Windows** with Android Studio. Give exact commands for building the debug APK and installing it with `adb install -r`.

## 1. Reuse from the games repo (copy, don't rebuild)
- pnpm + TypeScript strict, ESLint/Prettier, lint-staged, Vitest, GitHub Actions CI (+ gitleaks), `.env.example` pattern.
- React + Vite app setup and the **Sticker Arcade design system** (tokens, Button, Card, AmountLabel…).
- Small Express server skeleton (zod, env, MongoDB) for the Gemini proxy.
- Drop everything game/escrow/Breez/PWA-specific.

Layout:
```
apps/mobile        React + Vite UI wrapped with Capacitor (android/ folder committed)
apps/server        Express: Gemini receipt proxy + price endpoint (+ optional profiles)
packages/shared    Solana Pay URL build/parse, tap payload schema (zod), amount utils
packages/capacitor-nfc-tap   custom Capacitor plugin (TypeScript API + Kotlin Android impl)
```

## 2. Product (bare minimum)
Solana **devnet** wallet where you can:
1. **Create a wallet** on first open (nickname + generated keypair). Balance in SOL (≈ USD small, in parentheses).
2. **Get test SOL** (devnet `requestAirdrop`; link to faucet.solana.com as fallback since airdrops are rate-limited).
3. **Receive / Request**: the "Receive" screen makes the phone tappable. Optionally set an amount and memo first (or **snap a receipt** to fill them).
4. **Send**: tap "Tap to pay" and hold the phones back to back. The other person's name, address and requested amount appear. If no amount was requested, enter it now. Confirm, done, with live success on **both** phones.
5. **Fallbacks**: show/scan **QR** (same payload) and paste-address send, for when NFC fails.
6. **Contacts + history**: save people after a tap; recent transactions with devnet explorer links.

Permanent "DEVNET · test money" badge. Always require a confirm tap before money moves.

## 3. The NFC tap (core feature — custom Capacitor plugin)
Implement `packages/capacitor-nfc-tap` with a Kotlin Android implementation:

**Receiver (card emulation):**
- A `HostApduService` registered with a **custom AID** (e.g. a proprietary `F0…` AID) in `apduservice.xml`, category `other`.
- When the app is in the foreground on the Receive screen, call `CardEmulation.setPreferredService(...)`; release it when leaving.
- Protocol (keep it tiny): reader sends `SELECT AID` → service replies with the **tap payload** (UTF-8 JSON, chunked with a simple `GET NEXT` APDU if larger than one response) + status `90 00`. Unknown commands → `6A 82`.
- The payload is set from JS: `NfcTap.setPayload({ payload })` / `NfcTap.clearPayload()`.
- Emit `tapServed` to JS when a reader successfully fetched the payload (so the receiver UI can show "Sent your details…").

**Sender (reader):**
- `NfcTap.startReading()` → `NfcAdapter.enableReaderMode(activity, callback, FLAG_READER_NFC_A | FLAG_READER_SKIP_NDEF_CHECK | FLAG_READER_NO_PLATFORM_SOUNDS, extras)`; on tag: `IsoDep.get(tag)`, connect, SELECT our AID, read chunks, close, emit `payloadRead` to JS. `stopReading()` disables reader mode (also on pause/leave screen).
- Timeouts and clear errors: NFC off (offer to open NFC settings), no NFC hardware, tag lost (ask to hold still), wrong app on other phone.
- Haptic + sound feedback on success.

**Payload** (zod-validated in `packages/shared`, versioned):
```json
{ "v": 1, "rail": "solana", "label": "<nickname>", "url": "solana:<recipient>?amount=<sol>&reference=<pubkey>&label=<nickname>&message=<memo>" }
```
For SOL, `url` is a standard **Solana Pay transfer-request URL**, so the QR fallback and other Solana wallets can use the same thing. Design the schema so section 5a can add `"rail": "bitcoin"` with a Breez payment request in `url` without breaking v1 readers. Validate strictly (base58 pubkey, amount range, scheme). Never auto-send.

**Both phones confirm:** the receiver watches its `reference` on-chain (Solana Pay `findReference`-style polling) and shows "Paid ✓ by <name>" when the transfer lands; the sender shows success after `confirmed`.

Document known limits in the README: both phones must be Android with NFC on and the screen unlocked; touch the backs (antenna spots differ by model, so move phones slowly).

## 4. Solana
- `@solana/web3.js` (or `@solana/kit` if the docs recommend it; pick one), devnet RPC from env.
- **In-app keypair**, stored with Android-backed secure storage (e.g. a Capacitor secure-storage plugin using the Android Keystore; if that's risky on time, `@capacitor/preferences` with a clear devnet-only warning). Settings: address, copy, export key behind a warning.
- Native SOL `SystemProgram.transfer`, wait for `confirmed`, unique `reference` key attached for requests. Plain-English errors (insufficient funds, expired blockhash, offline) with retry.
- Stretch: devnet USDC.

## 5. Gemini: receipt to request
- Receive screen → **"Scan receipt"** (`@capacitor/camera`) → resize → `POST /api/receipt` on our server → Gemini multimodal with **structured JSON output** `{ merchant, date, currency, total, items[], confidence }`.
- Gemini key **only on the server** (env + GitHub secret). Don't store photos. Rate-limit.
- Convert fiat → SOL with a cached price feed (`GET /api/price`, e.g. CoinGecko, ~60 s cache; show the rate). Pre-fill amount + memo; user can edit. Low confidence → ask user to type it.
- Stretch: "Split it" (N equal shares; each person taps to pay their share while the receiver stays on the Receive screen).
- The app must still work for tap-to-pay if the server is unreachable (only receipt scan and USD display degrade).

## 5a. In-app bitcoin balance with Breez (first stretch, after Phase 5)
Add a second balance to the same app: **bitcoin via the Breez SDK (Spark), regtest**, next to SOL.
- **Spike first (≤ 15 min, time-boxed):** load the Breez browser build (`@breeztech/breez-sdk-spark/web`) inside the Capacitor WebView, connect to regtest, read a balance. If the Wasm build won't run in the WebView, stop and tell me (fallback: a small Capacitor plugin around the Breez **Kotlin** SDK, only if there's time).
- **Wallet key:** generate a seed for Breez and keep it in the same secure storage as the Solana key (no passkey login in this app: WebView passkey support is unreliable). Export behind a warning.
- Breez API key comes from env at build time (document that it ships inside the APK).
- Home shows two balances: **sats** (≈ USD) and **SOL** (≈ USD). Send/Receive ask "Bitcoin or SOL?" (remember the last choice).
- **Direct transfers with the games app:** the Receive screen shows this app's Breez receive address/request as text + QR, so the user can move test sats in from the games app with its **existing manual send**, and send sats back to their games wallet from here. This is a real wallet-to-wallet transfer on the same network, with no exchange.
- **Tap carries either currency:** the tap payload gets a `rail` field (see section 3). For `bitcoin`, the sender's app pays the Breez payment request it received.
- Tests: payload parsing for both rails, amount conversions (sats ↔ BTC ↔ USD), mocked Breez rail for UI/E2E.

## 5b. Games bridge (last stretch, only after 5a): move test money between this wallet and the games app
The games app holds **bitcoin on Breez/Spark regtest**; this app holds **SOL on Solana devnet**. Different chains, different keys, so they can't share one wallet, and no real bridge exists between two test networks. Build a small, **clearly labelled test-network exchange** in `apps/server` instead:
- The server holds two house wallets: a **Breez SDK (Node) regtest wallet** and a **Solana devnet treasury keypair** (both secrets in env / GitHub secrets; fund the treasury from faucet.solana.com early).
- **Link once:** in Settings → "Link games wallet", the user pastes or scans (QR) their games-app Spark address. Store it on the device and in their server profile.
- **Games → Tap ("Move in"):** user enters an amount in sats → server creates a **unique payment request** on its Breez wallet and shows it as text + QR → the user pays it from the games app using its **existing manual send** (no changes to the games repo) → when the server sees the payment, it sends the equivalent devnet SOL to the user's Solana address.
- **Tap → Games ("Move out"):** user enters SOL → sends it to the treasury with a unique Solana Pay `reference` → when confirmed, the server pays the equivalent sats to the linked games-wallet Spark address.
- Rate: BTC/SOL from the cached price feed, shown before confirming; small fixed spread optional. Per-transfer and daily caps.
- Same safety rules as the games escrow: an order state machine persisted in MongoDB (`CREATED → AWAITING_PAYMENT → PAID_IN → PAYING_OUT → DONE | EXPIRED | REFUNDING | FAILED`), idempotent payouts with a ledger, 10-minute expiry with refund, reconciliation on server start. Unit-test the state machine with mocked rails.
- UI copy must say it's a **test-network exchange run by this app**, not a real cross-chain bridge. Mention a real mainnet route (e.g. stablecoins) as future work.
- **Do not modify the games repo.** It is a separate submission and must stay stable.

## 6. Screens (phone-first, Sticker Arcade style)
Home (balance, **Tap to pay**, **Receive**, Get test SOL, activity) · Receive (amount/memo or Scan receipt, big "Ready to be tapped" animation, QR fallback, live "Paid ✓") · Send (reading animation → "Pay <name> X SOL?" → confirm → success) · Contacts · Settings (address, export key, NFC status, devnet badge).

## 7. Tests and CI (proportional)
- Vitest: Solana Pay URL build/parse (incl. malicious input), payload schema + chunking/reassembly logic, lamport conversions, receipt JSON validation.
- Kotlin unit tests for the APDU handler (SELECT → payload, chunking, unknown command → 6A82).
- Mock `NfcTap` plugin in the web layer so UI flows can be tested in the browser (Playwright, mobile viewport): Receive → simulated tap → confirm → "Paid ✓".
- CI: lint, typecheck, tests, web build, **Android debug APK build** (Gradle via GitHub Actions, upload APK as an artifact), gitleaks.

## 8. Phases (each ends green, committed, with an installable APK)
1. **Skeleton**: monorepo from reused tooling, Capacitor Android project, design system, CI building the APK. Hello screen on a real phone.
2. **Wallet core**: create wallet, balance, airdrop, send to pasted address, history. *(Valid Solana entry from here.)*
3. **NFC tap plugin**: HCE receiver + reader + payload protocol, tested between two phones; then wire into Receive/Send with amount + confirm + "Paid ✓" on both sides.
4. **QR fallback + contacts.**
5. **Gemini receipt scan.**
6. Polish, README (how it works, how to build/install, limits), deploy server (Vultr + domain), signed release APK if time.
7. Stretch 1: **in-app Breez bitcoin balance** (section 5a): spike, then two balances, direct transfers with the games app, tap for both currencies.
8. Stretch 2: **BTC ↔ SOL test exchange** (section 5b).
9. Stretch 3: split bill, devnet USDC.

After each phase: 3–5 line status + anything I must do (install, enable NFC/USB debugging, API keys, secrets).

## 9. Out of scope
iOS, mainnet, Play Store release, external wallet apps, swaps, NFTs, accounts/passwords.