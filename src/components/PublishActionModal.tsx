import React, { useState, useEffect } from "react";
import { View, Modal, TextInput, Pressable, Keyboard, StyleSheet, KeyboardEvent } from "react-native";
import { useSafeAreaInsets, SafeAreaProvider } from "react-native-safe-area-context";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "./Themed";
import { crearPost, crearPostDeLista, crearPostDeGrupo } from "../lib/posts";
import { chequearSubidaDeNivel, NivelInsignia } from "../lib/badges";
import NivelUpModal from "./NivelUpModal";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  navigation: any;
  recomendarParams?: any; // se pasa tal cual a navigation.navigate("Recomendar", ...) — no hace falta si modoInicial="publicar"
  publicarParams?: {
    itemType: "series" | "movie" | "episode";
    tmdbId: number;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
  }; // si no viene (ej. listas), no se ofrece "Publicar en Lobby"
  publicarListaParams?: { listId: string }; // para publicar una LISTA propia en el Lobby
  publicarGrupoParams?: { groupId: string }; // para publicar un GRUPO propio (público) en el Lobby
  modoInicial?: "menu" | "publicar"; // "publicar" salta directo al texto, sin pasar por el menú (para cuando ya se sabe que se quiere publicar, como desde el botón flotante)
}

export default function PublishActionModal({
  visible,
  onCerrar,
  navigation,
  recomendarParams,
  publicarParams,
  publicarListaParams,
  publicarGrupoParams,
  modoInicial = "menu",
}: Props) {
  const { t } = useT();
  const [modo, setModo] = useState<"menu" | "publicar">(modoInicial);
  const [texto, setTexto] = useState("");
  const [esSpoiler, setEsSpoiler] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [publicado, setPublicado] = useState(false);
  const [nivelSubido, setNivelSubido] = useState<NivelInsignia | null>(null);

  function reset() {
    setModo(modoInicial);
    setTexto("");
    setEsSpoiler(false);
    setPublicando(false);
    setPublicado(false);
  }

  function cerrar() {
    reset();
    onCerrar();
  }

  function irARecomendar() {
    reset();
    onCerrar();
    navigation.navigate("Recomendar", recomendarParams);
  }

  async function publicar() {
    if (!texto.trim() || (!publicarParams && !publicarListaParams && !publicarGrupoParams)) return;
    setPublicando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return;
      if (publicarListaParams) {
        await crearPostDeLista({ userId, listId: publicarListaParams.listId, content: texto, hasSpoiler: false });
      } else if (publicarGrupoParams) {
        await crearPostDeGrupo({ userId, groupId: publicarGrupoParams.groupId, content: texto, hasSpoiler: false });
      } else if (publicarParams) {
        await crearPost({
          userId,
          itemType: publicarParams.itemType,
          tmdbId: publicarParams.tmdbId,
          seasonNumber: publicarParams.seasonNumber ?? null,
          episodeNumber: publicarParams.episodeNumber ?? null,
          content: texto,
          hasSpoiler: esSpoiler,
        });
      }
      setPublicado(true);
      chequearSubidaDeNivel(userId)
        .then((nivel) => nivel && setNivelSubido(nivel))
        .catch((e) => console.error("Error al chequear el nivel de insignias:", e));
      setTimeout(() => cerrar(), 700); // se ve el "Publicado ✓" un instante y se cierra solo
    } catch (e: any) {
      Alert.alert(t("No se pudo publicar"), e.message);
    } finally {
      setPublicando(false);
    }
  }

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      {/* El Modal de React Native se renderiza en un árbol nativo aparte —
      el SafeAreaProvider de la raíz de la app no llega hasta acá adentro,
      por eso hace falta uno propio, local a este modal (mismo patrón que ActionSheetModal). */}
      <SafeAreaProvider>
        <ContenidoModal
          modo={modo}
          setModo={setModo}
          texto={texto}
          setTexto={setTexto}
          esSpoiler={esSpoiler}
          setEsSpoiler={setEsSpoiler}
          publicando={publicando}
          publicado={publicado}
          publicarListaParams={publicarListaParams}
          publicarGrupoParams={publicarGrupoParams}
          publicarParams={publicarParams}
          cerrar={cerrar}
          irARecomendar={irARecomendar}
          publicar={publicar}
        />
      </SafeAreaProvider>
    </Modal>
    <NivelUpModal nivel={nivelSubido} onCerrar={() => setNivelSubido(null)} />
    </>
  );
}

