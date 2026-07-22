-- ============================================================
-- LAVINOLA — Schema inicial de Supabase (Postgres)
-- Basado en spec_app_tracking_series.md
-- Correr en el SQL editor de Supabase, en orden de arriba a abajo.
-- ============================================================

-- ---------- PERFILES ----------
-- Extiende auth.users (Supabase Auth) con datos propios de la app
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  country text, -- código ISO (ej 'AR'), se pide en el registro, usado como watch_region
  avatar_url text,
  created_at timestamptz default now()
);

-- ---------- CATÁLOGO CACHEADO DE TMDB ----------
-- Cacheamos lo mínimo para no pegarle a TMDB en cada request (rate limit + costo)
create table if not exists series_cache (
  tmdb_id integer primary key,
  name text not null,
  poster_path text,
  overview text,
  status text, -- 'Ended' | 'Canceled' | 'Returning Series' (viene tal cual de TMDB)
  total_episodes integer default 0,
  synced_at timestamptz default now()
);

create table if not exists movies_cache (
  tmdb_id integer primary key,
  title text not null,
  poster_path text,
  overview text,
  runtime_minutes integer, -- de TMDB, usado para sumar stats
  release_date date,
  synced_at timestamptz default now()
);

create table if not exists episodes_cache (
  series_tmdb_id integer references series_cache(tmdb_id) on delete cascade,
  season_number integer not null,
  episode_number integer not null,
  name text,
  air_date date,
  runtime_minutes integer,
  primary key (series_tmdb_id, season_number, episode_number)
);

-- ---------- RELACIÓN USUARIO-SERIE / USUARIO-PELÍCULA ----------
create table if not exists user_series (
  user_id uuid references profiles(id) on delete cascade,
  series_tmdb_id integer references series_cache(tmdb_id) on delete cascade,
  in_watchlist boolean default true, -- "la sigo / la quiero ver"
  last_watched_at timestamptz, -- clave para calcular Viendo vs Abandonada
  created_at timestamptz default now(),
  primary key (user_id, series_tmdb_id)
);

create table if not exists user_episodes_watched (
  user_id uuid references profiles(id) on delete cascade,
  series_tmdb_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  watched_at timestamptz default now(),
  primary key (user_id, series_tmdb_id, season_number, episode_number),
  foreign key (series_tmdb_id, season_number, episode_number)
    references episodes_cache(series_tmdb_id, season_number, episode_number) on delete cascade
);

create table if not exists user_movies (
  user_id uuid references profiles(id) on delete cascade,
  movie_tmdb_id integer references movies_cache(tmdb_id) on delete cascade,
  watched boolean default false,
  watched_at timestamptz,
  added_at timestamptz default now(),
  primary key (user_id, movie_tmdb_id)
);

-- ---------- LISTAS PERSONALIZADAS ----------
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text not null,
  created_at timestamptz default now()
);

create table if not exists list_items (
  list_id uuid references lists(id) on delete cascade,
  item_type text check (item_type in ('series','movie')),
  tmdb_id integer not null,
  added_at timestamptz default now(),
  primary key (list_id, item_type, tmdb_id)
);

-- ---------- COMUNIDAD: SEGUIR (unidireccional, sin DM libre) ----------
create table if not exists follows (
  follower_id uuid references profiles(id) on delete cascade,
  followee_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ---------- "COMPARTIR TÍTULO" (reemplaza el chat libre) ----------
create table if not exists shared_titles (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade,
  receiver_id uuid references profiles(id) on delete cascade,
  item_type text check (item_type in ('series','movie')),
  tmdb_id integer not null,
  note text check (char_length(note) <= 200), -- notita corta, sin fotos
  created_at timestamptz default now(),
  read_at timestamptz
);

-- ---------- GRUPOS ----------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text, -- de Unsplash (default) o subida propia (pasada por SafeSearch)
  photo_source text check (photo_source in ('unsplash','upload')) default 'unsplash',
  creator_id uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- FIX: antes creator_id era "on delete set null" — al borrar una cuenta, sus
-- grupos quedaban huérfanos para siempre en vez de borrarse. Ahora si se
-- borra quien creó el grupo, se borra el grupo entero (y en cascada sus
-- miembros/comentarios, por las FKs que ya referencian a groups).
alter table groups drop constraint if exists groups_creator_id_fkey;
alter table groups add constraint groups_creator_id_fkey foreign key (creator_id) references profiles(id) on delete cascade;

-- Limpieza única: esto borra grupos que ya habían quedado huérfanos ANTES de
-- que existiera el "on delete cascade" de arriba (de acá en adelante, con el
-- cascade ya puesto, esto no puede volver a pasar — es solo para lo viejo).
delete from groups where creator_id is null;

create table if not exists group_members (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

-- ---------- COMENTARIOS (episodio, película, serie, o post de grupo) — hilo anidado ----------
create table if not exists comentarios (
  id uuid primary key default gen_random_uuid(),
  parent_comment_id uuid references comentarios(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  target_type text check (target_type in ('series','movie','episode','group')),
  target_id text not null, -- tmdb_id, o 'series:episodio' tipo "1399:1:1", o group_id
  group_id uuid references groups(id) on delete cascade, -- solo si target_type = 'group'
  content text not null check (char_length(content) <= 2000), -- sin fotos, solo texto
  reply_count integer default 0, -- denormalizado, se actualiza por trigger
  created_at timestamptz default now()
);

create index if not exists idx_comentarios_target on comentarios(target_type, target_id);
create index if not exists idx_comentarios_parent on comentarios(parent_comment_id);

-- Trigger: mantiene reply_count actualizado en el padre
create or replace function bump_reply_count() returns trigger as $$
begin
  if new.parent_comment_id is not null then
    update comentarios set reply_count = reply_count + 1 where id = new.parent_comment_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bump_reply_count on comentarios;
create trigger trg_bump_reply_count after insert on comentarios
  for each row execute function bump_reply_count();

create table if not exists likes_comentario (
  user_id uuid references profiles(id) on delete cascade,
  comment_id uuid references comentarios(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, comment_id)
);

-- ---------- MODERACIÓN (reporte + bloqueo — requisito de Google Play) ----------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id) on delete cascade,
  target_type text check (target_type in ('comment','group','user','shared_title')),
  target_id text not null,
  reason text not null,
  status text default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz default now()
);

create table if not exists blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id)
);

-- ---------- FAVORITOS ----------
create table if not exists user_favorites (
  user_id uuid references profiles(id) on delete cascade,
  item_type text check (item_type in ('series','movie')),
  tmdb_id integer not null,
  added_at timestamptz default now(),
  primary key (user_id, item_type, tmdb_id)
);

alter table user_favorites enable row level security;
drop policy if exists "favorites_owner" on user_favorites;
create policy "favorites_owner" on user_favorites for all using (auth.uid() = user_id);

-- ---------- Columnas extra en profiles (push notifications + admin de moderación) ----------
alter table profiles add column if not exists push_token text;
alter table profiles add column if not exists is_admin boolean default false;
alter table profiles add column if not exists is_moderator boolean default false;

-- FIX: la política de update de profiles solo dejaba a cada uno editar su
-- propia fila. Eso significa que "suspender a un usuario" (que actualiza
-- suspended_until en la fila DE OTRO) nunca funcionó, ni para admin ni para
-- moderador — mismo problema de fondo que tuvimos con aceptar solicitudes
-- de seguimiento. Se arregla ensanchando el update a admin/moderador.
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (
  auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and (p.is_admin = true or p.is_moderator = true))
);
alter table profiles enable row level security;
alter table user_series enable row level security;
alter table user_episodes_watched enable row level security;
alter table user_movies enable row level security;
alter table lists enable row level security;
alter table list_items enable row level security;
alter table follows enable row level security;
alter table shared_titles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table comentarios enable row level security;
alter table likes_comentario enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;

-- Perfiles: todos pueden leer perfiles públicos, cada uno edita el suyo
drop policy if exists "profiles_select_all" on profiles;
create policy "profiles_select_all" on profiles for select using (true);
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- Datos personales de tracking: solo el dueño lee/escribe
drop policy if exists "user_series_owner" on user_series;
create policy "user_series_owner" on user_series for all using (auth.uid() = user_id);
drop policy if exists "user_episodes_owner" on user_episodes_watched;
create policy "user_episodes_owner" on user_episodes_watched for all using (auth.uid() = user_id);
drop policy if exists "user_movies_owner" on user_movies;
create policy "user_movies_owner" on user_movies for all using (auth.uid() = user_id);
drop policy if exists "lists_owner" on lists;
create policy "lists_owner" on lists for all using (auth.uid() = user_id);
drop policy if exists "list_items_owner" on list_items;
create policy "list_items_owner" on list_items for all using (
  exists (select 1 from lists where lists.id = list_items.list_id and lists.user_id = auth.uid())
);

-- Follows: cualquiera ve quién sigue a quién (para feed), solo el propio usuario crea/borra su follow
drop policy if exists "follows_select_all" on follows;
create policy "follows_select_all" on follows for select using (true);
drop policy if exists "follows_manage_own" on follows;
create policy "follows_manage_own" on follows for insert with check (auth.uid() = follower_id);
drop policy if exists "follows_delete_own" on follows;
create policy "follows_delete_own" on follows for delete using (auth.uid() = follower_id or auth.uid() = followee_id);

-- Compartir título: emisor y receptor lo ven, solo el emisor lo crea
drop policy if exists "shared_titles_select" on shared_titles;
create policy "shared_titles_select" on shared_titles for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "shared_titles_insert" on shared_titles;
create policy "shared_titles_insert" on shared_titles for insert with check (auth.uid() = sender_id);

-- Grupos: lectura pública, creación por cualquier usuario autenticado
drop policy if exists "groups_select_all" on groups;
create policy "groups_select_all" on groups for select using (true);
drop policy if exists "groups_insert_auth" on groups;
create policy "groups_insert_auth" on groups for insert with check (auth.uid() = creator_id);
drop policy if exists "group_members_select_all" on group_members;
create policy "group_members_select_all" on group_members for select using (true);
drop policy if exists "group_members_manage_own" on group_members;
create policy "group_members_manage_own" on group_members for all using (auth.uid() = user_id);

-- Comentarios: lectura pública, solo el autor edita/borra el propio, cualquiera autenticado postea
drop policy if exists "comentarios_select_all" on comentarios;
create policy "comentarios_select_all" on comentarios for select using (true);
drop policy if exists "comentarios_insert_auth" on comentarios;
create policy "comentarios_insert_auth" on comentarios for insert with check (auth.uid() = user_id);
drop policy if exists "comentarios_delete_own" on comentarios;
create policy "comentarios_delete_own" on comentarios for delete using (auth.uid() = user_id);

drop policy if exists "likes_select_all" on likes_comentario;
create policy "likes_select_all" on likes_comentario for select using (true);
drop policy if exists "likes_manage_own" on likes_comentario;
create policy "likes_manage_own" on likes_comentario for all using (auth.uid() = user_id);

