// ==UserScript==
// @name         WME North Carolina DOT Reports
// @namespace    https://greasyfork.org/users/45389
// @version      2020.08.21.01
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
/* global GM_info */
/* global W */
/* global GM_xmlhttpRequest */
/* global unsafeWindow */
/* global Components */
/* global I18n */
/* global WazeWrap */

(function() {
    'use strict';

    const REPORTS_URL = 'https://tims.ncdot.gov/tims/api/incidents/verbose';
    const CAMERAS_URL = 'https://services.arcgis.com/NuWFvHYDMVmmxMeM/ArcGIS/rest/services/NCDOT_TIMSCameras/FeatureServer/0/query?where=Latitude+%3E+0&objectIds=&time=&geometry=&geometryType=esriGeometryPoint&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pjson&token='

    let _window = unsafeWindow ? unsafeWindow : window;
    const STORE_NAME = "nc_dot_report_settings";
    const SCRIPT_NAME = GM_info.script.name;
    const SCRIPT_VERSION = GM_info.script.version.toString();
    const UPDATE_ALERT = true;
    const SCRIPT_CHANGES = [
        '<ul>',
        '<li>Fixed camera source; added image refresh functionality</li>',
        '<li>Fixed 24:00 times to 00:00</li>',
        '<li>Fixed "Hide All but Weather Events" filter option</li>',
        '<li>Fixed automatic un-archive if TIMS incident updated</li>',
        '<li>Added additional filters: Hide Interstates, Hide US Highways, Hide NC Highways, Hide NC Secondary Routes, Hide All but Incidents Updated in the last x days</li>',
        '<li>Added option to show City and County in description column; when enabled, this column becomes sortable by City name</li>',
        '<li>Added Closure Date/Time info from DriveNC when available (e.g. daily/nightly closures details)</li>',
        '<li>Table sorting: Changed default sort to show most recent updates first; sorting is now reversible</li>',
        '<li>Added WazeWrap settings sync and alerts (including alerts history)</li>',
        '<li>Fresh coat of paint: Updated icons, buttons, colors</li>',
        '</ul>'
    ].join('\n');

    let _imagesPath = 'https://github.com/abelter/WME-NCDOT-Reports/raw/master/';
    let _settings = {};
    let _tabDiv = {}; // stores the user tab div so it can be restored after switching back from Events mode to Default mode
    let _reportsClosures = [];
    //let _reportsClearedOrLanes = []; // future functionality
    let _cameras = [];
    let _lastShownTooltipDiv;
    let _tableSortKeys = [];
    let _columnSortOrder = ['attributes.LastUpdate', 'attributes.Start', 'attributes.End','attributes.Road', 'attributes.Condition','attributes.City'];
    let _reportTitles = {incident: 'INCIDENT'};
    let _mapLayer;
    let _user;
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
            let settings = {
                lastVersion: SCRIPT_VERSION,
                layerVisible: _mapLayer.visibility,
                state: _settings.state,
                showCityCountyCheck: $('#settingsShowCityCounty').is(':checked'),
                hideArchivedReports: $('#settingsHideNCDotArchivedReports').is(':checked'),
                hideAllButWeatherReports: $('#settingsHideNCDotAllButWeatherReports').is(':checked'),
                hideInterstatesReports: $('#settingsHideNCDotInterstatesReports').is(':checked'),
                hideUSHighwaysReports: $('#settingsHideNCDotUSHighwaysReports').is(':checked'),
                hideNCHighwaysReports: $('#settingsHideNCDotNCHighwaysReports').is(':checked'),
                hideSRHighwaysReports: $('#settingsHideNCDotSRHighwaysReports').is(':checked'),
                hideXDaysReports: $('#settingsHideNCDotXDaysReports').is(':checked'),
                hideXDaysNumber: $('#settingsHideNCDotXDaysNumber').val(),
                archivedReports:_settings.archivedReports
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

    function formatDateTimeStringTable(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleDateString([],{ month: 'numeric', day: 'numeric', year: '2-digit' } ) + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}).replace('24:','00:');
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
            ids.push(report.attributes.Id);
        });
        return copyToClipboard(ids.join('\n'));
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
        _reportsClosures.forEach(function(report) {
            let hide =
                hideArchived && report.archived ||
                hideAllButWeather && report.attributes.IncidentType !== 'Weather Event' ||
                hideInterstates && report.attributes.Road.substring(0,2) == 'I-' ||
                hideUSHighways && report.attributes.Road.substring(0,3) == 'US-' ||
                hideNCHighways && report.attributes.Road.substring(0,3) == 'NC-' ||
                hideSRHighways && report.attributes.Road.substring(0,3) == 'SR-' ||
                hideXDays && Date.parse(report.attributes.LastUpdate) < Date.parse(xDaysDate);
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
                $div.popover('hide');
            }
        });
        _cameras.forEach(function(rpt) {
            let $div = rpt.imageDiv;
            if ((!$excludeDiv || $div[0] !== $excludeDiv[0]) && $div.data('state') === 'pinned') {
                $div.data('state', '');
                $div.popover('hide');
            }
        });
    }

    function deselectAllDataRows() {
        _reportsClosures.forEach(function(rpt) {
            rpt.dataRow.css('background-color','white');
        });
    }

    function toggleMarkerPopover($div) {
        hideAllPopovers($div);
        if ($div.data('state') !== 'pinned') {
            let id = $div.data('reportId');
            let report = getReport(id);
            $div.data('state', 'pinned');
            W.map.getOLMap().moveTo(report.marker.lonlat);
            $div.popover('show');
            _mapLayer.setZIndex(1000000000); // this is to help make sure the report shows on top of the turn restriction arrow layer
             if (report.archived) {
                $('.btn-archive-dot-report').text("Un-Archive");
            }
            $('.btn-archive-dot-report').click(function() {setArchiveReport(report,!report.archived, true); buildTable();});
            $('.btn-open-dot-report').click(function(evt) {evt.stopPropagation(); window.open($(this).data('dotReportUrl'),'_blank');});
            $('.reportPopover,.close-popover').click(function(evt) {evt.stopPropagation(); hideAllReportPopovers();});
            $('.btn-copy-dot-report').click(function(evt) {
                evt.stopPropagation();
                let id = $(this).data('dotReportid');
                copyToClipboard(getReport(id).attributes.IncidentType.replace('Night Time','Nighttime') + ' - DriveNC.gov ' + id);
            });
            $('.btn-copy-report-url').click(function(evt) {
                evt.stopPropagation();
                let url = $(this).data('dotReporturl');
                copyToClipboard(url);
            });
            //$(".close-popover").click(function() {hideAllReportPopovers();});
            $div.data('report').dataRow.css('background-color','#f1f1f1');
        } else {
            $div.data('state', '');
            $div.popover('hide');
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

    function setArchiveReport(report, archive, updateUi) {
        report.archived = archive;
        if (archive) {
            _settings.archivedReports[report.id] = {lastUpdated: report.attributes.LastUpdate};
            report.imageDiv.addClass('nc-dot-archived-marker');
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
            setArchiveReport(report, !unarchive, false);
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
                        setArchiveReport(report, $(this).is(':checked'), true);
                    }
                )
            ),
//            $('<td>',{class:'clickable centered'}).append($img),
            $('<td>').text(report.attributes.Road),
            $('<td>').html('<div class="citycounty" style="border-bottom:1px dotted #dcdcdc;">' + report.attributes.City + ' (' + report.attributes.CountyName + ')</div>' + report.attributes.Condition),
            $('<td>').text(formatDateTimeStringTable(report.attributes.Start)),
            $('<td>').text(formatDateTimeStringTable(report.attributes.End)),
            $('<td>').text(formatDateTimeStringTable(report.attributes.LastUpdate))
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
                prop = 'attributes.Road';
                break;
            case 'start':
                prop = 'attributes.Start';
                break;
            case 'desc':
                if(showCity) {
                    prop = 'attributes.City';
                } else {
                    prop = 'attributes.Condition';
                }
                break;
            case 'end':
                prop = 'attributes.End';
                break;
            case 'updated':
                prop = 'attributes.LastUpdate';
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
            new OpenLayers.LonLat(report.attributes.Longitude,report.attributes.Latitude).transform(
                new OpenLayers.Projection("EPSG:4326"),
                W.map.getProjectionObject()
            ),
            icon
        );

        let popoverTemplate = ['<div class="reportPopover popover" style="max-width:500px;width:500px;">',
                               '<div class="arrow"></div>',
                               '<div class="popover-title"></div>',
                               '<div class="popover-content" style="font-size:12px;">',
                               '</div>',
                               '</div>'].join('');
        marker.report = report;
        //marker.events.register('click', marker, onMarkerClick);
        _mapLayer.addMarker(marker);

        let detailsUrl = 'https://drivenc.gov/default.aspx?type=incident&id=';
        let eventLookup = {1:"None", 138:"Hurricane Matthew"};
        let content = [];
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Road:</div><div class="nc-dot-popover-data">' + removeNull(attr.RoadFullName) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">City:</div><div class="nc-dot-popover-data">' + removeNull(attr.City) + '  (' + removeNull(attr.CountyName) + ' County)</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Location:</div><div class="nc-dot-popover-data">' + removeNull(attr.Location) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Reason:</div><div class="nc-dot-popover-data">' + removeNull(attr.Reason) + '</div></div>');
        //if (eventLookup.hasOwnProperty(attr.EventID)) { content.push('<span style="font-weight:bold">Event Name:</span>&nbsp;&nbsp;' + eventLookup[attr.EventID] + '<br>'); }
        //content.push('<span style="font-weight:bold">TIMS ID:</span>&nbsp;&nbsp;' + removeNull(attr.Id) + '<br>');
        content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Start Time:</div><div class="nc-dot-popover-data monospace">' + formatDateTimeString(attr.Start) + '</div></div>');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">End Time:</div><div class="nc-dot-popover-data monospace">' + formatDateTimeString(attr.End) + '</div></div>');
        if (attr.ConstructionDateTime) {
            content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
            content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Closure Date/Time:</div><div class="nc-dot-popover-data monospace" >' + removeNull(attr.ConstructionDateTime) + '</div></div>');
        }
        content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label">Last Updated:</div><div class="nc-dot-popover-data monospace">' + formatDateTimeString(attr.LastUpdate) + '</div></div>');
        content.push('<hr style="margin:4px 0px; border-color:#dcdcdc">');
        content.push('<div class="nc-dot-popover-cont"><div class="nc-dot-popover-label" style="padding-top: 6px;">RTC Description:</div><div class="nc-dot-popover-data">' + removeNull(attr.IncidentType).replace('Night Time','Nighttime') + ' - DriveNC.gov ' + report.id + '&nbsp;&nbsp;<button type="button" title="Copy short description to clipboard" class="btn-dot btn-dot-secondary btn-copy-dot-report" data-dot-reportid="' + report.id + '" style="margin-left:6px;"><span class="fa fa-copy" /></button></div></div>');
        content.push('<hr style="margin:5px 0px; border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-dot-report" data-dot-report-url="' + detailsUrl + report.id + '" style="float:left;">Open in DriveNC.gov</button><button type="button" title="Copy DriveNC URL to clipboard" class="btn-dot btn-dot-secondary btn-copy-report-url" data-dot-reporturl="' + detailsUrl + report.id + '" style="float:left;margin-left:6px;"><span class="fa fa-copy" /> URL</button><button type="button" style="float:right;" class="btn-dot btn-dot-primary btn-archive-dot-report" data-dot-report-id="' + report.id + '">Archive</button></div></div></div>');

        let $imageDiv = $(marker.icon.imageDiv)
        .css('cursor', 'pointer')
        .addClass('ncDotReport')
        .attr({
            'data-toggle':'popover',
            title:'',
            'data-content':content.join(''),
            'data-original-title':'<div style"width:100%;"><div class="dot-header"><strong>' + attr.Id + ':</strong>&nbsp;' + attr.RoadFullName + ' - ' + attr.Condition + '</div><div style="float:right;"><a class="close-popover" href="javascript:void(0);">X</a></div><div style="clear:both;"</div></div>'
        })

        .popover({trigger: 'manual', html:true,placement: 'auto top', template:popoverTemplate})
        .on('click', function(evt) {evt.stopPropagation(); toggleReportPopover($(this));})
        .data('reportId', report.id)
        .data('state', '');

        $imageDiv.data('report', report);
        if (report.archived) { $imageDiv.addClass('nc-dot-archived-marker'); }
        report.imageDiv = $imageDiv;
        report.marker = marker;
    }

    function processReports(reports, showPopupWhenDone) {
        let reportIDs = {};
        _reportsClosures = [];
        //_reportsClearedOrLanes = [];
        _cameras = [];
        _mapLayer.clearMarkers();
        fetchCameras();
        logDebug('Processing ' + reports.length + ' reports...');
        let conditionFilter = [
            'Permanent Road Closure',
            'Ramp Closed',
            'Rest Area Closed',
            'Road Closed',
            'Road Closed with Detour',
            'Road Impassable'
        ];
        let conditionFilter2 = [
            'Lane Closed',
            'Lanes Closed',
            'Moving Closure',
            'Congestion',
            'Shoulder Closed',
            'Cleared'
        ];
        reports.forEach(function(reportDetails) {
            if (!reportIDs.hasOwnProperty(reportDetails.Id)) {
                reportIDs[reportDetails.Id] = reportDetails.Id;
                let report = {};
                report.id = reportDetails.Id;
                report.attributes = reportDetails;
                if (conditionFilter.indexOf(report.attributes.Condition) > -1) {
                    report.attributes.RoadFullName = report.attributes.Road + (report.attributes.CommonName && (report.attributes.CommonName !== report.attributes.Road) ? '  (' + report.attributes.CommonName + ')' : '');
                    report.archived = false;
                    if (_settings.archivedReports.hasOwnProperty(report.id)) {
                        if ( _settings.archivedReports[report.id].lastUpdated != report.attributes.LastUpdate) {
                            delete _settings.archivedReports[report.id];
                        } else {
                            report.archived = true;
                        }
                    }
                    addReportToMap(report);
                    _reportsClosures.push(report);
                }
                if (conditionFilter2.indexOf(report.attributes.Condition) > -1) {
                    report.attributes.RoadFullName = report.attributes.Road + (report.attributes.CommonName && (report.attributes.CommonName !== report.attributes.Road) ? '  (' + report.attributes.CommonName + ')' : '');
                    report.archived = false;
                    if (_settings.archivedReports.hasOwnProperty(report.id)) {
                        if ( _settings.archivedReports[report.id].lastUpdated != report.attributes.LastUpdate) {
                            delete _settings.archivedReports[report.id];
                        } else {
                            report.archived = true;
                        }
                    }
                    //addReportToMap(report);
                    //_reportsClearedOrLanes.push(report);
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
                let features = $.parseJSON(res.responseText).features;
                features.forEach(function(report) {
                    let size = new OpenLayers.Size(32,32);
                    let offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
                    let now = new Date(Date.now());
                    let imgName = 'camera.png';
                    let attr = report.attributes;

                    report.imgUrl = _imagesPath + imgName;
                    let icon = new OpenLayers.Icon(report.imgUrl,size,null);
                    let marker = new OpenLayers.Marker(
                        new OpenLayers.LonLat(attr.Longitude,attr.Latitude).transform(
                            new OpenLayers.Projection("EPSG:4326"),
                            W.map.getProjectionObject()
                        ),
                        icon
                    );

                    let popoverTemplate = ['<div class="reportPopover popover" style="max-width:450px;width:385px;">',
                                           '<div class="arrow"></div>',
                                           '<div class="popover-title"></div>',
                                           '<div class="popover-content">',
                                           '</div>',
                                           '</div>'].join('');
                    marker.report = report;
                    _mapLayer.addMarker(marker);

                    let re=/window.open\('(.*?)'/;
                    let cameraImgUrl = attr.Link;
					let cameraContent = [];
					cameraContent.push('<img id="camera-img-'+ attr.OBJECTID +'" src=' + cameraImgUrl + '&t=' + new Date().getTime() + ' style="max-width:352px">');
					cameraContent.push('<div><hr style="margin:5px 0px;border-color:#dcdcdc"><div style="display:table;width:100%"><button type="button" class="btn-dot btn-dot-primary btn-open-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:left;">Open Image Full-Size</button><button type="button" class="btn-dot btn-dot-primary btn-refresh-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:right;"><span class="fa fa-refresh" /></button></div></div>');
                    let $imageDiv = $(marker.icon.imageDiv)
                    .css('cursor', 'pointer')
                    .addClass('ncDotReport')
                    .attr({
                        'data-toggle':'popover',
                        title:'',
                        'data-content':cameraContent.join(''),
                        'data-original-title':'<div style"width:100%;"><div class="dot-header camera">' + attr.Location + '</div><div style="float:right;"><a class="close-popover" href="javascript:void(0);">X</a></div><div style="clear:both;"</div></div>'
                    })
                    .data('cameraId', attr.OBJECTID)
                    .popover({trigger: 'manual', html:true,placement: 'top', template:popoverTemplate})
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
                            $div.popover('show');
                            document.getElementById('camera-img-'+id).src = cameraImgUrl + "&t=" + new Date().getTime(); //by default the images are loaded on page load, this line loads the latest image when the pop-up is opened
							$('.btn-open-camera-img').click(function(evt) {evt.stopPropagation(); window.open($(this).data('cameraImgUrl'),'_blank');});
							$('.btn-refresh-camera-img').click(function(evt) {evt.stopPropagation(); document.getElementById('camera-img-'+id).src = $(this).data('cameraImgUrl') + "&t=" + new Date().getTime();});
                            $('.reportPopover,.close-popover').click(function(evt) {
                                $div.data('state', '');
                                $div.popover('hide');
                            });
                            //$(".close-popover").click(function() {hideAllReportPopovers();});
                        } else {
                            $div.data('state', '');
                            $div.popover('hide');
                        }
                    })
                    .data('cameraId', attr.OBJECTID)
                    .data('state', '');

                    $imageDiv.data('report', report);
                    report.imageDiv = $imageDiv;
                    report.marker = marker;
                    _cameras.push(report);
                });
            }
        });
    }

    function onLayerVisibilityChanged(evt) {
        saveSettingsToStorage();
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

    function init511ReportsOverlay(){
        installIcon();
        _mapLayer = new OpenLayers.Layer.Markers("NCDOT Reports", {
            displayInLayerSwitcher: true,
            uniqueName: "__ncDotReports",
        });
        //I18n.translations.en.layers.name.__stateDotReports = "NCDOT Reports";
        W.map.addLayer(_mapLayer);
        _mapLayer.setVisibility(_settings.layerVisible);
        _mapLayer.setZIndex(100000);
        _mapLayer.events.register('visibilitychanged',null,onLayerVisibilityChanged);
    }

    function onTimsIdGoClick() {
        let $entry = $('#tims-id-entry');
        let id = $entry.val().trim();
        if (id.length > 0) {
            let report = _reportsClosures.find(rpt => rpt.id.toString() === id)
            if (report) {
                report.dataRow.click();
                $entry.css({'background-color':'#afa'});
                setTimeout(() => $entry.css({'background-color':'#fff'}), 1500);
                setTimeout(() => $entry.val(''), 1500);
            } else {
                $entry.css({'background-color':'#faa'});
                setTimeout(() => $entry.css({'background-color':'#fff'}), 1500);
            };
        }
    }

    function restoreUserTab() {
        $('#user-tabs > .nav-tabs').append(_tabDiv.tab);
        $('#user-info > .flex-parent > .tab-content').append(_tabDiv.panel);
        $('[id^=settings]').change(function(){
            saveSettingsToStorage();
            updateReportsVisibility();
        });
        $('.nc-dot-refresh-reports').click(function(e) {
            hideAllReportPopovers();
            fetchReports(true);
            e.stopPropagation();
        });
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

    function initUserPanel() {
        _tabDiv.tab = $('<li>').append(
            $('<a>', {'data-toggle':'tab', href:'#sidepanel-nc-statedot'}).text('NCDOT')
        );

        _tabDiv.panel = $('<div>', {class:'tab-pane', id:'sidepanel-nc-statedot'}).append(
            $('<div>', {class:'side-panel-section>'}).append(
                $('<div>').append(
                    $('<ul>', {id:'ncdot-tabs', class:'nav nav-tabs'}).append(
                        $('<li>',{class:'active',style:'text-align: center; height: 30px;'}).append(
                            $('<a>',{id:'ncdot-tabstitle-closures',style:'height: 30px;',href:'#ncdot-tabs-closures','data-toggle':'tab'}).text('Closures'))
                        //).append(
                        //$('<li>',{style:'text-align: center; height: 30px;'}).append(
                        //    $('<a>',{id:'ncdot-tabstitle-cleared',style:'height: 30px;',href:'#ncdot-tabs-cleared','data-toggle':'tab'}).text('Cleared'))
                        )
                    ),
                $('<div>', {style:'width: 100%; text-align:center;'}).append(
                    $('<span>', {id:'tims-id-label'}).text('Jump to Incident:'),
                    $('<input>', {id:'tims-id-entry', type:'text', placeholder:'TIMS ID'}),
                    $('<button>', {id:'tims-id-go', class:'btn-dot btn-dot-primary'}).text('Go')
                ),
                $('<div>',{id:'ncdot-tab-content',class:'tab-content'}).append(
                    $('<section>',{id:'ncdot-tabs-closures',class:'tab-pane active'}).append(
                $('<label style="width:100%; cursor:pointer; border-bottom: 1px solid #e0e0e0; margin-top:9px;" data-toggle="collapse" data-target="#ncDotSettingsCollapse"><span class="fa fa-caret-down" style="margin-right:5px;font-size:120%;"></span>Settings &amp; Incident Filtering</label>')).append(
                $('<div>',{id:'ncDotSettingsCollapse',class:'collapse',style:'font-size:12px;'}
                ).append(
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'settingsShowCityCounty',id:'settingsShowCityCounty'}))
                    .append($('<label>', {for:'settingsShowCityCounty'}).text('Show City and County in Table Description'))
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
				)
            )
        ).append(
            $('<div>', {class:'side-panel-section>', id:'nc-dot-report-table'}).append(
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
        )
                )
            );

        if (_user === 's18slider' || _user === 'the_cre8r' || _user === 'mapomatic') {
            _tabDiv.panel.prepend(
                $('<div>').append(
                    $('<button type="button" class="btn-dot btn-dot-primary" style="">Copy IDs to clipboard</button>').click(function() {
                        copyIncidentIDsToClipboard();
                        WazeWrap.Alerts.success(SCRIPT_NAME, 'IDs have been copied to the clipboard.');
                    })
                )
            );
        }
        restoreUserTab();

        (function setChecks(settingProps, checkboxIds) {
            for (let i=0; i<settingProps.length; i++) {
                if (_settings[settingProps[i]]) { $('#' + checkboxIds[i]).attr('checked', 'checked'); }
            }
            $('#settingsHideNCDotXDaysNumber').attr('value', _settings.hideXDaysNumber)
        })(['showCityCountyCheck','hideArchivedReports','hideAllButWeatherReports','hideInterstatesReports','hideUSHighwaysReports','hideNCHighwaysReports','hideSRHighwaysReports','hideXDaysReports','hideXDaysNumber'],
           ['settingsShowCityCounty','settingsHideNCDotArchivedReports','settingsHideNCDotAllButWeatherReports','settingsHideNCDotInterstatesReports','settingsHideNCDotUSHighwaysReports','settingsHideNCDotNCHighwaysReports','settingsHideNCDotSRHighwaysReports','settingsHideNCDotXDaysReports','settingsHideNCDotXDaysNumber']);
    }

    function initGui() {
        init511ReportsOverlay();
        initUserPanel();
        fetchReports(false);

        let classHtml = [
            '.nc-dot-table th,td,tr {cursor:pointer;} ',
            '.nc-dot-table .centered {text-align:center;} ',
            '.nc-dot-table th:hover,tr:hover {background-color:aliceblue; outline: -webkit-focus-ring-color auto 5px;} ',
            '.nc-dot-table th:hover {color:#00a4eb; border-color:whitesmoke; } ',
            '.nc-dot-table {border:1px solid gray; border-collapse:collapse; width:100%; font-size:83%;margin:0px 0px 0px 0px} ',
            '.nc-dot-table th,td {border:1px solid #dcdcdc;} ',
            '.nc-dot-table td,th {color:black; padding:1px 2px;} ',
            '.nc-dot-table th {background-color:#dcdcdc;} ',
            '.nc-dot-table .table-img {max-width:12px; max-height:12px;} ',
            '.tooltip.top > .tooltip-arrow {border-top-color:white;} ',
            '.tooltip.bottom > .tooltip-arrow {border-bottom-color:white;} ',
            'a.close-popover {text-decoration:none;padding:0px 10px;border-radius:20px;border-width:0px;background-color:rgb(242, 243, 244);color: rgb(0, 164, 235);} a.close-popover:hover {background-color:rgb(234, 241, 246);} ',
            '#nc-dot-refresh-popup {position:absolute;z-index:9999;top:80px;left:650px;background-color:rgb(120,176,191);e;font-size:120%;padding:3px 11px;box-shadow:6px 8px rgba(20,20,20,0.6);border-radius:5px;color:white;} ',
            '.refreshIcon:hover {color:#00a4eb} .refreshIcon:active{ text-shadow: 0px 0px; }',
            '.nc-dot-archived-marker {opacity:0.5;} ',
            '.nc-dot-table-label {font-size:85%;} .nc-dot-table-action:hover {color:#00a4eb;cursor:pointer} .nc-dot-table-label.right {float:right} .nc-dot-table-label.count {margin-left:4px;}',
            '.nc-dot-popover-cont {display: flex;}',
            '.nc-dot-popover-label {font-weight:bold; width: 115px; display: inline-block;}',
            '.nc-dot-popover-data {flex: 1;}',
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
            '#tims-id-entry {background-color: #fff; width:70px; margin:2px 5px !important; box-sizing: border-box; color: rgb(32, 33, 36); display: inline-block; font-size: 12px; line-height: 14px;font-family: inherit; border-color: rgb(242, 243, 244); border-radius: 6px;border-width: 0px 0px 1px; margin: 0px; outline: none; transition: border-bottom-left-radius 0.3s cubic-bezier(0.25, 0.1, 0.25, 1) 0s, border-bottom-right-radius 0.3s 0s; padding: 0px 10px;}',
            '#tims-id-label {font-family: "Rubik", "Helvetica Neue", Helvetica, "Open Sans", sans-serif; font-size: 11px; width: 100%; color: #354148;}'
        ].join('');
        $('<style type="text/css">' + classHtml + '</style>').appendTo('head');

        _previousZoom = W.map.zoom;
        W.map.events.register('moveend',null,function() {if (_previousZoom !== W.map.zoom) {hideAllReportPopovers();} _previousZoom=W.map.zoom;});
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
                layerVisible:true,
                showCityCountyCheck:true,
                hideArchivedReports:true,
                hideAllButWeatherReports:false,
                hideInterstatesReports:false,
                hideUSHighwaysReports:false,
                hideNCHighwaysReports:false,
                hideSRHighwaysReports:false,
                hideXDaysReports:false,
                hideXDaysNumber:7,
                archivedReports:{},
                lastSaved: 0
            };
        } else {
            settings.layerVisible = (settings.layerVisible === true);
            if(typeof settings.hideArchivedReports === 'undefined') { settings.hideArchivedReports = true; }
            settings.archivedReports = settings.archivedReports ? settings.archivedReports : {};
        }
        _settings = settings;
    }

    async function init() {
        _user = W.loginManager.user.userName.toLowerCase();
        await loadSettingsFromStorage();
        WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, SCRIPT_VERSION, SCRIPT_CHANGES,`" </a><a target="_blank" href='https://github.com/TheCre8r/WME-NCDOT-Reports'>GitHub</a><a style="display:none;" href="`,'');
        initGui();
        _window.addEventListener('beforeunload', function saveOnClose() { saveSettingsToStorage(); }, false);
        W.app.modeController.model.bind('change:mode', onModeChanged);
        log('Initialized.');
    }

    function bootstrap() {
        let wz = _window.W;
        if (wz && wz.loginManager && wz.loginManager.user && wz.map && WazeWrap.Ready) {
            log('Initializing...');
            init();
        } else {
            log('Bootstrap failed. Trying again...');
            _window.setTimeout(function () {
                bootstrap();
            }, 1000);
        }
    }

    log('Bootstrap...');
    bootstrap();
})();
