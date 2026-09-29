module.exports = async (p) => {
  const s = await p.evaluate(() => { const d = KuchiieDiagnostics.snapshot(); return { env: d.environment, vis: { lanterns: d.environment.lanterns, halos: d.visual.lightHalos, moonbeams: d.visual.moonbeams }, release: d.release, lang: document.documentElement.lang, title: document.title }; });
  s.particles = await p.evaluate(() => document.querySelector('.xhigh-features').textContent);
  return s;
};
