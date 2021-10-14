// ==UserScript==

// @name           Extra utils to Import Discogs releases to MusicBrainz
// @description    Add a button to import Discogs releases table to filter out releases already imported
// @version        2021.10.12.1
// @namespace      http://userscripts.org/users/22504
// @downloadURL    https://raw.githubusercontent.com/mgoldspink/musicbrainz-userscripts/master/discogs_importer_utils.user.js
// @updateURL      https://raw.githubusercontent.com/mgoldspink/musicbrainz-userscripts/master/discogs_importer_utils.user.js
// @include        http*://www.discogs.com/*
// @include        http*://*.discogs.com/*release/*
// @exclude        http*://*.discogs.com/*release/*?f=xml*
// @exclude        http*://www.discogs.com/release/add
// @require        https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js
// @icon           https://raw.githubusercontent.com/mgoldspink/musicbrainz-userscripts/master/assets/images/Musicbrainz_import_logo.png
// @grant          none
// @run-at         document-idle
// ==/UserScript==

const scr = document.createElement('script');
scr.textContent = `$(${insertTableControls});`;
document.body.appendChild(scr);

const link = document.createElement('style');
link.textContent = `.diu_hide { display: none; }`;
document.head.appendChild(link);

function insertTableControls() {
    const btn = document.createElement('button');
    btn.textContent = 'Hide MB';
    btn.addEventListener('click', event => {
        const rows = document.querySelectorAll('.card');
        let count = rows.length;
        rows.forEach(row => {
            const hasNotFound = !!row.querySelector('.title .mb_searchit');
            if (!hasNotFound) {
                row.classList.add('diu_hide');
                count--;
            }
        });
        btn.textContent = `Only showing ${count} rows`;
        event.preventDefault();
        event.stopImmediatePropagation();
    });
    document.querySelector('#layout_buttons').appendChild(btn);
}
