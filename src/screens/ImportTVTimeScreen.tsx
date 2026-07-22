import React, { useState, useEffect } from "react";
import { View, FlatList, Image, Pressable, TextInput, StyleSheet, ActivityIndicator, ScrollView, Alert, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { unzipSync, strFromU8 } from "fflate";
import { Ionicons } from "@expo/vector-icons";
import { parseArchivoTVTime, RegistroImportado } from "../lib/tvtimeImport";
import { agruparPorTitulo, ResultadoMatch } from "../lib/matcher";
import { posterUrl, searchSeries, searchMovies } from "../lib/tmdb";
import { supabase } from "../lib/supabase";
import { Text, AppButton } from "../components/Themed";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

type Etapa = "instrucciones" | "elegir_archivo" | "matcheando" | "revisar_dudosos" | "importando" | "listo";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodifica base64 a bytes sin depender de atob (no siempre está disponible en el motor de JS de RN/Hermes). */
function base64ToBytes(base64: string): Uint8Array {
  const limpio = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytesLength = Math.floor((limpio.length * 6) / 8) - (limpio.endsWith("==") ? 2 : limpio.endsWith("=") ? 1 : 0);
  const bytes = new Uint8Array(bytesLength);
  let byteIndex = 0;
  let buffer = 0;
  let bitsCollected = 0;
  for (let i = 0; i < limpio.length; i++) {
    const valor = BASE64_CHARS.indexOf(limpio[i]);
    if (valor === -1) continue;
    buffer = (buffer << 6) | valor;
    bitsCollected += 6;
    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      bytes[byteIndex++] = (buffer >> bitsCollected) & 0xff;
    }
  }
  return bytes;
}

