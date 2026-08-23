import React, { useEffect, useState, useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { navegarSegunNotificacion as navegarSegunNotificacionCompartido } from "../lib/notificationNav";
import { obtenerNotificacion } from "../lib/notificationsFeed";
import { supabase } from "../lib/supabase";
import { Alert } from "../lib/alert";
import { chequearSubidaDeNivel, NivelInsignia } from "../lib/badges";
import NivelUpModal from "../components/NivelUpModal";
import { registrarPushToken } from "../lib/notifications";
import { precargarUsuariosRecomendados, limpiarCacheUsuariosRecomendados } from "../lib/recommendedUsersCache";
import { precargarPerfilPropio, limpiarCachePerfilPropio } from "../lib/profileDataCache";
import { precargarListaPendiente, limpiarCacheListaPendiente } from "../lib/seriesListCache";
import { precargarPeliculas, limpiarCachePeliculas } from "../lib/moviesListCache";
import { setIdiomaTitulos } from "../lib/tmdb";
import { identificarUsuarioEnReportes } from "../lib/errorReporting";
import { cargarPreferenciaHaptics } from "../lib/haptics";
import { useT } from "../i18n/i18n";
import { theme } from "../theme";

import AuthScreen from "../screens/AuthScreen";
import ResetPasswordScreen from "../screens/ResetPasswordScreen";
import SeriesScreen from "../screens/SeriesScreen";
import MoviesScreen from "../screens/MoviesScreen";
import ExploreScreen from "../screens/ExploreScreen";
import CommunityScreen from "../screens/CommunityScreen";
import ProfileScreen from "../screens/ProfileScreen";
import AddTitleScreen from "../screens/AddTitleScreen";
import TitleDetailScreen from "../screens/TitleDetailScreen";
import ImportTVTimeScreen from "../screens/ImportTVTimeScreen";
import ListsScreen from "../screens/ListsScreen";
import CreateGroupScreen from "../screens/CreateGroupScreen";
import AdminGroupsScreen from "../screens/AdminGroupsScreen";
import GroupDetailScreen from "../screens/GroupDetailScreen";
import FindUsersScreen from "../screens/FindUsersScreen";
import ShareTitleScreen from "../screens/ShareTitleScreen";
import ActivityThreadScreen from "../screens/ActivityThreadScreen";
import FavoritesScreen from "../screens/FavoritesScreen";
import AdminReportsScreen from "../screens/AdminReportsScreen";
import AdminModeratorsScreen from "../screens/AdminModeratorsScreen";
import UserReportsScreen from "../screens/UserReportsScreen";
import AdminUserChatsScreen from "../screens/AdminUserChatsScreen";
import AdminVerChatScreen from "../screens/AdminVerChatScreen";
import PrivacyPolicyScreen from "../screens/PrivacyPolicyScreen";
import AdminUsersScreen from "../screens/AdminUsersScreen";
import SeleccionarTituloPostScreen from "../screens/SeleccionarTituloPostScreen";
import BadgesScreen from "../screens/BadgesScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import ChooseCoverPhotoScreen from "../screens/ChooseCoverPhotoScreen";
import SettingsScreen from "../screens/SettingsScreen";
import BlockedUsersScreen from "../screens/BlockedUsersScreen";
import SuggestScreen from "../screens/SuggestScreen";
import ManageDislikedScreen from "../screens/ManageDislikedScreen";
import FollowRequestsScreen from "../screens/FollowRequestsScreen";
import PublicProfileScreen from "../screens/PublicProfileScreen";
import ActorDetailScreen from "../screens/ActorDetailScreen";
import CustomizeArtworkScreen from "../screens/CustomizeArtworkScreen";
import EpisodeDetailScreen from "../screens/EpisodeDetailScreen";
import FadeInView from "../components/FadeInView";
import AppHeader from "../components/AppHeader";
import GlobalOnboardingHost from "../components/GlobalOnboardingHost";
import GifPickerScreen from "../screens/GifPickerScreen";
import AdminSuggestionsScreen from "../screens/AdminSuggestionsScreen";
import AdminBroadcastScreen from "../screens/AdminBroadcastScreen";
import AdminMetricsScreen from "../screens/AdminMetricsScreen";
import GroupModerateUsersScreen from "../screens/GroupModerateUsersScreen";
import LobbySearchScreen from "../screens/LobbySearchScreen";
import GuardadosScreen from "../screens/GuardadosScreen";
import GroupMembersScreen from "../screens/GroupMembersScreen";
import FavoritedByScreen from "../screens/FavoritedByScreen";
import ListasConTituloScreen from "../screens/ListasConTituloScreen";
import PeliculasVistasPerfilScreen from "../screens/PeliculasVistasPerfilScreen";
import SeriesEnCursoPerfilScreen from "../screens/SeriesEnCursoPerfilScreen";
import RecomendarTituloScreen from "../screens/RecomendarTituloScreen";
import AnnouncementsScreen from "../screens/AnnouncementsScreen";
import StatsScreen from "../screens/StatsScreen";
import RankingScreen from "../screens/RankingScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import MultiSelectFavoritesScreen from "../screens/MultiSelectFavoritesScreen";
import GlobalSearchScreen from "../screens/GlobalSearchScreen";
import AllSeriesScreen from "../screens/AllSeriesScreen";
import AllMoviesScreen from "../screens/AllMoviesScreen";
import ChooseListScreen from "../screens/ChooseListScreen";
import ManageFavoritesScreen from "../screens/ManageFavoritesScreen";
import ListDetailScreen from "../screens/ListDetailScreen";
import UserListsScreen from "../screens/UserListsScreen";
import ChooseForListScreen from "../screens/ChooseForListScreen";
import CommentsScreen from "../screens/CommentsScreen";
import FollowListScreen from "../screens/FollowListScreen";
import MyCommentsScreen from "../screens/MyCommentsScreen";
import DiscoverMoreScreen from "../screens/DiscoverMoreScreen";
import CreateListScreen from "../screens/CreateListScreen";
import ChooseTmdbImageScreen from "../screens/ChooseTmdbImageScreen";
import RecommendScreen from "../screens/RecommendScreen";
import CreatePostScreen from "../screens/CreatePostScreen";

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    notification: theme.colors.primary,
  },
};

