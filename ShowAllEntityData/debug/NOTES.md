## 2026-07-01 — report pages

- `reports_index.html` (/reports): has `div#content`. `<h1>Reports</h1>` then
  14x `<h2>Category</h2><ul>...</ul>` (117 report links total, categories:
  Artists, Artist credits, Events, Labels, Release groups, Releases,
  Recordings, Places, Series, Works, URLs, ISRCs, ISWCs, Disc IDs). No table,
  no pagination — complete single-page list.
- `report_filter0.html` (/report/ArtistsThatMayBeGroups?filter=0): NO
  `div#content`. `<h1>{title}</h1>`, a `<ul>` description block (explanation,
  "Total X found: N", "Generated on ... UTC", link to `?filter=1`), then
  `<nav><ul class="pagination">` (standard MB pagination: numbered
  `page=N` links + `Next`), then native `<table class="tbl"><thead>` with 2
  columns (Artist, Type). 62 pages, ~6118 rows total.
- `report_dup.html` (/report/DuplicateArtists?filter=0): table class
  `"tbl mergeable-table"`, wrapped in `<form action="/artist/merge_queue"
  method="post">`. Extra leading blank `<th class="check">` with a per-row
  `<input type="checkbox" name="add-to-merge">`. Then Artist / Sort name /
  Type columns. 2941 pages.
- `report_collab.html` (/report/CollaborationRelationships?filter=0): 2
  columns (Collaboration, Collaborator), one `<th>` has `width="150px"`. 15
  pages.
- `report_deprecated.html` (/report/DeprecatedRelationshipArtists?filter=0):
  3 columns (Relationship type, Artist, Type). 121 pages.
- Column sets vary per report (117 distinct reports, 14 categories) with no
  observed integer/score columns — the `report-detail` page definition is
  column-agnostic (no `columnExtractors`/`stickyColumn`/`extractMainColumn`).
- The `mergeable-table` checkbox column (DuplicateArtists and similar
  "possibly duplicate ..." reports) renders but is inert once consolidated —
  the native `<form>` is not carried over into the rendered table.
