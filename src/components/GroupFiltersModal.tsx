import React from "react";
import { Modal, View, Pressable, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import { OrdenGrupos } from "../lib/groups";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export type FiltroVisibilidad = "todos" | "publicos" | "privados";
export type FiltroCreador = "todos" | "mios" | "otros";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  orden: OrdenGrupos;
  ascendente: boolean;
  onCambiarOrden: (orden: OrdenGrupos, ascendente: boolean) => void;
  visibilidad: FiltroVisibilidad;
  onCambiarVisibilidad: (v: FiltroVisibilidad) => void;
  creador?: FiltroCreador;
  onCambiarCreador?: (c: FiltroCreador) => void;
  mostrarFiltroCreador?: boolean;
  mostrarUltimoMensaje?: boolean;
}

export default function GroupFiltersModal({
  visible,
  onCerrar,
  orden,
  ascendente,
  onCambiarOrden,
  visibilidad,
  onCambiarVisibilidad,
  creador,
  onCambiarCreador,
  mostrarFiltroCreador,
  mostrarUltimoMensaje,
}: Props) {
  const { t } = useT();
  const OPCIONES_ORDEN_BASE: { key: OrdenGrupos; label: string }[] = [
    { key: "popularidad", label: t("Popularidad (cantidad de miembros)") },
    { key: "alfabetico", label: t("Alfabético") },
    { key: "fecha", label: t("Fecha de creación") },
  ];
  const opcionesOrden = mostrarUltimoMensaje
    ? [{ key: "ultimo_mensaje" as const, label: t("Último mensaje") }, ...OPCIONES_ORDEN_BASE]
    : OPCIONES_ORDEN_BASE;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.seccionTitulo}>{t("Ordenar por")}</Text>
          {opcionesOrden.map((o) => {
            const activo = orden === o.key;
            return (
              <Pressable key={o.key} style={styles.fila} onPress={() => onCambiarOrden(o.key, activo ? !ascendente : ascendente)}>
                <Text style={[styles.filaTexto, activo && styles.filaTextoActivo]}>{o.label}</Text>
                {activo && (
                  <Pressable
                    style={styles.ascDescBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      onCambiarOrden(o.key, !ascendente);
                    }}
                  >
                    <Ionicons name={ascendente ? "arrow-up" : "arrow-down"} size={16} color={theme.colors.primary} />
                    <Text style={styles.ascDescTexto}>{ascendente ? t("Ascendente") : t("Descendente")}</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}

          <Text style={[styles.seccionTitulo, { marginTop: 16 }]}>{t("Visibilidad")}</Text>
          <View style={styles.chipsRow}>
            {(["todos", "publicos", "privados"] as const).map((v) => (
              <Pressable key={v} style={[styles.chip, visibilidad === v && styles.chipActivo]} onPress={() => onCambiarVisibilidad(v)}>
                <Text style={[styles.chipTexto, visibilidad === v && styles.chipTextoActivo]}>
                  {v === "todos" ? t("Todos") : v === "publicos" ? t("Públicos") : t("Privados")}
                </Text>
              </Pressable>
            ))}
          </View>

          {mostrarFiltroCreador && onCambiarCreador && (
            <>
              <Text style={[styles.seccionTitulo, { marginTop: 16 }]}>{t("Creador")}</Text>
              <View style={styles.chipsRow}>
                {(["todos", "mios", "otros"] as const).map((c) => (
                  <Pressable key={c} style={[styles.chip, creador === c && styles.chipActivo]} onPress={() => onCambiarCreador(c)}>
                    <Text style={[styles.chipTexto, creador === c && styles.chipTextoActivo]}>
                      {c === "todos" ? t("Todos") : c === "mios" ? t("Creados por mí") : t("No creados por mí")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20 },
  seccionTitulo: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase" },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  filaTexto: { fontSize: 14, color: theme.colors.textMuted, flexShrink: 1, marginRight: 8 },
  filaTextoActivo: { color: theme.colors.text, fontWeight: "700" },
  ascDescBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  ascDescTexto: { fontSize: 12, color: theme.colors.primary, fontWeight: "600" },
  chipsRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  chipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTexto: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "700" },
  chipTextoActivo: { color: "#000000" },
});
