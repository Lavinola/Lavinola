import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";
import { OrdenTitulosPerfil } from "../lib/perfilTitulos";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  orden: OrdenTitulosPerfil;
  ascendente: boolean;
  onCambiar: (o: OrdenTitulosPerfil, asc: boolean) => void;
  labelUltimaVista: string;
}

export default function OrdenTitulosPerfilModal({ visible, onCerrar, orden, ascendente, onCambiar, labelUltimaVista }: Props) {
  const { t } = useT();

  const opciones: { key: OrdenTitulosPerfil; label: string }[] = [
    { key: "ultima_vista", label: labelUltimaVista },
    { key: "alfabetico", label: t("Alfabético") },
    { key: "fecha_lanzamiento", label: t("Fecha de lanzamiento") },
    { key: "puntuacion", label: `${t("Su")} ⭐` },
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
          <View style={{ height: 8 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  caja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 16, width: "100%", maxWidth: 320 },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 6, textAlign: "center" },
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