function withFadeIn(Component: React.ComponentType<any>) {
  return function ConFundido(props: any) {
    return (
      <FadeInView>
        <Component {...props} />
      </FadeInView>
    );
  };
}

const SeriesScreenConFundido = withFadeIn(SeriesScreen);
const MoviesScreenConFundido = withFadeIn(MoviesScreen);
const CommunityScreenConFundido = withFadeIn(CommunityScreen);
const ExploreScreenConFundido = withFadeIn(ExploreScreen);
const ProfileScreenConFundido = withFadeIn(ProfileScreen);

const stackScreenOptions = {
  headerStyle: { backgroundColor: theme.colors.surface },
  headerTintColor: theme.colors.text,
  headerTitleStyle: { color: theme.colors.text },
  contentStyle: { backgroundColor: theme.colors.background },
};

const tabScreenOptions = {
  headerShown: false,
  tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
  tabBarActiveTintColor: theme.colors.primary,
  tabBarInactiveTintColor: theme.colors.textMuted,
  tabBarLabelStyle: { fontSize: 13, fontWeight: "600" as const },
  tabBarAllowFontScaling: false,
};

const styles = StyleSheet.create({
  pantallaCarga: { flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" },
  comunidadCirculo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -22,
    borderWidth: 4,
    borderColor: theme.colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
});

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator();
const ExploreStack = createNativeStackNavigator();
const CommunityStack = createNativeStackNavigator();
const SeriesStack = createNativeStackNavigator();
const MoviesStack = createNativeStackNavigator();

// Pantallas compartidas por varios stacks (título/compartir), para no navegar
// "fuera" de la tab en la que estás.
function pantallasComunes(Stack: any, t: (s: string) => string) {
  return (
    <>
      <Stack.Screen name="AgregarTitulo" component={AddTitleScreen} options={{ title: t("Agregar") }} />
      <Stack.Screen name="DetalleTitulo" component={TitleDetailScreen} options={{ title: t("Detalle") }} />
      <Stack.Screen name="CompartirTitulo" component={ShareTitleScreen} options={{ title: t("Compartir") }} />
      <Stack.Screen name="HiloActividad" component={ActivityThreadScreen} options={{ title: t("Conversación") }} />
      <Stack.Screen name="CrearGrupo" component={CreateGroupScreen} options={{ title: t("Crear grupo") }} />
      <Stack.Screen name="AdminGrupos" component={AdminGroupsScreen} options={{ title: t("Administrar mis grupos") }} />
      <Stack.Screen name="ModerarUsuariosGrupo" component={GroupModerateUsersScreen} options={{ title: t("Moderar") }} />
      <Stack.Screen name="BuscarEnLobby" component={LobbySearchScreen} options={{ title: t("Buscar"), presentation: "modal" }} />
      <Stack.Screen name="Guardados" component={GuardadosScreen} options={{ title: t("Guardados") }} />
      <Stack.Screen name="MiembrosGrupo" component={GroupMembersScreen} options={{ title: t("Miembros") }} />
      <Stack.Screen name="FavoritosDe" component={FavoritedByScreen} options={{ title: t("En Favoritos") }} />
      <Stack.Screen name="ListasConTitulo" component={ListasConTituloScreen} options={{ title: t("Listas") }} />
      <Stack.Screen name="PeliculasVistasPerfil" component={PeliculasVistasPerfilScreen} options={{ title: t("Vistas") }} />
      <Stack.Screen name="SeriesEnCursoPerfil" component={SeriesEnCursoPerfilScreen} options={{ title: t("Series") }} />
      <Stack.Screen name="RecomendarTitulo" component={RecomendarTituloScreen} options={{ title: t("Recomendar"), presentation: "modal" }} />
      <Stack.Screen
        name="DetalleGrupo"
        component={GroupDetailScreen}
        options={({ route }: any) => ({ title: route.params?.groupName ?? t("Grupo") })}
      />
      <Stack.Screen name="BuscarUsuarios" component={FindUsersScreen} options={{ title: t("Seguir gente") }} />
      <Stack.Screen name="Solicitudes" component={FollowRequestsScreen} options={{ title: t("Solicitudes") }} />
      <Stack.Screen name="PerfilAjeno" component={PublicProfileScreen} options={{ title: t("Perfil") }} />
      <Stack.Screen name="Notificaciones" component={NotificationsScreen} options={{ title: t("Notificaciones") }} />
      <Stack.Screen name="BuscadorGlobal" component={GlobalSearchScreen} options={{ title: t("Buscar") }} />
      <Stack.Screen name="TodasLasSeries" component={AllSeriesScreen} options={{ title: t("Series") }} />
      <Stack.Screen name="TodasLasPeliculas" component={AllMoviesScreen} options={{ title: t("Películas") }} />
      <Stack.Screen name="ElegirLista" component={ChooseListScreen} options={{ title: t("Agregar a lista"), presentation: "modal" }} />
      <Stack.Screen name="GestionarFavoritas" component={ManageFavoritesScreen} options={{ title: t("Agregar o quitar") }} />
      <Stack.Screen name="DetalleLista" component={ListDetailScreen} options={({ route }: any) => ({ title: route.params?.listTitle ?? t("Lista") })} />
      <Stack.Screen name="ListasDeUsuario" component={UserListsScreen} options={{ title: t("Listas") }} />
      <Stack.Screen name="ElegirParaLista" component={ChooseForListScreen} options={{ title: t("Agregar a la lista") }} />
      <Stack.Screen
        name="DenunciasUsuario"
        component={UserReportsScreen}
        options={({ route }: any) => ({ title: route.params?.modo === "hechas" ? t("Denuncias realizadas") : t("Denuncias recibidas") })}
      />
      <Stack.Screen name="AdminChatsUsuario" component={AdminUserChatsScreen} />
      <Stack.Screen name="AdminVerChat" component={AdminVerChatScreen} />
      <Stack.Screen name="Comentarios" component={CommentsScreen} options={{ title: t("Reseñas") }} />
      <Stack.Screen name="Actor" component={ActorDetailScreen} options={{ title: t("Actor/Actriz") }} />
      <Stack.Screen name="PersonalizarCaratula" component={CustomizeArtworkScreen} options={{ title: t("Personalizar") }} />
      <Stack.Screen name="EpisodioDetalle" component={EpisodeDetailScreen} options={{ title: t("Episodio") }} />
      <Stack.Screen name="ElegirGif" component={GifPickerScreen} options={{ title: t("Elegir GIF"), presentation: "modal" }} />
      <Stack.Screen name="ListaSeguidores" component={FollowListScreen} />
      <Stack.Screen name="MisComentarios" component={MyCommentsScreen} options={{ title: t("Reseñas") }} />
      <Stack.Screen name="DescubrirMas" component={DiscoverMoreScreen} options={{ title: t("Descubre más") }} />
      <Stack.Screen name="CrearLista" component={CreateListScreen} options={{ title: t("Nueva lista") }} />
      <Stack.Screen name="ElegirImagenTmdb" component={ChooseTmdbImageScreen} options={{ title: t("Elegir imagen") }} />
      <Stack.Screen name="Recomendar" component={RecommendScreen} options={{ title: t("Recomendar"), presentation: "modal" }} />
      <Stack.Screen name="CrearPost" component={CreatePostScreen} options={{ title: t("Publicar en el Lobby"), presentation: "modal" }} />
      <Stack.Screen
        name="SeleccionarTituloPost"
        component={SeleccionarTituloPostScreen}
        options={{ title: t("¿Sobre qué querés publicar?"), presentation: "modal" }}
      />
      <Stack.Screen name="Insignias" component={BadgesScreen} options={{ title: t("Insignias") }} />
    </>
  );
}

function SeriesStackNav() {
  const { t } = useT();
  return (
    <SeriesStack.Navigator screenOptions={stackScreenOptions}>
      <SeriesStack.Screen name="SeriesHome" component={SeriesScreenConFundido} options={{ header: ({ navigation }: any) => <AppHeader navigation={navigation} /> }} />
      {pantallasComunes(SeriesStack, t)}
    </SeriesStack.Navigator>
  );
}

function MoviesStackNav() {
  const { t } = useT();
  return (
    <MoviesStack.Navigator screenOptions={stackScreenOptions}>
      <MoviesStack.Screen name="MoviesHome" component={MoviesScreenConFundido} options={{ header: ({ navigation }: any) => <AppHeader navigation={navigation} /> }} />
      {pantallasComunes(MoviesStack, t)}
    </MoviesStack.Navigator>
  );
}

function ExploreStackNav() {
  const { t } = useT();
  return (
    <ExploreStack.Navigator screenOptions={stackScreenOptions}>
      <ExploreStack.Screen name="ExploreHome" component={ExploreScreenConFundido} options={{ header: ({ navigation }: any) => <AppHeader navigation={navigation} /> }} />
      {pantallasComunes(ExploreStack, t)}
    </ExploreStack.Navigator>
  );
}

function CommunityStackNav() {
  const { t } = useT();
  return (
    <CommunityStack.Navigator screenOptions={stackScreenOptions}>
      <CommunityStack.Screen name="CommunityHome" component={CommunityScreenConFundido} options={{ header: ({ navigation }: any) => <AppHeader navigation={navigation} /> }} />
      {pantallasComunes(CommunityStack, t)}
    </CommunityStack.Navigator>
  );
}

function ProfileStackNav() {
  const { t } = useT();
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreenConFundido} options={{ header: ({ navigation }: any) => <AppHeader navigation={navigation} /> }} />
      <ProfileStack.Screen name="EditarPerfil" component={EditProfileScreen} options={{ title: t("Editar perfil") }} />
      <ProfileStack.Screen name="ElegirPortada" component={ChooseCoverPhotoScreen} options={{ title: t("Elegir foto de portada") }} />
      <ProfileStack.Screen name="Listas" component={ListsScreen} options={{ title: t("Listas") }} />
      <ProfileStack.Screen name="Favoritos" component={FavoritesScreen} options={{ title: t("Favoritos") }} />
      <ProfileStack.Screen
        name="ImportarTVTime"
        component={ImportTVTimeScreen}
        options={{ title: t("Importar datos") }}
      />
      <ProfileStack.Screen name="AdminReportes" component={AdminReportsScreen} options={{ title: t("Moderación") }} />
      <ProfileStack.Screen name="AdminModeradores" component={AdminModeratorsScreen} options={{ title: t("Moderadores") }} />
      <ProfileStack.Screen
        name="AdminDenunciasModerador"
        component={UserReportsScreen}
        initialParams={{ modo: "hechas" }}
        options={{ title: t("Denuncias realizadas") }}
      />
      <ProfileStack.Screen name="AdminSugerencias" component={AdminSuggestionsScreen} options={{ title: t("Sugerencias") }} />
      <ProfileStack.Screen name="AdminAnuncio" component={AdminBroadcastScreen} options={{ title: t("Anuncio para todos") }} />
      <ProfileStack.Screen name="AdminMetricas" component={AdminMetricsScreen} options={{ title: t("Métricas de la app") }} />
      <ProfileStack.Screen name="AdminUsuarios" component={AdminUsersScreen} options={{ title: t("Usuarios") }} />
      <ProfileStack.Screen name="Anuncios" component={AnnouncementsScreen} options={{ title: t("Anuncios") }} />
      <ProfileStack.Screen name="Estadisticas" component={StatsScreen} options={{ title: t("Estadísticas") }} />
      <ProfileStack.Screen name="Ranking" component={RankingScreen} options={{ title: t("Comparar") }} />
      <ProfileStack.Screen name="SeleccionMultipleFavoritos" component={MultiSelectFavoritesScreen} options={{ title: t("Agregar favoritos") }} />
      <ProfileStack.Screen name="Ajustes" component={SettingsScreen} options={{ title: t("Ajustes") }} />
      <ProfileStack.Screen name="UsuariosBloqueados" component={BlockedUsersScreen} options={{ title: t("Usuarios bloqueados") }} />
      <ProfileStack.Screen name="PoliticaPrivacidad" component={PrivacyPolicyScreen} options={{ title: t("Política de privacidad") }} />
      <ProfileStack.Screen name="Sugerir" component={SuggestScreen} options={{ title: t("Sugerir mejora") }} />
      <ProfileStack.Screen name="GestionarDescartados" component={ManageDislikedScreen} options={{ title: t("No me interesa") }} />
      {pantallasComunes(ProfileStack, t)}
    </ProfileStack.Navigator>
  );
}

