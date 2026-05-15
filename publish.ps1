param(
    [string]$Message = "",
    [string]$Version = "",
    [string[]]$Notes = @(),
    [switch]$Interactive,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
[Console]::InputEncoding = $utf8
$OutputEncoding = $utf8

function Fail($Text) {
    Write-Host "ERROR: $Text" -ForegroundColor Red
    exit 1
}

function Write-Utf8NoBom($Path, $Text) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $encoding)
}

function Save-VersionSnapshot($Root, $Version, $ScriptText, $ReleaseText, $Name) {
    $dir = Join-Path $Root "versions"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $safeVersion = ([string]$Version).Replace("/", "-").Replace("\", "-")
    Write-Utf8NoBom (Join-Path $dir "lingverse-spirit-cleaner-v$safeVersion.user.js") $ScriptText
    Write-Utf8NoBom (Join-Path $dir "release-v$safeVersion.json") $ReleaseText
    Write-Utf8NoBom (Join-Path $dir "$Name.user.js") $ScriptText
    Write-Utf8NoBom (Join-Path $dir "$Name.release.json") $ReleaseText
}

function Get-NextPatchVersion($CurrentVersion) {
    $match = [regex]::Match($CurrentVersion, "^(\d+)\.(\d+)\.(\d+)$")
    if (-not $match.Success) { return $CurrentVersion }
    $patch = [int]$match.Groups[3].Value + 1
    return "$($match.Groups[1].Value).$($match.Groups[2].Value).$patch"
}

function Normalize-VersionInput($InputVersion) {
    $value = ([string]$InputVersion).Trim().TrimStart("v", "V")
    $match = [regex]::Match($value, "^(\d+)\.(\d+)(?:\.(\d+))?([-.][0-9A-Za-z]+)?$")
    if (-not $match.Success) { return $value }

    $patch = if ($match.Groups[3].Success) { $match.Groups[3].Value } else { "0" }
    return "$($match.Groups[1].Value).$($match.Groups[2].Value).$patch$($match.Groups[4].Value)"
}

function Compare-Semver($A, $B) {
    $pa = [regex]::Split(([string]$A).TrimStart("v", "V"), "[.-]")
    $pb = [regex]::Split(([string]$B).TrimStart("v", "V"), "[.-]")
    $len = [Math]::Max($pa.Count, $pb.Count)
    for ($i = 0; $i -lt $len; $i++) {
        $na = 0
        $nb = 0
        if ($i -lt $pa.Count) { [void][int]::TryParse($pa[$i], [ref]$na) }
        if ($i -lt $pb.Count) { [void][int]::TryParse($pb[$i], [ref]$nb) }
        if ($na -gt $nb) { return 1 }
        if ($na -lt $nb) { return -1 }
    }
    return 0
}

function Get-HighestVersion($Versions) {
    $highest = ""
    foreach ($item in $Versions) {
        if ([string]::IsNullOrWhiteSpace($item)) { continue }
        if (-not $highest -or (Compare-Semver $item $highest) -gt 0) {
            $highest = [string]$item
        }
    }
    return $highest
}

function Get-RemoteScriptVersion() {
    $rawScriptUrl = "https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js?cb=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    try {
        $remoteScript = (Invoke-WebRequest -UseBasicParsing $rawScriptUrl -Headers @{ "Cache-Control" = "no-cache" }).Content
        return [regex]::Match($remoteScript, "@version\s+([^\s]+)").Groups[1].Value
    } catch {
        Write-Host "WARN: 读取 GitHub 远端版本失败：$($_.Exception.Message)" -ForegroundColor Yellow
        return ""
    }
}

function Get-RemoteText($Url) {
    try {
        $sep = if ($Url.Contains("?")) { "&" } else { "?" }
        return (Invoke-WebRequest -UseBasicParsing ($Url + $sep + "cb=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())") -Headers @{ "Cache-Control" = "no-cache" }).Content
    } catch {
        Write-Host "WARN: 读取远端文件失败：$($_.Exception.Message)" -ForegroundColor Yellow
        return ""
    }
}

function Get-GitAheadCount() {
    $upstream = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) { return 0 }
    $count = git rev-list --count "@{u}..HEAD" 2>$null
    if ($LASTEXITCODE -ne 0) { return 0 }
    $value = 0
    [void][int]::TryParse(([string]$count).Trim(), [ref]$value)
    return $value
}

function ConvertTo-JsSingleQuotedString($Text) {
    return "'" + ([string]$Text).Replace("\", "\\").Replace("'", "\'") + "'"
}

function ConvertTo-JsNotesArray($Items) {
    $lines = @("notes: [")
    for ($i = 0; $i -lt $Items.Count; $i++) {
        $suffix = if ($i -lt $Items.Count - 1) { "," } else { "" }
        $lines += "            $(ConvertTo-JsSingleQuotedString $Items[$i])$suffix"
    }
    $lines += "        ]"
    return ($lines -join [Environment]::NewLine)
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".git")) {
    Fail "This script must run inside the lingverse-spirit-cleaner git repository."
}