-- Reportes y bloqueos: ver política admin-aware más abajo (después de habilitar RLS)
drop policy if exists "blocks_owner" on blocks;
create policy "blocks_owner" on blocks for all using (auth.uid() = blocker_id);

-- Reportes: el que reporta puede insertar y ver los propios; los admins ven y actualizan todos.
drop policy if exists "reports_insert_own" on reports;
create policy "reports_insert_own" on reports for insert with check (auth.uid() = reporter_id);
drop policy if exists "reports_select_own_or_admin" on reports;
create policy "reports_select_own_or_admin" on reports for select using (
  auth.uid() = reporter_id or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);
drop policy if exists "reports_update_admin" on reports;
create policy "reports_update_admin" on reports for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- ============================================================
-- RATE LIMITING de cuentas nuevas (server-side, no bypasseable desde el cliente)
-- Cuentas con menos de 3 días de antigüedad: máximo 5 comentarios por hora.
-- ============================================================
-- ============================================================
-- ANTI-SPAM (server-side, no bypasseable desde el cliente).
-- Antes había un límite fijo de 5 posteos/hora para cuentas nuevas — se
-- sacó: ahora cualquier cuenta puede publicar todo lo que quiera, siempre
-- que no sea el MISMO texto repetido (eso sí se bloquea, sea cuenta nueva
-- o vieja).
-- ============================================================
create or replace function enforce_comment_rate_limit() returns trigger as $$
declare
  repeticiones integer;
begin
  if length(trim(new.content)) > 0 then
    select count(*) into repeticiones
      from comentarios
      where user_id = new.user_id
        and created_at > now() - interval '1 hour'
        and lower(trim(content)) = lower(trim(new.content));

    if repeticiones >= 2 then
      raise exception 'Estás mandando el mismo comentario varias veces. Cambiá el texto para poder publicar.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rate_limit_comentarios on comentarios;
create trigger trg_rate_limit_comentarios before insert on comentarios
  for each row execute function enforce_comment_rate_limit();

-- Mismo criterio para "compartir título": libre, salvo que mandes la MISMA notita repetida.
create or replace function enforce_share_rate_limit() returns trigger as $$
declare
  repeticiones integer;
begin
  if new.note is not null and length(trim(new.note)) > 0 then
    select count(*) into repeticiones
      from shared_titles
      where sender_id = new.sender_id
        and created_at > now() - interval '1 hour'
        and lower(trim(note)) = lower(trim(new.note));

    if repeticiones >= 2 then
      raise exception 'Estás mandando la misma notita repetida. Cambiá el texto para poder compartir de nuevo.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rate_limit_shared_titles on shared_titles;
create trigger trg_rate_limit_shared_titles before insert on shared_titles
  for each row execute function enforce_share_rate_limit();

-- ============================================================
-- Rate limit de creación de grupos (evita grupos duplicados/spam)
-- Máximo 3 grupos creados por usuario en 24hs, sin importar antigüedad de cuenta.
-- ============================================================
create or replace function enforce_group_creation_rate_limit() returns trigger as $$
declare
  grupos_ultimas_24h integer;
begin
  select count(*) into grupos_ultimas_24h
    from groups
    where creator_id = new.creator_id and created_at > now() - interval '24 hours';

  if grupos_ultimas_24h >= 3 then
    raise exception 'Límite de creación de grupos alcanzado (3 cada 24hs). Probá de nuevo mañana.';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rate_limit_groups on groups;
create trigger trg_rate_limit_groups before insert on groups
  for each row execute function enforce_group_creation_rate_limit();

-- ============================================================
-- EXTENSIÓN DE PERFIL: portada, avatar, nombre, año, género
-- ============================================================
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists birth_year integer;
alter table profiles add column if not exists gender text; -- 'hombre' | 'mujer' | 'otro' | null (opcional, sin forzar)
alter table profiles add column if not exists cover_type text check (cover_type in ('series','movie'));
alter table profiles add column if not exists cover_tmdb_id integer;

-- ============================================================
-- RESPUESTAS a "compartir título" — convierte el envío suelto en un
-- hilo (el usuario puede responder, sigue siendo solo texto, sin fotos).
-- ============================================================
create table if not exists shared_title_replies (
  id uuid primary key default gen_random_uuid(),
  shared_title_id uuid references shared_titles(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 500),
  created_at timestamptz default now()
);

alter table shared_title_replies enable row level security;

drop policy if exists "shared_title_replies_select" on shared_title_replies;
create policy "shared_title_replies_select" on shared_title_replies for select using (
  exists (
    select 1 from shared_titles st
    where st.id = shared_title_replies.shared_title_id
      and (st.sender_id = auth.uid() or st.receiver_id = auth.uid())
  )
);
drop policy if exists "shared_title_replies_insert" on shared_title_replies;
create policy "shared_title_replies_insert" on shared_title_replies for insert with check (
  auth.uid() = sender_id and exists (
    select 1 from shared_titles st
    where st.id = shared_title_replies.shared_title_id
      and (st.sender_id = auth.uid() or st.receiver_id = auth.uid())
  )
);

-- Mismo criterio de rate limit que el resto (cuentas nuevas, 5 por hora)
-- Mismo criterio que arriba, aplicado a las respuestas del chat de recomendaciones.
create or replace function enforce_share_reply_rate_limit() returns trigger as $$
declare
  repeticiones integer;
begin
  if length(trim(new.content)) > 0 then
    select count(*) into repeticiones
      from shared_title_replies
      where sender_id = new.sender_id
        and created_at > now() - interval '1 hour'
        and lower(trim(content)) = lower(trim(new.content));

    if repeticiones >= 2 then
      raise exception 'Estás mandando el mismo mensaje varias veces. Cambiá el texto para poder enviarlo de nuevo.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_rate_limit_shared_replies on shared_title_replies;
create trigger trg_rate_limit_shared_replies before insert on shared_title_replies
  for each row execute function enforce_share_reply_rate_limit();

-- Géneros TMDB cacheados (para armar recomendaciones tipo "las mejores para ti")
alter table series_cache add column if not exists genre_ids integer[];
alter table movies_cache add column if not exists genre_ids integer[];

alter table series_cache add column if not exists first_air_date date;
alter table series_cache add column if not exists seasons_meta jsonb;

-- ============================================================
-- AJUSTES DE CUENTA Y PRIVACIDAD
-- ============================================================
alter table profiles add column if not exists is_private boolean default false;
alter table profiles add column if not exists show_watched_movies boolean default true;
alter table profiles add column if not exists show_watched_series boolean default true;
alter table profiles add column if not exists show_favorite_movies boolean default true;
alter table profiles add column if not exists show_favorite_series boolean default true;
alter table profiles add column if not exists show_groups boolean default true;

-- Redes sociales (para mostrar en el perfil, todo opcional)
alter table profiles add column if not exists social_instagram text;
alter table profiles add column if not exists social_twitter text;
alter table profiles add column if not exists social_tiktok text;

-- Idioma de títulos: si es null, se usa inglés (comportamiento original de TMDB).
-- Si es true, se usa es-419 (Latam) o es-ES según el país del perfil.
alter table profiles add column if not exists show_titles_in_spanish boolean default false;

-- Tema: la app es solo modo oscuro (coherente con el logo), no hay toggle.

-- Preferencias de notificación
alter table profiles add column if not exists notify_episode_timing text default 'none'
  check (notify_episode_timing in ('none','10min','1hora','1dia'));
alter table profiles add column if not exists notify_likes boolean default true;
alter table profiles add column if not exists notify_replies boolean default true;
alter table profiles add column if not exists notify_follow_requests boolean default true;
alter table profiles add column if not exists notify_messages boolean default true;

-- ============================================================
-- SOLICITUDES DE SEGUIMIENTO (para perfiles privados)
-- Si el perfil de destino es privado, un follow pasa por acá primero.
-- ============================================================
create table if not exists follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references profiles(id) on delete cascade,
  target_id uuid references profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now(),
  unique (requester_id, target_id)
);

alter table follow_requests enable row level security;
drop policy if exists "follow_requests_select" on follow_requests;
create policy "follow_requests_select" on follow_requests for select using (
  auth.uid() = requester_id or auth.uid() = target_id
);
drop policy if exists "follow_requests_insert" on follow_requests;
create policy "follow_requests_insert" on follow_requests for insert with check (auth.uid() = requester_id);
drop policy if exists "follow_requests_update_target" on follow_requests;
create policy "follow_requests_update_target" on follow_requests for update using (auth.uid() = target_id);
drop policy if exists "follow_requests_update_requester" on follow_requests;
create policy "follow_requests_update_requester" on follow_requests for update using (auth.uid() = requester_id);
drop policy if exists "follow_requests_delete_own" on follow_requests;
create policy "follow_requests_delete_own" on follow_requests for delete using (
  auth.uid() = requester_id or auth.uid() = target_id
);

-- ============================================================
-- SUGERENCIAS DE MEJORA (la comunidad le escribe directo al admin)
-- ============================================================
create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  content text not null check (char_length(content) <= 1000),
  status text default 'nueva' check (status in ('nueva','leida','implementada','descartada')),
  created_at timestamptz default now()
);

