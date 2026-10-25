-- read contract for hindsight; the columns are part of the contract between the repos
create schema if not exists core_read;

create or replace view core_read.journal_entries as
select e.id, e.user_id, e.entry_type, e.body, e.ticker, e."timestamp", e.price_snapshot,
       coalesce(array_agg(t.name::text order by t.name) filter (where t.name is not null),
                '{}'::text[]) as tags
from public.journal_entries e
left join public.journal_entry_tags jt on jt.journal_entry_id = e.id
left join public.tags t on t.id = jt.tag_id
group by e.id;
