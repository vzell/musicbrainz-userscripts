'use strict';

/**
 * The cases of `_mbTitleStyleCheck()`, the checker behind the MusicBrainz
 * title-style findings (`title-case`, `title-typography`,
 * `title-series-sep`, `title-feat`, `title-eti-remove`; see
 * docs/claude/findings.md). Shared by scripts/check-mb-title-case.js (Node,
 * no browser) and tests/fixtures/findings-title-style.spec.js (Chromium,
 * `window.__saTest`).
 *
 * Each case is [input, expected], `expected` holding only the fields that
 * are not `null` (`{}` = nothing to flag). Every input is a real
 * MusicBrainz title of the snapshots (`--mb-sample`) unless marked
 * "constructed".
 *
 * @type {Array<[string, Object]>}
 */
module.exports = [
    // Clean titles: nothing to say.
    ['Born to Run', {}],
    ['Darkness on the Edge of Town', {}],
    ['Greetings From Asbury Park, N.J.', {}],
    // Title case: small words lowered, a last word raised.
    ['Prayer For The Weary', { caseFix: 'Prayer for the Weary' }],
    ['Reasons To Believe', { caseFix: 'Reasons to Believe' }],
    ['Songs Of The Season', { caseFix: 'Songs of the Season' }],
    ['What Are You Waiting for', { caseFix: 'What Are You Waiting For' }],
    // "By" may be phrasal ("Stand By Me"), so it is never judged.
    ['Western Stars: A Film By Thom Zimny & Bruce Springsteen', {}],
    // Inside parentheses: small words lowered, never a word raised.
    ['Fadeaway (Live At Tower Records, Chicago. Oct 11 1993)', { caseFix: 'Fadeaway (Live at Tower Records, Chicago. Oct 11 1993)' }],
    ['You Can Look (but You Better Not Touch)', {}],
    ['She Got Me Where She Wants Me (Stone Pony rehearsal, 1977 / mono)', {}],
    // Phrasal: a capitalised short preposition may be an adverb.
    ['Take On Me', {}],
    ['Plug In Baby', {}],
    ['Born on the Bayou', {}],
    ['Turn on the Light', {}], // constructed: _mbTitleCase() would raise "on" after "turn"
    ['Rock n Roll Big Beat', {}],
    // Not judged: another language, a live bootleg title, CJK, file names.
    ['Si tú me miras', {}],
    ['Es is nisch tu kein ehrlicher Mensch / Ich lieb zu tuen a toive', {}],
    ['1977‐05‐13, late show: Monmouth Arts Center, Red Bank, NJ, USA', {}],
    ['2016‐06‐14: Malieveld, The Hague, The Netherlands', {}],
    ['君が通り過ぎたあとに—DON’T PASS ME BY—', {}],
    ['Heart of Hearts [heart of hearts 3 @159.mp3]', {}],
    ['日本語のタイトル', {}], // constructed: no Latin letter
    ['[unknown]', {}],
    // Words the rules cannot judge: after an ellipsis, glued, with a digit.
    ['…and So Did I', {}],
    ['-JU-', {}],
    ['MP3', {}],
    ['Forum Hall A', {}], // constructed: an article at the end is a name
    ['Bruce Springsteen & The E Street Band – The Born in the U.S.A. Tour ’84 – ’85', {}],
    ['The Wild, the Innocent & The E Street Shuffle', {}],
    // A multi-title recording is judged part by part.
    ['Atlantic City / [Shut Out the Light intro]', {}],
    ['Mona / She’s the One', {}],
    // Sentence case: another language's convention, not judged.
    ['Bolji nego ja', {}],
    ['Demi tasse / Jazz a la carte', {}],
    ['songs without a home', {}],
    // ALL UPPERCASE: re-cased (the `allcaps` finding flags it too), an
    // adverb included.
    ['STRAIGHT AND POOR', { caseFix: 'Straight and Poor' }],
    ['LET THE NEW YEAR IN - YOU\'RE SPECIAL', { caseFix: 'Let the New Year In - You\'re Special', typoFix: 'LET THE NEW YEAR IN – YOU’RE SPECIAL' }],
    ['336Numb Dash ft 336Fullcounter', {}],
    // Typography.
    ["Don't Be Lonely", { typoFix: 'Don’t Be Lonely' }],
    ['"Born to Run"', { typoFix: '“Born to Run”' }],
    ['Say You Will - Live', { typoFix: 'Say You Will – Live' }],
    ['... As We Know It', { typoFix: '… As We Know It' }],
    ['Castlevania: The Best 1986-2004', { typoFix: 'Castlevania: The Best 1986–2004' }],
    ['2008-12-31: Madison Square Garden, New York City, NY, USA', {}],
    ["Mama, verzeih' mir", { typoFix: 'Mama, verzeih’ mir' }],
    ['Prom Night [80\'s Prom Night 12.mp3]', {}],
    // Both case and typography.
    ['Tribute To Bruce Springsteen - Made In The U.S.A.',
        { caseFix: 'Tribute to Bruce Springsteen - Made In the U.S.A.', typoFix: 'Tribute To Bruce Springsteen – Made In The U.S.A.' }],
    // Series number without a comma.
    ['Broadcasts Vol. 5', { seriesFix: 'Broadcasts, Vol. 5' }],
    ['The Agora Show Part 1', { seriesFix: 'The Agora Show, Part 1' }],
    ['Live From The Music Hall Vol. 3', { caseFix: 'Live From the Music Hall Vol. 3', seriesFix: 'Live From The Music Hall, Vol. 3' }],
    ['Greatest Hits, Volume I & Volume II', {}],
    ['Best of Anime - Volume 1', { typoFix: 'Best of Anime – Volume 1' }],
    ['Orchestral Songs, Volume 1', {}], // constructed
    // Featured artist.
    ['Fuck College Ft. UDIT', { feat: 'Ft.' }],
    ['Featuring Bruce Springsteen', {}],
    ['Hungry Heart (feat. Somebody)', { feat: 'feat.' }], // constructed
    // Extra title information to remove.
    ['Come Together [The Beatles Cover]', { etiRemove: 'The Beatles Cover' }],
    ['Song (bonus track)', { etiRemove: 'bonus track' }], // constructed
    ['Wolfsbane (bonus disc: Everything Else)', {}],
];
