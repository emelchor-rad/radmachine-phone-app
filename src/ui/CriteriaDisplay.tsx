import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CriteriaBandValues, CriteriaDisplay as CriteriaModel } from '../qa/evaluate';
import { criteriaDisplay } from '../qa/evaluate';
import type { TestCriteria } from '../api/types';
import { RADMACHINE_BLUE } from './theme';

const ACTION_BG = '#e74c3c';
const TOLERANCE = '#d68910';
const OK = '#27ae60';
const MUTED = '#888';
const BORDER = '#ddd';

function fmtRef(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fmtBand(n: number): string {
  return Number.isInteger(n) ? `${n}.00` : n.toFixed(2);
}

type PointKind = 'action' | 'tolerance' | 'reference';

function ThresholdBadge({ kind, value }: { kind: PointKind; value: string }) {
  if (kind === 'action') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: ACTION_BG,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 16,
        }}
      >
        <Ionicons name="close" size={14} color="white" />
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 13 }}>{value}</Text>
      </View>
    );
  }
  if (kind === 'tolerance') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: BORDER,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 16,
        }}
      >
        <Ionicons name="alert" size={14} color={TOLERANCE} />
        <Text style={{ color: TOLERANCE, fontWeight: 'bold', fontSize: 13 }}>{value}</Text>
      </View>
    );
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: BORDER,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
      }}
    >
      <Ionicons name="checkmark" size={14} color={OK} />
      <Text style={{ color: OK, fontWeight: 'bold', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

function ScalePoint({
  label,
  kind,
  value,
}: {
  label: string;
  kind: PointKind;
  value: string;
}) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 5 }}>
      <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center' }}>{label}</Text>
      <View style={{ width: 1, height: 10, backgroundColor: '#bbb' }} />
      <ThresholdBadge kind={kind} value={value} />
    </View>
  );
}

/** RadMachine web-style horizontal ref/tol/action scale. */
function RadMachineScale({ bands }: { bands: CriteriaBandValues }) {
  const { actLow, tolLow, ref, tolHigh, actHigh } = bands;
  const points: { label: string; kind: PointKind; value: number | null; fmt: (n: number) => string }[] =
    [
      { label: 'Action', kind: 'action', value: actLow, fmt: fmtBand },
      { label: 'Tolerance', kind: 'tolerance', value: tolLow, fmt: fmtBand },
      { label: 'Reference', kind: 'reference', value: ref, fmt: fmtRef },
      { label: 'Tolerance', kind: 'tolerance', value: tolHigh, fmt: fmtBand },
      { label: 'Action', kind: 'action', value: actHigh, fmt: fmtBand },
    ];

  return (
    <View style={{ paddingVertical: 4 }}>
      <View
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          top: 22,
          height: 1,
          backgroundColor: '#ccc',
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {points.map((p, i) =>
          p.value !== null ? (
            <ScalePoint key={`${p.label}-${i}`} label={p.label} kind={p.kind} value={p.fmt(p.value)} />
          ) : null
        )}
      </View>
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
    return <ScalePoint label="Reference" kind="reference" value={model.refLabel} />;
  }
  if (model.kind === 'multchoice') {
    return (
      <View style={{ gap: 8 }}>
        {model.pass.length ? (
          <View>
            <Text style={{ fontWeight: '600', marginBottom: 4, color: OK }}>Pass choices</Text>
            <Text>{model.pass.join(', ')}</Text>
          </View>
        ) : null}
        {model.tol.length ? (
          <View>
            <Text style={{ fontWeight: '600', marginBottom: 4, color: TOLERANCE }}>Tolerance choices</Text>
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
    return <ScalePoint label="Reference" kind="reference" value={fmtRef(model.ref)} />;
  }
  if (model.kind === 'absolute') {
    return <RadMachineScale bands={model.bands} />;
  }
  const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
  return (
    <View style={{ gap: 8 }}>
      <ScalePoint label="Reference" kind="reference" value={fmtRef(model.ref)} />
      <Text style={{ color: MUTED, fontSize: 13 }}>
        Tolerance: {pct(model.tolLow)} to {pct(model.tolHigh)}
      </Text>
      <Text style={{ color: MUTED, fontSize: 13 }}>
        Action: {pct(model.actLow)} to {pct(model.actHigh)}
      </Text>
    </View>
  );
}

/** RadMachine-style reference and tolerance display (details modal only). */
export function CriteriaDisplay({ criteria }: { criteria?: TestCriteria | null }) {
  const model = criteriaDisplay(criteria);

  return (
    <View style={{ gap: 8, paddingVertical: 4 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 14, color: '#333' }}>Reference & tolerance</Text>
      <CriteriaBody model={model} />
    </View>
  );
}

/** Modal primary button colour — matches app chrome. */
export const CRITERIA_ACCENT = RADMACHINE_BLUE;
