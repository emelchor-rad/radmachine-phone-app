import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PassFail } from '../../src/ui/PassFail';
import { ReadOnlyField } from '../../src/ui/ReadOnlyField';
import { TestDetailsModal } from '../../src/ui/TestDetailsModal';
import { getCollection, getTests, type Collection } from '../../src/db/collections';
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
import { isFillableType, isCompositeType } from '../../src/api/types';
import {
  criteriaLine,
  evaluateReading,
  EVAL_COLOUR,
  EVAL_LABEL,
} from '../../src/qa/evaluate';
import { effectiveDraftValues } from '../../src/qa/effective-values';
import { recalculateComposites } from '../../src/qa/recalculate';
import { runCompositeScript } from '../../src/qa/python-engine';
import { isOutOfTolerance, listHasToleranceWarning } from '../../src/qa/tolerance-warning';

/** Everything the confirmation modal needs, frozen at the moment it opened. */
type Pending = {
  defs: TestDef[];
  draft: Draft;
  summary: ReadingSummary<TestDef>;
};

const DANGER = '#b00020';
const PRIMARY = '#1565c0';
const DEFAULT_WARNING = 'Do not treat';

function WorksheetTitle({ unitName, listName }: { unitName: string; listName: string }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={{ fontSize: 17, fontWeight: 'bold', lineHeight: 24 }}>
        Perform {unitName} :: {listName}
      </Text>
    </View>
  );
}

