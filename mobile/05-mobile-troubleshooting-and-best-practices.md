# 05 — Troubleshooting & Best Practices

Problems you'll hit in React Native / Expo development and release, how to diagnose and fix them, the production practices that prevent them, and a final production checklist.

Part of the [Mobile Development Handbook](README.md). Previous: [04 — Build & Release](04-mobile-build-release-and-store-deployment.md).

Most entries use **Problem → Cause → Diagnose → Fix → Prevent**. Smaller issues are grouped in tables.

---

## 1. Triage first

Before changing anything, answer these:

1. **Which build?** Debug or release, local or EAS, which profile, which scheme?
2. **Which environment?** Check the About screen, the `[Config]` dev log, or `eas config --profile …` ([03 §3.4](03-mobile-environment-and-integrations.md#34-how-to-tell-which-environment-a-running-app-uses)).
3. **Which platform and device?** Simulator/emulator or physical, OS version.
4. **What changed?** `git log`, `git diff`, dependency or lockfile changes, native folder changes, env changes.
5. **Where's the real error?** Metro terminal, Xcode console, `adb logcat`, EAS build logs, backend logs.

```bash
adb logcat '*:E' ReactNativeJS:V                 # Android JS + errors
xcrun simctl spawn booted log stream --predicate 'process == "ProjectName"'   # iOS simulator
npx expo-doctor                                  # Expo dependency/config checks
eas diagnostics
```

Go from the smallest fix to the biggest: restart Metro → clear caches → reinstall node_modules → clean native → rebuild. Don't start with `prebuild --clean`.

---

## 2. Metro, dependencies and caches

### 2.1 Stale bundle or env values not updating

- **Problem:** code or `.env` changes don't show up, or old values persist.
- **Cause:** Metro and Babel cache transformed files, and env values are inlined at bundle time.
- **Diagnose:** log `config.apiUrl` host in dev; check which `ENVFILE` the script used.
- **Fix:** `pnpm start:dev -c` (or `npx expo start -c`). For native values (Square ID, Maps key), **rebuild the app**.
- **Prevent:** restart Metro with `-c` after every env change, and use the env-specific scripts.

### 2.2 "Unable to resolve module"

- **Cause:** missing dependency, wrong import path or case (macOS is case-insensitive, Linux CI isn't), pnpm not hoisting a package native tooling needs.
- **Fix:** `pnpm install`; check import case; check `.npmrc` `public-hoist-pattern` ([01 §6.1](01-mobile-project-setup.md#61-pnpm-and-react-native)); `pnpm start -c`.
- **Prevent:** CI `expo export --platform ios|android` catches resolution errors before an EAS build does.

### 2.3 Broken node_modules / lockfile drift

```bash
rm -rf node_modules
pnpm install --frozen-lockfile        # fails if package.json and lockfile disagree
pnpm patch:check                      # patches still apply?
npx expo install --check              # versions compatible with the Expo SDK?
```

- Never mix package managers. A stray `package-lock.json` or `yarn.lock` means someone did. Delete it and reinstall with pnpm.
- `postinstall` patch failures mean an upstream version changed. Regenerate the patch or remove it if the fix landed upstream.

### 2.4 Port 8081 in use / app can't connect to Metro

| Symptom | Fix |
| --- | --- |
| `Port 8081 already in use` | `lsof -i :8081` → kill the process, or `expo start --port 8082` |
| Physical Android device can't reach Metro | `adb reverse tcp:8081 tcp:8081` |
| Physical iPhone can't reach Metro | Same Wi-Fi; disable VPN; check the Mac firewall; or `expo start --tunnel` |
| Dev client shows "No development servers found" | Enter the URL manually: `http://<mac-ip>:8081` |

---

## 3. Android and Gradle

### 3.1 Gradle / AGP / Kotlin / JDK mismatch

- **Problem:** `Unsupported class file major version`, `Kotlin metadata version mismatch`, `This version of AGP requires Gradle x`, `Could not resolve com.android.tools.build:gradle`.
- **Cause:** the toolchain set (JDK, Gradle wrapper, AGP, Kotlin, compileSdk) doesn't match, often after a native SDK upgrade or a new JDK on the machine.
- **Diagnose:**

```bash
java -version && echo $JAVA_HOME
cd android && ./gradlew --version
grep -n "gradle:\|kotlinVersion\|compileSdk" build.gradle
```

- **Fix:** use **JDK 17** (`export JAVA_HOME=$(/usr/libexec/java_home -v 17)`; Android Studio → Settings → Gradle → Gradle JDK = 17). Align AGP ↔ Gradle using the official compatibility table. Keep Kotlin at the version the native SDKs need (project example: `2.2.21` for Square).
- **Prevent:** document the versions ([04 §4.1](04-mobile-build-release-and-store-deployment.md#41-identity-and-sdk-levels)). Upgrade the set together on a branch, never one piece at a time.

### 3.2 Android build fails after adding or upgrading a native library

- **Cause:** library requires a higher `minSdk` / `compileSdk`, has a duplicate class or resource, or isn't compatible with your RN version or architecture.
- **Diagnose:** `cd android && ./gradlew assembleDebug --stacktrace --info`. Read the **first** error, not the last.
- **Fix:**
  - `minSdk` / `compileSdk` errors: raise them in `gradle.properties` / `build.gradle` (or `expo-build-properties`).
  - `Duplicate class …`: two libraries bundle the same dependency. Exclude one, or align versions.
  - `More than one file was found with OS independent path`: `packagingOptions { resources { excludes += [...] } }` (project example excludes `META-INF/versions/9/OSGI-INF/MANIFEST.MF`).
  - Kotlin compile warnings treated as errors: the project example sets `allWarningsAsErrors = false` for subprojects. Fix the warnings where you can.
- **Prevent:** check a library's RN/Expo compatibility and its native requirements **before** installing. Install with `pnpm expo install`.

### 3.3 Clean builds

```bash
pnpm android:clean                                   # ./gradlew clean
rm -rf android/app/build android/build android/.gradle
rm -rf ~/.gradle/caches/                             # last resort; slow re-download
```

### 3.4 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (signature mismatch)

- **Cause:** a build signed with a different key (debug vs release vs Play) is already installed with the same application ID.
- **Fix:** `adb uninstall YOUR_PACKAGE_NAME`, then install. Note that this deletes app data.
- **Prevent:** a different application ID per environment, so dev, trial and store builds can coexist ([03 §3.2](03-mobile-environment-and-integrations.md#32-recommended-separate-identity-per-environment)).

### 3.5 Emulator and device installation issues

| Symptom | Fix |
| --- | --- |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | Release builds limited to `arm64-v8a` (project example). Use an arm64 emulator or a physical device |
| `adb devices` empty / `unauthorized` | Re-plug, accept the RSA prompt; `adb kill-server && adb start-server` |
| Emulator very slow / won't boot | Cold boot from Device Manager; wipe data; enough RAM; Apple Silicon → arm64 images |
| `SDK location not found` | `ANDROID_HOME` set, or `android/local.properties` with `sdk.dir=/Users/you/Library/Android/sdk` |
| Out of memory during build | `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m` in `gradle.properties` (project example) |

---

## 4. iOS, CocoaPods, Xcode and signing

### 4.1 CocoaPods failures

- **Problem:** `pod install` fails, `CocoaPods could not find compatible versions`, `Unable to find a specification`.
- **Cause:** stale spec repo, deployment target lower than a pod requires (Square pod requires iOS 16), or a Podfile.lock out of sync after a JS dependency change.
- **Fix:**

```bash
pnpm pods                         # cd ios && pod install
cd ios && pod install --repo-update && cd ..
pnpm pods:clean                   # deintegrate + reinstall (removes Pods and Podfile.lock)
```

  Set `ios.deploymentTarget` in `Podfile.properties.json` (or `expo-build-properties`) to at least what every pod needs.
- **Prevent:** run `pod install` after any dependency change with native code. Commit the Podfile changes.

### 4.2 Xcode build errors

| Error | Fix |
| --- | --- |
| `No such module` / `'React/RCTBridge.h' not found` | Open `.xcworkspace`, not `.xcodeproj`; `pnpm pods` |
| Errors after Xcode upgrade | Clean build folder (⇧⌘K); `rm -rf ~/Library/Developer/Xcode/DerivedData/ProjectName-*`; `pnpm pods:clean` |
| `Command PhaseScriptExecution failed` | Expand the log in the Report navigator. Usually a Node path issue (`ios/.xcode.env.local` → `export NODE_BINARY=$(command -v node)`) or a bundling error |
| `Sandbox: rsync deny` / `bash: Operation not permitted` | Build setting `ENABLE_USER_SCRIPT_SANDBOXING = NO` for the app target |
| Missing dSYM warnings on upload | `DEBUG_INFORMATION_FORMAT = dwarf-with-dsym` for Release (the project example's Podfile `post_install` sets this, and generates a missing dSYM for one binary SDK) |

### 4.3 Signing, provisioning and certificates

- **Problem:** `No profiles for 'YOUR_BUNDLE_ID' were found`, `Provisioning profile doesn't include the aps-environment entitlement`, `Signing certificate is invalid`.
- **Cause:** wrong team, bundle ID not registered, capability added without regenerating profiles, expired or revoked certificate.
- **Diagnose:** Xcode → target → **Signing & Capabilities** shows the exact problem; `eas credentials -p ios` shows what EAS holds.
- **Fix:** select the correct team; enable "Automatically manage signing"; add the capability in the Apple Developer portal; regenerate profiles (`eas credentials` → remove profile → rebuild).
- **Prevent:** one owner for Apple credentials; let EAS manage distribution credentials; record certificate expiry dates.

### 4.4 Wrong environment in an Xcode archive

See [03 §3.1](03-mobile-environment-and-integrations.md#31-ios-schemes-project-example). The scheme pre-action needs "Provide build settings from" set to the app target, or `.env` isn't updated. Verify with `cmp .env .env.production`.

---

## 5. EAS build failures

| Symptom | Cause / fix |
| --- | --- |
| Fails at "Install dependencies" | Lockfile out of sync → `pnpm install` locally, commit `pnpm-lock.yaml`; pnpm version → `packageManager` field |
| Fails at "Prebuild" | Config plugin error in `app.config.js`; reproduce with `npx expo prebuild --no-install` in a throwaway copy |
| Works locally, fails on EAS | Files ignored by `.gitignore`/`.easignore` that the build needs; different Node version (pin `node` in `eas.json`); env var only in your local `.env` |
| Env values empty in the build | Variable not in the profile's EAS environment (`eas env:list --environment preview`); `secret` vs `sensitive` doesn't affect builds, only `env:pull` |
| `appVersionSource remote` errors | Initialise with `eas build:version:set` |
| Credentials errors | `eas credentials` → validate or regenerate; Apple account access for the EAS user |

Always read the full log of the **first failing phase** on expo.dev. Run `eas build --local` to reproduce on your machine.

---

## 6. Environment and configuration

### 6.1 Environment variable missing

- **Problem:** feature silently disabled (payments "not configured", blank map), API calls to `undefined/api/...`.
- **Cause:** variable absent from `.env` / EAS environment, renamed in code but not in EAS, or Metro cache.
- **Diagnose:** the dev warning `[Config] Missing env values: …` (names only); `eas env:list --environment <env>`; Android Gradle prints a warning when `SQUARE_APPLICATION_ID` is unset (project example).
- **Fix:** add it to the right environment; `eas env:pull`; `pnpm start:dev -c`; rebuild if it's a native value.
- **Prevent:** `.env.example` lists every variable; a preflight script validates names (project example `scripts/dev-ios.sh` checks required vars without printing values).

### 6.2 Wrong API URL / wrong environment

- **Problem:** dev build shows production data (or the reverse), logins fail with "user not found".
- **Cause:** wrong `ENVFILE`, stale `.env` copied by a scheme, preview profile pointing at the wrong EAS environment, local release build with dev values.
- **Diagnose:** About screen / `[Config]` log → API host; `cmp .env .env.development`; `eas config --profile …`.
- **Fix:** use the env-specific script, clear the cache, rebuild.
- **Prevent:** distinct app names and icons per environment, an environment banner, a release-checklist step ([04 §7](04-mobile-build-release-and-store-deployment.md#7-release-checklist)).

---

## 7. Network, API and authentication

### 7.1 Local backend unreachable

| Client | Use |
| --- | --- |
| iOS Simulator | `http://localhost:PORT` |
| Android Emulator | `http://10.0.2.2:PORT`, or `adb reverse tcp:PORT tcp:PORT` + `localhost` |
| Physical device | `http://<mac-lan-ip>:PORT` (same Wi-Fi), or a tunnel |

Plain `http://` is blocked by default: iOS ATS and Android cleartext policy (API 28+). For local development only, allow it in debug builds. Never ship cleartext exceptions in release.

### 7.2 API timeouts

- **Cause:** slow endpoint, large payload, poor cellular, server cold start. The project example's client timeout is 15 s.
- **Diagnose:** the `[API ERROR]` dev log shows method, URL, status and code (`ECONNABORTED`); compare with backend logs.
- **Fix:** paginate and slim responses; raise the timeout per request for uploads (`{ timeout: 60000 }`), not globally; let React Query retry idempotent GETs with backoff.
- **Prevent:** server-side performance budgets; test on a throttled network (Network Link Conditioner / emulator network settings).

### 7.3 "Offline" errors while online

- **Cause:** NetInfo briefly reports offline on Android (cell handoff, Doze). Aggressive `refetchOnReconnect` then floods the API.
- **Fix:** project example approach: cache NetInfo state, re-check with `NetInfo.fetch()` before failing a request; `refetchOnReconnect: false` globally, opt in per query ([02 §3.2](02-mobile-architecture-and-development.md#32-domain-modules--react-query)).

### 7.4 Authentication issues

| Symptom | Cause / fix |
| --- | --- |
| First requests after login return 401 | Auth header set in a parent effect, after children already fetched → set it before children mount ([02 §6.1](02-mobile-architecture-and-development.md#61-auth-gated-navigator)) |
| Random logouts | Backend returns 401 for non-auth errors, or token expiry too short → check codes; add refresh tokens |
| Logout loop / multiple logout animations | Concurrent 401s each trigger logout → single-flight `performLogout` |
| Wrong password logs the user "out" | Login endpoint excluded from the auth-expired interceptor |
| Previous user's data visible after re-login | `queryClient.clear()` and store reset on logout |
| Token survives uninstall on iOS | Keychain items persist across reinstalls → clear secure storage on the first launch after install |

---

## 8. Maps and location

### 8.1 Map is blank or grey

- **Cause:** missing or invalid key, Maps SDK for the platform not enabled, billing not enabled, key restriction doesn't match the package + SHA-1 (or the bundle ID).
- **Diagnose:** Android `adb logcat | grep -i "google\|maps"` → `Authorization failure` with the package and SHA-1 Google saw. iOS Xcode console → `Google Maps SDK for iOS … API key`. Google Cloud Console → APIs → Metrics → errors per API.
- **Fix:** add the SHA-1 shown in the log to the key restriction; enable the API; enable billing; rebuild (the key is native).
- **Prevent:** keep the debug, upload **and Play app-signing** SHA-1s in the restriction from day one ([03 §4.3](03-mobile-environment-and-integrations.md#43-key-restrictions-and-environment-keys)).

> Classic case: **maps work in debug but are blank from the Play Store.** Play re-signs the app with the app-signing key. Add that SHA-1 from Play Console → App integrity.

### 8.2 Map crashes

| Crash | Fix |
| --- | --- |
| iOS crash on map mount with `PROVIDER_GOOGLE` | `GMSServices provideAPIKey` not called before render, or Google Maps pod not installed |
| Android `API key not found` crash | `com.google.android.geo.API_KEY` meta-data missing or placeholder empty at build time |
| Crash/jank with many custom markers | `tracksViewChanges={false}`; memoise markers; cluster |
| Directions `REQUEST_DENIED` | Directions API not enabled, or key restricted to apps (web-service APIs can't use app restrictions) → proxy through the backend |

### 8.3 Location permission issues

- **Problem:** location never granted, or works only while the app is open.
- **Cause:** missing `Info.plist` strings or manifest permissions; background requested before foreground; Android 11+ requires Settings for "Allow all the time"; background task not defined at module scope; Android 12+ foreground-service start from background blocked.
- **Diagnose:** `Location.getForegroundPermissionsAsync()` / `getBackgroundPermissionsAsync()`; `TaskManager.isTaskRegisteredAsync(TASK)`; logcat for `ForegroundServiceStartNotAllowedException`.
- **Fix:** foreground → explain → background; `Linking.openSettings()` for denied or blocked; start tracking while in the foreground ([03 §4.6](03-mobile-environment-and-integrations.md#46-background-location)).
- **Prevent:** test the deny, "only this time" and "while using" paths on both platforms.

---

## 9. Square payments

| Problem | Cause | Fix / prevent |
| --- | --- | --- |
| App crashes on launch (iOS) after adding the SDK | SDK accessed before native initialisation | Initialise in `AppDelegate` before React Native starts ([03 §5.4](03-mobile-environment-and-integrations.md#54-sdk-initialisation-native-before-react-native-starts)) |
| "Payments not configured" | `SQUARE_APPLICATION_ID` empty at **native** build time | Set it in the EAS env / `.env`, rebuild (not just Metro) |
| Android build: "SQUARE_APPLICATION_ID has an invalid format" | Quotes or stray characters in the value | Value must match `[A-Za-z0-9_-]+` |
| "Build doesn't match the connected Square environment" | Sandbox app ID with production backend, or the reverse | Align app env, backend `SQUARE_ENVIRONMENT` and IDs ([03 §5.8](03-mobile-environment-and-integrations.md#58-environment-separation)) |
| `authorize()` never resolves | Native SDK has no timeout; network stall | Wrap with a timeout (20 s) and show a retryable error |
| Previous company's merchant charged | Device still authorised to the old account | `deauthorize()` on logout, reconnect, company switch; check the location before reusing the session |
| `LOCATION_NOT_ACTIVATED_FOR_CARD_PROCESSING` | Merchant location not activated (account verification incomplete) | Merchant completes activation in the Square Dashboard |
| `UNSUPPORTED_COUNTRY` | Merchant country or currency not supported by the SDK | Check Square's supported countries; currency must match the merchant |
| `DEVICE_TIME_DOES_NOT_MATCH_SERVER_TIME` | Device clock wrong | Ask the user to enable automatic date and time |
| OAuth: "redirect_uri mismatch" | Callback URL in the Square dashboard differs from the backend's | Register the exact backend callback per environment |
| OAuth returns but the app shows "disconnected" | Deep link not registered / handler not mounted; user closed the browser | Register the scheme; also refetch on `AppState → active` |
| `409` from `/square/session` | Merchant revoked access or the token couldn't refresh | Show "Reconnect Square"; admin reconnects |
| Payment succeeded in Square but not recorded | App killed before backend verification, or verification mismatch | Reconcile from webhooks or by `paymentId`; check the amount/currency/location logs |
| Reader not found (Android) | Bluetooth/location permissions denied (API 31+ needs `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT`) | Request all reader permissions before `showSettings()` |
| Build fails after an SDK upgrade | New minSdk / compileSdk / Kotlin / AGP / iOS target | Read the SDK release notes; upgrade the toolchain set ([04 §4.1](04-mobile-build-release-and-store-deployment.md#41-identity-and-sdk-levels)) |

---

## 10. Push notifications

| Problem | Cause | Fix |
| --- | --- | --- |
| No token on simulator | Push tokens need a physical device (iOS Simulator push works only for local tests) | Test on a device |
| No token on Android | Missing or mismatched `google-services.json` for the package; no Play Services (emulator without Google APIs) | Correct Firebase config; Google Play emulator image |
| iOS: token received but no delivery | `aps-environment` mismatch (dev token sent to production APNs or the reverse); missing APNs key | Match entitlement and gateway; upload the `.p8` |
| Android 13+: nothing shown | `POST_NOTIFICATIONS` not granted, or no channel | Request permission; create the channel |
| Delivered but tap does nothing | No response listener / cold-start handling | `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync` ([03 §6.6](03-mobile-environment-and-integrations.md#66-foreground-background-tap-handling)) |
| Users get other users' notifications | Token not removed on logout / not reassigned | Delete on logout; upsert by `deviceId` |
| Works in dev, fails in production | Backend not storing tokens per environment, or production Firebase/APNs credentials missing | Check `appEnv` on device rows and production credentials |

---

## 11. Sockets and realtime

| Problem | Cause | Fix |
| --- | --- | --- |
| Never connects on Android dev builds | Network inspector breaks the WebSocket upgrade with websocket-only transport | `transports: ['websocket', 'polling']`, `tryAllTransports: true` |
| Connects, but no events after reconnect | Rooms not re-joined | Join rooms in the `connect` handler |
| Events handled twice | Listener registered per mount without cleanup; duplicate REST + socket path | `off` in cleanup; subscriber list in a service; idempotent handlers |
| Events missing after background | iOS suspended the socket | Refetch on foreground; push for critical events |
| `connect_error: xhr poll error` / timeout | Wrong `BASE_URL`, TLS issue, proxy/load balancer not configured for WebSockets | Check the URL and host; enable WS upgrade and sticky sessions on the load balancer |
| Works with one server, flaky with several | No Redis adapter / sticky sessions | Socket.IO Redis adapter + sticky sessions |
| Users see other companies' events | Rooms joined from client-supplied IDs | Authenticate the handshake; the server assigns rooms ([03 §7.3](03-mobile-environment-and-integrations.md#73-authentication)) |

---

## 12. Crashes, devices and platform-specific issues

### 12.1 Release-only crashes

- **Problem:** works in debug, crashes on launch or on a screen in TestFlight / Play.
- **Cause:** missing env value at build time (native SDK init with an empty key), code depending on `__DEV__`-only setup, Hermes/minification differences, a ProGuard/R8 rule stripping a native class, a different signing key (maps/Firebase).
- **Diagnose:**
  - iOS: Xcode → **Window → Organizer → Crashes**; device logs via Console.app; symbolicate with dSYMs.
  - Android: `adb logcat` with a release APK installed; Play Console → **Android vitals → Crashes**.
  - JS fatal errors: the project example's crash logger stores the last fatal JS error and shows it on the next launch.
- **Fix:** reproduce with a **local release build on a device** (`./gradlew assembleRelease` / Release scheme). Add keep rules to `proguard-rules.pro` for reflected classes.
- **Prevent:** a crash reporter with source maps and dSYMs; smoke-test every release build before upload.

### 12.2 iOS-only issues

| Issue | Fix |
| --- | --- |
| Permission prompt never appears again | iOS asks once → `Linking.openSettings()` |
| Keyboard covers inputs | `KeyboardAvoidingView behavior="padding"` |
| Content under the notch / home indicator | `useSafeAreaInsets()` |
| App killed in background during long tasks | Background modes are limited; use push / background fetch, not timers |

### 12.3 Android-only issues

| Issue | Fix |
| --- | --- |
| Hardware back exits the flow | `BackHandler` / navigation `beforeRemove` |
| Notification or location service killed | Battery optimisation (OEM-specific); a foreground service with a visible notification |
| `ForegroundServiceStartNotAllowedException` | Start foreground services only while in the foreground (Android 12+) |
| Text cut off | Font scaling / `includeFontPadding: false`; test with large fonts |
| Status / navigation bar colors wrong | `androidStatusBar` / `androidNavigationBar` config, `expo-navigation-bar` |

---

## 13. Production best practices

### Security and secrets

- Nothing private in the app bundle. Every runtime value can be extracted ([03 §1.2](03-mobile-environment-and-integrations.md#12-variables-one-name-a-value-per-environment)). Proxy third-party APIs and webhooks through the backend.
- Tokens in Keychain/Keystore (`expo-secure-store`), not AsyncStorage.
- Restrict every API key (package + SHA-1 / bundle ID, API allow-list, quotas).
- HTTPS only; no cleartext exceptions in release.
- Authenticate sockets; authorise every endpoint server-side.
- gitleaks in pre-commit and CI; rotate anything that leaks.

### Logging and monitoring

- `__DEV__`-guarded verbose logs; production strips `console.log`.
- Never log tokens, personal data, card data or env values.
- Add a crash reporter (Sentry / Firebase Crashlytics) with source maps and dSYMs uploaded from CI. The project example only has a local last-crash logger.
- Track key business metrics after release: login success, payment success, push delivery, socket connection rate.

### Dependencies

- Pin exact versions for native-heavy packages (payments, maps, camera). Use `~` ranges for Expo packages via `expo install`.
- Upgrade Expo SDK one major at a time, on a branch, with a full device test.
- Weekly dependency audit (`pnpm audit`, CI audit job). Document any ignored CVEs with a reason and a review date (the project example ignores two in `pnpm.auditConfig`).
- Track patches in `patches/` and remove them when upstream fixes land.

### Testing

- At minimum: unit tests for pure logic (money parsing, error mapping, permission decisions) and a manual critical-path test plan per release. The project example has no automated test script, so add one before the codebase grows.
- Test on the oldest supported OS version and a low-end Android device.

### Release management, backups and rollback

- Release branches and tags; changelog; staged rollouts ([04 §9](04-mobile-build-release-and-store-deployment.md#9-rollback-and-hotfixes)).
- Back up keystores, `.p8` keys and EAS credentials to a team secret manager with at least two owners.
- Backend changes backwards-compatible with the last two app versions; minimum-version gate.

### Code review and Git

- Small PRs; CI must pass; native changes and env changes called out explicitly in the PR description.
- Never commit `.env*`, credentials or debug-only toggles.
- Update docs in the same PR as the behaviour change.

### Environment isolation

- Separate backends, Square apps/modes, Firebase projects or keys, and ideally bundle IDs per environment ([03 §1](03-mobile-environment-and-integrations.md#1-environment-management)).
- Restrict who can edit production EAS variables and store listings.

### Performance, accessibility and privacy

- Profile on low-end Android in release mode; watch JS FPS and memory on list and map screens.
- Accessibility labels, large text, contrast, 44 pt touch targets.
- Collect only the data you need; keep App Privacy and Data Safety forms accurate; request permissions in context; honour revocation; provide account deletion if users can create accounts (both stores require it).

---

## 14. Mobile production checklist

Use before **every** store release (the detailed version is in [04 §7](04-mobile-build-release-and-store-deployment.md#7-release-checklist)).

**Configuration**

- [ ] Production EAS profile → `production` environment; all variables present
- [ ] Production API host, production Square app ID, restricted production map keys
- [ ] Correct bundle ID / application ID / app name / icon
- [ ] Push: production APNs entitlement + credentials, FCM config for the package
- [ ] No secrets, webhooks or private API keys in the bundle

**Quality**

- [ ] Lint, typecheck, bundle export and tests pass in CI
- [ ] No unguarded `console.log`; no sensitive logging
- [ ] All user-facing strings translated
- [ ] Loading, empty, error and offline states on every data screen

**Functionality (production build, physical iOS + Android)**

- [ ] Install → login → core flows → logout → login as another user
- [ ] Maps, location (foreground/background), permissions deny path
- [ ] Payments: success, decline, cancel, reconnect
- [ ] Push: foreground, background, killed, tap routing
- [ ] Realtime: events, reconnect after network loss
- [ ] Large text, dark mode, tablet layout (if supported)

**Store and compliance**

- [ ] Version bumped; build number increased
- [ ] Privacy policy, App Privacy / Data Safety, permission declarations up to date
- [ ] Review notes + demo account
- [ ] Target API level meets the current Play requirement; Xcode/SDK meets the current App Store requirement

**After release**

- [ ] Staged/phased rollout
- [ ] Crash-free rate, ANRs, payment success, backend errors monitored for 72 h
- [ ] Git tag + release notes published
