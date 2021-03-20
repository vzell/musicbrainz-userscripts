// ==UserScript==
// @name           Download all images for a release from Discogs to disk
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click importing of releases from beatport.com/release pages into MusicBrainz
// @version        2022.03.18.1
// @downloadURL    https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/discogs_image_downloader.user.js
// @updateURL      https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/discogs_image_downloader.user.js
// @include        http://www.discogs.com/*/release/*
// @include        https://www.discogs.com/*/release/*
// @icon           https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

$(document).ready(function () {
    let release_url = window.location.href.replace('/?.*$/', '').replace(/#.*$/, '');
    downloadImages(release_url);
});

// Insert button into page under label information
function downloadImages() {
    const images = JSON.parse(document.querySelector('[data-images]').getAttribute('data-images'));
    images.forEach(image => {
        const link = document.createElement('a');
        link.download = image.full;
        link.href = image.full;
        link.click();
    });
}
