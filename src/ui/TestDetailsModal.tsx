import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { TestDef } from '../api/types';
import { isCompositeType } from '../api/types';
import { criteriaLine } from '../qa/evaluate';

export function TestDetailsModal({
  test,
  onClose,
}: {
  test: TestDef | null;
  onClose: () => void;
}) {
  const refLine = test ? criteriaLine(test.criteria) : null;
  return (
    <Modal visible={test !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: '#0008',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: 'white', borderRadius: 6, padding: 16, gap: 10, maxHeight: '80%' }}
        >
          <Text style={{ fontWeight: 'bold', fontSize: 18 }}>{test?.name}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            <Text style={{ color: '#555' }}>Type: {test?.type}</Text>
            <Text style={{ color: '#555' }}>Identifier: {test?.slug}</Text>
            {refLine ? <Text style={{ marginTop: 8 }}>{refLine}</Text> : null}
            {test && isCompositeType(test.type) && test.calculationProcedure ? (
              <View style={{ marginTop: 12, gap: 4 }}>
                <Text style={{ fontWeight: 'bold' }}>Calculation</Text>
                <Text
                  style={{
                    fontFamily: 'monospace',
                    backgroundColor: '#f0f0f0',
                    padding: 10,
                    fontSize: 13,
                  }}
                >
                  {test.calculationProcedure}
                </Text>
              </View>
            ) : null}
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: '#1565c0',
              padding: 12,
              borderRadius: 4,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
