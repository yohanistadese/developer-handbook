# 03 — Environments & Integrations

How to keep development, trial and production separate, and how to integrate Google Maps and location, Square payments, push notifications, sockets, and other third-party services safely.

Part of the [Mobile Development Handbook](README.md). Previous: [02 — Architecture](02-mobile-architecture-and-development.md). Next: [04 — Build & Release](04-mobile-build-release-and-store-deployment.md).

---

## 1. Environment management

### 1.1 The three environments

| | **ProjectName Dev** | **ProjectName Trial** | **ProjectName** (Production) |
| --- | --- | --- | --- |
| Purpose | Daily development, debugging | QA, demos, stakeholder testing, pre-release checks | Real customers |
| Backend | `https://dev-api.YOUR_DOMAIN` | `https://trial-api.YOUR_DOMAIN` | `https://api.YOUR_DOMAIN` |
| Data | Disposable test data | Realistic, non-customer data | Real data |
| Payments | Square **sandbox** | Square **sandbox** (or prod with a test merchant) | Square **production** |
| EAS environment | `development` | `preview` | `production` |
| EAS build profile | `development` (dev client) | `preview` (internal) | `production` (store) |
| iOS scheme | `ProjectNameDevelopment` | `ProjectNameTrial` | `ProjectNameProduction` |
| Bundle ID / App ID | `YOUR_BUNDLE_ID.dev` | `YOUR_BUNDLE_ID.trial` | `YOUR_BUNDLE_ID` |
| App name on device | ProjectName Dev | ProjectName Trial | ProjectName |
| Distribution | Simulator / internal | Internal, TestFlight, Play internal testing | App Store / Play production |

> **Project example:** it has development and production values plus a `preview` profile, two iOS schemes, and **one bundle ID shared by every environment**. That works, but dev and prod builds then can't be installed side by side, and it's easy to mix them up on a device. For a new project, use a separate ID and name per environment (§3.2).

### 1.2 Variables: one name, a value per environment

Use the **same variable name** in every environment. Only the value changes. Don't use `BASE_URL_DEV` / `BASE_URL_PROD` names that code has to choose between. **Project example** set (names only):

| Variable | Purpose | Visibility |
| --- | --- | --- |
| `BASE_URL` | REST API **and** socket URL | public (plaintext) |
| `SQUARE_APPLICATION_ID` | Square app ID (`sandbox-…` in dev/trial) | public, but per-environment |
| `GOOGLE_MAPS_API_KEY` | Maps SDK for iOS/Android + web services | public in the app, so **restrict it** (§4.3) |
| `TENANT_ID` (project example uses a company ID) | Fallback tenant when the user has none | non-secret |
| Third-party tracking base URL / client ID / API key | Telematics integration | see warning below |
| Support webhook URL | Sends support messages | see warning below |

> ⚠️ **Everything the app reads at runtime is public.** `EXPO_PUBLIC_*`, `react-native-config`, `app.config.js` `extra`, `BuildConfig` and `Info.plist` values all end up inside the IPA/APK and can be extracted. Marking a variable `sensitive` in EAS only hides it in the dashboard and logs, not in the binary.
>
> So third-party **API keys, webhook URLs, OAuth secrets and access tokens must not be shipped in the app.** Call those services through your backend. The project example still ships a tracking API key and a support webhook URL in the bundle. Treat that as technical debt to move behind the backend.

### 1.3 Public vs private configuration

| Can be in the app (public) | Must stay on the backend (private) |
| --- | --- |
| API base URL | Database credentials, JWT secrets |
| Square **Application ID** | Square **Application Secret**, merchant **access/refresh tokens**, webhook signature key |
| Google Maps key (restricted to your app) | Unrestricted Google keys, service-account JSON |
| Firebase `google-services.json` / `GoogleService-Info.plist` (client config) | FCM server key / service account, APNs `.p8` key |
| Feature flags | Third-party API keys, webhook URLs |
| Sentry DSN (public by design) | Sentry auth token (used to upload source maps in CI only) |

### 1.4 Env files

```text
.env.example        # committed: every variable, placeholder values, comments
.env.development    # local only: ProjectName Dev values
.env.preview        # local only: ProjectName Trial values (optional)
.env.production     # local only: production values (only needed for local prod builds)
.env                # local only: the *active* copy (written by the iOS scheme / scripts)
```

`.env.example`:

```dotenv
# Copy to .env.development / .env.production, or pull from EAS:
#   eas env:pull --environment development --path .env.development
# DO NOT commit any real .env file.

BASE_URL=YOUR_API_URL
SQUARE_APPLICATION_ID=YOUR_SQUARE_APPLICATION_ID   # sandbox-... for development
GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY
TENANT_ID=YOUR_TENANT_ID
```

Pull values from EAS instead of passing them around in chat:

```bash
eas env:pull --environment development --path .env.development
eas env:pull --environment production  --path .env.production
```

- `eas env:pull` **overwrites** the target file, so back up first. Without `--path` it writes `.env.local`, which your tooling may not read.
- Variables with EAS visibility **`secret` can't be pulled**. Use `sensitive` for values local development needs.

### 1.5 What must never be committed

`.gitignore` (project example, abridged):

```gitignore
.env
.env.*
!.env.example
*.jks
*.keystore
*.p8
*.p12
*.key
*.pem
*.mobileprovision
ios/Pods/
android/local.properties
```

