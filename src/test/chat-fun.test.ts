import { describe, expect, it } from "vitest";
import { play, winner, turnOf, watchOffset, type Game } from "@/lib/chat-fun";

const g: Game = { b: "---------", x: "A", o: "B", id: "1" };
describe("couple tic-tac-toe", () => {
  it("starter moves first and turns alternate", () => {
    expect(play(g, 0, "B")).toBeNull();
    const n = play(g, 0, "A")!;
    expect(n.b).toBe("X--------");
    expect(turnOf(n)).toBe("B");
  });
  it("cannot play on a taken cell", () => {
    expect(play({ ...g, b: "X--------" }, 0, "B")).toBeNull();
  });
  it("detects a win and blocks further moves", () => {
    expect(winner("XXXOO----")).toBe("X");
    expect(play({ ...g, b: "XXXOO----" }, 5, "B")).toBeNull();
  });
  it("detects a draw", () => expect(winner("XOXXOOOXX")).toBe("draw"));
});
describe("watch together", () => {
  it("joins at the shared position", () => expect(watchOffset(1000, 31000)).toBe(30));
});

import { ludoMove, newLudo, LUDO_END, quizCorrect, tapResult, youtubeId, parseGift, watchPos } from "@/lib/chat-fun";
describe("list 1 extras", () => {
  it("ludo needs a 6 to leave home and 6 gives another turn", () => {
    const g = newLudo("A", "B");
    expect(ludoMove(g, "A", 3, 0)).toBeNull();
    expect(ludoMove(g, "A", 3, null)!.turn).toBe("B");
    const n = ludoMove(g, "A", 6, 0)!;
    expect(n.px[0]).toBe(1); expect(n.turn).toBe("A");
  });
  it("ludo needs exact roll to finish", () => {
    const g = { ...newLudo("A", "B"), px: [LUDO_END - 2, LUDO_END] };
    expect(ludoMove(g, "A", 3, 0)).toBeNull();
    expect(ludoMove(g, "A", 2, 0)!.px[0]).toBe(LUDO_END);
  });
  it("quiz and tap results", () => {
    expect(quizCorrect({ id: "1", q: 0, by: "A", a: 2, g: 2 })).toBe(true);
    expect(tapResult({ id: "1", by: "A", n: 30 }, { id: "1", by: "B", n: 25, reply: true }, "B")).toBe("lose");
  });
  it("youtube links, love notes, paused watch position", () => {
    expect(youtubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
    expect(parseGift('{"e":"🌹","note":"hi"}')).toEqual({ e: "🌹", note: "hi" });
    expect(parseGift("🌹")).toEqual({ e: "🌹" });
    expect(watchPos({ url: "x", at: 0, p: 42 })).toBe(42);
  });
});
