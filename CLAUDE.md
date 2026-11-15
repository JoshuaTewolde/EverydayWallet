# Tap (Hack The Nest 2026)

Android-only Solana **devnet** wallet with phone-to-phone NFC tap. Full spec: `docs/SPEC.md`.

- `apps/mobile`: React + Vite + Capacitor 8 (android/ committed). `apps/server`: Express (Gemini receipt, price).
- `packages/shared`: Solana Pay URL + tap payload (zod) + exact lamport math. **Tested; money path.**
- `packages/capacitor-nfc-tap`: Kotlin HCE `TapApduService` (AID `F0544150574C5401`) + reader mode. Protocol in `ApduProtocol.kt`.

## Commands (Windows, Git Bash)

- Checks: `pnpm lint && pnpm typecheck && pnpm test`
- APK: JAVA_HOME = a JDK 21 as a **Windows-style path** (gradlew.bat can't read `/c/...`), then `pnpm android:apk`
  → `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Install: `"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Kotlin tests: `pnpm android:test` (`scripts/gradle.mjs` picks gradlew.bat vs ./gradlew)
- Emulator `Medium_Phone_API_35` exists (no NFC, but real WebView + Breez WASM); Git Bash adb needs `MSYS_NO_PATHCONV=1` for `/sdcard` paths.
- Server: `pnpm --filter @tap/server dev` (reads root `.env`)

## Decisions

- `@solana/web3.js` 1.98 (stable, documented API); v3 is a Kit compat layer.
- Keys: `@aparajita/capacitor-secure-storage` (Android Keystore). Devnet only.
- Sender adds memo `tap:from:<nickname>` so the receiver can show "Paid by <name>".
- Never auto-send: every transfer goes through the Confirm screen.
- WebView origin is `https://tap.local` (capacitor.config `server.hostname`): public devnet RPC 403s `Origin: https://localhost`.
- Public devnet RPC airdrop is closed (HTTP 410): the app links to faucet.solana.com instead.
- Bitcoin: Breez SDK Spark 0.28.4 **web/WASM build in the WebView** (spike passed on emulator), regtest.
  Mnemonic in secure storage (`tap.breez.mnemonic`). Tap payload `rail: "bitcoin"`, `url` = Spark invoice/address.
