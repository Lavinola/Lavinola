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

-- Trigger: mantiene reply_count actualizado en el padre DIRECTO (no
-- suma en toda la cadena de ancestros — cada comentario muestra solo la
-- cantidad de respuestas directas que tiene, no las de sus respuestas).
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

-- Faltaba el trigger simétrico para cuando se BORRA una respuesta — sin
-- esto, reply_count solo sumaba y nunca restaba, así que una respuesta
-- borrada dejaba el contador del padre inflado para siempre (por eso el
-- orden por relevancia podía dar resultados que no coincidían con lo que
-- se veía en pantalla en ese momento).
create or replace function decrement_reply_count() returns trigger as $$
begin
  if old.parent_comment_id is not null then
    update comentarios set reply_count = greatest(reply_count - 1, 0) where id = old.parent_comment_id;
  end if;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_decrement_reply_count on comentarios;
create trigger trg_decrement_reply_count after delete on comentarios
  for each row execute function decrement_reply_count();

-- Recalcula reply_count de una sola vez para lo que ya estaba mal contado
-- de antes de este arreglo (respuestas borradas antes de hoy, que dejaron
-- el contador de su padre inflado).
update comentarios c
set reply_count = (select count(*) from comentarios r where r.parent_comment_id = c.id)
where reply_count <> (select count(*) from comentarios r where r.parent_comment_id = c.id);

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

-- Comentarios: lectura pública salvo que esté oculto por un reporte en
-- revisión, solo el autor (o un admin de la app) edita/borra el propio,
-- cualquiera autenticado postea
alter table comentarios add column if not exists oculto_por_reporte boolean not null default false;
drop policy if exists "comentarios_select_all" on comentarios;
create policy "comentarios_select_all" on comentarios for select using (
  not oculto_por_reporte
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);
drop policy if exists "comentarios_insert_auth" on comentarios;
create policy "comentarios_insert_auth" on comentarios for insert with check (auth.uid() = user_id);
drop policy if exists "comentarios_delete_own" on comentarios;
create policy "comentarios_delete_own" on comentarios for delete using (
  auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

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
-- Se reemplazó el selector de "cuánto antes avisar" (10min/1hora/1dia) por
-- este interruptor simple — no tenemos forma de saber la hora exacta en
-- que se estrena un capítulo (ver notas en episode-reminders), así que no
-- tenía sentido prometer un aviso "10 minutos antes". La columna vieja
-- queda sin usar, no hace falta borrarla.
alter table profiles add column if not exists notify_new_releases boolean default true;
alter table profiles add column if not exists haptics_enabled boolean default true;
-- Zona horaria (identificador IANA, ej "America/Argentina/Buenos_Aires")
-- — se pone sola según el país elegido, pero se puede cambiar a mano
-- (útil para países con varias zonas horarias). La usa
-- episode-reminders para avisar los estrenos a las 10am de CADA usuario,
-- no a una hora fija para todo el mundo.
alter table profiles add column if not exists timezone text;
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

-- El comentario PUNTUAL sobre el que pasó la notificación (a cuál le
-- dieron like, o cuál recibió una respuesta) — separado de target_type/
-- target_id, que indican DÓNDE está el hilo (grupo/serie/película), no
-- CUÁL comentario. Sirve para poder resaltarlo en pantalla al entrar
-- desde la notificación, en vez de solo llevar al hilo en general.
alter table notifications add column if not exists comment_id uuid;

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
    insert into notifications (user_id, type, actor_id, target_type, target_id, comment_id)
      values (autor_id, 'like', new.user_id, 'comment', new.comment_id::text, new.comment_id);
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

-- Solicitud de seguimiento (perfil privado) -> avisa al destino.
-- Cuando la acepta -> avisa a quien la mandó ("fulano aceptó tu solicitud").
-- Antes esto insertaba SIEMPRE una notificación de "nueva solicitud" al
-- destino, hasta cuando en realidad se estaba ACEPTANDO — le llegaba una
-- notificación repetida y encima a la persona equivocada.
create or replace function notify_follow_request() returns trigger as $$
begin
  if TG_OP = 'INSERT' and new.status = 'pending' then
    insert into notifications (user_id, type, actor_id)
      values (new.target_id, 'follow_request', new.requester_id);
  elsif TG_OP = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into notifications (user_id, type, actor_id, target_type, target_id)
      values (new.requester_id, 'follow_accepted', new.target_id, 'user', new.target_id::text);
  end if;
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
  username_de_email text;
  es_placeholder boolean;
  idioma_elegido text;
  mostrar_en_propio boolean;
  avatar_generado text;
  estilo_avatar text;
begin
  es_placeholder := new.raw_user_meta_data->>'username' is null;

  -- Si no vino un username elegido a mano (típicamente porque entró con
  -- Google, que no pasa por la pantalla de "elegí tu usuario"), usamos lo
  -- que esté antes de la arroba de su email como punto de partida — así
  -- "mauro123@gmail.com" arranca como "@mauro123" en vez de un
  -- "@usuario_a1b2c3d4" random. Se limpia para que respete las mismas
  -- reglas que ya se validan del lado del cliente (minúsculas, números,
  -- puntos y guiones bajos).
  username_de_email := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), ''), '[^a-z0-9._]', '', 'g'));
  username_deseado := coalesce(
    new.raw_user_meta_data->>'username',
    nullif(username_de_email, ''),
    'usuario_' || substr(new.id::text, 1, 8)
  );

  idioma_elegido := coalesce(new.raw_user_meta_data->>'content_language', 'es-419');
  -- Mismo criterio que al cambiarlo después en Ajustes: español latino e
  -- italiano arrancan con "mostrar en tu idioma" apagado (títulos en
  -- inglés por defecto); español de España e inglés arrancan prendido.
  mostrar_en_propio := idioma_elegido not in ('es-419', 'it-IT');

  -- Avatar de arranque: mientras no suba una foto propia, en vez de
  -- quedar en negro/vacío, se le pone un avatar random (colores/formas,
  -- sin fotos de gente ni nada por el estilo) — servicio gratis, sin
  -- necesidad de subir ni guardar nada nuestro, se genera solo.
  estilo_avatar := (array['bottts-neutral', 'critters', 'sprouts', 'moods'])[1 + floor(random() * 4)::int];
  avatar_generado := 'https://api.dicebear.com/10.x/' || estilo_avatar || '/png?seed=' || username_deseado;

  begin
    insert into public.profiles (id, username, country, content_language, show_titles_in_own_language, username_placeholder, avatar_url)
    values (new.id, username_deseado, new.raw_user_meta_data->>'country', idioma_elegido, mostrar_en_propio, es_placeholder, avatar_generado)
    on conflict (id) do nothing;
  exception when unique_violation then
    -- El chequeo de disponibilidad del cliente es la primera barrera, pero
    -- por las dudas dos altas caigan justo al mismo tiempo con el mismo
    -- username, no dejamos que reviente el alta de la cuenta: le agregamos
    -- un sufijo random y seguimos. El usuario puede cambiarlo después.
    username_deseado := username_deseado || '_' || substr(new.id::text, 1, 4);
    avatar_generado := 'https://api.dicebear.com/10.x/' || estilo_avatar || '/png?seed=' || username_deseado;
    insert into public.profiles (id, username, country, content_language, show_titles_in_own_language, username_placeholder, avatar_url)
    values (new.id, username_deseado, new.raw_user_meta_data->>'country', idioma_elegido, mostrar_en_propio, es_placeholder, avatar_generado)
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
  primary key (user_id, target_type, target_id, mood)
);
-- Antes se podía elegir un solo "cómo te sentiste" por título (la clave
-- primaria no incluía "mood"). Ahora se permiten hasta 2 (se controla
-- desde el código en moods.ts, no acá) — por eso "mood" pasa a formar
-- parte de la clave primaria, así una misma persona puede tener más de
-- una fila para el mismo título, siempre que sean estados de ánimo
-- distintos entre sí.
alter table title_mood_reactions drop constraint if exists title_mood_reactions_pkey;
alter table title_mood_reactions add primary key (user_id, target_type, target_id, mood);
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
        insert into notifications (user_id, type, actor_id, target_type, target_id, comment_id, trigger_comment_id)
          values (autor_id, 'reply', new.user_id, new.target_type, new.target_id, new.parent_comment_id, new.id);
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
create policy "chats_select" on chats for select using (
  auth.uid() = user_a or auth.uid() = user_b
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  kind text check (kind in ('text', 'shared_title')) default 'text',
  content text check (content is null or char_length(content) <= 500),
  gif_url text,
  item_type text check (item_type in ('series', 'movie')),
  tmdb_id integer,
  has_spoiler boolean not null default false,
  created_at timestamptz default now()
);
alter table chat_messages add column if not exists has_spoiler boolean not null default false;
alter table chat_messages enable row level security;
drop policy if exists "chat_messages_select" on chat_messages;
create policy "chat_messages_select" on chat_messages for select using (
  exists (select 1 from chats where chats.id = chat_messages.chat_id and (chats.user_a = auth.uid() or chats.user_b = auth.uid()))
  or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
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

-- IMPORTANTE: chat_messages y chat_message_reactions nunca se habían
-- agregado acá — por eso la actualización en vivo del chat (la
-- suscripción que ya existía en el código de la app) nunca recibía
-- ningún aviso real cuando llegaba un mensaje nuevo o alguien
-- recomendaba algo, aunque el código estuviera bien armado. Sin esto en
-- la publicación de Supabase, no hay forma de que el chat se actualice
-- solo — recién se veía al volver a entrar a la pantalla desde cero.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table chat_messages;
  end if;
exception when others then
  null;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_message_reactions'
  ) then
    alter publication supabase_realtime add table chat_message_reactions;
  end if;
