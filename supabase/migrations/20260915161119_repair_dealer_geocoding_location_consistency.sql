BEGIN;

-- Address edits must invalidate private coordinates in the same transaction.
-- This also covers server/admin updates that bypass the application refresh call.
CREATE FUNCTION dealer_network_private.invalidate_member_geocode()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, dealer_network_private
AS $function$
BEGIN
  IF ROW(NEW.address_line_1, NEW.address_line_2, NEW.city, NEW.state, NEW.zip_code, NEW.country)
     IS DISTINCT FROM ROW(OLD.address_line_1, OLD.address_line_2, OLD.city, OLD.state, OLD.zip_code, OLD.country) THEN
    UPDATE dealer_network_private.member_locations
    SET latitude = NULL, longitude = NULL, geocode_status = 'stale',
        last_error = NULL, geocoded_at = NULL, updated_at = now()
    WHERE member_id = NEW.id;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER dealer_member_address_invalidates_geocode
AFTER UPDATE OF address_line_1, address_line_2, city, state, zip_code, country
ON public.dealer_network_members
FOR EACH ROW EXECUTE FUNCTION dealer_network_private.invalidate_member_geocode();

REVOKE ALL ON FUNCTION dealer_network_private.invalidate_member_geocode() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dealer_network_private.invalidate_member_geocode() TO service_role;

-- A slow Google response must not become the location for a newly edited address.
-- The member row lock serializes this check with profile updates and their trigger.
CREATE FUNCTION public.dealer_network_save_geocode(
  p_member_id uuid, p_expected_address jsonb, p_status text,
  p_latitude double precision, p_longitude double precision, p_provider text, p_error text
) RETURNS boolean LANGUAGE plpgsql
SET search_path = pg_catalog, public, dealer_network_private
AS $function$
DECLARE
  member public.dealer_network_members%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('succeeded', 'failed') OR
     jsonb_typeof(p_expected_address) IS DISTINCT FROM 'object' OR
     p_provider IS DISTINCT FROM 'google-geocoding-v3' THEN
    RAISE EXCEPTION 'invalid_geocode_input';
  END IF;
  IF p_status = 'succeeded' AND (p_latitude IS NULL OR p_longitude IS NULL OR
     NOT (p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180) OR p_error IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_geocode_point';
  END IF;
  IF p_status = 'failed' AND (p_latitude IS NOT NULL OR p_longitude IS NOT NULL OR
     p_error IS NULL OR p_error NOT IN (
       'NOT_CONFIGURED','NO_RESULTS','REQUEST_DENIED','OVER_QUERY_LIMIT','OVER_DAILY_LIMIT',
       'INVALID_REQUEST','UNAVAILABLE','TIMEOUT','HTTP_ERROR','BAD_PROVIDER_RESPONSE',
       'NETWORK_ERROR','INCOMPLETE_ADDRESS','MALFORMED_ADDRESS'
     )) THEN
    RAISE EXCEPTION 'invalid_geocode_failure';
  END IF;

  SELECT * INTO member FROM public.dealer_network_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR member.deleted_at IS NOT NULL THEN RETURN false; END IF;
  IF jsonb_build_object(
    'address_line_1',member.address_line_1,'address_line_2',member.address_line_2,
    'city',member.city,'state',member.state,'zip_code',member.zip_code,'country',member.country
  ) IS DISTINCT FROM p_expected_address THEN RETURN false; END IF;

  -- A transient retry failure does not discard a successful current point.
  IF p_status = 'failed' AND EXISTS (
    SELECT 1 FROM dealer_network_private.member_locations
    WHERE member_id = p_member_id AND geocode_status = 'succeeded'
      AND latitude IS NOT NULL AND longitude IS NOT NULL
  ) THEN
    UPDATE dealer_network_private.member_locations
    SET last_error = p_error, attempted_at = now(), updated_at = now()
    WHERE member_id = p_member_id;
    RETURN true;
  END IF;
  PERFORM public.dealer_network_set_location(p_member_id,p_status,p_latitude,p_longitude,p_provider,p_error);
  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION public.dealer_network_save_geocode(uuid,jsonb,text,double precision,double precision,text,text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dealer_network_save_geocode(uuid,jsonb,text,double precision,double precision,text,text)
TO service_role;

-- Safe account state only. Provider details and precise coordinates stay server-side.
CREATE OR REPLACE FUNCTION public.dealer_network_member_account_summary(p_token_hash text)
RETURNS jsonb LANGUAGE sql
SET search_path = pg_catalog, public, dealer_network_private
AS $function$
  SELECT jsonb_build_object(
    'accountStatus', CASE WHEN m.status = 'active' AND NOT m.account_locked THEN 'Active' ELSE 'Needs Attention' END,
    'emailVerified', c.email_verified_at IS NOT NULL,
    'lastLoginAt', m.last_login_at,
    'activeSessionCount', (
      SELECT count(*) FROM dealer_network_private.sessions active_session
      WHERE active_session.member_id = m.id AND active_session.revoked_at IS NULL AND active_session.expires_at > now()
    ),
    'currentSessionExpiresAt', current_session.expires_at,
    'businessLocationReady', location.geocode_status = 'succeeded' AND location.latitude IS NOT NULL AND location.longitude IS NOT NULL,
    'businessLocationState', CASE
      WHEN location.geocode_status = 'succeeded' AND location.latitude IS NOT NULL AND location.longitude IS NOT NULL THEN 'ready'
      WHEN location.geocode_status = 'pending' THEN 'refreshing'
      WHEN location.geocode_status = 'failed' AND location.last_error NOT IN (
        'NO_RESULTS','INVALID_REQUEST','INCOMPLETE_ADDRESS','MALFORMED_ADDRESS'
      ) THEN 'unavailable'
      ELSE 'needs_attention'
    END
  )
  FROM dealer_network_private.sessions current_session
  JOIN public.dealer_network_members m ON m.id = current_session.member_id
  JOIN dealer_network_private.credentials c ON c.member_id = m.id
  LEFT JOIN dealer_network_private.member_locations location ON location.member_id = m.id
  WHERE current_session.token_hash = p_token_hash AND current_session.revoked_at IS NULL AND current_session.expires_at > now()
$function$;

-- This RPC is service-role-only. Its private points are used for server distance
-- calculations, then omitted by the explicit member-directory API projection.
CREATE OR REPLACE FUNCTION public.dealer_network_directory_rows()
RETURNS jsonb LANGUAGE sql
SET search_path = pg_catalog, public, dealer_network_private
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'memberName',m.member_name,'companyName',m.company_name,'phone',m.phone,'email',m.email,
    'city',m.city,'state',m.state,'zipCode',m.zip_code,
    'websiteUrl',m.website_url,'role',m.role,'experience',m.experience,'serviceRegion',m.service_region,
    'introduction',m.introduction,'logoPath',m.logo_path,
    'latitude',CASE WHEN l.geocode_status = 'succeeded' THEN l.latitude ELSE NULL END,
    'longitude',CASE WHEN l.geocode_status = 'succeeded' THEN l.longitude ELSE NULL END,
    'geocodeStatus',l.geocode_status,
    'brands',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',mb.id,'brandId',b.id,'brandName',b.name,'relationshipType',mb.relationship_type
    ) ORDER BY b.sort_order,b.name)
    FROM public.dealer_network_member_brands mb JOIN public.dealer_network_brands b ON b.id=mb.brand_id
    WHERE mb.member_id=m.id AND mb.approval_status='approved'),'[]'::jsonb)
  ) ORDER BY m.company_name,m.member_name),'[]'::jsonb)
  FROM public.dealer_network_members m
  LEFT JOIN dealer_network_private.member_locations l ON l.member_id=m.id
  WHERE m.status='active' AND m.account_locked=false
