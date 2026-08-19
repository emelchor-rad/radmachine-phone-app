import { Text, View } from 'react-native';
import type { CriteriaBandValues, CriteriaDisplay as CriteriaModel } from '../qa/evaluate';
import { criteriaDisplay } from '../qa/evaluate';
import type { TestCriteria } from '../api/types';

const ACTION = '#b00020';
const TOLERANCE = '#8a6d00';
const OK = '#1b7f3b';
const MUTED = '#666';

function fmtBand(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function ScaleBadge({
  label,
  value,
  colour,
}: {
  label: string;
  value: string;
  colour: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 3, minWidth: 56 }}>
      <Text style={{ fontSize: 10, color: MUTED, textTransform: 'uppercase' }}>{label}</Text>
      <View
        style={{
          backgroundColor: colour,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 14,
          minWidth: 48,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>{value}</Text>
      </View>
    </View>
  );
}

function AbsoluteScale({ bands }: { bands: CriteriaBandValues }) {
  const { actLow, tolLow, ref, tolHigh, actHigh } = bands;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {actLow !== null ? (
          <ScaleBadge label="Action" value={fmtBand(actLow)} colour={ACTION} />
        ) : null}
        {tolLow !== null ? (
          <ScaleBadge label="Tolerance" value={fmtBand(tolLow)} colour={TOLERANCE} />
        ) : null}
        <ScaleBadge label="Reference" value={fmtBand(ref)} colour={OK} />
        {tolHigh !== null ? (
          <ScaleBadge label="Tolerance" value={fmtBand(tolHigh)} colour={TOLERANCE} />
        ) : null}
        {actHigh !== null ? (
          <ScaleBadge label="Action" value={fmtBand(actHigh)} colour={ACTION} />
        ) : null}
      </View>
      <View style={{ height: 4, backgroundColor: '#ddd', borderRadius: 2 }} />
    </View>
  );
}

function CriteriaBody({ model }: { model: CriteriaModel }) {
  if (model.kind === 'none') {
    return (
      <Text style={{ color: MUTED, fontStyle: 'italic' }}>
        No reference or tolerance is configured for this test on this unit.
      </Text>
    );
  }
  if (model.kind === 'boolean') {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: '600' }}>Reference</Text>
        <ScaleBadge label="Expected" value={model.refLabel} colour={OK} />
      </View>
    );
  }
  if (model.kind === 'multchoice') {
    return (
      <View style={{ gap: 8 }}>
        {model.pass.length ? (
          <View>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>Pass choices</Text>
            <Text>{model.pass.join(', ')}</Text>
          </View>
        ) : null}
        {model.tol.length ? (
          <View>
            <Text style={{ fontWeight: '600', marginBottom: 4 }}>Tolerance choices</Text>
            <Text>{model.tol.join(', ')}</Text>
          </View>
        ) : null}
        {!model.pass.length && !model.tol.length ? (
          <Text style={{ color: MUTED, fontStyle: 'italic' }}>No choices configured.</Text>
        ) : null}
      </View>
    );
  }
  if (model.kind === 'ref_only') {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ fontWeight: '600' }}>Reference only (no tolerance set)</Text>
        <ScaleBadge label="Reference" value={fmtBand(model.ref)} colour={OK} />
      </View>
    );
  }
  if (model.kind === 'absolute') {
    return <AbsoluteScale bands={model.bands} />;
  }
  const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: '600' }}>Percent tolerance relative to reference</Text>
      <ScaleBadge label="Reference" value={fmtBand(model.ref)} colour={OK} />
      <Text>
        Tolerance band: {pct(model.tolLow)} to {pct(model.tolHigh)}
      </Text>
      <Text>
        Action band: {pct(model.actLow)} to {pct(model.actHigh)}
      </Text>
    </View>
  );
}

/** RadMachine-style reference and tolerance display. */
export function CriteriaDisplay({
  criteria,
  compact = false,
}: {
  criteria?: TestCriteria | null;
  compact?: boolean;
}) {
  const model = criteriaDisplay(criteria);

  if (compact) {
    if (model.kind === 'none') return null;
    if (model.kind === 'absolute') {
      const { actLow, tolLow, ref, tolHigh, actHigh } = model.bands;
      const parts = [`Ref ${fmtBand(ref)}`];
      if (tolLow !== null && tolHigh !== null) {
        parts.push(`Tol ${fmtBand(tolLow)}–${fmtBand(tolHigh)}`);
      }
      if (actLow !== null && actHigh !== null) {
        parts.push(`Act ${fmtBand(actLow)}–${fmtBand(actHigh)}`);
      }
      return <Text style={{ color: MUTED, fontSize: 12 }}>{parts.join(' · ')}</Text>;
    }
    const summary =
      model.kind === 'boolean'
        ? `Ref: ${model.refLabel}`
        : model.kind === 'ref_only'
          ? `Ref: ${fmtBand(model.ref)}`
          : model.kind === 'multchoice'
            ? [
                model.pass.length ? `Pass: ${model.pass.join(', ')}` : '',
                model.tol.length ? `Tol: ${model.tol.join(', ')}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
            : null;
    return summary ? <Text style={{ color: MUTED, fontSize: 12 }}>{summary}</Text> : null;
  }

  return (
    <View
      style={{
        gap: 8,
        padding: 12,
        backgroundColor: '#f7f7f7',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ddd',
      }}
    >
      <Text style={{ fontWeight: 'bold', fontSize: 14 }}>Reference & tolerance</Text>
      <CriteriaBody model={model} />
    </View>
  );
}