exception when others then
  null;
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
alter table comentarios add constraint comentarios_target_type_check check (target_type in ('series', 'movie', 'episode', 'group', 'post', 'poll'));

-- Reacciones a una encuesta (igual que las de un post del Lobby) y sus
-- respuestas/comentarios (reusando la tabla de comentarios de siempre,
-- con target_type='poll' — mismo mecanismo que ya usan los posts).
create table if not exists poll_reactions (
  user_id uuid references profiles(id) on delete cascade,
  poll_id uuid references polls(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (user_id, poll_id)
);
alter table poll_reactions enable row level security;
drop policy if exists "poll_reactions_select" on poll_reactions;
create policy "poll_reactions_select" on poll_reactions for select using (true);
drop policy if exists "poll_reactions_manage_own" on poll_reactions;
create policy "poll_reactions_manage_own" on poll_reactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table reports drop constraint if exists reports_target_type_check;
alter table reports add constraint reports_target_type_check check (target_type in ('comment', 'group', 'user', 'shared_title', 'post', 'list', 'poll'));

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
    if exists (
      select 1 from group_silenced
      where group_silenced.group_id = new.group_id and group_silenced.user_id = miembro.user_id
        and (group_silenced.silenced_forever or (group_silenced.silenced_until is not null and group_silenced.silenced_until > now()))
    ) then
      continue; -- tiene el grupo silenciado, no le avisamos
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

drop trigger if exists trg_notify_group_message on comentarios;
create trigger trg_notify_group_message after insert on comentarios
  for each row when (new.parent_comment_id is null) execute function notify_group_message();

-- Una encuesta nueva en el grupo avisa a los miembros, igual que
-- cualquier mensaje/comentario nuevo (mismo criterio de silenciado y de
-- preferencias de notificación de grupos privados/públicos).
create or replace function notify_poll() returns trigger as $$
declare
  es_privado boolean;
  miembro record;
begin
  if new.group_id is null then return new; end if; -- encuesta del Lobby, no de un grupo — no hay a quién avisarle acá

  select (visibility = 'private') into es_privado from groups where id = new.group_id;

  for miembro in
    select gm.user_id, p.notify_group_messages_private, p.notify_group_messages_public
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id = new.group_id and gm.user_id <> new.user_id
  loop
    if exists (
      select 1 from group_silenced
      where group_silenced.group_id = new.group_id and group_silenced.user_id = miembro.user_id
        and (group_silenced.silenced_forever or (group_silenced.silenced_until is not null and group_silenced.silenced_until > now()))
    ) then
      continue;
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
    raise warning 'notify_poll falló: %', sqlerrm;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_poll on polls;
create trigger trg_notify_poll after insert on polls
  for each row execute function notify_poll();

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

-- Un comentario escrito desde la ficha de una película/serie/capítulo
-- (no desde el botón de compartir/publicar del Lobby) es siempre público
-- para cualquiera que entre a esa ficha, sin importar si quien lo escribió
-- tiene el perfil privado — es la misma regla que ya tenían los
-- comentarios de toda la vida. Independiente de esto, "mostrar_en_lobby"
-- controla si ADEMÁS aparece navegando el feed general del Lobby (eso sí
-- respeta la privacidad de quien lo escribió, salvo que haya elegido
-- publicarlo ahí a propósito).
alter table posts add column if not exists es_comentario_de_titulo boolean not null default false;
alter table posts add column if not exists mostrar_en_lobby boolean not null default true;

drop policy if exists "posts_select" on posts;
create policy "posts_select" on posts for select using (
  auth.uid() = user_id
  or es_comentario_de_titulo = true
  or exists (select 1 from profiles where profiles.id = posts.user_id and profiles.is_private = false)
  or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = posts.user_id)
);
drop policy if exists "posts_insert" on posts;
create policy "posts_insert" on posts for insert with check (auth.uid() = user_id);
drop policy if exists "posts_update" on posts;
create policy "posts_update" on posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
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

-- ============================================================
-- Notificar reacciones (con emoji) en posts y comentarios.
-- Reusamos la columna "message" de notifications para guardar el emoji
-- (ya se usaba así para otros tipos, tipo el nombre de una lista) — no hace
-- falta una columna nueva.
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
      insert into notifications (user_id, type, actor_id, target_type, target_id, message, comment_id)
        values (autor_id, 'like', new.user_id, 'comment', new.comment_id::text, new.emoji, new.comment_id);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function notify_post_reaction() returns trigger as $$
declare
  autor_id uuid;
  quiere_notif boolean;
begin
  select user_id into autor_id from posts where id = new.post_id;
  if autor_id is not null and autor_id <> new.user_id then
    select notify_likes into quiere_notif from profiles where id = autor_id;
    if coalesce(quiere_notif, true) then
      insert into notifications (user_id, type, actor_id, target_type, target_id, message)
        values (autor_id, 'like', new.user_id, 'post', new.post_id::text, new.emoji);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_notify_post_reaction on post_reactions;
create trigger trg_notify_post_reaction after insert on post_reactions
  for each row execute function notify_post_reaction();

-- ============================================================
-- Insignias: puntos de actividad para calcular el nivel del usuario.
-- Pesos: película vista = 3, capítulo visto = 1, comentario/post = 5.
-- Un "comentario" que cuenta es uno de nivel raíz (no respuesta a otro
-- comentario) hecho en la ficha de una película/serie/capítulo — comentar
-- un post del Lobby, o responder cualquier comentario, NO suma (a
-- propósito: lo que se busca es que se generen posts/comentarios nuevos en
-- el Lobby, no que se infle el contador respondiendo cosas ya existentes).
-- Publicar un post en el Lobby sí suma (es la acción que se quiere fomentar).
-- ============================================================
create or replace function calcular_puntos_insignias(p_user_id uuid) returns integer as $$
declare
  puntos integer;
begin
  select
    coalesce((select count(*) from user_movies where user_id = p_user_id and watched = true), 0) * 3
    + coalesce((select count(*) from user_episodes_watched where user_id = p_user_id), 0) * 1
    + coalesce(
        (select count(*) from comentarios where user_id = p_user_id and parent_comment_id is null and target_type in ('series', 'movie', 'episode')),
        0
      ) * 5
    + coalesce((select count(*) from posts where user_id = p_user_id), 0) * 5
  into puntos;
  return puntos;
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function calcular_puntos_insignias(uuid) to authenticated;

-- Último nivel de insignia que el usuario ya vio en la animación de "subiste
-- de nivel" — así, si alguien ya tenía puntos de antes (por haber usado la
-- app antes de que existiera esto), o si un import masivo de TV Time le hace
-- saltar varios niveles de una, la próxima vez que abra la app le mostramos
-- la animación una sola vez con el nivel correcto, no la repetimos ni la
-- salteamos.
alter table profiles add column if not exists ultimo_nivel_insignia_visto integer not null default 0;

-- ============================================================
-- "¿Qué vemos?": el resultado se guarda como un mensaje de chat normal
-- (kind='shared_title', con item_type/tmdb_id como cualquier recomendación)
-- pero marcado aparte, para que en la pantalla se muestre distinto —
-- centrado, en violeta más brillante, con "Hoy vemos:" / "Hoy empezamos:"
-- en vez de "Te recomendó" / "Recomendaste".
-- ============================================================
alter table chat_messages add column if not exists es_que_vemos boolean not null default false;

