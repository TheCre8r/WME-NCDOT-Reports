// ==UserScript==
// @name         WME North Carolina DOT Reports
// @namespace    https://greasyfork.org/users/45389
// @version      2020.04.27.004
// @description  Display NC transportation department reports in WME.
// @author       MapOMatic, The_Cre8r, and ABelter
// @license      GNU GPLv3
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor\/?.*$/
// @grant        GM_xmlhttpRequest
// @connect      ncdot.gov

// ==/UserScript==

/* global $ */
/* global OpenLayers */
/* global GM_info */
/* global W */
/* global GM_xmlhttpRequest */
/* global unsafeWindow */
/* global Waze */
/* global Components */
/* global I18n */

(function() {
    'use strict';

    const REPORTS_URL = 'https://tims.ncdot.gov/tims/api/incidents';
    const CAMERAS_URL = 'https://tims.ncdot.gov/tims/API/CameraGeoJSON.aspx?TLatitude=36.552&TLongitude=-84.316&BLatitude=33.800&BLongitude=-75.000';

    let _window = unsafeWindow ? unsafeWindow : window;
    let _settingsStoreName = 'nc_dot_report_settings';
    let _alertUpdate = true;
    let _scriptVersion = GM_info.script.version;
    let _scriptVersionChanges = [
        GM_info.script.name,
        'v' + _scriptVersion,
        'What\'s New',
        '------------------------------',
        'It\'s working again!',
        '- Fixed issue with map jumping when clicking on incidents',
        '- Added date/time incident last updated in TIMS to table',
        '- Updated all incident times to 24hr format',
        '- Updated incident links and descriptions to DriveNC.gov',
        '- Fixed camera image sizes + added link to view full-size'
    ].join('\n');

    let _imagesPath = 'https://github.com/mapomatic/wme-north-carolina-dot-reports/raw/master/images/';
    let _settings = {};
    let _tabDiv = {}; // stores the user tab div so it can be restored after switching back from Events mode to Default mode
    let _reports = [];
    let _cameras = [];
    let _lastShownTooltipDiv;
    let _tableSortKeys = [];
    let _columnSortOrder = ['attributes.Road', 'attributes.Condition', 'attributes.Start', 'attributes.End','attributes.LastUpdate'];
    let _reportTitles = {incident: 'INCIDENT'};
    let _mapLayer;
    let _user;

    function log(message) {
        console.log('NC DOT Reports:', message);
    }
    function logDebug(message) {
        console.debug('NC DOT Reports:', message);
    }

    function saveSettingsToStorage() {
        if (localStorage) {
            let settings = {
                lastVersion: _scriptVersion,
                layerVisible: _mapLayer.visibility,
                state: _settings.state,
                hideArchivedReports: $('#hideNCDotArchivedReports').is(':checked'),
                hideAllButReports: $('#hideNCDotAllButWeatherReports').is(':checked'),
                secureSite: $('#secureSite').is(':checked'),
                archivedReports:_settings.archivedReports
            };
            localStorage.setItem(_settingsStoreName, JSON.stringify(settings));
            logDebug('Settings saved');
        }
    }

    function formatDateTimeString(dateTimeString) {
        let dt = new Date(dateTimeString);
        return dt.toLocaleDateString([],{ year: '2-digit', month: 'numeric', day: 'numeric' } ) + ' ' + dt.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false});
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
        _reports.forEach(function(report) {
            ids.push(report.attributes.IncidentID);
        });
        return copyToClipboard(ids.join('\n'));
    }

    function getReport(reportId) {
        for (let i=0; i<_reports.length; i++) {
            if (_reports[i].id === reportId) { return _reports[i]; }
        }
    }
    function getCamera(cameraId) {
        for (let i=0; i<_cameras.length; i++) {
            if (_cameras[i].properties.id === cameraId) { return _cameras[i]; }
        }
    }

    function isHideOptionChecked(reportType) {
        return $('#hideNCDot' + reportType + 'Reports').is(':checked');
    }

    function updateReportsVisibility() {
        hideAllReportPopovers();
        let hideArchived = isHideOptionChecked('Archived');
        let hideAllButWeather = isHideOptionChecked('AllButWeather');
        let visibleCount = 0;
        _reports.forEach(function(report) {
            let hide =
                hideArchived && report.archived ||
                hideAllButWeather && report.attributes.Expr2 !== 'Weather Event';
            if (hide) {
                report.dataRow.hide();
                if (report.imageDiv) { report.imageDiv.hide(); }
            } else {
                visibleCount += 1;
                report.dataRow.show();
                if (report.imageDiv) { report.imageDiv.show(); }
            }
        });
        $('.nc-dot-report-count').text(visibleCount + ' of ' + _reports.length + ' reports');
    }

    function hideAllPopovers($excludeDiv) {
        _reports.forEach(function(rpt) {
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
        _reports.forEach(function(rpt) {
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
            if (report.archived) {
                $('.btn-archive-dot-report').text("Un-Archive");
            }
            $('.btn-archive-dot-report').click(function() {setArchiveReport(report,!report.archived, true); buildTable();});
            $('.btn-open-dot-report').click(function(evt) {evt.stopPropagation(); window.open($(this).data('dotReportUrl'),'_blank');});
            $('.reportPopover,.close-popover').click(function(evt) {evt.stopPropagation(); hideAllReportPopovers();});
            $('.btn-copy-dot-report').click(function(evt) {
                evt.stopPropagation();
                let id = $(this).data('dotReportid');
                copyToClipboard(getReport(id).attributes.IncidentType + ' - DriveNC.gov ' + id);
            });
            //$(".close-popover").click(function() {hideAllReportPopovers();});
            $div.data('report').dataRow.css('background-color','beige');
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
            _settings.archivedReports[report.id] = {lastUpdated: report.attributes.LastUpdateDate};
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
        _reports.forEach(function(report) {
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
            $('<td>',{class:'clickable centered'}).append($img),
            $('<td>').text(report.attributes.Road),
            $('<td>').text(report.attributes.Condition),
            $('<td>').text(formatDateTimeString(report.attributes.Start)),
            $('<td>').text(formatDateTimeString(report.attributes.End)),
            $('<td>').text(formatDateTimeString(report.attributes.LastUpdate))
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
        switch (/nc-dot-table-(.*)-header/.exec(obj.id)[1]) {
            case 'roadname':
                prop = 'attributes.Road';
                break;
            case 'start':
                prop = 'attributes.Start';
                break;
            case 'desc':
                prop = 'attributes.Condition';
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
        let idx = _columnSortOrder.indexOf(prop);
        if (idx > -1) {
            _columnSortOrder.splice(idx, 1);
            _columnSortOrder.reverse();
            _columnSortOrder.push(prop);
            _columnSortOrder.reverse();
            buildTable();
        }
    }

    function buildTable() {
        logDebug('Building table');
        let $table = $('<table>',{class:'nc-dot-table'});
        let $th = $('<thead>').appendTo($table);
        $th.append(
            $('<tr>').append(
                $('<th>', {id:'nc-dot-table-archive-header',class:'centered'}).append(
                    $('<span>', {class:'fa fa-archive',style:'font-size:120%',title:'Sort by archived'}))).append(
                $('<th>', {id:'nc-dot-table-category-header',title:'Sort by report type'})).append(
                $('<th>',{id:'nc-dot-table-roadname-header',title:'Sort by road'}).text('Road'),
                $('<th>',{id:'nc-dot-table-desc-header',title:'Sort by description'}).text('Desc'),
                $('<th>',{id:'nc-dot-table-start-header',title:'Sort by start date'}).text('Start'),
                $('<th>',{id:'nc-dot-table-end-header',title:'Sort by end date'}).text('End'),
                $('<th>',{id:'nc-dot-table-updated-header',title:'Sort by updated date'}).text('Updated')
            ));
        _reports.sort(dynamicSortMultiple(_columnSortOrder));
        _reports.forEach(function(report) {
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
        let size = new OpenLayers.Size(24,24);
        let offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
        let now = new Date(Date.now());
        let imgName = 'caution.gif';
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
                               '<div class="popover-content">',
                               '</div>',
                               '</div>'].join('');
        marker.report = report;
        //marker.events.register('click', marker, onMarkerClick);
        _mapLayer.addMarker(marker);

        let detailsUrl = 'https://drivenc.gov/default.aspx?type=incident&id=';
        let eventLookup = {1:"None", 138:"Hurricane Matthew"};
        let content = [];
        content.push('<span style="font-weight:bold">Road:</span>&nbsp;&nbsp;' + removeNull(attr.RoadFullName) + '<br>');
        content.push('<span style="font-weight:bold">City:</span>&nbsp;&nbsp;' + removeNull(attr.City) + '  (' + removeNull(attr.CountyName) + ' County)<br>');
        content.push('<span style="font-weight:bold">Location:</span>&nbsp;&nbsp;' + removeNull(attr.Location) + '<br>');
        content.push('<span style="font-weight:bold">Reason:</span>&nbsp;&nbsp;' + removeNull(attr.Reason) + '<br>');
        //content.push('<span style="font-weight:bold">DOT Notes:</span>&nbsp;&nbsp;' + attr.DOTNotes + '<br>');
        //if (eventLookup.hasOwnProperty(attr.EventID)) { content.push('<span style="font-weight:bold">Event Name:</span>&nbsp;&nbsp;' + eventLookup[attr.EventID] + '<br>'); }
        content.push('<span style="font-weight:bold">TIMS ID:</span>&nbsp;&nbsp;' + removeNull(attr.Id) + '<br>');
        content.push('<br><span style="font-weight:bold">Start Time:</span>&nbsp;&nbsp;' + formatDateTimeString(attr.Start) + '<br>');
        content.push('<span style="font-weight:bold">End Time:</span>&nbsp;&nbsp;' + formatDateTimeString(attr.End) + '<br>');
        content.push('<br><span style="font-weight:bold">Last Updated:</span>&nbsp;&nbsp;' + formatDateTimeString(attr.LastUpdate));
        content.push('<div><hr style="margin-bottom:5px;margin-top:5px;border-color:gainsboro"><div style="display:table;width:100%"><button type="button" class="btn btn-primary btn-open-dot-report" data-dot-report-url="' + detailsUrl + report.id + '" style="float:left;">Open in DriveNC.gov</button><button type="button" title="Copy short description to clipboard" class="btn btn-primary btn-copy-dot-report" data-dot-reportid="' + report.id + '" style="float:left;margin-left:6px;"><span class="fa fa-copy"></button><button type="button" style="float:right;" class="btn btn-primary btn-archive-dot-report" data-dot-report-id="' + report.id + '">Archive</button></div></div></div>');

        let $imageDiv = $(marker.icon.imageDiv)
        .css('cursor', 'pointer')
        .addClass('ncDotReport')
        .attr({
            'data-toggle':'popover',
            title:'',
            'data-content':content.join(''),
            'data-original-title':'<div style"width:100%;"><div style="float:left;max-width:330px;color:#5989af;font-size:120%;">' + attr.RoadFullName + ': ' + attr.Condition + '</div><div style="float:right;"><a class="close-popover" href="javascript:void(0);">X</a></div><div style="clear:both;"</div></div>'
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
        _reports = [];
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
                        if ( _settings.archivedReports[report.id].lastUpdateDate < report.lastUpdateDate) {
                            delete _settings.archivedReports[report.id];
                        } else {
                            report.archived = true;
                        }
                    }
                    addReportToMap(report);
                    _reports.push(report);
                }
            }
        });
        buildTable();
        $('.nc-dot-refresh-reports').css({'display': 'inline-block'});
        if (showPopupWhenDone) {
            let refreshPopup = $('#nc-dot-refresh-popup');
            refreshPopup.show();
            setTimeout(() => refreshPopup.hide(), 1500);
        }
        logDebug('Added ' + _reports.length + ' reports to map.');
    }

    function fetchReports(showPopupWhenDone) {
        logDebug('Fetching reports...');
        $('.nc-dot-report-count').text('Loading reports...');
        $('.nc-dot-refresh-reports').css({'display': 'none'});
        GM_xmlhttpRequest({
            method: 'GET',
            url: REPORTS_URL,
            onload: function(res) { processReports($.parseJSON(res.responseText), showPopupWhenDone); }
        });
    }

    function fetchCameras() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: CAMERAS_URL,
            onload: function(res) {
                let features = $.parseJSON(res.responseText).features;
                features.forEach(function(report) {
                    let coord = report.geometry.coordinates;
                    let size = new OpenLayers.Size(24,24);
                    let offset = new OpenLayers.Pixel(-(size.w/2), -size.h);
                    let now = new Date(Date.now());
                    let imgName = 'camera.png';
                    let attr = report.attributes;

                    report.imgUrl = _imagesPath + imgName;
                    let icon = new OpenLayers.Icon(report.imgUrl,size,null);
                    let marker = new OpenLayers.Marker(
                        new OpenLayers.LonLat(coord[0],coord[1]).transform(
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
                    let cameraImgUrl = report.properties.description.match(re)[1];
					let cameraContent = [];
					cameraContent.push('<img src=' + cameraImgUrl + ' style="max-width:357px">');
					cameraContent.push('<div><hr style="margin-bottom:5px;margin-top:5px;border-color:gainsboro"><div style="display:table;width:100%"><button type="button" class="btn btn-primary btn-open-camera-img" data-camera-img-url="' + cameraImgUrl + '" style="float:left;">Open Image Full-Size</button></div></div>');
                    let $imageDiv = $(marker.icon.imageDiv)
                    .css('cursor', 'pointer')
                    .addClass('ncDotReport')
                    .attr({
                        'data-toggle':'popover',
                        title:'',
                        'data-content':cameraContent.join(''),
                        'data-original-title':'<div style"width:100%;"><div style="float:left;max-width:230px;color:#5989af;font-size:120%;">' + report.properties.subtitle + '</div><div style="float:right;"><a class="close-popover" href="javascript:void(0);">X</a></div><div style="clear:both;"</div></div>'
                    })
                    .data('cameraId', report.properties.id)
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
							$('.btn-open-camera-img').click(function(evt) {evt.stopPropagation(); window.open($(this).data('cameraImgUrl'),'_blank');});
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
                this.offset=c||{x: -(this.size.w/2),y: -(this.size.h/2)};
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
        _mapLayer = new OpenLayers.Layer.Markers("NC DOT Reports", {
            displayInLayerSwitcher: true,
            uniqueName: "__ncDotReports",
        });
        //I18n.translations.en.layers.name.__stateDotReports = "NC DOT Reports";
        W.map.addLayer(_mapLayer);
        _mapLayer.setVisibility(_settings.layerVisible);
        _mapLayer.events.register('visibilitychanged',null,onLayerVisibilityChanged);
    }

    function onTimsIdGoClick() {
        let $entry = $('#tims-id-entry');
        let id = $entry.val().trim();
        if (id.length > 0) {
            let report = _reports.find(rpt => rpt.id.toString() === id)
            if (report) {
                report.dataRow.click();
            } else {
                $entry.css({'background-color':'#faa'});
                setTimeout(() => $entry.css({'background-color':'#fff'}), 1000);
            };
        }
    }

    function restoreUserTab() {
        $('#user-tabs > .nav-tabs').append(_tabDiv.tab);
        $('#user-info > .flex-parent > .tab-content').append(_tabDiv.panel);
        $('[id^=hideNCDot]').change(function(){
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
            $('<a>', {'data-toggle':'tab', href:'#sidepanel-nc-statedot'}).text('NC DOT')
        );

        _tabDiv.panel = $('<div>', {class:'tab-pane', id:'sidepanel-nc-statedot'}).append(
            $('<div>', {class:'side-panel-section>'}).append(
                $('<div>').append(
                    $('<span>', {style:'margin-right:4px;'}).text('TIMS ID:'),
                    $('<input>', {id:'tims-id-entry', type:'text', style:'margin-right:4px; height:23px; width:80px;'}),
                    $('<button>', {id:'tims-id-go', style:'height:23px;'}).text('Go')
                ),
                $('<label style="width:100%; cursor:pointer; border-bottom: 1px solid #e0e0e0; margin-top:9px;" data-toggle="collapse" data-target="#ncDotSettingsCollapse"><span class="fa fa-caret-down" style="margin-right:5px;font-size:120%;"></span>Hide reports...</label>')).append(
                $('<div>',{id:'ncDotSettingsCollapse',class:'collapse'}).append(
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'hideNCDotArchivedReports',id:'hideNCDotArchivedReports'}))
                    .append($('<label>', {for:'hideNCDotArchivedReports'}).text('Archived'))
                ).append(
                    $('<div>',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'hideNCDotAllButWeatherReports',id:'hideNCDotAllButWeatherReports'}))
                    .append($('<label>', {for:'hideNCDotAllButWeatherReports'}).text('All but Weather Events'))
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
                        let r = confirm('Are you sure you want to archive all reports for ' + _settings.state + '?');
                        if (r===true) {
                            archiveAllReports(false);
                        }
                    })
                ).append(
                    $('<span>', {class:'nc-dot-table-label right'}).text('|')
                ).append(
                    $('<span>',{class:'nc-dot-table-label nc-dot-table-action right'}).text('Un-Archive all').click(function() {
                        let r = confirm('Are you sure you want to un-archive all reports for ' + _settings.state + '?');
                        if (r===true) {
                            archiveAllReports(true);
                        }
                    })
                )
            )
        );

        if (_user === 's18slider' || _user === 'the_cre8r' || _user === 'mapomatic') {
            _tabDiv.panel.prepend(
                $('<div>').append(
                    $('<button type="button" class="btn btn-primary" style="">Copy IDs to clipboard</button>').click(function() {
                        copyIncidentIDsToClipboard();
                        alert('IDs have been copied to the clipboard.');
                    }),
                    $('<div style="margin-left:5px;">',{class:'controls-container'})
                    .append($('<input>', {type:'checkbox',name:'secureSite',id:'secureSite'}).change(function(){
                        saveSettingsToStorage();
                        hideAllReportPopovers();
                        fetchReports(true);
                    }))
                    .append($('<label>', {for:'secureSite'}).text('Use secure DOT site?'))
                )
            );
        }
        restoreUserTab();
        $('<div>', {id: 'nc-dot-refresh-popup',}).text('DOT Reports Refreshed').hide().appendTo($('div#editor-container'));

        (function setChecks(settingProps, checkboxIds) {
            for (let i=0; i<settingProps.length; i++) {
                if (_settings[settingProps[i]]) { $('#' + checkboxIds[i]).attr('checked', 'checked'); }
            }
        })(['hideArchivedReports','hideAllButWeatherReports', 'secureSite'],
           ['hideNCDotArchivedReports','hideNCDotAllButWeatherReports', 'secureSite']);
    }

    function showScriptInfoAlert() {
        /* Check version and alert on update */
        if (_alertUpdate && _scriptVersion !== _settings.lastVersion) {
            alert(_scriptVersionChanges);
        }
    }

    function initGui() {
        init511ReportsOverlay();
        initUserPanel();
        fetchReports(false);

        let classHtml = [
            '.nc-dot-table th,td,tr {cursor:pointer;} ',
            '.nc-dot-table .centered {text-align:center;} ',
            '.nc-dot-table th:hover,tr:hover {background-color:aliceblue; outline: -webkit-focus-ring-color auto 5px;} ',
            '.nc-dot-table th:hover {color:blue; border-color:whitesmoke; } ',
            '.nc-dot-table {border:1px solid gray; border-collapse:collapse; width:100%; font-size:83%;margin:0px 0px 0px 0px} ',
            '.nc-dot-table th,td {border:1px solid gainsboro;} ',
            '.nc-dot-table td,th {color:black; padding:1px 2px;} ',
            '.nc-dot-table th {background-color:gainsboro;} ',
            '.nc-dot-table .table-img {max-width:12px; max-height:12px;} ',
            '.tooltip.top > .tooltip-arrow {border-top-color:white;} ',
            '.tooltip.bottom > .tooltip-arrow {border-bottom-color:white;} ',
            'a.close-popover {text-decoration:none;padding:0px 3px;border-width:1px;background-color:white;border-color:ghostwhite} a.close-popover:hover {padding:0px 4px;border-style:outset;border-width:1px;background-color:white;border-color:ghostwhite;} ',
            '#nc-dot-refresh-popup {position:absolute;z-index:9999;top:80px;left:650px;background-color:rgb(120,176,191);e;font-size:120%;padding:3px 11px;box-shadow:6px 8px rgba(20,20,20,0.6);border-radius:5px;color:white;} ',
            '.refreshIcon:hover {color:blue; text-shadow: 2px 2px #aaa;} .refreshIcon:active{ text-shadow: 0px 0px; }',
            '.nc-dot-archived-marker {opacity:0.5;} ',
            '.nc-dot-table-label {font-size:85%;} .nc-dot-table-action:hover {color:blue;cursor:pointer} .nc-dot-table-label.right {float:right} .nc-dot-table-label.count {margin-left:4px;}'
        ].join('');
        $('<style type="text/css">' + classHtml + '</style>').appendTo('head');

        _previousZoom = W.map.zoom;
        W.map.events.register('moveend',null,function() {if (_previousZoom !== W.map.zoom) {hideAllReportPopovers();} _previousZoom=W.map.zoom;});
    }

    let _previousZoom;

    function loadSettingsFromStorage() {
        let settingsText = localStorage.getItem(_settingsStoreName);
        let settings;
        if (settingsText !== '[object Object]') {
            settings = $.parseJSON(localStorage.getItem(_settingsStoreName));
        }
        if(!settings) {
            settings = {
                lastVersion:null,
                layerVisible:true,
                hideArchivedReports:true,
                hideAllButWeatherReports:false,
                archivedReports:{}
            };
        } else {
            settings.layerVisible = (settings.layerVisible === true);
            if(typeof settings.hideArchivedReports === 'undefined') { settings.hideArchivedReports = true; }
            settings.archivedReports = settings.archivedReports ? settings.archivedReports : {};
        }
        _settings = settings;
    }

    function init() {
        _user = W.loginManager.user.userName.toLowerCase();
        loadSettingsFromStorage();
        showScriptInfoAlert();
        initGui();
        _window.addEventListener('beforeunload', function saveOnClose() { saveSettingsToStorage(); }, false);
        Waze.app.modeController.model.bind('change:mode', onModeChanged);
        log('Initialized.');
    }

    function bootstrap() {
        let wz = _window.W;
        if (wz && wz.loginManager && wz.loginManager.user && wz.map) {
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
