# Lavinola — Cine y Series

App de tracking de series y películas (tipo TV Time) con capa de comunidad,
construida en Expo (React Native) + Supabase. Cubre todo el flujo del spec:
tracking, calendario, import de TV Time, watch providers, listas, favoritos,
comunidad (comentarios anidados, grupos, seguir usuarios, compartir título),
y moderación real (texto, imágenes, rate limiting, panel de reportes, push).

## Orden de setup

1. **Supabase**: creá el proyecto (Free para arrancar) y corré
   `supabase/schema.sql` en el SQL Editor. Ahí están todas las tablas, RLS,
   y los triggers de rate limiting.
2. **TMDB**: key en https://www.themoviedb.org/settings/api (uso no
   comercial por ahora — el permiso comercial hay que pedirlo antes de
   activar ads o suscripción).
3. **Giphy** (GIFs en comentarios): key gratis en
   https://developers.giphy.com/ — reemplaza a Tenor, que Google discontinuó
   (cortó altas nuevas el 13/01/2026 y apagó la API entera el 30/06/2026).
   Si ya tenías una key de Tenor, no sirve más: hay que migrar sí o sí.
3.5. **Storage de Supabase**: el bucket **`avatars`** (público) y sus
   políticas ahora se crean solos al correr `schema.sql` (antes había que
   crearlo a mano, y si faltaba daba "Network request failed" al elegir
   foto de perfil). El bucket **`group-photos`** quedó sin uso, igual que
   **Unsplash** (ya no hace falta esa key): la tapa/banner de un grupo ahora
   sale de TMDB, mismo mecanismo que el banner de perfil — buscás una
   película/serie de referencia y elegís uno de sus backdrops reales, en vez
   de subir una foto propia o pedirle sugerencias a un buscador de stock.
4. Copiá `.env.example` a `.env` y completá las variables del cliente.
5. `npm install` y `npx expo start` (necesitás Expo Go en el celu o un
   emulador).

### Infraestructura server-side (Edge Functions)

Estas requieren la Supabase CLI (`npm install -g supabase`) y `supabase
login` + `supabase link` a tu proyecto:

```bash
# Moderación de texto (Google Perspective API, gratis)
supabase secrets set PERSPECTIVE_API_KEY=tu_key
supabase functions deploy moderate-text

# Moderación de imágenes de grupo (Google Cloud Vision SafeSearch)
# Ya no se llama desde la app (la tapa/banner de grupo ahora sale de TMDB,
# no de una foto subida) — dejalo sin deployar salvo que la vuelvas a
# necesitar para otra feature.
# supabase secrets set GOOGLE_VISION_API_KEY=tu_key
# supabase functions deploy moderate-image

# Push notifications
supabase functions deploy send-push
supabase functions deploy notify-shared-title
supabase functions deploy episode-reminders

# Eliminar cuenta (botón en Ajustes > Cuenta)
supabase functions deploy delete-account

# Panel de admin: eliminar otros usuarios y mandar anuncios masivos
supabase functions deploy admin-delete-user
supabase functions deploy broadcast-announcement
```

Después del deploy:
- **notify-shared-title**: en el dashboard, Database → Webhooks → crear uno
  nuevo sobre la tabla `shared_titles`, evento `INSERT`, tipo "Supabase Edge
  Function", apuntando a `notify-shared-title`.
- **episode-reminders**: se programa con `pg_cron` — el comando exacto (con
  tu URL de proyecto y service role key) está comentado arriba del archivo
  `supabase/functions/episode-reminders/index.ts`.

Ninguna de estas piezas es obligatoria para que la app funcione — todas
tienen fallback (moderación de texto cae al filtro local de regex si no hay
key; sin push configurado, simplemente no se mandan notificaciones). Se
pueden ir sumando de a una.

## Qué incluye

### Navegación (4 tabs, con sub-pestañas adentro)
- **Series**: "Lista pendiente" (Historial de visualización → Ver a
  continuación con tilde para marcar el próximo capítulo → Vistas hace
  tiempo/abandonadas) y "Próximamente" (calendario). Ver `SeriesScreen.tsx`
  + `seriesList.ts`.
- **Películas**: "Lista pendiente" y "Próximamente", mismo patrón.
- **Explorar**: "Descubrir" (series/películas de moda + "las mejores para
  vos", recomendadas según los géneros de lo que ya seguís —
  `recommendations.ts`), "Grupos", y "Actividad" (bandeja combinada de
  títulos que compartiste/te compartieron, con hilo de respuestas — ver
  más abajo).
