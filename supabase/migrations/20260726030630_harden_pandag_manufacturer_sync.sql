begin;

do $$
declare
  known_suggestion_count integer;
  safe_suggestion_count integer;
begin
  if not exists (
    select 1
    from catalog_private.catalog_source_targets
    where id = '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5'
      and target_type = 'product'
      and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
      and variant_id is null
      and source_brand = 'Pandag'
      and source_name = 'Pandag G1 M1500 SD/RD and G1 PRO M3000 specifications'
      and source_url = 'https://www.pandag.com/product/pandag-g1-mower'
      and source_kind = 'manufacturer_specs_page'
      and public_pricing_monitoring_allowed = false
      and (
        (is_active = true and allow_automated_fetch = true and manual_only = false and check_frequency = 'monthly')
        or
        (is_active = false and allow_automated_fetch = false and manual_only = true and check_frequency = 'manual')
      )
  ) then
    raise exception 'Expected mixed Pandag source target was not found in an approved state';
  end if;

  select count(*) into known_suggestion_count
  from catalog_private.catalog_change_suggestions
  where id in (
    '13277f9f-f493-48e2-b046-3e2d59b5fabf',
    'fe293c6e-1362-4b7d-9b51-18ed65da1975',
    'd5dc8287-aaf2-4719-9af0-aa75a685cecb',
    '92bff41e-e5e2-4cfc-b431-d6d73c830e92',
    'bcbe58da-0279-491b-ad73-cf764e22657c',
    '3c332529-dbd9-46af-98fa-c3e99b70c532',
    '369033b8-fe13-4223-8ab0-d53c7bd79e12',
    '5b21da8c-d247-45f1-aee2-ea258e4e31e6',
    'de524ecf-89a2-4c4c-b11e-5fc4665fdda1'
  );

  select count(*) into safe_suggestion_count
  from catalog_private.catalog_change_suggestions
  where id in (
    '13277f9f-f493-48e2-b046-3e2d59b5fabf',
    'fe293c6e-1362-4b7d-9b51-18ed65da1975',
    'd5dc8287-aaf2-4719-9af0-aa75a685cecb',
    '92bff41e-e5e2-4cfc-b431-d6d73c830e92',
    'bcbe58da-0279-491b-ad73-cf764e22657c',
    '3c332529-dbd9-46af-98fa-c3e99b70c532',
    '369033b8-fe13-4223-8ab0-d53c7bd79e12',
    '5b21da8c-d247-45f1-aee2-ea258e4e31e6',
    'de524ecf-89a2-4c4c-b11e-5fc4665fdda1'
  )
    and source_target_id = '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5'
    and target_type = 'product'
    and target_table = 'catalog_products'
    and target_record_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
    and review_status in ('pending', 'rejected');

  if known_suggestion_count <> 9 or safe_suggestion_count <> 9 then
    raise exception 'Expected nine pending or Phase 3D-rejected contaminated Pandag suggestions; found % known and % safe', known_suggestion_count, safe_suggestion_count;
  end if;

  if exists (
    select 1
    from catalog_private.catalog_source_targets
    where id in (
      '6a4f0e76-6b9d-4fbb-9a72-8b6154da3c11',
      '0de5fd6d-a7c6-4d6e-91d1-62c715b5a2b2',
      '58e09b88-b28e-4f73-a8ba-f684e512c3c3',
      'cb8745aa-931e-47d5-86fa-3da8f4d7d4d4'
    )
      and not (
        source_brand = 'Pandag'
        and source_url = 'https://www.pandag.com/product/pandag-g1-mower'
        and public_pricing_monitoring_allowed = false
        and manual_only = true
        and allow_automated_fetch = false
      )
  ) then
    raise exception 'A Phase 3D Pandag source target ID is already used by an incompatible record';
  end if;
end
$$;

-- Preserve the mixed target for audit, but make it permanently ineligible for fetch.
update catalog_private.catalog_source_targets
set is_active = false,
    allow_automated_fetch = false,
    manual_only = true,
    check_frequency = 'manual',
    source_notes = 'Retired during Pandag model-source separation. Historical mixed-model source retained for audit only.',
    updated_at = now()
where id = '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5'
  and target_type = 'product'
  and product_id = '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'
  and source_url = 'https://www.pandag.com/product/pandag-g1-mower';

-- Preserve contaminated suggestions for audit while making them non-actionable.
update catalog_private.catalog_change_suggestions
set review_status = 'rejected',
    suggestion_reason = concat_ws(
      E'\n',
      suggestion_reason,
      'Rejected during Pandag model-source separation. Suggestion mixed multiple models or contained contaminated extraction text.'
    ),
    reviewed_at = now(),
    reviewed_by = 'Phase 3D owner-approved migration',
    updated_at = now()
