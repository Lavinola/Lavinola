import React, { useState } from "react";
import { View, Modal, TextInput, ScrollView, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "./Themed";
import { Ionicons } from "@expo/vector-icons";
import ToggleSwitch from "./ToggleSwitch";
import TituloPickerModal, { SeleccionTitulo } from "./TituloPickerModal";
import { crearEncuesta } from "../lib/polls";
import { posterUrl } from "../lib/tmdb";
import { Alert } from "../lib/alert";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const MAX_OPCIONES = 8;
const MIN_OPCIONES_PARA_PUBLICAR = 2; // se muestran 3 arriba, pero alcanza con completar 2 — la vacía se descarta sola
const MAX_CARACTERES = 100; // aprox. 2 renglones

interface OpcionForm {
  texto: string;
  titulo: SeleccionTitulo | null;
}

interface Props {
  visible: boolean;
  onCerrar: () => void;
  userId: string;
  groupId: string;
  onCreada: () => void;
}

export default function CrearEncuestaModal({ visible, onCerrar, userId, groupId, onCreada }: Props) {
  const { t } = useT();
  const [pregunta, setPregunta] = useState("");
  const [preguntaTitulo, setPreguntaTitulo] = useState<SeleccionTitulo | null>(null);
  const [opciones, setOpciones] = useState<OpcionForm[]>([{ texto: "", titulo: null }, { texto: "", titulo: null }, { texto: "", titulo: null }]);
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [pickerPara, setPickerPara] = useState<"pregunta" | number | null>(null);
  const [publicando, setPublicando] = useState(false);

  function resetear() {
    setPregunta("");
    setPreguntaTitulo(null);
    setOpciones([{ texto: "", titulo: null }, { texto: "", titulo: null }, { texto: "", titulo: null }]);
    setAllowMultiple(true);
  }

  function cerrar() {
    resetear();
    onCerrar();
  }

  function agregarOpcion() {
    if (opciones.length >= MAX_OPCIONES) return;
    setOpciones((prev) => [...prev, { texto: "", titulo: null }]);
  }

  function actualizarOpcionTexto(i: number, texto: string) {
    setOpciones((prev) => prev.map((o, idx) => (idx === i ? { ...o, texto } : o)));
  }

  function quitarTituloDeOpcion(i: number) {
    setOpciones((prev) => prev.map((o, idx) => (idx === i ? { ...o, titulo: null } : o)));
  }

  function elegirTitulo(seleccion: SeleccionTitulo) {
    if (pickerPara === "pregunta") setPreguntaTitulo(seleccion);
    else if (typeof pickerPara === "number") setOpciones((prev) => prev.map((o, idx) => (idx === pickerPara ? { ...o, titulo: seleccion } : o)));
    setPickerPara(null);
  }

  const preguntaValida = !!pregunta.trim() || !!preguntaTitulo;
  const opcionesCompletas = opciones.filter((o) => !!o.texto.trim() || !!o.titulo);
  const puedePublicar = preguntaValida && opcionesCompletas.length >= MIN_OPCIONES_PARA_PUBLICAR;

  async function publicar() {
    if (!puedePublicar || publicando) return;
    setPublicando(true);
    try {
      await crearEncuesta({
        userId,
        groupId,
        questionText: pregunta,
        questionItemType: preguntaTitulo?.itemType,
        questionTmdbId: preguntaTitulo?.tmdbId,
        questionSeasonNumber: preguntaTitulo?.seasonNumber,
        questionEpisodeNumber: preguntaTitulo?.episodeNumber,
        allowMultiple,
        opciones: opcionesCompletas.map((o) => ({
          text: o.texto,
          itemType: o.titulo?.itemType,
          tmdbId: o.titulo?.tmdbId,
          seasonNumber: o.titulo?.seasonNumber,
          episodeNumber: o.titulo?.episodeNumber,
        })),
      });
      cerrar();
      onCreada();
    } catch (e: any) {
      console.error("Error al crear la encuesta:", e);
      Alert.alert(t("No se pudo publicar"), e.message ?? "Probá de nuevo.");
    } finally {
      setPublicando(false);
    }
  }

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={cerrar}>
        <View style={styles.fondo}>
          <View style={styles.caja}>
            <View style={styles.headerRow}>
              <Text style={styles.headerTitulo}>{t("Encuesta")}</Text>
              <Pressable onPress={cerrar} hitSlop={10}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput
                style={styles.preguntaInput}
                placeholder={t("Haz una pregunta")}
                placeholderTextColor={theme.colors.textFaint}
                value={pregunta}
                onChangeText={setPregunta}
                multiline
                maxLength={MAX_CARACTERES}
              />
              <TituloAdjunto
                titulo={preguntaTitulo}
                onAgregar={() => setPickerPara("pregunta")}
                onQuitar={() => setPreguntaTitulo(null)}
                textoBoton={t("+ Agregar título a la pregunta")}
              />

              {opciones.map((o, i) => (
                <View key={i} style={styles.opcionBloque}>
                  <TextInput
                    style={styles.opcionInput}
                    placeholder={`${t("Opción")} ${i + 1}`}
                    placeholderTextColor={theme.colors.textFaint}
                    value={o.texto}
                    onChangeText={(txt) => actualizarOpcionTexto(i, txt)}
                    multiline
                    maxLength={MAX_CARACTERES}
                  />
                  <TituloAdjunto titulo={o.titulo} onAgregar={() => setPickerPara(i)} onQuitar={() => quitarTituloDeOpcion(i)} textoBoton={t("+ Agregar título")} />
                </View>
              ))}

              {opciones.length < MAX_OPCIONES && (
                <Pressable style={styles.añadirOpcionBtn} onPress={agregarOpcion}>
                  <Text style={styles.añadirOpcionTexto}>{t("Añadir opción")}</Text>
                </Pressable>
              )}

              <View style={styles.multipleRow}>
                <Text style={styles.multipleTexto}>{t("Permitir varias respuestas")}</Text>
                <ToggleSwitch value={allowMultiple} onValueChange={setAllowMultiple} />
              </View>
            </ScrollView>

            <Pressable style={[styles.publicarBtn, !puedePublicar && styles.publicarBtnDeshabilitado]} disabled={!puedePublicar || publicando} onPress={publicar}>
              {publicando ? <ActivityIndicator color="#000000" /> : <Text style={styles.publicarBtnTexto}>{t("Publicar encuesta")}</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>

      <TituloPickerModal visible={pickerPara !== null} onCerrar={() => setPickerPara(null)} onSeleccionar={elegirTitulo} />
    </>
  );
}

function TituloAdjunto({
  titulo,
  onAgregar,
  onQuitar,
  textoBoton,
}: {
  titulo: SeleccionTitulo | null;
  onAgregar: () => void;
  onQuitar: () => void;
  textoBoton: string;
}) {
  if (titulo) {
    return (
      <View style={styles.tituloAdjuntoBox}>
        {titulo.posterPath ? (
          <Image source={{ uri: posterUrl(titulo.posterPath, "w185")! }} style={styles.tituloAdjuntoPoster} />
        ) : (
          <View style={[styles.tituloAdjuntoPoster, { backgroundColor: theme.colors.surfaceAlt }]} />
        )}
        <Text style={styles.tituloAdjuntoTexto} numberOfLines={2}>
          {titulo.nombre}
          {titulo.itemType === "episode" && titulo.seasonNumber && titulo.episodeNumber
            ? ` — T${titulo.seasonNumber} - E${titulo.episodeNumber}${titulo.episodeName ? `: ${titulo.episodeName}` : ""}`
            : ""}
        </Text>
        <Pressable onPress={onQuitar} hitSlop={8}>
          <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable onPress={onAgregar} style={styles.agregarTituloBtn}>
      <Text style={styles.agregarTituloTexto}>{textoBoton}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  caja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 16, maxHeight: "88%" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  headerTitulo: { fontSize: 17, fontWeight: "700" },
  preguntaInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 44,
    maxHeight: 60,
    marginBottom: 8,
  },
  agregarTituloBtn: { alignSelf: "flex-start", marginBottom: 14 },
  agregarTituloTexto: { fontSize: 12, color: theme.colors.primaryLight, fontWeight: "700" },
  tituloAdjuntoBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surfaceAlt, borderRadius: 8, padding: 6, marginBottom: 14 },
  tituloAdjuntoPoster: { width: 30, height: 44, borderRadius: 4 },
  tituloAdjuntoTexto: { flex: 1, fontSize: 12 },
  opcionBloque: { marginBottom: 4 },
  opcionInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
    minHeight: 40,
    maxHeight: 56,
    marginBottom: 8,
  },
  añadirOpcionBtn: { alignSelf: "flex-start", marginBottom: 16, marginTop: 4 },
  añadirOpcionTexto: { fontSize: 13, color: theme.colors.primaryLight, fontWeight: "700" },
  multipleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  multipleTexto: { fontSize: 14 },
  publicarBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 6 },
  publicarBtnDeshabilitado: { opacity: 0.4 },
  publicarBtnTexto: { color: "#000000", fontWeight: "700", fontSize: 14 },
});