- **Perfil**: portada + avatar + nombre + stats sociales (siguiendo/
  seguidores/comentarios) + estadísticas de tiempo + listas + series/
  películas + favoritas, todo en una sola pantalla con scroll (inspirado en
  TV Time). Editar perfil y elegir portada son pantallas aparte.

### Compartir título → ahora es un hilo, no un mensaje suelto
`shared_title_replies` (tabla nueva) permite responder dentro de una
recomendación — sigue siendo solo texto, sin fotos, y con el mismo rate
limiting que el resto. `ActivityScreen.tsx` + `ActivityThreadScreen.tsx`.

### Favoritos
Botón de ★ en la ficha de cualquier serie o película (`favorites.ts`),
visible como filas horizontales en el Perfil.

### Importador de TV Time
CSV (GDPR) y JSON/CSV (extensión Refract), agrupado por título, matching
heurístico contra TMDB, y pantalla de desambiguación manual para los casos
dudosos. Ver `tvtimeImport.ts`, `matcher.ts`, `applyImport.ts`,
`ImportTVTimeScreen.tsx`.

### Comunidad
Comentarios anidados con "ver N respuestas más" y orden configurable
(`comments.ts` + `CommentThread.tsx`), grupos con tapa/banner elegidos de
TMDB buscando un título de referencia (`groups.ts` + pantallas `Groups*`),
seguir usuarios unidireccional (`follows.ts`), reportes y bloqueos (`reports.ts`).

### Moderación real
- **Texto**: `moderation.ts` corre primero un chequeo local de regex
  (spam/venta ilegal, instantáneo) y después llama a la Edge Function
  `moderate-text`, que usa **Google Perspective API** para scoring de
  toxicidad. Fail-open: si la función no está disponible, el filtro local
  igual protege.
- **Imágenes de grupo**: `moderate-image` sube la foto a Storage recién
  **después** de que pase Google Cloud Vision SafeSearch — si no pasa,
  nunca queda pública. `CreateGroupScreen.tsx` ya llama a esto en vez de
  aceptar la imagen directo.
- **Rate limiting**: movido a triggers de Postgres (`enforce_comment_rate_limit`,
  `enforce_share_rate_limit`, `enforce_share_reply_rate_limit`,
  `enforce_group_creation_rate_limit` en `schema.sql`) — no se puede
  bypassear desde el cliente, a diferencia de un chequeo hecho en la app.
- **Panel de reportes**: `AdminReportsScreen.tsx`, visible en el Perfil solo
  si `profiles.is_admin = true`. Permite ver el contenido reportado,
  borrar el comentario, o descartar el reporte.
- **Push notifications**: `notifications.ts` registra el push token de Expo
  en el perfil al loguearse. **Ojo**: desde Expo SDK 53, Expo Go ya no
  soporta push notifications remotas — `notifications.ts` detecta si está
  corriendo en Expo Go y directamente no intenta registrar el token en ese
  caso. Para probar push de verdad hace falta un "development build"
  (`npx expo run:android` o EAS Build) en vez de Expo Go.

### Ajustes (menú de "⋯" en Perfil)
- **Cuenta**: username, mail, cambiar contraseña (`supabase.auth.updateUser`),
  redes sociales, perfil privado (con solicitudes de seguimiento —
  `followRequests.ts` + `FollowRequestsScreen.tsx`), cerrar sesión, y
  **eliminar cuenta** — esto último necesita la Edge Function
  `delete-account` desplegada (borra `auth.users`, todo lo demás cae solo
  por los `on delete cascade` del schema). Sin desplegarla, el botón
  muestra un error claro en vez de fallar en silencio.
- **Aplicación**: mostrar títulos en español/inglés (`idiomaSegunPerfil` en
  `tmdb.ts`, aplicado una vez al loguearse y de nuevo al cambiar el
  switch), notificaciones (timing de episodio nuevo + actividad),
  "Gestionar lo que no te gustó" (`ManageDislikedScreen.tsx`, saca esos
  títulos de las recomendaciones), y qué pueden ver los que te siguen
  (5 switches — **ojo**: estos toggles ya se guardan pero todavía no hay
  una pantalla de "ver el perfil de otro usuario" que los respete; ver
  pendientes).
