import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const live = process.env.RUN_SHOW_E2E === '1';
const destination = resolve('..', 'artifacts', 'show');

test('real rigged studio: models, every reaction, camera, quality, errors and disposal', async ({ page }) => {
  test.skip(!live, 'RUN_SHOW_E2E=1 requires the bundled character assets and Vite.');
  await mkdir(destination, { recursive: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const summary = await page.evaluate(async () => {
    const { createStudio } = await import('/src/show-studio.js');
    document.body.innerHTML = '<div id="studio-test" style="position:fixed;inset:0"></div>';
    const progress = [];
    window.studioTest = createStudio(document.getElementById('studio-test'), { quality: 'medium', onProgress: p => progress.push(p.percent) });
    await window.studioTest.ready;
    const studio = window.studioTest;
    const actors = [...studio.characters, studio.host];
    const models = actors.map(actor => {
      let meshCount = 0, skinCount = 0, bones = 0;
      actor.model.traverse(object => { if (object.isMesh) meshCount++; if (object.isSkinnedMesh) skinCount++; if (object.isBone) bones++; });
      return { id: actor.id, meshCount, skinCount, bones, actions: [...actor.actions.keys()] };
    });
    const gl = studio.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      models, progress,
      environment: {
        browser: navigator.userAgent, platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        devicePixelRatio, viewport: [innerWidth, innerHeight],
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        webglVersion: gl.getParameter(gl.VERSION),
      },
    };
  });
  expect(summary.models).toHaveLength(5);
  expect(summary.models.map(m => m.id).sort()).toEqual(['atlas', 'leo', 'maya', 'nova', 'orion']);
  for (const model of summary.models) {
    expect(model.skinCount).toBeGreaterThan(0);
    expect(model.bones).toBeGreaterThan(20);
    expect(model.meshCount).toBeGreaterThan(1);
    expect(model.actions).toEqual(expect.arrayContaining(['show_thinking', 'show_buzzer', 'show_correct', 'show_wrong', 'show_win', 'show_lose', 'show_greeting', 'show_rules', 'show_point', 'show_reaction', 'show_results']));
  }
  expect(summary.progress.at(-1)).toBe(100);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(destination, 'studio-wide.png') });

  const checks = [];
  for (const [name, index] of [
    ['entry', 0], ['thinking', 0], ['buzzer', 0], ['correct', 0],
    ['wrong', 0], ['win', 0], ['lose', 0], ['greeting', 4],
    ['rules', 4], ['point', 4], ['reaction', 4], ['results', 4],
  ]) {
    const check = await page.evaluate(async ({ name, index }) => {
      const studio = window.studioTest, actor = index === 4 ? studio.host : studio.characters[index];
      const before = [];
      actor.model.traverse(bone => { if (bone.isBone) before.push([bone, bone.quaternion.clone()]); });
      const positionBefore = actor.root.position.x;
      studio.trigger(name, index);
      if (index === 4) studio.setCamera('host');
      else if (name !== 'entry') studio.setCamera('answer', index);
      await new Promise(resolve => setTimeout(resolve, name === 'buzzer' ? 280 : 850));
      let change = 0, finite = true;
      for (const [bone, rotation] of before) {
        change += rotation.angleTo(bone.quaternion);
        finite &&= bone.quaternion.toArray().every(Number.isFinite);
      }
      return { name, boneRotationChange: change, finite, action: actor.current.getClip().name, positionDelta: actor.root.position.x - positionBefore };
    }, { name, index });
    expect(check.finite, `${name} must not corrupt the skeleton`).toBeTruthy();
    expect(check.boneRotationChange, `${name} should deform a real rig`).toBeGreaterThan(.01);
    if (name !== 'entry') expect(check.action).toBe('show_' + name);
    if (name === 'entry') expect(Math.abs(check.positionDelta)).toBeGreaterThan(.1);
    checks.push(check);
    await page.screenshot({ path: resolve(destination, `studio-${name}.png`) });
  }

  const performanceResult = await page.evaluate(async () => {
    const studio = window.studioTest;
    studio.setCamera('game');
    studio.confettiUntil = 0;
    const measurements = [];
    let start = performance.now();
    const collect = time => { measurements.push(time); if (time - start < 2200) return new Promise(resolve => requestAnimationFrame(t => resolve(collect(t)))); };
    await new Promise(resolve => requestAnimationFrame(time => resolve(collect(time))));
    const differences = measurements.slice(1).map((time, i) => time - measurements[i]).sort((a, b) => a - b);
    return { frames: measurements.length, durationMs: measurements.at(-1) - measurements[0], fps: (measurements.length - 1) * 1000 / (measurements.at(-1) - measurements[0]), medianFrameMs: differences[Math.floor(differences.length / 2)], p95FrameMs: differences[Math.floor(differences.length * .95)], drawCalls: studio.renderer.info.render.calls, triangles: studio.renderer.info.render.triangles, quality: studio.settings.quality };
  });
  expect(performanceResult.frames).toBeGreaterThan(5);

  const preferences = await page.evaluate(() => {
    const studio = window.studioTest;
    studio.updateSettings({ quality: 'low', reducedMotion: true });
    studio.setCamera('host'); studio.trigger('win');
    return { shadowEnabled: studio.renderer.shadowMap.enabled, pixelRatio: studio.renderer.getPixelRatio(), cameraDistance: studio.camera.position.distanceTo(studio.cameraDestination), reducedMotion: studio.settings.reducedMotion };
  });
  expect(preferences.shadowEnabled).toBeFalsy();
  expect(preferences.pixelRatio).toBeLessThanOrEqual(1);
  expect(preferences.cameraDistance).toBe(0);
  await page.screenshot({ path: resolve(destination, 'studio-low-motion.png') });
  const layouts = [];
  for (const [width, viewportHeight, sceneHeight] of [[1440, 1000, 720], [390, 844, 523]]) {
    await page.setViewportSize({ width, height: viewportHeight });
    const layout = await page.evaluate(async ({ sceneHeight }) => {
      const studio = window.studioTest;
      studio.container.style.height = sceneHeight + 'px';
      studio.resize(); studio.setCamera('game');
      studio.camera.lookAt(studio.lookAt); studio.camera.updateMatrixWorld(true);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const width = studio.container.clientWidth, height = studio.container.clientHeight;
      const heads = studio.characters.map(actor => {
        const head = actor.model.getObjectByName('Head');
        const point = head.getWorldPosition(actor.position.clone()).project(studio.camera);
        return { id: actor.id, x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 };
      });
      return { width, height, heads };
    }, { sceneHeight });
    for (const head of layout.heads) {
      expect(head.x).toBeGreaterThan(0);
      expect(head.x).toBeLessThan(layout.width);
      expect(head.y).toBeGreaterThan(layout.height * .25);
      expect(head.y).toBeLessThan(layout.height * .65);
    }
    layouts.push(layout);
    await page.screenshot({ path: resolve(destination, `studio-layout-${width}.png`) });
  }
  await page.evaluate(() => { window.studioTest.dispose(); window.studioTest.dispose(); });
  await expect(page.locator('#studio-test canvas')).toHaveCount(0);

  await page.route('**/assets/characters/manifest.json', route => route.fulfill({ status: 404, body: 'missing' }));
  const errorMessage = await page.evaluate(async () => {
    const { createStudio } = await import('/src/show-studio.js');
    const studio = createStudio(document.getElementById('studio-test'), { quality: 'low' });
    try { await studio.ready; return null; } catch (error) { return error.message; } finally { studio.dispose(); }
  });
  expect(errorMessage).toContain('манифест');
  expect(errors).toEqual([]);
  await writeFile(resolve(destination, 'studio-report.json'), JSON.stringify({ ...summary, animations: checks, performance: performanceResult, preferences, layouts, missingAssetError: errorMessage }, null, 2));
});
