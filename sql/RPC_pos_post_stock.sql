create or replace function pos.rpc_post_stock(
  p_branch_id text,
  p_tran_type   text,   -- 'PURCHASE' or 'SALE' (later 'ADJ+','ADJ-')
  p_ref_no      text,
  p_ref_date    date,
  p_username    text,
  p_items       jsonb    -- JSON array of items
)
returns jsonb
language plpgsql
security definer
set search_path = pos, public
as $$
declare
  v_item         record;
  v_delta        numeric;      -- +ve for in, -ve for out
  v_new_on_hand  numeric;
  v_tran_type    text := upper(p_tran_type);
  v_product_id text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  if v_tran_type not in ('PURCHASE','SALE','IN','OUT','ADJ+','ADJ-') then
    raise exception 'Unsupported tran_type: %', p_tran_type;
  end if;

  -- Loop through JSON items (can include product_id or barcode)
  for v_item in
    select *
    from jsonb_to_recordset(p_items)
      as x (
        product_id text,
        barcode      text,
        qty          numeric,
        unit_cost    numeric,
        remarks      text
      )
  loop
    if v_item.qty is null or v_item.qty <= 0 then
      raise exception 'Invalid qty for product/barcode (qty <= 0)';
    end if;

    -- Resolve product_code:
    -- 1) if given directly, use it
    -- 2) else lookup by barcode
    if v_item.product_code is not null then
      v_product_id := v_item.product_id;
    elsif v_item.barcode is not null then
      select p.product_id
        into v_product_id
      from pos.products p
      where p.barcode = v_item.barcode;

      if v_product_id is null then
        raise exception
          'No product found for barcode %', v_item.barcode;
      end if;
    else
      raise exception
        'Either product_id or barcode must be provided per item';
    end if;

    -- Decide stock direction
    if v_tran_type in ('PURCHASE','IN','ADJ+') then
      v_delta := v_item.qty;          -- stock increases
    else                               -- SALE / OUT / ADJ-
      v_delta := -v_item.qty;         -- stock decreases
    end if;

    -- Upsert into branch_products
    insert into pos.branch_products (branch_id, product_id, on_hand, avg_cost)
    values (p_branch_id, v_product_id, v_delta,
            coalesce(v_item.unit_cost, 0))
    on conflict (branch_id, product_id)
    do update
       set on_hand =
             pos.branch_products.on_hand + v_delta,
           avg_cost = case
             when v_tran_type in ('PURCHASE','IN','ADJ+')
                  and (pos.branch_products.on_hand + v_delta) > 0
                  and v_item.unit_cost is not null
             then (
               (pos.branch_products.on_hand * pos.branch_products.avg_cost)
               + (v_item.qty * v_item.unit_cost)
             ) / (pos.branch_products.on_hand + v_delta)
             else pos.branch_products.avg_cost
           end
    returning on_hand into v_new_on_hand;

    -- Ledger entry
    insert into pos.stock_ledger (
      branch_id, product_id,
      txn_date, tran_type, ref_no, ref_date,
      in_qty, out_qty, balance_qty,
      unit_cost, username, remarks
    )
    values (
      p_branch_id,
      v_product_id,
      now(),
      v_tran_type,
      p_ref_no,
      coalesce(p_ref_date, current_date),
      case when v_delta > 0 then v_item.qty else 0 end,
      case when v_delta < 0 then v_item.qty else 0 end,
      v_new_on_hand,
      v_item.unit_cost,
      p_username,
      v_item.remarks
    );
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'branch_id', p_branch_id,
    'tran_type', v_tran_type,
    'ref_no', p_ref_no
  );
end;
$$;

