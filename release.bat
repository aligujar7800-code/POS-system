@echo off
set /p VERSION="Enter new version (e.g. 1.0.1): "
set /p PASSWORD="Enter updater key password (leave blank if none): "
node scripts\publish.js %VERSION% %PASSWORD%
pause
