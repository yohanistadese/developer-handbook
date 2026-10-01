# 04 — Build, Release & Store Deployment

The path from a local build to the App Store and Google Play: local builds, EAS, Android and iOS specifics, versioning, and a reusable release checklist.

Part of the [Mobile Development Handbook](README.md). Previous: [03 — Environments & Integrations](03-mobile-environment-and-integrations.md). Next: [05 — Troubleshooting & Best Practices](05-mobile-troubleshooting-and-best-practices.md).

---

## 1. The release path

```text
local dev build ──► preview/trial build (internal) ──► production build ──► TestFlight / Play internal testing ──► store review ──► staged rollout ──► monitor
   (dev env)              (trial env)                     (prod env)
```

| Build type | JS bundle | Debuggable | Env | Who installs |
| --- | --- | --- | --- | --- |
| Development build (dev client) | Loaded from Metro | Yes | development | Developers |
| Debug build (`expo run:*`) | Metro | Yes | whatever `.env`/`ENVFILE` says | Developers |
| Release build, local | Embedded, minified | No | whatever `.env` says ⚠️ | Developer smoke tests |
| Preview (EAS) | Embedded | No | `preview` EAS env | QA / internal testers |
| Production (EAS) | Embedded | No | `production` EAS env | Store |

> ⚠️ **Local release builds use whatever env file is active.** That's the most common way a development API ends up in a "production" build. Use **EAS production builds** for anything that goes to a store.

---

## 2. Local builds

### 2.1 Development and debug builds

```bash
pnpm ios:dev                         # iOS debug, dev scheme, .env.development
pnpm android                         # Android debug (reads .env)
pnpm ios -- --device                 # iOS on a connected iPhone
pnpm android -- --device             # Android on a specific device
```

A **development build** replaces Expo Go for projects with native modules. Build it once, then iterate on JS only:

```bash
eas build --profile development --platform ios       # or android
pnpm start:dev                                       # app connects to Metro
```

