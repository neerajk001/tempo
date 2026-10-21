/**
 * Public links for the native desktop build.
 *
 * The installer asset is published on GitHub Releases under a stable name
 * (`Tempo_x64-setup.exe`), so `releases/latest/download/...` keeps working
 * across versions. Keep the asset name in sync with the release workflow.
 */
export const REPO_URL = "https://github.com/neerajk001/tempo";
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const WINDOWS_INSTALLER_URL = `${REPO_URL}/releases/latest/download/Tempo_x64-setup.exe`;