-- ============================================================
-- Publicar un grupo PÚBLICO en el Lobby (igual que ya se puede con una
-- lista propia) — solo grupos públicos, eso se controla del lado de la app.
-- ============================================================
alter table posts add column if not exists group_id uuid references groups(id) on delete cascade;
alter table posts drop constraint if exists posts_item_type_check;
alter table posts add constraint posts_item_type_check check (item_type in ('series', 'movie', 'episode', 'list', 'recap', 'group'));

-- ============================================================
-- Director (solo películas) y elenco principal (películas y series) —
-- guardados al sincronizar, para poder calcular "actor que más se repite" y
-- "director favorito" en Estadísticas sin pegarle a TMDB por cada título
-- del usuario cada vez que entra a esa pantalla.
-- ============================================================
alter table movies_cache add column if not exists director text;
alter table movies_cache add column if not exists cast_top jsonb;
alter table series_cache add column if not exists cast_top jsonb;
-- El nombre del director solo no alcanza para poder navegar a su ficha
-- (como al tocar un actor) — hace falta su ID de TMDB.
alter table movies_cache add column if not exists director_id integer;

-- ============================================================
-- Responder a un mensaje puntual en el chat (como en WhatsApp).
-- ============================================================
alter table chat_messages add column if not exists reply_to_id uuid references chat_messages(id) on delete set null;

-- ============================================================
-- Perfiles con más seguidores — para completar la lista de "usuarios
-- recomendados" cuando no alcanzan las coincidencias por seguidores/
-- siguiendo en común o gustos. Se cuenta directo con SQL (en vez de traer
-- todas las filas de follows a la app y contarlas ahí) para que sea rápido
-- incluso con muchos usuarios.
-- ============================================================
create or replace function usuarios_mas_seguidos(p_excluir uuid[], p_limite int)
returns table (id uuid, cantidad_seguidores bigint) as $$
  select followee_id as id, count(*) as cantidad_seguidores
  from follows
  where followee_id != all(p_excluir)
  group by followee_id
  order by cantidad_seguidores desc
  limit p_limite;
$$ language sql stable;

-- ============================================================
-- ¿Qué vemos? en grupos — mismo mecanismo que en el chat privado, pero
-- como comentario especial en vez de mensaje de chat.
-- ============================================================
alter table comentarios add column if not exists es_que_vemos boolean not null default false;

-- Solo se usa por ahora al recomendar un título a un grupo (recomendarEnGrupo)
-- — igual que en los posts del Lobby, si se marca, el texto queda tapado
-- detrás de un botón de "Ver spoiler" hasta que alguien lo toca.
alter table comentarios add column if not exists has_spoiler boolean not null default false;

-- ============================================================
-- Encuestas dentro de un grupo — pregunta (texto y/o título vinculado)
-- + de 2 a 8 opciones (cada una también texto y/o título), con la
-- posibilidad de permitir una sola respuesta por usuario o varias.
-- ============================================================
create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade, -- null = encuesta del Lobby, no de un grupo puntual
  user_id uuid not null references profiles(id) on delete cascade,
  question_text text,
  question_item_type text check (question_item_type in ('series', 'movie', 'episode')),
  question_tmdb_id integer,
  question_season_number integer,
  question_episode_number integer,
  allow_multiple boolean not null default true,
  created_at timestamptz not null default now(),
  constraint poll_question_no_vacia check (coalesce(trim(question_text), '') <> '' or question_tmdb_id is not null)
);
alter table polls alter column group_id drop not null;

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  position integer not null,
  option_text text,
  item_type text check (item_type in ('series', 'movie', 'episode')),
  tmdb_id integer,
  season_number integer,
  episode_number integer,
  constraint poll_option_no_vacia check (coalesce(trim(option_text), '') <> '' or tmdb_id is not null)
);

create table if not exists poll_votes (
  poll_id uuid not null references polls(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);

create index if not exists idx_poll_options_poll on poll_options(poll_id);
create index if not exists idx_poll_votes_poll on poll_votes(poll_id);
create index if not exists idx_poll_votes_option on poll_votes(option_id);
create index if not exists idx_poll_votes_user on poll_votes(poll_id, user_id);

alter table polls enable row level security;
alter table poll_options enable row level security;
alter table poll_votes enable row level security;

-- Igual que con comentarios: si el admin de un grupo denuncia una encuesta
-- hecha DENTRO de su grupo, se oculta al toque hasta que un admin de la
-- app la revise (la borra, o descarta el reporte y vuelve a aparecer).
alter table polls add column if not exists oculto_por_reporte boolean not null default false;

drop policy if exists "polls_select" on polls;
create policy "polls_select" on polls for select using (
  (
    group_id is not null -- las de un grupo se ven igual que siempre
    or auth.uid() = user_id
    or exists (select 1 from profiles where profiles.id = polls.user_id and profiles.is_private = false)
    or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = polls.user_id)
  )
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and is_admin = true))
);
drop policy if exists "polls_insert" on polls;
create policy "polls_insert" on polls for insert with check (
  auth.uid() = user_id and (
    group_id is null or exists (select 1 from group_members where group_members.group_id = polls.group_id and group_members.user_id = auth.uid())
  )
);
drop policy if exists "polls_delete" on polls;
create policy "polls_delete" on polls for delete using (auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and is_admin = true));

drop policy if exists "polls_update_moderacion" on polls;
create policy "polls_update_moderacion" on polls for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  or exists (select 1 from groups where groups.id = polls.group_id and groups.creator_id = auth.uid())
) with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  or exists (select 1 from groups where groups.id = polls.group_id and groups.creator_id = auth.uid())
);

drop policy if exists "poll_options_select" on poll_options;
create policy "poll_options_select" on poll_options for select using (true);
drop policy if exists "poll_options_insert" on poll_options;
create policy "poll_options_insert" on poll_options for insert with check (
  exists (select 1 from polls where polls.id = poll_options.poll_id and polls.user_id = auth.uid())
);

drop policy if exists "poll_votes_select" on poll_votes;
create policy "poll_votes_select" on poll_votes for select using (true);
drop policy if exists "poll_votes_insert" on poll_votes;
create policy "poll_votes_insert" on poll_votes for insert with check (
  auth.uid() = user_id and exists (
    select 1 from polls
    where polls.id = poll_votes.poll_id
      and (
        polls.group_id is null -- encuesta del Lobby: cualquiera logueado puede votar
        or exists (select 1 from group_members where group_members.group_id = polls.group_id and group_members.user_id = auth.uid())
      )
  )
);
drop policy if exists "poll_votes_delete" on poll_votes;
create policy "poll_votes_delete" on poll_votes for delete using (auth.uid() = user_id);

-- ============================================================
-- Si borrás un comentario/respuesta, cualquier notificación relacionada
-- (que a alguien le avisó "le gustó tu comentario" o "te respondieron")
-- se borra también — si no, queda una notificación "fantasma" que ya no
-- lleva a ningún lado y solo confunde.
-- ============================================================

-- Guarda cuál respuesta puntual generó la notificación de "te respondieron"
-- (comment_id ya guardaba a QUIÉN se le respondió, no la respuesta en sí).
alter table notifications add column if not exists trigger_comment_id uuid;

create or replace function borrar_notificaciones_de_comentario() returns trigger as $$
begin
  delete from notifications where comment_id = old.id or trigger_comment_id = old.id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_borrar_notificaciones_comentario on comentarios;
create trigger trg_borrar_notificaciones_comentario after delete on comentarios
  for each row execute function borrar_notificaciones_de_comentario();

-- Si sacás un "me gusta" de un comentario, se borra la notificación de ESE
-- like puntual (no las de otras personas que también reaccionaron a lo mismo).
create or replace function borrar_notificacion_de_like() returns trigger as $$
begin
  delete from notifications
    where type = 'like' and comment_id = old.comment_id and actor_id = old.user_id;
  return old;
end;
$$ language plpgsql;

drop trigger if exists trg_borrar_notificacion_like on likes_comentario;
create trigger trg_borrar_notificacion_like after delete on likes_comentario
  for each row execute function borrar_notificacion_de_like();