- **Compartir / Sugerir mejora**: "Compartir" usa el `Share` nativo de RN.
  "Sugerir mejora" manda un mensaje a la tabla `suggestions`, visible para
  vos como admin (se puede armar una pantalla tipo `AdminReportsScreen`
  para revisarlas, o consultarlas directo por SQL mientras tanto).

### Ficha de título (rediseñada, inspirada en TV Time)
- **Series**: pestañas Información / Episodios. Información trae puntaje
  promedio de la app (`ratings.ts`, se calcula sobre todas las
  calificaciones de los usuarios), popularidad ("X agregaron esto"), tu
  propia calificación 1-5 (solo habilitada una vez que la serie está
  terminada), sinopsis, reparto con foto (tocás un actor → su filmografía
  completa vía `ActorDetailScreen`), y los comentarios. Episodios: lista
  agrupada por temporada, tildás para marcar visto — si te salteaste
  capítulos anteriores, te pregunta si querés marcarlos también. Cada
  episodio tiene su propia ficha (`EpisodeDetailScreen`): fecha, dónde
  verlo, puntaje promedio, sinopsis, calificación propia si ya lo viste, y
  comentarios propios de ese capítulo.
- **Películas**: mismo patrón sin la pestaña de episodios — calificación
  habilitada solo si ya la marcaste como vista.
- **Menú de "⋯"** en la ficha: Personalizar (elegir otro cartel/banner
  oficial de TMDB para tu vista — `CustomizeArtworkScreen.tsx`, guardado
  por usuario en `custom_poster_path`/`custom_backdrop_path`, no afecta a
  otros), Favorita, Compartir.

### Perfil de otros usuarios
`PublicProfileScreen.tsx` — respeta `is_private` y los 5 switches
granulares de qué mostrar (ahora sí tienen una pantalla real que los
usa). Se llega ahí desde: el buscador en Explorar → Actividad, tocando el
nombre de cualquiera que comentó, o desde la lista de miembros de un
grupo (`GroupDetailScreen.tsx` ahora la muestra).

### Barritas de progreso + GIFs en comentarios
- **Barrita bajo cada cartel de serie** (Perfil propio y ajeno):
  amarilla y parcial si estás "viendo" (largo = % de capítulos vistos),
  verde completa si estás al día con una serie que sigue en emisión,
  violeta completa si la terminaste y la serie ya cerró para siempre. Ver
  `SeriesProgressBar.tsx` + `progresoDeSeries()` en `seriesList.ts`.
- **GIFs en comentarios**: se pueden mandar, pero **nunca subiendo una
  imagen propia** — se eligen de un buscador conectado a Tenor
  (`gifs.ts` + `GifPickerScreen.tsx`), que es un catálogo ya moderado por
  Google/Tenor. Mantiene la misma lógica de seguridad que llevó a prohibir
  fotos en el spec original: el usuario nunca sube contenido propio, solo
  referencia algo de un catálogo curado por un tercero. Necesita
  `EXPO_PUBLIC_TENOR_API_KEY` en el `.env` (key gratis).
- **Nota de IMDb en la ficha** (opcional): si querés que aparezca la nota
  de IMDb al lado de la de Lavinola, sacate una API key gratis (hasta 1000
  pedidos/día) en https://www.omdbapi.com/apikey.aspx y ponela en el
  `.env` como `EXPO_PUBLIC_OMDB_API_KEY`. Si no la configurás, ese bloque
  simplemente no aparece — no rompe nada.

### Panel de admin
Todo visible en el Perfil solo si `profiles.is_admin = true`:
- **Moderación (reportes)** — ahora con un botón "Ver perfil del autor" en
  cada reporte de comentario, que te lleva directo a esa persona para
  suspenderla o eliminarla.
- **Suspender comentarios de un usuario** (desde su perfil): 1 día, 1
  semana, 1 mes, 1 año, o para siempre. Se aplica con un trigger de
  Postgres en `comentarios` y `shared_title_replies` — no es un chequeo
  que se pueda saltear editando la app, la base de datos rechaza el
  insert directamente mientras esté suspendido. Siempre reversible con
  "Quitar suspensión".
- **Eliminar usuario** — Edge Function `admin-delete-user` (distinta de
  `delete-account`, que solo te deja borrar tu propia cuenta). Hace falta
  desplegarla para que el botón funcione.
- **Sugerencias de la comunidad** — leerlas y responderlas
  (`AdminSuggestionsScreen.tsx`), la respuesta queda guardada en
  `suggestions.admin_reply`.
