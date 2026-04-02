use std::fs;
use std::path::Path;

const BLOOM_COSMETICS_TARGET_FILE: &str = "bloom-cosmetics-v0.0.23-1.21.11.jar";
const BLOOM_COSMETICS_BYTES: &[u8] =
    include_bytes!("../resources/mods/bloom-cosmetics-v0.0.23-1.21.11.jar");

fn bloom_cosmetics_supported(loader_type: &str, mc_version: &str) -> bool {
    if !loader_type.eq_ignore_ascii_case("fabric") {
        return false;
    }

    // This embedded jar is built for Minecraft 1.21.11 only.
    // Do not inject into other 1.21.x instances until version-specific jars exist.
    let normalized = mc_version.trim();
    normalized == "1.21.11" || normalized.contains("1.21.11")
}

pub fn ensure_bloom_cosmetics_mod(
    instance_dir: &Path,
    loader_type: &str,
    mc_version: &str,
) -> Result<(), String> {
    if !bloom_cosmetics_supported(loader_type, mc_version) {
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
        if !path.is_file() {
            continue;
        }

        let lower = name.to_ascii_lowercase();
        let is_old_bloom_menu = lower.starts_with("bloom-menu-");
        let is_old_bloom_cosmetics =
            lower.starts_with("bloom-cosmetics-")
                && !name.eq_ignore_ascii_case(BLOOM_COSMETICS_TARGET_FILE);

        if !(is_old_bloom_menu || is_old_bloom_cosmetics) {
            continue;
        }

        let _ = fs::remove_file(&path);
    }

    let target = mods_dir.join(BLOOM_COSMETICS_TARGET_FILE);
    let needs_write = match fs::read(&target) {
        Ok(existing) => existing != BLOOM_COSMETICS_BYTES,
        Err(_) => true,
    };

    if needs_write {
        fs::write(&target, BLOOM_COSMETICS_BYTES).map_err(|e| e.to_string())?;
    }

    // Defensive verification so launch can't continue with a missing jar.
    if !target.is_file() {
        return Err(format!(
            "Bloom Cosmetics injector failed: {} was not written.",
            target.display()
        ));
    }

    Ok(())
}
