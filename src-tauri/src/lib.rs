mod auth;
mod backgrounds;
mod bloom_mod;
mod discord_presence;
mod downloader;
mod external_updater;
mod fabric;
mod instances;
mod launcher;
mod mojang;
mod paths;
mod servers;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;
            for (_, window) in app.webview_windows() {
                let _ = window.set_icon(icon.clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            paths::paths_get,
            instances::instances_list,
            instances::instances_get,
            instances::instances_create,
            instances::instances_update,
            instances::instances_delete,
            instances::open_mods_folder,
            instances::open_resourcepacks_folder,
            instances::open_shaderpacks_folder,
            instances::instance_install_mod_files,
            instances::instance_install_mod_paths,
            instances::instance_install_fabric_api,
            instances::instance_list_mods,
            instances::instance_list_resourcepacks,
            instances::instance_list_shaderpacks,
            instances::instance_toggle_mod,
            instances::instance_disable_incompatible_mods,
            instances::instance_delete_mod,
            instances::instance_delete_resourcepack,
            instances::instance_delete_shaderpack,
            instances::instance_copy_game_options,
            instances::marketplace_search_mods,
            instances::marketplace_install_mod,
            instances::marketplace_search_modpacks,
            instances::marketplace_install_modpack_instance,
            instances::import_local_modpack_instance,
            instances::marketplace_search_resourcepacks,
            instances::marketplace_install_resourcepack,
            instances::marketplace_search_shaders,
            instances::marketplace_install_shaderpack,
            auth::auth_login_start,
            auth::auth_open_browser,
            auth::auth_login_poll,
            auth::auth_refresh_session,
            auth::auth_upload_skin,
            auth::auth_pull_skin_by_username,
            mojang::mc_versions_list,
            downloader::instance_install,
            launcher::instance_launch,
            fabric::fabric_versions_list,
            external_updater::external_update_check,
            external_updater::external_update_install,
            discord_presence::discord_presence_set,
            discord_presence::discord_presence_clear,
            backgrounds::launcher_background_save,
            backgrounds::launcher_background_load,
            backgrounds::launcher_background_clear,
            servers::hosted_servers_list,
            servers::hosted_servers_get,
            servers::hosted_servers_create,
            servers::hosted_servers_update,
            servers::hosted_servers_delete,
            servers::hosted_servers_start,
            servers::hosted_servers_stop,
            servers::hosted_servers_restart,
            servers::hosted_servers_status,
            servers::hosted_servers_send_command,
            servers::hosted_servers_logs,
            servers::hosted_servers_logs_clear,
            servers::hosted_servers_open_folder,
            servers::hosted_servers_files_list,
            servers::hosted_servers_files_read,
            servers::hosted_servers_files_write,
            servers::hosted_servers_files_create,
            servers::hosted_servers_files_rename,
            servers::hosted_servers_files_delete,
            servers::hosted_servers_backups_list,
            servers::hosted_servers_backups_create,
            servers::hosted_servers_backups_delete,
            servers::hosted_servers_backups_restore,
            servers::hosted_servers_tunnel_open,
            servers::hosted_servers_tunnel_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
