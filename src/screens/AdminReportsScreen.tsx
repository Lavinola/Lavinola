import React, { useEffect, useState } from "react";
import { View, SectionList, Pressable, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { Text, AppButton } from "../components/Themed";
import { theme } from "../theme";
import { formatearFechaHora } from "../lib/dates";
import { useT } from "../i18n/i18n";
import ConfirmModal from "../components/ConfirmModal";

const CATEGORIAS = ["Spam o venta ilegal", "Contenido inapropiado", "Acoso o bullying", "Discurso de odio", "Suplantación de identidad", "Otro"];

interface Reporte {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_id: string;
  reporter_username: string | null;
  reportado_id: string | null;
  reportado_username: string | null;
  contenido: string | null; // texto del comentario/post reportado, si aplica
}

export default function AdminReportsScreen({ navigation }: any) {
  const { t } = useT();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmBorrar, setConfirmBorrar] = useState<{ targetId: string; targetType: string; reportId: string } | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setLoading(true);
    const { data, error } = await supabase.from("reports").select("*").eq("status", "pending").order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }
    const filas = data ?? [];

    // Quién es el "reportado" y qué contenido mostrar, según el tipo — todo
    // en un puñado de consultas en tanda, no una por reporte.
    const idsComment = filas.filter((r) => r.target_type === "comment").map((r) => r.target_id);
    const idsPost = filas.filter((r) => r.target_type === "post").map((r) => r.target_id);
    const idsGroup = filas.filter((r) => r.target_type === "group").map((r) => r.target_id);
    const idsList = filas.filter((r) => r.target_type === "list").map((r) => r.target_id);

    const [{ data: comentarios }, { data: posts }, { data: grupos }, { data: listas }] = await Promise.all([
      idsComment.length ? supabase.from("comentarios").select("id, content, user_id").in("id", idsComment) : Promise.resolve({ data: [] as any[] }),
      idsPost.length ? supabase.from("posts").select("id, content, user_id").in("id", idsPost) : Promise.resolve({ data: [] as any[] }),
      idsGroup.length ? supabase.from("groups").select("id, name, creator_id").in("id", idsGroup) : Promise.resolve({ data: [] as any[] }),
      idsList.length ? supabase.from("lists").select("id, title, user_id").in("id", idsList) : Promise.resolve({ data: [] as any[] }),
    ]);
    const comentarioMap = new Map((comentarios ?? []).map((c: any) => [c.id, c]));
    const postMap = new Map((posts ?? []).map((p: any) => [p.id, p]));
    const grupoMap = new Map((grupos ?? []).map((g: any) => [g.id, g]));
    const listaMap = new Map((listas ?? []).map((l: any) => [l.id, l]));

    const previos: { reportadoId: string | null; contenido: string | null }[] = filas.map((r) => {
      if (r.target_type === "user") return { reportadoId: r.target_id, contenido: null };
      if (r.target_type === "comment") {
        const c = comentarioMap.get(r.target_id);
        return { reportadoId: c?.user_id ?? null, contenido: c ? c.content : "(comentario ya borrado)" };
      }
      if (r.target_type === "post") {
        const p = postMap.get(r.target_id);
        return { reportadoId: p?.user_id ?? null, contenido: p ? p.content : "(post ya borrado)" };
      }
      if (r.target_type === "group") {
        const g = grupoMap.get(r.target_id);
        return { reportadoId: g?.creator_id ?? null, contenido: g ? `Grupo: ${g.name}` : "(grupo ya borrado)" };
      }
      if (r.target_type === "list") {
        const l = listaMap.get(r.target_id);
        return { reportadoId: l?.user_id ?? null, contenido: l ? `Lista: ${l.title}` : "(lista ya borrada)" };
      }
      return { reportadoId: null, contenido: null };
    });

    const idsUsuarios = [...new Set([...filas.map((r) => r.reporter_id), ...previos.map((p) => p.reportadoId).filter(Boolean)])] as string[];
    const { data: perfiles } = idsUsuarios.length ? await supabase.from("profiles").select("id, username").in("id", idsUsuarios) : { data: [] as any[] };
    const usernameMap = new Map((perfiles ?? []).map((p: any) => [p.id, p.username]));

    const enriquecidos: Reporte[] = filas.map((r, i) => ({
      ...r,
      reporter_username: usernameMap.get(r.reporter_id) ?? null,
      reportado_id: previos[i].reportadoId,
      reportado_username: previos[i].reportadoId ? usernameMap.get(previos[i].reportadoId!) ?? null : null,
      contenido: previos[i].contenido,
    }));

    setReportes(enriquecidos);
    setLoading(false);
  }

  async function resolver(id: string, status: "reviewed" | "dismissed") {
    await supabase.from("reports").update({ status }).eq("id", id);
    cargar();
  }

  function pedirBorrado(targetId: string, targetType: string, reportId: string) {
    setConfirmBorrar({ targetId, targetType, reportId });
  }

  async function confirmarBorrado() {
    if (!confirmBorrar) return;
    const tabla = confirmBorrar.targetType === "post" ? "posts" : "comentarios";
    await supabase.from(tabla).delete().eq("id", confirmBorrar.targetId);
    await resolver(confirmBorrar.reportId, "reviewed");
    setConfirmBorrar(null);
  }

  if (loading) return <Text style={styles.vacio}>{t("Cargando reportes...")}</Text>;

  const secciones = CATEGORIAS.map((cat) => ({
    title: cat,
    data: reportes.filter((r) => r.reason === cat),
  })).filter((s) => s.data.length > 0);
  const otrasCategorias = reportes.filter((r) => !CATEGORIAS.includes(r.reason));
  if (otrasCategorias.length > 0) secciones.push({ title: "Otro", data: otrasCategorias });

  return (
    <>
      <SectionList
        sections={secciones}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Text style={styles.vacio}>{t("No hay reportes pendientes. 🎉")}</Text>}
        renderSectionHeader={({ section }) => (
          <Text style={styles.seccionTitulo}>
            {t(section.title)} ({section.data.length})
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable onPress={() => navigation.navigate("PerfilAjeno", { userId: item.reporter_id })}>
              <Text style={styles.filaTexto}>
                {t("Denunció")}: <Text style={styles.link}>@{item.reporter_username ?? "—"}</Text>
              </Text>
            </Pressable>
            {item.reportado_id && (
              <Pressable onPress={() => navigation.navigate("PerfilAjeno", { userId: item.reportado_id })}>
                <Text style={styles.filaTexto}>
                  {t("Denunciado")}: <Text style={styles.link}>@{item.reportado_username ?? "—"}</Text>
                </Text>
              </Pressable>
            )}
            <Text style={styles.tipo}>{item.target_type}</Text>
            {item.contenido && <Text style={styles.contenido}>"{item.contenido}"</Text>}
            {item.details && (
              <View style={styles.detalleBox}>
                <Text style={styles.detalleLabel}>{t("Mensaje de quien denunció")}:</Text>
                <Text style={styles.detalleTexto}>{item.details}</Text>
              </View>
            )}
            <Text style={styles.fecha}>{formatearFechaHora(item.created_at)}</Text>
            <View style={styles.accionesRow}>
              {(item.target_type === "comment" || item.target_type === "post") && (
                <Pressable style={styles.btnBorrar} onPress={() => pedirBorrado(item.target_id, item.target_type, item.id)}>
                  <Text style={styles.btnBorrarTexto}>{t("Borrar contenido")}</Text>
                </Pressable>
              )}
              {item.reportado_id && (
                <Pressable style={styles.btnVerPerfil} onPress={() => navigation.navigate("PerfilAjeno", { userId: item.reportado_id })}>
                  <Text style={styles.btnVerPerfilTexto}>{t("Ver perfil")}</Text>
                </Pressable>
              )}
              <Pressable style={styles.btnDescartar} onPress={() => resolver(item.id, "dismissed")}>
                <Text style={styles.btnDescartarTexto}>{t("Descartar reporte")}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <ConfirmModal
        visible={!!confirmBorrar}
        onCerrar={() => setConfirmBorrar(null)}
        titulo={t("Borrar contenido")}
        mensaje={t("¿Seguro? Esto lo elimina para todos.")}
        botones={[
          { label: t("Cancelar"), onPress: () => {} },
          { label: t("Borrar"), onPress: confirmarBorrado, destacado: true },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.textMuted, marginTop: 32 },
  seccionTitulo: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.background,
    paddingVertical: 8,
  },
  card: { backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, marginBottom: 10 },
  filaTexto: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 2 },
  link: { color: theme.colors.primaryLight, fontWeight: "700" },
  tipo: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", color: theme.colors.textFaint, marginTop: 4 },
  contenido: { fontSize: 14, marginTop: 6, fontStyle: "italic" },
  detalleBox: { backgroundColor: theme.colors.surfaceAlt, borderRadius: 6, padding: 8, marginTop: 8 },
  detalleLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted },
  detalleTexto: { fontSize: 13, marginTop: 2 },
  fecha: { fontSize: 11, color: theme.colors.textFaint, marginTop: 6 },
  accionesRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 8 },
  btnBorrar: { backgroundColor: theme.colors.danger, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  btnBorrarTexto: { color: theme.colors.text, fontSize: 12 },
  btnDescartar: { borderWidth: 1, borderColor: theme.colors.textMuted, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  btnDescartarTexto: { color: theme.colors.textMuted, fontSize: 12 },
  btnVerPerfil: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  btnVerPerfilTexto: { color: theme.colors.primaryLight, fontSize: 12 },
});
