// ==UserScript==
// @name           Import Apple Podcasts in to MusicBrainz
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2022.03.18.1
// @downloadURL    https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/apple_podcast_importer.user.js
// @updateURL      https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/apple_podcast_importer.user.js
// @include        http://podcasts.apple.com/bt/podcast/*
// @include        https://podcasts.apple.com/bt/podcast/*
// @include        https://musicbrainz.org/release/*/edit-relationships
// @include        https://beta.musicbrainz.org/release/*/edit-relationships
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/mblinks.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/assets/images/Musicbrainz_import_logo.png
// @grant          unsafeWindow
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

if (!unsafeWindow) unsafeWindow = window;

$(document).ready(function () {
    MBImportStyle();

    var mblinks = new MBLinks('APPLE_PODCASTS_CACHE', 7 * 24 * 60);

    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    if (/podcast.apple.com/.test(window.location.hostname)) {
        let release = retrieveReleaseInfo(release_url, mblinks);
        insertLink(release, release_url);
    } else if (/musicbrainz/.test(window.location.hostname)) {
        insertARLink();
    }
});

function retrieveReleaseInfo(release_url, mblinks) {
    const podcastEpisode = JSON.parse($('[name="schema:podcast-episode"]').text());

    const title = podcastEpisode.name;
    const releaseDates = podcastEpisode.datePublished;
    const releaseDate = releaseDates[releaseDates.length - 1].split(' ');

    const titleSplit = title.split(/(( - )|@)/).filter(s => s && s.trim() !== '' && s.trim() !== '-');
    let artists = titleSplit[1]
        .trim()
        .split(/[,&@]/)
        .map(a => a.trim());
    const name = `${releaseDate[2]}-${releaseDate[1]}-${releaseDate[1]}: ${podcastEpisode.isPartOf}: ${title}`;
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
        type: 'broadcast',
        secondary_types: ['dj-mix'],
        year: releaseDate[2],
        month: releaseDate[1],
        day: releaseDate[1],
        format: 'Digital Media',
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
        link_type: 85, // stream for free
    });

    // Tracks
    const baseDuration = podcastEpisode.duraration.replace('PT', '');
    let tracks = [
        {
            title: name,
            artist_credit: release.artist_credit,
            duration: `${baseDuration.substring(0, baseDuration.indexOf('H'))}:${baseDuration.substring(
                baseDuration.indexOf('H'),
                baseDuration.indexOf('M')
            )}:${baseDuration.substring(baseDuration.indexOf('M'), baseDuration.indexOf('S'))}`,
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
    let tracklist = $('.product-hero-desc__section').text();
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

function insertARLink() {
    const button = document.createElement('button');
    button.innerText = 'Add Podcast ARs';
    button.addEventListener(
        'click',
        () => {
            performARUpdate();
        },
        false
    );
    $('#relationship-editor-form').before(button);
}

function performARUpdate() {
    let promise = Promise.resolve();
    $('.subheader>a').each(function () {
        const artistUrl = this.href;
        promise = promise.then(() => {
            return makeAddArtistPromise(artistUrl);
        });
    });

    promise
        .then(() => {
            return addSeriesPromise();
        })
        .then(() => {
            $('.submit.positive')[0].dispatchEvent(makeClickEvent());
        });
}

function makeAddArtistPromise(artistURL) {
    return new Promise(resolve => {
        $('#release-rels .add-rel')[0].dispatchEvent(makeClickEvent());

        const type = $('.ui-dialog .link-type')[0];
        type.value = 43;
        type.dispatchEvent(makeChangeEvent());

        const input = $('.name.ui-autocomplete-input')[0];

        input.dispatchEvent(makeClickEvent());
        input.value = artistURL;
        input.dispatchEvent(makeKeyDownEvent(13));

        setTimeout(() => {
            $('.ui-dialog .positive')[0].dispatchEvent(makeClickEvent());
            resolve();
        }, 250);
    });
}

function addSeriesPromise() {
    return new Promise(resolve => {
        $('#release-group-rels .add-rel')[0].dispatchEvent(makeClickEvent());

        const groupType = $('.ui-dialog .entity-type')[0];
        groupType.value = 'series';
        groupType.dispatchEvent(makeChangeEvent());

        const input = $('.name.ui-autocomplete-input')[0];

        input.dispatchEvent(makeClickEvent());
        //input.value = 'https://musicbrainz.org/series/10efa767-57d6-404a-abfb-47a3d8fef520';
        input.dispatchEvent(makeKeyDownEvent(13));

        setTimeout(() => {
            $('.ui-dialog .positive')[0].dispatchEvent(makeClickEvent());
            resolve();
        }, 250);
    });
}

function makeClickEvent() {
    const evt = document.createEvent('HTMLEvents');
    evt.initEvent('click', true, true);
    return evt;
}

function makeChangeEvent() {
    const evt = document.createEvent('HTMLEvents');
    evt.initEvent('change', false, true);
    return evt;
}

function makeKeyDownEvent(keyCode) {
    const keyboardEvent = document.createEvent('KeyboardEvent');
    const initMethod = typeof keyboardEvent.initKeyboardEvent !== 'undefined' ? 'initKeyboardEvent' : 'initKeyEvent';
    keyboardEvent[initMethod](
        'keydown', // event type: keydown, keyup, keypress
        true, // bubbles
        true, // cancelable
        unsafeWindow, // view: should be window
        false, // ctrlKey
        false, // altKey
        false, // shiftKey
        false, // metaKey
        keyCode, // keyCode: unsigned long - the virtual key code, else 0
        0 // charCode: unsigned long - the Unicode character associated with the depressed key, else 0
    );
    return keyboardEvent;
}