/**
 * Solo en la web y en pantallas anchas de verdad (compu) corremos la
 * palabra hacia la derecha — en un celular (aunque sea por navegador, el
 * ancho de pantalla es angosto) tiene que verse centrada, igual que en la
 * app nativa.
 */
function EtiquetaComunidad({ color, texto }: { color: string; texto: string }) {
  const { width } = useWindowDimensions();
  const esPantallaAncha = Platform.OS === "web" && width > 700;
  return (
    <Text
      style={[
        tabScreenOptions.tabBarLabelStyle,
        { color },
        esPantallaAncha ? { transform: [{ translateX: 36 }] } : { marginLeft: 3 },
      ]}
    >
      {texto}
    </Text>
  );
}

function iconoPorTab(routeName: string, focused: boolean) {
  const mapa: Record<string, string> = {
    Series: focused ? "tv" : "tv-outline",
    Películas: focused ? "film" : "film-outline",
    Comunidad: focused ? "people" : "people-outline",
    Explorar: focused ? "search" : "search-outline",
    Perfil: focused ? "person" : "person-outline",
  };
  return mapa[routeName] ?? "ellipse-outline";
}

// Mapea cada pantalla del stack a una URL — así, en la web, cada vez que
// navegás a algo se genera una entrada real en el historial del navegador.
// Sin esto, la app entera vive en una sola entrada de historial: el botón
// "atrás" físico de Android no tiene a dónde volver y termina cerrando la
// webapp entera en vez de ir a la pantalla anterior. Con esto, el botón
// atrás va retrocediendo pantalla por pantalla, como se espera.
//
// No hace falta mapear los parámetros de cada ruta (ids, nombres, etc.) —
// los que no están en el path, React Navigation los agrega solo como
// query string (?id=123&...), así que alcanza con un slug simple por
// pantalla.
const RUTAS_COMUNES: Record<string, string> = {
  AgregarTitulo: "agregar",
  DetalleTitulo: "titulo",
  CompartirTitulo: "compartir",
  HiloActividad: "hilo",
  CrearGrupo: "crear-grupo",
  AdminGrupos: "admin-grupos",
  ModerarUsuariosGrupo: "moderar-grupo",
  BuscarEnLobby: "buscar-lobby",
  MiembrosGrupo: "miembros-grupo",
  FavoritosDe: "favoritos-de",
  DetalleGrupo: "grupo",
  BuscarUsuarios: "buscar-usuarios",
  Solicitudes: "solicitudes",
  PerfilAjeno: "usuario",
  Notificaciones: "notificaciones",
  BuscadorGlobal: "buscar",
  TodasLasSeries: "todas-series",
  TodasLasPeliculas: "todas-peliculas",
  ElegirLista: "elegir-lista",
  GestionarFavoritas: "gestionar-favoritas",
  DetalleLista: "lista",
  ListasDeUsuario: "listas-usuario",
  ElegirParaLista: "elegir-para-lista",
  DenunciasUsuario: "denuncias-usuario",
  Comentarios: "comentarios",
  Actor: "actor",
  PersonalizarCaratula: "personalizar",
  EpisodioDetalle: "episodio",
  ElegirGif: "elegir-gif",
  ListaSeguidores: "seguidores",
  MisComentarios: "mis-comentarios",
  DescubrirMas: "descubrir-mas",
  CrearLista: "crear-lista",
  ElegirImagenTmdb: "elegir-imagen",
  Recomendar: "recomendar",
  CrearPost: "crear-post",
  SeleccionarTituloPost: "publicar-desde",
  Insignias: "insignias",
  AdminChatsUsuario: "admin-chats-usuario",
  AdminVerChat: "admin-ver-chat",
};