-- ============================================================
-- Si el ADMIN de un grupo denuncia un mensaje/comentario/respuesta DENTRO
-- de su propio grupo, ese contenido se oculta al toque (nadie más lo ve,
-- ver la política de select de arriba) hasta que un admin de la app lo
-- revise: si lo borra, desaparece para siempre; si descarta el reporte,
-- vuelve a aparecer donde estaba.
-- ============================================================
drop policy if exists "comentarios_update_moderacion" on comentarios;
create policy "comentarios_update_moderacion" on comentarios for update using (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  or exists (select 1 from groups where groups.id = comentarios.group_id and groups.creator_id = auth.uid())
) with check (
  exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  or exists (select 1 from groups where groups.id = comentarios.group_id and groups.creator_id = auth.uid())
);

-- ============================================================
-- Historial real de "vistas" — antes solo se guardaba la fecha de la
-- primera vez, la de la última, y un contador (times_watched), sin poder
-- saber ni tocar las fechas intermedias. Ahora cada visualización es su
-- propia fila, así se puede listar todas y borrar una puntual sin tocar
-- las demás. Las columnas viejas (first_watched_at/watched_at/times_watched
-- en user_movies y user_episodes_watched) se mantienen como una caché
-- rápida — se recalculan solas a partir de estos eventos cada vez que se
-- agrega o borra uno, así el resto de la app (estadísticas, listas, etc.)
-- sigue funcionando igual sin tener que tocar nada más.
-- ============================================================
create table if not exists movie_watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  movie_tmdb_id integer not null,
  watched_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_movie_watch_events on movie_watch_events(user_id, movie_tmdb_id);
alter table movie_watch_events enable row level security;
drop policy if exists "movie_watch_events_own" on movie_watch_events;
create policy "movie_watch_events_own" on movie_watch_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists episode_watch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  series_tmdb_id integer not null,
  season_number integer not null,
  episode_number integer not null,
  watched_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_episode_watch_events on episode_watch_events(user_id, series_tmdb_id, season_number, episode_number);
alter table episode_watch_events enable row level security;
drop policy if exists "episode_watch_events_own" on episode_watch_events;
create policy "episode_watch_events_own" on episode_watch_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Backfill: quienes ya tenían películas/capítulos marcados como vistos
-- ANTES de que existiera el historial por eventos no tenían ninguna fila
-- en movie_watch_events/episode_watch_events (esas tablas se crearon
-- vacías) — por eso el historial de abajo de la ficha aparecía vacío
-- aunque la película siguiera figurando como vista. Esto reconstruye un
-- evento por cada "primera vez" y, si la última vez fue una fecha
-- distinta, otro evento más para esa — usa "not exists" así es seguro
-- correrlo de nuevo sin duplicar nada.
-- ============================================================
insert into movie_watch_events (user_id, movie_tmdb_id, watched_at)
select user_id, movie_tmdb_id, first_watched_at
from user_movies
where watched = true and first_watched_at is not null
  and not exists (
    select 1 from movie_watch_events e where e.user_id = user_movies.user_id and e.movie_tmdb_id = user_movies.movie_tmdb_id
  );

insert into movie_watch_events (user_id, movie_tmdb_id, watched_at)
select user_id, movie_tmdb_id, watched_at
from user_movies
where watched = true and watched_at is not null and watched_at <> first_watched_at
  and not exists (
    select 1 from movie_watch_events e
    where e.user_id = user_movies.user_id and e.movie_tmdb_id = user_movies.movie_tmdb_id and e.watched_at = user_movies.watched_at
  );

insert into episode_watch_events (user_id, series_tmdb_id, season_number, episode_number, watched_at)
select user_id, series_tmdb_id, season_number, episode_number, coalesce(first_watched_at, watched_at)
from user_episodes_watched
where coalesce(first_watched_at, watched_at) is not null
  and not exists (
    select 1 from episode_watch_events e
    where e.user_id = user_episodes_watched.user_id and e.series_tmdb_id = user_episodes_watched.series_tmdb_id
      and e.season_number = user_episodes_watched.season_number and e.episode_number = user_episodes_watched.episode_number
  );

insert into episode_watch_events (user_id, series_tmdb_id, season_number, episode_number, watched_at)
select user_id, series_tmdb_id, season_number, episode_number, watched_at
from user_episodes_watched
where watched_at is not null and watched_at <> coalesce(first_watched_at, watched_at)
  and not exists (
    select 1 from episode_watch_events e
    where e.user_id = user_episodes_watched.user_id and e.series_tmdb_id = user_episodes_watched.series_tmdb_id
      and e.season_number = user_episodes_watched.season_number and e.episode_number = user_episodes_watched.episode_number
      and e.watched_at = user_episodes_watched.watched_at
  );

-- ============================================================
-- Recalcula last_watched_at de cada serie como el capítulo realmente más
-- reciente que se vio (antes, en algunos casos podía quedar con la fecha
-- de un capítulo puntual editado, no la del capítulo más nuevo de toda
-- la serie) — corrige cualquier desvío de una sola vez.
-- ============================================================
update user_series us
set last_watched_at = ultimo.watched_at
from (
  select user_id, series_tmdb_id, max(watched_at) as watched_at
  from user_episodes_watched
  group by user_id, series_tmdb_id
) ultimo
where us.user_id = ultimo.user_id and us.series_tmdb_id = ultimo.series_tmdb_id
  and (us.last_watched_at is distinct from ultimo.watched_at);

-- ============================================================
-- Limpieza única: "No visto, me equivoqué" (y sacar una película/serie
-- de tu lista) borraban el estado rápido pero no el historial de vistas
-- real — dejaba vistas "fantasma" que reaparecían si volvías a marcarlo
-- como visto más adelante. Esto borra cualquier vista fantasma que haya
-- quedado de antes de este arreglo (títulos que hoy figuran como NO
-- vistos pero todavía tenían eventos de vista colgados).
-- ============================================================
delete from movie_watch_events e
where not exists (
  select 1 from user_movies um where um.user_id = e.user_id and um.movie_tmdb_id = e.movie_tmdb_id and um.watched = true
);

delete from episode_watch_events e
where not exists (
  select 1 from user_episodes_watched uew
  where uew.user_id = e.user_id and uew.series_tmdb_id = e.series_tmdb_id
    and uew.season_number = e.season_number and uew.episode_number = e.episode_number
);

-- ============================================================
-- Guardados — posts del Lobby y comentarios (de detalles de título, y
-- respuestas dentro del Lobby) que el usuario quiere guardar para
-- después, sin depender de likes/reacciones (algo más privado, tipo
-- "guardado" de Instagram/X).
-- ============================================================
create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);
create index if not exists idx_saved_items_user on saved_items(user_id, created_at desc);
alter table saved_items enable row level security;
drop policy if exists "saved_items_own" on saved_items;
create policy "saved_items_own" on saved_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- La caché compartida de títulos (movies_cache/series_cache) guarda el
-- título/sinopsis en UN solo idioma a la vez, y antes solo se
-- refrescaba por antigüedad (cada 24hs) — si cambiabas el idioma de la
-- app, seguías viendo los títulos en el idioma anterior hasta que
-- pasaran esas 24hs, sin importar cuántas veces volvieras a entrar.
-- Guardamos en qué idioma se sincronizó cada título para poder detectar
-- ese desfasaje y forzar un refresco inmediato cuando no coincide.
-- ============================================================
alter table movies_cache add column if not exists synced_language text;
alter table series_cache add column if not exists synced_language text;

-- ============================================================
-- Configuración remota simple, para cosas que se quieren poder cambiar
-- sin publicar una versión nueva: por ahora, la versión mínima obligatoria
-- de la app (ver src/lib/appVersionCheck.ts) y el link a la tienda. El
-- valor por default de min_app_version es la versión actual del build, así
-- que arranca sin bloquear a nadie hasta que se suba a mano.
-- ============================================================
create table if not exists app_config (
  key text primary key,
  value text
);
alter table app_config enable row level security;
drop policy if exists "app_config_select_all" on app_config;
create policy "app_config_select_all" on app_config for select using (true);
insert into app_config (key, value) values ('min_app_version', '0.1.0') on conflict (key) do nothing;
insert into app_config (key, value) values ('store_url', '') on conflict (key) do nothing;

-- ============================================================
-- Aplica lo mismo de arriba (usuario derivado del mail, avatar de
-- colores por defecto) a cuentas que YA EXISTÍAN antes de este cambio —
-- pero solo toca lo que nunca se tocó:
--   · Usuario: solo si todavía tiene el random viejo "usuario_xxxxxxxx"
--     (a quien ya haya elegido/cambiado el suyo no le toca nada).
--   · Foto: solo si todavía no subió ninguna (avatar_url vacío).
-- Se puede correr de nuevo sin problema — la segunda vez no encuentra
-- nada para tocar, porque ya quedó todo actualizado.
-- ============================================================
do $$
declare
  r record;
  username_de_email text;
  nuevo_username text;