Never commit: real `.env*` files, release keystores and their passwords, `.p8` / `.p12` / provisioning profiles, Google service-account JSON, Square secrets or tokens, webhook URLs, or `credentials.json` from EAS. Enforce it with **gitleaks** in pre-commit and CI (project example: `gitleaks protect --staged` in the hook, plus a full-history scan every week).

If a secret is committed, **rotate it**. Removing it from Git history isn't enough.

### 1.6 EAS environment variables

```bash
# env:set creates or updates (verified on eas-cli 23.x)
eas env:set development --name BASE_URL --value "YOUR_DEV_API_URL" --visibility plaintext
eas env:set production  --name BASE_URL --value "YOUR_PROD_API_URL" --visibility plaintext
eas env:set production  --name SQUARE_APPLICATION_ID --value "YOUR_SQUARE_APPLICATION_ID" --visibility sensitive

eas env:push --environment development --path .env.development   # bulk upload from a file
eas env:list --environment production       # project example: pnpm eas:env:list:prod
eas config --profile production --platform ios | grep '"environment"'   # confirm profile → environment
```

`env:list` prints plaintext and sensitive values, so don't paste its output into tickets or chat. EAS CLI subcommands change between major versions, so check `eas help env` for yours.

Each `eas.json` build profile chooses **one** environment:

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "environment": "development" },
    "preview":     { "distribution": "internal", "environment": "preview", "android": { "buildType": "apk" } },
    "production":  { "autoIncrement": true, "environment": "production", "android": { "buildType": "app-bundle" } }
  }
}
```

> **Project example:** an older doc said `preview` used the `development` environment, but `eas.json` now uses `"environment": "preview"`. The `preview` environment must then contain **every** variable, or trial builds ship with empty values. Check with `eas env:list --environment preview`.

### 1.7 CI/CD variables

- Builds started from CI (`eas build --non-interactive`) still take app values from the **EAS environment**. CI itself only needs `EXPO_TOKEN`, stored as a GitHub Actions secret.
- CI jobs that only lint or export the bundle shouldn't need real values. If code throws on missing config at import time, give CI placeholder values instead of real secrets.
- Never `echo` env values in CI logs. Print variable **names** and whether they're set.

---

## 2. How configuration flows into the app

**Project example**, the pattern to reuse:

```text
                       ┌──────────────────── local ────────────────────┐   ┌──── EAS ────┐
Source of values       .env.development / .env.production → .env           EAS environment
                       (ENVFILE=… in pnpm scripts, or Xcode scheme pre-action copies to .env)
                                    │                                            │
app.config.js          loads ENVFILE or .env into process.env ◄──────────────────┘
                       → expo.extra.{ baseUrl, squareApplicationId, googleMapsApiKey, … }
                       → ios.config.googleMapsApiKey, android.config.googleMaps.apiKey
                                    │
JS (src/config/config.ts)    reads react-native-config first, falls back to expo-constants extra
Android (app/build.gradle)   reads env var, then .env → BuildConfig.SQUARE_APPLICATION_ID, manifest placeholder for Maps key
iOS (AppDelegate.mm)         reads expo extra from the embedded app.config → initialises Square SDK + Google Maps
```

A single typed config module for JS:

```ts
// src/config/config.ts
import Constants from 'expo-constants';
import Config from 'react-native-config';

const extra: Record<string, unknown> = Constants.expoConfig?.extra ?? {};
const missing: string[] = [];

const read = (envKey: string, extraKey: string) => {
  const value = String(Config[envKey] || extra[extraKey] || '').trim();
  if (!value) missing.push(envKey);
  return value;
};

export const config = {
  apiUrl: read('BASE_URL', 'baseUrl'),
  squareApplicationId: read('SQUARE_APPLICATION_ID', 'squareApplicationId'),
  googleMapsApiKey: read('GOOGLE_MAPS_API_KEY', 'googleMapsApiKey'),
};

if (__DEV__ && missing.length) console.warn(`[Config] Missing env values: ${missing.join(', ')}`);

export const socketUrl = config.apiUrl;
export const isSquareSandbox = config.squareApplicationId.startsWith('sandbox-');
```

Rules:

- **Only `config.ts` reads env.** Everything else imports `config`.
- Warn on missing keys, by **name** only, never the value.
- Values are baked in at **build/bundle time**. After changing an env file, restart Metro with a cleared cache (`pnpm start:dev -c`). Native values (Square ID, Maps key) need a **native rebuild**.
- Pick one mechanism if you can. The project example ended up with three readers (react-native-config, `app.config.js` extra and a Babel inline-dotenv plugin) that all have to agree. A new Expo project can usually use `app.config.js` + `extra` (or `EXPO_PUBLIC_*`) alone.

---

## 3. Schemes, variants and app identity

### 3.1 iOS schemes (project example)

Two shared schemes, `ProjectNameDevelopment` and `ProjectNameProduction`, each with a **Build → Pre-action** that copies the right env file:

```sh
cp "${PROJECT_DIR}/../.env.development" "${PROJECT_DIR}/../.env"
```

> ⚠️ Set **"Provide build settings from"** to the app target in the pre-action. With `None`, `${PROJECT_DIR}` is empty, the copy fails **silently**, and Archive/TestFlight builds use whatever `.env` was there before. That's a wrong-environment release. Check after archiving:
>
> ```bash
> cmp .env .env.production && echo "PROD env used"
> ```

CLI runs set `ENVFILE` explicitly (`pnpm ios:dev`, `pnpm ios:prod`). EAS builds ignore schemes and env files and use the EAS environment.

### 3.2 Recommended: separate identity per environment

With Expo config (CNG) or EAS, derive identity from a variable instead of maintaining native targets by hand:

```js
// app.config.js
const APP_ENV = process.env.APP_ENV ?? 'development'; // set per EAS environment
const variants = {
  development: { name: 'ProjectName Dev',   id: 'YOUR_BUNDLE_ID.dev',   scheme: 'projectname-dev' },
  preview:     { name: 'ProjectName Trial', id: 'YOUR_BUNDLE_ID.trial', scheme: 'projectname-trial' },
  production:  { name: 'ProjectName',       id: 'YOUR_BUNDLE_ID',       scheme: 'projectname' },
};
const v = variants[APP_ENV];