alter table suggestions enable row level security;
drop policy if exists "suggestions_insert_own" on suggestions;
create policy "suggestions_insert_own" on suggestions for insert with check (auth.uid() = user_id);
drop policy if exists "suggestions_select_own_or_admin" on suggestions;
create policy "suggestions_select_own_or_admin" on suggestions for select using (
  auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
drop policy if exists "suggestions_update_admin" on suggestions;
create policy "suggestions_update_admin" on suggestions for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- ============================================================
-- "No me interesa" — títulos que el usuario saca de las recomendaciones
-- ============================================================
create table if not exists user_disliked_titles (
  user_id uuid references profiles(id) on delete cascade,
  item_type text check (item_type in ('series','movie')),
  tmdb_id integer not null,
  created_at timestamptz default now(),
  primary key (user_id, item_type, tmdb_id)
);

alter table user_disliked_titles enable row level security;
drop policy if exists "disliked_owner" on user_disliked_titles;
create policy "disliked_owner" on user_disliked_titles for all using (auth.uid() = user_id);

-- ============================================================
-- CALIFICACIONES (1-5) — el usuario puntúa cuando termina una serie/
-- película/capítulo. Se promedia entre todos los usuarios para mostrar
-- el puntaje de la app en la ficha de título.
-- ============================================================
alter table user_series add column if not exists rating integer check (rating between 1 and 5);
alter table user_movies add column if not exists rating integer check (rating between 1 and 5);
alter table user_episodes_watched add column if not exists rating integer check (rating between 1 and 5);

-- ============================================================
-- CARÁTULA PERSONALIZADA — cada usuario puede elegir otro poster/banner
-- oficial de TMDB para SU vista de esa serie/película (no afecta a otros).
-- ============================================================
alter table user_series add column if not exists custom_poster_path text;
alter table user_series add column if not exists custom_backdrop_path text;
alter table user_movies add column if not exists custom_poster_path text;
alter table user_movies add column if not exists custom_backdrop_path text;

-- Sinopsis del episodio (para la ficha de cada capítulo)
alter table episodes_cache add column if not exists overview text;

-- Backdrop (banner horizontal) además del poster, para el header de la ficha
alter table series_cache add column if not exists backdrop_path text;
alter table movies_cache add column if not exists backdrop_path text;

-- GIFs en comentarios: SOLO por URL de una API externa curada (Tenor), nunca
-- una subida de imagen propia — mantiene la misma lógica de seguridad que
-- llevó a prohibir fotos (ver spec): el contenido no lo sube el usuario, lo
-- elige de un catálogo ya moderado por un tercero.
alter table comentarios add column if not exists gif_url text;

-- ============================================================
-- SUSPENSIÓN DE COMENTARIOS (moderación de admin)
-- suspended_until = NULL -> no suspendido. Para "para siempre" se usa una
-- fecha muy lejana. Siempre reversible: alcanza con volver a poner NULL.
-- ============================================================
alter table profiles add column if not exists suspended_until timestamptz;
alter table profiles add column if not exists suspension_reason text;

-- Bloquea a nivel de base de datos (no solo en la app) que un usuario
-- suspendido publique comentarios o respuestas — así no se puede saltear
-- editando la app.
create or replace function enforce_not_suspended() returns trigger as $$
declare
  hasta timestamptz;
  quien uuid;
begin
  -- Esta función se reutiliza en varias tablas (comentarios usa "user_id",
  -- shared_title_replies usa "sender_id") — antes asumía siempre "user_id"
  -- y explotaba con "record new has no field user_id" al responder una
  -- recomendación. Ahora toma la que exista en la fila.
  quien := coalesce((to_jsonb(new)->>'user_id')::uuid, (to_jsonb(new)->>'sender_id')::uuid);
  select suspended_until into hasta from profiles where id = quien;
  if hasta is not null and hasta > now() then
    raise exception 'Tu cuenta tiene los comentarios suspendidos hasta %. Si creés que es un error, contactanos.', to_char(hasta, 'DD/MM/YYYY');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_no_comentar_suspendido on comentarios;
create trigger trg_no_comentar_suspendido before insert on comentarios
  for each row execute function enforce_not_suspended();

drop trigger if exists trg_no_responder_suspendido on shared_title_replies;
create trigger trg_no_responder_suspendido before insert on shared_title_replies
  for each row execute function enforce_not_suspended();

-- ============================================================
-- RESPUESTA DEL ADMIN A SUGERENCIAS
-- ============================================================
alter table suggestions add column if not exists admin_reply text;
alter table suggestions add column if not exists admin_reply_at timestamptz;

-- ============================================================
-- ANUNCIOS MASIVOS (el admin le manda un mensaje a toda la comunidad)
-- ============================================================
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles(id) on delete set null,
  message text not null check (char_length(message) <= 500),
  created_at timestamptz default now()
);

alter table announcements enable row level security;
drop policy if exists "announcements_select_all" on announcements;
create policy "announcements_select_all" on announcements for select using (true);
drop policy if exists "announcements_insert_admin" on announcements;
create policy "announcements_insert_admin" on announcements for insert with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- Plataformas/networks de cada serie (Netflix, HBO, etc.) — para "Redes de series populares" en Estadísticas
alter table series_cache add column if not exists networks text[];

-- ============================================================
-- NOTIFICACIONES — se generan solas con triggers cuando pasa algo relevante
-- (like, respuesta, nuevo seguidor, solicitud de seguimiento, título compartido).
-- Los anuncios masivos NO generan una fila por usuario acá (ver tabla
-- `announcements` aparte) para no insertar miles de filas de una.
-- ============================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade, -- destinatario
  type text not null check (type in ('like','reply','follow','follow_request','shared_title')),
  actor_id uuid references profiles(id) on delete set null, -- quién generó la notificación
  target_type text, -- 'comment' | 'series' | 'movie' | null
  target_id text,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user on notifications(user_id, created_at desc);

alter table notifications enable row level security;
drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications for update using (auth.uid() = user_id);

-- Like en un comentario -> avisa al autor del comentario
create or replace function notify_like() returns trigger as $$
declare
  autor_id uuid;
begin
  select user_id into autor_id from comentarios where id = new.comment_id;
  if autor_id is not null and autor_id <> new.user_id then
    insert into notifications (user_id, type, actor_id, target_type, target_id)
      values (autor_id, 'like', new.user_id, 'comment', new.comment_id::text);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_like on likes_comentario;
create trigger trg_notify_like after insert on likes_comentario
  for each row execute function notify_like();

-- Respuesta a un comentario -> avisa al autor del comentario padre
create or replace function notify_reply() returns trigger as $$
declare
  autor_id uuid;
