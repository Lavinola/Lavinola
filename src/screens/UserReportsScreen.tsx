import React, { useEffect, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { denunciasHechasPor, denunciasRecibidasPor, ReporteEnriquecido } from "../lib/reports";
import { formatearFechaHora } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

export default function UserReportsScreen({ route, navigation }: any) {
  const { t } = useT();
  const { userId, username, modo } = route.params as { userId: string; username?: string | null; modo: "hechas" | "recibidas" };
  const [reportes, setReportes] = useState<ReporteEnriquecido[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: modo === "hechas" ? t("Denuncias realizadas") : t("Denuncias recibidas") });
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const lista = modo === "hechas" ? await denunciasHechasPor(userId) : await denunciasRecibidasPor(userId);
    setReportes(lista);
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      data={reportes}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 12 }}
      ListHeaderComponent={username ? <Text style={styles.subtitulo}>@{username}</Text> : null}
      ListEmptyComponent={
        <Text style={styles.vacio}>{modo === "hechas" ? t("No hizo ninguna denuncia todavía.") : t("No recibió ninguna denuncia todavía.")}</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          {modo === "hechas" ? (
            item.reportado_id ? (
              <Pressable onPress={() => navigation.navigate("PerfilAjeno", { userId: item.reportado_id })}>
                <Text style={styles.filaTexto}>
                  {t("Denunció a")}: <Text style={styles.link}>@{item.reportado_username ?? "—"}</Text>
                </Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable onPress={() => navigation.navigate("PerfilAjeno", { userId: item.reporter_id })}>
              <Text style={styles.filaTexto}>
                {t("Lo denunció")}: <Text style={styles.link}>@{item.reporter_username ?? "—"}</Text>
              </Text>
            </Pressable>
          )}
          <Text style={styles.motivo}>{t(item.reason)}</Text>
          <Text style={styles.tipo}>{item.target_type}</Text>
          {item.contenido && <Text style={styles.contenido}>"{item.contenido}"</Text>}
          {item.details && (
            <View style={styles.detalleBox}>
              <Text style={styles.detalleLabel}>{t("Mensaje de quien denunció")}:</Text>
              <Text style={styles.detalleTexto}>{item.details}</Text>
            </View>
          )}
          <Text style={styles.fecha}>{formatearFechaHora(item.created_at)}</Text>
          <Text style={styles.estado}>
            {t("Estado")}: {t(item.status)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  subtitulo: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 10 },
  filaTexto: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 2 },
  link: { color: theme.colors.primaryLight, fontWeight: "700" },
  motivo: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  tipo: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", color: theme.colors.textFaint, marginTop: 2 },
  contenido: { fontSize: 13, marginTop: 6, fontStyle: "italic" },
  detalleBox: { backgroundColor: theme.colors.surfaceAlt, borderRadius: 6, padding: 8, marginTop: 8 },
  detalleLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted },
  detalleTexto: { fontSize: 13, marginTop: 2 },
  fecha: { fontSize: 11, color: theme.colors.textFaint, marginTop: 6 },
  estado: { fontSize: 11, color: theme.colors.textFaint, marginTop: 2 },
});
