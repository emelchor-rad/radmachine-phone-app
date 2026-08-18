# Free the ports Expo/Metro use on Windows.
# Run from PowerShell:  .\scripts\kill-expo-ports.ps1
# Or from any terminal:  npm run kill-ports
#
# Killing one PID is often not enough: node spawns child processes and Claude's
# old session may hold 8081, 8082, 19000 and 19001 at once.

$ports = 8081, 8082, 8083, 19000, 19001

foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $pid = $c.OwningProcess
    if ($pid -and $pid -ne 0) {
      Write-Host "Port $port -> PID $pid"
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  }
}

# Any Metro/Expo node still hanging around
Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Stopping node PID $($_.Id)"
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "Done. Wait 5 seconds, then: npm run start:clean"
