import React from "react";
import { Modal, View, Pressable, ScrollView, StyleSheet } from "react-native";
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

  const secciones: Seccion[] = [
    {
      titulo: t("Trackear series y películas"),
      pasos: [
        t("Buscá un título desde la lupa arriba, o mirá lo que está en tendencia en Explorar."),
        t("Tocá el círculo con el tilde en su ficha para marcarlo como visto."),
        t("En series, marcar un capítulo salta solo al siguiente — no hace falta ir tocando uno por uno."),
        t("El estado (al día, viendo, sin comenzar, abandonada, terminada) se calcula solo, no hay que tocarlo a mano."),
      ],
    },
    {
      titulo: t("Calendario de estrenos"),
      pasos: [
        t("Dentro de Series o Películas, arriba tenés dos pestañas: Lista Pendiente y Próximamente."),
        t("Próximamente agrupa por fecha los capítulos que van a salir de las series que seguís."),
      ],
    },
    {
      titulo: t("Comunidad"),
      pasos: [
        t("Para seguir a alguien: Comunidad → buscador de usuarios → entrá a su perfil → Seguir."),
        t("Para comentar: entrá al detalle de cualquier título, capítulo o dentro de un grupo, y escribí abajo del todo."),
        t("Para crear un grupo: pestaña Comunidad → botón de crear grupo → elegí nombre, descripción y foto."),
        t("Podés compartir un título puntual con alguien que sigas desde el ícono de enviar en su ficha."),
      ],
    },
    {
      titulo: t("Listas"),
      pasos: [
        t("Perfil → Listas → Crear lista nueva, le ponés un título."),
        t("Desde la ficha de cualquier título, tocá los tres puntitos → Agregar a lista."),
        t("Las listas se pueden compartir, y quien las sigue recibe aviso si agregás algo nuevo."),
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <Pressable style={styles.fondo} onPress={onCerrar}>
        <Pressable style={styles.caja} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.titulo}>{t("Cómo usar Lavinola")}</Text>

          <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
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
  lista: { alignSelf: "stretch" },
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
