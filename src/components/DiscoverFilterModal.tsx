import React, { useState } from "react";
import { View, Modal, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { Text, AppButton } from "./Themed";
import { OrdenDescubrir, EstadoSerie, ETIQUETAS_ORDEN } from "../lib/discover";
import { GENEROS_SERIES, GENEROS_PELICULAS } from "../lib/tmdbGenres";
import { getWatchProvidersDisponibles, posterUrl, GrupoPlataforma } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  tipo: "series" | "movie";
  ordenActual: OrdenDescubrir;
  generoActual: number | null;
  estadoActual: EstadoSerie;
  watchRegion: string;
  plataformasActuales: string[];
  onCerrar: () => void;
  onAplicar: (params: { orden: OrdenDescubrir; generoId: number | null; estado: EstadoSerie; plataformas: string[] }) => void;
}

const ORDENES: OrdenDescubrir[] = ["recomendado", "tendencias", "mas_visto", "visto_amigos", "mas_añadido"];
const ESTADOS: { key: EstadoSerie; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "en_emision", label: "En emisión" },
  { key: "finalizada", label: "Finalizada" },
];

export default function DiscoverFilterModal({
  visible,
  tipo,
  ordenActual,
  generoActual,
  estadoActual,
  watchRegion,
  plataformasActuales,
  onCerrar,
  onAplicar,
}: Props) {
  const { t } = useT();
  const [orden, setOrden] = useState(ordenActual);
  const [generoId, setGeneroId] = useState<number | null>(generoActual);
  const [estado, setEstado] = useState(estadoActual);
  const [plataformas, setPlataformas] = useState<string[]>(plataformasActuales);
  const [plataformasDisponibles, setPlataformasDisponibles] = useState<GrupoPlataforma[]>([]);

  React.useEffect(() => {
    if (visible) {
      setOrden(ordenActual);
      setGeneroId(generoActual);
      setEstado(estadoActual);
      setPlataformas(plataformasActuales);
    }
  }, [visible]);

  React.useEffect(() => {
    if (!visible) return;
    getWatchProvidersDisponibles(tipo, watchRegion).then(setPlataformasDisponibles);
  }, [visible, tipo, watchRegion]);

  function elegirTodas() {
    setPlataformas([]);
  }

  function togglePlataforma(clave: string) {
    if (clave === "otras") {
      setPlataformas((prev) => (prev.includes("otras") ? [] : ["otras"]));
      return;
    }
    setPlataformas((prev) => {
      const sinOtras = prev.filter((p) => p !== "otras");
      return sinOtras.includes(clave) ? sinOtras.filter((p) => p !== clave) : [...sinOtras, clave];
    });
  }

  const generos = tipo === "series" ? GENEROS_SERIES : GENEROS_PELICULAS;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={() => {}}>
          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={styles.titulo}>{t("Filtrar")}</Text>

            <Text style={styles.seccion}>{t("Ordenar por")}</Text>
            <View style={styles.chipsWrap}>
              {ORDENES.map((o) => (
                <Pressable key={o} style={[styles.chip, orden === o && styles.chipActivo]} onPress={() => setOrden(o)}>
                  <Text style={[styles.chipTexto, orden === o && styles.chipTextoActivo]}>{t(ETIQUETAS_ORDEN[o])}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.seccion}>{t("Género")}</Text>
            <View style={styles.chipsWrap}>
              <Pressable style={[styles.pillChico, generoId === null && styles.chipActivo]} onPress={() => setGeneroId(null)}>
                <Text style={[styles.pillTextoChico, generoId === null && styles.chipTextoActivo]}>{t("Todos")}</Text>
              </Pressable>
              {Object.entries(generos).map(([id, nombre]) => (
                <Pressable key={id} style={[styles.pillChico, generoId === Number(id) && styles.chipActivo]} onPress={() => setGeneroId(Number(id))}>
                  <Text style={[styles.pillTextoChico, generoId === Number(id) && styles.chipTextoActivo]}>{t(nombre)}</Text>
                </Pressable>
              ))}
            </View>

            {tipo === "series" && (
              <>
                <Text style={styles.seccion}>{t("Estado")}</Text>
                <View style={styles.chipsWrap}>
                  {ESTADOS.map((e) => (
                    <Pressable key={e.key} style={[styles.chip, estado === e.key && styles.chipActivo]} onPress={() => setEstado(e.key)}>
                      <Text style={[styles.chipTexto, estado === e.key && styles.chipTextoActivo]}>{t(e.label)}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <>
                <Text style={styles.seccion}>{t("Plataforma")}</Text>
                <View style={styles.chipsWrap}>
                  <Pressable style={[styles.plataformaChip, plataformas.length === 0 && styles.plataformaChipActivo]} onPress={elegirTodas}>
                    <Text style={[styles.chipTexto, plataformas.length === 0 && styles.chipTextoActivo]}>{t("Todas")}</Text>
                  </Pressable>
                  {plataformasDisponibles.map((p) =>
                    p.clave === "otras" ? (
                      <Pressable
                        key={p.clave}
                        style={[styles.plataformaChip, plataformas.includes("otras") && styles.plataformaChipActivo]}
                        onPress={() => togglePlataforma("otras")}
                      >
                        <Text style={[styles.chipTexto, plataformas.includes("otras") && styles.chipTextoActivo]}>{t("Otras")}</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        key={p.clave}
                        onPress={() => togglePlataforma(p.clave)}
                        style={[styles.logoBox, plataformas.includes(p.clave) && styles.logoBoxActivo]}
                      >
                        {p.logo_path && <Image source={{ uri: posterUrl(p.logo_path, "w185")! }} style={styles.logoImg} />}
                      </Pressable>
                    )
                  )}
                </View>
              </>

            <View style={{ height: 12 }} />
            <AppButton title={t("Aplicar filtros")} onPress={() => onAplicar({ orden, generoId, estado, plataformas })} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20, maxHeight: "80%" },
  titulo: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  seccion: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border },
  chipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTexto: { fontSize: 12, color: theme.colors.textMuted },
  chipTextoActivo: { color: "#000000", fontWeight: "700" },
  pillChico: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 11 },
  pillTextoChico: { fontSize: 11, color: theme.colors.textMuted },
  plataformaChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, justifyContent: "center" },
  plataformaChipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  logoBox: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: theme.colors.surfaceAlt },
  logoBoxActivo: { borderColor: theme.colors.primary },
  logoImg: { width: "100%", height: "100%" },
});
