// Keep release builds from opening a console window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    dockview_tauri_demo_lib::run()
}