export default {
  expo: {
    name: v.name,
    scheme: v.scheme,
    ios: { bundleIdentifier: v.id },
    android: { package: v.id.replaceAll('-', '_') },
    extra: { appEnv: APP_ENV },
  },
};
```

Each ID needs its own: App Store Connect / Play Console app (or internal-only), push credentials (APNs key works for all; FCM needs each package in Firebase), Google Maps key restriction entry, and Square redirect / deep-link scheme.

In a prebuilt project, the native equivalents are Xcode **build configurations** (Debug-Dev, Release-Prod…) with their own `PRODUCT_BUNDLE_IDENTIFIER`, and Android **`productFlavors`** (`dev`, `trial`, `prod`) with `applicationIdSuffix`. The project example has neither. It switches only the env file.

### 3.3 Deep link / URL schemes

- Register a unique scheme per app (`projectname://`). Avoid generic ones like `myapp`, which other apps may also register. The project example still has the template default `myapp` alongside a package-name scheme.
- For OAuth returns and email links, prefer **Universal Links / App Links** (`https://YOUR_DOMAIN/...`) in production. They can't be hijacked by another app.

### 3.4 How to tell which environment a running app uses

Make it obvious. Don't rely on memory:

1. **Different app name and icon badge** per environment (§3.2).
2. **About/Settings screen** showing `appEnv`, app version + build number, API **host** (not full URL with paths), and payment mode (`Sandbox` / `Live`) from `isSquareSandbox`.
3. A **non-production banner** ("TRIAL") when `appEnv !== 'production'`.
4. A startup log in dev: `console.log('[Config]', { appEnv, apiHost: config.apiUrl.replace(/^https?:\/\//, '').split('/')[0], squareSandbox: isSquareSandbox })`. Log no keys. (React Native's built-in `URL` doesn't implement `host`.)
5. Build-time checks: `eas config --profile production` shows the environment, and the iOS `cmp .env .env.production` check above.

### 3.5 Guardrails against using production by accident

