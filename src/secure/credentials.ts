import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'radmachine_token';
const BASE_KEY = 'radmachine_base_url';

export function baseUrlFor(tenant: string): string {
  return `https://radmachine.radformation.com/${tenant}/api`;
}

/**
 * Store the API token and base URL in the device's secure keystore
 * (Android Keystore / iOS Keychain via expo-secure-store).
 *
 * Contract: the caller MUST verify the token against the live API
 * (e.g. via RadClient, as done by the connection screen) BEFORE calling
 * this function. An unverified token stored here would fail silently
 * later, once the device is offline in the field, with no way to
 * diagnose it. This module does not perform that verification itself.
 */
export async function saveCredentials(baseUrl: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(BASE_KEY, baseUrl);
}

export async function loadCredentials(): Promise<{ baseUrl: string; token: string } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const baseUrl = await SecureStore.getItemAsync(BASE_KEY);
  if (!token || !baseUrl) return null;
  return { baseUrl, token };
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(BASE_KEY);
}
