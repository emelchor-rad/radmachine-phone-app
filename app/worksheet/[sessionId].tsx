import { useEffect, useState } from 'react';
import { Button, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getTests } from '../../src/db/collections';
import { loadDraft, markCompleted, setValue } from '../../src/db/sessions';
import { enqueue } from '../../src/db/outbox';
import { buildPayload } from '../../src/sync/payload';
import { nowStamp } from '../../src/sync/time';
import type { TestDef, DraftValue } from '../../src/api/types';

export default function Worksheet() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [tests, setTests] = useState<TestDef[]>([]);
  const [values, setValues] = useState<Record<string, DraftValue>>({});
  // What the user has literally typed, kept apart from the parsed number.
  // Rendering String(Number(text)) would eat the decimal separator the moment
  // it is typed: '0.' -> 0 -> '0', so '0.5' would end up as 5.
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const draft = await loadDraft(sessionId);
      setTests(await getTests(draft.utcUrl));
      setValues(draft.values);
      const seed: Record<string, string> = {};
      for (const [slug, dv] of Object.entries(draft.values)) {
        if (typeof dv.value === 'number') seed[slug] = String(dv.value);
      }
      setTexts(seed);
    })();
  }, [sessionId]);

  const update = async (slug: string, v: DraftValue) => {
    setValues((prev) => ({ ...prev, [slug]: v }));
    await setValue(sessionId, slug, v); // persist on every change
  };

  const updateNumber = async (slug: string, txt: string) => {
    setTexts((prev) => ({ ...prev, [slug]: txt }));
    // Some Android keyboards emit a comma as the decimal separator.
    const raw = txt.trim().replace(',', '.');
    const n = Number(raw);
    await update(slug, { value: raw === '' || !Number.isFinite(n) ? null : n });
  };

  const finish = async () => {
    const completed = nowStamp();
    await markCompleted(sessionId, completed);
    const draft = await loadDraft(sessionId);
    const payload = buildPayload(tests, { ...draft, workCompleted: completed });
    await enqueue(sessionId, payload);
    router.replace('/queue');
  };

  let lastSublist: string | null | undefined;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      {tests.map((t) => {
        const header = t.sublist !== lastSublist ? ((lastSublist = t.sublist), t.sublist) : null;
        const v = values[t.slug]?.value ?? null;
        return (
          <View key={t.slug}>
            {header ? (
              <Text style={{ fontWeight: 'bold', marginTop: 12 }}>{header}</Text>
            ) : null}
            <Text>{t.name}</Text>
            {t.type === 'boolean' ? (
              <Switch
                value={v === true}
                onValueChange={(b) => update(t.slug, { value: b })}
              />
            ) : (
              <TextInput
                keyboardType="numeric"
                value={texts[t.slug] ?? ''}
                onChangeText={(txt) => updateNumber(t.slug, txt)}
                style={{ borderWidth: 1, padding: 8 }}
              />
            )}
          </View>
        );
      })}
      <Button title="Finish and queue" onPress={finish} />
    </ScrollView>
  );
}
