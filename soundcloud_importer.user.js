// ==UserScript==
// @name           Import Soundcloud tracks in to MusicBrainz
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click importing of releases from soundcloudev.com/release pages into MusicBrainz
// @version        2022.09.13.17
// @downloadURL    https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/soundcloud_importer.user.js
// @updateURL      https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/soundcloud_importer.user.js
// @include        https://soundcloud.com/*
// @include        https://soundcloud.com/*/*
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @require        lib/mbimport.js
// @require        lib/mblinks.js
// @require        lib/logger.js
// @require        lib/mbimportstyle.js
// @icon           https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// prevent JQuery conflicts, see http://wiki.greasespot.net/@grant
this.$ = this.jQuery = jQuery.noConflict(true);

const DEBUG = false;
if (DEBUG) {
    LOGGER.setLevel('debug');
}

const mbLinks = new MBLinks('SOUNDCLOUD_CACHE', 7 * 24 * 60);

$(document).ready(function () {
    MBImportStyle();

    const current_page_key = getSoundcloudLinkKey(window.location.pathname.replace(/\?.*$/, '').replace(/#.*$/, ''));
    if (!current_page_key) return;

    // Display links of equivalent MusicBrainz entities
    insertMBLinks(current_page_key);

    let current_page_info = link_infos[current_page_key];
    if (current_page_info.type === 'release') {
        let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
        try {
            let release = retrieveReleaseInfo(release_url, mbLinks);
            insertLink(release, release_url);
        } catch (e) {
            // ignore
        }
    }
});

function retrieveReleaseInfo(release_url, mbLinks) {
    const name = $('.soundTitle__title span')[0].innerText;

    const releaseDate = $('.fullHero__uploadTime .relativeTime').attr('dateTime').split('T')[0].split('-');

    const artists = [$('.userBadge__usernameLink span').text()];
    const tracklist = generateTracklistForAnnotation();

    // Release information global to all Beatport releases
    let release = {
        artist_credit: [],
        title: name,
        type: 'other',
        secondary_types: ['dj-mix', 'compilation'],
        year: releaseDate[0],
        month: releaseDate[1],
        day: releaseDate[2],
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
    const duration = $('.playbackTimeline__duration [aria-hidden]').textContent;
    let tracks = [
        {
            title: name,
            artist_credit: release.artist_credit,
            duration: duration,
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
    let tracklist = $('.truncatedAudioInfo__content .sc-text-body').text();
    return tracklist.replace(/\[([^\]]*)\]/g, '&amp;#91;$1&amp;#93;');
}

// Insert button into page under label information
function insertLink(release, release_url) {
    let edit_note = 'Importing from artists Soundcloud.';
    let parameters = MBImport.buildFormParameters(release, edit_note);

    let mbUI = $(`${MBImport.buildFormHTML(parameters)}${MBImport.buildSearchButton(release)}`).hide();

    setTimeout(() => {
        $('.fullHero__title .soundTitle').prepend(mbUI);
        $('form.musicbrainz_import').css({ display: 'inline-block', 'margin-left': '5px' });
        mbUI.slideDown();
    }, 1000);
}

// contains infos for each link key
const link_infos = {};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                              Display links of equivalent MusicBrainz entities                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Insert MusicBrainz links in a section of the page
function insertMBLinks(current_page_key) {
    function searchAndDisplayMbLinkInSection($tr, soundcloud_type, mb_type, nosearch) {
        if (!mb_type) mb_type = defaultMBtype(soundcloud_type);
        $tr.find(`a[mlink^="${soundcloud_type}/"]`).each(function () {
            const $link = $(this);
            if ($link.attr('mlink_stop')) return; // for places
            const mlink = $link.attr('mlink');
            // ensure we do it only once per link
            const done = ($link.attr('mlink_done') || '').split(',');
            for (let i = 0; i < done.length; i++) {
                if (mb_type == done[i]) return;
            }
            done.push(mb_type);
            $link.attr(
                'mlink_done',
                done
                    .filter(function (e) {
                        return e != '';
                    })
                    .join(',')
            );
            if (link_infos[mlink] && link_infos[mlink].type === soundcloud_type) {
                const soundcloud_url = link_infos[mlink].clean_url;
                let cachekey = getCacheKeyFromInfo(mlink, mb_type);
                const has_wrapper = $link.closest('span.mb_wrapper').length;
                if (!has_wrapper) {
                    $link.wrap('<span class="mb_wrapper"><span class="mb_valign"></span></span>');
                }
                if (!nosearch) {
                    // add search link for the current link text
                    const entities = {
                        artist: { mark: 'A' },
                        release: { mark: 'R' },
                        'release-group': { mark: 'G' },
                        place: { mark: 'P' },
                        label: { mark: 'L' },
                    };
                    let mark = '';
                    let entity_name = 'entity';
                    if (mb_type in entities) {
                        mark = entities[mb_type].mark;
                        entity_name = mb_type.replace(/[_-]/g, ' ');
                    }
                    $link
                        .closest('span.mb_wrapper')
                        .prepend(
                            `<span class="mb_valign mb_searchit"><a class="mb_search_link" target="_blank" title="Search this ${entity_name} on MusicBrainz (open in a new tab)" href="${MBImport.searchUrlFor(
                                mb_type,
                                $link.text()
                            )}"><small>${mark}</small>?</a></span>`
                        );
                }
                const insert_normal = function (link) {
                    $link.closest('span.mb_valign').before(`<span class="mb_valign">${link}</span>`);
                    $link.closest('span.mb_wrapper').find('.mb_searchit').remove();
                };

                const insert_stop = function (link) {
                    insert_normal(link);
                    $link.attr('mlink_stop', true);
                };

                let insert_func = insert_normal;
                if (mb_type == 'place') {
                    // if a place link was added we stop, we don't want further queries for this 'label'
                    insert_func = insert_stop;
                }
                mbLinks.searchAndDisplayMbLink(soundcloud_url, mb_type, insert_func, cachekey);
            }
        });
    }

    function debug_color(what, n, id) {
        let colors = [
            '#B3C6FF',
            '#C6B3FF',
            '#ECB3FF',
            '#FFB3EC',
            '#FFB3C6',
            '#FFC6B3',
            '#FFECB3',
            '#ECFFB3',
            '#C6FFB3',
            '#B3FFC6',
            '#B3FFEC',
            '#B3ECFF',
            '#7598FF',
        ];
        if (DEBUG) {
            $(what).css('border', `2px dotted ${colors[n % colors.length]}`);
            let debug_attr = $(what).attr('debug_soundcloud');
            if (!id) id = '';
            if (debug_attr) {
                $(what).attr('debug_soundcloud', `${debug_attr} || ${id}(${n})`);
            } else {
                $(what).attr('debug_soundcloud', `${id}(${n})`);
            }
        }
    }

    let add_mblinks_counter = 0;
    function add_mblinks(_root, selector, types, nosearch) {
        // types can be:
        // 'discogs type 1'
        // ['soundcloud_type 1', 'soundcloud_type 2']
        // [['soundcloud_type 1', 'mb type 1'], 'soundcloud_type 2']
        // etc.
        if (!Array.isArray(types)) {
            // just one string
            types = [types];
        }
        $.each(types, function (idx, val) {
            if (!Array.isArray(val)) {
                types[idx] = [val, undefined];
            }
        });

        LOGGER.debug(`add_mblinks: ${selector} / ${JSON.stringify(types)}`);

        _root.find(selector).each(function () {
            const node = $(this).get(0);
            magnifyLinks(node);
            debug_color(this, ++add_mblinks_counter, selector);
            const that = this;
            $.each(types, function (idx, val) {
                const soundcloud_type = val[0];
                const mb_type = val[1];
                searchAndDisplayMbLinkInSection($(that), soundcloud_type, mb_type, nosearch);
            });
        });
    }

    // Find MB link for the current page and display it next to page title
    let mbLinkInsert = function (link) {
        const $h1 = $('h1');
        const $titleSpan = $h1.children('span[itemprop="name"]');
        if ($titleSpan.length > 0) {
            $titleSpan.before(link);
        } else {
            $h1.prepend(link);
        }
    };
    const current_page_info = link_infos[current_page_key];
    const mb_type = defaultMBtype(current_page_info.type);
    const cachekey = getCacheKeyFromInfo(current_page_key, mb_type);
    mbLinks.searchAndDisplayMbLink(current_page_info.clean_url, mb_type, mbLinkInsert, cachekey);

    const $root = $('body');
    add_mblinks($root, '.soundTitle__username', 'artist');
    add_mblinks($root, '.soundTitle__secondary', 'artist');
    add_mblinks($root, '.userBadge__username', 'artist');
    add_mblinks($root, '.soundTitle__usernameTitleContainer', 'release');
}

function defaultMBtype(soundcloud_type) {
    return soundcloud_type;
}

function getCacheKeyFromInfo(info_key, mb_type) {
    const inf = link_infos[info_key];
    if (inf) {
        if (!mb_type) mb_type = defaultMBtype(inf.type);
        return `${inf.type}/${inf.id}/${mb_type}`;
    }
    return '';
}

// Parse discogs url to extract info, returns a key and set link_infos for this key
// the key is in the form soundcloud_type/discogs_id
function getSoundcloudLinkKey(url) {
    let parts = url.split('/');
    parts = parts.filter(p => p !== '');
    if (parts.length > 0) {
        const type = parts.length == 1 ? 'artist' : 'release';
        const id = parts.length == 1 ? parts[0] : parts[1];
        const key = `${type}/${id}`;
        if (!link_infos[key]) {
            link_infos[key] = {
                type: type,
                id: id,
                clean_url: `https://soundcloud.com/${type === 'artist' ? id : `${parts[0]}/${parts[1]}`}`,
            };
            LOGGER.debug(`getSoundcloudLinkKey:${url} --> ${key}`);
        } else {
            LOGGER.debug(`getSoundcloudLinkKey:${url} --> ${key} (key exists)`);
        }
        return key;
    }
    LOGGER.debug(`getSoundcloudLinkKey:${url} ?`);
    return false;
}
let mlink_processed = 0;

// Normalize Discogs URLs in a DOM tree
function magnifyLinks(rootNode) {
    if (!rootNode) {
        rootNode = document.body;
    }

    // Check if we already added links for this content
    if (rootNode.hasAttribute('mlink_processed')) return;
    rootNode.setAttribute('mlink_processed', ++mlink_processed);

    let elems = rootNode.getElementsByTagName('a');
    if (rootNode.tagName === 'A') {
        elems = [rootNode];
    }
    for (let i = 0; i < elems.length; i++) {
        let elem = elems[i];

        // Ignore empty links
        if (!elem.href || $.trim(elem.textContent) === '' || elem.textContent.substring(4, 0) === 'http') continue;
        if (!elem.hasAttribute('mlink')) {
            elem.setAttribute('mlink', getSoundcloudLinkKey(elem.pathname));
        }
    }
}
