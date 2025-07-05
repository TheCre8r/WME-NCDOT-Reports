# WME North Carolina DOT Reports 

## Synopsis

This script quickly locates active closures published by NCDOT on North Carolina state-maintained roads. Active closures are retrieved from NCDOT and can be sorted by road name, description, start time and end time. Clicking on a row takes you to the approximate location of the closure, and shows the portion of road closed, as drawn by the closure submitter.

NCDOT closures feed can be refreshed, pulling in the latest closures, using the “Refresh” icon. Additionally, there is a convenient “Archive” feature to hide any closures that have been reviewed from your view.

![Screenshot](https://raw.githubusercontent.com/abelter/WME-NCDOT-Reports/master/ncdot-reports-screenshot.png)

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

v 2021.07.08
- Added "Ferry Closed" NCDOT incident type

v 2021.11.06
- Added "Local Traffic Only" NCDOT incident type

v 2022.02.04
- Compatability with the new NCDOT API

v 2022.07.26
- Fixed popup windows, made draggable

v 2023.02.12
- NEW: Polylines added to DriveNC incidents will now show in WME, to indicate the portion of road that's closed (can be disabled in settings)
- Quality-of-life improvements and consistency with our recent NC Closures Sheet and Discord updates: show a road's common name first if it's an SR, replace "other" in the RTC Descriptions, copy beta WME PLs as prod WME, fix column widths due to WME changes
- Cleaned up code for features that now live in the Closures Sheet and Discord (namely alerting when incidents clear early)
- Removed broken camera refresh and open full size links until they can be fixed

v 2024.06.13
- Fixed incident pop-ups

v 2024.06.16
- Fixed polylines to show above satellite and additional imagery layers

v 2024.07.11
- Polyline compatibility update with latest WME changes to layers

v 2024.08.07
- Added display of NCDOT Event Names (e.g. 2024 TS Debby) if information is present on incident

v 2024.11.03
- No longer displays duplicate incidents created from concurrent roads. E.g. I-40 and I-85 between Greensboro and Durham will only show the first incident (same logic applied to NC Closures Sheet; note that this only works if the TIMS incident is properly marked as a concurrency)
- Advisory banner added on Truck Closure incidents that they should not be closed in WME
- Fixed PL copier to exclude user layer settings (WME changed length of identifier)
- New feature: Quick access to turn incident and/or camera layers on/off from top of scripts tab (similar to FC Layers and GIS Layers scripts)
- Switch to WME native script tab method
- Other minor updates

v 2025.04.28
- CSS fixes to remove conflict with UR-MP Script's table formatting

v 2025.07.05
- Updated to use WME SDK
- Truck Closures now utilize the same icon as DriveNC
- Offline camera icons now show at 50% opacity
- Known issues:
  - Icons appear beneath closures
  - Archive/Unarchive All functionality broken
  - Auto-open Closures tab when selecting segments broken

## Installation

Install just like any other userscript by clicking this link:
https://github.com/TheCre8r/WME-NCDOT-Reports/raw/master/WME-NCDOT-Reports.user.js

## Contributors

* **Mapomatic** - *Initial work and feature requests*
* **The_Cre8r** - *Compatibility updates*
* **ABelter** - *Compatibility updates and new features*
* **dalverson** - *Compatibility updates*


## License

GNU GENERAL PUBLIC LICENSE Version 3, 29 June 2007 (GNU GPLv3)

https://www.gnu.org/licenses/gpl-3.0.en.html
