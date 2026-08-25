import React from "react";
import { SafeAreaProvider, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Modal, View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export type CriterioOrdenTitulos = "alfabetico" | "fecha" | "ultimo_visto";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  orden: CriterioOrdenTitulos;
  ascendente: boolean;
  onCambiar: (orden: CriterioOrdenTitulos, ascendente: boolean) => void;
}

const OPCIONES: { key: CriterioOrdenTitulos; label: string }[] = [
  { key: "alfabetico", label: "Alfabético" },
  { key: "fecha", label: "Fecha de lanzamiento" },
  { key: "ultimo_visto", label: "Lo último que has visto" },
];

export default function OrdenTitulosModal({ visible, onCerrar, orden, ascendente, onCambiar }: Props) {
  const { t } = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <SafeAreaProvider>
        <SafeAreaInsetsContext.Consumer>
          {(insets) => (
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={[styles.hoja, { paddingBottom: 20 + (insets?.bottom ?? 0) }]} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{t("Ordenar por:")}</Text>
          {OPCIONES.map((o) => {
            const activo = orden === o.key;
            return (
              <Pressable key={o.key} style={styles.fila} onPress={() => onCambiar(o.key, activo ? !ascendente : ascendente)}>
                <Text style={[styles.filaTexto, activo && styles.filaTextoActivo]}>{t(o.label)}</Text>
                {activo && (
                  <Pressable
                    style={styles.ascDescBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      onCambiar(o.key, !ascendente);
                    }}
                  >
                    <Ionicons name={ascendente ? "arrow-up" : "arrow-down"} size={16} color={theme.colors.primary} />
                    <Text style={styles.ascDescTexto}>{ascendente ? t("Ascendente") : t("Descendente")}</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
          )}
        </SafeAreaInsetsContext.Consumer>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20 },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 12 },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  filaTexto: { fontSize: 15, color: theme.colors.textMuted },
  filaTextoActivo: { color: theme.colors.text, fontWeight: "700" },
  ascDescBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  ascDescTexto: { fontSize: 12, color: theme.colors.primary, fontWeight: "600" },
});
