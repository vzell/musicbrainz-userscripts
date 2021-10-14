// ==UserScript==
// @name           MusicBrainz: Set part of DJ Mix recording comments for a release
// @description    Batch set recording comments from a Release page.
// @version        2021.10.09.1
// @namespace      https://github.com/mattgoldspink/musicbrainz-userscripts/
// @author         Matt Goldspink, Michael Wiencek
// @downloadURL    https://raw.githubusercontent.com/mattgoldspink/musicbrainz-userscripts/master/set-part-of-dj-mix-comment.user.js
// @updateURL      https://raw.githubusercontent.com/mattgoldspink/musicbrainz-userscripts/master/set-part-of-dj-mix-comment.user.js
// @match          *://*.musicbrainz.org/release/*
// @exclude        *musicbrainz.org/release/*/*
// @exclude        *musicbrainz.org/release/add*
// @grant          none
// @run-at         document-idle
// @icon           https://github.com/mattgoldspink/musicbrainz-userscripts/raw/mgoldspink/feature_mixesdb/assets/images/Musicbrainz_import_logo.png
// ==/UserScript==

// ==License==
// Copyright (C) 2014 Michael Wiencek
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// Except as contained in this notice, the name(s) of the above copyright
// holders shall not be used in advertising or otherwise to promote the sale,
// use or other dealings in this Software without prior written
// authorization.
// ==/License==

