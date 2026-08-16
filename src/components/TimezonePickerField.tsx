import React, { useState } from "react";
import { View, Modal, TextInput, FlatList, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { ZONAS_HORARIAS } from "../lib/timezones";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  valor: string;
  onCambiar: (id: string) => void;
}

export default function TimezonePickerField({ valor, onCambiar }: Props) {
  const { t } = useT();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const actual = ZONAS_HORARIAS.find((z) => z.id === valor);

  const filtradas = busqueda.trim()
    ? ZONAS_HORARIAS.filter((z) => z.label.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : ZONAS_HORARIAS;

  return (
    <>
      <Pressable style={styles.campo} onPress={() => setAbierto(true)}>
        <Text style={styles.texto}>{actual?.label ?? valor ?? t("Elegir zona horaria...")}</Text>
        <Text style={styles.flecha}>▾</Text>
      </Pressable>

      <Modal visible={abierto} animationType="slide" onRequestClose={() => setAbierto(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.buscadorRow}>
            <TextInput
              style={styles.buscadorInput}
              placeholder={t("Buscar ciudad...")}
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
            data={filtradas}
            keyExtractor={(z) => z.id}
            ListEmptyComponent={<Text style={styles.vacio}>{t("No encontramos ninguna zona horaria con ese nombre.")}</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.opcion, item.id === valor && styles.opcionActiva]}
                onPress={() => {
                  onCambiar(item.id);
                  setBusqueda("");
                  setAbierto(false);
                }}
              >
                <Text style={[styles.opcionTexto, item.id === valor && styles.opcionTextoActivo]}>{item.label}</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  texto: { color: theme.colors.text, fontSize: 15 },
  flecha: { color: theme.colors.textFaint, fontSize: 13 },
  modalContainer: { flex: 1, backgroundColor: theme.colors.background, paddingTop: 60 },
  buscadorRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, marginBottom: 8 },
  buscadorInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cerrar: { color: theme.colors.primaryLight, fontWeight: "700" },
  opcion: { paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  opcionActiva: { backgroundColor: theme.colors.surfaceAlt },
  opcionTexto: { color: theme.colors.textMuted, fontSize: 15 },
  opcionTextoActivo: { color: theme.colors.text, fontWeight: "700" },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24, paddingHorizontal: 20 },
});