Rebuild the dev client only after native changes ([01 §4](01-mobile-project-setup.md#4-expo-workflows-managed-prebuild-and-native-folders)).

### 2.2 Android release: APK and AAB

```bash
cd android
./gradlew assembleRelease      # APK → app/build/outputs/apk/release/   (sideload, QA)
./gradlew bundleRelease        # AAB → app/build/outputs/bundle/release/ (Play Store)
cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

| | APK | AAB |
| --- | --- | --- |
| Install directly | Yes | No (needs bundletool or Play) |
| Play Store upload | No (for new apps) | **Required** |
| Size per device | Larger (all ABIs/resources) | Play generates optimised APKs per device |
| EAS profile (project example) | `preview` (`buildType: apk`) | `production` (`buildType: app-bundle`) |

> **Project example:** `release` keeps only `arm64-v8a` (`ndk { abiFilters "arm64-v8a" }`). Release APKs won't install on x86 emulators. Use an arm64 emulator image or a physical device.

### 2.3 iOS release: archive

1. Select the **production scheme** (`ProjectNameProduction`) and **Any iOS Device (arm64)**.
2. **Product → Clean Build Folder** (⇧⌘K).
3. **Product → Archive**. Then confirm the env: `cmp .env .env.production && echo "PROD env used"` ([03 §3.1](03-mobile-environment-and-integrations.md#31-ios-schemes-project-example)).
4. **Organizer → Distribute App → App Store Connect → Upload** (or *TestFlight Internal Only*).

CLI equivalent:

```bash
xcodebuild -workspace ios/ProjectName.xcworkspace -scheme ProjectNameProduction \
  -configuration Release -archivePath build/ProjectName.xcarchive archive
```

Always open the **`.xcworkspace`**, not `.xcodeproj` (CocoaPods).

### 2.4 Physical device testing

- iOS: a Release build on device needs a provisioning profile that includes the device UDID (ad-hoc or development), or TestFlight. EAS `preview` with `distribution: internal` registers devices (`eas device:create`).
- Android: `adb install -r` the APK. If a build with a different signature is installed, uninstall it first ([05 §3](05-mobile-troubleshooting-and-best-practices.md#3-android-and-gradle)).

---

## 3. EAS

### 3.1 CLI basics

```bash
npm install -g eas-cli         # eas.json "cli.version": ">= 20.0.0"
eas login && eas whoami
eas init                       # links the project (writes extra.eas.projectId)
eas build --profile production --platform all
eas build:list
eas submit --platform ios --latest
eas credentials                # view/manage keystores, certificates, push keys
eas diagnostics                # environment info for bug reports
```

### 3.2 `eas.json` (project example)

```json
{
  "cli": { "version": ">= 20.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "environment": "development" },
    "preview":     { "distribution": "internal", "environment": "preview", "android": { "buildType": "apk" } },
    "production":  { "autoIncrement": true, "environment": "production", "android": { "buildType": "app-bundle" } }
  },
  "submit": { "production": {} }
}
```

| Key | Effect |
| --- | --- |
| `environment` | Which EAS environment's variables the build gets ([03 §1.6](03-mobile-environment-and-integrations.md#16-eas-environment-variables)) |
| `developmentClient` | Includes `expo-dev-client` (dev menu, Metro loading) |
| `distribution: internal` | Ad-hoc / direct install links, not for stores |
| `appVersionSource: remote` | EAS stores the **build number / versionCode**. Native values in `Info.plist` / `build.gradle` are overwritten on EAS builds |
| `autoIncrement` | EAS bumps the build number / versionCode on each production build |

Useful additions:

- `"channel"` per profile if you adopt EAS Update (not used in the project example).
- `"node": "22.x"` and `"image"` per profile to pin the build image.
- `submit.production.ios.ascAppId` and `android.track: "internal"` for non-interactive submits.

### 3.3 Credentials

Let EAS manage credentials unless you have a reason not to:

| Platform | What | Managed by |
| --- | --- | --- |
| Android | Upload keystore (`.jks`) + alias + passwords | `eas credentials` (generated on the first build; **download a backup**) |
| Android | App signing key | Google Play App Signing (recommended) |
| iOS | Distribution certificate (`.p12`) | EAS (needs Apple Developer access) |
| iOS | Provisioning profiles (ad-hoc, App Store) | EAS, regenerated when devices or capabilities change |
| iOS | APNs key (`.p8`) | EAS / Firebase, for push |
| iOS | App Store Connect API key | EAS submit, for non-interactive uploads |

If you lose the Android upload key you can request a reset through Play App Signing. Without Play App Signing, a lost key means you can never update the app. Back up keystores to the team's secret manager.

---

## 4. Android

### 4.1 Identity and SDK levels

**Project example** (`android/build.gradle`, `android/app/build.gradle`):

| Setting | Value | Notes |
| --- | --- | --- |
| `applicationId` / `namespace` | `YOUR_PACKAGE_NAME` | Permanent after the first Play release |
| `minSdkVersion` | `28` | Raised from the RN default for the Square SDK |
| `compileSdkVersion` | `36` | Required by the Square SDK |
| `targetSdkVersion` | `34` | **Check Play's current target-API requirement before each release.** Play raises it every year, and it may already require a higher value than this |
| `buildToolsVersion` | `36.0.0` | |
| NDK | `26.1.10909125` | |
| AGP | `8.9.1` | "Must be ≥ 8.9.1" for the Square SDK |
| Gradle wrapper | `8.13` | `android/gradle/wrapper/gradle-wrapper.properties` |
| Kotlin | `2.2.21` | |
| JDK | 17 | |
| Hermes | enabled | `hermesEnabled=true` |
| New architecture | disabled | `newArchEnabled=false` |

Override these through `gradle.properties` (`android.minSdkVersion=…`) or `expo-build-properties` in CNG projects. Avoid editing them in several places.

**Compatibility rule:** AGP ↔ Gradle ↔ Kotlin ↔ JDK ↔ compileSdk are coupled. Upgrade them **together**, on a branch, following the AGP compatibility table. One native library needing a newer one (here: Square) forces the whole set to move.

### 4.2 Versioning

- `versionName` = user-facing (`1.4.0`). `versionCode` = an integer that **must increase** with every Play upload.
- With `appVersionSource: remote`, EAS owns `versionCode`. The value in `build.gradle` (project example: `1`) only matters for local builds. Never upload a local build after EAS builds, or the versionCode will be lower.

### 4.3 Signing

```groovy
// android/app/build.gradle — release signing from env / gradle.properties, never hardcoded
signingConfigs {
  release {
    storeFile file(System.getenv("UPLOAD_STORE_FILE") ?: "upload.keystore")
    storePassword System.getenv("UPLOAD_STORE_PASSWORD")
    keyAlias System.getenv("UPLOAD_KEY_ALIAS")
    keyPassword System.getenv("UPLOAD_KEY_PASSWORD")
  }
}
buildTypes { release { signingConfig signingConfigs.release } }
```

> ⚠️ **Project example:** the `release` build type is signed with the **debug keystore**. That's fine for sideloaded QA APKs, but Play rejects debug-signed bundles, and the signature won't match store installs. EAS replaces signing with its managed keystore on EAS builds. Configure a real release signing config before shipping local builds anywhere.

Generate an upload key (once, store it safely):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Add every signing certificate's **SHA-1** (debug, upload, Play app signing) to Google Maps key restrictions and Firebase ([03 §4.3](03-mobile-environment-and-integrations.md#43-key-restrictions-and-environment-keys)).

### 4.4 Play Console release

1. Create the app (name, default language, app/game, free/paid). Enrol in **Play App Signing**.
2. Complete **App content**: privacy policy URL, data safety form, ads, content rating, target audience, and **permissions declarations** (background location and foreground service types need justification, plus a video for background location).
3. **Internal testing** track: upload the AAB (`eas submit -p android` or manual), add testers by email list, install from the opt-in link. This is the fastest track, with no full review.
4. **Closed testing**: a wider group. New personal developer accounts must run a closed test with a minimum number of testers for a minimum period before production access. Check Play's current requirement.
5. **Production**: promote the tested release, write release notes, and use a **staged rollout** (for example 10% → 50% → 100%).
6. Monitor **Android vitals** (crashes, ANRs) before increasing the rollout.

---

## 5. iOS

### 5.1 Identity and settings

| Setting | Where | Project example |
| --- | --- | --- |
| Bundle ID | `PRODUCT_BUNDLE_IDENTIFIER` (Xcode) / `ios.bundleIdentifier` | `YOUR_BUNDLE_ID` |
| Team | `DEVELOPMENT_TEAM` / `ios.appleTeamId` | — |
| Deployment target | Xcode target + `Podfile` (`ios.deploymentTarget` in `Podfile.properties.json`) | Podfile `16.0`; the Square pod requires `16` |
| Version | `MARKETING_VERSION` / `CFBundleShortVersionString` | user-facing `1.4.0` |
| Build number | `CURRENT_PROJECT_VERSION` / `CFBundleVersion` | must increase per upload for the same version |
| Signing | Automatic (`CODE_SIGN_STYLE = Automatic`) | — |

> ⚠️ **Keep identity in one place.** The project example had a bundle ID in `app.config.js` that differed from the Xcode project, a deployment target of `18.6` on the app target vs `16.0` in the Podfile, and different version strings in `app.config.js`, `Info.plist` and `MARKETING_VERSION`. In a prebuilt project, **the Xcode project is what ships**. Either keep `app.config.js` in sync or treat the native values as the source of truth and document that. A deployment target set higher than needed silently drops support for older iPhones.

### 5.2 Apple accounts, certificates and profiles

- **Apple Developer Program** membership (paid) is required for TestFlight and the App Store. A free Apple ID can only run on your own device for 7 days.
- **App ID** with capabilities: Push Notifications, Associated Domains (universal links), Background Modes (location, remote notifications), and any others you use.
- **Certificates:** Apple Development (local device runs), Apple Distribution (App Store / ad-hoc).
- **Provisioning profiles:** Development, Ad Hoc (registered devices), App Store.
- Automatic signing (Xcode) or EAS-managed credentials handle all of the above. Use manual signing only when CI requires it.

### 5.3 Capabilities, entitlements and Info.plist

- Push: the `aps-environment` entitlement must match the profile. **Development** for debug, **production** for TestFlight/App Store. The project example's committed entitlements file says `development`. Automatic/EAS signing sets the correct value for distribution, but manual signing doesn't.
- Background modes (project example): `fetch`, `location`, `remote-notification`. Declare only what you use. App Review asks about background location.
- Usage descriptions for every permission (camera, photos, location when-in-use/always, microphone, Face ID). They must state the real purpose.
- **Privacy manifest** (`PrivacyInfo.xcprivacy`): required for apps and SDKs that use "required reason" APIs. Keep it in the target and update it when SDKs change. The project example includes one.
- `ITSAppUsesNonExemptEncryption = NO` in `Info.plist` if you only use standard HTTPS. This skips the export-compliance question on every upload.

### 5.4 TestFlight and App Store

1. App Store Connect → **My Apps → +** (bundle ID, SKU, name).
2. Upload: `eas build -p ios --profile production` → `eas submit -p ios --latest`, or Xcode Organizer.
3. **TestFlight:** processing takes about 5–30 min. **Internal testers** (team members, up to 100) get it immediately. **External testers** need a short beta review.
4. Fill in App Information, pricing, **App Privacy** (data collection), screenshots for the required device sizes, description, keywords, support URL, privacy policy URL.
5. If login is required, provide a **demo account** in the review notes. If the app takes payments, explain the payment flow. Physical goods and services use your own processor (for example Square), not in-app purchase.
6. Submit for review → choose manual or automatic release, optionally a **phased release** over 7 days.

---

## 6. Versioning policy

- Semantic versioning for the marketing version: `MAJOR.MINOR.PATCH`.
- Build numbers / versionCodes only increase. Let EAS own them (`appVersionSource: remote` + `autoIncrement`).
- Set the user-facing version in **one** place and bump it at the start of the release branch. With remote versioning: `eas build:version:set` / `eas build:version:get`.
- Show `version (build)` on the About screen, and attach it to crash reports and support messages.
- Tag Git: `git tag v1.4.0 && git push origin v1.4.0` after submission. Keep release notes in the repo (the project example keeps an in-app changelog).

---

## 7. Release checklist

Copy this into the release PR or ticket.

**Prepare**

- [ ] Release branch `release/x.y.z` from `main`; CI green (lint, typecheck, bundle export)
- [ ] Marketing version bumped; build number handled by EAS
- [ ] Changelog / release notes written

**Verify configuration**

- [ ] `eas config --profile production --platform ios|android` → `"environment": "production"`
- [ ] `eas env:list --environment production` contains **every** required variable (names only)
- [ ] `BASE_URL` is the production API host
- [ ] `SQUARE_APPLICATION_ID` is the production ID (doesn't start with `sandbox-`); backend `SQUARE_ENVIRONMENT=production`
- [ ] Bundle ID / application ID / app name are the production values
- [ ] Google Maps keys restricted to the production package + **Play app-signing SHA-1** and the bundle ID
- [ ] Push: production APNs entitlement; FCM config matches the package; backend sends to production
- [ ] No dev-only code paths (Reactotron, mock reader, debug menus) reachable in release

**Test (on the production build, physical devices, iOS and Android)**

- [ ] Fresh install → login → logout → login as a different user (no leaked data)
- [ ] Auth expiry → automatic logout
- [ ] Critical business flows end to end
- [ ] Maps render; current location; routes
- [ ] Payment: connect status, a real low-value payment and refund (or a production test merchant), cancel, decline
- [ ] Push: received in foreground, background and killed; tap opens the right screen
- [ ] Realtime: events arrive; reconnect after airplane mode
- [ ] Permissions: deny → Settings path works
- [ ] Offline banner; slow network; app resume from background
- [ ] Device logs (Xcode console / `adb logcat`) show no errors or sensitive data

**Ship**

- [ ] Build: `eas build --profile production --platform all`
- [ ] Install the exact build (TestFlight / Play internal) and smoke test it
- [ ] Submit: `eas submit --platform ios|android --latest`
- [ ] TestFlight / internal testing sign-off
- [ ] Store submission with review notes and demo account
- [ ] Phased / staged rollout started
- [ ] Git tag pushed

**After release**

- [ ] Crash-free rate, ANRs, store reviews, backend error rate watched for 24–72 h
- [ ] Payment success rate and push delivery checked
- [ ] Rollout increased only when metrics are healthy

---

## 8. Avoiding a dev build or dev config in production

| Risk | Guardrail |
| --- | --- |
| Local release build with dev `.env` | Only EAS `production` builds go to stores; local release builds are for smoke tests |
| Xcode scheme pre-action fails silently | "Provide build settings from" set; `cmp .env .env.production` after archiving ([03 §3.1](03-mobile-environment-and-integrations.md#31-ios-schemes-project-example)) |
| `preview` profile missing variables | `eas env:list --environment preview` in the checklist |
| Sandbox payment ID in production | Release-time assertion + backend application-ID match check ([03 §5.8](03-mobile-environment-and-integrations.md#58-environment-separation)) |
| Dev client uploaded | `developmentClient: true` only in the `development` profile; App Store builds can't include the dev menu |
| Same bundle ID for all envs | Separate IDs and names per environment ([03 §3.2](03-mobile-environment-and-integrations.md#32-recommended-separate-identity-per-environment)) |
| Anyone can edit production env | Restrict EAS production environment and store-console access |

---

## 9. Rollback and hotfixes

- Stores **can't roll back** a binary. You can halt a staged/phased rollout and ship a new build with a higher version/build number.
- Hotfix flow: branch `hotfix/x.y.z+1` from the release tag → fix → full checklist (shortened tests for unaffected areas) → expedited review if needed (App Store "Request Expedited Review").
- Keep backend changes **backwards-compatible** with the previous app version. Users update slowly. Use API versioning and a server-driven **minimum supported version** check that prompts users to update.
- Optional: EAS Update (OTA JS updates) can ship JS-only fixes without review. The project example doesn't use it. If you adopt it, use per-environment channels and `runtimeVersion` policies so an OTA update never reaches an incompatible binary.
