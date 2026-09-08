const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/15492/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main(){
 const root=__dirname;
 const manifest=JSON.parse(await fs.readFile(path.join(root,'screen-manifest.json'),'utf8'));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/15492/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:794,height:1123},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.join(root,'print.html')).href);
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
 await page.pdf({path:path.join(root,'all-screens.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
 await page.goto(pathToFileURL(path.join(root,'index.html')).href);
 const links=await page.locator('.screen-card a').count();
 if(links!==manifest.length)throw Error('Gallery count mismatch');
 const dims=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
 if(dims.width>dims.viewport)throw Error('Gallery overflow');
 await browser.close();
 const table='\n\n## 逐页索引\n\n| 图号 | 页面 | 对应路径 |\n| --- | --- | --- |\n'+manifest.map(s=>`| ${s.id} | [${s.title}](screens/${s.id}.png) | \`${s.route}\` |`).join('\n')+'\n';
 let spec=await fs.readFile(path.join(root,'review-spec.md'),'utf8');spec=spec.split('\n\n## 逐页索引')[0]+table;await fs.writeFile(path.join(root,'review-spec.md'),spec);
 console.log(JSON.stringify({pdf:'all-screens.pdf',galleryScreens:links,responsiveWidth:dims.width}));
}
main().catch(e=>{console.error(e);process.exit(1)});
