import React, { useEffect, useState } from "react";
import { Modal, View, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { Text } from "./Themed";
import { GENEROS_PELICULAS, GENEROS_SERIES } from "../lib/tmdbGenres";
import { getWatchProvidersDisponibles, GrupoPlataforma } from "../lib/tmdb";
import { elegirQueVemos } from "../lib/queVemos";
import { enviarQueVemos } from "../lib/chats";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  chatId: string;
  userId: string;
  otroUserId: string;
  watchRegion: string;
  onEnviado: () => void;
}

export default function QueVemosModal({ visible, onCerrar, chatId, userId, otroUserId, watchRegion, onEnviado }: Props) {
  const { t } = useT();
  const [paso, setPaso] = useState<"tipo" | "filtros">("tipo");
  const [tipo, setTipo] = useState<"movie" | "series" | null>(null);
  const [generosElegidos, setGenerosElegidos] = useState<Set<number>>(new Set());
  const [plataformasDisponibles, setPlataformasDisponibles] = useState<GrupoPlataforma[]>([]);
  const [plataformasElegidas, setPlataformasElegidas] = useState<Set<string>>(new Set());
  const [buscando, setBuscando] = useState(false);
  const [sinResultado, setSinResultado] = useState(false);

  useEffect(() => {
    if (!visible) {
      // se resetea al cerrar, para que la próxima vez arranque de cero
      setPaso("tipo");
      setTipo(null);
      setGenerosElegidos(new Set());
      setPlataformasElegidas(new Set());
      setSinResultado(false);
    }
  }, [visible]);

  useEffect(() => {
    if (tipo) getWatchProvidersDisponibles(tipo, watchRegion).then(setPlataformasDisponibles);
  }, [tipo, watchRegion]);

  function elegirTipo(t: "movie" | "series") {
    setTipo(t);
    setPaso("filtros");
  }

  function toggleGenero(id: number) {
    setGenerosElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function togglePlataforma(clave: string) {
    setPlataformasElegidas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(clave)) nuevo.delete(clave);
      else nuevo.add(clave);
      return nuevo;
    });
  }

  async function buscar() {
    if (!tipo) return;
    setBuscando(true);
    setSinResultado(false);
    try {
      const idsPlataformas = plataformasDisponibles.filter((p) => plataformasElegidas.has(p.clave)).flatMap((p) => p.provider_ids);
      const resultado = await elegirQueVemos(userId, otroUserId, tipo, [...generosElegidos], idsPlataformas, watchRegion);
      if (!resultado) {
        setSinResultado(true);
        return;
      }
      await enviarQueVemos(chatId, userId, resultado.tipo, resultado.tmdbId);
      onEnviado();
      onCerrar();
    } catch (e) {
      console.error("Error al elegir qué ver:", e);
      setSinResultado(true);
    } finally {
      setBuscando(false);
    }
  }

  const generos = tipo === "series" ? GENEROS_SERIES : GENEROS_PELICULAS;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{t("¿Qué vemos?")}</Text>

          {paso === "tipo" ? (
            <View style={styles.tipoRow}>
              <Pressable style={styles.tipoBtn} onPress={() => elegirTipo("movie")}>
                <Text style={styles.tipoBtnTexto}>{t("Película")}</Text>
              </Pressable>
              <Pressable style={styles.tipoBtn} onPress={() => elegirTipo("series")}>
                <Text style={styles.tipoBtnTexto}>{t("Serie")}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.seccionTitulo}>{t("Género")}</Text>
              <View style={styles.chipsWrap}>
                {Object.entries(generos).map(([id, nombre]) => (
                  <Pressable
                    key={id}
                    style={[styles.chip, generosElegidos.has(Number(id)) && styles.chipActivo]}
                    onPress={() => toggleGenero(Number(id))}
                  >
                    <Text style={[styles.chipTexto, generosElegidos.has(Number(id)) && styles.chipTextoActivo]}>{t(nombre)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.seccionTitulo}>{t("Plataforma")}</Text>
              <View style={styles.chipsWrap}>
                {plataformasDisponibles.map((p) => (
                  <Pressable
                    key={p.clave}
                    style={[styles.chip, plataformasElegidas.has(p.clave) && styles.chipActivo]}
                    onPress={() => togglePlataforma(p.clave)}
                  >
                    <Text style={[styles.chipTexto, plataformasElegidas.has(p.clave) && styles.chipTextoActivo]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              {sinResultado && <Text style={styles.sinResultado}>{t("No encontramos nada — probá con menos filtros.")}</Text>}

              <Pressable style={styles.buscarBtn} onPress={buscar} disabled={buscando}>
                {buscando ? <ActivityIndicator color="#000000" /> : <Text style={styles.buscarBtnTexto}>{t("¿Qué vemos?")}</Text>}
              </Pressable>
              <Pressable onPress={() => setPaso("tipo")} style={{ marginTop: 10 }}>
                <Text style={styles.volverTexto}>{t("‹ Elegir película o serie de nuevo")}</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 20 },
  hoja: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20, width: "100%", maxWidth: 400 },
  titulo: { fontSize: 17, fontWeight: "800", color: theme.colors.text, marginBottom: 16, textAlign: "center" },
  tipoRow: { flexDirection: "row", gap: 12 },
  tipoBtn: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 20, alignItems: "center" },
  tipoBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 15 },
  seccionTitulo: { fontSize: 12, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase", marginTop: 8, marginBottom: 8 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  chipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTexto: { fontSize: 12.5, color: theme.colors.textMuted, fontWeight: "600" },
  chipTextoActivo: { color: "#000000", fontWeight: "800" },
  sinResultado: { fontSize: 12.5, color: theme.colors.danger, textAlign: "center", marginTop: 14 },
  buscarBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  buscarBtnTexto: { color: "#000000", fontWeight: "800", fontSize: 15 },
  volverTexto: { fontSize: 12.5, color: theme.colors.primaryLight, textAlign: "center", fontWeight: "600" },
});
