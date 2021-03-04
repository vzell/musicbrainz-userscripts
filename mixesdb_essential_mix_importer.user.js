// ==UserScript==
// @name           Import Essential Mixes from MixesDB to MusicBrainz
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2022.03.04.2
// @downloadURL    https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/mixesdb_essential_mix_importer.user.js
// @updateURL      https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/mixesdb_essential_mix_importer.user.js
// @include        http://www.mixesdb.com/w/*
// @include        https://www.mixesdb.com/w/*
// @include        https://musicbrainz.org/release/*/edit-relationships
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
    if (/mixesdb/.test(window.location.hostname)) {
        let release = retrieveReleaseInfo(release_url);
        insertLink(release, release_url);
    } else if (/musicbrainz/.test(window.location.hostname)) {
        insertARLink();
    }
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
    while (nextSibling.get()[0] && nextSibling.get()[0].id !== 'bodyBottom') {
        const tagName = nextSibling.get()[0].tagName;
        if (tagName == 'OL') {
            $('li', nextSibling).each(function (index) {
                tracklist += `${index + 1}.  ${this.innerText}\n`;
            });
        } else if (tagName == 'DL') {
            tracklist += `\n== ${nextSibling.text()} ==\n`;
        } else if (tagName == 'DIV' && nextSibling.get()[0].classList.contains('list')) {
            nextSibling = $(nextSibling.children()[0]);
            continue;
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

function insertARLink() {
    const button = document.createElement('button');
    button.innerText = 'Add Essential mix ARs';
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
    $('.subheader>a').each(function () {
        const artistURL = this.href;

        $('#release-rels .add-rel')[0].dispatchEvent(makeClickEvent());

        const type = $('.ui-dialog .link-type')[0];
        type.value = 43;
        type.dispatchEvent(makeChangeEvent());

        const input = $('.name.ui-autocomplete-input')[0];

        input.dispatchEvent(makeClickEvent());
        input.value = artistURL;
        input.dispatchEvent(makeKeyDownEvent(13));

        $('.ui-dialog .positive').click();
    });

    $('release-group-rels .add-rel');

    const groupType = $('.ui-dialog .release-group-rels')[0];
    groupType.value = 'series';
    groupType.dispatchEvent(makeChangeEvent());

    const input = $('.name.ui-autocomplete-input')[0];

    input.dispatchEvent(makeClickEvent());
    input.value = 'https://musicbrainz.org/series/10efa767-57d6-404a-abfb-47a3d8fef520';
    input.dispatchEvent(makeKeyDownEvent(13));

    $('.ui-dialog .positive').click();

    $('.submit.positive').click();
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
        window, // view: should be window
        false, // ctrlKey
        false, // altKey
        false, // shiftKey
        false, // metaKey
        keyCode, // keyCode: unsigned long - the virtual key code, else 0
        0 // charCode: unsigned long - the Unicode character associated with the depressed key, else 0
    );
    return keyboardEvent;
}
