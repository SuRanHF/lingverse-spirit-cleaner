# Run this script on the Alibaba Cloud Windows Server.
# It installs the online stats backend and Caddy HTTPS proxy.
# Save this file as UTF-8 with BOM to preserve Chinese characters.

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

# Write helper using BOM encoding to preserve Chinese
function Write-Utf8Bom($Path, $Text) {
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($true))
}

$serverCode = @'
$ErrorActionPreference = "Stop"

$Port = 18766
$OnlineWindowSeconds = 90
$Clients = @{}
$FeedbackFile = Join-Path $PSScriptRoot "feedbacks.json"
$Feedbacks = @()
if (Test-Path $FeedbackFile) {
    try { $Feedbacks = Get-Content $FeedbackFile -Raw -Encoding UTF8 | ConvertFrom-Json; if ($null -eq $Feedbacks) { $Feedbacks = @() } } catch { $Feedbacks = @() }
    if ($Feedbacks -isnot [array]) { $Feedbacks = @($Feedbacks) }
}

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
            playerName = $client.playerName
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
    if ($Flags.running) { $items += "qingli" }
    if ($Flags.monitoringSpirit) { $items += "jiance" }
    if ($Flags.autoTrialRunning) { $items += "shilian" }
    if ($Flags.autoTreasureRunning) { $items += "cangbaotu" }
    if ($Flags.autoInscriptionRunning) { $items += "mingwen" }
    if ($items.Count -eq 0) { return "daiming" }
    return ($items -join " / ")
}

