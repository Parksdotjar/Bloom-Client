mod paths;
mod instances;
mod auth;
mod mojang;
mod downloader;
mod launcher;
mod fabric;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            for (_, window) in app.webview_windows() {
                let _ = window.set_icon(icon.clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            paths::paths_get,
            instances::instances_list,
            instances::instances_create,
            instances::instances_update,
            instances::instances_delete,
            instances::open_mods_folder,
            instances::instance_install_mod_files,
            instances::instance_install_mod_paths,
            instances::instance_install_fabric_api,
            instances::instance_list_mods,
            instances::instance_toggle_mod,
            instances::instance_disable_incompatible_mods,
            instances::instance_delete_mod,
            instances::marketplace_search_mods,
            instances::marketplace_install_mod,
            instances::marketplace_search_modpacks,
            instances::marketplace_install_modpack_instance,
            instances::marketplace_search_resourcepacks,
            instances::marketplace_install_resourcepack,
            auth::auth_login_start,
            auth::auth_open_browser,
            auth::auth_login_poll,
            auth::auth_upload_skin,
            auth::auth_pull_skin_by_username,
            mojang::mc_versions_list,
            downloader::instance_install,
            launcher::instance_launch,
            fabric::fabric_versions_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
