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
