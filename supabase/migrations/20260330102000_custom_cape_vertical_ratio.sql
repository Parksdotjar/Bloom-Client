begin;

alter table if exists public.commerce_custom_cape_designs
  alter column crop_width set default 0.5,
  alter column crop_height set default 1;

create or replace function public.commerce_create_or_update_custom_cape_draft(
  p_design_id uuid default null,
  p_source_image_path text default null,
  p_source_image_url text default null,
  p_crop_x numeric default null,
  p_crop_y numeric default null,
  p_crop_width numeric default null,
  p_crop_height numeric default null,
  p_export_width integer default 2048
)
returns public.commerce_custom_cape_designs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_design public.commerce_custom_cape_designs;
  v_crop_x numeric(12,6) := greatest(0, least(coalesce(p_crop_x, 0), 1));
  v_crop_y numeric(12,6) := greatest(0, least(coalesce(p_crop_y, 0), 1));
  v_crop_w numeric(12,6) := greatest(0.01, least(coalesce(p_crop_width, 0.5), 1));
  v_crop_h numeric(12,6) := greatest(0.01, least(coalesce(p_crop_height, 1), 1));
  v_export_w integer := greatest(64, least(coalesce(p_export_width, 2048), 4096));
  v_export_h integer;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  v_export_w := (v_export_w / 64) * 64;
  v_export_h := v_export_w / 2;

  if (v_crop_x + v_crop_w) > 1 then
    v_crop_x := greatest(0, 1 - v_crop_w);
  end if;
  if (v_crop_y + v_crop_h) > 1 then
    v_crop_y := greatest(0, 1 - v_crop_h);
  end if;

  if p_design_id is null then
    insert into public.commerce_custom_cape_designs(
      user_id,
      source_image_path,
      source_image_url,
      crop_x,
      crop_y,
      crop_width,
      crop_height,
      export_width,
      export_height,
      preview_watermarked
    )
    values (
      v_user_id,
      nullif(btrim(p_source_image_path), ''),
      nullif(btrim(p_source_image_url), ''),
      v_crop_x,
      v_crop_y,
      v_crop_w,
      v_crop_h,
      v_export_w,
      v_export_h,
      true
    )
    returning * into v_design;
  else
    update public.commerce_custom_cape_designs d
    set
      source_image_path = coalesce(nullif(btrim(p_source_image_path), ''), d.source_image_path),
      source_image_url = coalesce(nullif(btrim(p_source_image_url), ''), d.source_image_url),
      crop_x = v_crop_x,
      crop_y = v_crop_y,
      crop_width = v_crop_w,
      crop_height = v_crop_h,
      export_width = v_export_w,
      export_height = v_export_h,
      preview_watermarked = case when d.purchased then false else true end
    where d.id = p_design_id
      and d.user_id = v_user_id
    returning * into v_design;

    if not found then
      raise exception 'design_not_found';
    end if;
  end if;

  return v_design;
end;
$$;

commit;
