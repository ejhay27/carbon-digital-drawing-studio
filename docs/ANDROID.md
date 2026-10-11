# CARBON for Android (APK)

The Android build path targets the shared Carbon studio inside a native Capacitor 8 shell and keeps its separate **CARBON 1.0.0** identity. The current shared-source candidate is Carbon: Prime 7.6.0+ls; Android's own versionName/versionCode and app identity remain unchanged. Browser-local brush storage and QR image picking/decoding have not been accepted in Android's WebView. QR import scans a user-selected image and does not request camera access; Android picker behavior remains unverified. This checkout contains the Capacitor configuration and `scripts/android.mjs`; the generated `android/` Gradle project is created by that script and is not checked in here. The Android integration, APK and physical-device behavior have **not** been tested in this audit; the table below records implemented source paths, not device acceptance.

## What is Android-specific

| Area | Behaviour |
|---|---|
| **Saving** | The adapter writes projects to `Documents/CARBON/<name>.carbon` when available, otherwise app-specific storage. It stages and size-checks new bytes, keeps a rollback file for an existing project, verifies the final write, and restores the old project after a failed replacement where possible. This recovery protocol is unit-tested against a mocked filesystem; Android storage-provider behavior still needs device verification. |
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

### Current build path: local Android toolchain

This checkout has **no Android GitHub Actions workflow** in `.github/workflows/`; the Windows workflow is separate. A historical v1.0.2 Android workflow/release exists upstream, but it is not this 7.x candidate or a current workflow in this source tree. Do not expect an APK artifact or release upload from Actions here.

### Local build
Requirements: **Node 22+**, **JDK 21** (`JAVA_HOME`), **Android SDK 36** (`ANDROID_HOME`, which Android Studio Otter or newer installs).

```bash
npm ci
node scripts/android.mjs --apk          # builds/syncs android/ and writes release/CARBON-1.0.0-debug.apk
node scripts/android.mjs --open          # open the generated project in Android Studio
```

The script requires Android SDK/JDK setup even for a local debug APK. `CARBON_VERSION_NAME` and `CARBON_VERSION_CODE` can override the Android-only `1.0.0` / `1` defaults; they do not follow the Windows 7.x+ls version.

Signed release build:

```bash
keytool -genkeypair -v -keystore carbon.keystore -alias carbon -keyalg RSA -keysize 2048 -validity 10000
CARBON_KEYSTORE=carbon.keystore CARBON_KEYSTORE_PASSWORD="$YOUR_PASSWORD" CARBON_KEY_ALIAS=carbon \
  node scripts/android.mjs --release      # → release/CARBON-1.0.0.apk (signed only if signing tools/secrets are valid)
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
* `capacitor.config.json` sets application ID `studio.carbon.app` and app name `CARBON` (change the ID **before** the first `cap add android`).
* `scripts/android.mjs` defaults the Android versionName/versionCode to `1.0.0` / `1`; this identity remains separate from Carbon: Prime 7.x+ls for Windows.
* Exact minSdk/targetSdk and the generated manifest are not checked into this checkout because `android/` is created by the build script. Inspect the generated Gradle/manifest files before a release; do not infer those values from this document.
* The script generates launcher assets from the CARBON mark and splash SVG; verify the resulting APK on Android before claiming installation or runtime acceptance.

## Known limitations (Android)
* Not yet verified on physical hardware in this milestone. Stylus pressure, tilt and palm rejection depend on the device's WebView and OEM pen driver.
* On Android 11 and later, CARBON can only *list* files it created itself (scoped storage). Use *Open* for other files. Files survive uninstall only in Documents/CARBON, not in the app-storage fallback.
* Opening `.carbon` files directly from other apps (intent filters / "Open with CARBON") is not implemented yet. Use *Open* or the CARBON folder list.
* Replay video export uses only a WebView MediaRecorder codec it reports as supported; CARBON writes the returned WebM or MP4 type with the matching extension and does not transcode or relabel. Encoder support varies by WebView/device and remains unverified on physical Android hardware.
* Not yet packaged as an AAB for Google Play. `./gradlew bundleRelease` in `android/` produces one, but Play signing setup is out of scope.
