import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { PYODIDE_RUNNER_HTML } from '../qa/pyodide-html';
import {
  handlePyodideMessage,
  registerPyodideInjector,
  unregisterPyodideInjector,
} from '../qa/pyodide-bridge';

/**
 * Metro-safe asset copies. Never require pyodide.js here — Metro would try to
 * transform it and fail on dynamic import().
 */
const PYODIDE_FILES: { module: number; name: string }[] = [
  { module: require('../../assets/pyodide/pyodide.runtime.bin'), name: 'pyodide.js' },
  { module: require('../../assets/pyodide/pyodide.asm.bin'), name: 'pyodide.asm.js' },
  { module: require('../../assets/pyodide/pyodide.asm.wasm'), name: 'pyodide.asm.wasm' },
  { module: require('../../assets/pyodide/python_stdlib.zip'), name: 'python_stdlib.zip' },
  { module: require('../../assets/pyodide/pyodide-lock.bin'), name: 'pyodide-lock.json' },
];

async function preparePyodideDir(): Promise<string> {
  const dir = `${FileSystem.cacheDirectory}pyodide/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  for (const f of PYODIDE_FILES) {
    const asset = Asset.fromModule(f.module);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error(`Missing asset ${f.name}`);
    const dest = `${dir}${f.name}`;
    const info = await FileSystem.getInfoAsync(dest);
    if (!info.exists) {
      await FileSystem.copyAsync({ from: asset.localUri, to: dest });
    }
  }

  return dir;
}

/**
 * Hidden WebView that boots Pyodide from app-bundled assets — no CDN, works in
 * airplane mode (bunker) from the first worksheet open after install.
 */
export function PyodideEngine() {
  const ref = useRef<WebView>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dir = await preparePyodideDir();
        if (cancelled) return;
        const base = Platform.OS === 'android' ? `file://${dir}` : dir;
        setBaseUrl(base);
      } catch (e) {
        handlePyodideMessage(JSON.stringify({ type: 'boot-error', message: String(e) }));
      }
    })();
    return () => {
      cancelled = true;
      unregisterPyodideInjector();
    };
  }, []);

  useEffect(() => {
    return () => unregisterPyodideInjector();
  }, []);

  if (!baseUrl) return null;

  return (
    <View style={{ width: 0, height: 0, opacity: 0 }} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ html: PYODIDE_RUNNER_HTML, baseUrl }}
        originWhitelist={['*']}
        onLoadEnd={() => {
          registerPyodideInjector((js) => ref.current?.injectJavaScript(js));
        }}
        onMessage={(e) => handlePyodideMessage(e.nativeEvent.data)}
        onError={() =>
          handlePyodideMessage(
            JSON.stringify({ type: 'boot-error', message: 'Pyodide WebView failed to load' })
          )
        }
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        scrollEnabled={false}
      />
    </View>
  );
}
