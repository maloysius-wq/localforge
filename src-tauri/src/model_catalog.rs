//! Bundled, user-initiated Hugging Face model catalog.
//! Model URLs are fixed in native code; the UI cannot supply arbitrary download URLs.
use std::{fs, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

pub(crate) const DEFAULT_ID: &str = "qwen25-coder-15b";
#[derive(Clone, Copy, Debug)]
pub(crate) struct ModelSpec {
    pub(crate) id: &'static str,
    pub(crate) filename: &'static str,
    pub(crate) url: &'static str,
    pub(crate) min_bytes: u64,
    pub(crate) max_bytes: u64,
}

pub(crate) fn spec(id: Option<&str>) -> Result<ModelSpec, String> {
    match id.unwrap_or(DEFAULT_ID) {
        DEFAULT_ID => Ok(ModelSpec {
            id: DEFAULT_ID,
            filename: "qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
            url: "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
            min_bytes: 800_000_000, max_bytes: 1_500_000_000,
        }),
        "qwen25-coder-3b" => Ok(ModelSpec {
            id: "qwen25-coder-3b",
            filename: "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
            url: "https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf",
            min_bytes: 1_500_000_000, max_bytes: 2_600_000_000,
        }),
        "qwen3-4b-instruct-2507" => Ok(ModelSpec {
            id: "qwen3-4b-instruct-2507",
            filename: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
            // Upstream Qwen publishes weights, not this specific GGUF quantization.
            // This is Unsloth's public quantization; integrity verified against HF LFS SHA-256.
            url: "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
            min_bytes: 2_000_000_000, max_bytes: 3_100_000_000,
        }),
        _ => Err("Unknown model. Select one of the three supported catalog entries.".into()),
    }
}

pub(crate) fn destination(app: &AppHandle, model: ModelSpec, download_dir: Option<&str>) -> Result<PathBuf, String> {
    let folder = match download_dir.filter(|value| !value.trim().is_empty()) {
        Some(selected) => {
            // The folder must already exist: users choose it in a native directory picker.
            // Never create an arbitrary absolute directory supplied through an IPC argument.
            let path = Path::new(selected);
            let resolved = path.canonicalize()
                .map_err(|e| format!("Selected model folder is unavailable: {e}. Choose another folder in Settings."))?;
            if !resolved.is_dir() {
                return Err("The model destination is not a directory.".into());
            }
            resolved
        }
        None => app.path().app_data_dir().map_err(|e| e.to_string())?.join("models"),
    };
    Ok(folder.join(model.filename))
}

/// Refuse to overwrite a different or suspicious file. No application-managed model
/// download is ever allowed to follow a symlink at its final filename.
pub(crate) fn require_unused_target(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Err(format!("A file already exists at {}. LocalForge will not overwrite it. Choose another folder, or select that GGUF manually.", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Cannot inspect destination: {error}")),
    }
}

pub(crate) fn is_native_qwen25(filename: &std::ffi::OsStr) -> bool {
    [spec(None).unwrap().filename, spec(Some("qwen25-coder-3b")).unwrap().filename]
        .iter().any(|name| filename == std::ffi::OsStr::new(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_preapproved_https_model_sources_can_be_selected() {
        assert_eq!(spec(None).unwrap().id, DEFAULT_ID);
        for id in [DEFAULT_ID, "qwen25-coder-3b", "qwen3-4b-instruct-2507"] {
            let item = spec(Some(id)).unwrap();
            assert!(item.url.starts_with("https://huggingface.co/"));
            assert!(item.url.ends_with(item.filename));
            assert!(item.min_bytes < item.max_bytes);
        }
        assert!(spec(Some("https://evil.example/gguf")).is_err());
        assert!(spec(Some("../../somewhere")).is_err());
    }
    #[test]
    fn protects_existing_destination_files_and_symlinks() {
        let root = std::env::temp_dir().join(format!("localforge-model-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let file = root.join("model.gguf");
        require_unused_target(&file).unwrap();
        fs::write(&file, b"existing file").unwrap();
        assert!(require_unused_target(&file).is_err());
        fs::remove_dir_all(&root).unwrap();
    }
}