export default function ImportTVTimeScreen() {
  const { t } = useT();
  const [etapa, setEtapa] = useState<Etapa>("instrucciones");
  const [resultados, setResultados] = useState<ResultadoMatch[]>([]);
  const [dudosoIndex, setDudosoIndex] = useState(0);
  const [omitidosCount, setOmitidosCount] = useState(0);
  const [omitidosNombres, setOmitidosNombres] = useState<string[]>([]);
  const [episodiosOmitidosTotal, setEpisodiosOmitidosTotal] = useState(0);
  const [episodiosOmitidosDetalle, setEpisodiosOmitidosDetalle] = useState<string[]>([]);
  const [progreso, setProgreso] = useState({ procesados: 0, total: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [busquedaManual, setBusquedaManual] = useState("");
  const [resultadosManual, setResultadosManual] = useState<{ tmdb_id: number; titulo: string; poster_path: string | null }[]>([]);
  const [buscandoManual, setBuscandoManual] = useState(false);
  const [resueltosManualmente, setResueltosManualmente] = useState<Map<string, number[]>>(new Map());
  const [seleccionActual, setSeleccionActual] = useState<Set<number>>(new Set());

  const dudosos = resultados.filter((r) => !r.confiado);
  const confiados = resultados.filter((r) => r.confiado);

  useEffect(() => {
    retomarSiHayAlgoEnCurso();
  }, []);

  async function retomarSiHayAlgoEnCurso() {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data: job } = await supabase
      .from("tvtime_import_jobs")
      .select("*")
      .eq("user_id", uid)
      .in("status", ["procesando", "listo", "aplicando", "aplicando_error"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!job) return;
    setJobId(job.id);
    if (job.status === "procesando") {
      setProgreso({ procesados: job.procesados, total: job.total });
      setEtapa("matcheando");
    } else if (job.status === "listo") {
      setProgreso({ procesados: job.procesados, total: job.total });
      setResultados(job.resultados as ResultadoMatch[]);
      setEtapa("revisar_dudosos");
    } else {
      // "aplicando" o "aplicando_error": ya se había confirmado todo y
      // estaba (o está) aplicándose del lado del servidor — retomamos ahí.
      setProgreso({ procesados: job.aplicados, total: job.total_aplicar });
      setResultados(job.resultados as ResultadoMatch[]);
      setEtapa("importando");
    }
  }

  // En la web, expo-file-system no puede leer el "uri" que da el selector de
  // archivos del navegador (es un blob: temporal, no un archivo real en
  // disco) — ahí usamos fetch, que sí sabe leer blobs, directo.
  async function leerBytes(uri: string): Promise<Uint8Array> {
    if (Platform.OS === "web") {
      const res = await fetch(uri);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    return base64ToBytes(base64);
  }

  async function leerTexto(uri: string): Promise<string> {
    if (Platform.OS === "web") {
      const res = await fetch(uri);
      return await res.text();
    }
    return await FileSystem.readAsStringAsync(uri);
  }

  async function elegirArchivo() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "application/json", "application/zip", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    const asset = res.assets[0];

    setEtapa("matcheando");
    try {
      const esZip = asset.name.toLowerCase().endsWith(".zip");
      let registros: RegistroImportado[] = [];

      if (esZip) {
        // El ZIP completo de TV Time trae un montón de archivos que no nos
        // interesan (tokens, datos de dispositivo, etc.) — buscamos
        // puntualmente los dos que sí importan y juntamos todo en una sola
        // importación, para no tener que hacer el proceso dos veces.
        const bytes = await leerBytes(asset.uri);
        const archivos = unzipSync(bytes);

        const nombreArchivo = (buscado: string) => Object.keys(archivos).find((n) => n.toLowerCase().endsWith(buscado.toLowerCase()));

        const nombrePeliculas = nombreArchivo("tracking-prod-records.csv");
        const nombreSeries = nombreArchivo("tracking-prod-records-v2.csv");

        if (!nombrePeliculas && !nombreSeries) {
          throw new Error(
            "No encontramos los archivos de TV Time (tracking-prod-records.csv / tracking-prod-records-v2.csv) adentro de este ZIP."
          );
        }
        if (nombrePeliculas) {
          const contenido = strFromU8(archivos[nombrePeliculas]);
          registros = registros.concat(parseArchivoTVTime(contenido, "tracking-prod-records.csv"));
        }
        if (nombreSeries) {
          const contenido = strFromU8(archivos[nombreSeries]);
          registros = registros.concat(parseArchivoTVTime(contenido, "tracking-prod-records-v2.csv"));
        }
      } else {
        const contenido = await leerTexto(asset.uri);
        registros = parseArchivoTVTime(contenido, asset.name);
      }

      const grupos = agruparPorTitulo(registros);
      const gruposArray = [...grupos.values()].map((registrosGrupo) => ({
        nombreOriginal: registrosGrupo[0].nombreOriginal,
        tipo: registrosGrupo[0].tipo,
        registros: registrosGrupo,
        tvdbId: registrosGrupo.find((r) => r.tvdbId)?.tvdbId,
        añoLanzamiento: registrosGrupo.find((r) => r.añoLanzamiento)?.añoLanzamiento,
      }));
      setProgreso({ procesados: 0, total: gruposArray.length });

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      let idiomaUsuario = "es-419";
      if (uid) {
        const { data: perfil } = await supabase.from("profiles").select("content_language").eq("id", uid).maybeSingle();
        idiomaUsuario = perfil?.content_language ?? "es-419";
      }

      const { data, error } = await supabase.functions.invoke("process-tvtime-import", { body: { grupos: gruposArray, idiomaUsuario } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.motivo ?? "No se pudo iniciar la importación.");
      setJobId(data.job_id);
    } catch (e: any) {
      console.error("Error al iniciar la importación:", e);
      let detalle = e?.message ?? "";
      try {
        if (e?.context?.json) {
          const body = await e.context.json();
          if (body?.motivo) detalle = body.motivo;
        } else if (e?.context?.status) {
          detalle = `${detalle} (HTTP ${e.context.status})`;
        }
      } catch {
        // si no se pudo leer el cuerpo, nos quedamos con e.message tal cual
      }
      Alert.alert(
        t("No se pudo iniciar la importación"),
        detalle || t("Revisá tu conexión, o que la función 'process-tvtime-import' esté deployada en Supabase.")
      );
      setEtapa("elegir_archivo");
    }
  }

  // El trabajo pesado (buscar cada título en TMDB) corre del lado del
  // servidor — acá solo miramos cómo va, cada 3 segundos. Como el trabajo es
  // 100% server-side, esto sigue avanzando aunque cierres la app o la mandes
  // a segundo plano; al volver a abrirla, este mismo polling retoma y
  // muestra el progreso real (no hay que arrancar de cero).
  useEffect(() => {
    if (!jobId || etapa !== "matcheando") return;
    let cancelado = false;

    async function chequear() {
      const { data: job } = await supabase.from("tvtime_import_jobs").select("*").eq("id", jobId).maybeSingle();
      if (cancelado || !job) return;
      setProgreso({ procesados: job.procesados, total: job.total });
      if (job.status === "listo") {
        setResultados(job.resultados as ResultadoMatch[]);
        setEtapa("revisar_dudosos");
      } else if (job.status === "error") {
        console.error("Error en la importación:", job.error_msg);
        setEtapa("elegir_archivo");
      } else if (job.status === "procesando") {
        // Red de seguridad: el servidor se relanza solo mientras procesa,
        // pero si por lo que sea ese relanzamiento no llegó a salir (un
        // corte de red puntual, por ejemplo), esto lo destraba mientras
        // tengas la app abierta — le pedimos que siga desde donde quedó.
        const segundosSinActividad = (Date.now() - new Date(job.updated_at).getTime()) / 1000;
        if (segundosSinActividad > 40) {
          supabase.functions.invoke("process-tvtime-import", { body: { continuar_job_id: jobId } }).catch((e) => {
            console.error("Error al pedirle a la importación que siga:", e);
          });
        }
      }
    }

    chequear();
    const intervalo = setInterval(chequear, 3000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [jobId, etapa]);

  function toggleCandidato(tmdbId: number) {
    setSeleccionActual((prev) => {
      const copia = new Set(prev);
      if (copia.has(tmdbId)) copia.delete(tmdbId);
      else copia.add(tmdbId);
      return copia;
    });
  }

  function confirmarSeleccion(resultado: ResultadoMatch, idsExplicitos?: number[]) {
    const ids = idsExplicitos ?? [...seleccionActual];
    if (ids.length === 0) return;
    setResueltosManualmente((prev) => new Map(prev).set(resultado.nombreOriginal, ids));
    siguienteDudoso();
  }

  async function buscarManual(texto: string, tipo: "series" | "movie") {
    setBusquedaManual(texto);
    if (texto.trim().length < 2) {
      setResultadosManual([]);
      return;
    }
    setBuscandoManual(true);
    try {
      const data = tipo === "series" ? await searchSeries(texto) : await searchMovies(texto);
      setResultadosManual(
        (data.results ?? []).map((r: any) => ({
          tmdb_id: r.id,
          titulo: tipo === "series" ? r.name : r.title,
          poster_path: r.poster_path,
          año: (tipo === "series" ? r.first_air_date : r.release_date)
            ? Number(String(tipo === "series" ? r.first_air_date : r.release_date).slice(0, 4))
            : undefined,
        }))
      );
    } finally {
      setBuscandoManual(false);
    }
  }

  function omitirDudoso(nombreOriginal: string) {
    setOmitidosCount((n) => n + 1);
    setOmitidosNombres((prev) => [...prev, nombreOriginal]);
    siguienteDudoso();
  }

  function volverDudosoAnterior() {
    if (dudosoIndex === 0) return;
    setBusquedaManual("");
    setResultadosManual([]);
    setSeleccionActual(new Set());
    const anterior = dudosos[dudosoIndex - 1];
    // Si ya lo habías resuelto, lo destildamos para que puedas elegir de nuevo.
    setResueltosManualmente((prev) => {
      const copia = new Map(prev);
      copia.delete(anterior.nombreOriginal);
      return copia;
    });
    // Si lo habías omitido, también le sacamos el "omitido" — por si ahora lo resolvés.
    setOmitidosNombres((prev) => {
      const idx = prev.lastIndexOf(anterior.nombreOriginal);
      if (idx === -1) return prev;
      setOmitidosCount((n) => Math.max(0, n - 1));
      return prev.filter((_, i) => i !== idx);
    });
    setDudosoIndex(dudosoIndex - 1);
  }

  function siguienteDudoso() {
    setBusquedaManual("");
    setResultadosManual([]);
    setSeleccionActual(new Set());
    if (dudosoIndex + 1 < dudosos.length) {
      setDudosoIndex(dudosoIndex + 1);
    } else {
      confirmarImportacionFinal();
    }
  }

  async function confirmarImportacionFinal() {
    if (!jobId) return;
    setEtapa("importando");
    setProgreso({ procesados: 0, total: 0 });

    const confirmados = [
      ...confiados.map((r) => ({ resultado: r, tmdbIdElegido: r.mejorCandidato!.tmdb_id })),
      ...dudosos
        .filter((r) => resueltosManualmente.has(r.nombreOriginal))
        .flatMap((r) => resueltosManualmente.get(r.nombreOriginal)!.map((tmdbId) => ({ resultado: r, tmdbIdElegido: tmdbId }))),
    ];

    const { data, error } = await supabase.functions.invoke("process-tvtime-import", { body: { aplicar_job_id: jobId, confirmados } });
    if (error || !data?.ok) {
      console.error("Error al iniciar la aplicación de la importación:", error ?? data);
      Alert.alert(t("No se pudo iniciar la importación"), t("Revisá tu conexión, o que la función 'process-tvtime-import' esté deployada en Supabase."));
      setEtapa("revisar_dudosos");
    }
  }

  // Igual que la fase de "buscar": esto corre del lado del servidor, así que
  // sigue solo aunque cierres la app o la mandes a segundo plano.
  useEffect(() => {
    if (!jobId || etapa !== "importando") return;
    let cancelado = false;

    async function chequear() {
      const { data: job } = await supabase.from("tvtime_import_jobs").select("*").eq("id", jobId!).maybeSingle();
      if (cancelado || !job) return;
      setProgreso({ procesados: job.aplicados, total: job.total_aplicar });
      if (job.status === "aplicando_listo") {
        setEpisodiosOmitidosTotal(job.episodios_omitidos ?? 0);
        setEpisodiosOmitidosDetalle(Array.isArray(job.episodios_omitidos_detalle) ? job.episodios_omitidos_detalle : []);
        await supabase.from("tvtime_import_jobs").delete().eq("id", jobId!);
        setEtapa("listo");
      } else if (job.status === "aplicando_error") {
        console.error("Error al aplicar la importación:", job.error_msg);
        Alert.alert(t("No se pudo terminar la importación"), job.error_msg ?? "");
        setEtapa("revisar_dudosos");
      } else if (job.status === "aplicando") {
        const segundosSinActividad = (Date.now() - new Date(job.updated_at).getTime()) / 1000;
        if (segundosSinActividad > 40) {
          supabase.functions.invoke("process-tvtime-import", { body: { continuar_aplicar_job_id: jobId } }).catch((e) => {
            console.error("Error al pedirle a la importación que siga:", e);
          });
        }
      }
    }

    chequear();
    const intervalo = setInterval(chequear, 3000);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [jobId, etapa]);

  if (etapa === "instrucciones") {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.instruccionesContainer}>
        <Text style={styles.titulo}>{t("Importar tu historial de TV Time o Letterboxd")}</Text>
        <Text style={styles.parrafo}>
          {t('Antes de nada, necesitás el archivo con tus datos. Ninguna de las dos apps tiene un botón de "exportar" adentro de la app misma, así que hay estos caminos:')}
        </Text>

        <View style={styles.opcionBox}>
          <Text style={styles.opcionTitulo}>{t("Opción 1 — TV Time: pedido oficial (más lento, más completo)")}</Text>
          <Text style={styles.paso}>{t("1. Mandá un mail a support@tvtime.com pidiendo tus datos (pedido GDPR).")}</Text>
          <Text style={styles.paso}>{t("2. Te va a llegar un ZIP, en general en unos días.")}</Text>
          <Text style={styles.paso}>{t("3. Guardá ese ZIP en tu celu tal cual llega, sin descomprimir — lo subís entero.")}</Text>
        </View>

        <View style={styles.opcionBox}>
          <Text style={styles.opcionTitulo}>{t("Opción 2 — TV Time: extensión de Chrome (más rápido)")}</Text>
          <Text style={styles.paso}>{t('1. Desde una compu, instalá la extensión "TV Time Out by Refract" en Chrome.')}</Text>
          <Text style={styles.paso}>{t("2. Entrá a tv-time.com y logueate con tu cuenta.")}</Text>
          <Text style={styles.paso}>{t("3. Abrí la extensión y exportá tus datos (CSV o JSON, cualquiera de los dos sirve).")}</Text>
          <Text style={styles.paso}>{t("4. Pasate el archivo exportado a tu celu (por mail, Drive, WhatsApp a vos mismo, etc.).")}</Text>
        </View>

        <View style={styles.opcionBox}>
          <Text style={styles.opcionTitulo}>{t("Opción 3 — Letterboxd (solo películas)")}</Text>
          <Text style={styles.paso}>{t("1. Desde una compu, entrá a Letterboxd → Settings → Import & Export.")}</Text>
          <Text style={styles.paso}>{t('2. Tocá "Export your data" — te descarga un ZIP.')}</Text>
          <Text style={styles.paso}>{t("3. Descomprimí el ZIP y buscá el archivo diary.csv (o watched.csv).")}</Text>
          <Text style={styles.paso}>{t("4. Pasate ese archivo a tu celu.")}</Text>
        </View>

        <Text style={styles.parrafo}>
          {t('Con el archivo ya en tu celu, tocá "Continuar" — vas a poder elegirlo desde donde lo hayas guardado. Si hay algún título que no podamos reconocer automáticamente contra nuestra base, te vamos a preguntar cuál es antes de importarlo.')}
        </Text>

        <AppButton title={t("Ya tengo el archivo, continuar")} onPress={() => setEtapa("elegir_archivo")} />
      </ScrollView>
    );
  }

  if (etapa === "elegir_archivo") {
    return (
      <View style={styles.centro}>
        <Text style={styles.titulo}>{t("Elegí el archivo")}</Text>
        <Text style={styles.parrafo}>
          {t("Buscá el archivo que exportaste: el ZIP entero de TV Time (lo procesamos completo), o si preferís, los CSV sueltos (tracking-prod-records.csv, tracking-prod-records-v2.csv, o el de la extensión Refract) o de Letterboxd (diary.csv o watched.csv).")}
        </Text>
        <AppButton title={t("Elegir archivo")} onPress={elegirArchivo} />
      </View>
    );
  }

  if (etapa === "matcheando") {
    return (
      <View style={styles.centro}>
        <ActivityIndicator />
        <Text style={styles.parrafo}>
          {t("Buscando en TMDB")}{progreso.total > 0 ? ` (${progreso.procesados}/${progreso.total})` : "..."}
        </Text>
        <Text style={styles.parrafoChico}>
          {t("Esto corre en el servidor — podés salir de la app o mandarla a segundo plano tranquilo, sigue avanzando solo.")}
        </Text>
      </View>
    );
  }

  if (etapa === "revisar_dudosos") {
    if (dudosos.length === 0) {
      return (
        <View style={styles.centro}>
          <Text style={styles.titulo}>{t("Todo identificado")}</Text>
          <Text style={styles.parrafo}>
            {t("{n} títulos matcheados automáticamente contra TMDB.").replace("{n}", String(confiados.length))}
          </Text>
          <AppButton title={t("Confirmar e importar")} onPress={confirmarImportacionFinal} />
        </View>
      );
    }

    const actual = dudosos[dudosoIndex];
    return (
      <View style={styles.container}>
        <Text style={styles.titulo}>
          {t("No pudimos identificar esto ({n})").replace("{n}", `${dudosoIndex + 1}/${dudosos.length}`)}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {dudosoIndex > 0 && (
            <Pressable onPress={volverDudosoAnterior} hitSlop={10}>
              <Ionicons name="arrow-undo-circle-outline" size={22} color={theme.colors.primaryLight} />
            </Pressable>
          )}
          <Text style={[styles.parrafo, { flex: 1, marginBottom: 0 }]}>
            {t('En tu archivo aparece como: "{nombre}" ({n} registro{s})')
              .replace("{nombre}", actual.nombreOriginal)
              .replace("{n}", String(actual.registros.length))
              .replace("{s}", actual.registros.length !== 1 ? "s" : "")}
          </Text>
        </View>
        <Text style={styles.subtitulo}>{t("Elegí la opción correcta:")}</Text>
        {actual.registros.length > 1 && (
          <Text style={styles.parrafoChico}>
            {t("Si viste más de una con este nombre (por ejemplo, dos películas distintas llamadas igual), podés marcar varias.")}
          </Text>
        )}
        <FlatList
          keyboardShouldPersistTaps="handled"
          data={busquedaManual.trim().length >= 2 ? resultadosManual : actual.candidatos}
          keyExtractor={(c) => String(c.tmdb_id)}
          ListHeaderComponent={
            <View style={{ marginBottom: 10 }}>
              <TextInput
                style={styles.buscadorManual}
                placeholder={`${t("Buscar")} ${actual.tipo === "series" ? t("una serie") : t("una película")}...`}
                placeholderTextColor={theme.colors.textFaint}
                value={busquedaManual}
                onChangeText={(texto) => buscarManual(texto, actual.tipo)}
              />
              {buscandoManual && <ActivityIndicator style={{ marginTop: 8 }} />}
            </View>
          }
          renderItem={({ item }) => {
            const marcado = seleccionActual.has(item.tmdb_id);
            return (
              <Pressable
                style={[styles.candidatoCard, marcado && styles.candidatoCardMarcado]}
                onPress={() => (actual.registros.length > 1 ? toggleCandidato(item.tmdb_id) : confirmarSeleccion(actual, [item.tmdb_id]))}
              >
                {item.poster_path && <Image source={{ uri: posterUrl(item.poster_path, "w185")! }} style={styles.poster} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.candidatoTitulo}>
                    {item.titulo}
                    {(item as any).tituloOriginal ? <Text style={styles.candidatoTraducido}> ({(item as any).tituloOriginal})</Text> : null}
                  </Text>
                  {(item as any).año ? <Text style={styles.candidatoAnio}>{(item as any).año}</Text> : null}
                </View>
                {actual.registros.length > 1 && (
                  <View style={[styles.checkboxDudoso, marcado && styles.checkboxDudosoMarcado]}>{marcado && <Text style={styles.checkboxDudosoTilde}>✓</Text>}</View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.parrafo}>
              {busquedaManual.trim().length >= 2
                ? buscandoManual
                  ? ""
                  : t("No encontramos nada con ese nombre.")
                : t("No encontramos nada parecido en TMDB. Buscalo vos arriba.")}
            </Text>
          }
        />
        {actual.registros.length > 1 && (
          <AppButton title={t("Confirmar selección")} onPress={() => confirmarSeleccion(actual)} disabled={seleccionActual.size === 0} />
        )}
        <View style={{ height: 8 }} />
        <AppButton title={t("Ninguna es correcta, omitir")} onPress={() => omitirDudoso(actual.nombreOriginal)} variant="muted" />
      </View>
    );
  }

  if (etapa === "importando") {
    return (
      <View style={styles.centro}>
        <ActivityIndicator />
        <Text style={styles.parrafo}>
          {t("Importando")}{progreso.total > 0 ? ` (${progreso.procesados}/${progreso.total})` : "..."}
        </Text>
        <Text style={styles.parrafoChico}>
          {t("Esto corre en el servidor — podés salir de la app o mandarla a segundo plano tranquilo, sigue avanzando solo.")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.centro, { paddingVertical: 40 }]}>
      <Text style={styles.titulo}>{t("¡Listo!")}</Text>
      <Text style={styles.parrafo}>{t("Tu historial de TV Time ya está en Lavinola.")}</Text>
      {(episodiosOmitidosTotal > 0 || omitidosCount > 0) && (
        <View style={{ marginTop: 16, width: "100%" }}>
          {episodiosOmitidosTotal > 0 && (
            <Text style={styles.parrafoChico}>
              {t("{n} capítulos no se pudieron importar porque no existen en el catálogo de TMDB (numeración incompleta de esa serie).").replace(
                "{n}",
                String(episodiosOmitidosTotal)
              )}
            </Text>
          )}
          {omitidosCount > 0 && (
            <>
              <Text style={styles.parrafoChico}>
                {t("{n} títulos los omitiste vos porque ninguna opción coincidía.").replace("{n}", String(omitidosCount))}
              </Text>
              {omitidosNombres.length > 0 && (
                <View style={styles.omitidosBox}>
                  <Text style={styles.omitidosTitulo}>{t("Son estos (podés cargarlos a mano después):")}</Text>
                  {omitidosNombres.map((nombre, i) => (
                    <Text key={i} style={styles.omitidosLinea}>
                      • {nombre}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  instruccionesContainer: { padding: 20 },
  opcionBox: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 14, marginBottom: 16 },
  opcionTitulo: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  paso: { fontSize: 13, color: theme.colors.text, marginBottom: 6, lineHeight: 19 },
  pasoDetalle: { fontSize: 13, color: theme.colors.textMuted, marginLeft: 12, marginBottom: 4 },
  container: { flex: 1, padding: 16 },
  centro: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  omitidosBox: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, marginTop: 10 },
  omitidosTitulo: { fontSize: 12, fontWeight: "700", color: theme.colors.textMuted, marginBottom: 6 },
  omitidosLinea: { fontSize: 11, color: theme.colors.textFaint, marginBottom: 4 },
  titulo: { fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  subtitulo: { fontSize: 14, fontWeight: "600", marginTop: 12, marginBottom: 8 },
  parrafo: { fontSize: 14, color: theme.colors.textMuted, textAlign: "center", marginBottom: 16 },
  parrafoChico: { fontSize: 12, color: theme.colors.textFaint, textAlign: "center", marginTop: -8, marginBottom: 16 },
  buscadorManual: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  candidatoCard: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border },
  candidatoCardMarcado: { backgroundColor: theme.colors.surfaceAlt },
  checkboxDudoso: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  checkboxDudosoMarcado: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxDudosoTilde: { color: "#000000", fontSize: 13, fontWeight: "700" },
  poster: { width: 40, height: 60, borderRadius: 4, marginRight: 10, backgroundColor: theme.colors.surfaceAlt },
  candidatoTitulo: { fontSize: 15 },
  candidatoTraducido: { fontSize: 13, color: theme.colors.textMuted, fontWeight: "400" },
  candidatoAnio: { fontSize: 12, color: theme.colors.textFaint, marginTop: 2 },
});
