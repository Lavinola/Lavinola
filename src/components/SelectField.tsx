import React, { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import ActionSheetModal from "./ActionSheetModal";
import { theme } from "../theme";

interface Opcion {
  label: string;
  value: string;
}

interface Props {
  opciones: Opcion[];
  valor: string;
  onCambiar: (v: string) => void;
  titulo?: string;
}

/** Selector tipo "dropdown", pero con nuestro propio modal (evita el bug de
 * texto invisible del Picker nativo de Android en algunos dispositivos). */
export default function SelectField({ opciones, valor, onCambiar, titulo }: Props) {
  const [abierto, setAbierto] = useState(false);
  const actual = opciones.find((o) => o.value === valor);

  return (
    <>
      <Pressable style={styles.campo} onPress={() => setAbierto(true)}>
        <Text style={styles.texto}>{actual?.label ?? "Elegir..."}</Text>
        <Text style={styles.flecha}>▾</Text>
      </Pressable>
      <ActionSheetModal
        visible={abierto}
        onCerrar={() => setAbierto(false)}
        titulo={titulo}
        opciones={opciones.map((o) => ({ label: o.label, onPress: () => onCambiar(o.value) }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  campo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  texto: { fontSize: 14, color: theme.colors.text },
  flecha: { color: theme.colors.textMuted, fontSize: 12 },
});
