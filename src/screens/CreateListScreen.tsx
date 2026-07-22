import React, { useState } from "react";
import { View, TextInput, Pressable, StyleSheet, Alert } from "react-native";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import { crearLista, VisibilidadLista, ETIQUETAS_VISIBILIDAD } from "../lib/lists";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

const VISIBILIDADES: VisibilidadLista[] = ["private", "followers", "public"];
const DESCRIPCION_MAX = 100; // aprox. lo que entra en 2 renglones en la previsualización de la lista

export default function CreateListScreen({ route, navigation }: any) {
  const { t } = useT();
  const pendingItem: { itemType: "series" | "movie"; tmdbId: number } | undefined = route?.params?.pendingItem;
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [visibilidad, setVisibilidad] = useState<VisibilidadLista>("private");
  const [creando, setCreando] = useState(false);
  const [listaCreada, setListaCreada] = useState<{ id: string } | null>(null);

  async function crear() {
    if (!nombre.trim()) return;
    setCreando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const lista = await crearLista(userId, nombre.trim(), visibilidad, descripcion.trim() || null);
      if (pendingItem && lista) {
        await supabase.from("list_items").upsert({ list_id: lista.id, item_type: pendingItem.itemType, tmdb_id: pendingItem.tmdbId });
      }
      // Si veníamos de "Añadir a una lista" desde una ficha, volvemos directo ahí (sin pasar por la pantalla de elegir lista).
      if (pendingItem) {
        navigation.pop(2);
      } else if (lista) {
        // Se queda en esta pantalla: ahora puede usar los botones de abajo
        // para agregar películas/series a la lista recién creada.
        setListaCreada({ id: lista.id });
      }
    } catch (e: any) {
      Alert.alert(t("No se pudo crear la lista"), e.message);
    } finally {
      setCreando(false);
    }
  }

  async function agregarTitulos(tipo: "series" | "movie") {
    if (listaCreada) {
      navigation.navigate("ElegirParaLista", { listId: listaCreada.id, tipo });
      return;
    }
    if (!nombre.trim()) return;
    setCreando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const lista = await crearLista(userId, nombre.trim(), visibilidad, descripcion.trim() || null);
      if (!lista) return;
      setListaCreada({ id: lista.id });
      navigation.navigate("ElegirParaLista", { listId: lista.id, tipo });
    } catch (e: any) {
      Alert.alert(t("No se pudo crear la lista"), e.message);
    } finally {
      setCreando(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t("Nombre de la lista")}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textFaint}
        style={styles.input}
        placeholder={t("Ej: Para maratonear")}
        value={nombre}
        onChangeText={setNombre}
      />

      <Text style={styles.label}>{t("Descripción (opcional)")}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textFaint}
        style={[styles.input, styles.inputMultilinea]}
        placeholder={t("Contá de qué se trata esta lista...")}
        value={descripcion}
        onChangeText={setDescripcion}
        multiline
        maxLength={DESCRIPCION_MAX}
      />
      <Text style={styles.contador}>
        {descripcion.length}/{DESCRIPCION_MAX}
      </Text>

      <Text style={styles.label}>{t("¿Quién la puede ver?")}</Text>
      <View style={styles.chipsColumn}>
        {VISIBILIDADES.map((v) => (
          <Pressable key={v} style={[styles.chip, visibilidad === v && styles.chipActivo]} onPress={() => setVisibilidad(v)}>
            <Text style={[styles.chipTexto, visibilidad === v && styles.chipTextoActivo]}>{t(ETIQUETAS_VISIBILIDAD[v])}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ height: 20 }} />
      {!pendingItem && (
        <>
          <Text style={styles.label}>{t("Títulos")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <AppButton title={t("Agregar películas")} variant="outline" onPress={() => agregarTitulos("movie")} disabled={creando || !nombre.trim()} />
            </View>
            <View style={{ flex: 1 }}>
              <AppButton title={t("Agregar series")} variant="outline" onPress={() => agregarTitulos("series")} disabled={creando || !nombre.trim()} />
            </View>
          </View>
          <View style={{ height: 20 }} />
        </>
      )}
      <AppButton
        title={creando ? t("Creando...") : listaCreada ? t("Listo") : t("Crear lista")}
        onPress={listaCreada ? () => navigation.goBack() : crear}
        disabled={creando || !nombre.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  label: { fontSize: 13, fontWeight: "700", color: theme.colors.textMuted, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.text, backgroundColor: theme.colors.surface },
  inputMultilinea: { minHeight: 70, textAlignVertical: "top" },
  contador: { fontSize: 11, color: theme.colors.textFaint, textAlign: "right", marginTop: 4 },
  chipsColumn: { gap: 8 },
  chip: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  chipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTexto: { fontSize: 14, color: theme.colors.textMuted },
  chipTextoActivo: { color: "#000000", fontWeight: "700" },
});