begin
  if new.parent_comment_id is not null then
    select user_id into autor_id from comentarios where id = new.parent_comment_id;
    if autor_id is not null and autor_id <> new.user_id then
      insert into notifications (user_id, type, actor_id, target_type, target_id)
        values (autor_id, 'reply', new.user_id, new.target_type, new.target_id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_reply on comentarios;
create trigger trg_notify_reply after insert on comentarios
  for each row execute function notify_reply();

-- Nuevo seguidor -> avisa al que fue seguido
create or replace function notify_follow() returns trigger as $$
begin
  insert into notifications (user_id, type, actor_id)
    values (new.followee_id, 'follow', new.follower_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_follow on follows;
create trigger trg_notify_follow after insert on follows
  for each row execute function notify_follow();

-- Solicitud de seguimiento (perfil privado) -> avisa al destino
create or replace function notify_follow_request() returns trigger as $$
begin
  insert into notifications (user_id, type, actor_id)
    values (new.target_id, 'follow_request', new.requester_id);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_follow_request on follow_requests;
create trigger trg_notify_follow_request after insert or update of status on follow_requests
  for each row execute function notify_follow_request();

-- Te compartieron un título -> avisa al destinatario
create or replace function notify_shared_title() returns trigger as $$
begin
  insert into notifications (user_id, type, actor_id, target_type, target_id)
    values (new.receiver_id, 'shared_title', new.sender_id, new.item_type, new.tmdb_id::text);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_shared_title on shared_titles;
create trigger trg_notify_shared_title after insert on shared_titles
  for each row execute function notify_shared_title();

-- Dónde viste cada título/capítulo (nombre de la plataforma, texto libre —
-- se llena con las opciones de "Dónde verlo" de esa ficha + "Otro").
alter table user_series add column if not exists watched_platform text;
alter table user_movies add column if not exists watched_platform text;
alter table user_episodes_watched add column if not exists watched_platform text;

-- ============================================================
-- CREACIÓN AUTOMÁTICA DE PERFIL — se dispara sola cuando se crea un usuario
-- nuevo en auth.users, sin depender de que haya sesión activa (por eso no
-- se rompe con la confirmación de mail). username/country vienen del
-- "options.data" que manda la app en el signUp().
-- ============================================================
create or replace function crear_perfil_automatico() returns trigger as $$
declare
  username_deseado text;
  es_placeholder boolean;
begin
  es_placeholder := new.raw_user_meta_data->>'username' is null;
  username_deseado := coalesce(new.raw_user_meta_data->>'username', 'usuario_' || substr(new.id::text, 1, 8));
  begin
    insert into public.profiles (id, username, country, content_language, username_placeholder)
    values (new.id, username_deseado, new.raw_user_meta_data->>'country', coalesce(new.raw_user_meta_data->>'content_language', 'es-419'), es_placeholder)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- El chequeo de disponibilidad del cliente es la primera barrera, pero
    -- por las dudas dos altas caigan justo al mismo tiempo con el mismo
    -- username, no dejamos que reviente el alta de la cuenta: le agregamos
    -- un sufijo random y seguimos. El usuario puede cambiarlo después.
    insert into public.profiles (id, username, country, content_language, username_placeholder)
    values (new.id, username_deseado || '_' || substr(new.id::text, 1, 4), new.raw_user_meta_data->>'country', coalesce(new.raw_user_meta_data->>'content_language', 'es-419'), es_placeholder)
    on conflict (id) do nothing;
  end;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_crear_perfil_automatico on auth.users;
create trigger trg_crear_perfil_automatico
  after insert on auth.users
  for each row execute function crear_perfil_automatico();

-- Arregla las cuentas que ya quedaron sin perfil por este bug (como la tuya).
insert into public.profiles (id, country)
select u.id, null
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ============================================================
-- PERMISOS de las tablas de caché (series_cache, movies_cache,
-- episodes_cache) — nunca habían tenido políticas, así que Supabase las
-- bloqueaba por completo para escribir. Cualquiera puede LEER (es solo
-- data de TMDB, no hay nada privado), y cualquier usuario logueado puede
-- ESCRIBIR (agregar/actualizar el cache cuando abre o agrega un título).
-- ============================================================
alter table series_cache enable row level security;
drop policy if exists "series_cache_select_all" on series_cache;
create policy "series_cache_select_all" on series_cache for select using (true);
drop policy if exists "series_cache_write_auth" on series_cache;
create policy "series_cache_write_auth" on series_cache for insert to authenticated with check (true);
drop policy if exists "series_cache_update_auth" on series_cache;
create policy "series_cache_update_auth" on series_cache for update to authenticated using (true);

alter table movies_cache enable row level security;
drop policy if exists "movies_cache_select_all" on movies_cache;
create policy "movies_cache_select_all" on movies_cache for select using (true);
drop policy if exists "movies_cache_write_auth" on movies_cache;
create policy "movies_cache_write_auth" on movies_cache for insert to authenticated with check (true);
drop policy if exists "movies_cache_update_auth" on movies_cache;
create policy "movies_cache_update_auth" on movies_cache for update to authenticated using (true);

alter table episodes_cache enable row level security;
drop policy if exists "episodes_cache_select_all" on episodes_cache;
create policy "episodes_cache_select_all" on episodes_cache for select using (true);
drop policy if exists "episodes_cache_write_auth" on episodes_cache;
create policy "episodes_cache_write_auth" on episodes_cache for insert to authenticated with check (true);
drop policy if exists "episodes_cache_update_auth" on episodes_cache;
create policy "episodes_cache_update_auth" on episodes_cache for update to authenticated using (true);

-- Arreglo: la notificación de "te compartieron un título" guardaba el
-- tmdb_id en vez del id de la conversación (shared_titles.id) — por eso no
-- se podía abrir el hilo de charla desde la notificación, solo la ficha.
create or replace function notify_shared_title() returns trigger as $$
begin
  insert into notifications (user_id, type, actor_id, target_type, target_id)
    values (new.receiver_id, 'shared_title', new.sender_id, 'shared_title_thread', new.id::text);
  return new;
end;
$$ language plpgsql;

-- Cantidad de temporadas (para mostrar debajo del título de la serie)
alter table series_cache add column if not exists total_seasons integer default 0;

-- ============================================================
-- FIX CRÍTICO: faltaba la política de INSERT en `notifications`. Los
-- triggers de like/reply/follow/follow_request/shared_title insertan ahí,
-- pero como corren con los permisos de quien hizo la acción (no son
-- `security definer`), sin esta política el INSERT quedaba bloqueado por
-- RLS y hacía fallar TODA la transacción original — el follow, el
-- comentario (respuestas), el compartir título, el like. Esto explica
-- "no puedo seguir gente" / "no me deja comentar" / etc.
-- ============================================================
drop policy if exists "notifications_insert_system" on notifications;
create policy "notifications_insert_system" on notifications for insert
  with check (actor_id = auth.uid());

-- ============================================================
-- FIX: faltaban políticas de UPDATE/DELETE en `groups` — por eso "Eliminar
-- grupo" y "Suspender comentarios" no hacían nada (fallaban silenciosamente
-- por RLS, el bug clásico de "parece que funcionó pero no se guardó").
-- ============================================================
drop policy if exists "groups_update_own_or_admin" on groups;
create policy "groups_update_own_or_admin" on groups for update using (
  auth.uid() = creator_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
drop policy if exists "groups_delete_own_or_admin" on groups;
create policy "groups_delete_own_or_admin" on groups for delete using (
  auth.uid() = creator_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

-- ============================================================
-- REVISITAS: permite volver a marcar como vista una película/capítulo ya
-- visto. `watched_at` pasa a guardar la fecha de la vista MÁS RECIENTE;
-- `first_watched_at` conserva la fecha original de la primera vez.
-- `times_watched` suma para las estadísticas del perfil.
-- ============================================================
alter table user_movies add column if not exists times_watched integer not null default 1;
alter table user_movies add column if not exists first_watched_at timestamptz;
update user_movies set first_watched_at = watched_at where first_watched_at is null and watched_at is not null;

alter table user_episodes_watched add column if not exists times_watched integer not null default 1;
alter table user_episodes_watched add column if not exists first_watched_at timestamptz;
update user_episodes_watched set first_watched_at = watched_at where first_watched_at is null;

-- ============================================================
-- REACCIONES DE ÁNIMO ("¿cómo te sentiste?") y VOTO DE REPARTO FAVORITO
-- ("¿quién te ha gustado más?") por título/capítulo visto. Una fila por
-- usuario+target: si vuelve a elegir, se reemplaza (upsert).
-- ============================================================
create table if not exists title_mood_reactions (
  user_id uuid references profiles(id) on delete cascade,
  target_type text check (target_type in ('series','movie','episode')),
  target_id text not null,
  mood text not null,
  created_at timestamptz default now(),
  primary key (user_id, target_type, target_id)
);
alter table title_mood_reactions enable row level security;
drop policy if exists "mood_select_all" on title_mood_reactions;
create policy "mood_select_all" on title_mood_reactions for select using (true);
drop policy if exists "mood_manage_own" on title_mood_reactions;
create policy "mood_manage_own" on title_mood_reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists title_favorite_cast (
  user_id uuid references profiles(id) on delete cascade,
  target_type text check (target_type in ('series','movie','episode')),
  target_id text not null,
  actor_tmdb_id integer not null,
  actor_name text,
  created_at timestamptz default now(),
  primary key (user_id, target_type, target_id)
);
alter table title_favorite_cast enable row level security;
drop policy if exists "favcast_select_all" on title_favorite_cast;
create policy "favcast_select_all" on title_favorite_cast for select using (true);
drop policy if exists "favcast_manage_own" on title_favorite_cast;
create policy "favcast_manage_own" on title_favorite_cast for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- BUCKET DE STORAGE "avatars" — probablemente faltaba esto (bucket y/o
-- políticas), causa habitual del "Network request failed" al elegir foto
-- de perfil: sin bucket público ni política de INSERT, la subida rebota.
-- ============================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars_insert_auth" on storage.objects;
create policy "avatars_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
drop policy if exists "avatars_update_auth" on storage.objects;
create policy "avatars_update_auth" on storage.objects for update to authenticated using (bucket_id = 'avatars');
drop policy if exists "avatars_delete_auth" on storage.objects;
create policy "avatars_delete_auth" on storage.objects for delete to authenticated using (bucket_id = 'avatars');

-- ============================================================
-- FIX: los switches de notificaciones en Ajustes (notify_likes,
-- notify_replies, notify_follow_requests, notify_messages) no se
-- respetaban — las notificaciones se generaban siempre sin importar la
-- preferencia. Redefinimos los triggers para chequear la preferencia del
-- DESTINATARIO antes de insertar la notificación.
-- ============================================================
create or replace function notify_like() returns trigger as $$
declare
  autor_id uuid;
  quiere_notif boolean;
begin
  select user_id into autor_id from comentarios where id = new.comment_id;
  if autor_id is not null and autor_id <> new.user_id then
    select notify_likes into quiere_notif from profiles where id = autor_id;
    if coalesce(quiere_notif, true) then
      insert into notifications (user_id, type, actor_id, target_type, target_id)
        values (autor_id, 'like', new.user_id, 'comment', new.comment_id::text);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function notify_reply() returns trigger as $$
declare
  autor_id uuid;
  quiere_notif boolean;
begin
  if new.parent_comment_id is not null then
    select user_id into autor_id from comentarios where id = new.parent_comment_id;
    if autor_id is not null and autor_id <> new.user_id then
      select notify_replies into quiere_notif from profiles where id = autor_id;
      if coalesce(quiere_notif, true) then
        insert into notifications (user_id, type, actor_id, target_type, target_id)
          values (autor_id, 'reply', new.user_id, new.target_type, new.target_id);
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function notify_follow_request() returns trigger as $$
declare
  quiere_notif boolean;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select notify_follow_requests into quiere_notif from profiles where id = new.target_id;
  if coalesce(quiere_notif, true) then
    insert into notifications (user_id, type, actor_id)
      values (new.target_id, 'follow_request', new.requester_id);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function notify_shared_title() returns trigger as $$
declare
  quiere_notif boolean;
begin
  select notify_messages into quiere_notif from profiles where id = new.receiver_id;
  if coalesce(quiere_notif, true) then
    insert into notifications (user_id, type, actor_id, target_type, target_id)
      values (new.receiver_id, 'shared_title', new.sender_id, 'shared_title_thread', new.id::text);
  end if;
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- DESCUBRIR — "lo más visto", "visto por amigos" y "lo más añadido" son
-- rankings agregados de TODOS los usuarios (o de a quiénes seguís), así que
-- necesitan `security definer` para poder contar filas de otros usuarios
-- sin que la RLS de user_movies/user_episodes_watched/user_series lo
-- bloquee. Solo devuelven conteos agregados por tmdb_id, nunca quién vio
-- qué — no filtran datos personales de nadie.
-- ============================================================
create or replace function mas_vistas_peliculas(pagina int, por_pagina int default 20)
returns table(tmdb_id int, cantidad bigint) as $$
  select movie_tmdb_id, count(*) as cantidad
  from user_movies
  where watched = true
  group by movie_tmdb_id
  order by cantidad desc, movie_tmdb_id
  limit por_pagina offset (pagina - 1) * por_pagina;
$$ language sql stable security definer set search_path = public;
grant execute on function mas_vistas_peliculas(int, int) to authenticated;

create or replace function mas_vistas_series(pagina int, por_pagina int default 20)
returns table(tmdb_id int, cantidad bigint) as $$
  select series_tmdb_id, count(distinct user_id) as cantidad
  from user_episodes_watched
  group by series_tmdb_id
  order by cantidad desc, series_tmdb_id
  limit por_pagina offset (pagina - 1) * por_pagina;
$$ language sql stable security definer set search_path = public;
grant execute on function mas_vistas_series(int, int) to authenticated;

create or replace function mas_agregadas_peliculas(pagina int, por_pagina int default 20)
returns table(tmdb_id int, cantidad bigint) as $$
  select movie_tmdb_id, count(*) as cantidad
  from user_movies
  group by movie_tmdb_id
  order by cantidad desc, movie_tmdb_id
  limit por_pagina offset (pagina - 1) * por_pagina;
$$ language sql stable security definer set search_path = public;
grant execute on function mas_agregadas_peliculas(int, int) to authenticated;

create or replace function mas_agregadas_series(pagina int, por_pagina int default 20)
returns table(tmdb_id int, cantidad bigint) as $$
  select series_tmdb_id, count(*) as cantidad
  from user_series
  group by series_tmdb_id
  order by cantidad desc, series_tmdb_id
  limit por_pagina offset (pagina - 1) * por_pagina;
$$ language sql stable security definer set search_path = public;
grant execute on function mas_agregadas_series(int, int) to authenticated;

create or replace function vistas_por_amigos_peliculas(p_user_id uuid, pagina int, por_pagina int default 20)
returns table(tmdb_id int, cantidad bigint) as $$
  select um.movie_tmdb_id, count(*) as cantidad
  from user_movies um
  join follows f on f.followee_id = um.user_id
  where f.follower_id = p_user_id and um.watched = true
  group by um.movie_tmdb_id
  order by cantidad desc, um.movie_tmdb_id
  limit por_pagina offset (pagina - 1) * por_pagina;
$$ language sql stable security definer set search_path = public;
grant execute on function vistas_por_amigos_peliculas(uuid, int, int) to authenticated;

create or replace function vistas_por_amigos_series(p_user_id uuid, pagina int, por_pagina int default 20)
returns table(tmdb_id int, cantidad bigint) as $$
  select uew.series_tmdb_id, count(distinct uew.user_id) as cantidad
  from user_episodes_watched uew
  join follows f on f.followee_id = uew.user_id
  where f.follower_id = p_user_id
  group by uew.series_tmdb_id
  order by cantidad desc, uew.series_tmdb_id
  limit por_pagina offset (pagina - 1) * por_pagina;
$$ language sql stable security definer set search_path = public;
alter table profiles add column if not exists show_comments boolean default true;
alter table shared_title_replies add column if not exists gif_url text;

-- ============================================================
-- CHATS PERSISTENTES: antes cada "recomendación" armaba su propia
-- conversación aislada (shared_titles + shared_title_replies). Ahora hay UN
-- solo chat por par de personas, y cada recomendación es un mensaje más
-- adentro de ese chat (junto con los mensajes de texto sueltos).
-- ============================================================
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id) on delete cascade,
  user_b uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_a, user_b)
);
alter table chats enable row level security;
drop policy if exists "chats_select" on chats;
create policy "chats_select" on chats for select using (auth.uid() = user_a or auth.uid() = user_b);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  kind text check (kind in ('text', 'shared_title')) default 'text',
  content text check (content is null or char_length(content) <= 500),
  gif_url text,
  item_type text check (item_type in ('series', 'movie')),
  tmdb_id integer,
  created_at timestamptz default now()
);
alter table chat_messages enable row level security;
drop policy if exists "chat_messages_select" on chat_messages;
create policy "chat_messages_select" on chat_messages for select using (
  exists (select 1 from chats where chats.id = chat_messages.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
);
drop policy if exists "chat_messages_insert" on chat_messages;
create policy "chat_messages_insert" on chat_messages for insert with check (
  auth.uid() = sender_id
  and exists (select 1 from chats where chats.id = chat_messages.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
);

create table if not exists chat_reads (
  chat_id uuid references chats(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (chat_id, user_id)
);
alter table chat_reads enable row level security;
drop policy if exists "chat_reads_manage_own" on chat_reads;
-- FIX: antes esto era "for all using (auth.uid() = user_id)", así que nadie podía
-- ver el estado de lectura del OTRO participante del chat — ni al cargar la
-- pantalla ni en tiempo real (RLS también filtra los eventos de Realtime), por
-- eso las tildes de "leído" nunca se ponían violetas. Separamos: cualquiera de
-- los dos participantes del chat puede LEER las dos filas (la propia y la del
-- otro), pero solo puede escribir/editar la suya.
drop policy if exists "chat_reads_select_participantes" on chat_reads;
create policy "chat_reads_select_participantes" on chat_reads for select using (
  exists (select 1 from chats c where c.id = chat_reads.chat_id and (c.user_a = auth.uid() or c.user_b = auth.uid()))
);
drop policy if exists "chat_reads_write_own" on chat_reads;
create policy "chat_reads_write_own" on chat_reads for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "chat_reads_update_own" on chat_reads;
create policy "chat_reads_update_own" on chat_reads for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table chat_reads;
  end if;
exception when others then
  null; -- si la publicación no existe con ese nombre o ya está agregada de otra forma, no rompemos el resto del script
end $$;

-- Trae (o crea) el chat entre dos usuarios — normaliza el orden del par para
-- que nunca haya dos chats duplicados entre las mismas dos personas.
create or replace function obtener_o_crear_chat(otro_usuario uuid) returns uuid as $$
declare
  a uuid;
  b uuid;
  resultado uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if auth.uid() < otro_usuario then a := auth.uid(); b := otro_usuario; else a := otro_usuario; b := auth.uid(); end if;

  select id into resultado from chats where user_a = a and user_b = b;
  if resultado is null then
    insert into chats (user_a, user_b) values (a, b) returning id into resultado;
  end if;
  return resultado;
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function obtener_o_crear_chat(uuid) to authenticated;

-- Notificación por mensaje nuevo en un chat (respeta notify_messages).
create or replace function notify_chat_message() returns trigger as $$
declare
  destinatario uuid;
  quiere_notif boolean;
begin
  select case when chats.user_a = new.sender_id then chats.user_b else chats.user_a end into destinatario
    from chats where chats.id = new.chat_id;
  if destinatario is null then return new; end if;

  select notify_messages into quiere_notif from profiles where id = destinatario;
  if coalesce(quiere_notif, true) then
    insert into notifications (user_id, type, actor_id, target_type, target_id)
      values (destinatario, 'shared_title', new.sender_id, 'chat', new.chat_id::text);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_chat_message on chat_messages;
create trigger trg_notify_chat_message after insert on chat_messages
  for each row execute function notify_chat_message();

-- ============================================================
-- GRUPOS PRIVADOS: se pueden crear públicos (como hasta ahora) o privados
-- (hay que pedir permiso al creador para entrar).
-- ============================================================
alter table groups add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));

create table if not exists group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  requester_id uuid references profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now(),
  unique (group_id, requester_id)
);
alter table group_join_requests enable row level security;
drop policy if exists "group_join_requests_select" on group_join_requests;
create policy "group_join_requests_select" on group_join_requests for select using (
  auth.uid() = requester_id or exists (select 1 from groups where groups.id = group_join_requests.group_id and groups.creator_id = auth.uid())
);
drop policy if exists "group_join_requests_insert" on group_join_requests;
create policy "group_join_requests_insert" on group_join_requests for insert with check (auth.uid() = requester_id);
drop policy if exists "group_join_requests_update" on group_join_requests;
create policy "group_join_requests_update" on group_join_requests for update using (
  exists (select 1 from groups where groups.id = group_join_requests.group_id and groups.creator_id = auth.uid())
);
drop policy if exists "group_join_requests_delete" on group_join_requests;
create policy "group_join_requests_delete" on group_join_requests for delete using (
  auth.uid() = requester_id or exists (select 1 from groups where groups.id = group_join_requests.group_id and groups.creator_id = auth.uid())
);

