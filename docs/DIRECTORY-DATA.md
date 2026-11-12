# Faculty and department data (owner bulk upload)

The directory (`academic_directory`) holds countries, universities, faculties and departments. Universities come from the official NUC tables (Admin → Directory → Import from NUC). Faculties and departments have **no single official dataset**: each university publishes its own structure, so they are added from each university's own pages. Every row must carry a source link. Nothing is guessed or taken from memory.

## How to upload (owner only)

1. Sign in as the owner → **Admin → Directory → Add faculties and departments (CSV)**.
2. Choose a `.csv` file or paste the text. Columns: `university,faculty,department,source_url` (department may be empty for a faculty-only row).
3. Tap **Check upload**. Nothing is saved. Read the summary, any partial-name matches and any problems.
4. If the check is clean, tap **Import**. Only missing entries are added; existing entries are never changed or reactivated. The import is all-or-nothing and is recorded in the audit log.

Rules enforced by the server: owner only; at most 500 rows per upload; the university must already exist in the directory (use the exact directory name, or a unique partial name, which the check reports so you can confirm it); the source must be a full http(s) link; duplicates are ignored; inactive entries are left untouched.

## Batches

| File | Coverage | Source |
|---|---|---|
| `directory-batches/batch-01-unilag-ui-science.csv` | University of Lagos: all 19 faculties and 99 departments (official list effective 1 Aug 2025). University of Ibadan: Faculty of Science, 11 departments. | UNILAG: official announcement page. UI: the Faculty of Science website. |

### Notes on batch 01

- UNILAG reorganised from 12 to 19 faculties on 1 August 2025. Many third-party sites still show the old 12; this batch follows UNILAG's own page.
- UNILAG's page lists faculties without the words "Faculty of"; the CSV adds them for consistency with the rest of the directory.
- The University of Ibadan publishes each faculty on its own website, so a full UI list needs roughly 17 further faculty pages. Only the Faculty of Science was verified so far. Other UI faculties were not added.
- Re-check each source page before uploading; universities change their structure.

## Adding more

Prepare one batch per university from its official pages, keep the page URL for each row, run **Check upload**, then import. Students can also suggest missing entries through the existing institution-request flow, which you approve before adding.
