import { describe, expect, it } from "vitest";
import { inspectWebSource, buildRepairRequest } from "./webQuality";

const sample = String.raw`<!doctype html><html><body>
<div id="game-board"></div><button onclick="restart()">Restart</button>
<script>
const board = []; let flagged = false;
function restart() { document.getElementById('game-board').innerHTML = '';
 for (let i=0;i<81;i++){ let cell=document.createElement('button');
 cell.addEventListener('click',()=>{ cell.textContent='1'; const adjacent=1;});
 cell.addEventListener('contextmenu',(e)=>{e.preventDefault();flagged=!flagged;cell.textContent=flagged?'⚑':'';});
 document.getElementById('game-board').appendChild(cell);}}
restart();
</script></body></html>`;
describe("offline source verification", () => {
  it("detects the exact reported no-tiles Minesweeper regression", () => {
    const bad = String.raw`<html><body><div id="game-board"></div><script>
    let board=[];function createBoard(){for(let i=0;i<81;i++)board.push({mine:false,revealed:false});}
    function checkGameOver(){for(const cell of board){if(cell.mine && !cell.revealed)return true;}return false;}
    createBoard(); if(checkGameOver())document.body.textContent='Game Over';
    </script></body></html>`;
    const report=inspectWebSource(bad,"Build a complete single-file HTML Minesweeper game");
    expect(report.passed).toBe(false);
    expect(report.checks.find(x=>x.id==="render-board")?.passed).toBe(false);
    expect(report.checks.find(x=>x.id==="cell-clicks")?.passed).toBe(false);
    expect(report.checks.find(x=>x.id==="startup-loss")?.passed).toBe(false);
    expect(buildRepairRequest("Build Minesweeper",bad,report)).toContain("AUTOMATED SOURCE CHECK FAILURES");
  });
  it("accepts a syntactically valid source with board/events/flags/restart for the static gate only",()=>{
    const report=inspectWebSource(sample,"Build a complete Minesweeper game");
    expect(report.passed).toBe(true);
    expect(report.note).toContain("NOT been tested");
  });
  it("does not accept createElement without attaching any cells to the board",()=>{
    const source=sample.replace("document.getElementById('game-board').appendChild(cell);","void cell;");
    const report=inspectWebSource(source,"Build HTML Minesweeper");
    expect(report.checks.find(x=>x.id==="render-board")?.passed).toBe(false);
  });
  it("detects broken JavaScript syntax even when markup is complete",()=>{
    const source=sample.replace("let flagged = false;", "let flagged = ;");
    const report=inspectWebSource(source,"Build HTML Minesweeper");
    expect(report.checks.find(x=>x.id==="javascript-syntax")?.passed).toBe(false);
  });
  it("does not impose game-specific tests on a generic webpage",()=>{
    const source="<html><body><script>const x = 1;</script></body></html>";
    const report=inspectWebSource(source,"Build a simple HTML page");
    expect(report.checks.some(c=>c.id==="flags")).toBe(false);
  });
  it("rejects remote scripts on single-file tasks",()=>{
    const report=inspectWebSource(sample.replace("<script>","<script src='https://site.test/test.js'>"),"single-file HTML Minesweeper");
    expect(report.checks.find(x=>x.id==="self-contained")?.passed).toBe(false);
  });
});
