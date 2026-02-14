#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DESKTOP_APP_FILE="src/App.tsx"
CONTROLLER_FILE="src/controllers/desktop/useDesktopSettingsImageUploadController.ts"

echo "== Desktop settings image-upload controller regression checks =="

echo "[1/6] Desktop app should import and instantiate settings image-upload controller..."
if ! grep -q 'from "./controllers/desktop/useDesktopSettingsImageUploadController"' "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not importing useDesktopSettingsImageUploadController"
  exit 1
fi
if ! grep -q "useDesktopSettingsImageUploadController({" "$DESKTOP_APP_FILE"; then
  echo "FAIL: desktop App.tsx is not instantiating useDesktopSettingsImageUploadController"
  exit 1
fi

echo "[2/6] Desktop app should not keep inline settings/profile image handlers..."
if grep -q "function handleSettingsBannerDrop" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleSettingsBannerDrop"
  exit 1
fi
if grep -q "function handleSettingsAvatarDrop" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleSettingsAvatarDrop"
  exit 1
fi
if grep -q "async function handleCommunityAvatarUpload" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleCommunityAvatarUpload"
  exit 1
fi
if grep -q "async function handleCommunityBannerUpload" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleCommunityBannerUpload"
  exit 1
fi
if grep -q "async function handleProfileAvatarUpload" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleProfileAvatarUpload"
  exit 1
fi
if grep -q "function handleProfileAvatarDrop" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx still defines inline handleProfileAvatarDrop"
  exit 1
fi

echo "[3/6] Controller file should export useDesktopSettingsImageUploadController..."
if ! grep -q "export function useDesktopSettingsImageUploadController" "$CONTROLLER_FILE"; then
  echo "FAIL: controller export missing in $CONTROLLER_FILE"
  exit 1
fi

echo "[4/6] Controller should own avatar/banner processing paths..."
if ! grep -q "readAvatarFileAsSquareDataUrl" "$CONTROLLER_FILE"; then
  echo "FAIL: controller is missing readAvatarFileAsSquareDataUrl usage"
  exit 1
fi
if ! grep -q "readBannerFileAsWideDataUrlWithinLimit" "$CONTROLLER_FILE"; then
  echo "FAIL: controller is missing readBannerFileAsWideDataUrlWithinLimit usage"
  exit 1
fi
if ! grep -q "Banner must be an image file" "$CONTROLLER_FILE"; then
  echo "FAIL: controller is missing banner image-file guard message"
  exit 1
fi

echo "[5/6] Desktop app should still wire controller-returned handlers to settings/profile UI..."
if ! grep -q "onDrop={handleProfileAvatarDrop}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: profile avatar drop target is not wired to handleProfileAvatarDrop"
  exit 1
fi
if ! grep -q "onDrop={handleSettingsBannerDrop}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: settings banner drop target is not wired to handleSettingsBannerDrop"
  exit 1
fi
if ! grep -q "onDrop={handleSettingsAvatarDrop}" "$DESKTOP_APP_FILE"; then
  echo "FAIL: settings avatar drop target is not wired to handleSettingsAvatarDrop"
  exit 1
fi
if ! grep -q "void handleProfileAvatarUpload" "$DESKTOP_APP_FILE"; then
  echo "FAIL: profile avatar file input is not wired to handleProfileAvatarUpload"
  exit 1
fi
if ! grep -q "void handleCommunityBannerUpload" "$DESKTOP_APP_FILE"; then
  echo "FAIL: community banner input is not wired to handleCommunityBannerUpload"
  exit 1
fi
if ! grep -q "void handleCommunityAvatarUpload" "$DESKTOP_APP_FILE"; then
  echo "FAIL: community avatar input is not wired to handleCommunityAvatarUpload"
  exit 1
fi

echo "[6/6] App should pass drag-state setters and dirty-marker into the controller..."
if ! grep -q "setIsSettingsBannerDragOver" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing setIsSettingsBannerDragOver to controller"
  exit 1
fi
if ! grep -q "setIsSettingsAvatarDragOver" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing setIsSettingsAvatarDragOver to controller"
  exit 1
fi
if ! grep -q "setIsProfileAvatarDragOver" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing setIsProfileAvatarDragOver to controller"
  exit 1
fi
if ! grep -q "markCommunitySettingsDirty" "$DESKTOP_APP_FILE"; then
  echo "FAIL: App.tsx is not passing markCommunitySettingsDirty to controller"
  exit 1
fi

echo "PASS: desktop settings image-upload controller regression checks passed."
