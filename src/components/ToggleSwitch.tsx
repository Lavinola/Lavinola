import React from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { theme } from "../theme";

export default function ToggleSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[styles.track, { backgroundColor: value ? theme.colors.primary : "#555555" }]}
      hitSlop={8}
    >
      <View style={[styles.thumb, value ? styles.thumbActivo : styles.thumbInactivo]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: 44, height: 26, borderRadius: 13, padding: 2, justifyContent: "center" },
  thumb: { width: 22, height: 22, borderRadius: 11 },
  thumbActivo: { backgroundColor: theme.colors.primaryLight, alignSelf: "flex-end" },
  thumbInactivo: { backgroundColor: "#CCCCCC", alignSelf: "flex-start" },
});
