import { NativeModules, Platform } from "react-native";

type KioskNative = {
  enterLockTask(): Promise<void>;
  exitLockTask(): Promise<void>;
  isInLockTaskMode(): Promise<boolean>;
  isDeviceOwnerApp(): Promise<boolean>;
  applyDeviceOwnerPolicies(): Promise<boolean>;
  clearDeviceOwnerPolicies(): Promise<boolean>;
  setImmersive(enabled: boolean): Promise<void>;
  setScreenSecure(enabled: boolean): Promise<void>;
};

const Native: KioskNative | undefined = NativeModules.KioskModule;

function requireAndroid() {
  if (Platform.OS !== "android") throw new Error("KioskModule is Android-only");
  if (!Native) throw new Error("KioskModule native module is not linked");
  return Native;
}

export async function enterKioskMode() {
  return requireAndroid().enterLockTask();
}

export async function exitKioskMode() {
  return requireAndroid().exitLockTask();
}

export async function isKioskModeActive() {
  return requireAndroid().isInLockTaskMode();
}

export async function isDeviceOwnerApp() {
  return requireAndroid().isDeviceOwnerApp();
}

export async function applyDeviceOwnerPolicies() {
  return requireAndroid().applyDeviceOwnerPolicies();
}

export async function clearDeviceOwnerPolicies() {
  return requireAndroid().clearDeviceOwnerPolicies();
}

export async function setImmersive(enabled: boolean) {
  return requireAndroid().setImmersive(enabled);
}

export async function setScreenSecure(enabled: boolean) {
  return requireAndroid().setScreenSecure(enabled);
}
