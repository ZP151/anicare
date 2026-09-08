import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
await fs.mkdir(path.join(root, 'assets'), {recursive:true});
await fs.copyFile(path.join(root, '../../../apps/mobile/assets/plates/cat-portrait.png'),path.join(root,'assets/cat-portrait.png'));
const commit='ba95e4c988b1e1b39cf5544e73b25a74b76816ee';
const names=['compass','map','camera','heart','user-round','chevron-left','chevron-right','chevron-down','sliders-horizontal','shield-check','plus','check','x','arrow-up-right','file-text','hand-heart','languages','lock-keyhole','log-out','mail','image','crop','undo-2','trash-2','check-check','circle-help','map-pin','navigation','circle-alert','clock-3','circle-check','cloud-off','refresh-cw','wifi','signal','battery-full','droplets','utensils','brush-cleaning','eye','message-circle','flag','ban','copy','ellipsis','download','folder-open','sun','moon','type','external-link','circle','paw-print','send','calendar-days','loader-circle'];
const icons={};
for(let start=0;start<names.length;start+=8){
 await Promise.all(names.slice(start,start+8).map(async name=>{
 const sourceName=({'trash-2':'trash','circle-help':'circle-question-mark'})[name]??name;
 const response=await fetch(`https://raw.githubusercontent.com/lucide-icons/lucide/${commit}/icons/${sourceName}.svg`);
 if(!response.ok)throw new Error(`${name}: ${response.status}`);
 icons[name]=await response.text();
 }));
}
await fs.writeFile(path.join(root,'assets/icons.json'),JSON.stringify(icons));
const license=await fetch(`https://raw.githubusercontent.com/lucide-icons/lucide/${commit}/LICENSE`);
if(!license.ok)throw new Error('License unavailable');
await fs.writeFile(path.join(root,'assets/LUCIDE-LICENSE.txt'),await license.text());
console.log(`Prepared ${names.length} Lucide SVG icons and existing synthetic cat image.`);
