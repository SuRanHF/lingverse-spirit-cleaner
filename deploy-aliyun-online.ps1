# Run this script on the Alibaba Cloud Windows Server.
# It installs the online stats backend and Caddy HTTPS proxy.

$ErrorActionPreference = "Stop"

$Root = "C:\lingverse-online"
$ServerScript = Join-Path $Root "online-server.ps1"
$ServerLog = Join-Path $Root "online-server.log"
$ServerErrLog = Join-Path $Root "online-server.err.log"
$Caddy = Join-Path $Root "caddy.exe"
$Caddyfile = Join-Path $Root "Caddyfile"
$CaddyLog = Join-Path $Root "caddy.log"
$CaddyErrLog = Join-Path $Root "caddy.err.log"
$Port = 18766
$PublicIp = "121.43.136.226"
$Domain = "lingshen.ccwu.cc"
$WwwDomain = "www.lingshen.ccwu.cc"

New-Item -ItemType Directory -Force -Path $Root | Out-Null

$serverCode = @'
$ErrorActionPreference = "Stop"

$Port = 18766
$OnlineWindowSeconds = 90
$Clients = @{}

function NowMs {
    return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

function Escape-Html([string]$Text) {
    if ($null -eq $Text) { return "" }
    return $Text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace('"', "&quot;").Replace("'", "&#39;")
}

function Write-TcpResponse($Stream, [int]$StatusCode, [string]$ContentType, [string]$Body) {
    $reason = switch ($StatusCode) {
        200 { "OK" }
        204 { "No Content" }
        400 { "Bad Request" }
        404 { "Not Found" }
        default { "OK" }
    }
    if ($null -eq $Body) { $Body = "" }
    $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $header = "HTTP/1.1 $StatusCode $reason`r`n" +
        "Content-Type: $ContentType`r`n" +
        "Content-Length: $($bodyBytes.Length)`r`n" +
        "Cache-Control: no-store`r`n" +
        "Access-Control-Allow-Origin: *`r`n" +
        "Access-Control-Allow-Methods: GET,POST,OPTIONS`r`n" +
        "Access-Control-Allow-Headers: content-type`r`n" +
        "Connection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($bodyBytes.Length -gt 0) {
        $Stream.Write($bodyBytes, 0, $bodyBytes.Length)
    }
    $Stream.Flush()
}

function Write-JsonResponse($Stream, [int]$StatusCode, $Data) {
    $json = ""
    if ($StatusCode -ne 204) {
        $json = $Data | ConvertTo-Json -Depth 8
    }
    Write-TcpResponse $Stream $StatusCode "application/json; charset=utf-8" $json
}

function Get-Stats {
    $now = NowMs
    $cutoff = $now - ($OnlineWindowSeconds * 1000)
    foreach ($key in @($Clients.Keys)) {
        if ($Clients[$key].lastSeenMs -lt $cutoff) {
            $Clients.Remove($key)
        }
    }

    $clientList = @()
    foreach ($client in ($Clients.Values | Sort-Object -Property lastSeenMs -Descending)) {
        $clientList += [ordered]@{
            id = $client.id
            version = $client.version
            page = $client.page
            flags = $client.flags
            ip = $client.ip
            lastSeen = ([DateTimeOffset]::FromUnixTimeMilliseconds($client.lastSeenMs).UtcDateTime.ToString("o"))
            secondsAgo = [Math]::Round(($now - $client.lastSeenMs) / 1000)
        }
    }

    return [ordered]@{
        online = $clientList.Count
        windowSeconds = $OnlineWindowSeconds
        updatedAt = [DateTimeOffset]::UtcNow.UtcDateTime.ToString("o")
        clients = $clientList
    }
}

function Get-FlagText($Flags) {
    if ($null -eq $Flags) { return "-" }
    $items = @()
    if ($Flags.running) { $items += "清理" }
    if ($Flags.monitoringSpirit) { $items += "监测" }
    if ($Flags.autoTrialRunning) { $items += "试炼" }
    if ($Flags.autoTreasureRunning) { $items += "藏宝图" }
    if ($Flags.autoInscriptionRunning) { $items += "铭文" }
    if ($items.Count -eq 0) { return "待命" }
    return ($items -join " / ")
}

