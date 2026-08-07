import React from "react";
import { Modal, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export type CriterioOrdenListas = "fecha" | "alfabetico" | "seguidores";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  modo: "mias" | "sigo"; // cambia la etiqueta de la opción "fecha"
  orden: CriterioOrdenListas;
  ascendente: boolean;
  onCambiar: (orden: CriterioOrdenListas, ascendente: boolean) => void;
}

export default function OrdenListasModal({ visible, onCerrar, modo, orden, ascendente, onCambiar }: Props) {
  const { t } = useT();

  const opciones: { key: CriterioOrdenListas; label: string }[] = [
    { key: "fecha", label: modo === "mias" ? t("Fecha creación") : t("Última seguida") },
    { key: "alfabetico", label: t("Alfabético") },
    { key: "seguidores", label: t("Cantidad seguidores") },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <Text style={styles.titulo}>{t("Ordenar por")}</Text>
          {opciones.map((o) => {
            const activo = orden === o.key;
            return (
              <Pressable key={o.key} style={styles.fila} onPress={() => onCambiar(o.key, activo ? !ascendente : false)}>
                <Text style={[styles.filaTexto, activo && styles.filaTextoActiva]}>{o.label}</Text>
                {activo && <Ionicons name={ascendente ? "arrow-up" : "arrow-down"} size={16} color={theme.colors.primary} />}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, width: "100%", maxWidth: 320 },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 10, textAlign: "center" },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  filaTexto: { fontSize: 14, color: theme.colors.textMuted },
  filaTextoActiva: { color: theme.colors.text, fontWeight: "700" },
});
