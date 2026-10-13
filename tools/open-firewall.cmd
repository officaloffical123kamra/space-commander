@echo off
rem Allows a phone on the home Wi-Fi to open the game (port 8080).
rem Double-click it; it will ask for administrator rights by itself.

net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo Configuring Windows Firewall for testing the game on a phone...
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | ForEach-Object { Set-NetConnectionProfile -InterfaceIndex $_.InterfaceIndex -NetworkCategory Private -ErrorAction SilentlyContinue }"
powershell -NoProfile -Command "Remove-NetFirewallRule -DisplayName 'RTS game test 8080' -ErrorAction SilentlyContinue; New-NetFirewallRule -DisplayName 'RTS game test 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Any | Out-Null"
echo.
echo DONE. Open on the phone:  http://192.168.0.125:8080/
echo.
pause
