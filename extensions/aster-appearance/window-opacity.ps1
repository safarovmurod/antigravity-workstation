param(
  [Parameter(Mandatory = $true)][ValidateRange(50, 100)][int]$Percent,
  [Parameter(Mandatory = $true)][string]$ProcessPath
)
$ErrorActionPreference = 'Stop'
# Window opacity is a Windows feature of the top-level window, not of the IDE:
# every visible main window of this IDE executable gets the same alpha. At 100%
# the layered style is removed again, so the window is exactly as before.
if (-not ('AsterWindowOpacity' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class AsterWindowOpacity {
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder name, int size);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] static extern int SetWindowLong(IntPtr hWnd, int index, int value);
  [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr hWnd, uint key, byte alpha, uint flags);
  [DllImport("user32.dll")] static extern bool GetLayeredWindowAttributes(IntPtr hWnd, out uint key, out byte alpha, out uint flags);
  const int GWL_EXSTYLE = -20;
  const int WS_EX_LAYERED = 0x80000;
  const uint LWA_ALPHA = 2;
  public static List<IntPtr> Windows(int[] pids) {
    var found = new List<IntPtr>();
    var owners = new HashSet<uint>();
    foreach (int pid in pids) owners.Add((uint)pid);
    EnumWindows((hWnd, lParam) => {
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (!owners.Contains(pid) || !IsWindowVisible(hWnd) || GetWindow(hWnd, 4) != IntPtr.Zero) return true;
      var name = new StringBuilder(64);
      GetClassName(hWnd, name, name.Capacity);
      if (name.ToString() == "Chrome_WidgetWin_1") found.Add(hWnd);
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static int Apply(IntPtr hWnd, byte alpha) {
    int style = GetWindowLong(hWnd, GWL_EXSTYLE);
    if (alpha == 255) {
      if ((style & WS_EX_LAYERED) != 0) {
        SetLayeredWindowAttributes(hWnd, 0, 255, LWA_ALPHA);
        SetWindowLong(hWnd, GWL_EXSTYLE, style & ~WS_EX_LAYERED);
      }
      return 255;
    }
    SetWindowLong(hWnd, GWL_EXSTYLE, style | WS_EX_LAYERED);
    SetLayeredWindowAttributes(hWnd, 0, alpha, LWA_ALPHA);
    return Read(hWnd);
  }
  public static int Read(IntPtr hWnd) {
    if ((GetWindowLong(hWnd, GWL_EXSTYLE) & WS_EX_LAYERED) == 0) return 255;
    uint key, flags; byte alpha;
    return GetLayeredWindowAttributes(hWnd, out key, out alpha, out flags) && (flags & LWA_ALPHA) != 0 ? alpha : 255;
  }
}
'@
}
$target = [IO.Path]::GetFullPath($ProcessPath)
$ids = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and [string]::Equals([IO.Path]::GetFullPath($_.Path), $target, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
  } | ForEach-Object { $_.Id })
$alpha = [byte][Math]::Round(255 * $Percent / 100)
$applied = @()
if ($ids.Count) {
  foreach ($window in [AsterWindowOpacity]::Windows([int[]]$ids)) { $applied += [AsterWindowOpacity]::Apply($window, $alpha) }
}
[pscustomobject]@{ percent = $Percent; processes = $ids.Count; windows = $applied.Count; alpha = @($applied) } | ConvertTo-Json -Compress