$scriptPath = Join-Path $root "lingverse-spirit-cleaner.user.js"
$releasePath = Join-Path $root "release.json"

if (-not (Test-Path $scriptPath)) { Fail "Missing lingverse-spirit-cleaner.user.js" }
if (-not (Test-Path $releasePath)) { Fail "Missing release.json" }

$scriptText = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8
$releaseText = Get-Content -LiteralPath $releasePath -Raw -Encoding UTF8
$release = $releaseText | ConvertFrom-Json

$metaVersion = [regex]::Match($scriptText, "@version\s+([^\s]+)").Groups[1].Value
$scriptVersion = [regex]::Match($scriptText, "SCRIPT_VERSION\s*=\s*'([^']+)'").Groups[1].Value
$releaseVersion = [string]$release.version

if (-not $metaVersion) { Fail "Cannot find @version in userscript metadata." }
if (-not $scriptVersion) { Fail "Cannot find SCRIPT_VERSION in userscript body." }
if (-not $releaseVersion) { Fail "Cannot find version in release.json." }

if ($Interactive) {
    $remoteVersion = Get-RemoteScriptVersion
    $aheadCount = Get-GitAheadCount
    $baseVersion = Get-HighestVersion @($metaVersion, $scriptVersion, $releaseVersion, $remoteVersion)
    if (-not $baseVersion) { $baseVersion = $metaVersion }
    Write-Host "本地脚本版本：$metaVersion" -ForegroundColor Cyan
    Write-Host "本地公告版本：$releaseVersion" -ForegroundColor Cyan
    if ($remoteVersion) {
        Write-Host "GitHub 远端版本：$remoteVersion" -ForegroundColor Cyan
    } else {
        Write-Host "GitHub 远端版本：读取失败，将按本地版本提示" -ForegroundColor Yellow
    }
    if ($aheadCount -gt 0) {
        Write-Host "本地还有 $aheadCount 个提交没有推送；直接回车会重试推送当前版本。" -ForegroundColor Yellow
    }
    if ($aheadCount -gt 0 -and $remoteVersion -and (Compare-Semver $metaVersion $remoteVersion) -gt 0) {
        $defaultVersion = $metaVersion
    } else {
        $defaultVersion = Get-NextPatchVersion $baseVersion
    }
    $inputVersion = Read-Host "输入新版本号 [$defaultVersion]"
    if ([string]::IsNullOrWhiteSpace($inputVersion)) {
        $Version = $defaultVersion
    } else {
        $Version = $inputVersion.Trim()
    }

    if (-not $Notes -or $Notes.Count -eq 0) {
        if ($release.notes) {
            $Notes = @($release.notes)
        } else {
            $Notes = @("更新脚本")
        }
    }
}

if ($Version) {
    $previousVersion = $metaVersion
    $previousScriptText = $scriptText
    $previousReleaseText = $releaseText
    $remoteForArchive = Get-RemoteScriptVersion
    if ($remoteForArchive -and (Compare-Semver $metaVersion $remoteForArchive) -gt 0) {
        $remoteScriptForArchive = Get-RemoteText "https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js"
        $remoteReleaseForArchive = Get-RemoteText "https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/release.json"
        if ($remoteScriptForArchive) {
            $previousVersion = $remoteForArchive
            $previousScriptText = $remoteScriptForArchive
        }
        if ($remoteReleaseForArchive) {
            $previousReleaseText = $remoteReleaseForArchive
        }
    }

    $Version = $Version.Trim()
    $Version = Normalize-VersionInput $Version
    if ($Version -notmatch "^\d+\.\d+\.\d+([-.][0-9A-Za-z]+)?$") {
        Fail "Invalid version: $Version. Use a version like 0.9.6 or 1.0."
    }

    if (-not $Notes -or $Notes.Count -eq 0) {
        if ($release.notes) {
            $Notes = @($release.notes)
        } else {
            $Notes = @("更新脚本")
        }
    }

    $scriptText = [regex]::Replace($scriptText, "(@version\s+)[^\s]+", ('${1}' + $Version), 1)
    $scriptText = [regex]::Replace($scriptText, "(SCRIPT_VERSION\s*=\s*')[^']+(')", ('${1}' + $Version + '${2}'), 1)
    $notesArray = ConvertTo-JsNotesArray @($Notes)
    $builtinPattern = "(?s)(var BUILTIN_RELEASE\s*=\s*\{.*?title:\s*'神识清理 v'\s*\+\s*SCRIPT_VERSION,\s*)notes:\s*\[.*?\](\s*\};)"
    if (-not [regex]::IsMatch($scriptText, $builtinPattern)) {
        Fail "Cannot find BUILTIN_RELEASE.notes in userscript body."
    }
    $scriptText = [regex]::Replace(
        $scriptText,
        $builtinPattern,
        { param($m) $m.Groups[1].Value + $notesArray + $m.Groups[2].Value },
        1
    )
    Write-Utf8NoBom $scriptPath $scriptText

    $downloadUrl = [string]$release.downloadUrl
    if (-not $downloadUrl) {
        $downloadUrl = "https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js"
    }
    $releaseOut = [ordered]@{
        version = $Version
        title = "神识清理 v$Version"
        notes = @($Notes)
        downloadUrl = $downloadUrl
    }
    $releaseJson = ($releaseOut | ConvertTo-Json -Depth 5)
    Write-Utf8NoBom $releasePath ($releaseJson + [Environment]::NewLine)

    Save-VersionSnapshot $root $previousVersion $previousScriptText $previousReleaseText "previous"
    Save-VersionSnapshot $root $Version $scriptText ($releaseJson + [Environment]::NewLine) "latest"

    $scriptText = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8
    $releaseText = Get-Content -LiteralPath $releasePath -Raw -Encoding UTF8
    $release = $releaseText | ConvertFrom-Json
    $metaVersion = [regex]::Match($scriptText, "@version\s+([^\s]+)").Groups[1].Value
    $scriptVersion = [regex]::Match($scriptText, "SCRIPT_VERSION\s*=\s*'([^']+)'").Groups[1].Value
    $releaseVersion = [string]$release.version
}

