!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\.bloom" "" "BloomClient.Modpack"
  WriteRegStr SHCTX "Software\Classes\.bloom" "Content Type" "application/x-bloom-modpack"
  WriteRegStr SHCTX "Software\Classes\BloomClient.Modpack" "" "Bloom Modpack"
  WriteRegStr SHCTX "Software\Classes\BloomClient.Modpack\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\BloomClient.Modpack\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\BloomClient.Modpack\shell\open" "" "Open with Bloom Client"
  WriteRegStr SHCTX "Software\Classes\BloomClient.Modpack\shell\open\command" "" '$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\"'
  System::Call 'shell32::SHChangeNotify(i, i, p, p) v (${SHCNE_ASSOCCHANGED}, ${SHCNF_IDLIST}, 0, 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\.bloom"
  DeleteRegKey SHCTX "Software\Classes\BloomClient.Modpack"
  System::Call 'shell32::SHChangeNotify(i, i, p, p) v (${SHCNE_ASSOCCHANGED}, ${SHCNF_IDLIST}, 0, 0)'
!macroend
