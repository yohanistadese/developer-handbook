# React Native / Expo Android Setup on macOS

A start-to-finish guide for setting up an existing React Native / Expo project to run on Android from a Mac — emulator or physical device.

Don't upgrade Node, Expo, React Native, Gradle, or the Android SDK to "latest" while following this guide. Use the versions the project already specifies — changing them is a common source of build errors.

---

## 1. What you're installing

```text
Homebrew → Git → NVM/Node → Java JDK → Android Studio (SDK + Emulator + ADB)
```

Once installed, you run the project against either an Android Emulator or a physical phone connected by USB.

---

## 2. Install Homebrew

```bash
brew --version
```

If that fails:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the instructions it prints (it will tell you to add Homebrew to your PATH), then confirm:

```bash
brew --version
```

---

## 3. Install and configure Git

```bash
brew install git
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

---

## 4. Set up GitHub SSH access

```bash
ls -la ~/.ssh
```

If you don't already have a key:

```bash
ssh-keygen -t ed25519 -C "your-github-email@example.com"
eval "$(ssh-agent -s)"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519
pbcopy < ~/.ssh/id_ed25519.pub
```

Add the copied key at **GitHub → Settings → SSH and GPG keys → New SSH key**, then test:

```bash
ssh -T git@github.com
```

---

## 5. Install Node.js via NVM

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc
```

Use the Node version the project expects — check `.nvmrc` or `package.json` after cloning it (step 8). Until then, Node 20 LTS is a safe default:

```bash
nvm install 20
nvm alias default 20
node -v
```

---

## 6. Install the Java JDK

Most current React Native/Expo Android builds need JDK 17:

```bash
brew install --cask temurin@17
java -version
```

Set `JAVA_HOME` in `~/.zshrc`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

```bash
source ~/.zshrc
echo $JAVA_HOME
```

---

## 7. Install Android Studio and the SDK

Download and install Android Studio: https://developer.android.com/studio

Open it, then go to **More Actions → SDK Manager** and make sure these are installed:

* Android SDK Platform
* Android SDK Build-Tools
* Android SDK Platform-Tools
* Android Emulator

Match the Android API level to what the project requires — check `android/build.gradle` and `android/gradle.properties` before changing versions.

---

## 8. Configure Android environment variables

On Apple Silicon, the SDK normally installs to `$HOME/Library/Android/sdk`. Add to `~/.zshrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

```bash
source ~/.zshrc
echo $ANDROID_HOME
adb version
```

---

## 9. Verify the whole toolchain

Every one of these should return a version, not an error:

```bash
brew --version
git --version
node -v
npm -v
java -version
echo $JAVA_HOME
echo $ANDROID_HOME
adb version
ssh -T git@github.com
```

---

## 10. Clone the project

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone git@github.com:USERNAME/REPOSITORY.git
cd REPOSITORY
```

Check for a required Node version:

```bash
cat .nvmrc 2>/dev/null
nvm use
node -v
```

---

## 11. Install dependencies

Use whichever lockfile the project has — never mix package managers:

```bash
# if package-lock.json exists
npm install

# if yarn.lock exists
yarn install
```

---

## 12. Configure environment variables

```bash
ls -la
```

If an example file exists:

```bash
cp .env.example .env
nano .env
```

Fill in the API URL and any other required values, e.g.:

```env
API_URL=http://192.168.1.100:5000
```

---

## 13. Know the localhost gotcha

If your backend runs on your Mac at `http://localhost:5000`, a **physical Android phone cannot reach `localhost`** — that resolves to the phone itself. Use your Mac's LAN IP instead:

```bash
ipconfig getifaddr en0
```

Use the result (e.g. `http://192.168.1.100:5000`) in the app's `.env`, and make sure the Mac and phone are on the same Wi-Fi network.

The Android **Emulator** is different: it can reach your Mac via `http://10.0.2.2:5000`.

---

## 14. Run on the Android Emulator

In Android Studio, go to **Device Manager** and create a virtual device (e.g. Pixel, a recent Android API level). Start it, then confirm it's connected:

```bash
adb devices
```

Then start the project:

```bash
# Expo
npx expo start
# press "a" in the Expo terminal, or:
npx expo run:android

# React Native CLI
npx react-native run-android
```

Use `npx expo start` for a managed Expo project, `npx expo run:android` if the project has a native `android` folder, and `npx react-native run-android` for a plain React Native CLI project — check for an `android/` directory and `app.json`/`react-native.config.js` to tell them apart.

---

## 15. Run on a physical Android phone

On the phone: **Settings → About phone**, tap **Build number** 7 times to enable Developer Options, then **Settings → Developer options → USB debugging** (enable it).

Connect via USB, then:

```bash
adb devices
```

Accept the "Allow USB debugging?" prompt on the phone, then confirm the device shows as `device` (not `unauthorized`):

```bash
adb devices
```

Run the project the same way as step 14 (`npx expo start`, `npx expo run:android`, or `npx react-native run-android`).

If the phone can't reach the Metro bundler or your local backend over Wi-Fi, forward the ports over USB instead:

```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:5000 tcp:5000
```

---

## 16. Run the backend alongside the app

If the app depends on a local API, run it in a second terminal:

```bash
cd ~/Projects/YOUR_BACKEND
npm install
npm run dev
curl http://localhost:5000
```

Typical setup: one terminal running the backend, one running `npx expo start`.

---

## 17. Troubleshooting

| Problem | Fix |
| --- | --- |
| Android build fails | `cd android && ./gradlew clean && cd ..`, then rebuild |
| Dependencies seem broken | `rm -rf node_modules && npm install` |
| Stale Expo/Metro cache | `npx expo start -c` |
| Device not showing up | `adb kill-server && adb start-server && adb devices` |
| Wrong Java version | `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` |
| Not sure which command to run | `cat package.json` and check the `scripts` section |

---

## 18. Daily workflow (after setup is done)

```bash
cd ~/Projects/YOUR_PROJECT
git pull
npm install          # only if package.json changed
npm run dev          # in the backend folder, if the app needs it
npx expo start       # then press "a", or use npx expo run:android
```
