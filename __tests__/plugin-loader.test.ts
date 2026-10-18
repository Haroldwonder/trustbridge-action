import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadPlugin, loadPluginsFromAllowlist, PluginLoadError } from '../src/pluginLoader';

// Every test works in its own temp workspace, removed afterwards, so the suite
// never touches the repository or depends on files outside the temp dir.
// Fixtures are CommonJS so they load under Jest on every supported Node version.
const workspaces: string[] = [];

function makeWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trustbridge-plugin-loader-'));
  workspaces.push(dir);
  return dir;
}

function writePlugin(workspaceRoot: string, pluginPath: string, source: string): void {
  const absolutePath = path.join(workspaceRoot, pluginPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source, 'utf8');
}

function pluginSource(id: string, label = 'KYC verified'): string {
  return `module.exports = {
    id: ${JSON.stringify(id)},
    label: ${JSON.stringify(label)},
    run() { return { passed: true, detail: 'ok' }; }
  };`;
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('pluginLoader', () => {
  it('loads a workspace-local plugin from an allowlisted path', async () => {
    const workspaceRoot = makeWorkspace();
    writePlugin(workspaceRoot, 'plugins/kyc.cjs', pluginSource('consumer/kyc-check'));

    const plugin = await loadPlugin(workspaceRoot, 'plugins/kyc.cjs');
    expect(plugin.id).toBe('consumer/kyc-check');
    expect(plugin.label).toBe('KYC verified');
    expect(plugin.run({ account: null, config: {} as never, stellarAddress: 'G' + 'A'.repeat(55) }).passed).toBe(true);
  });

  it('rejects absolute paths', async () => {
    await expect(loadPlugin('C:\\workspace', 'C:\\evil\\kyc.mjs')).rejects.toBeInstanceOf(
      PluginLoadError,
    );
  });

  it('rejects workspace traversal', async () => {
    const workspaceRoot = makeWorkspace();
    await expect(loadPlugin(workspaceRoot, '../outside.mjs')).rejects.toMatchObject({
      reason: 'path_traversal',
    });
  });

  it('skips non-allowlisted plugins', async () => {
    const workspaceRoot = makeWorkspace();
    writePlugin(workspaceRoot, 'plugins/kyc.cjs', pluginSource('consumer/kyc-check'));

    const loaded = await loadPluginsFromAllowlist({
      workspaceRoot,
      allowedPluginPaths: ['plugins/other.cjs'],
    });

    expect(loaded).toEqual([]);
  });

  describe('load failures', () => {
    it('rejects a missing module with reason not_found', async () => {
      const workspaceRoot = makeWorkspace();
      await expect(loadPlugin(workspaceRoot, 'plugins/missing.cjs')).rejects.toMatchObject({
        name: 'PluginLoadError',
        reason: 'not_found',
        pluginPath: 'plugins/missing.cjs',
      });
    });

    it('rejects a directory with reason not_file', async () => {
      const workspaceRoot = makeWorkspace();
      fs.mkdirSync(path.join(workspaceRoot, 'plugins', 'dir.cjs'), { recursive: true });
      await expect(loadPlugin(workspaceRoot, 'plugins/dir.cjs')).rejects.toMatchObject({
        reason: 'not_file',
      });
    });

    it('rejects a module that throws on import with reason load_failed', async () => {
      const workspaceRoot = makeWorkspace();
      writePlugin(workspaceRoot, 'plugins/broken.cjs', `throw new Error('boom at import');`);
      await expect(loadPlugin(workspaceRoot, 'plugins/broken.cjs')).rejects.toMatchObject({
        reason: 'load_failed',
        message: expect.stringContaining('boom at import'),
      });
    });

    it.each([
      ['missing run()', `module.exports = { id: 'x/y', label: 'Y' };`],
      ['empty id', `module.exports = { id: '', label: 'Y', run() {} };`],
      ['non-string label', `module.exports = { id: 'x/y', label: 42, run() {} };`],
      ['no object export', `module.exports = 'not a plugin';`],
    ])('rejects an invalid export (%s) with reason invalid_export', async (_name, source) => {
      const workspaceRoot = makeWorkspace();
      writePlugin(workspaceRoot, 'plugins/invalid.cjs', source);
      await expect(loadPlugin(workspaceRoot, 'plugins/invalid.cjs')).rejects.toMatchObject({
        reason: 'invalid_export',
        message: expect.stringContaining('CheckPlugin interface'),
      });
    });

    it('allowlist loader skips failing plugins and keeps the valid ones', async () => {
      const workspaceRoot = makeWorkspace();
      writePlugin(workspaceRoot, 'plugins/good.cjs', pluginSource('consumer/good'));
      writePlugin(workspaceRoot, 'plugins/invalid.cjs', `module.exports = { id: 'x/y' };`);

      const loaded = await loadPluginsFromAllowlist({
        workspaceRoot,
        allowedPluginPaths: ['plugins/missing.cjs', 'plugins/invalid.cjs', 'plugins/good.cjs'],
      });

      expect(loaded.map((p) => p.id)).toEqual(['consumer/good']);
    });
  });

  describe('duplicate plugin ids', () => {
    it('loads distinct ids in allowlist order', async () => {
      const workspaceRoot = makeWorkspace();
      writePlugin(workspaceRoot, 'plugins/a.cjs', pluginSource('consumer/a'));
      writePlugin(workspaceRoot, 'plugins/b.cjs', pluginSource('consumer/b'));

      const loaded = await loadPluginsFromAllowlist({
        workspaceRoot,
        allowedPluginPaths: ['plugins/a.cjs', 'plugins/b.cjs'],
      });

      expect(loaded.map((p) => p.id)).toEqual(['consumer/a', 'consumer/b']);
    });

    it('fails with a clear duplicate_id error naming both paths', async () => {
      const workspaceRoot = makeWorkspace();
      writePlugin(workspaceRoot, 'plugins/a.cjs', pluginSource('consumer/kyc', 'KYC A'));
      writePlugin(workspaceRoot, 'plugins/b.cjs', pluginSource('consumer/kyc', 'KYC B'));

      const load = loadPluginsFromAllowlist({
        workspaceRoot,
        allowedPluginPaths: ['plugins/a.cjs', 'plugins/b.cjs'],
      });

      await expect(load).rejects.toBeInstanceOf(PluginLoadError);
      await expect(load).rejects.toMatchObject({
        reason: 'duplicate_id',
        pluginPath: 'plugins/b.cjs',
        message:
          'Duplicate plugin id "consumer/kyc": plugins/b.cjs exports the same id as plugins/a.cjs. Plugin ids must be unique.',
      });
    });
  });
});
