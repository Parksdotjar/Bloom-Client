use std::fs;
use std::path::Path;

const BLOOM_MENU_TARGET_FILE: &str = "bloom-menu-1.21.11.jar";
const BLOOM_MENU_BYTES: &[u8] = include_bytes!("../resources/mods/bloom-menu-1.21.11.jar");

fn bloom_menu_supported(loader_type: &str, mc_version: &str) -> bool {
    loader_type.eq_ignore_ascii_case("fabric") && mc_version == "1.21.11"
}

pub fn ensure_bloom_menu_mod(
    instance_dir: &Path,
    loader_type: &str,
    mc_version: &str,
) -> Result<(), String> {
    if !bloom_menu_supported(loader_type, mc_version) {
        return Ok(());
    }

    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    for entry in fs::read_dir(&mods_dir).map_err(|e| e.to_string())? {
        let path = match entry {
            Ok(value) => value.path(),
            Err(err) => return Err(err.to_string()),
        };

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !path.is_file() || !name.starts_with("bloom-menu-") || name == BLOOM_MENU_TARGET_FILE {
            continue;
        }
        let _ = fs::remove_file(&path);
    }

    let target = mods_dir.join(BLOOM_MENU_TARGET_FILE);
    let needs_write = match fs::read(&target) {
        Ok(existing) => existing != BLOOM_MENU_BYTES,
        Err(_) => true,
    };

    if needs_write {
        fs::write(&target, BLOOM_MENU_BYTES).map_err(|e| e.to_string())?;
    }

    Ok(())
}