- Development `.env` and the dev EAS environment never contain production URLs or IDs.
- Startup assertion in release builds: if `appEnv === 'production'` and `isSquareSandbox` (or the API host isn't the production host), refuse to start payments and show an error. The project example already refuses when the backend's Square application ID doesn't match the build's ([§5.8](#58-environment-separation)).
- Production EAS environment edits limited to release owners.
- Release checklist verifies the environment ([04 §7](04-mobile-build-release-and-store-deployment.md#7-release-checklist)).

---

## 4. Google Maps and location

### 4.1 Setup

**Project example:** `react-native-maps` `1.14.0`, `react-native-maps-directions`, and `PROVIDER_GOOGLE` on Android / `PROVIDER_DEFAULT` (Apple Maps) on iOS. The Google Maps iOS SDK is still installed (`react-native-google-maps` pod) and given the key.

Google Cloud APIs to enable (only what you use):

| API | Needed for |
| --- | --- |
| Maps SDK for Android | Android map rendering |
| Maps SDK for iOS | iOS map rendering with `PROVIDER_GOOGLE` |
| Directions API (or Routes API) | Route polylines (`react-native-maps-directions`) |
| Geocoding API | Address ↔ coordinates |
| Places API | Address autocomplete |

**Billing:** Maps Platform requires a billing account even for free-tier usage. Without one, maps render grey or blank and web-service calls return `REQUEST_DENIED`. Set **budget alerts** and per-API **quotas**. A leaked unrestricted key can run up large bills.

### 4.2 Native configuration

**Android:** the key goes in the manifest:

```xml
<meta-data android:name="com.google.android.geo.API_KEY" android:value="${googleMapsApiKey}"/>
```

```groovy
// android/app/build.gradle — project example reads env var, then .env
manifestPlaceholders = [googleMapsApiKey: readEnvValue("GOOGLE_MAPS_API_KEY")]
```

With CNG: `android.config.googleMaps.apiKey` in `app.config.js`.

**iOS:** provide the key before the first map renders:

```objc
// AppDelegate.mm
#if __has_include(<GoogleMaps/GoogleMaps.h>)
  [GMSServices provideAPIKey:googleMapsApiKey];
#endif
```

With CNG: `ios.config.googleMapsApiKey`. Add the Google Maps pod in the Podfile (`pod 'react-native-google-maps', path: …`) only if you use `PROVIDER_GOOGLE` on iOS.

### 4.3 Key restrictions and environment keys

Create **separate keys**:

| Key | Application restriction | API restriction |
| --- | --- | --- |
| Android key | Android apps: `YOUR_PACKAGE_NAME` + **SHA-1** of debug, upload **and Play App Signing** certificates | Maps SDK for Android |
| iOS key | iOS apps: `YOUR_BUNDLE_ID` (each variant) | Maps SDK for iOS |
| Web-service key (Directions/Geocoding/Places) | **Backend server IP** (call these APIs from the backend) | Only those APIs |

- Get SHA-1 values with `cd android && ./gradlew signingReport` (debug/upload) and **Play Console → App integrity** (the app-signing key Google uses for store installs). A missing Play signing SHA-1 is the classic "maps work in dev, blank in production" bug.
- Directions/Geocoding/Places called directly from the app need an unrestricted or loosely restricted key, because those web APIs can't check app signatures. Proxy them through the backend.
- Use dev and prod keys (or at least separate projects for quotas) so a dev bug can't exhaust production quota.

### 4.4 Rendering patterns

```tsx
<MapView
  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
  style={StyleSheet.absoluteFill}
  initialRegion={MAP_CONFIG.defaultRegion}    // not `region` unless you control it
  showsUserLocation={hasLocationPermission}
  onMapReady={() => setMapReady(true)}
>
  {markers.map((m) => (
    <Marker key={m.id} coordinate={m.coord} tracksViewChanges={false} />
  ))}
</MapView>
```

- `tracksViewChanges={false}` on custom markers (turn it on only briefly while the image loads). This is the biggest Android map performance fix.
- Memoise markers. Don't recreate coordinate objects every render. Use `initialRegion` + `animateToRegion` rather than a controlled `region` updated by GPS.
- Only render the map when its screen is focused if it's in a tab (`useIsFocused`).

### 4.5 Location permissions

| | Foreground | Background |
| --- | --- | --- |
| iOS | `NSLocationWhenInUseUsageDescription` | + `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: [location]` |
| Android | `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | + `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` |

**Project example** `expo-location` plugin:

```js
['expo-location', {
  locationWhenInUsePermission: 'ProjectName uses your location for dispatch and tracking.',
  locationAlwaysAndWhenInUsePermission: 'ProjectName uses your location for tracking, including in the background.',
  isIosBackgroundLocationEnabled: true,
  isAndroidBackgroundLocationEnabled: true,
  isAndroidForegroundServiceEnabled: true,
}]
```

Flow: ask for **foreground** first, explain why background is needed, then ask for background. On Android 11+ "Allow all the time" is only available in Settings, so send the user there with a clear explanation.

### 4.6 Background location

```ts
// index.ts — module scope, before registerRootComponent
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => { /* send to backend */ });

// when tracking starts (app in foreground!)
await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 60_000,
  distanceInterval: 50,
  foregroundService: { notificationTitle: 'Tracking active', notificationBody: 'Location is shared while on duty.' },
  pausesUpdatesAutomatically: false,
});
```

- **Android 12+ can't start a foreground service from the background.** Start tracking while the app is in the foreground. The project example catches the failure and stops retrying until the next foreground, instead of looping.
- Throttle sends (the project example sends at most once every few minutes over the socket, with an HTTP fallback).
- Stop tracking and clear task state on logout or check-out.
- App Store and Play require a clear, user-visible reason for background location. Play requires a declaration form and a video.

### 4.7 GPS and map errors

| Symptom | Cause / fix |
| --- | --- |
| `getCurrentPositionAsync` hangs/timeouts indoors | Use `getLastKnownPositionAsync` first, then a fresh fix with a timeout |
| "Location services are disabled" | Check `hasServicesEnabledAsync()`; prompt to enable |
| Location works in foreground only | Background permission not granted, or task not defined at module scope |
| Simulator shows no location | Set it: Simulator → Features → Location; Android emulator → Extended controls |

More map troubleshooting: [05 §8](05-mobile-troubleshooting-and-best-practices.md#8-maps-and-location).

---

## 5. Square payments

This section describes **in-person card payments with the Square Mobile Payments SDK** (card readers, Tap to Pay, keyed entry, cash) for a multi-company app where each company connects its **own** Square merchant account.

### 5.1 Architecture

```text
Mobile App ──(user JWT)──► ProjectName Backend ──(merchant OAuth token)──► Square APIs
    │                              │
    └── Square Mobile Payments SDK ┘ (authorised with a short-lived session token from the backend)
```

| Backend responsibilities | Mobile responsibilities |
| --- | --- |
| Holds Square **Application Secret**, webhook signature key | Holds only the public **Application ID** (per environment) |
| Runs OAuth: builds authorize URL, validates `state`, exchanges code, **stores tokens encrypted** per company | Opens the authorize URL, handles the return deep link, refreshes status |
| Refreshes / rotates tokens, handles revocation webhooks, marks connection `valid / expired / revoked / needs_reconnect` | Shows connection status and reconnect / disconnect actions (admin only) |
| Picks the merchant **location ID** | Requests runtime permissions (location, Bluetooth, mic) |
| Mints a **short-lived, payment-scoped session token** for the device | Calls SDK `authorize(token, locationId)`, then `startPayment(...)` |
| **Verifies every payment** with Square before recording it | Sends `paymentId` + invoice reference to the backend |
| Decides amount and currency (from the invoice) | Displays the amount; never the source of truth |

**Project example backend endpoints** (rename for your project):

| Method & path | Purpose |
| --- | --- |
| `GET /api/v1/square/oauth/authorize?platform=mobile` | Returns `{ authorizationUrl }` (with server-generated `state`) |
| `GET /api/v1/square/oauth/callback` | Square redirects here; backend exchanges the code, then redirects to the app/web with `?status=success|error&message=` |
| `GET /api/v1/square/account` | `{ connected, merchantId, locationId }`, no tokens |
| `GET /api/v1/square/business` | Display info (business name, country, currency), admin only |
| `GET /api/v1/square/session` | `{ authorizationCode /* short-lived token */, locationId, applicationId, expiresAt }` |
| `POST /api/v1/square/payments` | Verify + record a completed payment |
| `DELETE /api/v1/square/account` | Disconnect (revoke + mark disconnected) |
| `POST /api/v1/square/webhooks` | OAuth revocation webhook (signature-verified) |

### 5.2 Square developer setup

1. Create a Square Developer account → **Applications → New application** (`ProjectName`).
2. **Sandbox** tab: note the sandbox Application ID (`sandbox-sq0idb-…`) and create a **sandbox test account** (a test merchant with locations).
3. **Production** tab: the production Application ID and Secret.
4. **OAuth**: set the redirect URL to your **backend callback** for each environment (`https://dev-api.YOUR_DOMAIN/api/v1/square/oauth/callback`, `https://api.YOUR_DOMAIN/...`).
5. **Webhooks**: subscribe to `oauth.authorization.revoked` and point it at the backend, then save the signature key on the backend.
6. Backend env (project example names, values in the secret store only): `SQUARE_ENVIRONMENT=sandbox|production`, `SQUARE_APPLICATION_ID_*`, `SQUARE_APPLICATION_SECRET_*`, `SQUARE_OAUTH_REDIRECT_URI_*`, `SQUARE_WEBHOOK_SIGNATURE_KEY_*`, `SQUARE_API_VERSION`.
7. Mobile env: `SQUARE_APPLICATION_ID` = sandbox ID in dev/trial, production ID in production.

### 5.3 OAuth connect / reconnect / disconnect

```text
Admin taps "Connect Square"
  → app GET /square/oauth/authorize            → { authorizationUrl }
  → Linking.openURL(authorizationUrl)          (system browser, Square login + consent)
  → Square → backend /oauth/callback?code&state
      backend: validate single-use, unexpired state → exchange code → encrypt + store tokens
               → fetch merchant + locations → choose location → status = valid
  → backend redirects to  YOUR_SCHEME://square-callback?status=success
  → app (Linking 'url' listener or AppState→active) → GET /square/account → show "Connected — Location name"
```

Mobile handler (project example pattern):

```ts
useEffect(() => {
  const handleUrl = (url: string) => {
    if (!url.includes('square-callback')) return;
    // RN 0.74's URL polyfill has no searchParams, so parse the query by hand
    const status = /[?&]status=([^&]*)/.exec(url)?.[1];
    showMessage({ type: status === 'success' ? 'success' : 'danger', message: t(status === 'success' ? 'squareAccount.connected' : 'squareAccount.connectionFailed') });
    refetchAccount();
  };
  const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
  Linking.getInitialURL().then((url) => url && handleUrl(url));
  return () => sub.remove();
}, []);
```

Also refetch on `AppState → active`, because the user may close the browser without completing the flow.

- **Reconnect** = run the same flow again. The backend replaces the tokens. The app must call `clearSquareAuthorization()` so the device doesn't keep the old account's SDK session.
- **Disconnect** = `DELETE /square/account` (the backend revokes the token with Square, and the device de-authorises).
- **Expired / revoked** (user revoked in the Square dashboard → webhook): the backend marks `revoked` / `needs_reconnect` and returns `409` from `/session`. The app shows "Reconnect Square in Settings".
- Request the **minimum OAuth scopes** you need (typically merchant profile read, payments read/write, plus orders/customers only if used).

### 5.4 SDK initialisation (native, before React Native starts)

The SDK must be initialised with the Application ID **before** the JS module is touched. Otherwise every SDK call throws (iOS asserts and crashes).

```kotlin
// Android — MainApplication.kt onCreate()
if (BuildConfig.SQUARE_APPLICATION_ID.isNotEmpty()) {
  MobilePaymentsSdk.initialize(BuildConfig.SQUARE_APPLICATION_ID, this)
}
```

```objc
// iOS — AppDelegate.mm didFinishLaunchingWithOptions, before [super ...]
if (squareApplicationId.length > 0) {
  MPRNInitializeSquareSDK(launchOptions, squareApplicationId);
}
```

If the ID is empty, skip initialisation and have JS report "payments not configured" (`isSquareConfigured`) instead of crashing.

### 5.5 Taking a payment (mobile)

```ts
export async function startCardPayment(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return fail('invalidAmount');
  if (inProgress) return fail('inProgress');          // one payment at a time
  inProgress = true;
  try {
    if (!(await ensurePaymentPermissions())) return fail('permission');
    await ensureSquareAuthorized();                   // see below
    const payment = await startPayment(
      {
        amountMoney: { amount: amountCents, currencyCode: CurrencyCode.USD },
        processingMode: ProcessingMode.ONLINE_ONLY,
        allowCardSurcharge: false,
        paymentAttemptId: makeUniqueId(),             // idempotency for this attempt
      },
      { additionalMethods: [AdditionalPaymentMethodType.KEYED, AdditionalPaymentMethodType.CASH], mode: PromptMode.DEFAULT }
    );
    return { success: true, paymentId: payment.id };  // then POST to backend for verification
  } catch (e) {
    return mapSquareError(e);                         // cancelled / declined / session / network
  } finally {
    inProgress = false;
  }
}
```

`ensureSquareAuthorized()` (project example behaviour, worth copying):

- Single-flight: concurrent callers share one in-flight authorization.
- Fetches `/square/session`, validates `authorizationCode` and `locationId` are non-empty strings.
- **Rejects if `session.applicationId !== config.squareApplicationId`** (sandbox build pointed at a production backend, or the reverse).
- Reuses the current SDK authorization only if it's for the same location and has more than 10 minutes left before `expiresAt`.
- If another account is authorised, calls `deauthorize()` first. The SDK's `authorize()` returns early when *any* account is authorised.
- Wraps `authorize()` / `deauthorize()` in a **20 s timeout**. The native calls have none and can hang forever.
- Uses a generation counter so an `authorize()` that finishes after logout is rolled back.

### 5.6 Verifying a payment (backend)

The app's "success" is only a claim. Before marking an invoice paid, the backend:

1. Takes the company from the **authenticated token**, never from the request body.
2. Loads the invoice and computes the **expected amount in cents** and currency server-side.
3. Retrieves the payment from Square **with that company's merchant token** (`GET /v2/payments/{id}`).
4. Checks `status` is `COMPLETED` (or `APPROVED` if you capture later), `amount_money.amount === expectedCents`, `amount_money.currency === currency`, and `location_id === company's location`.
5. Records the payment with the **verified** amount and Square payment ID as a reference, under a **unique constraint on the payment ID** so a retried request can't record it twice.
6. Returns a clear 4xx for mismatches, and `409` when the merchant must reconnect.

| Flow | Mobile | Backend |
| --- | --- | --- |
| Success | `paymentId` → `POST /square/payments` → show receipt | Verify → record → `200` |
| Declined / invalid card | Show the mapped message; stay on screen | Nothing recorded |
| Cancelled by user | Quiet "Payment cancelled"; **keep** the SDK session | Nothing recorded |
| Network error during SDK call | "Could not process, try again"; clear the cached session | — |
| App crashes after Square success, before backend call | On next open, list unreconciled payments, or rely on webhooks (`payment.updated`) to reconcile | Reconcile by `paymentId` / `reference_id` |
| Session expired / revoked | Clear the session, re-authorize once, else "Reconnect Square" | `/session` → `409` |

### 5.7 Error mapping

Map SDK and Square error codes to translated messages. Never show raw codes. Project example groups:

| Group | Codes (examples) | User message |
| --- | --- | --- |
| Declined | `GENERIC_DECLINE`, `CARD_DECLINED`, `INSUFFICIENT_FUNDS` | Card declined, try another |
| Invalid card | `CVV_FAILURE`, `INVALID_EXPIRATION`, `CARD_EXPIRED` | Check card details |
| Session | `ACCESS_TOKEN_EXPIRED`, `ACCESS_TOKEN_REVOKED`, `UNAUTHORIZED` | Session expired, try again / reconnect |
| Network | `NO_NETWORK`, `TIMED_OUT` | Couldn't process, try again |
| Authorization | `LOCATION_NOT_ACTIVATED_FOR_CARD_PROCESSING` | Location not activated for card payments |
| | `DEVICE_TIME_DOES_NOT_MATCH_SERVER_TIME` | Fix device date and time |
| | `UNSUPPORTED_COUNTRY` | Not supported in this country |
| Cancel | any code containing `CANCEL` | Payment cancelled |

### 5.8 Environment separation

- Sandbox Application IDs start with `sandbox-`. The app derives `isSquareSandbox` from that.
- **Build ID, backend ID and backend `SQUARE_ENVIRONMENT` must match.** A sandbox build can never authorise with a production session token. The app checks `session.applicationId` and shows "This build doesn't match the connected Square environment".
- **Never** put a `sandbox-` ID in the production EAS environment. Add it to the release checklist.

### 5.9 Testing in development

- Connect a **sandbox test account** through the same OAuth flow (sandbox authorize URL).
- Use the SDK's **mock reader** in sandbox builds (`showMockReaderUI()` before `showSettings()`) to simulate tap/dip/swipe without hardware. Hide it when de-authorising.
- Test: success, decline, cancel, offline mid-payment, expired session (wait or revoke), reconnect to a different merchant, logout during authorize, and an amount with cents (`10.05`).
- Real readers and Tap to Pay need **production** credentials and a physical device.

### 5.10 Platform requirements (project example, Mobile Payments SDK 2.6.x)

| | Requirement |
| --- | --- |
| RN wrapper | `mobile-payments-sdk-react-native` (pin exact version; native SDK `2.6.x`) |
| Android | `minSdk 28`, `compileSdk 36`, Kotlin `2.2.21`, AGP `≥ 8.9.1`, repo `https://sdk.squareup.com/public/android/` |
| iOS | Deployment target `≥ 16`, CocoaPods `SquareMobilePaymentsSDK` + `MockReaderUI` |
| Runtime permissions | Location (precise) on both; Android also Bluetooth scan/connect (API 31+), record audio, read phone state |
| Old/new architecture | Project example runs old architecture. Check the wrapper's support before enabling the new architecture |

Check Square's current SDK release notes before upgrading. Square SDK upgrades often require new minimum Android/iOS/Kotlin versions, so plan them as a native upgrade ([04 §4](04-mobile-build-release-and-store-deployment.md#4-android)). The older Square Reader SDK is deprecated; new projects should use the Mobile Payments SDK.

### 5.11 Common Square problems

See [05 §9](05-mobile-troubleshooting-and-best-practices.md#9-square-payments) for problem → cause → fix tables (environment mismatch, location not activated, unsupported country, OAuth redirect mismatch, authorize hang, crash on launch).

---

## 6. Push notifications

### 6.1 Approach

**Project example:** `expo-notifications` obtains the **native device token** (`getDevicePushTokenAsync()`, so an FCM token on Android and an APNs token on iOS), meant for a backend that sends through FCM/APNs directly.

| Option | Token | Backend sends via | Use when |
| --- | --- | --- | --- |
| Expo push service | `getExpoPushTokenAsync({ projectId })` → `ExponentPushToken[…]` | Expo Push API | Simplest; one API for both platforms |
| Native tokens | `getDevicePushTokenAsync()` | FCM HTTP v1 (Android **and** iOS via Firebase) or APNs directly | You already use Firebase or need full control |

Pick one per project and stick to it. The backend must know which token type it's storing.

### 6.2 Platform setup

**iOS**

- Capability **Push Notifications**. The entitlement `aps-environment` is `development` for debug and `production` for TestFlight/App Store. EAS and Xcode set this from the provisioning profile. A hardcoded `development` value in a committed entitlements file breaks production pushes when you sign manually.
- `UIBackgroundModes: [remote-notification]` if you handle background or silent pushes.
- APNs **auth key (`.p8`)**, which works for all apps in the team and both environments. Upload it to EAS (`eas credentials`) or Firebase. Never commit it.

**Android**

- Firebase project → add each package name → `google-services.json` (`android.googleServicesFile` in `app.config.js`). It's client config, not a secret, but use one per environment if you separate Firebase projects.
- `POST_NOTIFICATIONS` permission (Android 13+ runtime prompt).
- Create a **notification channel** before showing notifications:

```ts
await Notifications.setNotificationChannelAsync('default', {
  name: 'Default', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250],
});
```

- FCM HTTP v1 needs a **service-account JSON** on the backend (or uploaded to EAS for the Expo push service). Server-side only.

### 6.3 Registration flow

```ts
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;                                 // simulators can't get tokens
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') await createDefaultChannel();
  return String((await Notifications.getDevicePushTokenAsync()).data);
}
```

Then **send the token to the backend** after login:

```http
POST /api/v1/devices
{ "token": "…", "type": "fcm|apns|expo", "platform": "ios|android", "appEnv": "production", "appVersion": "1.4.0", "deviceId": "<stable install id>" }
```

> **Project example gap:** the token is fetched but never registered with the backend, and the received/response listeners are empty. Push can't reach users until registration and tap handling exist. The steps below are the general recommendation.

### 6.4 Backend responsibilities

- Store tokens **per device** (a user can have several), keyed by `deviceId`, with `userId`, `platform`, `type`, `appEnv`, `lastSeenAt`.
- **Upsert** on every app start or login (tokens rotate). Remove on logout. Delete tokens when FCM/APNs/Expo report them invalid (`UNREGISTERED`, `DeviceNotRegistered`, APNs `410`).
- Keep environments separate. Dev backends send to dev-build tokens only, and the APNs sandbox gateway only accepts development tokens.

### 6.5 Payloads

```json
{
  "to": "<token>",
  "title": "New order assigned",
  "body": "Order #1042 · 2.3 km away",
  "data": { "type": "order.assigned", "orderId": "1042", "screen": "OrderDetails" },
  "android": { "channelId": "default", "priority": "high" },
  "ios": { "sound": "default" }
}
```

- Put **IDs** in `data`, not personal data. The app fetches details after opening.
- Use a `type` field for routing, and version the payload if it changes.

### 6.6 Foreground, background, tap handling

```ts
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

useEffect(() => {
  const received = Notifications.addNotificationReceivedListener((n) => {
    queryClient.invalidateQueries({ queryKey: queryKeyFor(n.request.content.data) });
  });
  const response = Notifications.addNotificationResponseReceivedListener((r) => {
    routeFromNotification(r.notification.request.content.data);   // navigationRef.navigate(...)
  });
  Notifications.getLastNotificationResponseAsync().then((r) => r && routeFromNotification(r.notification.request.content.data)); // cold start
  return () => { received.remove(); response.remove(); };
}, []);
```

- Cold start: wait until navigation and auth are ready before navigating.
- Background data tasks: define with `TaskManager.defineTask` at module scope and `Notifications.registerTaskAsync(TASK)` (the project example registers one in `index.ts`). iOS limits background execution, so don't depend on it for critical logic.

### 6.7 Logout and multiple devices

- On logout: `DELETE /api/v1/devices/{deviceId}` (best effort) **before** clearing the auth token.
- If a different user logs in on the same device, upsert reassigns the device row to the new user.

### 6.8 Push checklist

- [ ] Correct `aps-environment` for the build type; APNs key uploaded
- [ ] `google-services.json` matches the package name of the build
- [ ] Token registered after login, refreshed on start, removed on logout
- [ ] Tap opens the right screen from killed, background and foreground states
- [ ] Android channel created; Android 13 permission flow tested
- [ ] Invalid tokens pruned by the backend
- [ ] Tested on **physical** iOS and Android devices with a release build

---

## 7. Sockets and realtime

### 7.1 Why and what

Used for live updates the user shouldn't have to refresh: new or updated jobs, assignment changes, live driver location, presence. **Project example:** Socket.IO (`socket.io-client` 4.8) against the same host as the REST API (`socketUrl = config.apiUrl`).

### 7.2 One connection, managed by a service

```ts
// services/realtimeService.ts — module-level singleton, not per screen
socket = io(socketUrl, {
  transports: ['websocket', 'polling'],
  tryAllTransports: true,          // actually fall back to polling if the WS upgrade fails
  reconnection: true,
  reconnectionAttempts: Infinity,  // mobile networks drop constantly; never give up permanently
  reconnectionDelay: 1000,
  reconnectionDelayMax: 15000,
  randomizationFactor: 0.5,        // jitter so thousands of clients don't reconnect at once
  timeout: 60000,
  auth: (cb) => cb({ token: getAccessToken() }),   // general recommendation (see 7.3)
});
```

Why `polling` fallback: on **Android debug builds**, OkHttp-based network inspectors can break the WebSocket upgrade. With websocket-only transport the socket never connects in dev.

### 7.3 Authentication

- **Authenticate the handshake** (`auth.token`) and verify it on the server in `io.use(...)`. Derive user and company from the token, not from event payloads.
- > Project example gap: identity (`userId`, company ID) is sent in event payloads (`user:online`, `company:join`) without a handshake token. A client could claim any identity. Fix this on both client and server.
- On token refresh, reconnect with the new token. On logout, `disconnect()` and remove all listeners.

### 7.4 Lifecycle

```text
login ─► connect ─► on 'connect': join rooms, register presence, flush queued emits
                      │
   network drop / server restart ─► 'disconnect' ─► auto-reconnect with backoff ─► 'connect' again (re-join!)
                      │
background ─► stop high-frequency emits (or keep only if you have a background mode) ─► foreground: verify connected, refetch
                      │
logout ─► emit leave (best effort) ─► socket.off(); socket.io.off(); socket.disconnect(); socket = null
```

- **Re-join rooms on every `connect`.** The server forgets rooms on reconnect. The project example remembers the last joined company and re-emits `company:join` on connect.
- **Refetch REST data after reconnecting**. Events sent while you were disconnected are gone.
- Hold the connection while the user is "offline / checked out" if the product requires it (project example: `connectionHeld`).

### 7.5 Rooms and event naming

- Rooms: `company:{companyId}`, `user:{userId}`, `order:{orderId}`. The **server** decides membership based on the authenticated user.
- Event names: `domain:action[:detail]` (`order:created`, `order:address:updated`, `driver:location:update`, `driver:registered`). Keep client→server and server→client names distinct (`…:update` vs `…:updated`).

Payload shape:

```json
{ "eventId": "uuid", "type": "order:cleared", "companyId": "c_1", "orderId": "1042", "at": "2026-03-01T14:00:00Z", "data": { } }
```

### 7.6 Duplicates and ordering

- Handlers must be **idempotent**. The same event can arrive twice (reconnect, or both REST and socket paths). Deduplicate on `eventId`, or make the handler a no-op if the state already matches (the project example's `call:cleared` handler only clears when the call ID matches).
- Don't re-emit identical presence payloads. The project example keeps a `lastUserOnlineKey` and clears it on disconnect.
- Throttle register and location emits (project example: register at most every 4 s, location every 2 min).

### 7.7 Screen subscriptions and cleanup

Screens subscribe through a hook. The service keeps a **list** of subscribers, because bottom tabs keep several screens mounted at once:

```ts
export function useRealtime(callbacks: RealtimeCallbacks) {
  useEffect(() => {
    realtimeService.addCallbacks(callbacks);
    return () => realtimeService.removeCallbacks(callbacks);
  }, [callbacks]);   // memoise callbacks in the caller
}
```

Never call `socket.on(...)` directly in a component without a matching `off` in cleanup. Leaked listeners cause duplicate handling and memory growth.

### 7.8 Background, network changes, stale connections

- `AppState` `background`: stop intervals. `active`: if `!socket.connected`, `socket.connect()`, then refetch.
- A connection can look connected but be dead after a network switch. Socket.IO's ping/pong catches this within the server's `pingInterval + pingTimeout`. Keep those values reasonable on the server (around 25 s / 20 s).
- iOS suspends sockets shortly after backgrounding. Use push for anything that must reach a backgrounded app.

### 7.9 Errors, logging, scaling

- Log `connect`, `disconnect` (with reason), `connect_error` (message + transport) to the activity log or Reactotron. No tokens.
- Show a subtle "reconnecting…" indicator if realtime is central to the screen.
- Server scaling: several Node instances need the **Socket.IO Redis adapter** (or similar) and **sticky sessions** for the polling transport. Rooms and broadcasts go through the adapter.

---

## 8. Other integrations

| Integration | Project example | Notes |
| --- | --- | --- |
| Deep links | Custom schemes registered in `Info.plist` / manifest | Unique scheme per environment; Universal/App Links for production OAuth returns (§3.3) |
| Background tasks | `expo-task-manager` (location, notifications) | Define at module scope in `index.ts` |
| Camera / scanning | `expo-camera`, `react-native-vision-camera` (code scanner), document scanner, on-device OCR | Each adds native permissions and build config. One camera library is easier to maintain than two |
| File uploads | `FormData` through the shared axios client | Compress first; don't force `Content-Type`; increase timeout for uploads |
| Remote support / co-browse SDK | Third-party SDK initialised at startup | Mask sensitive fields; start only with user consent; generate dSYMs for crash symbolication |
| Third-party data APIs | Called directly with an API key from the app | **Move behind the backend** (§1.2) |
| Support webhook | Webhook URL in the app bundle | **Move behind the backend**. Anyone can extract and spam a webhook URL |
| Crash reporting / analytics | Not present (local last-crash logger only) | Add Sentry or Crashlytics before scaling ([05 §13](05-mobile-troubleshooting-and-best-practices.md#13-production-best-practices)) |
| Dev tooling | Reactotron, loaded only under `__DEV__` | Never ship it in release |
