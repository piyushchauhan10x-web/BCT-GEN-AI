const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage', 'venv', '.venv', 'env', '__pycache__', '.idea', '.vscode', 'target', 'vendor', '.cache', '.parcel-cache', '.turbo', '.pytest_cache']);
const EXCLUDE_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', 'Gemfile.lock', 'poetry.lock']);
const CODE_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'go', 'rb', 'php', 'rs', 'swift', 'kt', 'kts', 'm', 'mm', 'sql', 'sh', 'bash', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'graphql', 'proto']);
const CONFIG_FILES = new Set(['package.json', 'requirements.txt', 'pyproject.toml', 'pom.xml', 'build.gradle', 'Gemfile', 'Cargo.toml', 'composer.json', 'pubspec.yaml', 'go.mod', 'tsconfig.json']);
const MAX_FILES = 15;
const MAX_FILE_CHARS = 5000;
const MAX_CONFIG_CHARS = 3000;

let selectedFiles = [];

const folderInput = document.getElementById('folderInput');
const fileCountEl = document.getElementById('fileCount');
const fileListEl = document.getElementById('fileList');
const generateBtn = document.getElementById('generateBtn');
const statusEl = document.getElementById('status');
const errbox = document.getElementById('errbox');

function isIgnoredPath(path) {
  return path.split('/').some(seg => IGNORED_DIRS.has(seg));
}

folderInput.addEventListener('change', async (e) => {
  errbox.style.display = 'none';
  statusEl.innerHTML = '';
  const files = Array.from(e.target.files);
  const candidates = files.filter(f => {
    const path = f.webkitRelativePath || f.name;
    if (isIgnoredPath(path)) return false;
    const name = path.split('/').pop();
    if (EXCLUDE_FILES.has(name)) return false;
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    if (CONFIG_FILES.has(name)) return true;
    if (CODE_EXT.has(ext) && f.size < 300000) return true;
    return false;
  });

  const read = await Promise.all(candidates.map(async f => {
    const path = f.webkitRelativePath || f.name;
    let content = '';
    try { content = await f.text(); } catch (err) { content = ''; }
    return { path, name: path.split('/').pop(), ext: path.includes('.') ? path.split('.').pop().toLowerCase() : '', content, size: f.size, isConfig: CONFIG_FILES.has(path.split('/').pop()) };
  }));

  selectedFiles = read;
  renderFileList();
});

function renderFileList() {
  fileCountEl.textContent = selectedFiles.length + ' file' + (selectedFiles.length === 1 ? '' : 's') + ' detected';
  fileListEl.innerHTML = selectedFiles.slice(0, 200).map(f =>
    '<div class="row"><span>' + f.path + '</span><span class="badge">' + (f.ext || 'cfg') + '</span></div>'
  ).join('');
  generateBtn.disabled = selectedFiles.length === 0;
}

function buildFileTree(paths) {
  return [...paths].sort().map(p => {
    const depth = p.split('/').length - 1;
    return '  '.repeat(depth) + p.split('/').pop();
  }).join('\n');
}

function pickDocFiles(files) {
  const configs = files.filter(f => f.isConfig);
  const code = files.filter(f => !f.isConfig).sort((a, b) => b.size - a.size);
  return configs.concat(code).slice(0, MAX_FILES);
}

// Proxied backend request interceptor hitting Llama 3 on local port
async function callClaude(prompt) {
  const response = await fetch("/api/generate-docs", { // Base URL hata kar sirf routing path rakhein
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt })
  });
  // ... rest of the code
  if (!response.ok) {
    const errPayload = await response.json().catch(() => ({}));
    throw new Error(errPayload.error || 'Backend pipeline processing error.');
  }
  const data = await response.json();
  return data.text;
}

function setStep(steps, i) {
  statusEl.innerHTML = steps.map((label, idx) => {
    const cls = idx < i ? 'done' : (idx === i ? 'active' : '');
    return '<div class="step ' + cls + '"><span class="dot"></span>' + label + '</div>';
  }).join('');
}

