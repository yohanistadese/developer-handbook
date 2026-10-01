# 01 — Mobile Project Setup

How to set up a Mac for React Native / Expo development, create or clone a project, and get it running on iOS and Android, simulator or physical device.

Part of the [Mobile Development Handbook](README.md). Next: [02 — Architecture & Development](02-mobile-architecture-and-development.md).

> **Project example vs. general recommendation.** The handbook is based on a real production app (called `ProjectName` here). Where a version or setting comes from that app, it's labelled **Project example**. Copy the approach, and check your own project's files for the actual versions.

---

## 1. Purpose of this handbook

A reusable reference for building, configuring, releasing and maintaining React Native / Expo apps. Each guide covers one stage of the lifecycle:

| Guide | Use it when |
| --- | --- |
| 01 Setup (this file) | Setting up a machine or starting a project |
| [02 Architecture](02-mobile-architecture-and-development.md) | Writing features |
| [03 Environments & Integrations](03-mobile-environment-and-integrations.md) | Configuring dev/trial/prod, maps, payments, push, sockets |
| [04 Build & Release](04-mobile-build-release-and-store-deployment.md) | Building and shipping to the stores |
| [05 Troubleshooting](05-mobile-troubleshooting-and-best-practices.md) | Something is broken, or before a release |

---

## 2. Technology stack

**Project example** (verified from `package.json`, `android/`, `ios/`):

| Layer | Choice | Version |
| --- | --- | --- |
| Framework | Expo SDK + React Native | Expo `51`, RN `0.74.5`, React `18.2.0` |
| Language | TypeScript (`strict: true`) | `5.3` |
| JS engine / architecture | Hermes, **old architecture** (`newArchEnabled: false`) | — |
| Package manager | pnpm (pinned via `packageManager`) | `10.x` |
| Navigation | React Navigation (stack + bottom tabs) | `7.x` |
| Server state | TanStack React Query | `5.x` |
| Client state | Redux Toolkit + redux-persist | `2.x` / `6.x` |
| HTTP | Axios | `1.x` |
| Realtime | socket.io-client | `4.8` |
| Env config | `react-native-config` + `app.config.js` `extra` + EAS environments | — |
| Maps | `react-native-maps` (+ `react-native-maps-directions`) | `1.14.0` |
| Payments | Square Mobile Payments SDK (`mobile-payments-sdk-react-native`) | native SDK `2.6.x` |
| Push | `expo-notifications` (native FCM/APNs tokens) | `0.28` |
| Location | `expo-location` + `expo-task-manager` (background) | `17.x` |
| i18n | i18next + react-i18next | — |
| Build/CI | EAS Build, GitHub Actions, husky + lint-staged, gitleaks | — |

**General recommendation:** pick the newest Expo SDK that every native dependency you need supports, and upgrade one SDK at a time. Payment, maps and camera SDKs are usually what holds an upgrade back.

---

## 3. Required tools

### 3.1 Version reference