if ($metaVersion -ne $scriptVersion -or $metaVersion -ne $releaseVersion) {
    Fail "Version mismatch: @version=$metaVersion, SCRIPT_VERSION=$scriptVersion, release.json=$releaseVersion"
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    node --check $scriptPath
    if ($LASTEXITCODE -ne 0) { Fail "node --check failed." }

    $innerCheck = @'
const fs = require('fs');
const text = fs.readFileSync(process.argv[2], 'utf8');
const start = text.indexOf('var source = String.raw`');
if (start < 0) throw new Error('Cannot find injected script source.');
const bodyStart = text.indexOf('`', start) + 1;
const bodyEnd = text.indexOf('`;', bodyStart);
if (bodyStart <= 0 || bodyEnd < 0) throw new Error('Cannot find injected script body.');
new Function(text.slice(bodyStart, bodyEnd));
'@
    $innerCheck | node - $scriptPath
    if ($LASTEXITCODE -ne 0) { Fail "Injected script syntax check failed." }
} else {
    Write-Host "WARN: node not found, skipped JavaScript syntax checks." -ForegroundColor Yellow
}

$status = git status --short
if (-not $status) {
    $aheadCount = Get-GitAheadCount
    if ($aheadCount -le 0) {
        Write-Host "No local changes to publish." -ForegroundColor Yellow
        exit 0
    }

    if ($NoPush) {
        Write-Host "No local file changes, but $aheadCount commit(s) are not pushed. Push skipped because -NoPush was used." -ForegroundColor Yellow
        exit 0
    }

    Write-Host "No local file changes. Retrying push for $aheadCount pending commit(s)..." -ForegroundColor Cyan
    git push
    if ($LASTEXITCODE -ne 0) { Fail "git push failed." }
    Write-Host "Pushed pending commit(s)." -ForegroundColor Green
    exit 0
}

Write-Host "Changes to publish:" -ForegroundColor Cyan
$status | ForEach-Object { Write-Host "  $_" }

git add -A
if ($LASTEXITCODE -ne 0) { Fail "git add failed." }

if (-not $Message) {
    $Message = "Publish v$metaVersion"
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Fail "git commit failed." }

if ($NoPush) {
    Write-Host "Committed locally. Push skipped because -NoPush was used." -ForegroundColor Yellow
    exit 0
}

git push
if ($LASTEXITCODE -ne 0) { Fail "git push failed." }

$rawScriptUrl = "https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js"
$rawReleaseUrl = "https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/release.json?cb=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

try {
    $remoteScript = (Invoke-WebRequest -UseBasicParsing $rawScriptUrl -Headers @{ "Cache-Control" = "no-cache" }).Content
    $remoteVersion = [regex]::Match($remoteScript, "@version\s+([^\s]+)").Groups[1].Value
    if ($remoteVersion -ne $metaVersion) {
        Write-Host "WARN: remote script still reports $remoteVersion. GitHub raw cache may need a moment." -ForegroundColor Yellow
    }

    $remoteRelease = (Invoke-WebRequest -UseBasicParsing $rawReleaseUrl -Headers @{ "Cache-Control" = "no-cache" }).Content | ConvertFrom-Json
    if ([string]$remoteRelease.version -ne $metaVersion) {
        Write-Host "WARN: remote release.json still reports $($remoteRelease.version). GitHub raw cache may need a moment." -ForegroundColor Yellow
    }
} catch {
    Write-Host "WARN: pushed successfully, but remote verification failed: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "Published v$metaVersion." -ForegroundColor Green
