# 02 — Mobile Architecture & Development

How to structure a production React Native app and the patterns to use day to day: API layer, state, navigation, auth, errors, offline, storage, performance, UI and i18n.

Part of the [Mobile Development Handbook](README.md). Previous: [01 — Setup](01-mobile-project-setup.md). Next: [03 — Environments & Integrations](03-mobile-environment-and-integrations.md).

---

## 1. Folder structure

**Project example** (`src/`), generalised:

```text
src/
├── api/                # one folder per backend domain: request functions + React Query hooks
│   ├── config.ts       # the single axios instance (base URL, timeout, interceptors)
│   ├── errorHandler.ts # normalizeApiError() → safe, translated message
│   └── orders/         # index.ts (requests), useOrdersQuery.ts (hooks)
├── components/         # reusable UI, grouped: ui/, form/, card/, modal/, map/, layout/
├── config/             # config.ts (env), queryClient.ts, maps.ts, dev tooling
├── constants/          # static domain constants
├── contexts/           # React contexts (theme, cross-screen UI state)
├── hooks/              # shared hooks: queries/, mutations/, ui/, useSocket, usePushNotification
├── i18n/               # i18next setup + locales/*.ts
├── modules/            # larger self-contained native-backed features (e.g. background GPS)
├── navigation/         # navigationRef (navigate outside components)
├── navigators/         # root navigator, auth stack, main stack, tab navigator
├── redux/              # slices: auth/session, theme, feature flags, logs
├── screens/            # one folder per screen: index.tsx (+ styles.ts, local components)
├── services/           # non-UI logic: socket service, payment service, logout, background tasks
├── store/              # store + persist configuration
├── types/              # shared types (navigation params, API models)
└── utils/              # pure helpers (formatting, storage wrapper, crash logger)
```

**Dependency direction:** `screens → components / hooks → api / services → config`. Services and API modules never import screens. Anything used by two or more screens moves out of `screens/`.

| Layer | Responsibility | Must not |
| --- | --- | --- |
| Screen | Layout, wiring hooks to components, navigation | Call axios directly or hold business rules |
| Component | Presentation, local UI state | Fetch data (except clearly named container components) |
| Hook | Reusable stateful logic, React Query wrappers | Touch native SDKs directly when a service exists |
| Service | Long-lived logic and SDK wrappers (socket, payments, location) | Render UI (it may raise an `Alert`) |
| API | HTTP requests, response shape | Show messages to the user |

---

## 2. Application bootstrap

Order matters. **Project example** `index.ts` → `App.tsx`:

1. `index.ts`: import `react-native-gesture-handler` first, install the fatal-error crash logger, **define background tasks at module scope** (TaskManager tasks must be defined before `registerRootComponent`), load dev tooling only when `__DEV__`, then `registerRootComponent(App)`.
2. `App.tsx`: wait for app init and fonts, then render the providers:

```tsx
<ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <Provider store={store}>
      <PersistGate loading={<LoadingScreen />} persistor={persistor}>
        <PaperProvider>
          <ThemeProvider>
            <SafeAreaProvider>
              <I18nextProvider i18n={i18n}>
                <ApplicationNavigator />
                <GlobalOfflineListener />
              </I18nextProvider>
            </SafeAreaProvider>
            <FlashMessage position="top" />
          </ThemeProvider>
        </PaperProvider>
      </PersistGate>
    </Provider>
  </QueryClientProvider>
</ErrorBoundary>
```

3. Start push registration only **after** the app is ready (`usePushNotification(appReady && fontsReady)`). Asking for permissions during a slow cold start causes problems on real devices.

---

## 3. API layer

### 3.1 One axios instance

All requests go through `src/api/config.ts`. Never call `axios.create` or `fetch` in a screen.

```ts
const axiosInstance = axios.create({
  baseURL: config.apiUrl,        // from env, see guide 03
  timeout: 15000,
});

// Request: fail fast when offline, attach the token
axiosInstance.interceptors.request.use(async (req) => {
  const net = await NetInfo.fetch();
  if (!net.isConnected) throw new Error('NETWORK_OFFLINE');
  const token = getAccessToken();
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

// Response: log (dev only), force logout on expired/invalid token
axiosInstance.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (__DEV__) logApiError(error);
    if (isAuthExpired(error) && !isLoginRequest(error)) await performLogout();
    return Promise.reject(error);
  }
);
```

