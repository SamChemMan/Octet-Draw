# Octet's window, menus and clipboard on Windows, for scripts/drive/drive.mjs. Run with powershell.exe -STA (the
# clipboard needs it).
#
#   windows.ps1 clip-set TEXT         put text on the clipboard
#   windows.ps1 clip-formats          the clipboard's formats, one a line
#   windows.ps1 clip-get FORMAT       a format's bytes in base64 (text as UTF-8)
#   windows.ps1 menu Edit Paste       click a menu bar item through UI Automation; New* is the first item whose name
#                                     starts with New and that is not a submenu
#   windows.ps1 keys ^v               press keys (SendKeys) in Octet's window
#   windows.ps1 running               yes while Octet runs
param([Parameter(Mandatory)][string]$Command, [Parameter(ValueFromRemainingArguments)][string[]]$Rest)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, UIAutomationClient, UIAutomationTypes
$UIA = [System.Windows.Automation.AutomationElement]
$Tree = [System.Windows.Automation.TreeScope]

function Octet-Process { Get-Process octet -ErrorAction SilentlyContinue | Select-Object -First 1 }

# Octet's main window: a top-level window of its process with a menu bar.
function Octet-Window {
    $p = Octet-Process
    if (-not $p) { throw 'Octet is not running' }
    $cond = New-Object System.Windows.Automation.PropertyCondition($UIA::ProcessIdProperty, $p.Id)
    for ($i = 0; $i -lt 40; $i++) {
        foreach ($w in $UIA::RootElement.FindAll($Tree::Children, $cond)) {
            if (Menu-Bar $w) { return $w }
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'Octet has no window with a menu bar'
}

function Menu-Bar($window) {
    $bar = New-Object System.Windows.Automation.PropertyCondition($UIA::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuBar)
    $window.FindFirst($Tree::Descendants, $bar)
}

# The menu items under an element: Win32 menu item names can carry the shortcut after a tab.
function Items($under) {
    $item = New-Object System.Windows.Automation.PropertyCondition($UIA::ControlTypeProperty, [System.Windows.Automation.ControlType]::MenuItem)
    foreach ($e in $under.FindAll($Tree::Descendants, $item)) {
        [pscustomobject]@{ Element = $e; Name = ($e.Current.Name -split "`t")[0].Trim() }
    }
}

function Is-Submenu($e) {
    $pattern = $null
    if (-not $e.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) { return $false }
    $pattern.Current.ExpandCollapseState -ne [System.Windows.Automation.ExpandCollapseState]::LeafNode
}

function Pick($items, $want, $leaf) {
    foreach ($i in $items) {
        $ok = if ($want.EndsWith('*')) { $i.Name.StartsWith($want.TrimEnd('*')) } else { $i.Name -eq $want }
        if ($ok -and (-not $leaf -or -not (Is-Submenu $i.Element))) { return $i.Element }
    }
    $null
}

function Click-Menu([string[]]$path) {
    $window = Octet-Window
    $p = Octet-Process
    $top = Pick (Items (Menu-Bar $window)) $path[0] $false
    if (-not $top) { throw "no $($path[0]) menu; the menu bar has: $((Items (Menu-Bar $window)).Name -join ', ')" }
    $top.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
    Start-Sleep -Milliseconds 400
    # The open menu is a window of Octet's process at the top of the tree.
    $cond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition($UIA::ProcessIdProperty, $p.Id)),
        (New-Object System.Windows.Automation.PropertyCondition($UIA::ControlTypeProperty, [System.Windows.Automation.ControlType]::Menu)))
    $menus = @($UIA::RootElement.FindAll($Tree::Descendants, $cond))
    $found = $null
    foreach ($m in $menus) { $found = Pick (Items $m) $path[-1] $true; if ($found) { break } }
    if (-not $found) {
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
        throw "no $($path -join ' > '); the open menu has: $(($menus | ForEach-Object { (Items $_).Name }) -join ', ')"
    }
    $found.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Start-Sleep -Milliseconds 500
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
        (Octet-Window).SetFocus()
        Start-Sleep -Milliseconds 300
        [System.Windows.Forms.SendKeys]::SendWait($Rest[0])
    }
    'running' { if (Octet-Process) { 'yes' } else { 'no' } }
    default { throw "unknown command $Command" }
}
