import React, { useState } from "react";
import { View, Modal, TextInput, FlatList, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { PAISES } from "../lib/countries";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  valor: string;
  onCambiar: (code: string) => void;
}

export default function CountryPickerField({ valor, onCambiar }: Props) {
  const { t } = useT();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const actual = PAISES.find((p) => p.code === valor);

  const filtrados = busqueda.trim()
    ? PAISES.filter((p) => p.label.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : PAISES;

  return (
    <>
      <Pressable style={styles.campo} onPress={() => setAbierto(true)}>
        <Text style={styles.texto}>{actual?.label ?? t("Elegir país...")}</Text>
        <Text style={styles.flecha}>▾</Text>
      </Pressable>

      <Modal visible={abierto} animationType="slide" onRequestClose={() => setAbierto(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.buscadorRow}>
            <TextInput
              style={styles.buscadorInput}
              placeholder={t("Buscar país...")}
              placeholderTextColor={theme.colors.textFaint}
              value={busqueda}
              onChangeText={setBusqueda}
              autoFocus
            />
            <Pressable onPress={() => setAbierto(false)} hitSlop={10}>
              <Text style={styles.cerrar}>{t("Cerrar")}</Text>
            </Pressable>
          </View>
          <FlatList
            data={filtrados}
            keyExtractor={(p) => p.code}
            ListEmptyComponent={<Text style={styles.vacio}>{t("No encontramos ningún país con ese nombre.")}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.opcion, item.code === valor && styles.opcionActiva]}
                onPress={() => {
                  onCambiar(item.code);
                  setBusqueda("");
                  setAbierto(false);
                }}
              >
                <Text style={[styles.opcionTexto, item.code === valor && styles.opcionTextoActivo]}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
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
  modalContainer: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 50 },
  buscadorRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  buscadorInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  cerrar: { color: theme.colors.primaryLight, fontWeight: "700" },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  opcion: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  opcionActiva: { backgroundColor: theme.colors.surface },
  opcionTexto: { fontSize: 15 },
  opcionTextoActivo: { color: theme.colors.primaryLight, fontWeight: "700" },
});