-- Aceptar una solicitud: la mete como miembro y marca la solicitud como aceptada (todo junto, para el admin del grupo).
create or replace function aceptar_solicitud_grupo(p_request_id uuid) returns void as $$
declare
  v_group_id uuid;
  v_requester_id uuid;
begin
  select group_id, requester_id into v_group_id, v_requester_id from group_join_requests where id = p_request_id and status = 'pending';
  if v_group_id is null then
    raise exception 'Solicitud no encontrada o ya resuelta.';
  end if;
  if not exists (select 1 from groups where id = v_group_id and creator_id = auth.uid()) then
    raise exception 'No sos el admin de este grupo.';
  end if;

  insert into group_members (group_id, user_id) values (v_group_id, v_requester_id) on conflict do nothing;
  update group_join_requests set status = 'accepted' where id = p_request_id;
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function aceptar_solicitud_grupo(uuid) to authenticated;

-- ============================================================
-- FIX: aceptar una solicitud de seguimiento fallaba en silencio. La política
-- de "follows" solo permite insertar una fila donde auth.uid() = follower_id
-- (yo sigo a alguien) — pero al ACEPTAR una solicitud, quien ejecuta la
-- acción es el TARGET (a quien quieren seguir), no el requester. Esa fila
-- ("el otro me sigue a mí") nunca podía crearse por más que la UI dijera que
-- se había aceptado. Se resuelve igual que con los grupos: una función
-- security definer que hace el insert saltando la política.
-- ============================================================
create or replace function aceptar_solicitud_seguimiento(p_requester_id uuid) returns void as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  insert into follows (follower_id, followee_id) values (p_requester_id, auth.uid()) on conflict do nothing;
  update follow_requests set status = 'accepted' where requester_id = p_requester_id and target_id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function aceptar_solicitud_seguimiento(uuid) to authenticated;

-- ============================================================
-- MÉTRICAS PARA EL ADMIN: números generales de toda la app. Solo admin
-- puede llamarla (chequea is_admin adentro, no por RLS de cada tabla).
-- ============================================================
create or replace function obtener_metricas_admin() returns json as $$
declare
  resultado json;
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin = true) then
    raise exception 'Solo un admin puede ver las métricas.';
  end if;

  select json_build_object(
    'usuarios_totales', (select count(*) from profiles),
    'usuarios_nuevos_7_dias', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'usuarios_nuevos_30_dias', (select count(*) from profiles where created_at > now() - interval '30 days'),
    'usuarios_activos_7_dias', (select count(distinct id) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'usuarios_privados', (select count(*) from profiles where is_private = true),
    'usuarios_suspendidos', (select count(*) from profiles where suspended_until is not null and suspended_until > now()),
    'moderadores', (select count(*) from profiles where is_moderator = true),
    'peliculas_trackeadas', (select count(*) from user_movies),
    'series_seguidas', (select count(*) from user_series),
    'capitulos_marcados', (select count(*) from user_episodes_watched),
    'comentarios_totales', (select count(*) from comentarios),
    'comentarios_7_dias', (select count(*) from comentarios where created_at > now() - interval '7 days'),
    'grupos_totales', (select count(*) from groups),
    'grupos_publicos', (select count(*) from groups where visibility = 'public'),
    'grupos_privados', (select count(*) from groups where visibility = 'private'),
    'chats_totales', (select count(*) from chats),
    'mensajes_totales', (select count(*) from chat_messages),
    'denuncias_pendientes', (select count(*) from reports where status = 'pending'),
    'denuncias_totales', (select count(*) from reports),
    'bloqueos_totales', (select count(*) from blocks),
    'registros_por_dia', (
      select coalesce(json_agg(fila), '[]'::json) from (
        select to_char(d::date, 'YYYY-MM-DD') as dia, count(p.id) as cantidad
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        left join profiles p on p.created_at::date = d::date
        group by d
        order by d
      ) fila
    )
  ) into resultado;

  return resultado;
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function obtener_metricas_admin() to authenticated;

-- Publicar una LISTA propia en el Lobby (además de título/episodio).
alter table posts drop constraint if exists posts_item_type_check;
alter table posts add constraint posts_item_type_check check (item_type in ('series', 'movie', 'episode', 'list'));
alter table posts add column if not exists list_id uuid references lists(id) on delete cascade;
alter table posts alter column tmdb_id drop not null;

-- ============================================================
-- FIX: 'post' faltaba en los target_type permitidos de comentarios —
-- comentar un post del Lobby rompía por la constraint vieja.
-- ============================================================
alter table comentarios drop constraint if exists comentarios_target_type_check;
alter table comentarios add constraint comentarios_target_type_check check (target_type in ('series', 'movie', 'episode', 'group', 'post'));

alter table reports drop constraint if exists reports_target_type_check;
alter table reports add constraint reports_target_type_check check (target_type in ('comment', 'group', 'user', 'shared_title', 'post', 'list'));

-- Notificaciones de "hay comentarios nuevos" en un grupo (privado o público, con preferencia aparte cada uno).
alter table profiles add column if not exists notify_group_messages_private boolean default true;
alter table profiles add column if not exists notify_group_messages_public boolean default true;

create or replace function notify_group_message() returns trigger as $$
declare
  es_privado boolean;
  miembro record;
begin
  if new.target_type <> 'group' or new.group_id is null then return new; end if;

  select (visibility = 'private') into es_privado from groups where id = new.group_id;

  for miembro in
    select gm.user_id, p.notify_group_messages_private, p.notify_group_messages_public
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id = new.group_id and gm.user_id <> new.user_id
  loop
    if (es_privado and coalesce(miembro.notify_group_messages_private, true))
       or (not es_privado and coalesce(miembro.notify_group_messages_public, true)) then
      insert into notifications (user_id, type, actor_id, target_type, target_id)
        values (miembro.user_id, 'group_message', new.user_id, 'group', new.group_id::text);
    end if;
  end loop;

  return new;
exception
  when others then
    -- Si algo falla acá (por ejemplo, un esquema desactualizado), nunca tiene
    -- que impedir que el comentario/recomendación se guarde igual.
    raise warning 'notify_group_message falló: %', sqlerrm;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_group_message on comentarios;
create trigger trg_notify_group_message after insert on comentarios
  for each row when (new.parent_comment_id is null) execute function notify_group_message();

-- Recomendar una LISTA (no solo títulos/grupos) por chat o como comentario de grupo.
alter table chat_messages add column if not exists shared_list_id uuid references lists(id) on delete set null;
alter table comentarios add column if not exists shared_list_id uuid references lists(id) on delete set null;

-- Reacciones a un post del Lobby (mismo criterio que las de comentarios: manito/corazón/caritas).
create table if not exists post_reactions (
  user_id uuid references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);
alter table post_reactions enable row level security;
drop policy if exists "post_reactions_select" on post_reactions;
create policy "post_reactions_select" on post_reactions for select using (true);
drop policy if exists "post_reactions_manage_own" on post_reactions;
create policy "post_reactions_manage_own" on post_reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- LOBBY: publicaciones sobre una película, serie o capítulo. La visibilidad
-- se resuelve igual que el resto del perfil (público, o privado + lo ven
-- solo tus seguidores) — no se guarda una visibilidad aparte por post.
-- ============================================================
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  item_type text not null check (item_type in ('series', 'movie', 'episode')),
  tmdb_id integer not null, -- series o movie tmdb id (si es episodio, el tmdb id de la SERIE)
  season_number integer,
  episode_number integer,
  content text not null check (char_length(content) <= 2000),
  has_spoiler boolean not null default false,
  created_at timestamptz default now()
);
alter table posts enable row level security;

