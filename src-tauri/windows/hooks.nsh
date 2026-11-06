; Octet Drawing, the object Word, PowerPoint and Excel keep (decision 0023, src-tauri/src/ole.rs). Tauri's installer
; runs these hooks (bundle.windows.nsis.installerHooks). The keys are per user, under HKCU\Software\Classes: no
; administrator and no UAC prompt. The list is ole.rs's keys(); its test keys_match_the_installer checks that the two
; agree. An update runs the installer again, which writes the program's path again.
;
; The installer is a 32-bit program, so without SetRegView its CLSID keys would go only to the 32-bit view
; (Software\Classes\Wow6432Node\CLSID), where 64-bit Office does not look. The keys go to both views: 64-bit Office
; reads one and 32-bit Office the other. Octet writes both views too, at each start (ole_windows.rs repair).

!define OCTET_CLSID "{211EF98F-E45E-42C8-9D49-A10D2D394DB2}"

!macro OCTET_OLE_KEYS
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing" "" 'Octet Drawing'
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing\CLSID" "" '${OCTET_CLSID}'
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing\CurVer" "" 'OctetDraw.Drawing.1'
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing\Insertable" "" ""
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing.1" "" 'Octet Drawing'
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing.1\CLSID" "" '${OCTET_CLSID}'
  WriteRegStr HKCU "Software\Classes\OctetDraw.Drawing.1\Insertable" "" ""
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}" "" 'Octet Drawing'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\LocalServer32" "" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\InprocHandler32" "" 'ole32.dll'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\ProgID" "" 'OctetDraw.Drawing.1'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\VersionIndependentProgID" "" 'OctetDraw.Drawing'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\Insertable" "" ""
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\DefaultIcon" "" '$INSTDIR\${MAINBINARYNAME}.exe,0'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\AuxUserType\2" "" 'Octet Drawing'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\AuxUserType\3" "" 'Octet Draw'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\MiscStatus" "" '528'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\Verb\0" "" '&Edit,0,2'
  WriteRegStr HKCU "Software\Classes\CLSID\${OCTET_CLSID}\Verb\1" "" '&Open,0,2'
  WriteRegStr HKCU "Software\Classes\Octet Drawing\CLSID" "" '${OCTET_CLSID}'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  SetRegView 64
  !insertmacro OCTET_OLE_KEYS
  SetRegView 32
  !insertmacro OCTET_OLE_KEYS
  SetRegView default
!macroend

!macro OCTET_OLE_REMOVE
  DeleteRegKey HKCU "Software\Classes\OctetDraw.Drawing"
  DeleteRegKey HKCU "Software\Classes\OctetDraw.Drawing.1"
  DeleteRegKey HKCU "Software\Classes\CLSID\${OCTET_CLSID}"
  DeleteRegKey HKCU "Software\Classes\Octet Drawing\CLSID"
!macroend

; Uninstall removes the keys. An uninstaller run with /UPDATE ($UpdateMode is 1) leaves them: the new installer
; writes them again.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    SetRegView 64
    !insertmacro OCTET_OLE_REMOVE
    SetRegView 32
    !insertmacro OCTET_OLE_REMOVE
    SetRegView default
  ${EndIf}
!macroend
