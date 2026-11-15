# Tap (Hack The Nest 2026)

Android-only Solana **devnet** wallet with phone-to-phone NFC tap. Full spec: `docs/SPEC.md`.

- `apps/mobile`: React + Vite + Capacitor 8 (android/ committed). `apps/server`: Express (Gemini receipt, price).
- `packages/shared`: Solana Pay URL + tap payload (zod) + exact lamport math. **Tested; money path.**
- `packages/capacitor-nfc-tap`: Kotlin HCE `TapApduService` (AID `F0544150574C5401`) + reader mode. Protocol in `ApduProtocol.kt`.

## Commands (Windows, Git Bash)

- Checks: `pnpm lint && pnpm typecheck && pnpm test`
- APK: `export JAVA_HOME="$LOCALAPPDATA/Programs/Eclipse Adoptium/jdk-21.0.6.7-hotspot"; pnpm android:apk`
  → `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Install: `"$LOCALAPPDATA/Android/Sdk/platform-tools/adb" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
- Kotlin tests: `cd apps/mobile/android && ./gradlew :tap-capacitor-nfc-tap:testDebugUnitTest`
- Server: `pnpm --filter @tap/server dev` (reads root `.env`)

## Decisions

- `@solana/web3.js` 1.98 (stable, documented API); v3 is a Kit compat layer.
- Keys: `@aparajita/capacitor-secure-storage` (Android Keystore). Devnet only.
- Sender adds memo `tap:from:<nickname>` so the receiver can show "Paid by <name>".
- Never auto-send: every transfer goes through the Confirm screen.
