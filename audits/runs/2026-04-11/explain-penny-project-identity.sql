-- LYRA f-2b5f4082: run against staging or a production-like snapshot (do not guess plan shape).
-- Replace $1, $2, $3 with typical values, e.g.:
--   $1 = lower(trim(:name))
--   $2 = normalized repo URL or NULL
--   $3 = raw project name (ordering tie-break)
--
-- Example (adjust literals):
-- EXPLAIN (ANALYZE, BUFFERS)
SELECT name, repository_url, project_json
FROM penny_projects
WHERE lower(name) = $1
   OR (
     $2::text IS NOT NULL
     AND repository_url IS NOT NULL
     AND lower(
       regexp_replace(
         regexp_replace(repository_url, '\.git$', '', 'i'),
         '/+$',
         ''
       )
     ) = $2
   )
ORDER BY
  CASE
    WHEN name = $3 THEN 0
    WHEN lower(name) = $1 THEN 1
    WHEN $2::text IS NOT NULL
      AND repository_url IS NOT NULL
      AND lower(
        regexp_replace(
          regexp_replace(repository_url, '\.git$', '', 'i'),
          '/+$',
          ''
        )
      ) = $2 THEN 2
    ELSE 3
  END,
  name ASC
LIMIT 1;
