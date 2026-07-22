import React, { useState, useEffect } from "react";
import { Modal, View, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { Text, AppButton } from "./Themed";
import { GENEROS_PELICULAS } from "../lib/tmdbGenres";
import { getWatchProvidersDisponibles, posterUrl, GrupoPlataforma } from "../lib/tmdb";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  watchRegion: string;
  generoActual: number | null;
  plataformasActuales: string[];
  onAplicar: (generoId: number | null, plataformas: string[]) => void;
}

export default function FiltroPendientesModal({ visible, onCerrar, watchRegion, generoActual, plataformasActuales, onAplicar }: Props) {
  const { t } = useT();
  const [generoId, setGeneroId] = useState<number | null>(generoActual);
  const [plataformas, setPlataformas] = useState<string[]>(plataformasActuales);
  const [plataformasDisponibles, setPlataformasDisponibles] = useState<GrupoPlataforma[]>([]);

  useEffect(() => {
    if (visible) {
      setGeneroId(generoActual);
      setPlataformas(plataformasActuales);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    getWatchProvidersDisponibles("movie", watchRegion).then(setPlataformasDisponibles);
  }, [visible, watchRegion]);

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.hoja} onPress={(e) => e.stopPropagation()}>
          <ScrollView bounces={false}>
            <Text style={styles.titulo}>{t("Género")}</Text>
            <View style={styles.chipsWrap}>
              <Pressable style={[styles.pillChico, generoId === null && styles.pillActivo]} onPress={() => setGeneroId(null)}>
                <Text style={[styles.pillTextoChico, generoId === null && styles.pillTextoActivo]}>{t("Todos")}</Text>
              </Pressable>
              {Object.entries(GENEROS_PELICULAS).map(([id, nombre]) => (
                <Pressable key={id} style={[styles.pillChico, generoId === Number(id) && styles.pillActivo]} onPress={() => setGeneroId(Number(id))}>
                  <Text style={[styles.pillTextoChico, generoId === Number(id) && styles.pillTextoActivo]}>{t(nombre)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.titulo}>{t("Plataforma")}</Text>
            <View style={styles.chipsWrap}>
              <Pressable style={[styles.plataformaChip, plataformas.length === 0 && styles.pillActivo]} onPress={() => setPlataformas([])}>
                <Text style={[styles.pillTextoChico, plataformas.length === 0 && styles.pillTextoActivo]}>{t("Todas")}</Text>
              </Pressable>
              {plataformasDisponibles.map((p) =>
                p.clave === "otras" ? (
                  <Pressable
                    key={p.clave}
                    style={[styles.plataformaChip, plataformas.includes("otras") && styles.pillActivo]}
                    onPress={() => togglePlataforma("otras")}
                  >
                    <Text style={[styles.pillTextoChico, plataformas.includes("otras") && styles.pillTextoActivo]}>{t("Otras")}</Text>
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
            <Text style={styles.ayuda}>
              {t('Las que no están disponibles en ninguna plataforma (por ejemplo, todavía en el cine) aparecen cuando el filtro está en "Todas".')}
            </Text>
          </ScrollView>

          <View style={{ height: 8 }} />
          <AppButton title={t("Aplicar filtros")} onPress={() => onAplicar(generoId, plataformas)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  hoja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20, maxHeight: "80%" },
  titulo: { fontSize: 15, fontWeight: "700", marginBottom: 12, marginTop: 8 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pillChico: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingVertical: 6, paddingHorizontal: 11 },
  pillActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pillTextoChico: { fontSize: 11, color: theme.colors.textMuted },
  pillTextoActivo: { color: "#000000", fontWeight: "700" },
  plataformaChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, justifyContent: "center" },
  logoBox: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "transparent", backgroundColor: theme.colors.surfaceAlt },
  logoBoxActivo: { borderColor: theme.colors.primary },
  logoImg: { width: "100%", height: "100%" },
  ayuda: { fontSize: 11, color: theme.colors.textFaint, marginTop: 14, marginBottom: 8 },
});
