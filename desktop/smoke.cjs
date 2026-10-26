const {app} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = window => {
  const errors = [];
  window.webContents.on('console-message', (_event, level, message) => {if(level>=3) errors.push(message)});
  const timeout=setTimeout(()=>app.exit(1),30000);
  window.webContents.once('did-finish-load', async()=>{
    try {
      const profile=JSON.parse(await fs.readFile(app.commandLine.getSwitchValue('smoke-fixture'),'utf8'));
      const result=await window.webContents.executeJavaScript(`(()=>{
        const p=${JSON.stringify(profile)};
        useSounding(dwdToRows(p,'10035','2026-10-26','00'),'DWD-Test Schleswig 10035');
        document.getElementById('viewportSettingsButton').click();
        document.getElementById('zoomIn').click();
        return {title:document.title,levels:sounding.length,status:document.getElementById('soundingStatus').textContent,metrics:document.getElementById('metrics').textContent,settingsOpen:!document.getElementById('viewportSettings').hidden};
      })()`);
      if(result.levels!==3329||!result.settingsOpen||!result.metrics||errors.length) throw Error(JSON.stringify({result,errors}));
      await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const output=app.commandLine.getSwitchValue('smoke-output');
      await fs.mkdir(output,{recursive:true});
      await fs.writeFile(path.join(output,'windows-smoke.json'),JSON.stringify(result,null,2));
      await fs.writeFile(path.join(output,'windows-smoke.png'),(await window.webContents.capturePage()).toPNG());
      clearTimeout(timeout);app.exit(0);
    } catch(error) {console.error(error);clearTimeout(timeout);app.exit(1)}
  });
};
