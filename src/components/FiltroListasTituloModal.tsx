import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export type FiltroQuienListas = "todos" | "seguidos";
export type CriterioOrdenListasTitulo = "popularidad" | "fecha" | "alfabetico";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  filtro: FiltroQuienListas;
  onCambiarFiltro: (f: FiltroQuienListas) => void;
  orden: CriterioOrdenListasTitulo;
  ascendente: boolean;
  onCambiarOrden: (o: CriterioOrdenListasTitulo, asc: boolean) => void;
  ocultarAlfabetico?: boolean;
}

export default function FiltroListasTituloModal({ visible, onCerrar, filtro, onCambiarFiltro, orden, ascendente, onCambiarOrden, ocultarAlfabetico }: Props) {
  const { t } = useT();

  const opcionesFiltro: { key: FiltroQuienListas; label: string }[] = [
    { key: "todos", label: t("Todos") },
    { key: "seguidos", label: t("Usuarios seguidos") },
  ];
  const opcionesOrden: { key: CriterioOrdenListasTitulo; label: string }[] = [
    { key: "popularidad", label: t("Popularidad") },
    { key: "fecha", label: t("Fecha creación") },
    ...(ocultarAlfabetico ? [] : [{ key: "alfabetico" as const, label: t("Alfabético") }]),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <Text style={styles.titulo}>{t("Filtrar")}</Text>
          {opcionesFiltro.map((o) => (
            <Pressable key={o.key} style={styles.fila} onPress={() => onCambiarFiltro(o.key)}>
              <Text style={[styles.filaTexto, filtro === o.key && styles.filaTextoActiva]}>{o.label}</Text>
              {filtro === o.key && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
            </Pressable>
          ))}

          <Text style={[styles.titulo, { marginTop: 20 }]}>{t("Ordenar por")}</Text>
          {opcionesOrden.map((o) => {
            const activo = orden === o.key;
            return (
              <Pressable key={o.key} style={styles.fila} onPress={() => onCambiarOrden(o.key, activo ? !ascendente : false)}>
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