begin
  for r in
    select p.id, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.username like 'usuario\_%' escape '\'
  loop
    username_de_email := lower(regexp_replace(coalesce(split_part(r.email, '@', 1), ''), '[^a-z0-9._]', '', 'g'));
    if username_de_email = '' then
      continue; -- el mail no da para armar nada mejor, se deja el random como estaba
    end if;

    nuevo_username := username_de_email;
    begin
      update public.profiles set username = nuevo_username where id = r.id;
    exception when unique_violation then
      nuevo_username := username_de_email || '_' || substr(r.id::text, 1, 4);
      begin
        update public.profiles set username = nuevo_username where id = r.id;
      exception when unique_violation then
        -- no hubo forma ni con el sufijo (rarísimo) — se deja como estaba,
        -- no vale la pena romper nada por esto.
        null;
      end;
    end;
  end loop;
end $$;

update public.profiles
set avatar_url = 'https://api.dicebear.com/10.x/' || (array['bottts-neutral', 'critters', 'sprouts', 'moods'])[1 + floor(random() * 4)::int] || '/png?seed=' || username
where avatar_url is null or avatar_url = '' or avatar_url like 'https://api.dicebear.com/%';

-- ============================================================
-- BLOQUEO COMPLETO en posts/comentarios: si dos personas se bloquearon
-- (en cualquier dirección), ninguna ve los posts/comentarios de la otra,
-- y tampoco puede responder directo a un comentario suyo. Antes el
-- bloqueo solo cubría mensajes directos, seguir, y compartir un título —
-- esto lo extiende a los posts y comentarios, como corresponde.
-- ============================================================
drop policy if exists "posts_select" on posts;
create policy "posts_select" on posts for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (
    auth.uid() = user_id
    or es_comentario_de_titulo = true
    or exists (select 1 from profiles where profiles.id = posts.user_id and profiles.is_private = false)
    or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = posts.user_id)
  )
);

drop policy if exists "comentarios_select_all" on comentarios;
create policy "comentarios_select_all" on comentarios for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (
    not oculto_por_reporte
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  )
);

drop policy if exists "comentarios_insert_auth" on comentarios;
create policy "comentarios_insert_auth" on comentarios for insert with check (
  auth.uid() = user_id
  and (
    -- no responder directo a un comentario de alguien que te bloqueó (o bloqueaste)
    parent_comment_id is null
    or not exists (
      select 1 from comentarios padre
      where padre.id = comentarios.parent_comment_id and existe_bloqueo(auth.uid(), padre.user_id)
    )
  )
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

-- ============================================================
-- BLOQUEO en reacciones ("me gusta"): sin esto, alguien bloqueado podía
-- seguir reaccionando a tus comentarios/posts (aunque ya no los vea
-- listados en la app), y encima eso te seguía generando una notificación
-- — justo lo que bloquear a alguien debería evitar.
-- ============================================================
drop policy if exists "likes_manage_own" on likes_comentario;
create policy "likes_manage_own" on likes_comentario for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and not exists (
    select 1 from comentarios where comentarios.id = likes_comentario.comment_id and existe_bloqueo(auth.uid(), comentarios.user_id)
  )
);

drop policy if exists "post_reactions_manage_own" on post_reactions;
create policy "post_reactions_manage_own" on post_reactions for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and not exists (
    select 1 from posts where posts.id = post_reactions.post_id and existe_bloqueo(auth.uid(), posts.user_id)
  )
);

-- ============================================================
-- El bloqueo general de un usuario (desde su perfil, tabla "blocks") no
-- estaba conectado con los chats — solo existía un bloqueo aparte,
-- específico de un chat puntual (tabla "chat_blocks", una acción manual
-- distinta). Esto hacía que bloquear a alguien desde su perfil NO le
-- impidiera seguir mandándote mensajes directos. Ahora se revisan los dos.
-- ============================================================
drop policy if exists "chat_messages_insert" on chat_messages;
create policy "chat_messages_insert" on chat_messages for insert with check (
  auth.uid() = sender_id
  and exists (
    select 1 from chats
    where chats.id = chat_messages.chat_id
      and (chats.user_a = auth.uid() or chats.user_b = auth.uid())
      and not existe_bloqueo(chats.user_a, chats.user_b)
  )
  and not exists (select 1 from chat_blocks where chat_blocks.chat_id = chat_messages.chat_id)
);

-- ============================================================
-- BLOQUEO en seguir listas: mismo criterio que ya usamos para seguir
-- perfiles, reaccionar a comentarios/posts, etc. — si bloqueaste a
-- alguien, no debería poder seguir tus listas.
-- ============================================================
drop policy if exists "list_follows_manage_own" on list_follows;
create policy "list_follows_manage_own" on list_follows for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and not exists (
    select 1 from lists where lists.id = list_follows.list_id and existe_bloqueo(auth.uid(), lists.user_id)
  )
);

-- ============================================================
-- BLOQUEO en encuestas del Lobby: mismo criterio que ya aplicamos a
-- posts/comentarios — ver y votar una encuesta de alguien bloqueado
-- (o que te bloqueó) no debería ser posible. Las encuestas DE GRUPO no
-- se tocan acá — esas ya se rigen por si sos miembro del grupo o no,
-- igual que los comentarios de grupo.
-- ============================================================
drop policy if exists "polls_select" on polls;
create policy "polls_select" on polls for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (
    group_id is not null
    or auth.uid() = user_id
    or exists (select 1 from profiles where profiles.id = polls.user_id and profiles.is_private = false)
    or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = polls.user_id)
  )
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and is_admin = true))
);

drop policy if exists "poll_votes_insert" on poll_votes;
create policy "poll_votes_insert" on poll_votes for insert with check (
  auth.uid() = user_id and exists (
    select 1 from polls
    where polls.id = poll_votes.poll_id
      and not existe_bloqueo(auth.uid(), polls.user_id)
      and (
        polls.group_id is null
        or exists (select 1 from group_members where group_members.group_id = polls.group_id and group_members.user_id = auth.uid())
      )
  )
);

-- ============================================================
-- Ocultado automático por reporte, ahora también para POSTS del Lobby
-- (antes solo existía para comentarios y encuestas) — mismo criterio:
-- si el admin del grupo reporta un post DE SU GRUPO, se oculta al
-- instante hasta que un admin de la app lo revise.
-- ============================================================
alter table posts add column if not exists oculto_por_reporte boolean not null default false;

drop policy if exists "posts_select" on posts;
create policy "posts_select" on posts for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and is_admin = true))
  and (
    auth.uid() = user_id
    or es_comentario_de_titulo = true
    or exists (select 1 from profiles where profiles.id = posts.user_id and profiles.is_private = false)
    or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = posts.user_id)
  )
);

-- ============================================================
-- El rol de MODERADOR existe y se usa de verdad en la app (hay una
-- pantalla para asignarlo), pero la mayoría de estas políticas solo le
-- daban el poder extra a is_admin, dejando a los moderadores sin poder
-- resolver reportes ni ver/borrar el contenido oculto que reportan —
-- podían ver que el reporte existía, pero no hacer nada con él. Se
-- corrige acá, dándole a is_moderator el mismo poder que a is_admin en
-- todo lo que es moderación de contenido puntual (no en cosas más
-- sensibles como leer chats privados, anuncios oficiales, o métricas de
-- la app — esas quedan exclusivas del admin, a propósito).
-- ============================================================
drop policy if exists "reports_update_admin" on reports;
create policy "reports_update_admin" on reports for update using (
  exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

drop policy if exists "comentarios_delete_own" on comentarios;
create policy "comentarios_delete_own" on comentarios for delete using (
  auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

drop policy if exists "groups_update_own_or_admin" on groups;
create policy "groups_update_own_or_admin" on groups for update using (
  auth.uid() = creator_id or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);
drop policy if exists "groups_delete_own_or_admin" on groups;
create policy "groups_delete_own_or_admin" on groups for delete using (
  auth.uid() = creator_id or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

drop policy if exists "posts_delete" on posts;
create policy "posts_delete" on posts for delete using (
  auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

drop policy if exists "polls_delete" on polls;
create policy "polls_delete" on polls for delete using (
  auth.uid() = user_id or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

drop policy if exists "polls_update_moderacion" on polls;
create policy "polls_update_moderacion" on polls for update using (
  exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  or exists (select 1 from groups where groups.id = polls.group_id and groups.creator_id = auth.uid())
) with check (
  exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  or exists (select 1 from groups where groups.id = polls.group_id and groups.creator_id = auth.uid())
);

drop policy if exists "comentarios_update_moderacion" on comentarios;
create policy "comentarios_update_moderacion" on comentarios for update using (
  exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  or exists (select 1 from groups where groups.id = comentarios.group_id and groups.creator_id = auth.uid())
) with check (
  exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  or exists (select 1 from groups where groups.id = comentarios.group_id and groups.creator_id = auth.uid())
);

-- Ver contenido oculto por reporte (comentarios, posts, encuestas): antes
-- solo el admin lo podía ver mientras estaba oculto en revisión.
drop policy if exists "comentarios_select_all" on comentarios;
create policy "comentarios_select_all" on comentarios for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (
    not oculto_por_reporte
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  )
);

drop policy if exists "posts_select" on posts;
create policy "posts_select" on posts for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true)))
  and (
    auth.uid() = user_id
    or es_comentario_de_titulo = true
    or exists (select 1 from profiles where profiles.id = posts.user_id and profiles.is_private = false)
    or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = posts.user_id)
  )
);

