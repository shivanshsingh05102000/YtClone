# Auth_Service end-to-end test script (PowerShell native)

Write-Host "`n=== Health check ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3001/health" -Method GET

Write-Host "`n=== Register ===" -ForegroundColor Cyan
try {
    $registerBody = @{
        username = "scorpion"
        email    = "scorpion@test.com"
        password = "testpass123"
    } | ConvertTo-Json

    $registerResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/register" `
        -Method POST -ContentType "application/json" -Body $registerBody
    $registerResponse
} catch {
    Write-Host "Register failed (might already exist, that's OK):" -ForegroundColor Yellow
    $_.ErrorDetails.Message
}

Write-Host "`n=== Login ===" -ForegroundColor Cyan
$loginBody = @{
    email    = "scorpion@test.com"
    password = "testpass123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
    -Method POST -ContentType "application/json" -Body $loginBody
$loginResponse

$accessToken = $loginResponse.accessToken
$refreshToken = $loginResponse.refreshToken

Write-Host "`nAccess Token: $accessToken" -ForegroundColor Green
Write-Host "Refresh Token: $refreshToken" -ForegroundColor Green

Write-Host "`n=== /me (with access token) ===" -ForegroundColor Cyan
$meResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/me" `
    -Method GET -Headers @{ Authorization = "Bearer $accessToken" }
$meResponse

Write-Host "`n=== Refresh ===" -ForegroundColor Cyan
$refreshBody = @{ refreshToken = $refreshToken } | ConvertTo-Json
$refreshResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/refresh" `
    -Method POST -ContentType "application/json" -Body $refreshBody
$refreshResponse

$newRefreshToken = $refreshResponse.refreshToken
Write-Host "`nNew Refresh Token: $newRefreshToken" -ForegroundColor Green

Write-Host "`n=== Old refresh token should now FAIL (rotation check) ===" -ForegroundColor Cyan
try {
    $oldRefreshBody = @{ refreshToken = $refreshToken } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:3001/api/auth/refresh" `
        -Method POST -ContentType "application/json" -Body $oldRefreshBody
    Write-Host "UNEXPECTED: old token still worked!" -ForegroundColor Red
} catch {
    Write-Host "Correctly rejected old refresh token:" -ForegroundColor Green
    $_.Exception.Response.StatusCode.value__
}

Write-Host "`n=== Logout ===" -ForegroundColor Cyan
$logoutBody = @{ refreshToken = $newRefreshToken } | ConvertTo-Json
$logoutResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/logout" `
    -Method POST -ContentType "application/json" -Body $logoutBody
$logoutResponse

Write-Host "`n=== Refresh AFTER logout should FAIL ===" -ForegroundColor Cyan
try {
    $postLogoutBody = @{ refreshToken = $newRefreshToken } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:3001/api/auth/refresh" `
        -Method POST -ContentType "application/json" -Body $postLogoutBody
    Write-Host "UNEXPECTED: refresh worked after logout!" -ForegroundColor Red
} catch {
    Write-Host "Correctly rejected refresh after logout:" -ForegroundColor Green
    $_.Exception.Response.StatusCode.value__
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
