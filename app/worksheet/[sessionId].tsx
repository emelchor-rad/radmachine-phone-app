import { useEffect, useState } from 'react';
import {
  Button,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getTests } from '../../src/db/collections';
import { loadDraft, markCompleted, setValue } from '../../src/db/sessions';
import { enqueue } from '../../src/db/outbox';
import { buildPayload } from '../../src/sync/payload';
import { nowStamp } from '../../src/sync/time';
import {
  isInvalidReading,
  parseReading,
  summarizeReadings,
  type ReadingSummary,
} from '../../src/sync/reading';
import type { TestDef, DraftValue, Draft } from '../../src/api/types';

/** Everything the confirmation modal needs, frozen at the moment it opened. */
type Pending = {
  defs: TestDef[];
  draft: Draft;
  summary: ReadingSummary<TestDef>;
};

const DANGER = '#b00020';

export default function Worksheet() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [tests, setTests] = useState<TestDef[]>([]);
  const [values, setValues] = useState<Record<string, DraftValue>>({});
  // What the user has literally typed, kept apart from the parsed number.
  // Rendering String(Number(text)) would eat the decimal separator the moment
  // it is typed: '0.' -> 0 -> '0', so '0.5' would end up as 5.
  const [texts, setTexts] = useState<Record<string, string>>({});
  // The initial load is async, and the finish button sits at the top of the
  // scroll view: without this the button is tappable while `tests` is still []
  // and a fast tap enqueues a session with no readings at all.
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const draft = await loadDraft(sessionId);
        setTests(await getTests(draft.utcUrl));
        setValues(draft.values);
        const seed: Record<string, string> = {};
        for (const [slug, dv] of Object.entries(draft.values)) {
          if (typeof dv.value === 'number') seed[slug] = String(dv.value);
        }
        setTexts(seed);
        setLoaded(true);
      } catch (e: any) {
        // Without this the screen stays blank forever and says nothing: the
        // draft or the stored definitions failed to read and the physicist has
        // no way to tell that from "still loading".
        setMsg(`Could not load this worksheet: ${e?.message ?? e}`);
      }
    })();
  }, [sessionId]);

  const update = async (slug: string, v: DraftValue) => {
    setValues((prev) => ({ ...prev, [slug]: v }));
    await setValue(sessionId, slug, v); // persist on every change
  };

  const updateNumber = async (slug: string, txt: string) => {
    setTexts((prev) => ({ ...prev, [slug]: txt }));
    // parseReading owns the ',' decimal separator and the unparseable cases;
    // it returns null for both empty and invalid, which is why the raw text is
    // kept and checked with isInvalidReading before anything is submitted.
    await update(slug, { value: parseReading(txt) });
  };

  // Android's numeric keypad has no minus key, and four of the six numeric
  // tests on the target list have a reference of 0 with a band of +/-1 mm --
  // they record a deviation, so half the valid readings are negative.
  const toggleSign = async (slug: string) => {
    const cur = texts[slug] ?? '';
    await updateNumber(slug, cur.startsWith('-') ? cur.slice(1) : `-${cur}`);
  };

  // Live, per-render view of what would be submitted. Cheap: the target list is
  // 16 tests.
  const live = summarizeReadings(tests, values, texts);

  /**
   * Step one of finishing: re-read the truth from the database, refuse on
   * anything unsafe, and only then show the summary.
   *
   * React state is not trusted here. `tests` is filled by an async effect and
   * `values` by a stream of setState calls; the database is what setValue has
   * actually persisted, so the payload is built from a fresh read.
   */
  const openSummary = async () => {
    setMsg('');
    try {
      const draft = await loadDraft(sessionId);
      const defs = await getTests(draft.utcUrl);
      if (defs.length === 0) {
        setMsg(
          'No test definitions are stored for this list, so nothing can be recorded. ' +
            'Re-download the list while online before running this session.'
        );
        return;
      }
      const summary = summarizeReadings(defs, draft.values, texts);
      if (summary.invalid.length > 0) {
        setMsg(
          `Not a number in: ${summary.invalid.map((t) => t.name).join(', ')}. ` +
            'Fix or clear those fields -- they would be sent as skipped.'
        );
        return;
      }
      setPending({ defs, draft, summary });
    } catch (e: any) {
      setMsg(`Could not prepare this session: ${e?.message ?? e}`);
    }
  };

  /**
   * Step two: enqueue exactly what the summary named.
   *
   * The defs and draft captured when the modal opened are reused deliberately,
   * so what was confirmed is what gets sent -- the modal covers the worksheet,
   * so nothing can have changed underneath.
   */
  const confirmFinish = async () => {
    if (!pending || sending) return;
    setSending(true);
    try {
      const completed = nowStamp();
      const payload = buildPayload(pending.defs, {
        ...pending.draft,
        workCompleted: completed,
      });
      // Outbox first, session status second. The reverse order strands the
      // session if enqueue throws: it would be marked 'queued' with nothing to
      // send and nothing listing it as a draft either. This way the worst case
      // is a queued payload whose session row still reads 'draft' -- visible in
      // both places, which is recoverable, rather than invisible in both.
      await enqueue(sessionId, payload);
      await markCompleted(sessionId, completed);
      setPending(null);
      router.replace('/queue');
    } catch (e: any) {
      setSending(false);
      setPending(null);
      setMsg(`Could not queue this session: ${e?.message ?? e}`);
    }
  };

  const canFinish = loaded && tests.length > 0 && live.invalid.length === 0;

  let lastSublist: string | null | undefined;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Button
        title="Finish and queue"
        onPress={openSummary}
        disabled={!canFinish}
      />
      {!loaded && !msg ? <Text>Loading worksheet...</Text> : null}
      {loaded && tests.length === 0 ? (
        <Text style={{ color: DANGER }}>
          This list has no stored tests. Re-download it while online.
        </Text>
      ) : null}
      {live.invalid.length > 0 ? (
        <Text style={{ color: DANGER }}>
          Not a number in: {live.invalid.map((t) => t.name).join(', ')}. Fix or clear
          those fields before finishing.
        </Text>
      ) : null}
      {msg ? <Text style={{ color: DANGER }}>{msg}</Text> : null}

      {tests.map((t) => {
        const header = t.sublist !== lastSublist ? ((lastSublist = t.sublist), t.sublist) : null;
        const v = values[t.slug]?.value ?? null;
        const bad = isInvalidReading(texts[t.slug] ?? '');
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
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    keyboardType="numeric"
                    value={texts[t.slug] ?? ''}
                    onChangeText={(txt) => updateNumber(t.slug, txt)}
                    accessibilityLabel={t.name}
                    style={{
                      borderWidth: bad ? 2 : 1,
                      borderColor: bad ? DANGER : '#888',
                      backgroundColor: bad ? '#fdecef' : 'transparent',
                      padding: 8,
                      flex: 1,
                    }}
                  />
                  <Button title="+/-" onPress={() => toggleSign(t.slug)} />
                </View>
                {bad ? (
                  <Text style={{ color: DANGER, fontSize: 12 }}>
                    "{texts[t.slug]}" is not a number -- this would be recorded as
                    skipped.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        );
      })}

      <Modal
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPending(null)}
      >
        {/* Same shape as src/ui/Dropdown.tsx: core RN only, tap the backdrop to
            cancel so the phone's back button is not the only way out. Cancelling
            writes nothing -- every value is already persisted by setValue. */}
        <Pressable
          onPress={() => (sending ? null : setPending(null))}
          style={{
            flex: 1,
            backgroundColor: '#0008',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          {/* A plain View would let taps on the card bubble to the backdrop and
              dismiss the dialog; a no-op Pressable swallows them. */}
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: 'white', borderRadius: 6, padding: 16, gap: 10 }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Queue this session?</Text>
            <Text>
              {pending?.summary.filled.length ?? 0} test
              {(pending?.summary.filled.length ?? 0) === 1 ? '' : 's'} with a value,{' '}
              {pending?.summary.skipped.length ?? 0} sent as skipped.
            </Text>
            {pending && pending.summary.skipped.length > 0 ? (
              <View style={{ gap: 2 }}>
                <Text style={{ fontWeight: 'bold' }}>Skipped:</Text>
                <ScrollView style={{ maxHeight: 220 }}>
                  {pending.summary.skipped.map((t) => (
                    <Text key={t.slug}>- {t.name}</Text>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            <Button
              title={sending ? 'Queueing...' : 'Confirm and queue'}
              onPress={confirmFinish}
              disabled={sending}
            />
            <Button
              title="Back to worksheet"
              onPress={() => setPending(null)}
              disabled={sending}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
