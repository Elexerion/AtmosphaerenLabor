const {app} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = window => {
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => {if(level>=3) errors.push(message)});
  const timeout=setTimeout(()=>app.exit(1),30000);
  window.webContents.once('did-finish-load', async()=>{
    try {
      await window.webContents.executeJavaScript(`(()=>{
        document.getElementById('viewportSettings').hidden=false;
        const e=document.getElementById('lighting');e.value='55';e.dispatchEvent(new Event('input',{bubbles:true}));
        const t=document.getElementById('textSize');t.value='125';t.dispatchEvent(new Event('input',{bubbles:true}));
        state.wind0=12;document.getElementById('wind0').value='12';
        az=-.7;viewZoom=.9;saveSettings();
      })()`);
      await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload()});
      const restored=await window.webContents.executeJavaScript(`({lightPower,textScale,az,viewZoom,wind:state.wind0,open:!document.getElementById('viewportSettings').hidden})`);
      if(restored.lightPower!==.55||restored.textScale!==1.25||restored.az!==-.7||restored.viewZoom!==.9||restored.wind!==12||!restored.open)throw Error('Settings not restored: '+JSON.stringify(restored));
      await window.webContents.executeJavaScript(`(()=>{
        document.getElementById('lighting').value='75';document.getElementById('lighting').dispatchEvent(new Event('input',{bubbles:true}));
        document.getElementById('textSize').value='100';document.getElementById('textSize').dispatchEvent(new Event('input',{bubbles:true}));
        document.getElementById('viewportSettings').hidden=true;resetView();
      })()`);
      const profile=JSON.parse(await fs.readFile(app.commandLine.getSwitchValue('smoke-fixture'),'utf8'));
      const live=app.commandLine.hasSwitch('smoke-live');
      const result=await window.webContents.executeJavaScript(`(async()=>{
        const p=${JSON.stringify(profile)};
        if(${live}) {
          document.getElementById('launchDate').value='2026-10-26';
          document.getElementById('launchHour').value='00';
          await document.getElementById('loadSounding').onclick();
          if(!document.getElementById('autoStatus').textContent.startsWith('DWD-Messung geladen')) throw Error(document.getElementById('autoStatus').textContent);
        } else useSounding(dwdToRows(p,'10035','2026-10-26','00'),'DWD-Test Schleswig 10035');
        document.getElementById('viewportSettingsButton').click();
        document.getElementById('zoomIn').click();
        return {title:document.title,levels:sounding.length,status:document.getElementById('soundingStatus').textContent,source:document.getElementById('sourceMeta').textContent,online:document.getElementById('autoStatus').textContent,metrics:document.getElementById('metrics').textContent,settingsOpen:!document.getElementById('viewportSettings').hidden};
      })()`);
      if(result.levels!==3329||!result.settingsOpen||!result.metrics||errors.length) throw Error(JSON.stringify({result,errors}));
      const layout=await window.webContents.executeJavaScript(`(()=>{const p=document.getElementById('surfacePanel').getBoundingClientRect(),s=document.getElementById('viewportSettings').getBoundingClientRect(),c=document.getElementById('surface').getBoundingClientRect();return {tileHeight:p.height,canvasHeight:c.height,settingsAbove:s.bottom<=c.top,canvasInside:c.bottom<=p.bottom}})()`);
      if(!layout.settingsAbove||!layout.canvasInside||layout.tileHeight>700)throw Error('Viewport layout: '+JSON.stringify(layout));
      await window.webContents.executeJavaScript('viewZoom=1;drawSurface();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const output=app.commandLine.getSwitchValue('smoke-output');
      await fs.mkdir(output,{recursive:true});
      await fs.writeFile(path.join(output,'windows-smoke.json'),JSON.stringify({...result,restored,layout},null,2));
      await fs.writeFile(path.join(output,'windows-smoke.png'),(await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript("document.getElementById('viewportSettingsButton').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const closed=await window.webContents.executeJavaScript("({tile:document.getElementById('surfacePanel').getBoundingClientRect().height,canvas:document.getElementById('surface').getBoundingClientRect().height})");
      if(closed.tile>620||closed.canvas<=layout.canvasHeight)throw Error('Closed settings did not release drawing space: '+JSON.stringify(closed));
      await fs.writeFile(path.join(output,'windows-closed.png'),(await window.webContents.capturePage()).toPNG());
      window.setMinimumSize(320,400);window.setContentSize(390,844);
      await window.webContents.executeJavaScript("document.getElementById('viewportSettingsButton').click();document.getElementById('surfacePanel').scrollIntoView();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const mobile=await window.webContents.executeJavaScript("(()=>{const p=document.getElementById('surfacePanel').getBoundingClientRect(),c=document.getElementById('surface').getBoundingClientRect();return {width:p.width,height:p.height,inside:c.bottom<=p.bottom}})()");
      if(!mobile.inside||mobile.width>390||mobile.height>844)throw Error('Small viewport overflow: '+JSON.stringify(mobile));
      await fs.writeFile(path.join(output,'windows-mobile.png'),(await window.webContents.capturePage()).toPNG());
      await fs.writeFile(path.join(output,'layout-checks.json'),JSON.stringify({closed,mobile},null,2));
      clearTimeout(timeout);app.exit(0);
    } catch(error) {console.error(error);clearTimeout(timeout);app.exit(1)}
  });
};
