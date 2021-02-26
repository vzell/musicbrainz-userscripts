// ==UserScript==
// @name           Import Essential Mixes from MixesDB to MusicBrainz
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2019.12.21.1
// @downloadURL    https://raw.githubusercontent.com/mattgoldspink/musicbrainz-userscripts/master/mixesdb_essential_mix_importer.user.js
// @updateURL      https://raw.githubusercontent.com/mattgoldspink/musicbrainz-userscripts/master/mixesdb_essential_mix_importer.user.js
// @include        http://www.mixesdb.com/w/*
// @include        https://www.mixesdb.com/w/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://raw.githubusercontent.com/mattgoldspink/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
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
    let releaseDate = $('#firstHeading').text().split('-');
    const name = `${releaseDate[0]}-${releaseDate[1]}-${releaseDate[2]}: BBC Radio 1 Essential Mix, ${releaseDate[3].trim()}`;
    const artists = releaseDate[3].trim().split(/[,&]/);

    // Release information global to all Beatport releases
    let release = {
        artist_credit: [],
        title: name,
        year: releaseDate[0],
        month: releaseDate[1],
        day: releaseDate[2],
        format: 'Digital Media',
        country: 'GB',
        status: 'official',
        language: 'eng',
        script: 'Latn',
        type: '',
        urls: [],
        labels: [],
        discs: [],
    };
    release.artist_credit = MBImport.makeArtistCredits(artists);

    // URLs
    release.urls.push({
        url: release_url,
        link_type: 729, // show notes
    });
    const playerurls = $('[data-playerurl]');
    playerurls.each(function (el) {
        release.urls.push({
            url: this.dataset.playerurl,
            link_type: 85, // stream for free
        });
    });

    // Tracks
    let tracks = [
        {
            title: name + ': Continuous Mix',
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

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = MBImport.makeEditNote(release_url, 'mixesdb');
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(
        `<li class="interior-release-chart-content-item musicbrainz-import">${MBImport.buildFormHTML(
            parameters
        )}${MBImport.buildSearchButton(release)}</li>`
    ).hide();

    $('#mw-content-text').prepend(mbUI);
    $('form.musicbrainz_import').css({ display: 'inline-block', 'margin-left': '5px' });
    $('form.musicbrainz_import button').css({ width: '120px' });
    mbUI.slideDown();
}