function ContenidoModal({
  modo,
  setModo,
  texto,
  setTexto,
  esSpoiler,
  setEsSpoiler,
  publicando,
  publicado,
  publicarListaParams,
  publicarGrupoParams,
  publicarParams,
  cerrar,
  irARecomendar,
  publicar,
}: any) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [alturaTeclado, setAlturaTeclado] = useState(0);

  // Se maneja el desplazamiento del teclado a mano (en vez de con
  // react-native-avoid-softinput, que acá solo levantaba el cuadro de
  // texto y dejaba el spoiler/botón tapados) para tener control total:
  // el margin-bottom se le pone directo a la "caja" (no al fondo), así
  // TODA la tarjeta (texto + spoiler + botón) sube junta como un bloque.
  useEffect(() => {
    const mostrar = Keyboard.addListener("keyboardDidShow", (e: KeyboardEvent) => {
      setAlturaTeclado(e.endCoordinates.height);
    });
    const ocultar = Keyboard.addListener("keyboardDidHide", () => {
      setAlturaTeclado(0);
    });
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);

  return (
    <Pressable style={styles.fondo} onPress={cerrar}>
      <Pressable
        style={[styles.caja, { paddingBottom: 20 + insets.bottom, marginBottom: alturaTeclado }]}
        onPress={() => {}}
      >
        {modo === "menu" ? (
          <>
            <Pressable style={styles.opcionRect} onPress={irARecomendar}>
              <Text style={styles.opcionRectTexto}>{t("Recomendar (Chat/Grupo)")}</Text>
            </Pressable>
            {(publicarParams || publicarListaParams || publicarGrupoParams) && (
              <Pressable style={styles.opcionRect} onPress={() => setModo("publicar")}>
                <Text style={styles.opcionRectTexto}>{t("Publicar en el Lobby")}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t("¿Qué querés contar sobre esto?")}
              placeholderTextColor={theme.colors.textFaint}
              value={texto}
              onChangeText={setTexto}
              multiline
              maxLength={2000}
              editable={!publicado}
              autoFocus
            />
            {!publicarListaParams && !publicarGrupoParams && (
              <Pressable style={styles.spoilerRow} onPress={() => !publicado && setEsSpoiler(!esSpoiler)}>
                <View style={[styles.checkbox, esSpoiler && styles.checkboxActivo]}>{esSpoiler && <Text style={styles.checkboxTilde}>✓</Text>}</View>
                <Text style={styles.spoilerLabel}>{t('¿Tiene spoiler? (aparece oculto hasta que alguien toque "Ver")')}</Text>
              </Pressable>
            )}
            <View style={{ height: 12 }} />
            <AppButton
              title={publicado ? t("Publicado ✓") : publicando ? t("Publicando...") : t("Publicar")}
              onPress={publicar}
              disabled={publicado || publicando || !texto.trim()}
            />
          </>
        )}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  caja: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, padding: 20, gap: 10 },
  opcionRect: {
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  opcionRectTexto: { fontSize: 15, fontWeight: "700", color: theme.colors.primaryLight },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 12,
    minHeight: 144,
    lineHeight: 20,
    textAlignVertical: "top",
    fontSize: 15,
  },
  spoilerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  checkboxActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxTilde: { color: "#000000", fontWeight: "800", fontSize: 12 },
  spoilerLabel: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
});
