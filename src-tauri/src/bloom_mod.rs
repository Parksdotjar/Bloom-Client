use std::fs;
use std::path::Path;
use std::time::Duration;

const BLOOM_COSMETICS_TARGET_FILE: &str = "bloom-cosmetics-1.21.11-latest.jar";
const BLOOM_COSMETICS_BYTES: &[u8] =
    include_bytes!("../resources/mods/bloom-cosmetics-1.21.11-latest.jar");
const BLOOMS_KERNEL_TARGET_FILE: &str = "blooms-kernel-1.21.11-latest.jar";
const BLOOMS_KERNEL_BYTES: &[u8] =
    include_bytes!("../resources/mods/blooms-kernel-1.21.11-latest.jar");
const BLOOM_VULKANMOD_PREFIX: &str = "bloom-vulkanmod-";
const MODRINTH_VULKANMOD_VERSIONS_URL: &str = "https://api.modrinth.com/v2/project/vulkanmod/version";

fn bloom_cosmetics_supported(loader_type: &str, mc_version: &str) -> bool {
    loader_type.eq_ignore_ascii_case("fabric") && mc_version == "1.21.11"
}

fn renderer_supports_vulkan(loader_type: &str, mc_version: &str) -> bool {
    loader_type.eq_ignore_ascii_case("fabric") && mc_version.starts_with("1.21.")
}

fn normalize_renderer(renderer: &str, loader_type: &str, mc_version: &str) -> String {
    if renderer.eq_ignore_ascii_case("vulkan") && renderer_supports_vulkan(loader_type, mc_version)
    {
        "vulkan".to_string()
    } else {
        "opengl".to_string()
    }
}

fn is_bloom_related_mod_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    // Remove stale Bloom mod jars and disabled leftovers that can shadow/load
    // unpredictably across different launchers/mod states.
    lower.starts_with("bloom-menu-")
        || lower.starts_with("bloom-cosmetics-")
        || lower.starts_with("blooms-kernel-")
}

fn is_bloom_vulkan_file(name: &str) -> bool {
    name.to_ascii_lowercase().starts_with(BLOOM_VULKANMOD_PREFIX)
}

fn is_conflicting_renderer_mod(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("vulkanmod")
        || lower.contains("sodium")
        || lower.contains("iris")
        || lower.contains("embeddium")
        || lower.contains("oculus")
        || lower.contains("rubidium")
        || lower.contains("optifine")
        || lower.contains("canvas")
}