function Write-HtmlResponse($Stream, $Stats) {
    $rows = ""
    foreach ($client in $Stats.clients) {
        $rows += "<tr><td><b>$(Escape-Html $(if($client.playerName){$client.playerName}else{$client.id}))</b></td><td>$(Escape-Html $client.version)</td><td>$(Escape-Html (Get-FlagText $client.flags))</td><td>$($client.secondsAgo)秒前</td></tr>"
    }
    if ([string]::IsNullOrWhiteSpace($rows)) {
        $rows = '<tr><td colspan="4" class="muted">暂无在线记录</td></tr>'
    }

    $html = @"
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="10">
  <title>神识清理 · 在线统计</title>
  <style>
    body{margin:0;background:#11141d;color:#f5f1e8;font:14px/1.5 "Microsoft YaHei",Arial,sans-serif}
    main{max-width:1080px;margin:0 auto;padding:24px}
    h1{margin:0 0 6px;font-size:24px}
    .summary{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
    .stat{padding:14px 16px;border:1px solid rgba(219,185,112,.35);border-radius:8px;background:rgba(255,255,255,.05)}
    .num{font-size:32px;font-weight:800;color:#9be7c3}
    table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.04);border-radius:8px;overflow:hidden}
    th,td{padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}
    th{color:#dbb970;background:rgba(219,185,112,.1)}
    code{color:#d8b4fe}
    .muted{color:#9b927f}
  </style>
</head>
<body>
  <main>
    <h1>神识清理 <small style="font-size:13px;color:#9b927f;font-weight:400;">在线统计</small></h1>
    <div class="muted">最近 $( $Stats.windowSeconds ) 秒内有心跳计为在线，每 10 秒自动刷新</div>
    <section class="summary">
      <div class="stat"><div class="num">$($Stats.online)</div><div class="muted">当前在线</div></div>
      <div class="stat"><div class="muted">刷新时间</div><div>$(Escape-Html $Stats.updatedAt)</div></div>
    </section>
    <table>
      <thead><tr><th>角色名</th><th>版本</th><th>运行状态</th><th>最后心跳</th></tr></thead>
      <tbody>$rows</tbody>
    </table>
  </main>
</body>
</html>
"@
    Write-TcpResponse $Stream 200 "text/html; charset=utf-8" $html
}

function Read-TcpRequest($Client) {
    $stream = $Client.GetStream()
    $stream.ReadTimeout = 10000
    $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8, $false, 4096, $true)
    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) { return $null }
    $parts = $requestLine -split " "
    $headers = @{}
    while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line -eq "") { break }
        $sep = $line.IndexOf(":")
        if ($sep -gt 0) {
            $headers[$line.Substring(0, $sep).Trim().ToLowerInvariant()] = $line.Substring($sep + 1).Trim()
        }
    }
    $length = 0
    if ($headers.ContainsKey("content-length")) {
        [int]::TryParse($headers["content-length"], [ref]$length) | Out-Null
    }
    $body = ""
    if ($length -gt 0) {
        $buffer = New-Object char[] $length
        $offset = 0
        while ($offset -lt $length) {
            $read = $reader.Read($buffer, $offset, $length - $offset)
            if ($read -le 0) { break }
            $offset += $read
        }
        $body = -join $buffer[0..([Math]::Max(0, $offset - 1))]
    }
    return [ordered]@{
        Method = $parts[0]
        Path = (($parts[1] -split "\?")[0])
        Headers = $headers
        Body = $body
        Stream = $stream
        RemoteIp = $Client.Client.RemoteEndPoint.Address.ToString()
    }
}

function Get-ClientIp($Request) {
    $forwarded = $null
    if ($Request.Headers.ContainsKey("cf-connecting-ip")) { $forwarded = $Request.Headers["cf-connecting-ip"] }
    if ([string]::IsNullOrWhiteSpace($forwarded) -and $Request.Headers.ContainsKey("x-forwarded-for")) {
        $forwarded = $Request.Headers["x-forwarded-for"]
    }
    if ([string]::IsNullOrWhiteSpace($forwarded)) { return $Request.RemoteIp }
    return ($forwarded -split ",")[0].Trim()
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse("127.0.0.1"), $Port)
$listener.Start()
Write-Host "Online stats server listening on http://127.0.0.1:$Port/"

