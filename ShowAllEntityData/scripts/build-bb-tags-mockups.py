#!/usr/bin/env python3
"""Builds debug/bb-tags-mockups.html, Phase 11's mockup (org/brucebase.org,
tag pages), from debug/bb-tags-mockup-data.json
(scripts/fetch-bb-tags-mockup-data.py). Public page titles and tags only:
no member names are in the data.

    python3 scripts/build-bb-tags-mockups.py
"""

import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAM = {'date': 'Date', 'place': 'Place', 'tour': 'Tour', 'material': 'On the page', 'song': 'Songs',
       'person': 'People', 'release': 'Releases', 'ott': 'On The Tracks', 'label': 'Bootleg labels',
       'playlist': 'Playlists', 'key': 'Keys', 'snippet': 'Tour snippets', 'letter': 'Letter',
       'category': 'Category', 'other': 'Other'}
MAX = 24695


def esc(s):
    """HTML-escapes."""
    return html.escape(str(s), quote=True)


def split_title(t):
    """'1971-05-15 Venue, City, ST' → (date, venue, city, state)."""
    m = re.match(r'^(\d{4}-\d{2}-\d{2})\s+(.*)$', t)
    if not m:
        return '', t, '', ''
    parts = [p.strip() for p in m.group(2).split(',')]
    if len(parts) >= 3:
        return m.group(1), ', '.join(parts[:-2]), parts[-2], parts[-1]
    if len(parts) == 2:
        return m.group(1), parts[0], parts[1], ''
    return m.group(1), parts[0], '', ''


def pages_est(w):
    """The weight's page estimate."""
    if w <= 100:
        return '< 62'
    return f'≈ {round((w - 100) / 200 * MAX):,}'


def stamp(v):
    """'@1519144841' → '2018-02-20'."""
    import time
    m = re.match(r'@(\d+)', v or '')
    return time.strftime('%Y-%m-%d', time.gmtime(int(m.group(1)))) if m else ''