**Project example details worth copying:**

- The offline check uses a cached `NetInfo` listener value and only calls `NetInfo.fetch()` when the cache says offline, so most requests skip an extra async call.
- Auth expiry is detected from HTTP `401` and from backend codes and messages (`TOKEN_EXPIRED`, `JWT_EXPIRED`, …). The login request is excluded, so a wrong password doesn't trigger a logout.
- `performLogout` is **single-flight**: ten parallel 401s produce one logout.
- `Content-Type: application/json` is set only when the body isn't `FormData`. File uploads need the boundary header that the runtime sets.

### 3.2 Domain modules + React Query

```ts
// api/orders/index.ts
export const getOrdersApi = async (params: OrderFilters) =>
  (await api.get('/api/v1/orders', { params })).data;

// api/orders/useOrdersQuery.ts
export const useOrdersQuery = (filters: OrderFilters) =>
  useQuery({ queryKey: ['orders', filters], queryFn: () => getOrdersApi(filters) });
```

**Project example `QueryClient` defaults**, and why:

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 2,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 30_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Android flips offline↔online often; `true` caused request floods
      networkMode: 'always',     // let the NetInfo interceptor decide, not navigator.onLine
    },
    mutations: { retry: 1, networkMode: 'always' },
  },
});
```

Opt in to `refetchOnReconnect: true` per query where fresh data really matters.

- Use stable, structured query keys (`['orders', filters]`) and invalidate by prefix after mutations.
- On logout, call `queryClient.clear()` so the next user never sees cached data from the previous one.

### 3.3 Request cancellation

React Query passes an `AbortSignal` to `queryFn`. Forward it for searches and large lists:

```ts
useQuery({
  queryKey: ['search', term],
  queryFn: ({ signal }) => api.get('/api/v1/search', { params: { q: term }, signal }).then(r => r.data),
  enabled: term.length >= 2,
});
```

For non-query requests (typeahead, uploads), create an `AbortController` and abort it in the effect cleanup. The project example doesn't do this yet. It's a general recommendation.

---

## 4. Error handling

### 4.1 Normalise every error

**Project example** `normalizeApiError(error, fallback)` returns `{ message, status, isNetworkError, isAuthError }`, and the message is always a translation:

| Condition | Message key |
| --- | --- |
| `NETWORK_OFFLINE` | `error.offline` |
| Timeout (`ECONNABORTED`) | `error.timeout` |
| No response (DNS, server down) | `error.serverUnavailable` |
| 401 / 403 / 404 | `error.unauthorized` / `error.forbidden` / `error.notFound` |
| ≥ 500 | `error.serverError` (**never** show backend internals) |
| 4xx with body | the backend's validation message (`message`, `detail`, `error`, field errors), otherwise the fallback |

Log full details for developers separately (`logApiError(context, error)`). In release builds, log only `message`, `status` and `url`.

### 4.2 Where errors are shown

- **Form/field errors:** next to the field.
- **Action failures:** a toast/flash message (project example: `react-native-flash-message`).
- **Screen-level load failures:** an error state with **Retry** (see §8).
- **Render crashes:** a root `ErrorBoundary` with a "restart"/"go back" option.
- **Fatal JS errors in release:** the project example installs a global handler that saves the last fatal error to AsyncStorage and shows it on the next launch. Treat this as a stop-gap. Use a real crash reporter in production ([05 §13](05-mobile-troubleshooting-and-best-practices.md#13-production-best-practices)).

---

## 5. State management

| Kind of state | Tool | Example |
| --- | --- | --- |
| Server data | React Query | lists, details, lookups |
| Session / global client state | Redux Toolkit (persisted where needed) | access token, user profile, theme, feature flags |
| Cross-screen UI state | React Context | incoming-event banner, tab state |
| Local UI state | `useState` / `useReducer` | form inputs, modal visibility |
| Long-lived connections | Module-level service singletons | socket, payment SDK session |

Don't copy server data into Redux. Persist only what has to survive a restart. **Project example** persists `login`, `theme` and `font`, and uses a versioned persist config with a migration so stored theme data is rebuilt when the theme schema changes:

```ts
const themePersistConfig = {
  key: 'theme', storage, version: 2,
  migrate: (state) => Promise.resolve({ ...state, currentTheme: defaultTheme }),
};
```

Bump `version` whenever the shape of a persisted slice changes.

---

## 6. Navigation, authentication and authorization

### 6.1 Auth-gated navigator

The root navigator chooses the stack based on the token in the store:

```tsx
const token = useSelector((s) => s.auth.accessToken);
return (
  <NavigationContainer ref={navigationRef} theme={navigationTheme}>
    {token ? <MainStack /> : <AuthStack />}
  </NavigationContainer>
);
```

- **Project example:** a stack navigator containing a bottom-tab navigator (React Navigation 7). `navigationRef` allows navigation from services, for example when a notification or socket event arrives.
- Pass a theme to `NavigationContainer`, or React Navigation paints a light grey background behind dark screens during transitions.
- Make sure the auth header is set **before** child screens fire queries. The project example sets it during render, guarded by a ref, because child effects run before parent effects.
- Logout: switch to a blank placeholder first, then clear state on the next frames. This avoids native "view disconnected" animation errors when the whole stack unmounts.

### 6.2 Logout must clean up everything

**Project example** `performLogout()` disconnects the socket, stops location tracking and background tasks, de-authorises the payment SDK, clears the React Query cache, removes the auth header, then resets the store. Any new long-lived resource must be added here.

### 6.3 Authorization

- The backend is the authority. The app hides what the user can't do, but every endpoint must check the role on the server.
- Define roles once as constants (`UserRole.ADMIN`, `DRIVER`, …) and gate menus and screens with them.
- Admin-only screens (for example payment account connection) should also handle a `403` cleanly.

### 6.4 Tokens and storage

| Data | Store in |
| --- | --- |
| Access / refresh tokens | **General recommendation:** Keychain/Keystore (`expo-secure-store`) |
| Non-sensitive preferences (theme, language, last tab) | AsyncStorage |
| Cached server data | React Query (memory), or a persister for offline use |
| Payment credentials / card data | **Never** on the device (handled by the payment SDK) |

> **Project example:** the session (including the access token) is persisted with redux-persist on AsyncStorage, which isn't encrypted. That works, but for new projects keep tokens in `expo-secure-store` and persist only non-sensitive state.

---

## 7. Forms and validation

- Keep form state local. Validate on submit, and on blur for long forms.
- Validate on the client for user experience. The server validates for correctness. Show the server's 4xx field message through `normalizeApiError`.
- Money: parse user input to **integer minor units** without floating-point maths. Project example:

```ts
export const parseAmountToCents = (value: string): number | null => {
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
};
```

- Disable the submit button while a mutation is pending, and ignore double taps (`isPending`, or an in-flight flag in services).
- Use the platform keyboard type (`keyboardType="decimal-pad"`, `email-address`, `phone-pad`) and `autoComplete` / `textContentType` hints.

---

## 8. Loading, empty, error and offline states

Every data screen handles all four states:

```tsx
if (isLoading) return <LoadingState />;
if (isError) return <ErrorState message={normalizeApiError(error).message} onRetry={refetch} />;
if (!data?.length) return <EmptyState title={t('orders.emptyTitle')} />;
return <OrderList data={data} refreshing={isRefetching} onRefresh={refetch} />;
```

- **Offline:** a global listener (project example `GlobalOfflineListener`, based on NetInfo) shows a banner. Requests fail fast with `NETWORK_OFFLINE` instead of waiting for the timeout.
- **Offline-first** (queueing writes, a persisted cache) is a product decision. If you need it, use React Query persisters and an explicit outbox. Don't use ad-hoc AsyncStorage writes.
- Show cached data with a "stale"/offline banner instead of an error screen when you can.

---

## 9. Logging and debugging

| Tool | Use |
| --- | --- |
| Reactotron (dev only, `require`d under `__DEV__`) | API calls, Redux state, custom logs, socket events |
| React Native DevTools / Hermes debugger (press `j` in Metro) | Breakpoints, console |
| Xcode console / `adb logcat` | Native crashes, SDK logs, release-build issues |
| Activity log (project example `pushActivityLog`) | An in-app log of socket, background and system events for field debugging |

Rules:

- Prefix logs by area: `[API]`, `[Socket]`, `[Square:SDK]`, `[PushNotifications]`.
- Guard verbose logs with `if (__DEV__)`. Release builds strip `console.log` with `babel-plugin-transform-remove-console` (project example keeps `error` and `warn`):

```js
...(isProduction ? [['transform-remove-console', { exclude: ['error', 'warn'] }]] : [])
```

- **Never log** tokens, full request bodies with personal data, card data, env values or authorization codes. Log IDs, status codes and flags instead (for example `{ buildIsSandbox, backendIsSandbox }`, not the IDs themselves).

---

## 10. Performance

### 10.1 Rendering

- Memoise list items (`React.memo`) and callbacks passed to them (`useCallback`). Compute derived data with `useMemo`.
- Select narrow Redux slices (`useSelector((s) => s.auth.user.id)`), not the whole state.
- Keep high-frequency updates (GPS, socket ticks) out of global state. Throttle them before they reach React. The project example throttles location emits and location-updated handling to one every few minutes.
- Bottom tabs keep screens mounted. Pause work on unfocused tabs (`useIsFocused`, or a custom `usePausedTabScreen`).

### 10.2 FlatList

```tsx
<FlatList
  data={items}
  keyExtractor={(item) => String(item.id)}
  renderItem={renderItem}              // stable, memoised
  getItemLayout={fixedHeight ? (_, i) => ({ length: H, offset: H * i, index: i }) : undefined}
  initialNumToRender={10}
  windowSize={7}
  maxToRenderPerBatch={10}
  removeClippedSubviews={Platform.OS === 'android'}
  onEndReachedThreshold={0.5}
