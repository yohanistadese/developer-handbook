# Mobile Development Handbook

A practical, reusable guide to building React Native / Expo apps, from an empty machine to a monitored production release.

It's based on a real production app (Expo SDK 51, React Native 0.74, committed native folders, Square in-person payments, Google Maps, background location, push notifications and Socket.IO). Every project-specific value has been replaced with placeholders such as `ProjectName`, `YOUR_API_URL`, `YOUR_BUNDLE_ID`, `YOUR_PACKAGE_NAME`, `YOUR_GOOGLE_MAPS_KEY` and `YOUR_SQUARE_APPLICATION_ID`. Throughout the guides, **Project example** marks what was verified in that app, and **General recommendation** marks what you should do in a new one.

## Learning path

| Step | Guide | Open it when you need to… |
| --- | --- | --- |
| **01** | [Mobile Project Setup](01-mobile-project-setup.md) | Set up a Mac (Node, pnpm, Xcode, CocoaPods, JDK, Android SDK), create or clone a project, run it on simulators and devices, and understand managed vs prebuild vs native folders |
| **02** | [Architecture & Development](02-mobile-architecture-and-development.md) | Structure features: API layer, React Query, Redux, navigation, auth, errors, offline, storage, performance, UI, permissions, i18n, dates |
| **03** | [Environments & Integrations](03-mobile-environment-and-integrations.md) | Separate Dev / Trial / Production, manage env vars and EAS environments, iOS schemes and app identity, and integrate Google Maps and location, Square payments, push notifications and sockets |
| **04** | [Build, Release & Store Deployment](04-mobile-build-release-and-store-deployment.md) | Build APK/AAB/IPA locally or with EAS, handle signing and credentials, ship through Play Console, TestFlight and App Store, and run the release checklist |
| **05** | [Troubleshooting & Best Practices](05-mobile-troubleshooting-and-best-practices.md) | Fix Metro, Gradle, CocoaPods, Xcode, EAS, env, network, maps, payment, push and socket problems; apply production best practices and the final production checklist |

## Where to start

- **New to the project or machine:** start with **01**, then skim **03 §1–3** (environments) before running anything against a real backend.
- **Building a feature:** **02**, plus the matching integration section in **03**.
- **Preparing a release:** **04 §7** (release checklist) and **05 §14** (production checklist).
- **Something is broken:** **05 §1** (triage), then the section for the area that's failing.

## Quick reference

```bash
pnpm install                 # dependencies (pnpm only)
pnpm pods                    # iOS native dependencies
pnpm start:dev -c            # Metro, development env, cleared cache
pnpm ios:dev                 # iOS, development scheme
pnpm android                 # Android debug
eas env:pull --environment development --path .env.development
eas build --profile preview --platform all      # trial / QA build
eas build --profile production --platform all   # store build
eas submit --platform ios --latest
```

## Conventions used

- `ProjectName`: your app's name. `ProjectName Dev` / `ProjectName Trial` / `ProjectName` are the three environment builds.
- Placeholders in `UPPER_SNAKE_CASE` (`YOUR_API_URL`) must be replaced with your values. Real values never go in this handbook or in Git.
- ⚠️ marks common mistakes that have caused real build, release or environment problems.