def main():
    """Writes the HTML."""
    with open(os.path.join(ROOT, 'debug', 'bb-tags-mockup-data.json'), encoding='utf-8') as f:
        d = json.load(f)
    exact = {t['tag']: t['pages'] for t in d['totals']}

    # A — the cloud as a table
    rows_a = []
    for t in d['cloud']['top'][:14]:
        rows_a.append(f"<tr><td><a class='tg' href='#'>{esc(t['tag'])}</a></td><td>{FAM[t['family']]}</td>"
                      f"<td class='n'>{int(t['weight'])}%</td><td class='n'>{pages_est(t['weight'])}</td></tr>")
    for name in ('thepromise', 'blauvelt', 'patti.scialfa'):
        t = next(x for x in d['totals'] if x['tag'] == name)
        rows_a.append(f"<tr><td><a class='tg' href='#'>{esc(t['tag'])}</a></td><td>{FAM[t['family']]}</td>"
                      f"<td class='n'>{int(t['weight'])}%</td><td class='n'>{pages_est(t['weight'])}</td></tr>")
    fams = ''.join(f"<span class='chip'>{FAM[k]} <b>{n:,}</b></span>" for k, n in d['cloud']['families'])

    # B — a tag's pages
    lp = {i['name']: i for i in d['storyteller_listpages']}
    rows_b = []
    for href, title in d['storyteller_tagged'][:12]:
        name = href.lstrip('/')
        kind = name.split(':')[0] if ':' in name else '—'
        dt, venue, city, st = split_title(title)
        it = lp.get(name, {})
        extra = (f"<td class='x'>{stamp(it.get('created'))}</td><td class='x'>{stamp(it.get('updated'))}</td>"
                 f"<td class='x n'>{int(it.get('size') or 0):,}</td><td class='x n'>{esc(it.get('comments', ''))}</td>"
                 f"<td class='x tags'>{len(it.get('tags', []))} tags ▶</td>")
        rows_b.append(f"<tr><td><a href='#'>{esc(title)}</a></td><td><span class='kind k-{esc(kind)}'>{esc(kind)}</span></td>"
                      f"<td>{dt}</td><td>{esc(venue)}</td><td>{esc(city)}</td><td>{esc(st)}</td>{extra}</tr>")
    kinds_b = "gig 1,374 · story 1,486 · content 65 · interview 51 · rehearsal 16 · nogig 9 · relation 5 · recording 1 · other 1"

    # C — pages-and-tags
    rows_c = []
    for r in d['pages_and_tags_p1'][:8]:
        dt, venue, city, st = split_title(r['title'])
        tags = ''.join(f"<li>{esc(t)}</li>" for t in r['tags'][:6])
        more = f"<li class='more'>… {len(r['tags']) - 6} more</li>" if len(r['tags']) > 6 else ''
        rows_c.append(f"<tr><td><a href='#'>{esc(r['title'])}</a></td><td>{dt}</td><td>{esc(venue)}</td><td>{esc(city)}</td>"
                      f"<td>{esc(st)}</td><td class='n'>{len(r['tags'])}</td><td><ul class='mr'>{tags}{more}</ul></td></tr>")

    # D — the tag card
    newest = sorted(d['storyteller_listpages'], key=lambda i: i['created'], reverse=True)[:6]
    card_rows = ''.join(f"<li><span class='kind k-{esc(i['name'].split(':')[0])}'>{esc(i['name'].split(':')[0])}</span> "
                        f"{esc(i['title'])} <span class='dim'>{stamp(i['created'])}</span></li>" for i in newest)

    page = TEMPLATE
    for k, v in {
        '%%ROWS_A%%': ''.join(rows_a), '%%FAMS%%': fams, '%%ROWS_B%%': ''.join(rows_b), '%%KINDS_B%%': kinds_b,
        '%%ROWS_C%%': ''.join(rows_c), '%%CARD_ROWS%%': card_rows,
        '%%N_TAGS%%': f"{d['cloud']['count']:,}", '%%N_ST%%': f"{d['storyteller_tagged_n']:,}",
    }.items():
        page = page.replace(k, v)
    out = os.path.join(ROOT, 'debug', 'bb-tags-mockups.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print(f'wrote {out} ({len(page):,} bytes); exact counts sampled: {exact}')


TEMPLATE = r'''<title>BB Tag Pages</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root {
  /* A reading column of four proposals, each a working replica of the rendered page; Brucebase's parchment and ink. */
  --bg: #f4efe4; --win: #fbf8f1; --ink: #2b2622; --dim: #7a6d5c; --line: #d9cfbd; --soft: #ece4d4;
  --blue: #2f5f9e; --blue-bg: #eef2f8; --red: #9b2218; --amber: #8a5a00; --amber-bg: #fbf1c9;
  --shadow: 0 18px 40px -22px rgba(43, 38, 34, .45);
  --k-gig: #dfe9f5; --k-story: #f3e3cf; --k-content: #e6e0f0; --k-other: #e9e6df;
  --f-read: Georgia, "Times New Roman", Times, serif;
  --f-ui: system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #171513; --win: #1f1c19; --ink: #ece6da; --dim: #a99c88; --line: #3e372f; --soft: #2a2622;
  --blue: #8fb3e6; --blue-bg: #22303f; --red: #f0a59b; --amber: #e7c46a; --amber-bg: #3a3218;
  --shadow: 0 18px 40px -22px rgba(0, 0, 0, .8);
  --k-gig: #22324a; --k-story: #45331f; --k-content: #352d47; --k-other: #2f2b26; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #171513; --win: #1f1c19; --ink: #ece6da; --dim: #a99c88; --line: #3e372f; --soft: #2a2622;
  --blue: #8fb3e6; --blue-bg: #22303f; --red: #f0a59b; --amber: #e7c46a; --amber-bg: #3a3218;
  --shadow: 0 18px 40px -22px rgba(0, 0, 0, .8);
  --k-gig: #22324a; --k-story: #45331f; --k-content: #352d47; --k-other: #2f2b26; color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 15px/1.55 var(--f-read);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 60px; }
main { max-width: 1060px; margin: 0 auto; display: grid; gap: 34px; }
h1 { font: 600 28px/1.2 var(--f-read); margin: 0; text-wrap: balance; }
h2 { font: 600 21px/1.25 var(--f-read); margin: 0 0 4px; text-wrap: balance; }
.lede { color: var(--dim); max-width: 68ch; margin: 6px 0 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-top: 16px; }
.fact { background: var(--win); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font: 13px/1.4 var(--f-ui); }
.fact b { display: block; font: 600 20px/1.2 var(--f-read); }
.fact span { color: var(--dim); }
section { display: grid; gap: 12px; }
.tag-id { font: 600 11px/1 var(--f-ui); letter-spacing: .08em; text-transform: uppercase; color: var(--blue); }
.url { font: 12.5px/1.4 ui-monospace, Consolas, monospace; color: var(--dim); overflow-wrap: anywhere; }
.win { background: var(--win); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); padding: 14px 16px; min-width: 0; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font: 13px var(--f-ui); margin-bottom: 10px; }
.btn { border: 1px solid var(--line); background: var(--soft); color: var(--ink); border-radius: 5px; padding: 4px 10px; font: 13px var(--f-ui); cursor: pointer; }
.btn.on { background: var(--blue-bg); border-color: var(--blue); color: var(--blue); }
.cost { color: var(--dim); font-size: 12px; }
.filter { flex: 1 1 180px; min-width: 0; border: 1px solid var(--line); border-radius: 5px; padding: 4px 8px; background: var(--bg); color: var(--dim); font: 12px var(--f-ui); }
.tw { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font: 13px/1.4 var(--f-ui); }
th { text-align: left; font-weight: 600; background: var(--soft); border-bottom: 1px solid var(--line); padding: 5px 8px; white-space: nowrap; }
td { border-bottom: 1px solid var(--line); padding: 4px 8px; vertical-align: top; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
a { color: var(--blue); text-decoration: none; }
a.tg { border-bottom: 1px dotted var(--blue); }
.kind { display: inline-block; border-radius: 3px; padding: 0 5px; font-size: 11.5px; background: var(--k-other); }
.k-gig { background: var(--k-gig); } .k-story { background: var(--k-story); } .k-content { background: var(--k-content); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; font: 12px var(--f-ui); }
.chip { border: 1px solid var(--line); border-radius: 12px; padding: 1px 9px; background: var(--bg); }
ul.mr { margin: 0; padding: 0; list-style: none; }
ul.mr li { border-bottom: 1px dotted var(--line); }
ul.mr li:last-child { border: 0; }
ul.mr li.more { color: var(--dim); font-style: italic; }
.x { display: none; } .show-x .x { display: table-cell; }
.tags { color: var(--blue); white-space: nowrap; }
.dim { color: var(--dim); }
.qs { background: var(--amber-bg); border-left: 3px solid var(--amber); border-radius: 0 8px 8px 0; padding: 10px 14px; }
.qs h3 { margin: 0 0 4px; font: 600 13px var(--f-ui); letter-spacing: .04em; text-transform: uppercase; color: var(--amber); }
.qs ol { margin: 0; padding-left: 22px; } .qs li { margin: 4px 0; max-width: 78ch; }
.notes { margin: 0; padding-left: 20px; max-width: 78ch; } .notes li { margin: 3px 0; }
.demo { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.card { width: min(380px, 100%); background: var(--win); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 10px 12px; font: 13px/1.45 var(--f-ui); }
.card .t { font: 600 15px var(--f-read); }
.card ul { margin: 6px 0 0; padding-left: 0; list-style: none; } .card li { margin: 2px 0; }
.card .foot { color: var(--dim); font-size: 11.5px; margin-top: 6px; border-top: 1px solid var(--line); padding-top: 5px; }
.hoverme { font: 14px var(--f-ui); }
.hoverme a { border-bottom: 1px dotted var(--blue); }
code { font: 12.5px ui-monospace, Consolas, monospace; background: var(--soft); padding: 0 4px; border-radius: 3px; }
</style>
<main>
<header>
  <div class="tag-id">Brucebase overhaul · Phase 11 · mockup</div>
  <h1>Tag pages: the cloud, one tag's pages, Pages &amp; Tags</h1>
  <p class="lede">Four proposals, each drawn as it would render on brucebase.wikidot.com. Rows are real (signed-out probe,
  2026-11-12T01:36+01:00). The questions are in the yellow boxes.</p>
  <div class="facts">
    <div class="fact"><b>%%N_TAGS%%</b><span>tags in the cloud; weight only as <code>font-size</code> 100–300%</span></div>
    <div class="fact"><b>10,940</b><span>of them at 100% (under ~62 pages): the weight sorts only the top 631</span></div>
    <div class="fact"><b>1 page</b><span>a tag's list, no paging: storyteller %%N_ST%% items 2.2 MB, content 24,695 items 6.2 MB / 4.5 s</span></div>
    <div class="fact"><b>0.4 s · 0.9 KB</b><span>a tag's exact count over AJAX (Wikidot ListPages, <code>%%total%%</code>), signed out</span></div>
    <div class="fact"><b>250 / call</b><span>ListPages with created, updated, size, comments, tags: ~1.5 s, ~180 KB</span></div>
    <div class="fact"><b>onstage only</b><span>manage:pages-and-tags is 35 pages × 100 of the 3,486 <code>onstage:</code> pages, not the whole wiki (42,660)</span></div>
  </div>
</header>

<section>
  <div class="tag-id">A · bb-tags</div>
  <h2>system:page-tags — the cloud as a table</h2>
  <div class="url">https://brucebase.wikidot.com/system:page-tags</div>
  <div class="win">
    <div class="bar"><button class="btn on">Show all %%N_TAGS%% tags</button><span class="cost">no request: read from the cloud on the page</span><span class="filter">Filter tags…</span></div>
    <div class="chips" style="margin-bottom:10px">%%FAMS%%</div>
    <div class="tw"><table>
      <thead><tr><th>Tag</th><th>Family</th><th class="n">Weight</th><th class="n">Pages</th></tr></thead>
      <tbody>%%ROWS_A%%</tbody>
    </table></div>
  </div>
  <ul class="notes">
    <li><b>Pages</b> comes from the weight: <code>font-size = 100 + 200 · pages / 24,695</code> (checked on 11 tags, within ±60);
      100% tags read "&lt; 62". The exact count is on the tag's card (D), one 0.9 KB request on hover.</li>
    <li><b>Family</b> is <code>_bbTagFamily()</code> without a page around it: songs, people and most places are not
      recognisable from the word alone, so 9,873 tags (85%) are Other.</li>
    <li>The cloud stays above the table, collapsed; each Tag link gets the card and window of D.</li>
  </ul>
  <div class="qs"><h3>Questions</h3><ol>
    <li>Keep <b>Family</b> although 85% is Other, or drop it? (A third way: a song/person list read once from
      <code>stats:songs</code> and <code>stats:relations</code>, two requests, would sort most of the Other into Songs and People.)</li>
    <li><b>Pages</b> as the weight estimate ("≈ 2,963", "&lt; 62"), or a third button "…with exact counts" that asks each
      tag's count over AJAX (11,571 requests ≈ 3¼ h at 1 s: not sensible) — or exact only for the 631 above 100% (≈ 11 min)?</li>
  </ol></div>
</section>

<section>
  <div class="tag-id">B · bb-tag</div>
  <h2>system:page-tags/tag/storyteller — one tag's pages</h2>
  <div class="url">https://brucebase.wikidot.com/system:page-tags/tag/storyteller</div>
  <div class="win" id="winB">
    <div class="bar">
      <button class="btn on" data-b="plain">Show the %%N_ST%% pages</button>
      <button class="btn" data-b="x">Show the %%N_ST%% pages with dates and sizes</button>
      <span class="cost" id="costB">no request: the list is on the page</span>
      <span class="filter">Filter pages…</span>
    </div>
    <div class="chips" style="margin-bottom:10px"><span class="dim">Kind:</span> %%KINDS_B%%</div>
    <div class="tw"><table>
      <thead><tr><th>Page</th><th>Kind</th><th>Date</th><th>Venue</th><th>City</th><th>State</th>
        <th class="x">Created</th><th class="x">Updated</th><th class="x n">Size</th><th class="x n">Comments</th><th class="x">Tags</th></tr></thead>
      <tbody>%%ROWS_B%%</tbody>
    </table></div>
  </div>
  <ul class="notes">
    <li><b>Kind</b> is the page name's prefix (<code>gig:</code>, <code>story:</code>, …), a 📊 entry each.
      Date / Venue / City / State are filled for date-led titles (the year page's heading splitter), empty otherwise.</li>
    <li>The second button reads the same pages over AJAX (ListPages, 250 a call): storyteller 13 calls ≈ 30 s,
      content 99 calls ≈ 4 min. Tags is then a multi-row column (collapsed: a gig carries 30–50).</li>
    <li>The page's tag cloud (1.6 MB, every tag again) is folded away above our table.</li>
  </ul>
  <div class="qs"><h3>Questions</h3><ol start="3">
    <li>Is the second button worth having, or are Page / Kind / Date … enough?</li>
    <li>With the second button: Tags as a column, or only as the row's window (Tags section, as today)?</li>
  </ol></div>
</section>

<section>
  <div class="tag-id">C · bb-pages-and-tags</div>
  <h2>manage:pages-and-tags — pages and their tags</h2>
  <div class="url">https://brucebase.wikidot.com/manage:pages-and-tags · …/p/3</div>
  <div class="win">
    <div class="bar"><button class="btn on">Show this page (100)</button><button class="btn">Show all 35 pages (3,486)</button>
      <span class="cost">35 requests ≈ 1 min; the page you are on is not asked again</span><span class="filter">Filter…</span></div>
    <div class="tw"><table>
      <thead><tr><th>Page</th><th>Date</th><th>Venue</th><th>City</th><th>State</th><th class="n">#</th><th>Tags</th></tr></thead>
      <tbody>%%ROWS_C%%</tbody>
    </table></div>
  </div>
  <ul class="notes">
    <li>Tags is one row per tag (the site writes one space-separated text cell), collapsed past six, with the
      ▶ toggle and the count badge as every multi-row column; a 📊 entry per tag.</li>
    <li>Every page of this list is an <code>onstage:</code> page (a ListPages filter on the wiki page, 35 × 100).</li>
  </ul>
  <div class="qs"><h3>Questions</h3><ol start="5">
    <li>A third button "Show all 42,660 pages with their tags" (ListPages over every category, 171 calls ≈ 7 min,
      ~30 MB)? It would also give every tag's exact count (Q2) for free.</li>
    <li>Group the tags by family in the cell (Date · Place · People …), or keep the site's alphabetical order?</li>
  </ol></div>
</section>

<section>
  <div class="tag-id">D · tag reader</div>
  <h2>A tag link's card and window</h2>
  <p class="lede" style="margin:0">For every <code>/system:page-tags/tag/…</code> link: the cloud, B and C's tables, the page-tags line under
    every Brucebase page, and the Tags section of our windows.</p>
  <div class="demo">
    <div class="hoverme">Hover: <a href="#" id="tgD">storyteller</a></div>
    <div class="card" id="cardD">
      <div class="t">storyteller</div>
      <div class="dim">3,008 pages · On the page · Brucebase tag</div>
      <ul>%%CARD_ROWS%%</ul>
      <div class="foot">The newest six (ListPages: one call, count and rows, ~5 KB). Space: the window, every page in a table.</div>
    </div>
  </div>
  <ul class="notes">
    <li>Card: one call (perPage 6, newest first, <code>%%total%%</code>), cached like every reader's answer.</li>
    <li>Window: B's table (Kind chips, Date …) read 250 at a time, the first call at once, "Load all N" for the rest;
      links inside open in the window with Back.</li>
  </ul>
  <div class="qs"><h3>Questions</h3><ol start="7">
    <li>Card list: newest six, or the first six by title (the site's order)?</li>
    <li>Window for a big tag (content, 24,695 → 99 calls): load everything at once, or the first 250 and a button?</li>
  </ol></div>
</section>
</main>
<script>
(function () {
  var win = document.getElementById('winB');
  var cost = document.getElementById('costB');
  win.querySelectorAll('button[data-b]').forEach(function (b) {
    b.addEventListener('click', function () {
      win.querySelectorAll('button[data-b]').forEach(function (o) { o.classList.toggle('on', o === b); });
      var x = b.getAttribute('data-b') === 'x';
      win.classList.toggle('show-x', x);
      cost.textContent = x ? '13 AJAX calls (ListPages, 250 each) ≈ 30 s' : 'no request: the list is on the page';
    });
  });
})();
</script>
'''

if __name__ == '__main__':
    main()
