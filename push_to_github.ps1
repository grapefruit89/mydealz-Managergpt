$ErrorActionPreference = "Stop"
$repoUrl = "https://github.com/grapefruit89/mydealz-Managergpt.git"
$targetDir = "C:\Users\morit\AppData\Roaming\Claude\local-agent-mode-sessions\94c96154-6bd4-480b-ad74-680c6b7b3efc\1bf68e4d-4589-4229-97d3-b02ff6d570ca\local_963eed99-933b-4aae-9251-c58af80f3dce\outputs\mydealz-manager-ext"

Set-Location $targetDir

Write-Host "Bereite Git-Repository vor..."
if (-not (Test-Path ".git")) {
    git init
}

$remotes = git remote
if ($remotes -notcontains "origin") {
    git remote add origin $repoUrl
} else {
    git remote set-url origin $repoUrl
}

Write-Host "Lade bestehende Historie von GitHub..."
git fetch origin

# Standard-Branch ermitteln
$remoteBranch = "main"
$branches = git branch -r
if ($branches -match "origin/master") {
    $remoteBranch = "master"
}

git branch -M $remoteBranch

# Synchronisiert die Git-Historie mit dem lokalen Stand,
# OHNE unsere neuen Dateien anzufassen. So bleibt die Historie sauber erhalten.
git reset --mixed origin/$remoteBranch

# Alle Aenderungen (inklusive geloeschter Altlasten) stagen
git add -A

$status = git status --porcelain
if ($status) {
    Write-Host "Erstelle Release-Commit v2.0..."
    git commit -m "🚀 Release v2.0: Enterprise Architecture & Performance Refactor"
    
    Write-Host "Pushe auf GitHub..."
    git push -u origin $remoteBranch
    
    Write-Host "✅ Erfolgreich gepusht! GitHub ist jetzt auf dem neuesten Stand."
} else {
    Write-Host "Keine neuen Aenderungen gefunden."
}
