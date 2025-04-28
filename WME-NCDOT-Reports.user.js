// ==UserScript==
// @name         WME NCDOT Reports
// @namespace    https://greasyfork.org/users/45389
// @version      2025.04.28.02
// @description  Display NC transportation department reports in WME.
// @author       MapOMatic, The_Cre8r, and ABelter
// @license      GNU GPLv3
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @require https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @grant        GM_xmlhttpRequest
// @connect      ncdot.gov
// @connect      services.arcgis.com

// ==/UserScript==

/* global $ */
/* global OpenLayers */
/* global W */
/* global Components */
/* global I18n */
/* global WazeWrap */

(function() {
    'use strict';

    const REPORTS_URL = 'https://eapps.ncdot.gov/services/traffic-prod/v1/incidents?verbose=true';
    const CAMERAS_URL = 'https://eapps.ncdot.gov/services/traffic-prod/v1/cameras?verbose=true'

    let _window = unsafeWindow ? unsafeWindow : window;
    const STORE_NAME = "nc_dot_report_settings";
    const SCRIPT_NAME = GM_info.script.name;
    const SCRIPT_VERSION = GM_info.script.version.toString();
    const UPDATE_ALERT = true;
    const SCRIPT_CHANGES = [
        '<ul>',
        '<li>CSS fixes to remove conflicts with UR-MP script formatting</li>',
        '</ul>'
    ].join('\n');

    let _imagesPath = 'https://github.com/TheCre8r/WME-NCDOT-Reports/raw/master/';
    let _settings = {};
    let _tabDiv = {}; // stores the user tab div so it can be restored after switching back from Events mode to Default mode
    let _reportsClosures = [];
    let _cameras = [];
    let _lastShownTooltipDiv;
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
                ncdotLayerVisible: _mapLayer.visibility,
                ncdotCameraVisible: _cameraLayer.visibility,
                state: _settings.state,
                showCityCountyCheck: $('#settingsShowCityCounty').is(':checked'),
                hideLocated: $('#settingsHideLocated').is(':checked'),
                hideJump: $('#settingsHideJump').is(':checked'),
                copyPL: $('#settingsCopyPL').is(':checked'),
                copyDescription: $('#settingsCopyDescription').is(':checked'),
                autoOpenClosures: $('#settingsAutoOpenClosures').is(':checked'),
                hidePoly: $('#settingsHidePoly').is(':checked'),
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
        _reportsClosures.forEach(function(report) {
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
        let permalink = document.querySelector(".WazeControlPermalink .permalink").href;
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
            console.log("Closure " + id + " successfully sent to closures sheet");
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
        for (let i=0; i<_reportsClosures.length; i++) {
            if (_reportsClosures[i].id === reportId) { return _reportsClosures[i]; }
        }
    }
    function getCamera(cameraId) {
        for (let i=0; i<_cameras.length; i++) {
            if (_cameras[i].Id === cameraId) { return _cameras[i]; }
        }
    }

    function isHideOptionChecked(reportType) {
        return $('#settingsHideNCDot' + reportType + 'Reports').is(':checked');
    }

    function updateReportsVisibility() {
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
        _reportsClosures.forEach(function(report) {
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
                if (report.imageDiv) { report.imageDiv.hide(); }
            } else {
                visibleCount += 1;
                report.dataRow.show();
                if (report.imageDiv) { report.imageDiv.show(); }
            }
        });
        if (showCity) {
            $('.citycounty').show();
        } else {
            $('.citycounty').hide();
        }
        $('.nc-dot-report-count').text(visibleCount + ' of ' + _reportsClosures.length + ' reports');
    }

    function hideAllPopovers($excludeDiv) {
        _reportsClosures.forEach(function(rpt) {
            let $div = rpt.imageDiv;
            if ((!$excludeDiv || $div[0] !== $excludeDiv[0]) && $div.data('state') === 'pinned') {
                $div.data('state', '');
                removePopup(rpt);
            }
        });
        _cameras.forEach(function(rpt) {
            let $div = rpt.imageDiv;
            if ((!$excludeDiv || $div[0] !== $excludeDiv[0]) && $div.data('state') === 'pinned') {
                $div.data('state', '');
                removePopup(rpt);
            }
        });
		_polyLayer.removeAllFeatures();
    }

    function deselectAllDataRows() {
        _reportsClosures.forEach(function(rpt) {
            rpt.dataRow.css('background-color','white');
        });
    }

    function toggleMarkerPopover($div) {
        hideAllPopovers($div);
        let id = $div.data('reportId');
        let report = getReport(id);
        if ($div.data('state') !== 'pinned') {
            let hideLocated = $('#settingsHideLocated').is(':checked');
            $div.data('state', 'pinned');
            // W.map.getOLMap().moveTo(report.marker.lonlat);

            showPopup(report);
            if (hideLocated) { $('#pushlocated').hide();
                             } else { $('#pushlocated').show(); }
            _mapLayer.setZIndex(10001); // this is to help make sure the report shows on top of the turn restriction arrow layer
            _cameraLayer.setZIndex(10001);

            if (report.archived) {
                $('.btn-archive-dot-report').text("Un-Archive");
            }

            let copyRTCDescription = $('#settingsCopyDescription').is(':checked');
            if (copyRTCDescription) {
                copyToClipboard(report.attributes.incidentType.replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + id);
                WazeWrap.Alerts.success(SCRIPT_NAME,"RTC Description copied to clipboard.");
            }

            $('.btn-archive-dot-report').click(function() {setArchiveReport(report,!report.archived, true, true); buildTable();});
            $('.btn-open-dot-report').click(function(evt) {evt.stopPropagation(); window.open($(this).data('dotReportUrl'),'_blank');});
            $('.reportPopover,.close-popover').click(function(evt) {evt.stopPropagation(); hideAllReportPopovers();});
            $('.btn-copy-description').click(function(evt) {
                evt.stopPropagation();
                let id = $(this).data('dotReportid');
                copyToClipboard(report.attributes.incidentType.replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + id);
            });
            $('.btn-copy-helper-string').click(function(evt) {
                evt.stopPropagation();
                let id = $(this).data('dotReportid');
                copyToClipboard(getReport(id).attributes.incidentType.replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + id + '|' + formatDateTimeStringCH(report.attributes.start) + '|' + formatDateTimeStringCH(report.attributes.end));
            });
            $('.btn-copy-report-url').click(function(evt) {
                evt.stopPropagation();
                let url = $(this).data('dotReporturl');
                copyToClipboard(url);
            });
            $('.btn-push-to-sheet').click(function(evt) {
                evt.stopPropagation();
                let status = $(this).data('dotStatus');
                let id = $(this).data('dotReportid');
                sendToSheet(id,status);
            });
            //$(".close-popover").click(function() {hideAllReportPopovers();});
            $div.data('report').dataRow.css('background-color','#f1f1f1');
        } else {
            $div.data('state', '');
            removePopup(report);
        }
    }

    function toggleReportPopover($div) {
        deselectAllDataRows();
        toggleMarkerPopover($div);
    }

    function hideAllReportPopovers() {
        deselectAllDataRows();
        hideAllPopovers();
    }

    function setArchiveReport(report, archive, updateUi, singleArchive) {
        report.archived = archive;
        if (archive) {
            _settings.archivedReports[report.id] = {lastUpdated: report.attributes.lastUpdate};
            report.imageDiv.addClass('nc-dot-archived-marker');

            let copyLink = $('#settingsCopyPL').is(':checked');
            if (singleArchive && copyLink) {
                let permalink = document.querySelector(".WazeControlPermalink .permalink").href;
                permalink = permalink.replace(/(&s=[0-9]{6,30}&)/,'&').replace('beta','www');

                if (!permalink.includes('segments=')) {
                    WazeWrap.Alerts.error(SCRIPT_NAME,"No segments were selected. Permalink was not copied to clipboard.");
                    return;
                }
                copyToClipboard(permalink);
                WazeWrap.Alerts.success(SCRIPT_NAME,"Permalink copied to clipboard.");
            }
        }else {
            delete _settings.archivedReports[report.id];
            report.imageDiv.removeClass('nc-dot-archived-marker');
        }
        if (updateUi) {
            saveSettingsToStorage();
            updateReportsVisibility();
            hideAllReportPopovers();
        }
    }

    function archiveAllReports(unarchive) {
        _reportsClosures.forEach(function(report) {
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
            //            $('<td>',{class:'clickable centered'}).append($img),
            $('<td>').text(report.attributes.road),
            $('<td>').html('<div class="citycounty" style="border-bottom:1px dotted #dcdcdc;">' + report.attributes.city + ' (' + report.attributes.countyName + ')</div>' + report.attributes.condition),
            $('<td>').text(formatDateTimeStringTable(report.attributes.start)),
            $('<td>').text(formatDateTimeStringTable(report.attributes.end)),
            $('<td>').text(formatDateTimeStringTable(report.attributes.lastUpdate))
        )
        .click(function () {
            let $row = $(this);
            let id = $row.data('reportId');
            let marker = getReport(id).marker;
            let $imageDiv = report.imageDiv;
            //if (!marker.onScreen()) {
            W.map.getOLMap().moveTo(marker.lonlat);
            //}
            toggleReportPopover($imageDiv);

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
                //                $('<th>', {id:'nc-dot-table-category-header',title:'Sort by report type'})).append(
                $('<th>',{id:'nc-dot-table-roadname-header',title:'Sort by road'}).text('Road'),
                $('<th>',{id:'nc-dot-table-desc-header',title:'Sort by description'}).text('Desc'),
                $('<th>',{id:'nc-dot-table-start-header',title:'Sort by start date'}).text('Start'),
                $('<th>',{id:'nc-dot-table-end-header',title:'Sort by end date'}).text('End'),
                $('<th>',{id:'nc-dot-table-updated-header',title:'Sort by updated date'}).text('Updated')
            ));
        _reportsClosures.sort(dynamicSortMultiple(_columnSortOrder));
        _reportsClosures.reverse();
        if ( _reSort % 2 == 1) {
            _reportsClosures.reverse();
        }
        _reportsClosures.forEach(function(report) {
            addRow($table, report);
        });
        $('.nc-dot-table').remove();
        $('#nc-dot-report-table').append($table);
        $('.nc-dot-table th').click(function() {onClickColumnHeader(this);});

        updateReportsVisibility();
    }

    function removeNull(value) {
        if (value === null || value === 'null') {
            return '';
        } else {
            return value;
        }
    }

    function addReportToMap(report){
        let coord = report.geometry;
        let size = new OpenLayers.Size(32,32);
        let offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
        let now = new Date(Date.now());
        let imgName = 'caution.png';
        let attr = report.attributes;

        report.imgUrl = _imagesPath + imgName;
        let icon = new OpenLayers.Icon(report.imgUrl,size,null);
        let marker = new OpenLayers.Marker(
            new OpenLayers.LonLat(report.attributes.longitude,report.attributes.latitude).transform(
                new OpenLayers.Projection("EPSG:4326"),
                W.map.getProjectionObject()
            ),
            icon
        );

        marker.report = report;
        //marker.events.register('click', marker, onMarkerClick);
        _mapLayer.addMarker(marker);

        let detailsUrl = 'https://drivenc.gov/?type=incident&id=';
        let adminUrl = 'https://tims.ncdot.gov/tims/V2/Incident/Details/';
        let TIMSadmin = $('#secureSite').is(':checked');

        let content = [];
        if (attr.incidentType == 'Truck Closure') {
            content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-banner">Truck Closures should <u>not</u> be added to WME!<br>If added by WazeFeed, please delete the closure.</div></div>');
        }
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Road:</div><div class="nc-dot-popover-data">' + removeNull(attr.roadFullName) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">City:</div><div class="nc-dot-popover-data">' + removeNull(attr.city) + '  (' + removeNull(attr.countyName) + ' County)</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Location:</div><div class="nc-dot-popover-data">' + removeNull(attr.location) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Reason:</div><div class="nc-dot-popover-data">' + removeNull(attr.reason) + '</div></div>');
        //content.push('<span style="font-weight:bold">TIMS ID:</span>&nbsp;&nbsp;' + removeNull(attr.Id) + '<br>');
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
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label" style="padding-top: 6px;">RTC Description:</div><div class="nc-dot-popover-data"><div style="display:inline-block;padding-top: 6px;">' + removeNull(attr.incidentType).replace('Night Time','Nighttime').replace('Other',report.attributes.condition) + ' - DriveNC.gov ' + report.id + '&nbsp;&nbsp;</div><button type="button" title="Copy short description to clipboard" class="btn-dot btn-dot-secondary btn-copy-description" data-dot-reportid="' + report.id + '" style="margin-left:6px;"><span class="fa fa-copy" /></button></div></div>');
        if (attr.eventId > 1) { content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">NCDOT Event:</div><div class="nc-dot-popover-data">' + removeNull(attr.event) + '</div></div>'); }
        if (TIMSadmin) {
            content.push('<hr style="margin:5px 0px; border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-dot-report" data-dot-report-url="' + adminUrl + report.id + '" style="float:left;">TIMS Admin <span class="fa fa-external-link" /></button><button type="button" title="Copy TIMS Admin URL to clipboard" class="btn-dot btn-dot-secondary btn-copy-report-url" data-dot-reporturl="' + adminUrl + report.id + '" style="float:left;margin-left:6px;"><span class="fa fa-copy"></span> URL</button>');
        } else {
            content.push('<hr style="margin:5px 0px; border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-dot-report" data-dot-report-url="' + detailsUrl + report.id + '" style="float:left;">DriveNC.gov <span class="fa fa-external-link" /></button><button type="button" title="Copy DriveNC URL to clipboard" class="btn-dot btn-dot-secondary btn-copy-report-url" data-dot-reporturl="' + detailsUrl + report.id + '" style="float:left;margin-left:6px;"><span class="fa fa-copy"></span> URL</button>');
        }
        content.push('<button type="button" style="float:right;" class="btn-dot btn-dot-primary btn-archive-dot-report" data-dot-report-id="' + report.id + '">Archive</button></div>');

        if (_user === 'abelter') {
            content.push('<div style="display:table;width:100%;margin-top:5px;"><button type="button" id="pushlocated" title="Push to NC Closures Sheet as Located" class="btn-dot btn-dot-secondary btn-push-to-sheet" data-dot-reportid="' + report.id + '" data-dot-status="Located"style="margin-right:6px;"><span class="" />Post to Sheet - Located</button>');
            if (_rank >= 3) {
                content.push('<button type="button" title="Push to NC Closures Sheet as Closed" class="btn-dot btn-dot-secondary btn-push-to-sheet" data-dot-reportid="' + report.id + '" data-dot-status="Closed"><span class="" />Post to Sheet - Closed</button>');
            }
            /*content.push('<button type="button" style="float:right;" title="Copy WME Closure Helper string to clipboard" class="btn-dot btn-dot-secondary btn-copy-helper-string" data-dot-reportid="' + report.id + '"><span class="fa fa-copy"></span> CH</button></div>')*/
        }
        content.push('</div></div>');

        let $imageDiv = $(marker.icon.imageDiv)
        .css('cursor', 'pointer')
        .addClass('ncDotReport')
        .on('click', function(evt) {evt.stopPropagation(); toggleReportPopover($(this));})
        .data('reportId', report.id)
        .data('state', '');

        $imageDiv.data('report', report);
        if (report.archived) { $imageDiv.addClass('nc-dot-archived-marker'); }
        report.imageDiv = $imageDiv;
        report.marker = marker;
        report.title = report.id + " - " + attr.condition;
        report.width = "500px";
        report.content = content.join('');
    }

    function showPopup(rpt)
    {
        var popHtml = '<div id="ncPopup" class="reportPop popup" style="max-width:' + rpt.width + ';width:' + rpt.width + ';z-index: 1000;">' +
            '<div class="arrow"></div>' +
            '<div class="pop-title " id="pop-drag">' + rpt.title + '<div style="float:right;"><div class="close-popover">X</div></div></div>' +
            '<div class="pop-content">' + rpt.content + '</div>' +
            '</div>';
        $("body").append(popHtml);
        var iconofs = rpt.imageDiv.offset();
        var center = $("#ncPopup").width()/2;
        var ofs = {};
        ofs.top = iconofs.top + 30;
        ofs.left = iconofs.left - center;
        $("#ncPopup").offset( ofs );
        $("#ncPopup").show();

        // Make the popup draggable
        dragElement(document.getElementById("ncPopup"));
        $(".close-popover").click(function() {
            toggleReportPopover(rpt.imageDiv);
        });

		// Add incident polyline to map
		let poly_zindex = W.map.roadLayer.div.style.zIndex-1;
        let hidePoly = $('#settingsHidePoly').is(':checked');
        if (hidePoly == false) {
            let poly = JSON.parse(rpt.attributes.polyline);
            const pointList = [];
            poly.coordinates.forEach(point => pointList.push(new OpenLayers.Geometry.Point(point[0],
                                                                                           point[1]).transform(
                new OpenLayers.Projection("EPSG:4326"),
                W.map.getProjectionObject()
            ),));
            let lineString = new OpenLayers.Geometry.LineString(pointList);
            const color = "#FF6F61";
            const features = [];
            const vector = new OpenLayers.Feature.Vector(lineString, {
                strokeWidth: 15,//getStrokeWidth,
                strokeDashstyle: 'solid',
                zIndex: poly_zindex,
                color
            });
            features.push(vector);
            _polyLayer.addFeatures(features);
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
        if (autoOpenClosures && (W.selectionManager.getSelectedWMEFeatures().length > 0)) {
            let selFeat = W.selectionManager.getSelectedWMEFeatures();
            let allSeg = selFeat.every(e => e.model.type == 'segment'); // Check to ensure that all selected objects are segments
            if (allSeg) {
                setTimeout(() => {
                    $('.closures-tab').click();
                }, 100);
            }
        }
        //todo experiment
        $("li.closure-item, .add-closure-button").click(function() {
            var tObj = $('#closure_eventId');
            // Make sure the closure event list is available, and that we haven't already messed with it.
            if((tObj !== null) && (tObj.tag != "touchedByURO"))
            {
                var shadowElm = tObj.shadowRoot.querySelectorAll('.selected-value')[0];
                if(shadowElm !== undefined)
                {
                    WazeWrap.Alerts.info(SCRIPT_NAME,'test');
                    var eventText = tObj.shadowRoot.querySelectorAll('.selected-value')[0].innerText;

                    if(eventText == I18n.lookup('closures.choose_event'))
                    {

                        tObj.children[0].click();
                    }
                    // Tag the event list to prevent further processing attempts whilst this closure remains open.
                    tObj.tag = "touchedByURO";
                }
            }
        });
    }

    function processReports(reports, showPopupWhenDone) {
        let reportIDs = {};
        _reportsClosures = [];
        _cameras = [];
        _mapLayer.clearMarkers();
        _cameraLayer.clearMarkers();
		_polyLayer.removeAllFeatures();
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
            'Road Impassable'
        ];
        reports.forEach(function(reportDetails) {
            if (!reportIDs.hasOwnProperty(reportDetails.id)) {
                //console.log(reportDetails)
                reportIDs[reportDetails.id] = reportDetails.id;
                let report = {};
                report.id = reportDetails.id;
                report.attributes = reportDetails;
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
                    _reportsClosures.push(report);
                }
            }
        });
        buildTable();
        $('.nc-dot-refresh-reports').css({'display': 'inline-block'});
        if (showPopupWhenDone) {
            WazeWrap.Alerts.success(SCRIPT_NAME, 'Reports Refreshed - ' + formatDateTimeStringTable(new Date(Date.now())));
        }
        logDebug('Added ' + _reportsClosures.length + ' reports to map.');
    }

    function fetchReports(showPopupWhenDone) {
        logDebug('Fetching reports...');
        $('.nc-dot-report-count').text('Loading reports...');
        $('.nc-dot-refresh-reports').toggleClass("fa-spin");
        GM_xmlhttpRequest({
            method: 'GET',
            url: REPORTS_URL,
            onload: function(res) {
                processReports($.parseJSON(res.responseText), showPopupWhenDone);
                $('.nc-dot-refresh-reports').toggleClass("fa-spin");
            }
        });
    }

    function fetchCameras() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: CAMERAS_URL,
            onload: function(res) {
                let features = $.parseJSON(res.responseText);
                features.forEach(function(report) {
                    if (report.status == "OFF") {
                        return;
                    }
                    let size = new OpenLayers.Size(32,32);
                    let offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
                    let now = new Date(Date.now());
                    let imgName = 'camera.png';
                    report.imgUrl = _imagesPath + imgName;
                    let icon = new OpenLayers.Icon(report.imgUrl,size,null);
                    let marker = new OpenLayers.Marker(
                        new OpenLayers.LonLat(report.longitude,report.latitude).transform(
                            new OpenLayers.Projection("EPSG:4326"),
                            W.map.getProjectionObject()
                        ),
                        icon
                    );

                    marker.report = report;
                    _cameraLayer.addMarker(marker);

                    let re=/window.open\('(.*?)'/;
                    let cameraImgUrl = report.imageURL;
                    let cameraContent = [];
                    cameraContent.push('<img id="camera-img-'+ report.id +'" src=' + cameraImgUrl + '&t=' + new Date().getTime() + ' style="max-width:352px">');
                    //temp removed below until both full-size and refresh buttons can be fixed 2.12.23
					//cameraContent.push('<div><hr style="margin:5px 0px;border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:left;">Open Image Full-Size</button><button type="button" class="btn-dot btn-dot-primary btn-refresh-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:right;"><span class="fa fa-refresh" /></button></div></div>');
                    report.content = cameraContent.join('');
                    report.title = report.displayName;
                    report.width = "370px";
                    let $imageDiv = $(marker.icon.imageDiv)
                    .css('cursor', 'pointer')
                    .addClass('ncDotReport')
                    .data('cameraId', report.id)
                    .on('click', function(evt) {
                        //let $div = $(this);
                        // let camera = getCamera($div.data('cameraId'));
                        evt.stopPropagation();
                        let $div = $(this);
                        hideAllPopovers($div);
                        if ($div.data('state') !== 'pinned') {
                            let id = $div.data('cameraId');
                            $div.data('state', 'pinned');
                            //W.map.moveTo(report.marker.lonlat);
                            showPopup(report);
                            document.getElementById('camera-img-'+id).src = cameraImgUrl + "&t=" + new Date().getTime(); //by default the images are loaded on page load, this line loads the latest image when the pop-up is opened
                            $('.btn-open-camera-img').click(function(evt) {evt.stopPropagation(); window.open($(this).data('cameraImgUrl'),'_blank');});
                            $('.btn-refresh-camera-img').click(function(evt) {evt.stopPropagation(); document.getElementById('camera-img-'+id).src = $(this).data('cameraImgUrl') + "&t=" + new Date().getTime();});
                            $('.reportPopover,.close-popover').click(function(evt) {
                                $div.data('state', '');
                                removePopup(report);
                            });
                            //$(".close-popover").click(function() {hideAllReportPopovers();});
                        } else {
                            $div.data('state', '');
                            removePopup(report);
                        }
                    })
                    .data('cameraId', report.id)
                    .data('state', '');

                    $imageDiv.data('report', report);
                    report.imageDiv = $imageDiv;
                    report.marker = marker;
                    _cameras.push(report);
                });
            }
        });
    }

    function installIcon() {
        OpenLayers.Icon = OpenLayers.Class({
            url: null,
            size: null,
            offset: null,
            calculateOffset: null,
            imageDiv: null,
            px: null,
            initialize: function(a,b,c,d){
                this.url=a;
                this.size=b||{w: 20,h: 20};
                this.offset=c||{x: -(this.size.w/2),y: -(this.size.h)};
                this.calculateOffset=d;
                a=OpenLayers.Util.createUniqueID("OL_Icon_");
                let div = this.imageDiv=OpenLayers.Util.createAlphaImageDiv(a);
                $(div.firstChild).removeClass('olAlphaImg'); // LEAVE THIS LINE TO PREVENT WME-HARDHATS SCRIPT FROM TURNING ALL ICONS INTO HARDHAT WAZERS --MAPOMATIC
            },
            destroy: function(){ this.erase();OpenLayers.Event.stopObservingElement(this.imageDiv.firstChild);this.imageDiv.innerHTML="";this.imageDiv=null; },
            clone: function(){ return new OpenLayers.Icon(this.url,this.size,this.offset,this.calculateOffset); },
            setSize: function(a){ null!==a&&(this.size=a); this.draw(); },
            setUrl: function(a){ null!==a&&(this.url=a); this.draw(); },
            draw: function(a){
                OpenLayers.Util.modifyAlphaImageDiv(this.imageDiv,null,null,this.size,this.url,"absolute");
                this.moveTo(a);
                return this.imageDiv;
            },
            erase: function(){ null!==this.imageDiv&&null!==this.imageDiv.parentNode&&OpenLayers.Element.remove(this.imageDiv); },
            setOpacity: function(a){ OpenLayers.Util.modifyAlphaImageDiv(this.imageDiv,null,null,null,null,null,null,null,a); },
            moveTo: function(a){
                null!==a&&(this.px=a);
                null!==this.imageDiv&&(null===this.px?this.display(!1): (
                    this.calculateOffset&&(this.offset=this.calculateOffset(this.size)),
                    OpenLayers.Util.modifyAlphaImageDiv(this.imageDiv,null,{x: this.px.x+this.offset.x,y: this.px.y+this.offset.y})
                ));
            },
            display: function(a){ this.imageDiv.style.display=a?"": "none"; },
            isDrawn: function(){ return this.imageDiv&&this.imageDiv.parentNode&&11!=this.imageDiv.parentNode.nodeType; },
            CLASS_NAME: "OpenLayers.Icon"
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
        installIcon();
		const POLY_STYLE = {
			strokeColor: '#FF6F61',
			strokeDashstyle: 'solid',
			strokeWidth: '15'
		};
        _mapLayer = new OpenLayers.Layer.Markers("NCDOT Reports", { uniqueName: "__ncDotReports" });
        W.map.addLayer(_mapLayer);
        _mapLayer.setVisibility(_settings.ncdotLayerVisible);
        _mapLayer.displayInLayerSwitcher = true;
        _mapLayer.events.register('visibilitychanged', null, onReportsLayerVisibilityChanged);
        _mapLayer.setZIndex(10000);
        WazeWrap.Interface.AddLayerCheckbox('Display', 'NCDOT Reports', _settings.ncdotLayerVisible, onReportsLayerCheckboxChanged);

        _polyLayer = new OpenLayers.Layer.Vector("NCDOT Report Polylines", { uniqueName: "__ncDotReportPolylines",
            styleMap: new OpenLayers.StyleMap({ default: POLY_STYLE })
			});
        W.map.addLayer(_polyLayer);
        let hidePoly = $('#settingsHidePoly').is(':checked');
        _polyLayer.setVisibility(((_settings.ncdotLayerVisible && hidePoly == false) ? true : false));
		// W.map.setLayerIndex(_polyLayer, W.map.getLayerIndex(W.map.roadLayers[0])-2);
        // HACK to get around conflict with URO+.  If URO+ is fixed, this can be replaced with the setLayerIndex line above.
        let poly_zindex = W.map.roadLayer.div.style.zIndex-1;
        _polyLayer.setZIndex(poly_zindex);
        const checkLayerZIndex = () => { if (_polyLayer.getZIndex() !== poly_zindex) _polyLayer.setZIndex(poly_zindex); };
        setInterval(() => { checkLayerZIndex(); }, 100);
		// END HACK

        _cameraLayer = new OpenLayers.Layer.Markers("NCDOT Cameras", { uniqueName: "__ncDotCameras" });
        W.map.addLayer(_cameraLayer);
        _cameraLayer.setVisibility(_settings.ncdotCameraVisible);
        _cameraLayer.displayInLayerSwitcher = true;
        _cameraLayer.events.register('visibilitychanged', null, onCamerasLayerVisibilityChanged);
        _cameraLayer.setZIndex(10000);
        WazeWrap.Interface.AddLayerCheckbox('Display', 'NCDOT Cameras', _settings.ncdotCameraVisible, onCamerasLayerCheckboxChanged); // Add the layer checkbox to the Layers menu

        // initialize keyboard shortcut for auto opening closure tab
        new WazeWrap.Interface.Shortcut('NCDOTOpenClosuresTab', 'Auto open Closures tab on segments', 'ncdot', 'NCDOT Reports', 'SA+c', toggleAutoOpen, null).add();
    }

    function setEnabled(value) {
        _mapLayer.setVisibility(value);
        let hidePoly = $('#settingsHidePoly').is(':checked');
        _polyLayer.setVisibility(((value && hidePoly == false) ? true : false));
        $('#layer-switcher-item_ncdot_reports').prop('checked', value);
        _settings.ncdotLayerVisible = value;
        const color = value ? '#00bd00' : '#ccc';
        $('span#ncdot-power-btn').css('color', color);
        console.log(color);
        saveSettingsToStorage();
    }

    function setEnabledCam(value) {
        _cameraLayer.setVisibility(value);
        $('#layer-switcher-item_ncdot_cameras').prop('checked', value);
        _settings.ncdotCameraVisible = value;
        const colorCam = value ? '#00bd00' : '#ccc';
        $('span#ncdot-power-btn-cams').css('color', colorCam);
        console.log(colorCam);
        saveSettingsToStorage();
    }

    function onReportsLayerCheckboxChanged(checked) {
        setEnabled(checked)
    }

    function onReportsLayerVisibilityChanged() {
        setEnabled(_mapLayer.visibility);
    }

    function onCamerasLayerCheckboxChanged(checked) {
        setEnabledCam(checked)
    }

    function onCamerasLayerVisibilityChanged() {
        setEnabledCam(_cameraLayer.visibility);
    }

    function onTimsIdGoClick() {
        let $entry = $('#tims-id-entry');
        let id = $entry.val().trim();
        if (id.length > 0) {
            let report = _reportsClosures.find(rpt => rpt.id.toString() === id)
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
        //$('#user-tabs > .nav-tabs').append(_tabDiv.tab);
        //$('#user-info > .flex-parent > .tab-content').append(_tabDiv.panel);
        $('[id^=settings]').change(function(){
            saveSettingsToStorage();
            updateReportsVisibility();
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
        const { user } = W.loginManager;
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
                    .append($('<label>', {for:'settingsAutoOpenClosures'}).html('Auto open Closures tab on segments<br /><em>(keyboard shortcut; default: Alt+Shift+C)</em>')),
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsHidePoly',id:'settingsHidePoly'}))
                    .append($('<label>', {for:'settingsHidePoly'}).html('Hide DriveNC incident polylines from NCDOT Reports layer'))
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
                    class: 'fa fa-video',
                    id: 'ncdot-power-btn-cams',
                    style: `margin-left: 5px;cursor: pointer;color: ${powerButtonColorCam};font-size: 13px;`,
                    title: 'Toggle NCDOT Cameras'
                })
            ).html();

            const { tabLabel, tabPane } = W.userscripts.registerSidebarTab('NCDOT');
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

            await W.userscripts.waitForElementConnected(tabPane);

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
        })(['showCityCountyCheck','hideLocated','hideJump','copyPL','copyDescription','autoOpenClosures','hidePoly','hideArchivedReports','hideAllButWeatherReports', 'secureSite','hideInterstatesReports','hideUSHighwaysReports','hideNCHighwaysReports','hideSRHighwaysReports','hideXDaysReports','hideXDaysNumber'],
           ['settingsShowCityCounty','settingsHideLocated','settingsHideJump','settingsCopyPL','settingsCopyDescription','settingsAutoOpenClosures','settingsHidePoly','settingsHideNCDotArchivedReports','settingsHideNCDotAllButWeatherReports', 'secureSite','settingsHideNCDotInterstatesReports','settingsHideNCDotUSHighwaysReports','settingsHideNCDotNCHighwaysReports','settingsHideNCDotSRHighwaysReports','settingsHideNCDotXDaysReports','settingsHideNCDotXDaysNumber']);
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

        _previousZoom = W.map.getZoom();
        W.map.events.register('moveend',null,function() {if (_previousZoom !== W.map.getZoom()) {hideAllReportPopovers();} _previousZoom=W.map.getZoom();});
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
        _user = WazeWrap.User.Username().toLowerCase();
        _userU = WazeWrap.User.Username();
        _rank = WazeWrap.User.Rank();
        await loadSettingsFromStorage();
        WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, SCRIPT_VERSION, SCRIPT_CHANGES,`" </a><a target="_blank" href='https://github.com/TheCre8r/WME-NCDOT-Reports'>GitHub</a><a style="display:none;" href="`,'');
        initGui();
        _window.addEventListener('beforeunload', function saveOnClose() { saveSettingsToStorage(); }, false);
        log('Initialized.');

        WazeWrap.Events.register('selectionchanged', null, openClosuresTab);
    }

    function onWmeReady() {
        if (WazeWrap && WazeWrap.Ready) {
            logDebug('Initializing...');
            init();
        } else {
            setTimeout(onWmeReady, 100);
        }
    }

    function bootstrap() {
        if (typeof W === 'object' && W.userscripts?.state.isReady) {
            onWmeReady();
        } else {
            document.addEventListener('wme-ready', onWmeReady, { once: true });
        }
    }

    log('Bootstrap...');
    bootstrap();
})();
