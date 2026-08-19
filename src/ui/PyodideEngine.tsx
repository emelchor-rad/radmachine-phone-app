import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { buildPyodideRunnerHtml } from '../qa/pyodide-html';
import {
  handlePyodideMessage,
  registerPyodideInjector,
  startPyodideBootWatch,
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

/** Bump when cache layout or runner HTML changes — forces a clean copy on device. */
const PYODIDE_CACHE_VERSION = '4';

type PyodideSource = { uri: string };

function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

async function preparePyodideSource(): Promise<PyodideSource> {
  const dir = `${FileSystem.cacheDirectory}pyodide/`;
  const versionPath = `${dir}.cache-version`;

  let cachedVersion: string | null = null;
  try {
    const versionInfo = await FileSystem.getInfoAsync(versionPath);
    if (versionInfo.exists) {
      cachedVersion = await FileSystem.readAsStringAsync(versionPath);
    }
  } catch {
    cachedVersion = null;
  }

  if (cachedVersion !== PYODIDE_CACHE_VERSION) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }

  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  for (const f of PYODIDE_FILES) {
    const asset = Asset.fromModule(f.module);
    await asset.downloadAsync();
    if (!asset.localUri) {
      throw new Error(`Missing Pyodide asset ${f.name} — run npm run setup:pyodide`);
    }
    await FileSystem.copyAsync({ from: asset.localUri, to: `${dir}${f.name}` });
  }

  const pyodideJs = await FileSystem.readAsStringAsync(`${dir}pyodide.js`);
  if (!pyodideJs.includes('loadPyodide')) {
    throw new Error('pyodide.js in cache looks wrong — run npm run setup:pyodide');
  }

  const htmlPath = `${dir}runner.html`;
  await FileSystem.writeAsStringAsync(htmlPath, buildPyodideRunnerHtml(pyodideJs));
  await FileSystem.writeAsStringAsync(versionPath, PYODIDE_CACHE_VERSION);

  return { uri: toFileUri(htmlPath) };
}

const BOOT_INJECT = `
(function () {
  if (window.__radmachineBoot) window.__radmachineBoot();
})();
true;
`;

/**
 * Hidden WebView that boots Pyodide from app-bundled assets — no CDN, works in
 * airplane mode (bunker) from the first worksheet open after install.
 *
 * Android throttles or skips work in 0×0 WebViews, so keep a small off-screen
 * surface while WASM compiles (can take 30–90 s on a phone).
 */
export function PyodideEngine() {
  const ref = useRef<WebView>(null);
  const [source, setSource] = useState<PyodideSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await preparePyodideSource();
        if (!cancelled) setSource(next);
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

  if (!source) return null;

  return (
    <View
      style={{ position: 'absolute', top: -500, left: 0, width: 100, height: 100, opacity: 0.01 }}
      pointerEvents="none"
    >
      <WebView
        ref={ref}
        source={{ uri: source.uri }}
        originWhitelist={['*']}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        onLoadStart={() => startPyodideBootWatch()}
        onLoadEnd={() => {
          registerPyodideInjector((js) => ref.current?.injectJavaScript(js));
          ref.current?.injectJavaScript(BOOT_INJECT);
        }}
        onMessage={(e) => handlePyodideMessage(e.nativeEvent.data)}
        onError={() =>
          handlePyodideMessage(
            JSON.stringify({ type: 'boot-error', message: 'Pyodide WebView failed to load' })
          )
        }
        onHttpError={() =>
          handlePyodideMessage(
            JSON.stringify({ type: 'boot-error', message: 'Pyodide WebView HTTP error' })
          )
        }
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled={false}
        scrollEnabled={false}
        {...(Platform.OS === 'android' ? { androidLayerType: 'software' as const } : {})}
      />
    </View>
  );
}
