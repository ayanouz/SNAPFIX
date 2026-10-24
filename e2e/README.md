# E2E tests

This folder contains a Maestro smoke flow for the demo build.

```bash
maestro test e2e/smoke.yaml
```

## Status

**Not run.** Maestro was not installed in the verification environment, and no native build was produced.

## Prerequisites

1. A development or preview build installed on an Android emulator/device or iOS simulator.
2. Demo mode enabled (no Supabase environment values, or `EXPO_PUBLIC_ENABLE_DEMO_MODE=true`).
3. Maestro CLI installed and available on `PATH`.

## What it covers

- cold launch with cleared state
- onboarding
- demo sign-in
- home, history, maintenance, and profile tabs
- the empty history state

## What it does not cover

- camera/gallery permission dialogs
- creating and analyzing a diagnosis
- notifications
- live Supabase auth or AI analysis
- billing
- RTL, dark mode, accessibility
- network failure and offline behavior

Add flows for those only after the native build and live backend are verified. Do not claim E2E coverage until the flow has actually run and its result is recorded.
