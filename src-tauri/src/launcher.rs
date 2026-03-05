use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchConfig {
    pub instance_id: String,
    pub java_path: String,
    pub max_memory_mb: u32,
    pub username: String,
    pub uuid: String,
    pub access_token: String,
}

fn detect_java_major(java_path: &str) -> Option<u32> {
    use std::process::Command;

    let output = Command::new(java_path).arg("-version").output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{}\n{}", stderr, stdout);
    let quoted = combined.split('"').nth(1)?;

    if let Some(rest) = quoted.strip_prefix("1.") {
        let major = rest.split('.').next()?.parse::<u32>().ok()?;
        return Some(major);
    }

    quoted.split('.').next()?.parse::<u32>().ok()
}

#[tauri::command]
pub async fn instance_launch(app: AppHandle, config: LaunchConfig) -> Result<(), String> {
    use crate::paths::{paths_get, AppPaths};
    use std::collections::HashMap;
    use std::fs;
    use std::process::{Command, Stdio};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    let paths: AppPaths = paths_get(app.clone())?;

    // 1. Read Instance Config
    let instance_path = paths.instances.join(&config.instance_id).join("instance.json");
    let instance_data = fs::read_to_string(&instance_path).map_err(|e| e.to_string())?;
    let instance_json: serde_json::Value = serde_json::from_str(&instance_data).map_err(|e| e.to_string())?;
    
    let mc_version = instance_json["mcVersion"].as_str().ok_or("Missing mcVersion")?;
    let loader_type = instance_json["loader"].as_str().unwrap_or("vanilla");

    // Guard against broken mod files that would crash Fabric with ZipException.
    if loader_type == "fabric" {
        let mods_dir = paths.instances.join(&config.instance_id).join("mods");
        if mods_dir.exists() {
            let mut invalid_mods: Vec<String> = Vec::new();
            let mut installed_mod_jars: Vec<String> = Vec::new();

            let entries = fs::read_dir(&mods_dir).map_err(|e| e.to_string())?;
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let file_name = match path.file_name().and_then(|s| s.to_str()) {
                    Some(name) => name.to_string(),
                    None => continue,
                };

                if !file_name.to_ascii_lowercase().ends_with(".jar") {
                    continue;
                }

                installed_mod_jars.push(file_name.clone());

                let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                if metadata.len() == 0 {
                    invalid_mods.push(file_name);
                    continue;
                }

                let bytes = fs::read(&path).map_err(|e| e.to_string())?;
                if bytes.len() < 4 || bytes[0] != 0x50 || bytes[1] != 0x4B {
                    invalid_mods.push(file_name);
                }
            }

            if !invalid_mods.is_empty() {
                return Err(format!(
                    "Invalid mod file(s) detected: {}. Remove/reinstall these mods and launch again.",
                    invalid_mods.join(", ")
                ));
            }

            // Compatibility guard for known Fabric breakages.
            let lower_names: Vec<String> = installed_mod_jars
                .iter()
                .map(|name| name.to_ascii_lowercase())
                .collect();

            let has_essential = lower_names.iter().any(|name| name.contains("essential"));
            let has_smoothboot = lower_names.iter().any(|name| name.contains("smoothboot"));
            let has_fabric_api = lower_names.iter().any(|name| name.contains("fabric-api"));
            let has_direct_networking_api = lower_names
                .iter()
                .any(|name| name.contains("fabric-networking-api-v1"));

            // Additional compatibility checks from fabric profile libraries. Essential may pull
            // incompatible fabric-networking-api libs through essential-dependencies without a
            // matching jar filename in /mods.
            let mut profile_has_networking_v1_5_1_4 = false;
            let mut profile_has_fabric_api_base_1_0_5 = false;
            let fabric_profile_path = paths
                .instances
                .join(&config.instance_id)
                .join("fabric_profile.json");
            if fabric_profile_path.exists() {
                let profile_str = fs::read_to_string(&fabric_profile_path).map_err(|e| e.to_string())?;
                let profile_json: serde_json::Value =
                    serde_json::from_str(&profile_str).map_err(|e| e.to_string())?;
                if let Some(libs) = profile_json["libraries"].as_array() {
                    for lib in libs {
                        if let Some(name) = lib["name"].as_str() {
                            let lowered = name.to_ascii_lowercase();
                            if lowered.contains("net.fabricmc.fabric-api:fabric-networking-api-v1:5.1.4") {
                                profile_has_networking_v1_5_1_4 = true;
                            }
                            if lowered.contains("net.fabricmc.fabric-api:fabric-api-base:1.0.5") {
                                profile_has_fabric_api_base_1_0_5 = true;
                            }
                        }
                    }
                }
            }

            if mc_version == "1.21.1"
                && has_essential
                && (has_fabric_api
                    || has_direct_networking_api
                    || profile_has_networking_v1_5_1_4
                    || profile_has_fabric_api_base_1_0_5)
            {
                return Err(
                    "Compatibility check failed: your instance has Essential on Minecraft 1.21.1 with an incompatible Fabric networking dependency chain \
(`fabric-networking-api-v1` / `fabric-api-base`). This exact combo causes the mixin crash you posted. \
Remove Essential-related jars for this instance or install an Essential build explicitly compatible with Fabric 1.21.1."
                        .to_string(),
                );
            }

            // Guard common 1.19.2 SmoothBoot crash pattern on Java 21+.
            let is_119 = mc_version.starts_with("1.19");
            let java_major = detect_java_major(&config.java_path).unwrap_or(0);
            if is_119 && has_smoothboot && java_major >= 21 {
                return Err(
                    "Compatibility check failed: this 1.19.x Fabric pack includes SmoothBoot and is being launched on Java 21+. \
This often crashes during mixin startup (like your java.lang.Thread/SmoothBoot error). \
Use Java 17 for this instance or disable/remove smoothboot, then launch again."
                        .to_string(),
                );
            }
        }
    }

    // 2. Read Version JSON
    let version_json_path = paths.cache.join("versions").join(mc_version).join(format!("{}.json", mc_version));
    let v_json_str = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    let v_data: serde_json::Value = serde_json::from_str(&v_json_str).map_err(|e| e.to_string())?;

    // 3. Build Classpath
    // Deduplicate Maven libraries by "group:artifact" so we never include
    // conflicting versions (for example ASM 9.6 and 9.9 at the same time).
    fn extract_maven_key_from_path(path: &str) -> Option<String> {
        let normalized = path.replace('\\', "/");
        let parts: Vec<&str> = normalized.split('/').collect();
        if parts.len() < 4 {
            return None;
        }
        let artifact = parts[parts.len() - 3];
        let group_parts = &parts[..parts.len() - 3];
        if group_parts.is_empty() || artifact.is_empty() {
            return None;
        }
        Some(format!("{}:{}", group_parts.join("."), artifact))
    }

    // Returns true when `candidate` should replace `current`.
    fn is_newer_version(candidate: &str, current: &str) -> bool {
        let to_parts = |value: &str| -> Vec<i32> {
            value
                .split(|c: char| !c.is_ascii_alphanumeric())
                .filter(|part| !part.is_empty())
                .map(|part| part.parse::<i32>().unwrap_or(0))
                .collect()
        };
        let cand = to_parts(candidate);
        let curr = to_parts(current);
        let max_len = cand.len().max(curr.len());
        for idx in 0..max_len {
            let a = *cand.get(idx).unwrap_or(&0);
            let b = *curr.get(idx).unwrap_or(&0);
            if a != b {
                return a > b;
            }
        }
        false
    }

    // key => (priority, version, absolute_path)
    let mut cp_libs: HashMap<String, (u8, String, String)> = HashMap::new();
    let mut cp_entries = Vec::new();

    // Client JAR
    let client_jar = paths.runtimes.join("versions").join(mc_version).join(format!("{}.jar", mc_version));
    cp_entries.push(client_jar.to_string_lossy().to_string());

    // Libraries
    let libraries_dir = paths.runtimes.join("libraries");
    if let Some(libs) = v_data["libraries"].as_array() {
        for lib in libs {
            // Apply simple OS rules (Windows only for now)
            let mut allow = true;
            if let Some(rules) = lib["rules"].as_array() {
                let mut rules_allow = false;
                let mut rules_disallow = false;
                for rule in rules {
                    let action = rule["action"].as_str().unwrap_or("");
                    let os_name = rule.get("os").and_then(|o| o.get("name")).and_then(|n| n.as_str());
                    if action == "allow" {
                        if os_name.is_none() || os_name == Some("windows") {
                            rules_allow = true;
                        }
                    } else if action == "disallow" {
                        if os_name == Some("windows") {
                            rules_disallow = true;
                        }
                    }
                }
                allow = rules_allow && !rules_disallow;
            }

            if allow {
                if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact")) {
                    if let Some(path) = artifact.get("path").and_then(|p| p.as_str()) {
                        let lib_path = libraries_dir.join(path);
                        if let Some(key) = extract_maven_key_from_path(path) {
                            let normalized = path.replace('\\', "/");
                            let path_parts: Vec<&str> = normalized.split('/').collect();
                            let version = path_parts
                                .get(path_parts.len().saturating_sub(2))
                                .copied()
                                .unwrap_or_default()
                                .to_string();
                            let candidate_path = lib_path.to_string_lossy().to_string();
                            match cp_libs.get(&key) {
                                None => {
                                    cp_libs.insert(key, (1, version, candidate_path));
                                }
                                Some((current_priority, current_version, _)) => {
                                    if *current_priority < 1
                                        || (*current_priority == 1
                                            && is_newer_version(&version, current_version))
                                    {
                                        cp_libs.insert(key, (1, version, candidate_path));
                                    }
                                }
                            }
                        } else {
                            cp_entries.push(lib_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    // Fabric Libraries
    let mut main_class = v_data["mainClass"].as_str().unwrap_or("net.minecraft.client.main.Main").to_string();

    if loader_type == "fabric" {
        let fabric_profile_path = paths.instances.join(&config.instance_id).join("fabric_profile.json");
        if fabric_profile_path.exists() {
            let fabric_json_str = fs::read_to_string(&fabric_profile_path).map_err(|e| e.to_string())?;
            let fabric_data: serde_json::Value = serde_json::from_str(&fabric_json_str).map_err(|e| e.to_string())?;
            
            if let Some(m) = fabric_data["mainClass"].as_str() {
                main_class = m.to_string();
            }

            if let Some(libs) = fabric_data["libraries"].as_array() {
                for lib in libs {
                    let name = lib["name"].as_str().unwrap_or("");
                    let parts: Vec<&str> = name.split(':').collect();
                    if parts.len() == 3 {
                        let domain = parts[0].replace('.', "/");
                        let artifact = parts[1];
                        let version = parts[2];
                        let filename = format!("{}-{}.jar", artifact, version);
                        let path = libraries_dir
                            .join(domain)
                            .join(artifact)
                            .join(version)
                            .join(filename);
                        let key = format!("{}:{}", parts[0], artifact);
                        let candidate_path = path.to_string_lossy().to_string();
                        match cp_libs.get(&key) {
                            None => {
                                cp_libs.insert(key, (2, version.to_string(), candidate_path));
                            }
                            Some((current_priority, current_version, _)) => {
                                if *current_priority < 2
                                    || (*current_priority == 2
                                        && is_newer_version(version, current_version))
                                {
                                    cp_libs.insert(key, (2, version.to_string(), candidate_path));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut merged_libs: Vec<String> = cp_libs.into_values().map(|(_, _, path)| path).collect();
    merged_libs.sort();
    cp_entries.extend(merged_libs);

    let classpath = cp_entries.join(";"); // Windows separator

    // 4. Setup natives
    let natives_dir = paths.instances.join(&config.instance_id).join("natives");
    fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;
    
    // (In a full implementation, we'd extract native JARs here. Skipping for brevity as many modern 
    // installations fetch natives via simple classpath DLLs anyway).

    let asset_index_id = v_data["assetIndex"]["id"].as_str().unwrap_or("1.21");

    let mut args = Vec::new();

    // JVM Args
    args.push(format!("-Xmx{}M", config.max_memory_mb));
    args.push(format!("-Djava.library.path={}", natives_dir.to_string_lossy()));
    args.push(format!("-Djna.tmpdir={}", natives_dir.to_string_lossy()));
    args.push("-Dminecraft.launcher.brand=bloom".to_string());
    args.push("-Dminecraft.launcher.version=1.0".to_string());
    
    // Modern versions define JVM args in JSON, but we can safely skip mapping them all and just provide CP and MainClass
    args.push("-cp".to_string());
    args.push(classpath);
    args.push(main_class.to_string());

    // Game Args
    args.push("--username".to_string());
    args.push(config.username.clone());
    args.push("--version".to_string());
    args.push(mc_version.to_string());
    args.push("--gameDir".to_string());
    args.push(paths.instances.join(&config.instance_id).to_string_lossy().to_string());
    args.push("--assetsDir".to_string());
    args.push(paths.runtimes.join("assets").to_string_lossy().to_string());
    args.push("--assetIndex".to_string());
    args.push(asset_index_id.to_string());
    args.push("--uuid".to_string());
    args.push(config.uuid.clone());
    args.push("--accessToken".to_string());
    args.push(config.access_token.clone());
    args.push("--userType".to_string());
    args.push("msa".to_string());
    args.push("--versionType".to_string());
    args.push("release".to_string());

    // Prefer javaw on Windows when using default java launcher to avoid flashing a console.
    let launch_java = if cfg!(target_os = "windows") && config.java_path.trim().eq_ignore_ascii_case("java") {
        "javaw".to_string()
    } else {
        config.java_path.clone()
    };

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let launch_log = paths
        .logs
        .join(format!("launch-{}-{}.log", config.instance_id, ts));

    let out_log = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&launch_log)
        .map_err(|e| format!("Failed to open launch log file {}: {}", launch_log.display(), e))?;
    let err_log = out_log
        .try_clone()
        .map_err(|e| format!("Failed to clone launch log handle: {}", e))?;

    println!("Launching with Java: {}", launch_java);
    // println!("Args: {:?}", args);

    // 6. Spawn process
    let mut child = Command::new(&launch_java)
        .args(&args)
        .stdout(Stdio::from(out_log))
        .stderr(Stdio::from(err_log))
        .current_dir(paths.instances.join(&config.instance_id))
        .spawn()
        .or_else(|first_err| {
            // Fallback: if javaw failed, retry with java for compatibility.
            if launch_java.eq_ignore_ascii_case("javaw") && config.java_path.trim().eq_ignore_ascii_case("java") {
                Command::new("java")
                    .args(&args)
                    .current_dir(paths.instances.join(&config.instance_id))
                    .spawn()
                    .map_err(|fallback_err| {
                        format!(
                            "Failed to start process with javaw ({}), and fallback java failed ({}).",
                            first_err, fallback_err
                        )
                    })
            } else {
                Err(format!("Failed to start process: {}", first_err))
            }
        })?;

    // Detect immediate launch failures so the UI can report a useful error.
    for _ in 0..25 {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "Minecraft exited immediately (status: {}). Check launch log: {}",
                    status,
                    launch_log.display()
                ));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(120)),
            Err(e) => return Err(format!("Failed while monitoring launched process: {}", e)),
        }
    }

    println!("Minecraft launched successfully! PID: {}", child.id());

    Ok(())
}
