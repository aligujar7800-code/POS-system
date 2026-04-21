import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable is missing.');
  process.exit(1);
}
const REPO_OWNER = 'aligujar7800-code';
const REPO_NAME = 'POS-system';
const TARGET = 'x86_64-pc-windows-msvc'; // Default tauri windows target
// ---------------------

const version = process.argv[2];
const password = process.argv[3];

if (!version) {
  console.error('Error: Please provide a version number (e.g., node publish.js 1.0.1 [password])');
  process.exit(1);
}

// Ensure version has 'v' prefix for tags, but purely semantic for config
const semver = version.startsWith('v') ? version.substring(1) : version;
const tag = `v${semver}`;

const rootDir = path.resolve(__dirname, '..');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const packageJsonPath = path.join(rootDir, 'package.json');

console.log(`[1] Bumping version to ${semver}...`);
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = semver;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
packageJson.version = semver;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log(`[2] Building Tauri application...`);
// Set the signing key content directly (Tauri v2 standard)
const keyPath = path.join(rootDir, 'src-tauri', 'updater_key');
if (fs.existsSync(keyPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8').trim();
}
if (password) {
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = password;
} else {
  process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '';
}

try {
  execSync('npm run tauri build', { cwd: rootDir, stdio: 'inherit' });
} catch (err) {
  console.error("Build failed!");
  process.exit(1);
}

const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const installerName = `ClothingPOS_${semver}_x64-setup.exe`;
const installerPath = path.join(bundleDir, installerName);
const sigPath = `${installerPath}.sig`;

// Check for artifacts and try manual signing as fallback
if (!fs.existsSync(installerPath)) {
  console.error("Could not find generated installer at:", installerPath);
  process.exit(1);
}

if (!fs.existsSync(sigPath)) {
  console.log(`[2.1] Signature file missing. Attempting manual signing...`);
  try {
    // Clear the env var so it doesn't conflict with the -f (file path) flag
    delete process.env.TAURI_SIGNING_PRIVATE_KEY;
    const signCmd = `npx tauri signer sign -f "${keyPath}" "${installerPath}"`;
    execSync(signCmd, { cwd: rootDir, stdio: 'inherit', input: '' });
  } catch (signErr) {
    console.warn("Manual signing attempt finished. Checking results...");
  }
}

if (!fs.existsSync(sigPath)) {
  console.error("Error: Signature file (.sig) is still missing. The auto-updater will not work without it.");
  process.exit(1);
}

const signature = fs.readFileSync(sigPath, 'utf8');

// GitHub API Helper
function ghApi(method, endpoint, body = null, isUpload = false) {
  return new Promise((resolve, reject) => {
    let host = isUpload ? 'uploads.github.com' : 'api.github.com';
    const bodyData = body ? (Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))) : null;
    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Tauri-AutoUpdater',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (isUpload) {
      headers['Content-Type'] = 'application/octet-stream';
    }
    if (bodyData) {
      headers['Content-Length'] = bodyData.length;
    }
    const req = https.request({
      hostname: host,
      path: endpoint,
      method,
      headers,
    }, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const str = Buffer.concat(data).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(str ? JSON.parse(str) : null);
        } else {
          reject(new Error(`GitHub API Error: ${res.statusCode}\n${str}`));
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function publish() {
  try {
    console.log(`[3] Creating GitHub Release ${tag}...`);
    const release = await ghApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
      tag_name: tag,
      name: `Release ${tag}`,
      body: `Auto-generated release for version ${tag}`,
      draft: false,
      prerelease: false
    });

    const releaseId = release.id;
    const uploadUrl = release.upload_url.split('{')[0]; // Clean the {?name,label} part
    const uploadPath = uploadUrl.replace('https://uploads.github.com', '');

    console.log(`[4] Uploading Installer...`);
    const exeBuffer = fs.readFileSync(installerPath);
    const uploadedAsset = await ghApi('POST', `${uploadPath}?name=${installerName}`, exeBuffer, true);
    
    console.log(`[5] Uploading Signature...`);
    const sigBuffer = fs.readFileSync(sigPath);
    await ghApi('POST', `${uploadPath}?name=${installerName}.sig`, sigBuffer, true);

    const assetUrl = uploadedAsset.browser_download_url;

    console.log(`[6] Generating update.json...`);
    const updateJson = {
      version: semver,
      notes: `Release notes for version ${tag}`,
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature: signature,
          url: assetUrl
        }
      }
    };

    const updateJsonPath = path.join(rootDir, 'update.json');
    fs.writeFileSync(updateJsonPath, JSON.stringify(updateJson, null, 2));

    console.log(`[7] Committing to Git...`);
    try {
      execSync('git add package.json src-tauri/tauri.conf.json update.json', { cwd: rootDir });
      execSync(`git commit -m "chore(release): bump version to ${semver}"`, { cwd: rootDir });
      execSync('git push', { cwd: rootDir });
      console.log('✅ Changes pushed to main branch.');
    } catch(gitErr) {
      console.warn("⚠️  Git operations failed. You might need to manually commit and push update.json");
    }

    console.log(`🎉 Successfully published ${tag}! Your existing desktop clients will now auto-update.`);
  } catch (err) {
    console.error("Publish failed:", err);
    process.exit(1);
  }
}

publish();