drop policy if exists "posts_select" on posts;
create policy "posts_select" on posts for select using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = posts.user_id and profiles.is_private = false)
  or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = posts.user_id)
);
drop policy if exists "posts_insert" on posts;
create policy "posts_insert" on posts for insert with check (auth.uid() = user_id);
drop policy if exists "posts_delete" on posts;
create policy "posts_delete" on posts for delete using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Mismo criterio anti-spam que comentarios: libre, salvo texto repetido.
create or replace function enforce_post_rate_limit() returns trigger as $$
declare
  repeticiones integer;
begin
  select count(*) into repeticiones
    from posts
    where user_id = new.user_id
      and created_at > now() - interval '1 hour'
      and lower(trim(content)) = lower(trim(new.content));
  if repeticiones >= 2 then
    raise exception 'Estás publicando el mismo texto varias veces. Cambiá el mensaje para poder publicar.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_post_rate_limit on posts;
create trigger trg_enforce_post_rate_limit before insert on posts
  for each row execute function enforce_post_rate_limit();

-- ============================================================
-- MODERACIÓN DENTRO DE UN GRUPO: silenciar (por tiempo, solo afecta a ESE
-- grupo) y expulsar (con reglas distintas según el grupo sea público o
-- privado — ver más abajo).
-- ============================================================
create table if not exists group_mutes (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  muted_until timestamptz, -- null = indefinido
  reason text,
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);
alter table group_mutes enable row level security;
drop policy if exists "group_mutes_select" on group_mutes;
create policy "group_mutes_select" on group_mutes for select using (
  auth.uid() = user_id or exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
);
drop policy if exists "group_mutes_manage_admin" on group_mutes;
create policy "group_mutes_manage_admin" on group_mutes for all using (
  exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
) with check (
  exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
);

-- Expulsión de un grupo PÚBLICO: queda bloqueado para siempre (no puede
-- volver a unirse ni comentar, aunque sí puede seguir viéndolo). De un grupo
-- PRIVADO, en cambio, no se guarda ban — simplemente se lo saca de
-- group_members y puede volver a mandar una solicitud de ingreso.
create table if not exists group_bans (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  reason text,
  created_at timestamptz default now(),
  primary key (group_id, user_id)
);
alter table group_bans enable row level security;
drop policy if exists "group_bans_select" on group_bans;
create policy "group_bans_select" on group_bans for select using (true); -- hace falta poder chequearlo desde cualquier lado (unirse, comentar)
drop policy if exists "group_bans_manage_admin" on group_bans;
create policy "group_bans_manage_admin" on group_bans for all using (
  exists (select 1 from groups where groups.id = group_bans.group_id and groups.creator_id = auth.uid())
) with check (
  exists (select 1 from groups where groups.id = group_bans.group_id and groups.creator_id = auth.uid())
);

-- Un usuario baneado de un grupo público no puede volver a unirse.
drop policy if exists "group_members_manage_own" on group_members;
drop policy if exists "group_members_delete_own" on group_members;
create policy "group_members_delete_own" on group_members for delete using (auth.uid() = user_id);
drop policy if exists "group_members_insert_own" on group_members;
create policy "group_members_insert_own" on group_members for insert with check (
  auth.uid() = user_id
  and not exists (select 1 from group_bans where group_bans.group_id = group_members.group_id and group_bans.user_id = auth.uid())
);

-- Un usuario baneado o silenciado (mute vigente) no puede comentar en ESE grupo.
drop policy if exists "comentarios_insert_auth" on comentarios;
create policy "comentarios_insert_auth" on comentarios for insert with check (
  auth.uid() = user_id
  and (
    target_type <> 'group'
    or (
      not exists (select 1 from group_bans where group_bans.group_id = comentarios.group_id and group_bans.user_id = auth.uid())
      and not exists (
        select 1 from group_mutes
        where group_mutes.group_id = comentarios.group_id
          and group_mutes.user_id = auth.uid()
          and (group_mutes.muted_until is null or group_mutes.muted_until > now())
      )
    )
  )
);

-- Notificaciones de moderación de grupo (silenciado / expulsado), con motivo opcional.
alter table notifications add column if not exists message text;
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (
  type in ('like', 'reply', 'follow', 'follow_request', 'shared_title', 'group_muted', 'group_removed', 'group_message', 'group_join_request', 'list_item_added', 'list_followed')
);

-- Comentario de "recomendación de grupo" — reutiliza la tabla comentarios,
-- solo que además de texto puede llevar de qué título se trata.
alter table comentarios add column if not exists shared_item_type text check (shared_item_type is null or shared_item_type in ('series', 'movie'));
alter table comentarios add column if not exists shared_tmdb_id integer;
alter table chat_messages add column if not exists shared_group_id uuid references groups(id) on delete set null;
alter table comentarios add column if not exists shared_group_id uuid references groups(id) on delete set null;