drop policy if exists "polls_select" on polls;
create policy "polls_select" on polls for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (
    group_id is not null
    or auth.uid() = user_id
    or exists (select 1 from profiles where profiles.id = polls.user_id and profiles.is_private = false)
    or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = polls.user_id)
  )
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true)))
);

-- ============================================================
-- La suspensión de cuenta solo frenaba comentarios — a alguien suspendido
-- no le impedía nada publicar posts en el Lobby o mandar mensajes por
-- chat, esquivando la suspensión por completo. La función ya soporta
-- tablas con "user_id" o "sender_id" (se armó justo para esto), así que
-- solo hacía falta conectarla también acá.
-- ============================================================
drop trigger if exists trg_no_postear_suspendido on posts;
create trigger trg_no_postear_suspendido before insert on posts
  for each row execute function enforce_not_suspended();

drop trigger if exists trg_no_chatear_suspendido on chat_messages;
create trigger trg_no_chatear_suspendido before insert on chat_messages
  for each row execute function enforce_not_suspended();

drop trigger if exists trg_no_encuesta_suspendido on polls;
create trigger trg_no_encuesta_suspendido before insert on polls
  for each row execute function enforce_not_suspended();

-- ============================================================
-- Posts y encuestas de grupo: los posts ni siquiera revisaban que fueras
-- miembro del grupo (cualquiera podía publicar en cualquier grupo), y
-- las encuestas no revisaban baneos/silencios de grupo (solo comentarios
-- los tenía en cuenta). Mismo criterio que ya usa comentarios_insert_auth.
-- ============================================================
drop policy if exists "posts_insert" on posts;
create policy "posts_insert" on posts for insert with check (
  auth.uid() = user_id
  and (
    group_id is null
    or (
      exists (select 1 from group_members where group_members.group_id = posts.group_id and group_members.user_id = auth.uid())
      and not exists (select 1 from group_bans where group_bans.group_id = posts.group_id and group_bans.user_id = auth.uid())
      and not exists (
        select 1 from group_mutes
        where group_mutes.group_id = posts.group_id
          and group_mutes.user_id = auth.uid()
          and (group_mutes.muted_until is null or group_mutes.muted_until > now())
      )
    )
  )
);

drop policy if exists "polls_insert" on polls;
create policy "polls_insert" on polls for insert with check (
  auth.uid() = user_id
  and (
    group_id is null
    or (
      exists (select 1 from group_members where group_members.group_id = polls.group_id and group_members.user_id = auth.uid())
      and not exists (select 1 from group_bans where group_bans.group_id = polls.group_id and group_bans.user_id = auth.uid())
      and not exists (
        select 1 from group_mutes
        where group_mutes.group_id = polls.group_id
          and group_mutes.user_id = auth.uid()
          and (group_mutes.muted_until is null or group_mutes.muted_until > now())
      )
    )
  )
);

-- ============================================================
-- A la corrección anterior de comentarios_insert_auth (bloqueo + baneos)
-- le faltaba revisar que quien comenta en un grupo sea REALMENTE
-- miembro de ese grupo — sin esto, cualquiera podía comentar en
-- cualquier grupo, esté adentro o no.
-- ============================================================
drop policy if exists "comentarios_insert_auth" on comentarios;
create policy "comentarios_insert_auth" on comentarios for insert with check (
  auth.uid() = user_id
  and (
    parent_comment_id is null
    or not exists (
      select 1 from comentarios padre
      where padre.id = comentarios.parent_comment_id and existe_bloqueo(auth.uid(), padre.user_id)
    )
  )
  and (
    target_type <> 'group'
    or (
      exists (select 1 from group_members where group_members.group_id = comentarios.group_id and group_members.user_id = auth.uid())
      and not exists (select 1 from group_bans where group_bans.group_id = comentarios.group_id and group_bans.user_id = auth.uid())
      and not exists (
        select 1 from group_mutes
        where group_mutes.group_id = comentarios.group_id
          and group_mutes.user_id = auth.uid()
          and (group_mutes.muted_until is null or group_mutes.muted_until > now())
      )
    )
  )
);

-- Evita que alguien baneado de un grupo mande pedidos de unirse en bucle
-- (el ingreso real ya estaba protegido en group_members_insert_own, esto
-- es solo para no dejarlo ni siquiera mandar el pedido de entrada).
drop policy if exists "group_join_requests_insert" on group_join_requests;
create policy "group_join_requests_insert" on group_join_requests for insert with check (
  auth.uid() = requester_id
  and not exists (select 1 from group_bans where group_bans.group_id = group_join_requests.group_id and group_bans.user_id = auth.uid())
);

-- ============================================================
-- CRÍTICO: en algún momento se había corregido profiles_update_own para
-- que admin/moderador pudieran editar la fila de OTRA persona (necesario
-- para suspender/dar rol de moderador) — pero más abajo en este mismo
-- archivo quedó una versión vieja de esa política que la pisaba al
-- volver a correr todo, dejando "auth.uid() = id" sin ninguna otra
-- condición. Eso rompía las herramientas de moderación (nadie podía
-- suspender a otro) Y de paso dejaba una puerta abierta: cualquiera
-- podía, en teoría, ponerse is_admin = true a sí mismo, porque nada
-- restringía QUÉ campos se pueden tocar en la propia fila.
--
-- Se arregla en dos capas: la política de RLS vuelve a permitir que
-- admin/moderador editen la fila de otra persona (para las acciones de
-- moderación), y un trigger aparte revisa específicamente que nadie
-- cambie is_admin/is_moderator/suspended_until/suspension_reason a
-- menos que quien hace el cambio sea realmente admin o moderador — así
-- ni siquiera un admin/moderador editando SU PROPIA fila puede tocar
-- esos campos puntuales sin que se vuelva a chequear el permiso real.
-- ============================================================
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (
  auth.uid() = id or exists (select 1 from profiles p where p.id = auth.uid() and (p.is_admin = true or p.is_moderator = true))
);

create or replace function enforce_profile_privilege_columns() returns trigger as $$
declare
  actor_admin boolean;
  actor_moderador boolean;
begin
  if new.is_admin is not distinct from old.is_admin
     and new.is_moderator is not distinct from old.is_moderator
     and new.suspended_until is not distinct from old.suspended_until
     and new.suspension_reason is not distinct from old.suspension_reason then
    return new;
  end if;

  select is_admin, is_moderator into actor_admin, actor_moderador from profiles where id = auth.uid();

  if new.is_admin is distinct from old.is_admin and not coalesce(actor_admin, false) then
    raise exception 'No tenés permiso para cambiar el estado de administrador.';
  end if;

  if (
    new.is_moderator is distinct from old.is_moderator
    or new.suspended_until is distinct from old.suspended_until
    or new.suspension_reason is distinct from old.suspension_reason
  ) and not (coalesce(actor_admin, false) or coalesce(actor_moderador, false)) then
    raise exception 'No tenés permiso para cambiar estos campos.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_profile_privilege_columns on profiles;
create trigger trg_enforce_profile_privilege_columns before update on profiles
  for each row execute function enforce_profile_privilege_columns();

