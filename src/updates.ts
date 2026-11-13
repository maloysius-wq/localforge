import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export interface UpdateInfo {currentVersion: string;latestVersion: string | null;available: boolean;installable: boolean;notes: string;releaseUrl: string}
export interface UpdateProgress {received:number;total:number}
export const checkForUpdates = () => invoke<UpdateInfo>("check_for_updates");
export const installUpdate = () => invoke<void>("install_verified_update");
export const onUpdateProgress = (fn:(progress:UpdateProgress)=>void) => listen<UpdateProgress>("update-progress", event=>fn(event.payload));
