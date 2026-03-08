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
    use std::io::{self, Write};
    use std::process::{Command, Stdio};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    let paths: AppPaths = paths_get(app.clone())?;

    // 1. Read Instance Config
    let instance_path = paths
        .instances
        .join(&config.instance_id)
        .join("instance.json");
    let instance_data = fs::read_to_string(&instance_path).map_err(|e| e.to_string())?;
    let instance_json: serde_json::Value =
        serde_json::from_str(&instance_data).map_err(|e| e.to_string())?;

    let mc_version = instance_json["mcVersion"]
        .as_str()
        .ok_or("Missing mcVersion")?;
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
                let profile_str =
                    fs::read_to_string(&fabric_profile_path).map_err(|e| e.to_string())?;
                let profile_json: serde_json::Value =
                    serde_json::from_str(&profile_str).map_err(|e| e.to_string())?;
                if let Some(libs) = profile_json["libraries"].as_array() {
                    for lib in libs {
                        if let Some(name) = lib["name"].as_str() {
                            let lowered = name.to_ascii_lowercase();
                            if lowered
                                .contains("net.fabricmc.fabric-api:fabric-networking-api-v1:5.1.4")
                            {
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
    let version_json_path = paths
        .cache
        .join("versions")
        .join(mc_version)
        .join(format!("{}.json", mc_version));
    let v_json_str = fs::read_to_string(&version_json_path).map_err(|e| e.to_string())?;
    let v_data: serde_json::Value = serde_json::from_str(&v_json_str).map_err(|e| e.to_string())?;

    fn is_allowed_on_windows(lib: &serde_json::Value) -> bool {
        if let Some(rules) = lib["rules"].as_array() {
            // Mojang rule behavior: when rules exist, default disallow;
            // matching rules apply in order.
            let mut allowed = false;
            for rule in rules {
                let action = rule["action"].as_str().unwrap_or("");
                let os_name = rule
                    .get("os")
                    .and_then(|o| o.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("windows");
                if os_name.eq_ignore_ascii_case("windows") {
                    allowed = action == "allow";
                }
            }
            return allowed;
        }
        true
    }

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
    let client_jar = paths
        .runtimes
        .join("versions")
        .join(mc_version)
        .join(format!("{}.jar", mc_version));
    cp_entries.push(client_jar.to_string_lossy().to_string());

    // Libraries
    let libraries_dir = paths.runtimes.join("libraries");
    if let Some(libs) = v_data["libraries"].as_array() {
        for lib in libs {
            let allow = is_allowed_on_windows(lib);

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
    let mut main_class = v_data["mainClass"]
        .as_str()
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();

    if loader_type == "fabric" {
        let fabric_profile_path = paths
            .instances
            .join(&config.instance_id)
            .join("fabric_profile.json");
        if fabric_profile_path.exists() {
            let fabric_json_str =
                fs::read_to_string(&fabric_profile_path).map_err(|e| e.to_string())?;
            let fabric_data: serde_json::Value =
                serde_json::from_str(&fabric_json_str).map_err(|e| e.to_string())?;

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

    // Extract Windows native libraries (LWJGL/OpenAL/etc.) from native classifier jars.
    let mut native_jars: Vec<(std::path::PathBuf, Option<String>)> = Vec::new();
    fn classifier_matches_host(classifier: &str) -> bool {
        let c = classifier.to_ascii_lowercase();
        let is_64 = cfg!(target_pointer_width = "64");
        if !c.starts_with("natives-windows") {
            return false;
        }
        if is_64 {
            // Reject explicit 32-bit and ARM64 natives on x64 hosts.
            if c.contains("x86") && !c.contains("x86_64") {
                return false;
            }
            if c.ends_with("-32") || c.contains("arm64") {
                return false;
            }
            return true;
        }
        // 32-bit host: allow generic/32-bit x86 classifiers only.
        !c.contains("x86_64") && !c.ends_with("-64") && !c.contains("arm64")
    }

    if let Some(libs) = v_data["libraries"].as_array() {
        for lib in libs {
            if !is_allowed_on_windows(lib) {
                continue;
            }
            // Mojang metadata can represent natives in two ways:
            // 1) downloads.classifiers + natives.windows selector
            // 2) separate library entries with classifier in name
            //    e.g. org.lwjgl:lwjgl:3.3.3:natives-windows and downloads.artifact
            if let Some(name) = lib.get("name").and_then(|n| n.as_str()) {
                let parts: Vec<&str> = name.split(':').collect();
                if parts.len() >= 4 {
                    let classifier = parts[3];
                    let is_windows_native = classifier_matches_host(classifier);
                    if is_windows_native {
                        if let Some(artifact) = lib.get("downloads").and_then(|d| d.get("artifact"))
                        {
                            let path = artifact
                                .get("path")
                                .and_then(|p| p.as_str())
                                .map(|p| libraries_dir.join(p));
                            let url = artifact
                                .get("url")
                                .and_then(|u| u.as_str())
                                .map(|u| u.to_string());
                            if let Some(path) = path {
                                native_jars.push((path, url));
                            }
                        }
                        // For this schema we already captured the native jar above.
                        continue;
                    }
                }
            }
            if let Some(classifiers) = lib.get("downloads").and_then(|d| d.get("classifiers")) {
                let arch_token = if cfg!(target_pointer_width = "64") {
                    "64"
                } else {
                    "32"
                };
                let preferred_key = lib
                    .get("natives")
                    .and_then(|n| n.get("windows"))
                    .and_then(|w| w.as_str())
                    .map(|k| k.replace("${arch}", arch_token));

                let native_key = if let Some(key) = preferred_key {
                    if classifiers.get(&key).is_some() && classifier_matches_host(&key) {
                        Some(key)
                    } else {
                        None
                    }
                } else if classifiers.get("natives-windows").is_some()
                    && classifier_matches_host("natives-windows")
                {
                    Some("natives-windows".to_string())
                } else if classifiers.get("natives-windows-64").is_some()
                    && classifier_matches_host("natives-windows-64")
                {
                    Some("natives-windows-64".to_string())
                } else if classifiers.get("natives-windows-x86_64").is_some()
                    && classifier_matches_host("natives-windows-x86_64")
                {
                    Some("natives-windows-x86_64".to_string())
                } else if classifiers.get("natives-windows-32").is_some()
                    && classifier_matches_host("natives-windows-32")
                {
                    Some("natives-windows-32".to_string())
                } else if classifiers.get("natives-windows-x86").is_some()
                    && classifier_matches_host("natives-windows-x86")
                {
                    Some("natives-windows-x86".to_string())
                } else {
                    None
                };

                if let Some(key) = native_key {
                    if let Some(native_obj) = classifiers.get(&key) {
                        let path = native_obj.get("path").and_then(|p| p.as_str());
                        let url = native_obj
                            .get("url")
                            .and_then(|u| u.as_str())
                            .map(|u| u.to_string());
                        if let Some(path) = path {
                            native_jars.push((libraries_dir.join(path), url));
                        }
                    }
                }
            }
        }
    }

    for (native_jar, native_url) in native_jars {
        if !native_jar.exists() {
            if let Some(url) = native_url {
                let response = reqwest::get(&url)
                    .await
                    .map_err(|e| format!("Failed to download native jar {}: {}", url, e))?;
                if !response.status().is_success() {
                    return Err(format!(
                        "Failed to download native jar {} (HTTP {})",
                        url,
                        response.status()
                    ));
                }
                let bytes = response
                    .bytes()
                    .await
                    .map_err(|e| format!("Failed reading native jar bytes {}: {}", url, e))?;
                if let Some(parent) = native_jar.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::write(&native_jar, bytes).map_err(|e| {
                    format!("Failed to write native jar {}: {}", native_jar.display(), e)
                })?;
            } else {
                continue;
            }
        }
        let file = fs::File::open(&native_jar)
            .map_err(|e| format!("Failed to open native jar {}: {}", native_jar.display(), e))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| format!("Invalid native jar {}: {}", native_jar.display(), e))?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| {
                format!(
                    "Failed reading native jar entry {}: {}",
                    native_jar.display(),
                    e
                )
            })?;
            let name = entry.name().replace('\\', "/");
            if entry.is_dir() || name.starts_with("META-INF/") {
                continue;
            }
            if !name.to_ascii_lowercase().ends_with(".dll") {
                continue;
            }

            let file_name = match std::path::Path::new(&name)
                .file_name()
                .and_then(|n| n.to_str())
            {
                Some(n) => n,
                None => continue,
            };
            let out_path = natives_dir.join(file_name);
            let mut out_file = fs::File::create(&out_path)
                .map_err(|e| format!("Failed writing native file {}: {}", out_path.display(), e))?;
            io::copy(&mut entry, &mut out_file).map_err(|e| {
                format!(
                    "Failed extracting native file {}: {}",
                    out_path.display(),
                    e
                )
            })?;
            out_file.flush().map_err(|e| e.to_string())?;
        }
    }

    let lwjgl_dll = natives_dir.join("lwjgl.dll");
    if !lwjgl_dll.exists() {
        return Err(format!(
            "Missing native library lwjgl.dll after native extraction. Try Install again. Natives dir: {}",
            natives_dir.display()
        ));
    }

    let asset_index_id = v_data["assetIndex"]["id"].as_str().unwrap_or("1.21");

    let mut args = Vec::new();

    // JVM Args
    args.push(format!("-Xmx{}M", config.max_memory_mb));
    args.push(format!(
        "-Djava.library.path={}",
        natives_dir.to_string_lossy()
    ));
    args.push(format!(
        "-Dorg.lwjgl.librarypath={}",
        natives_dir.to_string_lossy()
    ));
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
    args.push(
        paths
            .instances
            .join(&config.instance_id)
            .to_string_lossy()
            .to_string(),
    );
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
    let launch_java =
        if cfg!(target_os = "windows") && config.java_path.trim().eq_ignore_ascii_case("java") {
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

    println!("Launching with Java: {}", launch_java);
    // println!("Args: {:?}", args);

    // 6. Spawn process
    let working_dir = paths.instances.join(&config.instance_id);
    let mut launch_candidates = vec![launch_java.clone()];
    if cfg!(target_os = "windows") {
        if !launch_candidates
            .iter()
            .any(|c| c.eq_ignore_ascii_case("javaw"))
        {
            launch_candidates.push("javaw".to_string());
        }
        if !launch_candidates
            .iter()
            .any(|c| c.eq_ignore_ascii_case("java"))
        {
            launch_candidates.push("java".to_string());
        }
    }

    let mut last_err: Option<String> = None;
    let mut spawned_child: Option<std::process::Child> = None;
    for candidate in launch_candidates {
        let stdout_handle = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&launch_log)
            .map_err(|e| {
                format!(
                    "Failed to open launch log file {}: {}",
                    launch_log.display(),
                    e
                )
            })?;
        let stderr_handle = stdout_handle
            .try_clone()
            .map_err(|e| format!("Failed to clone launch log handle: {}", e))?;

        match Command::new(&candidate)
            .args(&args)
            .stdout(Stdio::from(stdout_handle))
            .stderr(Stdio::from(stderr_handle))
            .current_dir(&working_dir)
            .spawn()
        {
            Ok(child) => {
                spawned_child = Some(child);
                break;
            }
            Err(err) => {
                last_err = Some(format!("{} => {}", candidate, err));
            }
        }
    }

    let mut child = spawned_child.ok_or_else(|| {
        format!(
            "Failed to start process with all Java launch candidates. Last error: {}",
            last_err.unwrap_or_else(|| "unknown".to_string())
        )
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
