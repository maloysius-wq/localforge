import {describe,expect,it} from "vitest";
import {verifyAndRepairWeb,MAX_WEB_REPAIRS} from "./verificationFlow";
const ticks=String.fromCharCode(96).repeat(3);
const wrap=(s:string)=>ticks+"html\n"+s+"\n"+ticks;
const wrong="<html><body><div id='game-board'></div><script>let board=[];function checkGameOver(){for(let c of board)if(c.mine&&!c.revealed)return true;return false;}checkGameOver();</script></body></html>";
const good="<html><body><div id='game-board'></div><button onclick='restart()'>Restart</button><script>let flagged=false;function restart(){document.getElementById('game-board').innerHTML='';for(let i=0;i<81;i++){let cell=document.createElement('button');cell.addEventListener('click',()=>{let adjacent=1;cell.textContent=String(adjacent)});cell.addEventListener('contextmenu',e=>{e.preventDefault();flagged=!flagged;cell.textContent=flagged?'F':''});document.getElementById('game-board').appendChild(cell)}}restart();</script></body></html>";
describe("bounded verification and repair",()=>{
  it("retries known broken Minesweeper with actionable diagnostics",async()=>{
    const received:string[]=[];
    const result=await verifyAndRepairWeb(wrap(wrong),"Create a Minesweeper game in a single HTML file",
      async prompt=>{received.push(prompt);return wrap(good);});
    expect(result.repairs).toBe(1);
    expect(result.phase).toBe("static-pass");
    expect(received[0]).toContain("board");
    expect(received[0]).toContain("Cell click");
  });
  it("stops after two repairs instead of claiming a broken game is complete",async()=>{
    let generated=0;
    const result=await verifyAndRepairWeb(wrap(wrong),"Build HTML Minesweeper",async()=>{generated++;return wrap(wrong);});
    expect(result.phase).toBe("failed");
    expect(generated).toBe(MAX_WEB_REPAIRS);
    expect(result.report?.passed).toBe(false);
  });
  it("does not invoke repairs for good static code",async()=>{
    const result=await verifyAndRepairWeb(wrap(good),"Build HTML Minesweeper",async()=>{throw Error("Should not retry");});
    expect(result.phase).toBe("static-pass");expect(result.repairs).toBe(0);
  });
  it("does not pretend prose is verified code",async()=>{
    const result=await verifyAndRepairWeb("Sure, I can build that","Build HTML Minesweeper",async()=>{throw Error("unexpected");});
    expect(result.phase).toBe("not-applicable");
    expect(result.report).toBeNull();
  });
});
