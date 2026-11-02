param(
    [string]$StatusPath = "$env:TEMP\dsh-user-status.json",
    [int]$MaxSeconds = 0
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class UserStatusNative
{
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }
}
"@

$script:qmPids = @()
$script:qmTitles = New-Object System.Collections.ArrayList
$script:qmVisible = New-Object System.Collections.ArrayList

$enumCallback = [UserStatusNative+EnumWindowsProc]{
    param($hWnd, $lParam)
    $wpid = 0
    [void][UserStatusNative]::GetWindowThreadProcessId($hWnd, [ref]$wpid)
    if ($script:qmPids -contains $wpid) {
        $sb = New-Object System.Text.StringBuilder 512
        [void][UserStatusNative]::GetWindowText($hWnd, $sb, 512)
        $text = $sb.ToString().Trim()
        if ($text -match ' - ') {
            [void]$script:qmTitles.Add($text)
            if ([UserStatusNative]::IsWindowVisible($hWnd)) {
                [void]$script:qmVisible.Add($text)
            }
        }
    }
    return $true
}

$started = Get-Date
if ($MaxSeconds -gt 0) {
    $deadline = $started.AddSeconds($MaxSeconds)
} else {
    $deadline = [DateTime]::MaxValue
}

while ((Get-Date) -lt $deadline) {
    try {
        $hwnd = [UserStatusNative]::GetForegroundWindow()
        $titleSb = New-Object System.Text.StringBuilder 512
        [void][UserStatusNative]::GetWindowText($hwnd, $titleSb, 512)
        $fgPid = 0
        [void][UserStatusNative]::GetWindowThreadProcessId($hwnd, [ref]$fgPid)
        $fgProc = ''
        try { $fgProc = (Get-Process -Id $fgPid -ErrorAction Stop).ProcessName } catch { }

        $lii = New-Object UserStatusNative+LASTINPUTINFO
        $lii.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($lii)
        [void][UserStatusNative]::GetLastInputInfo([ref]$lii)
        $idle = [math]::Round(([Environment]::TickCount - $lii.dwTime) / 1000, 1)

        $musicTitle = $null
        $script:qmTitles.Clear()
        $script:qmVisible.Clear()
        $qm = @(Get-Process QQMusic -ErrorAction SilentlyContinue)
        if ($qm.Count -gt 0) {
            $script:qmPids = @($qm | ForEach-Object { $_.Id })
            [void][UserStatusNative]::EnumWindows($enumCallback, [IntPtr]::Zero)
            if ($script:qmVisible.Count -gt 0) { $musicTitle = $script:qmVisible[0] }
            elseif ($script:qmTitles.Count -gt 0) { $musicTitle = $script:qmTitles[0] }
        }

        $musicObj = $null
        if ($musicTitle) {
            $musicObj = @{ title = $musicTitle }
        }

        $payload = @{
            ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            idleSec = $idle
            foreground = @{
                title = $titleSb.ToString()
                process = $fgProc
                pid = $fgPid
            }
            music = $musicObj
        }
        $json = $payload | ConvertTo-Json -Compress -Depth 6
        [System.IO.File]::WriteAllText($StatusPath, $json)
    } catch {
        try {
            $err = @{ ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); error = $_.Exception.Message } | ConvertTo-Json -Compress
            [System.IO.File]::WriteAllText($StatusPath, $err)
        } catch { }
    }
    Start-Sleep -Milliseconds 1000
}
