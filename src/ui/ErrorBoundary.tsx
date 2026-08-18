import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Surfaces startup crashes as readable text instead of Expo Go's generic
 * "Something went wrong", which carries no detail at all on a phone.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
        <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>
          The app crashed on startup
        </Text>
        <Text style={{ marginBottom: 12 }}>
          Copy this message and send it — it names the actual fault:
        </Text>
        <ScrollView
          style={{
            maxHeight: 320,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 4,
            padding: 8,
          }}
        >
          <Text selectable style={{ fontFamily: 'monospace', fontSize: 12 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
