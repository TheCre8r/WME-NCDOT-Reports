// ==UserScript==
// @name         WME NCDOT Reports
// @namespace    https://greasyfork.org/users/45389
// @version      2025.07.07.00
// @description  Display NC transportation department reports in WME.
// @author       MapOMatic, The_Cre8r, and ABelter
// @license      GNU GPLv3
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @require      https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js
// @require      https://update.greasyfork.org/scripts/509664/WME%20Utils%20-%20Bootstrap.js
// @grant        GM_xmlhttpRequest
// @connect      ncdot.gov
// @connect      services.arcgis.com
// @downloadURL  https://github.com/TheCre8r/WME-NCDOT-Reports/raw/master/WME-NCDOT-Reports.user.js
// @updateURL    https://github.com/TheCre8r/WME-NCDOT-Reports/raw/master/WME-NCDOT-Reports.meta.js

// ==/UserScript==

/* global $ */
/* global WazeWrap */
/* global turf */

(async function main() {
    'use strict';
    const downloadUrl = 'https://github.com/TheCre8r/WME-NCDOT-Reports/raw/master/WME-NCDOT-Reports.user.js';
    const sdk = await bootstrap();

    const REPORTS_URL = 'https://eapps.ncdot.gov/services/traffic-prod/v1/incidents?verbose=true';
    const CAMERAS_URL = 'https://eapps.ncdot.gov/services/traffic-prod/v1/cameras?verbose=true'

    let _window = unsafeWindow ? unsafeWindow : window;
    const STORE_NAME = "nc_dot_report_settings";
    const SCRIPT_NAME = GM_info.script.name;
    const SCRIPT_VERSION = GM_info.script.version.toString();
    const UPDATE_ALERT = true;
    const SCRIPT_CHANGES = [
        '<ul>',
        '<li>New Setting: Open pop-ups in bottom left instead of centered below marker</li>',
        '<li>New Setting: Auto open pop-ups if map is centered on incident marker (for PLs from Closures Sheet)</li>',
        '<li>New: Button on incident pop-up to zoom and center on incident marker</li>',
        '<li>Fixed: Open camera image full size and refresh camera image</li>',
        '<li>Known issues:<ul><li>Icons appear beneath closures</li><li>Archive/Unarchive All functionality broken</li><li>Auto-open Closures tab when selecting segments broken</li><li>Filters in sidebar will not collapse</li></ul></li>',
        '</ul>'
    ].join('\n');

    const INCIDENT_IMG = 'data:image/png;base64,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'
    const CAMERA_IMG = 'data:image/png;base64,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'
    const TRUCK_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAE30lEQVRYw7WXe0zTVxTHgQ02toLOB5owHkFxQgREwLKB6GDCZlmGEB/N5pZs2bIs2R8kLi57Gdlc5tyWSMRlL3VGDG6ZzmUJ4gbYJyut4ChKkfEUESgULLTYx4+zcy6/Vh51tLQ7ySf9Pc4993vv79xzb/38PDAAeADZhBxCLiAqngv8s0zy8fO1YdAA5BWke9LOwWh9A9w8Xg7th44w6HpU3QiTHIcu0IXsoTa+6jwMkdlNZug68g3IkzdDbWSiSxTJW6Cr9FsgXzQJstzbzmNoRMa/m0Ep3Mo6+SsrH7rLfgDj1WawDOrBMqAHo/Y6m4UrBXuYT116HhibrpGIDiR6oZ2HIE0GqRIka9JA+sRG6D15BkZu98NgV7dL9D03YahaCsq0HOZvkNWRCFISuhAB35vaO0G2LoONSrI6FYZrZZARHgn02hUPB1CqANztH4T63CKQJWSCqZ1SAr72tPM4xHZV/DrURq+HGx98yn5JREFY+LwCyCZ6+1i+NO58lW7tSLwnAr4zKFRs5K3vlrCAfRXnmIg/IhIgIzh0XgFkt8p/ZjFGlPXuzwK/5G7r3tkPtVFJYO7qcQacT8RsAZM2Oyg3PgO6fQeYHsTfHQHryJsaqp/dAbPts8wcqMZRuRIxWwBZ63sfgzI913G7xh0BeZzVykav2/vRnICUhM8JljhFPDVNhCsB7DPgrFFMtKfdEfAirW36dv988qVLAeTmSoQrAfqqGhaLagbaTncEbHfOwNS3cymA2DZLhCsB/ed+Z7E4i4Vut7kjIJk8FSnZ0Ljrtf8UMFtETsjSOf4dXxxlhYm3eHcEBCJjLcXvw+WYDWC7Y5wRsOrH03Ci5OAMGg6XTq0OHOmwRDnDX/O8GFr2fkiXo27vlOhYPlQjZd+O6v5025e/HYriEyE3ahX0d3SyZ7sTN8BbEbFQQxUzNs0pYlTTyGJQBUU77kkhSqVl3FD4MivFE7f6nAKEK+5VQu1lCXu26MFAdl8YssxZMfUXq0GTL4YrL7yEkSbJLc3TcvzT2HUdSNcKWT2wGcemBKwMp2rCOmyWsJHBYhTgz6+CvrPnmQhKPGlcOoy33CCXswvZjJZR8Rus/BNzIRlU2QVgamuHJqkc1JVVUHnyFNhtNiZA/utvoLl4CSS/nAfr8Aio83aw/KFZQBtAVix0S6YSNkn7gjwpiwWlynanUeuY1nubT0+v88AiX58FI3VqVo2RfG8PJWUUiUbWduBzts9TYlFu1G8tBI1oNyhSs9kzetdWchishhGHrqO+OJI9gugcEe3mCVbdOr86BrRhEXStv1QL3MTd6ZPSQm19dS5MoUkA982mUChysakA8dnhdL+7vWu12lJsQjvf48hjSKDXAoqLi4OtVqt6vs71ev01gUCQjU1o3a9FwpEQX0xCaFlZWSbHcab7dW6xWMwikeht9BUhm5BEJJqfBa/+sFDjJRRMpVIdvJ8AFHgCfcS8gEwkAYlCFiP+3ggI4INEBgUFJQwMDMjnnHxaW9X4fhdC634LkoLEIlSEgn3xCShIGBIjFos3Yz4MOzo3m81DQqGwCN/RiedJJAlZjaxEHvXl30QSsRSJkEqlb/L9cxUVFW/w0x2HrOITjz7ZQ37/g/nzQhaNj4+fMRgMx/iZWc4nm8Any86Dv29ejfJfQDgRAqXMri0AAAAASUVORK5CYII=';
    let _settings = {};
    let _allClosures = [];
    let _cameras = [];
    let _tableSortKeys = [];
    let _columnSortOrder = ['attributes.lastUpdate', 'attributes.start', 'attributes.end','attributes.road', 'attributes.condition','attributes.city'];
    let _reportTitles = {incident: 'INCIDENT'};
    let _mapLayer;
    let _polyLayer;
    let _cameraLayer;
    let _user;
    let _userU;
    let _rank;
    let _lastSort;
    let _reSort = 0;

    function log(message) {
        console.log('NCDOT Reports:', message);
    }
    function logDebug(message) {
        console.debug('NCDOT Reports:', message);
    }

    function saveSettingsToStorage() {
        if (localStorage) {
            let currentTime = Date.now();
            let settings = {
                lastVersion: SCRIPT_VERSION,
                ncdotLayerVisible: sdk.LayerSwitcher.isLayerCheckboxChecked({ name: 'NCDOT Reports' }),
                ncdotCameraVisible: sdk.LayerSwitcher.isLayerCheckboxChecked({ name: 'NCDOT Cameras' }),
                state: _settings.state,
                showCityCountyCheck: $('#settingsShowCityCounty').is(':checked'),
                hideLocated: $('#settingsHideLocated').is(':checked'),
                hideJump: $('#settingsHideJump').is(':checked'),
                copyPL: $('#settingsCopyPL').is(':checked'),
                copyDescription: $('#settingsCopyDescription').is(':checked'),
                autoOpenClosures: $('#settingsAutoOpenClosures').is(':checked'),
                hidePoly: $('#settingsHidePoly').is(':checked'),
                positionLeft: $('#settingsPositionLeft').is(':checked'),
                autoOpenPopup: $('#settingsAutoOpenPopup').is(':checked'),
                hideArchivedReports: $('#settingsHideNCDotArchivedReports').is(':checked'),
                hideAllButWeatherReports: $('#settingsHideNCDotAllButWeatherReports').is(':checked'),
                hideInterstatesReports: $('#settingsHideNCDotInterstatesReports').is(':checked'),
                hideUSHighwaysReports: $('#settingsHideNCDotUSHighwaysReports').is(':checked'),
                hideNCHighwaysReports: $('#settingsHideNCDotNCHighwaysReports').is(':checked'),
                hideSRHighwaysReports: $('#settingsHideNCDotSRHighwaysReports').is(':checked'),
                hideXDaysReports: $('#settingsHideNCDotXDaysReports').is(':checked'),
                hideXDaysNumber: $('#settingsHideNCDotXDaysNumber').val(),
                secureSite: $('#secureSite').is(':checked'),
                archivedReports:_settings.archivedReports,
                lastSaved: currentTime
            };
            localStorage.setItem(STORE_NAME, JSON.stringify(settings));
            WazeWrap.Remote.SaveSettings(STORE_NAME, settings);
            logDebug('Settings saved');
        }
    }

    function formatDateTimeString(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleDateString([],{ weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' } ) + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}).replace('24:','00:');
    }

    function formatDateString(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleDateString([],{ month: '2-digit', day: '2-digit', year: 'numeric' } );
    }

    function formatTimeString(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}).replace('24:','00:');
    }

    function formatDateTimeStringTable(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleDateString([],{ month: 'numeric', day: 'numeric', year: '2-digit' } ) + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}).replace('24:','00:');
    }

    function formatDateTimeStringCH(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleDateString(['fr-CA'],{ month: 'numeric', day: 'numeric', year: 'numeric' } ) + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}).replace('24:','00:');
    }

    function dynamicSort(property) {
        let sortOrder = 1;
        if(property[0] === "-") {
            sortOrder = -1;
            property = property.substr(1);
        }
        return function (a,b) {
            let props = property.split('.');
            props.forEach(function(prop) {
                a = a[prop];
                b = b[prop];
            });
            let result = (a < b) ? -1 : (a > b) ? 1 : 0;
            return result * sortOrder;
        };
    }

    function dynamicSortMultiple() {
        /*
     * save the arguments object as it will be overwritten
     * note that arguments object is an array-like object
     * consisting of the names of the properties to sort by
     */
        let props = arguments;
        if (arguments[0] && Array.isArray(arguments[0])) {
            props = arguments[0];
        }
        return function (obj1, obj2) {
            let i = 0, result = 0, numberOfProperties = props.length;
            /* try getting a different result from 0 (equal)
         * as long as we have extra properties to compare
         */
            while(result === 0 && i < numberOfProperties) {
                result = dynamicSort(props[i])(obj1, obj2);
                i++;
            }
            return result;
        };
    }

    function copyToClipboard(text) {
        // create hidden text element, if it doesn't already exist
        let targetId = "_hiddenCopyText_";
        //let isInput = elem.tagName === "INPUT" || elem.tagName === "TEXTAREA";
        let origSelectionStart, origSelectionEnd;
        let target;

        // must use a temporary form element for the selection and copy
        target = document.getElementById(targetId);
        if (!target) {
            target = document.createElement("textarea");
            target.style.position = "absolute";
            target.style.left = "-9999px";
            target.style.top = "0";
            target.id = targetId;
            document.body.appendChild(target);
        }
        //let startTime = new Date(report.beginTime.time);
        //let lastUpdateTime = new Date(report.updateTime.time);

        let $content = $('<div>').html(text);
        $(target).val($content[0].innerText || $content[0].textContent);

        // select the content
        let currentFocus = document.activeElement;
        target.focus();
        target.setSelectionRange(0, target.value.length);

        // copy the selection
        let succeed;
        try {
            succeed = document.execCommand("copy");
        } catch(e) {
            succeed = false;
        }
        // restore original focus
        if (currentFocus && typeof currentFocus.focus === "function") {
            currentFocus.focus();
        }

        target.textContent = "";
        return succeed;
    }

    function copyIncidentIDsToClipboard() {
        let ids = [];
        _allClosures.forEach(function(report) {
            ids.push(report.attributes.id);
        });
        return copyToClipboard(ids.join('\n'));
    }

    function sendToSheet(id,status) {
        let roadName = getReport(id).attributes.roadFullName;
        let closeDate = formatDateString(getReport(id).attributes.start);
        let closeTime = formatTimeString(getReport(id).attributes.start);
        let openDate = formatDateString(getReport(id).attributes.end);
        let openTime = formatTimeString(getReport(id).attributes.end);
        let closureReason = getReport(id).attributes.incidentType.replace('Other',getReport(id).attributes.condition) + ' - ' + getReport(id).attributes.reason;
        let timsURL = 'https://drivenc.gov/?type=incident&id=' + id;
        let closureDirection = getReport(id).attributes.direction;
        let permalink = sdk.Map.getPermalink();
        permalink = permalink.replace(/(&s=[0-9]{6,30}&)/,'&');

        if (!permalink.includes('segments=')) {
            WazeWrap.Alerts.error(SCRIPT_NAME,"No segments are selected. Please select the closed segment(s) in order to pass the permalink to the Closures Sheet.");
            return;
        }

        switch(closureDirection) {
            case 'W':
                closureDirection = 'West';
                break;
            case 'E':
                closureDirection = 'East';
                break;
            case 'N':
                closureDirection = 'North';
                break;
            case 'S':
                closureDirection = 'South';
                break;
            case 'A':
                closureDirection = 'Both';
                break;
            case 'I':
                closureDirection = 'Inner Loop';
                break;
            case 'O':
                closureDirection = 'Outer Loop';
                break;
            default:
        }

        // Variable to hold request
        var request;

        // Abort any pending request
        if (request) {
            request.abort();
        }

        // Let's select and cache all the fields
        var $inputs = {
            status: status,
            editor: _userU,
            roadName: roadName,
            closeDate: closeDate,
            closeTime: closeTime,
            openDate: openDate,
            openTime: openTime,
            closureReason: closureReason,
            closureDirection: closureDirection,
            timsUrl: timsURL,
            permalink: permalink
        };

        // Serialize the data in the form
        var serializedData = $.param($inputs);

        // Fire off the request to /form.php
        request = $.ajax({
            url: "https://script.google.com/macros/s/AKfycby2eH4WGrP3CPL1YEb2g58q49HeB_tch14Ixkrcy6wTwIiJoeCi/exec",
            type: "post",
            data: serializedData
        });

        // Callback handler that will be called on success
        request.done(function (response, textStatus, jqXHR){
            // Log a message to the console
            log("Closure " + id + " successfully sent to closures sheet");
        });

        // Callback handler that will be called on failure
        request.fail(function (jqXHR, textStatus, errorThrown){
            // Log the error to the console
            console.error(
                "The following error occurred: "+
                textStatus, errorThrown
            );
            WazeWrap.Alerts.error(SCRIPT_NAME,"The following error occured. Please try again in a few seconds; if this error persists, please reach out to ABelter with the following information: " + textStatus + " " + errorThrown);
        });

        // Callback handler that will be called regardless
        // if the request failed or succeeded
        request.always(function () {
            // in case we ever want to do anything
        });

    }

    function getReport(reportId) {
        for (let i=0; i<_allClosures.length; i++) {
            if (_allClosures[i].id === reportId) { return _allClosures[i]; }
        }
    }
    function getCamera(cameraId) {
        for (let i=0; i<_cameras.length; i++) {
            if (_cameras[i].id === cameraId) { return _cameras[i]; }
        }
    }

    function isHideOptionChecked(reportType) {
        return $('#settingsHideNCDot' + reportType + 'Reports').is(':checked');
    }

    function updateReportsTableVisibility() {
        hideAllReportPopovers();
        let showCity = $('#settingsShowCityCounty').is(':checked');
        let hideArchived = isHideOptionChecked('Archived');
        let hideAllButWeather = isHideOptionChecked('AllButWeather');
        let hideInterstates = isHideOptionChecked('Interstates');
        let hideUSHighways = isHideOptionChecked('USHighways');
        let hideNCHighways = isHideOptionChecked('NCHighways');
        let hideSRHighways = isHideOptionChecked('SRHighways');
        let xDays = $('#settingsHideNCDotXDaysNumber').val();
        let hideXDays = isHideOptionChecked('XDays') && xDays.length > 0;
        let xDaysDate = new Date();
        xDaysDate.setDate( xDaysDate.getDate() - xDays );
        let visibleCount = 0;
        let hideJump = $('#settingsHideJump').is(':checked');
        if (hideJump) {
            $('#tims-id-jump').hide();
        } else { $('#tims-id-jump').show(); }
        _allClosures.forEach(function(report) {
            let hide =
                hideArchived && report.archived ||
                hideAllButWeather && report.attributes.incidentType !== 'Weather Event' ||
                hideInterstates && report.attributes.road.substring(0,2) == 'I-' ||
                hideUSHighways && report.attributes.road.substring(0,3) == 'US-' ||
                hideNCHighways && report.attributes.road.substring(0,3) == 'NC-' ||
                hideSRHighways && report.attributes.road.substring(0,3) == 'SR-' ||
                hideXDays && Date.parse(report.attributes.lastUpdate) < Date.parse(xDaysDate);
            if (hide) {
                report.dataRow.hide();
                //if (report.imageDiv) { report.imageDiv.hide(); }
            } else {
                visibleCount += 1;
                report.dataRow.show();
                //if (report.imageDiv) { report.imageDiv.show(); } // getFeatureDomElement not working as expected
            }
        });
        if (showCity) {
            $('.citycounty').show();
        } else {
            $('.citycounty').hide();
        }
        $('.nc-dot-report-count').text(visibleCount + ' of ' + _allClosures.length + ' reports');
    }

    function hideAllPopovers() {
        _allClosures.forEach(function(rpt) {
            if (rpt.state == 'pinned') {
                rpt.state = '';
                removePopup(rpt);
            }
        });
        _cameras.forEach(function(cam) {
            if (cam.state == 'pinned') {
                cam.state = ''
                removePopup(cam);
            }
        });
        sdk.Map.removeAllFeaturesFromLayer({layerName: 'NCDOT Report Polylines'})
    }

    function deselectAllDataRows() {
        _allClosures.forEach(function(rpt) {
            rpt.dataRow.css('background-color','white');
        });
    }

    function toggleMarkerPopover(id) {
        let report;
        let type;
        if (id <= 9999) {
            report = getCamera(id);
            type = 'camera'
        }
        else {
            report = getReport(id);
            type = 'incident'
        }
        let rptState = report.state;
        hideAllPopovers();
        if (rptState !== 'pinned') {
            let hideLocated = $('#settingsHideLocated').is(':checked');
            report.state = 'pinned';
            showPopup(report);
            if (hideLocated) {
                $('#pushlocated').hide();
            } else {
                $('#pushlocated').show();
            }

            if (report.archived) {
                $('.btn-archive-dot-report').text("Un-Archive");
            }

            let copyRTCDescription = $('#settingsCopyDescription').is(':checked');
            if (copyRTCDescription && type == 'incident') {
                copyToClipboard(report.attributes.incidentType.replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + id);
                WazeWrap.Alerts.success(SCRIPT_NAME,"RTC Description copied to clipboard.");
            }

            $('.reportPopover,.close-popover').click(function(evt) {
                evt.stopPropagation();
                hideAllReportPopovers();
            });
            $('.btn-archive-dot-report').click(function() {
                setArchiveReport(report,!report.archived, true, true);
                buildTable();
            });
            $('.btn-open-dot-report').click(function(evt) {
                evt.stopPropagation();
                window.open($(this).data('dotReportUrl'),'_blank');
            });
            $('.btn-copy-description').click(function(evt) {
                evt.stopPropagation();
                let id = $(this).data('dotReportid');
                copyToClipboard(report.attributes.incidentType.replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + id);
                WazeWrap.Alerts.success(SCRIPT_NAME,"RTC Description copied to clipboard.");
            });
            $('.btn-copy-report-url').click(function(evt) {
                evt.stopPropagation();
                let url = $(this).data('dotReporturl');
                copyToClipboard(url);
                WazeWrap.Alerts.success(SCRIPT_NAME,"Incident URL copied to clipboard.");
            });
            $('.btn-push-to-sheet').click(function(evt) {
                evt.stopPropagation();
                let status = $(this).data('dotStatus');
                let id = $(this).data('dotReportid');
                sendToSheet(id,status);
            });
            $('.btn-add-rtc').click(function(evt) {
                evt.stopPropagation();
                let id = $(this).data('dotReportid');
                let rtcStart = report.attributes.start;
                if (new Date(rtcStart) < new Date(Date.now())) { rtcStart = new Date(Date.now()); }
                createRTC(getReport(id).attributes.incidentType.replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + id,formatDateString(rtcStart),formatTimeString(rtcStart),formatDateString(report.attributes.end),formatTimeString(report.attributes.end))
            });
            $('.btn-open-camera-img').click(function(evt) {
                evt.stopPropagation();
                window.open($(this).data('cameraImgUrl'),'_blank');
            });
            $('.btn-refresh-camera-img').click(function(evt) {
                evt.stopPropagation();
                document.getElementById('camera-img-'+id).src = $(this).data('cameraImgUrl') + "&t=" + new Date().getTime();
            });
            $('.btn-center-and-zoom').click(function(evt) {
                evt.stopPropagation();
                let zoom = 16;
                if (sdk.Map.getZoomLevel() >= 16 && sdk.Map.getZoomLevel() < 22) {
                    zoom = sdk.Map.getZoomLevel() + 1;
                } else if (sdk.Map.getZoomLevel() == 22) {
                    zoom = 22;
                }
                sdk.Map.setMapCenter({
                    lonLat: { lon: report.attributes.longitude, lat: report.attributes.latitude },
                    zoomLevel: zoom,
                });
                showPopup(report);
            });
            if (type == 'incident') {
                report.dataRow.css('background-color','#f1f1f1');
            }
        } else {
            report.state = '';
            removePopup(report);
        }
    }
    function removeMarkerPopover(id) {
        deselectAllDataRows();
        let report;
        if (id <= 9999) { report = getCamera(id); }
        else { report = getReport(id); }
        report.state = '';
        removePopup(report);
    }

    function toggleReportPopover(id) {
        deselectAllDataRows();
        toggleMarkerPopover(id);
    }

    function hideAllReportPopovers() {
        deselectAllDataRows();
        hideAllPopovers();
    }

    function setArchiveReport(report, archive, updateUi, singleArchive) {
        report.archived = archive;
        if (archive) {
            _settings.archivedReports[report.id] = {lastUpdated: report.attributes.lastUpdate};

            let copyLink = $('#settingsCopyPL').is(':checked');
            if (singleArchive && copyLink) {
                let permalink = sdk.Map.getPermalink();
                permalink = permalink.replace(/(&s=[0-9]{6,30}&)/,'&').replace('beta','www');

                if (!permalink.includes('segments=')) {
                    WazeWrap.Alerts.error(SCRIPT_NAME,"No segments were selected. Permalink was not copied to clipboard.");
                } else {
                    copyToClipboard(permalink);
                    WazeWrap.Alerts.success(SCRIPT_NAME,"Permalink copied to clipboard.");
                }
            }
        }else {
            delete _settings.archivedReports[report.id];
        }
        if (updateUi) {
            saveSettingsToStorage();
            updateReportsTableVisibility();
            hideAllReportPopovers();
            removeReportFromMap(report);
            addReportToMap(report);
        }
    }

    function archiveAllReports(unarchive) {
        _allClosures.forEach(function(report) {
            setArchiveReport(report, !unarchive, false, false);
        });
        saveSettingsToStorage();
        buildTable();
        hideAllReportPopovers();
    }

    function addRow($table, report) {
        let $img = $('<img>', {src:report.imgUrl, class:'table-img'});
        let $row = $('<tr> class="clickable"', {id:'nc-dot-row-'+report.id}).append(
            $('<td>',{class:'centered'}).append(
                $('<input>',{type:'checkbox',title:'Archive',id:'nc-archive-' + report.id, 'data-report-id':report.id}).prop('checked', report.archived).click(
                    function(evt){
                        evt.stopPropagation();
                        let id = $(this).data('reportId');
                        let report = getReport(id);
                        setArchiveReport(report, $(this).is(':checked'), true, false);
                    }
                )
            ),
            $('<td>').text(report.attributes.road),
            $('<td>').html('<div class="citycounty" style="border-bottom:1px dotted #dcdcdc;">' + report.attributes.city + ' (' + report.attributes.countyName + ')</div>' + report.attributes.condition),
            $('<td>').text(formatDateTimeStringTable(report.attributes.start)),
            $('<td>').text(formatDateTimeStringTable(report.attributes.end)),
            $('<td>').text(formatDateTimeStringTable(report.attributes.lastUpdate))
        )
        .click(function () {
            let $row = $(this);
            let id = $row.data('reportId');
            sdk.Map.setMapCenter({
                lonLat: { lon: report.attributes.longitude, lat: report.attributes.latitude }
            });
            toggleReportPopover(id);

        }).data('reportId', report.id);
        report.dataRow = $row;
        $table.append($row);
        $row.report = report;
    }


    function onClickColumnHeader(obj) {
        let prop;
        let showCity = $('#settingsShowCityCounty').is(':checked');
        switch (/nc-dot-table-(.*)-header/.exec(obj.id)[1]) {
            case 'roadname':
                prop = 'attributes.road';
                break;
            case 'start':
                prop = 'attributes.start';
                break;
            case 'desc':
                if(showCity) {
                    prop = 'attributes.city';
                } else {
                    prop = 'attributes.condition';
                }
                break;
            case 'end':
                prop = 'attributes.end';
                break;
            case 'updated':
                prop = 'attributes.lastUpdate';
                break;
            case 'archive':
                prop = 'archived';
                break;
            default:
                return;
        }
        if (prop === _lastSort) {
            ++_reSort;
        } else {
            _reSort = 0;
        }
        let idx = _columnSortOrder.indexOf(prop);
        if (idx > -1) {
            _columnSortOrder.splice(idx, 1);
            _columnSortOrder.reverse();
            _columnSortOrder.push(prop);
            _columnSortOrder.reverse();
            buildTable();
        }
        _lastSort = prop;
    }

    function buildTable() {
        logDebug('Building table');
        let $table = $('<table>',{class:'nc-dot-table'});
        let $th = $('<thead>').appendTo($table);
        $th.append(
            $('<tr>').append(
                $('<th>', {id:'nc-dot-table-archive-header',class:'centered'}).append(
                    $('<span>', {class:'fa fa-archive',style:'font-size:120%',title:'Sort by archived'}))).append(
                $('<th>',{id:'nc-dot-table-roadname-header',title:'Sort by road'}).text('Road'),
                $('<th>',{id:'nc-dot-table-desc-header',title:'Sort by description'}).text('Desc'),
                $('<th>',{id:'nc-dot-table-start-header',title:'Sort by start date'}).text('Start'),
                $('<th>',{id:'nc-dot-table-end-header',title:'Sort by end date'}).text('End'),
                $('<th>',{id:'nc-dot-table-updated-header',title:'Sort by updated date'}).text('Updated')
            ));
        _allClosures.sort(dynamicSortMultiple(_columnSortOrder));
        _allClosures.reverse();
        if ( _reSort % 2 == 1) {
            _allClosures.reverse();
        }
        _allClosures.forEach(function(report) {
            addRow($table, report);
        });
        $('.nc-dot-table').remove();
        $('#nc-dot-report-table').append($table);
        $('.nc-dot-table th').click(function() {onClickColumnHeader(this);});

        updateReportsTableVisibility();
    }

    function removeNull(value) {
        if (value === null || value === 'null') {
            return '';
        } else {
            return value;
        }
    }

    function addReportToMap(report){
        let attr = report.attributes;
        let featureType = 'incident';
        if (attr.incidentType == 'Truck Closure') {
            featureType = 'truck'
        }
        const geo = { type: "Point", coordinates: [ attr.longitude, attr.latitude] };
        sdk.Map.addFeatureToLayer({
            layerName: 'NCDOT Reports',
            feature: {
                id: report.id,
                type: "Feature",
                geometry: geo,
                properties: {
                    type: featureType,
                    archived: report.archived,
                },
            },
        })
        let marker = { geometry: geo };
        let detailsUrl = 'https://drivenc.gov/?type=incident&id=';
        let adminUrl = 'https://tims.ncdot.gov/tims/V2/Incident/Details/';
        let TIMSadmin = $('#secureSite').is(':checked');

        let content = [];
        if (attr.incidentType == 'Truck Closure') {
            content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-banner">Truck Closures should <u>not</u> be added to WME!<br>If added by WazeFeed, please delete the closure.</div></div>');
        }
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Road:</div><div class="nc-dot-popover-data">' + removeNull(attr.roadFullName) + '</div><button type="button" title="Zoom and Center" class="btn-dot btn-dot-secondary btn-center-and-zoom data-dot-reportid="' + report.id + '" style="margin-left:6px;"><span class="fa fa-search-plus" /></button></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">City:</div><div class="nc-dot-popover-data">' + removeNull(attr.city) + '  (' + removeNull(attr.countyName) + ' County)</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Location:</div><div class="nc-dot-popover-data">' + removeNull(attr.location) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Reason:</div><div class="nc-dot-popover-data">' + removeNull(attr.reason) + '</div></div>');
        content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Start Time:</div><div class="nc-dot-popover-data monospace">' + formatDateTimeString(attr.start) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">End Time:</div><div class="nc-dot-popover-data monospace">' + formatDateTimeString(attr.end) + '</div></div>');
        if (attr.constructionDateTime) {
            content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
            content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Closure Date/Time:</div><div class="nc-dot-popover-data monospace" >' + removeNull(attr.constructionDateTime) + '</div></div>');
        }
        content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Last Updated:</div><div class="nc-dot-popover-data monospace">' + formatDateTimeString(attr.lastUpdate) + '</div></div>');
        content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label" style="padding-top: 6px;">RTC Description:</div><div class="nc-dot-popover-data"><div style="display:inline-block;padding-top: 6px;">' + removeNull(attr.incidentType).replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + report.id + '&nbsp;&nbsp;</div><button type="button" title="Copy RTC description to clipboard" class="btn-dot btn-dot-secondary btn-copy-description" data-dot-reportid="' + report.id + '" style="margin-left:6px;"><span class="fa fa-copy" /></button></div></div>');
        if (attr.eventId > 1) { content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">NCDOT Event:</div><div class="nc-dot-popover-data">' + removeNull(attr.event) + '</div></div>'); }
        if (TIMSadmin) {
            content.push('<hr style="margin:5px 0px; border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-dot-report" data-dot-report-url="' + adminUrl + report.id + '" style="float:left;">TIMS Admin <span class="fa fa-external-link" /></button><button type="button" title="Copy TIMS Admin URL to clipboard" class="btn-dot btn-dot-secondary btn-copy-report-url" data-dot-reporturl="' + adminUrl + report.id + '" style="float:left;margin-left:6px;"><span class="fa fa-copy"></span> URL</button>');
        } else {
            content.push('<hr style="margin:5px 0px; border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-dot-report" data-dot-report-url="' + detailsUrl + report.id + '" style="float:left;">DriveNC.gov <span class="fa fa-external-link" /></button><button type="button" title="Copy DriveNC URL to clipboard" class="btn-dot btn-dot-secondary btn-copy-report-url" data-dot-reporturl="' + detailsUrl + report.id + '" style="float:left;margin-left:6px;"><span class="fa fa-copy"></span> URL</button>');
        }
        content.push('<button type="button" style="float:right;" class="btn-dot btn-dot-primary btn-archive-dot-report" data-dot-report-id="' + report.id + '">Archive</button></div>');

        if (_user === 'abelter') {
            content.push('<div style="display:table;width:100%;margin-top:5px;"><button type="button" id="pushlocated" title="Push to NC Closures Sheet as Located" class="btn-dot btn-dot-secondary btn-push-to-sheet" data-dot-reportid="' + report.id + '" data-dot-status="Located" style="margin-right:6px; display:none;"><span class="" />Post to Sheet - Located</button>');
            if (_rank >= 3) {
                content.push('<button type="button" title="Push to NC Closures Sheet as Closed" class="btn-dot btn-dot-secondary btn-push-to-sheet" data-dot-reportid="' + report.id + '" data-dot-status="Closed"><span class="" />Post to Sheet - Closed</button>');
            }
            content.push('<button type="button" title="Add RTC" class="btn-dot btn-dot-secondary btn-add-rtc" data-dot-reportid="' + report.id + '"><span class="fa fa-copy"></span> Add RTC to Selected Segment(s)</button></div>')
        }
        content.push('</div></div>');
        marker.report = report;

        let $imageDiv;
        $imageDiv = sdk.Map.getFeatureDomElement({ featureId: report.id, layerName: 'NCDOT Reports' }); // $("#"+marker.id) //only returns if feature is on screen, so pretty darn useless

        report.imageDiv = $imageDiv;
        report.marker = marker;
        report.title = report.id + " - " + attr.condition;
        report.width = "500px";
        report.state = '';
        report.content = content.join('');
    }

    function removeReportFromMap(report){
        let attr = report.attributes;
        const geo = { type: "Point", coordinates: [ attr.longitude, attr.latitude] };
        sdk.Map.removeFeatureFromLayer({
            layerName: 'NCDOT Reports',
            featureId: report.id
        })
    }

    function showPopup(rpt)
    {
        _previousZoom = sdk.Map.getZoomLevel();
        rpt.title = (rpt.title ? rpt.title : 'Unnamed');
        var popHtml = '<div id="ncPopup" class="reportPop popup" style="max-width:' + rpt.width + ';width:' + rpt.width + ';z-index: 1000;">' +
            '<div class="arrow"></div>' +
            '<div class="pop-title " id="pop-drag">' + rpt.title + '<div style="float:right;"><div class="close-popover">X</div></div></div>' +
            '<div class="pop-content">' + rpt.content + '</div>' +
            '</div>';
        //const $mapEle = sdk.Map.getMapViewportElement(); // returns code not object
        const $mapEle = $(".view-area.olMap");
        $mapEle.append(popHtml);

        var x;
        var y;
        var positionSetting = $('#settingsPositionLeft').is(':checked');
        const mintop = 30;
        const minleft = 30; // $('#sidebarContent')[0].offsetWidth;
        const maxbot = $mapEle[0].clientHeight;
        const maxright = $mapEle[0].clientWidth;
        if ( positionSetting ) {
            var height = $("#ncPopup").height();
            if (height < 307) {
                height = 307;
            }
            y = maxbot - height - 75;
            x = 30;
        } else {
            const wid = $("#ncPopup").width();
            const half = wid/2;
            var pix = sdk.Map.getPixelFromLonLat({lonLat:{lon: rpt.attributes.longitude, lat: rpt.attributes.latitude}});
            //log(['coords from click','x',pix.x, 'y', pix.y].join(' '));
            x = pix.x - half - $('#sidebarContent')[0].offsetWidth - $('#drawer')[0].offsetWidth;
            y = pix.y - $('#app-head')[0].offsetHeight;
            if (y < mintop) { y = mintop; }
            if (y+200 > maxbot) { y = maxbot-200; }
            if (x < minleft) { x = minleft; }
            if (x + wid > maxright) { x = maxright - wid; }
        }
        var ofs = {};
        ofs.top = y;
        ofs.left = x;
        $("#ncPopup").offset( ofs );
        $("#ncPopup").show();

        // Make the popup draggable
        dragElement(document.getElementById("ncPopup"));
        $(".close-popover").click(function() {
            removeMarkerPopover(rpt.id);
        });

		// Add incident polyline to map
        if(rpt.id > 9999) {
            let poly_zindex = sdk.Map.getLayerZIndex({ layerName: 'roads' }) -1;
            let hidePoly = $('#settingsHidePoly').is(':checked');
            if (hidePoly == false) {
                let poly = JSON.parse(rpt.attributes.polyline);
                const color = "#FF6F61";

                // new turf method
                const attr = {
                    id: rpt.id,
                    color: color
                };
                const line = turf.lineString(poly.coordinates, attr, {id: rpt.id});

                sdk.Map.addFeatureToLayer({
                    layerName:'NCDOT Report Polylines',
                    feature: line,
                });
            }
        }
    }

    // dragElement from https://www.w3schools.com/howto/howto_js_draggable.asp
    function dragElement(elmnt) {
      var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      if (document.getElementById("pop-drag")) {
        // if present, the header is where you move the DIV from:
        document.getElementById("pop-drag").onmousedown = dragMouseDown;
      } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        elmnt.onmousedown = dragMouseDown;
      }

      function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
      }

      function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }

    function removePopup(rpt)
    {
        $("#ncPopup").remove();
        $("#ncPopup").hide();
    }

    function openClosuresTab() {
        let autoOpenClosures = $('#settingsAutoOpenClosures').is(':checked');
        const selection = sdk.Editing.getSelection();
        if (autoOpenClosures && selection.objectType === 'segment') {
            let selFeat = sdk.Editing.getSelection();
            let allSeg = selFeat.every(e => e.objectType == 'segment'); // Check to ensure that all selected objects are segments
            if (allSeg) {
                setTimeout(() => {
                    $('.segment-edit-section div.wz-tab-label:nth-of-type(2)').click();
                }, 100);
            }
        }
    }

    function processReports(reports, showPopupWhenDone) {
        let reportIDs = {};
        _allClosures = [];
        _cameras = [];
        fetchCameras();
        logDebug('Processing ' + reports.length + ' reports...');
        let conditionFilter = [
            'Permanent Road Closure',
            'Ramp Closed',
            'Ferry Closed',
            'Local Traffic Only',
            'Rest Area Closed',
            'Road Closed',
            'Road Closed with Detour',
            'Road Impassable',
            'Truck Closure'
        ];
        reports.forEach(function(reportDetails) {
            if (!reportIDs.hasOwnProperty(reportDetails.id)) {
                reportIDs[reportDetails.id] = reportDetails.id;
                let report = {};
                report.id = reportDetails.id;
                report.attributes = reportDetails;
                if (report.attributes.condition == 'Permanent Road Closure') {
                    report.attributes.incidentType = 'Permanent Road Closure';
                }
                if (report.attributes.incidentType == 'Truck Closure') {
                    report.attributes.condition = 'Truck Closure';
                }
                if (conditionFilter.indexOf(report.attributes.condition) > -1 && report.attributes.createdFromConcurrent == false) {
					if (report.attributes.road.substring(0,3) == 'SR-') {
						report.attributes.roadFullName = report.attributes.commonName + (report.attributes.commonName !== report.attributes.road ? ' (' + report.attributes.road.trim() + ')' : '');
					} else {
						report.attributes.roadFullName = report.attributes.road + (report.attributes.commonName && (report.attributes.commonName !== report.attributes.road) ? ' (' + report.attributes.commonName + ')' : '');
					}
                    report.archived = false;
                    if (_settings.archivedReports.hasOwnProperty(report.id)) {
                        if ( _settings.archivedReports[report.id].lastUpdated != report.attributes.lastUpdate) {
                            delete _settings.archivedReports[report.id];
                        } else {
                            report.archived = true;
                        }
                    }
                    addReportToMap(report);
                    _allClosures.push(report);
                }
            }
        });
        buildTable();
        $('.nc-dot-refresh-reports').css({'display': 'inline-block'});
        if (showPopupWhenDone) {
            WazeWrap.Alerts.success(SCRIPT_NAME, 'Reports Refreshed - ' + formatDateTimeStringTable(new Date(Date.now())));
        }
        logDebug('Added ' + _allClosures.length + ' reports to map.');
    }

    function createRTC(reason,startDate,startTime,endDate,endTime) {
        let permalink = sdk.Map.getPermalink();
        permalink = permalink.replace(/(&s=[0-9]{6,30}&)/,'&').replace('beta','www');

        if (!permalink.includes('segments=')) {
            WazeWrap.Alerts.error(SCRIPT_NAME,"No segments selected. Unable to add closure information");
            return;
        }
        //document.querySelector('.segment-edit-section wz-tabs').shadowRoot.queryselector('div.wz-tab-label:nth-of-type(2)').click();
        $(".add-closure-button").click();
        setTimeout(() => {
            $("#closure_reason").val(reason).change();
            $("#closure_startDate").val(startDate).change().trigger('keyup');
            $("#edit-panel div.closures div.form-group.start-date-form-group > div.date-time-picker > wz-text-input.time-picker-input").timepicker('setTime',startTime);
            $("#closure_endDate").val(endDate).change().trigger('keyup');
            $("#edit-panel div.closures div.form-group.end-date-form-group > div.date-time-picker > wz-text-input.time-picker-input").timepicker('setTime',endTime);
            document.querySelector("#closure_eventId > wz-option:nth-child(1)").shadowRoot.querySelector("div").click();
            document.querySelector(".closure-nodes").nextElementSibling.querySelector("wz-select").value = '12142192756';
            document.querySelector(".closure-nodes").nextElementSibling.querySelector("wz-select").setAttribute('placeholder', 'N.C. Department of Transportation');
        }, 100);
    }

    function changeDateField(element, newDate) {
        const newDateObj = $(element).data('daterangepicker')
        newDateObj.setStartDate(newDate)
        $(element).trigger(
            'keyup.daterangepicker',//keyup was apply
            [newDateObj]
        )
    }

    function changeTimeField($element, newtime) {
         $element.timepicker('setTime',newtime);
    }

    function fetchReports(showPopupWhenDone) {
        sdk.Map.removeAllFeaturesFromLayer({layerName: 'NCDOT Reports'});
        sdk.Map.removeAllFeaturesFromLayer({layerName: 'NCDOT Report Polylines'});
        logDebug('Fetching reports...');
        $('.nc-dot-report-count').text('Loading reports...');
        $('.nc-dot-refresh-reports').addClass("fa-spin");
        GM_xmlhttpRequest({
            method: 'GET',
            url: REPORTS_URL,
            onload: function(res) {
                processReports($.parseJSON(res.responseText), showPopupWhenDone);
                $('.nc-dot-refresh-reports').removeClass("fa-spin");
            }
        });
    }

    function fetchCameras() {
        sdk.Map.removeAllFeaturesFromLayer({layerName: 'NCDOT Cameras'})
        GM_xmlhttpRequest({
            method: 'GET',
            url: CAMERAS_URL,
            onload: function(res) {
                let features = $.parseJSON(res.responseText);
                features.forEach(function(report) {
                    const camGeo = { type: "Point", coordinates: [ report.longitude, report.latitude] };
                    report.attributes = report;
                    sdk.Map.addFeatureToLayer({
                        layerName: 'NCDOT Cameras',
                        feature: {
                            id: report.id,
                            type: "Feature",
                            geometry: camGeo,
                            properties: {
                                type: 'camera',
                                status: report.status,
                            },
                        },
                    })
                    let marker = { geometry: camGeo };
                    let cameraImgUrl = report.imageURL;
                    let cameraContent = [];
                    cameraContent.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-data"><img id="camera-img-'+ report.id +'" src=' + cameraImgUrl + '&t=' + new Date().getTime() + ' style="max-width:352px"></div></div>');
                    cameraContent.push('<div><hr style="margin:5px 0px;border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:left;">Open Image Full-Size</button><button type="button" class="btn-dot btn-dot-primary btn-refresh-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:right;"><span class="fa fa-refresh" /></button></div></div>');
                    report.content = cameraContent.join('');
                    report.title = report.displayName;
                    report.width = "370px";
                    let $imageDiv;
                    $imageDiv = sdk.Map.getFeatureDomElement({ featureId: report.id, layerName: 'NCDOT Cameras' }); // $("#"+marker.id) //only returns if feature is on screen, so pretty darn useless // $("#"+marker.id)

                    report.imageDiv = $imageDiv;
                    report.marker = marker;
                    report.state = '';
                    marker.report = report;
                    _cameras.push(report);
                });
            }
        });
    }

    function toggleAutoOpen() {
        $('#settingsAutoOpenClosures').click();
        let autoOpenClosuresSet = $('#settingsAutoOpenClosures').is(':checked');
        if (autoOpenClosuresSet) {
            WazeWrap.Alerts.success(SCRIPT_NAME, 'Auto open Closures tab setting ENABLED.');
        } else {
            WazeWrap.Alerts.info(SCRIPT_NAME, 'Auto open Closures tab setting DISABLED.');
        }

    }

    function init511ReportsOverlay(){
// REPORTS LAYER
        let incident_zindex = sdk.Map.getLayerZIndex({ layerName: 'closures' })+1;
        _mapLayer = sdk.Map.addLayer({
            layerName: 'NCDOT Reports',
            styleRules: [
                {
                    style: {
                        externalGraphic: INCIDENT_IMG,
                        graphicOpacity: 1,
                        graphicHeight: 32,
                        graphicWidth: 32,
                        graphicXOffset: -16,
                        graphicYOffset: -32,
                        graphicZIndex: incident_zindex,
                        cursor: 'pointer'
                    },
                },
                {
                    predicate: (properties)=>{ return properties.type == 'incident'; },
                    style: {
                        externalGraphic: INCIDENT_IMG,
                    }
                },
                {
                    predicate: (properties)=>{ return properties.type == 'truck'; },
                    style: {
                        externalGraphic: TRUCK_IMG,
                    }
                },
                {
                    predicate: (properties)=>{ return properties.archived == true; },
                    style: {
                        graphicOpacity: 0.5,
                    },
                },
            ],
        });
        sdk.Events.trackLayerEvents({ layerName: 'NCDOT Reports' });
        sdk.Map.setLayerVisibility({ layerName: 'NCDOT Reports', visibility: _settings.ncdotLayerVisible });
        sdk.LayerSwitcher.addLayerCheckbox({ name: 'NCDOT Reports' });
        sdk.LayerSwitcher.setLayerCheckboxChecked({ name: 'NCDOT Reports', isChecked: _settings.ncdotLayerVisible });

// POLY LAYER
        const POLY_STYLE = [{
            style: {
                strokeColor: '#FF6F61',
                strokeDashstyle: 'solid',
                strokeOpacity: 1.0,
                strokeWidth: '15'
            }
        }];
        _polyLayer = sdk.Map.addLayer({
            layerName:'NCDOT Report Polylines',
            styleRules: POLY_STYLE,
            zIndexing: true
        });
        let hidePoly = $('#settingsHidePoly').is(':checked');
        sdk.Map.setLayerVisibility({ layerName: 'NCDOT Report Polylines', visibility: ((_settings.ncdotLayerVisible && hidePoly == false) ? true : false) })
        let poly_zindex = sdk.Map.getLayerZIndex({ layerName: 'roads' }) - 1;
        sdk.Map.setLayerZIndex({ layerName: 'NCDOT Report Polylines', zIndex: poly_zindex })
        const checkLayerZIndex = () => { if (sdk.Map.getLayerZIndex({ layerName: 'NCDOT Report Polylines' }) !== poly_zindex) sdk.Map.setLayerZIndex({ layerName: 'NCDOT Report Polylines', zIndex: poly_zindex }) };
        setInterval(() => { checkLayerZIndex(); }, 100);

// CAMERA LAYER
        _cameraLayer = sdk.Map.addLayer({
            layerName: 'NCDOT Cameras',
            styleRules: [
                {
                    style: {
                        externalGraphic: CAMERA_IMG,
                        graphicOpacity: 1,
                        graphicHeight: 32,
                        graphicWidth: 32,
                        graphicXOffset: -16,
                        graphicYOffset: -32,
                        cursor: 'pointer'
                    },
                },
                {
                    predicate: (properties)=>{ return properties.status == 'OFF'; },
                    style: {
                        graphicOpacity: 0.5,
                    }
                },

            ]
        });
        sdk.Events.trackLayerEvents({ layerName: 'NCDOT Cameras' });
        sdk.Map.setLayerVisibility({ layerName: 'NCDOT Cameras', visibility: _settings.ncdotCameraVisible });
        sdk.LayerSwitcher.addLayerCheckbox({ name: 'NCDOT Cameras' });
        sdk.LayerSwitcher.setLayerCheckboxChecked({ name: 'NCDOT Cameras', isChecked: _settings.ncdotCameraVisible });

// EVENTS
        sdk.Events.on({ eventName: 'wme-layer-checkbox-toggled', eventHandler: onLayerChanged });
        sdk.Events.on({ eventName: "wme-layer-feature-clicked", eventHandler: onFeatureClick });
        sdk.Events.on({ eventName: "wme-map-move-end", eventHandler: onMapMove });

// initialize keyboard shortcut for auto opening closure tab
        sdk.Shortcuts.createShortcut({
            callback: toggleAutoOpen,
            description: 'Auto open Closures tab on segments',
            shortcutId: 'NCDOTOpenClosuresTab',
            shortcutKeys: 'SA+c'
        });
    }


    function setEnabled(value) {
        hideAllReportPopovers();
        sdk.Map.setLayerVisibility({ layerName: 'NCDOT Reports', visibility: value });
        sdk.LayerSwitcher.setLayerCheckboxChecked({ name: 'NCDOT Reports', isChecked: value });
        let hidePoly = $('#settingsHidePoly').is(':checked');
        sdk.Map.setLayerVisibility({ layerName: 'NCDOT Report Polylines', visibility: ((value && hidePoly == false) ? true : false) })
        _settings.ncdotLayerVisible = value;
        if(value){
            fetchReports(true);
        }
        const color = value ? '#00bd00' : '#ccc';
        $('span#ncdot-power-btn').css('color', color);
        saveSettingsToStorage();
    }

    function setEnabledCam(value) {
        hideAllReportPopovers();
        sdk.Map.setLayerVisibility({ layerName: 'NCDOT Cameras', visibility: value });
        sdk.LayerSwitcher.setLayerCheckboxChecked({ name: 'NCDOT Cameras', isChecked: value });
        _settings.ncdotCameraVisible = value;
        if(value){
            fetchCameras();
        }
        const colorCam = value ? '#00bd00' : '#ccc';
        $('span#ncdot-power-btn-cams').css('color', colorCam);
        saveSettingsToStorage();
    }

    function onLayerChanged(args) {
        switch (args.name) {
            case 'NCDOT Reports':
                setEnabled(args.checked)
                break;
            case 'NCDOT Cameras':
                setEnabledCam(args.checked)
                break;
            default:
                throw new Error('Unexpected layer switcher name.');
        }
    }

    function onFeatureClick(e) {
        log('Layer: "'+e.layerName + '" feature clicked: ' + e.featureId);
        toggleReportPopover(e.featureId);
    }

    function onMapMove() {
        // build out functionality to fetch incident updates on major map moves (i.e. not just panning around an existing incidents)
        if (true) { // replace with setting for whether to fetch incident updates on each map move
            //fetchReports(true);
        }
        // function to open pop-up if map is centered on pin (like... exactly)
        if ($('#settingsAutoOpenPopup').is(':checked')) {
            let center = sdk.Map.getMapCenter();
            for (let i=0; i<_allClosures.length; i++) {
                if (_allClosures[i].attributes.longitude == parseFloat(center.lon.toFixed(5)) && _allClosures[i].attributes.latitude == parseFloat(center.lat.toFixed(5))) {
                    toggleReportPopover(_allClosures[i].id);
                }
            }
        }
    }

    function onTimsIdGoClick() {
        let $entry = $('#tims-id-entry');
        let id = $entry.val().trim()
        if (id.length > 0) {
            let report = _allClosures.find(rpt => rpt.id.toString() === id)
            if (report) {
                report.dataRow.click();
                $entry.css({'background-color':'#afa'});
                setTimeout(() => $entry.css({'background-color':'rgb(242, 243, 244)'}), 1500);
                setTimeout(() => $entry.val(''), 1500);
            } else {
                $entry.css({'background-color':'#faa'});
                setTimeout(() => $entry.css({'background-color':'rgb(242, 243, 244)'}), 1500);
            };
        }
    }

    function restoreUserTab() {
        $('[id^=settings]').change(function(){
            saveSettingsToStorage();
            updateReportsTableVisibility();
        });

        $('.nc-dot-refresh-reports').click(function(e) {
            hideAllReportPopovers();
            fetchReports(true);
            e.stopPropagation();
        });
        $('#ncdotFilterLabel').click(function(e) {
            $('#ncdotFilterLabel .fa-caret-down').toggleClass("fa-flip-vertical");
        });
        $('#closures-sheet-go').click(function(evt) {evt.stopPropagation(); window.open('https://www.wazenc.us/closures','_blank');});
        $('#tims-id-go').click(onTimsIdGoClick);
        $('#tims-id-entry').on('keyup', e => {
            if (e.keyCode == 13) {
                onTimsIdGoClick();
            };
        });
    }

    function onModeChanged(model, modeId, context) {
        hideAllReportPopovers();
        if(!modeId || modeId === 1) {
            restoreUserTab();
        }
    }

    async function initUserPanel() {
            const content = $('<div>').append(
            $('<div>', {id:'nc-dot-header'}).append(
                $('<span>', {id:'nc-dot-title'}).text(SCRIPT_NAME),
                $('<span>', {id:'nc-dot-version'}).text(SCRIPT_VERSION)
            ),
            $('<div>', {style: 'margin:3px 0px;'}).append(
                $('<button>', {id:'closures-sheet-go', class:'btn-dot btn-dot-primary'}).html('Open NC Closures Sheet <span class="fa fa-external-link" />')
            ),
            $('<ul>', {id:'ncdot-tabs', class:'nav nav-tabs'}).append(
                $('<li>',{class:'active'}).append(
                    $('<a>',{id:'ncdot-tabstitle-closures',href:'#ncdot-tabs-closures','data-toggle':'tab'}).text('Closures')
                ),
                $('<li>').append(
                    $('<a>',{id:'ncdot-tabstitle-settings',href:'#ncdot-tabs-settings','data-toggle':'tab'}).text('Settings')
                ),
                $('<li>').append(
                    $('<a>',{id:'ncdot-tabstitle-sm',style:'display:none',href:'#ncdot-tabs-sm','data-toggle':'tab'}).text('SMs')
                )
            ),
            $('<div>',{id:'ncdot-tab-content',class:'tab-content'}).append(
                $('<div>',{id:'ncdot-tabs-closures',class:'tab-pane active'}).append(
                    $('<div>', {id:'tims-id-jump',style:'width: 100%; text-align:center;'}).append(
                        $('<span>', {id:'tims-id-label'}).text('Jump to Incident:'),
                        $('<input>', {id:'tims-id-entry', type:'text', placeholder:'TIMS ID'}),
                        $('<button>', {id:'tims-id-go', class:'btn-dot btn-dot-secondary'}).text('Go')
                    ),
                    $('<label id="ncdotFilterLabel" style="width:100%; cursor:pointer; border-bottom: 1px solid #e0e0e0; margin-top:9px;" data-toggle="collapse" data-target="#ncDotFilterCollapse"><span class="fa fa-caret-down" style="margin-right:5px;font-size:120%;"></span>Filters</label>'),
                    $('<div>',{id:'ncDotFilterCollapse',class:'collapse',style:'font-size:12px;'}
                     ).append(
                        $('<div>',{class:'controls-container',style:'font-weight:bold;display:block;'}).text('Hide Reports... ')
                    ).append(
                        $('<div>',{class:'controls-container',style:'width:60%; display:inline-block;'})
                        .append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotArchivedReports',id:'settingsHideNCDotArchivedReports'}))
                            .append($('<label>', {for:'settingsHideNCDotArchivedReports'}).text('Archived'))
                        ).append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotAllButWeatherReports',id:'settingsHideNCDotAllButWeatherReports'}))
                            .append($('<label>', {for:'settingsHideNCDotAllButWeatherReports'}).text('All but Weather Events'))
                        )
                        .append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotXDaysReports',id:'settingsHideNCDotXDaysReports'}))
                            .append($('<label>', {for:'settingsHideNCDotXDaysReports'}).text('All but Updated in last'))
                            .append($('<input>', {type:'number',min:'1',style:'margin: 0 5px;width:40px;height:23px;',name:'settingsHideNCDotXDaysNumber',id:'settingsHideNCDotXDaysNumber'}))
                            .append($('<label>', {for:'settingsHideNCDotXDaysNumber',style:'font-weight:normal;'}).text(' days'))
                        )
                    ).append(
                        $('<div>',{class:'controls-container',style:'width:40%; display:inline-block;'})
                        .append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotInterstatesReports',id:'settingsHideNCDotInterstatesReports'}))
                            .append($('<label>', {for:'settingsHideNCDotInterstatesReports'}).text('Interstates'))
                        ).append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotUSHighwaysReports',id:'settingsHideNCDotUSHighwaysReports'}))
                            .append($('<label>', {for:'settingsHideNCDotUSHighwaysReports'}).text('US Highways'))
                        ).append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotNCHighwaysReports',id:'settingsHideNCDotNCHighwaysReports'}))
                            .append($('<label>', {for:'settingsHideNCDotNCHighwaysReports'}).text('NC Highways'))
                        ).append(
                            $('<div>',{class:'controls-container'})
                            .append($('<input>', {type:'checkbox',name:'settingsHideNCDotSRHighwaysReports',id:'settingsHideNCDotSRHighwaysReports'}))
                            .append($('<label>', {for:'settingsHideNCDotSRHighwaysReports'}).text('NC SRs'))
                        )
                    ),
                    $('<div>', {id:'nc-dot-report-table'}).append(
                        $('<div>').append(
                            $('<span>', {title:'Click to refresh DOT reports', class:'fa fa-refresh refreshIcon nc-dot-refresh-reports nc-dot-table-label', style:'cursor:pointer;'})
                        ).append(
                            $('<span>',{class:'nc-dot-table-label nc-dot-report-count count'})
                        ).append(
                            $('<span>',{class:'nc-dot-table-label nc-dot-table-action right'}).text('Archive all').click(function() {
                                WazeWrap.Alerts.confirm(SCRIPT_NAME, "Are you sure you want to archive all reports?", () => {
                                    archiveAllReports(false)
                                },null);
                            })
                        ).append(
                            $('<span>', {class:'nc-dot-table-label right', style:'padding:0px 2px;'}).text('|')
                        ).append(
                            $('<span>',{class:'nc-dot-table-label nc-dot-table-action right'}).text('Un-Archive all').click(function() {
                                WazeWrap.Alerts.confirm(SCRIPT_NAME, "Are you sure you want to un-archive all reports?", () => {
                                    archiveAllReports(true)
                                },null);
                            })
                        )
                    )
                ),
                $('<div>',{id:'ncdot-tabs-settings',class:'tab-pane'}).append(
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsShowCityCounty',id:'settingsShowCityCounty'}))
                    .append($('<label>', {for:'settingsShowCityCounty'}).text('Show City and County in Description Column')),
                    $('<div>',{class:'controls-container hide-located-setting',style:'display:none'})
                    .append($('<input>', {type:'checkbox',name:'settingsHideLocated',id:'settingsHideLocated'}))
                    .append($('<label>', {for:'settingsHideLocated'}).text('Hide "Post to Sheet - Located" Button')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsHideJump',id:'settingsHideJump'}))
                    .append($('<label>', {for:'settingsHideJump'}).text('Hide "Jump to Incident" Tool')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsCopyDescription',id:'settingsCopyDescription'}))
                    .append($('<label>', {for:'settingsCopyDescription'}).text('Copy RTC Description when opening report')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsCopyPL',id:'settingsCopyPL'}))
                    .append($('<label>', {for:'settingsCopyPL'}).text('Copy Permalink when archiving report')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsAutoOpenClosures',id:'settingsAutoOpenClosures'}))
                    .append($('<label>', {for:'settingsAutoOpenClosures'}).html('Auto open Closures tab on segments<br /><em>(enable/disable using Alt+Shift+C)</em>')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsHidePoly',id:'settingsHidePoly'}))
                    .append($('<label>', {for:'settingsHidePoly'}).html('Hide DriveNC incident polylines from NCDOT Reports layer')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsPositionLeft',id:'settingsPositionLeft'}))
                    .append($('<label>', {for:'settingsPositionLeft'}).html('Open pop-ups at bottom left of window instead of centered on marker')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsAutoOpenPopup',id:'settingsAutoOpenPopup'}))
                    .append($('<label>', {for:'settingsAutoOpenPopup'}).html('Open pop-up automatically if map is centered on incident lat/lon (designed for opening PLs)'))
                ),
                $('<div>',{id:'ncdot-tabs-sm',class:'tab-pane'}).append(
                    $('<div>', {id:'sm-active-closures'}).append(
                        $('<button type="button" class="btn-dot btn-dot-primary" style="">Copy Active IDs to clipboard</button>').click(function() {
                            copyIncidentIDsToClipboard();
                            WazeWrap.Alerts.success(SCRIPT_NAME, 'IDs have been copied to the clipboard.');
                        }),
                        $('<div>',{class:'controls-container'})
                        .append($('<input>', {type:'checkbox',name:'secureSite',id:'secureSite'}).change(function(){
                            saveSettingsToStorage();
                            hideAllReportPopovers();
                            fetchReports(true);
                        }))
                        .append($('<label>', {for:'secureSite'}).text('Use TIMS Admin site instead of DriveNC'))
                    )
                )
            )
        ).html();

            const powerButtonColor = _settings.ncdotLayerVisible ? '#00bd00' : '#ccc';
            const powerButtonColorCam = _settings.ncdotCameraVisible ? '#00bd00' : '#ccc';
            const labelText = $('<div>').append(
                $('<span>', { title: 'NCDOT Reports' }).html('<img style="max-width:25px;" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAYCAYAAACmwZ5SAAACwUlEQVRYR82YOWhUURSGv3/iLq6oRQgiFiKSKmoQEUGbiEEbca1SWIiIS2ejjQvYaCFiKSgqQQuX4K4ImkIULVQQ7AQXEjWLoOJyjxy5kUckk/dm5k1m4DJ35p17zv/d9dwnKvfZLmmrmX0GvHwCAvAT+A78Ar4CH4D3sXjdnxWAuliSdf9vqGdKSB+qnqR7BfQnDctFPydpc7lO8mpvZkeAvZUAbpJ0DFiel9gK+X1rZg2lAnu70cAPSc+BxgqJysuNL5s6M2vMAjwK2AB0FgqFQ2bm0/cbMDEvlWX6/Q28MLP9wG3Af49PDSypG5gB9AFTyhSTd/M+SSdCCG/iZunxfMB60wC7zW5JR/NWWQX/PcWApwI7JO0BpldBTDVCdCeBxwLbHE7SYqAlnoHVEFKVGGZ2IAncJulUVSKPQBBJ7SGELQ48AWiQdB2YOwJaKhnSzOwe8ExSE7AImCTpdAihzQM5cIek1oxRewBf42k2vYyuK2Lu4LuA48AsoGvAqyS9BBakCPPUzM4Dj4CHMfGoB2YD/u1HlZ/JY+KsmS9pfQq/uZiY2SagfbBzHyEfKU/Qx0XBk4GZEcCf9QJ34mUgkzhJF4F1mRpVwNj3ohCC584+GI8jw1/PeU/JOZI64wyoAEoqFw8kvTOzjW5tZvuAg/+mdCoX5Rn5pWJJnEH1kuYBXnwZ5N3hHWa2Jik/74DFusqXkZ/9qyWdjfVyutbi5uRL08trM1voF5xaAU7qaJV0wZP7Eonvm9nheEko6mIkR3iwsBZJ1zJmd/1mthM4E9+uDNtftQTsYldKupLyytllZst86g5LmTCoNWCXtkLSZc+QioA8MTPP9f3dWaZPLQI7wFJJd+Pm8x+Qma0FrmYijca1CuzymiXdAKYlwczsJrCqFNhqJB6l6hpo11woFE6GEL7EI+cjcAm4VarjP70usQeYszuIAAAAAElFTkSuQmCC" />'),
                $('<span>', {
                    class: 'fa fa-map-marker',
                    id: 'ncdot-power-btn',
                    style: `margin-left: 5px;cursor: pointer;color: ${powerButtonColor};font-size: 13px;`,
                    title: 'Toggle NCDOT Reports'
                }),
                $('<span>', {
                    class: 'fa fa-play-circle',
                    id: 'ncdot-power-btn-cams',
                    style: `margin-left: 5px;cursor: pointer;color: ${powerButtonColorCam};font-size: 13px;`,
                    title: 'Toggle NCDOT Cameras'
                })
            ).html();

            const { tabLabel, tabPane } = await sdk.Sidebar.registerScriptTab();
            tabLabel.innerHTML = labelText;
            tabPane.innerHTML = content;
            // Fix tab content div spacing.
            $(tabPane).parent().css({ width: 'auto', padding: '6px' });
            $('#ncdot-power-btn').click(evt => {
                evt.stopPropagation();
                setEnabled(!_settings.ncdotLayerVisible);
            });
            $('#ncdot-power-btn-cams').click(evt => {
                evt.stopPropagation();
                setEnabledCam(!_settings.ncdotCameraVisible);
            });

        restoreUserTab();
        if (_user === 's18slider' || _user === 'the_cre8r' || _user === 'hiroaki27609' || _user === 'elijahpruitt' || _user === 'abelter') {
            $('#ncdot-tabstitle-sm').show();
        }
        if (_user === 'abelter') {
            $('.hide-located-setting').show();
        }

        (function setChecks(settingProps, checkboxIds) {
            for (let i=0; i<settingProps.length; i++) {
                if (_settings[settingProps[i]]) { $('#' + checkboxIds[i]).attr('checked', 'checked'); }
            }
            $('#settingsHideNCDotXDaysNumber').attr('value', _settings.hideXDaysNumber)
        })(['showCityCountyCheck','hideLocated','hideJump','copyPL','copyDescription','autoOpenClosures','hidePoly','positionLeft','autoOpenPopup','hideArchivedReports','hideAllButWeatherReports', 'secureSite','hideInterstatesReports','hideUSHighwaysReports','hideNCHighwaysReports','hideSRHighwaysReports','hideXDaysReports','hideXDaysNumber'],
           ['settingsShowCityCounty','settingsHideLocated','settingsHideJump','settingsCopyPL','settingsCopyDescription','settingsAutoOpenClosures','settingsHidePoly','settingsPositionLeft','settingsAutoOpenPopup','settingsHideNCDotArchivedReports','settingsHideNCDotAllButWeatherReports', 'secureSite','settingsHideNCDotInterstatesReports','settingsHideNCDotUSHighwaysReports','settingsHideNCDotNCHighwaysReports','settingsHideNCDotSRHighwaysReports','settingsHideNCDotXDaysReports','settingsHideNCDotXDaysNumber']);
    }

    function initGui() {
        init511ReportsOverlay();
        initUserPanel();
        fetchReports(false);

        let classHtml = [
            '.nc-dot-table th,.nc-dot-table td,.nc-dot-table tr {cursor:pointer; font: 11px sans-serif;} ',
            '.nc-dot-table .centered {text-align:center;} ',
            '.nc-dot-table th:hover,.nc-dot-table tr:hover {background-color:aliceblue; outline: -webkit-focus-ring-color auto 5px;} ',
            '.nc-dot-table th:hover {color:#00a4eb; border-color:whitesmoke; } ',
            '.nc-dot-table {border:1px solid gray; border-collapse:collapse; width:100%; font-size:83%;margin:0px 0px 0px 0px} ',
            '.nc-dot-table th,.nc-dot-table td {border:1px solid #dcdcdc;} ',
            '.nc-dot-table td,.nc-dot-table th {color:black; padding:1px 2px;} ',
            '.nc-dot-table th {background-color:#dcdcdc;} ',
            '.nc-dot-table .table-img {max-width:12px; max-height:12px;} ',
            '#nc-dot-header {margin-bottom:5px;}',
            '#nc-dot-title {font-size:15px;font-weight:600;}',
            '#nc-dot-version {font-size:11px;margin-left:10px;color:#aaa;}',
            '.tooltip.top > .tooltip-arrow {border-top-color:white;} ',
            '.tooltip.bottom > .tooltip-arrow {border-bottom-color:white;} ',
            '.close-popover {text-decoration:none;padding:0px 10px;border-radius:20px;border-width:0px;background-color:rgb(255, 255, 255);color: rgb(0, 164, 235);cursor:pointer;} .close-popover:hover {background-color:rgb(234, 241, 246);} ',
            '#nc-dot-refresh-popup {position:absolute;z-index:9999;top:80px;left:650px;background-color:rgb(120,176,191);e;font-size:120%;padding:3px 11px;box-shadow:6px 8px rgba(20,20,20,0.6);border-radius:5px;color:white;} ',
            '.refreshIcon:hover {color:#00a4eb} .refreshIcon:active{ text-shadow: 0px 0px; }',
            '.nc-dot-archived-marker {opacity:0.5;} ',
            '.nc-dot-table-label {font-size:85%;} .nc-dot-table-action:hover {color:#00a4eb;cursor:pointer} .nc-dot-table-label.right {float:right} .nc-dot-table-label.count {margin-left:4px;}',
            '.reportPop {display: block; position: absolute; width: 500px;left: 30%;top: 35%;background: #fff;display: none;}',
            '.pop-title {background: #efefef;border: #ddd solid 1px;position: relative;display: block;cursor:all-scroll;padding: 5px 10px;}',
            '.pop-content {display: block;font-family: sans-serif;padding: 5px 10px;}',
            '.nc-dot-popover-cont {display: flex;}',
            '.nc-dot-popover-label {font-size:13px; font-weight:bold; width: 125px; display: inline-block;}',
            '.nc-dot-popover-banner {font-size:13px; font-weight:bold; width: 480px; display: inline-block; background:#ffff00; text-align:center;}',
            '.nc-dot-popover-data {flex: 1; font-size:13px;}',
            '.monospace {font-family:monospace !important;}',
            '.btn-dot { display:inline-block; align-items: center; font-family: Gotham-Rounded, Rubik, sans-serif; font-size: 12px; font-weight: 500;height: 28px;justify-content: center;line-height: 14px;min-width: 48px;text-align: center;user-select: none;white-space: nowrap; border-width: 1px; border-style: solid; border-color: transparent;border-image: initial;border-radius: 20px;outline: none;padding: 0px 16px;}',
            '.btn-dot-primary { background-color: #00a4eb; color: #fff; }',
            '.btn-dot-primary:hover { background-color: #0595d3; color: #fff;}',
            '.btn-dot-primary:focus { background-color: #0985bb; color: #fff;}',
            '.btn-dot-secondary { background-color: rgb(242, 243, 244); color: rgb(0, 164, 235);padding: 0px 12px;}',
            '.btn-dot-secondary:hover { background-color: rgb(234, 241, 246);}',
            '.btn-dot-secondary:focus { background-color: rgb(234, 241, 246); box-sizing: border-box; border-width: 1px; border-style: solid; border-color: rgb(0, 164, 235); border-image: initial;}',
            '.dot-header {float:left;max-width:430px;color:rgb(0, 164, 235);font-family: Gotham-Rounded, Rubik, sans-serif;font-size:14px; font-weight:400;}',
            '.camera {max-width: 320px;}',
            '#tims-id-jump {background-color: #fff; box-sizing: border-box; border-radius: 6px;border-color:rgb(242, 243, 244);border-width: 0px 0px 1px; margin: 0px; outline: none;}',
            '#tims-id-entry {background-color: rgb(242, 243, 244); width:70px; margin:2px 5px !important; box-sizing: border-box; color: rgb(32, 33, 36); display: inline-block; font-size: 12px; line-height: 14px;font-family: inherit; border-radius: 6px;border-width: 0px; margin: 0px; outline: none; transition: border-bottom-left-radius 0.3s cubic-bezier(0.25, 0.1, 0.25, 1) 0s, border-bottom-right-radius 0.3s 0s; padding: 0px 10px;}',
            '#tims-id-label {font-family: "Rubik", "Helvetica Neue", Helvetica, "Open Sans", sans-serif; font-size: 11px; width: 100%; color: #354148;}',
            '#sidepanel-ncdot .tab-pane { padding: 1px !important; }',
            '#ncdot-tab-content { padding: 1px !important; }',
			'#ncdot-tab-content > .tab-pane {width: 295px !important;}',
            '#ncdot-tab-content .controls-container > label { word-break: break-word; white-space: normal !important; }',
            '.layer-switcher ul[class^="collapsible"] { max-height: none; }'
        ].join('');
        $('<style type="text/css">' + classHtml + '</style>').appendTo('head');

        _previousZoom = sdk.Map.getZoomLevel();
        sdk.Events.on({ eventName: 'wme-map-zoom-changed', eventHandler: function() {if (_previousZoom !== sdk.Map.getZoomLevel()) {hideAllReportPopovers();} _previousZoom=sdk.Map.getZoomLevel();} });
    }

    let _previousZoom;

    async function loadSettingsFromStorage() {
        let serverSettings = await WazeWrap.Remote.RetrieveSettings(STORE_NAME);
        let settingsText = localStorage.getItem(STORE_NAME);
        let settings;
        if (settingsText !== '[object Object]') {
            settings = $.parseJSON(localStorage.getItem(STORE_NAME));
        }
        if(serverSettings && serverSettings.lastSaved > settings.lastSaved){
            $.extend(settings, serverSettings);
        }
        if(!settings) {
            settings = {
                lastVersion:null,
                ncdotLayerVisible:true,
                ncdotCameraVisible:true,
                showCityCountyCheck:false,
                hideLocated:false,
                hideJump:false,
                copyPL:true,
                copyDescription:true,
                autoOpenClosures:false,
                hidePoly:false,
                positionLeft:false,
                autoOpenPopup:false,
                hideArchivedReports:true,
                hideAllButWeatherReports:false,
                hideInterstatesReports:false,
                hideUSHighwaysReports:false,
                hideNCHighwaysReports:false,
                hideSRHighwaysReports:false,
                hideXDaysReports:false,
                hideXDaysNumber:7,
                secureSite:false,
                archivedReports:{},
                lastSaved: 0
            };
        } else {
            settings.ncdotLayerVisible = (settings.ncdotLayerVisible === true);
            settings.ncdotCameraVisible = (settings.ncdotCameraVisible === true);
            if(typeof settings.hideArchivedReports === 'undefined') { settings.hideArchivedReports = true; }
            settings.archivedReports = settings.archivedReports ? settings.archivedReports : {};
        }
        _settings = settings;
    }

    async function init() {
        const u = sdk.State.getUserInfo();
        _user = u.userName.toLowerCase();
        _userU = u.userName;
        _rank = u.rank + 1;
        await loadSettingsFromStorage();
        WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, SCRIPT_VERSION, SCRIPT_CHANGES,`" </a><a target="_blank" href='https://github.com/TheCre8r/WME-NCDOT-Reports'>GitHub</a><a style="display:none;" href="`,'');
        initGui();
        _window.addEventListener('beforeunload', function saveOnClose() { saveSettingsToStorage(); }, false);
        log('Initialized.');

        sdk.Events.on({eventName: "wme-selection-changed", eventHandler: () => { openClosuresTab } });
    }

    init();
})();