generateBtn.addEventListener('click', async () => {
  errbox.style.display = 'none';
  generateBtn.disabled = true;

  const docFiles = pickDocFiles(selectedFiles);
  const configFiles = docFiles.filter(f => f.isConfig);
  const codeFiles = docFiles.filter(f => !f.isConfig);
  const steps = ['Scanning folder', 'Drafting overview', ...codeFiles.map(f => 'Documenting ' + f.name), 'Finalizing'];

  try {
    setStep(steps, 0);
    const fileTreeText = buildFileTree(selectedFiles.map(f => f.path));
    const configText = configFiles.map(f => '--- ' + f.path + ' ---\n' + f.content.slice(0, MAX_CONFIG_CHARS)).join('\n\n') || '(none detected)';

    setStep(steps, 1);
    const overviewPrompt =
`You are generating the top-level overview section of auto-generated developer documentation for a codebase.

Folder structure (irrelevant folders already removed):
${fileTreeText}

Contents of detected config/manifest files:
${configText}

Write a concise markdown overview, starting at a "##" heading (no top-level "#" title). Cover in order:
1) a short paragraph describing what the project likely does, based on the file names, structure, and config
2) "### Tech stack" as a bullet list of detected languages, frameworks, and libraries
3) "### Project structure" briefly explaining the main folders
4) "### Getting started" with concrete setup and run commands inferred from the config files. If you can't infer a command confidently, say so plainly instead of guessing.
Do not wrap the response in a code fence.`;
    const overview = await callClaude(overviewPrompt);

    const fileSections = [];
    for (let i = 0; i < codeFiles.length; i++) {
      setStep(steps, 2 + i);
      const f = codeFiles[i];
      const truncated = f.content.length > MAX_FILE_CHARS ? f.content.slice(0, MAX_FILE_CHARS) + '\n...(truncated)' : f.content;
      const filePrompt =
`You are documenting a single source file as part of auto-generated developer documentation.

File path: ${f.path}
Language: ${f.ext}

File content (may be truncated):
"""
${truncated}
"""

Write a concise markdown section. Start with a level-3 heading using the file path as inline code, like "### \`${f.path}\`". Then cover: what this file is responsible for, its key exported functions/classes/components with a one-line purpose each, and any notable dependencies or side effects. Do not reproduce the raw code. Do not wrap the response in a code fence. Keep it tight and skimmable.`;
      const section = await callClaude(filePrompt);
      fileSections.push(section);
    }

    setStep(steps, steps.length - 1);
    const projectName = document.getElementById('projectName').value.trim() || 'project';
    const fullMarkdown = `# ${projectName} — documentation\n\n${overview}\n\n## Files\n\n${fileSections.join('\n\n')}`;

    window.__generatedMarkdown = fullMarkdown;
    const docContent = document.getElementById('docContent');
    docContent.innerHTML = marked.parse(fullMarkdown);
    docContent.style.display = 'block';
    document.getElementById('paperEmpty').style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';

    const tb = document.getElementById('titleBlock');
    tb.style.display = 'block';
    document.getElementById('tbProject').textContent = projectName;
    document.getElementById('tbDate').textContent = new Date().toISOString().slice(0, 10);
    document.getElementById('tbFiles').textContent = docFiles.length;
    document.getElementById('tbStatus').textContent = 'complete';

    setStep(steps, steps.length);
  } catch (err) {
    errbox.style.display = 'block';
    errbox.textContent = err.message || 'Something went wrong while generating the documentation.';
  } finally {
    generateBtn.disabled = false;
  }
});

document.getElementById('downloadBtn').addEventListener('click', () => {
  const md = window.__generatedMarkdown || '';
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'DOCUMENTATION.md';
  a.click();
  URL.revokeObjectURL(url);
});