const navigationRef = createNavigationContainerRef();

/**
 * Traduce el "data" de una notificación push a una navegación real.
 * Sin esto, tocar la notificación solo abría la app en la pantalla de
 * siempre, sin llevarte a lo que avisaba.
 *
 * La mayoría de los tipos vienen con un "notificationId" — se busca esa
 * notificación puntual y se reusa la MISMA función de navegación que ya
 * usa la campanita (navegarSegunNotificacion, de notificationNav.ts), así
 * las dos se comportan siempre igual. Los mensajes de chat son la
 * excepción — a propósito no se guardan en la campanita (ya tienen su
 * propio indicador de "no leído"), así que se navegan aparte, directo. Los
 * recordatorios de estrenos tampoco pasan por la campanita, van directo
 * al capítulo/película.
 */
async function procesarToqueDeNotificacion(data: any) {
  if (!data?.type || !navigationRef.isReady()) return;
  const nav = navigationRef as any;

  if (data.notificationId) {
    const notificacion = await obtenerNotificacion(data.notificationId);
    if (notificacion) await navegarSegunNotificacionCompartido(notificacion, nav);
    return;
  }

  switch (data.type) {
    case "chat_message": {
      const { data: userData } = await supabase.auth.getSession();
      const miId = userData.session?.user?.id;
      const { data: chat } = await supabase.from("chats").select("user_a, user_b").eq("id", data.chatId).maybeSingle();
      const otroUserId = chat && miId ? (chat.user_a === miId ? chat.user_b : chat.user_a) : null;
      const { data: perfil } = otroUserId ? await supabase.from("profiles").select("username").eq("id", otroUserId).maybeSingle() : { data: null };
      nav.navigate("HiloActividad", { chatId: data.chatId, otroUserId, otroUsername: perfil?.username ?? null });
      break;
    }
    case "episode_today":
      nav.navigate("EpisodioDetalle", { seriesTmdbId: data.seriesTmdbId, seasonNumber: data.season, episodeNumber: data.episode });
      break;
    case "episodes_today":
    case "season_today":
      nav.navigate("DetalleTitulo", { tipo: "series", tmdbId: data.seriesTmdbId });
      break;
    case "movie_today":
      nav.navigate("DetalleTitulo", { tipo: "movie", tmdbId: data.movieTmdbId });
      break;
  }
}