where id in (
    '13277f9f-f493-48e2-b046-3e2d59b5fabf',
    'fe293c6e-1362-4b7d-9b51-18ed65da1975',
    'd5dc8287-aaf2-4719-9af0-aa75a685cecb',
    '92bff41e-e5e2-4cfc-b431-d6d73c830e92',
    'bcbe58da-0279-491b-ad73-cf764e22657c',
    '3c332529-dbd9-46af-98fa-c3e99b70c532',
    '369033b8-fe13-4223-8ab0-d53c7bd79e12',
    '5b21da8c-d247-45f1-aee2-ea258e4e31e6',
    'de524ecf-89a2-4c4c-b11e-5fc4665fdda1'
  )
  and source_target_id = '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5'
  and review_status = 'pending';

with approved_targets (
  id, target_type, product_id, variant_id, source_name,
  fields_to_monitor, source_notes
) as (
  values
    (
      '6a4f0e76-6b9d-4fbb-9a72-8b6154da3c11'::uuid,
      'product', '6364d86a-d5e5-4f17-8849-cea66cb6ff0c'::uuid, null::uuid,
      'Pandag G1 shared platform review',
      '{"fields":["short_description","navigation_system","obstacle_detection","drive_system","warranty","official_image_url","official_document_url"],"source_category":"platform_review","model_scope":"platform","review_only":true,"target_slug":"pandag-g1"}'::jsonb,
      'Shared G1 platform information only. Model specifications and all pricing are protected.'
    ),
    (
      '0de5fd6d-a7c6-4d6e-91d1-62c715b5a2b2'::uuid,
      'variant', null::uuid, '17be81bd-cf7b-424a-a57e-95423e7a10db'::uuid,
      'Pandag G1 M1500 SD review',
      '{"fields":["short_description","warranty","official_image_url","official_document_url"],"source_category":"model_review","model_scope":"m1500_sd","review_only":true,"target_slug":"pandag-g1-m1500-sd"}'::jsonb,
      'M1500 SD informational review only. Owner-approved specifications and all pricing are protected.'
    ),
    (
      '58e09b88-b28e-4f73-a8ba-f684e512c3c3'::uuid,
      'variant', null::uuid, '9fcc8558-576b-4df7-93bd-12ceff29dcb2'::uuid,
      'Pandag G1 M1500 RD review',
      '{"fields":["short_description","warranty","official_image_url","official_document_url"],"source_category":"model_review","model_scope":"m1500_rd","review_only":true,"target_slug":"pandag-g1-m1500-rd"}'::jsonb,
      'M1500 RD informational review only. Owner-approved specifications and all pricing are protected.'
    ),
    (
      'cb8745aa-931e-47d5-86fa-3da8f4d7d4d4'::uuid,
      'variant', null::uuid, '7dd2ce98-59a7-4a0d-b912-8d4916efa415'::uuid,
      'Pandag G1 PRO M3000 review',
      '{"fields":["short_description","warranty","official_image_url","official_document_url"],"source_category":"model_review","model_scope":"pro_m3000","review_only":true,"target_slug":"pandag-g1-pro-m3000"}'::jsonb,
      'PRO M3000 informational review only. Owner-approved specifications and all pricing are protected.'
    )
)
insert into catalog_private.catalog_source_targets (
  id, target_type, product_id, variant_id,
  source_brand, source_name, source_url, source_kind,
  fields_to_monitor, public_pricing_monitoring_allowed,
  source_notes, pricing_monitoring_notes,
  check_frequency, manual_only, is_active,
  allow_automated_fetch, allow_image_download
)
select
  id, target_type, product_id, variant_id,
  'Pandag', source_name,
  'https://www.pandag.com/product/pandag-g1-mower',
  'manufacturer_specs_page', fields_to_monitor, false,
  source_notes,
  'Pandag MSRP and IDS/private pricing are excluded from manufacturer sync.',
  'manual', true, true, false, false
from approved_targets
on conflict (id) do update
set target_type = excluded.target_type,
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    option_id = null,
    package_id = null,
    service_id = null,
    product_service_id = null,
    source_brand = excluded.source_brand,
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_kind = excluded.source_kind,
    fields_to_monitor = excluded.fields_to_monitor,
    public_pricing_monitoring_allowed = false,
    source_notes = excluded.source_notes,
    pricing_monitoring_notes = excluded.pricing_monitoring_notes,
    check_frequency = 'manual',
    manual_only = true,
    is_active = true,
    allow_automated_fetch = false,
    allow_image_download = false,
    updated_at = now();