- **Anuncio para todos** — un mensaje que queda visible in-app para
  cualquier usuario (tabla `announcements`, pantalla `AnnouncementsScreen.tsx`
  accesible para todos desde Perfil) y además dispara un push a quienes
  tengan notificaciones activas, vía la Edge Function
  `broadcast-announcement`.

### Estadísticas completas + ranking + notificaciones
- **Estadísticas** (tocando el título con la flechita en Perfil) — pantalla
  propia con pestañas Series/Películas, inspirada en las capturas de TV
  Time: tiempo total (con "Comparar con la gente que sigues" → ranking),
  episodios/películas vistas con los últimos 7 días, series/películas
  añadidas, géneros populares, redes de series populares (Netflix, HBO,
  etc. — nuevo campo `series_cache.networks`), calificaciones votadas,
  comentarios y me gusta conseguidos, y pendientes con las horas que
  tomaría verlos. Ver `stats.ts`, `StatsScreen.tsx`, `RankingScreen.tsx`.
  **Ojo**: no incluye los gráficos de barras "por semana" de las capturas
  — son muchos datos históricos que hoy no estamos guardando con
  granularidad semanal, y meter una librería de gráficos era demasiado
  para esta tanda.
- **Notificaciones** — campanita arriba a la izquierda del Perfil, con
  contador de no leídas. Se generan solas con triggers de Postgres
  (`notifications` + funciones `notify_like`, `notify_reply`,
  `notify_follow`, `notify_follow_request`, `notify_shared_title` en
  `schema.sql`) — no hace falta que la app las cree a mano, pasan aunque
  el usuario tenga la app cerrada. Los anuncios masivos del admin quedan
  aparte (tabla `announcements`), para no insertar una fila por usuario
  cada vez que mandás uno.

### Selección múltiple de favoritos + "¿dónde lo viste?"
- **Agregar varios favoritos de una** — botón "+ Agregar" junto a "Series
  favoritas" / "Películas favoritas" en el Perfil, abre una grilla con
  todo lo que tenés agregado y no es favorito todavía; tocás varias,
  confirmás una vez y se marcan todas juntas (`MultiSelectFavoritesScreen.tsx`).
- **¿Dónde lo viste?** — debajo de "Tu calificación" (tanto en la ficha de
  serie/película como en la de cada episodio), un selector de chips con
  las plataformas de streaming que ya trae "Dónde verlo" para ese título
  + "Otro". Solo aparece junto con la calificación, es decir, una vez que
  la serie/película está terminada o el capítulo ya está visto. Ver
  `WatchedPlatformPicker.tsx` + columnas `watched_platform` nuevas en
  `user_series`/`user_movies`/`user_episodes_watched`.

### Rediseño visual + buscador global + agregado rápido
- **Pestañas a todo el ancho**: `TopPills.tsx` pasó de ser chips chicos a un
  segmented control edge-to-edge (usado en Series, Películas, Ajustes,
  Explorar, Estadísticas) — la opción activa se llena de violeta, como
  pediste con las capturas de referencia.
- **Menú de "⋯" como modal de verdad**: reemplacé los `Alert.alert` nativos
  (que no se pueden personalizar ni tienen botón de cerrar propio) por
  `ActionSheetModal.tsx`, una hoja que sube desde abajo con una X arriba a
  la derecha. Se usa tanto en el menú del Perfil como en el de la ficha de
  título.
- **Buscador global** en Explorar (`GlobalSearchScreen.tsx`) — una barra de
  búsqueda fija arriba de todo, que al tocarla abre una pantalla con 3
  pestañas: Series y películas, Usuarios, Grupos. Reemplaza el buscador
  de usuarios que antes vivía adentro de Actividad.
- **Agregado rápido con "+"**: en Explorar → Descubrir, cada cartel de
  serie/película tiene un cuadradito violeta arriba a la derecha — un
  toque y ya queda en tu Lista pendiente, sin salir de la pantalla. Mismo
  botón "+" en los resultados de título del buscador global. Con esto,
  saqué los botones "+ Agregar serie" / "+ Agregar película" que estaban
  arriba de las listas — ahora se agrega desde Descubrir o el buscador,
  como pediste.
- **Ajustes reorganizado**: saqué la pestaña "Próximamente" (estaba vacía a
  propósito, quedó rara), y "Importar mi historial de TV Time" se mudó de
  la mitad del Perfil a Ajustes → Aplicación → Datos.
