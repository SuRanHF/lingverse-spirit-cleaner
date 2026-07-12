# 神识清理 · 一键安装脚本
# 用法：右键 → 使用PowerShell运行，或打开终端输入 .\install.ps1

$ErrorActionPreference = "Stop"
$extDir = "$env:USERPROFILE\lingverse-ext"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  神识清理 · 扩展安装脚本" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# 1. 下载最新版
$zipUrl = "https://github.com/SuRanHF/lingverse-spirit-cleaner/releases/latest/download/edge-ext.zip"
$zipFile = "$env:TEMP\lingverse-ext.zip"

Write-Host "`n[1/3] 下载最新版本..." -ForegroundColor Green
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
    Write-Host "  下载完成" -ForegroundColor Gray
} catch {
    # GitHub 被墙的话试 Gitee
    Write-Host "  GitHub 不可用，尝试 Gitee..." -ForegroundColor Yellow
    $zipUrl = "https://gitee.com/wanoujj/lingverse-spirit-cleaner/releases/download/latest/edge-ext.zip"
    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing
        Write-Host "  下载完成" -ForegroundColor Gray
    } catch {
        Write-Host "  下载失败！请检查网络" -ForegroundColor Red
        pause
        exit 1
    }
}

# 2. 解压
Write-Host "`n[2/3] 解压到 $extDir ..." -ForegroundColor Green
if (Test-Path $extDir) { Remove-Item $extDir -Recurse -Force }
Expand-Archive -Path $zipFile -DestinationPath $extDir -Force
Remove-Item $zipFile -Force
Write-Host "  解压完成" -ForegroundColor Gray

# 3. 打开扩展页面
Write-Host "`n[3/3] 打开浏览器扩展管理页..." -ForegroundColor Green
Start-Process "msedge://extensions"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  安装方法：" -ForegroundColor White
Write-Host "  1. 打开「开发人员模式」开关（左下角）" -ForegroundColor Gray
Write-Host "  2. 点击「加载解压缩的扩展」" -ForegroundColor Gray
Write-Host "  3. 选择文件夹: $extDir" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "`n之后更新只需点扩展图标 → 一键更新即可，不需要重装。`n" -ForegroundColor Gray

pause
