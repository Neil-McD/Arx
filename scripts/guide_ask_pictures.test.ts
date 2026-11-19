import { describe, expect, it } from "vitest";
import { guideAskPictures } from "../apps/web/src/v1/KitGuideAsks";
import { choosePictures } from "../shared/guideQuestions";

describe("the guide's question about a post with pictures", () => {
  it("shows every picture it would post, and says plainly when one has gone from the talk", () => {
    expect(guideAskPictures({})).toEqual({ shown: [], goneLine: null });
    expect(guideAskPictures({ pictures: [{ id: "a", name: "route.png", url: "https://files.test/a" }, { id: "b", name: "start.jpg", url: "https://files.test/b" }] }))
      .toEqual({ shown: [{ id: "a", name: "route.png", url: "https://files.test/a" }, { id: "b", name: "start.jpg", url: "https://files.test/b" }], goneLine: null });
    expect(guideAskPictures({ pictures: [{ id: "a", name: "route.png", url: "https://files.test/a" }, { id: "b", name: "start.jpg", url: null }] }))
      .toEqual({ shown: [{ id: "a", name: "route.png", url: "https://files.test/a" }],
        goneLine: "1 picture is no longer in your talk, so this can't be posted. Say No and ask again." });
    expect(guideAskPictures({ pictures: [{ id: "a", name: "a", url: null }, { id: "b", name: "b", url: null }] }).goneLine)
      .toBe("2 pictures are no longer in your talk, so this can't be posted. Say No and ask again.");
  });
});

describe("which pictures the guide names", () => {
  it('takes "all" or places, and answers a wrong one with how many there are', () => {
    expect(choosePictures("all", 3, 8)).toEqual({ ok: true, positions: [1, 2, 3] });
    expect(choosePictures([2], 3, 8)).toEqual({ ok: true, positions: [2] });
    expect(choosePictures(1, 1, 8)).toEqual({ ok: true, positions: [1] });
    expect(choosePictures([4], 3, 8)).toEqual({ ok: false, message: 'There are 3 pictures on their latest message with pictures: give places from 1 to 3, or "all".' });
    expect(choosePictures([2], 1, 8)).toEqual({ ok: false, message: 'There is 1 picture on their latest message with pictures: give [1] or "all".' });
    expect(choosePictures(["kg2abc"], 2, 8)).toMatchObject({ ok: false, message: expect.stringContaining('pictures is "all" or a list of places') });
    expect(choosePictures([1, 1], 2, 8)).toEqual({ ok: false, message: "Name each picture once." });
    expect(choosePictures([1, 2, 3], 3, 2)).toEqual({ ok: false, message: "A post holds up to 2 pictures." });
    expect(choosePictures("all", 0, 8)).toMatchObject({ ok: false, message: expect.stringContaining("There are no pictures in this talk") });
  });
});
