import React, { useState } from "react";
import { Modal, View, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";
import OnboardingDetalleModal from "./OnboardingDetalleModal";

interface Props {
  visible: boolean;
  onCerrar: () => void;
}

interface Punto {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  texto: string;
}

export default function OnboardingModal({ visible, onCerrar }: Props) {
  const { t } = useT();
  const [verDetalle, setVerDetalle] = useState(false);

  const puntos: Punto[] = [
    {
      icono: "checkmark-circle",
      titulo: t("Trackeá lo que ves"),
      texto: t("Marcá series y películas como vistas o pendientes. Lavinola calcula sola tu progreso y estado."),
    },
    {
      icono: "calendar",
      titulo: t("No te pierdas estrenos"),
      texto: t("La pestaña Próximamente te avisa cuándo sale el siguiente capítulo de tus series."),
    },
    {
      icono: "people",
      titulo: t("Sumate a la comunidad"),
      texto: t("Seguí a otros usuarios, comentá, y creá o unite a grupos temáticos en la pestaña Comunidad."),
    },
    {
      icono: "list",
      titulo: t("Armá tus listas"),
      texto: t("Agrupá títulos en listas propias y compartilas con quien quieras."),
    },
    {
      icono: "cloud-download",
      titulo: t("¿Venís de TV Time o Letterboxd?"),
      texto: t("Importá tu historial completo desde Ajustes → Importar datos."),
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
          <Image source={require("../../assets/logo-icon-only.png")} style={styles.logo} resizeMode="contain" />
          <Text style={styles.titulo}>{t("¡Bienvenido a Lavinola!")}</Text>
          <Text style={styles.subtitulo}>{t("Un repaso rápido de lo que podés hacer:")}</Text>

          <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
            {puntos.map((p, i) => (
              <View key={i} style={styles.fila}>
                <View style={styles.iconoWrap}>
                  <Ionicons name={p.icono} size={20} color={theme.colors.primaryLight} />
                </View>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaTitulo}>{p.titulo}</Text>
                  <Text style={styles.filaDetalle}>{p.texto}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.verMasBtn} onPress={() => setVerDetalle(true)}>
            <Text style={styles.verMasTexto}>{t("Ver más")}</Text>
          </Pressable>

          <Pressable style={styles.boton} onPress={onCerrar}>
            <Text style={styles.botonTexto}>{t("¡Empezar!")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>

      <OnboardingDetalleModal visible={verDetalle} onCerrar={() => setVerDetalle(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 },
  caja: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "85%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 22,
    alignItems: "center",
  },
  logo: { width: 56, height: 40, marginBottom: 10 },
  titulo: { fontSize: 19, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  subtitulo: { fontSize: 13, color: theme.colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: 16 },
  lista: { alignSelf: "stretch" },
  fila: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  iconoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  filaTexto: { flex: 1 },
  filaTitulo: { fontSize: 14, fontWeight: "700", color: theme.colors.text, marginBottom: 2 },
  filaDetalle: { fontSize: 12.5, color: theme.colors.textMuted, lineHeight: 18 },
  boton: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 6,
  },
  botonTexto: { fontSize: 15, fontWeight: "800", color: "#000000" },
  verMasBtn: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
  verMasTexto: { fontSize: 13, fontWeight: "700", color: theme.colors.primaryLight, textDecorationLine: "underline" },
});
