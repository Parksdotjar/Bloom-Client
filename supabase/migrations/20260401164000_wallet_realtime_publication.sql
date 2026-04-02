do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.commerce_wallets';
  exception
    when duplicate_object then
      null;
  end;
end $$;