$function$;

-- Bounded backfill candidates contain IDs only. Successful points and deleted
-- accounts are skipped; incomplete or malformed addresses never reach Google.
CREATE FUNCTION public.dealer_network_geocode_candidates(p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE sql
SET search_path = pg_catalog, public, dealer_network_private
AS $function$
  SELECT coalesce(jsonb_agg(candidate.id),'[]'::jsonb)
  FROM (
    SELECT m.id FROM public.dealer_network_members m
    LEFT JOIN dealer_network_private.member_locations l ON l.member_id=m.id
    WHERE m.deleted_at IS NULL AND m.status IN ('active','pending_activation')
      AND l.geocode_status IS DISTINCT FROM 'succeeded'
      AND length(btrim(m.address_line_1)) BETWEEN 2 AND 180
      AND lower(btrim(m.address_line_1)) NOT IN ('null','undefined')
      AND length(btrim(m.city)) BETWEEN 2 AND 120
      AND lower(btrim(m.city)) NOT IN ('null','undefined')
      AND (m.address_line_2 IS NULL OR (length(m.address_line_2) <= 180 AND lower(btrim(m.address_line_2)) NOT IN ('null','undefined')))
      AND upper(btrim(m.state)) = ANY(ARRAY['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'])
      AND btrim(m.zip_code) ~ '^[0-9]{5}(-[0-9]{4})?$'
      AND m.country = 'United States'
    ORDER BY m.created_at,m.id LIMIT least(greatest(coalesce(p_limit,5),0),5)
  ) candidate
$function$;

REVOKE ALL ON FUNCTION public.dealer_network_geocode_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dealer_network_geocode_candidates(integer) TO service_role;

COMMIT;
