#[cfg(target_os = "windows")]
pub fn ensure_bloom_file_association() -> Result<(), String> {
    use std::env;
    use windows_sys::Win32::UI::Shell::{SHCNE_ASSOCCHANGED, SHCNF_IDLIST, SHChangeNotify};
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;

    let exe_path = env::current_exe().map_err(|e| e.to_string())?;
    let exe_display = exe_path.display().to_string();
    let command = format!("\"{}\" \"%1\"", exe_display);
    let icon = format!("\"{}\",0", exe_display);
    let exe_name = exe_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid executable name.")?
        .to_string();

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu
        .create_subkey("Software\\Classes")
        .map_err(|e| e.to_string())?
        .0;

    let bloom_ext = classes
        .create_subkey(".bloom")
        .map_err(|e| e.to_string())?
        .0;
    bloom_ext
        .set_value("", &"BloomClient.Modpack")
        .map_err(|e| e.to_string())?;
    bloom_ext
        .set_value("Content Type", &"application/x-bloom-modpack")
        .map_err(|e| e.to_string())?;
    let open_with_progids = bloom_ext
        .create_subkey("OpenWithProgids")
        .map_err(|e| e.to_string())?
        .0;
    open_with_progids
        .set_value("BloomClient.Modpack", &String::new())
        .map_err(|e| e.to_string())?;

    let prog_id = classes
        .create_subkey("BloomClient.Modpack")
        .map_err(|e| e.to_string())?
        .0;
    prog_id
        .set_value("", &"Bloom Modpack")
        .map_err(|e| e.to_string())?;

    let default_icon = prog_id
        .create_subkey("DefaultIcon")
        .map_err(|e| e.to_string())?
        .0;
    default_icon
        .set_value("", &icon)
        .map_err(|e| e.to_string())?;

    let shell = prog_id
        .create_subkey("shell")
        .map_err(|e| e.to_string())?
        .0;
    shell
        .set_value("", &"open")
        .map_err(|e| e.to_string())?;

    let open = shell
        .create_subkey("open")
        .map_err(|e| e.to_string())?
        .0;
    open.set_value("", &"Open with Bloom Client")
        .map_err(|e| e.to_string())?;

    let open_command = open
        .create_subkey("command")
        .map_err(|e| e.to_string())?
        .0;
    open_command
        .set_value("", &command)
        .map_err(|e| e.to_string())?;

    let applications = classes
        .create_subkey(format!("Applications\\{}", exe_name))
        .map_err(|e| e.to_string())?
        .0;
    applications
        .set_value("FriendlyAppName", &"Bloom Client")
        .map_err(|e| e.to_string())?;
    let supported_types = applications
        .create_subkey("SupportedTypes")
        .map_err(|e| e.to_string())?
        .0;
    supported_types
        .set_value(".bloom", &String::new())
        .map_err(|e| e.to_string())?;
    let app_shell = applications
        .create_subkey("shell\\open\\command")
        .map_err(|e| e.to_string())?
        .0;
    app_shell
        .set_value("", &command)
        .map_err(|e| e.to_string())?;

    unsafe {
        SHChangeNotify(
            SHCNE_ASSOCCHANGED as i32,
            SHCNF_IDLIST,
            std::ptr::null(),
            std::ptr::null(),
        );
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_bloom_file_association() -> Result<(), String> {
    Ok(())
}
