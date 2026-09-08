# React Native / Expo iOS Setup on macOS

A start-to-finish guide for running an existing React Native / Expo project on iOS from a Mac — simulator or physical iPhone.

Don't upgrade Xcode, Node, Expo, React Native, or CocoaPods to "latest" while following this guide. Use the versions the project already specifies — changing them is a common source of build errors.

---

## 1. What you're installing

```text
Xcode → Command Line Tools → CocoaPods → NVM/Node → Project dependencies
```

iOS setup is simpler than Android's — no separate SDK/emulator manager. Xcode provides the Simulator, compiler, and signing tools in one install. This assumes you've already done Homebrew, Git, GitHub SSH, and NVM/Node from the [Android setup guide](01-react-native-android-setup-on-macos.md) — skip to step 5 if so.

---

## 2. Install Xcode

Install **Xcode** from the Mac App Store (not just the Command Line Tools — you need the full app for the Simulator and iOS SDK).

Open it once after installing, so it can finish its first-time setup, then accept the license:

```bash
sudo xcodebuild -license accept
```

Confirm:

```bash
xcodebuild -version
```

---

## 3. Install the Command Line Tools

```bash
xcode-select --install
```

If already installed, it will tell you so — that's fine. Confirm the active path points to Xcode:

```bash
xcode-select -p
```

You should see something like `/Applications/Xcode.app/Contents/Developer`. If it points to `/Library/Developer/CommandLineTools` instead, set it explicitly:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

---

## 4. Install CocoaPods

CocoaPods manages the native iOS dependencies under `ios/Pods`.

```bash
brew install cocoapods
pod --version
```

If the project has a `Gemfile` specifying a particular CocoaPods/Ruby version, use `bundle` instead:

```bash
bundle install
bundle exec pod --version
```

---

## 5. Clone the project and install dependencies

Same as Android — skip if you already have the project checked out.

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone git@github.com:USERNAME/REPOSITORY.git
cd REPOSITORY
nvm use
npm install   # or: yarn install — match the lockfile that's present
```

---

## 6. Install native iOS dependencies

Only needed for a native/prebuilt project (one with an `ios/` folder using native modules) — a plain managed Expo project skips this.

```bash
cd ios
pod install
cd ..
```

Re-run `pod install` any time native dependencies change (e.g. after `npm install` adds a package with native code).

---

## 7. Configure environment variables

```bash
ls -la
cp .env.example .env   # if an example file exists
nano .env
```

Fill in the API URL and any other required values, e.g.:

```env
API_URL=http://localhost:5000
```

---

## 8. Know the localhost difference from Android

Good news for iOS: the **Simulator shares your Mac's network stack**, so `http://localhost:5000` works from the Simulator exactly as it does in a browser. No special IP or port-forwarding needed.

A **physical iPhone** is different — same rule as Android. It cannot reach your Mac's `localhost`; use your Mac's LAN IP instead, with both devices on the same Wi-Fi network:

```bash
ipconfig getifaddr en0
```

Use the result (e.g. `http://192.168.1.100:5000`) in `.env` when testing on a real device.

---

## 9. Run on the iOS Simulator

```bash
# Expo
npx expo start
# press "i" in the Expo terminal, or:
npx expo run:ios

# React Native CLI
npx react-native run-ios
```

Use `npx expo start` for a managed Expo project, `npx expo run:ios` if the project has a native `ios/` folder, and `npx react-native run-ios` for a plain React Native CLI project.

The first run opens Simulator and boots a default device. To pick a specific device/OS version:

```bash
xcrun simctl list devices
npx expo run:ios --device "iPhone 15 Pro"
```

---

## 10. Run on a physical iPhone

You need an Apple ID signed into Xcode, plus the phone trusted for development.

1. Connect the iPhone via USB (or same-network Wi-Fi debugging, enabled later in Xcode).
2. Open the project's workspace in Xcode: `open ios/*.xcworkspace`
3. In Xcode: **Settings → Accounts** → add your Apple ID.
4. Select the project target → **Signing & Capabilities** → choose your Apple ID under **Team**.
5. On the phone: trust the Mac if prompted, and enable **Settings → Privacy & Security → Developer Mode** (restart required on first enable).
6. Select your iPhone as the run destination in Xcode's device dropdown, then press **Run** — or from the terminal:

```bash
npx expo run:ios --device
# or
npx react-native run-ios --device "Your iPhone Name"
```

The free Apple ID tier re-signs the app every 7 days — if the app stops opening on the phone, rebuild it the same way.

---

## 11. Run the backend alongside the app

If the app depends on a local API, run it in a second terminal:

```bash
cd ~/Projects/YOUR_BACKEND
npm install
npm run dev
curl http://localhost:5000
```

Typical setup: one terminal running the backend, one running `npx expo start`.

---

## 12. Troubleshooting

| Problem | Fix |
| --- | --- |
| Build fails after adding a native dependency | `cd ios && pod install && cd ..`, then rebuild |
| Pods out of sync / weird native errors | `cd ios && pod deintegrate && pod install && cd ..` |
| Dependencies seem broken | `rm -rf node_modules && npm install` |
| Stale Expo/Metro cache | `npx expo start -c` |
| Simulator not found / stuck | `xcrun simctl list devices`, or `xcrun simctl erase all` to reset all simulators |
| "No such module" / signing errors | Open `ios/*.xcworkspace` (not `.xcodeproj`) in Xcode and check Signing & Capabilities |
| Not sure which command to run | `cat package.json` and check the `scripts` section |

---

## 13. Daily workflow (after setup is done)

```bash
cd ~/Projects/YOUR_PROJECT
git pull
npm install          # only if package.json changed
cd ios && pod install && cd ..   # only if native deps changed
npm run dev          # in the backend folder, if the app needs it
npx expo start       # then press "i", or use npx expo run:ios
```