| Tool | Project example | Notes |
| --- | --- | --- |
| macOS | Required for iOS | Android works on any OS |
| Node.js | `22` (CI uses Node 22) | Use an LTS. Pin it with `.nvmrc` (the project example doesn't, see §11) |
| pnpm | `10.x` | Enable with Corepack, below |
| Xcode | Version that supports your iOS deployment target | Full App Store install, not just CLT |
| CocoaPods | Current stable | `brew install cocoapods` |
| JDK | **17** (React Native Gradle plugin uses a JDK 17 toolchain) | Temurin 17 |
| Android Studio | Current stable | SDK, emulator, platform-tools |
| Android SDK | compileSdk `36`, targetSdk `34`, minSdk `28`, build-tools `36.0.0`, NDK `26.1.10909125` | Read from `android/build.gradle` |
| Gradle / AGP / Kotlin | Gradle `8.13`, AGP `8.9.1`, Kotlin `2.2.21` | Set by the project, never install separately |
| EAS CLI | `>= 20.0.0` (from `eas.json`) | Global install |
| Git | Any recent | SSH access to GitHub |

> ⚠️ Don't upgrade Node, Xcode, Gradle, Kotlin or the SDK to "latest" just because it's available. Use the versions the project specifies. Upgrading the toolchain without the project is the most common cause of build failures ([05 §3](05-mobile-troubleshooting-and-best-practices.md#3-android-and-gradle)).

### 3.2 Base tools (Homebrew, Git, SSH)

```bash
# Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Git
brew install git
git config --global user.name "Your Name"
git config --global user.email "you@example.com"

# GitHub SSH key
ssh-keygen -t ed25519 -C "you@example.com"
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub   # paste into GitHub → Settings → SSH and GPG keys
ssh -T git@github.com
```

### 3.3 Node.js and pnpm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc
nvm install 22 && nvm alias default 22

corepack enable            # provides the pnpm version pinned in package.json "packageManager"
pnpm -v
```

### 3.4 iOS: Xcode, Command Line Tools, CocoaPods

```bash
# Install Xcode from the App Store and open it once, then:
sudo xcodebuild -license accept
xcode-select --install
xcode-select -p   # must print /Applications/Xcode.app/Contents/Developer
# if not:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

brew install cocoapods
pod --version
```

If the project has a `Gemfile`, use `bundle install` and `bundle exec pod install` so everyone runs the same CocoaPods version.

### 3.5 Android: JDK, Android Studio, SDK

```bash
brew install --cask temurin@17
```

Add to `~/.zshrc`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

```bash
source ~/.zshrc
java -version && echo $ANDROID_HOME && adb version
```

In Android Studio → **SDK Manager**, install the SDK Platform matching `compileSdkVersion`, Build-Tools, Platform-Tools, the Emulator, and the NDK version in `android/build.gradle`.

### 3.6 EAS CLI

```bash
npm install -g eas-cli   # global CLI only; project dependencies always use pnpm
eas login
eas whoami
```

### 3.7 Verify the toolchain

```bash
git --version; node -v; pnpm -v; java -version; echo $JAVA_HOME
xcodebuild -version; pod --version; adb version; eas --version
```

---

## 4. Expo workflows: managed, prebuild, and native folders

Read this before changing any native setting.

| Workflow | `ios/` and `android/` in Git? | Where native config lives | Typical commands |
| --- | --- | --- | --- |
| **Managed** (Expo Go) | No | `app.json` / `app.config.js` only | `expo start` (Expo Go) |
| **Managed + CNG** (Continuous Native Generation) | No, generated on demand | `app.config.js` + config plugins | `expo prebuild`, `expo run:*`, `eas build` |
| **Prebuilt / bare** (committed native folders) | **Yes** | Native files, plus `app.config.js` for JS-side values | `expo run:*`, Xcode, Gradle, `eas build` |

**Project example:** the native folders are committed and hand-edited. For example:

- `AppDelegate.mm` initialises the Square SDK before React Native starts, and passes the Google Maps key to the Maps SDK.
- `MainApplication.kt` initialises the Square SDK on Android.
- `android/app/build.gradle` reads `SQUARE_APPLICATION_ID` / `GOOGLE_MAPS_API_KEY` from the environment or `.env`.
- `android/build.gradle` raises minSdk, compileSdk and Kotlin for the Square SDK.
- Custom Xcode schemes (`ProjectNameDevelopment`, `ProjectNameProduction`) choose the env file.

> ⚠️ **In a project with committed native folders, `expo prebuild --clean` overwrites hand-written native changes.** Only run it if you're moving those changes into config plugins, then review the whole native diff before committing.

**When you need native configuration:**

- Adding a library with native code (camera, maps, payments, BLE, background tasks)
- Changing permissions, `Info.plist` keys, entitlements or capabilities
- Changing the bundle ID / application ID, app name, icons, URL schemes
- SDK initialisation that has to run before JS starts
- Signing, schemes, build variants

**When you don't:** JS/TS changes, screens, styles, API calls, translations. Those only need Metro.

After any native change, rebuild the app (`expo run:ios|android` or a new EAS build). Hot reload doesn't pick it up.

**Expo Go vs. development build:** apps with custom native modules (Square, VisionCamera, maps with keys) can't run in Expo Go. Use a **development build** (`expo-dev-client`, or `expo run:*`). See [04 §2](04-mobile-build-release-and-store-deployment.md#2-local-builds).

---

## 5. Creating a new project

```bash
pnpm create expo-app ProjectName --template blank-typescript
cd ProjectName
pnpm expo install expo-dev-client
```

Then:

1. Rename `app.json` to `app.config.js` so config can read environment values ([03 §2](03-mobile-environment-and-integrations.md#2-how-configuration-flows-into-the-app)).
2. Set `name`, `slug`, `scheme`, `ios.bundleIdentifier` (`YOUR_BUNDLE_ID`) and `android.package` (`YOUR_PACKAGE_NAME`). These are hard to change after the first store release.
3. `eas init` (links an EAS project ID) and `eas build:configure` (creates `eas.json`).
4. Add lint, format, Git hooks and secret scanning (§8).
5. Add `.env.example` and make sure `.gitignore` covers `.env*` ([03 §1.5](03-mobile-environment-and-integrations.md#15-what-must-never-be-committed)).

Install Expo-compatible versions of native libraries with `pnpm expo install <pkg>`, not plain `pnpm add`. It picks the version that matches your SDK.

---

## 6. Cloning and running an existing project

```bash
git clone git@github.com:YOUR_ORG/ProjectName-mobile.git
cd ProjectName-mobile
nvm use                       # if .nvmrc exists
pnpm install                  # runs postinstall (e.g. patch-package)

# Environment (see guide 03)
eas env:pull --environment development --path .env.development
cp .env.development .env      # or let the iOS scheme / ENVFILE pick it

# iOS native deps (committed ios/ folder)
pnpm pods                     # = cd ios && pod install
```

Run it:

```bash
# Project example scripts
pnpm start:dev                # Metro with ENVFILE=.env.development
pnpm ios:dev                  # expo run:ios --scheme ProjectNameDevelopment
pnpm android                  # expo run:android (reads .env)
```

> **Rule:** use one package manager only. If the lockfile is `pnpm-lock.yaml`, never run `npm install` or `yarn`. That creates a second lockfile and resolves different dependency versions.

### 6.1 pnpm and React Native

React Native's native build tooling expects packages at the top level of `node_modules`. **Project example** `.npmrc`:

```ini
public-hoist-pattern[]=*react-native*
public-hoist-pattern[]=@react-native/*
public-hoist-pattern[]=@babel/*
public-hoist-pattern[]=@expo/*
public-hoist-pattern[]=expo-*
public-hoist-pattern[]=expo
```

Without this, Gradle or CocoaPods can fail with "module not found" for packages that are installed. (`node-linker=hoisted` is the heavier alternative.)

### 6.2 Patched dependencies

The project example uses `patch-package` (`"postinstall": "patch-package"`) for upstream fixes it needs, such as Gradle plugin, Kotlin and JDK compatibility patches. Rules:

- Keep patches in `patches/` and commit them.
- Run `pnpm patch:check` (`patch-package --check`) after upgrading a dependency. A patch that no longer applies fails the install.
- Remove the patch once upstream ships the fix.

---

## 7. Simulators, emulators and physical devices

### iOS Simulator

```bash
xcrun simctl list devices
pnpm ios -- --device "iPhone 16"
```

The Simulator shares the Mac's network, so `http://localhost:PORT` reaches a local backend.

### Android Emulator

Create a device in **Android Studio → Device Manager**. Use a Google Play system image if you need Google Maps or FCM.

```bash
emulator -list-avds
adb devices
```

The emulator reaches the Mac at `http://10.0.2.2:PORT`. Alternatively, run `adb reverse tcp:PORT tcp:PORT` and use `localhost`.

### Physical devices

| | iOS | Android |
| --- | --- | --- |
| Enable | Settings → Privacy & Security → **Developer Mode** (restart) | Settings → About → tap **Build number** 7×, then **USB debugging** |
| Trust | "Trust this computer" | Accept the RSA fingerprint prompt (`adb devices` must say `device`, not `unauthorized`) |
| Signing | Xcode → target → Signing & Capabilities → Team | Debug keystore, automatic |
| Run | `pnpm ios -- --device` | `pnpm android` with the device connected |

A physical device **can't** reach `localhost` on your Mac. Use the Mac's LAN IP (`ipconfig getifaddr en0`) on the same Wi-Fi, or `adb reverse` on Android. Push notifications, Bluetooth card readers and real GPS need a physical device.

---

## 8. Project conventions

### 8.1 Folder structure

The full structure and what goes in each folder is in [02 §1](02-mobile-architecture-and-development.md#1-folder-structure). Top level:

```text
ProjectName-mobile/
├── android/  ios/            # native projects (committed in prebuilt workflow)
├── assets/                   # images, fonts, icons
├── patches/                  # patch-package patches
├── plugins/                  # local Expo config plugins
├── scripts/                  # dev/CI helper scripts
├── src/                      # application code (see guide 02)
├── App.tsx  index.ts         # root component and entry (background tasks registered here)
├── app.config.js             # Expo config (reads env)
├── eas.json                  # EAS build profiles
├── .env.example              # placeholders only, the only committed env file
└── package.json  pnpm-lock.yaml  tsconfig.json  babel.config.js  eslint.config.mjs
```

### 8.2 Naming conventions

| Item | Convention | Example |
| --- | --- | --- |
| Screens | `PascalCase` folder + `index.tsx` | `screens/CreateOrder/index.tsx` |
| Components | `PascalCase.tsx` | `components/ui/ErrorBoundary.tsx` |
| Hooks | `useCamelCase.ts` | `hooks/useSocket.ts` |
| Services | `camelCaseService.ts` | `services/paymentService.ts` |
| API modules | per domain folder | `api/orders/index.ts`, `api/orders/useOrdersQuery.ts` |
| Translation keys | `section.key` | `error.timeout`, `common.cancel` |
| Socket events | `domain:action[:detail]` | `order:created`, `driver:location:update` |
| Env vars | `UPPER_SNAKE_CASE`, same name in every environment | `BASE_URL` |
| Branches | `type/short-description` | `feature/order-filters` |

### 8.3 Scripts

Keep the common tasks as `package.json` scripts so nobody has to remember flags. **Project example** set:

```json
{
  "start": "expo start",
  "start:dev": "ENVFILE=.env.development expo start",
  "start:prod": "ENVFILE=.env.production expo start",
  "ios": "expo run:ios",
  "ios:dev": "ENVFILE=.env.development expo run:ios --scheme ProjectNameDevelopment",
  "ios:prod": "ENVFILE=.env.production expo run:ios --scheme ProjectNameProduction",
  "android": "expo run:android",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "pods": "cd ios && pod install && cd ..",
  "pods:clean": "cd ios && rm -rf Pods Podfile.lock && pod deintegrate && pod install && cd ..",
  "android:clean": "cd android && ./gradlew clean && cd ..",
  "android:release": "cd android && ./gradlew assembleRelease",
  "build:android:preview": "eas build --profile preview --platform android",
  "build:ios:production": "eas build --profile production --platform ios",
  "eas:env:list:dev": "eas env:list --environment development",
  "security:gitleaks": "gitleaks git --verbose --redact --no-banner --exit-code 1",
  "postinstall": "patch-package"
}
```

Add a `typecheck` script (`tsc --noEmit`) if CI doesn't already run one.

### 8.4 TypeScript, linting and formatting

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true, "moduleResolution": "bundler" },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- **ESLint** (flat config `eslint.config.mjs`) with `typescript-eslint` and `eslint-plugin-react-hooks`. The hooks rules catch most stale-closure and effect-dependency bugs.
- **Prettier** (project example `.prettierrc.json`):

```json
{ "singleQuote": true, "semi": true, "trailingComma": "es5", "printWidth": 100, "tabWidth": 2, "endOfLine": "lf" }
```

- **Pre-commit** (husky + lint-staged): format staged files, and run a secret / suspicious-code scan. The project example runs `gitleaks` plus a signature-scan script.
- **CI** (project example): lint and type-check on every PR, plus `expo export --platform android` / `--platform ios` to catch broken imports and assets that lint can't see. A weekly job scans for secrets and audits dependencies.

### 8.5 Git workflow

- `main` is always releasable. Use short-lived branches and pull requests, and require CI to pass before merging.
- Branch names: `feature/…`, `fix/…`, `improve/…`, `chore/…`, `release/x.y.z`, `hotfix/…`.
- Commits: short imperative summaries. Conventional Commits (`feat:`, `fix:`, `chore:`) are recommended if you generate changelogs.
- Never commit `.env*` (except `.env.example`), keystores, `.p8` / `.p12` / `.mobileprovision`, or `google-services.json` with production keys if the repo is shared widely ([03 §1.5](03-mobile-environment-and-integrations.md#15-what-must-never-be-committed)).
- Commit native changes (`ios/`, `android/`) in their own reviewed commits.
- Tag releases: `git tag v1.2.0` after each store submission.

### 8.6 README and documentation expectations

A project README should contain, at minimum:

1. What the app is and who uses it
2. Exact tool versions (Node, pnpm, Xcode, JDK) and the workflow type (managed or prebuilt)
3. Setup commands that actually work (copy-paste tested)
4. Environment variable **names** and where to get the values (never the values themselves)
5. How to run each environment, and how to tell which one is active
6. How to build and release, or a link to the release doc
7. Known gotchas (patches, pinned versions, why a native file was edited)

Update the README in the same PR as the change it describes. Outdated docs (wrong package manager, removed services, old variable names) cause more lost time than missing docs.

---

## 9. Daily workflow

```bash
git pull
pnpm install                         # if package.json / lockfile changed
pnpm pods                            # if native iOS deps changed
pnpm start:dev                       # terminal 1: Metro (dev env)
pnpm ios:dev   # or: pnpm android    # terminal 2, only after native changes; otherwise reload
```

After changing an env file, restart Metro with a cleared cache: `pnpm start:dev -c`.

---

## 10. Initial project checklist

- [ ] Node version pinned (`.nvmrc` or `engines`), `packageManager` set, single lockfile committed
- [ ] `name`, `slug`, `scheme`, `YOUR_BUNDLE_ID`, `YOUR_PACKAGE_NAME` final
- [ ] `app.config.js` reads env; `.env.example` lists every variable with placeholders
- [ ] `.gitignore` covers `.env*`, keystores, certificates, `ios/Pods`, build outputs
- [ ] EAS project linked; `eas.json` has `development`, `preview`, `production` profiles, each with its own `environment`
- [ ] Development, trial and production values created in EAS ([03](03-mobile-environment-and-integrations.md))
- [ ] TypeScript strict, ESLint, Prettier, husky pre-commit, gitleaks
- [ ] CI: lint, typecheck, bundle export
- [ ] Error boundary, API client and i18n set up before the first feature ([02](02-mobile-architecture-and-development.md))
- [ ] Permission strings written for every permission you request
- [ ] App runs on an iOS Simulator, an Android Emulator and one physical device of each platform
- [ ] README documents setup, environments and release

---

## 11. Gaps found in the project example

These are worth avoiding in a new project:

- No `.nvmrc`, so the Node version is only implied by CI. **Fix:** commit `.nvmrc`.
- The README still documented `npm` and a service the code no longer used. **Fix:** update docs in the same PR as the change.
- A helper script described itself as `pnpm dev:ios`, but no such script existed in `package.json`. **Fix:** register every helper script you document.
