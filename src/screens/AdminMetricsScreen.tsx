import React, { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { theme } from "../theme";

interface Metricas {
  usuarios_totales: number;
  usuarios_nuevos_7_dias: number;
  usuarios_nuevos_30_dias: number;
  usuarios_activos_7_dias: number;
  usuarios_privados: number;
  usuarios_suspendidos: number;
  moderadores: number;
  peliculas_trackeadas: number;
  series_seguidas: number;
  capitulos_marcados: number;
  comentarios_totales: number;
  comentarios_7_dias: number;
  grupos_totales: number;
  grupos_publicos: number;
  grupos_privados: number;
  chats_totales: number;
  mensajes_totales: number;
  denuncias_pendientes: number;
  denuncias_totales: number;
  bloqueos_totales: number;
  registros_por_dia: { dia: string; cantidad: number }[];
}

function Card({ titulo, valor, destacado }: { titulo: string; valor: number | string; destacado?: boolean }) {
  return (
    <View style={[styles.card, destacado && styles.cardDestacada]}>
      <Text style={[styles.cardValor, destacado && styles.cardValorDestacado]}>{valor}</Text>
      <Text style={styles.cardTitulo}>{titulo}</Text>
    </View>
  );
}

export default function AdminMetricsScreen() {
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("obtener_metricas_admin");
      if (error) throw error;
      setMetricas(data as Metricas);
    } catch (e: any) {
      setError(e.message ?? "No se pudieron cargar las métricas.");
    } finally {
      setCargando(false);
    }
  }

  if (cargando) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />;

  if (error || !metricas) {
    return (
      <View style={{ padding: 24, alignItems: "center" }}>
        <Text style={{ color: theme.colors.textMuted, marginBottom: 12, textAlign: "center" }}>{error}</Text>
        <AppButton title="Reintentar" onPress={cargar} variant="outline" />
      </View>
    );
  }

  const maxRegistros = Math.max(1, ...metricas.registros_por_dia.map((d) => d.cantidad));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 12 }}>
      <Text style={styles.seccion}>Usuarios</Text>
      <View style={styles.grid}>
        <Card titulo="Usuarios totales" valor={metricas.usuarios_totales} destacado />
        <Card titulo="Nuevos (7 días)" valor={metricas.usuarios_nuevos_7_dias} />
        <Card titulo="Nuevos (30 días)" valor={metricas.usuarios_nuevos_30_dias} />
        <Card titulo="Activos (7 días)" valor={metricas.usuarios_activos_7_dias} />
        <Card titulo="Perfiles privados" valor={metricas.usuarios_privados} />
        <Card titulo="Suspendidos" valor={metricas.usuarios_suspendidos} />
        <Card titulo="Moderadores" valor={metricas.moderadores} />
      </View>

      <Text style={styles.seccion}>Registros de los últimos 14 días</Text>
      <View style={styles.barChart}>
        {metricas.registros_por_dia.map((d) => (
          <View key={d.dia} style={styles.barCol}>
            <View style={[styles.bar, { height: Math.max(2, (d.cantidad / maxRegistros) * 80) }]} />
            <Text style={styles.barValor}>{d.cantidad}</Text>
            <Text style={styles.barDia}>{d.dia.slice(8, 10)}/{d.dia.slice(5, 7)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.seccion}>Contenido trackeado</Text>
      <View style={styles.grid}>
        <Card titulo="Películas trackeadas" valor={metricas.peliculas_trackeadas} />
        <Card titulo="Series seguidas" valor={metricas.series_seguidas} />
        <Card titulo="Capítulos marcados" valor={metricas.capitulos_marcados} />
      </View>

      <Text style={styles.seccion}>Comunidad</Text>
      <View style={styles.grid}>
        <Card titulo="Comentarios totales" valor={metricas.comentarios_totales} />
        <Card titulo="Comentarios (7 días)" valor={metricas.comentarios_7_dias} />
        <Card titulo="Grupos totales" valor={metricas.grupos_totales} />
        <Card titulo="Grupos públicos" valor={metricas.grupos_publicos} />
        <Card titulo="Grupos privados" valor={metricas.grupos_privados} />
        <Card titulo="Chats activos" valor={metricas.chats_totales} />
        <Card titulo="Mensajes totales" valor={metricas.mensajes_totales} />
      </View>

      <Text style={styles.seccion}>Moderación</Text>
      <View style={styles.grid}>
        <Card titulo="Denuncias pendientes" valor={metricas.denuncias_pendientes} destacado={metricas.denuncias_pendientes > 0} />
        <Card titulo="Denuncias totales" valor={metricas.denuncias_totales} />
        <Card titulo="Bloqueos entre usuarios" valor={metricas.bloqueos_totales} />
      </View>

      <View style={{ height: 12 }} />
      <AppButton title="Actualizar" onPress={cargar} variant="outline" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  seccion: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, textTransform: "uppercase", marginTop: 20, marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { flexBasis: "31%", flexGrow: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, alignItems: "center" },
  cardDestacada: { borderWidth: 1, borderColor: theme.colors.primary },
  cardValor: { fontSize: 22, fontWeight: "800", color: theme.colors.text },
  cardValorDestacado: { color: theme.colors.primaryLight },
  cardTitulo: { fontSize: 11, color: theme.colors.textMuted, textAlign: "center", marginTop: 4 },
  barChart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, height: 140 },
  barCol: { alignItems: "center", flex: 1 },
  bar: { width: 8, backgroundColor: theme.colors.primary, borderRadius: 4 },
  barValor: { fontSize: 9, color: theme.colors.textMuted, marginTop: 4 },
  barDia: { fontSize: 8, color: theme.colors.textFaint, marginTop: 2 },
});
