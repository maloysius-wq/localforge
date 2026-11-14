#!/usr/bin/env node
/** Offline Chromium acceptance checks for disposable CI browser jobs.
 * Do not run generated code in a privileged LocalForge Tauri window.
 * CI does not expose repository write credentials, uses read-only files,
 * and blocks non-fixture network/file requests. These checks evaluate
 * behavior rather than source formatting, but do not prove arbitrary apps safe.
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";

const outputDir=resolve("web-quality-artifacts");
await mkdir(outputDir,{recursive:true});

function check(id,passed,detail){return {id,passed:Boolean(passed),detail};}
async function browserCheck(path){
  const full=resolve(path);
  const url=pathToFileURL(full).href;
  const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-background-networking","--disable-extensions","--no-first-run"]});
  const context=await browser.newContext({javaScriptEnabled:true,serviceWorkers:"block",acceptDownloads:false});
  const page=await context.newPage();
  context.on("page",popup=>{if(popup!==page)void popup.close().catch(()=>{});});
  if(typeof page.routeWebSocket==="function")await page.routeWebSocket("**/*",socket=>socket.close());
  const errors=[],alerts=[];
  page.on("dialog",dialog=>{alerts.push(dialog.message());void dialog.dismiss().catch(()=>{});});
  page.on("pageerror",error=>errors.push(String(error).slice(0,300)));
  page.on("console",msg=>{if(msg.type()==="error")errors.push(msg.text().slice(0,300));});
  await page.route("**/*",async route=>{
    const req=route.request().url();
    if(req===url || req.startsWith("data:")) await route.continue();
    else await route.abort("blockedbyclient");
  });
  const checks=[];
  try{
    await page.goto(url,{waitUntil:"load",timeout:12000});
    await page.waitForTimeout(350);
    const status=await page.locator("body").innerText();
    checks.push(check("no-startup-defeat",!/\b(game over|you lose|you lost|defeat)\b/i.test(status),
      "Visible startup status: "+status.slice(0,100).replace(/\n/g," ")));
    const selectors=["#game-board .cell","#game-board > *","#board .cell","#board > *",".board .cell",".board > *","[role=grid] [role=gridcell]",".minefield > *",".grid > *"];
    let tileSelector=null, tiles=0;
    for(const selector of selectors){
      const count=await page.locator(selector).count();
      if(count>=9){tileSelector=selector;tiles=count;break;}
    }
    checks.push(check("tiles-render",tiles>=9,"Tile DOM nodes found: "+tiles));
    const visible=tileSelector ? await page.locator(tileSelector).evaluateAll(nodes=>
      nodes.filter(node=>{
        const rect=node.getBoundingClientRect();
        const styles=getComputedStyle(node);
        return rect.width>=8 && rect.height>=8 && styles.display!=="none"
          && styles.visibility!=="hidden";
      }).length) : 0;
    checks.push(check("tiles-visible",visible>=9,"Tiles with visible dimensions: "+visible));
    let firstClicked=false,flagged=false,timerAdvances=false,restartWorks=false;
    if(tileSelector && visible>=9 && checks[0].passed){
      const first=page.locator(tileSelector).first();
      const before=await first.evaluate(el=>({html:el.outerHTML,status:document.body.innerText}));
      await first.click({timeout:3000});
      await page.waitForTimeout(100);
      const after=await page.locator(tileSelector).first().evaluate(el=>({html:el.outerHTML,status:document.body.innerText}));
      firstClicked=before.html!==after.html || await page.locator(tileSelector+".revealed").count()>0;
      // Losing on the very first move is a poor default for a new game.
      const gameLost=/\b(game over|you lose|you lost|defeat)\b/i.test(after.status)
        || alerts.some(message=>/game over|you lose|you lost|defeat/i.test(message));
      checks.push(check("first-click",firstClicked&&!gameLost,
        firstClicked?(gameLost?"First click caused immediate defeat":"First click changed visible cell state"):
          "Click did not change tile state"));
      if(!gameLost){
        const unrevealed=page.locator(tileSelector+":not(.revealed)");
        const last=(await unrevealed.count())>0?unrevealed.last():page.locator(tileSelector).last();
        const beforeFlag=await last.evaluate(el=>el.outerHTML);
        await last.click({button:"right",timeout:3000});
        await page.waitForTimeout(80);
        const afterFlag=await last.evaluate(el=>el.outerHTML);
        flagged=beforeFlag!==afterFlag || /flag|⚑|🚩/i.test(afterFlag);
        checks.push(check("right-click-flag",flagged,flagged?"Right-click changed flag tile":"Right-click did not mark a tile"));
      }else checks.push(check("right-click-flag",false,"First click ended the game before flag check"));
      const timer=page.locator("#timer,.timer,#time,.time").first();
      if(await timer.count()){
        const t0=await timer.innerText();
        await page.waitForTimeout(1250);
        timerAdvances=t0!==(await timer.innerText());
      }
      checks.push(check("timer",timerAdvances,timerAdvances?"Timer advanced":"Timer did not advance after a safe first click"));
    }else{
      checks.push(check("first-click",false,visible<9?"Tile elements have zero/hidden dimensions":"Game was already over before the first click"));
      checks.push(check("right-click-flag",false,"No visible playable tile was available"));
      checks.push(check("timer",false,"Cannot start the game without visible interactive tiles"));
    }
    const buttons=page.getByRole("button",{name:/^(restart|reset|new game|play again)$/i});
    if(await buttons.count()){
      await buttons.first().click({timeout:3000});
      await page.waitForTimeout(100);
      const count=tileSelector?await page.locator(tileSelector).count():0;
      const text=await page.locator("body").innerText();
      const flaggedCells=await page.locator(".flagged,.flag").count();
      restartWorks=count>=9 && !/\b(game over|you lose|you lost)\b/i.test(text) && flaggedCells===0;
    }
    checks.push(check("restart",restartWorks,restartWorks?"Restart reset the board":"Restart not working or missing"));
    checks.push(check("javascript-errors",errors.length===0,errors.length?errors.join("; "):"No uncaught script errors"));
    try{await page.screenshot({path:resolve(outputDir,basename(full)+".png"),fullPage:true,timeout:8000});}catch{}
  }catch(error){
    checks.push(check("browser-load",false,String(error).slice(0,400)));
  }finally{
    if(!checks.some(c=>c.id==="javascript-errors"))
      checks.push(check("javascript-errors",errors.length===0,errors.length?errors.join("; "):"No uncaught script errors"));
    await browser.close();
  }
  return {file:basename(full),scope:"headless-browser-ci",passed:checks.every(c=>c.passed),checks};
}
const mode=process.argv[2];
if(mode==="--fixtures"){
  const good=await browserCheck("benchmarks/fixtures/minesweeper-good.html");
  const broken=await browserCheck("benchmarks/fixtures/minesweeper-broken.html");
  const invisible=await browserCheck("benchmarks/fixtures/minesweeper-invisible.html");
  const result={time:new Date().toISOString(),fixtures:{good,broken,invisible},checks:["good must pass","reported empty-board regression must fail","invisible tiles/undefined helper regression must fail"]};
  await writeFile(resolve(outputDir,"fixtures-report.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify({good:good.passed,broken:broken.passed,invisible:invisible.passed,
    goodChecks:good.checks,brokenFailures:broken.checks.filter(c=>!c.passed),
    invisibleFailures:invisible.checks.filter(c=>!c.passed)},null,2));
  if(!good.passed || broken.passed || invisible.passed){
    console.error("Browser verifier failed its positive/negative control fixtures");
    process.exitCode=1;
  }
}else if(mode==="--candidate"){
  if(!process.argv[3])throw Error("Provide the generated HTML path after --candidate");
  const result=await browserCheck(process.argv[3]);
  await writeFile(resolve(outputDir,"model-browser-report.json"),JSON.stringify({time:new Date().toISOString(),result},null,2));
  console.log("Live Qwen first-attempt browser acceptance: "+(result.passed?"PASS":"FAIL"));
  console.log(JSON.stringify(result,null,2));
  // Model quality is a measured outcome, not a release-engineering failure.
  // Fixtures are the regression gate; this report is the baseline metric.
}else{
  console.error("Usage: node scripts/web_acceptance.mjs --fixtures | --candidate path/to/file.html");
  process.exitCode=2;
}
