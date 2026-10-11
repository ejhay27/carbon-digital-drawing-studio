# CARBON for Android (APK)

The Android edition runs the same CARBON studio inside a native Capacitor 8 shell. It has the same engine, brushes, Crisp Ink, Drawing Replay and `.carbon` format as the desktop/web edition, plus native Android integration.

## What is Android-specific

| Area | Behaviour |
|---|---|
| **Saving** | Projects are written to `Documents/CARBON/<name>.carbon`. The data goes to a hidden temp file first; its size is verified, and only then is the previous file replaced. If the public Documents folder isn't writable, CARBON falls back to app storage (`Android/data/studio.carbon.app/files/CARBON`) and tells you so. |
| **Opening** | The Welcome screen lists projects in the CARBON folder. *File → Open* uses the system picker, so any `.carbon` file or image works (Downloads, Drive, USB, and so on). |
| **Exporting** | PNG/JPEG/WebP, replay videos, brush packs and palettes are saved to `CARBON/Exports`, then the Android share sheet opens (can be turned off in *Settings → Android*). |
| **Sharing** | *File → Share Project…* sends the `.carbon` file to any app. |
| **Back button** | Closes, in order: prompts/dialogs → text entry → transform → canvas-only mode → replay → panel drawer. After that it minimises CARBON. |
| **Lifecycle** | Every open document is autosaved when the app goes to the background and restored on the next launch, even if Android kills the process. |
| **Stylus** | Pressure and tilt come from the WebView's Pointer Events (S Pen, USI pens, and others). With **automatic palm rejection** on (the default), once a pen touches the canvas, finger touches only pan, pinch-zoom or rotate. Touches that arrive during a pen stroke are ignored. |
| **Gestures** | Two-finger pan, pinch zoom and twist rotate. Two-finger tap undoes, three-finger tap redoes. |
| **Display** | Edge-to-edge with safe-area insets, a dark system bar style, and system bars hidden in canvas-only mode. The tablet UI is always used. |
| **Memory** | Canvas limit is 6144 px per side / 25 MP and the undo budget is 320 MB (desktop: 8192 px / 40 MP / 900 MB). `largeHeap` and hardware acceleration are enabled. |
| **Rotation / multi-window** | The activity handles configuration changes, so rotating or resizing never reloads the WebView or loses a stroke. |

## Build the APK

### Option A: GitHub Actions (no local Android setup)
1. Push the project to GitHub.
2. Open **Actions → CARBON Android APK → Run workflow** (it also runs on every push to `main`).
3. Download the `CARBON-android-…` artifact. It contains `CARBON-1.0.0-debug.apk`.
4. For a **signed release APK**, add these repository secrets:
   * `CARBON_KEYSTORE_BASE64`: `base64 -w0 carbon.keystore`
   * `CARBON_KEYSTORE_PASSWORD`, `CARBON_KEY_ALIAS`, `CARBON_KEY_PASSWORD`

   Pushing a tag like `v1.0.0` then attaches `CARBON-1.0.0.apk` to a GitHub release.

### Option B: local build
Requirements: **Node 22+**, **JDK 21** (`JAVA_HOME`), **Android SDK 36** (`ANDROID_HOME`, which Android Studio Otter or newer installs).

```bash
npm install
node scripts/android.mjs --apk          # → release/CARBON-1.0.0-debug.apk
node scripts/android.mjs --open         # open in Android Studio (run / profile on a device)
```

Signed release build:

```bash
keytool -genkeypair -v -keystore carbon.keystore -alias carbon -keyalg RSA -keysize 2048 -validity 10000
CARBON_KEYSTORE=carbon.keystore CARBON_KEYSTORE_PASSWORD=*** CARBON_KEY_ALIAS=carbon \
  node scripts/android.mjs --release      # → release/CARBON-1.0.0.apk (zipaligned + apksigner-signed)
```

(On Windows PowerShell: `$env:CARBON_KEYSTORE="carbon.keystore"` and so on.) Version numbers come from `CARBON_VERSION_NAME` / `CARBON_VERSION_CODE`.

`scripts/android.mjs` is idempotent. In order, it:
1. builds the web bundle;
2. runs `cap add android` the first time;
3. patches the manifest (largeHeap, hardware acceleration, legacy storage for Android 10, scoped storage permissions, config changes, adjustResize) and the version in Gradle;
4. renders launcher icons, adaptive icons and the splash screen from `assets/*.svg`;
5. runs `cap sync`;
6. runs Gradle.

### Install
Enable *Install unknown apps* for your browser or file manager, open the APK, or use `adb install release/CARBON-1.0.0-debug.apk`.

## App identity
* Application ID: `studio.carbon.app` (change it in `capacitor.config.json` **before** the first `cap add android`)
* Name: CARBON. minSdk 24 (Android 7.0), targetSdk 36.
* Icon: the CARBON mark (hexagon carbon ring + ember graphite stroke) as an adaptive icon. The splash screen shows the lockup "CARBON / Where all starts begin."

## Known limitations (Android)
* Not yet verified on physical hardware in this milestone. Stylus pressure, tilt and palm rejection depend on the device's WebView and OEM pen driver.
* On Android 11 and later, CARBON can only *list* files it created itself (scoped storage). Use *Open* for other files. Files survive uninstall only in Documents/CARBON, not in the app-storage fallback.
* Opening `.carbon` files directly from other apps (intent filters / "Open with CARBON") is not implemented yet. Use *Open* or the CARBON folder list.
* Replay video export uses the WebView's MediaRecorder (WebM). Some older WebViews do not support it, and CARBON shows an error in that case.
* Not yet packaged as an AAB for Google Play. `./gradlew bundleRelease` in `android/` produces one, but Play signing setup is out of scope.
