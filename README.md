# WME North Carolina DOT Reports 

## Synopsis

This script quickly locates active closures published by NCDOT on North Carolina state-maintained roads. Active closures are retrieved from NCDOT and can be sorted by road name, description, start time and end time. Clicking on a row takes you to the approximate location of the closure.

NCDOT closures feed can be refreshed, pulling in the latest closures, using the “Refresh” icon. Additionally, there is a convenient “Archive” feature to archive any closures that have been reviewed.	

![Screenshot](https://upload.wikimedia.org/wikipedia/commons/thumb/a/ac/No_image_available.svg/240px-No_image_available.svg.png)

## Version History

v 0.5.2 - Public rerelease

v 0.5.3 - Add TIMS ID entry box

v 2018.09.17
- Fix intermittent bootstrap bug.
- Remove refresh icon and display "Loading reports..." while reports are being loaded.
- Only display popup *after* reports have actually loaded.
- Misc code cleanup.

v 2020.04.27
- Fixed issue with map jumping when clicking on incidents
- Added date/time incident last updated in TIMS to table
- Updated all incident times to 24hr format
- Updated incident links and descriptions to DriveNC.gov
- Fixed camera image sizes + added link to view full-size

v 2020.06.07
- Added option to show City and County in description column; when enabled, this column becomes sortable by City name
- Added Closure Date/Time info from DriveNC API
- Fixed "Hide All but Weather Events" filter option
- Added additional filters: Hide Interstates, Hide US Highways, Hide NC Highways, Hide NC Secondary Routes, Hide All but Incidents Updated in the last x days
- Formatting changes to Incident Pop-up: Moved RTC description and copy button, added DriveNC copy URL button
- Converted 24:00 times to 00:00

v 2020.11.23
- Fixed camera source; added image refresh functionality
- Fixed 24:00 times to 00:00
- Fixed "Hide All but Weather Events" filter option
- Fixed automatic un-archive if TIMS incident updated
- Added additional filters: Hide Interstates, Hide US Highways, Hide NC Highways, Hide NC Secondary Routes, Hide All but Incidents Updated in the last x days
- Added option to show City and County in description column; when enabled, this column becomes sortable by City name
- Added Closure Date/Time info from DriveNC when available (e.g. daily/nightly closure details)
- Table sorting: Changed default sort to show most recent updates first; sorting is now reversible
- Added WazeWrap settings sync and alerts (including alerts history)
- Fresh coat of paint: Updated icons, buttons, colors
- Reports and Cameras are now native WME layers that can be turned on/off
- New settings: Copy PL when archiving report, Copy Description when opening report, Auto open closures tab when selecting segments (keyboard shortcut available)

## Installation

Install just like any other userscript by clicking this link:
https://github.com/TheCre8r/WME-NCDOT-Reports/raw/master/WME-NCDOT-Reports.user.js

## Contributors

* **Mapomatic** - *Initial work and feature requests*
* **The_Cre8r** - *Compatibility updates*
* **ABelter** - *Compatibility updates and new features*

## License

GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007 (GNU GPLv3)

https://www.gnu.org/licenses/gpl-3.0.en.html