fn cleanup_managed_vulkan_mods(mods_dir: &Path) -> Result<(), String> {
    if !mods_dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(mods_dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if is_bloom_vulkan_file(name) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

fn remove_conflicting_renderer_mods(mods_dir: &Path, keep_file_name: &str) -> Result<(), String> {
    if !mods_dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(mods_dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.eq_ignore_ascii_case(keep_file_name) {
            continue;
        }
        if is_conflicting_renderer_mod(name) {
            let _ = fs::remove_file(path);
        }
    }
    Ok(())
}

#[derive(serde::Deserialize)]
struct ModrinthVersionFile {
    url: String,
    #[serde(default)]
    primary: bool,
}

#[derive(serde::Deserialize)]
struct ModrinthVersion {
    date_published: Option<String>,
    files: Vec<ModrinthVersionFile>,
}

async fn download_vulkan_mod_for_version(mc_version: &str) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let versions_url = format!(
        "{MODRINTH_VULKANMOD_VERSIONS_URL}?game_versions=%5B%22{}%22%5D&loaders=%5B%22fabric%22%5D",
        mc_version
    );
    let mut versions: Vec<ModrinthVersion> = client
        .get(&versions_url)
        .send()
        .await
        .map_err(|e| format!("Failed to query VulkanMod metadata: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Failed to query VulkanMod metadata: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse VulkanMod metadata: {}", e))?;

    versions.sort_by(|a, b| b.date_published.cmp(&a.date_published));
    let download_url = versions
        .iter()
        .find_map(|version| {
            version
                .files
                .iter()
                .find(|file| file.primary)
                .or_else(|| version.files.first())
                .map(|file| file.url.clone())
        })
        .ok_or_else(|| format!("No VulkanMod build found for Minecraft {}.", mc_version))?;

    let bytes = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download VulkanMod: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Failed to download VulkanMod: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read VulkanMod bytes: {}", e))?;

    if bytes.len() < 4 || bytes[0] != 0x50 || bytes[1] != 0x4B {
        return Err("Downloaded VulkanMod file is not a valid jar.".to_string());
    }

    Ok(bytes.to_vec())
}

pub async fn ensure_instance_renderer_mods(
    instance_dir: &Path,
    loader_type: &str,
    mc_version: &str,
    renderer: &str,
) -> Result<String, String> {
    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    let effective_renderer = normalize_renderer(renderer, loader_type, mc_version);
    if effective_renderer != "vulkan" {
        cleanup_managed_vulkan_mods(&mods_dir)?;
        return Ok(effective_renderer);
    }

    cleanup_managed_vulkan_mods(&mods_dir)?;
    let target_file_name = format!("{}{}.jar", BLOOM_VULKANMOD_PREFIX, mc_version);
    let target = mods_dir.join(&target_file_name);
    let downloaded = download_vulkan_mod_for_version(mc_version).await?;

    let needs_write = match fs::read(&target) {
        Ok(existing) => existing != downloaded,
        Err(_) => true,
    };
    if needs_write {
        fs::write(&target, downloaded).map_err(|e| e.to_string())?;
    }

    remove_conflicting_renderer_mods(&mods_dir, &target_file_name)?;
    Ok(effective_renderer)
}

fn cleanup_bloom_mods(
    mods_dir: &Path,
    keep_cosmetics: bool,
    keep_kernel: bool,
) -> Result<(), String> {
    if !mods_dir.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(mods_dir).map_err(|e| e.to_string())? {
        let path = match entry {
            Ok(value) => value.path(),
            Err(err) => return Err(err.to_string()),
        };
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !is_bloom_related_mod_file(name) {
            continue;
        }

        let keep_this = (keep_cosmetics && name.eq_ignore_ascii_case(BLOOM_COSMETICS_TARGET_FILE))
            || (keep_kernel && name.eq_ignore_ascii_case(BLOOMS_KERNEL_TARGET_FILE));
        if keep_this {
            continue;
        }

        let _ = fs::remove_file(&path);
    }

    Ok(())
}

fn ensure_managed_bloom_mod(
    mods_dir: &Path,
    target_file_name: &str,
    target_bytes: &[u8],
    keep_cosmetics: bool,
    keep_kernel: bool,
) -> Result<(), String> {
    cleanup_bloom_mods(mods_dir, keep_cosmetics, keep_kernel)?;

    let target = mods_dir.join(target_file_name);
    let needs_write = match fs::read(&target) {
        Ok(existing) => existing != target_bytes,
        Err(_) => true,
    };

    if needs_write {
        fs::write(&target, target_bytes).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn ensure_bloom_cosmetics_mod(
    instance_dir: &Path,
    loader_type: &str,
    mc_version: &str,
) -> Result<(), String> {
    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    if !bloom_cosmetics_supported(loader_type, mc_version) {
        cleanup_bloom_mods(&mods_dir, false, false)?;
        return Ok(());
    }

    ensure_managed_bloom_mod(
        &mods_dir,
        BLOOM_COSMETICS_TARGET_FILE,
        BLOOM_COSMETICS_BYTES,
        true,
        true,
    )?;
    Ok(())
}

pub fn ensure_blooms_kernel_mod(
    instance_dir: &Path,
    loader_type: &str,
    mc_version: &str,
) -> Result<(), String> {
    let mods_dir = instance_dir.join("mods");
    fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?;

    if !bloom_cosmetics_supported(loader_type, mc_version) {
        cleanup_bloom_mods(&mods_dir, false, false)?;
        return Ok(());
    }

    ensure_managed_bloom_mod(
        &mods_dir,
        BLOOMS_KERNEL_TARGET_FILE,
        BLOOMS_KERNEL_BYTES,
        true,
        true,
    )?;
    Ok(())
}

pub async fn ensure_bloom_injected_mods(
    instance_dir: &Path,
    loader_type: &str,
    mc_version: &str,
    renderer: &str,
) -> Result<(), String> {
    ensure_instance_renderer_mods(instance_dir, loader_type, mc_version, renderer).await?;
    ensure_bloom_cosmetics_mod(instance_dir, loader_type, mc_version)?;
    ensure_blooms_kernel_mod(instance_dir, loader_type, mc_version)?;
    Ok(())
}