while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
        $request = Read-TcpRequest $client
        if ($null -eq $request) {
            $client.Close()
            continue
        }
        $stream = $request.Stream
        if ($request.Method -eq "OPTIONS") {
            Write-JsonResponse $stream 204 ([ordered]@{})
            continue
        }

        if ($request.Method -eq "POST" -and $request.Path -eq "/api/heartbeat") {
            $data = $request.Body | ConvertFrom-Json
            $id = [string]$data.clientId
            if ([string]::IsNullOrWhiteSpace($id)) {
                Write-JsonResponse $stream 400 ([ordered]@{ ok = $false; error = "missing clientId" })
                continue
            }

            $Clients[$id] = [ordered]@{
                id = $id
                playerName = [string]$data.playerName
                version = [string]$data.version
                page = [string]$data.page
                flags = [ordered]@{
                    running = [bool]$data.running
                    monitoringSpirit = [bool]$data.monitoringSpirit
                    autoTrialRunning = [bool]$data.autoTrialRunning
                    autoTreasureRunning = [bool]$data.autoTreasureRunning
                    autoInscriptionRunning = [bool]$data.autoInscriptionRunning
                }
                ip = Get-ClientIp $request
                lastSeenMs = NowMs
            }
            Write-JsonResponse $stream 200 ([ordered]@{ ok = $true; online = (Get-Stats).online })
            continue
        }

        if ($request.Method -eq "GET" -and $request.Path -eq "/api/stats") {
            Write-JsonResponse $stream 200 (Get-Stats)
            continue
        }

        if ($request.Method -eq "GET" -and ($request.Path -eq "/" -or $request.Path -eq "/dashboard")) {
            Write-HtmlResponse $stream (Get-Stats)
            continue
        }

        Write-JsonResponse $stream 404 ([ordered]@{ ok = $false; error = "not found" })
    } catch {
        try {
            Write-JsonResponse $client.GetStream() 400 ([ordered]@{ ok = $false; error = $_.Exception.Message })
        } catch {}
    } finally {
        $client.Close()
    }
}
'@

Set-Content -LiteralPath $ServerScript -Value $serverCode -Encoding UTF8

if (!(Test-Path -LiteralPath $Caddy)) {
    $bundledCaddy = Join-Path $PSScriptRoot "caddy.exe"
    if (Test-Path -LiteralPath $bundledCaddy) {
        Copy-Item -LiteralPath $bundledCaddy -Destination $Caddy -Force
    } else {
        $downloadUrl = "https://caddyserver.com/api/download?os=windows&arch=amd64"
        Write-Host "Downloading Caddy..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile $Caddy
    }
}

$caddyConfig = @"
http://$Domain, http://$WwwDomain {
    encode gzip
    reverse_proxy 127.0.0.1:$Port
}

https://$Domain, https://$WwwDomain {
    encode gzip
    reverse_proxy 127.0.0.1:$Port
}
"@
Set-Content -LiteralPath $Caddyfile -Value $caddyConfig -Encoding ASCII

New-NetFirewallRule `
    -DisplayName "LingVerse Online HTTP" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 80 `
    -Action Allow `
    -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule `
    -DisplayName "LingVerse Online HTTPS" `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort 443 `
    -Action Allow `
    -ErrorAction SilentlyContinue | Out-Null

$serverAction = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ServerScript`" > `"$ServerLog`" 2>&1" `
    -WorkingDirectory $Root
$caddyAction = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"`"$Caddy`" run --config `"$Caddyfile`" --adapter caddyfile > `"$CaddyLog`" 2> `"$CaddyErrLog`"`"" `
    -WorkingDirectory $Root
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Unregister-ScheduledTask -TaskName "LingVerseOnlineServer" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "LingVerseOnlineTunnel" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "LingVerseOnlineCaddy" -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName "LingVerseOnlineServer" -Action $serverAction -Trigger $startupTrigger -Principal $principal | Out-Null
Register-ScheduledTask -TaskName "LingVerseOnlineCaddy" -Action $caddyAction -Trigger $startupTrigger -Principal $principal | Out-Null

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*online-server.ps1*" } |
    ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null }
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name caddy -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $Root "cloudflared.log") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ServerLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ServerErrLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $CaddyLog -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $CaddyErrLog -Force -ErrorAction SilentlyContinue

Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ServerScript) `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerLog `
    -RedirectStandardError $ServerErrLog

Start-Process `
    -FilePath $Caddy `
    -ArgumentList @("run", "--config", $Caddyfile, "--adapter", "caddyfile") `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $CaddyLog `
    -RedirectStandardError $CaddyErrLog

$deadline = (Get-Date).AddSeconds(12)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    try {
        $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($tcp) { break }
    } catch {}
}

$localOk = $false
try {
    $local = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/stats" -TimeoutSec 5
    $localOk = $true
} catch {
    Write-Warning "Local stats check failed: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Online stats server installed on ECS."
Write-Host "Dashboard: http://$Domain/"
Write-Host "Dashboard WWW: http://$WwwDomain/"
Write-Host "Heartbeat: http://$Domain/api/heartbeat"
Write-Host "HTTPS Dashboard: https://$Domain/"
Write-Host "Fallback local backend: http://127.0.0.1:$Port/"
Write-Host "Local service check: $localOk"
Write-Host "Important: Alibaba Cloud security group must allow inbound TCP 80 and 443."
if (-not $localOk) {
    Write-Host "Check logs:"
    Write-Host "  $ServerLog"
    Write-Host "  $ServerErrLog"
}
Write-Host "Caddy logs:"
Write-Host "  $CaddyLog"
Write-Host "  $CaddyErrLog"
