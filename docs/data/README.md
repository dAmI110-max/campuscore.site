# Directory data files

## universities-on-site.csv

Snapshot of active universities from `/api/directory?kind=university`.

## faculty-department-starter.csv

Starter rows for Admin bulk import.

Required columns:

university,faculty,department,source_url

- department may be empty to add only a faculty
- source_url must be a full http(s) link
- max 500 rows per upload (split the file if needed)
- university names must match the directory

Verify faculty and department names against each institution before committing a bulk import. Prefer official faculty pages as source_url.
