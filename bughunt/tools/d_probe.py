# Agent D probe: load a page in headless chromium (SwiftShader WebGL2), capture console + screenshot.
import sys, asyncio, json
from playwright.async_api import async_playwright
url = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/d.png'
wait = int(sys.argv[3]) if len(sys.argv) > 3 else 20000
js = sys.argv[4] if len(sys.argv) > 4 else None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1280,'height':720})
        pg.on('console', lambda m: print('[console.%s] %s' % (m.type, m.text[:600])))
        pg.on('pageerror', lambda e: print('[pageerror]', e))
        await pg.goto(url)
        await pg.wait_for_timeout(wait)
        if js:
            r = await pg.evaluate(js); print('[eval]', json.dumps(r, ensure_ascii=False)[:4000])
        await pg.screenshot(path=out)
        await b.close()
asyncio.run(main())
