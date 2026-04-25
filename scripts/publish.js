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
// ---------------------

const version = process.argv[2];
const password = process.argv[3];

if (!version) {
  console.error('Error: Please provide a version number (e.g., node publish.js 1.0.6 [password])');
  process.exit(1);
}

const semver = version.startsWith('v') ? version.substring(1) : version;
const tag = `v${semver}`;

const rootDir = path.resolve(__dirname, '..');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const packageJsonPath = path.join(rootDir, 'package.json');

// [1] Version bump
console.log(`[1] Bumping version to ${semver}...`);
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = semver;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
packageJson.version = semver;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// [2] Build
console.log(`[2] Building Tauri application...`);
const keyPath = path.join(rootDir, 'src-tauri', 'updater_key');
if (fs.existsSync(keyPath)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8').trim();
}
process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = password || '';

try {
  console.log(`[2.1] Building with updater bundles...`);
  execSync('npx tauri build --bundles updater,nsis', { cwd: rootDir, stdio: 'inherit' });
} catch (err) {
  console.error('Build failed!');
  process.exit(1);
}

// [3] Artifacts dhundho (ZIP ya EXE)
const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');

let updateArtifactPath = path.join(bundleDir, `ClothingPOS_${semver}_x64-setup.nsis.zip`);
let updateArtifactName = `ClothingPOS_${semver}_x64-setup.nsis.zip`;

if (!fs.existsSync(updateArtifactPath)) {
  console.log('⚠️  .nsis.zip nahi mili, .exe use kar raha hoon...');
  updateArtifactPath = path.join(bundleDir, `ClothingPOS_${semver}_x64-setup.exe`);
  updateArtifactName = `ClothingPOS_${semver}_x64-setup.exe`;
}

const sigPath = `${updateArtifactPath}.sig`;

if (!fs.existsSync(updateArtifactPath)) {
  console.error(`\n❌ Koi bhi installer file nahi mili: ${updateArtifactPath}`);
  process.exit(1);
}

if (!fs.existsSync(sigPath)) {
  console.error(`\n❌ Signature file nahi mili: ${sigPath}`);
  process.exit(1);
}

const signature = fs.readFileSync(sigPath, 'utf8').trim();
console.log(`✅ Using Artifact: ${updateArtifactName}`);
console.log(`✅ Using Signature: ${updateArtifactName}.sig`);

// GitHub API Helper
function ghApi(method, endpoint, body = null, isUpload = false) {
  return new Promise((resolve, reject) => {
    const host = isUpload ? 'uploads.github.com' : 'api.github.com';
    const bodyData = body
      ? Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
      : null;
    const headers = {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Tauri-AutoUpdater',
      Accept: 'application/vnd.github.v3+json',
    };
    if (isUpload) headers['Content-Type'] = 'application/octet-stream';
    if (bodyData) headers['Content-Length'] = bodyData.length;

    const req = https.request({ hostname: host, path: endpoint, method, headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const str = Buffer.concat(chunks).toString();
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(str ? JSON.parse(str) : null);
        } else {
          reject(new Error(`GitHub API Error ${res.statusCode}:\n${str}`));
        }
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function publish() {
  try {
    console.log(`\n[3] Creating GitHub Release ${tag}...`);
    const release = await ghApi('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
      tag_name: tag,
      name: `Release ${tag}`,
      body: `Release notes for version ${tag}`,
      draft: false,
      prerelease: false,
    });

    const uploadPath = release.upload_url.split('{')[0].replace('https://uploads.github.com', '');

    // Artifact upload (ZIP ya EXE)
    console.log(`[4] Uploading update artifact: ${updateArtifactName}...`);
    const uploadedAsset = await ghApi('POST', `${uploadPath}?name=${updateArtifactName}`, fs.readFileSync(updateArtifactPath), true);

    // Signature upload
    console.log(`[5] Uploading signature: ${updateArtifactName}.sig...`);
    await ghApi('POST', `${uploadPath}?name=${updateArtifactName}.sig`, fs.readFileSync(sigPath), true);

    const downloadUrl = uploadedAsset.browser_download_url;

    console.log(`[6] Generating update.json...`);
    const updateJson = {
      version: semver,
      notes: `Release notes for version ${tag}`,
      pub_date: new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature: signature,
          url: downloadUrl,
        },
      },
    };

    const updateJsonPath = path.join(rootDir, 'update.json');
    fs.writeFileSync(updateJsonPath, JSON.stringify(updateJson, null, 2));
    console.log(`update.json saved — URL: ${downloadUrl}`);

    console.log(`\n[8] Git commit & push...`);
    try {
      execSync('git add package.json src-tauri/tauri.conf.json update.json', { cwd: rootDir });
      execSync(`git commit -m "chore(release): bump version to ${semver}"`, { cwd: rootDir });
      execSync('git push', { cwd: rootDir });
      console.log('Pushed to main branch.');
    } catch (gitErr) {
      console.warn('Git push fail — manually push karo.');
    }

    console.log(`\n🎉 Release ${tag} complete! Auto-update ab sahi kaam karega.`);
  } catch (err) {
    console.error('\nPublish failed:', err.message);
    process.exit(1);
  }
}

publish();