// Runs the Android Gradle wrapper on Windows (gradlew.bat) and macOS/Linux (./gradlew).
// Usage: node scripts/gradle.mjs assembleDebug
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../apps/mobile/android/', import.meta.url));
const win = process.platform === 'win32';
// Absolute path: some Windows setups don't search the current directory for executables.
const wrapper = join(cwd, win ? 'gradlew.bat' : 'gradlew');
const r = win
  ? spawnSync(`"${wrapper}"`, process.argv.slice(2), { cwd, stdio: 'inherit', shell: true })
  : spawnSync(wrapper, process.argv.slice(2), { cwd, stdio: 'inherit' });
process.exit(r.status ?? 1);
