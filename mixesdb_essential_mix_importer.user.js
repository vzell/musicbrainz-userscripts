// ==UserScript==
// @name           Import Essential Mixes from MixesDB to MusicBrainz
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2022.02.27.1
// @downloadURL    https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/mixesdb_essential_mix_importer.user.js
// @updateURL      https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/mixesdb_essential_mix_importer.user.js
// @include        http://www.mixesdb.com/w/*
// @include        https://www.mixesdb.com/w/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           hhttps://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    MBImportStyle();

    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    let release = retrieveReleaseInfo(release_url);
    insertLink(release, release_url);
});

function retrieveReleaseInfo(release_url) {
    const title = $('#firstHeading').text();
    const releaseDate = title.match(/(\d{1,4}([.\-/])\d{1,2}([.\-/])\d{1,4})/g)[0].split('-');
    const cleanedTitle = $('#firstHeading')
        .text()
        .replace(/\(?Essential Mix(, \d{1,4}-\d{2}-\d{2})?\)?/, '');

    const titleSplit = cleanedTitle.split(/(( - )|@)/).filter(s => s && s.trim() !== '' && s.trim() !== '-');
    let artists = titleSplit[1]
        .trim()
        .split(/[,&@]/)
        .map(a => a.trim());
    let location = cleanedTitle.split('@');
    const name = `${releaseDate[0]}-${releaseDate[1]}-${releaseDate[2]}: BBC Radio 1 Essential Mix${
        location.length > 1 ? `: ${location[location.length - 1].replace(' - ', '').trim()}` : ''
    }`;
    const tracklist = generateTracklistForAnnotation();

    if (artists.length === 1 && artists[0] === 'VA') {
        artists = $('dl')
            .map(function () {
                const name = $(this).text();
                return $.trim(name.replace('(Live PA)', ''));
            })
            .get();
    }

    // Release information global to all Beatport releases
    let release = {
        artist_credit: [],
        title: name,
        type: '',
        secondary_types: [],
        year: releaseDate[0],
        month: releaseDate[1],
        day: releaseDate[2],
        format: 'Digital Media',
        country: 'GB',
        status: 'bootleg',
        language: 'eng',
        script: 'Latn',
        barcode: 'none',
        urls: [],
        labels: [],
        discs: [],
        annotation: tracklist,
    };
    release.artist_credit = MBImport.makeArtistCredits(artists);

    // URLs
    release.urls.push({
        url: release_url,
        link_type: 729, // show notes
    });
    const playerurls = $('[data-playerurl]');
    playerurls.each(function () {
        release.urls.push({
            url: this.dataset.playerurl,
            link_type: 85, // stream for free
        });
    });

    // Tracks
    let tracks = [
        {
            title: name,
            artist_credit: release.artist_credit,
            duration: '2:00:00',
        },
    ];

    release.discs.push({
        tracks: tracks,
        format: release.format,
    });

    LOGGER.info('Parsed release: ', release);
    return release;
}

function generateTracklistForAnnotation() {
    let tracklist = 'Tracklist: \n\n';

    let nextSibling = $('#Tracklist').next();
    while (nextSibling.get()[0].id !== 'bodyBottom') {
        const tagName = nextSibling.get()[0].tagName;
        if (tagName == 'OL') {
            $('li', nextSibling).each(function (index) {
                tracklist += `${index + 1}.  ${this.innerText}\n`;
            });
        } else if (tagName == 'DL') {
            tracklist += `\n== ${nextSibling.text()} ==\n`;
        }
        nextSibling = nextSibling.next();
    }
    return tracklist.replace(/\[([^\]]*)\]/g, '&amp;#91;$1&amp;#93;');
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note =
        'Added to match style guidelines: https://community.metabrainz.org/t/style-guidelines-for-bbc-radio-1-essential-mix/515760.';
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(`${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}`).hide();

    $('#mw-content-text').prepend(mbUI);
    $('form.musicbrainz_import').css({ display: 'inline-block', 'margin-left': '5px' });
    mbUI.slideDown();
}
