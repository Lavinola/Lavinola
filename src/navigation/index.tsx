import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { supabase } from "../lib/supabase";
import { registrarPushToken } from "../lib/notifications";
import { setTmdbLanguage } from "../lib/tmdb";
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
import EditProfileScreen from "../screens/EditProfileScreen";
import ChooseCoverPhotoScreen from "../screens/ChooseCoverPhotoScreen";
import SettingsScreen from "../screens/SettingsScreen";
import SuggestScreen from "../screens/SuggestScreen";
import ManageDislikedScreen from "../screens/ManageDislikedScreen";
import FollowRequestsScreen from "../screens/FollowRequestsScreen";
import PublicProfileScreen from "../screens/PublicProfileScreen";
import ActorDetailScreen from "../screens/ActorDetailScreen";
import CustomizeArtworkScreen from "../screens/CustomizeArtworkScreen";
import EpisodeDetailScreen from "../screens/EpisodeDetailScreen";
import FadeInView from "../components/FadeInView";
import AppHeader from "../components/AppHeader";
import GifPickerScreen from "../screens/GifPickerScreen";
import AdminSuggestionsScreen from "../screens/AdminSuggestionsScreen";
import AdminBroadcastScreen from "../screens/AdminBroadcastScreen";
import AdminMetricsScreen from "../screens/AdminMetricsScreen";
import GroupModerateUsersScreen from "../screens/GroupModerateUsersScreen";
import LobbySearchScreen from "../screens/LobbySearchScreen";
import GroupMembersScreen from "../screens/GroupMembersScreen";
import FavoritedByScreen from "../screens/FavoritedByScreen";
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
};

const styles = StyleSheet.create({
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
      <Stack.Screen name="MiembrosGrupo" component={GroupMembersScreen} options={{ title: t("Miembros") }} />
      <Stack.Screen name="FavoritosDe" component={FavoritedByScreen} options={{ title: t("En Favoritos") }} />
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
      <Stack.Screen name="Comentarios" component={CommentsScreen} options={{ title: t("Comentarios/Posts") }} />
      <Stack.Screen name="Actor" component={ActorDetailScreen} options={{ title: t("Actor/Actriz") }} />
      <Stack.Screen name="PersonalizarCaratula" component={CustomizeArtworkScreen} options={{ title: t("Personalizar") }} />
      <Stack.Screen name="EpisodioDetalle" component={EpisodeDetailScreen} options={{ title: t("Episodio") }} />
      <Stack.Screen name="ElegirGif" component={GifPickerScreen} options={{ title: t("Elegir GIF"), presentation: "modal" }} />
      <Stack.Screen name="ListaSeguidores" component={FollowListScreen} />
      <Stack.Screen name="MisComentarios" component={MyCommentsScreen} options={{ title: t("Posts/Comentarios") }} />
      <Stack.Screen name="DescubrirMas" component={DiscoverMoreScreen} options={{ title: t("Descubre más") }} />
      <Stack.Screen name="CrearLista" component={CreateListScreen} options={{ title: t("Nueva lista") }} />
      <Stack.Screen name="ElegirImagenTmdb" component={ChooseTmdbImageScreen} options={{ title: t("Elegir imagen") }} />
      <Stack.Screen name="Recomendar" component={RecommendScreen} options={{ title: t("Recomendar"), presentation: "modal" }} />
      <Stack.Screen name="CrearPost" component={CreatePostScreen} options={{ title: t("Publicar en el Lobby"), presentation: "modal" }} />
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
      <ProfileStack.Screen name="Listas" component={ListsScreen} options={{ title: t("Tus listas") }} />
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
      <ProfileStack.Screen name="Anuncios" component={AnnouncementsScreen} options={{ title: t("Anuncios") }} />
      <ProfileStack.Screen name="Estadisticas" component={StatsScreen} options={{ title: t("Estadísticas") }} />
      <ProfileStack.Screen name="Ranking" component={RankingScreen} options={{ title: t("Comparar") }} />
      <ProfileStack.Screen name="SeleccionMultipleFavoritos" component={MultiSelectFavoritesScreen} options={{ title: t("Agregar favoritos") }} />
      <ProfileStack.Screen name="Ajustes" component={SettingsScreen} options={{ title: t("Ajustes") }} />
      <ProfileStack.Screen name="Sugerir" component={SuggestScreen} options={{ title: t("Sugerir mejora") }} />
      <ProfileStack.Screen name="GestionarDescartados" component={ManageDislikedScreen} options={{ title: t("No me interesa") }} />
      {pantallasComunes(ProfileStack, t)}
    </ProfileStack.Navigator>
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

export default function RootNavigation() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [modoRecuperacion, setModoRecuperacion] = useState(false);
  const { t } = useT();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        registrarPushToken(data.session.user.id);
        aplicarIdioma(data.session.user.id);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setModoRecuperacion(true);
      if (s?.user) {
        registrarPushToken(s.user.id);
        aplicarIdioma(s.user.id);
      }
    });

    // Si la app se abrió desde el link de "recuperar contraseña" que mandamos por mail,
    // hay que pasarle esa URL a Supabase a mano (acá no hay barra de navegador que la detecte sola).
    Linking.getInitialURL().then((url) => {
      if (url) procesarUrlDeRecuperacion(url);
    });
    const listenerLinking = Linking.addEventListener("url", ({ url }) => procesarUrlDeRecuperacion(url));

    return () => {
      sub.subscription.unsubscribe();
      listenerLinking.remove();
    };
  }, []);

  async function procesarUrlDeRecuperacion(url: string) {
    if (!url.includes("reset-password") && !url.includes("code=")) return;
    try {
      await supabase.auth.exchangeCodeForSession(url);
    } catch (e) {
      console.error("No se pudo procesar el link de recuperación:", e);
    }
  }

  async function aplicarIdioma(userId: string) {
    const { data } = await supabase.from("profiles").select("content_language, show_titles_in_own_language").eq("id", userId).single();
    setTmdbLanguage(data?.show_titles_in_own_language === false ? "en-US" : data?.content_language ?? "en-US");
  }

  if (loading) return null; // TODO: splash screen

  if (modoRecuperacion && session) {
    return <ResetPasswordScreen onListo={() => setModoRecuperacion(false)} />;
  }

  if (!session) return <AuthScreen />;

  return (
    <NavigationContainer theme={navigationTheme}>
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
            tabBarLabel: ({ color }: { color: string }) => (
              <Text
                style={[
                  tabScreenOptions.tabBarLabelStyle,
                  { color },
                  Platform.OS === "web" ? { transform: [{ translateX: 36 }] } : { marginLeft: 3 },
                ]}
              >
                {t("Comunidad")}
              </Text>
            ),
          }}
        />
        <Tab.Screen name="Explorar" component={ExploreStackNav} options={{ tabBarLabel: t("Explorar") }} />
        <Tab.Screen name="Perfil" component={ProfileStackNav} options={{ tabBarLabel: t("Perfil") }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
