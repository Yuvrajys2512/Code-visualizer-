// Dev-only: drive headless Edge with real-time waits to screenshot the sky.
// usage: node shoot.mjs [url] [outfile] [settleMs]
import puppeteer from 'puppeteer-core'

const url = process.argv[2] ?? 'http://localhost:5173/?demo'
const out = process.argv[3] ?? 'shot.png'
const settle = Number(process.argv[4] ?? 6000)

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1600,900'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 })
if (process.env.SUBMIT) await page.click('form button') // live ingest via the form
await page.waitForSelector('.stats', { timeout: 300_000 })
await new Promise((r) => setTimeout(r, settle))
const click = process.argv[5]
if (click === 'probe') {
  // walk a grid until a star is actually hit (inspector panel appears)
  outer: for (let y = 420; y <= 860; y += 36) {
    for (let x = 320; x <= 960; x += 36) {
      await page.mouse.click(x, y)
      await new Promise((r) => setTimeout(r, 120))
      if (await page.$('.inspector')) {
        console.log('hit at', x, y)
        break outer
      }
    }
  }
  await new Promise((r) => setTimeout(r, 3500))
} else if (click) {
  const [x, y] = click.split(',').map(Number)
  await page.mouse.click(x, y)
  await new Promise((r) => setTimeout(r, 3500))
}
await page.screenshot({ path: out })
await browser.close()
console.log('saved', out)
