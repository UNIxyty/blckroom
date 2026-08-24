import { getPool, closePool } from "./client.js";

async function main() {
  const p = getPool();

  console.log("=== generations by status/error ===");
  const gens = await p.query(
    `select status, coalesce(left(error, 120), '') as error, count(*)::int as n
     from generations group by 1, 2 order by 3 desc`,
  );
  console.table(gens.rows);

  console.log("=== jobs by type/status ===");
  const jobs = await p.query(
    `select type, status, count(*)::int as n from jobs group by 1, 2 order by 1, 2`,
  );
  console.table(jobs.rows);

  console.log("=== dead/failed job errors ===");
  const dead = await p.query(
    `select type, attempts, left(coalesce(last_error,''), 160) as err, count(*)::int as n
     from jobs where status in ('dead','failed') group by 1, 2, 3 order by 4 desc limit 20`,
  );
  console.table(dead.rows);

  console.log("=== retried-but-eventually-ok jobs (attempts > 1, done) ===");
  const retried = await p.query(
    `select type, attempts, left(coalesce(last_error,''), 160) as err, count(*)::int as n
     from jobs where status = 'done' and attempts > 1 group by 1, 2, 3 order by 4 desc limit 20`,
  );
  console.table(retried.rows);

  console.log("=== sessions by status ===");
  const sess = await p.query(
    `select status, count(*)::int as n, min(created_at) as first, max(created_at) as last
     from sessions group by 1 order by 2 desc`,
  );
  console.table(sess.rows);

  console.log("=== done generations missing image paths (silent-missing candidates) ===");
  const missing = await p.query(
    `select g.id, g.session_id, g.status, g.raw_image_path is null as no_raw,
            g.framed_image_path is null as no_framed, s.status as session_status, s.created_at
     from generations g join sessions s on s.id = g.session_id
     where g.status = 'done' and s.status <> 'expired'
       and (g.raw_image_path is null or g.framed_image_path is null)
     limit 20`,
  );
  console.table(missing.rows);

  console.log("=== per-session settle picture (non-expired, recent 15) ===");
  const recent = await p.query(
    `select s.id, s.status as session, s.created_at::date as day,
            count(*)::int as gens,
            count(*) filter (where g.status='done')::int as done,
            count(*) filter (where g.status='failed')::int as failed,
            count(*) filter (where g.status in ('queued','running'))::int as unsettled,
            (s.sheet_image_path is not null) as has_sheet
     from sessions s left join generations g on g.session_id = s.id
     group by s.id order by s.created_at desc limit 15`,
  );
  console.table(recent.rows);

  console.log("=== failed generation error texts (full-ish) ===");
  const errs = await p.query(
    `select left(coalesce(error,''), 300) as error, count(*)::int as n, max(created_at) as last_seen
     from generations where status = 'failed' group by 1 order by 2 desc limit 15`,
  );
  console.table(errs.rows);

  await closePool();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
