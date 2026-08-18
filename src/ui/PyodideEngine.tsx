import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Asset } from 'expo-asset';
import { WebView } from 'react-native-webview';
import { PYODIDE_RUNNER_HTML } from '../qa/pyodide-html';
import {
  handlePyodideMessage,
  registerPyodideInjector,
  unregisterPyodideInjector,
} from '../qa/pyodide-bridge';

/** Force Metro to bundle every Pyodide asset in assets/pyodide/. */
const PYODIDE_BUNDLE = [
  require('../../assets/pyodide/pyodide.js'),
  require('../../assets/pyodide/pyodide.asm.js'),
  require('../../assets/pyodide/pyodide.asm.wasm'),
  require('../../assets/pyodide/python_stdlib.zip'),
  require('../../assets/pyodide/pyodide-lock.json'),
];

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
        // Resolve one file; Expo places the whole pyodide/ folder beside it.
        const asset = Asset.fromModule(PYODIDE_BUNDLE[0]);
        await asset.downloadAsync();
        if (cancelled || !asset.localUri) return;
        const dir = asset.localUri.replace(/pyodide\.js$/, '');
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