const linking = {
  prefixes: [Linking.createURL("/")],
  config: {
    screens: {
      Series: { path: "series", initialRouteName: "SeriesHome", screens: { SeriesHome: "", ...RUTAS_COMUNES } },
      Películas: { path: "peliculas", initialRouteName: "MoviesHome", screens: { MoviesHome: "", ...RUTAS_COMUNES } },
      Comunidad: { path: "comunidad", initialRouteName: "CommunityHome", screens: { CommunityHome: "", ...RUTAS_COMUNES } },
      Explorar: { path: "explorar", initialRouteName: "ExploreHome", screens: { ExploreHome: "", ...RUTAS_COMUNES } },
      Perfil: {
        path: "perfil",
        initialRouteName: "ProfileHome",
        screens: {
          ProfileHome: "",
          EditarPerfil: "editar-perfil",
          ElegirPortada: "elegir-portada",
          Listas: "listas",
          Favoritos: "favoritos",
          ImportarTVTime: "importar-tvtime",
          AdminReportes: "admin-reportes",
          AdminModeradores: "admin-moderadores",
          AdminDenunciasModerador: "admin-denuncias",
          AdminSugerencias: "admin-sugerencias",
          AdminAnuncio: "admin-anuncio",
          AdminMetricas: "admin-metricas",
          AdminUsuarios: "admin-usuarios",
          Anuncios: "anuncios",
          Estadisticas: "estadisticas",
          Ranking: "ranking",
          SeleccionMultipleFavoritos: "seleccion-favoritos",
          Ajustes: "ajustes",
          PoliticaPrivacidad: "politica-privacidad",
          UsuariosBloqueados: "usuarios-bloqueados",
          Sugerir: "sugerir",
          GestionarDescartados: "descartados",
          ...RUTAS_COMUNES,
        },
      },
    },
  },
};

