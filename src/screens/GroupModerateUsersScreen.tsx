import React, { useEffect, useState } from "react";
import { View, TextInput, FlatList, Image, Pressable, StyleSheet, Modal } from "react-native";
import { Alert } from "../lib/alert";
import { Text, AppButton } from "../components/Themed";
import { supabase } from "../lib/supabase";
import {
  listarMiembrosParaModerar,
  silenciarUsuarioGrupo,
  quitarSilencioGrupo,
  expulsarUsuarioDeGrupo,
  MiembroGrupo,
} from "../lib/adminModeration";
import { formatearFecha } from "../lib/dates";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

interface Props {
  route: { params: { groupId: string; groupName: string; esPrivado: boolean; modo: "silenciar" | "eliminar" } };
  navigation: any;
}

export default function GroupModerateUsersScreen({ route, navigation }: Props) {
  const { t } = useT();
  const { groupId, groupName, esPrivado, modo } = route.params;
  const [miembros, setMiembros] = useState<MiembroGrupo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [elegido, setElegido] = useState<MiembroGrupo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [duracionElegida, setDuracionElegida] = useState<"1dia" | "1semana" | "indefinido">("indefinido");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: modo === "silenciar" ? t("Silenciar usuarios") : t("Eliminar usuarios") });
    cargar();
  }, []);

  async function cargar() {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
    setMiembros(await listarMiembrosParaModerar(groupId));
  }

  const filtrados = busqueda.trim()
    ? miembros.filter((m) => (m.username ?? "").toLowerCase().includes(busqueda.trim().toLowerCase()))
    : miembros;

  async function confirmar() {
    if (!elegido || !userId) return;
    setEnviando(true);
    try {
      if (modo === "silenciar") {
        await silenciarUsuarioGrupo(groupId, groupName, userId, elegido.id, duracionElegida, motivo.trim() || null);
      } else {
        await expulsarUsuarioDeGrupo(groupId, groupName, esPrivado, userId, elegido.id, motivo.trim() || null);
      }
      setElegido(null);
      setMotivo("");
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo aplicar", e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function quitarSilencio(m: MiembroGrupo) {
    try {
      await quitarSilencioGrupo(groupId, m.id);
      cargar();
    } catch (e: any) {
      Alert.alert("No se pudo actualizar", e.message);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TextInput
        style={styles.buscador}
        placeholder={t("Buscar usuario...")}
        placeholderTextColor={theme.colors.textFaint}
        value={busqueda}
        onChangeText={setBusqueda}
      />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={filtrados}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.vacio}>No hay miembros con ese nombre.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => setElegido(item)}>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{item.username ?? t("Usuario")}</Text>
              {item.silenciado_hasta && <Text style={styles.silenciado}>{t("Silenciado hasta")} {formatearFecha(item.silenciado_hasta)}</Text>}
            </View>
            {modo === "silenciar" && item.silenciado_hasta && (
              <Pressable onPress={() => quitarSilencio(item)} hitSlop={8}>
                <Text style={styles.quitarTexto}>{t("Quitar")}</Text>
              </Pressable>
            )}
          </Pressable>
        )}
      />

      <Modal visible={!!elegido} transparent animationType="fade" onRequestClose={() => setElegido(null)}>
        <Pressable style={styles.fondoModal} onPress={() => setElegido(null)}>
          <Pressable style={styles.caja} onPress={() => {}}>
            <Text style={styles.cajaTitulo}>
              {modo === "silenciar"
                ? t("¿Deseás silenciar a {nombre}?").replace("{nombre}", elegido?.username ?? t("este usuario"))
                : t("¿Deseás eliminar a {nombre}?").replace("{nombre}", elegido?.username ?? t("este usuario"))}
            </Text>

            {modo === "silenciar" && (
              <View style={styles.duracionRow}>
                {(["1dia", "1semana", "indefinido"] as const).map((d) => (
                  <Pressable key={d} style={[styles.duracionChip, duracionElegida === d && styles.duracionChipActivo]} onPress={() => setDuracionElegida(d)}>
                    <Text style={[styles.duracionChipTexto, duracionElegida === d && styles.duracionChipTextoActivo]}>
                      {d === "1dia" ? t("1 día") : d === "1semana" ? t("1 semana") : t("Indefinido")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <TextInput
              style={styles.motivoInput}
              placeholder={t("¿Por qué? (opcional)")}
              placeholderTextColor={theme.colors.textFaint}
              value={motivo}
              onChangeText={setMotivo}
              multiline
              maxLength={300}
            />

            <View style={styles.botonesRow}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <AppButton title={t("No")} variant="outline" onPress={() => setElegido(null)} />
              </View>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <AppButton title={enviando ? t("Enviando...") : t("Sí, enviar")} onPress={confirmar} disabled={enviando} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  buscador: { margin: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10 },
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 24 },
  card: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  avatarPlaceholder: {},
  nombre: { fontSize: 15 },
  silenciado: { fontSize: 11, color: theme.colors.primaryLight, marginTop: 2 },
  quitarTexto: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" },
  fondoModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  caja: { width: "85%", backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, padding: 20 },
  cajaTitulo: { fontSize: 15, fontWeight: "700", marginBottom: 14 },
  duracionRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  duracionChip: { flex: 1, paddingVertical: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center" },
  duracionChipActivo: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  duracionChipTexto: { fontSize: 12, color: theme.colors.textMuted, fontWeight: "700" },
  duracionChipTextoActivo: { color: "#000000" },
  motivoInput: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background, color: theme.colors.text, borderRadius: theme.radius.md, padding: 10, minHeight: 60, textAlignVertical: "top", marginBottom: 14 },
  botonesRow: { flexDirection: "row" },
});
