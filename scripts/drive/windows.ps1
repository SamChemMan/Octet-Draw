# Octet's window, menus and clipboard on Windows, for scripts/drive/drive.mjs. Run with powershell.exe -STA (the
# clipboard needs it).
#
#   windows.ps1 clip-set TEXT         put text on the clipboard
#   windows.ps1 clip-formats          the clipboard's formats, one a line
#   windows.ps1 clip-get FORMAT       a format's bytes in base64 (text as UTF-8)
#   windows.ps1 menu Edit Paste       click a menu in the menu bar, then an item in it, with the mouse; New* is the
#                                     first item whose name starts with New and that is not a submenu
#   windows.ps1 keys ^v               press keys (SendKeys) in Octet's window
#   windows.ps1 running               yes while Octet runs
#
# The menu is found through Win32 (GetMenu), not UI Automation: UI Automation in .NET shows Octet's window with no
# menu bar or title bar, and MSAA's default action on a menu bar item fails.
param([Parameter(Mandatory)][string]$Command, [Parameter(ValueFromRemainingArguments)][string[]]$Rest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Menus {
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern IntPtr GetMenu(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern IntPtr GetSubMenu(IntPtr menu, int pos);
    [DllImport("user32.dll")] static extern int GetMenuItemCount(IntPtr menu);
    [DllImport("user32.dll")] static extern uint GetMenuState(IntPtr menu, uint pos, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetMenuString(IntPtr menu, uint pos, StringBuilder text, int max, uint flags);
    [DllImport("user32.dll")] static extern bool GetMenuItemRect(IntPtr hwnd, IntPtr menu, uint pos, out RECT rect);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string name);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
    const uint MF_BYPOSITION = 0x400, MF_POPUP = 0x10, MOUSEEVENTF_LEFTDOWN = 2, MOUSEEVENTF_LEFTUP = 4;

    // A menu's items by position: each one's name (without the shortcut after a tab) and whether it opens a submenu.
    static List<Tuple<string, bool>> Items(IntPtr menu) {
        var items = new List<Tuple<string, bool>>();
        for (uint i = 0; i < GetMenuItemCount(menu); i++) {
            var text = new StringBuilder(256);
            GetMenuString(menu, i, text, text.Capacity, MF_BYPOSITION);
            string name = text.ToString().Split('\t')[0].Replace("&&", "\u0001").Replace("&", "").Replace("\u0001", "&").Trim();
            items.Add(Tuple.Create(name, (GetMenuState(menu, i, MF_BYPOSITION) & MF_POPUP) != 0));
        }
        return items;
    }

    static int Pick(List<Tuple<string, bool>> items, string want, bool leaf) {
        for (int i = 0; i < items.Count; i++) {
            bool named = want.EndsWith("*") ? items[i].Item1.StartsWith(want.TrimEnd('*')) : items[i].Item1 == want;
            if (named && !(leaf && items[i].Item2)) return i;
        }
        return -1;
    }

    static void ClickAt(RECT r) {
        SetCursorPos((r.Left + r.Right) / 2, (r.Top + r.Bottom) / 2);
        Thread.Sleep(100);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    // A menu open in the process (a #32768 window).
    static bool Open(uint pid) {
        IntPtr h = IntPtr.Zero;
        while ((h = FindWindowEx(IntPtr.Zero, h, "#32768", null)) != IntPtr.Zero) {
            uint owner;
            GetWindowThreadProcessId(h, out owner);
            if (owner == pid && IsWindowVisible(h)) return true;
        }
        return false;
    }

    // Clicks a menu in the window's menu bar, then an item in it. Returns an error, or null.
    public static string Click(IntPtr window, uint pid, string menu, string item) {
        SetProcessDPIAware();
        IntPtr bar = GetMenu(window);
        var top = Items(bar);
        int k = Pick(top, menu, false);
        if (k < 0) return "no " + menu + " menu; the menu bar has: " + string.Join(", ", top.Select(i => i.Item1));
        IntPtr sub = GetSubMenu(bar, k);
        var items = Items(sub);
        int j = Pick(items, item, true);
        if (j < 0) return "no " + menu + " > " + item + "; the menu has: " + string.Join(", ", items.Select(i => i.Item1).Where(n => n != ""));
        SetForegroundWindow(window);
        RECT r;
        if (!GetMenuItemRect(window, bar, (uint)k, out r)) return "the " + menu + " menu is not in the menu bar on the screen";
        ClickAt(r);
        for (int i = 0; i < 30 && !Open(pid); i++) Thread.Sleep(100);
        if (!Open(pid)) return "the " + menu + " menu did not open";
        Thread.Sleep(200);
        if (!GetMenuItemRect(IntPtr.Zero, sub, (uint)j, out r)) return menu + " > " + item + " is not on the screen";
        ClickAt(r);
        for (int i = 0; i < 30 && Open(pid); i++) Thread.Sleep(100);
        return Open(pid) ? "the " + menu + " menu stayed open after " + item + " was clicked" : null;
    }
}
'@

function Octet-Process { Get-Process octet -ErrorAction SilentlyContinue | Select-Object -First 1 }

# Octet's main window, once it has its menu bar.
function Octet-Window {
    for ($i = 0; $i -lt 40; $i++) {
        $p = Octet-Process
        if (-not $p) { throw 'Octet is not running' }
        $h = $p.MainWindowHandle
        if ($h -ne [IntPtr]::Zero -and [Menus]::GetMenu($h) -ne [IntPtr]::Zero) { return $h }
        Start-Sleep -Milliseconds 250
    }
    throw 'Octet has no window with a menu bar'
}

function Click-Menu([string[]]$path) {
    $window = Octet-Window
    $problem = [Menus]::Click($window, (Octet-Process).Id, $path[0], $path[-1])
    if ($problem) {
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}{ESC}')
        throw $problem
    }
    Start-Sleep -Milliseconds 300
}

switch ($Command) {
    'clip-set' { [System.Windows.Forms.Clipboard]::SetText($Rest[0]) }
    'clip-formats' { [System.Windows.Forms.Clipboard]::GetDataObject().GetFormats() }
    'clip-get' {
        $d = [System.Windows.Forms.Clipboard]::GetData($Rest[0])
        if ($d -is [System.IO.MemoryStream]) { [Convert]::ToBase64String($d.ToArray()) }
        elseif ($d -is [string]) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($d)) }
    }
    'menu' { Click-Menu $Rest }
    'keys' {
        $window = Octet-Window
        [void][Menus]::SetForegroundWindow($window)
        Start-Sleep -Milliseconds 300
        if ([Menus]::GetForegroundWindow() -ne $window) { throw "Octet's window is not in front, so it would not get the keys" }
        [System.Windows.Forms.SendKeys]::SendWait($Rest[0])
    }
    'running' { if (Octet-Process) { 'yes' } else { 'no' } }
    default { throw "unknown command $Command" }
}
