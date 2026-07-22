import React, { useState } from "react";
import { View, Modal, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { Text, AppButton } from "./Themed";
import { crearPost, crearPostDeLista } from "../lib/posts";
import { supabase } from "../lib/supabase";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onCerrar: () => void;
  navigation: any;
  recomendarParams: any; // se pasa tal cual a navigation.navigate("Recomendar", ...)
  publicarParams?: {
    itemType: "series" | "movie" | "episode";
    tmdbId: number;
    seasonNumber?: number | null;
    episodeNumber?: number | null;
  }; // si no viene (ej. listas), no se ofrece "Publicar en Lobby"
  publicarListaParams?: { listId: string }; // para publicar una LISTA propia en el Lobby
}

export default function PublishActionModal({ visible, onCerrar, navigation, recomendarParams, publicarParams, publicarListaParams }: Props) {
  const { t } = useT();
  const [modo, setModo] = useState<"menu" | "publicar">("menu");
  const [texto, setTexto] = useState("");
  const [esSpoiler, setEsSpoiler] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [publicado, setPublicado] = useState(false);

  function reset() {
    setModo("menu");
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
    if (!texto.trim() || (!publicarParams && !publicarListaParams)) return;
    setPublicando(true);
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      if (publicarListaParams) {
        await crearPostDeLista({ userId, listId: publicarListaParams.listId, content: texto, hasSpoiler: false });
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
      setTimeout(() => cerrar(), 700); // se ve el "Publicado ✓" un instante y se cierra solo
    } catch (e: any) {
      Alert.alert(t("No se pudo publicar"), e.message);
    } finally {
      setPublicando(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <Pressable style={styles.fondo} onPress={cerrar}>
        <Pressable style={styles.caja} onPress={() => {}}>
          {modo === "menu" ? (
            <>
              <Pressable style={styles.opcionRect} onPress={irARecomendar}>
                <Text style={styles.opcionRectTexto}>{t("Recomendar")}</Text>
              </Pressable>
              {(publicarParams || publicarListaParams) && (
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
              {!publicarListaParams && (
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
    </Modal>
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
    minHeight: 100,
    textAlignVertical: "top",
    fontSize: 15,
  },
  spoilerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  checkboxActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxTilde: { color: "#000000", fontWeight: "800", fontSize: 12 },
  spoilerLabel: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
});
