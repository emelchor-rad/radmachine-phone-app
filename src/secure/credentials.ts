import * as SecureStore from 'expo-secure-store';
import type { RadClient } from '../api/client';

const TOKEN_KEY = 'radmachine_token';
const BASE_KEY = 'radmachine_base_url';
const INSTANCE_NAME_KEY = 'radmachine_instance_name';

/** RadMachine navbar blue. */
export const RADMACHINE_BLUE = '#3498db';

export function baseUrlFor(tenant: string): string {
  return `https://radmachine.radformation.com/${tenant}/api`;
}

/** Tenant slug from a saved API base URL, e.g. …/emelchor/api → emelchor. */
export function tenantFromBaseUrl(baseUrl: string): string | null {
  const m = baseUrl.match(/radmachine\.radformation\.com\/([^/]+)\/api\/?$/i);
  if (m) return m[1];
  try {
    const u = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[parts.length - 1] === 'api') return parts[parts.length - 2];
  } catch {
    // Not a standard RadMachine URL.
  }
  return null;
}

export function humanizeTenant(tenant: string): string {
  return tenant
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function instanceLabelFromBaseUrl(baseUrl: string): string {
  const tenant = tenantFromBaseUrl(baseUrl);
  return tenant ? humanizeTenant(tenant) : 'RadMachine';
}

export async function loadInstanceName(): Promise<string | null> {
  const name = await SecureStore.getItemAsync(INSTANCE_NAME_KEY);
  return name?.trim() || null;
}

export async function saveInstanceName(name: string): Promise<void> {
  await SecureStore.setItemAsync(INSTANCE_NAME_KEY, name.trim());
}

export async function resolveInstanceName(baseUrl: string): Promise<string> {
  const stored = await loadInstanceName();
  if (stored) return stored;
  return instanceLabelFromBaseUrl(baseUrl);
}

/** Fetch the Django site display name and cache it for offline worksheets. */
export async function fetchAndStoreInstanceName(
  client: RadClient,
  baseUrl: string
): Promise<string> {
  try {
    const sites = await client.getAll<{ name?: string; domain?: string }>('/sites/sites/', {
      limit: '10',
    });
    const match =
      sites.find((s) => s.name && s.name !== 'example.com') ??
      sites.find((s) => s.name) ??
      sites[0];
    if (match?.name?.trim()) {
      await saveInstanceName(match.name.trim());
      return match.name.trim();
    }
  } catch {
    // Sites API optional — fall back to tenant slug.
  }
  const label = instanceLabelFromBaseUrl(baseUrl);
  await saveInstanceName(label);
  return label;
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
  await SecureStore.deleteItemAsync(INSTANCE_NAME_KEY);
}
