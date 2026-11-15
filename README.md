# Tap: pay a friend by touching phones

An Android Solana wallet (devnet, test money) where paying someone is a phone-to-phone NFC tap.

1. The receiver opens **Receive** (optionally sets an amount, or **scans a receipt** with Gemini).
2. The payer taps **Tap to pay** and holds the phones back to back.
3. The payer sees _"Pay Sam 0.25 SOL?"_ and confirms. Both phones show **Paid ✓**.

Built for Hack The Nest 2026 (MLH **Best Use of Solana**, **Best Use of Gemini API**, Breez **Everyday Wallet**).

The app holds two balances: **SOL on Solana devnet** and **bitcoin (sats) on Breez Spark regtest**.
The tap works for both currencies.

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

PowerShell, from the repo root:

```powershell
pnpm install
pnpm lint; pnpm typecheck; pnpm test
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\Eclipse Adoptium\jdk-21.0.6.7-hotspot"   # any JDK 21
pnpm android:apk     # -> apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
pnpm android:test    # Kotlin APDU unit tests
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk
```

Or open the `apps/mobile/android` folder in Android Studio (File → Open), let Gradle sync, plug in
a phone and press ▶ Run. After changing web code, run `pnpm android:sync` first.

Server (receipt scan + USD price): copy `.env.example` to `.env`, set `GEMINI_API_KEY`, then
`pnpm --filter @tap/server dev`. Set `VITE_API_URL` before building the APK so the app can reach it.
The app still works for tap-to-pay without the server. Only receipt scan and USD display stop working.

## Test it

**In the browser (fastest, no phone):** `pnpm --filter @tap/mobile dev`, then open
http://localhost:5174 in **two tabs**. Tab A: Receive → Ready to be tapped. Tab B: Tap to pay. The fake
NFC plugin passes the tap between tabs. Each tab is its own wallet only if you use a separate browser
profile (they share localStorage otherwise).

**Emulator (no NFC, but real WebView + Breez WASM):** Android Studio → Device Manager → start a
device, then the `adb install -r …` command above. The receiver falls back to the QR code.

**Two real phones (the actual tap):**

1. On each phone: Settings → About phone → tap _Build number_ 7 times → Developer options → **USB debugging** on.
   Turn **NFC on**. (Settings → Connected devices → NFC.)
2. Plug in phone 1, accept the "Allow USB debugging?" prompt, run `adb devices` (it must say `device`,
   not `unauthorized`), then `adb install -r <apk>`. Repeat for phone 2.
   With both plugged in: `adb -s <serial> install -r <apk>`.
3. Fund one phone: Home → _Copy my address & open faucet.solana.com_ → paste, pick devnet.
   For sats: Receive → Bitcoin → _Show my Spark address_, then send sats to it from the games app.
4. Phone A: **Receive** → pick SOL or Bitcoin → (amount) → _Ready to be tapped_.
   Phone B: **Tap to pay** → hold the phones back to back, slowly → Confirm. Both show ✓.
5. If the tap fails: `adb logcat | grep -iE "nfc|apdu|Capacitor"`.

**Sideload without a cable:** copy `app-debug.apk` to the phone (Drive, email, USB file transfer),
open it in Files, and allow _Install unknown apps_ for that app when prompted. CI also uploads the
APK as the `tap-debug-apk` artifact on every push to `main`.

## Known limits

- Both phones must be **Android with NFC on and the screen unlocked**. The receiver must have Tap
  open on the Receive screen.
- Touch the **backs** of the phones. Antenna positions differ by model, so move them slowly.
- The public devnet RPC no longer airdrops (HTTP 410), so the app opens [faucet.solana.com](https://faucet.solana.com) with your address copied.
- Bitcoin is **regtest** test money via Breez Spark. The Breez API key ships inside the APK.
- Devnet only, test money only. iOS isn't supported (iOS doesn't allow app-to-app HCE like this).
