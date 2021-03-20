// ==UserScript==
// @name           Download all images for a release from Discogs to disk
// @author         mattgoldspink
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @description    One-click downloading of all images on discogs release.
// @version        2022.03.20.3
// @downloadURL    https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/discogs_image_downloader.user.js
// @updateURL      https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/discogs_image_downloader.user.js
// @include        http://www.discogs.com/*/release/*
// @include        https://www.discogs.com/*/release/*
// @icon           https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

if (document.readyState != 'loading') {
    addDownloadImagesButton();
} else {
    document.addEventListener('DOMContentLoaded', addDownloadImagesButton);
}

// Insert button into page
function addDownloadImagesButton() {
    const images = JSON.parse(document.querySelector('[data-images]').getAttribute('data-images'));

    const button = document.createElement('a');
    button.innerText = 'Download all';
    button.addEventListener(
        'click',
        event => {
            event.preventDefault();
            images.forEach(image => {
                const link = document.createElement('a');
                link.download = image.full;
                link.href = image.full;
                link.click();
            });
        },
        false
    );

    const more = document.querySelector('.image_gallery_more');
    more.appendChild(button);
}