function WarningBanner({ message }: { message: string }) {
  return (
    <View style={{ backgroundColor: DANGER, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

function StatusBadge({ label, colour }: { label: string; colour: string }) {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colour,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 4,
      }}
    >
      <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export default function Worksheet() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [tests, setTests] = useState<TestDef[]>([]);
  const [values, setValues] = useState<Record<string, DraftValue>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [computed, setComputed] = useState<Record<string, number | string | null>>({});
  const [compositeBlocked, setCompositeBlocked] = useState<Record<string, string>>({});
  const [compositeWaiting, setCompositeWaiting] = useState<Record<string, string[]>>({});
  const [detailTest, setDetailTest] = useState<TestDef | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const draft = await loadDraft(sessionId);
        const col = await getCollection(draft.utcUrl);
        setCollection(col);
        setTests(await getTests(draft.utcUrl));
        setValues(draft.values);
        const seed: Record<string, string> = {};
        for (const [slug, dv] of Object.entries(draft.values)) {
          if (typeof dv.value === 'number') seed[slug] = String(dv.value);
          else if (typeof dv.value === 'string') seed[slug] = dv.value;
        }
        setTexts(seed);
        setLoaded(true);
      } catch (e: any) {
        setMsg(`Could not load this worksheet: ${e?.message ?? e}`);
      }
    })();
  }, [sessionId]);

  useEffect(() => {
    if (!loaded || tests.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const draft = effectiveDraftValues(tests, values, texts);
        const result = await recalculateComposites(tests, draft, runCompositeScript);
        if (!cancelled) {
          setComputed(result.values);
          setCompositeBlocked(result.blocked);
          setCompositeWaiting(result.waiting);
        }
      } catch {
        if (!cancelled) {
          setComputed({});
          setCompositeBlocked({});
          setCompositeWaiting({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, tests, values, texts]);

  const update = async (slug: string, v: DraftValue) => {
    setValues((prev) => ({ ...prev, [slug]: v }));
    await setValue(sessionId, slug, v);
  };

  const updateNumber = async (slug: string, txt: string) => {
    setTexts((prev) => ({ ...prev, [slug]: txt }));
    await update(slug, { value: parseReading(txt) });
  };

  const toggleSign = async (slug: string) => {
    const cur = texts[slug] ?? '';
    await updateNumber(slug, cur.startsWith('-') ? cur.slice(1) : `-${cur}`);
  };

  const fillable = tests.filter((t) => isFillableType(t.type));
  const live = summarizeReadings(tests, values, texts);

  const openSummary = async () => {
    setMsg('');
    try {
      const draft = await loadDraft(sessionId);
      const defs = await getTests(draft.utcUrl);
      const fillableDefs = defs.filter((t) => isFillableType(t.type));
      if (fillableDefs.length === 0) {
        setMsg(
          'No hand-entered tests are stored for this list, so nothing can be recorded. ' +
            'This list may contain only calculated tests.'
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

  const confirmFinish = async () => {
    if (!pending || sending) return;
    setSending(true);
    try {
      const completed = nowStamp();
      const payload = buildPayload(pending.defs, {
        ...pending.draft,
        workCompleted: completed,
      });
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

  const canFinish = loaded && fillable.length > 0 && live.invalid.length === 0;
  const allFilled =
    canFinish && live.skipped.length === 0 && live.filled.length === fillable.length;

  const showToleranceWarning = listHasToleranceWarning(tests, values, computed);

  const bannerText = collection?.warningMessage?.trim() || DEFAULT_WARNING;
  const bannerHeight = 44;

  let lastSublist: string | null | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <View
        style={{
          flex: 1,
          borderWidth: showToleranceWarning ? 4 : 0,
          borderColor: DANGER,
        }}
      >
        {showToleranceWarning ? <WarningBanner message={bannerText} /> : null}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            gap: 10,
            paddingBottom: showToleranceWarning ? bannerHeight + 16 : 16,
          }}
        >
          {collection ? (
            <WorksheetTitle unitName={collection.unitName} listName={collection.utcName} />
          ) : null}
        <Pressable
          onPress={canFinish ? openSummary : undefined}
          disabled={!canFinish}
          style={{
            backgroundColor: !canFinish ? '#bdbdbd' : allFilled ? PRIMARY : '#757575',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 6,
            alignItems: 'center',
            opacity: canFinish ? 1 : 0.55,
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Finish and queue</Text>
        </Pressable>

        {!loaded && !msg ? <Text>Loading worksheet...</Text> : null}
        {loaded && fillable.length === 0 && tests.length > 0 ? (
          <Text style={{ color: DANGER }}>
            This list has no hand-entered tests — only calculated ones. Nothing can be recorded here.
          </Text>
        ) : null}
        {loaded && tests.length === 0 ? (
          <Text style={{ color: DANGER }}>
            This list has no stored tests. Re-download it while online.
          </Text>
        ) : null}
        {live.invalid.length > 0 ? (
          <Text style={{ color: DANGER }}>
            Not a number in: {live.invalid.map((t) => t.name).join(', ')}. Fix or clear those fields
            before finishing.
          </Text>
        ) : null}
        {msg ? <Text style={{ color: DANGER }}>{msg}</Text> : null}

        {tests.map((t) => {
          const header = t.sublist !== lastSublist ? ((lastSublist = t.sublist), t.sublist) : null;
          const composite = isCompositeType(t.type);
          const v = composite ? (computed[t.slug] ?? null) : (values[t.slug]?.value ?? null);
          const bad = t.type === 'simple' && isInvalidReading(texts[t.slug] ?? '');
          const level = evaluateReading(t.type, v, t.criteria);
          const levelColour = level ? EVAL_COLOUR[level] : null;
          const levelLabel = level ? EVAL_LABEL[level] : null;
          const refLine = criteriaLine(t.criteria);
          const blocked = compositeBlocked[t.slug];
          const waitingFor = compositeWaiting[t.slug] ?? [];
          const waitingNames = waitingFor.map(
            (slug) => tests.find((x) => x.slug === slug)?.name ?? slug
          );
          const displayValue =
            v === null || v === undefined
              ? ''
              : typeof v === 'boolean'
                ? v
                  ? 'Pass'
                  : 'Fail'
                : String(v);
          const fieldBorder = bad ? DANGER : levelColour ?? '#888';

          return (
            <View key={t.slug} style={{ gap: 4 }}>
              {header ? (
                <Text style={{ fontWeight: 'bold', marginTop: 12 }}>{header}</Text>
              ) : null}
              <Pressable onPress={() => setDetailTest(t)} accessibilityRole="button">
                <Text style={{ color: PRIMARY, textDecorationLine: 'underline', fontSize: 16 }}>
                  {t.name}
                </Text>
              </Pressable>
              {refLine ? <Text style={{ color: '#555', fontSize: 12 }}>{refLine}</Text> : null}
              {levelLabel && levelColour && isOutOfTolerance(level) ? (
                <StatusBadge label={levelLabel} colour={levelColour} />
              ) : null}
              {composite ? (
                blocked ? (
                  <ReadOnlyField
                    value=""
                    placeholder={`Calculated on submit — ${blocked}`}
                    borderColor="#888"
                    accessibilityLabel={t.name}
                  />
                ) : (
                  <ReadOnlyField
                    value={displayValue}
                    placeholder={
                      waitingNames.length > 0
                        ? `Waiting for: ${waitingNames.join(', ')}`
                        : 'Waiting for inputs…'
                    }
                    borderColor={fieldBorder}
                    accessibilityLabel={t.name}
                  />
                )
              ) : t.type === 'boolean' ? (
                <PassFail
                  label={t.name}
                  value={typeof v === 'boolean' ? v : null}
                  onChange={(b) => update(t.slug, { value: b })}
                />
              ) : t.type === 'string' ? (
                <TextInput
                  value={typeof v === 'string' ? v : ''}
                  onChangeText={(txt) => update(t.slug, { value: txt.trim() === '' ? null : txt })}
                  accessibilityLabel={t.name}
                  style={{
                    borderWidth: levelColour ? 2 : 1,
                    borderColor: fieldBorder,
                    padding: 8,
                  }}
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
                        borderWidth: bad ? 2 : levelColour ? 2 : 1,
                        borderColor: fieldBorder,
                        backgroundColor: bad ? '#fdecef' : 'transparent',
                        padding: 8,
                        flex: 1,
                      }}
                    />
                    <Pressable
                      onPress={() => toggleSign(t.slug)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#888',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 4,
                      }}
                    >
                      <Text style={{ fontWeight: 'bold' }}>+/−</Text>
                    </Pressable>
                  </View>
                  {bad ? (
                    <Text style={{ color: DANGER, fontSize: 12 }}>
                      "{texts[t.slug]}" is not a number -- this would be recorded as skipped.
                    </Text>
                  ) : null}
                </>
              )}
              {levelLabel && levelColour && !isOutOfTolerance(level) ? (
                <Text style={{ color: levelColour, fontSize: 12, fontWeight: 'bold' }}>
                  {levelLabel}
                </Text>
              ) : null}
            </View>
          );
        })}

        <Modal
          visible={pending !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPending(null)}
        >
          <Pressable
            onPress={() => (sending ? null : setPending(null))}
            style={{
              flex: 1,
              backgroundColor: '#0008',
              justifyContent: 'center',
              padding: 24,
            }}
          >
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
              <Pressable
                onPress={confirmFinish}
                disabled={sending}
                style={{
                  backgroundColor: sending ? '#999' : PRIMARY,
                  padding: 12,
                  borderRadius: 4,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>
                  {sending ? 'Queueing...' : 'Confirm and queue'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPending(null)}
                disabled={sending}
                style={{ padding: 12, alignItems: 'center' }}
              >
                <Text style={{ color: PRIMARY }}>Back to worksheet</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        </ScrollView>
        {showToleranceWarning ? (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            <WarningBanner message={bannerText} />
          </View>
        ) : null}
      </View>
      <TestDetailsModal test={detailTest} onClose={() => setDetailTest(null)} />
    </View>
  );
}
