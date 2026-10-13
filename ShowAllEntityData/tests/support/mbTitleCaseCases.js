'use strict';

/**
 * The cases of the MusicBrainz title style used on the non-MusicBrainz
 * sites (`_mbTitleCase()`, `_mbNormalizeTitle()`; see
 * docs/claude/foreign-title-case.md). Shared by
 * scripts/check-mb-title-case.js (Node, no browser) and
 * tests/fixtures/mb-title-case.spec.js (Chromium, `window.__saTest`).
 *
 * Each case is [input, expected, opts?]; `opts.normalize` runs
 * `_mbNormalizeTitle()` (which also moves a trailing "(THE)"), `opts.typo`
 * `_mbTypography()` alone, `opts.full` both as the converters do
 * (`_mbSiteTitleText()` with both settings on), otherwise
 * `_mbTitleCase(input, opts)`. Every input is a real title of one of the
 * sites unless marked.
 *
 * @type {Array<[string, string, Object?]>}
 */
module.exports = [
    // Brucebase song list: every word capitalised → small words lowered.
    ['Born In The U.S.A.', 'Born in the U.S.A.'],
    ['Mary Queen Of Arkansas', 'Mary Queen of Arkansas'],
    ['Tougher Than The Rest', 'Tougher Than the Rest'],
    ['Going Home (Theme From Local Hero)', 'Going Home (Theme From Local Hero)'],
    ['(I Can\'t Get No) Satisfaction', '(I Can\'t Get No) Satisfaction'],
    ['Why\'s It So Hard', 'Why\'s It So Hard'],
    ['All I Have To Do Is Dream', 'All I Have to Do Is Dream'],
    ['Oh, What A Night', 'Oh, What a Night'],
    ['You Better Be Nice To Me, Baby', 'You Better Be Nice to Me, Baby'],
    ['Light Of Day', 'Light of Day'],
    ['Hold On', 'Hold On'],
    ['Devils & Dust', 'Devils & Dust'],
    ['Jolé Blon', 'Jolé Blon'],
    ['Santa Claus Is Comin\' To Town', 'Santa Claus Is Comin\' to Town'],
    // brucespringsteen.it: capitals, and the sort form "(THE)".
    ['BORN IN THE USA', 'Born in the USA'],
    ['THE GHOST OF TOM JOAD / STRAIGHT TIME', 'The Ghost of Tom Joad / Straight Time'],
    ['BORN TO RUN / MEETING ACROSS THE RIVER', 'Born to Run / Meeting Across the River'],
    ['BOSS AT HIS BEST (THE)', 'The Boss at His Best', { normalize: true }],
    ['EARLY YEARS (THE)', 'The Early Years', { normalize: true }],
    ['10TH AVENUE FREEZE OUT / SHE\'S THE ONE', '10th Avenue Freeze Out / She\'s the One'],
    ['BADLANDS (MONO / STEREO)', 'Badlands (mono / stereo)'],
    ['DARKNESS ON THE EDGE OF TOWN (HALF SPEED)', 'Darkness on the Edge of Town (half speed)'],
    ['LIVE IN THE PROMISED LAND(copy/repress)', 'Live in the Promised Land(copy/repress)'],
    ['ST. JAMES PARTY', 'St. James Party'],
    ['AT ALPINE VALLEY VOL. 2', 'At Alpine Valley Vol. 2'],
    ['TRUTH O\' TRASH', 'Truth o\' Trash'],
    ['ACROSS THE BORDERLINE...WITH THE BOSS', 'Across the Borderline...With the Boss'],
    ['LIVE AT THE BOTTOM LINE 8/15/75', 'Live at the Bottom Line 8/15/75'],
    ['GLORY DAYS / STAND ON IT (CL SUNBURST)', 'Glory Days / Stand on It (CL Sunburst)'], // "stand" is not in _MBTC_PHRASAL
    // jungleland.it: mixed case as typed.
    ['Fade away at the Madison Square Garden (Version 2)', 'Fade Away at the Madison Square Garden (version 2)'],
    ['24 april 1981 Palais des Sports, Lyon (Version 3)', '24 April 1981 Palais des Sports, Lyon (version 3)'],
    ['Hang on Columbus (Version 3)', 'Hang On Columbus (version 3)'],
    ['Out There In Radioland (JEMS) (Version 6)', 'Out There in Radioland (JEMS) (version 6)'],
    ['The Roxy 10-18-75(late show) (Version 3)', 'The Roxy 10-18-75(late show) (version 3)'],
    ['Saratoga NY \'09', 'Saratoga NY \'09'],
    ['The Story of born to run Radio Special', 'The Story of Born to Run Radio Special'],
    ['Passaic - Capital Theatre DVD (Version 3)', 'Passaic - Capital Theatre DVD (version 3)'],
    ['Torn And Frayed (Version 2)', 'Torn and Frayed (version 2)'],
    ['Can You Feel The Spirit? (Version 6)', 'Can You Feel the Spirit? (version 6)'],
    ['SPARE PARTS (ONE SIDED)', 'Spare Parts (one sided)'],
    ['MURDER INC. / SCIOGLI L\'AMORE', 'Murder Inc. / Sciogli L\'Amore'],
    ['THE WILD, THE INNOCENT & THE E STREET SHUFFLE (JAP)', 'The Wild, the Innocent & the E Street Shuffle (JAP)'],
    // "Up" and the phrasal "On": capitalised; the preposition "on" is not.
    ['Held Up Without A Gun', 'Held Up Without a Gun'],
    ['I Can\'t Stand Up For Falling Down', 'I Can\'t Stand Up for Falling Down'],
    ['Come On Over To My Place', 'Come On Over to My Place'],
    ['Bring On The Night', 'Bring On the Night'],
    ['Born On The Bayou', 'Born on the Bayou'],
    ['Darkness On The Edge Of Town', 'Darkness on the Edge of Town'],
    // Brucebase year pages: venues in capitals.
    ['HAMPTON ROADS COLISEUM', 'Hampton Roads Coliseum'],
    ['PALAIS DES SPORTS', 'Palais des Sports'],
    ['STADE DE FRANCE', 'Stade de France'],
    ['PNC BANK ARTS CENTER', 'PNC Bank Arts Center'],
    ['A&M STUDIOS', 'A&M Studios'],
    ['MAX\'S KANSAS CITY', 'Max\'s Kansas City'],
    ['THE STONE PONY', 'The Stone Pony'],
    // Brucebase setlists (capsOnly: notes in mixed case stay as written).
    ['TOUGHER THAN THE REST (with Patti Scialfa)', 'Tougher Than the Rest (with Patti Scialfa)', { capsOnly: true }],
    ['TWIST AND SHOUT - DO YOU LOVE ME', 'Twist and Shout - Do You Love Me', { capsOnly: true }],
    ['TENTH AVENUE FREEZE-OUT', 'Tenth Avenue Freeze-Out', { capsOnly: true }],
    ['I\'M ON FIRE', 'I\'m on Fire', { capsOnly: true }],
    ['4th OF JULY, ASBURY PARK (SANDY)', '4th of July, Asbury Park (Sandy)', { capsOnly: true }],
    ['JOHNNY BYE-BYE', 'Johnny Bye-Bye', { capsOnly: true }],
    ['ROCK \'N\' ROLL MUSIC', 'Rock \'n\' Roll Music', { capsOnly: true }],
    ['blues improvisation', 'blues improvisation', { capsOnly: true }],
    ['WHAT\'S GOING ON (LIVE)', 'What\'s Going On (live)', { capsOnly: true }],
    // Shapes, not titles of the sites (marked): acronyms, numerals, prefixes.
    ['ROCKY GROUND PART II', 'Rocky Ground Part II'], // constructed
    ['NINE O\'CLOCK', 'Nine O\'Clock'], // constructed (MusicBrainz's own example)
    ['MCLOONE\'S RUM RUNNER', 'McLoone\'s Rum Runner'], // constructed
    ['MTV UNPLUGGED', 'MTV Unplugged'], // constructed
    ['BOOKER T & THE M.G.\'S', 'Booker T & the M.G.\'s'], // constructed
    ['MY HOMETOWN', 'My Hometown'],
    ['', ''],
    ['1999', '1999'],
    // A placeholder in MusicBrainz's special-purpose style stays as written.
    ['[no title]', '[no title]'],
    ['[unknown]', '[unknown]'],
    // springsteenlyrics.com: card titles (every word capitalised) and the
    // lyrics index (capitals).
    ['The Promise: The Darkness On The Edge Of Town Story', 'The Promise: The Darkness on the Edge of Town Story'],
    ['Pointer Sisters -- Fire / Love Is Like A Rolling Stone', 'Pointer Sisters — Fire / Love Is Like a Rolling Stone', { full: true }],
    ['BABY I\'M SO COLD', 'Baby I’m So Cold', { full: true }],
    ['BALLAD OF A SELF-LOADING PISTOL', 'Ballad of a Self‐Loading Pistol', { full: true }],
    // Brucebase year pages: cities and countries.
    ['THE NETHERLANDS', 'The Netherlands'],
    ['NORTHERN IRELAND', 'Northern Ireland'],
    ['ST. LOUIS', 'St. Louis'],

    // Typographic punctuation (`_mbTypography()`), on real titles.
    ['Don\'t Look Back', 'Don’t Look Back', { typo: true }],
    ['Santa Claus Is Comin\' to Town', 'Santa Claus Is Comin’ to Town', { typo: true }],
    ['Rock \'n\' Roll Music', 'Rock ’n’ Roll Music', { typo: true }],
    ['Saratoga NY \'09', 'Saratoga NY ’09', { typo: true }],
    ['IRISH \'SPRINGSTEEN PACK\'', 'IRISH ‘SPRINGSTEEN PACK’', { typo: true }],
    ['\'Til I Kissed You', '’Til I Kissed You', { typo: true }], // constructed
    ['Twist and Shout - Do You Love Me', 'Twist and Shout – Do You Love Me', { typo: true }],
    ['Tenth Avenue Freeze-Out', 'Tenth Avenue Freeze‐Out', { typo: true }],
    ['Studio Collection 1972-1979', 'Studio Collection 1972–1979', { typo: true }],
    ['Barcelona July 19-20 2008', 'Barcelona July 19–20 2008', { typo: true }],
    ['1999-09-15 Philadelphia (DVD)', '1999‐09‐15 Philadelphia (DVD)', { typo: true }],
    ['The Roxy 10-18-75(late show)', 'The Roxy 10‐18‐75(late show)', { typo: true }],
    ['Across the Borderline...With the Boss', 'Across the Borderline…With the Boss', { typo: true }],
    ['Born To Run -- The Single', 'Born To Run — The Single', { typo: true }], // constructed
    ['He said "Hello"', 'He said “Hello”', { typo: true }], // constructed
    ['Born To Run 7" Single', 'Born To Run 7″ Single', { typo: true }], // constructed
    ['2 x 45', '2 × 45', { typo: true }], // constructed
    ['Max\'s Kansas City', 'Max’s Kansas City', { typo: true }],
    ['70\'s Tapes', '70’s Tapes', { typo: true }], // constructed
    ['AC/DC', 'AC/DC', { typo: true }],
    ['Spirit of ´76', 'Spirit of ’76', { typo: true }],
    ['`Cause Tonight we got Style', '’Cause Tonight we got Style', { typo: true }],
    ['Big Time Rock `n` Roll (Version 3)', 'Big Time Rock ’n’ Roll (Version 3)', { typo: true }],
    ['Georgetown is rockin` Tonight', 'Georgetown is rockin’ Tonight', { typo: true }],
    ['Live at d´Scene', 'Live at d’Scene', { typo: true }],
    ['"Catch these big Stars in the Night ... if you can !"', '“Catch these big Stars in the Night … if you can !”', { typo: true }],
    // Both, as the converters write a title.
    ['10TH AVENUE FREEZE-OUT / SHE\'S THE ONE', '10th Avenue Freeze‐Out / She’s the One', { full: true }],
    ['ACROSS THE BORDERLINE...WITH THE BOSS', 'Across the Borderline…With the Boss', { full: true }],
    ['BOSS AT HIS BEST (THE)', 'The Boss at His Best', { full: true }],
];
