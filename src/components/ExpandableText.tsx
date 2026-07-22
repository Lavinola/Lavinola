import React, { useState } from "react";
import { View, Pressable, StyleSheet, StyleProp, TextStyle } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

interface Props {
  texto: string;
  style?: StyleProp<TextStyle>;
  maxLines?: number;
}

/**
 * Texto que se corta a 5 renglones (configurable) si es muy largo, con una
 * flechita violeta abajo a la derecha del bloque para desplegarlo entero —
 * y volver a colapsarlo. Si el texto entra sin cortarse, no aparece nada.
 */
export default function ExpandableText({ texto, style, maxLines = 5 }: Props) {
  const [expandido, setExpandido] = useState(false);
  const [truncado, setTruncado] = useState(false);
  const [yaMidio, setYaMidio] = useState(false);

  return (
    <View>
      <Text
        style={style}
        numberOfLines={expandido ? undefined : maxLines}
        onTextLayout={(e) => {
          if (!yaMidio) {
            setTruncado(e.nativeEvent.lines.length >= maxLines);
            setYaMidio(true);
          }
        }}
      >
        {texto}
      </Text>
      {truncado && (
        <Pressable onPress={() => setExpandido((v) => !v)} style={styles.flechaBtn} hitSlop={8}>
          <Ionicons name={expandido ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.primaryLight} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flechaBtn: { position: "absolute", right: 0, bottom: 0 },
});