-- ============================================================
-- LECTURAS DE GRUPO: para el "circulito" de comentarios nuevos sin leer
-- en "Mis grupos".
-- ============================================================
create table if not exists group_reads (
  group_id uuid references groups(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (group_id, user_id)
);
alter table group_reads enable row level security;
drop policy if exists "group_reads_manage_own" on group_reads;
create policy "group_reads_manage_own" on group_reads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- IDIOMA DE LOS TÍTULOS: antes era un booleano (inglés/español), ahora es
-- un selector de idioma real e independiente del país (ver spec: brasilero
-- en portugués, estadounidense en inglés, etc). Migramos lo que había.
-- ============================================================
alter table profiles add column if not exists content_language text default 'es-419';
alter table profiles add column if not exists show_titles_in_own_language boolean default true;
update profiles set content_language = case when country = 'ES' then 'es-ES' else 'es-419' end
where content_language = 'en-US' and show_titles_in_spanish = true;

-- Ahora las tapas/banners de grupo salen de TMDB (mismo mecanismo que el
-- banner de perfil: buscás una película/serie y elegís uno de sus backdrops),
-- no de Unsplash. Ensanchamos el check para no romper filas viejas.
alter table groups drop constraint if exists groups_photo_source_check;
alter table groups add constraint groups_photo_source_check check (photo_source in ('unsplash', 'upload', 'tmdb'));

-- ============================================================
-- LISTAS: visibilidad por lista (antes eran 100% privadas) y "seguir" la
-- lista de otro usuario para que te aparezca en "Listas que sigues".
-- ============================================================
alter table lists add column if not exists visibility text not null default 'private' check (visibility in ('private', 'followers', 'public'));
alter table lists add column if not exists description text;

-- La política "lists_owner" ya cubre insert/update/delete/select del dueño.
-- Sumamos una política de SELECT adicional para que otros puedan ver listas
-- compartidas (públicas, o "solo seguidores" si te siguen a vos el dueño).
drop policy if exists "lists_select_shared" on lists;
create policy "lists_select_shared" on lists for select using (
  visibility = 'public'
  or (visibility = 'followers' and exists (select 1 from follows where follower_id = auth.uid() and followee_id = lists.user_id))
);

drop policy if exists "list_items_select_shared" on list_items;
create policy "list_items_select_shared" on list_items for select using (
  exists (
    select 1 from lists
    where lists.id = list_items.list_id
    and (
      lists.visibility = 'public'
      or (lists.visibility = 'followers' and exists (select 1 from follows where follower_id = auth.uid() and followee_id = lists.user_id))
    )
  )
);

create table if not exists list_follows (
  list_id uuid references lists(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  muted boolean default false, -- silenciar: no notificarme cuando el creador agrega títulos a esta lista
  created_at timestamptz default now(),
  primary key (list_id, user_id)
);
alter table list_follows enable row level security;
drop policy if exists "list_follows_select_all" on list_follows;
create policy "list_follows_select_all" on list_follows for select using (true);
drop policy if exists "list_follows_manage_own" on list_follows;
create policy "list_follows_manage_own" on list_follows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table list_follows add column if not exists muted boolean default false;

alter table lists add column if not exists mute_new_followers boolean default false; -- silenciar: no notificarme cuando alguien empieza a seguir esta lista

grant execute on function vistas_por_amigos_series(uuid, int, int) to authenticated;

-- ============================================================
-- BLOQUEOS: si A bloqueó a B (en cualquier dirección), B no puede seguir a
-- A, ni mandarle solicitud de seguimiento, ni compartirle un título.
-- ============================================================
create or replace function existe_bloqueo(a uuid, b uuid) returns boolean as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$ language sql stable;

drop policy if exists "follows_manage_own" on follows;
create policy "follows_manage_own" on follows for insert with check (
  auth.uid() = follower_id and not existe_bloqueo(follower_id, followee_id)
);

drop policy if exists "follow_requests_insert" on follow_requests;
create policy "follow_requests_insert" on follow_requests for insert with check (
  auth.uid() = requester_id and not existe_bloqueo(requester_id, target_id)
);

drop policy if exists "shared_titles_insert" on shared_titles;
create policy "shared_titles_insert" on shared_titles for insert with check (
  auth.uid() = sender_id and not existe_bloqueo(sender_id, receiver_id)
);

-- Como toda la app está en español, tiene más sentido que los títulos y
-- sinopsis vengan en español por defecto (antes había que activarlo a mano
-- en Ajustes). Cambiamos el default para cuentas nuevas, y actualizamos las
-- que ya existen y todavía tienen el valor de fábrica.
alter table profiles alter column show_titles_in_spanish set default true;
update profiles set show_titles_in_spanish = true where show_titles_in_spanish = false;

-- Foto de cada episodio (para mostrarla en la lista de episodios)
alter table episodes_cache add column if not exists still_path text;

-- Arreglo real del bug de "se queda cargando": user_episodes_watched no
-- tenía ninguna conexión directa con series_cache (solo indirecta, vía
-- episodes_cache), y el código sí necesitaba traer el nombre/poster de la
-- serie directamente desde ahí. Sin esta relación, Supabase no puede
-- resolver ese pedido y tira error en vez de datos.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_episodes_watched_series_cache_fkey'
  ) then
    alter table user_episodes_watched
      add constraint user_episodes_watched_series_cache_fkey
      foreign key (series_tmdb_id) references series_cache(tmdb_id) on delete cascade;
  end if;
end $$;

-- Orden manual de favoritos (para poder ordenarlos "a tu gusto", no solo
-- por fecha o alfabético).
alter table user_favorites add column if not exists order_index integer default 0;

-- Portada del perfil: antes solo guardábamos qué título elegiste y se
-- derivaba automáticamente SU backdrop por defecto (que ni siquiera era
-- un backdrop, era el poster). Ahora guardamos el banner específico que
-- elegiste, igual que cuando personalizás el banner de una serie/película.
alter table profiles add column if not exists cover_backdrop_path text;

-- Descripción y banner del grupo (antes solo había una foto cuadrada).
alter table groups add column if not exists description text;
alter table groups add column if not exists banner_url text;
alter table groups add column if not exists comments_suspended_until timestamptz;

-- Reacciones con emoji (antes solo había "me gusta" con corazón fijo).
alter table likes_comentario add column if not exists emoji text default '❤️';

-- ============================================================
-- GESTIÓN DE CHATS Y GRUPOS DESDE EL LADO DEL USUARIO (no moderación):
-- silenciar, vaciar, ocultar/eliminar, bloquear. Todo es "para mí", salvo
-- bloquear que sí afecta a los dos (nadie puede escribir mientras dure).
-- ============================================================
create table if not exists chat_user_state (
  user_id uuid references profiles(id) on delete cascade,
  chat_id uuid references chats(id) on delete cascade,
  silenced_until timestamptz, -- null + silenced_forever=false → no silenciado
  silenced_forever boolean not null default false,
  cleared_at timestamptz, -- mensajes de antes de esta fecha no se muestran (solo para este usuario)
  hidden_at timestamptz, -- si está seteado y no hay mensajes nuevos después, no aparece en la lista de chats
  created_at timestamptz default now(),
  primary key (user_id, chat_id)
);
alter table chat_user_state enable row level security;
drop policy if exists "chat_user_state_manage_own" on chat_user_state;
create policy "chat_user_state_manage_own" on chat_user_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists chat_blocks (
  chat_id uuid primary key references chats(id) on delete cascade,
  blocked_by uuid references profiles(id) on delete cascade,
  created_at timestamptz default now()
);
alter table chat_blocks enable row level security;
drop policy if exists "chat_blocks_select" on chat_blocks;
create policy "chat_blocks_select" on chat_blocks for select using (
  exists (select 1 from chats where chats.id = chat_blocks.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
);
drop policy if exists "chat_blocks_insert" on chat_blocks;
create policy "chat_blocks_insert" on chat_blocks for insert with check (
  auth.uid() = blocked_by and exists (select 1 from chats where chats.id = chat_blocks.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
);
drop policy if exists "chat_blocks_delete" on chat_blocks;
create policy "chat_blocks_delete" on chat_blocks for delete using (
  exists (select 1 from chats where chats.id = chat_blocks.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
);

-- Un chat bloqueado no deja mandar mensajes (a ninguno de los dos).
drop policy if exists "chat_messages_insert" on chat_messages;
create policy "chat_messages_insert" on chat_messages for insert with check (
  auth.uid() = sender_id
  and exists (select 1 from chats where chats.id = chat_messages.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
  and not exists (select 1 from chat_blocks where chat_blocks.chat_id = chat_messages.chat_id)
);

-- Silenciar un grupo (para mí, no le pega a nadie más).
create table if not exists group_silenced (
  user_id uuid references profiles(id) on delete cascade,
  group_id uuid references groups(id) on delete cascade,
  silenced_until timestamptz,
  silenced_forever boolean not null default false,
  created_at timestamptz default now(),
  primary key (user_id, group_id)
);
alter table group_silenced enable row level security;
drop policy if exists "group_silenced_manage_own" on group_silenced;
create policy "group_silenced_manage_own" on group_silenced for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Un mensaje de grupo no notifica a quien tiene el grupo silenciado (vigente).
create or replace function notify_group_message() returns trigger as $$
declare
  es_privado boolean;
  miembro record;
  silencio record;
begin
  if new.target_type <> 'group' or new.group_id is null then return new; end if;

  select (visibility = 'private') into es_privado from groups where id = new.group_id;

  for miembro in
    select gm.user_id, p.notify_group_messages_private, p.notify_group_messages_public
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id = new.group_id and gm.user_id <> new.user_id
  loop
    select * into silencio from group_silenced where group_id = new.group_id and user_id = miembro.user_id;
    if silencio is not null and (silencio.silenced_forever or (silencio.silenced_until is not null and silencio.silenced_until > now())) then
      continue; -- silenciado, no le mandamos notificación (pero el circulito de "no leído" sigue funcionando aparte)
    end if;

    if (es_privado and coalesce(miembro.notify_group_messages_private, true))
       or (not es_privado and coalesce(miembro.notify_group_messages_public, true)) then
      insert into notifications (user_id, type, actor_id, target_type, target_id)
        values (miembro.user_id, 'group_message', new.user_id, 'group', new.group_id::text);
    end if;
  end loop;

  return new;
exception
  when others then
    -- Si algo falla acá (por ejemplo, un esquema desactualizado), nunca tiene
    -- que impedir que el comentario/recomendación se guarde igual.
    raise warning 'notify_group_message falló: %', sqlerrm;
    return new;
end;
$$ language plpgsql;

-- Un mensaje de chat no notifica a quien tiene ESE chat silenciado (vigente).
create or replace function notify_chat_message() returns trigger as $$
declare
  destinatario uuid;
  quiere_notif boolean;
  silencio record;
  v_nombre text;
begin
  select case when chats.user_a = new.sender_id then chats.user_b else chats.user_a end into destinatario
    from chats where chats.id = new.chat_id;
  if destinatario is null then return new; end if;

  select * into silencio from chat_user_state where chat_id = new.chat_id and user_id = destinatario;
  if silencio is not null and (silencio.silenced_forever or (silencio.silenced_until is not null and silencio.silenced_until > now())) then
    return new; -- silenciado, no notifica
  end if;

  -- Si es una recomendación, buscamos el nombre de lo recomendado para que la
  -- notificación diga "te recomendó X" en vez de "te recomendó algo".
  if new.kind = 'shared_title' then
    if new.tmdb_id is not null and new.item_type = 'series' then
      if new.season_number is not null and new.episode_number is not null then
        select coalesce(sc.name, '') || ' — ' || coalesce(ec.name, 'T' || new.season_number || 'E' || new.episode_number) into v_nombre
          from series_cache sc
          left join episodes_cache ec on ec.series_tmdb_id = sc.tmdb_id and ec.season_number = new.season_number and ec.episode_number = new.episode_number
          where sc.tmdb_id = new.tmdb_id;
      else
        select name into v_nombre from series_cache where tmdb_id = new.tmdb_id;
      end if;
    elsif new.tmdb_id is not null and new.item_type = 'movie' then
      select title into v_nombre from movies_cache where tmdb_id = new.tmdb_id;
    elsif new.shared_group_id is not null then
      select name into v_nombre from groups where id = new.shared_group_id;
    elsif new.shared_list_id is not null then
      select title into v_nombre from lists where id = new.shared_list_id;
    end if;
  end if;

  select notify_messages into quiere_notif from profiles where id = destinatario;
  if coalesce(quiere_notif, true) then
    -- Si ya hay una notificación de este mismo chat sin leer, no creamos una
    -- nueva por cada mensaje (eso inundaría la campanita) — actualizamos esa
    -- misma para que quede como "te envió mensajes" (plural).
    if exists (
      select 1 from notifications
      where user_id = destinatario and type = 'shared_title' and target_type = 'chat' and target_id = new.chat_id::text and read = false
    ) then
      update notifications
        set message = '__MULTIPLE__', actor_id = new.sender_id, created_at = now()
        where user_id = destinatario and type = 'shared_title' and target_type = 'chat' and target_id = new.chat_id::text and read = false;
    else
      insert into notifications (user_id, type, actor_id, target_type, target_id, message)
        values (destinatario, 'shared_title', new.sender_id, 'chat', new.chat_id::text, v_nombre);
    end if;
  end if;
  return new;
exception
  when others then
    raise warning 'notify_chat_message falló: %', sqlerrm;
    return new;
end;
$$ language plpgsql;

-- Motivo categorizado + mensaje libre opcional para el admin, en cualquier denuncia.
alter table reports add column if not exists details text;

alter table profiles add column if not exists show_watch_time boolean default true;
-- Para el día de mañana que se arme algo de premium/verificado — no hace
-- nada todavía, arranca en false para todo el mundo.
alter table profiles add column if not exists is_premium boolean default false;
-- Para detectar cuentas creadas con Google (u otro OAuth) que se quedaron con
-- el nombre de usuario generado automático, para poder avisarles una vez que
-- lo cambien por uno propio.
alter table profiles add column if not exists username_placeholder boolean default false;
alter table profiles add column if not exists vio_aviso_username boolean default false;

-- Importación de TV Time en el servidor: el paso lento (buscar cada título
-- contra TMDB) corre en una Edge Function que sigue trabajando aunque el
-- usuario cierre la app o la mande a segundo plano — el cliente solo mira el
-- progreso de esta tabla (por polling o realtime), no hace el trabajo él.
create table if not exists tvtime_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'procesando' check (status in ('procesando', 'listo', 'error', 'aplicando', 'aplicando_error', 'aplicando_listo')),
  grupos jsonb not null, -- [{ nombreOriginal, tipo, registros: [...] }, ...] — lo que hay que buscar
  resultados jsonb not null default '[]'::jsonb, -- va acumulando los ResultadoMatch a medida que procesa
  procesados integer not null default 0,
  total integer not null default 0,
  -- Fase 2: una vez que el usuario confirmó todo (los automáticos + los que
  -- eligió a mano), esto guarda esa lista final para aplicarla del lado del
  -- servidor también — así, igual que la búsqueda, sigue sola aunque cierres
  -- la app o se vaya a segundo plano.
  confirmados jsonb not null default '[]'::jsonb, -- [{ resultado: ResultadoMatch, tmdbIdElegido }, ...]
  aplicados integer not null default 0,
  total_aplicar integer not null default 0,
  episodios_omitidos integer not null default 0, -- capítulos que no se pudieron guardar por no existir en el catálogo de TMDB
  episodios_omitidos_detalle jsonb not null default '[]'::jsonb, -- lista en texto de qué series/capítulos quedaron afuera, para mostrárselo al usuario
  idioma_usuario text not null default 'es-419', -- para la segunda búsqueda (además de inglés) y el idioma del título "entre paréntesis" que se muestra al elegir
  error_msg text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table tvtime_import_jobs enable row level security;
drop policy if exists "tvtime_import_jobs_own" on tvtime_import_jobs;
create policy "tvtime_import_jobs_own" on tvtime_import_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Por si la tabla ya existía de antes de este agregado (usuarios que ya
-- corrieron una versión anterior de schema.sql):
alter table tvtime_import_jobs drop constraint if exists tvtime_import_jobs_status_check;
alter table tvtime_import_jobs add constraint tvtime_import_jobs_status_check check (status in ('procesando', 'listo', 'error', 'aplicando', 'aplicando_error', 'aplicando_listo'));
alter table tvtime_import_jobs add column if not exists confirmados jsonb not null default '[]'::jsonb;
alter table tvtime_import_jobs add column if not exists aplicados integer not null default 0;
alter table tvtime_import_jobs add column if not exists total_aplicar integer not null default 0;
alter table tvtime_import_jobs add column if not exists episodios_omitidos integer not null default 0;
alter table tvtime_import_jobs add column if not exists idioma_usuario text not null default 'es-419';
alter table tvtime_import_jobs add column if not exists episodios_omitidos_detalle jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tvtime_import_jobs'
  ) then
    alter publication supabase_realtime add table tvtime_import_jobs;
  end if;
exception when others then
  null;
end $$;
create table if not exists chat_message_reactions (
  message_id uuid references chat_messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id)
);
alter table chat_message_reactions enable row level security;
drop policy if exists "chat_message_reactions_select" on chat_message_reactions;
create policy "chat_message_reactions_select" on chat_message_reactions for select using (
  exists (
    select 1 from chat_messages cm join chats c on c.id = cm.chat_id
    where cm.id = chat_message_reactions.message_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
  )
);
drop policy if exists "chat_message_reactions_insert" on chat_message_reactions;
create policy "chat_message_reactions_insert" on chat_message_reactions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "chat_message_reactions_delete" on chat_message_reactions;
create policy "chat_message_reactions_delete" on chat_message_reactions for delete using (auth.uid() = user_id);
drop policy if exists "chat_message_reactions_update" on chat_message_reactions;
create policy "chat_message_reactions_update" on chat_message_reactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Lavinola Recap: qué año ya vio el popup automático, y cuándo lo cerró
-- (para saber si todavía corresponde mostrar el cartelito en el perfil).
alter table profiles add column if not exists recap_year_shown integer;
alter table profiles add column if not exists recap_dismissed_at timestamptz;
alter table profiles add column if not exists favorite_quote text;

-- Storage para las imágenes del Lavinola Recap que se comparten en el Lobby.
insert into storage.buckets (id, name, public) values ('recap-images', 'recap-images', true) on conflict (id) do nothing;
drop policy if exists "recap_images_public_read" on storage.objects;
create policy "recap_images_public_read" on storage.objects for select using (bucket_id = 'recap-images');
drop policy if exists "recap_images_insert_auth" on storage.objects;
create policy "recap_images_insert_auth" on storage.objects for insert to authenticated with check (bucket_id = 'recap-images');

-- Un post puede ser directamente una imagen (por ahora, solo el Lavinola Recap) en vez de sobre un título/lista.
alter table posts alter column tmdb_id drop not null;
alter table posts add column if not exists image_url text;
alter table posts drop constraint if exists posts_item_type_check;
alter table posts add constraint posts_item_type_check check (item_type in ('series', 'movie', 'episode', 'list', 'recap'));

-- ============================================================
-- Editar / eliminar un mensaje de chat propio, dentro del primer minuto.
-- "Eliminar" es borrado suave: no se pierde la fila, solo se marca y se
-- oculta el contenido (así el otro ve "eliminó un mensaje", no un hueco).
-- ============================================================
alter table chat_messages add column if not exists edited_at timestamptz;
alter table chat_messages add column if not exists deleted boolean not null default false;

drop policy if exists "chat_messages_update_own_1min" on chat_messages;
drop policy if exists "chat_messages_update_own_1h" on chat_messages;
create policy "chat_messages_update_own_1h" on chat_messages for update
  using (auth.uid() = sender_id and created_at > now() - interval '1 hour')
  with check (auth.uid() = sender_id);

-- Cuántos usuarios en TODA la app tienen X película/serie en favoritos, y quiénes
-- son (solo los que permiten que se vean sus favoritas) — para el botón del
-- corazón en la ficha del título. SECURITY DEFINER a propósito: es una
-- estadística pública, no depende de a quién sigue el que mira.
create or replace function contar_favoritos_titulo(p_item_type text, p_tmdb_id integer) returns integer as $$
  select count(*)::integer from user_favorites where item_type = p_item_type and tmdb_id = p_tmdb_id;
$$ language sql security definer;

create or replace function listar_favoritos_titulo(p_item_type text, p_tmdb_id integer)
returns table (user_id uuid, username text, avatar_url text) as $$
  select p.id, p.username, p.avatar_url
  from user_favorites uf
  join profiles p on p.id = uf.user_id
  where uf.item_type = p_item_type
    and uf.tmdb_id = p_tmdb_id
    and (
      (p_item_type = 'series' and p.show_favorite_series)
      or (p_item_type = 'movie' and p.show_favorite_movies)
    )
  order by uf.added_at desc nulls last;
$$ language sql security definer;

grant execute on function contar_favoritos_titulo(text, integer) to authenticated;
grant execute on function listar_favoritos_titulo(text, integer) to authenticated;

-- Top mensual: los 30 títulos más agregados Y vistos por usuarios en los
-- últimos 30 días (para series, cada capítulo visto también suma), global o
-- filtrado por país. SECURITY DEFINER a propósito, es una estadística
-- pública agregada (no expone qué usuario hizo qué).
-- Promedio de puntuación de la comunidad de Lavinola para un conjunto de
-- películas (usada en "Lista pendiente" para ordenar por lo mejor puntuado
-- por todos los usuarios, no solo por vos).
create or replace function promedio_puntuacion_peliculas(p_tmdb_ids integer[])
returns table (tmdb_id integer, promedio numeric, cantidad integer) as $$
  select movie_tmdb_id as tmdb_id, round(avg(rating)::numeric, 1) as promedio, count(*)::integer as cantidad
  from user_movies
  where movie_tmdb_id = any(p_tmdb_ids) and rating is not null
  group by movie_tmdb_id;
$$ language sql security definer;

create or replace function top_titulos_mensual(p_item_type text, p_country text default null, p_genre_id integer default null)
returns table (tmdb_id integer, cantidad integer) as $$
  select t.tmdb_id, sum(t.puntos)::integer as cantidad from (
    -- películas: 1 punto por agregada, +1 extra si además está marcada como vista
    select um.movie_tmdb_id as tmdb_id, (1 + case when um.watched then 1 else 0 end) as puntos
      from user_movies um
      join profiles p on p.id = um.user_id
      join movies_cache mc on mc.tmdb_id = um.movie_tmdb_id
      where p_item_type = 'movie'
        and um.added_at > now() - interval '30 days'
        and (p_country is null or p.country = p_country)
        and (mc.release_date is null or mc.release_date <= current_date)
        and (p_genre_id is null or mc.genre_ids @> array[p_genre_id])
    union all
    -- series: 1 punto por agregada
    select us.series_tmdb_id as tmdb_id, 1 as puntos
      from user_series us
      join profiles p on p.id = us.user_id
      join series_cache sc on sc.tmdb_id = us.series_tmdb_id
      where p_item_type = 'series'
        and us.created_at > now() - interval '30 days'
        and (p_country is null or p.country = p_country)
        and (sc.first_air_date is null or sc.first_air_date <= current_date)
        and (p_genre_id is null or sc.genre_ids @> array[p_genre_id])
    union all
    -- series: 1 punto por cada capítulo visto en el período (así una serie con mucho consumo pesa más)
    select uew.series_tmdb_id as tmdb_id, 1 as puntos
      from user_episodes_watched uew
      join profiles p on p.id = uew.user_id
      join series_cache sc on sc.tmdb_id = uew.series_tmdb_id
      where p_item_type = 'series'
        and uew.watched_at > now() - interval '30 days'
        and (p_country is null or p.country = p_country)
        and (sc.first_air_date is null or sc.first_air_date <= current_date)
        and (p_genre_id is null or sc.genre_ids @> array[p_genre_id])
  ) t
  group by t.tmdb_id
  order by cantidad desc
  limit 30;
$$ language sql security definer;

drop function if exists top_titulos_mensual(text, text);
grant execute on function top_titulos_mensual(text, text, integer) to authenticated;

-- ============================================================
-- FIX: bug viejo — las políticas de user_series/user_movies/user_episodes_watched/
-- user_favorites solo dejaban leer al dueño, así que el perfil de OTRA persona
-- siempre se veía vacío (series, películas, favoritas) aunque el perfil fuera
-- público o la siguieras. Acá se agrega el mismo criterio que ya usan las listas:
-- público, o privado + lo seguís.
-- ============================================================
drop policy if exists "user_series_select_shared" on user_series;
create policy "user_series_select_shared" on user_series for select using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = user_series.user_id and profiles.is_private = false)
  or exists (select 1 from follows where follower_id = auth.uid() and followee_id = user_series.user_id)
);

drop policy if exists "user_movies_select_shared" on user_movies;
create policy "user_movies_select_shared" on user_movies for select using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = user_movies.user_id and profiles.is_private = false)
  or exists (select 1 from follows where follower_id = auth.uid() and followee_id = user_movies.user_id)
);

