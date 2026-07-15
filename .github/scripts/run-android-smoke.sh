#!/usr/bin/env bash
# Runs the vizij-standalone instrumented launch smoke test against an already
# booted emulator. Invoked by the reactivecircus/android-emulator-runner
# `script:` step, which boots the emulator (and waits for boot) before calling us.
#
# Two things make the smoke test flaky in CI, both rooted in the headless
# software GPU (`-gpu swiftshader_indirect`):
#   1. A transient `adb: device offline` right at install / test start while the
#      emulator is still settling. This we recover from HERE with a short adb
#      recycle + inner retry, cheaper than a full emulator reboot.
#   2. A swiftshader surface-allocation crash ("Failed to find ColorBuffer: N")
#      that takes the whole emulator process down. That is unrecoverable from
#      inside this script — the caller re-runs the entire action step (a fresh
#      emulator boot) when we exit non-zero.
set -uo pipefail

ANDROID_DIR="${ANDROID_DIR:-apps/vizij-standalone/src-tauri/gen/android}"

# Belt-and-suspenders boot settle. The action already waits for boot, but
# disable-animations and the emulator console can race the first adb call.
timeout 180 adb wait-for-device || true
for _ in $(seq 1 60); do
  [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 2
done
adb shell input keyevent 82 >/dev/null 2>&1 || true # dismiss the keyguard

run_gradle() {
  ( cd "$ANDROID_DIR" && ./gradlew :app:connectedUniversalDebugAndroidTest \
      -x rustBuildArm64Debug -x rustBuildArmDebug \
      -x rustBuildX86Debug -x rustBuildX86_64Debug )
}

attempts=2
for i in $(seq 1 "$attempts"); do
  echo "::group::connectedUniversalDebugAndroidTest (inner attempt ${i}/${attempts})"
  if run_gradle; then
    echo "::endgroup::"
    exit 0
  fi
  echo "::endgroup::"
  if [ "$i" -lt "$attempts" ]; then
    echo "::warning::instrumented test attempt ${i} failed; recycling adb before retry"
    adb kill-server || true
    adb start-server || true
    timeout 120 adb wait-for-device || true
    sleep 5
  fi
done

# All inner attempts failed. Signal the caller to spin up a fresh emulator.
exit 1
