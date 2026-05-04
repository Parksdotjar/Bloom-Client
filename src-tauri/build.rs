use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn parse_env_file(path: &Path, values: &mut HashMap<String, String>) {
    println!("cargo:rerun-if-changed={}", path.display());
    let Ok(contents) = fs::read_to_string(path) else {
        return;
    };

    for raw_line in contents.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim().to_string();
        let value = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        if !key.is_empty() {
            values.insert(key, value);
        }
    }
}

fn emit_env(values: &HashMap<String, String>, output_key: &str, input_keys: &[&str]) {
    if std::env::var(output_key).is_ok() {
        return;
    }
    for key in input_keys {
        let value = values
            .get(*key)
            .cloned()
            .or_else(|| std::env::var(key).ok())
            .filter(|value| !value.trim().is_empty());
        if let Some(value) = value {
            println!("cargo:rustc-env={}={}", output_key, value);
            return;
        }
    }
}

fn main() {
    let mut values = HashMap::new();
    parse_env_file(Path::new("../.env"), &mut values);
    parse_env_file(Path::new("../.env.local"), &mut values);
    parse_env_file(Path::new(".env"), &mut values);
    parse_env_file(Path::new(".env.local"), &mut values);

    emit_env(&values, "BLOOM_SUPABASE_URL", &["BLOOM_SUPABASE_URL", "VITE_SUPABASE_URL"]);
    emit_env(&values, "BLOOM_SUPABASE_ANON", &["BLOOM_SUPABASE_ANON", "VITE_SUPABASE_ANON_KEY"]);
    emit_env(&values, "BLOOM_CURSEFORGE_RELAY_URL", &["BLOOM_CURSEFORGE_RELAY_URL"]);
    emit_env(&values, "BLOOM_RELAY_SHARED_KEY", &["BLOOM_RELAY_SHARED_KEY"]);

    tauri_build::build()
}
