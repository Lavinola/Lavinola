import React, { useEffect, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text, AppButton } from "../components/Themed";
import UnderlineTabs from "../components/UnderlineTabs";
import { supabase } from "../lib/supabase";
import {
  getEstadisticasSeries,
  getEstadisticasPeliculas,
  formatTiempo,
  EstadisticasSeries,
  EstadisticasPeliculas,
} from "../lib/stats";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Tab = "series" | "peliculas";

export default function StatsScreen({ navigation }: any) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("peliculas");

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <UnderlineTabs
        opciones={[
          { key: "peliculas", label: t("Películas") },
          { key: "series", label: t("Series") },
        ]}
        valor={tab}
        onCambiar={setTab}
      />
      {tab === "series" ? <StatsSeriesTab navigation={navigation} /> : <StatsPeliculasTab navigation={navigation} />}
    </View>
  );
}

function StatsSeriesTab({ navigation }: any) {
  const { t, locale } = useT();
  const [stats, setStats] = useState<EstadisticasSeries | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setStats(await getEstadisticasSeries(uid));
  }

  if (!stats) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const tiempo = formatTiempo(stats.tiempoTotalMinutos);
  const tPendientes = formatTiempo(stats.minutosEpisodiosPendientes);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <Card titulo={t("Tiempo dedicado a ver episodios")}>
        <Text style={styles.tiempoGrande}>
          {tiempo.anios > 0 && `${tiempo.anios}a `}
          {tiempo.meses} {t("meses")} {tiempo.dias} {t("días")} {tiempo.horas} {t("horas")}
        </Text>
        <Text style={styles.subdato}>{t("{n} horas en total").replace("{n}", String(Math.round(stats.tiempoTotalMinutos / 60)))}</Text>
        <Pressable onPress={() => navigation.navigate("Ranking", { tipo: "series" })}>
          <Text style={styles.link}>{t("Comparar con la gente que sigues")}</Text>
        </Pressable>
      </Card>

      <Card titulo={t("Total de episodios vistos")}>
        <Text style={styles.numeroGrande}>{stats.episodiosVistosTotal.toLocaleString(locale)}</Text>
        <Text style={styles.subdato}>{t("{n} en los últimos 7 días").replace("{n}", String(stats.episodiosUltimos7Dias))}</Text>
      </Card>

      <Card titulo={t("Series añadidas")}>
        <Text style={styles.numeroGrande}>{stats.seriesAnadidas}</Text>
        <Text style={styles.subdato}>{t("{n} aún en producción").replace("{n}", String(stats.seriesEnProduccion))}</Text>
      </Card>

      <Card titulo={t("Cómo vas con tus series")}>
        <View style={styles.filaTabla}>
          <Text style={styles.tablaTexto}>{t("Terminadas")}</Text>
          <Text style={styles.tablaTexto}>{stats.seriesTerminadas}</Text>
        </View>
        <View style={styles.filaTabla}>
          <Text style={styles.tablaTexto}>{t("Viendo")}</Text>
          <Text style={styles.tablaTexto}>{stats.seriesViendo}</Text>
        </View>
        <View style={styles.filaTabla}>
          <Text style={styles.tablaTexto}>{t("Sin comenzar")}</Text>
          <Text style={styles.tablaTexto}>{stats.seriesSinComenzar}</Text>
        </View>
      </Card>

      <Card titulo={t("Géneros populares")}>
        <TablaConteo items={stats.generosPopulares} columna={t("Series")} />
      </Card>

      <Card titulo={t("Dónde lo viste")}>
        <TablaConteo items={stats.plataformasPopulares} columna={t("Series")} />
      </Card>

      <Card titulo={t("Calificaciones votadas")}>
        <Text style={styles.numeroGrande}>{stats.calificacionesVotadas}</Text>
        <Text style={styles.subdato}>{t("en {n} series").replace("{n}", String(stats.calificacionesVotadas))}</Text>
      </Card>

      <Card titulo={t("Comentarios")}>
        <Text style={styles.numeroGrande}>{stats.comentariosCantidad}</Text>
        <Text style={styles.subdato}>{t("en {n} series").replace("{n}", String(stats.comentariosEnCuantasSeries))}</Text>
      </Card>

      <Card titulo={t("Me gusta conseguidos")}>
        <Text style={styles.numeroGrande}>{stats.meGustaConseguidos}</Text>
        <Text style={styles.subdato}>{t("en tus comentarios sobre series")}</Text>
      </Card>

      <Card titulo={t("Episodios pendientes")}>
        <Text style={styles.numeroGrande}>{stats.episodiosPendientes.toLocaleString(locale)}</Text>
        <Text style={styles.subdato}>
          {t("{d}d {h}h para verlos todos ({horas} horas)").replace("{d}", String(tPendientes.dias)).replace("{h}", String(tPendientes.horas)).replace("{horas}", String(Math.round(stats.minutosEpisodiosPendientes / 60)))}
        </Text>
      </Card>
    </ScrollView>
  );
}

