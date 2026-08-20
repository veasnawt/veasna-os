#!/bin/bash
#
# Downloads the prebuilt FFmpegKit iOS "full" (non-GPL) frameworks and installs
# them into ./Frameworks as .xcframeworks. Run by the podspec's prepare_command,
# same as the Android side needing its own AAR fetch step.
#
# "full" vs "full-gpl": sk3llo's fork splits what arthenica's single GPL "full"
# package used to be into an LGPL-3.0 "full" (dav1d/kvazaar/libvpx/etc, PLUS
# h264_videotoolbox/hevc_videotoolbox — Apple's own hardware encoders, no
# licensing concern since nothing GPL is linked to reach them) and a separate
# "full-gpl" that additionally adds libx264/libfdk-aac. We want the former:
# real H.264 export via VideoToolbox with none of GPLv3's linking obligations
# for App Store/TestFlight distribution. Confirmed by inspecting the actual
# compiled libavcodec binary — h264_videotoolbox/hevc_videotoolbox are present,
# libx264/libx265 are not — not just by trusting the package name.
#
# Adapted from sk3llo/ffmpeg_kit_flutter's scripts/setup_ios.sh (MIT-licensed
# build tooling, not the LGPL FFmpeg binaries themselves) — that project is the
# actively maintained continuation of arthenica/ffmpeg-kit, which retired in
# 2025 and pulled its own release assets. Its release ships fat frameworks
# (x86_64 + arm64 + arm64e in one binary), which can't represent both a
# device-arm64 slice and a simulator-arm64 slice at once (same CPU, different
# platform tag) — Apple Silicon simulators need the latter. This retags a
# thinned arm64 slice from iOS-device to iOS-simulator via `vtool` to build a
# real xcframework, rather than shipping a fat framework that only works on
# Intel simulators or real devices, not both.
set -euo pipefail

VERSION="8.1.2"
VARIANT="full"
DEFAULT_URL="https://github.com/sk3llo/ffmpeg_kit_flutter/releases/download/${VERSION}-${VARIANT}/ffmpeg-kit-ios-${VARIANT}-${VERSION}.zip"
IOS_URL="${FFMPEG_KIT_IOS_URL:-$DEFAULT_URL}"

FRAMEWORKS="ffmpegkit libavcodec libavdevice libavfilter libavformat libavutil libswresample libswscale"

if [ -d "Frameworks/ffmpegkit.xcframework" ]; then
  echo "[ffmpeg-kit-lgpl] iOS frameworks already present — skipping download."
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ffmpegkit-ios.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

fail() {
  echo "" >&2
  echo "[ffmpeg-kit-lgpl] ERROR: could not set up the iOS frameworks: $1" >&2
  echo "  Downloaded from: $IOS_URL" >&2
  echo "  If that URL is unreachable, mirror the zip and re-run with:" >&2
  echo "    FFMPEG_KIT_IOS_URL=https://your-mirror/... pod install" >&2
  exit 1
}

CURL_ARGS=(-fL --retry 3 --retry-delay 2 --connect-timeout 30)
if curl --help all 2>/dev/null | grep -q -- '--retry-all-errors'; then
  CURL_ARGS+=(--retry-all-errors)
fi

echo "[ffmpeg-kit-lgpl] Downloading iOS frameworks ($VARIANT $VERSION)..."
if ! curl "${CURL_ARGS[@]}" -o "$WORK/frameworks.zip" "$IOS_URL"; then
  fail "the download failed (see the curl output above)."
fi

[ -s "$WORK/frameworks.zip" ] || fail "the downloaded file is empty."
unzip -tq "$WORK/frameworks.zip" >/dev/null 2>&1 || fail "the downloaded file is not a valid zip."

mkdir -p "$WORK/extract"
unzip -oq "$WORK/frameworks.zip" -d "$WORK/extract"
rm -rf "$WORK/extract/__MACOSX"

for FW in $FRAMEWORKS; do
  [ -d "$WORK/extract/${FW}.framework" ] || fail "the archive is missing ${FW}.framework."
done

for FW in $FRAMEWORKS; do
  BIN="$WORK/extract/${FW}.framework/${FW}"
  [ -f "$BIN" ] && xcrun bitcode_strip -r "$BIN" -o "$BIN" 2>/dev/null || true
done

convert_to_xcframework() {
  local FW="$1" BASE="$2"
  local DIR="${BASE}/${FW}.framework"
  local BIN="${DIR}/${FW}"
  [ -d "$DIR" ] || return 0

  local ARCHS MINOS SDK
  ARCHS=$(lipo -archs "$BIN")
  MINOS=$(otool -l -arch arm64 "$BIN" 2>/dev/null | awk '/LC_BUILD_VERSION/{b=1} b&&/minos/{print $2; exit}')
  SDK=$(otool -l -arch arm64 "$BIN" 2>/dev/null | awk '/LC_BUILD_VERSION/{b=1} b&&/sdk/{print $2; exit}')
  [ -n "$MINOS" ] || MINOS="14.0"
  [ -n "$SDK" ] || SDK="$MINOS"

  local STAGE="${BASE}/.xc_tmp/${FW}"
  rm -rf "$STAGE"
  mkdir -p "$STAGE/device" "$STAGE/sim"
  cp -R "$DIR" "$STAGE/device/${FW}.framework"
  cp -R "$DIR" "$STAGE/sim/${FW}.framework"

  # Device slice: arm64 only (arm64e is dropped — App Store apps run as arm64).
  lipo "$BIN" -thin arm64 -output "$STAGE/arm64.dylib"
  lipo -create "$STAGE/arm64.dylib" -output "$STAGE/device/${FW}.framework/${FW}"

  # Simulator slice: x86_64 + arm64 retagged from device to simulator.
  local SIM_ARGS=()
  if echo "$ARCHS" | tr ' ' '\n' | grep -qx "x86_64"; then
    lipo "$BIN" -thin x86_64 -output "$STAGE/x86_64.dylib"
    SIM_ARGS+=("$STAGE/x86_64.dylib")
  fi
  if echo "$ARCHS" | tr ' ' '\n' | grep -qx "arm64"; then
    lipo "$BIN" -thin arm64 -output "$STAGE/arm64-dev.dylib"
    vtool -arch arm64 -set-build-version 7 "$MINOS" "$SDK" -replace \
      -output "$STAGE/arm64-sim.dylib" "$STAGE/arm64-dev.dylib"
    SIM_ARGS+=("$STAGE/arm64-sim.dylib")
  fi
  lipo -create "${SIM_ARGS[@]}" -output "$STAGE/sim/${FW}.framework/${FW}"

  rm -rf "${BASE}/${FW}.xcframework"
  xcodebuild -create-xcframework \
    -framework "$STAGE/device/${FW}.framework" \
    -framework "$STAGE/sim/${FW}.framework" \
    -output "${BASE}/${FW}.xcframework" >/dev/null

  rm -rf "$DIR" "$STAGE"
}

echo "[ffmpeg-kit-lgpl] Building xcframeworks..."
for FW in $FRAMEWORKS; do
  convert_to_xcframework "$FW" "$WORK/extract"
done
rm -rf "$WORK/extract/.xc_tmp"

for FW in $FRAMEWORKS; do
  [ -d "$WORK/extract/${FW}.xcframework" ] || fail "failed to build ${FW}.xcframework."
done

rm -rf Frameworks
mkdir -p Frameworks
for FW in $FRAMEWORKS; do
  mv "$WORK/extract/${FW}.xcframework" "Frameworks/${FW}.xcframework"
done

echo "[ffmpeg-kit-lgpl] iOS frameworks installed successfully."
