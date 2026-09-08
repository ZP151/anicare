const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('C:/Users/15492/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function run(){
 const root=__dirname;
 const screens=JSON.parse(await fs.readFile(path.join(root,'screen-manifest.json'),'utf8'));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Users/15492/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
 const page=await browser.newPage({viewport:{width:402,height:874},deviceScaleFactor:2});
 const problems=[];
 for(const s of screens){
  await page.goto(pathToFileURL(path.join(root,s.id+'.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(root,'screens',s.id+'.png')});
  const probe=await page.evaluate(()=>{
   const phone=document.querySelector('.phone');const main=document.querySelector('.main');
   const dock=document.querySelector('.dock');const tabs=document.querySelector('.tabs');const overlay=document.querySelector('.sheet');
   const limit=dock?dock.getBoundingClientRect().top:tabs?tabs.getBoundingClientRect().top:839;
   const clipped=[...main.querySelectorAll('h1,h2,h3,p,.row,.option,.choice-grid,.cat-row,.key-value,.field,.primary,.secondary,.notice')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>limit+2&&r.top<874&&r.height>0}).map(e=>({text:e.textContent.slice(0,60),bottom:Math.round(e.getBoundingClientRect().bottom),limit:Math.round(limit)}));
   return {width:phone.scrollWidth,height:phone.scrollHeight,clipped:overlay||phone.dataset.scrollExample?[]:clipped};
  });
  if(probe.width>402||probe.height>874||probe.clipped.length)problems.push({id:s.id,...probe});
 }
 console.log(JSON.stringify({screenCount:screens.length,layoutFindings:problems},null,2));
 await fs.writeFile(path.join(root,'layout-findings.json'),JSON.stringify(problems,null,2));
 await page.setViewportSize({width:1400,height:900});
 for(const key of ['A','B','C','D','E','F','G']){
  await page.goto(pathToFileURL(path.join(root,`board-${key}.html`)).href);
  await page.screenshot({path:path.join(root,`overview-${key}.png`),fullPage:true});
 }
 await browser.close();
}
run().catch(e=>{console.error(e);process.exit(1)});
