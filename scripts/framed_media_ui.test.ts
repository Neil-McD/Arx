import { describe, expect, it } from "vitest";
import {
  computeFramedMediaLayout,
  focusFromFramedMediaLayoutPosition,
  getFramedMediaLayoutImageStyle,
} from "../shared/framedMediaUi";
import { computeAvatarLayout } from "../shared/avatarUi";
import { computeCommunityAvatarLayout } from "../shared/communityAvatarUi";
import { computeCommunityBannerLayout } from "../shared/communityBannerUi";

describe("canonical framed media layout", () => {
  it("covers and centers a landscape image inside a square viewport", () => {
    expect(computeFramedMediaLayout({
      viewportWidth: 100,
      viewportHeight: 100,
      naturalWidth: 200,
      naturalHeight: 100,
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1,
    })).toMatchObject({
      renderWidth: 200,
      renderHeight: 100,
      left: -50,
      top: 0,
    });
  });

  it("clamps an off-center focal point without exposing empty space", () => {
    expect(computeFramedMediaLayout({
      viewportWidth: 100,
      viewportHeight: 100,
      naturalWidth: 200,
      naturalHeight: 100,
      focusX: 0.8,
      focusY: 0.5,
      zoom: 1,
    })).toMatchObject({
      minLeft: -100,
      left: -100,
      minTop: 0,
      top: 0,
    });
  });

  it("round-trips a draggable focal point when neither axis is edge-clamped", () => {
    const layout = computeFramedMediaLayout({
      viewportWidth: 100,
      viewportHeight: 100,
      naturalWidth: 200,
      naturalHeight: 100,
      focusX: 0.3,
      focusY: 0.7,
      zoom: 2,
    });
    expect(layout).not.toBeNull();
    expect(focusFromFramedMediaLayoutPosition(layout!, layout!.left, layout!.top)).toEqual({
      focusX: 0.3,
      focusY: 0.7,
    });
  });

  it("uses the same engine for people, community avatars, and banners", () => {
    expect(computeAvatarLayout).toBe(computeFramedMediaLayout);
    expect(computeCommunityAvatarLayout).toBe(computeFramedMediaLayout);
    expect(computeCommunityBannerLayout).toBe(computeFramedMediaLayout);
  });

  it("keeps decoration out of the canonical image plane", () => {
    const layout = computeFramedMediaLayout({
      viewportWidth: 42,
      viewportHeight: 42,
      naturalWidth: 640,
      naturalHeight: 360,
      focusX: 0.5,
      focusY: 0.5,
      zoom: 1,
    });
    expect(layout).not.toBeNull();
    expect(getFramedMediaLayoutImageStyle(layout!)).toMatchObject({
      position: "absolute",
      display: "block",
      margin: 0,
      padding: 0,
      border: 0,
      borderRadius: 0,
      objectFit: "fill",
    });
  });

  it.each([
    [22, 22],
    [30, 30],
    [42, 42],
    [72, 72],
    [74, 74],
    [171, 86],
    [669, 188],
  ])("covers the full %sx%s production viewport", (viewportWidth, viewportHeight) => {
    const layout = computeFramedMediaLayout({
      viewportWidth,
      viewportHeight,
      naturalWidth: 640,
      naturalHeight: 360,
      focusX: 0.72,
      focusY: 0.38,
      zoom: 1.35,
    });
    expect(layout).not.toBeNull();
    expect(layout!.renderWidth).toBeGreaterThanOrEqual(viewportWidth);
    expect(layout!.renderHeight).toBeGreaterThanOrEqual(viewportHeight);
    expect(layout!.left).toBeLessThanOrEqual(0);
    expect(layout!.left).toBeGreaterThanOrEqual(layout!.minLeft);
    expect(layout!.top).toBeLessThanOrEqual(0);
    expect(layout!.top).toBeGreaterThanOrEqual(layout!.minTop);
  });
});