- **Arreglé un bug real** en Ajustes → Aplicación: si `getPerfil()` fallaba
  por cualquier motivo, la pestaña se quedaba en blanco para siempre sin
  avisar nada. Ahora muestra un indicador de carga y, si falla, un botón
  de "Reintentar" — nunca más pantalla en blanco silenciosa.

## Assets (identidad visual)

Generados a partir del logo, ya conectados en `app.json`:

- **`assets/icon.png`** (1024×1024, sin canal alpha — Apple rechaza íconos
  con transparencia) — ícono de iOS.
- **`assets/adaptive-icon.png`** — foreground del adaptive icon de Android,
  con el contenido achicado al ~62% del canvas centrado sobre negro. Esto es
  a propósito: Android recorta el ícono con máscaras distintas según el
  launcher (círculo, squircle, redondeado...) y solo garantiza mostrar la
  "zona segura" central — si el diseño llega hasta el borde, algunos
  launchers se comen puntas del logo. El margen extra es invisible porque
  es del mismo negro que `backgroundColor`.
- **`assets/notification-icon.png`** — ícono monocromático (blanco sobre
  transparente) para la barra de notificaciones de Android. Es un
  requisito real de la plataforma: Android ignora cualquier color que le
  pasés y tiñe el ícono solo, así que un ícono a color se ve como un blob
  blanco irreconocible. Dibujé el tilde del logo en blanco plano en vez de
  reusar el ícono a color. Conectado vía el plugin `expo-notifications` en
  `app.json` (no la clave `notification` legada, que ya no aplica en SDK
  51+ con Expo managed).
- **`assets/splash-icon.png`** — pantalla de carga, logo centrado con aire
  alrededor sobre negro.
- **`assets/favicon.png`** — solo aplica si en algún momento se genera el
  build web de Expo.
- **`assets/store/playstore-icon-512.png`** — el ícono de 512×512 que pide
  la ficha de la app en Play Console (es un requisito de la consola, no de
  `app.json` — se sube a mano en el listing).

## Lo que queda 100% a mano todavía

- **Lista de palabras prohibidas curada**: dejé sacado el placeholder de
  `moderation.ts` a propósito — Perspective API ya cubre la parte de
  toxicidad/agresividad, así que lo que falta ahí es más una lista de
  términos específicos de tu comunidad (marcas, jerga local) que conviene
  armar mirando los reportes reales una vez en producción, no adivinarla de
  antemano.
- **Splash/feature graphic de marketing para la ficha de Play Store**
  (1024×500) — es material de marketing, no un asset de la app en sí;
  conviene pensarlo junto con capturas de pantalla reales una vez que haya
  UI para mostrar.
- **Marcar el primer usuario admin**: no hay UI para esto todavía (a
  propósito — no debería ser self-service). Se hace a mano por SQL:
  `update profiles set is_admin = true where id = 'tu-user-id';`
- **Ver el perfil de otro usuario**: hoy solo existe la pantalla del propio
  perfil. Los 5 switches de privacidad granular ("qué ven los que te
  siguen") ya se guardan en la base, pero falta la pantalla que muestre el
  perfil de un tercero respetando esos switches — es la pieza que le da
  sentido real a esa configuración.
- **Panel de sugerencias para el admin**: `suggestions.ts` ya tiene todo lo
  necesario (`listarSugerencias`, `actualizarEstadoSugerencia`), falta una
  pantalla tipo `AdminReportsScreen` que las liste — mientras tanto se
  pueden revisar por SQL: `select * from suggestions order by created_at desc;`
- **Modo claro**: se descartó a pedido — la app es solo modo oscuro.

## Recordatorios del spec

- Atribución obligatoria a TMDB (logo + texto) y a JustWatch donde se
  muestren watch providers — el texto ya está, falta el logo visual.
- Permiso comercial de TMDB antes de activar ads o suscripción.
- Bundle id `com.lavinola.app` en `app.json` — actualizar si cambia el
  nombre final, antes de publicar.
- Supabase: Free para arrancar, pasar a Pro (~$25/mes) cerca de los
  6.000-7.000 usuarios activos o antes si hay datos reales en juego.
- Play Store exige sistema de reporte/bloqueo con contenido generado por
  usuarios — ya implementado end-to-end (UI + tabla + panel de revisión).
