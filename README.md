# Tap: pay a friend by touching phones

An Android Solana wallet (devnet, test money) where paying someone is a phone-to-phone NFC tap.

1. The receiver opens **Receive** (optionally sets an amount, or **scans a receipt** with Gemini).
2. The payer taps **Tap to pay** and holds the phones back to back.
3. The payer sees _"Pay Sam 0.25 SOL?"_ and confirms. Both phones show **Paid ✓**.

Built for Hack The Nest 2026 (MLH **Best Use of Solana**, **Best Use of Gemini API**).

## How it works

- **The tap is real phone-to-phone NFC.** It isn't NDEF stickers. The receiver runs a Host Card
  Emulation service (`TapApduService`, proprietary AID `F0544150574C5401`). The payer's phone uses
  `NfcAdapter.enableReaderMode` + `IsoDep` to `SELECT` that AID and read the payload in 240-byte
  chunks (`GET NEXT` APDUs). See `packages/capacitor-nfc-tap/android/.../ApduProtocol.kt`.
- **The payload** is a versioned JSON envelope around a standard
  [Solana Pay](https://docs.solanapay.com/spec) transfer-request URL:
  `{"v":1,"rail":"solana","label":"Sam","url":"solana:<addr>?amount=0.25&reference=<key>&label=Sam"}`.
  The QR fallback shows the same URL, so other Solana wallets can pay it too.
- **Both phones confirm.** The receiver polls for its unique `reference` key on-chain (Solana Pay
  `findReference`), checks the recipient and amount, then shows "Paid ✓ by <name>". The payer
  waits for `confirmed`.
- **Gemini receipt to request.** A photo goes to `POST /api/receipt`, which calls Gemini with
  structured JSON output (`{merchant,total,currency,items,confidence}`). The server converts USD
  to SOL at a cached CoinGecko rate and pre-fills the request. The key stays on the server and
  photos aren't stored.
- **Keys** are generated on the device and kept in Android Keystore-backed secure storage.
  Money never moves without a Confirm tap.

## Build & install (Windows)

Requires Node 22, pnpm 9, Android SDK, JDK 21.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
export JAVA_HOME="$LOCALAPPDATA/Programs/Eclipse Adoptium/jdk-21.0.6.7-hotspot"   # any JDK 21
pnpm android:apk
"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Server (receipt scan + USD price): copy `.env.example` to `.env`, set `GEMINI_API_KEY`, then
`pnpm --filter @tap/server dev`. Set `VITE_API_URL` before building the APK so the app can reach it.
The app still works for tap-to-pay without the server. Only receipt scan and USD display stop working.

## Known limits

- Both phones must be **Android with NFC on and the screen unlocked**. The receiver must have Tap
  open on the Receive screen.
- Touch the **backs** of the phones. Antenna positions differ by model, so move them slowly.
- Devnet airdrops are rate-limited. Use [faucet.solana.com](https://faucet.solana.com) as a fallback.
- Devnet only, test money only. iOS isn't supported (iOS doesn't allow app-to-app HCE like this).
