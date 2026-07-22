import React, { useEffect, useState } from "react";
import { FlatList, View, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { getRankingTiempoSeries, getRankingTiempoPeliculas, formatTiempo, PuestoRanking } from "../lib/stats";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: any;
  navigation: any;
}

export default function RankingScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { tipo } = route.params;
  const [ranking, setRanking] = useState<PuestoRanking[] | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const data = tipo === "series" ? await getRankingTiempoSeries(uid) : await getRankingTiempoPeliculas(uid);
    setRanking(data);
  }

  if (!ranking) return <ActivityIndicator style={{ marginTop: 32 }} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={styles.header}>
        <Text style={styles.headerTexto}>{t("CLASIFICACIÓN")}</Text>
        <Text style={styles.headerTexto}>{t("TIEMPO EMPLEADO")}</Text>
      </View>
      <FlatList
        data={ranking}
        keyExtractor={(r) => r.userId}
        renderItem={({ item, index }) => {
          const tFormato = formatTiempo(item.minutos);
          return (
            <Pressable
              style={[styles.fila, item.soyYo && styles.filaPropia]}
              disabled={item.soyYo}
              onPress={() => navigation.navigate("PerfilAjeno", { userId: item.userId })}
            >
              <Text style={styles.puesto}>{index + 1}.</Text>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: theme.colors.surfaceAlt }]} />
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.nombre}>{item.username ?? t("Usuario")}</Text>
                {item.soyYo && <Text style={styles.tu}>{t("TU")}</Text>}
              </View>
              <Text style={styles.tiempo}>
                {tFormato.anios > 0 ? `${tFormato.anios}a ` : ""}
                {tFormato.meses}m {tFormato.dias}d {tFormato.horas}h
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  headerTexto: { fontSize: 11, color: theme.colors.textFaint, textTransform: "uppercase" },
  fila: { flexDirection: "row", alignItems: "center", padding: 14 },
  filaPropia: { backgroundColor: theme.colors.surface },
  puesto: { width: 24, fontSize: 14, color: theme.colors.textMuted },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  nombre: { fontSize: 14, fontWeight: "600" },
  tu: { fontSize: 10, color: theme.colors.primaryLight },
  tiempo: { fontSize: 13, fontWeight: "700" },
});