/>
```

Never nest a vertical `FlatList` in a `ScrollView`. Use `ListHeaderComponent` / `ListFooterComponent` instead.

### 10.3 Images and media

- Use a caching image component (project example: `react-native-fast-image`; `expo-image` in newer SDKs).
- Resize and compress photos before upload (`expo-image-manipulator`). Don't upload 12 MP originals over cellular.
- Size images to the space they're shown in. Use `resizeMode` and avoid scaling large images down at render time.

### 10.4 Maps

Memoise markers, avoid re-creating the `region` object on every render, and limit the number of on-screen markers. See [03 §4](03-mobile-environment-and-integrations.md#4-google-maps-and-location).

---

## 11. UI patterns

### 11.1 Theme and reusable components

- One theme source (colors, spacing, typography) through context. Components read `useTheme()` and never hardcode hex colors.
- Reuse existing building blocks (cards, section headers, selection rows, modals) before creating new ones.

### 11.2 Safe areas, keyboard, responsive layout

- Wrap the app in `SafeAreaProvider`. Use `useSafeAreaInsets()` for headers, footers and floating buttons.
- Forms: `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`, plus `keyboardShouldPersistTaps="handled"` on the scroll view.
- Tablets: the project example supports tablets (`supportsTablet: true`) and has a `useTabletLayout` hook. Branch on width (`useWindowDimensions`), not on the device model.
- Respect the system font scale. Test with the largest accessibility text size.

### 11.3 Accessibility

- `accessibilityLabel` on icon-only buttons, `accessibilityRole` on touchables, `accessibilityState` for toggles and disabled controls.
- Minimum 44×44 pt touch targets, sufficient contrast in both light and dark themes.
- Don't convey information only through color (status chips need text too).

---

## 12. Platform-specific code and iOS vs Android differences

```ts
Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT
Platform.select({ ios: 'padding', android: 'height' })
// or file suffixes: Component.ios.tsx / Component.android.tsx
```

| Area | iOS | Android |
| --- | --- | --- |
| Permissions | Prompt once; afterwards only Settings | Can re-prompt; "Don't ask again" → `NEVER_ASK_AGAIN` → Settings |
| Notifications permission | Always requested | Runtime permission only on API 33+ (`POST_NOTIFICATIONS`) |
| Background location | "Always" upgrade prompt, `UIBackgroundModes: location` | `ACCESS_BACKGROUND_LOCATION` + **foreground service** notification; can't start the service from the background on Android 12+ |
| Maps provider | Apple Maps by default; Google needs the Google Maps SDK + key | Google Maps (needs key) |
| Back navigation | Swipe | Hardware back button. Handle it in modals and flows |
| Networking | ATS blocks plain HTTP by default | Cleartext blocked by default (API 28+) |
| WebSockets | Reliable | Some dev-build network inspectors break the WS upgrade → allow polling fallback ([03 §7](03-mobile-environment-and-integrations.md#7-sockets-and-realtime)) |
| Status / nav bar | Status bar style only | Status **and** navigation bar color (`expo-navigation-bar`) |

---

## 13. Permissions

Pattern: **check → explain (if needed) → request → handle denial → offer Settings**.

```ts
const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
  Alert.alert(t('permissions.locationTitle'), t('permissions.locationMessage'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('system.openSettings'), onPress: () => Linking.openSettings() },
  ]);
}
```

- Ask at the moment the feature needs it ("Take payment" → location and Bluetooth), not at launch.
- Every iOS permission needs an `Info.plist` usage string that explains the real purpose. App Review rejects vague ones. In Expo, set them in `app.config.js` (`ios.infoPlist`) or through the plugin options (`expo-camera`, `expo-location`, `expo-image-picker`).
- Declare only the Android permissions you use. Background location and broad storage permissions trigger Play Console declarations.
- Re-check on `AppState → active`. The user may have changed the permission in Settings.

**Project example permission set:** camera, microphone, photo library (read/add), location when-in-use and always, Face ID, notifications, plus the payment-reader permissions Bluetooth scan/connect, record audio and read phone state, requested only when taking a payment.

---

## 14. Localization

- Every user-facing string goes through `t('section.key')`. No hardcoded strings in components, alerts or toasts, and that includes error messages from services.
- **Project example:** i18next with one TypeScript file per locale in `src/i18n/locales/`. The selected language is persisted, the `Accept-Language` header follows the active language, and RTL is enabled for Arabic (`I18nManager.allowRTL` / `forceRTL`, which needs an app restart).
- Keep `en.ts` as the source of truth. Make missing keys fail visibly in development.
- Interpolate (`t('orders.count', { count })`). Don't concatenate translated fragments.
- Native permission prompts aren't translated by i18next. Localise them with `InfoPlist.strings` (iOS) or Android string resources if you need that.

> Project example gap: some service-level messages (payment errors) were still hardcoded English strings. Move these into translation keys too.

---

## 15. Dates and timezones

- The backend sends ISO-8601 in UTC (`2026-03-01T14:00:00Z`). The app converts to local time **only for display**.
- Send dates back as UTC ISO strings. Send date-only values (birthdays, due dates) as `YYYY-MM-DD` with no time, so they don't shift a day across timezones.
- Format with the user's locale. The project example uses `moment`. For new projects prefer `date-fns` / `dayjs` or `Intl.DateTimeFormat`, which are smaller and immutable.
- Time-sensitive SDKs fail when the device clock is wrong. The Square SDK reports `DEVICE_TIME_DOES_NOT_MATCH_SERVER_TIME`. Show a clear message for this.

---

## 16. Production code quality checklist

- [ ] No direct axios/fetch in screens; every request uses the shared client
- [ ] Every query screen handles loading, empty, error (with retry) and offline
- [ ] All user-facing text is translated, including alerts, toasts and service errors
- [ ] No `console.log` without a `__DEV__` guard; nothing sensitive logged
- [ ] Effects and listeners clean up (sockets, AppState, Linking, notifications, timers)
- [ ] Long-lived resources are released in `performLogout`
- [ ] Money as integer minor units; dates as UTC ISO
- [ ] Lists memoised with stable `keyExtractor`; no nested virtualised lists
- [ ] Permissions requested in context, with denial and Settings paths
- [ ] Accessibility labels on icon buttons; tested with large text
- [ ] Tested on iOS **and** Android, including one physical device
- [ ] `pnpm lint`, type-check and `format:check` pass
