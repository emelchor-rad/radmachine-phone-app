import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { RadClient } from '../src/api/client';
import { baseUrlFor, fetchAndStoreInstanceName, saveCredentials } from '../src/secure/credentials';

export default function Connect() {
  const [tenant, setTenant] = useState('emelchor');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');

  const verify = async () => {
    setStatus('Checking...');
    const baseUrl = baseUrlFor(tenant.trim());
    try {
      const c = new RadClient(baseUrl, token.trim());
      await c.get('/qa/unittestcollections/', { limit: '1' });
      await fetchAndStoreInstanceName(c, baseUrl);
      await saveCredentials(baseUrl, token.trim());
      setStatus('Connected.');
      router.replace('/');
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text>Tenant</Text>
      <TextInput
        value={tenant}
        onChangeText={setTenant}
        autoCapitalize="none"
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Text>API token</Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button title="Verify and save" onPress={verify} />
      <Text>{status}</Text>
    </View>
  );
}