function Write-HtmlResponse($Stream, $Stats) {
    $rows = ""
    foreach ($client in $Stats.clients) {
        $displayName = if ($client.playerName) { $client.playerName } else { $client.id }
        $rows += "<tr><td><b>$(Escape-Html $displayName)</b></td><td>$(Escape-Html $client.version)</td><td>$(Escape-Html (Get-FlagText $client.flags))</td><td>$($client.secondsAgo)s ago</td></tr>"
    }
    if ([string]::IsNullOrWhiteSpace($rows)) {
        $rows = '<tr><td colspan="4" class="muted">No online clients</td></tr>'
    }

    $html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="10">
  <title>LingVerse Cleaner Online</title>
  <style>
    body{margin:0;background:#11141d;color:#f5f1e8;font:14px/1.5 "Microsoft YaHei",Arial,sans-serif}
    main{max-width:960px;margin:0 auto;padding:24px}
    h1{margin:0 0 6px;font-size:22px}
    h1 small{font-size:13px;color:#9b927f;font-weight:400}
    .summary{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}
    .stat{padding:14px 18px;border:1px solid rgba(219,185,112,.35);border-radius:8px;background:rgba(255,255,255,.05)}
    .num{font-size:32px;font-weight:800;color:#9be7c3}
    .label{font-size:12px;color:#9b927f;margin-top:2px}
    table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.04);border-radius:8px;overflow:hidden}
    th,td{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left;vertical-align:top}
    th{color:#dbb970;background:rgba(219,185,112,.1);font-size:12px}
    td{font-size:13px}
    b{color:#d8b4fe}
    .muted{color:#9b927f;font-size:12px}
  </style>
</head>
<body>
  <main>
    <h1>LingVerse Cleaner <small>Online</small></h1>
    <div class="muted">Heartbeat in last $($Stats.windowSeconds)s counts as online. Auto-refresh every 10s.</div>
    <section class="summary">
      <div class="stat"><div class="num">$($Stats.online)</div><div class="label">Online</div></div>
      <div class="stat"><div class="label">Updated</div><div style="font-size:13px;color:#cfc6b2;">$(Escape-Html $Stats.updatedAt)</div></div>
    </section>
    <table>
      <thead><tr><th>Player</th><th>Version</th><th>Status</th><th>Last Beat</th></tr></thead>
      <tbody>$rows</tbody>
    </table>
    <h2 style="margin-top:30px;font-size:18px;">Feedback</h2>
    <div id="feedbackList" style="display:grid;gap:8px;"><div class="muted">Loading...</div></div>
    <script>
      fetch('/api/feedback').then(function(r){return r.json()}).then(function(d){
        renderFeedback(d.list||[]);
      });
      function renderFeedback(list){
        var el=document.getElementById('feedbackList');
        if(!list||!list.length){el.innerHTML='<div class=muted>No feedback yet</div>';return;}
        el.innerHTML=list.map(function(f){
          var t=f.time||''; var dd=t.split('T')[0]||''; var ti=t.split('T')[1]||''; ti=ti.split('.')[0]||ti;
          var done=f.status==='done';
          var bg=done?'background:rgba(155,231,195,.06);opacity:.6':'background:rgba(255,255,255,.03)';
          var label=done?'<span style="color:#9be7c3;font-size:11px;">done</span> ':'';
          var btn=done?'':'<button onclick="markDone('+f.index+')" style="background:rgba(155,231,195,.14);color:#9be7c3;border:1px solid rgba(155,231,195,.2);padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Mark Done</button>';
          return '<div style="'+bg+';padding:10px 14px;border-radius:6px;border:1px solid rgba(255,255,255,.06);">'+
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'+
            '<b style="color:#d8b4fe;">'+label+(f.playerName||'Anonymous')+'</b>'+
            '<span style="font-size:11px;color:#9b927f;">v'+(f.version||'')+' '+dd+' '+ti+'</span></div>'+
            '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;">'+
            '<div style="color:#cfc6b2;font-size:13px;flex:1;">'+(f.text||'').replace(/</g,'&lt;')+'</div>'+btn+'</div></div>';
        }).join('');
      }
      function markDone(idx){
        fetch('/api/feedback/done',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:idx})})
          .then(function(r){return r.json()}).then(function(d){
            if(d.ok) fetch('/api/feedback').then(function(r){return r.json()}).then(function(d2){ renderFeedback(d2.list||[]); });
          });
      }
    </script>
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

        if ($request.Method -eq "POST" -and $request.Path -eq "/api/feedback") {
            $data = $request.Body | ConvertFrom-Json
            $entry = [ordered]@{
                status = "pending"
                text = [string]$data.text
                playerName = [string]$data.playerName
                version = [string]$data.version
                time = [DateTimeOffset]::UtcNow.UtcDateTime.ToString("o")
            }
            $Feedbacks += $entry
            if ($Feedbacks.Count -gt 200) { $Feedbacks = @($Feedbacks | Select-Object -Last 200) }
            try { $Feedbacks | ConvertTo-Json -Depth 4 | Out-File -LiteralPath $FeedbackFile -Encoding UTF8 } catch {}
            Write-JsonResponse $stream 200 ([ordered]@{ ok = $true })
            continue
        }

        if ($request.Method -eq "POST" -and $request.Path -eq "/api/feedback/done") {
            $data = $request.Body | ConvertFrom-Json
            $idx = [int]$data.index
            if ($idx -ge 0 -and $idx -lt $Feedbacks.Count) {
                $Feedbacks[$idx].status = "done"
                try { $Feedbacks | ConvertTo-Json -Depth 4 | Out-File -LiteralPath $FeedbackFile -Encoding UTF8 } catch {}
                Write-JsonResponse $stream 200 ([ordered]@{ ok = $true })
            } else {
                Write-JsonResponse $stream 400 ([ordered]@{ ok = $false; error = "invalid index" })
            }
            continue
        }

        if ($request.Method -eq "GET" -and $request.Path -eq "/api/feedback") {
            $list = @()
            for ($i = 0; $i -lt $Feedbacks.Count; $i++) {
                $fb = $Feedbacks[$i]
                $item = [ordered]@{
                    index = $i
                    status = [string]$fb.status
                    text = [string]$fb.text
                    playerName = [string]$fb.playerName
                    version = [string]$fb.version
                    time = [string]$fb.time
                }
                $list += $item
            }
            Write-JsonResponse $stream 200 ([ordered]@{ ok = $true; list = @($list | Select-Object -Last 50) })
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

Write-Utf8Bom $ServerScript $serverCode

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