-- ============================================================
-- Silenciar/expulsar dentro de un grupo solo lo podía hacer el creador
-- de ESE grupo puntual — mismo criterio que ya aplicamos a comentarios y
-- encuestas de grupo: un admin/moderador de la app también debería poder
-- actuar acá, por ejemplo al resolver un reporte sobre un grupo que no
-- es el suyo.
-- ============================================================
drop policy if exists "group_mutes_manage_admin" on group_mutes;
create policy "group_mutes_manage_admin" on group_mutes for all using (
  exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
) with check (
  exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

drop policy if exists "group_bans_manage_admin" on group_bans;
create policy "group_bans_manage_admin" on group_bans for all using (
  exists (select 1 from groups where groups.id = group_bans.group_id and groups.creator_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
) with check (
  exists (select 1 from groups where groups.id = group_bans.group_id and groups.creator_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

-- ============================================================
-- CRÍTICO (mismo problema que encontramos en profiles): expulsar a
-- alguien de un grupo borra la fila de OTRA persona en group_members,
-- pero la política solo dejaba borrar la propia (salir por tu cuenta).
-- Esto significa que "Expulsar" probablemente no funcionaba para nadie
-- — ni el creador del grupo, ni un admin/moderador de la app.
-- ============================================================
drop policy if exists "group_members_delete_own" on group_members;
create policy "group_members_delete_own" on group_members for delete using (
  auth.uid() = user_id
  or exists (select 1 from groups where groups.id = group_members.group_id and groups.creator_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

-- ============================================================
-- Ajuste al trigger de la corrección anterior: dar o sacar el rol de
-- moderador tiene que ser EXCLUSIVO del admin (así está en la app — el
-- botón "Moderadores" solo se le muestra al admin, no a los
-- moderadores) — mi primera versión del trigger dejaba que un moderador
-- se lo diera a cualquier otra persona también, cosa que no correspondía.
-- Suspender/desuspender sigue siendo admin O moderador, que sí es correcto.
-- ============================================================
create or replace function enforce_profile_privilege_columns() returns trigger as $$
declare
  actor_admin boolean;
  actor_moderador boolean;
begin
  if new.is_admin is not distinct from old.is_admin
     and new.is_moderator is not distinct from old.is_moderator
     and new.suspended_until is not distinct from old.suspended_until
     and new.suspension_reason is not distinct from old.suspension_reason then
    return new;
  end if;

  select is_admin, is_moderator into actor_admin, actor_moderador from profiles where id = auth.uid();

  if new.is_admin is distinct from old.is_admin and not coalesce(actor_admin, false) then
    raise exception 'No tenés permiso para cambiar el estado de administrador.';
  end if;

  -- Dar/sacar el rol de moderador: exclusivo del admin.
  if new.is_moderator is distinct from old.is_moderator and not coalesce(actor_admin, false) then
    raise exception 'No tenés permiso para cambiar el estado de moderador.';
  end if;

  -- Suspender/desuspender: admin o moderador.
  if (
    new.suspended_until is distinct from old.suspended_until
    or new.suspension_reason is distinct from old.suspension_reason
  ) and not (coalesce(actor_admin, false) or coalesce(actor_moderador, false)) then
    raise exception 'No tenés permiso para suspender/desuspender usuarios.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Usuario, nombre para mostrar, y frase favorita del perfil no tenían
-- ningún límite de longitud puesto en la base — solo en la app (14, 15 y
-- 110 caracteres respectivamente). Sin esto, alguien saltándose la app y
-- llamando directo a la base podía guardar un texto de cualquier
-- longitud ahí, rompiendo el diseño en todos lados donde se muestra.
-- ============================================================
do $$
begin
  alter table profiles add constraint profiles_username_length check (char_length(username) <= 14);
exception when others then null;
end $$;
do $$
begin
  alter table profiles add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 15);
exception when others then null;
end $$;
do $$
begin
  alter table profiles add constraint profiles_favorite_quote_length check (favorite_quote is null or char_length(favorite_quote) <= 110);
exception when others then null;
end $$;

-- Nombre de grupo y título de lista no tenían ningún límite, ni siquiera
-- en la propia app — se agrega un tope razonable solo como red de
-- contención, sin achicar lo que ya se puede escribir hoy.
do $$
begin
  alter table groups add constraint groups_name_length check (char_length(name) <= 100);
exception when others then null;
end $$;
do $$
begin
  alter table lists add constraint lists_title_length check (char_length(title) <= 100);
exception when others then null;
end $$;

-- ============================================================
-- Ajuste a los límites de arriba: bajan de 100 a los valores pedidos, y
-- se agrega la descripción del grupo (150), que faltaba.
-- ============================================================
alter table groups drop constraint if exists groups_name_length;
alter table groups add constraint groups_name_length check (char_length(name) <= 70);

alter table groups drop constraint if exists groups_description_length;
alter table groups add constraint groups_description_length check (description is null or char_length(description) <= 150);

alter table lists drop constraint if exists lists_title_length;
alter table lists add constraint lists_title_length check (char_length(title) <= 40);

-- Capa extra de precaución: aunque no hay forma de llegar a esto desde la
-- app (el botón de mensaje ya está oculto en el propio perfil), la
-- función en sí no impedía crear un "chat" con uno mismo si alguien la
-- llamaba directo, saltándose la app.
create or replace function obtener_o_crear_chat(otro_usuario uuid) returns uuid as $$
declare
  a uuid;
  b uuid;
  resultado uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if auth.uid() = otro_usuario then
    raise exception 'No podés iniciar un chat con vos mismo.';
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

-- El creador de un grupo no puede sacarse a sí mismo de su propio grupo
-- (lo dejaría huérfano, sin nadie, aunque siga teniendo poder de
-- moderación sobre él) — si quiere dejar de tenerlo, tiene que borrarlo.
drop policy if exists "group_members_delete_own" on group_members;
create policy "group_members_delete_own" on group_members for delete using (
  (
    auth.uid() = user_id
    and not exists (select 1 from groups where groups.id = group_members.group_id and groups.creator_id = auth.uid())
  )
  or exists (select 1 from groups where groups.id = group_members.group_id and groups.creator_id = auth.uid() and groups.creator_id <> group_members.user_id)
  or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
);

-- ============================================================
-- Mismo resguardo que ya agregamos en "borrar usuario": ni siquiera un
-- admin/moderador puede suspenderse a sí mismo, ni darse/sacarse el rol
-- de moderador o admin a sí mismo, aunque técnicamente tenga el permiso
-- — la app ya lo esconde en pantalla, esto es la capa de servidor.
-- ============================================================
create or replace function enforce_profile_privilege_columns() returns trigger as $$
declare
  actor_admin boolean;
  actor_moderador boolean;
begin
  if new.is_admin is not distinct from old.is_admin
     and new.is_moderator is not distinct from old.is_moderator
     and new.suspended_until is not distinct from old.suspended_until
     and new.suspension_reason is not distinct from old.suspension_reason then
    return new;
  end if;

  if auth.uid() = new.id then
    raise exception 'No podés cambiar estos campos en tu propia cuenta.';
  end if;

  select is_admin, is_moderator into actor_admin, actor_moderador from profiles where id = auth.uid();

  if new.is_admin is distinct from old.is_admin and not coalesce(actor_admin, false) then
    raise exception 'No tenés permiso para cambiar el estado de administrador.';
  end if;

  if new.is_moderator is distinct from old.is_moderator and not coalesce(actor_admin, false) then
    raise exception 'No tenés permiso para cambiar el estado de moderador.';
  end if;

  if (
    new.suspended_until is distinct from old.suspended_until
    or new.suspension_reason is distinct from old.suspension_reason
  ) and not (coalesce(actor_admin, false) or coalesce(actor_moderador, false)) then
    raise exception 'No tenés permiso para suspender/desuspender usuarios.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Mismo criterio a nivel de base: nadie puede banearse, silenciarse, ni
-- expulsarse a sí mismo de un grupo — ni el creador, ni un admin/mod de
-- la app que esté moderando ese grupo y además sea miembro de él. La app
-- ya lo esconde en pantalla; esto cierra la puerta del lado del servidor.
-- ============================================================
drop policy if exists "group_mutes_manage_admin" on group_mutes;
create policy "group_mutes_manage_admin" on group_mutes for all using (
  user_id <> auth.uid()
  and (
    exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  )
) with check (
  user_id <> auth.uid()
  and (
    exists (select 1 from groups where groups.id = group_mutes.group_id and groups.creator_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  )
);

drop policy if exists "group_bans_manage_admin" on group_bans;
create policy "group_bans_manage_admin" on group_bans for all using (
  user_id <> auth.uid()
  and (
    exists (select 1 from groups where groups.id = group_bans.group_id and groups.creator_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  )
) with check (
  user_id <> auth.uid()
  and (
    exists (select 1 from groups where groups.id = group_bans.group_id and groups.creator_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  )
);

drop policy if exists "group_members_delete_own" on group_members;
create policy "group_members_delete_own" on group_members for delete using (
  (
    auth.uid() = user_id
    and not exists (select 1 from groups where groups.id = group_members.group_id and groups.creator_id = auth.uid())
  )
  or (
    user_id <> auth.uid()
    and (
      exists (select 1 from groups where groups.id = group_members.group_id and groups.creator_id = auth.uid())
      or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
    )
  )
);

-- ============================================================
-- CRÍTICO: el contenido de un grupo (comentarios, posts, encuestas) no
-- estaba restringido a sus miembros para nada al momento de VERLO —
-- comentarios_select_all no tenía en cuenta el grupo en absoluto,
-- posts_select regía la visibilidad de un post de grupo por si el AUTOR
-- tenía perfil público o lo seguías (nada que ver con ser miembro del
-- grupo), y polls_select mostraba CUALQUIER encuesta de grupo a
-- cualquiera. Se unifica acá con una regla correcta y consistente para
-- los tres: un grupo público lo ve cualquiera, uno privado solo sus
-- miembros — y admin/moderador de la app siempre, para poder moderar
-- grupos ajenos (incluso privados) sin depender de ser miembro.
-- ============================================================
create or replace function puede_ver_contenido_de_grupo(p_group_id uuid) returns boolean as $$
  select
    p_group_id is null
    or exists (select 1 from groups where groups.id = p_group_id and groups.visibility = 'public')
    or exists (select 1 from group_members where group_members.group_id = p_group_id and group_members.user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true));
$$ language sql stable;

drop policy if exists "comentarios_select_all" on comentarios;
create policy "comentarios_select_all" on comentarios for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (
    not oculto_por_reporte
    or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true))
  )
  and (target_type <> 'group' or puede_ver_contenido_de_grupo(group_id))
);

drop policy if exists "posts_select" on posts;
create policy "posts_select" on posts for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true)))
  and (
    group_id is not null
      and puede_ver_contenido_de_grupo(group_id)
    or group_id is null and (
      auth.uid() = user_id
      or es_comentario_de_titulo = true
      or exists (select 1 from profiles where profiles.id = posts.user_id and profiles.is_private = false)
      or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = posts.user_id)
    )
  )
);

