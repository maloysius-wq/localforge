import { describe, expect, it } from "vitest";
import { verifyFirstPassWeb } from "./verificationFlow";

const ticks = String.fromCharCode(96).repeat(3);
const wrap = (source: string) => ticks + "html\n" + source + "\n" + ticks;
const broken = "<html><body><div id='game-board'></div><script>let board=[];function checkGameOver(){for(let c of board)if(c.mine&&!c.revealed)return true;return false;}checkGameOver();</script></body></html>";
const good = "<html><body><div id='game-board'></div><button onclick='restart()'>Restart</button><script>let flagged=false;function restart(){document.getElementById('game-board').innerHTML='';for(let i=0;i<81;i++){let cell=document.createElement('button');cell.addEventListener('click',()=>{let adjacent=1;cell.textContent=String(adjacent)});cell.addEventListener('contextmenu',e=>{e.preventDefault();flagged=!flagged;cell.textContent=flagged?'F':''});document.getElementById('game-board').appendChild(cell)}}restart();</script></body></html>";

describe("first-pass-only source inspection", () => {
  it("reports first-response failures without modifying or retrying model output", () => {
    const initial = wrap(broken);
    const phases: string[] = [];
    const result = verifyFirstPassWeb(initial, "Build HTML Minesweeper", update => phases.push(update.phase));
    expect(result.phase).toBe("failed");
    expect(result.report?.passed).toBe(false);
    expect(result.report?.checks.some(check => check.id === "render-board" && !check.passed)).toBe(true);
    expect(result.reply).toBe(initial);
    expect(phases).toEqual(["checking", "failed"]);
  });
  it("passes original source unchanged when static checks pass", () => {
    const initial = wrap(good);
    const result = verifyFirstPassWeb(initial, "Build HTML Minesweeper");
    expect(result.phase).toBe("static-pass");
    expect(result.reply).toBe(initial);
    expect(result.report?.passed).toBe(true);
  });
  it("does not pretend prose is verified source", () => {
    const initial = "Sure, I can build that";
    const result = verifyFirstPassWeb(initial, "Build HTML Minesweeper");
    expect(result.phase).toBe("not-applicable");
    expect(result.report).toBeNull();
    expect(result.reply).toBe(initial);
  });
  it("does not report successful verification for invalid multi-file labels", () => {
    const text = wrap(good) + "\n\n" + wrap(good);
    const result = verifyFirstPassWeb(text, "Build HTML Minesweeper");
    expect(result.phase).toBe("not-applicable");
    expect(result.reply).toBe(text);
  });
});
