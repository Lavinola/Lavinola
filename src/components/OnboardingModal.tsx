import React from "react";
import { Modal, View, Pressable, ScrollView, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Themed";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";
import { navigationRef } from "../navigation";

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

  function verComoFunciona() {
    onCerrar();
    // OnboardingModal vive afuera del NavigationContainer (se monta desde
    // GlobalOnboardingHost, en la raíz), por eso se navega con el ref
    // imperativo en vez del hook useNavigation() (que acá no anda, no hay
    // contexto de navegación disponible en este punto del árbol).
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate("ComoUsarLavinola");
    }
  }

  const puntos: Punto[] = [
    {
      icono: "checkmark-circle",
      titulo: t("Trackeá lo que ves"),
      texto: t("Marcá series y películas como vistas o pendientes. Lavinola calcula sola tu progreso y estado."),
    },
    {
      icono: "calendar",
      titulo: t("No te pierdas estrenos"),
      texto: t("Las pestañas Próximamente te avisan cuando sale la siguiente película o el siguiente capítulo de tus series."),
    },
    {
      icono: "people",
      titulo: t("Sumate a la comunidad"),
      texto: t("Seguí a otros usuarios, publicá en el Lobby, comentá, y creá o unite a grupos temáticos."),
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
                  <Ionicons name={p.icono} size={15} color={theme.colors.primaryLight} />
                </View>
                <View style={styles.filaTexto}>
                  <Text style={styles.filaTitulo}>{p.titulo}</Text>
                  <Text style={styles.filaDetalle}>{p.texto}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable style={styles.verMasBtn} onPress={verComoFunciona}>
            <Text style={styles.verMasTexto}>{t("Cómo funciona")}</Text>
          </Pressable>

          <Pressable style={styles.boton} onPress={onCerrar}>
            <Text style={styles.botonTexto}>{t("¡Empezar!")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
    padding: 16,
    alignItems: "center",
  },
  logo: { width: 40, height: 29, marginBottom: 6 },
  titulo: { fontSize: 16, fontWeight: "800", color: theme.colors.text, textAlign: "center" },
  subtitulo: { fontSize: 11.5, color: theme.colors.textMuted, textAlign: "center", marginTop: 2, marginBottom: 10 },
  lista: { alignSelf: "stretch" },
  fila: { flexDirection: "row", alignItems: "flex-start", marginBottom: 9, gap: 9 },
  iconoWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  filaTexto: { flex: 1 },
  filaTitulo: { fontSize: 12.5, fontWeight: "700", color: theme.colors.text, marginBottom: 1 },
  filaDetalle: { fontSize: 10.5, color: theme.colors.textMuted, lineHeight: 13.5 },
  boton: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  botonTexto: { fontSize: 14, fontWeight: "800", color: "#000000" },
  verMasBtn: { alignSelf: "center", paddingVertical: 4, paddingHorizontal: 10, marginTop: 2 },
  verMasTexto: { fontSize: 12, fontWeight: "700", color: theme.colors.primaryLight, textDecorationLine: "underline" },
});