drop policy if exists "polls_select" on polls;
create policy "polls_select" on polls for select using (
  not existe_bloqueo(auth.uid(), user_id)
  and (not oculto_por_reporte or exists (select 1 from profiles where id = auth.uid() and (is_admin = true or is_moderator = true)))
  and (
    group_id is not null and puede_ver_contenido_de_grupo(group_id)
    or group_id is null and (
      auth.uid() = user_id
      or exists (select 1 from profiles where profiles.id = polls.user_id and profiles.is_private = false)
      or exists (select 1 from follows where follows.follower_id = auth.uid() and follows.followee_id = polls.user_id)
    )
  )
);

-- Ajuste: por ahora, ver el contenido de un grupo privado sin ser
-- miembro queda exclusivo del admin — los moderadores NO tienen este
-- acceso (a diferencia del resto de las tareas de moderación, donde sí
-- están a la par del admin).
create or replace function puede_ver_contenido_de_grupo(p_group_id uuid) returns boolean as $$
  select
    p_group_id is null
    or exists (select 1 from groups where groups.id = p_group_id and groups.visibility = 'public')
    or exists (select 1 from group_members where group_members.group_id = p_group_id and group_members.user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true);
$$ language sql stable;

-- ============================================================
-- Mismo hallazgo que con el contenido: la lista de MIEMBROS de un grupo
-- privado también estaba completamente expuesta a cualquiera. Se corrige
-- con el mismo criterio ya usado para comentarios/posts/encuestas.
-- ============================================================
drop policy if exists "group_members_select_all" on group_members;
create policy "group_members_select_all" on group_members for select using (
  puede_ver_contenido_de_grupo(group_id)
);

-- ============================================================
-- IMPORTANTE: la corrección de arriba (restringir group_members) creaba
-- un problema — puede_ver_contenido_de_grupo() consulta group_members
-- por dentro, y esa tabla ahora depende de la MISMA función para
-- decidir su propia visibilidad → chequeo circular. Se soluciona
-- marcando la función como "security definer", para que su consulta
-- interna a group_members no quede sujeta a la política de esa tabla
-- (mismo recurso ya usado en obtener_o_crear_chat).
-- ============================================================
create or replace function puede_ver_contenido_de_grupo(p_group_id uuid) returns boolean as $$
  select
    p_group_id is null
    or exists (select 1 from groups where groups.id = p_group_id and groups.visibility = 'public')
    or exists (select 1 from group_members where group_members.group_id = p_group_id and group_members.user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and is_admin = true);
$$ language sql stable security definer set search_path = public;

-- ============================================================
-- CRÍTICO: existe_bloqueo() no era "security definer" — su consulta
-- interna a la tabla "blocks" quedaba sujeta a la política de esa
-- tabla (blocks_owner: "solo ves las filas donde SOS el que bloqueó").
-- Esto significa que si OTRA persona te bloqueó a vos (no al revés),
-- existe_bloqueo() podía no detectarlo, porque esa fila le pertenece a
-- ella, no a vos — y la función no la podía "ver" para chequearla.
-- Como TODAS las correcciones de bloqueo de esta sesión (comentarios,
-- posts, chats, reacciones, listas, encuestas, seguir) dependen de esta
-- única función, este arreglo las corrige a todas de una — no hace
-- falta tocar cada política de nuevo.
-- ============================================================
create or replace function existe_bloqueo(a uuid, b uuid) returns boolean as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$ language sql stable security definer set search_path = public;

-- ============================================================
-- CRÍTICO — regresión mía: al agregar "no podés banearte/silenciarte a
-- vos mismo" en group_bans_manage_admin/group_mutes_manage_admin, esa
-- política pasó a excluir explícitamente tu propia fila (user_id <>
-- auth.uid()) — pero esa MISMA tabla también se usa desde
-- comentarios_insert_auth/posts_insert/polls_insert para chequear "¿YO
-- estoy baneado/silenciado?", y con esa política ya no podías ver tu
-- propia fila de baneo — dejando pasar comentarios de gente baneada,
-- justo lo que esa protección debía evitar. Se separa en una función
-- aparte, con permiso para consultar sin esa restricción.
-- ============================================================
create or replace function esta_baneado_o_silenciado(p_group_id uuid, p_user_id uuid) returns boolean as $$
  select
    exists (select 1 from group_bans where group_bans.group_id = p_group_id and group_bans.user_id = p_user_id)
    or exists (
      select 1 from group_mutes
      where group_mutes.group_id = p_group_id
        and group_mutes.user_id = p_user_id
        and (group_mutes.muted_until is null or group_mutes.muted_until > now())
    );
$$ language sql stable security definer set search_path = public;

drop policy if exists "comentarios_insert_auth" on comentarios;
create policy "comentarios_insert_auth" on comentarios for insert with check (
  auth.uid() = user_id
  and (
    parent_comment_id is null
    or not exists (
      select 1 from comentarios padre
      where padre.id = comentarios.parent_comment_id and existe_bloqueo(auth.uid(), padre.user_id)
    )
  )
  and (
    target_type <> 'group'
    or (
      exists (select 1 from group_members where group_members.group_id = comentarios.group_id and group_members.user_id = auth.uid())
      and not esta_baneado_o_silenciado(comentarios.group_id, auth.uid())
    )
  )
);

drop policy if exists "posts_insert" on posts;
create policy "posts_insert" on posts for insert with check (
  auth.uid() = user_id
  and (
    group_id is null
    or (
      exists (select 1 from group_members where group_members.group_id = posts.group_id and group_members.user_id = auth.uid())
      and not esta_baneado_o_silenciado(posts.group_id, auth.uid())
    )
  )
);

drop policy if exists "polls_insert" on polls;
create policy "polls_insert" on polls for insert with check (
  auth.uid() = user_id
  and (
    group_id is null
    or (
      exists (select 1 from group_members where group_members.group_id = polls.group_id and group_members.user_id = auth.uid())
      and not esta_baneado_o_silenciado(polls.group_id, auth.uid())
    )
  )
);