function setRecordingComments() {
    let $tracks;
    let $inputs = $();
    let EDIT_RECORDING_EDIT = 72;

    $('head').append(
        $('<style></style>').text(
            `input.recording-comment { background: inherit; border: 1px #999 solid; width: 32em; margin-left: 0.5em; }
            td.title .comment~.comment { display: none; }`
        )
    );
    if (!location.pathname.match(/^\/release\/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/)) {
        return;
    }

    const MBID_REGEX = /[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/;
    let editing = false,
        activeRequest = null;

    $('body').on('input.rc', '.recording-comment', function () {
        $(this).css('border-color', this.value.replace(/["“]/gi, '') === $(this).data('old').replace(/["“]/gi, '') ? '#999' : 'red');
    });

    const releaseMetaData = JSON.parse($('[type="application/ld+json"').text());

    const types = releaseMetaData.releaseOf.albumProductionType;
    let shouldShowButton = false;
    if (Array.isArray(types)) {
        shouldShowButton = types.includes('http://schema.org/DJMixAlbum');
        if (shouldShowButton) {
            shouldShowButton = types.includes('http://schema.org/CompilationAlbum');
        }
    } else if (typeof types === 'string') {
        shouldShowButton = types === 'http://schema.org/DJMixAlbum' || types === 'http://schema.org/CompilationAlbum';
    }

    if (!shouldShowButton && getDJMixersFromReleaseRelationship().length > 0) {
        shouldShowButton = true;
    }

    if (!shouldShowButton) {
        return;
    }

    const delay = setInterval(function () {
        $tracks = $('.medium tbody tr[id]');

        if ($tracks.length) {
            clearInterval(delay);
        } else {
            return;
        }

        $tracks.each(function () {
            let $td = $(this).children('td:not(.pos):not(.video):not(.rating):not(.treleases)').has('a[href^=\\/recording\\/]'),
                node = $td.children('td > .mp, td > .name-variation, td > a[href^=\\/recording\\/]').filter(':first'),
                $input = $('<input />').addClass('recording-comment').insertAfter(node);

            if (!editing) {
                $input.hide();
            }

            $inputs = $inputs.add($input);
        });

        let release = location.pathname.match(MBID_REGEX)[0];

        $('#part-of-dj-mix-error').show();
        fetch(`/ws/2/release/${release}?inc=recordings&fmt=json`)
            .then(response => response.json())
            .then(data => {
                let recordings = Array.from(data.media)
                    .map(medium => medium.tracks)
                    .flat()
                    .map(track => track.recording);

                let comments = recordings.map(recording => recording.disambiguation);
                let ids = recordings.map(recording => recording.id);

                for (let i = 0, len = comments.length; i < len; i++) {
                    let comment = comments[i];
                    $inputs.eq(i).val(comment).data('old', comment);
                }
                startLoadingAllRecordings(ids);
            })
            .catch(function () {
                $('#part-of-dj-mix-error').show();
            });
    }, 1000);

    function startLoadingAllRecordings(ids) {
        let pendingIds = ids;
        let mapOfIdToIndex = pendingIds.reduce((map, id, i) => {
            map.set(id, i);
            return map;
        }, new Map());
        let loadAllRecordings = setInterval(function () {
            if (pendingIds.length === 0) {
                $('#part-of-dj-mix-error').hide();
                clearInterval(loadAllRecordings);
            }
            let id = pendingIds.pop();
            if (!id) {
                return;
            }
            $('#part-of-dj-mix-error')
                .text(`WARNING: Still loading ${pendingIds.length + 1} recordings`)
                .show();
            fetch(`/ws/2/recording/${id}?inc=releases&fmt=json`)
                .then(response => response.json())
                .then(data => {
                    const releases = Array.from(data.releases);
                    if (releases.length > 1) {
                        const input = $inputs.eq(mapOfIdToIndex.get(id));
                        $(input).after(`<p style="color: red">WARNING! There are ${releases.length} releases used on this recording!`);
                        $('#part-of-dj-mix-warning').show();
                    }
                })
                .catch(function () {
                    pendingIds = pendingIds.concat([id]);
                    $('#part-of-dj-mix-error')
                        .text(`WARNING: Still loading ${pendingIds.length + 1} recordings`)
                        .show();
                });
        }, 1000);
    }

    function getDJMixersFromReleaseRelationship() {
        return Array.from(document.querySelectorAll('.details')).reduce((array, item) => {
            if (item.textContent.startsWith('DJ-mixer')) {
                array.push(item.textContent.split(':')[1]);
            }
            return array;
        }, []);
    }

    function initForm() {
        let $container = $('<div></div>').insertAfter('h2.tracklist');
        $('<button id="add-dj-mix-button">Add DJ-mix recording comments</button>')
            .addClass('styled-button')
            .on('click', function () {
                editing = !editing;
                $('#set-part-of-dj-mix-comments').add($inputs).toggle(editing);
                $(this).text(`${editing ? 'Hide' : 'Edit'} DJ-mix recording comments`);
                if (editing) {
                    $('#all-part-of-dj-mix-comments').focus();
                }
                let djName = 'UNKNOWN';
                const djNames = getDJMixersFromReleaseRelationship();
                if (djNames.length === 1) {
                    djName = djNames[0];
                } else if (djNames.length === 0) {
                    const artistName = document.querySelector('.subheader bdi').textContent;
                    if (artistName.toLowerCase() !== 'various artists') {
                        djName = artistName;
                    }
                } else {
                    document.getElementById(
                        'part-of-dj-mix-comments-edit-note'
                    ).value = `WARNING: Multiple DJ's are on this release. Please manually correct the edit comment on each medium to be correct for: ${djNames.join(
                        ', '
                    )}`;
                }
                if (djName.endsWith('s')) {
                    djName += `’`;
                } else {
                    djName += '’s';
                }
                const defaultComment = `part of ${djName} “${releaseMetaData.name}” DJ-mix`;
                $('#all-part-of-dj-mix-comments').val(defaultComment).trigger('input.rc');
                $inputs.filter(':visible').val(defaultComment).trigger('input.rc');
            })
            .appendTo($container);

        $container.append(
            '\
<table id="set-part-of-dj-mix-comments">\
  <tr>\
    <td><label for="all-part-of-dj-mix-comments">Set all visible comments to:</label></td>\
    <td><input type="text" id="all-part-of-dj-mix-comments" style="width: 32em;"></td>\
  </tr>\
  <tr>\
    <td><label for="part-of-dj-mix-comments-edit-note">Edit note:</label></td>\
    <td><textarea id="part-of-dj-mix-comments-edit-note" style="width: 32em;" rows="5"></textarea></td>\
  </tr>\
  <tr>\
    <td colspan="2" class="auto-editor">\
      <label>\
        <input id="make-part-of-dj-mix-comments-votable" type="checkbox">\
        Make all edits votable.\
      </label>\
    </td>\
  </tr>\
  <tr>\
    <td colspan="2">\
      <p id="part-of-dj-mix-warning" style="color: red">WARNING! Some recordings have multiple releases. Please review them before submitting.</p>\
      <p id="part-of-dj-mix-error" style="color: red">ERROR! Not all data has loaded yet</p>\
    </td>\
  </tr>\
  <tr>\
    <td colspan="2">\
      <button id="submit-part-of-dj-mix-comments" class="styled-button">Submit changes (visible and marked red)</button>\
    </td>\
  </tr>\
</table>'
        );

        $('#set-part-of-dj-mix-comments').hide();

        $('#all-part-of-dj-mix-comments').on('input', function () {
            $inputs.filter(':visible').val(this.value).trigger('input.rc');
        });

        $('#part-of-dj-mix-warning').hide();
        $('#part-of-dj-mix-error').hide();

        const $submitButton = $('#submit-part-of-dj-mix-comments').on('click', function () {
            if (activeRequest) {
                activeRequest.abort();
                activeRequest = null;
                $submitButton.text('Submit changes (marked red)');
                $inputs.prop('disabled', false).trigger('input.rc');
                return;
            }

            $submitButton.text('Submitting...click to cancel!');
            $inputs.prop('disabled', true);

            let editData = [],
                deferred = $.Deferred();

            $.each($tracks, function (i, track) {
                if ($(track).filter(':visible').length > 0) {
                    let $input = $inputs.eq(i),
                        comment = $input.val();
                    if (comment === $input.data('old')) {
                        $input.prop('disabled', false);
                        return;
                    }

                    deferred
                        .done(function () {
                            $input.data('old', comment).trigger('input.rc').prop('disabled', false);
                        })
                        .fail(function () {
                            $input.css('border-color', 'red').prop('disabled', false);
                        });

                    let link = track.querySelector("td a[href^='/recording/']"),
                        mbid = link.href.match(MBID_REGEX)[0];

                    editData.push({ edit_type: EDIT_RECORDING_EDIT, to_edit: mbid, comment: comment });
                }
            });

            if (editData.length === 0) {
                $inputs.prop('disabled', false);
                $submitButton.prop('disabled', false).text('Submit changes (marked red)');
            } else {
                let editNote = $('#part-of-dj-mix-comments-edit-note').val();
                let makeVotable = document.getElementById('make-part-of-dj-mix-comments-votable').checked;

                activeRequest = $.ajax({
                    type: 'POST',
                    url: '/ws/js/edit/create',
                    dataType: 'json',
                    data: JSON.stringify({ edits: editData, editNote: editNote, makeVotable: makeVotable }),
                    contentType: 'application/json; charset=utf-8',
                })
                    .always(function () {
                        $submitButton.prop('disabled', false).text('Submit changes (marked red)');
                    })
                    .done(function () {
                        deferred.resolve();
                    })
                    .fail(function () {
                        deferred.reject();
                    });
            }
        });
    }

    setTimeout(initForm, 500);

    setInterval(() => {
        if (!document.querySelector('#add-dj-mix-button')) {
            initForm();
        }
    }, 1000);
}

if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
    setRecordingComments();
} else {
    document.addEventListener('DOMContentLoaded', setRecordingComments);
}
