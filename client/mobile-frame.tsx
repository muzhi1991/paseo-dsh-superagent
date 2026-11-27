import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  View,
  type LayoutRectangle,
} from "react-native";

export function MobileFrame({
  backgroundColor,
  children,
}: {
  backgroundColor: string;
  children: ReactNode;
}) {
  const [frame, setFrame] = useState<LayoutRectangle>();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor }}
    >
      <View style={{ flex: 1 }}>
        {/* Core SafeAreaView applies all four insets. Read its top and side bounds;
          the footer gets one margin measured from the screen or keyboard edge. */}
        <SafeAreaView
          pointerEvents="none"
          aria-hidden
          style={StyleSheet.absoluteFill}
          testID="superagent-safe-area"
        >
          <View
            collapsable={false}
            style={{ flex: 1 }}
            onLayout={({ nativeEvent: { layout } }) => setFrame(layout)}
          />
        </SafeAreaView>
        {frame && (
          <View
            style={{
              position: "absolute",
              top: frame.y,
              left: frame.x,
              width: frame.width,
              bottom: 12,
            }}
          >
            {children}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
