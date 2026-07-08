import type { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

type ExpoSdkModule = typeof import('expo-server-sdk');

let sdkPromise: Promise<ExpoSdkModule> | null = null;
let expoClient: Expo | null = null;

async function loadSdk(): Promise<ExpoSdkModule> {
  if (!sdkPromise) {
    sdkPromise = import('expo-server-sdk');
  }
  return sdkPromise;
}

export async function getExpoClient(): Promise<Expo> {
  if (!expoClient) {
    const { Expo } = await loadSdk();
    const accessToken = process.env.EXPO_ACCESS_TOKEN;
    expoClient = new Expo(accessToken ? { accessToken } : undefined);
  }
  return expoClient;
}

export async function isExpoPushToken(token: string): Promise<boolean> {
  const { Expo } = await loadSdk();
  return Expo.isExpoPushToken(token);
}

export type { ExpoPushMessage, ExpoPushTicket };