export default function RootNavigation() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  const [nivelSubido, setNivelSubido] = useState<NivelInsignia | null>(null);
  const { t } = useT();
  const ultimoTapComunidadRef = useRef(0);
  const ultimoTapExplorarRef = useRef(0);

  // Al tocar una notificación push (con la app abierta, en segundo plano,
  // o directamente cerrada) hay que llevar a la persona a lo que la
  // notificación decía, no dejarla en la pantalla de siempre.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((respuesta) => {
      procesarToqueDeNotificacion(respuesta.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  // Doble toque en Comunidad → Lobby, o en Explorar → Descubrir, estés
  // donde estés dentro de esa pestaña. tabPress se dispara siempre (incluso
  // ya estando en esa pestaña), así que solo hace falta medir el tiempo
  // entre dos toques seguidos.
  function alTocarTabDoble(navigation: any, tabName: "Comunidad" | "Explorar", ultimoTapRef: React.MutableRefObject<number>) {
    return {
      tabPress: () => {
        const ahora = Date.now();
        const esDobleToque = ahora - ultimoTapRef.current < 400;
        ultimoTapRef.current = ahora;
        if (esDobleToque) {
          if (tabName === "Comunidad") {
            navigation.navigate("Comunidad", { screen: "CommunityHome", params: { irALobby: ahora } });
          } else {
            navigation.navigate("Explorar", { screen: "ExploreHome", params: { irADescubrir: ahora } });
          }
        }
      },
    };
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        identificarUsuarioEnReportes(data.session.user.id);
        registrarPushToken(data.session.user.id);
        aplicarIdioma(data.session.user.id);
        cargarPreferenciaHaptics(data.session.user.id);
        precargarUsuariosRecomendados(data.session.user.id);
        precargarPerfilPropio(data.session.user.id);
        precargarListaPendiente(data.session.user.id);
        precargarPeliculas(data.session.user.id);
        chequearSubidaDeNivel(data.session.user.id)
          .then((nivel) => nivel && setNivelSubido(nivel))
          .catch((e) => console.error("Error al chequear el nivel de insignias:", e));
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setModoRecuperacion(true);
      if (s?.user) {
        identificarUsuarioEnReportes(s.user.id);
        registrarPushToken(s.user.id);
        aplicarIdioma(s.user.id);
        cargarPreferenciaHaptics(s.user.id);
        precargarUsuariosRecomendados(s.user.id);
        precargarPerfilPropio(s.user.id);
        precargarListaPendiente(s.user.id);
        precargarPeliculas(s.user.id);
        // Cubre el caso de Google (que no pasa por el signUp() explícito de
        // AuthScreen) — si el avatar todavía es un link en vivo a DiceBear
        // (recién puesto por el trigger de alta), lo convertimos a un
        // archivo propio guardado. No hace nada si ya tiene uno guardado o
        // una foto subida por la persona.
        supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", s.user.id)
          .maybeSingle()
          .then(({ data: perfil }) => {
            if (perfil?.username && perfil.avatar_url?.startsWith("https://api.dicebear.com/")) {
              supabase.functions.invoke("generate-default-avatar", { body: { userId: s.user.id, username: perfil.username } }).catch((e) => {
                console.error("No se pudo generar el avatar por default:", e);
              });
            }
          });
      } else {
        identificarUsuarioEnReportes(null);
        limpiarCacheUsuariosRecomendados();
        limpiarCachePerfilPropio();
        limpiarCacheListaPendiente();
        limpiarCachePeliculas();
      }
    });

    // Igual que con "recuperar contraseña": si la app se abrió desde el link
    // de "confirmá tu mail" (que ahora apunta a nuestro propio dominio en
    // vez del link feo de Supabase), hay que procesarlo a mano.
    Linking.getInitialURL().then((url) => {
      if (url) procesarUrlDeRecuperacion(url);
      if (url) procesarUrlDeConfirmacion(url);
    });
    const listenerLinking = Linking.addEventListener("url", ({ url }) => {
      procesarUrlDeRecuperacion(url);
      procesarUrlDeConfirmacion(url);
    });

    return () => {
      sub.subscription.unsubscribe();
      listenerLinking.remove();
    };
  }, []);

  function extraerParametroDeUrl(url: string, nombre: string): string | null {
    const match = url.match(new RegExp(`[?&]${nombre}=([^&]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Link de "confirmá tu mail" — armado con nuestra propia plantilla de
   * Supabase (Authentication → Email Templates → Confirm signup), apuntando
   * a {{ .SiteURL }}/confirmar?token_hash={{ .TokenHash }}&type=signup en
   * vez del link con el dominio feo de Supabase (project-ref.supabase.co).
   */
  async function procesarUrlDeConfirmacion(url: string) {
    if (!url.includes("/confirmar") && !url.includes("token_hash=")) return;
    const tokenHash = extraerParametroDeUrl(url, "token_hash");
    const tipo = extraerParametroDeUrl(url, "type");
    if (!tokenHash || !tipo) return;
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo as any });
      if (error) throw error;
      Alert.alert(t("¡Listo!"), t("Tu mail quedó confirmado."));
    } catch (e: any) {
      console.error("No se pudo procesar el link de confirmación:", e);
      Alert.alert(t("No se pudo confirmar el mail"), e.message ?? t("El link puede haber vencido — probá pedir uno nuevo."));
    }
  }

  async function procesarUrlDeRecuperacion(url: string) {
    if (!url.includes("reset-password") && !url.includes("code=")) return;
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) throw error;
    } catch (e: any) {
      console.error("No se pudo procesar el link de recuperación:", e);
      Alert.alert(t("No se pudo procesar el link"), e.message ?? t("El link puede haber vencido — probá pedir uno nuevo."));
    }
  }

  async function aplicarIdioma(userId: string) {
    const { data } = await supabase.from("profiles").select("content_language, show_titles_in_own_language").eq("id", userId).single();
    setIdiomaTitulos(data?.content_language ?? "en-US", data?.show_titles_in_own_language !== false);
  }

  if (loading) {
    return (
      <View style={styles.pantallaCarga}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (modoRecuperacion && session) {
    return <ResetPasswordScreen onListo={() => setModoRecuperacion(false)} />;
  }

  if (!session) return <AuthScreen />;

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        linking={linking}
        onReady={() => {
          Notifications.getLastNotificationResponseAsync().then((respuesta) => {
            if (respuesta) procesarToqueDeNotificacion(respuesta.notification.request.content.data);
          });
        }}
      >
        <Tab.Navigator
          initialRouteName="Comunidad"
          screenOptions={({ route }) => ({
            ...tabScreenOptions,
            tabBarIcon: ({ focused, color, size }) => {
              if (route.name === "Comunidad") {
                return (
                  <View style={styles.comunidadCirculo}>
                    <Ionicons name={focused ? "people" : "people-outline"} size={26} color="#FFFFFF" />
                  </View>
                );
              }
              return <Ionicons name={iconoPorTab(route.name, focused) as any} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Series" component={SeriesStackNav} options={{ tabBarLabel: t("Series") }} />
          <Tab.Screen name="Películas" component={MoviesStackNav} options={{ tabBarLabel: t("Películas") }} />
          <Tab.Screen
            name="Comunidad"
            component={CommunityStackNav}
            options={{
              tabBarLabel: ({ color }: { color: string }) => <EtiquetaComunidad color={color} texto={t("Comunidad")} />,
            }}
            listeners={({ navigation }) => alTocarTabDoble(navigation, "Comunidad", ultimoTapComunidadRef)}
          />
          <Tab.Screen
            name="Explorar"
            component={ExploreStackNav}
            options={{ tabBarLabel: t("Explorar") }}
            listeners={({ navigation }) => alTocarTabDoble(navigation, "Explorar", ultimoTapExplorarRef)}
          />
          <Tab.Screen name="Perfil" component={ProfileStackNav} options={{ tabBarLabel: t("Perfil") }} />
        </Tab.Navigator>
      </NavigationContainer>
      <GlobalOnboardingHost />
      <NivelUpModal nivel={nivelSubido} onCerrar={() => setNivelSubido(null)} />
    </>
  );
}