drop policy if exists "user_episodes_select_shared" on user_episodes_watched;
create policy "user_episodes_select_shared" on user_episodes_watched for select using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = user_episodes_watched.user_id and profiles.is_private = false)
  or exists (select 1 from follows where follower_id = auth.uid() and followee_id = user_episodes_watched.user_id)
);

drop policy if exists "user_favorites_select_shared" on user_favorites;
create policy "user_favorites_select_shared" on user_favorites for select using (
  auth.uid() = user_id
  or exists (select 1 from profiles where profiles.id = user_favorites.user_id and profiles.is_private = false)
  or exists (select 1 from follows where follower_id = auth.uid() and followee_id = user_favorites.user_id)
);

-- Recomendar un CAPÍTULO puntual (no toda la serie) por chat o en un grupo.
alter table chat_messages add column if not exists season_number integer;
alter table chat_messages add column if not exists episode_number integer;
alter table comentarios add column if not exists shared_season_number integer;
alter table comentarios add column if not exists shared_episode_number integer;

-- "No me interesa" en un post del Lobby: lo oculta ya mismo y es una señal
-- para mostrar menos posts de ese autor en "Para ti".
create table if not exists post_dismissed (
  user_id uuid references profiles(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);
alter table post_dismissed enable row level security;
drop policy if exists "post_dismissed_manage_own" on post_dismissed;
create policy "post_dismissed_manage_own" on post_dismissed for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
