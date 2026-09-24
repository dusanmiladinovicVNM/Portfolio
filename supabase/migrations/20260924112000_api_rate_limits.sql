begin;

-- Operational API abuse guard. This is deliberately not business/domain state.
-- One row per verified external identity + scope avoids unbounded history growth,
-- while row-level UPSERT serialization makes counters consistent across Edge
-- Function isolates.
create table public.api_rate_limit_buckets (
  rate_key text not null,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null,
  constraint api_rate_limit_buckets_pk primary key (rate_key, scope),
  constraint api_rate_limit_buckets_rate_key_ck
    check (char_length(rate_key) between 1 and 256),
  constraint api_rate_limit_buckets_scope_ck
    check (char_length(scope) between 1 and 64),
  constraint api_rate_limit_buckets_request_count_ck
    check (request_count >= 1)
);

comment on table public.api_rate_limit_buckets is
  'Application-internal fixed-window counters for authenticated HTTP abuse protection. Not business history.';

commit;