function StatsPeliculasTab({ navigation }: any) {
  const { t, locale } = useT();
  const [stats, setStats] = useState<EstadisticasPeliculas | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    setStats(await getEstadisticasPeliculas(uid));
  }

  if (!stats) return <ActivityIndicator style={{ marginTop: 32 }} />;

  const tiempo = formatTiempo(stats.tiempoTotalMinutos);
  const tPendientes = formatTiempo(stats.minutosPeliculasPendientes);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
      <Card titulo={t("Tiempo dedicado a ver películas")}>
        <Text style={styles.tiempoGrande}>
          {tiempo.meses} {t("meses")} {tiempo.dias} {t("días")} {tiempo.horas} {t("horas")}
        </Text>
        <Text style={styles.subdato}>{t("{n} horas en total").replace("{n}", String(Math.round(stats.tiempoTotalMinutos / 60)))}</Text>
        <Pressable onPress={() => navigation.navigate("Ranking", { tipo: "peliculas" })}>
          <Text style={styles.link}>{t("Comparar con la gente que sigues")}</Text>
        </Pressable>
      </Card>

      <Card titulo={t("Total de películas vistas")}>
        <Text style={styles.numeroGrande}>{stats.peliculasVistas.toLocaleString(locale)}</Text>
        <Text style={styles.subdato}>{t("{n} en los últimos 7 días").replace("{n}", String(stats.peliculasVistasUltimos7Dias))}</Text>
      </Card>

      <Card titulo={t("Películas añadidas")}>
        <Text style={styles.numeroGrande}>{stats.peliculasAnadidas}</Text>
      </Card>

      <Card titulo={t("Géneros de películas populares")}>
        <TablaConteo items={stats.generosPopulares} columna={t("Películas")} />
      </Card>

      <Card titulo={t("Calificaciones votadas")}>
        <Text style={styles.numeroGrande}>{stats.calificacionesVotadas}</Text>
        <Text style={styles.subdato}>{t("en {n} películas").replace("{n}", String(stats.calificacionesVotadas))}</Text>
      </Card>

      <Card titulo={t("Comentarios")}>
        <Text style={styles.numeroGrande}>{stats.comentariosCantidad}</Text>
        <Text style={styles.subdato}>{t("en {n} películas").replace("{n}", String(stats.comentariosEnCuantasPeliculas))}</Text>
      </Card>

      <Card titulo={t("Me gusta conseguidos")}>
        <Text style={styles.numeroGrande}>{stats.meGustaConseguidos}</Text>
        <Text style={styles.subdato}>{t("en tus comentarios sobre películas")}</Text>
      </Card>

      <Card titulo={t("Películas pendientes")}>
        <Text style={styles.numeroGrande}>{stats.peliculasPendientes}</Text>
        <Text style={styles.subdato}>
          {t("{d}d {h}h para verlas todas ({horas} horas)").replace("{d}", String(tPendientes.dias)).replace("{h}", String(tPendientes.horas)).replace("{horas}", String(Math.round(stats.minutosPeliculasPendientes / 60)))}
        </Text>
      </Card>
    </ScrollView>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitulo}>{t(titulo)}</Text>
      {children}
    </View>
  );
}

function TablaConteo({ items, columna }: { items: { nombre: string; cantidad: number }[]; columna: string }) {
  const { t } = useT();
  if (items.length === 0) return <Text style={styles.subdato}>{t("Todavía no hay datos suficientes.")}</Text>;
  return (
    <View>
      <View style={styles.filaTabla}>
        <Text style={styles.tablaHeader}>{"".padEnd(0)}</Text>
        <Text style={styles.tablaHeader}>{columna}</Text>
      </View>
      {items.map((item) => (
        <View key={item.nombre} style={styles.filaTabla}>
          <Text style={styles.tablaTexto}>{t(item.nombre)}</Text>
          <Text style={styles.tablaTexto}>{item.cantidad}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 16, marginBottom: 12 },
  cardTitulo: { fontSize: 14, fontWeight: "700", marginBottom: 10 },
  tiempoGrande: { fontSize: 26, fontWeight: "700" },
  numeroGrande: { fontSize: 30, fontWeight: "700" },
  subdato: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  link: { color: theme.colors.primaryLight, fontSize: 13, marginTop: 12 },
  filaTabla: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  tablaHeader: { fontSize: 11, color: theme.colors.textFaint, textTransform: "uppercase" },
  tablaTexto: { fontSize: 13 },
});
