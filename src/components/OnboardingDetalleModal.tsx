import React, { useState } from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { Text } from "./Themed";
import { theme } from "../theme";
import { useT } from "../i18n/i18n";

interface Props {
  visible: boolean;
  onCerrar: () => void;
}

interface Seccion {
  titulo: string;
  pasos: string[];
}

export default function OnboardingDetalleModal({ visible, onCerrar }: Props) {
  const { t } = useT();
  const [alturaVisible, setAlturaVisible] = useState(0);
  const [alturaContenido, setAlturaContenido] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  const secciones: Seccion[] = [
    {
      titulo: t("Perfil"),
      pasos: [
        t("Editá tu foto de perfil, banner, nombre y una frase corta de alguna película que te represente."),
        t("Estadísticas: tiempo total dedicado a series y películas, cantidad de capítulos vistos, y más."),
        t("Guardá tus series y películas preferidas en Favoritos."),
        t("Armá listas propias para agrupar títulos, y compartilas con quien quieras."),
      ],
    },
    {
      titulo: t("Explorar"),
      pasos: [
        t("Descubrí películas y series en tendencia, y recomendaciones para vos."),
        t("Top mensual: lo más visto y mejor calificado del mes."),
        t("Noticias: enterate de estrenos y novedades del mundo del cine y las series."),
      ],
    },
    {
      titulo: t("Comunidad"),
      pasos: [
        t("Lobby: mirá lo que están comentando y compartiendo otros usuarios."),
        t("Grupos: creá o sumate a comunidades temáticas para hablar de tus series y películas favoritas."),
        t("Chats: compartí un título puntual con alguien que sigas."),
      ],
    },
    {
      titulo: t("Películas"),
      pasos: [
        t("Lista Pendiente: las películas que marcaste para ver, todavía no vistas."),
        t("Próximamente: películas marcadas que aún no se estrenaron, ordenadas por fecha."),
      ],
    },
    {
      titulo: t("Series"),
      pasos: [
        t("Lista Pendiente: tus series con capítulos por ver, con acceso directo al próximo."),
        t("Próximamente: calendario con los estrenos de los capítulos de las series que seguís."),
      ],
    },
    {
      titulo: t("Detalle de películas o series"),
      pasos: [
        t("Poder ver en qué plataforma verlo, el puntaje de Lavinola e IMDb, sinopsis, trailer y reparto. Podés cambiarle la tapa y el banner a tu gusto."),
        t("Podés comentar o leer comentarios de ese título. También podés ver quiénes tienen esa película o serie en sus favoritos."),
        t("Con la flechita violeta podés recomendarle la película o serie a alguien o publicar tu review en el Lobby."),
        t("Una vez que la terminás, la podés calificar, elegir cómo te sentiste y tu actor/actriz favorito. También podés modificar la fecha en que la viste."),
      ],
    },
    {
      titulo: t("Importar desde TV Time o Letterboxd"),
      pasos: [
        t("Perfil → Ajustes → Importar datos."),
        t("Subís el archivo (ZIP completo de TV Time, o los CSV sueltos de TV Time/Letterboxd)."),
        t("Lavinola identifica tus títulos solo contra TMDB — si hay dudas en algún caso puntual, te va a preguntar cuál es el correcto."),
      ],
    },
  ];

  function alScrollear(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setScrollY(e.nativeEvent.contentOffset.y);
  }

  const necesitaScroll = alturaContenido > alturaVisible && alturaVisible > 0;
  const alturaBarra = necesitaScroll ? Math.max((alturaVisible / alturaContenido) * alturaVisible, 24) : 0;
  const maxScroll = Math.max(alturaContenido - alturaVisible, 1);
  const topBarra = necesitaScroll ? (Math.min(Math.max(scrollY, 0), maxScroll) / maxScroll) * (alturaVisible - alturaBarra) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{t("Cómo usar Lavinola")}</Text>

          <View style={styles.scrollWrap}>
            <ScrollView
              style={styles.lista}
              showsVerticalScrollIndicator={false}
              onScroll={alScrollear}
              scrollEventThrottle={16}
              onLayout={(e) => setAlturaVisible(e.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => setAlturaContenido(h)}
            >
              {secciones.map((s, i) => (
                <View key={i} style={styles.seccion}>
                  <Text style={styles.seccionTitulo}>{s.titulo}</Text>
                  {s.pasos.map((p, j) => (
                    <View key={j} style={styles.pasoFila}>
                      <Text style={styles.pasoPunto}>•</Text>
                      <Text style={styles.pasoTexto}>{p}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            {necesitaScroll && (
              <View style={styles.scrollTrack}>
                <View style={[styles.scrollThumb, { height: alturaBarra, top: topBarra }]} />
              </View>
            )}
          </View>

          <Pressable style={styles.boton} onPress={onCerrar}>
            <Text style={styles.botonTexto}>{t("Cerrar")}</Text>
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
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
  },
  titulo: { fontSize: 17, fontWeight: "800", color: theme.colors.text, textAlign: "center", marginBottom: 12 },
  scrollWrap: { flexDirection: "row", flex: 1, alignSelf: "stretch" },
  lista: { flex: 1 },
  scrollTrack: { width: 3, marginLeft: 6, backgroundColor: theme.colors.surfaceAlt, borderRadius: 2 },
  scrollThumb: { position: "absolute", width: 3, borderRadius: 2, backgroundColor: theme.colors.primary, left: 0 },
  seccion: { marginBottom: 14 },
  seccionTitulo: { fontSize: 13, fontWeight: "700", color: theme.colors.primaryLight, marginBottom: 5 },
  pasoFila: { flexDirection: "row", marginBottom: 3, paddingRight: 4 },
  pasoPunto: { fontSize: 11, color: theme.colors.textMuted, marginRight: 6, lineHeight: 16 },
  pasoTexto: { flex: 1, fontSize: 11, color: theme.colors.textMuted, lineHeight: 16 },
  boton: {
    alignSelf: "stretch",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  botonTexto: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
});