do $$
begin
  if (select count(*) from catalog_private.catalog_source_targets
      where id = '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5'
        and is_active = false and allow_automated_fetch = false and manual_only = true) <> 1 then
    raise exception 'Mixed Pandag source target retirement verification failed';
  end if;

  if (select count(*) from catalog_private.catalog_change_suggestions
      where id in (
        '13277f9f-f493-48e2-b046-3e2d59b5fabf', 'fe293c6e-1362-4b7d-9b51-18ed65da1975',
        'd5dc8287-aaf2-4719-9af0-aa75a685cecb', '92bff41e-e5e2-4cfc-b431-d6d73c830e92',
        'bcbe58da-0279-491b-ad73-cf764e22657c', '3c332529-dbd9-46af-98fa-c3e99b70c532',
        '369033b8-fe13-4223-8ab0-d53c7bd79e12', '5b21da8c-d247-45f1-aee2-ea258e4e31e6',
        'de524ecf-89a2-4c4c-b11e-5fc4665fdda1'
      ) and review_status = 'rejected') <> 9 then
    raise exception 'Contaminated Pandag suggestion rejection verification failed';
  end if;

  if (select count(*) from catalog_private.catalog_source_targets
      where id in (
        '6a4f0e76-6b9d-4fbb-9a72-8b6154da3c11', '0de5fd6d-a7c6-4d6e-91d1-62c715b5a2b2',
        '58e09b88-b28e-4f73-a8ba-f684e512c3c3', 'cb8745aa-931e-47d5-86fa-3da8f4d7d4d4'
      ) and is_active and manual_only and not allow_automated_fetch
        and not public_pricing_monitoring_allowed) <> 4 then
    raise exception 'Four isolated review-only Pandag source targets were not created';
  end if;
end
$$;

commit;

-- Read-only verification queries (run only after separate migration approval).
select id, target_type, product_id, variant_id, source_name, source_url,
       fields_to_monitor, public_pricing_monitoring_allowed,
       check_frequency, manual_only, is_active, allow_automated_fetch
from catalog_private.catalog_source_targets
where id in (
  '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5',
  '6a4f0e76-6b9d-4fbb-9a72-8b6154da3c11',
  '0de5fd6d-a7c6-4d6e-91d1-62c715b5a2b2',
  '58e09b88-b28e-4f73-a8ba-f684e512c3c3',
  'cb8745aa-931e-47d5-86fa-3da8f4d7d4d4'
)
order by is_active, source_name;

select id, source_target_id, field_name, review_status,
       suggestion_reason, reviewed_at, reviewed_by, applied_at
from catalog_private.catalog_change_suggestions
where id in (
  '13277f9f-f493-48e2-b046-3e2d59b5fabf', 'fe293c6e-1362-4b7d-9b51-18ed65da1975',
  'd5dc8287-aaf2-4719-9af0-aa75a685cecb', '92bff41e-e5e2-4cfc-b431-d6d73c830e92',
  'bcbe58da-0279-491b-ad73-cf764e22657c', '3c332529-dbd9-46af-98fa-c3e99b70c532',
  '369033b8-fe13-4223-8ab0-d53c7bd79e12', '5b21da8c-d247-45f1-aee2-ea258e4e31e6',
  'de524ecf-89a2-4c4c-b11e-5fc4665fdda1'
)
order by created_at, id;

-- Rollback (NOT EXECUTED; requires separate approval):
-- begin;
-- update catalog_private.catalog_source_targets
-- set is_active = true, allow_automated_fetch = true, manual_only = false,
--     check_frequency = 'monthly',
--     source_notes = 'Reviewed 2026-07-15 on the official manufacturer domain; covers all three model tabs. Public pricing monitoring is prohibited.',
--     updated_at = now()
-- where id = '1fb36cb0-e68b-43f5-a39c-c97fa17ad9c5';
-- update catalog_private.catalog_source_targets
-- set is_active = false, allow_automated_fetch = false, updated_at = now()
-- where id in (
--   '6a4f0e76-6b9d-4fbb-9a72-8b6154da3c11', '0de5fd6d-a7c6-4d6e-91d1-62c715b5a2b2',
--   '58e09b88-b28e-4f73-a8ba-f684e512c3c3', 'cb8745aa-931e-47d5-86fa-3da8f4d7d4d4'
-- );
-- update catalog_private.catalog_change_suggestions
-- set review_status = 'pending', reviewed_at = null, reviewed_by = null,
--     suggestion_reason = 'Detected near a labeled manufacturer specification; verify against the source.',
--     updated_at = now()
-- where id in (
--   '13277f9f-f493-48e2-b046-3e2d59b5fabf', 'fe293c6e-1362-4b7d-9b51-18ed65da1975',
--   'd5dc8287-aaf2-4719-9af0-aa75a685cecb', '92bff41e-e5e2-4cfc-b431-d6d73c830e92',
--   'bcbe58da-0279-491b-ad73-cf764e22657c', '3c332529-dbd9-46af-98fa-c3e99b70c532',
--   '369033b8-fe13-4223-8ab0-d53c7bd79e12', '5b21da8c-d247-45f1-aee2-ea258e4e31e6',
--   'de524ecf-89a2-4c4c-b11e-5fc4665fdda1'
-- );
-- commit;
